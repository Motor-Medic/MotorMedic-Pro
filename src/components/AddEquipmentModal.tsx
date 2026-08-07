import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  SITE_PLANT_ID,
  getEquipmentStore,
  saveEquipmentStore,
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

export type HierarchyLevel =
  | "unit"
  | "route"
  | "asset"
  | "component"
  | "point";

export interface AddEquipmentContext {
  plantId?: string | null;
  unitId?: string | null;
  routeId?: string | null;
  assetId?: string | null;
  componentId?: string | null;
}

/** Contextual parent when opening Add from a tree node (+). */
export interface SelectedParentNode {
  id: string;
  name: string;
  path: string;
}

export interface PathOption {
  id: string;
  name: string;
  path: string;
  /** Optional tag / secondary label (e.g. P-101A) */
  tag?: string;
}

interface AddEquipmentModalProps {
  onClose: () => void;
  onSaved: () => void;
  defaultLevel?: HierarchyLevel;
  context?: AddEquipmentContext;
  selectedParentNode?: SelectedParentNode | null;
}

const LEVELS: {
  id: HierarchyLevel;
  label: string;
  icon: string;
}[] = [
  { id: "unit", label: "Unit", icon: "🏭" },
  { id: "route", label: "Route", icon: "🛣️" },
  { id: "asset", label: "Asset", icon: "⚙️" },
  { id: "component", label: "Component", icon: "🔌" },
  { id: "point", label: "Collection Point", icon: "📍" }
];

const FREQUENCIES: NonNullable<EquipRoute["collectionFrequency"]>[] = [
  "Weekly",
  "Monthly",
  "Quarterly"
];

const MACHINE_TYPES = [
  "Pump",
  "Electric Motor",
  "Fan/Blower",
  "Gearbox",
  "Compressor",
  "Coupling",
  "Other"
];

const CRITICALITIES: NonNullable<EquipAsset["criticality"]>[] = [
  "Low",
  "Medium",
  "High",
  "Critical"
];

const ORIENTATIONS: EquipCollectionPoint["orientation"][] = [
  "Horizontal",
  "Vertical",
  "Axial",
  "Radial"
];

const MEAS_TYPES: EquipCollectionPoint["measurementType"][] = [
  "Vibration",
  "Temp",
  "Ultrasound"
];

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

type KinSubTab = "limits" | "faults" | "bearings";

const KIN_TABS: { id: KinSubTab; label: string }[] = [
  { id: "limits", label: "⚡ Operating Limits" },
  { id: "faults", label: "🎯 Kinematics & Faults" },
  { id: "bearings", label: "🧱 Bearings & Coupling" }
];

const DEFAULT_KINEMATICS: ComponentKinematics = {
  ratedRpm: "1780",
  lineFrequency: "60Hz",
  motorPoles: "4",
  driveArrangement: "Direct Drive",
  couplingType: "Flexible Grid",
  isoClass: "Class II",
  warningLimitMms: "4.5",
  criticalLimitMms: "7.1",
  vibrationUnit: "mm/s RMS"
};

/** Simulated AI kinematic library hit for custom equipment. */
function aiExtractSchema(customType: string): ComponentKinematics {
  const q = customType.toLowerCase();
  if (q.includes("decanter") || q.includes("centrifuge")) {
    return {
      ...DEFAULT_KINEMATICS,
      customEquipmentType: customType.trim(),
      motorHpKw: "75 / 55",
      ratedRpm: "3200",
      minOperatingRpm: "1800",
      maxOperatingRpm: "3600",
      lineFrequency: "60Hz",
      bearingDe: "SKF 22317 E",
      bearingNde: "SKF 22315 E",
      thrustBearing: "SKF 29420 E",
      couplingType: "Flexible Grid",
      isoClass: "Class III",
      warningLimitMms: "4.5",
      criticalLimitMms: "7.1"
    };
  }
  if (q.includes("mill") || q.includes("pulverizer")) {
    return {
      ...DEFAULT_KINEMATICS,
      customEquipmentType: customType.trim(),
      motorHpKw: "250 / 186",
      ratedRpm: "900",
      motorPoles: "8",
      bearingDe: "SKF 23228 CC/W33",
      bearingNde: "SKF 23226 CC/W33",
      couplingType: "Gear",
      isoClass: "Class IV",
      warningLimitMms: "7.1",
      criticalLimitMms: "11.0"
    };
  }
  return {
    ...DEFAULT_KINEMATICS,
    customEquipmentType: customType.trim(),
    motorHpKw: "100 / 75",
    ratedRpm: "1780",
    motorPoles: "4",
    rotorBars: "48",
    statorSlots: "72",
    bearingDe: "SKF 6320 C3",
    bearingNde: "SKF 6215 C3",
    thrustBearing: "—",
    couplingType: "Disc",
    isoClass: "Class II",
    warningLimitMms: "2.8",
    criticalLimitMms: "4.5"
  };
}

