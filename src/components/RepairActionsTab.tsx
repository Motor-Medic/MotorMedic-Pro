import React, { useMemo } from "react";
import { FileText, ArrowUp, ArrowDown, Minus } from "lucide-react";
import {
  getPrescription,
  DICTIONARY_VERSION,
  type PrescriptivePackage,
} from "../lib/maintenance/prescriptiveDictionary";
import type { SavedAnalysisResult, SavedFaultItem } from "../lib/analysisPersistence";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse peaks from a SavedAnalysisResult into canonical {frequency, amplitude}[]. */
function parsePeaks(row: SavedAnalysisResult | null): Array<{ frequency: number; amplitude: number }> {
  if (!row) return [];
  const out: Array<{ frequency: number; amplitude: number }> = [];
  const n = (v: unknown): number =>
    (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : NaN;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const it of v) walk(it); return; }
    const o = v as Record<string, unknown>;
    const f = n(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz ?? o.count);
    const a = n(o.amplitude ?? o.amp ?? o.value);
    if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
    for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"]) {
      if (o[k] != null) walk(o[k]);
    }
  };
  walk(row);
  return out;
}

/** Get frequencyHz from a fault item, coercing from string if needed. */
function faultFreq(fault: SavedFaultItem): number | null {
  const hz = fault.frequencyHz ?? (typeof fault.frequency === "number" ? fault.frequency : typeof fault.frequency === "string" ? Number(fault.frequency) : NaN);
  return Number.isFinite(hz) && hz > 0 ? hz : null;
}

/** Find the peak amplitude matching a given frequency within tolerance. */
function findAmplitude(peaks: Array<{ frequency: number; amplitude: number }>, targetHz: number, tolHz = 2): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const p of peaks) {
    const d = Math.abs(p.frequency - targetHz);
    if (d <= tolHz && d < bestDist) { bestDist = d; best = p.amplitude; }
  }
  return best;
}

