import React, { useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Upload } from "lucide-react";

export type VibAccordionSection = "kinematics" | "metadata" | "telemetry" | "ingestion";
export type DriveConfig = "Direct-Coupled" | "Belt-Driven" | "Gearbox-Driven";
export type VibDataSource = "upload" | "realtime" | "manual";
export type VibLoadCondition = "No Load" | "Partial Load" | "Full Load";

const DRIVE_CONFIGS: DriveConfig[] = ["Direct-Coupled", "Belt-Driven", "Gearbox-Driven"];
const SENSOR_ORIENTATIONS = [
  "Triaxial",
  "Single-Axis Horizontal",
  "Single-Axis Vertical",
  "Single-Axis Axial"
] as const;
const SENSOR_SENSITIVITY_OPTS = ["100 mV/g", "500 mV/g", "10 mV/g"] as const;
const FMAX_OPTS = ["1,000 Hz", "5,000 Hz", "10,000 Hz", "20,000 Hz"] as const;
const LOR_OPTS = ["400", "800", "1600", "3200", "6400"] as const;
const WINDOWING_OPTS = ["Hanning", "Flattop", "Rectangular"] as const;
const LINE_FREQ_OPTS = ["60 Hz", "50 Hz"] as const;
const LOAD_OPTIONS: VibLoadCondition[] = ["No Load", "Partial Load", "Full Load"];
const MAINTENANCE_TAGS = ["Alignment", "Lubrication", "Balance", "Component Replacement"] as const;
const MOUNTING_METHODS = ["Stud Mount", "Magnetic Base", "Handheld Probe"] as const;

const vibFieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const vibInput =
  "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full";
const vibSelect = `${vibInput} appearance-none cursor-pointer pr-10`;
const vibHelper = "mt-1.5 text-[11px] text-slate-500 leading-snug";

const ENVELOPING_BANDS = ["Low (gE)", "Medium (gE)", "High (gE)"] as const;
const IMAGE_AXES = ["Horizontal", "Vertical", "Axial"] as const;
const IMAGE_UNITS = [
  "Velocity (mm/s)",
  "Acceleration (g)",
  "Displacement (mils)"
] as const;

export interface VibrationInputAccordionsProps {
  openSection: VibAccordionSection | null;
  onToggleSection: (id: VibAccordionSection) => void;
  isFanOrPump: boolean;
  isExtracting?: boolean;

  vibRpm: string;
  setVibRpm: (v: string) => void;

  driveConfig: DriveConfig;
  setDriveConfig: (v: DriveConfig) => void;
  drivePulleyDia: string;
  setDrivePulleyDia: (v: string) => void;
  drivenPulleyDia: string;
  setDrivenPulleyDia: (v: string) => void;
  centerToCenter: string;
  setCenterToCenter: (v: string) => void;
  beltCount: string;
  setBeltCount: (v: string) => void;
  gearStages: string;
  setGearStages: (v: string) => void;
  toothZ1: string;
  setToothZ1: (v: string) => void;
  toothZ2: string;
  setToothZ2: (v: string) => void;
  bladeVaneCount: string;
  setBladeVaneCount: (v: string) => void;
  bearingDe: string;
  setBearingDe: (v: string) => void;
  bearingNde: string;
  setBearingNde: (v: string) => void;
  rotorBars: string;
  setRotorBars: (v: string) => void;
  statorSlots: string;
  setStatorSlots: (v: string) => void;
  lineFrequency: string;
  setLineFrequency: (v: string) => void;

  sensorOrientation: string;
  setSensorOrientation: (v: string) => void;
  sensorSensitivity: string;
  setSensorSensitivity: (v: string) => void;
  mountingMethod: string;
  setMountingMethod: (v: string) => void;
  fmax: string;
  setFmax: (v: string) => void;
  lor: string;
  setLor: (v: string) => void;
  windowing: string;
  setWindowing: (v: string) => void;
  averages: string;
  setAverages: (v: string) => void;

  loadCondition: VibLoadCondition | null;
  setLoadCondition: (v: VibLoadCondition) => void;
  loadPercentage: string;
  setLoadPercentage: (v: string) => void;
  recentMaintenance: string;
  setRecentMaintenance: (v: string) => void;
  maintenanceTags: string[];
  onToggleMaintenanceTag: (tag: string) => void;

