/**
 * SLICE-MCA-VISION v2 — MCA grouped-bar addendum.
 *
 * The locked MASTER_VISION_PROMPT is shared by every technology and stays
 * byte-identical. This module appends an MCA-only section at request time so
 * oil / vibration / thermography / ultrasound payloads keep the exact prompt
 * they had before this slice (see buildVisionPromptForPurpose).
 *
 * §3 of the base prompt forbids reading values from bar lengths. A grouped-bar
 * MCA report has no printed numeric table, so the addendum overrides that rule
 * ONLY for this request type — and only with a disclosed axis-read tolerance.
 */

import { MASTER_VISION_PROMPT } from "./masterVisionPrompt";

export const MCA_GROUPED_BAR_SECTION = `10. MCA GROUPED-BAR CHART (APPLIES ONLY TO THIS MCA REQUEST)
- This section is active ONLY because the caller declared this upload as an MCA report. It never applies to oil, vibration, thermography, or ultrasound documents, and it does not change any other section above.
- For an MCA report whose phase data is printed as grouped bar charts (rotor positions 0° and 90°), read each bar top against the PRINTED y-axis gridlines. This is the only permitted exception to §3 "never estimate values from bar lengths"; it is an axis read, not an estimate, and it is bounded by the disclosed tolerance below.
- Emit a root "mca_bar_chart" object in addition to raw_table:
  {
    "axes": {
      "z_ohm":     { "min": <number|null>, "max": <number|null>, "major_step": <number|null>, "minor_step": <number|null> },
      "l_mh":      { "min": <number|null>, "max": <number|null>, "major_step": <number|null>, "minor_step": <number|null> },
      "angle_deg": { "min": <number|null>, "max": <number|null>, "major_step": <number|null>, "minor_step": <number|null> },
      "c_rel":     { "min": <number|null>, "max": <number|null>, "major_step": <number|null>, "minor_step": <number|null> }
    },
    "series": [
      { "phase": "A" | "B" | "C", "rotor_deg": 0 | 90,
        "z_ohm": <number|null>, "l_mh": <number|null>, "angle_deg": <number|null>, "c_rel": <number|null>,
        "status": "extracted" | "illegible" | "absent", "confidence": <0.0-1.0> }
    ]
  }
- One series entry per printed bar group: phase A/B/C × rotor position 0° and 90°. Use the phase letter the chart prints. If the chart labels winding pairs (A-B, B-C, C-A) instead of phases, do NOT use this section.
- Axis read rule: report the bar top to the precision supported by the printed minor division. The app discloses a tolerance of ± half of the printed minor division (± half of the major division when no minor ticks are printed). Never report more precision than the axis supports.
- Unreadable = honest null. If a bar top falls between gridlines with no readable position, is cropped, obscured, or its axis is missing, emit null for that metric and status "illegible". If the bar or metric is not printed at all, emit null with status "absent". Never guess, never interpolate between bars, never derive one metric from another, and never borrow a value from the other rotor position.
- status "extracted" requires a readable bar top for every emitted metric in that entry; confidence strictly below 0.8 when any part of the bar or axis is poor.
- Units exactly as the report presents them: z_ohm in Ω, l_mh in mH, angle_deg in degrees, c_rel = relative capacitance as printed (unitless; never convert to nF/µF).
- If the image is an MCA report but the data is a printed numeric table (not bars), leave "mca_bar_chart" out and use §2/§4 exactly as written.
- Never fabricate a complete axis or a series entry to fill the matrix. A missing phase or rotor position stays missing.`;

/** Full prompt for an MCA-only vision request (base + additive section). */
export const MCA_GROUPED_BAR_PROMPT = `${MASTER_VISION_PROMPT}\n\n${MCA_GROUPED_BAR_SECTION}`;

export type VisionPurpose = "mca" | "oil" | "vibration" | "thermography" | "ultrasound" | null;

/**
 * Per-technology prompt gate. Only the literal "mca" purpose receives the
 * addendum; every other technology (and an absent purpose) receives the locked
 * base prompt byte-for-byte.
 */
export function buildVisionPromptForPurpose(purpose: VisionPurpose): string {
  return purpose === "mca" ? MCA_GROUPED_BAR_PROMPT : MASTER_VISION_PROMPT;
}
