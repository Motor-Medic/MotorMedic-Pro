import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Maximize2,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  Replace,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wrench,
  X,
  Zap
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

type ExceptionSeverity = "Critical" | "Warning" | "Normal";
type DiagnosticTech = "Vibration" | "IR" | "Ultrasound" | "MCA" | "Oil";

type CbmExceptionRow = {
  id: string;
  location: string;
  dateLogged: string;
  tech: DiagnosticTech;
  severity: ExceptionSeverity;
  faultDescription: string;
  actionRequired: string;
};

type FeedbackEntry = {
  id: string;
  location: string;
  dateCreated: string;
  comment: string;
  acknowledged: boolean;
  workOrderId: string;
  hasImage: boolean;
  conditionUpdate?: string;
};

const SEVERITY_STYLES: Record<
  ExceptionSeverity,
  { badge: string; label: string }
> = {
  Critical: {
    badge:
      "border-red-500/50 bg-red-500/15 text-red-300",
    label: "Critical"
  },
  Warning: {
    badge:
      "border-amber-400/50 bg-amber-400/15 text-amber-300",
    label: "Warning"
  },
  Normal: {
    badge:
      "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
    label: "Normal"
  }
};

function severityBadge(severity: ExceptionSeverity) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

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

/** Nameplate photo persisted alongside equipment photo (extra store field). */
type WithNameplatePhoto = { nameplatePhotoUrl?: string };

type MasterHubSpecs = {
  motorHpKw: string;
  ratedRpm: string;
  frameSize: string;
  voltage: string;
  fla: string;
  operationalDuty: string;
  driveType: "Direct" | "Belt" | "Gearbox";
  bearingDe: string;
  bearingNde: string;
  pulleyOrTooth: string;
  activeTechs: string;
  fmaxLor: string;
  sensorMount: string;
  measurementInterval: string;
};

/** Extended kinematics keys used by the Location Profile master hub. */
type MasterKinExtras = CbmKinematics & {
  frameSize?: string;
  voltage?: string;
  fla?: string;
  operationalDuty?: string;
  driveType?: "Direct" | "Belt" | "Gearbox";
  pulleyOrTooth?: string;
  activeTechs?: string;
  fmaxLor?: string;
  sensorMount?: string;
  measurementInterval?: string;
};

const DEFAULT_MASTER_SPECS: MasterHubSpecs = {
  motorHpKw: "100 HP / 75 kW",
  ratedRpm: "1780 RPM",
  frameSize: "445T",
  voltage: "460 V",
  fla: "124 A FLA",
  operationalDuty: "Continuous (S1)",
  driveType: "Direct",
  bearingDe: "6314-C3",
  bearingNde: "6212-C3",
  pulleyOrTooth: "1.0 : 1 Direct",
  activeTechs: "Vibration · IR · Ultrasound · MCA",
  fmaxLor: "2000 Hz / 3200 LoR",
  sensorMount: "Stud Mount",
  measurementInterval: "Monthly"
};

type DemoProfilePreset = {
  match: (hay: string) => boolean;
  label: string;
  specs: MasterHubSpecs;
};

/** Spec presets for known demo / showcase equipment (no stock photos). */
const DEMO_PROFILE_PRESETS: DemoProfilePreset[] = [
  {
    label: "PMP030 — Sulfuric Acid Pump",
    match: (hay) =>
      hay.includes("pmp030") ||
      hay.includes("sulfuric") ||
      (hay.includes("acid") && hay.includes("pump")),
    specs: {
      motorHpKw: "75 HP / 55 kW",
      ratedRpm: "1785 RPM",
      frameSize: "365T",
      voltage: "460 V",
      fla: "92 A FLA",
      operationalDuty: "Continuous (S1) — Acid Service",
      driveType: "Direct",
      bearingDe: "6314-C3",
      bearingNde: "6212-C3",
      pulleyOrTooth: "1.0 : 1 Coupling",
      activeTechs: "Vibration · IR · Ultrasound",
      fmaxLor: "2000 Hz / 3200 LoR",
      sensorMount: "Stud Mount",
      measurementInterval: "Bi-Weekly"
    }
  },
  {
    label: "FAN001 — Dryer Scrubber Blower",
    match: (hay) =>
      hay.includes("fan001") ||
      hay.includes("scrubber") ||
      (hay.includes("dryer") && hay.includes("blower")),
    specs: {
      motorHpKw: "40 HP / 30 kW",
      ratedRpm: "1180 RPM",
      frameSize: "324T",
      voltage: "460 V",
      fla: "52 A FLA",
      operationalDuty: "Continuous (S1) — Process Air",
      driveType: "Belt",
      bearingDe: "6309-C3",
      bearingNde: "6308-C3",
      pulleyOrTooth: "2.4 : 1 Sheave",
      activeTechs: "Vibration · Ultrasound · Temperature",
      fmaxLor: "1000 Hz / 1600 LoR",
      sensorMount: "Magnet Mount",
      measurementInterval: "Monthly"
    }
  },
  {
    label: "Boiler Feed / Process Pump",
    match: (hay) =>
      hay.includes("p-101") ||
      hay.includes("p-402") ||
      hay.includes("boiler feed") ||
      hay.includes("slurry") ||
      hay.includes("pump"),
    specs: {
      motorHpKw: "100 HP / 75 kW",
      ratedRpm: "1780 RPM",
      frameSize: "445T",
      voltage: "460 V",
      fla: "124 A FLA",
      operationalDuty: "Continuous (S1)",
      driveType: "Direct",
      bearingDe: "6314-C3",
      bearingNde: "6212-C3",
      pulleyOrTooth: "1.0 : 1 Direct",
      activeTechs: "Vibration · IR · Ultrasound · MCA",
      fmaxLor: "2000 Hz / 3200 LoR",
      sensorMount: "Stud Mount",
      measurementInterval: "Monthly"
    }
  },
  {
    label: "Cooling / Process Fan",
    match: (hay) =>
      hay.includes("fn-04") ||
      hay.includes("fan") ||
      hay.includes("blower") ||
      hay.includes("cooling tower"),
    specs: {
      motorHpKw: "50 HP / 37 kW",
      ratedRpm: "1185 RPM",
      frameSize: "365T",
      voltage: "460 V",
      fla: "65 A FLA",
      operationalDuty: "Continuous (S1)",
      driveType: "Belt",
      bearingDe: "6311-C3",
      bearingNde: "6309-C3",
      pulleyOrTooth: "2.1 : 1 Sheave",
      activeTechs: "Vibration · Ultrasound · Temperature",
      fmaxLor: "1000 Hz / 1600 LoR",
      sensorMount: "Magnet Mount",
      measurementInterval: "Monthly"
    }
  },
  {
    label: "Induction / Drive Motor",
    match: (hay) =>
      hay.includes("m-101") ||
      hay.includes("m-210") ||
      hay.includes("motor") ||
      hay.includes("induction"),
    specs: {
      motorHpKw: "150 HP / 112 kW",
      ratedRpm: "1785 RPM",
      frameSize: "445TS",
      voltage: "460 V",
      fla: "180 A FLA",
      operationalDuty: "Continuous (S1)",
      driveType: "Direct",
      bearingDe: "6320-C3",
      bearingNde: "6318-C3",
      pulleyOrTooth: "1.0 : 1 Coupling",
      activeTechs: "Vibration · MCA · IR",
      fmaxLor: "2000 Hz / 6400 LoR",
      sensorMount: "Stud Mount",
      measurementInterval: "Weekly"
    }
  },
  {
    label: "Gearbox Drive",
    match: (hay) =>
      hay.includes("gb-") || hay.includes("gearbox") || hay.includes("gear"),
    specs: {
      motorHpKw: "60 HP / 45 kW",
      ratedRpm: "1750 RPM",
      frameSize: "364T",
      voltage: "460 V",
      fla: "77 A FLA",
      operationalDuty: "Continuous (S1)",
      driveType: "Gearbox",
      bearingDe: "22316-E",
      bearingNde: "22314-E",
      pulleyOrTooth: "12.5 : 1 / 87 T",
      activeTechs: "Vibration · Oil · Ultrasound",
      fmaxLor: "2000 Hz / 3200 LoR",
      sensorMount: "Stud Mount",
      measurementInterval: "Monthly"
    }
  }
];

/** Only user-uploaded images (data URLs). Strips stock/remote demo photos. */
function userUploadedPhotoUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:image")) return url;
  // Block Unsplash / remote stock placeholders from Location Profile
  if (/^https?:\/\//i.test(url)) return "";
  return url;
}

