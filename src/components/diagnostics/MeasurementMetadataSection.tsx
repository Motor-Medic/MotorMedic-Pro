import { ChevronDown } from "lucide-react";
import type React from "react";
import type { LoadCondition, Technology } from "../Diagnose";
import {
  paramInput,
  paramLabel,
  paramSelect,
  sectionHint,
  sectionTitle
} from "./intakeSectionStyles";

const LOAD_OPTIONS: LoadCondition[] = ["No Load", "Partial Load", "Full Load"];

const MEASUREMENT_LOCATIONS = [
  "Motor DE",
  "Motor NDE",
  "Pump DE",
  "Pump NDE",
  "Gearbox Input",
  "Gearbox Output",
  "Fan DE",
  "Fan NDE",
  "Coupling"
] as const;

const CRITICALITY_OPTIONS = ["Critical", "Essential", "General/Non-Critical"] as const;

const ACQ_FREQ_OPTIONS = ["0-1,000 Hz", "0-10,000 Hz", "0-50,000 Hz"] as const;
const ACQ_UNIT_OPTIONS = ["Velocity mm/s", "Acceleration g", "Displacement mils"] as const;

const MOUNTING_METHODS = ["Stud Mount", "Magnetic Base", "Handheld Probe"] as const;

const ULTRASOUND_FREQ_OPTIONS = ["20 kHz", "30 kHz", "40 kHz", "60 kHz", "100 kHz"] as const;
const ULTRASOUND_MEAS_TYPES = ["dBuV", "RMS", "Peak", "Time Waveform"] as const;
const MCA_VOLTAGE_OPTIONS = ["230V", "380V", "460V", "575V", "4160V"] as const;
const OIL_VG_OPTIONS = ["ISO VG 32", "ISO VG 46", "ISO VG 68", "ISO VG 100", "ISO VG 150", "ISO VG 220", "ISO VG 320"] as const;

export interface MeasurementMetadataSectionProps {
  activeTech: Technology;
  showAdvancedParams: boolean;
  setShowAdvancedParams: React.Dispatch<React.SetStateAction<boolean>>;
  techParamHint: string;
  loadCondition: LoadCondition | null;
  setLoadCondition: React.Dispatch<React.SetStateAction<LoadCondition | null>>;
  operatingRpm: string;
  setOperatingRpm: (value: string) => void;
  setVibRpm: (value: string) => void;
  acqFreqRange: string;
  setAcqFreqRange: (value: string) => void;
  mountingMethod: string;
  setMountingMethod: (value: string) => void;
  sensorSensitivity: string;
  setSensorSensitivity: (value: string) => void;
  measurementLocation: string;
  setMeasurementLocation: (value: string) => void;
  acqUnits: string;
  setAcqUnits: (value: string) => void;
  ambientTemp: string;
  setAmbientTemp: (value: string) => void;
  envHumidity: string;
  setEnvHumidity: (value: string) => void;
  atmPressure: string;
  setAtmPressure: (value: string) => void;
  machineCriticality: string;
  setMachineCriticality: (value: string) => void;
  timeSinceService: string;
  setTimeSinceService: (value: string) => void;
  compareBaseline: boolean;
  setCompareBaseline: React.Dispatch<React.SetStateAction<boolean>>;
  irEmissivity: string;
  setIrEmissivity: (value: string) => void;
  irReflectedTemp: string;
  setIrReflectedTemp: (value: string) => void;
  irDistance: string;
  setIrDistance: (value: string) => void;
  irHumidity: string;
  setIrHumidity: (value: string) => void;
  irAtmosphericTemp: string;
  setIrAtmosphericTemp: (value: string) => void;
  usFrequency: string;
  setUsFrequency: (value: string) => void;
  usGain: string;
  setUsGain: (value: string) => void;
  usMeasType: string;
  setUsMeasType: (value: string) => void;
  mcaParamVoltage: string;
  setMcaParamVoltage: (value: string) => void;
  mcaHp: string;
  setMcaHp: (value: string) => void;
  mcaResistance: string;
  setMcaResistance: (value: string) => void;
  mcaInductance: string;
  setMcaInductance: (value: string) => void;
  mcaPhaseAngle: string;
  setMcaPhaseAngle: (value: string) => void;
  mcaInsulation: string;
  setMcaInsulation: (value: string) => void;
  oilViscosity: string;
  setOilViscosity: (value: string) => void;
  oilWater: string;
  setOilWater: (value: string) => void;
  oilTan: string;
  setOilTan: (value: string) => void;
  oilParticleCount: string;
  setOilParticleCount: (value: string) => void;
}

