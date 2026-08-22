-- MotorMedic Pro — Waveform & Phase metrics on analysis_results
-- Stores single-channel time-waveform KPIs from vision extraction (no mock fill).

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS waveform_peak_to_peak DECIMAL(10, 4);

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS waveform_crest_factor DECIMAL(5, 2);

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS waveform_impact_count INTEGER;

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS waveform_symmetry VARCHAR(20);

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS waveform_modulation VARCHAR(20);

COMMENT ON COLUMN analysis_results.waveform_peak_to_peak IS
  'Time-waveform peak-to-peak amplitude (mm/s or instrument unit)';
COMMENT ON COLUMN analysis_results.waveform_crest_factor IS
  'Crest factor = Peak / RMS from time waveform';
COMMENT ON COLUMN analysis_results.waveform_impact_count IS
  'Count of local peaks exceeding 3× RMS in the capture window';
COMMENT ON COLUMN analysis_results.waveform_symmetry IS
  'Symmetric | Clipped | Asymmetric';
COMMENT ON COLUMN analysis_results.waveform_modulation IS
  'None | Amplitude | Frequency';
