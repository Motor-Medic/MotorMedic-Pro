import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
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
  type ComponentKinematics,
  type CouplingType,
  type EquipAsset,
  type EquipCollectionPoint,
  type EquipComponent,
  type EquipComponentType,
  type EquipRoute,
  type EquipUnit,
  type EquipmentStore
} from "../data/equipmentDb";
import { useToast } from "./Toast";

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
type KinSubTab = "limits" | "faults" | "bearings";

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

const MOTOR_POLES: NonNullable<ComponentKinematics["motorPoles"]>[] = [
  "2",
  "4",
  "6",
  "8",
  "10",
  "12"
];

const COUPLING_TYPES: CouplingType[] = [
  "Flexible Grid",
  "Gear",
  "Disc",
  "Direct Rigid",
  "Belt"
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

const KIN_TABS: { id: KinSubTab; label: string }[] = [
  { id: "limits", label: "⚡ Operating Limits" },
  { id: "faults", label: "🎯 Kinematics & Faults" },
  { id: "bearings", label: "🧱 Bearings & Coupling" }
];

const DEFAULT_KIN: ComponentKinematics = {
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

function aiExtractSchema(customType: string): ComponentKinematics {
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
  const [kinTab, setKinTab] = useState<KinSubTab>("limits");
  const [kin, setKin] = useState<ComponentKinematics>({ ...DEFAULT_KIN });
  const [aiSearching, setAiSearching] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const aiTimerRef = useRef<number | null>(null);

  const [pointName, setPointName] = useState("");
  const [pointOrient, setPointOrient] =
    useState<EquipCollectionPoint["orientation"]>("Horizontal");
  const [pointMeas, setPointMeas] =
    useState<EquipCollectionPoint["measurementType"]>("Vibration");

  const patchKin = <K extends keyof ComponentKinematics>(
    key: K,
    value: ComponentKinematics[K]
  ) => setKin((prev) => ({ ...prev, [key]: value }));

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
    setKinTab("limits");
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
      setKinTab("faults");
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
      const kinematics: ComponentKinematics | undefined = showSpecs
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

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 rounded-lg px-1.5 py-1.5 transition-colors border ${
            selected
              ? "bg-[#FFC700]/15 border-[#FFC700]/50 shadow-[0_0_12px_rgba(255,199,0,0.2)]"
              : "border-transparent hover:bg-slate-800/70"
          }`}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [node.id]: !isOpen }))
              }
              className="text-slate-500 hover:text-slate-300 cursor-pointer shrink-0"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedNodeId(node.id);
              setMode("idle");
              setError("");
            }}
            className={`flex-1 min-w-0 text-left text-xs cursor-pointer truncate ${
              selected
                ? "text-[#FFC700] font-bold"
                : isPinnedRoot
                  ? "text-slate-100 font-semibold"
                  : "text-slate-200"
            }`}
          >
            <span className="mr-1">{KIND_ICON[node.kind]}</span>
            {node.label}
            {isPinnedRoot ? (
              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Licensed Site
              </span>
            ) : null}
          </button>
          {canAddChild && (
            <button
              type="button"
              title={`Add ${KIND_LABEL[CHILD_OF[node.kind]!]}`}
              onClick={(e) => {
                e.stopPropagation();
                beginCreateChild(node);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-6 w-6 rounded-md border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-500/30 flex items-center justify-center"
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
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-6 w-6 rounded-md border border-red-800/60 bg-red-950/40 text-red-300 cursor-pointer hover:bg-red-900/60 flex items-center justify-center"
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
          Add {KIND_LABEL[createKind]}
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
            <div className="rounded-lg border border-slate-800 bg-[#0A0E1A] p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {KIN_TABS.map((tab) => {
                  const on = kinTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setKinTab(tab.id)}
                      className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        on
                          ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50"
                          : "bg-slate-900 text-slate-400 border border-slate-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                key={kinTab}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-[fadeIn_0.2s_ease]"
              >
                {kinTab === "limits" && (
                  <>
                    <Field label="HP / kW Rating">
                      <input
                        className={INPUT}
                        value={kin.motorHpKw ?? ""}
                        onChange={(e) => patchKin("motorHpKw", e.target.value)}
                        placeholder="150 / 112"
                      />
                    </Field>
                    <Field label="Rated RPM">
                      <input
                        className={INPUT}
                        value={kin.ratedRpm ?? ""}
                        onChange={(e) => patchKin("ratedRpm", e.target.value)}
                        placeholder="1780"
                      />
                    </Field>
                    <Field label="Min Operating Speed (VFD)">
                      <input
                        className={INPUT}
                        value={kin.minOperatingRpm ?? ""}
                        onChange={(e) =>
                          patchKin("minOperatingRpm", e.target.value)
                        }
                        placeholder="600"
                      />
                    </Field>
                    <Field label="Max Operating Speed (VFD)">
                      <input
                        className={INPUT}
                        value={kin.maxOperatingRpm ?? ""}
                        onChange={(e) =>
                          patchKin("maxOperatingRpm", e.target.value)
                        }
                        placeholder="3600"
                      />
                    </Field>
                    <Field label="Line Frequency">
                      <div className="min-h-[40px] flex rounded-xl border border-slate-700 overflow-hidden">
                        {(["50Hz", "60Hz"] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => patchKin("lineFrequency", f)}
                            className={`flex-1 text-sm font-bold cursor-pointer ${
                              kin.lineFrequency === f
                                ? "bg-[#FFC700]/20 text-[#FFC700]"
                                : "bg-slate-900 text-slate-400"
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                )}

                {kinTab === "faults" && (
                  <>
                    {compType === "Electric Motor (AC / DC / VFD)" && (
                      <>
                        <Field label="Motor Poles">
                          <select
                            className={INPUT}
                            value={kin.motorPoles ?? "4"}
                            onChange={(e) =>
                              patchKin(
                                "motorPoles",
                                e.target.value as NonNullable<
                                  ComponentKinematics["motorPoles"]
                                >
                              )
                            }
                          >
                            {MOTOR_POLES.map((p) => (
                              <option key={p} value={p}>
                                {p}-Pole
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Rotor Bars">
                          <input
                            className={INPUT}
                            value={kin.rotorBars ?? ""}
                            onChange={(e) => patchKin("rotorBars", e.target.value)}
                            placeholder="48, 58"
                          />
                        </Field>
                        <Field label="Stator Slots">
                          <input
                            className={INPUT}
                            value={kin.statorSlots ?? ""}
                            onChange={(e) =>
                              patchKin("statorSlots", e.target.value)
                            }
                            placeholder="72"
                          />
                        </Field>
                      </>
                    )}
                    {(compType === "Centrifugal Pump" ||
                      compType === "Positive Displacement / Gear Pump") && (
                      <>
                        <Field label="Impeller Vane Count">
                          <input
                            className={INPUT}
                            value={kin.impellerVanes ?? ""}
                            onChange={(e) =>
                              patchKin("impellerVanes", e.target.value)
                            }
                            placeholder="5, 7"
                          />
                        </Field>
                        <Field label="Pump Stages">
                          <input
                            className={INPUT}
                            value={kin.pumpStages ?? ""}
                            onChange={(e) =>
                              patchKin("pumpStages", e.target.value)
                            }
                            placeholder="1"
                          />
                        </Field>
                        <Field label="Volute Clearance">
                          <input
                            className={INPUT}
                            value={kin.voluteClearance ?? ""}
                            onChange={(e) =>
                              patchKin("voluteClearance", e.target.value)
                            }
                            placeholder="0.015 in"
                          />
                        </Field>
                      </>
                    )}
                    {compType === "Gearbox / Speed Reducer" && (
                      <>
                        <Field label="Stage 1 Pinion (Z1)">
                          <input
                            className={INPUT}
                            value={kin.gearTeethZ1 ?? ""}
                            onChange={(e) =>
                              patchKin("gearTeethZ1", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Stage 1 Gear (Z2)">
                          <input
                            className={INPUT}
                            value={kin.gearTeethZ2 ?? ""}
                            onChange={(e) =>
                              patchKin("gearTeethZ2", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Stage 2 Pinion (Z3)">
                          <input
                            className={INPUT}
                            value={kin.gearTeethZ3 ?? ""}
                            onChange={(e) =>
                              patchKin("gearTeethZ3", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Stage 2 Gear (Z4)">
                          <input
                            className={INPUT}
                            value={kin.gearTeethZ4 ?? ""}
                            onChange={(e) =>
                              patchKin("gearTeethZ4", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Overall Ratio">
                          <input
                            className={INPUT}
                            value={kin.gearboxRatio ?? ""}
                            onChange={(e) =>
                              patchKin("gearboxRatio", e.target.value)
                            }
                            placeholder="14.6:1"
                          />
                        </Field>
                      </>
                    )}
                    {compType === "Fan / Blower (Centrifugal / Axial)" && (
                      <>
                        <Field label="Fan Blade Count">
                          <input
                            className={INPUT}
                            value={kin.fanBladeCount ?? ""}
                            onChange={(e) =>
                              patchKin("fanBladeCount", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Drive Type">
                          <select
                            className={INPUT}
                            value={kin.driveArrangement ?? "Direct Drive"}
                            onChange={(e) =>
                              patchKin(
                                "driveArrangement",
                                e.target.value as NonNullable<
                                  ComponentKinematics["driveArrangement"]
                                >
                              )
                            }
                          >
                            <option value="Direct Drive">Direct Drive</option>
                            <option value="Belt Drive">Belt Drive</option>
                          </select>
                        </Field>
                        <Field label="Motor Sheave Ø (D1)">
                          <input
                            className={INPUT}
                            value={kin.motorSheaveDia ?? ""}
                            onChange={(e) =>
                              patchKin("motorSheaveDia", e.target.value)
                            }
                            disabled={kin.driveArrangement !== "Belt Drive"}
                          />
                        </Field>
                        <Field label="Fan Sheave Ø (D2)">
                          <input
                            className={INPUT}
                            value={kin.fanSheaveDia ?? ""}
                            onChange={(e) =>
                              patchKin("fanSheaveDia", e.target.value)
                            }
                            disabled={kin.driveArrangement !== "Belt Drive"}
                          />
                        </Field>
                      </>
                    )}
                    {compType === "Screw / Reciprocating Compressor" && (
                      <>
                        <Field label="Male Lobe Count">
                          <input
                            className={INPUT}
                            value={kin.maleLobeCount ?? ""}
                            onChange={(e) =>
                              patchKin("maleLobeCount", e.target.value)
                            }
                            placeholder="4"
                          />
                        </Field>
                        <Field label="Female Lobe Count">
                          <input
                            className={INPUT}
                            value={kin.femaleLobeCount ?? ""}
                            onChange={(e) =>
                              patchKin("femaleLobeCount", e.target.value)
                            }
                            placeholder="6"
                          />
                        </Field>
                      </>
                    )}
                    {(compType === "Machine Tool Spindle" ||
                      compType === "Other (Custom / AI Spec Search)") && (
                      <>
                        <Field label="Custom / Spindle Class">
                          <input
                            className={INPUT}
                            value={
                              kin.spindleClass ?? kin.customEquipmentType ?? ""
                            }
                            onChange={(e) => {
                              patchKin("spindleClass", e.target.value);
                              patchKin("customEquipmentType", e.target.value);
                            }}
                          />
                        </Field>
                        <Field label="Max RPM">
                          <input
                            className={INPUT}
                            value={kin.maxOperatingRpm ?? ""}
                            onChange={(e) =>
                              patchKin("maxOperatingRpm", e.target.value)
                            }
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}

                {kinTab === "bearings" && (
                  <>
                    <Field label="DE Bearing Part #">
                      <input
                        className={INPUT}
                        value={kin.bearingDe ?? ""}
                        onChange={(e) => patchKin("bearingDe", e.target.value)}
                        placeholder="SKF 6320 C3"
                      />
                    </Field>
                    <Field label="NDE Bearing Part #">
                      <input
                        className={INPUT}
                        value={kin.bearingNde ?? ""}
                        onChange={(e) => patchKin("bearingNde", e.target.value)}
                        placeholder="SKF 6215 C3"
                      />
                    </Field>
                    <Field label="Thrust Bearing Part #">
                      <input
                        className={INPUT}
                        value={kin.thrustBearing ?? ""}
                        onChange={(e) =>
                          patchKin("thrustBearing", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Coupling Type">
                      <select
                        className={INPUT}
                        value={kin.couplingType ?? "Flexible Grid"}
                        onChange={(e) =>
                          patchKin(
                            "couplingType",
                            e.target.value as CouplingType
                          )
                        }
                      >
                        {COUPLING_TYPES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </div>
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
        <button type="button" onClick={handleSave} className={BTN_PRIMARY}>
          Save {KIND_LABEL[createKind]}
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

    return (
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
          <p>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Path
            </span>
            <br />
            {withFacilityPrefix(selectedNode.path).replace(/➔/g, " ➔ ")}
          </p>
          <p className="text-xs text-slate-500">
            {selectedNode.children.length} child node
            {selectedNode.children.length === 1 ? "" : "s"}
          </p>
        </div>
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
        <aside className="w-full md:w-[320px] md:max-w-[30%] shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/40 flex flex-col min-h-[280px] md:min-h-0">
          <div className="shrink-0 p-3 border-b border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Plant Hierarchy Explorer
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
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
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-cyan-50 break-words">
                  <span className="mr-1.5">📍</span>
                  <span className="font-bold text-cyan-200">Location Context:</span>{" "}
                  <span className="text-white font-medium">
                    {contextPath.replace(/➔/g, " ➔ ")}
                  </span>
                </p>
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
            {empty && mode !== "create" ? (
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
            ) : mode === "create" ? (
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
