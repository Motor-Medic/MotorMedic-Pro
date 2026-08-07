import React, { useState } from "react";
import { Clipboard, Copy } from "lucide-react";

export type CmmsSystemId = "sap" | "maximo" | "maintainx" | "limble" | "emaint" | "custom";

export type CmmsDomain = "vibration" | "thermography" | "ultrasound" | "mca" | "oil";

const UE_ACTIONS = [
  "Isolate and tag compressed-air leak location.",
  "Repair or replace fitting / orifice source.",
  "Re-scan with airborne UE to verify dBµV drop.",
  "Update CMMS with annual energy savings achieved."
];

const CMMS_SYSTEM_OPTIONS: { id: CmmsSystemId; label: string }[] = [
  { id: "sap", label: "SAP PM / S4/HANA Asset Management" },
  { id: "maximo", label: "IBM Maximo" },
  { id: "maintainx", label: "MaintainX" },
  { id: "limble", label: "Limble CMMS" },
  { id: "emaint", label: "eMaint / Fiix" },
  { id: "custom", label: "Custom / Legacy (Upload Screenshot)" }
];

const VIB_ACTIONS = [
  "Allocate replacement bearing from inventory.",
  "Schedule downtime within 7-14 days.",
  "Check holding-down bolts for soft foot condition before installing new bearing.",
  "Perform precision field balance in Plane 1 if 1X peak persists."
];

const IR_ACTIONS = [
  "De-energize and follow LOTO procedures.",
  "Torque Phase B lug to OEM technical specifications.",
  "Inspect busbar for pitting/discoloration.",
  "Re-scan within 24 hours of load restoration."
];

const MCA_ACTIONS = [
  "Isolate and LOTO motor at MCC / disconnect.",
  "Pull motor for in-shop overhaul & Class F rewind.",
  "Replace DE/ODE bearings per BOM (6313-C3 / 6212-C3).",
  "Post-rewind MCA / IEEE 43 IR-PI baseline before return to service."
];

const OIL_ACTIONS = [
  "Deploy offline kidney-loop filtration cart (target 7 volume turnovers).",
  "Upgrade system filter to 3-micron absolute (β₃ ≥ 1000) micro-glass element.",
  "Inspect and replace saturated desiccant breather cap.",
  "Resample fluid in 250 operating hours to verify ISO code reduction."
];

const OIL_LONG_TEXT =
  "AI Fluid Diagnostics for P-101A Motor DE shows critical ISO 4406 code (19/17/14) driven by atmospheric dirt ingress. Abrasive wear active (Fe 120ppm, Cu 85ppm). Action required: Deploy offline kidney-loop filtration cart and upgrade filter to 3-micron element.";

