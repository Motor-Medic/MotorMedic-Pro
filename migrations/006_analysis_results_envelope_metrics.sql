-- MotorMedic Pro — Envelope / demodulation metrics on analysis_results
-- Peak gE, dominant envelope frequency, and envelope energy from vision extraction.

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS envelope_peak_amplitude DECIMAL(10, 6);

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS envelope_dominant_frequency DECIMAL(10, 2);

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS envelope_energy DECIMAL(10, 6);

COMMENT ON COLUMN analysis_results.envelope_peak_amplitude IS
  'Peak envelope / demodulation amplitude (typically gE)';
COMMENT ON COLUMN analysis_results.envelope_dominant_frequency IS
  'Dominant envelope peak frequency in Hz';
COMMENT ON COLUMN analysis_results.envelope_energy IS
  'Estimated overall envelope energy / average amplitude';
