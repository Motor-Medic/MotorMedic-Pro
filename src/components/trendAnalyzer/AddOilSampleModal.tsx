/**
 * Modal hosting oil sample ingestion (vision dropzone + CSV uploader).
 * Opened from Trend Analyzer — keeps page body free of upload UI.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
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

export function AddOilSampleModal({
  isOpen,
  onClose,
  assetId,
  onSampleSaved
}: AddOilSampleModalProps) {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStatusMsg(null);
      setSaving(false);
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

      const hasMetals =
        m.iron != null ||
        m.copper != null ||
        m.chromium != null ||
        m.silicon != null;
      const hasFluid = f.viscosity40C != null || f.acidNumber != null;

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
            acidNumber: f.acidNumber ?? undefined
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
              Upload a lab report image (vision) or CSV — fields save to history
              automatically
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
