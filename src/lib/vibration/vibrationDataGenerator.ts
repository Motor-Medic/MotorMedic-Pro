/**
 * Client-side vibration synthetic datasets for Trend Analyzer sub-tabs.
 */

export interface SpectralPoint {
  frequency: number; // Hz
  amplitude: number; // mm/s or g (context-dependent)
}

export interface WaveformPoint {
  time: number; // milliseconds
  amplitude: number; // mm/s
}

export interface VibrationDataSet {
  broadband: {
    velocity: number; // mm/s RMS
    acceleration: number; // g's peak
    displacement: number; // microns peak-peak
    iso20816Zone: "A" | "B" | "C" | "D";
    status: string;
  };
  spectral: SpectralPoint[];
  enveloping: SpectralPoint[];
  waveform: WaveformPoint[];
  /** Derived KPI ribbon values for Spectral / Enveloping / Waveform tabs. */
  metrics: VibrationTabMetrics;
}

export interface VibrationTabMetrics {
  spectral: {
    peakFrequency: number;
    oneXAmplitude: number;
    twoXAmplitude: number;
    harmonicDistortionPct: number;
  };
  enveloping: {
    bpfoAmplitude: number;
    bpfiAmplitude: number;
    bearingHealthIndex: number;
  };
  waveform: {
    peakAmplitude: number;
    crestFactor: number;
    rms: number;
  };
}

/** Deterministic PRNG so the same asset yields stable charts across tab switches. */
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

function generateBroadbandData(_rpm: number) {
  // 75 HP-class motor with slight imbalance — ISO Zone B (Acceptable)
  const velocity = 2.8; // mm/s RMS
  const acceleration = 0.45; // g's peak
  const displacement = 45; // microns peak-peak

  return {
    velocity,
    acceleration,
    displacement,
    iso20816Zone: "B" as const,
    status: "ACCEPTABLE - Slight imbalance detected"
  };
}

function generateSpectralData(
  runningSpeedHz: number,
  rand: () => number
): SpectralPoint[] {
  const data: SpectralPoint[] = [];
  const maxFrequency = 500; // Hz
  const resolution = 1; // Hz/bin (responsive for Recharts)

  for (let freq = 0; freq <= maxFrequency; freq += resolution) {
    let amplitude = 0.05; // Baseline noise floor

    // 1x RPM (unbalance) — dominant peak
    amplitude += Math.exp(-Math.pow((freq - runningSpeedHz) / 2, 2)) * 1.2;

    // 2x RPM (misalignment)
    amplitude += Math.exp(-Math.pow((freq - 2 * runningSpeedHz) / 3, 2)) * 0.8;

    // 3x RPM (mechanical looseness)
    amplitude += Math.exp(-Math.pow((freq - 3 * runningSpeedHz) / 4, 2)) * 0.3;

    // 4x RPM
    amplitude += Math.exp(-Math.pow((freq - 4 * runningSpeedHz) / 5, 2)) * 0.15;

    amplitude += (rand() - 0.5) * 0.05;

    data.push({
      frequency: parseFloat(freq.toFixed(1)),
      amplitude: parseFloat(Math.max(0, amplitude).toFixed(3))
    });
  }

  return data;
}

function generateEnvelopingData(
  runningSpeedHz: number,
  rand: () => number
): SpectralPoint[] {
  const data: SpectralPoint[] = [];
  const maxFrequency = 1000; // Hz
  const resolution = 2; // Hz/bin

  const bpfo = 3.5 * runningSpeedHz;
  const bpfi = 5.2 * runningSpeedHz;
  const bsf = 2.8 * runningSpeedHz;

  for (let freq = 0; freq <= maxFrequency; freq += resolution) {
    let amplitude = 0.02;

    amplitude += Math.exp(-Math.pow((freq - bpfo) / 5, 2)) * 0.12;
    amplitude += Math.exp(-Math.pow((freq - bpfi) / 6, 2)) * 0.08;
    amplitude += Math.exp(-Math.pow((freq - bsf) / 4, 2)) * 0.05;
    // Sidebands around BPFO
    amplitude += Math.exp(-Math.pow((freq - (bpfo + runningSpeedHz)) / 5, 2)) * 0.04;
    amplitude += (rand() - 0.5) * 0.01;

    data.push({
      frequency: parseFloat(freq.toFixed(1)),
      amplitude: parseFloat(Math.max(0, amplitude).toFixed(3))
    });
  }

  return data;
}