  dataSource: VibDataSource;
  setDataSource: (v: VibDataSource) => void;
  realtimeStatus: "idle" | "connecting" | "live";
  onConnectIiot: () => void;
  uploadedFileName: string | null;
  onUploadFile: (file: File) => void;
  /** Object URL for spectrum image thumbnail (AI Vision). */
  spectrumPreviewUrl?: string | null;
  onClearSpectrum?: () => void;
  manualOverall: string;
  setManualOverall: (v: string) => void;
  manual1x: string;
  setManual1x: (v: string) => void;
  manual2x: string;
  setManual2x: (v: string) => void;
  manualPeakVue: string;
  setManualPeakVue: (v: string) => void;
  /** Selected route component (e.g. Motor DE) — shown with Database Matched badge */
  matchedComponent?: string;
  motorHp: string;
  setMotorHp: (v: string) => void;
  voltage: string;
  setVoltage: (v: string) => void;
  measurementPoint: string;
  setMeasurementPoint: (v: string) => void;
  measurementLocation: string;
  setMeasurementLocation: (v: string) => void;
  rmsVelocity: string;
  setRmsVelocity: (v: string) => void;
  peakAcceleration: string;
  setPeakAcceleration: (v: string) => void;
  operatingTemp: string;
  setOperatingTemp: (v: string) => void;
}

