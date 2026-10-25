import {
  saveEquipmentStore,
  SITE_PLANT_ID,
  type EquipAsset,
  type EquipCollectionPoint,
  type EquipComponent,
  type EquipComponentType,
  type EquipPlant,
  type EquipRoute,
  type EquipUnit,
  type EquipmentStore
} from "../data/equipmentDb";

interface ApiPlant {
  id: number;
  name: string;
  location?: string | null;
}

interface ApiUnit {
  id: number;
  plant_id: number;
  name: string;
}

interface ApiRoute {
  id: number;
  plant_id: number;
  unit_id?: number | null;
  name: string;
  description?: string | null;
  is_system?: boolean;
}

interface ApiAsset {
  id: number;
  route_id: number | null;
  name: string;
  tag_number?: string | null;
  type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  criticality?: string | null;
  status?: string | null;
  description?: string | null;
}

interface ApiComponent {
  id: number;
  asset_id: number;
  name: string;
  type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  specifications?: Record<string, unknown> | null;
  notes?: string | null;
}

interface ApiCollectionPoint {
  id: number;
  component_id: number;
  name: string;
  orientation?: string | null;
}

interface HierarchyPayload {
  plants: ApiPlant[];
  units: ApiUnit[];
  routes: ApiRoute[];
  assets: ApiAsset[];
  components: ApiComponent[];
  collection_points: ApiCollectionPoint[];
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function componentTypeFrom(value: string | null | undefined): EquipComponentType {
  const known: EquipComponentType[] = [
    "Electric Motor (AC / DC / VFD)",
    "Centrifugal Pump",
    "Positive Displacement / Gear Pump",
    "Gearbox / Speed Reducer",
    "Fan / Blower (Centrifugal / Axial)",
    "Screw / Reciprocating Compressor",
    "Machine Tool Spindle",
    "Other (Custom / AI Spec Search)"
  ];
  const hit = known.find((k) => k === value);
  return hit || "Other (Custom / AI Spec Search)";
}

function normalizeHierarchy(payload: HierarchyPayload): EquipmentStore {
  const primary = payload.plants[0];
  const plantName = primary?.name || "Main Site";
  const plant: EquipPlant = {
    id: SITE_PLANT_ID,
    name: plantName,
    location: primary?.location || plantName,
    facilityType: "Power Plant",
    serverId: primary?.id
  };

  const pointsByComponent = new Map<number, ApiCollectionPoint[]>();
  for (const point of payload.collection_points || []) {
    const list = pointsByComponent.get(point.component_id) || [];
    list.push(point);
    pointsByComponent.set(point.component_id, list);
  }

  const componentsByAsset = new Map<number, EquipComponent[]>();
  for (const raw of payload.components || []) {
    const specs = raw.specifications || {};
    const kinematics =
      specs.kinematics && typeof specs.kinematics === "object"
        ? (specs.kinematics as EquipComponent["kinematics"])
        : undefined;
    const points: EquipCollectionPoint[] = (pointsByComponent.get(raw.id) || []).map(
      (p) => ({
        id: String(p.id),
        serverId: p.id,
        name: p.name,
        orientation:
          p.orientation === "Vertical" || p.orientation === "Axial" || p.orientation === "Radial"
            ? p.orientation
            : "Horizontal",
        measurementType: "Vibration"
      })
    );
    const component: EquipComponent = {
      id: String(raw.id),
      serverId: raw.id,
      name: raw.name,
      componentType: componentTypeFrom(raw.type),
      bearingType: kinematics?.bearingDe || kinematics?.bearingNde,
      kinematics,
      collectionPoints: points
    };
    const list = componentsByAsset.get(raw.asset_id) || [];
    list.push(component);
    componentsByAsset.set(raw.asset_id, list);
  }

  const assetsByRoute = new Map<number, EquipAsset[]>();
  for (const raw of payload.assets || []) {
    if (raw.route_id == null) continue;
    const asset: EquipAsset = {
      id: String(raw.id),
      serverId: raw.id,
      tag: raw.tag_number || raw.name,
      name: raw.name,
      location: plantName,
      machineType: raw.type || undefined,
      status: "Normal",
      criticality:
        raw.criticality === "Low" ||
        raw.criticality === "Medium" ||
        raw.criticality === "High" ||
        raw.criticality === "Critical"
          ? raw.criticality
          : undefined,
      components: componentsByAsset.get(raw.id) || []
    };
    const list = assetsByRoute.get(raw.route_id) || [];
    list.push(asset);
    assetsByRoute.set(raw.route_id, list);
  }

  const units: EquipUnit[] = (payload.units || []).map((u) => ({
    id: String(u.id),
    serverId: u.id,
    name: u.name,
    plantId: SITE_PLANT_ID
  }));

  const routes: EquipRoute[] = (payload.routes || []).map((r) => ({
    id: String(r.id),
    serverId: r.id,
    name: r.name,
    location: plantName,
    plantId: SITE_PLANT_ID,
    unitId: r.unit_id != null ? String(r.unit_id) : undefined,
    isSystem: r.is_system === true,
    assets: assetsByRoute.get(r.id) || []
  }));

  return { plants: [plant], units, routes };
}

/** H5 - server is the source of truth; localStorage is only a read cache. */
export async function fetchHierarchy(): Promise<EquipmentStore> {
  const payload = await apiJson<HierarchyPayload>("/api/hierarchy");
  const store = normalizeHierarchy(payload);
  saveEquipmentStore(store);
  return store;
}

export async function renamePlant(serverId: number, name: string): Promise<ApiPlant> {
  return apiJson<ApiPlant>(`/api/plants/${serverId}`, {
    method: "PUT",
    body: JSON.stringify({ name })
  });
}

export async function createUnit(plantId: number, name: string): Promise<ApiUnit> {
  return apiJson<ApiUnit>("/api/units", {
    method: "POST",
    body: JSON.stringify({ plant_id: plantId, name })
  });
}

export async function createRoute(
  plantId: number,
  name: string,
  unitId?: number
): Promise<ApiRoute> {
  return apiJson<ApiRoute>("/api/routes", {
    method: "POST",
    body: JSON.stringify({ plant_id: plantId, name, unit_id: unitId })
  });
}

export interface CreateAssetInput {
  routeId?: number;
  simpleMode?: boolean;
  name: string;
  tagNumber?: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  criticality?: string;
  status?: string;
  description?: string;
}

export async function createAsset(input: CreateAssetInput): Promise<ApiAsset> {
  const body: Record<string, unknown> = {
    name: input.name,
    tag_number: input.tagNumber,
    type: input.type,
    manufacturer: input.manufacturer,
    model: input.model,
    serial_number: input.serialNumber,
    criticality: input.criticality,
    status: input.status || "Active",
    description: input.description
  };
  if (input.routeId != null) body.route_id = input.routeId;
  if (input.simpleMode) body.simpleMode = true;
  return apiJson<ApiAsset>("/api/assets", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export interface CreateComponentInput {
  assetId: number;
  name: string;
  type?: string;
  manufacturer?: string;
  specifications?: Record<string, unknown>;
  notes?: string;
}

export async function createComponent(
  input: CreateComponentInput
): Promise<ApiComponent> {
  return apiJson<ApiComponent>("/api/components", {
    method: "POST",
    body: JSON.stringify({
      asset_id: input.assetId,
      name: input.name,
      type: input.type,
      manufacturer: input.manufacturer,
      specifications: input.specifications,
      notes: input.notes
    })
  });
}

export async function createCollectionPoint(
  componentId: number,
  name: string,
  orientation: string
): Promise<ApiCollectionPoint> {
  return apiJson<ApiCollectionPoint>("/api/collection-points", {
    method: "POST",
    body: JSON.stringify({ component_id: componentId, name, notes: orientation })
  });
}

export async function updateUnit(serverId: number, name: string): Promise<ApiUnit> {
  return apiJson<ApiUnit>(`/api/units/${serverId}`, {
    method: "PUT",
    body: JSON.stringify({ name })
  });
}

export async function updateRoute(serverId: number, name: string): Promise<ApiRoute> {
  return apiJson<ApiRoute>(`/api/routes/${serverId}`, {
    method: "PUT",
    body: JSON.stringify({ name })
  });
}

export interface UpdateAssetInput {
  serverId: number;
  name: string;
  tagNumber?: string;
  type?: string;
  criticality?: string;
  status?: string;
}

export async function updateAsset(input: UpdateAssetInput): Promise<ApiAsset> {
  return apiJson<ApiAsset>(`/api/assets/${input.serverId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: input.name,
      tag_number: input.tagNumber,
      type: input.type,
      criticality: input.criticality,
      status: input.status || "Active"
    })
  });
}

export async function updateComponent(
  serverId: number,
  input: { name: string; type?: string; specifications?: Record<string, unknown> }
): Promise<ApiComponent> {
  return apiJson<ApiComponent>(`/api/components/${serverId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: input.name,
      type: input.type,
      specifications: input.specifications
    })
  });
}

export async function updateCollectionPoint(
  serverId: number,
  input: { name: string; orientation: string }
): Promise<ApiCollectionPoint> {
  return apiJson<ApiCollectionPoint>(`/api/collection-points/${serverId}`, {
    method: "PUT",
    body: JSON.stringify({ name: input.name, notes: input.orientation })
  });
}

export async function deleteHierarchyNode(
  kind: "unit" | "route" | "asset" | "component" | "point",
  serverId: number
): Promise<void> {
  const path =
    kind === "unit"
      ? `/api/units/${serverId}`
      : kind === "route"
        ? `/api/routes/${serverId}`
        : kind === "asset"
          ? `/api/assets/${serverId}`
          : kind === "component"
            ? `/api/components/${serverId}`
            : `/api/collection-points/${serverId}`;
  await apiJson<Record<string, unknown>>(path, { method: "DELETE" });
}
