import React, { useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Cog,
  Droplets,
  Upload,
  Wind,
  Zap
} from "lucide-react";

type UeAccordionSection = "mode" | "hardware" | "specific" | "ingestion";
export type UltrasoundMode = "leak" | "mechanical" | "electrical" | "valve";

const MODE_CARDS: {
  id: UltrasoundMode;
  title: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "leak", title: "Leak Detection", hint: "Compressed gas / vacuum", Icon: Wind },
  { id: "mechanical", title: "Mechanical / Bearing", hint: "Friction & lubrication", Icon: Cog },
  { id: "electrical", title: "Electrical / Arcing", hint: "Corona, tracking, arcing", Icon: Zap },
  { id: "valve", title: "Valves & Steam Traps", hint: "Pass-through & blow-by", Icon: Droplets }
];

const TRANSDUCER_TYPES = [
  "Airborne Probe (Standard)",
  "Parabolic Dish (Long-range focus)",
  "Contact/Stethoscope Module (Direct mount)",
  "Flexible Probe (Tight spaces)",
  "Acoustic Laser Array (Non-contact)"
] as const;

const HARDWARE_BRAND_PROFILES = [
  "MotorMedic Pro Sensor (Cloud Synced)",
  "UE Systems Ultraprobe Series",
  "SDT Ultrasound / CTRL Systems"
] as const;

const ORIFICE_PROFILES = [
  "Smooth/Round Hole (Coefficient 0.79)",
  "Jagged/Crack (Coefficient 0.74)",
  "Thread/Fitting Leak (Coefficient 0.65)",
  "Slit/Crack in Hose (Coefficient 0.72)",
  "Custom / Manual Entry"
] as const;

const CMMS_PAYLOAD_FORMATS = [
  "MaintainX",
  "Limble CMMS",
  "SAP PM",
  "IBM Maximo"
] as const;

const OPERATIONAL_HOURS = [
  "24/7/365 Continuous (8,760 hrs/year)",
  "2-Shift Operation (4,000 hrs/year)",
  "1-Shift Operation (2,000 hrs/year)",
  "Custom Manual Entry"
] as const;

const GAS_TYPES = ["Compressed Air", "Nitrogen", "Argon", "Steam", "Vacuum"] as const;
const GREASE_TYPES = ["Polyurea", "Lithium", "Synthetic", "None"] as const;
const VOLTAGE_CLASSES = [
  "Low Voltage <1kV",
  "Medium Voltage 1-35kV",
  "High Voltage >35kV"
] as const;
const ELEC_EQUIPMENT = [
  "Switchgear",
  "Transformer",
  "Transmission Line",
  "Motor Starter"
] as const;
const VALVE_TYPES = ["Gate", "Globe", "Ball", "Steam Trap"] as const;

const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block";
const inputCls =
  "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full";
const selectCls = `${inputCls} appearance-none cursor-pointer pr-10`;
const helperCls = "mt-1.5 text-[11px] text-slate-500 leading-snug";

