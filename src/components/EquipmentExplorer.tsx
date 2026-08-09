import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  ensureSitePlantRoot,
  clearAllData,
  getEquipmentStore,
  loadDemoData,
  saveActiveDbSelection,
  saveEquipmentStore,
  resolveActiveDbSelectionFromNode,
  SITE_FACILITY_HOLDING_ASSET_ID,
  SITE_FACILITY_POINTS_COMP_ID,
  SITE_FACILITY_ROUTE_ID,
  SITE_PLANT_ID,
  type EquipAsset,
  type EquipCollectionPoint,
  type EquipComponent,
  type EquipComponentType,
  type EquipRoute,
  type EquipUnit,
  type EquipmentStore
} from "../data/equipmentDb";
import { useToast } from "./Toast";
import ComponentKinematicsSpecsForm, {
  type CbmKinematics
} from "./ComponentKinematicsSpecsForm";

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

export type ExplorerKind =
  | "plant"
  | "unit"
  | "route"
  | "asset"
  | "component"
  | "point";

export interface ExplorerNode {
  id: string;
  kind: ExplorerKind;
  label: string;
  path: string;
  parentId: string | null;
  children: ExplorerNode[];
}

type PanelMode = "idle" | "create" | "edit";

type DetailTab =
  | "Location Profile"
  | "Equipment Maintenance Plan"
  | "Exceptions"
  | "Feedback";

const DETAIL_TABS: DetailTab[] = [
  "Location Profile",
  "Equipment Maintenance Plan",
  "Exceptions",
  "Feedback"
];

/** Core CBM technologies for the Equipment Maintenance Plan matrix. */
type CbmTechRow = {
  technology: string;
  monitored: boolean;
  /** Latest assessment timestamp shown as a green badge when monitored */
  lastAssessment?: string;
  reportUrl?: string;
};

const CBM_TECH_MATRIX: CbmTechRow[] = [
  {
    technology: "Vibration",
    monitored: true,
    lastAssessment: "1/8/2026 8:35 AM",
    reportUrl: "#"
  },
  { technology: "Thermography", monitored: false },
  { technology: "Ultrasound", monitored: false },
  { technology: "Lubrication", monitored: false },
  { technology: "Temperature", monitored: false },
  { technology: "MCA - Online", monitored: false },
  { technology: "MCA - Offline", monitored: false }
];

const CHILD_OF: Record<ExplorerKind, ExplorerKind | null> = {
  plant: "unit",
  unit: "route",
  route: "asset",
  asset: "component",
  component: "point",
  point: null
};

const KIND_ICON: Record<ExplorerKind, string> = {
  plant: "🏢",
  unit: "🏭",
  route: "🛣️",
  asset: "⚙️",
  component: "🔌",
  point: "📍"
};

const KIND_LABEL: Record<ExplorerKind, string> = {
  plant: "Plant",
  unit: "Unit",
  route: "Route",
  asset: "Asset",
  component: "Component",
  point: "Collection Point"
};

const COMPONENT_TYPES: EquipComponentType[] = [
  "Electric Motor (AC / DC / VFD)",
  "Centrifugal Pump",
  "Positive Displacement / Gear Pump",
  "Gearbox / Speed Reducer",
  "Fan / Blower (Centrifugal / Axial)",
  "Screw / Reciprocating Compressor",
  "Machine Tool Spindle",
  "Other (Custom / AI Spec Search)"
];

const QUICK_ADD_LEVELS: {
  kind: Exclude<ExplorerKind, "plant">;
  label: string;
  icon: string;
}[] = [
  { kind: "unit", label: "Unit", icon: "🏭" },
  { kind: "route", label: "Route", icon: "🛣️" },
  { kind: "asset", label: "Asset", icon: "⚙️" },
  { kind: "component", label: "Component", icon: "🔌" },
  { kind: "point", label: "Collection Point", icon: "📍" }
];

const QUICK_ADD_BTN =
  "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
const QUICK_ADD_BTN_ACTIVE =
  "border-amber-400 text-amber-300 bg-amber-950/40 hover:bg-amber-950/50 rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap border";

/** Route collection-interval options for the Route create form. */
const FREQUENCIES: NonNullable<EquipRoute["collectionFrequency"]>[] = [
  "Daily",
  "Weekly",
  "Bi-Weekly",
  "Monthly",
  "Bi-Monthly",
  "Quarterly",
  "Semi-Annually",
  "Annually"
];

/** Ideal parent kinds for each creatable level (plant always allowed via facility bucket). */
const IDEAL_PARENT: Record<Exclude<ExplorerKind, "plant">, ExplorerKind[]> = {
  unit: ["plant"],
  route: ["plant", "unit"],
  asset: ["route", "plant"],
  component: ["asset", "plant"],
  point: ["component", "plant"]
};

const DEFAULT_KIN: CbmKinematics = {
  ratedRpm: "1780",
  lineFrequency: "60Hz",
  motorPoles: "4",
  driveArrangement: "Direct Drive",
  couplingType: "Flexible Grid",
  isoClass: "Class II"
};

const INPUT =
  "w-full min-h-[40px] rounded-xl bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC700] transition-colors disabled:opacity-40";
const LABEL = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const BTN_PRIMARY =
  "min-h-[40px] px-4 rounded-xl bg-[#FFC700] hover:bg-[#e6b400] text-slate-950 text-sm font-bold cursor-pointer transition-colors";
const BTN_GHOST =
  "min-h-[40px] px-4 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 text-sm font-bold cursor-pointer hover:border-slate-500 transition-colors";
const BTN_CYAN =
  "min-h-[40px] px-4 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-500/25 transition-colors inline-flex items-center justify-center gap-2";

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneStore(store: EquipmentStore): EquipmentStore {
  return JSON.parse(JSON.stringify(store)) as EquipmentStore;
}

