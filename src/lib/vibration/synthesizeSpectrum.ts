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

/** Representative deep-groove geometry for bearing-family demod peaks. */
const BEARING_GEOMETRY = { n: 9, bd: 12.7, pd: 70.0 };

function impliesBearingFault(diagnoses: unknown): boolean {
  const text =
    typeof diagnoses === "string"
      ? diagnoses
      : Array.isArray(diagnoses)
        ? diagnoses
            .map((d) =>
              typeof d === "string"
                ? d
                : d && typeof d === "object"
                  ? `${(d as Record<string, unknown>).title ?? ""} ${(d as Record<string, unknown>).frequency ?? ""} ${(d as Record<string, unknown>).description ?? ""}`
                  : ""
            )
            .join(" ")
        : diagnoses && typeof diagnoses === "object"
          ? JSON.stringify(diagnoses)
          : String(diagnoses ?? "");
  return /bearing|bpfo|bpfi|bsf|ftf|outer race|inner race|rolling element/i.test(text);
}

function bearingFamilyHz(rpm: number | null | undefined): { bpfo: number; bpfi: number } | null {
  const r = Number(rpm);
  if (!Number.isFinite(r) || r <= 0) return null;
  const shaft = r / 60;
  const ratio = BEARING_GEOMETRY.bd / BEARING_GEOMETRY.pd;
  return {
    bpfo: (BEARING_GEOMETRY.n / 2) * (1 - ratio) * shaft,
    bpfi: (BEARING_GEOMETRY.n / 2) * (1 + ratio) * shaft,
  };
}

export function synthesizeEnvelopeFromRecord(
  peaks: unknown[],
  rpm: number | null | undefined,
  diagnoses: unknown,
  opts: SynthesizeOptions = {}
): SynthesizedPoint[] {
  const { binHz = 1, fMax = 1000, seed } = opts;
  const norm = normalizePeaks(Array.isArray(peaks) ? peaks : []);
  const maxAmp = norm.length ? Math.max(...norm.map((p) => p.a), 0) : 0;
  const rand = mulberry32(hashSeed(seed != null ? String(seed) : JSON.stringify([peaks, rpm, diagnoses])));

  const bumps: Array<{ f: number; amp: number }> = [];
  if (impliesBearingFault(diagnoses) && maxAmp > 0) {
    const bf = bearingFamilyHz(rpm);
    if (bf) {
      bumps.push(
        { f: bf.bpfo, amp: maxAmp },
        { f: bf.bpfo * 2, amp: maxAmp * 0.5 },
        { f: bf.bpfo * 3, amp: maxAmp * 0.35 },
        { f: bf.bpfi, amp: maxAmp * 0.9 },
        { f: bf.bpfi * 2, amp: maxAmp * 0.45 },
        { f: bf.bpfi * 3, amp: maxAmp * 0.3 },
      );
    } else {
      const bpfo = Math.max(...norm.map((p) => p.f));
      bumps.push(
        { f: bpfo, amp: maxAmp },
        { f: bpfo * 2, amp: maxAmp * 0.5 },
        { f: bpfo * 3, amp: maxAmp * 0.35 },
      );
    }
  }

  const out: SynthesizedPoint[] = [];
  for (let f = 0; f <= fMax; f += binHz) {
    // Quiet floor 0.5-1.5% of max peak amp, 1/f tilted; flat for healthy rows.
    const tilt = 1 - 0.5 * Math.min(1, f / fMax);
    const floor = maxAmp * (0.005 + 0.01 * tilt) * (0.5 + 0.5 * rand());
    let a = 0;
    for (const b of bumps) {
      const d = f - b.f;
      a += b.amp * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
    }
    out.push({ frequency: Math.round(f * 100) / 100, amplitude: Math.round(Math.max(floor, a) * 10000) / 10000 });
  }
  return out;
}