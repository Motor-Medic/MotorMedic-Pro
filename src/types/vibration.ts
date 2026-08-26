/**
 * Waveform analysis fields persisted on analysis_results / telemetry.
 */

export type WaveformSymmetry = "Symmetric" | "Clipped" | "Asymmetric";
export type WaveformModulation = "None" | "Amplitude" | "Frequency";

export interface VibrationWaveformAnalysisFields {
  waveformPeakToPeak?: number;
  waveformCrestFactor?: number;
  waveformImpactCount?: number;
  waveformSymmetry?: WaveformSymmetry;
  waveformModulation?: WaveformModulation;
  waveformTimePerRevolutionMs?: number;
}

export interface VibrationEnvelopeAnalysisFields {
  envelopePeakAmplitude?: number;
  envelopeDominantFrequency?: number;
  envelopeEnergy?: number;
}

export interface SpectrumPoint {
  hz: number;
  amp: number;
  baseline: number;
}
