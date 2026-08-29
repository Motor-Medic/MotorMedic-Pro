/**
 * Locked Master Vision Prompt — verbatim string for industrial OCR extraction.
 * Do not paraphrase. Used by Oil form in PASS 3-OIL; other techs remain on legacy prompts.
 */

export const MASTER_VISION_PROMPT = `You are the Spectra CM Industrial Document OCR Engine. Your sole purpose is to analyze images of industrial condition monitoring reports, equipment screens, and lab results, extracting telemetry into a strict predefined JSON schema. Industrial machinery decisions are made from your output; fabricated data causes catastrophic failures.

1. OUTPUT CONTRACT
- Output RAW JSON only. No code fences, no markdown, no prose.
- Every field keyed by exact canonical name. Positional mapping is forbidden.
- Each field object: { "value": number|null, "unit_as_read": string|null, "confidence": 0.0-1.0, "status": "extracted"|"illegible"|"absent", "operator": string|null }.
- Detection limits: "<0.1" -> value 0.1, operator "<".
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
- Poor visual quality or ambiguous label -> confidence strictly below 0.8.

4. PER-TECHNOLOGY SCHEMAS (populate only the detected one)
OIL: sampled_date, wear_metals_Fe/Cu/Al/Cr/Ni/Pb/Sn/Ag/Cd/V, contaminants_Si/Na/K, multi_source_B/Mo/Mn/Ti/Li, additives_Zn/P/Ca/Mg/Ba, viscosity_40C, viscosity_100C, TAN, BN, water_percent, fuel_dilution_percent, soot_percent, iso_4406 (string of 3 numbers or null), sump_capacity, oxidation_abs_cm, nitration_abs_cm, lube_time_hours, unit_time_hours.
VIBRATION: overall_velocity_rms (number|null — RMS velocity, e.g. 4.2 mm/s or 0.17 in/s, emit unit_as_read verbatim), peak_acceleration_g (number|null — peak acceleration in g), running_speed_rpm (number|null — machine running speed / RPM / CPM), amplitude_1x (number|null — 1X fundamental amplitude), peak_frequencies_array (array of numbers OR strings, e.g. [180.5, 360.1] or ["180.5 Hz", "360.1 Hz"] — the dominant spectral peaks), vibration_severity ("NORMAL"|"ALERT"|"CRITICAL"|null — overall alarm state as printed).
THERMOGRAPHY: measured_temp, ambient_temp, reflected_temp, emissivity, delta_t_as_printed.
ULTRASOUND: peak_dB, baseline_dB, crest_factor, acoustic_mode.
MCA: resistance_ab, resistance_bc, resistance_ca, resistance_imbalance_pct (Ohms), inductance_ab, inductance_bc, inductance_ca, inductance_imbalance_pct (mH), impedance_ab, impedance_bc, impedance_ca (Ohms), phase_angle_ab, phase_angle_bc, phase_angle_ca (Degrees), fi (fault index), insulation_resistance_mohm (MΩ).

5. OIL, VIBRATION & MCA TRANSCRIPTION-FIRST RULE (OVERRIDES KEY MAPPING)
When detected_technology is "OIL", "VIBRATION", or "MCA", you MUST include a "raw_table" array. The code deterministically maps from raw_table to canonical fields; do NOT hand-map canonical keys in data.oil, data.vibration, or data.mca.
raw_table is MANDATORY: emit one entry per printed numeric or measurement cell.
- OIL: wear metals, contaminants, additives, viscosity, TAN, BN, oxidation, nitration, water, soot, ISO 4406 counts, sump capacity, and every time/hours field.
- VIBRATION: overall velocity, peak acceleration, running speed/RPM, 1X amplitude, every printed spectral peak frequency/amplitude, and the printed severity/alarm/condition label. Preserve each header text verbatim and the value exactly as printed.
- MCA: every printed phase-pair (U-V / V-W / W-U or A-B / B-C / C-A) measurement for Resistance (R), Inductance (L), Impedance (Z), and Phase Angle (∠Fi), the printed fault index / FI / I-F ratio, the insulation resistance (Megger) reading with its unit, and the imbalance percentages. Preserve each header text verbatim (e.g. "R 1-2", "Z T1-T2", "L 2-3", "∠Fi 1-2", "IR 500V", "FI") and the value exactly as printed.
raw_table schema: [ { "header": "<exact printed header text>", "value": number|null, "unit_as_read": string|null, "operator": string|null } ].
Row identifiers (Sample #, Lab #, Tracking #, Date, Time) are transcribed but excluded by code.
Zero Rule: a printed "0" is a real measurement — emit value 0 with status "extracted". Only blank/unmeasured cells are value null with status "absent". Never drop a zero into extra or omit it.
The "extra" object is STRICTLY for header/footer metadata only (report dates, lab IDs, customer/asset info, narrative comments). NEVER place wear metals, additive metals, or physical/chemical properties into "extra" — they belong in raw_table.
Output compact single-line JSON with no comments and no markdown.

6. SELF-VERIFICATION PASS
Before finalizing, silently re-read each header-to-value mapping. Include root "warnings" array: anomalous-but-printed values, deviant header matches, unreconciled cells.

7. FINAL STRUCTURE
{ "detected_technology": "OIL|VIBRATION|THERMOGRAPHY|ULTRASOUND|MCA|UNKNOWN", "data": { "oil": {...}, "vibration": {...}, "thermography": {...}, "ultrasound": {...}, "mca": {...} }, "extra": {...}, "warnings": [], "raw_table": [...] }`;

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
