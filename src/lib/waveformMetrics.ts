/**
 * Time-waveform metric helpers for single-channel accelerometer diagnostics.
 * Pure math — no mock fill; callers must supply real samples / RPM.
 */

export type WaveformSymmetry = "Symmetric" | "Clipped" | "Asymmetric";
export type WaveformModulation = "None" | "Amplitude" | "Frequency";

/**
 * Calculate 1X rotation markers for time waveform visualization.
 * @param rpm - Rotations per minute from asset specs or extraction
 * @param timeWindowMs - Total time window in milliseconds (e.g., 10000 for 10 seconds)
 * @returns Array of timestamps (in ms) where each shaft rotation occurs
 */
export function calculate1XMarkers(
  rpm: number,
  timeWindowMs: number = 10000
): number[] {
  if (!(rpm > 0) || !(timeWindowMs > 0)) return [];
  const timePerRevolutionMs = (60 / rpm) * 1000;
  if (!(timePerRevolutionMs > 0) || !Number.isFinite(timePerRevolutionMs)) {
    return [];
  }
  const markers: number[] = [];
  // Cap marker count so a tiny TPR cannot explode the array
  const maxMarkers = Math.min(500, Math.ceil(timeWindowMs / timePerRevolutionMs) + 1);
  for (let i = 0; i < maxMarkers; i++) {
    const t = i * timePerRevolutionMs;
    if (t > timeWindowMs) break;
    markers.push(Math.round(t * 1000) / 1000);
  }
  return markers;
}

/** Time per revolution in milliseconds from RPM. */
export function timePerRevolutionMs(rpm: number): number | null {
  if (!(rpm > 0)) return null;
  return Math.round((60 / rpm) * 1000 * 1000) / 1000;
}

/**
 * Assess waveform symmetry by comparing positive and negative peak magnitudes.
 */
export function assessWaveformSymmetry(
  waveform: number[]
): WaveformSymmetry {
  if (!waveform.length) return "Symmetric";

  const maxPeak = Math.max(...waveform);
  const minPeak = Math.min(...waveform);
  const rms = Math.sqrt(
    waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length
  );

  if (!(rms > 0) || !Number.isFinite(maxPeak) || !Number.isFinite(minPeak)) {
    return "Symmetric";
  }

  // Avoid divide-by-zero when one polarity is near zero
  if (Math.abs(minPeak) < 1e-9) {
    return Math.abs(maxPeak) > 2.5 * rms ? "Asymmetric" : "Symmetric";
  }

  const peakRatio = Math.abs(maxPeak / minPeak);

  // Clipped: peaks are flattened (ratio close to 1) and high vs RMS
  if (peakRatio > 0.9 && peakRatio < 1.1 && Math.abs(maxPeak) > 2.5 * rms) {
    return "Clipped";
  }

  // Asymmetric: positive and negative peaks differ significantly
  if (peakRatio < 0.7 || peakRatio > 1.3) {
    return "Asymmetric";
  }

  return "Symmetric";
}

/**
 * Count impacts in waveform (local maxima exceeding 3× RMS).
 */
export function countImpacts(waveform: number[]): number {
  if (waveform.length < 3) return 0;

  const rms = Math.sqrt(
    waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length
  );
  if (!(rms > 0)) return 0;
  const threshold = 3 * rms;

  let impactCount = 0;
  for (let i = 1; i < waveform.length - 1; i++) {
    const mag = Math.abs(waveform[i]);
    if (
      mag > threshold &&
      mag > Math.abs(waveform[i - 1]) &&
      mag > Math.abs(waveform[i + 1])
    ) {
      impactCount++;
    }
  }

  return impactCount;
}

/**
 * Crest factor = peak / RMS from amplitude samples.
 */
export function calculateCrestFactor(waveform: number[]): number | null {
  if (!waveform.length) return null;
  let peak = 0;
  let sumSq = 0;
  for (const v of waveform) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / waveform.length);
  if (!(rms > 0)) return null;
  return Math.round((peak / rms) * 100) / 100;
}

/**
 * Peak-to-peak from amplitude samples.
 */
export function calculatePeakToPeak(waveform: number[]): number | null {
  if (!waveform.length) return null;
  const maxPeak = Math.max(...waveform);
  const minPeak = Math.min(...waveform);
  if (!Number.isFinite(maxPeak) || !Number.isFinite(minPeak)) return null;
  return Math.round((maxPeak - minPeak) * 1000) / 1000;
}

/**
 * Interpret crest factor value for diagnostic purposes.
 */
export function interpretCrestFactor(crestFactor: number): string {
  if (!(crestFactor > 0)) return "Crest factor not available";
  if (crestFactor < 2) return "Normal operation - low impacting";
  if (crestFactor < 3) return "Slight impacting - early wear";
  if (crestFactor < 5) return "Moderate impacting - bearing defect likely";
  if (crestFactor < 8) return "High impacting - advanced bearing damage";
  return "Severe impacting - imminent failure risk";
}

/**
 * Interpret impact count relative to machine speed.
 */
