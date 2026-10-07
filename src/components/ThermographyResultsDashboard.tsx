import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  DollarSign,
  Thermometer,
  Zap
} from "lucide-react";
import CmmsPayloadBridge from "./diagnostics/CmmsPayloadBridge";
import { useDiagnosticsIntelligence } from "../lib/diagnostics/useDiagnosticsIntelligence";
import type { VibrationAnalysisResult } from "../lib/consensusEngine";
import {
  DIAGNOSE_NOT_RECORDED,
  DIAGNOSE_SEVERITY_NOT_COMPUTED,
  DIAGNOSE_SEVERITY_SOURCE,
  DIAGNOSE_HEALTH_SCORE_SOURCE,
  DIAGNOSE_ROI_SOURCE,
  DIAGNOSE_FAILURE_ESTIMATE_SOURCE
} from "../lib/maintenance/prescriptiveDictionary";

const PALETTES = ["Ironbow", "Grayscale", "Rainbow"] as const;

export type ThermalPeaksLite = {
  hotspot_temp: number;
  reference_temp: number;
  delta_t: number;
  /** false when no hotspot/reference pair could be read from the record. */
  recorded?: boolean;
};

function formatUsd(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return DIAGNOSE_NOT_RECORDED;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function mapSeverityToUi(sev: string | undefined): "HIGH" | "MEDIUM" | "LOW" | null {
  const s = String(sev || "").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return "HIGH";
  if (s === "ANOMALY" || s === "MEDIUM" || s === "WARNING") return "MEDIUM";
  if (s === "NORMAL" || s === "LOW") return "LOW";
  return null;
}

/** Heat index 0–1 for common thermal false-color palettes. */
function rgbToHeatIndex(r: number, g: number, b: number): number {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const warm = Math.max(0, (r - b) / 255) * 0.55 + Math.max(0, (r - g) / 255) * 0.2;
  const magenta = Math.min(r, b) / 255 - g / 255;
  const purpleBias = magenta > 0.05 ? magenta * 0.35 : 0;
  const coldPenalty = Math.max(0, (b - r) / 255) * 0.45;
  return Math.max(0, Math.min(1, lum * 0.45 + warm + purpleBias - coldPenalty));
}

function parsePeaksFromAnalysis(
  analysis: VibrationAnalysisResult,
  fallback: ThermalPeaksLite | null | undefined
): ThermalPeaksLite {
  if (
    fallback &&
    Number.isFinite(fallback.hotspot_temp) &&
    Number.isFinite(fallback.reference_temp)
  ) {
    return { ...fallback, recorded: true };
  }
  try {
    const raw = analysis.consensusDetails?.refereeDebateSummary;
    if (raw && typeof raw === "string" && raw.trim().startsWith("{")) {
      const parsed = JSON.parse(raw) as {
        extracted_data?: {
          hotspot_temperature?: number;
          reference_temperature?: number;
        };
        analysis?: { delta_t?: { value?: number } };
      };
      const hotspot = Number(parsed?.extracted_data?.hotspot_temperature);
      const reference = Number(parsed?.extracted_data?.reference_temperature);
      const delta =
        Number(parsed?.analysis?.delta_t?.value) ||
        (Number.isFinite(hotspot) && Number.isFinite(reference)
          ? Math.abs(hotspot - reference)
          : NaN);
      if (Number.isFinite(hotspot) && Number.isFinite(reference)) {
        return {
          hotspot_temp: hotspot,
          reference_temp: reference,
          delta_t: Number.isFinite(delta) ? delta : Math.abs(hotspot - reference),
          recorded: true
        };
      }
    }
  } catch {
    /* ignore */
  }
  const summary = String(analysis.summary || "");
  const m = /hotspot\s+(-?\d+(?:\.\d+)?)\s+vs\s+reference\s+(-?\d+(?:\.\d+)?)/i.exec(
    summary
  );
  if (m) {
    const hotspot = Number(m[1]);
    const reference = Number(m[2]);
    return {
      hotspot_temp: hotspot,
      reference_temp: reference,
      delta_t: Math.abs(hotspot - reference),
      recorded: true
    };
  }
  return { hotspot_temp: 0, reference_temp: 0, delta_t: 0, recorded: false };
}

function paletteFilter(palette: (typeof PALETTES)[number]): string {
  if (palette === "Grayscale") return "grayscale(1) contrast(1.05)";
  if (palette === "Rainbow") return "hue-rotate(40deg) saturate(1.35) contrast(1.05)";
  return "none";
}

type MarkerPos = { xPct: number; yPct: number };

function ThermalSmartView({
  imageUrl,
  peaks,
  isotherm,
  onIsothermChange,
  palette,
  onPaletteChange
}: {
  imageUrl?: string | null;
  peaks: ThermalPeaksLite;
  isotherm: number;
  onIsothermChange: (v: number) => void;
  palette: (typeof PALETTES)[number];
  onPaletteChange: (p: (typeof PALETTES)[number]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hotPos, setHotPos] = useState<MarkerPos>({ xPct: 50, yPct: 48 });
  const [refPos, setRefPos] = useState<MarkerPos>({ xPct: 28, yPct: 28 });
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{
    left: number;
    top: number;
    w: number;
    h: number;
  } | null>(null);

  const tempUnit =
    peaks.hotspot_temp > 0 && peaks.hotspot_temp < 80 ? "°C" : "°F";
  const sliderMin = Math.max(
    0,
    Math.floor(Math.min(peaks.reference_temp || 20, peaks.hotspot_temp || 40) - 10)
  );
  const sliderMax = Math.max(
    sliderMin + 20,
    Math.ceil(Math.max(peaks.hotspot_temp || 100, peaks.reference_temp || 60) + 20)
  );

  useEffect(() => {
    if (isotherm < sliderMin || isotherm > sliderMax) {
      const mid = Math.round(
        peaks.reference_temp + (peaks.delta_t || 0) * 0.55 || (sliderMin + sliderMax) / 2
      );
      onIsothermChange(Math.min(sliderMax, Math.max(sliderMin, mid)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when peak bounds change
  }, [sliderMin, sliderMax, peaks.hotspot_temp, peaks.reference_temp]);

  // Keep marker frame aligned with object-contain letterboxing
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imgNatural) {
      setFrame(null);
      return;
    }
    const update = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = Math.min(cw / imgNatural.w, ch / imgNatural.h);
      const w = imgNatural.w * scale;
      const h = imgNatural.h * scale;
      setFrame({
        left: (cw - w) / 2,
        top: (ch - h) / 2,
        w,
        h
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgNatural, imageUrl]);

  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const w = Math.max(8, Math.round(img.naturalWidth * scale));
      const h = Math.max(8, Math.round(img.naturalHeight * scale));
      canvas.width = w;
      canvas.height = h;
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const { data } = imageData;

      const tMin = peaks.reference_temp || sliderMin;
      const tMax =
        peaks.hotspot_temp > tMin ? peaks.hotspot_temp : tMin + Math.max(peaks.delta_t, 10);
      const span = Math.max(1, tMax - tMin);

      let maxHeat = -1;
      let maxIdx = 0;
      const heats = new Float32Array(w * h);

      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const heat = rgbToHeatIndex(data[i], data[i + 1], data[i + 2]);
        heats[p] = heat;
        if (heat > maxHeat) {
          maxHeat = heat;
          maxIdx = p;
        }
      }

      const hotX = maxIdx % w;
      const hotY = Math.floor(maxIdx / w);
      let bestRef = 0;
      let bestScore = -1;
      for (let p = 0; p < heats.length; p += 11) {
        const x = p % w;
        const y = Math.floor(p / w);
        const dist = Math.hypot(x - hotX, y - hotY) / Math.hypot(w, h);
        const cool = 1 - heats[p];
        const score = cool * 0.65 + dist * 0.35;
        if (score > bestScore) {
          bestScore = score;
          bestRef = p;
        }
      }

      setHotPos({
        xPct: ((maxIdx % w) / w) * 100,
        yPct: (Math.floor(maxIdx / w) / h) * 100
      });
      setRefPos({
        xPct: ((bestRef % w) / w) * 100,
        yPct: (Math.floor(bestRef / w) / h) * 100
      });

      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const estTemp = tMin + heats[p] * span;
        if (estTemp >= isotherm) {
          data[i] = Math.min(255, Math.round(data[i] * 0.45 + 255 * 0.55));
          data[i + 1] = Math.min(255, Math.round(data[i + 1] * 0.35 + 220 * 0.35));
          data[i + 2] = Math.round(data[i + 2] * 0.25);
          data[i + 3] = 230;
        } else {
          data[i] = Math.round(data[i] * 0.35);
          data[i + 1] = Math.round(data[i + 1] * 0.35);
          data[i + 2] = Math.round(data[i + 2] * 0.4);
          data[i + 3] = 160;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };
    img.onerror = () => {
      if (!cancelled) setImgNatural(null);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, isotherm, peaks.hotspot_temp, peaks.reference_temp, peaks.delta_t, sliderMin]);

  const hasImage = Boolean(imageUrl);
  const peaksRecorded = peaks.recorded !== false;
  const hotspotLabel = peaksRecorded && Number.isFinite(peaks.hotspot_temp)
    ? `${peaks.hotspot_temp}${tempUnit}`
    : DIAGNOSE_NOT_RECORDED;
  const refLabel = peaksRecorded && Number.isFinite(peaks.reference_temp)
    ? `${peaks.reference_temp}${tempUnit}`
    : DIAGNOSE_NOT_RECORDED;

  const markerStyle = (pos: MarkerPos): React.CSSProperties => {
    if (frame) {
      return {
        left: frame.left + (pos.xPct / 100) * frame.w,
        top: frame.top + (pos.yPct / 100) * frame.h
      };
    }
    return { left: `${pos.xPct}%`, top: `${pos.yPct}%` };
  };

  const overlayStyle: React.CSSProperties = frame
    ? {
        left: frame.left,
        top: frame.top,
        width: frame.w,
        height: frame.h,
        objectFit: "fill"
      }
    : { inset: 0, width: "100%", height: "100%", objectFit: "contain" };

  return (
    <div
      ref={containerRef}
      className="h-96 rounded-lg relative overflow-hidden border border-white/10 shadow-inner bg-slate-950"
    >
      {hasImage ? (
        <>
          <img
            src={imageUrl!}
            alt="Uploaded thermal image"
            className="absolute inset-0 w-full h-full object-contain"
            style={{ filter: paletteFilter(palette) }}
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="absolute pointer-events-none mix-blend-screen opacity-85"
            style={overlayStyle}
            aria-hidden
          />

          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={markerStyle(hotPos)}
          >
            <div className="border-2 border-white/80 bg-black/55 backdrop-blur-sm px-2 py-1 rounded-sm shadow-lg max-w-[180px]">
              <p className="text-[11px] font-bold text-white font-mono tracking-wide break-words">
                Max / Hotspot: {hotspotLabel}
              </p>
            </div>
            <div className="mx-auto mt-1 w-3 h-3 rounded-full border-2 border-white bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
          </div>

          <div
            className="absolute z-10 flex items-center gap-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={markerStyle(refPos)}
          >
            <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shrink-0 shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
            <span className="bg-slate-900/85 text-green-300 text-[11px] px-2 py-1 rounded border border-green-500/40 font-mono break-words max-w-[180px]">
              Ref: {refLabel}
            </span>
          </div>

          {imgNatural ? (
            <div className="absolute top-2 right-2 z-10 rounded-md bg-black/55 border border-white/15 px-2 py-1 text-[10px] text-slate-300 font-mono">
              {imgNatural.w}×{imgNatural.h}
            </div>
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400">
          <Thermometer className="h-10 w-10 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No thermal image uploaded</p>
          <p className="text-xs text-slate-500">
            Run analysis with an image to populate SmartView
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-10 pb-4 space-y-3 max-h-[70%] overflow-y-auto">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex-1 min-w-0 text-xs text-slate-200 font-semibold">
            Isotherm Slider — highlight temps &gt;{" "}
            <span className="text-yellow-400 font-mono">
              [ {isotherm}
              {tempUnit} ]
            </span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              value={Math.min(sliderMax, Math.max(sliderMin, isotherm))}
              onChange={(e) => onIsothermChange(Number(e.target.value))}
              className="mt-1.5 w-full accent-yellow-500 cursor-pointer"
              disabled={!hasImage}
            />
          </label>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {PALETTES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPaletteChange(p)}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors ${
                  palette === p
                    ? "bg-yellow-500 text-slate-900 border-yellow-500"
                    : "bg-black/50 text-slate-200 border-white/30 hover:border-yellow-500/60"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {hasImage ? (
          <p className="text-[10px] text-slate-400 break-words">
            {peaksRecorded ? (
              <>
                ΔT {peaks.delta_t}
                {tempUnit} · isotherm dims areas below threshold and highlights warmer pixels
              </>
            ) : (
              <>ΔT {DIAGNOSE_NOT_RECORDED} · isotherm dims areas below threshold and highlights warmer pixels</>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StaticActionBar({
  onNewAnalysis,
  onExportPdf,
  onManagerReport,
  position
}: {
  onNewAnalysis: () => void;
  onExportPdf: () => void;
  onManagerReport: () => void;
  position: "top" | "bottom";
}) {
  return (
    <div
      className={`flex justify-between items-center py-4 border-slate-800 gap-3 flex-wrap ${
        position === "top" ? "mb-6 border-b" : "mt-6 border-t"
      }`}
    >
      <button
        type="button"
        onClick={onNewAnalysis}
        className="text-slate-400 hover:text-white text-sm font-medium flex items-center gap-2 cursor-pointer bg-transparent border-0"
      >
        ← Run New Analysis
      </button>
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={onExportPdf}
          className="border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={onManagerReport}
          className="border border-slate-700 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
        >
          Manager Report
        </button>
      </div>
    </div>
  );
}

export interface ThermographyResultsDashboardProps {
  assetLabel: string;
  componentLabel?: string;
  /** Asset key used to look up saved records; matches the persistence key. */
  assetId: string;
  /** Short asset tag for CMMS payloads. */
  assetTag?: string;
  /** Active diagnosis text; empty when no analysis has been run. */
  primaryFault?: string;
  severity?: string | null;
  confidencePercent?: number | null;
  healthScore?: number | null;
  recommendations?: string[];
  /** Saved analysis_results id; null until the analysis is persisted. */
  savedAnalysisId?: string | null;
  /** Logged-in user, pre-fills the sign-off name field. */
  engineerName?: string;
  analysis: VibrationAnalysisResult;
  gaugeScore?: number;
  /** Blob/object URL of the uploaded thermal image */
  thermalImageUrl?: string | null;
  /** Hotspot / reference / ΔT from thermography analysis */
  thermalPeaks?: ThermalPeaksLite | null;
  onNewAnalysis: () => void;
  onSaveWorkOrder: () => void;
  onExportPdf?: () => void;
  onManagerReport?: () => void;
  onToast?: (message: string, type?: "success" | "info" | "warning" | "error") => void;
}

const NO_RECOMMENDATIONS: string[] = [];

export default function ThermographyResultsDashboard({
  assetLabel,
  componentLabel,
  assetId,
  assetTag,
  primaryFault = "",
  severity = null,
  confidencePercent = null,
  healthScore = null,
  recommendations = NO_RECOMMENDATIONS,
  savedAnalysisId = null,
  engineerName,
  analysis,
  gaugeScore,
  thermalImageUrl,
  thermalPeaks,
  onNewAnalysis,
  onSaveWorkOrder,
  onExportPdf,
  onManagerReport,
  onToast
}: ThermographyResultsDashboardProps) {
  const peaks = useMemo(
    () => parsePeaksFromAnalysis(analysis, thermalPeaks),
    [analysis, thermalPeaks]
  );

  const tempUnit =
    peaks.hotspot_temp > 0 && peaks.hotspot_temp < 80 ? "°C" : "°F";
  const defaultIsotherm = Math.round(
    peaks.reference_temp + Math.max(peaks.delta_t * 0.45, 2)
  );

  const [palette, setPalette] = useState<(typeof PALETTES)[number]>("Ironbow");
  const [isotherm, setIsotherm] = useState(defaultIsotherm);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIsotherm(defaultIsotherm);
  }, [defaultIsotherm]);

  // Load saved records for fusion, prognosis, sign-off and CMMS context
  const {
    loading: intelLoading,
    error: intelError,
    cmmsContext
  } = useDiagnosticsIntelligence({
    assetId,
    assetTag: assetTag || assetLabel,
    component: componentLabel || "",
    primaryFault,
    severity,
    confidencePercent,
    healthScore,
    recommendations,
    savedAnalysisId
  });

  const healthRaw = gaugeScore ?? analysis.overallHealthScore;
  const derivedHealthScore =
    typeof healthRaw === "number" && Number.isFinite(healthRaw) ? healthRaw : null;
  const derivedSeverity = analysis.severity
    ? String(analysis.severity).toUpperCase()
    : null;
  const severityRecorded = derivedSeverity !== null;
  const peaksRecorded = peaks.recorded !== false;
  const primary = analysis.primaryFault;
  const faults = analysis.identifiedFaults || [];
  const hasDetectedFaults = faults.length > 0;
  const primaryUiSeverity = mapSeverityToUi(primary?.severity ?? derivedSeverity ?? undefined);

  const preventiveCost = Number(analysis.financialImpact?.preventiveRepairCost);
  const failureCost = Number(analysis.financialImpact?.failureCostIfDelayed);
  const downtimeLoss = Number(analysis.financialImpact?.downtimeLossPerHour);
  const roiPercent =
    Number.isFinite(preventiveCost) && preventiveCost > 0 && Number.isFinite(failureCost)
      ? Math.round(((failureCost - preventiveCost) / preventiveCost) * 100)
      : null;

  const repairSteps = useMemo(
    () =>
      analysis.repairRecommendations?.length
        ? analysis.repairRecommendations
        : [
            "De-energize and follow LOTO procedures.",
            "Inspect and retorque the hot connection to OEM specifications.",
            "Re-scan within 24 hours of load restoration."
          ],
    [analysis.repairRecommendations]
  );

  const nfpaLevel =
    derivedSeverity === "CRITICAL"
      ? 4
      : derivedSeverity === "ANOMALY"
        ? 3
        : derivedSeverity === "NORMAL"
          ? 1
          : null;

  const deltaDisplay =
    peaksRecorded && peaks.delta_t > 0 ? `${peaks.delta_t}${tempUnit}` : DIAGNOSE_NOT_RECORDED;
  const riseOverAmbient =
    peaksRecorded && peaks.hotspot_temp && peaks.reference_temp
      ? `${Math.round((peaks.hotspot_temp - peaks.reference_temp) * 10) / 10}${tempUnit}`
      : deltaDisplay;

  return (
    <div className="space-y-0">
      <StaticActionBar
        position="top"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={() =>
          onExportPdf
            ? onExportPdf()
            : onToast?.("Exporting thermography PDF report…", "info")
        }
        onManagerReport={() =>
          onManagerReport
            ? onManagerReport()
            : onToast?.("Generating manager executive report…", "info")
        }
      />

      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-400">
            Thermography Analysis Results
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
            {assetLabel}
            {componentLabel ? ` · ${componentLabel}` : ""}
          </h2>
          <p className="text-sm text-slate-500 mt-1 break-words">
            NFPA 70B 2026 ·{" "}
            {thermalImageUrl ? "Radiometric assessment" : DIAGNOSE_NOT_RECORDED} · ISO 18434-1
          </p>
          {analysis.summary ? (
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">{analysis.summary}</p>
          ) : null}
        </div>
      </div>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Overall Health Score
            </p>
            <div className="mt-4 flex items-center gap-4 flex-1">
              <div className="relative h-28 w-28 shrink-0">
                <svg
                  viewBox="0 0 36 36"
                  className={`h-full w-full -rotate-90 ${
                    derivedSeverity === "NORMAL"
                      ? "drop-shadow-[0_0_16px_rgba(16,185,129,0.35)]"
                      : derivedSeverity === "ANOMALY"
                        ? "drop-shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                        : severityRecorded
                          ? "drop-shadow-[0_0_16px_rgba(239,68,68,0.4)]"
                          : ""
                  }`}
                >
                  <defs>
                    <linearGradient id="irHealthGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop
                        offset="0%"
                        stopColor={
                          derivedSeverity === "NORMAL"
                            ? "#34d399"
                            : derivedSeverity === "ANOMALY"
                              ? "#fbbf24"
                              : severityRecorded
                                ? "#f87171"
                                : "#94a3b8"
                        }
                      />
                      <stop
                        offset="100%"
                        stopColor={
                          derivedSeverity === "NORMAL"
                            ? "#059669"
                            : derivedSeverity === "ANOMALY"
                              ? "#d97706"
                              : severityRecorded
                                ? "#dc2626"
                                : "#64748b"
                        }
                      />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="url(#irHealthGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${((derivedHealthScore != null ? Math.max(0, Math.min(100, derivedHealthScore)) : 0) / 100) * 97.4} 97.4`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                  <span className="text-2xl font-black text-white tabular-nums leading-none">
                    {derivedHealthScore != null ? Math.round(derivedHealthScore) : ""}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                    {derivedHealthScore != null ? "/ 100" : DIAGNOSE_NOT_RECORDED}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <p
                  className={`text-sm font-bold break-words ${
                    derivedSeverity === "NORMAL"
                      ? "text-emerald-400"
                      : derivedSeverity === "ANOMALY"
                        ? "text-amber-400"
                        : severityRecorded
                          ? "text-red-400"
                          : "text-slate-400"
                  }`}
                >
                  {severityRecorded
                    ? derivedSeverity === "NORMAL"
                      ? "Healthy"
                      : derivedSeverity === "ANOMALY"
                        ? "Anomaly"
                        : "Critical"
                    : DIAGNOSE_SEVERITY_NOT_COMPUTED}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-snug break-words">
                  {severityRecorded
                    ? derivedHealthScore != null
                      ? DIAGNOSE_HEALTH_SCORE_SOURCE
                      : DIAGNOSE_SEVERITY_SOURCE
                    : DIAGNOSE_SEVERITY_NOT_COMPUTED}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Primary Fault
            </p>
            <p className="mt-3 text-lg font-bold text-white leading-snug">
              {primary?.title || "None Detected"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border break-words ${
                  primaryUiSeverity === "HIGH"
                    ? "bg-red-500/15 text-red-300 border-red-500/40"
                    : primaryUiSeverity === "MEDIUM"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                      : primaryUiSeverity === "LOW"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "bg-slate-500/15 text-slate-400 border-slate-500/40"
                }`}
              >
                {primaryUiSeverity ?? DIAGNOSE_NOT_RECORDED}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-800 text-slate-300 border-slate-600 break-words">
                {primary?.confidencePercent != null && Number.isFinite(primary.confidencePercent)
                  ? `${primary.confidencePercent}% conf`
                  : DIAGNOSE_NOT_RECORDED}
              </span>
            </div>
            {primary?.actionWindow ? (
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">{primary.actionWindow}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Thermal Peaks
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Hotspot</span>
                <span className="font-mono font-bold text-red-300 break-words">
                  {peaksRecorded
                    ? `${peaks.hotspot_temp}${tempUnit}`
                    : DIAGNOSE_NOT_RECORDED}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Reference</span>
                <span className="font-mono font-bold text-green-300 break-words">
                  {peaksRecorded
                    ? `${peaks.reference_temp}${tempUnit}`
                    : DIAGNOSE_NOT_RECORDED}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-800 pt-2">
                <span className="text-slate-500">ΔT</span>
                <span className="font-mono font-bold text-yellow-300 break-words">
                  {peaksRecorded ? `${peaks.delta_t}${tempUnit}` : DIAGNOSE_NOT_RECORDED}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasDetectedFaults ? (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-4">Identified Thermal Faults</h3>
          <ul className="space-y-3">
            {faults.map((f, idx) => (
              <li
                key={`${f.title}-${idx}`}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">{f.title}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 break-words">
                    {mapSeverityToUi(f.severity) ?? DIAGNOSE_NOT_RECORDED} ·{" "}
                    {f.confidencePercent != null && Number.isFinite(f.confidencePercent)
                      ? `${f.confidencePercent}%`
                      : DIAGNOSE_NOT_RECORDED}
                  </span>
                </div>
                {f.description ? (
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{f.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Recommended Corrective Actions</h3>
        <ul className="space-y-2">
          {repairSteps.map((step, idx) => {
            const id = `step-${idx}`;
            const on = Boolean(checkedSteps[id]);
            return (
              <li key={id}>
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2.5 hover:border-yellow-500/30 transition-colors">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }))
                    }
                    className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                      on
                        ? "bg-yellow-500 border-yellow-500 text-slate-950"
                        : "border-slate-600 bg-slate-900"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </button>
                  <span
                    className={`text-sm leading-snug ${
                      on ? "text-slate-500 line-through" : "text-slate-200"
                    }`}
                  >
                    {step}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-red-400" />
          <div>
            <h3 className="text-lg font-bold text-white">
              Interactive Thermal Analysis (SmartView)
            </h3>
            <p className="text-sm text-slate-500">
              Uploaded thermal image with isotherm threshold and auto-located markers
            </p>
          </div>
        </div>

        <ThermalSmartView
          imageUrl={thermalImageUrl}
          peaks={peaks}
          isotherm={isotherm}
          onIsothermChange={setIsotherm}
          palette={palette}
          onPaletteChange={setPalette}
        />
      </section>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Automated Severity Engine (NFPA 70B)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              The Physics Math
            </p>
            <p className="text-sm text-slate-300">
              Measured Rise (ΔT<sub>1</sub> over Reference):{" "}
              <span className="text-white font-bold">{riseOverAmbient}</span>
            </p>
            <p className="text-sm text-slate-300 break-words">
              Hotspot / Reference:{" "}
              <span className="text-white font-bold">
                {peaksRecorded
                  ? `${peaks.hotspot_temp}${tempUnit} / ${peaks.reference_temp}${tempUnit}`
                  : DIAGNOSE_NOT_RECORDED}
              </span>
            </p>
            <p className="text-sm text-slate-300 break-words">
              Primary finding:{" "}
              <span className="text-yellow-400 font-bold">
                {primary?.title || DIAGNOSE_NOT_RECORDED}
              </span>
            </p>
            <div className="pt-3 mt-2 border-t border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80 mb-1">
                Critical Calculation
              </p>
              <p className="text-xl sm:text-2xl font-black text-red-500 leading-snug break-words">
                {!severityRecorded
                  ? DIAGNOSE_SEVERITY_NOT_COMPUTED
                  : derivedSeverity === "CRITICAL"
                    ? peaksRecorded && peaks.delta_t > 0
                      ? `Elevated ΔT ${deltaDisplay} — Class 4 priority`
                      : `Class 4 priority — ΔT ${DIAGNOSE_NOT_RECORDED}`
                    : derivedSeverity === "ANOMALY"
                      ? peaksRecorded && peaks.delta_t > 0
                        ? `Developing ΔT ${deltaDisplay} — schedule repair`
                        : `Schedule repair — ΔT ${DIAGNOSE_NOT_RECORDED}`
                      : peaksRecorded && peaks.delta_t > 0
                        ? `Stable thermal profile · ΔT ${deltaDisplay}`
                        : `Stable thermal profile · ΔT ${DIAGNOSE_NOT_RECORDED}`}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 flex flex-col justify-center items-start gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold uppercase tracking-wider break-words">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {nfpaLevel !== null ? `Severity Level ${nfpaLevel}` : DIAGNOSE_SEVERITY_NOT_COMPUTED}
            </span>
            <p className="text-xl sm:text-2xl font-black text-red-400 leading-tight break-words">
              {!severityRecorded
                ? DIAGNOSE_SEVERITY_NOT_COMPUTED
                : derivedSeverity === "CRITICAL"
                  ? "Immediate Action Required"
                  : derivedSeverity === "ANOMALY"
                    ? "Schedule Inspection"
                    : "Continue Monitoring"}
            </p>
            <p className="text-sm text-slate-300 leading-relaxed break-words">
              {severityRecorded
                ? `Based on ΔT criteria and asset criticality for ${primary?.title || "thermal finding"}.`
                : DIAGNOSE_SEVERITY_NOT_COMPUTED}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-5">
          Risk &amp; Financial Impact Assessment
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Failure if Delayed
            </p>
            <p className="text-2xl font-black text-red-500 break-words">{formatUsd(failureCost)}</p>
            <p className="text-sm text-slate-400 break-words">
              {DIAGNOSE_FAILURE_ESTIMATE_SOURCE}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-500/15 border border-yellow-500/40 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-yellow-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Preventive Repair
            </p>
            <p className="text-2xl font-black text-yellow-400 break-words">{formatUsd(preventiveCost)}</p>
            <p className="text-sm text-slate-400 break-words">
              Planned correction for {primary?.title || "thermal fault"}.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Downtime Loss
            </p>
            <p className="text-2xl font-black text-cyan-400 break-words">{formatUsd(downtimeLoss)}</p>
            <p className="text-sm text-slate-400 break-words">
              {roiPercent != null ? `ROI ${roiPercent}%. ` : ""}
              {DIAGNOSE_ROI_SOURCE}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6 space-y-4">
        {!intelLoading && !intelError && (
          <CmmsPayloadBridge
            context={cmmsContext}
            sectionId="ir-cmms-data-bridge"
            onToast={onToast}
          />
        )}
        {intelError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            Could not load CMMS context: {intelError}
          </div>
        )}
        <button
          type="button"
          onClick={onSaveWorkOrder}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg text-sm cursor-pointer transition-colors"
        >
          ✍️ Save Work Order &amp; Commit to CMMS
        </button>
      </section>

      <StaticActionBar
        position="bottom"
        onNewAnalysis={onNewAnalysis}
        onExportPdf={() =>
          onExportPdf
            ? onExportPdf()
            : onToast?.("Exporting thermography PDF report…", "info")
        }
        onManagerReport={() =>
          onManagerReport
            ? onManagerReport()
            : onToast?.("Generating manager executive report…", "info")
        }
      />
    </div>
  );
}