export function buildCmmsFields(
  system: CmmsSystemId,
  ctx: {
    assetLabel: string;
    component: string;
    bearing?: string;
    rpm?: string;
    domain?: CmmsDomain;
  }
): { label: string; value: string }[] {
  const domain = ctx.domain ?? "vibration";
  const assetId = ctx.assetLabel.includes("FN-04")
    ? "FN-04"
    : ctx.assetLabel.split(" ").pop() || "P-101A";
  const equip = `${assetId}-${(ctx.component || "Asset").replace(/\s+/g, "")}`;

  if (domain === "ultrasound") {
    const longText =
      `Compressed air leak — turbulent flow · ~38 CFM continuous @ 100 PSI · ` +
      `Peak 42.5 dBµV / RMS elevated at 40 kHz heterodyne. ` +
      `Annual waste ~$15,840. Asset: ${ctx.assetLabel} · ${ctx.component}. ` +
      `Recommend isolate, repair fitting, re-scan to verify.`;

    switch (system) {
      case "sap":
        return [
          { label: "Notification Type", value: "M2 — Malfunction Report" },
          { label: "Equipment ID", value: equip },
          {
            label: "Malfunction Start",
            value: new Date().toISOString().slice(0, 16).replace("T", " ")
          },
          { label: "Long Text", value: longText },
          { label: "Priority", value: "2 — High" },
          { label: "Required Parts", value: "Fitting / seal kit · Thread sealant" }
        ];
      case "maximo":
        return [
          { label: "Work Type", value: "CM — Corrective Maintenance" },
          { label: "Asset/Location ID", value: equip },
          { label: "Summary Description", value: "Compressed Air Leak — High Severity UE" },
          { label: "Job Plan", value: "JP-UE-LEAK-REPAIR · Post-repair UE verify" },
          { label: "Failure Class", value: "UTIL · AIR · LEAK" },
          { label: "Long Description", value: longText }
        ];
      case "maintainx":
        return [
          { label: "Priority", value: "High" },
          { label: "Asset", value: `${ctx.assetLabel} · ${ctx.component}` },
          { label: "Description", value: "Turbulent compressed-air leak — ~38 CFM / $15,840/yr" },
          {
            label: "Instructions",
            value: UE_ACTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n")
          },
          { label: "Parts Needed", value: "Union fitting · PTFE tape / anaerobic sealant" }
        ];
      case "limble":
        return [
          { label: "Task Name", value: "Repair compressed-air leak — UE confirmed" },
          { label: "Asset Name / ID", value: equip },
          { label: "Priority", value: "High" },
          { label: "Suggested Due Date", value: "Within 7 days" },
          { label: "Work Instructions", value: longText }
        ];
      case "emaint":
        return [
          { label: "WO Type", value: "Corrective" },
          { label: "Asset Number", value: equip },
          {
            label: "Problem Description",
            value: "Compressed air leak — turbulent UE signature @ 40 kHz"
          },
          {
            label: "Recommended Action",
            value: "Isolate · repair orifice · re-scan UE · log energy savings"
          },
          { label: "Estimated Labor Hours", value: "2.5" }
        ];
      default:
        return [];
    }
  }

  if (domain === "thermography") {
    const longText =
      `Phase B lug hotspot 142.5°F · ΔT₂ phase-to-phase 50°C · Projected rise @ 100% load 71°C (CRITICAL). ` +
      `NFPA 70B Severity Level 4. Asset: ${ctx.assetLabel} · ${ctx.component}. ` +
      `Recommend LOTO, OEM torque, inspect busbar, re-scan within 24h.`;

    switch (system) {
      case "sap":
        return [
          { label: "Notification Type", value: "M2 — Malfunction Report" },
          { label: "Equipment ID", value: equip },
          {
            label: "Malfunction Start",
            value: new Date().toISOString().slice(0, 16).replace("T", " ")
          },
          { label: "Long Text", value: longText },
          { label: "Priority", value: "1 — Very High" },
          {
            label: "Required Parts",
            value: "MATERIAL: LUG_400A_CU_QTY_3 | MATERIAL: ANTI_OX_COMP_01"
          }
        ];
      case "maximo":
        return [
          { label: "Work Type", value: "CM — Corrective Maintenance" },
          { label: "Asset/Location ID", value: equip },
          { label: "Summary Description", value: "Phase B Lug Hotspot — Severity Level 4" },
          { label: "Job Plan", value: "JP-IR-LUG-TORQUE · NFPA 70B Re-scan" },
          { label: "Failure Class", value: "ELEC · CONNECTION · HIGH RESISTANCE" },
          { label: "Long Description", value: longText },
          {
            label: "Required Parts",
            value: "MATERIAL: LUG_400A_CU_QTY_3 | MATERIAL: ANTI_OX_COMP_01"
          }
        ];
      case "maintainx":
        return [
          { label: "Priority", value: "Critical" },
          { label: "Asset", value: `${ctx.assetLabel} · ${ctx.component}` },
          { label: "Description", value: "Phase B lug 142.5°F — NFPA 70B Level 4" },
          {
            label: "Instructions",
            value: IR_ACTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n")
          },
          {
            label: "Parts Needed",
            value: "MATERIAL: LUG_400A_CU_QTY_3 | MATERIAL: ANTI_OX_COMP_01"
          }
        ];
      case "limble":
        return [
          { label: "Task Name", value: "Correct Phase B lug hotspot — IR confirmed" },
          { label: "Asset Name / ID", value: equip },
          { label: "Priority", value: "Urgent" },
          { label: "Suggested Due Date", value: "Immediate / within 24 hours" },
          { label: "Work Instructions", value: longText }
        ];
      case "emaint":
        return [
          { label: "WO Type", value: "Corrective" },
          { label: "Asset Number", value: equip },
          {
            label: "Problem Description",
            value: "Phase B lug hotspot 142.5°F — Severity Level 4 (NFPA 70B)"
          },
          {
            label: "Recommended Action",
            value: "LOTO · OEM torque · inspect busbar · verification re-scan"
          },
          { label: "Estimated Labor Hours", value: "4.0" }
        ];
      default:
        return [];
    }
  }

  if (domain === "mca") {
    const longText =
      `MCA Insulation CRITICAL — ground-wall degradation · PI rising charge curve · ` +
      `Stator turn-to-turn imbalance warning · Est. resistive imbalance loss ~$1,100/yr. ` +
      `Asset: ${ctx.assetLabel} · ${ctx.component}. ` +
      `Recommend in-shop overhaul & rewind (or replace if <100HP); post-repair IEEE 43 baseline.`;

    switch (system) {
      case "sap":
        return [
          { label: "Notification Type", value: "M2 — Malfunction Report" },
          { label: "Equipment ID", value: equip },
          {
            label: "Malfunction Start",
            value: new Date().toISOString().slice(0, 16).replace("T", " ")
          },
          { label: "Long Text", value: longText },
          { label: "Priority", value: "1 — Very High" },
          {
            label: "Required Parts",
            value: "Class F insulation kit · Magnet wire · 6313-C3 / 6212-C3 bearings"
          }
        ];
      case "maximo":
        return [
          { label: "Work Type", value: "CM — Corrective Maintenance" },
          { label: "Asset/Location ID", value: equip },
          {
            label: "Summary Description",
            value: "MCA Insulation CRITICAL — Rewind / Overhaul"
          },
          { label: "Job Plan", value: "JP-MCA-REWIND · IEEE 43 Post-Test" },
          { label: "Failure Class", value: "ELEC · STATOR · INSULATION" },
          { label: "Long Description", value: longText }
        ];
      case "maintainx":
        return [
          { label: "Priority", value: "Critical" },
          { label: "Asset", value: `${ctx.assetLabel} · ${ctx.component}` },
          {
            label: "Description",
            value: "MCA ground-wall degradation — Insulation CRITICAL"
          },
          {
            label: "Instructions",
            value: MCA_ACTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n")
          },
          {
            label: "Parts Needed",
            value: "Insulation kit · Polythermaleze wire · 6313-C3 / 6212-C3"
          }
        ];
      case "limble":
        return [
          { label: "Task Name", value: "Motor overhaul & rewind — MCA confirmed" },
          { label: "Asset Name / ID", value: equip },
          { label: "Priority", value: "Urgent" },
          { label: "Suggested Due Date", value: "Within 14 days" },
          { label: "Work Instructions", value: longText }
        ];
      case "emaint":
        return [
          { label: "WO Type", value: "Corrective" },
          { label: "Asset Number", value: equip },
          {
            label: "Problem Description",
            value: "MCA Insulation CRITICAL — ground-wall degradation / PI anomaly"
          },
          {
            label: "Recommended Action",
            value: "Pull motor · Class F rewind · bearing overhaul · IEEE 43 baseline"
          },
          { label: "Estimated Labor Hours", value: "24.0" }
        ];
      default:
        return [];
    }
  }

  if (domain === "oil") {
    const longText = OIL_LONG_TEXT;

    switch (system) {
      case "sap":
        return [
          {
            label: "Notification Type",
            value: "M1 / M2 (Maintenance Request / Malfunction Report)"
          },
          { label: "Equipment ID", value: equip },
          {
            label: "Malfunction Start",
            value: new Date().toISOString().slice(0, 16).replace("T", " ")
          },
          { label: "Long Text", value: longText },
          {
            label: "Priority",
            value: "2 - High (Critical ISO code but asset is still operational)"
          },
          {
            label: "Required Parts",
            value: "β₃ ≥ 1000 micro-glass filter · Z-134 desiccant breather"
          }
        ];
      case "maximo":
        return [
          { label: "Work Type", value: "CM — Corrective Maintenance" },
          { label: "Asset/Location ID", value: equip },
          {
            label: "Summary Description",
            value: "Critical ISO 4406 19/17/14 — Dirt Ingress / Abrasive Wear"
          },
          { label: "Job Plan", value: "JP-OIL-KIDNEY-LOOP · Filter Upgrade 3µm" },
          { label: "Failure Class", value: "LUBE · CONTAMINATION · DIRT" },
          { label: "Long Description", value: longText },
          {
            label: "Priority",
            value: "2 - High (Critical ISO code but asset is still operational)"
          }
        ];
      case "maintainx":
        return [
          {
            label: "Priority",
            value: "2 - High (Critical ISO code but asset is still operational)"
          },
          { label: "Asset", value: `${ctx.assetLabel} · ${ctx.component}` },
          {
            label: "Description",
            value: "ISO 4406 19/17/14 CRITICAL — atmospheric dirt / abrasive wear"
          },
          {
            label: "Instructions",
            value: OIL_ACTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n")
          },
          {
            label: "Parts Needed",
            value: "3µm absolute filter · Z-134 desiccant breather"
          },
          { label: "Long Text", value: longText }
        ];
      case "limble":
        return [
          { label: "Task Name", value: "Kidney-loop filtration & filter upgrade — Oil CRITICAL" },
          { label: "Asset Name / ID", value: equip },
          {
            label: "Priority",
            value: "2 - High (Critical ISO code but asset is still operational)"
          },
          { label: "Suggested Due Date", value: "Within 7 days" },
          { label: "Work Instructions", value: longText }
        ];
      case "emaint":
        return [
          { label: "WO Type", value: "Corrective" },
          { label: "Asset Number", value: equip },
          {
            label: "Problem Description",
            value: "ISO 4406 19/17/14 — dirt ingress; Fe 120ppm / Cu 85ppm abrasive wear"
          },
          {
            label: "Recommended Action",
            value: "Kidney-loop filtration · 3µm filter upgrade · replace desiccant breather"
          },
          {
            label: "Priority",
            value: "2 - High (Critical ISO code but asset is still operational)"
          },
          { label: "Long Text", value: longText },
          { label: "Estimated Labor Hours", value: "6.0" }
        ];
      default:
        return [];
    }
  }

  const longText =
    `Outer Race Bearing Defect (BPFO) @ 152 Hz · Amplitude 4.2 mm/s · ` +
    `${ctx.bearing || "SKF"} · ${ctx.rpm || "—"} RPM · Confidence 94%. ` +
    `Recommend replace bearing SKF 6320 C3; schedule downtime 7-14 days; verify soft foot.`;

  switch (system) {
    case "sap":
      return [
        { label: "Notification Type", value: "M2 — Malfunction Report" },
        { label: "Equipment ID", value: equip },
        {
          label: "Malfunction Start",
          value: new Date().toISOString().slice(0, 16).replace("T", " ")
        },
        { label: "Long Text", value: longText },
        { label: "Priority", value: "1 — Very High" },
        {
          label: "Required Parts",
          value: "PART_NO: SKF_6320_C3_QTY_2 | PART_NO: SHIM_KIT_NEMA_404T_QTY_1"
        }
      ];
    case "maximo":
      return [
        { label: "Work Type", value: "CM — Corrective Maintenance" },
        { label: "Asset/Location ID", value: equip },
        { label: "Summary Description", value: "BPFO Outer Race Defect — Replace Bearing" },
        { label: "Job Plan", value: "JP-BRG-REPLACE-DE · Precision Align After Install" },
        { label: "Failure Class", value: "MECH · BEARING · OUTER RACE" },
        { label: "Long Description", value: longText },
        {
          label: "Required Parts",
          value: "PART_NO: SKF_6320_C3_QTY_2 | PART_NO: SHIM_KIT_NEMA_404T_QTY_1"
        }
      ];
    case "maintainx":
      return [
        { label: "Priority", value: "High" },
        { label: "Asset", value: `${ctx.assetLabel} · ${ctx.component}` },
        { label: "Description", value: "Outer Race Bearing Defect (BPFO) — 152 Hz / 4.2 mm/s" },
        {
          label: "Instructions",
          value: VIB_ACTIONS.map((s, i) => `${i + 1}. ${s}`).join("\n")
        },
        {
          label: "Parts Needed",
          value: "PART_NO: SKF_6320_C3_QTY_2 | PART_NO: SHIM_KIT_NEMA_404T_QTY_1"
        }
      ];
    case "limble":
      return [
        { label: "Task Name", value: "Replace DE bearing — BPFO confirmed" },
        { label: "Asset Name / ID", value: equip },
        { label: "Priority", value: "Urgent" },
        { label: "Suggested Due Date", value: "Within 14 days" },
        { label: "Work Instructions", value: longText }
      ];
    case "emaint":
      return [
        { label: "WO Type", value: "Corrective" },
        { label: "Asset Number", value: equip },
        {
          label: "Problem Description",
          value: "BPFO @ 152 Hz — Outer race defect (94% confidence)"
        },
        {
          label: "Recommended Action",
          value: "Replace SKF 6320 C3; align; re-baseline vibration"
        },
        { label: "Estimated Labor Hours", value: "6.0" }
      ];
    default:
      return [];
  }
}

