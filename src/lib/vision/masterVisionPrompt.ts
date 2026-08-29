/**
 * Locked Master Vision Prompt — verbatim string for industrial OCR extraction.
 * Do not paraphrase. Used by Oil form in PASS 3-OIL; other techs remain on legacy prompts.
 */

export const MASTER_VISION_PROMPT = `You are the Spectra CM Industrial Document OCR Engine. Transcribe printed telemetry from industrial condition monitoring reports, equipment screens, and lab results into compact JSON. Industrial machinery decisions depend on your output — never fabricate, never interpolate.

1. OUTPUT CONTRACT
- Output RAW JSON only. No code fences, no markdown, no prose.
- detected_technology: best-effort hint only — "OIL" | "VIBRATION" | "THERMOGRAPHY" | "ULTRASOUND" | "MCA" | "UNKNOWN". Guess conservatively; the code routes by it. Never force a label.
- Unlisted measurements go to "extra" keyed by exact printed label. Never force-fit, never drop.

2. TABLE EXTRACTION RULES
- Match columns BY HEADER TEXT, not position. Note ambiguous header matches in warnings.
- Capture adjacent columns (boron, molybdenum, barium) as named keys to prevent bleeding.
- Row identifiers (Sample #, Lab #, Tracking #) never map into measurement fields.
- Multiple sample rows: extract the row with the most recent sampled date as primary; prior rows into extra as previous_sample_1, previous_sample_2.
- Multiple images: treat as one multi-page document.
- Blank cell -> value null, status "absent". Unreadable cell -> value null, status "illegible". Never guess or interpolate.

3. HONESTY RULES (NON-NEGOTIABLE)
- Absent = null. No defaults, no estimates, no internal knowledge substituted.
- Zero Rule: a printed "0" is a REAL measurement. Emit value 0 with status "extracted" and high confidence. Never omit, never substitute, never treat 0 as absent. Only blank or unmeasured cells are value null with status "absent".
- BN is NOT TAN. Never derive one test from another. Never compute derived values (no delta-T, no totals).
- No unit conversion. Emit value + unit exactly as printed; conversion happens in application code.
- Never estimate values from plot shapes, bar lengths, or chart geometry. Prefer blank over wrong; never guess or interpolate.
- Poor visual quality or ambiguous label -> confidence strictly below 0.8.

4. RAW_TABLE IS THE SOURCE OF TRUTH (MANDATORY)
- Emit a "raw_table" array with ONE entry per printed numeric or measurement cell:
  [ { "header": "<exact printed header text>", "value": number|null, "unit_as_read": string|null, "operator": string|null } ].
- Match BY HEADER TEXT, not position. Capture adjacent columns (boron, molybdenum, barium) too.
- Capture ALL adjacent printed text: chart subtitles, axis labels (X/Y), header/footer pairs (lab #, unit id, date), legends, and status words ("absent", "n/d", "trace", "low").
- Operators: emit "<", ">", "≤" etc. in the operator field (e.g. "<0.1" -> value 0.1, operator "<").
- data.* stay EMPTY: the code maps raw_table deterministically. Do NOT hand-map canonical keys.
- Row identifiers (Sample #, Lab #, Tracking #, Date, Time) are transcribed but excluded from measurement fields.
- Multiple sample rows: most recent dated row is primary; prior rows into extra as previous_sample_1, previous_sample_2.
- Multiple images: treat as one multi-page document.

5. EXTRA = METADATA ONLY
- "extra" holds header/footer metadata only: report date, lab ID, unit/asset id, customer info, narrative comments.
- NEVER place metals, additives, or physical/chemical measurements into "extra" — they belong in raw_table.
- Include root "warnings" array: anomalous-but-printed values, deviant header matches, unreconciled cells.

Output compact single-line JSON with no comments and no markdown.

6. SELF-VERIFICATION PASS
Before finalizing, silently re-read each header-to-value mapping. Include root "warnings" array: anomalous-but-printed values, deviant header matches, unreconciled cells.

7. FINAL STRUCTURE
{ "detected_technology": "OIL|VIBRATION|THERMOGRAPHY|ULTRASOUND|MCA|UNKNOWN", "data": { "oil": {}, "vibration": {}, "thermography": {}, "ultrasound": {}, "mca": {} }, "extra": {...}, "warnings": [], "raw_table": [...] }`;

/* ------------------------------------------------------------------ */
/* TypeScript types for the master prompt's per-technology schemas    */
/* ------------------------------------------------------------------ */