function AccordionShell({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: UeAccordionSection;
  title: string;
  open: boolean;
  onToggle: (id: UeAccordionSection) => void;
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

export interface UltrasoundInputAccordionsProps {
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

export default function UltrasoundInputAccordions({
  onToast
}: UltrasoundInputAccordionsProps) {
  const [openSections, setOpenSections] = useState<UeAccordionSection[]>([
    "mode",
    "hardware"
  ]);
  const [ultrasoundMode, setUltrasoundMode] = useState<UltrasoundMode>("leak");

  // Hardware
  const [transducer, setTransducer] = useState<string>("Airborne Probe (Standard)");
  const [hardwareBrandProfile, setHardwareBrandProfile] = useState<string>(
    HARDWARE_BRAND_PROFILES[0]
  );
  const [heterodyneKhz, setHeterodyneKhz] = useState("40");
  const [gainDb, setGainDb] = useState(30);
  const [distance, setDistance] = useState("3");
  const [distanceUnit, setDistanceUnit] = useState<"ft" | "m">("ft");

  // Leak
  const [gasType, setGasType] = useState<string>("Compressed Air");
  const [operationalHours, setOperationalHours] = useState<string>(
    "24/7/365 Continuous (8,760 hrs/year)"
  );
  const [customHours, setCustomHours] = useState("");
  const [orificeProfile, setOrificeProfile] = useState<string>(
    "Smooth/Round Hole (Coefficient 0.79)"
  );
  const [customOrifice, setCustomOrifice] = useState(false);
  const [customDischargeCoeff, setCustomDischargeCoeff] = useState("");
  const [systemPressure, setSystemPressure] = useState("100");
  const [pressureUnit, setPressureUnit] = useState<"PSI" | "Bar">("PSI");
  const [costOfGas, setCostOfGas] = useState("0.25");
  const [cmmsPayloadFormat, setCmmsPayloadFormat] =
    useState<(typeof CMMS_PAYLOAD_FORMATS)[number]>("MaintainX");

  // Mechanical
  const [equipmentRpm, setEquipmentRpm] = useState("1780");
  const [greaseType, setGreaseType] = useState<string>("Polyurea");
  const [lubeState, setLubeState] = useState<"Pre-Grease" | "Post-Grease">("Pre-Grease");

  // Electrical
  const [voltageClass, setVoltageClass] = useState<string>("Medium Voltage 1-35kV");
  const [elecEquipType, setElecEquipType] = useState<string>("Switchgear");

  // Valve
  const [valveType, setValveType] = useState<string>("Steam Trap");
  const [expectedState, setExpectedState] = useState<"Normally Open" | "Normally Closed">(
    "Normally Closed"
  );

  // Ingestion
  const [wavName, setWavName] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [peakDbuV, setPeakDbuV] = useState("");
  const [rmsDbuV, setRmsDbuV] = useState("");
  const [physicalAssetTag, setPhysicalAssetTag] = useState("");
  const wavRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const toggleSection = (id: UeAccordionSection) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleWav = (file: File) => {
    if (!/\.wav$/i.test(file.name)) {
      onToast?.("Please upload a .WAV audio file.", "warning");
      return;
    }
    setWavName(file.name);
    onToast?.(`Ultrasound audio loaded: ${file.name}`, "success");
  };

  const handlePhoto = (file: File) => {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      onToast?.("Visual context must be an image (.jpg / .png).", "warning");
      return;
    }
    setPhotoName(file.name);
    onToast?.(`Visual context attached: ${file.name}`, "success");
  };

  const modeLabel = MODE_CARDS.find((m) => m.id === ultrasoundMode)?.title ?? ultrasoundMode;

  return (
    <div className="space-y-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mb-4">
        <label className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
            Target CMMS Payload Format
          </span>
          <select
            value={cmmsPayloadFormat}
            onChange={(e) =>
              setCmmsPayloadFormat(e.target.value as (typeof CMMS_PAYLOAD_FORMATS)[number])
            }
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-yellow-500 outline-none"
          >
            {CMMS_PAYLOAD_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* SECTION 1 — Application Mode */}
      <AccordionShell
        id="mode"
        title="1. Application Mode"
        open={openSections.includes("mode")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MODE_CARDS.map(({ id, title, hint, Icon }) => {
            const on = ultrasoundMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setUltrasoundMode(id)}
                className={`min-h-[110px] p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col items-start gap-2 ${
                  on
                    ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_20px_rgba(234,179,8,0.12)]"
                    : "border-white/10 bg-slate-950/50 hover:border-yellow-500/40"
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                    on
                      ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className={`text-sm font-bold leading-tight ${on ? "text-white" : "text-slate-200"}`}>
                  {title}
                </p>
                <p className="text-[11px] text-slate-500 leading-snug">{hint}</p>
              </button>
            );
          })}
        </div>
        <p className={helperCls}>
          Active mode: <span className="text-yellow-400 font-semibold">{modeLabel}</span> — Section 3
          inputs adapt automatically.
        </p>
      </AccordionShell>

      {/* SECTION 2 — Hardware & Signal Physics */}
      <AccordionShell
        id="hardware"
        title="2. Hardware & Signal Physics"
        open={openSections.includes("hardware")}
        onToggle={toggleSection}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block min-w-0 sm:col-span-2 max-w-xl">
            <span className={fieldLabel}>Sensor / Transducer Type</span>
            <div className="relative">
              <select
                value={transducer}
                onChange={(e) => setTransducer(e.target.value)}
                className={selectCls}
              >
                {TRANSDUCER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>Different sensors apply different hardware gain profiles</p>
          </label>

          <label className="block min-w-0 sm:col-span-2 max-w-xl">
            <span className={fieldLabel}>Hardware Brand Profile</span>
            <div className="relative">
              <select
                value={hardwareBrandProfile}
                onChange={(e) => setHardwareBrandProfile(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 transition-all outline-none w-full appearance-none cursor-pointer pr-10"
              >
                {HARDWARE_BRAND_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
            </div>
            <p className={helperCls}>
              Adjusts backend math scales to match physical instrument calibration.
            </p>
          </label>

          <label className="block min-w-0">
            <span className={fieldLabel}>Heterodyne Frequency (kHz)</span>
            <input
              type="number"
              min={20}
              max={100}
              step={1}
              value={heterodyneKhz}
              onChange={(e) => setHeterodyneKhz(e.target.value)}
              placeholder="e.g. 40"
              className={inputCls}
            />
            <p className={helperCls}>Tuned frequency for detection.</p>
          </label>

          <div className="block min-w-0 sm:col-span-2">
            <span className={`${fieldLabel} flex justify-between`}>
              <span>Gain / Sensitivity Setting</span>
              <span className="text-yellow-400 font-mono normal-case tracking-normal">
                {gainDb} dB
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={70}
              value={gainDb}
              onChange={(e) => setGainDb(Number(e.target.value))}
              className="w-full accent-yellow-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>0 dB</span>
              <span>70 dB</span>
            </div>
          </div>

          <label className="block min-w-0 sm:col-span-2 max-w-md">
            <span className={fieldLabel}>Distance to Target</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
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
            <p className={helperCls}>Required for airborne amplitude correction.</p>
          </label>
        </div>
      </AccordionShell>

      {/* SECTION 3 — Mode-specific (min-height to reduce layout jump) */}
      <AccordionShell
        id="specific"
        title="3. Mode-Specific Critical Inputs"
        open={openSections.includes("specific")}
        onToggle={toggleSection}
      >
        <div className="min-h-[160px]">
          {(ultrasoundMode === "mechanical" || ultrasoundMode === "valve") && (
            <div className="mb-4">
              <span className={fieldLabel}>Database Baseline Reference</span>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-slate-800 text-cyan-400 border border-cyan-500/30">
                12 dBµV
              </div>
              <p className={helperCls}>
                Mechanical bearing ultrasound is evaluated on delta over baseline. (+8 dB = Needs
                Lube, +24 dB = Severe Failure).
              </p>
            </div>
          )}

          <p className="text-xs font-bold text-yellow-400/90 uppercase tracking-wider mb-4">
            {modeLabel} parameters
          </p>

          {ultrasoundMode === "leak" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block min-w-0">
                  <span className={fieldLabel}>Gas Type</span>
                  <div className="relative">
                    <select
                      value={gasType}
                      onChange={(e) => setGasType(e.target.value)}
                      className={selectCls}
                    >
                      {GAS_TYPES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={fieldLabel}>Asset Operational Hours</span>
                  <div className="relative">
                    <select
                      value={operationalHours}
                      onChange={(e) => setOperationalHours(e.target.value)}
                      className={selectCls}
                    >
                      {OPERATIONAL_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                  <p className={helperCls}>
                    Required for accurate annualized leak cost calculation
                  </p>
                </label>
              </div>

              {operationalHours === "Custom Manual Entry" && (
                <label className="block min-w-0 max-w-xs">
                  <span className={fieldLabel}>Custom Hours / Year</span>
                  <input
                    type="number"
                    min={0}
                    max={8760}
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    placeholder="8760"
                    className={inputCls}
                  />
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="block min-w-0 sm:col-span-2 lg:col-span-1 space-y-3">
                  <label className="block min-w-0">
                    <span className={fieldLabel}>Orifice / Leak Profile</span>
                    <div className="relative">
                      <select
                        value={orificeProfile}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOrificeProfile(v);
                          setCustomOrifice(v === "Custom / Manual Entry");
                        }}
                        className={selectCls}
                      >
                        {ORIFICE_PROFILES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                    <p className={helperCls}>
                      Affects CFM flow rate calculation accuracy by up to 30%
                    </p>
                  </label>
                  {customOrifice && (
                    <label className="block min-w-0">
                      <span className={fieldLabel}>Custom Discharge Coefficient</span>
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        value={customDischargeCoeff}
                        onChange={(e) => setCustomDischargeCoeff(e.target.value)}
                        placeholder="0.75"
                        className={inputCls}
                      />
                      <p className={helperCls}>
                        Enter specific coefficient for unique leak geometry.
                      </p>
                    </label>
                  )}
                </div>

                <label className="block min-w-0">
                  <span className={fieldLabel}>System Pressure</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={systemPressure}
                      onChange={(e) => setSystemPressure(e.target.value)}
                      className={inputCls}
                    />
                    <div className="relative w-24 shrink-0">
                      <select
                        value={pressureUnit}
                        onChange={(e) => setPressureUnit(e.target.value as "PSI" | "Bar")}
                        className={selectCls}
                      >
                        <option value="PSI">PSI</option>
                        <option value="Bar">Bar</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                    </div>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={fieldLabel}>Cost of Gas ($ / 1000 SCF)</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={costOfGas}
                      onChange={(e) => setCostOfGas(e.target.value)}
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </label>
              </div>
            </div>
          )}

          {ultrasoundMode === "mechanical" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Equipment RPM</span>
                <input
                  type="number"
                  min={0}
                  value={equipmentRpm}
                  onChange={(e) => setEquipmentRpm(e.target.value)}
                  placeholder="e.g. 1780"
                  className={inputCls}
                />
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Grease Type</span>
                <div className="relative">
                  <select
                    value={greaseType}
                    onChange={(e) => setGreaseType(e.target.value)}
                    className={selectCls}
                  >
                    {GREASE_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <div className="block min-w-0">
                <span className={fieldLabel}>Lubrication State</span>
                <div className="flex flex-wrap gap-2">
                  {(["Pre-Grease", "Post-Grease"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLubeState(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        lubeState === s
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {ultrasoundMode === "electrical" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Voltage Class</span>
                <div className="relative">
                  <select
                    value={voltageClass}
                    onChange={(e) => setVoltageClass(e.target.value)}
                    className={selectCls}
                  >
                    {VOLTAGE_CLASSES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Equipment Type</span>
                <div className="relative">
                  <select
                    value={elecEquipType}
                    onChange={(e) => setElecEquipType(e.target.value)}
                    className={selectCls}
                  >
                    {ELEC_EQUIPMENT.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
            </div>
          )}

          {ultrasoundMode === "valve" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className={fieldLabel}>Valve Type</span>
                <div className="relative">
                  <select
                    value={valveType}
                    onChange={(e) => setValveType(e.target.value)}
                    className={selectCls}
                  >
                    {VALVE_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <div className="block min-w-0">
                <span className={fieldLabel}>Expected State</span>
                <div className="flex flex-wrap gap-2">
                  {(["Normally Open", "Normally Closed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setExpectedState(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        expectedState === s
                          ? "bg-yellow-500 text-slate-900 border-yellow-500"
                          : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </AccordionShell>

      {/* SECTION 4 — Data Ingestion */}
      <AccordionShell
        id="ingestion"
        title="4. High-Fidelity Data Ingestion"
        open={openSections.includes("ingestion")}
        onToggle={toggleSection}
      >
        <div>
          <span className={fieldLabel}>Manual Telemetry</span>
          <div className="grid grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={fieldLabel}>Peak dBµV</span>
              <input
                type="number"
                step={0.1}
                value={peakDbuV}
                onChange={(e) => setPeakDbuV(e.target.value)}
                placeholder="42.5"
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <span className={fieldLabel}>RMS dBµV</span>
              <input
                type="number"
                step={0.1}
                value={rmsDbuV}
                onChange={(e) => setRmsDbuV(e.target.value)}
                placeholder="28.1"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div>
          <span className={fieldLabel}>
            Audio Payload (.WAV)
            {ultrasoundMode === "leak" ? " — Optional" : ""}
          </span>
          <button
            type="button"
            onClick={() => wavRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleWav(file);
            }}
            className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="h-7 w-7 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-white">
              {ultrasoundMode === "leak"
                ? "Upload Audio Payload (.WAV) — Optional"
                : "Upload Audio Payload (.WAV)"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports: Heterodyned Audio (2-4 kHz audible range) OR Raw High-Sample Rate (96/192
              kHz)
            </p>
            {wavName && (
              <p className="mt-2 text-xs text-yellow-300 inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {wavName}
              </p>
            )}
          </button>
          {ultrasoundMode === "leak" && (
            <p className="text-xs text-cyan-400 mt-2 italic">
              Optional for Leak Detection. If no audio file is provided, AI will automatically
              calculate CFM loss using your manual Peak/RMS Decibel inputs above.
            </p>
          )}
          <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-200/90 leading-snug">
            Ensure file contains the heterodyned (frequency-shifted) ultrasound signal, not just
            ambient noise
          </div>
          <input
            ref={wavRef}
            type="file"
            accept=".wav,audio/wav"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleWav(f);
            }}
          />
        </div>

        <div>
          <span className={fieldLabel}>Visual Context</span>
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handlePhoto(file);
            }}
            className="w-full rounded-xl border border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-950/60 hover:bg-slate-950 px-6 py-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="h-7 w-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-white">
              Drop photo of valve / leak location
            </p>
            <p className="text-xs text-slate-500 mt-1">.jpg or .png for field context</p>
            {photoName && (
              <p className="mt-2 text-xs text-yellow-300 inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {photoName}
              </p>
            )}
          </button>
          <input
            ref={photoRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePhoto(f);
            }}
          />
          <label className="block min-w-0 mt-4">
            <span className={fieldLabel}>Physical Asset Tag / Component Label</span>
            <input
              type="text"
              value={physicalAssetTag}
              onChange={(e) => setPhysicalAssetTag(e.target.value)}
              placeholder="e.g., Line 4 - Lower Union Valve"
              className={inputCls}
            />
            <p className={helperCls}>
              Ensures the exact physical location is included in the CMMS work order payload.
            </p>
          </label>
        </div>
      </AccordionShell>
    </div>
  );
}
