-- =============================================================================
-- MotorMedic Pro — Ferrography, varnish potential and wear morphology
--
-- Supports the Ferrography & Varnish tab:
--   dr_large / dr_small  — Direct Reading ferrograph densities. WPC, WSI, PLP
--                          and DL/DS ratio are derived from these on read,
--                          never stored, so they cannot drift from their inputs.
--   mpc_delta_e          — Membrane Patch Colorimetry ΔE (ASTM D7843)
--   ruler_percent        — Remaining antioxidant reserve (ASTM D6971)
--   uc_rating            — Ultra-Centrifuge rating, 0–8
--   morph_*              — Wear particle morphology severity per category
--   ferrograph_image_url — Photomicrograph for the sample
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE oil_samples
  ADD COLUMN IF NOT EXISTS dr_large DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS dr_small DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS mpc_delta_e DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS ruler_percent DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS uc_rating INTEGER,
  ADD COLUMN IF NOT EXISTS morph_rubbing VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_cutting VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_spherical VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_fatigue_chunk VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_severe_sliding VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_corrosive VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_nonmetallic VARCHAR(12),
  ADD COLUMN IF NOT EXISTS morph_fibers VARCHAR(12),
  ADD COLUMN IF NOT EXISTS ferrograph_image_url TEXT;

COMMIT;