export default function MeasurementMetadataSection({
  activeTech,
  showAdvancedParams,
  setShowAdvancedParams,
  techParamHint,
  loadCondition,
  setLoadCondition,
  operatingRpm,
  setOperatingRpm,
  setVibRpm,
  acqFreqRange,
  setAcqFreqRange,
  mountingMethod,
  setMountingMethod,
  sensorSensitivity,
  setSensorSensitivity,
  measurementLocation,
  setMeasurementLocation,
  acqUnits,
  setAcqUnits,
  ambientTemp,
  setAmbientTemp,
  envHumidity,
  setEnvHumidity,
  atmPressure,
  setAtmPressure,
  machineCriticality,
  setMachineCriticality,
  timeSinceService,
  setTimeSinceService,
  compareBaseline,
  setCompareBaseline,
  irEmissivity,
  setIrEmissivity,
  irReflectedTemp,
  setIrReflectedTemp,
  irDistance,
  setIrDistance,
  irHumidity,
  setIrHumidity,
  irAtmosphericTemp,
  setIrAtmosphericTemp,
  usFrequency,
  setUsFrequency,
  usGain,
  setUsGain,
  usMeasType,
  setUsMeasType,
  mcaParamVoltage,
  setMcaParamVoltage,
  mcaHp,
  setMcaHp,
  mcaResistance,
  setMcaResistance,
  mcaInductance,
  setMcaInductance,
  mcaPhaseAngle,
  setMcaPhaseAngle,
  mcaInsulation,
  setMcaInsulation,
  oilViscosity,
  setOilViscosity,
  oilWater,
  setOilWater,
  oilTan,
  setOilTan,
  oilParticleCount,
  setOilParticleCount
}: MeasurementMetadataSectionProps) {
  return (
    <section className="mb-6 transition-all duration-300">
      <button
        type="button"
        onClick={() => setShowAdvancedParams((v) => !v)}
        className={`w-full bg-slate-900 border border-white/20 p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-all duration-300 ${
          showAdvancedParams ? "rounded-t-xl" : "rounded-xl"
        }`}
        aria-expanded={showAdvancedParams}
      >
        <div className="text-left min-w-0">
          <h2 className={sectionTitle}>Advanced Measurement Parameters</h2>
          <p className={sectionHint}>
            {showAdvancedParams ? "Click to collapse" : techParamHint}
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${
            showAdvancedParams ? "rotate-180 text-yellow-400" : ""
          }`}
        />
      </button>

      {showAdvancedParams && (
        <div className="bg-slate-900/50 border border-t-0 border-white/20 rounded-b-xl p-6 space-y-4 transition-all duration-300">
          {activeTech === "vibration" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="block min-w-0 sm:col-span-2">
                  <span className={paramLabel}>Load Condition</span>
                  <div className="flex flex-wrap gap-2">
                    {LOAD_OPTIONS.map((opt) => {
                      const on = loadCondition === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setLoadCondition(opt)}
                          className={`px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all border ${
                            on
                              ? "bg-yellow-500 text-slate-900 border-yellow-500 font-bold"
                              : "bg-slate-950 border-slate-700 text-slate-400 hover:border-yellow-500"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500">Select the machine load during measurement</p>
                </div>

                <label className="block min-w-0">
                  <span className={paramLabel}>Operating Speed (RPM)</span>
                  <input
                    type="number"
                    value={operatingRpm}
                    onChange={(e) => {
                      setOperatingRpm(e.target.value);
                      setVibRpm(e.target.value);
                    }}
                    placeholder="e.g., 1780"
                    className={paramInput}
                  />
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Frequency Range</span>
                  <div className="relative">
                    <select
                      value={acqFreqRange}
                      onChange={(e) => setAcqFreqRange(e.target.value)}
                      className={paramSelect}
                    >
                      {ACQ_FREQ_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Sensor Mounting</span>
                  <div className="relative">
                    <select
                      value={mountingMethod}
                      onChange={(e) => setMountingMethod(e.target.value)}
                      className={paramSelect}
                    >
                      {MOUNTING_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500">Stud mount recommended for &gt;10kHz measurements</p>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Sensor Sensitivity</span>
                  <input
                    type="text"
                    value={sensorSensitivity}
                    onChange={(e) => setSensorSensitivity(e.target.value)}
                    placeholder="e.g., 100 mV/g"
                    className={paramInput}
                  />
                </label>

                <label className="block min-w-0">
                  <span className={`${paramLabel} flex items-center gap-2 flex-wrap`}>
                    Measurement Location
                    <span className="normal-case tracking-normal font-semibold text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                      Triaxial: H, V, Axial
                    </span>
                  </span>
                  <div className="relative">
                    <select
                      value={measurementLocation}
                      onChange={(e) => setMeasurementLocation(e.target.value)}
                      className={paramSelect}
                    >
                      {MEASUREMENT_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Measurement Units</span>
                  <div className="relative">
                    <select
                      value={acqUnits}
                      onChange={(e) => setAcqUnits(e.target.value)}
                      className={paramSelect}
                    >
                      {ACQ_UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Ambient Temperature</span>
                  <div className="relative">
                    <input
                      type="number"
                      value={ambientTemp}
                      onChange={(e) => setAmbientTemp(e.target.value)}
                      placeholder="°F"
                      className={`${paramInput} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Relative Humidity (%)</span>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={envHumidity}
                      onChange={(e) => setEnvHumidity(e.target.value)}
                      placeholder="e.g., 45"
                      className={`${paramInput} pr-8`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Atmospheric Pressure</span>
                  <div className="relative">
                    <input
                      type="number"
                      value={atmPressure}
                      onChange={(e) => setAtmPressure(e.target.value)}
                      placeholder="e.g., 1013"
                      className={`${paramInput} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">mbar</span>
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Machine Criticality</span>
                  <div className="relative">
                    <select
                      value={machineCriticality}
                      onChange={(e) => setMachineCriticality(e.target.value)}
                      className={paramSelect}
                    >
                      {CRITICALITY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                  </div>
                </label>

                <label className="block min-w-0">
                  <span className={paramLabel}>Time Since Last Service</span>
                  <input
                    type="text"
                    value={timeSinceService}
                    onChange={(e) => setTimeSinceService(e.target.value)}
                    placeholder="e.g., 4,500 hours"
                    className={paramInput}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Baseline Comparison</p>
                  <p className="text-sm text-slate-200 mt-0.5">Compare with baseline &amp; previous readings</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={compareBaseline}
                  onClick={() => setCompareBaseline((v) => !v)}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors shrink-0 ${
                    compareBaseline ? "bg-yellow-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      compareBaseline ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </>
          )}

          {activeTech === "ir" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="block min-w-0 sm:col-span-2 lg:col-span-1">
                <span className={paramLabel}>Emissivity</span>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={irEmissivity}
                    onChange={(e) => setIrEmissivity(e.target.value)}
                    className="w-full accent-yellow-500 cursor-pointer"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={irEmissivity}
                    onChange={(e) => setIrEmissivity(e.target.value)}
                    className={paramInput}
                  />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Reflected Background Temp</span>
                <div className="relative">
                  <input
                    type="number"
                    value={irReflectedTemp}
                    onChange={(e) => setIrReflectedTemp(e.target.value)}
                    className={`${paramInput} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Distance to Target</span>
                <div className="relative">
                  <input
                    type="number"
                    value={irDistance}
                    onChange={(e) => setIrDistance(e.target.value)}
                    className={`${paramInput} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">ft</span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Relative Humidity</span>
                <div className="relative">
                  <input
                    type="number"
                    value={irHumidity}
                    onChange={(e) => setIrHumidity(e.target.value)}
                    className={`${paramInput} pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Atmospheric Temp</span>
                <div className="relative">
                  <input
                    type="number"
                    value={irAtmosphericTemp}
                    onChange={(e) => setIrAtmosphericTemp(e.target.value)}
                    className={`${paramInput} pr-10`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°F</span>
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Atmospheric Pressure</span>
                <div className="relative">
                  <input
                    type="number"
                    value={atmPressure}
                    onChange={(e) => setAtmPressure(e.target.value)}
                    placeholder="e.g., 1013"
                    className={`${paramInput} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">mbar</span>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">Critical for long-range IR path correction</p>
              </label>
            </div>
          )}

          {activeTech === "ultrasound" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block min-w-0">
                <span className={paramLabel}>Frequency (kHz)</span>
                <div className="relative">
                  <select
                    value={usFrequency}
                    onChange={(e) => setUsFrequency(e.target.value)}
                    className={paramSelect}
                  >
                    {ULTRASOUND_FREQ_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Gain (dB)</span>
                <input
                  type="number"
                  value={usGain}
                  onChange={(e) => setUsGain(e.target.value)}
                  placeholder="e.g., 30"
                  className={paramInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Measurement Type</span>
                <div className="relative">
                  <select
                    value={usMeasType}
                    onChange={(e) => setUsMeasType(e.target.value)}
                    className={paramSelect}
                  >
                    {ULTRASOUND_MEAS_TYPES.filter((t) =>
                      t === "dBuV" || t === "RMS" || t === "Peak" || t === "Time Waveform"
                    ).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">dBuV / RMS preferred for trending</p>
              </label>
            </div>
          )}

          {activeTech === "mca" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block min-w-0">
                <span className={paramLabel}>Voltage</span>
                <div className="relative">
                  <select
                    value={mcaParamVoltage}
                    onChange={(e) => setMcaParamVoltage(e.target.value)}
                    className={paramSelect}
                  >
                    {MCA_VOLTAGE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Horsepower (HP)</span>
                <input type="number" value={mcaHp} onChange={(e) => setMcaHp(e.target.value)} className={paramInput} />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Resistance (Ohms)</span>
                <input type="number" value={mcaResistance} onChange={(e) => setMcaResistance(e.target.value)} className={paramInput} />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Inductance (mH)</span>
                <input type="number" value={mcaInductance} onChange={(e) => setMcaInductance(e.target.value)} className={paramInput} />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Phase Angle (Degrees)</span>
                <input type="number" value={mcaPhaseAngle} onChange={(e) => setMcaPhaseAngle(e.target.value)} className={paramInput} />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Insulation Resistance (Megohms)</span>
                <input type="number" value={mcaInsulation} onChange={(e) => setMcaInsulation(e.target.value)} className={paramInput} />
              </label>
            </div>
          )}

          {activeTech === "oil" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block min-w-0">
                <span className={paramLabel}>Viscosity Grade</span>
                <div className="relative">
                  <select
                    value={oilViscosity}
                    onChange={(e) => setOilViscosity(e.target.value)}
                    className={paramSelect}
                  >
                    {OIL_VG_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Water Content (ppm)</span>
                <input type="number" value={oilWater} onChange={(e) => setOilWater(e.target.value)} placeholder="ppm" className={paramInput} />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Total Acid Number (TAN)</span>
                <input
                  type="number"
                  step="0.01"
                  value={oilTan}
                  onChange={(e) => setOilTan(e.target.value)}
                  placeholder="mg KOH/g"
                  className={paramInput}
                />
              </label>
              <label className="block min-w-0">
                <span className={paramLabel}>Particle Count (ISO code)</span>
                <input
                  type="text"
                  value={oilParticleCount}
                  onChange={(e) => setOilParticleCount(e.target.value)}
                  placeholder="ISO 4406 e.g. 18/16/13"
                  className={paramInput}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