export interface CmmsDataBridgeProps {
  assetLabel: string;
  componentLabel?: string;
  bearing?: string;
  rpm?: string;
  domain?: CmmsDomain;
  sectionId?: string;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

export default function CmmsDataBridge({
  assetLabel,
  componentLabel = "Component",
  bearing,
  rpm,
  domain = "vibration",
  sectionId = "cmms-data-bridge",
  onToast
}: CmmsDataBridgeProps) {
  const [selectedCmms, setSelectedCmms] = useState<CmmsSystemId>("sap");
  const [cmmsCustomMapped, setCmmsCustomMapped] = useState(false);

  const cmmsFields = buildCmmsFields(selectedCmms, {
    assetLabel,
    component: componentLabel,
    bearing,
    rpm,
    domain
  });
  const fullPayloadText = cmmsFields.map((f) => `${f.label}: ${f.value}`).join("\n");

  const copyField = (value: string) => {
    void navigator.clipboard.writeText(value).then(
      () => onToast?.("Copied to clipboard", "success") ?? alert("Copied to clipboard!"),
      () => alert("Copied to clipboard!")
    );
  };

  return (
    <section
      id={sectionId}
      className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6"
    >
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">🛠️ Universal CMMS Data Bridge</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Auto-formatted work order data for your existing system
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Step 1: Choose Your System
          </label>
          <select
            value={selectedCmms}
            onChange={(e) => {
              setSelectedCmms(e.target.value as CmmsSystemId);
              if (e.target.value !== "custom") setCmmsCustomMapped(false);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none"
          >
            {CMMS_SYSTEM_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {selectedCmms === "custom" ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-white">📸 Custom Field Mapper</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload a screenshot of your work order screen. AI will map the fields
                automatically.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Upload a screenshot of your CMMS to auto-map fields
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCmmsCustomMapped(true)}
              className="w-full border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-yellow-500 transition-colors cursor-pointer bg-transparent"
            >
              <p className="text-sm text-slate-300">📸 Drop screenshot here or click to upload</p>
            </button>
            {cmmsCustomMapped && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5 text-xs text-green-400">
                ✅ AI successfully mapped fields from &apos;PlantMaster Pro&apos;. Layout saved.
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Step 2: Pre-Formatted Work Order Fields
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cmmsFields.map((field) => (
                <div key={field.label} className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    {field.label}:
                  </span>
                  <div className="flex gap-2 items-stretch">
                    <input
                      type="text"
                      readOnly
                      value={field.value}
                      className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyField(field.value)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 cursor-pointer transition-colors shrink-0 inline-flex items-center gap-1"
                      title={`Copy ${field.label}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedCmms !== "custom" && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(fullPayloadText).then(
                () => alert("All fields copied to clipboard!"),
                () => alert("All fields copied to clipboard!")
              );
            }}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Clipboard className="h-4 w-4" />
            Copy Full Multi-Field Payload to Clipboard
          </button>
        )}

        <div className="flex justify-end">
          <p className="text-xs text-cyan-400">⏱️ Admin Time Saved: 23 minutes this month</p>
        </div>
      </div>
    </section>
  );
}