/** Severity bar color based on ratio to danger zone. */
function severityColor(ratio: number): string {
  if (ratio < 0.5) return "bg-emerald-500";
  if (ratio < 0.8) return "bg-amber-400";
  if (ratio < 1.0) return "bg-orange-500";
  return "bg-red-500";
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface RepairActionsTabProps {
  isActive: boolean;
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
}

// ── Ranked Fault Card ──────────────────────────────────────────────────────

function FaultCard({
  fault,
  prescription,
  amplitude,
  trend,
}: {
  key?: React.Key;
  fault: SavedFaultItem;
  prescription: PrescriptivePackage;
  amplitude: number | null;
  trend: { first: number; last: number; delta: number } | null;
}) {
  const { severityZones } = prescription;
  const barMax = severityZones.dangerMmS * 1.3;
  const alarmPct = Math.min((severityZones.alarmMmS / barMax) * 100, 100);
  const dangerPct = Math.min((severityZones.dangerMmS / barMax) * 100, 100);
  const ampPct = amplitude != null ? Math.min((amplitude / barMax) * 100, 100) : null;
  const ampRatio = amplitude != null ? amplitude / severityZones.dangerMmS : null;

  return (
    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-200">{fault.title}</h4>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
          P{prescription.defaultPriority}
        </span>
      </div>

      {prescription.isMapped ? (
        <>
          {/* Procedure */}
          {prescription.procedure.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Procedure</h5>
              <ol className="list-decimal list-inside space-y-0.5">
                {prescription.procedure.map((s) => (
                  <li key={s.step} className="text-xs text-slate-300">
                    {s.task}
                    {s.tolerance && <span className="text-[10px] text-cyan-400 ml-1">({s.tolerance})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Parts */}
          {prescription.parts.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Parts</h5>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-normal">Name</th>
                    <th className="text-left font-normal">Spec</th>
                    <th className="text-right font-normal">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {prescription.parts.map((p, i) => (
                    <tr key={i} className="text-slate-300 border-t border-slate-800">
                      <td className="py-0.5">{p.name}</td>
                      <td className="py-0.5 text-slate-400">{p.spec}</td>
                      <td className="py-0.5 text-right">{p.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tools */}
          {prescription.tools.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tools</h5>
              <div className="flex flex-wrap gap-1">
                {prescription.tools.map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Labor */}
          <div className="text-[11px] text-slate-400">
            Est. labor: <span className="text-slate-200 font-medium">{prescription.laborHours}h</span>
          </div>

          {/* Severity Strip */}
          {amplitude != null && ampPct != null && ampRatio != null && (
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Severity</h5>
              <div className="relative h-3 bg-slate-800 rounded-full overflow-visible">
                <div className={`absolute inset-y-0 left-0 rounded-full ${severityColor(ampRatio)}`} style={{ width: `${ampPct}%` }} />
                {/* Alarm mark */}
                <div className="absolute top-0 bottom-0 w-px bg-amber-400" style={{ left: `${alarmPct}%` }} />
                {/* Danger mark */}
                <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${dangerPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>0</span>
                <span className="text-amber-400">{severityZones.alarmMmS} mm/s alarm</span>
                <span className="text-red-500">{severityZones.dangerMmS} mm/s danger</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                Measured: <span className="font-medium">{amplitude.toFixed(2)} mm/s</span>
              </div>
            </div>
          )}
          {amplitude == null && (
            <div className="text-[11px] text-slate-500">No matching peak found in stored spectrum (±2 Hz).</div>
          )}

          {/* Trend */}
          <div className="text-[11px]">
            {trend ? (
              <span className="text-slate-300">
                {trend.delta > 0.005 ? (
                  <ArrowUp className="inline h-3 w-3 text-red-400" />
                ) : trend.delta < -0.005 ? (
                  <ArrowDown className="inline h-3 w-3 text-emerald-400" />
                ) : (
                  <Minus className="inline h-3 w-3 text-slate-500" />
                )}
                {" "}
                {trend.first.toFixed(2)} → {trend.last.toFixed(2)} mm/s
                <span className="text-slate-500 ml-1">(Δ {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(2)})</span>
                <span className="text-slate-600 ml-1">· stored trend – linear only</span>
              </span>
            ) : (
              <span className="text-slate-500">No stored trend</span>
            )}
          </div>
        </>
      ) : (
        /* Unmapped */
        <div className="space-y-2">
          <p className="text-xs text-slate-400 italic">
            No procedure mapped in dictionary v{DICTIONARY_VERSION}
          </p>
          {prescription.diagnosis && (
            <div className="text-xs text-slate-500">
              Raw recommendation: {prescription.diagnosis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RepairActionsTab({ isActive, selectedAnalysis, loadedAnalyses }: RepairActionsTabProps) {
  if (!isActive) return null;

  const faults: SavedFaultItem[] = selectedAnalysis?.fault_list ?? [];
  const currentPeaks = useMemo(() => parsePeaks(selectedAnalysis), [selectedAnalysis]);

  // Build a lookup of peaks per historical run for trend computation
  const historyPeaks = useMemo(() => {
    return loadedAnalyses
      .filter((r) => r.id !== selectedAnalysis?.id)
      .map((r) => ({ id: r.id, timestamp: r.timestamp, peaks: parsePeaks(r) }));
  }, [loadedAnalyses, selectedAnalysis]);

  // Rank faults: primary sort by defaultPriority (asc), secondary by amplitude (desc)
  const ranked: Array<{ fault: SavedFaultItem; prescription: PrescriptivePackage; amplitude: number | null; trend: { first: number; last: number; delta: number } | null }> = useMemo(() => {
    const items = faults.map((fault) => {
      const prescription = getPrescription(fault.title);
      const hz = faultFreq(fault);
      const amplitude = hz != null ? findAmplitude(currentPeaks, hz) : null;

      // Trend: find matching faults across history runs
      let trend: { first: number; last: number; delta: number } | null = null;
      if (hz != null && historyPeaks.length >= 1) {
        const matchingRuns: Array<{ amplitude: number }> = [];
        // Check current run
        if (amplitude != null) matchingRuns.push({ amplitude });
        // Check historical runs
        for (const hp of historyPeaks) {
          const a = findAmplitude(hp.peaks, hz);
          if (a != null) matchingRuns.push({ amplitude: a });
        }
        // Need at least 2 data points for a trend
        if (matchingRuns.length >= 2) {
          const first = matchingRuns[0].amplitude;
          const last = matchingRuns[matchingRuns.length - 1].amplitude;
          trend = { first, last, delta: last - first };
        }
      }

      return { fault, prescription, amplitude, trend };
    });

    items.sort((a, b) => {
      const pa = a.prescription.defaultPriority;
      const pb = b.prescription.defaultPriority;
      if (pa !== pb) return pa - pb;
      const aa = a.amplitude ?? -1;
      const ab = b.amplitude ?? -1;
      return ab - aa;
    });

    return items;
  }, [faults, currentPeaks, historyPeaks]);

  // Empty state
  if (faults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <FileText className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">No data available</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          Repair actions will appear when a saved analysis includes recommended parts and work.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-base font-semibold text-slate-200">Prescriptive Action Plan</h3>
      <div className="space-y-3">
        {ranked.map(({ fault, prescription, amplitude, trend }, i) => (
          <FaultCard
            key={`${fault.title}-${fault.frequencyHz ?? fault.frequency ?? i}`}
            fault={fault}
            prescription={prescription}
            amplitude={amplitude}
            trend={trend}
          />
        ))}
      </div>
      <p className="text-[10px] text-slate-600 text-center pt-2">
        Prescriptions from prescriptiveDictionary v{DICTIONARY_VERSION} – deterministic, curated content
      </p>
    </div>
  );
}
