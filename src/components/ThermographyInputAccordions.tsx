import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Info,
  Upload
} from "lucide-react";
import {
  EXTRACT_THERMAL_METADATA_API_PATH,
  convertDistance,
  convertTemp,
  type ThermalImageMetadata
} from "../lib/extractThermalMetadata";

type IrAccordionSection = "physics" | "camera" | "telemetry";

/** Equipment selection from the top Route / Asset / Component dropdowns. */
export interface TechEquipmentContext {
  route?: string;
  assetTag?: string;
  assetLabel?: string;
  component?: string;
  voltage?: string;
  location?: string;
  hp?: number;
  rpm?: number;
}

/** Operator-entered polymorphic IR fields → Diagnose → API / DB columns. */
export interface ThermographyTelemetrySnapshot {
  asset_type?: string;
  phase_a_temp?: number | null;
  phase_b_temp?: number | null;
  phase_c_temp?: number | null;
  measured_amps?: number | null;
  rated_amps?: number | null;
  de_bearing_temp?: number | null;
  ode_bearing_temp?: number | null;
  refractory_skin_temp?: number | null;
  max_allowable_limit?: number | null;
  /** Existing physics inputs (kept for metadata; optional). */
  ambientTemp?: string;
  humidity?: string;
  windSpeed?: string;
  solarCondition?: string;
  emissivity?: string;
  reflectedTemp?: string;
  distance?: number;
  distanceUnit?: "ft" | "m";
  tempUnit?: "°F" | "°C";
}

/** Auto-fill provenance for Section 3 Data Review fields. */
export type TelemetryFieldSource =
  | "live"
  | "last_scan"
  | "default"
  | "manual"
  | null;

type TelemetryFieldKey =
  | "asset_type"
  | "phase_a_temp"
  | "phase_b_temp"
  | "phase_c_temp"
  | "measured_amps"
  | "rated_amps"
  | "de_bearing_temp"
  | "ode_bearing_temp"
  | "refractory_skin_temp"
  | "max_allowable_limit";

type TelemetrySources = Partial<Record<TelemetryFieldKey, TelemetryFieldSource>>;

interface TelemetryContextField {
  value: number | string | null;
  source: "live" | "last_scan" | "default" | null;
}

interface TelemetryContextResponse {
  success?: boolean;
  asset_key?: string;
  scada_enabled?: boolean;
  poll_recommended_ms?: number | null;
  fields?: Partial<
    Record<
      TelemetryFieldKey | "voltage_rating" | "horsepower" | "load_percentage",
      TelemetryContextField
    >
  >;
  last_analysis?: { timestamp?: string; analysis_type?: string } | null;
  asset?: { tag_number?: string; name?: string; type?: string } | null;
  live?: {
    phaseA?: number;
    phaseB?: number;
    phaseC?: number;
    measuredAmps?: number;
    loadPercentage?: number;
    timestamp?: string;
    source?: "live";
  } | null;
  error?: string;
}

function formatRelativeAge(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (sec < 5) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  return `Updated ${Math.round(min / 60)}h ago`;
}

const ASSET_TYPE_OPTIONS = [
  { label: "Motor", value: "motor" },
  { label: "Switchgear", value: "switchgear" },
  { label: "Transformer", value: "transformer" },
  { label: "Gearbox", value: "gearbox" },
  { label: "Pump", value: "pump" },
  { label: "Bearing", value: "bearing" },
  { label: "Fan", value: "fan" },
  { label: "Boiler", value: "boiler" },
  { label: "Other", value: "other" }
] as const;

/** Electrical telemetry group — phase temps / amps */
const ELECTRICAL_ASSET_TYPES = new Set([
  "motor",
  "switchgear",
  "transformer"
]);

/** Mechanical telemetry group — bearings / refractory / limits */
const MECHANICAL_ASSET_TYPES = new Set([
  "gearbox",
  "pump",
  "bearing",
  "fan"
]);

function parseOptionalNumber(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatAutoFillValue(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}

const EMISSIVITY_PRESETS = [
  { label: "Copper - Oxidized (0.65)", value: "0.65" },
  { label: "Copper - Polished (0.05)", value: "0.05" },
  { label: "Electrical Tape (0.95)", value: "0.95" },
  { label: "Stainless Steel (0.20)", value: "0.20" },
  { label: "Painted Surface (0.90-0.95)", value: "0.93" },
  { label: "Bare Aluminum (0.10)", value: "0.10" },
  { label: "Custom / Manual…", value: "custom" }
] as const;

const TEMP_RANGES = [
  "Auto",
  "-4°F to 248°F",
  "32°F to 662°F",
  "up to 2192°F"
] as const;

const COLOR_PALETTES = ["Ironbow", "Rainbow", "High Contrast", "Grayscale", "Arctic"] as const;
const FOCUS_MODES = ["Auto", "Manual", "LaserSharp"] as const;
const MEASUREMENT_TOOLS = ["Spot Meter", "Area Box", "Delta-T Marker", "Isotherm Alarm"] as const;

const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const inputCls =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none";
const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;
const helperCls = "mt-1.5 text-[11px] text-slate-500 leading-snug";

function SourceBadge({ source }: { source: TelemetryFieldSource }) {
  if (!source || source === "manual") return null;
  if (source === "live") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
        Live
      </span>
    );
  }
  if (source === "last_scan") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/35">
        Last Scan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-500/20 text-slate-300 border border-slate-500/40">
      Default
    </span>
  );
}

function ExifAutoBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/35">
      Auto-detected from Image
    </span>
  );
}

function FieldLabelWithSource({
  label,
  source
}: {
  label: string;
  source: TelemetryFieldSource;
}) {
  return (
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between gap-2">
      <span>{label}</span>
      <SourceBadge source={source} />
    </span>
  );
}

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: IrAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: IrAccordionSection) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/50 transition-colors bg-slate-900"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-white uppercase tracking-wider text-left">
          {title}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-yellow-400" : ""
          }`}
        />
      </button>
      {open && (
        <div className="p-6 border-t border-white/5 bg-slate-950/30 space-y-5">{children}</div>
      )}
    </div>
  );
}

export interface ThermographyInputAccordionsProps {
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  /** Selected from top Equipment Selection (Route / Asset / Component). */
  equipment?: TechEquipmentContext;
  /** Notify parent when a thermal image is selected (for analysis + DB save). Pass null to clear. */
  onThermalFileReady?: (
    meta: {
      name: string;
      preview?: string;
      file: File;
    } | null
  ) => void;
  /** Live telemetry + physics for /api/analyze-thermography metadata + DB columns. */
  onTelemetryChange?: (snapshot: ThermographyTelemetrySnapshot) => void;
}

export default function ThermographyInputAccordions({
  onToast,
  equipment,
  onThermalFileReady,
  onTelemetryChange
}: ThermographyInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<IrAccordionSection[]>([]);

  // Environmental & physics
  const [tempUnit, setTempUnit] = useState<"°F" | "°C">("°F");
  const [ambientTemp, setAmbientTemp] = useState("68");
  const [humidity, setHumidity] = useState("45");
  const [windSpeed, setWindSpeed] = useState("0.5");
  const [solarCondition, setSolarCondition] = useState<"indoor" | "shaded" | "direct">("indoor");
  const [emissivityPreset, setEmissivityPreset] = useState("0.95");
  const [emissivityManual, setEmissivityManual] = useState("0.95");
  const [reflectedTemp, setReflectedTemp] = useState("72");
  const [distance, setDistance] = useState(3);
  const [distanceUnit, setDistanceUnit] = useState<"ft" | "m">("ft");
  /** Section 1 fields auto-filled from radiometric EXIF */
  const [exifSources, setExifSources] = useState<{
    ambientTemp?: boolean;
    humidity?: boolean;
    emissivity?: boolean;
    reflectedTemp?: boolean;
    distance?: boolean;
  }>({});
  const [exifExtractStatus, setExifExtractStatus] = useState<
    "idle" | "reading" | "found" | "none" | "error"
  >("idle");
  const exifRequestId = useRef(0);

  // Asset-specific telemetry (polymorphic IR columns)
  const [assetType, setAssetType] = useState("");
  const [phaseATemp, setPhaseATemp] = useState("");
  const [phaseBTemp, setPhaseBTemp] = useState("");
  const [phaseCTemp, setPhaseCTemp] = useState("");
  const [measuredAmps, setMeasuredAmps] = useState("");
  const [ratedAmps, setRatedAmps] = useState("");
  const [deBearingTemp, setDeBearingTemp] = useState("");
  const [odeBearingTemp, setOdeBearingTemp] = useState("");
  const [refractorySkinTemp, setRefractorySkinTemp] = useState("");
  const [maxAllowableLimit, setMaxAllowableLimit] = useState("");
  const [fieldSources, setFieldSources] = useState<TelemetrySources>({});
  const [autoFillStatus, setAutoFillStatus] = useState<
    "idle" | "loading" | "ready" | "empty" | "error"
  >("idle");
  const [autoFillMeta, setAutoFillMeta] = useState<string | null>(null);
  const [scadaEnabled, setScadaEnabled] = useState(false);
  const [liveTimestamp, setLiveTimestamp] = useState<string | null>(null);
  const [liveAgeLabel, setLiveAgeLabel] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  const autoFillRequestId = useRef(0);
  const fieldSourcesRef = useRef<TelemetrySources>({});
  const settersRef = useRef({
    asset_type: setAssetType,
    phase_a_temp: setPhaseATemp,
    phase_b_temp: setPhaseBTemp,
    phase_c_temp: setPhaseCTemp,
    measured_amps: setMeasuredAmps,
    rated_amps: setRatedAmps,
    de_bearing_temp: setDeBearingTemp,
    ode_bearing_temp: setOdeBearingTemp,
    refractory_skin_temp: setRefractorySkinTemp,
    max_allowable_limit: setMaxAllowableLimit
  });

  useEffect(() => {
    fieldSourcesRef.current = fieldSources;
  }, [fieldSources]);

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!liveTimestamp) {
      setLiveAgeLabel(null);
      return;
    }
    const tick = () => setLiveAgeLabel(formatRelativeAge(liveTimestamp, Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [liveTimestamp]);

  const markManual = (key: TelemetryFieldKey) => {
    setFieldSources((prev) => ({ ...prev, [key]: "manual" }));
  };

  const applyFieldFromContext = (
    key: TelemetryFieldKey,
    field: TelemetryContextField | undefined,
    setter: (v: string) => void,
    opts?: { skipIfManual?: boolean; liveOnly?: boolean }
  ) => {
    if (opts?.skipIfManual && fieldSourcesRef.current[key] === "manual") return;
    if (opts?.liveOnly && field?.source !== "live") return;
    if (!field || field.value == null || field.value === "") {
      if (!opts?.liveOnly) {
        setter("");
        setFieldSources((prev) => ({ ...prev, [key]: null }));
      }
      return;
    }
    setter(formatAutoFillValue(field.value));
    setFieldSources((prev) => ({ ...prev, [key]: field.source }));
  };

  const applyTelemetryResponse = (
    data: TelemetryContextResponse,
    mode: "full" | "live-refresh"
  ) => {
    const f = data.fields || {};
    const liveOnly = mode === "live-refresh";
    const opts = { skipIfManual: liveOnly, liveOnly };

    applyFieldFromContext("asset_type", f.asset_type, settersRef.current.asset_type, opts);
    applyFieldFromContext("phase_a_temp", f.phase_a_temp, settersRef.current.phase_a_temp, opts);
    applyFieldFromContext("phase_b_temp", f.phase_b_temp, settersRef.current.phase_b_temp, opts);
    applyFieldFromContext("phase_c_temp", f.phase_c_temp, settersRef.current.phase_c_temp, opts);
    applyFieldFromContext(
      "measured_amps",
      f.measured_amps,
      settersRef.current.measured_amps,
      opts
    );
    applyFieldFromContext("rated_amps", f.rated_amps, settersRef.current.rated_amps, opts);
    applyFieldFromContext(
      "de_bearing_temp",
      f.de_bearing_temp,
      settersRef.current.de_bearing_temp,
      opts
    );
    applyFieldFromContext(
      "ode_bearing_temp",
      f.ode_bearing_temp,
      settersRef.current.ode_bearing_temp,
      opts
    );
    applyFieldFromContext(
      "refractory_skin_temp",
      f.refractory_skin_temp,
      settersRef.current.refractory_skin_temp,
      opts
    );
    applyFieldFromContext(
      "max_allowable_limit",
      f.max_allowable_limit,
      settersRef.current.max_allowable_limit,
      opts
    );

    setScadaEnabled(Boolean(data.scada_enabled));
    if (data.live?.timestamp) {
      setLiveTimestamp(data.live.timestamp);
    } else if (mode === "full") {
      setLiveTimestamp(null);
    }

    if (mode === "full") {
      const hasAny = Object.values(f).some(
        (entry) => entry && entry.value != null && entry.value !== ""
      );
      setAutoFillStatus(hasAny ? "ready" : "empty");

      const bits: string[] = [];
      if (data.live?.timestamp) {
        bits.push("Live SCADA connected");
        if (data.live.loadPercentage != null) {
          bits.push(`Load ${data.live.loadPercentage}%`);
        }
      }
      if (data.last_analysis?.timestamp) {
        bits.push(
          `Last scan ${new Date(data.last_analysis.timestamp).toLocaleString()}`
        );
      }
      if (data.asset?.tag_number || data.asset?.name) {
        bits.push(`Profile ${data.asset.tag_number || data.asset.name}`);
      }
      setAutoFillMeta(
        bits.length
          ? bits.join(" · ")
          : hasAny
            ? "Auto-filled from database"
            : "No prior scan or asset specs — enter values manually"
      );
    }
  };

  // Ingestion
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [visualRefEnabled, setVisualRefEnabled] = useState(false);
  const [visualRefName, setVisualRefName] = useState<string | null>(null);
  const [visualRefPreview, setVisualRefPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const visualRef = useRef<HTMLInputElement>(null);

  // Camera
  const [tempRange, setTempRange] = useState("Auto");
  const [colorPalette, setColorPalette] = useState("Ironbow");
  const [focusMode, setFocusMode] = useState("Auto");
  const [measurementTools, setMeasurementTools] = useState<string[]>([
    "Spot Meter",
    "Delta-T Marker"
  ]);

  const effectiveEmissivity =
    emissivityPreset === "custom" ? emissivityManual : emissivityPreset;

  /** Spot diameter (inches) via typical industrial 40:1 D:S — distance in feet */
  const distanceFt = distanceUnit === "m" ? distance * 3.28084 : distance;
  const spotSize = Number((distanceFt * 0.04).toFixed(2));

  const equipmentSummary = useMemo(() => {
    const parts = [
      equipment?.route,
      equipment?.assetLabel || equipment?.assetTag,
      equipment?.component
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [equipment]);

  useEffect(() => {
    return () => {
      if (uploadedPreview) URL.revokeObjectURL(uploadedPreview);
      if (visualRefPreview) URL.revokeObjectURL(visualRefPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke latest URLs on unmount only
  }, []);

  // Auto-fill Section 3 from assets + last analysis (+ live SCADA when enabled)
  useEffect(() => {
    const assetKey =
      (equipment?.assetTag && String(equipment.assetTag).trim()) ||
      (equipment?.assetLabel && String(equipment.assetLabel).trim()) ||
      "";

    if (!assetKey) {
      setAutoFillStatus("idle");
      setAutoFillMeta(null);
      setScadaEnabled(false);
      setLiveTimestamp(null);
      return;
    }

    const requestId = ++autoFillRequestId.current;
    setAutoFillStatus("loading");
    setAutoFillMeta(null);

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/asset/${encodeURIComponent(assetKey)}/telemetry-context`,
          { signal: controller.signal }
        );
        const data = (await res.json().catch(() => ({}))) as TelemetryContextResponse;
        if (requestId !== autoFillRequestId.current) return;

        if (!res.ok || data?.success === false) {
          setAutoFillStatus("error");
          setAutoFillMeta(data?.error || `Could not load context (${res.status})`);
          setScadaEnabled(Boolean(data?.scada_enabled));
          return;
        }

        applyTelemetryResponse(data, "full");
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (requestId !== autoFillRequestId.current) return;
        setAutoFillStatus("error");
        setAutoFillMeta(
          err instanceof Error ? err.message : "Failed to load telemetry context"
        );
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset/fill when asset identity changes
  }, [equipment?.assetTag, equipment?.assetLabel]);

  // Poll live SCADA every 10s while page is visible (only when server reports scada_enabled)
  useEffect(() => {
    const assetKey =
      (equipment?.assetTag && String(equipment.assetTag).trim()) ||
      (equipment?.assetLabel && String(equipment.assetLabel).trim()) ||
      "";
    if (!assetKey || !scadaEnabled || !pageVisible) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/asset/${encodeURIComponent(assetKey)}/telemetry-context`
        );
        const data = (await res.json().catch(() => ({}))) as TelemetryContextResponse;
        if (cancelled || !res.ok || data?.success === false) return;
        applyTelemetryResponse(data, "live-refresh");
      } catch {
        /* keep last good values */
      }
    };

    const id = window.setInterval(poll, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while SCADA active for this asset
  }, [equipment?.assetTag, equipment?.assetLabel, scadaEnabled, pageVisible]);

  // Push telemetry (+ physics) to parent for analyze metadata + DB columns
  useEffect(() => {
    if (!onTelemetryChange) return;
    onTelemetryChange({
      asset_type: assetType || undefined,
      phase_a_temp: parseOptionalNumber(phaseATemp),
      phase_b_temp: parseOptionalNumber(phaseBTemp),
      phase_c_temp: parseOptionalNumber(phaseCTemp),
      measured_amps: parseOptionalNumber(measuredAmps),
      rated_amps: parseOptionalNumber(ratedAmps),
      de_bearing_temp: parseOptionalNumber(deBearingTemp),
      ode_bearing_temp: parseOptionalNumber(odeBearingTemp),
      refractory_skin_temp: parseOptionalNumber(refractorySkinTemp),
      max_allowable_limit: parseOptionalNumber(maxAllowableLimit),
      ambientTemp,
      humidity,
      windSpeed,
      solarCondition,
      emissivity: effectiveEmissivity,
      reflectedTemp,
      distance,
      distanceUnit,
      tempUnit
    });
  }, [
    onTelemetryChange,
    assetType,
    phaseATemp,
    phaseBTemp,
    phaseCTemp,
    measuredAmps,
    ratedAmps,
    deBearingTemp,
    odeBearingTemp,
    refractorySkinTemp,
    maxAllowableLimit,
    ambientTemp,
    humidity,
    windSpeed,
    solarCondition,
    effectiveEmissivity,
    reflectedTemp,
    distance,
    distanceUnit,
    tempUnit
  ]);

  // Keep radiometric correction inputs live for analysis consumers
  void effectiveEmissivity;

  const toggleSection = (id: IrAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleTool = (tool: string) => {
    setMeasurementTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const clearThermalPreview = () => {
    setUploadedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadedName(null);
    onThermalFileReady?.(null);
    setExifSources({});
    setExifExtractStatus("idle");
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyExifMetadata = (
    meta: ThermalImageMetadata,
    formTempUnit: "°F" | "°C",
    formDistanceUnit: "ft" | "m"
  ) => {
    if (!meta?.found) {
      setExifSources({});
      setExifExtractStatus("none");
      return;
    }

    const next: typeof exifSources = {};
    const srcTempUnit = meta.tempUnit || "°C";
    const srcDistUnit = meta.distanceUnit || "m";

    if (meta.ambientTemp != null) {
      const v = convertTemp(meta.ambientTemp, srcTempUnit, formTempUnit);
      setAmbientTemp(String(v));
      next.ambientTemp = true;
    }
    if (meta.humidity != null) {
      setHumidity(String(meta.humidity));
      next.humidity = true;
    }
    if (meta.reflectedTemp != null) {
      const v = convertTemp(meta.reflectedTemp, srcTempUnit, formTempUnit);
      setReflectedTemp(String(v));
      next.reflectedTemp = true;
    }
    if (meta.distance != null) {
      const v = convertDistance(meta.distance, srcDistUnit, formDistanceUnit);
      setDistance(v);
      next.distance = true;
    }
    if (meta.emissivity != null) {
      const e = String(meta.emissivity);
      setEmissivityPreset("custom");
      setEmissivityManual(e);
      next.emissivity = true;
    }

    setExifSources(next);
    setExifExtractStatus("found");
    // Open physics accordion so technician sees auto-filled values
    setOpenSections((prev) =>
      prev.includes("physics") ? prev : [...prev, "physics"]
    );
  };

  const extractExifFromFile = async (file: File) => {
    const requestId = ++exifRequestId.current;
    const formTempUnit = tempUnit;
    const formDistanceUnit = distanceUnit;
    setExifExtractStatus("reading");
    setExifSources({});
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch(EXTRACT_THERMAL_METADATA_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          fileName: file.name
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (requestId !== exifRequestId.current) return;

      if (!res.ok || payload?.success === false) {
        setExifExtractStatus("error");
        return;
      }

      const meta = (payload?.metadata || payload) as ThermalImageMetadata;
      if (!meta?.found) {
        setExifExtractStatus("none");
        setExifSources({});
        return;
      }

      applyExifMetadata(meta, formTempUnit, formDistanceUnit);
      onToast?.(
        "Radiometric metadata detected — Environmental & Physics fields updated.",
        "info"
      );
    } catch {
      if (requestId !== exifRequestId.current) return;
      // Silent fallback — leave defaults / manual entry
      setExifExtractStatus("none");
      setExifSources({});
    }
  };

  const handleThermalUpload = (file?: File | null) => {
    if (!file) return;
    if (!/\.(r-?jpe?g|jpe?g|png|gif|webp|tiff?)$/i.test(file.name) && !file.type.startsWith("image/")) {
      onToast?.(
        "Unsupported format. Use .jpg, .jpeg, .png, .gif, or .webp.",
        "warning"
      );
      return;
    }
    const preview = URL.createObjectURL(file);
    setUploadedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
    setUploadedName(file.name);
    onThermalFileReady?.({ name: file.name, preview, file });
    onToast?.(`Thermal image ready: ${file.name}`, "success");
    // Async EXIF extract — does not block upload / preview
    void extractExifFromFile(file);
  };

  const handleVisualUpload = (file?: File | null) => {
    if (!file) return;
    if (!/\.(jpe?g|png|gif|webp)$/i.test(file.name) && !file.type.startsWith("image/")) {
      onToast?.("Visual reference must be an image (.jpg / .png / .webp).", "warning");
      return;
    }
    const preview = URL.createObjectURL(file);
    setVisualRefPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
    setVisualRefName(file.name);
    onToast?.(`Daylight reference attached: ${file.name}`, "success");
  };

  const clearVisualPreview = () => {
    setVisualRefPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVisualRefName(null);
    if (visualRef.current) visualRef.current.value = "";
  };

  const hasThermalPreview = Boolean(uploadedPreview || uploadedName);

  // Polymorphic switch: dropdown inside Section 3 is source of truth
  const assetTypeKey = assetType.trim().toLowerCase();
  const isUnspecifiedOrOther =
    !assetTypeKey || assetTypeKey === "other" || assetTypeKey === "boiler";
  const showElectricalGroup =
    isUnspecifiedOrOther || ELECTRICAL_ASSET_TYPES.has(assetTypeKey);
  const showMechanicalGroup =
    isUnspecifiedOrOther || MECHANICAL_ASSET_TYPES.has(assetTypeKey);

  return (
    <div className="space-y-0">
      {equipmentSummary && (
        <div className="mb-4 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Analyzing equipment
          </p>
          <p className="text-sm text-white font-semibold mt-0.5">{equipmentSummary}</p>
          {(equipment?.assetTag || equipment?.voltage) && (
            <p className="text-xs text-slate-500 mt-1 font-mono">
              {[
                equipment.assetTag ? `Tag ${equipment.assetTag}` : null,
                equipment.voltage ? equipment.voltage : null,
                equipment.location || null
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Data Ingestion — permanently visible at top */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-4 hover:border-amber-500/30 transition-all space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Ingestion
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              Thermal Image Upload
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Always visible — required for Thermography AI analysis
            </p>
          </div>
          <Upload className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
        </div>

        <div className="space-y-4">
          <span className={fieldLabel}>Thermal Image (AI Vision)</span>
          {!hasThermalPreview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleThermalUpload(e.dataTransfer.files?.[0] ?? null);
              }}
              className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-10 text-center cursor-pointer transition-colors"
            >
              <Upload className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">Drop thermal image here</p>
              <p className="text-xs text-slate-500 mt-1">
                .png, .jpg, .webp — photo or screenshot of thermal scan
              </p>
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
                  {uploadedPreview ? (
                    <img
                      src={uploadedPreview}
                      alt={uploadedName || "Thermal preview"}
                      className="w-full h-full object-cover object-left-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-bold">
                      Preview
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                    <span className="truncate max-w-[180px] text-white">
                      {uploadedName || "thermal.png"}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-amber-300">AI Vision Ready</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearThermalPreview}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors"
                    >
                      ✕ Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors"
                    >
                      Replace image
                    </button>
                  </div>
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/90 leading-snug">
                    Supports all image formats. For best results, use radiometric thermal images,
                    but standard screenshots work too.
                  </div>
                </div>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(e) => {
              handleThermalUpload(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>

        {visualRefEnabled && (
          <div className="space-y-2">
            <span className={fieldLabel}>Daylight Reference Photo</span>
            {!visualRefName ? (
              <button
                type="button"
                onClick={() => visualRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleVisualUpload(e.dataTransfer.files?.[0] ?? null);
                }}
                className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-8 text-center cursor-pointer transition-colors"
              >
                <Upload className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-white">
                  Drop daylight reference photo here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  .png, .jpg, .webp — visible-light context for labels
                </p>
              </button>
            ) : (
              <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
                    {visualRefPreview ? (
                      <img
                        src={visualRefPreview}
                        alt={visualRefName || "Visual reference"}
                        className="w-full h-full object-cover object-left-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-bold">
                        Preview
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                      <span className="truncate max-w-[180px] text-white">{visualRefName}</span>
                      <span className="text-slate-500">|</span>
                      <span className="text-amber-300">AI Vision Ready</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={clearVisualPreview}
                        className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors"
                      >
                        ✕ Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => visualRef.current?.click()}
                        className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors"
                      >
                        Replace image
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Visual Reference Match</p>
              <p className={helperCls}>
                Upload side-by-side daylight photo (for cameras without embedded visual)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visualRefEnabled}
              onClick={() => setVisualRefEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors shrink-0 ${
                visualRefEnabled ? "bg-yellow-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  visualRefEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <input
            ref={visualRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={(e) => {
              handleVisualUpload(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* SECTION 1 — Environmental & Physics */}
      <AccordionShell
        id="physics"
        title="1. Environmental & Physics Correction Layer"
        open={openSections.includes("physics")}
        onToggle={toggleSection}
      >
        {exifExtractStatus === "reading" && (
          <p className="text-[11px] text-violet-300/90 -mt-2">
            Reading radiometric EXIF from thermal image…
          </p>
        )}
        {exifExtractStatus === "found" && (
          <p className="text-[11px] text-violet-300/90 -mt-2">
            Radiometric tags applied from the uploaded image. Override any value as needed.
          </p>
        )}
        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Atmospheric Data
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block min-w-0">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <span>Ambient Temperature (T_amb)</span>
                  <ExifAutoBadge show={exifSources.ambientTemp} />
                </span>
                <span className="flex gap-1 normal-case tracking-normal">
                  {(["°F", "°C"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setTempUnit(u)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        tempUnit === u
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 text-slate-400 border-slate-700"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </span>
              </span>
              <input
                type="number"
                value={ambientTemp}
                onChange={(e) => {
                  setExifSources((prev) => ({ ...prev, ambientTemp: false }));
                  setAmbientTemp(e.target.value);
                }}
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span>Relative Humidity (%)</span>
                <ExifAutoBadge show={exifSources.humidity} />
              </span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={humidity}
                  onChange={(e) => {
                    setExifSources((prev) => ({ ...prev, humidity: false }));
                    setHumidity(e.target.value);
                  }}
                  className={`${inputCls} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>Wind Speed (m/s)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={windSpeed}
                onChange={(e) => setWindSpeed(e.target.value)}
                className={inputCls}
              />
              <p className={helperCls}>Critical for outdoor substation scans</p>
            </label>
          </div>

          <div className="mt-5">
            <span className={fieldLabel}>Environmental Condition</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "indoor" as const, label: "Indoor / Controlled" },
                  { id: "shaded" as const, label: "Outdoor (Shaded)" },
                  { id: "direct" as const, label: "Outdoor (Direct Sun)" }
                ] as const
              ).map(({ id, label }) => {
                const on = solarCondition === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSolarCondition(id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      on
                        ? id === "direct"
                          ? "bg-orange-500 text-slate-900 border-orange-500"
                          : "bg-yellow-500 text-slate-900 border-yellow-500"
                        : id === "direct"
                          ? "bg-slate-950 text-orange-400/80 border-orange-500/40 hover:border-orange-500 hover:text-orange-300"
                          : "bg-slate-950 text-slate-400 border-slate-700 hover:border-yellow-500/50 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {solarCondition === "direct" && (
              <p className={`${helperCls} text-orange-400/90`}>
                Applies solar-radiation mitigation offset (+5°C to +15°C compensation)
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            Optics &amp; Material Physics
            <span title="ISO 18434 / NFPA radiometric correction parameters">
              <Info className="h-3.5 w-3.5 text-slate-500" />
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="block min-w-0 sm:col-span-2 lg:col-span-1 space-y-2">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span>Emissivity (ε) — Database Preset</span>
                <ExifAutoBadge show={exifSources.emissivity} />
              </span>
              <div className="relative">
                <select
                  value={emissivityPreset}
                  onChange={(e) => {
                    setExifSources((prev) => ({ ...prev, emissivity: false }));
                    setEmissivityPreset(e.target.value);
                    if (e.target.value !== "custom") setEmissivityManual(e.target.value);
                  }}
                  className={selectCls}
                >
                  {EMISSIVITY_PRESETS.map((p) => (
                    <option key={p.label} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
              <label className="block">
                <span className={fieldLabel}>Manual ε (0.01–1.00)</span>
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={effectiveEmissivity}
                  onChange={(e) => {
                    setExifSources((prev) => ({ ...prev, emissivity: false }));
                    setEmissivityPreset("custom");
                    setEmissivityManual(e.target.value);
                  }}
                  className={inputCls}
                />
              </label>
              <p className={helperCls}>
                Active ε = <span className="text-yellow-400 font-mono font-bold">{effectiveEmissivity}</span>
                . Critical for accurate absolute temperature.
              </p>
            </div>

            <label className="block min-w-0">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span>Reflected Apparent Temp (T_refl)</span>
                <ExifAutoBadge show={exifSources.reflectedTemp} />
              </span>
              <div className="relative">
                <input
                  type="number"
                  value={reflectedTemp}
                  onChange={(e) => {
                    setExifSources((prev) => ({ ...prev, reflectedTemp: false }));
                    setReflectedTemp(e.target.value);
                  }}
                  className={`${inputCls} pr-10`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                  {tempUnit}
                </span>
              </div>
              <p className={helperCls}>Compensates for heat reflecting off shiny busbars</p>
            </label>

            <div className="block min-w-0">
              <span className={`${fieldLabel} flex items-center justify-between gap-2`}>
                <span>Distance to Target</span>
                <ExifAutoBadge show={exifSources.distance} />
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={distance}
                  onChange={(e) => {
                    setExifSources((prev) => ({ ...prev, distance: false }));
                    setDistance(Number(e.target.value) || 0);
                  }}
                  className={inputCls}
                />
                <div className="relative w-24 shrink-0">
                  <select
                    value={distanceUnit}
                    onChange={(e) => setDistanceUnit(e.target.value as "ft" | "m")}
                    className={selectCls}
                  >
                    <option value="ft">ft</option>
                    <option value="m">m</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg space-y-1.5">
                <p className="text-xs font-bold text-cyan-400">📐 Spatial Calibration</p>
                <p className="text-xs text-slate-300">
                  Spot size diameter at {distanceFt.toFixed(1)} ft is {spotSize} inches.
                </p>
                {spotSize < 0.5 ? (
                  <p className="text-xs text-green-400 font-medium">
                    ✅ Safe for small electrical lug measurements.
                  </p>
                ) : spotSize > 2.0 ? (
                  <p className="text-xs text-red-400 font-medium">
                    ⚠️ WARNING: Too far! Pixel averaging may under-report temperature by up to
                    40°C. Move closer or use telephoto lens.
                  </p>
                ) : (
                  <p className="text-xs text-yellow-400/90 font-medium">
                    Acceptable for larger targets — verify lug size vs. spot diameter.
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Based on 40:1 Distance-to-Spot ratio (typical industrial camera)
                </p>
              </div>
            </div>
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 2 — Camera */}
      <AccordionShell
        id="camera"
        title="2. Camera & Measurement Configuration"
        open={openSections.includes("camera")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block min-w-0">
            <span className={fieldLabel}>Temperature Range</span>
            <div className="relative">
              <select
                value={tempRange}
                onChange={(e) => setTempRange(e.target.value)}
                className={selectCls}
              >
                {TEMP_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Color Palette</span>
            <div className="relative">
              <select
                value={colorPalette}
                onChange={(e) => setColorPalette(e.target.value)}
                className={selectCls}
              >
                {COLOR_PALETTES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Focus Mode</span>
            <div className="relative">
              <select
                value={focusMode}
                onChange={(e) => setFocusMode(e.target.value)}
                className={selectCls}
              >
                {FOCUS_MODES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
        </div>

        <div>
          <span className={fieldLabel}>Measurement Tools</span>
          <div className="flex flex-wrap gap-2">
            {MEASUREMENT_TOOLS.map((tool) => {
              const on = measurementTools.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    on
                      ? "bg-yellow-500/15 border-yellow-500 text-yellow-300"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500/50"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                      on ? "bg-yellow-500 border-yellow-500 text-slate-950" : "border-slate-600"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {tool}
                </button>
              );
            })}
          </div>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Asset-Specific Telemetry (polymorphic DB columns) */}
      <AccordionShell
        id="telemetry"
        title="3. Asset-Specific Telemetry"
        open={openSections.includes("telemetry")}
        onToggle={toggleSection}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Review
            </p>
            <p className={helperCls}>
              Auto-filled from live SCADA (when available), last scan, then asset profile. All
              fields remain editable.
            </p>
            {autoFillMeta && (
              <p className="mt-1 text-[11px] text-slate-400">{autoFillMeta}</p>
            )}
            {liveAgeLabel && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-400/90 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {liveAgeLabel}
                {scadaEnabled ? " · polling every 10s" : ""}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                liveTimestamp
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/35"
                  : autoFillStatus === "loading"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : autoFillStatus === "ready"
                      ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                      : autoFillStatus === "error"
                        ? "bg-red-500/10 text-red-300 border-red-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-600"
              }`}
            >
              {liveTimestamp
                ? "LIVE"
                : autoFillStatus === "loading"
                  ? "Loading…"
                  : autoFillStatus === "ready"
                    ? "Auto-filled"
                    : autoFillStatus === "empty"
                      ? "No history"
                      : autoFillStatus === "error"
                        ? "Lookup failed"
                        : "Manual"}
            </span>
            {/* Future admin toggle — server still driven by SCADA_ENABLED in .env */}
            <label
              className="inline-flex items-center gap-2 text-[10px] text-slate-500 cursor-not-allowed opacity-70"
              title="Admin UI toggle coming soon. Enable via SCADA_ENABLED in .env and restart the server."
            >
              <input
                type="checkbox"
                checked={scadaEnabled}
                disabled
                readOnly
                className="rounded border-slate-600"
              />
              <span className="uppercase tracking-wider font-bold">SCADA integration</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block min-w-0 max-w-sm">
            <FieldLabelWithSource
              label="Asset Type"
              source={fieldSources.asset_type ?? null}
            />
            <div className="relative">
              <select
                value={assetType}
                onChange={(e) => {
                  markManual("asset_type");
                  setAssetType(e.target.value);
                }}
                className={selectCls}
              >
                <option value="">Select asset type…</option>
                {ASSET_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>
              Selects which telemetry groups appear below. Leave blank or choose Other to show both.
            </p>
          </label>
        </div>

        {showElectricalGroup && (
          <div>
            <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Electrical Group
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Phase A Temp"
                  source={fieldSources.phase_a_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={phaseATemp}
                    onChange={(e) => {
                      markManual("phase_a_temp");
                      setPhaseATemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Phase B Temp"
                  source={fieldSources.phase_b_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={phaseBTemp}
                    onChange={(e) => {
                      markManual("phase_b_temp");
                      setPhaseBTemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Phase C Temp"
                  source={fieldSources.phase_c_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={phaseCTemp}
                    onChange={(e) => {
                      markManual("phase_c_temp");
                      setPhaseCTemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Measured Amps"
                  source={fieldSources.measured_amps ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={measuredAmps}
                    onChange={(e) => {
                      markManual("measured_amps");
                      setMeasuredAmps(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    A
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Rated Amps"
                  source={fieldSources.rated_amps ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={ratedAmps}
                    onChange={(e) => {
                      markManual("rated_amps");
                      setRatedAmps(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    A
                  </span>
                </div>
                <p className={helperCls}>
                  Used with Measured Amps to compute I²R-normalized ΔT on the server.
                </p>
              </label>
            </div>
          </div>
        )}

        {showMechanicalGroup && (
          <div>
            <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Mechanical Group
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="DE Bearing Temp"
                  source={fieldSources.de_bearing_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={deBearingTemp}
                    onChange={(e) => {
                      markManual("de_bearing_temp");
                      setDeBearingTemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="ODE Bearing Temp"
                  source={fieldSources.ode_bearing_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={odeBearingTemp}
                    onChange={(e) => {
                      markManual("ode_bearing_temp");
                      setOdeBearingTemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Refractory Skin Temp"
                  source={fieldSources.refractory_skin_temp ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={refractorySkinTemp}
                    onChange={(e) => {
                      markManual("refractory_skin_temp");
                      setRefractorySkinTemp(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
              <label className="block min-w-0">
                <FieldLabelWithSource
                  label="Max Allowable Limit"
                  source={fieldSources.max_allowable_limit ?? null}
                />
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={maxAllowableLimit}
                    onChange={(e) => {
                      markManual("max_allowable_limit");
                      setMaxAllowableLimit(e.target.value);
                    }}
                    placeholder="—"
                    className={`${inputCls} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {tempUnit}
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}
      </AccordionShell>
    </div>
  );
}
