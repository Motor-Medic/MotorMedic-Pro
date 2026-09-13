/**
 * spectralDiff — shared helpers for PrognosticsTab spectral comparison.
 *
 * extractTruePeaks  – peaks above a noise floor (default 5× series median).
 * matchPeaksOrderAware – RPM-aware order matching or frequency fallback.
 * diffSpectra       – classified diff of two peak sets (25% change rule).
 * buildFaultHistory – cross-run amplitude history per fault (for sparklines).
 */

import type { SavedAnalysisResult, SavedFaultItem } from "../analysisPersistence";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface Peak { frequency: number; amplitude: number; }

export interface MatchedPeak {
  a: Peak;
  b: Peak | null;
  matched: boolean;
}

export interface DiffResult {
  appeared: MatchedPeak[];
  grew: MatchedPeak[];
  settled: MatchedPeak[];
  matched: MatchedPeak[];
  belowFloor: number;
}

export interface FaultHistoryEntry {
  title: string;
  frequencyHz: number | null;
  series: { runId: string; ts: string; amplitude: number }[];
  delta: number;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

const n = (v: unknown): number =>
  (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v))
    ? Number(v)
    : NaN;

/** Recursively walk nested objects looking for { frequency, amplitude } pairs. */
const walk = (v: unknown, out: Peak[]): void => {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { for (const it of v) walk(it, out); return; }
  const o = v as Record<string, unknown>;
  const f = n(o.frequencyHz ?? o.frequency_hz ?? o.freqHz ?? o.freq_hz ?? o.frequency ?? o.freq ?? o.hz);
  const a = n(o.amplitude ?? o.amp ?? o.value);
  if (f > 0 && a > 0) { out.push({ frequency: f, amplitude: a }); return; }
  for (const k of ["record", "telemetry_data", "telemetry", "vibration_trend_record", "spectral", "spectrum", "peaks", "fft_data", "vibration_peaks"])
    if (o[k] != null) walk(o[k], out);
};

export function faultFreq(fault: SavedFaultItem): number | null {
  const hz = fault.frequencyHz ?? (typeof fault.frequency === "number" ? fault.frequency : typeof fault.frequency === "string" ? Number(fault.frequency) : NaN);
  return Number.isFinite(hz) && hz > 0 ? hz : null;
}

/** Recursively extract peaks from a SavedAnalysisResult (same walker as cmmsPayload / PrognosticsTab). */
function parsePeaks(row: SavedAnalysisResult | null): Peak[] {
  if (!row) return [];
  const out: Peak[] = [];
  walk(row, out);
  return out;
}

/* ── extractTruePeaks ──────────────────────────────────────────────────────── */