function Field({
  label,
  required,
  children,
  className = ""
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 min-w-0 ${className}`}>
      <span className={LABEL}>
        {label}
        {required ? <span className="text-[#FFC700] ml-0.5">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/** Compress image to a lightweight JPEG data URL for localStorage. */
function fileToLightweightDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !file.type.startsWith("image/")) {
      reject(new Error("Unsupported image type"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.onload = () => {
        const maxEdge = 800;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function lookupNodePhoto(
  store: EquipmentStore,
  nodeId: string,
  kind: ExplorerKind
): string | null {
  if (kind !== "asset" && kind !== "component") return null;
  for (const route of store.routes) {
    for (const asset of route.assets) {
      if (kind === "asset" && asset.id === nodeId) {
        return asset.photoUrl || null;
      }
      if (kind === "component") {
        const comp = asset.components.find((c) => c.id === nodeId);
        if (comp) return comp.photoUrl || null;
      }
    }
  }
  return null;
}

function patchNodePhoto(
  store: EquipmentStore,
  nodeId: string,
  kind: "asset" | "component",
  photoUrl: string | undefined
): EquipmentStore {
  return {
    ...store,
    routes: store.routes.map((r) => ({
      ...r,
      assets: r.assets.map((a) => {
        if (kind === "asset" && a.id === nodeId) {
          return { ...a, photoUrl };
        }
        if (kind === "component") {
          return {
            ...a,
            components: a.components.map((c) =>
              c.id === nodeId ? { ...c, photoUrl } : c
            )
          };
        }
        return a;
      })
    }))
  };
}

/**
 * Cascade-delete a hierarchy node from the persisted store.
 * Plant / licensed site root cannot be deleted.
 */
function deleteNodeFromStore(
  store: EquipmentStore,
  nodeId: string,
  kind: ExplorerKind
): EquipmentStore {
  if (kind === "plant" || nodeId === SITE_PLANT_ID) return store;

  if (kind === "unit") {
    return {
      ...store,
      units: store.units.filter((u) => u.id !== nodeId),
      routes: store.routes.filter((r) => r.unitId !== nodeId)
    };
  }

  if (kind === "route") {
    return {
      ...store,
      routes: store.routes.filter((r) => r.id !== nodeId)
    };
  }

  if (kind === "asset") {
    return {
      ...store,
      routes: store.routes.map((r) => ({
        ...r,
        assets: r.assets.filter((a) => a.id !== nodeId)
      }))
    };
  }

  if (kind === "component") {
    return {
      ...store,
      routes: store.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => ({
          ...a,
          components: a.components.filter((c) => c.id !== nodeId)
        }))
      }))
    };
  }

  if (kind === "point") {
    return {
      ...store,
      routes: store.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => ({
          ...a,
          components: a.components.map((c) => ({
            ...c,
            collectionPoints: (c.collectionPoints ?? []).filter(
              (p) => p.id !== nodeId
            )
          }))
        }))
      }))
    };
  }

  return store;
}

function EquipmentPhotoUploader({
  photoUrl,
  onChange,
  busy,
  setBusy,
  onError,
  onPreviewClick
}: {
  photoUrl: string;
  onChange: (url: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (msg: string) => void;
  onPreviewClick?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    onError("");
    try {
      const dataUrl = await fileToLightweightDataUrl(file);
      onChange(dataUrl);
    } catch {
      onError("Use a .jpg, .png, or .webp image under ~5 MB.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Equipment Photo &amp; Nameplate
      </p>
      {!photoUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void ingest(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className="w-full rounded-xl border border-dashed border-slate-600 hover:border-amber-400/50 bg-slate-900/60 hover:bg-slate-900 px-4 py-8 text-center cursor-pointer transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-6 w-6 text-amber-400 mx-auto mb-2 animate-spin" />
          ) : (
            <Upload className="h-6 w-6 text-amber-400 mx-auto mb-2" />
          )}
          <p className="text-sm font-semibold text-white">
            Drop machine or nameplate photo here
          </p>
          <p className="text-[11px] text-slate-500 mt-1">.jpg, .png, .webp</p>
        </button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <button
            type="button"
            onClick={() =>
              onPreviewClick ? onPreviewClick(photoUrl) : undefined
            }
            className={`w-32 h-24 shrink-0 rounded-lg border border-amber-400/50 bg-slate-900 overflow-hidden shadow-[0_0_12px_rgba(251,191,36,0.15)] ${
              onPreviewClick ? "cursor-pointer hover:border-amber-300" : "cursor-default"
            }`}
            title={onPreviewClick ? "View full-size photo" : undefined}
          >
            <img
              src={photoUrl}
              alt="Equipment preview"
              className="w-full h-full object-cover"
            />
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="min-h-[32px] px-2.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-200 text-[11px] font-bold cursor-pointer hover:border-amber-400/50 hover:text-amber-300 inline-flex items-center gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              Change Photo
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy}
              className="min-h-[32px] px-2.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300"
            >
              ✕ Remove
            </button>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void ingest(e.target.files?.[0])}
      />
    </div>
  );
}

function aiExtractSchema(customType: string): CbmKinematics {
  const q = customType.toLowerCase();
  if (q.includes("decanter") || q.includes("centrifuge")) {
    return {
      ...DEFAULT_KIN,
      customEquipmentType: customType.trim(),
      motorHpKw: "75 / 55",
      ratedRpm: "3200",
      minOperatingRpm: "1800",
      maxOperatingRpm: "3600",
      bearingDe: "SKF 22317 E",
      bearingNde: "SKF 22315 E",
      thrustBearing: "SKF 29420 E"
    };
  }
  return {
    ...DEFAULT_KIN,
    customEquipmentType: customType.trim(),
    motorHpKw: "100 / 75",
    ratedRpm: "1780",
    rotorBars: "48",
    statorSlots: "72",
    bearingDe: "SKF 6320 C3",
    bearingNde: "SKF 6215 C3"
  };
}

/* ========================================================================== */
/* Tree builder                                                               */
/* ========================================================================== */

function buildExplorerTree(
  store: EquipmentStore,
  facilityName: string
): ExplorerNode[] {
  const attachAssetBranch = (
    route: EquipRoute,
    parentPath: string,
    parentId: string,
    skipHoldingAsset = false
  ): ExplorerNode[] =>
    route.assets
      .filter((asset) => !(skipHoldingAsset && asset.id === SITE_FACILITY_HOLDING_ASSET_ID))
      .map((asset) => {
        const assetPath = `${parentPath} ➔ ${asset.tag}`;
        return {
          id: asset.id,
          kind: "asset" as const,
          label: `${asset.tag} — ${asset.name}`,
          path: assetPath,
          parentId,
          children: asset.components.map((comp) => {
            const compPath = `${assetPath} ➔ ${comp.name}`;
            return {
              id: comp.id,
              kind: "component" as const,
              label: comp.name,
              path: compPath,
              parentId: asset.id,
              children: (comp.collectionPoints ?? []).map((pt) => ({
                id: pt.id,
                kind: "point" as const,
                label: pt.name,
                path: `${compPath} ➔ ${pt.name}`,
                parentId: comp.id,
                children: []
              }))
            };
          })
        };
      });

  const plantPath = facilityName;
  const plantUnits = store.units.filter(
    (u) => u.plantId === SITE_PLANT_ID || !u.plantId
  );
  const unitNodes: ExplorerNode[] = plantUnits.map((unit) => {
    const unitPath = `${plantPath} ➔ ${unit.name}`;
    const unitRoutes = store.routes.filter(
      (r) => r.unitId === unit.id && r.id !== SITE_FACILITY_ROUTE_ID
    );
    return {
      id: unit.id,
      kind: "unit" as const,
      label: unit.name,
      path: unitPath,
      parentId: SITE_PLANT_ID,
      children: unitRoutes.map((route) => {
        const routePath = `${unitPath} ➔ ${route.name}`;
        return {
          id: route.id,
          kind: "route" as const,
          label: route.name,
          path: routePath,
          parentId: unit.id,
          children: attachAssetBranch(route, routePath, route.id)
        };
      })
    };
  });

  const unitIds = new Set(plantUnits.map((u) => u.id));
  const directRoutes = store.routes.filter(
    (r) =>
      r.id !== SITE_FACILITY_ROUTE_ID &&
      (!r.unitId || !unitIds.has(r.unitId))
  );
  const routeNodes = directRoutes.map((route) => {
    const routePath = `${plantPath} ➔ ${route.name}`;
    return {
      id: route.id,
      kind: "route" as const,
      label: route.name,
      path: routePath,
      parentId: SITE_PLANT_ID,
      children: attachAssetBranch(route, routePath, route.id)
    };
  });

  /* Facility-direct assets / orphan components & points (hidden bucket route). */
  const facilityRoute = store.routes.find((r) => r.id === SITE_FACILITY_ROUTE_ID);
  const facilityDirectNodes: ExplorerNode[] = [];
  if (facilityRoute) {
    facilityDirectNodes.push(
      ...attachAssetBranch(facilityRoute, plantPath, SITE_PLANT_ID, true)
    );
    const holding = facilityRoute.assets.find(
      (a) => a.id === SITE_FACILITY_HOLDING_ASSET_ID
    );
    if (holding) {
      for (const comp of holding.components) {
        if (comp.id === SITE_FACILITY_POINTS_COMP_ID) {
          for (const pt of comp.collectionPoints ?? []) {
            facilityDirectNodes.push({
              id: pt.id,
              kind: "point",
              label: pt.name,
              path: `${plantPath} ➔ ${pt.name}`,
              parentId: SITE_PLANT_ID,
              children: []
            });
          }
          continue;
        }
        const compPath = `${plantPath} ➔ ${comp.name}`;
        facilityDirectNodes.push({
          id: comp.id,
          kind: "component",
          label: comp.name,
          path: compPath,
          parentId: SITE_PLANT_ID,
          children: (comp.collectionPoints ?? []).map((pt) => ({
            id: pt.id,
            kind: "point" as const,
            label: pt.name,
            path: `${compPath} ➔ ${pt.name}`,
            parentId: comp.id,
            children: []
          }))
        });
      }
    }
  }

  return [
    {
      id: SITE_PLANT_ID,
      kind: "plant",
      label: facilityName,
      path: plantPath,
      parentId: null,
      children: [...unitNodes, ...routeNodes, ...facilityDirectNodes]
    }
  ];
}

function findNode(
  nodes: ExplorerNode[],
  id: string | null
): ExplorerNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Collect ancestor ids from root → node for expand / breadcrumb navigation. */
function collectAncestorIds(
  nodes: ExplorerNode[],
  id: string | null
): string[] {
  if (!id) return [];
  const walk = (
    list: ExplorerNode[],
    trail: string[]
  ): string[] | null => {
    for (const n of list) {
      const next = [...trail, n.id];
      if (n.id === id) return next;
      const hit = walk(n.children, next);
      if (hit) return hit;
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

function lookupEditableEntity(
  store: EquipmentStore,
  node: ExplorerNode
): {
  unit?: EquipUnit;
  route?: EquipRoute;
  asset?: EquipAsset;
  component?: EquipComponent;
  point?: EquipCollectionPoint;
} {
  if (node.kind === "unit") {
    return { unit: store.units.find((u) => u.id === node.id) };
  }
  if (node.kind === "route") {
    return { route: store.routes.find((r) => r.id === node.id) };
  }
  for (const route of store.routes) {
    for (const asset of route.assets) {
      if (node.kind === "asset" && asset.id === node.id) {
        return { asset };
      }
      for (const comp of asset.components) {
        if (node.kind === "component" && comp.id === node.id) {
          return { component: comp };
        }
        if (node.kind === "point") {
          const point = (comp.collectionPoints ?? []).find(
            (p) => p.id === node.id
          );
          if (point) return { point };
        }
      }
    }
  }
  return {};
}

/** Facility has no units/routes/assets yet (root plant always exists). */
function isFacilityEmpty(store: EquipmentStore): boolean {
  if (store.units.length > 0) return false;
  const visibleRoutes = store.routes.filter((r) => r.id !== SITE_FACILITY_ROUTE_ID);
  if (visibleRoutes.length > 0) return false;
  const facilityRoute = store.routes.find((r) => r.id === SITE_FACILITY_ROUTE_ID);
  if (!facilityRoute) return true;
  if (facilityRoute.assets.some((a) => a.id !== SITE_FACILITY_HOLDING_ASSET_ID)) {
    return false;
  }
  const holding = facilityRoute.assets.find(
    (a) => a.id === SITE_FACILITY_HOLDING_ASSET_ID
  );
  if (!holding) return true;
  const meaningfulComps = holding.components.filter(
    (c) => c.id !== SITE_FACILITY_POINTS_COMP_ID
  );
  if (meaningfulComps.length > 0) return false;
  const pointsHost = holding.components.find(
    (c) => c.id === SITE_FACILITY_POINTS_COMP_ID
  );
  if ((pointsHost?.collectionPoints?.length ?? 0) > 0) return false;
  return true;
}

function ensureFacilityRoute(
  store: EquipmentStore,
  facilityName: string
): EquipRoute {
  let route = store.routes.find((r) => r.id === SITE_FACILITY_ROUTE_ID);
  if (!route) {
    route = {
      id: SITE_FACILITY_ROUTE_ID,
      name: "Facility Direct",
      location: facilityName,
      assets: [],
      plantId: SITE_PLANT_ID,
      collectionFrequency: "Monthly"
    };
    store.routes.push(route);
  }
  return route;
}

function ensureFacilityHoldingAsset(
  store: EquipmentStore,
  facilityName: string
): EquipAsset {
  const route = ensureFacilityRoute(store, facilityName);
  let asset = route.assets.find((a) => a.id === SITE_FACILITY_HOLDING_ASSET_ID);
  if (!asset) {
    asset = {
      id: SITE_FACILITY_HOLDING_ASSET_ID,
      tag: "FAC",
      name: "Facility Equipment",
      location: facilityName,
      status: "Normal",
      overallVibration: 1.0,
      components: []
    };
    route.assets.push(asset);
  }
  return asset;
}

function ensureFacilityPointsHost(
  store: EquipmentStore,
  facilityName: string
): EquipComponent {
  const holding = ensureFacilityHoldingAsset(store, facilityName);
  let host = holding.components.find((c) => c.id === SITE_FACILITY_POINTS_COMP_ID);
  if (!host) {
    host = {
      id: SITE_FACILITY_POINTS_COMP_ID,
      name: "Collection Points",
      collectionPoints: []
    };
    holding.components.push(host);
  }
  return host;
}

/* ========================================================================== */
/* Component                                                                  */
/* ========================================================================== */

export default function EquipmentExplorer({
  userPlantName
}: {
  userPlantName?: string;
}) {
  const { toast } = useToast();
  const facilityName =
    (userPlantName && userPlantName.trim()) || "Main Facility";

  const [tick, setTick] = useState(0);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerNode | null>(null);
  const store = useMemo(() => {
    void tick;
    return ensureSitePlantRoot(facilityName);
  }, [tick, facilityName]);

  const tree = useMemo(
    () => buildExplorerTree(store, facilityName),
    [store, facilityName]
  );
  const empty = isFacilityEmpty(store);
  const siteRoot = tree[0] ?? null;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    [SITE_PLANT_ID]: true
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    SITE_PLANT_ID
  );
  const [mode, setMode] = useState<PanelMode>("idle");
  const [detailTab, setDetailTab] = useState<DetailTab>("Location Profile");
  const [createKind, setCreateKind] = useState<ExplorerKind>("unit");
  const [parentNodeId, setParentNodeId] = useState<string | null>(SITE_PLANT_ID);
  const [error, setError] = useState("");

  const selectedNode = findNode(tree, selectedNodeId);
  const parentNode = findNode(tree, parentNodeId);

  const withFacilityPrefix = (path: string) => {
    const bracketed = `[${facilityName}]`;
    if (!path || path === "—") return bracketed;
    if (path.startsWith(bracketed)) return path;
    if (path === facilityName || path.startsWith(`${facilityName} ➔`)) {
      return bracketed + path.slice(facilityName.length);
    }
    return `${bracketed} ➔ ${path}`;
  };

  const contextPath =
    mode === "create"
      ? withFacilityPrefix(parentNode?.path || facilityName)
      : withFacilityPrefix(selectedNode?.path || facilityName);

  const breadcrumbSegments = useMemo(() => {
    const raw = contextPath.replace(/➔/g, "➔");
    return raw
      .split(/\s*➔\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [contextPath]);

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    setExpanded((prev) => ({ ...prev, [SITE_PLANT_ID]: true }));
  }, [tree]);

  useEffect(() => {
    if (!selectedNode) return;
    if (
      selectedNode.kind === "plant" ||
      selectedNode.kind === "unit"
    ) {
      return;
    }
    const snap = resolveActiveDbSelectionFromNode(
      selectedNode.id,
      selectedNode.kind,
      selectedNode.path
    );
    if (snap) saveActiveDbSelection(snap);
  }, [selectedNode]);

  const startCreate = (kind: ExplorerKind, parent: ExplorerNode | null) => {
    if (kind === "plant") return;
    setError("");
    setCreateKind(kind);
    setParentNodeId(parent?.id ?? SITE_PLANT_ID);
    setMode("create");
    if (parent) {
      setSelectedNodeId(parent.id);
      setExpanded((prev) => ({ ...prev, [parent.id]: true }));
    } else {
      setSelectedNodeId(SITE_PLANT_ID);
    }
  };

  const cancelForm = () => {
    setMode("idle");
    setError("");
    setParentNodeId(SITE_PLANT_ID);
  };

  const handleLoadDemo = () => {
    loadDemoData(facilityName);
    refresh();
    setMode("idle");
    setSelectedNodeId(SITE_PLANT_ID);
    setExpanded({ [SITE_PLANT_ID]: true });
    setConfirmResetOpen(false);
    toast("Demo plant hierarchy loaded.", "success");
  };

  const handleConfirmReset = () => {
    clearAllData(facilityName);
    refresh();
    setMode("idle");
    setError("");
    setParentNodeId(SITE_PLANT_ID);
    setSelectedNodeId(SITE_PLANT_ID);
    setExpanded({ [SITE_PLANT_ID]: true });
    setConfirmResetOpen(false);
    saveActiveDbSelection({
      nodeId: SITE_PLANT_ID,
      kind: "plant",
      routeName: "",
      assetTag: "",
      assetId: "",
      componentName: "",
      componentId: "",
      path: facilityName,
      updatedAt: Date.now()
    });
    toast("Database reset to clean state.", "success");
  };

  const requestDeleteNode = (node: ExplorerNode) => {
    if (node.id === SITE_PLANT_ID || node.kind === "plant") return;
    setDeleteTarget(node);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === SITE_PLANT_ID || deleteTarget.kind === "plant") {
      setDeleteTarget(null);
      return;
    }
    const label = deleteTarget.label;
    const parentId = deleteTarget.parentId || SITE_PLANT_ID;
    const next = deleteNodeFromStore(
      cloneStore(getEquipmentStore()),
      deleteTarget.id,
      deleteTarget.kind
    );
    // Drop empty facility-direct bucket route if nothing left in it
    const fac = next.routes.find((r) => r.id === SITE_FACILITY_ROUTE_ID);
    if (fac) {
      const holding = fac.assets.find(
        (a) => a.id === SITE_FACILITY_HOLDING_ASSET_ID
      );
      const hasRealAssets = fac.assets.some(
        (a) => a.id !== SITE_FACILITY_HOLDING_ASSET_ID
      );
      const holdingEmpty =
        !holding ||
        (holding.components.filter((c) => c.id !== SITE_FACILITY_POINTS_COMP_ID)
          .length === 0 &&
          (holding.components.find((c) => c.id === SITE_FACILITY_POINTS_COMP_ID)
            ?.collectionPoints?.length ?? 0) === 0);
      if (!hasRealAssets && holdingEmpty) {
        next.routes = next.routes.filter((r) => r.id !== SITE_FACILITY_ROUTE_ID);
      }
    }
    saveEquipmentStore(next);
    refresh();
    setMode("idle");
    setError("");
    setSelectedNodeId(parentId);
    setParentNodeId(SITE_PLANT_ID);
    setDeleteTarget(null);
    toast(`"${label}" successfully deleted.`, "success");
  };

  /* ---- Form fields (create) ---- */
  const [unitName, setUnitName] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeFreq, setRouteFreq] =
    useState<NonNullable<EquipRoute["collectionFrequency"]>>("Monthly");

  const [assetName, setAssetName] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [machineType, setMachineType] = useState("Pump");
  const [assetRpm, setAssetRpm] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<EquipComponentType>(
    "Electric Motor (AC / DC / VFD)"
  );
  const [customEquipType, setCustomEquipType] = useState("");
  const [showSpecs, setShowSpecs] = useState(true);
  const [kin, setKin] = useState<CbmKinematics>({ ...DEFAULT_KIN });
  const [aiSearching, setAiSearching] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const aiTimerRef = useRef<number | null>(null);

  const [pointName, setPointName] = useState("");
  const [pointOrient, setPointOrient] =
    useState<EquipCollectionPoint["orientation"]>("Horizontal");
  const [pointMeas, setPointMeas] =
    useState<EquipCollectionPoint["measurementType"]>("Vibration");

  useEffect(() => {
    return () => {
      if (aiTimerRef.current != null) window.clearTimeout(aiTimerRef.current);
    };
  }, []);

  const resetFormFields = () => {
    setUnitName("");
    setRouteName("");
    setRouteFreq("Monthly");
    setAssetName("");
    setAssetTag("");
    setMachineType("Pump");
    setAssetRpm("");
    setFormPhotoUrl("");
    setPhotoBusy(false);
    setCompName("");
    setCompType("Electric Motor (AC / DC / VFD)");
    setCustomEquipType("");
    setShowSpecs(true);
    setKin({ ...DEFAULT_KIN });
    setAiExtracted(false);
    setPointName("");
    setPointOrient("Horizontal");
    setPointMeas("Vibration");
    setError("");
  };

  const beginCreate = (kind: ExplorerKind, parent: ExplorerNode | null) => {
    if (kind === "plant") return;
    resetFormFields();
    startCreate(kind, parent ?? siteRoot);
  };

  /** Resolve parent from current selection; fall back to facility root. */
  const resolveQuickAddParent = (
    kind: Exclude<ExplorerKind, "plant">
  ): ExplorerNode | null => {
    if (!siteRoot) return null;
    if (empty) return siteRoot;

    const ctx = selectedNode ?? siteRoot;
    if (ctx.kind === "plant") return siteRoot;

    const ideals = IDEAL_PARENT[kind];
    if (ideals.includes(ctx.kind)) return ctx;

    let walk: ExplorerNode | null = ctx;
    while (walk) {
      if (ideals.includes(walk.kind)) return walk;
      walk = walk.parentId ? findNode(tree, walk.parentId) : null;
    }
    return siteRoot;
  };

  const beginQuickAdd = (kind: Exclude<ExplorerKind, "plant">) => {
    beginCreate(kind, resolveQuickAddParent(kind));
  };

  const EDITABLE_KINDS: ExplorerKind[] = [
    "unit",
    "route",
    "asset",
    "component",
    "point"
  ];

  const beginEdit = (node: ExplorerNode) => {
    if (!EDITABLE_KINDS.includes(node.kind)) {
      setSelectedNodeId(node.id);
      setMode("idle");
      setError("");
      return;
    }
    resetFormFields();
    const entity = lookupEditableEntity(store, node);
    if (node.kind === "unit" && entity.unit) {
      setUnitName(entity.unit.name);
    } else if (node.kind === "route" && entity.route) {
      setRouteName(entity.route.name);
      setRouteFreq(entity.route.collectionFrequency || "Monthly");
    } else if (node.kind === "asset" && entity.asset) {
      setAssetName(entity.asset.name);
      setAssetTag(entity.asset.tag || "");
      setMachineType(entity.asset.machineType || "");
      setAssetRpm(
        entity.asset.speedRpm != null ? String(entity.asset.speedRpm) : ""
      );
      setFormPhotoUrl(entity.asset.photoUrl || "");
    } else if (node.kind === "component" && entity.component) {
      setCompName(entity.component.name);
      setCompType(entity.component.componentType);
      setCustomEquipType(
        entity.component.kinematics?.customEquipmentType || ""
      );
      setFormPhotoUrl(entity.component.photoUrl || "");
      if (entity.component.kinematics) {
        setKin({ ...DEFAULT_KIN, ...entity.component.kinematics });
        setShowSpecs(true);
      } else {
        setKin({ ...DEFAULT_KIN });
        setShowSpecs(false);
      }
    } else if (node.kind === "point" && entity.point) {
      setPointName(entity.point.name);
      setPointOrient(entity.point.orientation || "Horizontal");
      setPointMeas(entity.point.measurementType || "Vibration");
    } else {
      setError("Could not load this node for editing.");
      setSelectedNodeId(node.id);
      setMode("idle");
      return;
    }

    setCreateKind(node.kind);
    setSelectedNodeId(node.id);
    setParentNodeId(node.parentId);
    setMode("edit");
    setError("");
    const ancestors = collectAncestorIds(tree, node.id);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of ancestors) next[id] = true;
      return next;
    });
  };

  const handleUpdate = () => {
    if (!selectedNodeId || !EDITABLE_KINDS.includes(createKind)) return;
    setError("");
    const next = cloneStore(getEquipmentStore());
    next.plants = [
      {
        id: SITE_PLANT_ID,
        name: facilityName,
        location:
          next.plants.find((p) => p.id === SITE_PLANT_ID)?.location ||
          facilityName,
        facilityType:
          next.plants.find((p) => p.id === SITE_PLANT_ID)?.facilityType ||
          "Power Plant"
      }
    ];

    if (createKind === "unit") {
      if (!unitName.trim()) {
        setError("Unit / Area name is required.");
        return;
      }
      const idx = next.units.findIndex((u) => u.id === selectedNodeId);
      if (idx < 0) {
        setError("Unit not found.");
        return;
      }
      next.units[idx] = { ...next.units[idx], name: unitName.trim() };
      saveEquipmentStore(next);
      refresh();
      cancelForm();
      setSelectedNodeId(selectedNodeId);
      toast("Unit updated.", "success");
      return;
    }

    if (createKind === "route") {
      if (!routeName.trim()) {
        setError("Route name is required.");
        return;
      }
      const idx = next.routes.findIndex((r) => r.id === selectedNodeId);
      if (idx < 0) {
        setError("Route not found.");
        return;
      }
      next.routes[idx] = {
        ...next.routes[idx],
        name: routeName.trim(),
        collectionFrequency: routeFreq
      };
      saveEquipmentStore(next);
      refresh();
      cancelForm();
      setSelectedNodeId(selectedNodeId);
      toast("Route updated.", "success");
      return;
    }

    if (createKind === "asset") {
      if (!assetName.trim()) {
        setError("Asset name is required.");
        return;
      }
      let found = false;
      next.routes = next.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => {
          if (a.id !== selectedNodeId) return a;
          found = true;
          return {
            ...a,
            name: assetName.trim(),
            tag: assetTag.trim().toUpperCase(),
            machineType: machineType.trim() || undefined,
            speedRpm: assetRpm ? Number(assetRpm) || undefined : undefined,
            photoUrl: formPhotoUrl || undefined
          };
        })
      }));
      if (!found) {
        setError("Asset not found.");
        return;
      }
      saveEquipmentStore(next);
      refresh();
      cancelForm();
      setSelectedNodeId(selectedNodeId);
      toast("Asset updated.", "success");
      return;
    }

    if (createKind === "component") {
      if (!compName.trim()) {
        setError("Component name is required.");
        return;
      }
      if (
        compType === "Other (Custom / AI Spec Search)" &&
        !customEquipType.trim()
      ) {
        setError("Enter a custom equipment type.");
        return;
      }
      const kinematics: CbmKinematics | undefined = showSpecs
        ? {
            ...kin,
            customEquipmentType:
              compType === "Other (Custom / AI Spec Search)"
                ? customEquipType.trim()
                : kin.customEquipmentType
          }
        : undefined;
      const rpmNum = Number(kinematics?.ratedRpm || "");
      let found = false;
      next.routes = next.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => ({
          ...a,
          components: a.components.map((c) => {
            if (c.id !== selectedNodeId) return c;
            found = true;
            return {
              ...c,
              name: compName.trim(),
              componentType: compType,
              bearingType: kinematics?.bearingDe || kinematics?.bearingNde,
              speedRpm:
                Number.isFinite(rpmNum) && rpmNum > 0 ? rpmNum : c.speedRpm,
              isoClass: kinematics?.isoClass ?? c.isoClass,
              kinematics,
              photoUrl: formPhotoUrl || undefined
            };
          })
        }))
      }));
      if (!found) {
        setError("Component not found.");
        return;
      }
      saveEquipmentStore(next);
      refresh();
      cancelForm();
      setSelectedNodeId(selectedNodeId);
      toast("Component updated.", "success");
      return;
    }

    if (createKind === "point") {
      if (!pointName.trim()) {
        setError("Point name is required.");
        return;
      }
      let found = false;
      next.routes = next.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => ({
          ...a,
          components: a.components.map((c) => ({
            ...c,
            collectionPoints: (c.collectionPoints ?? []).map((p) => {
              if (p.id !== selectedNodeId) return p;
              found = true;
              return {
                ...p,
                name: pointName.trim(),
                orientation: pointOrient,
                measurementType: pointMeas
              };
            })
          }))
        }))
      }));
      if (!found) {
        setError("Collection point not found.");
        return;
      }
      saveEquipmentStore(next);
      refresh();
      cancelForm();
      setSelectedNodeId(selectedNodeId);
      toast("Collection point updated.", "success");
    }
  };

  const runAiSpecSearch = () => {
    if (!customEquipType.trim()) {
      setError("Enter a custom equipment type before running AI search.");
      return;
    }
    setError("");
    setAiSearching(true);
    setAiExtracted(false);
    if (aiTimerRef.current != null) window.clearTimeout(aiTimerRef.current);
    aiTimerRef.current = window.setTimeout(() => {
      setKin(aiExtractSchema(customEquipType));
      setShowSpecs(true);
      setAiSearching(false);
      setAiExtracted(true);
      aiTimerRef.current = null;
    }, 1500);
  };

  const handleSave = () => {
    setError("");
    const next = cloneStore(getEquipmentStore());
    // Always keep the licensed single plant root
    next.plants = [
      {
        id: SITE_PLANT_ID,
        name: facilityName,
        location:
          next.plants.find((p) => p.id === SITE_PLANT_ID)?.location ||
          facilityName,
        facilityType:
          next.plants.find((p) => p.id === SITE_PLANT_ID)?.facilityType ||
          "Power Plant"
      }
    ];
    const parentId = parentNodeId || SITE_PLANT_ID;

    if (createKind === "unit") {
      if (!unitName.trim()) {
        setError("Unit / Area name is required.");
        return;
      }
      const unit: EquipUnit = {
        id: uid("unit"),
        name: unitName.trim(),
        plantId: SITE_PLANT_ID
      };
      next.units.push(unit);
      saveEquipmentStore(next);
      refresh();
      setSelectedNodeId(unit.id);
      cancelForm();
      return;
    }

    if (createKind === "route") {
      if (!routeName.trim()) {
        setError("Route name is required.");
        return;
      }
      const parent = findNode(tree, parentId);
      const isPlant = !parent || parent.kind === "plant";
      const unit = next.units.find((u) => u.id === parentId);
      const route: EquipRoute = {
        id: uid("route"),
        name: routeName.trim(),
        location: unit?.name || facilityName,
        assets: [],
        plantId: SITE_PLANT_ID,
        unitId: isPlant ? undefined : parentId,
        collectionFrequency: routeFreq
      };
      next.routes.push(route);
      saveEquipmentStore(next);
      refresh();
      setSelectedNodeId(route.id);
      cancelForm();
      return;
    }

    if (createKind === "asset") {
      if (!assetName.trim()) {
        setError("Asset name is required.");
        return;
      }
      if (!assetTag.trim()) {
        setError("Tag ID is required.");
        return;
      }
      const parent = findNode(tree, parentId);
      let routeIdx = next.routes.findIndex((r) => r.id === parentId);
      if (routeIdx < 0 && parent?.kind === "plant") {
        ensureFacilityRoute(next, facilityName);
        routeIdx = next.routes.findIndex((r) => r.id === SITE_FACILITY_ROUTE_ID);
      }
      if (routeIdx < 0) {
        setError("Parent route not found. Select a route node and try again.");
        return;
      }
      const route = next.routes[routeIdx];
      const asset: EquipAsset = {
        id: uid("asset"),
        tag: assetTag.trim().toUpperCase(),
        name: assetName.trim(),
        location: route.location || facilityName,
        machineType,
        speedRpm: assetRpm ? Number(assetRpm) || undefined : undefined,
        status: "Normal",
        overallVibration: 1.0,
        photoUrl: formPhotoUrl || undefined,
        components: []
      };
      next.routes[routeIdx] = {
        ...route,
        assets: [...route.assets, asset]
      };
      saveEquipmentStore(next);
      refresh();
      setSelectedNodeId(asset.id);
      cancelForm();
      return;
    }

    if (createKind === "component") {
      if (!compName.trim()) {
        setError("Component name is required.");
        return;
      }
      if (
        compType === "Other (Custom / AI Spec Search)" &&
        !customEquipType.trim()
      ) {
        setError("Enter a custom equipment type.");
        return;
      }
      const kinematics: CbmKinematics | undefined = showSpecs
        ? {
            ...kin,
            customEquipmentType:
              compType === "Other (Custom / AI Spec Search)"
                ? customEquipType.trim()
                : kin.customEquipmentType
          }
        : undefined;
      const rpmNum = Number(kinematics?.ratedRpm || "");
      const comp: EquipComponent = {
        id: uid("comp"),
        name: compName.trim(),
        componentType: compType,
        bearingType: kinematics?.bearingDe || kinematics?.bearingNde,
        speedRpm: Number.isFinite(rpmNum) && rpmNum > 0 ? rpmNum : undefined,
        isoClass: kinematics?.isoClass,
        kinematics,
        photoUrl: formPhotoUrl || undefined,
        collectionPoints: []
      };

      const parent = findNode(tree, parentId);
      let found = false;

      if (parent?.kind === "plant" || parentId === SITE_PLANT_ID) {
        ensureFacilityHoldingAsset(next, facilityName);
        const routeIdx = next.routes.findIndex(
          (r) => r.id === SITE_FACILITY_ROUTE_ID
        );
        next.routes[routeIdx] = {
          ...next.routes[routeIdx],
          assets: next.routes[routeIdx].assets.map((a) =>
            a.id === SITE_FACILITY_HOLDING_ASSET_ID
              ? { ...a, components: [...a.components, comp] }
              : a
          )
        };
        found = true;
      } else {
        next.routes = next.routes.map((r) => ({
          ...r,
          assets: r.assets.map((a) => {
            if (a.id !== parentId) return a;
            found = true;
            return { ...a, components: [...a.components, comp] };
          })
        }));
      }

      if (!found) {
        setError("Parent asset not found. Select an asset node and try again.");
        return;
      }
      saveEquipmentStore(next);
      refresh();
      setSelectedNodeId(comp.id);
      cancelForm();
      return;
    }

    if (createKind === "point") {
      if (!pointName.trim()) {
        setError("Point name is required.");
        return;
      }
      const point: EquipCollectionPoint = {
        id: uid("pt"),
        name: pointName.trim(),
        orientation: pointOrient,
        measurementType: pointMeas
      };
      const parent = findNode(tree, parentId);
      let found = false;

      if (parent?.kind === "plant" || parentId === SITE_PLANT_ID) {
        ensureFacilityPointsHost(next, facilityName);
        const routeIdx = next.routes.findIndex(
          (r) => r.id === SITE_FACILITY_ROUTE_ID
        );
        next.routes[routeIdx] = {
          ...next.routes[routeIdx],
          assets: next.routes[routeIdx].assets.map((a) => {
            if (a.id !== SITE_FACILITY_HOLDING_ASSET_ID) return a;
            return {
              ...a,
              components: a.components.map((c) => {
                if (c.id !== SITE_FACILITY_POINTS_COMP_ID) return c;
                return {
                  ...c,
                  collectionPoints: [...(c.collectionPoints ?? []), point]
                };
              })
            };
          })
        };
        found = true;
      } else {
        next.routes = next.routes.map((r) => ({
          ...r,
          assets: r.assets.map((a) => ({
            ...a,
            components: a.components.map((c) => {
              if (c.id !== parentId) return c;
              found = true;
              return {
                ...c,
                collectionPoints: [...(c.collectionPoints ?? []), point]
              };
            })
          }))
        }));
      }

      if (!found) {
        setError(
          "Parent component not found. Select a component node and try again."
        );
        return;
      }
      saveEquipmentStore(next);
      refresh();
      setSelectedNodeId(point.id);
      cancelForm();
      return;
    }
  };

  const renderTreeNode = (node: ExplorerNode, depth: number) => {
    const hasKids = node.children.length > 0;
    const isOpen = expanded[node.id] ?? depth < 2;
    const selected = selectedNodeId === node.id;
    const canAddChild =
      CHILD_OF[node.kind] != null && node.kind !== "point";
    const isPinnedRoot = node.id === SITE_PLANT_ID;
    const canEdit = EDITABLE_KINDS.includes(node.kind);
    const indentPx = depth * 18 + 10;

    return (
      <div key={node.id} className="relative">
        {depth > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-slate-800/90"
            style={{ left: `${(depth - 1) * 18 + 18}px` }}
          />
        ) : null}
        <div
          className={`group flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 pl-1.5 transition-all border border-l-[3px] ${
            selected
              ? "bg-[#FFC700]/12 border-[#FFC700]/45 border-l-[#FFC700] shadow-[0_0_12px_rgba(255,199,0,0.18)]"
              : "border-transparent border-l-transparent hover:bg-slate-800/75 hover:border-l-[#FFC700]/55"
          }`}
          style={{ paddingLeft: `${indentPx}px` }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [node.id]: !isOpen }))
              }
              className="text-slate-500 hover:text-[#FFC700] cursor-pointer shrink-0 rounded-md p-0.5 transition-colors"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 shrink-0 flex items-center justify-center">
              <span className="h-1 w-1 rounded-full bg-slate-600" />
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedNodeId(node.id);
              setMode("idle");
              setError("");
            }}
            className={`flex-1 min-w-0 text-left text-xs cursor-pointer truncate flex items-center gap-1.5 ${
              selected
                ? "text-[#FFC700] font-bold"
                : isPinnedRoot
                  ? "text-slate-100 font-semibold"
                  : "text-slate-200 group-hover:text-slate-50"
            }`}
          >
            <span className="shrink-0" aria-hidden>
              {KIND_ICON[node.kind]}
            </span>
            <span className="truncate">{node.label}</span>
            {isPinnedRoot ? (
              <span className="ml-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
                Licensed Site
              </span>
            ) : null}
          </button>
          {canEdit ? (
            <button
              type="button"
              title={`Edit ${KIND_LABEL[node.kind]}`}
              onClick={(e) => {
                e.stopPropagation();
                beginEdit(node);
              }}
              className={`shrink-0 h-6 w-6 rounded-md border border-[#FFC700]/40 bg-[#FFC700]/10 text-[#FFC700] cursor-pointer hover:bg-[#FFC700]/25 hover:border-[#FFC700]/70 flex items-center justify-center transition-all ${
                selected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          {canAddChild && (
            <button
              type="button"
              title={`Add ${KIND_LABEL[CHILD_OF[node.kind]!]}`}
              onClick={(e) => {
                e.stopPropagation();
                beginCreateChild(node);
              }}
              className={`shrink-0 h-6 w-6 rounded-md border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-500/30 flex items-center justify-center transition-opacity ${
                selected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
            >
              +
            </button>
          )}
          {!isPinnedRoot ? (
            <button
              type="button"
              title={`Delete ${KIND_LABEL[node.kind]}`}
              onClick={(e) => {
                e.stopPropagation();
                requestDeleteNode(node);
              }}
              className={`shrink-0 h-6 w-6 rounded-md border border-red-800/60 bg-red-950/40 text-red-300 cursor-pointer hover:bg-red-900/60 flex items-center justify-center transition-opacity ${
                selected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        {hasKids && isOpen
          ? node.children.map((child) => renderTreeNode(child, depth + 1))
          : null}
      </div>
    );
  };

  const beginCreateChild = (node: ExplorerNode) => {
    const child = CHILD_OF[node.kind];
    if (!child) return;
    beginCreate(child, node);
  };

  const renderQuickAddToolbar = () => (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 shrink-0 mr-1">
          Quick Add Level:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_ADD_LEVELS.map((lvl) => {
            const active = mode === "create" && createKind === lvl.kind;
            return (
              <button
                key={lvl.kind}
                type="button"
                onClick={() => beginQuickAdd(lvl.kind)}
                className={active ? QUICK_ADD_BTN_ACTIVE : QUICK_ADD_BTN}
                title={`Add ${lvl.label} under current location`}
              >
                <span>{lvl.icon}</span>
                <span>{lvl.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap justify-end">
        <span
          className="hidden sm:block w-px h-6 bg-slate-700"
          aria-hidden
        />
        <button
          type="button"
          onClick={handleLoadDemo}
          className={`${QUICK_ADD_BTN} border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/15`}
        >
          <span>🧪</span>
          <span>Load Demo Data</span>
        </button>
        <button
          type="button"
          onClick={() => setConfirmResetOpen(true)}
          className="bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/80 rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
        >
          <span>🗑️</span>
          <span>Clear Database</span>
        </button>
      </div>
    </div>
  );

  /* ---- Right panel content ---- */
  const renderCreateForm = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-white">
          {mode === "edit" ? "Edit" : "Add"} {KIND_LABEL[createKind]}
        </h3>
        <button
          type="button"
          onClick={cancelForm}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-medium">
          {error}
        </div>
      ) : null}

      {createKind === "unit" && (
        <Field label="Unit / Area Name" required>
          <input
            className={INPUT}
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder='e.g. "Boiler House"'
          />
        </Field>
      )}

      {createKind === "route" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Route Name" required>
            <input
              className={INPUT}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Monthly Vibration Route 1"
            />
          </Field>
          <Field label="Collection Frequency">
            <select
              className={INPUT}
              value={routeFreq}
              onChange={(e) =>
                setRouteFreq(
                  e.target.value as NonNullable<EquipRoute["collectionFrequency"]>
                )
              }
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {createKind === "asset" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Asset Name" required>
              <input
                className={INPUT}
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="Boiler Feed Pump A"
              />
            </Field>
            <Field label="Tag ID" required>
              <input
                className={INPUT}
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="P-101A"
              />
            </Field>
            <Field label="Machine Type">
              <input
                className={INPUT}
                value={machineType}
                onChange={(e) => setMachineType(e.target.value)}
                placeholder="Pump"
              />
            </Field>
            <Field label="Speed (RPM)">
              <input
                className={INPUT}
                value={assetRpm}
                onChange={(e) => setAssetRpm(e.target.value)}
                placeholder="1780"
                inputMode="numeric"
              />
            </Field>
          </div>
          <EquipmentPhotoUploader
            photoUrl={formPhotoUrl}
            onChange={setFormPhotoUrl}
            busy={photoBusy}
            setBusy={setPhotoBusy}
            onError={setError}
          />
        </div>
      )}

      {createKind === "component" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Component Name" required>
              <input
                className={INPUT}
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="Motor DE"
              />
            </Field>
            <Field label="Component Type" required>
              <select
                className={INPUT}
                value={compType}
                onChange={(e) => {
                  setCompType(e.target.value as EquipComponentType);
                  setAiExtracted(false);
                  if (e.target.value !== "Other (Custom / AI Spec Search)") {
                    setCustomEquipType("");
                  }
                }}
              >
                {COMPONENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <EquipmentPhotoUploader
            photoUrl={formPhotoUrl}
            onChange={setFormPhotoUrl}
            busy={photoBusy}
            setBusy={setPhotoBusy}
            onError={setError}
          />

          {compType === "Other (Custom / AI Spec Search)" && (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/5 p-4 space-y-3">
              <Field label="Enter Custom Equipment Type" required>
                <input
                  className={INPUT}
                  value={customEquipType}
                  onChange={(e) => {
                    setCustomEquipType(e.target.value);
                    setAiExtracted(false);
                  }}
                  placeholder='e.g. "Decanter Centrifuge"'
                />
              </Field>
              <button
                type="button"
                onClick={runAiSpecSearch}
                disabled={aiSearching}
                className={BTN_CYAN}
              >
                {aiSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </>
                ) : (
                  <>⚡ AI Kinematic Spec Search</>
                )}
              </button>
              {aiSearching && (
                <p className="text-xs text-cyan-200/90 animate-pulse">
                  Searching global vibration library for kinematic parameters…
                </p>
              )}
              {aiExtracted && !aiSearching && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">
                  ✓ Kinematic Schema Extracted &amp; Saved to Cloud DB
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowSpecs((v) => !v)}
            className={`w-full min-h-[42px] px-3 rounded-xl text-left text-xs sm:text-sm font-bold cursor-pointer transition-all border ${
              showSpecs
                ? "bg-cyan-500/10 border-cyan-400/40 text-cyan-200"
                : "bg-slate-900/60 border-slate-800 text-slate-300"
            }`}
          >
            ⚙️ Advanced Kinematics &amp; Specs {showSpecs ? "▲" : "▼"}
          </button>

          {showSpecs && (
            <ComponentKinematicsSpecsForm
              value={kin}
              onChange={setKin}
              componentType={compType}
            />
          )}
        </div>
      )}

      {createKind === "point" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Point Name" required>
            <input
              className={INPUT}
              value={pointName}
              onChange={(e) => setPointName(e.target.value)}
              placeholder="1H - Motor DE Horiz"
            />
          </Field>
          <Field label="Orientation / Axis">
            <select
              className={INPUT}
              value={pointOrient}
              onChange={(e) =>
                setPointOrient(
                  e.target.value as EquipCollectionPoint["orientation"]
                )
              }
            >
              {(["Horizontal", "Vertical", "Axial", "Radial"] as const).map(
                (o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                )
              )}
            </select>
          </Field>
          <Field label="Measurement Type">
            <select
              className={INPUT}
              value={pointMeas}
              onChange={(e) =>
                setPointMeas(
                  e.target.value as EquipCollectionPoint["measurementType"]
                )
              }
            >
              {(["Vibration", "Temp", "Ultrasound"] as const).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
        <button type="button" onClick={cancelForm} className={BTN_GHOST}>
          Cancel
        </button>
        <button
          type="button"
          onClick={mode === "edit" ? handleUpdate : handleSave}
          className={BTN_PRIMARY}
        >
          {mode === "edit"
            ? `Save ${KIND_LABEL[createKind]} Changes`
            : `Save ${KIND_LABEL[createKind]}`}
        </button>
      </div>
    </div>
  );

  const selectedPhotoUrl = useMemo(() => {
    if (!selectedNode) return null;
    return lookupNodePhoto(store, selectedNode.id, selectedNode.kind);
  }, [store, selectedNode]);

  const saveSelectedPhoto = (photoUrl: string) => {
    if (!selectedNode) return;
    if (selectedNode.kind !== "asset" && selectedNode.kind !== "component") return;
    const next = patchNodePhoto(
      cloneStore(getEquipmentStore()),
      selectedNode.id,
      selectedNode.kind,
      photoUrl || undefined
    );
    saveEquipmentStore(next);
    refresh();
  };

  const renderIdleDetail = () => {
    if (!selectedNode) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
          <p className="text-slate-400 text-sm max-w-md leading-relaxed">
            Select a node in the Plant Hierarchy Explorer, or use{" "}
            <span className="text-cyan-300 font-semibold">+</span> on a node to
            add the next hierarchy level — no parent dropdowns required.
          </p>
        </div>
      );
    }

    const canAttachPhoto =
      selectedNode.kind === "asset" || selectedNode.kind === "component";

    const locationProfile = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {KIND_LABEL[selectedNode.kind]}
            </p>
            <h3 className="text-lg font-bold text-white mt-1">
              {KIND_ICON[selectedNode.kind]} {selectedNode.label}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {EDITABLE_KINDS.includes(selectedNode.kind) ? (
              <button
                type="button"
                onClick={() => beginEdit(selectedNode)}
                className="min-h-[40px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 hover:bg-[#FFC700]/20 text-[#FFC700] text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                Edit {KIND_LABEL[selectedNode.kind]}
              </button>
            ) : null}
            {CHILD_OF[selectedNode.kind] && (
              <button
                type="button"
                onClick={() => beginCreateChild(selectedNode)}
                className={BTN_CYAN}
              >
                <Plus className="h-4 w-4" />
                Add {KIND_LABEL[CHILD_OF[selectedNode.kind]!]}
              </button>
            )}
            {selectedNode.id !== SITE_PLANT_ID &&
            selectedNode.kind !== "plant" ? (
              <button
                type="button"
                onClick={() => requestDeleteNode(selectedNode)}
                className="min-h-[40px] px-3 rounded-xl border border-red-800/80 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete Node
              </button>
            ) : null}
          </div>
        </div>

        {canAttachPhoto && (
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-3">
            {!selectedPhotoUrl ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-5 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                <div className="h-14 w-14 rounded-lg border border-slate-700 bg-slate-950 flex items-center justify-center shrink-0">
                  <ImageIcon className="h-6 w-6 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-300 font-medium">
                    No equipment photo attached
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Add a machine or nameplate photo for field reference.
                  </p>
                </div>
              </div>
            ) : null}
            <EquipmentPhotoUploader
              photoUrl={selectedPhotoUrl || ""}
              onChange={saveSelectedPhoto}
              busy={photoBusy}
              setBusy={setPhotoBusy}
              onError={setError}
              onPreviewClick={setPhotoLightbox}
            />
            {error ? (
              <p className="text-xs text-red-300 font-medium">{error}</p>
            ) : null}
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300 space-y-2">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
            Path
          </p>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {withFacilityPrefix(selectedNode.path)
              .split(/\s*➔\s*/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((seg, i, arr) => (
                <React.Fragment key={`${seg}-${i}`}>
                  {i > 0 ? (
                    <ChevronRight
                      className="h-3.5 w-3.5 text-[#FFC700]/60 shrink-0"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={
                      i === arr.length - 1
                        ? "text-white font-semibold"
                        : "text-slate-400"
                    }
                  >
                    {seg}
                  </span>
                </React.Fragment>
              ))}
          </div>
          <p className="text-xs text-slate-500">
            {selectedNode.children.length} child node
            {selectedNode.children.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    );

    const maintenancePlan = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Multi-Tech Matrix
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              Equipment Maintenance Plan
            </h3>
          </div>
          <p className="text-[11px] text-slate-500">
            {KIND_ICON[selectedNode.kind]} {selectedNode.label}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50 shadow-[inset_0_1px_0_rgba(255,199,0,0.04)]">
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                {(
                  [
                    "Assessment Status",
                    "Technology",
                    "Manage",
                    "Data / Reports"
                  ] as const
                ).map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#FFC700]/90 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CBM_TECH_MATRIX.map((row) => (
                <tr
                  key={row.technology}
                  className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/50 transition-colors"
                >
                  <td className="px-3 py-2.5 align-middle">
                    {row.monitored && row.lastAssessment ? (
                      <a
                        href={row.reportUrl || "#"}
                        onClick={(e) => {
                          if (!row.reportUrl || row.reportUrl === "#") {
                            e.preventDefault();
                            toast(
                              `Opening latest ${row.technology} report…`,
                              "info"
                            );
                          }
                        }}
                        className="inline-flex items-center rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-colors"
                        title={`Latest ${row.technology} report`}
                      >
                        {row.lastAssessment}
                      </a>
                    ) : (
                      <span className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        Not Monitored
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span
                      className={
                        row.monitored
                          ? "text-slate-100 font-semibold"
                          : "text-slate-500 font-medium"
                      }
                    >
                      {row.technology}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() =>
                        toast(
                          row.monitored
                            ? `Manage ${row.technology} monitoring…`
                            : `Enable ${row.technology} monitoring…`,
                          "info"
                        )
                      }
                      className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors border ${
                        row.monitored
                          ? "border-[#FFC700]/40 bg-[#FFC700]/10 text-[#FFC700] hover:bg-[#FFC700]/20"
                          : "border-slate-700 bg-slate-900 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      {row.monitored ? "Manage" : "Enable"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    {row.monitored ? (
                      <button
                        type="button"
                        onClick={() =>
                          toast(
                            `Viewing ${row.technology} collection data / waveforms…`,
                            "info"
                          )
                        }
                        className="h-8 w-8 rounded-lg border border-slate-700 bg-slate-900 text-base leading-none cursor-pointer hover:border-[#FFC700]/50 hover:bg-[#FFC700]/10 transition-colors inline-flex items-center justify-center"
                        title="View raw collection data / waveforms"
                        aria-label={`View ${row.technology} collection data`}
                      >
                        ⏳
                      </button>
                    ) : (
                      <span className="text-slate-600 text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        <nav
          aria-label="Detail tabs"
          className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1"
        >
          {DETAIL_TABS.map((tab) => {
            const active = detailTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`min-h-[36px] px-3 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
                  active
                    ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50 shadow-[0_0_10px_rgba(255,199,0,0.15)]"
                    : "text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-800/70"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {detailTab === "Location Profile" ? (
          locationProfile
        ) : detailTab === "Equipment Maintenance Plan" ? (
          maintenancePlan
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-slate-200">{detailTab}</p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
              Content for this tab will appear here.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full min-h-[calc(100vh-8rem)] bg-[#0A0E1A] text-white rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-0">
        <div className="mb-3">
          <h2 className="text-base font-bold text-white tracking-tight">
            Equipment Database
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            CBM Plant Explorer — docked hierarchy &amp; kinematics editor
          </p>
        </div>
        {renderQuickAddToolbar()}
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 border-t border-slate-800">
        {/* LEFT — Tree */}
        <aside className="w-full md:w-[340px] md:max-w-[34%] shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-950/40 flex flex-col min-h-[280px] md:min-h-0">
          <div className="shrink-0 p-3 border-b border-slate-800 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Plant Hierarchy Explorer
            </p>
            <nav
              aria-label="Hierarchy breadcrumb"
              className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] leading-snug"
            >
              {breadcrumbSegments.map((seg, i) => (
                <React.Fragment key={`${seg}-${i}`}>
                  {i > 0 ? (
                    <ChevronRight
                      className="h-3 w-3 text-slate-600 shrink-0"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={
                      i === breadcrumbSegments.length - 1
                        ? "text-[#FFC700] font-semibold"
                        : "text-slate-400"
                    }
                  >
                    {seg}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 pl-1">
            {empty ? (
              <div className="space-y-2">
                {siteRoot ? renderTreeNode(siteRoot, 0) : null}
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Facility empty. Use Quick Add Level above to begin.
                  </p>
                </div>
              </div>
            ) : (
              tree.map((node) => renderTreeNode(node, 0))
            )}
          </div>
        </aside>

        {/* RIGHT — Contextual panel */}
        <section className="flex-1 min-w-0 flex flex-col bg-[#0A0E1A]">
          <div className="shrink-0 px-4 py-3 border-b border-slate-800 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Contextual Details &amp; Kinematics Editor
            </p>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 px-3 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                  Location Context
                </p>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                  {breadcrumbSegments.map((seg, i) => (
                    <React.Fragment key={`ctx-${seg}-${i}`}>
                      {i > 0 ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 text-[#FFC700]/70 shrink-0"
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={
                          i === breadcrumbSegments.length - 1
                            ? "text-white font-semibold"
                            : "text-slate-400"
                        }
                      >
                        {seg}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              {selectedNode &&
              (selectedNode.kind === "asset" ||
                selectedNode.kind === "component") ? (
                selectedPhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setPhotoLightbox(selectedPhotoUrl)}
                    className="shrink-0 w-14 h-14 rounded-lg border-2 border-amber-400/70 overflow-hidden cursor-pointer hover:border-amber-300 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                    title="View equipment photo"
                  >
                    <img
                      src={selectedPhotoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div
                    className="shrink-0 w-14 h-14 rounded-lg border border-dashed border-slate-600 bg-slate-950/60 flex items-center justify-center"
                    title="No equipment photo attached"
                  >
                    <Camera className="h-5 w-5 text-slate-600" />
                  </div>
                )
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {empty && mode !== "create" && mode !== "edit" ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                  Your licensed site{" "}
                  <span className="text-white font-semibold">
                    [{facilityName}]
                  </span>{" "}
                  is ready. Choose a level from{" "}
                  <span className="text-slate-200 font-medium">
                    Quick Add Level
                  </span>{" "}
                  above to start building under the facility.
                </p>
              </div>
            ) : mode === "create" || mode === "edit" ? (
              renderCreateForm()
            ) : (
              renderIdleDetail()
            )}
          </div>
        </section>
      </div>

      {photoLightbox ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPhotoLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Equipment photo"
        >
          <button
            type="button"
            onClick={() => setPhotoLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 cursor-pointer hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={photoLightbox}
            alt="Equipment full size"
            className="max-w-full max-h-[85vh] rounded-xl border border-amber-400/40 object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {confirmResetOpen ? (
        <div
          className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-db-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0A0E1A] shadow-2xl p-5 space-y-4">
            <div>
              <h3
                id="reset-db-title"
                className="text-base font-bold text-white tracking-tight"
              >
                Reset Equipment Database?
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                This action will clear all Units, Routes, Assets, Components, and
                Collection Points from your tree. You will be left with a clean,
                licensed facility root.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className={BTN_GHOST}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="min-h-[40px] px-4 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-200 border border-red-700/80 text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <span>🗑️</span>
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-node-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0A0E1A] shadow-2xl p-5 space-y-4">
            <div>
              <h3
                id="delete-node-title"
                className="text-base font-bold text-white tracking-tight"
              >
                Delete &quot;{deleteTarget.label}&quot;?
              </h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                This action cannot be undone and will delete this{" "}
                {KIND_LABEL[deleteTarget.kind]} along with all of its child
                items.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={BTN_GHOST}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[40px] px-4 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-200 border border-red-700/80 text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
