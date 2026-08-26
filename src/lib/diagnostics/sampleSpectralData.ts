/**
 * Sample / reference spectral data for demonstration purposes ONLY.
 *
 * This module MUST NOT be used as a fallback for live asset data.
 * Import and render ONLY when the user explicitly opts in via
 * "View sample / reference spectrum" toggle (isSampleMode).
 */

export interface SpectrumPoint {
  hz: number;
  amp: number;
  baseline: number;
}

/** Deep-dive FFT mock — ~100 pts, BPFO spike @ index 15 (~152 Hz), 2X @ index 30 */
export const DEEP_FFT_DATA: { hz: number; measured: number; baseline: number }[] = Array.from(
  { length: 100 },
  (_, i) => {
    let measured = 0.35 + (i % 7) * 0.02 + Math.sin(i / 5) * 0.08;
    const baseline = 0.42 + Math.sin(i / 9) * 0.04;
    if (i === 15) measured = 9.5;
    else if (i === 14 || i === 16) measured = 3.4;
    else if (i === 30) measured = 2.9;
    else if (i === 29 || i === 31) measured = 1.15;
    return {
      hz: i * 10,
      measured: Math.round(measured * 100) / 100,
      baseline: Math.round(baseline * 100) / 100,
    };
  }
);

/** High-freq / envelope view — 0–5 kHz mock (BPFO family + HF energy) */
export const DEEP_FFT_DATA_HF: { hz: number; measured: number; baseline: number }[] =
  Array.from({ length: 51 }, (_, i) => {
    const hz = i * 100;
    let measured = 0.25 + (i % 6) * 0.015 + Math.sin(i / 4) * 0.06;
    const baseline = 0.3 + Math.sin(i / 8) * 0.03;
    if (hz === 200) measured = 4.8;
    else if (hz === 1500) measured = 6.2;
    else if (hz === 1400 || hz === 1600) measured = 2.1;
    else if (hz === 3000) measured = 3.4;
    return {
      hz,
      measured: Math.round(measured * 100) / 100,
      baseline: Math.round(baseline * 100) / 100,
    };
  });

/** Time waveform — noisy sine */
export const TWF_DATA: { t: number; amp: number }[] = Array.from(
  { length: 80 },
  (_, i) => {
    let amp =
      Math.sin(i / 2.8) * 5.5 +
      Math.sin(i * 1.9) * 2.2 +
      Math.sin(i * 0.4) * 1.1 +
      ((i * 17) % 10) / 10 -
      0.5;
    // Main impact peak — synced cursor target (index 15)
    if (i === 15) amp = 12.4;
    else if (i === 14 || i === 16) amp = Math.max(amp, 7.2);
    return { t: i, amp: Math.round(amp * 100) / 100 };
  }
);

/** Demodulated / enveloped spectrum — flat with sharp mid spike (scaled for 0–4 gE axis) */
export const ENVELOPE_DATA: { hz: number; amp: number }[] = Array.from(
  { length: 60 },
  (_, i) => {
    const mid = 30;
    const dist = Math.abs(i - mid);
    const amp = dist === 0 ? 3.2 : dist === 1 ? 1.5 : dist === 2 ? 0.55 : 0.12 + (i % 5) * 0.01;
    return { hz: i * 5, amp: Math.round(amp * 100) / 100 };
  }
);

/** Sample data watermark text */
export const SAMPLE_WATERMARK = "SAMPLE / REFERENCE SPECTRUM — NOT LIVE ASSET DATA";

/** Type for spectrum data */
export interface SampleSpectrumPoint {
  hz: number;
  measured: number;
  baseline?: number;
}

/** Type for time waveform data */
export interface SampleTwfPoint {
  t: number;
  amp: number;
}

/** Type for envelope data */
export interface SampleEnvelopePoint {
  hz: number;
  amp: number;
}