const dbMatchedBadge =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 ml-2";

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: VibAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: VibAccordionSection) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl mb-4 overflow-hidden hover:border-amber-500/30 transition-all">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex justify-between items-center p-4 cursor-pointer hover:bg-slate-800/40 transition-colors bg-slate-900/60"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-white uppercase tracking-wider text-left">
          {title}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-amber-400" : ""
          }`}
        />
      </button>
      {open && (
        <div className="p-6 border-t border-slate-800 bg-slate-950/40 space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function VibrationInputAccordions(props: VibrationInputAccordionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [enableEnveloping, setEnableEnveloping] = useState(false);
  const [envelopingBand, setEnvelopingBand] = useState<string>("Medium (gE)");
  const [uploadedImage, setUploadedImage] = useState(false);
  const [imageAxis, setImageAxis] = useState<string>("Horizontal");
  const [imageUnit, setImageUnit] = useState<string>("Velocity (mm/s)");
  const [captureTriggered, setCaptureTriggered] = useState(false);

  const {
    openSection,
    onToggleSection,
    isFanOrPump,
    isExtracting = false,
    vibRpm,
    setVibRpm,
    driveConfig,
    setDriveConfig,
    drivePulleyDia,
    setDrivePulleyDia,
    drivenPulleyDia,
    setDrivenPulleyDia,
    centerToCenter,
    setCenterToCenter,
    beltCount,
    setBeltCount,
    gearStages,
    setGearStages,
    toothZ1,
    setToothZ1,
    toothZ2,
    setToothZ2,
    bladeVaneCount,
    setBladeVaneCount,
    bearingDe,
    setBearingDe,
    bearingNde,
    setBearingNde,
    rotorBars,
    setRotorBars,
    statorSlots,
    setStatorSlots,
    lineFrequency,
    setLineFrequency,
    sensorOrientation,
    setSensorOrientation,
    sensorSensitivity,
    setSensorSensitivity,
    mountingMethod,
    setMountingMethod,
    fmax,
    setFmax,
    lor,
    setLor,
    windowing,
    setWindowing,
    averages,
    setAverages,
    loadCondition,
    setLoadCondition,
    loadPercentage,
    setLoadPercentage,
    recentMaintenance,
    setRecentMaintenance,
    maintenanceTags,
    onToggleMaintenanceTag,
    dataSource,
    setDataSource,
    onConnectIiot,
    uploadedFileName,
    onUploadFile,
    spectrumPreviewUrl = null,
    onClearSpectrum,
    manualOverall,
    setManualOverall,
    manual1x,
    setManual1x,
    manual2x,
    setManual2x,
    manualPeakVue,
    setManualPeakVue,
    matchedComponent,
    motorHp,
    setMotorHp,
    voltage,
    setVoltage,
    measurementPoint,
    setMeasurementPoint,
    measurementLocation,
    setMeasurementLocation,
    rmsVelocity,
    setRmsVelocity,
    peakAcceleration,
    setPeakAcceleration,
    operatingTemp,
    setOperatingTemp
  } = props;

  const [localFileName, setLocalFileName] = useState<string | null>(null);

  const previewUrl = spectrumPreviewUrl || null;
  const displayFileName = uploadedFileName || localFileName;
  const hasSpectrumPreview = Boolean(previewUrl || uploadedImage);

  const clearSpectrumPreview = () => {
    setLocalFileName(null);
    setUploadedImage(false);
    onClearSpectrum?.();
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSpectrumImage = (file?: File | null) => {
    if (!file || isExtracting) return;
    setLocalFileName(file.name);
    setUploadedImage(true);
    onUploadFile(file);
  };

  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleSpectrumImage(file);
  };

  const fmaxLabel = (fmax || "10,000 Hz").replace(/\s*Hz$/i, "") + " Hz Fmax";

  return (
    <div className="space-y-0">
      {/* Data Ingestion — permanently visible at top */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-4 hover:border-amber-500/30 transition-all space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]">
              Data Ingestion
            </p>
            <h3 className="text-sm font-bold text-white mt-1">
              Spectrum Chart / Image Upload
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Always visible — required for Master Vibration AI analysis
            </p>
          </div>
          <Upload className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
        </div>

        <div>
          <span className={vibFieldLabel}>Ingestion Method</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "upload" as const, label: "Spectrum Image" },
                { id: "realtime" as const, label: "Direct Sensor Capture" },
                { id: "manual" as const, label: "Manual Entry" }
              ] as const
            ).map((tab) => {
              const on = dataSource === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDataSource(tab.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    on
                      ? "bg-yellow-500 text-slate-900 border-yellow-500"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {dataSource === "upload" && (
          <div className="space-y-4">
            {isExtracting && (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting Telemetry Data...
              </div>
            )}
            <span className={vibFieldLabel}>Spectrum Chart Image (AI Vision)</span>
            {!hasSpectrumPreview ? (
              <button
                type="button"
                onClick={() => { if (!isExtracting) fileRef.current?.click(); }}
                onDragOver={(e) => { if (isExtracting) return; e.preventDefault(); }}
                onDrop={(e) => { if (isExtracting) return; onDropFiles(e); }}
                disabled={isExtracting}
                className={`w-full rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${isExtracting ? "border-slate-700 bg-slate-900/40 opacity-50 cursor-not-allowed" : "border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 cursor-pointer"}`}
              >
                <Upload className={`h-8 w-8 mx-auto mb-3 ${isExtracting ? "text-slate-500" : "text-yellow-400"}`} />
                <p className={`text-sm font-bold flex items-center justify-center gap-2 ${isExtracting ? "text-slate-500" : "text-white"}`}>
                  {isExtracting && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
                  {isExtracting ? "Extracting Telemetry Data..." : "Drop spectrum chart image here"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  .png, .jpg, .webp — photo or screenshot of FFT / spectrum
                </p>
              </button>
            ) : (
              <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={displayFileName || "Spectrum preview"}
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
                        {displayFileName || "spectrum.png"}
                      </span>
                      <span className="text-slate-500">|</span>
                      <span>{fmaxLabel}</span>
                      <span className="text-slate-500">|</span>
                      <span className="text-amber-300">AI Vision Ready</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={clearSpectrumPreview}
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
                    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-200/90 leading-snug">
                        <span className="font-bold text-yellow-400">AI Calibration: </span>
                        Ensure the X-axis (Hz) and Y-axis (Amplitude) scales are fully visible in
                        the crop.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block min-w-0">
                    <span className={vibFieldLabel}>Select Axis</span>
                    <div className="relative">
                      <select
                        value={imageAxis}
                        onChange={(e) => setImageAxis(e.target.value)}
                        className={vibSelect}
                      >
                        {IMAGE_AXES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                  </label>
                  <label className="block min-w-0">
                    <span className={vibFieldLabel}>Select Unit</span>
                    <div className="relative">
                      <select
                        value={imageUnit}
                        onChange={(e) => setImageUnit(e.target.value)}
                        className={vibSelect}
                      >
                        {IMAGE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                  </label>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden"
              onChange={(e) => {
                handleSpectrumImage(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {dataSource === "realtime" && (
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-yellow-500/90 mb-4">
              Hardware Connection Utility Panel
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-400 mb-4">
              📶 SENSOR MATCHED: SN-94821-DE | Status: Last Cloud Reading Available (Taken 2
              mins ago)
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white mb-4">
              📶 Active Sensor Status: Connected | Sensor ID: #TX-9042
            </div>

            <div className="bg-slate-950/50 border border-yellow-500/30 rounded-lg p-3 mb-4 text-xs text-slate-300">
              📍 Mounting Instruction: Place magnetic sensor base directly onto the flat machined
              surface of the Drive-End Bearing Housing, aligning the Arrow sticker toward the Shaft
              Axis.
            </div>

            <button
              type="button"
              onClick={() => {
                setCaptureTriggered(true);
                onConnectIiot();
              }}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm mb-4 cursor-pointer transition-colors"
            >
              ⚡ Trigger Cloud Data Capture (Take Reading Now)
            </button>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400">
              🟢 Cloud Sync Active: Streamed 3-Axis Time Waveform successfully to Asset Database
            </div>

            {captureTriggered && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-400 mt-2">
                ⚙️ Calibration Auto-Locked: Triaxial scale verified at 100 mV/g | Sampling Rate: 25.6
                kHz
              </div>
            )}
          </div>
        )}

        {dataSource === "manual" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={vibFieldLabel}>Overall Velocity (mm/s)</span>
              <input
                type="number"
                step="0.1"
                value={manualOverall}
                onChange={(e) => setManualOverall(e.target.value)}
                placeholder="4.2"
                className={vibInput}
              />
            </label>
            <label className="block">
              <span className={vibFieldLabel}>1X Amplitude (mm/s)</span>
              <input
                type="number"
                step="0.1"
                value={manual1x}
                onChange={(e) => setManual1x(e.target.value)}
                placeholder="1.8"
                className={vibInput}
              />
            </label>
            <label className="block">
              <span className={vibFieldLabel}>2X Amplitude (mm/s)</span>
              <input
                type="number"
                step="0.1"
                value={manual2x}
                onChange={(e) => setManual2x(e.target.value)}
                placeholder="0.9"
                className={vibInput}
              />
            </label>
            <label className="block">
              <span className={vibFieldLabel}>PeakVue / Peak Accel (g)</span>
              <input
                type="number"
                step="0.1"
                value={manualPeakVue}
                onChange={(e) => setManualPeakVue(e.target.value)}
                placeholder="2.4"
                className={vibInput}
              />
            </label>
          </div>
        )}
      </div>

      <AccordionShell
        id="kinematics"
        title="1. Auto-Populated Kinematics & Specs"
        open={openSection === "kinematics"}
        onToggle={onToggleSection}
      >
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center min-w-0 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">
              Component
            </span>
            <span className="text-sm font-bold text-white">
              {matchedComponent || "Motor DE"}
            </span>
            <span className={dbMatchedBadge}>✓ Database Matched</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Motor HP / kW</span>
            <input
              value={motorHp}
              onChange={(e) => setMotorHp(e.target.value)}
              placeholder="100"
              className={vibInput}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Rated RPM</span>
            <input
              type="number"
              min={1}
              value={vibRpm}
              onChange={(e) => setVibRpm(e.target.value)}
              placeholder="1780"
              className={`${vibInput} border-amber-500/40`}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Voltage</span>
            <input
              value={voltage}
              onChange={(e) => setVoltage(e.target.value)}
              placeholder="460V"
              className={vibInput}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Line Frequency</span>
            <div className="relative">
              <select
                value={lineFrequency}
                onChange={(e) => setLineFrequency(e.target.value)}
                className={vibSelect}
              >
                {LINE_FREQ_OPTS.map((f) => (
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
          <span className={vibFieldLabel}>Drive Configuration</span>
          <div className="relative max-w-md">
            <select
              value={driveConfig}
              onChange={(e) => setDriveConfig(e.target.value as DriveConfig)}
              className={vibSelect}
            >
              {DRIVE_CONFIGS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
          </div>
        </div>

        {driveConfig === "Belt-Driven" && (
          <div>
            <p className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-3">
              Kinematic Specifics — Belt Drive
            </p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Drive Pulley Dia</span>
                <input
                  value={drivePulleyDia}
                  onChange={(e) => setDrivePulleyDia(e.target.value)}
                  placeholder="in"
                  className={vibInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Driven Pulley Dia</span>
                <input
                  value={drivenPulleyDia}
                  onChange={(e) => setDrivenPulleyDia(e.target.value)}
                  placeholder="in"
                  className={vibInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Center-to-Center Dist</span>
                <input
                  value={centerToCenter}
                  onChange={(e) => setCenterToCenter(e.target.value)}
                  placeholder="in"
                  className={vibInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Belt Count</span>
                <input
                  type="number"
                  min={1}
                  value={beltCount}
                  onChange={(e) => setBeltCount(e.target.value)}
                  className={vibInput}
                />
              </label>
            </div>
          </div>
        )}

        {driveConfig === "Gearbox-Driven" && (
          <div>
            <p className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-3">
              Kinematic Specifics — Gearbox
            </p>
            <div className="grid grid-cols-3 gap-4">
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Number of Stages</span>
                <input
                  type="number"
                  min={1}
                  value={gearStages}
                  onChange={(e) => setGearStages(e.target.value)}
                  className={vibInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Tooth Count Z1</span>
                <input
                  type="number"
                  value={toothZ1}
                  onChange={(e) => setToothZ1(e.target.value)}
                  placeholder="23"
                  className={vibInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Tooth Count Z2</span>
                <input
                  type="number"
                  value={toothZ2}
                  onChange={(e) => setToothZ2(e.target.value)}
                  placeholder="67"
                  className={vibInput}
                />
              </label>
            </div>
          </div>
        )}

        {(isFanOrPump || driveConfig === "Direct-Coupled") && (
          <div>
            <p className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-3">
              Kinematic Specifics — Fan / Pump (BPF)
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <label className="block min-w-0">
                <span className={vibFieldLabel}>Number of Blades / Vanes</span>
                <input
                  type="number"
                  min={1}
                  value={bladeVaneCount}
                  onChange={(e) => setBladeVaneCount(e.target.value)}
                  placeholder="For BPF calculation"
                  className={vibInput}
                />
              </label>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Bearing Architecture
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={`${vibFieldLabel} !flex items-center flex-wrap`}>
                Drive End (DE) Bearing
                <span className={dbMatchedBadge}>✓ Database Matched</span>
              </span>
              <input
                value={bearingDe}
                onChange={(e) => setBearingDe(e.target.value)}
                placeholder="6314-C3"
                className={vibInput}
              />
            </label>
            <label className="block min-w-0">
              <span className={`${vibFieldLabel} !flex items-center flex-wrap`}>
                Non-Drive End (NDE) Bearing
                <span className={dbMatchedBadge}>✓ Database Matched</span>
              </span>
              <input
                value={bearingNde}
                onChange={(e) => setBearingNde(e.target.value)}
                placeholder="6212-C3"
                className={vibInput}
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Auto-calculates BPFO, BPFI, BSF, FTF from catalog geometry
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Motor Electricals
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Rotor Bars</span>
              <input
                type="number"
                value={rotorBars}
                onChange={(e) => setRotorBars(e.target.value)}
                placeholder="40"
                className={vibInput}
              />
            </label>
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Stator Slots</span>
              <input
                type="number"
                value={statorSlots}
                onChange={(e) => setStatorSlots(e.target.value)}
                placeholder="48"
                className={vibInput}
              />
            </label>
          </div>
        </div>
      </AccordionShell>

      <AccordionShell
        id="metadata"
        title="2. Measurement Metadata"
        open={openSection === "metadata"}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Measurement Location</span>
            <input
              value={measurementLocation}
              onChange={(e) => setMeasurementLocation(e.target.value)}
              placeholder="Motor DE"
              className={vibInput}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Measurement Point</span>
            <input
              value={measurementPoint}
              onChange={(e) => setMeasurementPoint(e.target.value)}
              placeholder="1H, 2A, 3V…"
              className={vibInput}
            />
            <p className={vibHelper}>e.g. 1H, 2A, 3V</p>
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Sensor Orientation</span>
            <div className="relative">
              <select
                value={sensorOrientation}
                onChange={(e) => setSensorOrientation(e.target.value)}
                className={vibSelect}
              >
                {SENSOR_ORIENTATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
          </label>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Sensor Physical Characteristics
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Sensitivity</span>
              <div className="relative">
                <select
                  value={sensorSensitivity}
                  onChange={(e) => setSensorSensitivity(e.target.value)}
                  className={vibSelect}
                >
                  {SENSOR_SENSITIVITY_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Mounting Method</span>
              <div className="relative">
                <select
                  value={mountingMethod}
                  onChange={(e) => setMountingMethod(e.target.value)}
                  className={vibSelect}
                >
                  {MOUNTING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Signal Processing Parameters
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Max Frequency (Fmax)</span>
              <div className="relative">
                <select
                  value={fmax}
                  onChange={(e) => setFmax(e.target.value)}
                  className={vibSelect}
                  aria-label="Max Frequency Fmax"
                >
                  {!FMAX_OPTS.includes(fmax as (typeof FMAX_OPTS)[number]) && (
                    <option value={fmax}>{fmax}</option>
                  )}
                  {FMAX_OPTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Lines of Resolution (LOR)</span>
              <div className="relative">
                <select
                  value={lor}
                  onChange={(e) => setLor(e.target.value)}
                  className={vibSelect}
                  aria-label="Lines of Resolution LOR"
                >
                  {!LOR_OPTS.includes(lor as (typeof LOR_OPTS)[number]) && (
                    <option value={lor}>{lor}</option>
                  )}
                  {LOR_OPTS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Windowing</span>
              <div className="relative">
                <select
                  value={windowing}
                  onChange={(e) => setWindowing(e.target.value)}
                  className={vibSelect}
                >
                  {WINDOWING_OPTS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
            <label className="block min-w-0">
              <span className={vibFieldLabel}>Averages</span>
              <input
                type="number"
                min={1}
                value={averages}
                onChange={(e) => setAverages(e.target.value)}
                className={vibInput}
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableEnveloping}
              onChange={(e) => setEnableEnveloping(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer accent-amber-500"
            />
            <span className="text-sm font-bold text-white">
              Enable Enveloping / Demodulation
            </span>
          </label>
          {enableEnveloping && (
            <label className="block min-w-0 max-w-md pl-7">
              <span className={vibFieldLabel}>Enveloping Band</span>
              <div className="relative">
                <select
                  value={envelopingBand}
                  onChange={(e) => setEnvelopingBand(e.target.value)}
                  className={vibSelect}
                >
                  {ENVELOPING_BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
              </div>
            </label>
          )}
        </div>
      </AccordionShell>

      <AccordionShell
        id="telemetry"
        title="3. Telemetry & Operating Context"
        open={openSection === "telemetry"}
        onToggle={onToggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block min-w-0">
            <span className={vibFieldLabel}>RMS Velocity (in/s)</span>
            <input
              value={rmsVelocity}
              onChange={(e) => {
                setRmsVelocity(e.target.value);
                setManualOverall(e.target.value);
              }}
              placeholder="0.28"
              className={vibInput}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Peak Acceleration (g)</span>
            <input
              value={peakAcceleration}
              onChange={(e) => {
                setPeakAcceleration(e.target.value);
                setManualPeakVue(e.target.value);
              }}
              placeholder="2.4"
              className={vibInput}
            />
          </label>
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Operating Temperature (°F)</span>
            <input
              value={operatingTemp}
              onChange={(e) => setOperatingTemp(e.target.value)}
              placeholder="165"
              className={vibInput}
            />
          </label>
        </div>

        <div>
          <span className={vibFieldLabel}>Load Condition</span>
          <div className="flex flex-wrap gap-2">
            {LOAD_OPTIONS.map((opt) => {
              const on = loadCondition === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setLoadCondition(opt)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    on
                      ? "bg-amber-400 text-slate-900 border-amber-400"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:border-amber-500"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-md">
          <label className="block min-w-0">
            <span className={vibFieldLabel}>Current Running Load %</span>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                value={loadPercentage}
                onChange={(e) => setLoadPercentage(e.target.value)}
                placeholder="85"
                className={`${vibInput} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                %
              </span>
            </div>
          </label>
        </div>

        <div>
          <span className={vibFieldLabel}>Historical Maintenance Log</span>
          <textarea
            value={recentMaintenance}
            onChange={(e) => setRecentMaintenance(e.target.value)}
            placeholder="Laser alignment performed yesterday, Grease added 4 hours ago..."
            className={`${vibInput} h-24 resize-y`}
          />
        </div>

        <div>
          <span className={vibFieldLabel}>Recent Maintenance Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {MAINTENANCE_TAGS.map((tag) => {
              const on = maintenanceTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleMaintenanceTag(tag)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all ${
                    on
                      ? "bg-amber-500/15 border-amber-500 text-amber-300"
                      : "bg-slate-950/60 border-slate-600 text-slate-400 hover:border-amber-500/50 hover:text-slate-200"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </AccordionShell>
    </div>
  );
}
