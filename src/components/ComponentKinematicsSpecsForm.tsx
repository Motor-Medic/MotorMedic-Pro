import { type ReactNode, useState } from "react";
import type {
  ComponentKinematics,
  CouplingType,
  EquipComponentType
} from "../data/equipmentDb";

/* ========================================================================== */
/* Extended CBM diagnostic fields (persisted on kinematics JSON payloads)      */
/* ========================================================================== */

export type CbmKinematics = ComponentKinematics & {
  insulationClass?: string;
  flowRate?: string;
  headPressure?: string;
  outputRpm?: string;
  bearingManufacturer?: string;
  bearingModel?: string;
  /** Outer race fault frequency (orders or Hz) */
  bpfo?: string;
  /** Inner race fault frequency */
  bpfi?: string;
  /** Ball / roller spin frequency */
  bsf?: string;
  /** Fundamental train / cage frequency */
  ftf?: string;
};

type KinSubTab = "limits" | "faults" | "bearings";

const INPUT =
  "w-full min-h-[42px] rounded-xl bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC700] transition-colors disabled:opacity-40";
const LABEL = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

const MOTOR_POLES = ["2", "4", "6", "8", "10", "12"] as const;
const INSULATION_CLASSES = ["A", "B", "F", "H", "N", "R"] as const;
const COUPLING_TYPES: CouplingType[] = [
  "Flexible Grid",
  "Gear",
  "Disc",
  "Direct Rigid",
  "Belt"
];

const KIN_TABS: { id: KinSubTab; label: string }[] = [
  { id: "limits", label: "⚡ Operating Limits" },
  { id: "faults", label: "🎯 Kinematics & Faults" },
  { id: "bearings", label: "🧱 Bearings & Coupling" }
];

function Field({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 min-w-0 ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="sm:col-span-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC700]/90 pt-1 border-t border-slate-800 first:border-t-0 first:pt-0">
      {children}
    </p>
  );
}

function isMotor(t: EquipComponentType) {
  return t === "Electric Motor (AC / DC / VFD)";
}

function isPump(t: EquipComponentType) {
  return (
    t === "Centrifugal Pump" || t === "Positive Displacement / Gear Pump"
  );
}

function isFan(t: EquipComponentType) {
  return t === "Fan / Blower (Centrifugal / Axial)";
}

function isGearbox(t: EquipComponentType) {
  return t === "Gearbox / Speed Reducer";
}

function isCompressor(t: EquipComponentType) {
  return t === "Screw / Reciprocating Compressor";
}

function isSpindleOrOther(t: EquipComponentType) {
  return (
    t === "Machine Tool Spindle" || t === "Other (Custom / AI Spec Search)"
  );
}

export interface ComponentKinematicsSpecsFormProps {
  value: CbmKinematics;
  onChange: (next: CbmKinematics) => void;
  componentType: EquipComponentType;
  className?: string;
}

/**
 * Advanced Kinematics & Specs — CBM diagnostic inputs by equipment type.
 * Tabs: Operating Limits · Kinematics & Faults · Bearings & Coupling
 */