function generateWaveformData(
  runningSpeedHz: number,
  rand: () => number
): WaveformPoint[] {
  const data: WaveformPoint[] = [];
  const duration = 100; // ms
  const sampleRate = 1000; // samples/s
  const numSamples = Math.floor((duration / 1000) * sampleRate);

  for (let i = 0; i < numSamples; i++) {
    const time = (i / sampleRate) * 1000;
    const t = time / 1000;

    let amplitude = 0;
    amplitude += 1.2 * Math.sin(2 * Math.PI * runningSpeedHz * t);
    amplitude += 0.6 * Math.sin(2 * Math.PI * 2 * runningSpeedHz * t + 0.5);
    amplitude += 0.3 * Math.sin(2 * Math.PI * 3 * runningSpeedHz * t + 1.2);
    amplitude += (rand() - 0.5) * 0.2;

    data.push({
      time: parseFloat(time.toFixed(2)),
      amplitude: parseFloat(amplitude.toFixed(3))
    });
  }

  return data;
}

function nearestAmp(series: SpectralPoint[], targetHz: number): number {
  if (series.length === 0 || !Number.isFinite(targetHz)) return 0;
  let best = series[0];
  let bestDist = Math.abs(best.frequency - targetHz);
  for (const p of series) {
    const d = Math.abs(p.frequency - targetHz);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best.amplitude;
}

function buildMetrics(
  spectral: SpectralPoint[],
  enveloping: SpectralPoint[],
  waveform: WaveformPoint[],
  runningSpeedHz: number
): VibrationTabMetrics {
  let peak = spectral[0] || { frequency: 0, amplitude: 0 };
  for (const p of spectral) {
    if (p.amplitude > peak.amplitude) peak = p;
  }

  const oneX = nearestAmp(spectral, runningSpeedHz);
  const twoX = nearestAmp(spectral, 2 * runningSpeedHz);
  const threeX = nearestAmp(spectral, 3 * runningSpeedHz);
  const fourX = nearestAmp(spectral, 4 * runningSpeedHz);
  const harmSum = threeX + fourX;
  const harmonicDistortionPct =
    oneX > 0 ? Math.round((harmSum / oneX) * 1000) / 10 : 0;

  const bpfo = nearestAmp(enveloping, 3.5 * runningSpeedHz);
  const bpfi = nearestAmp(enveloping, 5.2 * runningSpeedHz);
  // Higher fault peaks → lower health (0–100)
  const bearingHealthIndex = Math.max(
    0,
    Math.min(100, Math.round(100 - (bpfo * 400 + bpfi * 350)))
  );

  let peakAmp = 0;
  let sumSq = 0;
  for (const p of waveform) {
    const a = Math.abs(p.amplitude);
    if (a > peakAmp) peakAmp = a;
    sumSq += p.amplitude * p.amplitude;
  }
  const rms =
    waveform.length > 0
      ? Math.sqrt(sumSq / waveform.length)
      : 0;
  const crestFactor = rms > 0 ? peakAmp / rms : 0;

  return {
    spectral: {
      peakFrequency: peak.frequency,
      oneXAmplitude: oneX,
      twoXAmplitude: twoX,
      harmonicDistortionPct
    },
    enveloping: {
      bpfoAmplitude: bpfo,
      bpfiAmplitude: bpfi,
      bearingHealthIndex
    },
    waveform: {
      peakAmplitude: Math.round(peakAmp * 1000) / 1000,
      crestFactor: Math.round(crestFactor * 100) / 100,
      rms: Math.round(rms * 1000) / 1000
    }
  };
}

/**
 * Generate a full vibration dataset for Trend Analyzer tabs (client-side only).
 */
export function generateVibrationData(
  assetId: string,
  rpm: number = 1780
): VibrationDataSet {
  const safeRpm =
    Number.isFinite(rpm) && rpm > 0 ? rpm : 1780;
  const runningSpeed = safeRpm / 60;
  const rand = mulberry32(hashSeed(`${assetId || "default"}:${safeRpm}`));

  const spectral = generateSpectralData(runningSpeed, rand);
  const enveloping = generateEnvelopingData(runningSpeed, rand);
  const waveform = generateWaveformData(runningSpeed, rand);

  return {
    broadband: generateBroadbandData(safeRpm),
    spectral,
    enveloping,
    waveform,
    metrics: buildMetrics(spectral, enveloping, waveform, runningSpeed)
  };
}