export function interpretImpactCount(
  impactCount: number,
  rpm: number,
  timeWindowSec: number
): string {
  if (!(rpm > 0) || !(timeWindowSec > 0)) {
    return impactCount > 0
      ? `${impactCount} impact(s) detected — RPM needed for rate analysis`
      : "Normal - no significant impacting";
  }
  const impactsPerRev = impactCount / timeWindowSec / (rpm / 60);

  if (impactsPerRev < 1) return "Normal - no significant impacting";
  if (impactsPerRev < 2) return "Light impacting - possible lubrication issue";
  if (impactsPerRev < 4) {
    return "Moderate impacting - bearing defect developing";
  }
  return "Heavy impacting - advanced bearing damage or mechanical looseness";
}

export interface NormalizedWaveformMetrics {
  peakToPeak: number;
  crestFactor: number;
  impactCount: number;
  symmetry: WaveformSymmetry;
  timePerRevolutionMs: number | null;
  modulation: WaveformModulation;
  peakAmplitude?: number;
  rmsValue?: number;
}

/**
 * Normalize AI-extracted or sample-derived waveform metrics.
 * Returns null when nothing usable was recorded (no mock defaults).
 */
export function normalizeWaveformMetrics(raw: unknown, rpm?: number): NormalizedWaveformMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const peakToPeak = Number(o.peakToPeak ?? o.peak_to_peak ?? o.pkPk);
  const crestFactor = Number(o.crestFactor ?? o.crest_factor);
  const impactCount = Number(o.impactCount ?? o.impact_count);
  const tpr = Number(
    o.timePerRevolution ??
      o.timePerRevolutionMs ??
      o.time_per_revolution_ms ??
      o.tprMs
  );
  const symmetryRaw = String(o.symmetry || "").trim();
  const modulationRaw = String(o.modulation || "").trim();

  const symmetry: WaveformSymmetry =
    /clip/i.test(symmetryRaw)
      ? "Clipped"
      : /asym/i.test(symmetryRaw)
        ? "Asymmetric"
        : /sym/i.test(symmetryRaw)
          ? "Symmetric"
          : Number.isFinite(crestFactor) && crestFactor > 0
            ? "Symmetric"
            : "Symmetric";

  const modulation: WaveformModulation =
    /amp/i.test(modulationRaw)
      ? "Amplitude"
      : /freq/i.test(modulationRaw)
        ? "Frequency"
        : "None";

  const hasAny =
    (Number.isFinite(peakToPeak) && peakToPeak > 0) ||
    (Number.isFinite(crestFactor) && crestFactor > 0) ||
    (Number.isFinite(impactCount) && impactCount >= 0 && String(o.impactCount ?? o.impact_count) !== "");

  if (!hasAny && !symmetryRaw && !modulationRaw) return null;

  const computedTpr =
    Number.isFinite(tpr) && tpr > 0
      ? tpr
      : timePerRevolutionMs(Number(rpm) || 0);

  return {
    peakToPeak:
      Number.isFinite(peakToPeak) && peakToPeak > 0 ? peakToPeak : 0,
    crestFactor:
      Number.isFinite(crestFactor) && crestFactor > 0 ? crestFactor : 0,
    impactCount:
      Number.isFinite(impactCount) && impactCount >= 0
        ? Math.round(impactCount)
        : 0,
    symmetry,
    timePerRevolutionMs: computedTpr,
    modulation,
    ...(Number.isFinite(Number(o.peakAmplitude)) && Number(o.peakAmplitude) > 0
      ? { peakAmplitude: Number(o.peakAmplitude) }
      : {}),
    ...(Number.isFinite(Number(o.rmsValue ?? o.rms)) &&
    Number(o.rmsValue ?? o.rms) > 0
      ? { rmsValue: Number(o.rmsValue ?? o.rms) }
      : {})
  };
}

/**
 * Derive metrics from amplitude samples when the vision model did not return them.
 */
export function metricsFromWaveformSamples(
  samples: Array<{ time?: number; amplitude: number }>,
  rpm?: number
): NormalizedWaveformMetrics | null {
  if (!samples.length) return null;
  const amps = samples.map((s) => Number(s.amplitude)).filter(Number.isFinite);
  if (!amps.length) return null;

  const peakToPeak = calculatePeakToPeak(amps);
  const crestFactor = calculateCrestFactor(amps);
  const impactCount = countImpacts(amps);
  const symmetry = assessWaveformSymmetry(amps);
  let peak = 0;
  let sumSq = 0;
  for (const a of amps) {
    const abs = Math.abs(a);
    if (abs > peak) peak = abs;
    sumSq += a * a;
  }
  const rms = Math.sqrt(sumSq / amps.length);

  if (
    !(peakToPeak != null && peakToPeak > 0) &&
    !(crestFactor != null && crestFactor > 0)
  ) {
    return null;
  }

  return {
    peakToPeak: peakToPeak ?? 0,
    crestFactor: crestFactor ?? 0,
    impactCount,
    symmetry,
    timePerRevolutionMs: timePerRevolutionMs(Number(rpm) || 0),
    modulation: "None",
    peakAmplitude: Math.round(peak * 1000) / 1000,
    rmsValue: Math.round(rms * 1000) / 1000
  };
}
