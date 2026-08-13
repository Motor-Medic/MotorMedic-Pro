/**
 * RunDiagnostics — alias for the Diagnose workspace.
 * App wiring may import either name; logic lives in Diagnose.tsx.
 *
 * Backend contract (must match server.ts mounts):
 *   POST /api/analyze-vibration     → runConsensusVibrationAnalysis
 *   POST /api/analyze-thermography  → runThermographyAnalysis
 *   POST /api/analyze-ultrasound    → runUltrasoundAnalysis (placeholder AI)
 *   POST /api/v1/diagnose           (vibration alias)
 *   POST /api/detect-spectrum-regions → GPT-4o chart panel crop boxes
 *   POST /api/save-analysis-result  → PostgreSQL persistence
 */
export {
  ANALYZE_VIBRATION_API_ALIAS,
  ANALYZE_VIBRATION_API_PATH
} from "../lib/consensusEngine";

export {
  ANALYZE_THERMOGRAPHY_API_PATH
} from "../lib/thermographyAnalysis";

export {
  ANALYZE_ULTRASOUND_API_PATH
} from "../lib/ultrasoundAnalysis";

export { default } from "./Diagnose";
