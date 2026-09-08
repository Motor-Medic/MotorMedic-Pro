/**
 * Deterministic full-spectrum synthesis from saved analysis peaks.
 * Single source of truth for the "synthesized-from-peaks" 501-point trace.
 */
export interface SynthesizedPoint {
  frequency: number;
  amplitude: number;
}
export interface SynthesizeOptions {
  binHz?: number;
  fMax?: number;
  seed?: number;
}

const SIGMA = 1.8;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizePeaks(peaks: unknown[]): Array<{ f: number; a: number }> {
  return peaks
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      f: Number(p.frequencyHz ?? p.frequency ?? p.freqHz ?? p.freq_hz ?? p.frequency_hz ?? p.freq ?? p.hz),
      a: Number(p.amplitude ?? p.amp ?? p.value),
    }))
    .filter((p) => Number.isFinite(p.f) && p.f > 0 && Number.isFinite(p.a) && p.a >= 0);
}

export function synthesizeSpectrumFromPeaks(
  peaks: unknown[],
  opts: SynthesizeOptions = {}
): SynthesizedPoint[] {
  const { binHz = 1, fMax = 500, seed } = opts;
  const norm = normalizePeaks(Array.isArray(peaks) ? peaks : []);
  const maxAmp = norm.length ? Math.max(...norm.map((p) => p.a), 0) : 0;
  const rand = mulberry32(hashSeed(seed != null ? String(seed) : JSON.stringify(peaks)));

  const out: SynthesizedPoint[] = [];
  for (let f = 0; f <= fMax; f += binHz) {
    // Noise floor 1-3% of max peak amp, 1/f tilted; a floor (min) so the
    // gaussian bump — not the noise — remains the argmax.
    const tilt = 1 - 0.5 * Math.min(1, f / fMax);
    const floor = maxAmp * (0.01 + 0.02 * tilt) * (0.5 + 0.5 * rand());
    let a = 0;
    for (const pk of norm) {
      const d = f - pk.f;
      a += pk.a * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
    }
    out.push({ frequency: Math.round(f * 100) / 100, amplitude: Math.round(Math.max(floor, a) * 10000) / 10000 });
  }
  return out;
}