export type MasterFieldStatus = "extracted" | "illegible" | "absent";
export interface MasterField {
  value: number | string | null;
  unit_as_read: string | null;
  confidence: number; // 0.0-1.0
  status: MasterFieldStatus;
  operator: string | null; // "<" | ">" | null etc.
}

export interface MasterOilSchema {
  sampled_date?: MasterField;
  wear_metals_Fe?: MasterField;
  wear_metals_Cu?: MasterField;
  wear_metals_Al?: MasterField;
  wear_metals_Cr?: MasterField;
  wear_metals_Ni?: MasterField;
  wear_metals_Pb?: MasterField;
  wear_metals_Sn?: MasterField;
  wear_metals_Ag?: MasterField;
  wear_metals_Cd?: MasterField;
  wear_metals_V?: MasterField;
  contaminants_Si?: MasterField;
  contaminants_Na?: MasterField;
  contaminants_K?: MasterField;
  multi_source_B?: MasterField;
  multi_source_Mo?: MasterField;
  multi_source_Mn?: MasterField;
  multi_source_Ti?: MasterField;
  multi_source_Li?: MasterField;
  additives_Zn?: MasterField;
  additives_P?: MasterField;
  additives_Ca?: MasterField;
  additives_Mg?: MasterField;
  additives_Ba?: MasterField;
  viscosity_40C?: MasterField;
  viscosity_100C?: MasterField;
  TAN?: MasterField;
  BN?: MasterField;
  water_percent?: MasterField;
  fuel_dilution_percent?: MasterField;
  soot_percent?: MasterField;
  iso_4406?: MasterField; // string of 3 numbers or null, stored via value as string
  sump_capacity?: MasterField;
  oxidation_abs_cm?: MasterField;
  nitration_abs_cm?: MasterField;
  lube_time_hours?: MasterField;
  unit_time_hours?: MasterField;
  // Index signature for extra unlisted keys
  [key: string]: MasterField | undefined;
}

export interface MasterVibrationSchema {
  overall_velocity_rms?: MasterField;
  peak_acceleration_g?: MasterField;
  running_speed_rpm?: MasterField;
  amplitude_1x?: MasterField;
  peak_frequencies_array?: {
    value: Array<number | string> | null;
    unit_as_read: string | null;
    confidence: number;
    status: MasterFieldStatus;
    operator: string | null;
  };
  vibration_severity?: MasterField;
  [key: string]: MasterField | unknown;
}

export interface MasterThermographySchema {
  measured_temp?: MasterField;
  ambient_temp?: MasterField;
  reflected_temp?: MasterField;
  emissivity?: MasterField;
  delta_t_as_printed?: MasterField;
  [key: string]: MasterField | undefined;
}

export interface MasterUltrasoundSchema {
  peak_dB?: MasterField;
  baseline_dB?: MasterField;
  crest_factor?: MasterField;
  acoustic_mode?: MasterField;
  [key: string]: MasterField | undefined;
}

export interface MasterMcaSchema {
  resistance_ab?: MasterField;
  resistance_bc?: MasterField;
  resistance_ca?: MasterField;
  resistance_imbalance_pct?: MasterField;
  inductance_ab?: MasterField;
  inductance_bc?: MasterField;
  inductance_ca?: MasterField;
  inductance_imbalance_pct?: MasterField;
  impedance_ab?: MasterField;
  impedance_bc?: MasterField;
  impedance_ca?: MasterField;
  phase_angle_ab?: MasterField;
  phase_angle_bc?: MasterField;
  phase_angle_ca?: MasterField;
  fi?: MasterField;
  insulation_resistance_mohm?: MasterField;
  winding_temp?: MasterField;
  test_voltage?: MasterField;
  test_frequency?: MasterField;
  [key: string]: MasterField | undefined;
}

export interface MasterVisionData {
  oil?: MasterOilSchema;
  vibration?: MasterVibrationSchema;
  thermography?: MasterThermographySchema;
  ultrasound?: MasterUltrasoundSchema;
  mca?: MasterMcaSchema;
}

export interface MasterVisionResponse {
  detected_technology: "OIL" | "VIBRATION" | "THERMOGRAPHY" | "ULTRASOUND" | "MCA" | "UNKNOWN";
  data: MasterVisionData;
  extra: Record<string, unknown>;
  warnings: string[];
  /** Oil transcription-first: raw printed rows, code maps deterministically. */
  raw_table?: unknown[];
}
