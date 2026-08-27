/**
 * Zero-click oil lab report image dropzone — auto POST vision-extract on drop/select.
 * Matches MCA Run Diagnostics ingestion pattern (no manual submit).
 */

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import type { OilReportData } from "../../types/oilVision";

const OIL_VISION_API_PATH = "/api/oil-analysis/vision-extract";

export interface OilVisionDropzoneProps {
  disabled?: boolean;
  activeAssetId?: string;
  onParsingChange?: (parsing: boolean) => void;
  onExtracted: (data: OilReportData, fileName: string) => void;
  onError?: (message: string) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Failed to read oil report image as base64."));
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File): boolean {
  return (
    /^image\//i.test(file.type) ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
  );
}

export function OilVisionDropzone({
  disabled,
  activeAssetId,
  onParsingChange,
  onExtracted,
  onError
}: OilVisionDropzoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [extractBanner, setExtractBanner] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const activeAssetRef = useRef(activeAssetId);
  activeAssetRef.current = activeAssetId;
  const notifyParsing = (v: boolean) => {
    setParsing(v);
    onParsingChange?.(v);
  };

  const clearPreview = useCallback(() => {
    setUploadPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadName(null);
    setExtractBanner(null);
    setExtractError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleImage = useCallback(
    async (file: File | null | undefined) => {
      if (!file || disabled || parsing) return;

      if (!isImageFile(file)) {
        const msg = "Upload a lab report screenshot (.png / .jpg / .webp). Verify manually.";
        setExtractError(msg);
        onError?.(msg);
        return;
      }

      const capturedAssetId = activeAssetRef.current || "";
      setExtractError(null);
      setExtractBanner(null);
      setUploadName(file.name);

      const preview = URL.createObjectURL(file);
      setUploadPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return preview;
      });

      notifyParsing(true);
      try {
        const imageBase64 = await fileToBase64(file);
        const res = await fetch(OIL_VISION_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            fileName: file.name
          })
        });

        // --- STALE-EXTRACTION RACE GUARD ---
        if (capturedAssetId && activeAssetRef.current !== capturedAssetId) {
          const discardMsg = "Extraction discarded - asset changed";
          setExtractError(discardMsg);
          onError?.(discardMsg);
          return;
        }

        const result = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: OilReportData;
          message?: string;
          error?: string;
        };

        if (!res.ok || !result.success || !result.data) {
          const msg =
            result.message ||
            result.error ||
            `Vision extraction failed (${res.status}). Verify manually.`;
          setExtractError(msg);
          onError?.(msg);
          return;
        }

        if (capturedAssetId && activeAssetRef.current !== capturedAssetId) {
          onError?.("Extraction discarded - asset changed");
          return;
        }

        onExtracted(result.data, file.name);
        setExtractBanner(
          `Auto-filled from ${result.data.formatDetected} report (confidence ${result.data.confidenceScore}%)`
        );
      } catch (err) {
        if (capturedAssetId && activeAssetRef.current !== capturedAssetId) {
          onError?.("Extraction discarded - asset changed");
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Failed to extract oil report. Verify manually.";
        setExtractError(msg);
        onError?.(msg);
      } finally {
        notifyParsing(false);
      }
    },
    [disabled, parsing, onExtracted, onError]
  );

  const hasPreview = Boolean(uploadPreview || uploadName);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 hover:border-cyan-500/30 transition-all space-y-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            Data Ingestion
          </p>
          <h3 className="text-sm font-bold text-white mt-1">
            Oil Lab Report Image Upload
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Drop or select a PNG/JPEG — vision auto-extracts header, wear metals,
            fluid chemistry, and operating parameters (zero-click)
          </p>
        </div>
        <Upload className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden />
      </div>

      {parsing && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extracting Telemetry Data...
        </div>
      )}
      {!hasPreview ? (
        <div
          role="button"
          tabIndex={parsing || disabled ? -1 : 0}
          onClick={() => !(parsing || disabled) && fileRef.current?.click()}
          onKeyDown={(e) => {
            if (parsing || disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (parsing || disabled) return;
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (parsing || disabled) return;
            void handleImage(e.dataTransfer.files?.[0]);
          }}
          className={`w-full rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
            parsing || disabled
              ? "border-slate-700 bg-slate-900/40 opacity-50 cursor-not-allowed"
              : dragOver
                ? "border-cyan-400 bg-cyan-500/10 cursor-pointer"
                : "border-slate-600 hover:border-cyan-500/60 bg-slate-950/60 hover:bg-slate-950 cursor-pointer"
          }`}
        >
          <Upload className={`h-8 w-8 mx-auto mb-3 ${parsing ? "text-slate-500" : "text-cyan-400"}`} />
          <p className={`text-sm font-bold flex items-center justify-center gap-2 ${parsing ? "text-slate-500" : "text-white"}`}>
            {parsing && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
            {parsing ? "Extracting Telemetry Data..." : "Drop oil lab report screenshot here"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            .png · .jpg · .webp — Polaris / TestOil / ALS / Bureau Veritas
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-36 h-24 shrink-0 rounded-lg border border-slate-600 bg-slate-900 relative overflow-hidden shadow-inner">
              {parsing ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-cyan-300">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-[10px] font-bold">Extracting Telemetry Data...</span>
                </div>
              ) : uploadPreview ? (
                <img
                  src={uploadPreview}
                  alt={uploadName || "Oil report preview"}
                  className="w-full h-full object-cover object-left-top"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100">
                <span className="truncate max-w-[220px] text-white">
                  {uploadName || "oil-report.png"}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-cyan-300">
                  {parsing
                    ? "Extracting Telemetry Data..."
                    : extractBanner
                      ? "Fields auto-filled"
                      : "Ready"}
                </span>
              </div>
              {extractBanner && (
                <p className="text-[11px] text-emerald-300/90 flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {extractBanner}
                </p>
              )}
              {extractError && (
                <p className="text-[11px] text-amber-400">{extractError}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={clearPreview}
                  className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-red-400/50 hover:text-red-300 transition-colors"
                >
                  ✕ Remove
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing || disabled}
                  className="min-h-[30px] px-2.5 rounded-md border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-bold cursor-pointer hover:border-cyan-400/40 hover:text-cyan-200 transition-colors disabled:opacity-50"
                >
                  Replace image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        disabled={disabled || parsing}
        onChange={(e) => {
          void handleImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default OilVisionDropzone;
