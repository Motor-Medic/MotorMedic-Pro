/**
 * Client-side ultrasound WAV analyzer (Web Audio API).
 * Zero-touch Phase 1 — no backend DSP required.
 */

export type UltrasoundAudioMetrics = {
  /** Peak level in calibrated dBµV-style units (dBFS + offset). */
  peakDb: number;
  /** RMS level in calibrated dBµV-style units (dBFS + offset). */
  rmsDb: number;
  /** Linear crest factor = Peak_linear / RMS_linear. */
  crestFactor: number;
  /** Raw peak level in dBFS (before calibration offset). */
  peakDbFS: number;
  /** Raw RMS level in dBFS (before calibration offset). */
  rmsDbFS: number;
  /** Absolute peak sample magnitude [0, 1+]. */
  peakLinear: number;
  /** RMS of the buffer (linear). */
  rmsLinear: number;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
};

/**
 * Industry-standard baseline calibration offset.
 * Shifts raw dBFS (typically negative) onto a positive dBµV-style display scale
 * common on UE contact / airborne instruments. Tune per sensor when available.
 */
export const DEFAULT_CALIBRATION_OFFSET_DB = 60;

/** Floor for log10 to avoid -Infinity on silence. */
const AMP_FLOOR = 1e-12;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert linear amplitude to dB relative to full-scale reference (1.0) = dBFS. */
export function linearToDb(amplitude: number, reference = 1): number {
  const a = Math.max(Math.abs(amplitude), AMP_FLOOR);
  const ref = Math.max(Math.abs(reference), AMP_FLOOR);
  return 20 * Math.log10(a / ref);
}

/**
 * Decode a .wav File and extract Peak / RMS / Crest Factor.
 * Runs entirely in the browser via AudioContext.decodeAudioData.
 */
export async function analyzeUltrasoundWav(
  file: File
): Promise<UltrasoundAudioMetrics> {
  if (!file) {
    throw new Error("No audio file provided.");
  }
  const nameOk = /\.wav$/i.test(file.name);
  const typeOk =
    !file.type ||
    /wav|wave|audio\/x-wav|audio\/wav|audio\/wave/i.test(file.type);
  if (!nameOk && !typeOk) {
    throw new Error("Please upload a .WAV audio file.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Web Audio API is not available in this browser.");
  }

  const ctx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Unable to decode WAV: ${err.message}`
        : "Unable to decode WAV audio."
    );
  } finally {
    void ctx.close().catch(() => undefined);
  }

  const channelCount = audioBuffer.numberOfChannels || 1;
  const length = audioBuffer.length;
  if (length === 0) {
    throw new Error("WAV file contains no audio samples.");
  }

  // Mix all channels for a single metric pass (absolute peak + RMS energy)
  let peakLinear = 0;
  let sumSquares = 0;
  let sampleCount = 0;

  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peakLinear) peakLinear = abs;
      sumSquares += data[i] * data[i];
      sampleCount += 1;
    }
  }

  const rmsLinear =
    sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;

  if (peakLinear < AMP_FLOOR && rmsLinear < AMP_FLOOR) {
    throw new Error("WAV appears silent — no measurable acoustic energy.");
  }

  // Raw dBFS (0 dBFS = full-scale amplitude 1.0)
  const peakDbFS = linearToDb(peakLinear);
  const rmsDbFS = linearToDb(Math.max(rmsLinear, AMP_FLOOR));

  // Shift onto positive dBµV-style instrument scale
  const finalRmsDb = Math.max(
    0,
    Math.round(rmsDbFS + DEFAULT_CALIBRATION_OFFSET_DB)
  );
  const finalPeakDb = Math.max(
    0,
    Math.round(peakDbFS + DEFAULT_CALIBRATION_OFFSET_DB)
  );

  // Crest Factor: linear Peak/RMS only (≡ 10^((peakDb−rmsDb)/20)). Never divide dB values.
  const crestFactor =
    rmsLinear > AMP_FLOOR
      ? round2(peakLinear / rmsLinear)
      : round2(Math.pow(10, (peakDbFS - rmsDbFS) / 20));

  return {
    rmsDb: finalRmsDb,
    peakDb: finalPeakDb,
    crestFactor,
    peakDbFS: Math.round(peakDbFS * 10) / 10,
    rmsDbFS: Math.round(rmsDbFS * 10) / 10,
    peakLinear,
    rmsLinear,
    durationSec: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channelCount
  };
}