export function extractTruePeaks(series: Peak[], floor?: number): Peak[] {
  if (!series.length) return [];
  const f = floor ?? 5 * median(series.map((p) => p.amplitude));
  return series.filter((p) => p.amplitude > f);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ── matchPeaksOrderAware ──────────────────────────────────────────────────── */

export function matchPeaksOrderAware(
  aPeaks: Peak[],
  bPeaks: Peak[],
  rpmA?: number | null,
  rpmB?: number | null,
): MatchedPeak[] {
  const orderMode =
    rpmA != null && rpmA > 0 && rpmB != null && rpmB > 0;

  if (orderMode) {
    const rA = rpmA! / 60;
    const rB = rpmB! / 60;
    const ordersB = bPeaks.map((p) => ({ peak: p, order: p.frequency / rB }));
    const usedB = new Set<number>();
    return aPeaks.map((a) => {
      const orderA = a.frequency / rA;
      let best: { peak: Peak; order: number } | null = null;
      let bestDiff = Infinity;
      for (const b of ordersB) {
        if (usedB.has(b.peak.frequency)) continue;
        const diff = Math.abs(b.order - orderA);
        if (orderA > 0 && diff / orderA <= 0.02 && diff < bestDiff) {
          bestDiff = diff;
          best = b;
        }
      }
      if (best) { usedB.add(best.peak.frequency); return { a, b: best.peak, matched: true }; }
      return { a, b: null, matched: false };
    });
  }

  /* Frequency fallback: max(2 Hz, 2% of frequency) */
  const usedB = new Set<number>();
  return aPeaks.map((a) => {
    const tol = Math.max(2, a.frequency * 0.02);
    let best: Peak | null = null;
    let bestDiff = Infinity;
    for (const b of bPeaks) {
      if (usedB.has(b.frequency)) continue;
      const diff = Math.abs(b.frequency - a.frequency);
      if (diff <= tol && diff < bestDiff) { bestDiff = diff; best = b; }
    }
    if (best) { usedB.add(best.frequency); return { a, b: best, matched: true }; }
    return { a, b: null, matched: false };
  });
}

/* ── diffSpectra ───────────────────────────────────────────────────────────── */

export function diffSpectra(a: Peak[], b: Peak[]): DiffResult {
  if (!a.length && !b.length) return { appeared: [], grew: [], settled: [], matched: [], belowFloor: 0 };

  const diffs = matchPeaksOrderAware(a, b);
  const appeared: MatchedPeak[] = [];
  const grew: MatchedPeak[] = [];
  const settled: MatchedPeak[] = [];
  const matched: MatchedPeak[] = [];

  for (const d of diffs) {
    if (!d.matched || d.b == null) { appeared.push(d); continue; }
    const change = d.b.amplitude - d.a.amplitude;
    const ratio = d.a.amplitude > 0 ? change / d.a.amplitude : 0;
    if (ratio > 0.25) grew.push(d);
    else if (ratio < -0.25) settled.push(d);
    else matched.push(d);
  }

  /* Peaks in B not matched to anything in A */
  const matchedB = new Set(diffs.filter((d) => d.b != null).map((d) => d.b!.frequency));
  const appearedFromB = b.filter((p) => !matchedB.has(p.frequency));

  return {
    appeared: [
      ...appeared,
      ...appearedFromB.map((p) => ({ a: p, b: null, matched: false })),
    ],
    grew: grew.sort((x, y) => (y.b!.amplitude - y.a.amplitude) - (x.b!.amplitude - x.a.amplitude)),
    settled: settled.sort((x, y) => (x.b!.amplitude - x.a.amplitude) - (y.b!.amplitude - y.a.amplitude)),
    matched: matched.sort((x, y) => y.a.amplitude - x.a.amplitude),
    belowFloor: Math.max(0, b.length - appearedFromB.length - matched.length - grew.length - settled.length),
  };
}

/* ── buildFaultHistory ─────────────────────────────────────────────────────── */

export function buildFaultHistory(runs: SavedAnalysisResult[]): FaultHistoryEntry[] {
  const freqMap = new Map<string, { title: string; frequencyHz: number; runAmps: Map<string, number> }>();

  for (const r of runs) {
    if (!Array.isArray(r.fault_list)) continue;
    for (const f of r.fault_list) {
      const hz = faultFreq(f);
      if (hz == null) continue;
      const key = `${f.title}|${hz.toFixed(1)}`;
      if (!freqMap.has(key)) freqMap.set(key, { title: f.title, frequencyHz: hz, runAmps: new Map() });
      const entry = freqMap.get(key)!;
      const peaks = parsePeaks(r);
      const tol = Math.max(2, hz * 0.02);
      let best = 0;
      for (const p of peaks) {
        const d = Math.abs(p.frequency - hz);
        if (d <= tol && p.amplitude > best) best = p.amplitude;
      }
      entry.runAmps.set(r.id, best);
    }
  }

  return [...freqMap.values()]
    .map((e) => {
      const series = runs
        .filter((r) => e.runAmps.has(r.id))
        .map((r) => ({ runId: r.id, ts: r.timestamp, amplitude: e.runAmps.get(r.id)! }));
      const first = series.length ? series[0].amplitude : 0;
      const last = series.length ? series[series.length - 1].amplitude : 0;
      return { title: e.title, frequencyHz: e.frequencyHz, series, delta: last - first };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
