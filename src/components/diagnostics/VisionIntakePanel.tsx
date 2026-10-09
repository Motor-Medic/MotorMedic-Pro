import { BarChart3, CheckCircle2, FileText, Image, Loader2 } from "lucide-react";
import type React from "react";
import type { UploadedFileMeta } from "../Diagnose";
import { sectionHint, sectionTitle } from "./intakeSectionStyles";

export interface VisionIntakePanelProps {
  spectrumUpload: UploadedFileMeta | null;
  thermalUpload: UploadedFileMeta | null;
  rawUpload: UploadedFileMeta | null;
  spectrumRef: React.RefObject<HTMLInputElement | null>;
  thermalRef: React.RefObject<HTMLInputElement | null>;
  rawRef: React.RefObject<HTMLInputElement | null>;
  ingestSpectrumUpload: (file: File | null) => void;
  ingestUpload: (
    file: File | null,
    setter: React.Dispatch<React.SetStateAction<UploadedFileMeta | null>>,
    acceptRe: RegExp
  ) => string | undefined;
  setThermalUpload: React.Dispatch<React.SetStateAction<UploadedFileMeta | null>>;
  setRawUpload: React.Dispatch<React.SetStateAction<UploadedFileMeta | null>>;
  vibrationExtractStatus: "idle" | "extracting" | "ready" | "failed";
  vibrationExtractError: string | null;
  vibrationExtractSummary: { peakCount: number; confidence: number } | null;
  currentMessageIndex: number;
  AI_LOADING_MESSAGES: string[];
}

export default function VisionIntakePanel({
  spectrumUpload,
  thermalUpload,
  rawUpload,
  spectrumRef,
  thermalRef,
  rawRef,
  ingestSpectrumUpload,
  ingestUpload,
  setThermalUpload,
  setRawUpload,
  vibrationExtractStatus,
  vibrationExtractError,
  vibrationExtractSummary,
  currentMessageIndex,
  AI_LOADING_MESSAGES
}: VisionIntakePanelProps) {
  return (
    <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
      <div>
        <h2 className={sectionTitle}>Upload Diagnostic Data</h2>
        <p className={sectionHint}>Spectrum, thermal, or raw files</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <UploadZone
          icon={<BarChart3 className="h-6 w-6 text-yellow-400" />}
          title="Vibration Spectrum"
          hint="Upload spectrum image or CSV"
          file={spectrumUpload}
          onClick={() => spectrumRef.current?.click()}
          onDropFile={(f) => ingestSpectrumUpload(f)}
        />
        <UploadZone
          icon={<Image className="h-6 w-6 text-red-400" />}
          title="IR Image"
          hint="Upload thermal image"
          file={thermalUpload}
          onClick={() => thermalRef.current?.click()}
          onDropFile={(f) =>
            ingestUpload(f, setThermalUpload, /\.(png|jpe?g|gif|webp|tiff?)$/i)
          }
        />
        <UploadZone
          icon={<FileText className="h-6 w-6 text-cyan-400" />}
          title="Raw Data"
          hint="Upload raw files"
          file={rawUpload}
          onClick={() => rawRef.current?.click()}
          onDropFile={(f) => ingestUpload(f, setRawUpload, /\.(csv|wav|txt)$/i)}
        />
      </div>
      {(vibrationExtractStatus !== "idle" || vibrationExtractError) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            vibrationExtractStatus === "extracting"
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
              : vibrationExtractStatus === "ready"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          {vibrationExtractStatus === "extracting" && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              {AI_LOADING_MESSAGES[currentMessageIndex]}
            </span>
          )}
          {vibrationExtractStatus === "ready" && vibrationExtractSummary && (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Trend record ready — {vibrationExtractSummary.peakCount}{" "}
                spectral peaks · {vibrationExtractSummary.confidence}%
                confidence. Cached for Trend Analyzer; PostgreSQL on Run
                Diagnostics.
              </span>
            )}
          {vibrationExtractStatus === "failed" && (
            <span>
              {vibrationExtractError ||
                "Vision extraction failed. You can still run diagnostics."}
            </span>
          )}
        </div>
      )}
      {vibrationExtractStatus === "extracting" && (
        <div className="p-6 bg-slate-800/50 rounded-xl border border-cyan-500/30 mt-6">
          <Loader2 className="animate-spin text-cyan-400 w-12 h-12 mx-auto mb-4" />
          <p className="text-cyan-400 font-semibold text-center">
            {AI_LOADING_MESSAGES[currentMessageIndex]}
          </p>
          <p className="text-xs text-slate-400 text-center mt-2">
            This may take up to 60 seconds for complex high-resolution spectra.
          </p>
        </div>
      )}
      <input
        ref={spectrumRef}
        type="file"
        accept=".png,.jpg,.jpeg,.csv"
        className="hidden"
        onChange={(e) => ingestSpectrumUpload(e.target.files?.[0] ?? null)}
      />
      <input
        ref={thermalRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.tif,.tiff"
        className="hidden"
        onChange={(e) =>
          ingestUpload(
            e.target.files?.[0] ?? null,
            setThermalUpload,
            /\.(png|jpe?g|gif|webp|tiff?)$/i
          )
        }
      />
      <input
        ref={rawRef}
        type="file"
        accept=".csv,.wav,.txt"
        className="hidden"
        onChange={(e) => ingestUpload(e.target.files?.[0] ?? null, setRawUpload, /\.(csv|wav|txt)$/i)}
      />
    </section>
  );
}

function UploadZone({
  icon,
  title,
  hint,
  file,
  onClick,
  onDropFile
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  file: UploadedFileMeta | null;
  onClick: () => void;
  onDropFile: (file: File) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onDropFile(f);
      }}
      className="border-dashed border border-slate-700 rounded-lg p-3 sm:p-4 text-center hover:border-yellow-500 hover:shadow-yellow-500/10 hover:shadow-md transition-all duration-200 cursor-pointer bg-slate-950/40"
    >
      <div className="mx-auto mb-2 flex justify-center">{icon}</div>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{file?.name || hint}</p>
      {file?.preview && (
        <img
          src={file.preview}
          alt={file.name}
          className="mt-2 mx-auto h-14 w-auto rounded border border-slate-700 object-cover"
        />
      )}
    </div>
  );
}