function nodeDemoHaystack(
  store: EquipmentStore,
  node: ExplorerNode
): string {
  const entity = lookupEditableEntity(store, node);
  if (node.kind === "asset" && entity.asset) {
    return `${entity.asset.tag} ${entity.asset.name} ${entity.asset.machineType || ""} ${node.label}`.toLowerCase();
  }
  if (node.kind === "component" && entity.component) {
    let assetTag = "";
    for (const route of store.routes) {
      for (const asset of route.assets) {
        if (asset.components.some((c) => c.id === entity.component!.id)) {
          assetTag = `${asset.tag} ${asset.name}`;
        }
      }
    }
    return `${assetTag} ${entity.component.name} ${entity.component.componentType || ""} ${node.label}`.toLowerCase();
  }
  return `${node.label} ${node.path}`.toLowerCase();
}

function lookupDemoProfile(
  store: EquipmentStore,
  node: ExplorerNode
): DemoProfilePreset | null {
  if (node.kind !== "asset" && node.kind !== "component") return null;
  const hay = nodeDemoHaystack(store, node);
  return DEMO_PROFILE_PRESETS.find((p) => p.match(hay)) || null;
}

function lookupNameplatePhoto(
  store: EquipmentStore,
  nodeId: string,
  kind: ExplorerKind
): string | null {
  if (kind !== "asset" && kind !== "component") return null;
  for (const route of store.routes) {
    for (const asset of route.assets) {
      if (kind === "asset" && asset.id === nodeId) {
        return (asset as EquipAsset & WithNameplatePhoto).nameplatePhotoUrl || null;
      }
      if (kind === "component") {
        const comp = asset.components.find((c) => c.id === nodeId);
        if (comp) {
          return (
            (comp as EquipComponent & WithNameplatePhoto).nameplatePhotoUrl ||
            null
          );
        }
      }
    }
  }
  return null;
}

function patchNameplatePhoto(
  store: EquipmentStore,
  nodeId: string,
  kind: "asset" | "component",
  nameplatePhotoUrl: string | undefined
): EquipmentStore {
  return {
    ...store,
    routes: store.routes.map((r) => ({
      ...r,
      assets: r.assets.map((a) => {
        if (kind === "asset" && a.id === nodeId) {
          return { ...a, nameplatePhotoUrl } as EquipAsset & WithNameplatePhoto;
        }
        if (kind === "component") {
          return {
            ...a,
            components: a.components.map((c) =>
              c.id === nodeId
                ? ({ ...c, nameplatePhotoUrl } as EquipComponent &
                    WithNameplatePhoto)
                : c
            )
          };
        }
        return a;
      })
    }))
  };
}

function driveArrangementToType(
  arr?: string
): MasterHubSpecs["driveType"] {
  if (!arr) return "Direct";
  const lower = arr.toLowerCase();
  if (lower.includes("belt")) return "Belt";
  if (lower.includes("gear")) return "Gearbox";
  return "Direct";
}

function masterSpecsFromKin(
  kin: MasterKinExtras | undefined,
  fallbackRpm?: string | number | null,
  fallbackBearing?: string | null,
  base: MasterHubSpecs = DEFAULT_MASTER_SPECS
): MasterHubSpecs {
  const rpm =
    kin?.ratedRpm?.trim() ||
    (fallbackRpm != null && String(fallbackRpm).trim()
      ? String(fallbackRpm).includes("RPM")
        ? String(fallbackRpm)
        : `${fallbackRpm} RPM`
      : "") ||
    base.ratedRpm;
  const pulley =
    kin?.pulleyOrTooth?.trim() ||
    kin?.gearboxRatio?.trim() ||
    (kin?.gearTeethZ1 && kin?.gearTeethZ2
      ? `${kin.gearTeethZ1} / ${kin.gearTeethZ2} T`
      : "") ||
    (kin?.motorSheaveDia && kin?.fanSheaveDia
      ? `${kin.motorSheaveDia} / ${kin.fanSheaveDia} in`
      : "") ||
    base.pulleyOrTooth;
  return {
    motorHpKw: kin?.motorHpKw?.trim() || base.motorHpKw,
    ratedRpm: rpm,
    frameSize: kin?.frameSize?.trim() || base.frameSize,
    voltage: kin?.voltage?.trim() || base.voltage,
    fla: kin?.fla?.trim() || base.fla,
    operationalDuty: kin?.operationalDuty?.trim() || base.operationalDuty,
    driveType:
      kin?.driveType ||
      (kin?.driveArrangement
        ? driveArrangementToType(kin.driveArrangement)
        : base.driveType),
    bearingDe:
      kin?.bearingDe?.trim() ||
      fallbackBearing?.trim() ||
      base.bearingDe,
    bearingNde: kin?.bearingNde?.trim() || base.bearingNde,
    pulleyOrTooth: pulley,
    activeTechs: kin?.activeTechs?.trim() || base.activeTechs,
    fmaxLor: kin?.fmaxLor?.trim() || base.fmaxLor,
    sensorMount: kin?.sensorMount?.trim() || base.sensorMount,
    measurementInterval:
      kin?.measurementInterval?.trim() || base.measurementInterval
  };
}

function resolveMasterSpecsTarget(
  store: EquipmentStore,
  node: ExplorerNode
): {
  kind: "asset" | "component";
  id: string;
  kin: MasterKinExtras | undefined;
  speedRpm?: number;
  bearingType?: string;
} | null {
  const entity = lookupEditableEntity(store, node);
  if (node.kind === "component" && entity.component) {
    return {
      kind: "component",
      id: entity.component.id,
      kin: entity.component.kinematics as MasterKinExtras | undefined,
      speedRpm: entity.component.speedRpm,
      bearingType: entity.component.bearingType
    };
  }
  if (node.kind === "asset" && entity.asset) {
    const preferred =
      entity.asset.components.find((c) =>
        (c.componentType || "").toLowerCase().includes("motor")
      ) || entity.asset.components[0];
    if (preferred) {
      return {
        kind: "component",
        id: preferred.id,
        kin: preferred.kinematics as MasterKinExtras | undefined,
        speedRpm: preferred.speedRpm ?? entity.asset.speedRpm,
        bearingType: preferred.bearingType || entity.asset.bearingType
      };
    }
    return {
      kind: "asset",
      id: entity.asset.id,
      kin: (entity.asset as EquipAsset & { masterHubSpecs?: MasterKinExtras })
        .masterHubSpecs,
      speedRpm: entity.asset.speedRpm,
      bearingType: entity.asset.bearingType
    };
  }
  return null;
}