const INPUT =
  "w-full min-h-[42px] rounded-xl bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC700] transition-colors disabled:opacity-40";
const LABEL = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const BTN_PRIMARY =
  "min-h-[42px] px-4 rounded-xl bg-[#FFC700] hover:bg-[#e6b400] text-slate-950 text-sm font-bold cursor-pointer transition-colors disabled:opacity-50";
const BTN_GHOST =
  "min-h-[42px] px-4 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 text-sm font-bold cursor-pointer hover:border-slate-500 transition-colors";
const BTN_CYAN =
  "min-h-[42px] px-4 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 text-sm font-bold cursor-pointer hover:bg-cyan-500/25 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2";

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 min-w-0">
      <span className={LABEL}>
        {label}
        {required ? <span className="text-[#FFC700] ml-0.5">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ParentBreadcrumbBanner({
  path,
  onChange
}: {
  path: string;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2.5">
      <p className="text-sm text-cyan-100 min-w-0">
        <span className="mr-1.5">📍</span>
        <span className="font-bold text-cyan-200">Parent Location:</span>{" "}
        <span className="text-white font-medium break-words">{path}</span>
      </p>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 min-h-[32px] px-2.5 rounded-lg border border-slate-600 bg-slate-900/80 text-[11px] font-bold text-slate-300 cursor-pointer hover:border-[#FFC700]/50 hover:text-[#FFC700] transition-colors"
      >
        Change
      </button>
    </div>
  );
}

/** Searchable hierarchy path combobox — caps visible rows at 10 until filtered. */
function SearchablePathCombobox({
  label,
  required,
  options,
  value,
  onChange,
  placeholder = "🔍 Type tag or name, e.g. 'P-101A'"
}: {
  label: string;
  required?: boolean;
  options: PathOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? options
      : options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.path.toLowerCase().includes(q) ||
            (o.tag ?? "").toLowerCase().includes(q) ||
            o.id.toLowerCase().includes(q)
        );
    return list.slice(0, 10);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="block space-y-1.5 min-w-0" ref={rootRef}>
      <span className={LABEL}>
        {label}
        {required ? <span className="text-[#FFC700] ml-0.5">*</span> : null}
      </span>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        <input
          type="search"
          className={`${INPUT} pl-9`}
          value={open ? query : selected ? `${selected.tag ? `${selected.tag} — ` : ""}${selected.name}` : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 px-2 py-3">No matching parents.</p>
            ) : (
              filtered.map((o) => {
                const on = value === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      on
                        ? "bg-[#FFC700]/10 text-[#FFC700]"
                        : "text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <span className="block text-[10px] text-cyan-400/90 font-mono truncate">
                      [ {o.path} ]
                    </span>
                    <span className="block font-bold truncate mt-0.5">
                      {o.tag ? `${o.tag} — ` : ""}
                      {o.name}
                    </span>
                  </button>
                );
              })
            )}
            {!query.trim() && options.length > 10 && (
              <p className="text-[10px] text-slate-500 px-2 py-1.5 border-t border-slate-800 mt-1">
                Showing top 10 of {options.length} — type to search all.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function cloneStore(store: EquipmentStore): EquipmentStore {
  return JSON.parse(JSON.stringify(store)) as EquipmentStore;
}

export default function AddEquipmentModal({
  onClose,
  onSaved,
  defaultLevel = "asset",
  context,
  selectedParentNode = null
}: AddEquipmentModalProps) {
  const [level, setLevel] = useState<HierarchyLevel>(
    LEVELS.some((l) => l.id === defaultLevel) ? defaultLevel : "unit"
  );
  const [error, setError] = useState("");
  const [expressAsset, setExpressAsset] = useState(true);
  const [parentLocked, setParentLocked] = useState(Boolean(selectedParentNode));

  const [storeSnap] = useState(() => getEquipmentStore());
  const plants = storeSnap.plants;
  const units = storeSnap.units;
  const routes = storeSnap.routes;

  const flatAssets = useMemo(
    () =>
      routes.flatMap((r) =>
        r.assets.map((a) => ({
          ...a,
          routeId: r.id,
          routeName: r.name,
          routeLocation: r.location
        }))
      ),
    [routes]
  );

  const flatComponents = useMemo(
    () =>
      flatAssets.flatMap((a) =>
        a.components.map((c) => ({
          ...c,
          assetId: a.id,
          assetTag: a.tag,
          assetName: a.name,
          routeName: a.routeName,
          routeLocation: a.routeLocation
        }))
      ),
    [flatAssets]
  );

  const unitOptions: PathOption[] = useMemo(
    () =>
      units.map((u) => {
        const plant = plants.find((p) => p.id === u.plantId);
        return {
          id: u.id,
          name: u.name,
          path: plant ? `${plant.name}` : "Unassigned Plant"
        };
      }),
    [units, plants]
  );

  const routeOptions: PathOption[] = useMemo(
    () =>
      routes.map((r) => {
        const unit = units.find((u) => u.id === r.unitId);
        const plant = plants.find((p) => p.id === (r.plantId || unit?.plantId));
        const pathParts = [plant?.name, unit?.name || r.location].filter(Boolean);
        return {
          id: r.id,
          name: r.name,
          path: pathParts.join(" / ") || r.location || "Facility"
        };
      }),
    [routes, units, plants]
  );

  const assetOptions: PathOption[] = useMemo(
    () =>
      flatAssets.map((a) => ({
        id: a.id,
        name: a.name,
        tag: a.tag,
        path: `${a.routeLocation || "Facility"} / ${a.routeName}`
      })),
    [flatAssets]
  );

  const componentOptions: PathOption[] = useMemo(
    () =>
      flatComponents.map((c) => ({
        id: c.id,
        name: c.name,
        tag: c.assetTag,
        path: `${c.routeLocation || "Facility"} / ${c.routeName} / ${c.assetName}`
      })),
    [flatComponents]
  );

  /* ---- Unit (always under licensed site plant) ---- */
  const sitePlantName =
    plants.find((p) => p.id === SITE_PLANT_ID)?.name ||
    plants[0]?.name ||
    "Main Facility";
  const [unitName, setUnitName] = useState("");

  /* ---- Route ---- */
  const [routeUnitId, setRouteUnitId] = useState(() => {
    if (defaultLevel === "route" && selectedParentNode?.id) return selectedParentNode.id;
    return context?.unitId || "";
  });
  const [routeName, setRouteName] = useState("");
  const [routeFreq, setRouteFreq] =
    useState<NonNullable<EquipRoute["collectionFrequency"]>>("Monthly");

  /* ---- Asset ---- */
  const [assetName, setAssetName] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [assetRouteId, setAssetRouteId] = useState(() => {
    if (defaultLevel === "asset" && selectedParentNode?.id) return selectedParentNode.id;
    return context?.routeId || "";
  });
  const [machineType, setMachineType] = useState("Pump");
  const [assetRpm, setAssetRpm] = useState("");
  const [assetCrit, setAssetCrit] =
    useState<NonNullable<EquipAsset["criticality"]>>("Medium");

  /* ---- Component ---- */
  const [compAssetId, setCompAssetId] = useState(() => {
    if (defaultLevel === "component" && selectedParentNode?.id) {
      return selectedParentNode.id;
    }
    return context?.assetId || "";
  });
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<EquipComponentType>(
    "Electric Motor (AC / DC / VFD)"
  );
  const [customEquipType, setCustomEquipType] = useState("");
  const [showSpecs, setShowSpecs] = useState(false);
  const [kinTab, setKinTab] = useState<KinSubTab>("limits");
  const [kin, setKin] = useState<ComponentKinematics>({ ...DEFAULT_KINEMATICS });
  const [aiSearching, setAiSearching] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const aiTimerRef = useRef<number | null>(null);

  const patchKin = <K extends keyof ComponentKinematics>(
    key: K,
    value: ComponentKinematics[K]
  ) => setKin((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    return () => {
      if (aiTimerRef.current != null) window.clearTimeout(aiTimerRef.current);
    };
  }, []);

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
      const extracted = aiExtractSchema(customEquipType);
      setKin(extracted);
      setShowSpecs(true);
      setKinTab("faults");
      setAiSearching(false);
      setAiExtracted(true);
      aiTimerRef.current = null;
    }, 1500);
  };

  /* ---- Point ---- */
  const [pointCompId, setPointCompId] = useState(() => {
    if (defaultLevel === "point" && selectedParentNode?.id) return selectedParentNode.id;
    return context?.componentId || "";
  });
  const [pointName, setPointName] = useState("");
  const [pointOrient, setPointOrient] =
    useState<EquipCollectionPoint["orientation"]>("Horizontal");
  const [pointMeas, setPointMeas] =
    useState<EquipCollectionPoint["measurementType"]>("Vibration");

  const showParentBanner =
    parentLocked && Boolean(selectedParentNode);

  const parentBannerPath =
    selectedParentNode?.path || selectedParentNode?.name || "";

  const levelMeta = LEVELS.find((l) => l.id === level)!;

  const persist = (next: EquipmentStore) => {
    saveEquipmentStore(next);
    onSaved();
    onClose();
  };

  const handleSave = () => {
    setError("");
    const store = cloneStore(getEquipmentStore());

    if (level === "unit") {
      if (!unitName.trim()) {
        setError("Unit/Area name is required.");
        return;
      }
      const unit: EquipUnit = {
        id: uid("unit"),
        name: unitName.trim(),
        plantId: SITE_PLANT_ID
      };
      store.units.push(unit);
      persist(store);
      return;
    }

    if (level === "route") {
      if (!routeName.trim()) {
        setError("Route name is required.");
        return;
      }
      const parentUnit = store.units.find((u) => u.id === routeUnitId);
      const sitePlant = store.plants.find((p) => p.id === SITE_PLANT_ID);
      const route: EquipRoute = {
        id: uid("route"),
        name: routeName.trim(),
        location: parentUnit?.name || sitePlant?.name || "Main Facility",
        assets: [],
        plantId: SITE_PLANT_ID,
        unitId: routeUnitId || undefined,
        collectionFrequency: routeFreq
      };
      store.routes.push(route);
      persist(store);
      return;
    }

    if (level === "asset") {
      if (!assetName.trim()) {
        setError("Asset name is required.");
        return;
      }
      if (!assetTag.trim()) {
        setError("Tag ID is required.");
        return;
      }
      let targetRouteId = assetRouteId;
      if (!targetRouteId) {
        if (store.routes.length === 0) {
          const autoRoute: EquipRoute = {
            id: uid("route"),
            name: "Plant Route 1",
            location: sitePlantName,
            assets: [],
            plantId: SITE_PLANT_ID,
            unitId: store.units[0]?.id,
            collectionFrequency: "Monthly"
          };
          store.routes.push(autoRoute);
          targetRouteId = autoRoute.id;
        } else {
          setError("Select a parent route.");
          return;
        }
      }
      let routeIdx = store.routes.findIndex((r) => r.id === targetRouteId);
      if (routeIdx < 0) {
        setError("Parent route not found.");
        return;
      }
      const route = store.routes[routeIdx];
      const asset: EquipAsset = {
        id: uid("asset"),
        tag: assetTag.trim().toUpperCase(),
        name: assetName.trim(),
        location: route.location,
        machineType,
        criticality: assetCrit,
        speedRpm: assetRpm ? Number(assetRpm) || undefined : undefined,
        status: "Normal",
        overallVibration: 1.0,
        components: expressAsset
          ? [{ id: uid("comp"), name: "Motor DE", bearingType: undefined }]
          : []
      };
      store.routes[routeIdx] = {
        ...route,
        assets: [...route.assets, asset]
      };
      persist(store);
      return;
    }

    if (level === "component") {
      if (!compAssetId) {
        setError("Select a parent asset.");
        return;
      }
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
                ? customEquipType.trim() || kin.customEquipmentType
                : kin.customEquipmentType
          }
        : undefined;

      const primaryBearing =
        kinematics?.bearingDe || kinematics?.bearingNde || undefined;
      const rpmNum = Number(kinematics?.ratedRpm || kinematics?.inputRpm || "");
      const warn = Number(kinematics?.warningLimitMms || "");
      const crit = Number(kinematics?.criticalLimitMms || "");

      let found = false;
      store.routes = store.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => {
          if (a.id !== compAssetId) return a;
          found = true;
          const comp: EquipComponent = {
            id: uid("comp"),
            name: compName.trim(),
            componentType: compType,
            bearingType: primaryBearing,
            speedRpm: Number.isFinite(rpmNum) && rpmNum > 0 ? rpmNum : undefined,
            isoClass: kinematics?.isoClass,
            warningThreshold:
              Number.isFinite(warn) && warn > 0 ? warn : undefined,
            criticalThreshold:
              Number.isFinite(crit) && crit > 0 ? crit : undefined,
            kinematics,
            collectionPoints: []
          };
          return { ...a, components: [...a.components, comp] };
        })
      }));
      if (!found) {
        setError("Parent asset not found.");
        return;
      }
      persist(store);
      return;
    }

    if (level === "point") {
      if (!pointCompId) {
        setError("Select a parent component.");
        return;
      }
      if (!pointName.trim()) {
        setError("Point name is required.");
        return;
      }
      let found = false;
      store.routes = store.routes.map((r) => ({
        ...r,
        assets: r.assets.map((a) => ({
          ...a,
          components: a.components.map((c) => {
            if (c.id !== pointCompId) return c;
            found = true;
            const point: EquipCollectionPoint = {
              id: uid("pt"),
              name: pointName.trim(),
              orientation: pointOrient,
              measurementType: pointMeas
            };
            return {
              ...c,
              collectionPoints: [...(c.collectionPoints ?? []), point]
            };
          })
        }))
      }));
      if (!found) {
        setError("Parent component not found.");
        return;
      }
      persist(store);
    }
  };

  const saveLabel =
    level === "unit"
      ? "Save Unit"
      : level === "route"
        ? "Save Route"
        : level === "asset"
          ? "Save Asset"
          : level === "component"
            ? "Save Component"
            : "Save Point";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-800 bg-[#0A0E1A] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Add Equipment
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Flexible hierarchy — {levelMeta.icon} {levelMeta.label}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-2">
            Select Level To Add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => {
              const on = level === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setLevel(l.id);
                    setError("");
                  }}
                  className={`min-h-[36px] px-2.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
                    on
                      ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50 shadow-[0_0_12px_rgba(255,199,0,0.25)]"
                      : "bg-slate-900/80 text-slate-400 border border-slate-800 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  <span className="mr-1">{l.icon}</span>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-medium">
              {error}
            </div>
          ) : null}

          {showParentBanner && selectedParentNode ? (
            <ParentBreadcrumbBanner
              path={parentBannerPath}
              onChange={() => setParentLocked(false)}
            />
          ) : null}

          {level === "unit" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5 text-xs text-cyan-100">
                <span className="font-bold text-cyan-200">Parent facility:</span>{" "}
                [{sitePlantName}]{" "}
                <span className="text-slate-500">(licensed site — fixed)</span>
              </div>
              <Field label="Unit / Area Name" required>
                <input
                  className={INPUT}
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder='e.g. "Boiler House"'
                />
              </Field>
            </div>
          )}

          {level === "route" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {showParentBanner ? null : (
                <SearchablePathCombobox
                  label="Parent Unit"
                  options={unitOptions}
                  value={routeUnitId}
                  onChange={setRouteUnitId}
                  placeholder="🔍 Search unit / area…"
                />
              )}
              <Field label="Route Name" required>
                <input
                  className={INPUT}
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder='e.g. "Monthly Vibration Route 1"'
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

          {level === "asset" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExpressAsset(true)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    expressAsset
                      ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50"
                      : "bg-slate-900 text-slate-400 border border-slate-800"
                  }`}
                >
                  ⚡ Express Add (3 Fields)
                </button>
                <button
                  type="button"
                  onClick={() => setExpressAsset(false)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    !expressAsset
                      ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50"
                      : "bg-slate-900 text-slate-400 border border-slate-800"
                  }`}
                >
                  📋 Full Wizard
                </button>
              </div>

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
                {showParentBanner ? null : (
                  <SearchablePathCombobox
                    label="Parent Route"
                    required
                    options={routeOptions}
                    value={assetRouteId}
                    onChange={setAssetRouteId}
                    placeholder="🔍 Type tag or name, e.g. 'Boiler Feed'"
                  />
                )}
                {!expressAsset && (
                  <>
                    <Field label="Machine Type">
                      <select
                        className={INPUT}
                        value={machineType}
                        onChange={(e) => setMachineType(e.target.value)}
                      >
                        {MACHINE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
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
                    <Field label="Criticality">
                      <select
                        className={INPUT}
                        value={assetCrit}
                        onChange={(e) =>
                          setAssetCrit(
                            e.target.value as NonNullable<EquipAsset["criticality"]>
                          )
                        }
                      >
                        {CRITICALITIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </div>
              {routes.length === 0 && (
                <p className="text-xs text-amber-300/90">
                  No routes yet — create a Route first, or Load Demo Plant Data.
                </p>
              )}
              {expressAsset && (
                <p className="text-[11px] text-slate-500">
                  Express mode saves name, tag, and route — a default Motor DE
                  component is attached automatically.
                </p>
              )}
            </div>
          )}

          {level === "component" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {showParentBanner ? null : (
                  <SearchablePathCombobox
                    label="Parent Asset"
                    required
                    options={assetOptions}
                    value={compAssetId}
                    onChange={setCompAssetId}
                    placeholder="🔍 Type tag or name, e.g. 'P-101A'"
                  />
                )}
                <Field label="Component Name" required>
                  <input
                    className={INPUT}
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder='e.g. "Motor DE"'
                  />
                </Field>
                <Field label="Component Type" required>
                  <select
                    className={INPUT}
                    value={compType}
                    onChange={(e) => {
                      const next = e.target.value as EquipComponentType;
                      setCompType(next);
                      setError("");
                      setAiExtracted(false);
                      if (next !== "Other (Custom / AI Spec Search)") {
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
                className={`w-full min-h-[44px] px-3 rounded-xl text-left text-xs sm:text-sm font-bold cursor-pointer transition-all border ${
                  showSpecs
                    ? "bg-cyan-500/10 border-cyan-400/40 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
                    : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                ⚙️ Advanced Kinematics &amp; Specs (Optional){" "}
                {showSpecs ? "▲" : "▼"}
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  showSpecs ? "max-h-[48rem] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="rounded-lg border border-slate-800 bg-[#0A0E1A] p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {KIN_TABS.map((tab) => {
                      const on = kinTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setKinTab(tab.id)}
                          className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all whitespace-nowrap ${
                            on
                              ? "bg-[#FFC700]/15 text-[#FFC700] border border-[#FFC700]/50 shadow-[0_0_10px_rgba(255,199,0,0.2)]"
                              : "bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-600"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    key={kinTab}
                    className="animate-[fadeIn_0.2s_ease] grid grid-cols-1 sm:grid-cols-2 gap-3"
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
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label="Min Operating Speed (VFD)">
                          <input
                            className={INPUT}
                            value={kin.minOperatingRpm ?? ""}
                            onChange={(e) => patchKin("minOperatingRpm", e.target.value)}
                            placeholder="600"
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label="Max Operating Speed (VFD)">
                          <input
                            className={INPUT}
                            value={kin.maxOperatingRpm ?? ""}
                            onChange={(e) => patchKin("maxOperatingRpm", e.target.value)}
                            placeholder="3600"
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label="Line Frequency">
                          <div className="min-h-[42px] flex rounded-xl border border-slate-700 overflow-hidden">
                            {(["50Hz", "60Hz"] as const).map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => patchKin("lineFrequency", f)}
                                className={`flex-1 text-sm font-bold cursor-pointer transition-colors ${
                                  kin.lineFrequency === f
                                    ? "bg-[#FFC700]/20 text-[#FFC700]"
                                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
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
                                inputMode="numeric"
                              />
                            </Field>
                            <Field label="Stator Slots">
                              <input
                                className={INPUT}
                                value={kin.statorSlots ?? ""}
                                onChange={(e) => patchKin("statorSlots", e.target.value)}
                                placeholder="72"
                                inputMode="numeric"
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
                                onChange={(e) => patchKin("impellerVanes", e.target.value)}
                                placeholder="5, 7"
                                inputMode="numeric"
                              />
                            </Field>
                            <Field label="Pump Stages Count">
                              <input
                                className={INPUT}
                                value={kin.pumpStages ?? ""}
                                onChange={(e) => patchKin("pumpStages", e.target.value)}
                                placeholder="1"
                                inputMode="numeric"
                              />
                            </Field>
                            <Field label="Volute Clearance">
                              <input
                                className={INPUT}
                                value={kin.voluteClearance ?? ""}
                                onChange={(e) => patchKin("voluteClearance", e.target.value)}
                                placeholder="0.015 in"
                              />
                            </Field>
                            {compType === "Positive Displacement / Gear Pump" && (
                              <>
                                <Field label="Gear Teeth Z1">
                                  <input
                                    className={INPUT}
                                    value={kin.gearTeethZ1 ?? ""}
                                    onChange={(e) => patchKin("gearTeethZ1", e.target.value)}
                                    placeholder="12"
                                  />
                                </Field>
                                <Field label="Gear Teeth Z2">
                                  <input
                                    className={INPUT}
                                    value={kin.gearTeethZ2 ?? ""}
                                    onChange={(e) => patchKin("gearTeethZ2", e.target.value)}
                                    placeholder="12"
                                  />
                                </Field>
                              </>
                            )}
                          </>
                        )}

                        {compType === "Gearbox / Speed Reducer" && (
                          <>
                            <Field label="Stage 1 Pinion Teeth (Z1)">
                              <input
                                className={INPUT}
                                value={kin.gearTeethZ1 ?? ""}
                                onChange={(e) => patchKin("gearTeethZ1", e.target.value)}
                                placeholder="23"
                              />
                            </Field>
                            <Field label="Stage 1 Gear Teeth (Z2)">
                              <input
                                className={INPUT}
                                value={kin.gearTeethZ2 ?? ""}
                                onChange={(e) => patchKin("gearTeethZ2", e.target.value)}
                                placeholder="95"
                              />
                            </Field>
                            <Field label="Stage 2 Pinion (Z3)">
                              <input
                                className={INPUT}
                                value={kin.gearTeethZ3 ?? ""}
                                onChange={(e) => patchKin("gearTeethZ3", e.target.value)}
                                placeholder="19"
                              />
                            </Field>
                            <Field label="Stage 2 Gear (Z4)">
                              <input
                                className={INPUT}
                                value={kin.gearTeethZ4 ?? ""}
                                onChange={(e) => patchKin("gearTeethZ4", e.target.value)}
                                placeholder="67"
                              />
                            </Field>
                            <Field label="Overall Ratio">
                              <input
                                className={INPUT}
                                value={kin.gearboxRatio ?? ""}
                                onChange={(e) => patchKin("gearboxRatio", e.target.value)}
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
                                onChange={(e) => patchKin("fanBladeCount", e.target.value)}
                                placeholder="8, 12"
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
                                onChange={(e) => patchKin("motorSheaveDia", e.target.value)}
                                placeholder="6.5 in"
                                disabled={kin.driveArrangement !== "Belt Drive"}
                              />
                            </Field>
                            <Field label="Fan Sheave Ø (D2)">
                              <input
                                className={INPUT}
                                value={kin.fanSheaveDia ?? ""}
                                onChange={(e) => patchKin("fanSheaveDia", e.target.value)}
                                placeholder="12 in"
                                disabled={kin.driveArrangement !== "Belt Drive"}
                              />
                            </Field>
                            <Field label="Belt Length">
                              <input
                                className={INPUT}
                                value={kin.beltLength ?? ""}
                                onChange={(e) => patchKin("beltLength", e.target.value)}
                                placeholder="85 in"
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
                                onChange={(e) => patchKin("maleLobeCount", e.target.value)}
                                placeholder="4"
                              />
                            </Field>
                            <Field label="Female Lobe Count">
                              <input
                                className={INPUT}
                                value={kin.femaleLobeCount ?? ""}
                                onChange={(e) => patchKin("femaleLobeCount", e.target.value)}
                                placeholder="6"
                              />
                            </Field>
                          </>
                        )}

                        {compType === "Machine Tool Spindle" && (
                          <>
                            <Field label="Spindle Class / Type">
                              <input
                                className={INPUT}
                                value={kin.spindleClass ?? ""}
                                onChange={(e) => patchKin("spindleClass", e.target.value)}
                                placeholder="ISO 40 / HSK-A63"
                              />
                            </Field>
                            <Field label="Max Spindle RPM">
                              <input
                                className={INPUT}
                                value={kin.maxOperatingRpm ?? ""}
                                onChange={(e) => patchKin("maxOperatingRpm", e.target.value)}
                                placeholder="12000"
                              />
                            </Field>
                          </>
                        )}

                        {compType === "Other (Custom / AI Spec Search)" && (
                          <>
                            <Field label="Custom Type Schema">
                              <input
                                className={INPUT}
                                value={kin.customEquipmentType ?? customEquipType}
                                onChange={(e) => patchKin("customEquipmentType", e.target.value)}
                              />
                            </Field>
                            <Field label="Rated RPM">
                              <input
                                className={INPUT}
                                value={kin.ratedRpm ?? ""}
                                onChange={(e) => patchKin("ratedRpm", e.target.value)}
                              />
                            </Field>
                            <Field label="Stages / Elements">
                              <input
                                className={INPUT}
                                value={kin.pumpStages ?? ""}
                                onChange={(e) => patchKin("pumpStages", e.target.value)}
                                placeholder="Bowl + conveyor"
                              />
                            </Field>
                            <Field label="Motor Poles (if driven)">
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
                            onChange={(e) => patchKin("thrustBearing", e.target.value)}
                            placeholder="SKF 29420 E"
                          />
                        </Field>
                        <Field label="Coupling Type">
                          <select
                            className={INPUT}
                            value={kin.couplingType ?? "Flexible Grid"}
                            onChange={(e) =>
                              patchKin("couplingType", e.target.value as CouplingType)
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
              </div>
            </div>
          )}

          {level === "point" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {showParentBanner ? null : (
                <SearchablePathCombobox
                  label="Parent Component"
                  required
                  options={componentOptions}
                  value={pointCompId}
                  onChange={setPointCompId}
                  placeholder="🔍 Type tag or name, e.g. 'Motor DE'"
                />
              )}
              <Field label="Point Name" required>
                <input
                  className={INPUT}
                  value={pointName}
                  onChange={(e) => setPointName(e.target.value)}
                  placeholder='e.g. "1H - Motor DE Horiz"'
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
                  {ORIENTATIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
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
                  {MEAS_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-slate-800 bg-[#0A0E1A]/95">
          <button type="button" onClick={onClose} className={BTN_GHOST}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={BTN_PRIMARY}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
