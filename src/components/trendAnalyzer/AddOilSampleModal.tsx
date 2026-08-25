/**
 * Modal hosting oil sample ingestion (vision dropzone + CSV uploader).
 * Opened from Trend Analyzer — keeps page body free of upload UI.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { parseIsoCode } from "../../lib/oilAnalysisMetrics";
import {
  MORPH_CATEGORIES,
  MORPH_SEVERITIES,
  type MorphCategoryKey,
  type MorphSeverity
} from "../../types/oilAnalysis";
import type { OilReportData } from "../../types/oilVision";
import OilCsvUploader from "./OilCsvUploader";
import OilVisionDropzone from "./OilVisionDropzone";

const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";

export interface AddOilSampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  onSampleSaved: () => void;
}

type IngestMode = "upload" | "manual";

const MANUAL_FIELDS = [
  { key: "iron", label: "Iron (Fe)", unit: "ppm" },
  { key: "copper", label: "Copper (Cu)", unit: "ppm" },
  { key: "chromium", label: "Chromium (Cr)", unit: "ppm" },
  { key: "lead", label: "Lead (Pb)", unit: "ppm" },
  { key: "aluminum", label: "Aluminum (Al)", unit: "ppm" },
  { key: "silicon", label: "Silicon (Si)", unit: "ppm" },
  { key: "tin", label: "Tin (Sn)", unit: "ppm" },
  { key: "nickel", label: "Nickel (Ni)", unit: "ppm" },
  { key: "viscosity40C", label: "Viscosity @40°C", unit: "cSt" },
  { key: "viscosity100C", label: "Viscosity @100°C", unit: "cSt" },
  { key: "viscosityIndex", label: "Viscosity Index", unit: "VI" },
  { key: "acidNumber", label: "TAN", unit: "mg KOH/g" },
  { key: "tbn", label: "TBN", unit: "mg KOH/g" },
  { key: "waterPpm", label: "Water", unit: "ppm" },
  { key: "oxidation", label: "Oxidation", unit: "Abs/cm" },
  { key: "nitration", label: "Nitration", unit: "Abs/cm" },
  { key: "iso4um", label: "ISO >4μm", unit: "code" },
  { key: "iso6um", label: "ISO >6μm", unit: "code" },
  { key: "iso14um", label: "ISO >14μm", unit: "code" },
  { key: "particles4um", label: "Particles >4μm", unit: "/mL" },
  { key: "particles6um", label: "Particles >6μm", unit: "/mL" },
  { key: "particles14um", label: "Particles >14μm", unit: "/mL" },
  { key: "drLarge", label: "DR Large (DL)", unit: "" },
  { key: "drSmall", label: "DR Small (DS)", unit: "" },
  { key: "mpcDeltaE", label: "MPC ΔE", unit: "ΔE" },
  { key: "rulerPercent", label: "RULER", unit: "%" },
  { key: "ucRating", label: "UC Rating", unit: "0-8 scale" }
] as const;

type ManualFieldKey = (typeof MANUAL_FIELDS)[number]["key"];
type ManualTextKey = "sampleDate" | "operatingHours" | "ferrographImageUrl";
type ManualForm = Record<ManualFieldKey | ManualTextKey, string>;

const EMPTY_MANUAL_FORM = (): ManualForm =>
  ({
    sampleDate: new Date().toISOString().slice(0, 10),
    operatingHours: "",
    ferrographImageUrl: "",
    ...Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, ""]))
  }) as ManualForm;

const EMPTY_MORPHOLOGY = (): Record<MorphCategoryKey, MorphSeverity> =>
  Object.fromEntries(
    MORPH_CATEGORIES.map((c) => [c.key, "not_detected"])
  ) as Record<MorphCategoryKey, MorphSeverity>;

export function AddOilSampleModal({
  isOpen,
  onClose,
  assetId,
  onSampleSaved
}: AddOilSampleModalProps) {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<IngestMode>("upload");
  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL_FORM);
  const [manualMorphology, setManualMorphology] = useState(EMPTY_MORPHOLOGY);

  useEffect(() => {
    if (!isOpen) {
      setStatusMsg(null);
      setSaving(false);
      setMode("upload");
      setManualForm(EMPTY_MANUAL_FORM());
      setManualMorphology(EMPTY_MORPHOLOGY());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const finishSaved = useCallback(() => {
    onSampleSaved();
    onClose();
  }, [onSampleSaved, onClose]);

  const saveVisionSample = useCallback(
    async (data: OilReportData) => {
      if (!assetId) return;
      const m = data.metals;
      const f = data.fluidProperties;
      const o = data.operatingParams;
      const sampleDate =
        data.header.sampleDate || new Date().toISOString().slice(0, 10);
      const operatingHours = o.operatingHours ?? 0;

      const iso = parseIsoCode(f.particleCountIso4406);

      const hasMetals =
        m.iron != null ||
        m.copper != null ||
        m.chromium != null ||
        m.silicon != null;
      const hasFluid =
        f.viscosity40C != null ||
        f.acidNumber != null ||
        f.baseNumber != null ||
        f.waterPpm != null ||
        f.oxidation != null ||
        f.nitration != null ||
        f.particles4um != null ||
        f.particles6um != null ||
        f.particles14um != null ||
        iso != null;

      if (!hasMetals && !hasFluid) {
        setStatusMsg(
          "Vision extract found no wear metals or fluid chemistry — try another image or CSV."
        );
        return;
      }

      setSaving(true);
      setStatusMsg(null);
      try {
        const res = await fetch(OIL_ANALYSIS_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            sampleDate,
            operatingHours,
            iron: m.iron ?? 0,
            copper: m.copper ?? 0,
            chromium: m.chromium ?? 0,
            lead: m.lead ?? 0,
            aluminum: m.aluminum ?? 0,
            silicon: m.silicon ?? 0,
            tin: m.tin ?? undefined,
            nickel: m.nickel ?? undefined,
            viscosity40C: f.viscosity40C ?? undefined,
            viscosity100C: f.viscosity100C ?? undefined,
            viscosityIndex: f.viscosityIndex ?? undefined,
            acidNumber: f.acidNumber ?? undefined,
            tbn: f.baseNumber ?? undefined,
            waterPpm: f.waterPpm ?? undefined,
            oxidation: f.oxidation ?? undefined,
            nitration: f.nitration ?? undefined,
            iso4um: iso?.[0],
            iso6um: iso?.[1],
            iso14um: iso?.[2],
            particles4um: f.particles4um ?? undefined,
            particles6um: f.particles6um ?? undefined,
            particles14um: f.particles14um ?? undefined
          })
        });
        if (!res.ok) throw new Error("Failed to save vision sample");
        setStatusMsg(
          `Saved sample from ${data.formatDetected} report (confidence ${data.confidenceScore}%).`
        );
        finishSaved();
      } catch (err) {
        setStatusMsg(
          err instanceof Error ? err.message : "Failed to save extracted sample"
        );
      } finally {
        setSaving(false);
      }
    },
    [assetId, finishSaved]
  );

  const saveManualSample = useCallback(async () => {
    if (!assetId) return;

    const numeric = (raw: string): number | undefined => {
      const trimmed = raw.trim();
      if (trimmed === "") return undefined;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : undefined;
    };

    if (!manualForm.sampleDate) {
      setStatusMsg("Sample date is required.");
      return;
    }

    const morphology = Object.fromEntries(
      Object.entries(manualMorphology).filter(
        ([, severity]) => severity !== "not_detected"
      )
    );

    const hasAnyValue =
      MANUAL_FIELDS.some((f) => numeric(manualForm[f.key]) != null) ||
      Object.keys(morphology).length > 0 ||
      manualForm.ferrographImageUrl.trim() !== "";
    if (!hasAnyValue) {
      setStatusMsg("Enter at least one measured value before saving.");
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(OIL_ANALYSIS_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          sampleDate: manualForm.sampleDate,
          operatingHours: numeric(manualForm.operatingHours) ?? 0,
          iron: numeric(manualForm.iron) ?? 0,
          copper: numeric(manualForm.copper) ?? 0,
          chromium: numeric(manualForm.chromium) ?? 0,
          lead: numeric(manualForm.lead) ?? 0,
          aluminum: numeric(manualForm.aluminum) ?? 0,
          silicon: numeric(manualForm.silicon) ?? 0,
          tin: numeric(manualForm.tin),
          nickel: numeric(manualForm.nickel),
          viscosity40C: numeric(manualForm.viscosity40C),
          viscosity100C: numeric(manualForm.viscosity100C),
          viscosityIndex: numeric(manualForm.viscosityIndex),
          acidNumber: numeric(manualForm.acidNumber),
          tbn: numeric(manualForm.tbn),
          waterPpm: numeric(manualForm.waterPpm),
          oxidation: numeric(manualForm.oxidation),
          nitration: numeric(manualForm.nitration),
          iso4um: numeric(manualForm.iso4um),
          iso6um: numeric(manualForm.iso6um),
          iso14um: numeric(manualForm.iso14um),
          particles4um: numeric(manualForm.particles4um),
          particles6um: numeric(manualForm.particles6um),
          particles14um: numeric(manualForm.particles14um),
          drLarge: numeric(manualForm.drLarge),
          drSmall: numeric(manualForm.drSmall),
          mpcDeltaE: numeric(manualForm.mpcDeltaE),
          rulerPercent: numeric(manualForm.rulerPercent),
          ucRating: numeric(manualForm.ucRating),
          morphology,
          ferrographImageUrl:
            manualForm.ferrographImageUrl.trim() || undefined
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to save sample");
      }
      finishSaved();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Failed to save sample");
    } finally {
      setSaving(false);
    }
  }, [assetId, manualForm, manualMorphology, finishSaved]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-oil-sample-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              Data Ingestion
            </p>
            <h2
              id="add-oil-sample-title"
              className="text-lg font-bold text-white mt-0.5"
            >
              Add Oil Sample
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Upload a lab report image (vision) or CSV, or key in values
              manually — everything saves to sample history
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white hover:border-slate-500 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!assetId ? (
            <p className="text-sm text-amber-400">
              Select an asset in Trend Analyzer before adding a sample.
            </p>
          ) : (
            <>
              <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
                {(
                  [
                    ["upload", "Upload (Image / CSV)"],
                    ["manual", "Manual Entry"]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value);
                      setStatusMsg(null);
                    }}
                    className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                      mode === value
                        ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "upload" ? (
                <>
                  <OilVisionDropzone
                    disabled={!assetId || saving}
                    onExtracted={(data) => void saveVisionSample(data)}
                    onError={(msg) => setStatusMsg(msg)}
                  />
                  <OilCsvUploader
                    assetId={assetId}
                    onUploadComplete={finishSaved}
                  />
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Sample Date
                      </span>
                      <input
                        type="date"
                        value={manualForm.sampleDate}
                        onChange={(e) =>
                          setManualForm((prev) => ({
                            ...prev,
                            sampleDate: e.target.value
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Operating Hours
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={manualForm.operatingHours}
                        onChange={(e) =>
                          setManualForm((prev) => ({
                            ...prev,
                            operatingHours: e.target.value
                          }))
                        }
                        placeholder="0"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {MANUAL_FIELDS.map((field) => (
                      <label key={field.key} className="block">
                        {/* normal-case: uppercase mangles the µm unit symbol */}
                        <span className="text-[11px] font-semibold normal-case tracking-wide text-slate-500">
                          {field.label}
                        </span>
                        <div className="relative mt-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={manualForm[field.key]}
                            onChange={(e) =>
                              setManualForm((prev) => ({
                                ...prev,
                                [field.key]: e.target.value
                              }))
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-14 text-sm text-white focus:border-cyan-500 focus:outline-none"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                            {field.unit}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Wear Particle Morphology
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {MORPH_CATEGORIES.map((cat) => (
                        <label key={cat.key} className="block">
                          <span className="text-[11px] font-semibold normal-case tracking-wide text-slate-500">
                            {cat.label}
                          </span>
                          <select
                            value={manualMorphology[cat.key]}
                            onChange={(e) =>
                              setManualMorphology((prev) => ({
                                ...prev,
                                [cat.key as MorphCategoryKey]: e.target
                                  .value as MorphSeverity
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
                          >
                            {MORPH_SEVERITIES.map((sev) => (
                              <option key={sev} value={sev}>
                                {sev.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-semibold normal-case tracking-wide text-slate-500">
                      Ferrogram Image URL
                    </span>
                    <input
                      type="url"
                      value={manualForm.ferrographImageUrl}
                      onChange={(e) =>
                        setManualForm((prev) => ({
                          ...prev,
                          ferrographImageUrl: e.target.value
                        }))
                      }
                      placeholder="https://…"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveManualSample()}
                    className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {saving ? "Saving…" : "Save Sample"}
                  </button>
                </div>
              )}
            </>
          )}
          {statusMsg && (
            <p className="text-xs text-slate-400 px-1">{statusMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddOilSampleModal;