function patchMasterSpecs(
  store: EquipmentStore,
  targetKind: "asset" | "component",
  targetId: string,
  specs: MasterHubSpecs
): EquipmentStore {
  const driveArrangement: MasterKinExtras["driveArrangement"] =
    specs.driveType === "Belt"
      ? "Belt Drive"
      : specs.driveType === "Direct"
        ? "Direct Drive"
        : undefined;
  const kinPatch: MasterKinExtras = {
    motorHpKw: specs.motorHpKw,
    ratedRpm: specs.ratedRpm,
    frameSize: specs.frameSize,
    voltage: specs.voltage,
    fla: specs.fla,
    operationalDuty: specs.operationalDuty,
    driveType: specs.driveType,
    driveArrangement,
    bearingDe: specs.bearingDe,
    bearingNde: specs.bearingNde,
    pulleyOrTooth: specs.pulleyOrTooth,
    gearboxRatio:
      specs.driveType === "Gearbox" ? specs.pulleyOrTooth : undefined,
    activeTechs: specs.activeTechs,
    fmaxLor: specs.fmaxLor,
    sensorMount: specs.sensorMount,
    measurementInterval: specs.measurementInterval
  };
  const rpmNum = Number(specs.ratedRpm);
  return {
    ...store,
    routes: store.routes.map((r) => ({
      ...r,
      assets: r.assets.map((a) => {
        if (targetKind === "asset" && a.id === targetId) {
          return {
            ...a,
            speedRpm: Number.isFinite(rpmNum) ? rpmNum : a.speedRpm,
            bearingType: specs.bearingDe || a.bearingType,
            masterHubSpecs: kinPatch
          } as EquipAsset & { masterHubSpecs?: MasterKinExtras };
        }
        if (targetKind === "component") {
          return {
            ...a,
            components: a.components.map((c) => {
              if (c.id !== targetId) return c;
              return {
                ...c,
                speedRpm: Number.isFinite(rpmNum) ? rpmNum : c.speedRpm,
                bearingType: specs.bearingDe || c.bearingType,
                kinematics: {
                  ...(c.kinematics || {}),
                  ...kinPatch
                }
              };
            })
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

/** Industrial SaaS dual photo dropzone — Equipment Field / Motor Nameplate. */
function ProfileImageCard({
  title,
  hint,
  photoUrl,
  emptyTitle,
  changeLabel,
  busy,
  setBusy,
  onChange,
  onError,
  onPreviewClick
}: {
  title: string;
  hint: string;
  photoUrl: string;
  emptyTitle: string;
  changeLabel: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
  onPreviewClick?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

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
    <div
      className={`bg-slate-900/80 border rounded-2xl p-6 hover:border-amber-500/30 transition-all backdrop-blur-md shadow-xl space-y-3 flex flex-col min-h-[260px] ${
        dragOver
          ? "border-amber-400/70 shadow-[0_0_28px_rgba(251,191,36,0.18)]"
          : "border-slate-800"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void ingest(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/90">
            {title}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hint}</p>
        </div>
        <span className="h-8 w-8 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center shrink-0">
          <Camera className="h-4 w-4 text-amber-300" aria-hidden />
        </span>
      </div>

      {photoUrl ? (
        <div className="relative group w-full aspect-[16/10] rounded-xl border border-amber-400/35 bg-slate-950 overflow-hidden shadow-[0_0_18px_rgba(251,191,36,0.1)]">
          <img
            src={photoUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="absolute inset-x-0 bottom-0 p-2.5 flex flex-wrap items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={() => onPreviewClick?.(photoUrl)}
              className="min-h-[32px] px-2.5 rounded-lg border border-slate-500/80 bg-slate-950/85 text-white text-[10px] font-bold cursor-pointer hover:border-amber-400/60 inline-flex items-center gap-1"
              title="Zoom"
            >
              <Maximize2 className="h-3 w-3" />
              Zoom
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="min-h-[32px] px-2.5 rounded-lg border border-slate-500/80 bg-slate-950/85 text-white text-[10px] font-bold cursor-pointer hover:border-amber-400/60 inline-flex items-center gap-1 disabled:opacity-50"
              title="Replace"
            >
              <Replace className="h-3 w-3" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy}
              className="min-h-[32px] px-2.5 rounded-lg border border-red-500/50 bg-red-950/80 text-red-100 text-[10px] font-bold cursor-pointer hover:border-red-400 inline-flex items-center gap-1 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-1 w-full min-h-[148px] rounded-xl border-2 border-dashed border-slate-600 hover:border-amber-400/55 bg-slate-950/60 hover:bg-slate-950/90 px-4 py-6 text-center cursor-pointer transition-all duration-200 disabled:opacity-50 flex flex-col items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
          ) : (
            <div className="h-12 w-12 rounded-2xl border border-slate-700 bg-slate-900 flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-slate-500" />
            </div>
          )}
          <p className="text-sm font-semibold text-slate-100">{emptyTitle}</p>
          <p className="text-[11px] text-slate-500 max-w-[220px] leading-relaxed">
            Drag &amp; drop an image here, or click to browse
          </p>
          <p className="text-[10px] text-slate-600">JPG · PNG · WEBP · image/*</p>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
        <label className="relative min-h-[38px] px-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-[11px] font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {changeLabel}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={busy}
            onChange={(e) => void ingest(e.target.files?.[0])}
            aria-label={changeLabel}
          />
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="min-h-[38px] px-3 rounded-xl border border-slate-600 bg-slate-950/70 text-slate-200 text-[11px] font-bold cursor-pointer hover:border-slate-400 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" />
          Browse Files
        </button>
      </div>
    </div>
  );
}

function SpecPill({ label, value }: { label: string; value: string }) {
  const empty = !value || value === "—";
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div
        className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1.5 text-sm font-bold tracking-tight ${
          empty
            ? "border-slate-700/80 bg-slate-950/50 text-slate-500"
            : "border-slate-700 bg-slate-950 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        }`}
        title={value}
      >
        <span className="truncate">{empty ? "Not set" : value}</span>
      </div>
    </div>
  );
}

function SpecGlassCard({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/30 transition-all space-y-4 backdrop-blur-md shadow-xl">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-xl border border-amber-500/35 bg-amber-500/10 flex items-center justify-center text-amber-300 shrink-0">
          {icon}
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
          {title}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
        {children}
      </div>
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

/** Flatten tree into parent-picker options for a creatable level. */
function collectParentOptions(
  nodes: ExplorerNode[],
  allowedKinds: ExplorerKind[],
  depth = 0
): { id: string; label: string; kind: ExplorerKind; depth: number }[] {
  const out: { id: string; label: string; kind: ExplorerKind; depth: number }[] =
    [];
  for (const n of nodes) {
    if (allowedKinds.includes(n.kind)) {
      out.push({
        id: n.id,
        label: n.label,
        kind: n.kind,
        depth
      });
    }
    if (n.children.length) {
      out.push(...collectParentOptions(n.children, allowedKinds, depth + 1));
    }
  }
  return out;
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
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickNodeName, setQuickNodeName] = useState("");
  const [quickDriveType, setQuickDriveType] = useState<
    "Direct" | "Belt" | "Gearbox"
  >("Direct");
  const [quickBearingDe, setQuickBearingDe] = useState("");
  const [quickBearingNde, setQuickBearingNde] = useState("");
  const [quickGearRatio, setQuickGearRatio] = useState("");
  const [quickToothCount, setQuickToothCount] = useState("");
  const [selectedAssessmentReport, setSelectedAssessmentReport] = useState<{
    technology: string;
    lastAssessment: string;
    severity: "normal" | "warning" | "critical";
  } | null>(null);

  const [exceptions, setExceptions] = useState<CbmExceptionRow[]>(() => [
    {
      id: "ex-seed-1",
      location: "Motor DE — Point 1H",
      dateLogged: "1/7/2026 2:15 PM",
      tech: "Vibration",
      severity: "Critical",
      faultDescription: "1X amplitude exceeded ISO Zone C — misalignment suspected",
      actionRequired: "Schedule precision alignment within 48 hrs"
    },
    {
      id: "ex-seed-2",
      location: "Motor DE — Point 1V",
      dateLogged: "1/5/2026 9:40 AM",
      tech: "IR",
      severity: "Warning",
      faultDescription: "NDE bearing housing +12 °C above baseline",
      actionRequired: "Verify lubrication interval and grease type"
    }
  ]);
  const [showAddException, setShowAddException] = useState(false);
  const [newException, setNewException] = useState({
    tech: "Vibration" as DiagnosticTech,
    severity: "Warning" as ExceptionSeverity,
    faultDescription: "",
    actionRequired: ""
  });

  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>(() => [
    {
      id: "fb-seed-1",
      location: "Motor DE",
      dateCreated: "1/6/2026 4:22 PM",
      comment:
        "Audible high-frequency whine at NDE — grease purge performed, noise reduced but not eliminated.",
      acknowledged: true,
      workOrderId: "WO-10482",
      hasImage: true,
      conditionUpdate: "Minor grease leakage at NDE seal"
    }
  ]);
  const [feedbackDraft, setFeedbackDraft] = useState({
    comment: "",
    workOrderId: "",
    conditionUpdate: ""
  });

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
    setQuickAddOpen(false);
    setQuickNodeName("");
    setQuickDriveType("Direct");
    setQuickBearingDe("");
    setQuickBearingNde("");
    setQuickGearRatio("");
    setQuickToothCount("");
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
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<MasterHubSpecs | null>(
    null
  );

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
    resetFormFields();
    setQuickNodeName("");
    setQuickDriveType("Direct");
    setQuickBearingDe("");
    setQuickBearingNde("");
    setQuickGearRatio("");
    setQuickToothCount("");
    setAssetRpm("");
    setCreateKind(kind);
    const parent = resolveQuickAddParent(kind);
    setParentNodeId(parent?.id ?? SITE_PLANT_ID);
    setQuickAddOpen(true);
    setError("");
    // Keep right panel idle — Quick Add uses its own modal
    setMode("idle");
  };

  const quickAddParentOptions = useMemo(() => {
    if (!quickAddOpen || createKind === "plant") return [];
    const ideals = IDEAL_PARENT[createKind as Exclude<ExplorerKind, "plant">];
    return collectParentOptions(tree, ideals);
  }, [quickAddOpen, createKind, tree]);

  const expandToRevealNode = (newId: string, parentId: string | null) => {
    const ancestors = collectAncestorIds(tree, parentId);
    setExpanded((prev) => {
      const next = { ...prev, [SITE_PLANT_ID]: true, [newId]: true };
      for (const id of ancestors) next[id] = true;
      if (parentId) next[parentId] = true;
      return next;
    });
  };

  const handleQuickAddSave = () => {
    setError("");
    const name = quickNodeName.trim();
    if (!name) {
      setError("Name / Tag ID is required.");
      return;
    }
    persistQuickAddNode(name);
  };

  const persistQuickAddNode = (displayName: string) => {
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
    const parentId = parentNodeId || SITE_PLANT_ID;
    let newId = "";

    if (createKind === "unit") {
      const unit: EquipUnit = {
        id: uid("unit"),
        name: displayName,
        plantId: SITE_PLANT_ID
      };
      next.units.push(unit);
      newId = unit.id;
    } else if (createKind === "route") {
      const parent = findNode(tree, parentId);
      const isPlant = !parent || parent.kind === "plant";
      const unit = next.units.find((u) => u.id === parentId);
      const route: EquipRoute = {
        id: uid("route"),
        name: displayName,
        location: unit?.name || facilityName,
        assets: [],
        plantId: SITE_PLANT_ID,
        unitId: isPlant ? undefined : parentId,
        collectionFrequency: routeFreq
      };
      next.routes.push(route);
      newId = route.id;
    } else if (createKind === "asset") {
      const parent = findNode(tree, parentId);
      let routeIdx = next.routes.findIndex((r) => r.id === parentId);
      if (routeIdx < 0 && parent?.kind === "plant") {
        ensureFacilityRoute(next, facilityName);
        routeIdx = next.routes.findIndex((r) => r.id === SITE_FACILITY_ROUTE_ID);
      }
      if (routeIdx < 0) {
        setError("Parent route not found. Choose a valid parent location.");
        return;
      }
      const route = next.routes[routeIdx];
      const tagGuess =
        assetTag.trim() ||
        displayName
          .split(/[\s—–-]+/)
          .find((t) => /[A-Za-z0-9]/.test(t))
          ?.toUpperCase() ||
        displayName.slice(0, 12).toUpperCase().replace(/\s+/g, "-");
      const asset: EquipAsset = {
        id: uid("asset"),
        tag: tagGuess.toUpperCase(),
        name: displayName,
        location: route.location || facilityName,
        machineType: machineType || undefined,
        speedRpm: assetRpm ? Number(assetRpm) || undefined : undefined,
        status: "Normal",
        overallVibration: 1.0,
        components: []
      };
      next.routes[routeIdx] = {
        ...route,
        assets: [...route.assets, asset]
      };
      newId = asset.id;
    } else if (createKind === "component") {
      const driveMap =
        quickDriveType === "Belt"
          ? ("Belt Drive" as const)
          : ("Direct Drive" as const);
      const kinematics: CbmKinematics = {
        ...DEFAULT_KIN,
        ratedRpm: assetRpm.trim() || DEFAULT_KIN.ratedRpm,
        driveArrangement: driveMap,
        bearingDe: quickBearingDe.trim() || undefined,
        bearingNde: quickBearingNde.trim() || undefined,
        gearboxRatio:
          quickDriveType === "Gearbox"
            ? quickGearRatio.trim() || undefined
            : undefined,
        gearTeethZ1:
          quickDriveType === "Gearbox"
            ? quickToothCount.trim() || undefined
            : undefined
      };
      const rpmNum = Number(kinematics.ratedRpm || "");
      const comp: EquipComponent = {
        id: uid("comp"),
        name: displayName,
        componentType: compType,
        bearingType: kinematics.bearingDe || kinematics.bearingNde,
        speedRpm: Number.isFinite(rpmNum) && rpmNum > 0 ? rpmNum : undefined,
        isoClass: kinematics.isoClass,
        kinematics,
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
        setError("Parent asset not found. Choose a valid parent location.");
        return;
      }
      newId = comp.id;
    } else if (createKind === "point") {
      const point: EquipCollectionPoint = {
        id: uid("pt"),
        name: displayName,
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
          "Parent component not found. Choose a valid parent location."
        );
        return;
      }
      newId = point.id;
    } else {
      return;
    }

    saveEquipmentStore(next);
    refresh();
    expandToRevealNode(newId, parentId);
    setSelectedNodeId(newId);
    setQuickAddOpen(false);
    setQuickNodeName("");
    setQuickDriveType("Direct");
    setQuickBearingDe("");
    setQuickBearingNde("");
    setQuickGearRatio("");
    setQuickToothCount("");
    setError("");
    toast(
      `${KIND_LABEL[createKind]} "${displayName}" added to plant hierarchy.`,
      "success"
    );
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
            const active = quickAddOpen && createKind === lvl.kind;
            return (
              <button
                key={lvl.kind}
                type="button"
                onClick={() => beginQuickAdd(lvl.kind)}
                className={active ? QUICK_ADD_BTN_ACTIVE : QUICK_ADD_BTN}
                title={`Add ${lvl.label} via creation modal`}
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

  const renderQuickAddModal = () => {
    if (!quickAddOpen) return null;
    const kindLabel = KIND_LABEL[createKind];
    const showKinematics =
      createKind === "asset" || createKind === "component";

    return (
      <div
        className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={() => {
          setQuickAddOpen(false);
          setError("");
        }}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-[#FFC700]/35 bg-[#0A0E1A] shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Quick Add Level
              </p>
              <h3
                id="quick-add-title"
                className="text-base font-bold text-white mt-0.5"
              >
                Add New {kindLabel}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickAddOpen(false);
                setError("");
              }}
              className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-medium">
                {error}
              </div>
            ) : null}

            <Field label="Node Type">
              <div className="min-h-[40px] rounded-xl border border-[#FFC700]/30 bg-[#FFC700]/10 px-3 flex items-center text-sm font-bold text-[#FFC700]">
                {KIND_ICON[createKind]} {kindLabel}
              </div>
            </Field>

            <Field label="Name / Tag ID" required>
              <input
                className={INPUT}
                value={quickNodeName}
                onChange={(e) => setQuickNodeName(e.target.value)}
                placeholder='e.g. "PMP-104 Motor Drive End"'
                autoFocus
              />
            </Field>

            <Field label="Parent Location" required>
              <select
                className={INPUT}
                value={parentNodeId || SITE_PLANT_ID}
                onChange={(e) => setParentNodeId(e.target.value)}
              >
                {quickAddParentOptions.length === 0 ? (
                  <option value={SITE_PLANT_ID}>
                    [{facilityName}] (Plant Root)
                  </option>
                ) : (
                  quickAddParentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {"— ".repeat(Math.max(0, opt.depth))}
                      {KIND_ICON[opt.kind]} {opt.label}
                    </option>
                  ))
                )}
              </select>
            </Field>

            {showKinematics && (
              <div className="rounded-xl border border-[#FFC700]/25 bg-slate-950/50 p-3 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#FFC700]/90">
                  Kinematic &amp; Nameplate Specs
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Motor / Machine Rated RPM">
                    <input
                      className={INPUT}
                      value={assetRpm}
                      onChange={(e) => setAssetRpm(e.target.value)}
                      placeholder="1780"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Drive Type">
                    <select
                      className={INPUT}
                      value={quickDriveType}
                      onChange={(e) =>
                        setQuickDriveType(
                          e.target.value as "Direct" | "Belt" | "Gearbox"
                        )
                      }
                    >
                      <option value="Direct">Direct</option>
                      <option value="Belt">Belt</option>
                      <option value="Gearbox">Gearbox</option>
                    </select>
                  </Field>
                  <Field label="Drive End Bearing">
                    <input
                      className={INPUT}
                      value={quickBearingDe}
                      onChange={(e) => setQuickBearingDe(e.target.value)}
                      placeholder="6314-C3"
                    />
                  </Field>
                  <Field label="Non-Drive End Bearing">
                    <input
                      className={INPUT}
                      value={quickBearingNde}
                      onChange={(e) => setQuickBearingNde(e.target.value)}
                      placeholder="6312-C3"
                    />
                  </Field>
                  {quickDriveType === "Gearbox" && (
                    <>
                      <Field label="Gear Ratio">
                        <input
                          className={INPUT}
                          value={quickGearRatio}
                          onChange={(e) => setQuickGearRatio(e.target.value)}
                          placeholder="14.6:1"
                        />
                      </Field>
                      <Field label="Tooth Count">
                        <input
                          className={INPUT}
                          value={quickToothCount}
                          onChange={(e) => setQuickToothCount(e.target.value)}
                          placeholder="23"
                          inputMode="numeric"
                        />
                      </Field>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQuickAddOpen(false);
                setError("");
              }}
              className={BTN_GHOST}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQuickAddSave}
              className={BTN_PRIMARY}
            >
              Save Node
            </button>
          </div>
        </div>
      </div>
    );
  };

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
    return userUploadedPhotoUrl(
      lookupNodePhoto(store, selectedNode.id, selectedNode.kind)
    );
  }, [store, selectedNode]);

  const selectedNameplateUrl = useMemo(() => {
    if (!selectedNode) return null;
    return userUploadedPhotoUrl(
      lookupNameplatePhoto(store, selectedNode.id, selectedNode.kind)
    );
  }, [store, selectedNode]);

  const demoProfile = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "component") return null;
    return lookupDemoProfile(store, selectedNode);
  }, [store, selectedNode]);

  const masterSpecsTarget = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "component") return null;
    return resolveMasterSpecsTarget(store, selectedNode);
  }, [store, selectedNode]);

  const masterSpecs = useMemo(() => {
    if (!masterSpecsTarget) {
      return {
        motorHpKw: "—",
        ratedRpm: "—",
        frameSize: "—",
        voltage: "—",
        fla: "—",
        operationalDuty: "—",
        driveType: "Direct" as const,
        bearingDe: "—",
        bearingNde: "—",
        pulleyOrTooth: "—",
        activeTechs: "—",
        fmaxLor: "—",
        sensorMount: "—",
        measurementInterval: "—"
      };
    }
    const base = demoProfile?.specs || DEFAULT_MASTER_SPECS;
    return masterSpecsFromKin(
      masterSpecsTarget.kin,
      masterSpecsTarget.speedRpm,
      masterSpecsTarget.bearingType,
      base
    );
  }, [masterSpecsTarget, demoProfile]);

  const displayMasterSpecs =
    profileEditing && profileDraft ? profileDraft : masterSpecs;

  useEffect(() => {
    setProfileEditing(false);
    setProfileDraft(null);
  }, [selectedNode?.id]);

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

  const saveSelectedNameplate = (nameplatePhotoUrl: string) => {
    if (!selectedNode) return;
    if (selectedNode.kind !== "asset" && selectedNode.kind !== "component")
      return;
    const next = patchNameplatePhoto(
      cloneStore(getEquipmentStore()),
      selectedNode.id,
      selectedNode.kind,
      nameplatePhotoUrl || undefined
    );
    saveEquipmentStore(next);
    refresh();
  };

  const beginProfileSpecsEdit = () => {
    setProfileDraft({ ...masterSpecs });
    setProfileEditing(true);
  };

  const cancelProfileSpecsEdit = () => {
    setProfileEditing(false);
    setProfileDraft(null);
  };

  const saveProfileSpecs = () => {
    if (!masterSpecsTarget || !profileDraft) return;
    const next = patchMasterSpecs(
      cloneStore(getEquipmentStore()),
      masterSpecsTarget.kind,
      masterSpecsTarget.id,
      profileDraft
    );
    saveEquipmentStore(next);
    refresh();
    setProfileEditing(false);
    setProfileDraft(null);
    toast("Equipment & nameplate specs saved.", "success");
  };

  const patchProfileDraft = <K extends keyof MasterHubSpecs>(
    key: K,
    value: MasterHubSpecs[K]
  ) => {
    setProfileDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
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

    const kind = selectedNode.kind;
    const isComponent = kind === "component";
    const isAsset = kind === "asset";
    const isLocationSummary =
      kind === "plant" ||
      kind === "route" ||
      kind === "unit" ||
      kind === "point";
    const canEditMasterSpecs = isComponent && Boolean(masterSpecsTarget);
    const specs = displayMasterSpecs;

    const summaryEntity = lookupEditableEntity(store, selectedNode);
    let summarySubType = KIND_LABEL[kind];
    let summaryCriticality = "—";
    let summaryId = selectedNode.id;
    if (kind === "plant") {
      const plant = store.plants.find((p) => p.id === selectedNode.id);
      summarySubType = plant?.facilityType || "Plant Facility";
      summaryId = plant?.id || selectedNode.id;
      summaryCriticality =
        selectedNode.children.length > 3
          ? "High"
          : selectedNode.children.length > 0
            ? "Medium"
            : "Low";
    } else if (kind === "unit" && summaryEntity.unit) {
      summarySubType = "Process Unit";
      summaryId = summaryEntity.unit.id;
      summaryCriticality =
        selectedNode.children.length > 2 ? "High" : "Medium";
    } else if (kind === "route" && summaryEntity.route) {
      summarySubType =
        summaryEntity.route.collectionFrequency
          ? `${summaryEntity.route.collectionFrequency} Route`
          : "Collection Route";
      summaryId = summaryEntity.route.id;
      summaryCriticality =
        selectedNode.children.length > 2 ? "High" : "Medium";
    } else if (kind === "point" && summaryEntity.point) {
      summarySubType =
        summaryEntity.point.measurementType ||
        summaryEntity.point.orientation ||
        "Collection Point";
      summaryId = summaryEntity.point.id;
      summaryCriticality = "Low";
    } else if (kind === "asset" && summaryEntity.asset) {
      summarySubType =
        summaryEntity.asset.machineType || "Asset Assembly";
      summaryId = summaryEntity.asset.tag || summaryEntity.asset.id;
      summaryCriticality = summaryEntity.asset.criticality || "Medium";
    }

    const locationHeader = (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Location Profile
          </p>
          <h3 className="text-lg font-bold text-white mt-1 tracking-tight">
            {KIND_ICON[kind]} {selectedNode.label}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#FFC700]">
              {KIND_LABEL[kind]}
            </span>
            <span className="text-[11px] text-slate-500">
              {isComponent
                ? demoProfile?.label ||
                  "Component · Equipment & Kinematics Hub"
                : isAsset
                  ? "Asset · Field photo only"
                  : "Hierarchy location summary"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditMasterSpecs ? (
            <button
              type="button"
              onClick={beginProfileSpecsEdit}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 hover:bg-[#FFC700]/20 text-[#FFC700] text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-[0_0_16px_rgba(255,199,0,0.12)]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Edit Specifications
            </button>
          ) : null}
          {CHILD_OF[kind] && (
            <button
              type="button"
              onClick={() => beginCreateChild(selectedNode)}
              className={BTN_CYAN}
            >
              <Plus className="h-4 w-4" />
              Add {KIND_LABEL[CHILD_OF[kind]!]}
            </button>
          )}
          {selectedNode.id !== SITE_PLANT_ID && kind !== "plant" ? (
            <button
              type="button"
              onClick={() => requestDeleteNode(selectedNode)}
              className="min-h-[40px] px-3 rounded-xl border border-red-800/80 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : null}
        </div>
      </div>
    );

    const editSpecsModal =
      profileEditing && profileDraft && isComponent ? (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-specs-title"
          onClick={cancelProfileSpecsEdit}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-[#0A0E1A] shadow-[0_0_50px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-[#0A0E1A]/95 backdrop-blur-md px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/80">
                  Nameplate &amp; Kinematics
                </p>
                <h3
                  id="edit-specs-title"
                  className="text-lg font-bold text-white tracking-tight mt-0.5"
                >
                  Edit Specifications
                </h3>
              </div>
              <button
                type="button"
                onClick={cancelProfileSpecsEdit}
                className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 cursor-pointer hover:text-white hover:border-slate-400 inline-flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    ["motorHpKw", "Motor HP / kW", "e.g. 100 HP / 75 kW"],
                    ["ratedRpm", "Rated RPM", "e.g. 1780 RPM"],
                    ["frameSize", "Frame Size", "e.g. 445T"],
                    ["voltage", "Voltage", "e.g. 460 V"],
                    ["fla", "Full Load Amps (FLA)", "e.g. 124 A FLA"],
                    [
                      "operationalDuty",
                      "Operational Duty",
                      "e.g. Continuous (S1)"
                    ],
                    ["bearingDe", "DE Bearing", "e.g. 6314-C3"],
                    ["bearingNde", "NDE Bearing", "e.g. 6212-C3"],
                    [
                      "pulleyOrTooth",
                      "Pulley / Sheave / Tooth Count",
                      "e.g. 2.4 : 1 Sheave"
                    ],
                    [
                      "activeTechs",
                      "Active Monitoring Technologies",
                      "Vibration · IR · Ultrasound"
                    ],
                    [
                      "fmaxLor",
                      "Fmax / Lines of Resolution",
                      "2000 Hz / 3200 LoR"
                    ],
                    ["sensorMount", "Sensor Mounting Type", "Stud Mount"],
                    [
                      "measurementInterval",
                      "Measurement Interval",
                      "Monthly"
                    ]
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <label key={key} className="block space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {label}
                    </span>
                    <input
                      type="text"
                      value={profileDraft[key]}
                      placeholder={placeholder}
                      onChange={(e) => patchProfileDraft(key, e.target.value)}
                      className="w-full min-h-[40px] rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFC700]"
                    />
                  </label>
                ))}
                <label className="block space-y-1.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Drive Type
                  </span>
                  <select
                    value={profileDraft.driveType}
                    onChange={(e) =>
                      patchProfileDraft(
                        "driveType",
                        e.target.value as MasterHubSpecs["driveType"]
                      )
                    }
                    className="w-full min-h-[40px] rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white focus:outline-none focus:border-[#FFC700]"
                  >
                    <option value="Direct">Direct</option>
                    <option value="Belt">Belt</option>
                    <option value="Gearbox">Gearbox</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={cancelProfileSpecsEdit}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfileSpecs}
                  className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Save Specifications
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null;

    const locationProfile = (
      <div className="space-y-5">
        {locationHeader}

        {/* PLANT / ROUTE / UNIT / POINT — summary only */}
        {isLocationSummary ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/30 transition-all backdrop-blur-md shadow-xl space-y-5">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-xl border border-amber-500/35 bg-amber-500/10 flex items-center justify-center text-amber-300 shrink-0">
                <MapPin className="h-4 w-4" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
                Location Summary
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SpecPill label="Location Name" value={selectedNode.label} />
              <SpecPill label="ID" value={summaryId} />
              <SpecPill label="SubType" value={summarySubType} />
              <SpecPill
                label="Criticality Ranking"
                value={summaryCriticality}
              />
            </div>
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Child Nodes ({selectedNode.children.length})
              </p>
              {selectedNode.children.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No child nodes under this location.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {selectedNode.children.map((child) => (
                    <li
                      key={child.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <span className="text-sm text-slate-200 font-medium truncate">
                        {KIND_ICON[child.kind]} {child.label}
                      </span>
                      <span className="shrink-0 inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFC700]">
                        {KIND_LABEL[child.kind]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Equipment photos and kinematic specs are available on Asset and
              Component nodes only.
            </p>
          </div>
        ) : null}

        {/* ASSET — field photo only */}
        {isAsset ? (
          <div className="space-y-4">
            <div className="max-w-xl">
              <ProfileImageCard
                title="Equipment Field Photo"
                hint="Overall asset / machine field capture"
                photoUrl={selectedPhotoUrl || ""}
                emptyTitle="Upload Equipment Photo"
                changeLabel="Upload / Change Image"
                busy={photoBusy}
                setBusy={setPhotoBusy}
                onChange={saveSelectedPhoto}
                onError={setError}
                onPreviewClick={setPhotoLightbox}
              />
            </div>
            {error ? (
              <p className="text-xs text-red-300 font-medium">{error}</p>
            ) : null}
            <p className="text-[11px] text-slate-500">
              Nameplate photos and kinematics specs are managed on Component
              nodes (Motor, Gearbox, Pump, etc.).
            </p>
          </div>
        ) : null}

        {/* COMPONENT — dual photos + specs */}
        {isComponent ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileImageCard
                title="Equipment Field Photo"
                hint="Overall component / machine field capture"
                photoUrl={selectedPhotoUrl || ""}
                emptyTitle="Upload Equipment Photo"
                changeLabel="Upload / Change Image"
                busy={photoBusy}
                setBusy={setPhotoBusy}
                onChange={saveSelectedPhoto}
                onError={setError}
                onPreviewClick={setPhotoLightbox}
              />
              <ProfileImageCard
                title="Motor / Component Nameplate Photo"
                hint="Close-up of electrical motor or component nameplate"
                photoUrl={selectedNameplateUrl || ""}
                emptyTitle="Upload Nameplate Photo"
                changeLabel="Upload / Change Image"
                busy={photoBusy}
                setBusy={setPhotoBusy}
                onChange={saveSelectedNameplate}
                onError={setError}
                onPreviewClick={setPhotoLightbox}
              />
            </div>
            {error ? (
              <p className="text-xs text-red-300 font-medium">{error}</p>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SpecGlassCard
                title="General & Drive Specs"
                icon={<Zap className="h-4 w-4" />}
              >
                <SpecPill label="Motor HP / kW" value={specs.motorHpKw} />
                <SpecPill label="Rated RPM" value={specs.ratedRpm} />
                <SpecPill label="Frame Size" value={specs.frameSize} />
                <SpecPill label="Voltage" value={specs.voltage} />
                <SpecPill label="Full Load Amps (FLA)" value={specs.fla} />
                <SpecPill
                  label="Operational Duty"
                  value={specs.operationalDuty}
                />
              </SpecGlassCard>

              <SpecGlassCard
                title="Kinematics & Bearings"
                icon={<Cog className="h-4 w-4" />}
              >
                <SpecPill label="Drive Type" value={specs.driveType} />
                <SpecPill
                  label="Drive End (DE) Bearing"
                  value={
                    specs.bearingDe !== "—"
                      ? `${specs.bearingDe} Bearing`
                      : "—"
                  }
                />
                <SpecPill
                  label="Non-Drive End (NDE) Bearing"
                  value={
                    specs.bearingNde !== "—"
                      ? `${specs.bearingNde} Bearing`
                      : "—"
                  }
                />
                <SpecPill
                  label="Pulley / Sheave Ratio or Tooth Count"
                  value={specs.pulleyOrTooth}
                />
              </SpecGlassCard>

              <SpecGlassCard
                title="PdM Diagnostic Configuration"
                icon={<Activity className="h-4 w-4" />}
              >
                <SpecPill
                  label="Active Monitoring Technologies"
                  value={specs.activeTechs}
                />
                <SpecPill
                  label="Fmax / Lines of Resolution"
                  value={specs.fmaxLor}
                />
                <SpecPill
                  label="Sensor Mounting Type"
                  value={specs.sensorMount}
                />
                <SpecPill
                  label="Measurement Interval"
                  value={specs.measurementInterval}
                />
              </SpecGlassCard>
            </div>
          </div>
        ) : null}

        {editSpecsModal}
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
                      <button
                        type="button"
                        onClick={() => {
                          const tech = row.technology;
                          const severity: "normal" | "warning" | "critical" =
                            tech === "Vibration"
                              ? "critical"
                              : tech === "Thermography" ||
                                  tech === "Ultrasound" ||
                                  tech === "Temperature"
                                ? "warning"
                                : "normal";
                          setSelectedAssessmentReport({
                            technology: tech,
                            lastAssessment: row.lastAssessment!,
                            severity
                          });
                        }}
                        className="inline-flex items-center rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-colors cursor-pointer"
                        title={`Open ${row.technology} Fault Entry Report`}
                      >
                        {row.lastAssessment}
                      </button>
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

    const nodeLocationLabel = `${withFacilityPrefix(selectedNode.path).replace(/➔/g, " ➔ ")}`;

    const scopedExceptions = exceptions.filter(
      (ex) =>
        ex.location.toLowerCase().includes(selectedNode.label.toLowerCase()) ||
        selectedNode.kind === "asset" ||
        selectedNode.kind === "component" ||
        selectedNode.kind === "point"
    );

    const scopedFeedback = feedbackEntries.filter(
      (fb) =>
        fb.location.toLowerCase().includes(selectedNode.label.toLowerCase()) ||
        selectedNode.kind !== "plant"
    );

    const submitException = () => {
      if (!newException.faultDescription.trim()) {
        toast("Fault description is required.", "warning");
        return;
      }
      setExceptions((prev) => [
        {
          id: uid("ex"),
          location: `${selectedNode.label} — ${nodeLocationLabel.split("➔").pop()?.trim() || "Point"}`,
          dateLogged: new Date().toLocaleString(undefined, {
            month: "numeric",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
          }),
          tech: newException.tech,
          severity: newException.severity,
          faultDescription: newException.faultDescription.trim(),
          actionRequired: newException.actionRequired.trim() || "—"
        },
        ...prev
      ]);
      setNewException({
        tech: "Vibration",
        severity: "Warning",
        faultDescription: "",
        actionRequired: ""
      });
      setShowAddException(false);
      toast("Exception logged.", "success");
    };

    const submitFeedback = () => {
      if (!feedbackDraft.comment.trim()) {
        toast("Comment / finding is required.", "warning");
        return;
      }
      setFeedbackEntries((prev) => [
        {
          id: uid("fb"),
          location: selectedNode.label,
          dateCreated: new Date().toLocaleString(undefined, {
            month: "numeric",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
          }),
          comment: feedbackDraft.comment.trim(),
          acknowledged: false,
          workOrderId: feedbackDraft.workOrderId.trim() || "—",
          hasImage: false,
          conditionUpdate: feedbackDraft.conditionUpdate.trim() || undefined
        },
        ...prev
      ]);
      setFeedbackDraft({ comment: "", workOrderId: "", conditionUpdate: "" });
      toast("Field feedback submitted.", "success");
    };

    const toggleFeedbackAck = (id: string) => {
      setFeedbackEntries((prev) =>
        prev.map((fb) =>
          fb.id === id ? { ...fb, acknowledged: !fb.acknowledged } : fb
        )
      );
    };

    const exceptionsTab = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              CBM Exception Log
            </p>
            <h3 className="text-sm font-bold text-white mt-1">Active Exceptions</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-md">
              {nodeLocationLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddException((v) => !v)}
            className="min-h-[36px] px-3 rounded-xl border border-[#FFC700]/45 bg-[#FFC700]/10 text-[#FFC700] text-xs font-bold cursor-pointer hover:bg-[#FFC700]/20 transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Exception
          </button>
        </div>

        {showAddException && (
          <div className="rounded-xl border border-[#FFC700]/30 bg-slate-950/60 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className={LABEL}>Diagnostic Tech</span>
              <select
                className={INPUT}
                value={newException.tech}
                onChange={(e) =>
                  setNewException((p) => ({
                    ...p,
                    tech: e.target.value as DiagnosticTech
                  }))
                }
              >
                {(["Vibration", "IR", "Ultrasound", "MCA", "Oil"] as const).map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className={LABEL}>Severity</span>
              <select
                className={INPUT}
                value={newException.severity}
                onChange={(e) =>
                  setNewException((p) => ({
                    ...p,
                    severity: e.target.value as ExceptionSeverity
                  }))
                }
              >
                {(["Critical", "Warning", "Normal"] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block sm:col-span-2">
              <span className={LABEL}>Fault Description</span>
              <textarea
                className={`${INPUT} min-h-[64px] py-2`}
                value={newException.faultDescription}
                onChange={(e) =>
                  setNewException((p) => ({
                    ...p,
                    faultDescription: e.target.value
                  }))
                }
                placeholder="Describe the out-of-spec condition or alarm…"
              />
            </label>
            <label className="space-y-1 block sm:col-span-2">
              <span className={LABEL}>Action Required</span>
              <input
                className={INPUT}
                value={newException.actionRequired}
                onChange={(e) =>
                  setNewException((p) => ({
                    ...p,
                    actionRequired: e.target.value
                  }))
                }
                placeholder="Recommended corrective action…"
              />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddException(false)}
                className={BTN_GHOST}
              >
                Cancel
              </button>
              <button type="button" onClick={submitException} className={BTN_PRIMARY}>
                Log Exception
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                {(
                  [
                    "Date Logged",
                    "Diagnostic Tech",
                    "Severity",
                    "Fault Description",
                    "Action Required"
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
              {scopedExceptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-500 text-sm"
                  >
                    No active exceptions for this location.
                  </td>
                </tr>
              ) : (
                scopedExceptions.map((ex) => (
                  <tr
                    key={ex.id}
                    className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/50"
                  >
                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                      {ex.dateLogged}
                    </td>
                    <td className="px-3 py-2.5 text-slate-200 font-medium">
                      {ex.tech}
                    </td>
                    <td className="px-3 py-2.5">{severityBadge(ex.severity)}</td>
                    <td className="px-3 py-2.5 text-slate-300 max-w-[220px]">
                      <p className="font-medium text-slate-200">{ex.location}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {ex.faultDescription}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {ex.actionRequired}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    const feedbackTab = (
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Technician Field Feedback
          </p>
          <h3 className="text-sm font-bold text-white mt-1">
            Feedback &amp; Findings
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Post-inspection notes for {selectedNode.label}
          </p>
        </div>

        <div className="rounded-xl border border-[#FFC700]/25 bg-slate-950/60 p-3 sm:p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FFC700]/90">
            Submit New Finding
          </p>
          <label className="space-y-1 block">
            <span className={LABEL}>Comment / Finding</span>
            <textarea
              className={`${INPUT} min-h-[72px] py-2`}
              value={feedbackDraft.comment}
              onChange={(e) =>
                setFeedbackDraft((p) => ({ ...p, comment: e.target.value }))
              }
              placeholder="Describe observations from the field inspection…"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className={LABEL}>Work Order Reference</span>
              <input
                className={INPUT}
                value={feedbackDraft.workOrderId}
                onChange={(e) =>
                  setFeedbackDraft((p) => ({ ...p, workOrderId: e.target.value }))
                }
                placeholder="WO-10482"
              />
            </label>
            <label className="space-y-1 block">
              <span className={LABEL}>Physical Condition Update</span>
              <input
                className={INPUT}
                value={feedbackDraft.conditionUpdate}
                onChange={(e) =>
                  setFeedbackDraft((p) => ({
                    ...p,
                    conditionUpdate: e.target.value
                  }))
                }
                placeholder="e.g. Oil leak at coupling guard"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={submitFeedback} className={BTN_PRIMARY}>
              Submit Feedback
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                {(
                  [
                    "Location",
                    "Date Created",
                    "Comment / Finding",
                    "Acknowledged",
                    "Work Request ID",
                    "Image"
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
              {scopedFeedback.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-500 text-sm"
                  >
                    No field feedback logged yet for this location.
                  </td>
                </tr>
              ) : (
                scopedFeedback.map((fb) => (
                  <tr
                    key={fb.id}
                    className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/50 align-top"
                  >
                    <td className="px-3 py-2.5 text-slate-200 font-medium whitespace-nowrap">
                      {fb.location}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                      {fb.dateCreated}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 max-w-[240px]">
                      <p>{fb.comment}</p>
                      {fb.conditionUpdate ? (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Condition: {fb.conditionUpdate}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFeedbackAck(fb.id)}
                        className={`min-h-[28px] px-2 rounded-lg text-[10px] font-bold cursor-pointer border transition-colors ${
                          fb.acknowledged
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:border-[#FFC700]/40"
                        }`}
                      >
                        {fb.acknowledged ? "Acknowledged" : "Pending"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px]">
                      {fb.workOrderId}
                    </td>
                    <td className="px-3 py-2.5">
                      {fb.hasImage ? (
                        <button
                          type="button"
                          onClick={() => toast("Opening attachment…", "info")}
                          className="h-8 w-8 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 cursor-pointer hover:border-[#FFC700]/50 inline-flex items-center justify-center"
                          title="View image attachment"
                          aria-label="View image attachment"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    const exceptionBadgeCount = scopedExceptions.filter(
      (ex) => ex.severity === "Critical" || ex.severity === "Warning"
    ).length;
    const feedbackBadgeCount = scopedFeedback.filter(
      (fb) => !fb.acknowledged
    ).length;

    const DETAIL_TAB_META: {
      id: DetailTab;
      icon: React.ReactNode;
      badge?: number;
    }[] = [
      {
        id: "Location Profile",
        icon: <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
      },
      {
        id: "Equipment Maintenance Plan",
        icon: <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
      },
      {
        id: "Exceptions",
        icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: exceptionBadgeCount
      },
      {
        id: "Feedback",
        icon: <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />,
        badge: feedbackBadgeCount
      }
    ];

    return (
      <div className="space-y-4">
        <nav aria-label="Detail tabs" className="w-full overflow-x-auto">
          <div className="bg-slate-900/90 p-1.5 rounded-xl border border-slate-800/80 inline-flex flex-wrap gap-2 min-w-0">
            {DETAIL_TAB_META.map((tab) => {
              const active = detailTab === tab.id;
              const showBadge =
                typeof tab.badge === "number" && tab.badge > 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={`relative inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20 px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200"
                      : "bg-slate-800/50 text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-slate-700/50 px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-all duration-200"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.id}</span>
                  {showBadge ? (
                    <span
                      className={`ml-0.5 min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                        active
                          ? "bg-slate-950/25 text-slate-950"
                          : tab.id === "Exceptions"
                            ? "bg-red-500/90 text-white"
                            : "bg-cyan-500/90 text-slate-950"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        {detailTab === "Location Profile" ? (
          locationProfile
        ) : detailTab === "Equipment Maintenance Plan" ? (
          maintenancePlan
        ) : detailTab === "Exceptions" ? (
          exceptionsTab
        ) : detailTab === "Feedback" ? (
          feedbackTab
        ) : null}
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

      {renderQuickAddModal()}

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

      {selectedAssessmentReport ? (
        <div
          className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fault-entry-report-title"
          onClick={() => setSelectedAssessmentReport(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-amber-500/25 bg-[#0A0E1A] shadow-[0_0_60px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0A0E1A]/95 backdrop-blur-md px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFC700]/80">
                    SmartCBM · Fault Entry
                  </p>
                  <h2
                    id="fault-entry-report-title"
                    className="text-lg sm:text-xl font-bold text-white tracking-tight"
                  >
                    PdM Health &amp; Fault Entry Report
                  </h2>
                  <nav
                    aria-label="Plant hierarchy"
                    className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px]"
                  >
                    {breadcrumbSegments.map((seg, i) => (
                      <React.Fragment key={`fer-${seg}-${i}`}>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      window.print();
                      toast("Sending report to printer…", "info");
                    }}
                    className="min-h-[36px] px-3 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-200 text-xs font-bold cursor-pointer hover:border-slate-400 hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5"
                    title="Print report"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      toast("Fault Entry Report PDF download started.", "success")
                    }
                    className="min-h-[36px] px-3 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-200 text-xs font-bold cursor-pointer hover:border-slate-400 hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5"
                    title="Download PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAssessmentReport(null)}
                    className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 cursor-pointer hover:border-slate-400 hover:bg-slate-700 hover:text-white transition-colors inline-flex items-center justify-center"
                    aria-label="Close report"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Assessment · {selectedAssessmentReport.lastAssessment} ·{" "}
                <span className="text-slate-300 font-medium">
                  {selectedAssessmentReport.technology === "Thermography"
                    ? "IR"
                    : selectedAssessmentReport.technology ===
                        "Motor Circuit Analysis"
                      ? "MCA"
                      : selectedAssessmentReport.technology}
                </span>
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* Severity banner */}
              {(() => {
                const sev = selectedAssessmentReport.severity;
                const banner =
                  sev === "critical"
                    ? {
                        label: "Critical Fault / Immediate Repair Required",
                        cls: "border-red-500/50 bg-gradient-to-r from-red-950/80 via-red-900/40 to-red-950/60 text-red-100 shadow-[0_0_28px_rgba(239,68,68,0.18)]"
                      }
                    : sev === "warning"
                      ? {
                          label: "Anomaly Detected / Action Recommended",
                          cls: "border-amber-400/50 bg-gradient-to-r from-amber-950/70 via-amber-900/35 to-amber-950/50 text-amber-100 shadow-[0_0_28px_rgba(245,158,11,0.14)]"
                        }
                      : {
                          label: "No Identifiable Defect / Normal Operation",
                          cls: "border-emerald-500/45 bg-gradient-to-r from-emerald-950/70 via-emerald-900/30 to-emerald-950/50 text-emerald-100 shadow-[0_0_28px_rgba(16,185,129,0.14)]"
                        };
                return (
                  <div
                    className={`rounded-xl border px-4 py-3.5 flex items-center gap-3 ${banner.cls}`}
                  >
                    {sev === "critical" ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
                    ) : sev === "warning" ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                    )}
                    <p className="text-sm sm:text-base font-bold tracking-tight">
                      {banner.label}
                    </p>
                  </div>
                );
              })()}

              {/* Details grid */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">
                  Report Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                  {(
                    [
                      ["Analyst Name", "Jordan Hale, CAT III"],
                      ["Analyst Email", "jordan.hale@smartcbm.io"],
                      [
                        "Technology",
                        selectedAssessmentReport.technology === "Thermography"
                          ? "IR"
                          : selectedAssessmentReport.technology ===
                              "Motor Circuit Analysis"
                            ? "MCA"
                            : selectedAssessmentReport.technology === "Ultrasound"
                              ? "Ultrasound"
                              : selectedAssessmentReport.technology === "Vibration"
                                ? "Vibration"
                                : selectedAssessmentReport.technology
                      ],
                      [
                        "Failure Mode",
                        selectedAssessmentReport.severity === "critical"
                          ? "Bearing Outer Race Defect (BPFO)"
                          : selectedAssessmentReport.severity === "warning"
                            ? "Thermal / Acoustic Anomaly"
                            : "None — Baseline Stable"
                      ],
                      [
                        "Criticality",
                        selectedAssessmentReport.severity === "critical"
                          ? "P1 — Critical"
                          : selectedAssessmentReport.severity === "warning"
                            ? "P2 — Elevated"
                            : "P4 — Routine"
                      ],
                      [
                        "Work Request #",
                        selectedAssessmentReport.severity === "normal"
                          ? "—"
                          : "WR-2026-4417"
                      ],
                      ["Previous Fault Entry", "12/11/2025 9:12 AM"]
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="min-w-0 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {label}
                      </p>
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment blocks */}
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/90">
                    Assessment Comment
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {selectedAssessmentReport.severity === "critical"
                      ? `Route assessment on ${selectedAssessmentReport.lastAssessment} confirms progressing drive-end bearing fault under ${selectedAssessmentReport.technology} monitoring. Asset remains operable short-term with elevated risk.`
                      : selectedAssessmentReport.severity === "warning"
                        ? `Mild deviation noted during the ${selectedAssessmentReport.lastAssessment} ${selectedAssessmentReport.technology} survey. Recommend trending and follow-up verification on the next route cycle.`
                        : `No actionable defect indicators on the ${selectedAssessmentReport.lastAssessment} assessment. Equipment health is within expected operating envelopes.`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/90">
                    Analysis Findings
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {selectedAssessmentReport.severity === "critical"
                      ? "Spectral peaks at BPFO and harmonics with rising overall velocity. Demodulation shows clear outer-race impact energy. Cross-tech correlation supports mechanical degradation rather than process load noise."
                      : selectedAssessmentReport.severity === "warning"
                        ? "Localized temperature/ultrasonic signature elevated versus prior baseline. Pattern is consistent with early-stage friction or lubrication variance; no confirmed catastrophic indicators."
                        : "Trend envelope, overall levels, and fault frequencies remain below alert thresholds with no emergent sidebands or transient events of concern."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/90">
                    Repair Recommendations
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {selectedAssessmentReport.severity === "critical"
                      ? "Issue work request for DE bearing replacement within 14 days. Increase monitoring frequency to weekly, stage OEM-equivalent bearing kit, and verify alignment/lubrication after repair."
                      : selectedAssessmentReport.severity === "warning"
                        ? "Inspect lubrication condition, verify sensor/target placement, and re-collect on the next scheduled route. Escalate if severity advances or work request criteria are met."
                        : "Continue standard PdM route interval. No corrective maintenance recommended at this time."}
                  </p>
                </div>
              </div>

              {/* Attachments */}
              <div className="rounded-xl border border-dashed border-slate-600/80 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Equipment Visual Attachment
                  </p>
                  <span className="text-[10px] text-slate-600">
                    Field photos · Spectral graphs
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="aspect-[16/10] rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 text-center px-4">
                    <Camera className="h-7 w-7 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-400">
                      Field Photo Preview
                    </p>
                    <p className="text-[10px] text-slate-600">
                      No image attached — placeholder
                    </p>
                  </div>
                  <div className="aspect-[16/10] rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 text-center px-4">
                    <ImageIcon className="h-7 w-7 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-400">
                      Spectral / Trend Graph
                    </p>
                    <p className="text-[10px] text-slate-600">
                      Spectrum capture placeholder
                    </p>
                  </div>
                </div>
              </div>
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