export default function ComponentKinematicsSpecsForm({
  value,
  onChange,
  componentType,
  className = ""
}: ComponentKinematicsSpecsFormProps) {
  const [tab, setTab] = useState<KinSubTab>("limits");
  const kin = value;

  const patch = <K extends keyof CbmKinematics>(
    key: K,
    next: CbmKinematics[K]
  ) => onChange({ ...kin, [key]: next });

  return (
    <div
      className={`rounded-xl border border-[#FFC700]/25 bg-[#0A0E1A] p-3 sm:p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,199,0,0.06)] ${className}`}
    >
      <div className="flex flex-wrap gap-1.5">
        {KIN_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all whitespace-nowrap border ${
                on
                  ? "bg-[#FFC700]/15 text-[#FFC700] border-[#FFC700]/50 shadow-[0_0_10px_rgba(255,199,0,0.18)]"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        key={tab}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-[fadeIn_0.2s_ease]"
      >
        {/* —— Operating Limits —— */}
        {tab === "limits" && (
          <>
            <SectionTitle>Operating Limits</SectionTitle>
            <Field label="HP / kW Rating">
              <input
                className={INPUT}
                value={kin.motorHpKw ?? ""}
                onChange={(e) => patch("motorHpKw", e.target.value)}
                placeholder="150 / 112"
              />
            </Field>
            <Field label="Rated RPM">
              <input
                className={INPUT}
                value={kin.ratedRpm ?? ""}
                onChange={(e) => patch("ratedRpm", e.target.value)}
                placeholder="1780"
                inputMode="numeric"
              />
            </Field>
            <Field label="Min Operating Speed (VFD)">
              <input
                className={INPUT}
                value={kin.minOperatingRpm ?? ""}
                onChange={(e) => patch("minOperatingRpm", e.target.value)}
                placeholder="600"
                inputMode="numeric"
              />
            </Field>
            <Field label="Max Operating Speed (VFD)">
              <input
                className={INPUT}
                value={kin.maxOperatingRpm ?? ""}
                onChange={(e) => patch("maxOperatingRpm", e.target.value)}
                placeholder="3600"
                inputMode="numeric"
              />
            </Field>
            <Field label="Line Frequency">
              <div className="min-h-[42px] flex rounded-xl border border-slate-700 overflow-hidden">
                {(
                  [
                    { id: null, label: "—" },
                    { id: "50Hz" as const, label: "50Hz" },
                    { id: "60Hz" as const, label: "60Hz" }
                  ] as const
                ).map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() =>
                      patch(
                        "lineFrequency",
                        f.id === null
                          ? undefined
                          : kin.lineFrequency === f.id
                            ? undefined
                            : f.id
                      )
                    }
                    className={`flex-1 text-sm font-bold cursor-pointer transition-colors ${
                      (f.id === null && !kin.lineFrequency) ||
                      kin.lineFrequency === f.id
                        ? "bg-[#FFC700]/20 text-[#FFC700]"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="ISO Machine Class">
              <select
                className={INPUT}
                value={kin.isoClass ?? ""}
                onChange={(e) =>
                  patch(
                    "isoClass",
                    (e.target.value || undefined) as
                      | ComponentKinematics["isoClass"]
                      | undefined
                  )
                }
              >
                <option value="">—</option>
                <option value="Class I">Class I</option>
                <option value="Class II">Class II</option>
                <option value="Class III">Class III</option>
                <option value="Class IV">Class IV</option>
              </select>
            </Field>
            {isMotor(componentType) && (
              <>
                <SectionTitle>Electric Motor — Nameplate</SectionTitle>
                <Field label="Pole Count">
                  <select
                    className={INPUT}
                    value={kin.motorPoles ?? ""}
                    onChange={(e) =>
                      patch(
                        "motorPoles",
                        (e.target.value || undefined) as
                          | ComponentKinematics["motorPoles"]
                          | undefined
                      )
                    }
                  >
                    <option value="">—</option>
                    {MOTOR_POLES.map((p) => (
                      <option key={p} value={p}>
                        {p}-Pole
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Insulation Class">
                  <select
                    className={INPUT}
                    value={kin.insulationClass ?? ""}
                    onChange={(e) =>
                      patch("insulationClass", e.target.value || undefined)
                    }
                  >
                    <option value="">—</option>
                    {INSULATION_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        Class {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {isGearbox(componentType) && (
              <>
                <SectionTitle>Gearbox — Speeds</SectionTitle>
                <Field label="Input RPM">
                  <input
                    className={INPUT}
                    value={kin.inputRpm ?? ""}
                    onChange={(e) => patch("inputRpm", e.target.value)}
                    placeholder="1750"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Output RPM">
                  <input
                    className={INPUT}
                    value={kin.outputRpm ?? ""}
                    onChange={(e) => patch("outputRpm", e.target.value)}
                    placeholder="120"
                    inputMode="numeric"
                  />
                </Field>
              </>
            )}
          </>
        )}

        {/* —— Kinematics & Faults —— */}
        {tab === "faults" && (
          <>
            {isMotor(componentType) && (
              <>
                <SectionTitle>Electric Motor — Electrical Faults</SectionTitle>
                <Field label="Pole Count">
                  <select
                    className={INPUT}
                    value={kin.motorPoles ?? ""}
                    onChange={(e) =>
                      patch(
                        "motorPoles",
                        (e.target.value || undefined) as
                          | ComponentKinematics["motorPoles"]
                          | undefined
                      )
                    }
                  >
                    <option value="">—</option>
                    {MOTOR_POLES.map((p) => (
                      <option key={p} value={p}>
                        {p}-Pole
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Insulation Class">
                  <select
                    className={INPUT}
                    value={kin.insulationClass ?? ""}
                    onChange={(e) =>
                      patch("insulationClass", e.target.value || undefined)
                    }
                  >
                    <option value="">—</option>
                    {INSULATION_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        Class {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Stator Slots">
                  <input
                    className={INPUT}
                    value={kin.statorSlots ?? ""}
                    onChange={(e) => patch("statorSlots", e.target.value)}
                    placeholder="36, 48, 72"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Rotor Bars">
                  <input
                    className={INPUT}
                    value={kin.rotorBars ?? ""}
                    onChange={(e) => patch("rotorBars", e.target.value)}
                    placeholder="28, 40, 58"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="HP / kW Rating">
                  <input
                    className={INPUT}
                    value={kin.motorHpKw ?? ""}
                    onChange={(e) => patch("motorHpKw", e.target.value)}
                    placeholder="150 / 112"
                  />
                </Field>
                <Field label="Rated RPM">
                  <input
                    className={INPUT}
                    value={kin.ratedRpm ?? ""}
                    onChange={(e) => patch("ratedRpm", e.target.value)}
                    placeholder="1780"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Min VFD Speed">
                  <input
                    className={INPUT}
                    value={kin.minOperatingRpm ?? ""}
                    onChange={(e) => patch("minOperatingRpm", e.target.value)}
                    placeholder="600"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Max VFD Speed">
                  <input
                    className={INPUT}
                    value={kin.maxOperatingRpm ?? ""}
                    onChange={(e) => patch("maxOperatingRpm", e.target.value)}
                    placeholder="3600"
                    inputMode="numeric"
                  />
                </Field>
              </>
            )}

            {(isPump(componentType) || isFan(componentType)) && (
              <>
                <SectionTitle>
                  {isFan(componentType) ? "Fan / Blower" : "Pump"} — Hydraulic /
                  Aero
                </SectionTitle>
                {isPump(componentType) && (
                  <>
                    <Field label="Vane / Impeller Count">
                      <input
                        className={INPUT}
                        value={kin.impellerVanes ?? ""}
                        onChange={(e) => patch("impellerVanes", e.target.value)}
                        placeholder="5, 6, 7"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Pump Stages">
                      <input
                        className={INPUT}
                        value={kin.pumpStages ?? ""}
                        onChange={(e) => patch("pumpStages", e.target.value)}
                        placeholder="1"
                        inputMode="numeric"
                      />
                    </Field>
                  </>
                )}
                {isFan(componentType) && (
                  <Field label="Blade Count">
                    <input
                      className={INPUT}
                      value={kin.fanBladeCount ?? ""}
                      onChange={(e) => patch("fanBladeCount", e.target.value)}
                      placeholder="8, 10, 12"
                      inputMode="numeric"
                    />
                  </Field>
                )}
                <Field label="Flow Rate">
                  <input
                    className={INPUT}
                    value={kin.flowRate ?? ""}
                    onChange={(e) => patch("flowRate", e.target.value)}
                    placeholder="gpm / cfm"
                  />
                </Field>
                <Field label="Head Pressure">
                  <input
                    className={INPUT}
                    value={kin.headPressure ?? ""}
                    onChange={(e) => patch("headPressure", e.target.value)}
                    placeholder="ft / psi / in.w.g."
                  />
                </Field>
                {isFan(componentType) && (
                  <>
                    <Field label="Drive Arrangement">
                      <select
                        className={INPUT}
                        value={kin.driveArrangement ?? "Direct Drive"}
                        onChange={(e) =>
                          patch(
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
                    <Field label="Motor Sheave Ø">
                      <input
                        className={INPUT}
                        value={kin.motorSheaveDia ?? ""}
                        onChange={(e) =>
                          patch("motorSheaveDia", e.target.value)
                        }
                        disabled={kin.driveArrangement !== "Belt Drive"}
                        placeholder="in"
                      />
                    </Field>
                    <Field label="Fan Sheave Ø">
                      <input
                        className={INPUT}
                        value={kin.fanSheaveDia ?? ""}
                        onChange={(e) => patch("fanSheaveDia", e.target.value)}
                        disabled={kin.driveArrangement !== "Belt Drive"}
                        placeholder="in"
                      />
                    </Field>
                  </>
                )}
              </>
            )}

            {isGearbox(componentType) && (
              <>
                <SectionTitle>Gearbox — Mesh & Ratio</SectionTitle>
                <Field label="Input RPM">
                  <input
                    className={INPUT}
                    value={kin.inputRpm ?? ""}
                    onChange={(e) => patch("inputRpm", e.target.value)}
                    placeholder="1750"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Output RPM">
                  <input
                    className={INPUT}
                    value={kin.outputRpm ?? ""}
                    onChange={(e) => patch("outputRpm", e.target.value)}
                    placeholder="120"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Stage 1 Pinion Teeth (Z1)">
                  <input
                    className={INPUT}
                    value={kin.gearTeethZ1 ?? ""}
                    onChange={(e) => patch("gearTeethZ1", e.target.value)}
                    placeholder="19"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Stage 1 Gear Teeth (Z2)">
                  <input
                    className={INPUT}
                    value={kin.gearTeethZ2 ?? ""}
                    onChange={(e) => patch("gearTeethZ2", e.target.value)}
                    placeholder="67"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Stage 2 Pinion Teeth (Z3)">
                  <input
                    className={INPUT}
                    value={kin.gearTeethZ3 ?? ""}
                    onChange={(e) => patch("gearTeethZ3", e.target.value)}
                    placeholder="23"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Stage 2 Gear Teeth (Z4)">
                  <input
                    className={INPUT}
                    value={kin.gearTeethZ4 ?? ""}
                    onChange={(e) => patch("gearTeethZ4", e.target.value)}
                    placeholder="81"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Gear Ratio" className="sm:col-span-2">
                  <input
                    className={INPUT}
                    value={kin.gearboxRatio ?? ""}
                    onChange={(e) => patch("gearboxRatio", e.target.value)}
                    placeholder="14.6:1"
                  />
                </Field>
              </>
            )}

            {isCompressor(componentType) && (
              <>
                <SectionTitle>Compressor</SectionTitle>
                <Field label="Male Lobe Count">
                  <input
                    className={INPUT}
                    value={kin.maleLobeCount ?? ""}
                    onChange={(e) => patch("maleLobeCount", e.target.value)}
                    placeholder="4"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Female Lobe Count">
                  <input
                    className={INPUT}
                    value={kin.femaleLobeCount ?? ""}
                    onChange={(e) => patch("femaleLobeCount", e.target.value)}
                    placeholder="6"
                    inputMode="numeric"
                  />
                </Field>
              </>
            )}

            {isSpindleOrOther(componentType) && (
              <>
                <SectionTitle>Spindle / Custom</SectionTitle>
                <Field label="Custom / Spindle Class">
                  <input
                    className={INPUT}
                    value={kin.spindleClass ?? kin.customEquipmentType ?? ""}
                    onChange={(e) => {
                      patch("spindleClass", e.target.value);
                      patch("customEquipmentType", e.target.value);
                    }}
                    placeholder="ISO / custom class"
                  />
                </Field>
                <Field label="Max RPM">
                  <input
                    className={INPUT}
                    value={kin.maxOperatingRpm ?? ""}
                    onChange={(e) => patch("maxOperatingRpm", e.target.value)}
                    placeholder="24000"
                    inputMode="numeric"
                  />
                </Field>
              </>
            )}

            {!isMotor(componentType) &&
              !isPump(componentType) &&
              !isFan(componentType) &&
              !isGearbox(componentType) &&
              !isCompressor(componentType) &&
              !isSpindleOrOther(componentType) && (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  Select a component type to show type-specific kinematic fault
                  fields.
                </p>
              )}
          </>
        )}

        {/* —— Bearings & Coupling —— */}
        {tab === "bearings" && (
          <>
            <SectionTitle>Bearings & Coupling</SectionTitle>
            <Field label="Manufacturer">
              <input
                className={INPUT}
                value={kin.bearingManufacturer ?? ""}
                onChange={(e) =>
                  patch("bearingManufacturer", e.target.value)
                }
                placeholder="SKF, FAG, NSK, Timken…"
              />
            </Field>
            <Field label="Bearing Model Number">
              <input
                className={INPUT}
                value={kin.bearingModel ?? kin.bearingDe ?? ""}
                onChange={(e) => {
                  patch("bearingModel", e.target.value);
                  if (!kin.bearingDe) patch("bearingDe", e.target.value);
                }}
                placeholder="6320 C3 / 22216 E"
              />
            </Field>
            <Field label="DE Bearing Part #">
              <input
                className={INPUT}
                value={kin.bearingDe ?? ""}
                onChange={(e) => patch("bearingDe", e.target.value)}
                placeholder="SKF 6320 C3"
              />
            </Field>
            <Field label="NDE Bearing Part #">
              <input
                className={INPUT}
                value={kin.bearingNde ?? ""}
                onChange={(e) => patch("bearingNde", e.target.value)}
                placeholder="SKF 6215 C3"
              />
            </Field>
            <Field label="Thrust Bearing Part #">
              <input
                className={INPUT}
                value={kin.thrustBearing ?? ""}
                onChange={(e) => patch("thrustBearing", e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Coupling Type">
              <select
                className={INPUT}
                value={kin.couplingType ?? "Flexible Grid"}
                onChange={(e) =>
                  patch("couplingType", e.target.value as CouplingType)
                }
              >
                {COUPLING_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <SectionTitle>Fault Frequencies (orders or Hz)</SectionTitle>
            <Field label="BPFO (Outer Race)">
              <input
                className={INPUT}
                value={kin.bpfo ?? ""}
                onChange={(e) => patch("bpfo", e.target.value)}
                placeholder="e.g. 4.12 × RPM"
              />
            </Field>
            <Field label="BPFI (Inner Race)">
              <input
                className={INPUT}
                value={kin.bpfi ?? ""}
                onChange={(e) => patch("bpfi", e.target.value)}
                placeholder="e.g. 5.88 × RPM"
              />
            </Field>
            <Field label="BSF (Ball Spin)">
              <input
                className={INPUT}
                value={kin.bsf ?? ""}
                onChange={(e) => patch("bsf", e.target.value)}
                placeholder="e.g. 2.71 × RPM"
              />
            </Field>
            <Field label="FTF (Cage / Train)">
              <input
                className={INPUT}
                value={kin.ftf ?? ""}
                onChange={(e) => patch("ftf", e.target.value)}
                placeholder="e.g. 0.41 × RPM"
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
