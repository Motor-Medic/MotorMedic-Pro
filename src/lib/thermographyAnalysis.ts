/**
 * Thermography Analysis — shared types + client helpers.
 * TEMPLATE for Ultrasound / MCA / Oil.
 *
 * Server AI execution lives in `thermographyAnalysisEngine.ts`
 * (imported only by Express / Node API routes — keeps OpenAI out of the browser bundle).
 *
 * Master prompt: Certified Level III / NFPA 70B 2026 / ISO 18434-1.
 */

import type { VibrationAnalysisResult } from "./consensusEngine";

/** Canonical Express + client path — keep in sync with server.ts */
export const ANALYZE_THERMOGRAPHY_API_PATH = "/api/analyze-thermography";

export type ThermographyFaultSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ThermographyFaultItem {
  fault: string;
  severity: ThermographyFaultSeverity;
  confidence: number;
  description: string;
}

/** Canonical pipeline result (UI + /api/save-analysis-result). */
export interface ThermographyResult {
  health_score: number; // 0-100
  primary_fault: string;
  fault_list: ThermographyFaultItem[];
  peaks: {
    hotspot_temp: number;
    reference_temp: number;
    delta_t: number;
  };
  financial_impact: {
    preventive_cost: number;
    failure_cost: number;
    roi_percentage: number;
    downtime_loss: number;
  };
  recommendations: string[];
  /** Optional rich Level-III payload (persisted in consensus_details). */
  detailed?: ThermographyDetailedAnalysis | null;
}

/** Radiometric / isotherm overlay values read from the thermal image HUD. */
export interface ThermographyRadiometricMetrics {
  boxAverageTemperature: number | null;
  emissivitySetting: number | null;
  isothermThreshold: number | null;
  scaleMaxBoundary: number | null;
  scaleMinBoundary: number | null;
  roiStatisticalMean: number | null;
}

export interface ThermographyDetailedAnalysis {
  extracted_data?: Record<string, unknown>;
  /** Normalized radiometric + isotherm fields for Trend Analyzer Tab 3. */
  radiometric?: ThermographyRadiometricMetrics;
  analysis?: Record<string, unknown>;
  fault_details?: Record<string, unknown>;
  actionable_recommendations?: string[];
  severity_class?: string;
  repair_urgency?: string;
  equipment_category?: string;
  confidence_score?: number;
  nfpa_70b_compliant?: boolean;
  visual_estimate_note?: string | null;
}

export interface ThermographyMetadata {
  asset?: string;
  component?: string;
  route?: string;
  assetTag?: string;
  voltage?: string;
  location?: string;
  loadPercent?: number | string;
  ambientTemp?: number | string;
  emissivity?: number | string;
  reflectedTemp?: number | string;
  distance?: number | string;
  distanceUnit?: string;
  humidity?: number | string;
  windSpeed?: number | string;
  solarCondition?: string;
  tempUnit?: "°F" | "°C" | string;
  fileName?: string;
  /** Polymorphic IR operator telemetry (nullable / optional). */
  asset_type?: string;
  phase_a_temp?: number | string | null;
  phase_b_temp?: number | string | null;
  phase_c_temp?: number | string | null;
  measured_amps?: number | string | null;
  rated_amps?: number | string | null;
  de_bearing_temp?: number | string | null;
  ode_bearing_temp?: number | string | null;
  refractory_skin_temp?: number | string | null;
  max_allowable_limit?: number | string | null;
  [key: string]: unknown;
}

export interface AnalyzeThermographyRequest {
  imageBase64?: string;
  metadata?: ThermographyMetadata;
}

export type AnalyzeThermographyOutcome =
  | { success: true; data: ThermographyResult }
  | {
      success: false;
      errorType: "MISSING_IMAGE" | "MISSING_API_KEY" | "VISION_ERROR" | "PARSE_ERROR";
      title: string;
      message: string;
      httpStatus: number;
      detail?: string;
    };

/**
 * Master AI prompt — Certified Level III Infrared Thermographer /
 * NFPA 70B 2026 / ISO 18434-1 / NFPA 70E.
 * Model must return the REQUIRED JSON OUTPUT FORMAT only (no markdown).
 */
export const THERMOGRAPHY_MASTER_PROMPT = `You are an expert Certified Level III Infrared Thermographer and Industrial Reliability Engineer specializing in NFPA 70B 2026 compliance, ISO 18434-1 condition monitoring, and AI-powered thermal analysis.

### MANDATORY VISUAL ANALYSIS (MUST BE COMPLETED FIRST)
You are FORBIDDEN from choosing fault_type until this step is complete.
Before you can diagnose ANY fault, you MUST answer these questions inside analysis.visual_evidence (and mirror the conclusion in analysis.pattern_validation):

1. What PERCENTAGE of the component area is above the threshold temperature? (e.g., "15% of the area is hot")
2. Is the heat pattern LOCALIZED (<25% of area) or UNIFORM (>75% of area)? (If between 25–75%, describe as PARTIAL / transitional and prefer connection/mechanical localized classes over Overload.)
3. Where exactly is the hottest point located? (e.g., "at a terminal connection on the left side")

Do NOT write vague phrases like "the motor is experiencing uniform heating" unless question 1 shows >75% of the component area is hot. If the hotspot is a small bright region on a cooler body, that is LOCALIZED — never Uniform.

### ENFORCED CLASSIFICATION RULES (NON-NEGOTIABLE)
- IF percentage < 25% → MUST classify as "Loose Connection" or "High Resistance" (spatial_pattern_type = "Localized Hotspot"). You are EXPLICITLY FORBIDDEN from calling this "Overload".
- IF percentage > 75% → CAN classify as "Overload" (spatial_pattern_type = "Uniform Diffuse") — only then.
- You are EXPLICITLY FORBIDDEN from calling a localized hotspot "Overload".
- If you write "uniform heating" in visual_evidence while reporting <25% hot area, that response is INVALID — reclassify as Loose Connection / High Resistance.

analysis.pattern_validation MUST follow this exact style:
"Heat distribution: [X]% of area affected. Pattern type: [Localized/Uniform]. Therefore fault type: [connection/overload]."

## STEP 1: VISUAL DATA EXTRACTION
Analyze the thermal image and extract:

1. **Image Metadata:**
   - Emissivity (ε): Extract from overlay or note "Not visible"
   - Temperature Scale: Min/Max range of color palette
   - Measurement markers: Spot temps (Sp1, Sp2), box area stats (Max/Min/Avg)
   - Ambient/Reference temperature
   - Load percentage if displayed (critical for severity assessment)

### RADIOMETRIC & ISOTHERM EXTRACTION (REQUIRED when visible on image)
Inspect camera HUD overlays, palette scale bars, isotherm filters, and measurement boxes
(FLIR, Seek, SmartIR, Testo, etc.). When any of these appear, you MUST populate
extracted_data.radiometric with numeric values (omit individual keys only when truly not visible):

- boxAverageTemperature: average temperature inside a measurement box / ROI (as labeled, °F or °C)
- emissivitySetting: emissivity ε from camera settings overlay (typically 0.85–0.98)
- isothermThreshold: isotherm alarm / filter threshold temperature (°F or °C)
- scaleMaxBoundary: upper bound of the color palette / temperature scale
- scaleMinBoundary: lower bound of the color palette / temperature scale
- roiStatisticalMean: statistical mean temperature for the ROI (Mean / Avg / μ in box stats)

Also mirror palette bounds in extracted_data.temperature_scale.min / .max and emissivity in
extracted_data.emissivity. Do NOT return null for radiometric keys — omit the key if not visible.
When a measurement box shows Avg/Mean, fill BOTH boxAverageTemperature and roiStatisticalMean.

2. **Equipment Context:**
   - Asset type (Electrical switchgear, Motor, Bearing, etc.)
   - Component identification (Phase A/B/C, inlet/outlet, etc.)
   - Environmental conditions (indoor/outdoor, wind, solar loading)

## STEP 2: PHYSICS-BASED ANALYSIS

### A. Delta T Calculation:
- ΔT = Hotspot Temperature - Reference Temperature
- Reference = adjacent phase, similar component, or ambient air
- Apply load correction: If load < 40%, note "Severity assessment limited by low load"
- Apply environmental corrections for wind cooling, solar heating, emissivity errors

### B. Fault Classification:
**CRITICAL: Classify by VISUAL HEAT DISTRIBUTION PATTERN first — never by temperature magnitude alone.**
A high ΔT alone does NOT determine fault type. Magnitude sets severity; pattern sets fault_type.
Complete MANDATORY VISUAL ANALYSIS + pattern_validation BEFORE setting fault_type.

### SPATIAL HEAT PATTERN & FAILURE MODE ANALYSIS (CRITICAL)
Before diagnosing the root cause, you MUST analyze the spatial distribution and geometry of the thermal pattern:

1. LOCALIZED POINT-SOURCE (Loose Connection / High Resistance): Heat is concentrated heavily in a small, distinct area (e.g., a terminal, bolted joint, fuse clip, or splice) with a steep thermal drop-off. RULE: If heat is localized (<25% of component area), you are FORBIDDEN from classifying this as "Overload". It MUST be classified as a Loose Connection or High Resistance joint. Set spatial_pattern_type = "Localized Hotspot".

2. UNIFORM / DIFFUSE HEATING (Overload or Internal Harmonics): Heat is spread broadly and evenly across the entire body of the conductor bundle, transformer tank, or motor housing without a single sharp focal point (>75% of component area hot). Only then may an Overload be diagnosed. Set spatial_pattern_type = "Uniform Diffuse".

3. SYMMETRICAL HOUSING HEATING (Mechanical Friction / Misalignment): Heat is concentrated symmetrically around a bearing cap, seal housing, or coupling interface. Set spatial_pattern_type = "Symmetrical Mechanical".

### Visual Pattern Recognition Rules (STRICT — apply after spatial_pattern_type is chosen):

1. **LOOSE CONNECTION / HIGH RESISTANCE:**
   - Visual Signature: Heat is LOCALIZED to a specific point (e.g., a lug, terminal, bolt, or splice). The rest of the component is significantly cooler.
   - Rule: If the hotspot is concentrated in <25% of the component area, it MUST be classified as a connection fault (Loose Connection or High Resistance), NOT Overload.
   - Do NOT call a point hotspot "Overload" even if ΔT is large.

2. **OVERLOAD:**
   - Visual Signature: Heat is UNIFORM across the entire conductor or component. The whole object is glowing evenly along its visible length.
   - Rule: Only classify as Overload if >75% of the component area is hot AND the temperature rise is consistent across the entire visible length.
   - If heat is a blob / tip / lug / joint, it is NOT Overload.

3. **PHASE IMBALANCE:**
   - Visual Signature: One of three phases (A, B, or C) is significantly hotter than the other two, which look similar to each other.
   - Rule: Requires seeing multiple phases in the frame to confirm. If only one conductor is visible, do NOT classify as Phase Imbalance.

4. **HARMONIC HEATING:**
   - Visual Signature: The neutral conductor is hotter than the phase conductors.
   - Rule: Requires identifiable neutral vs phase conductors. Do not invent this class without that visual evidence.

**Electrical Faults (pattern → label):**
- Loose Connection: Localized hotspot at connection point, ΔT concentrated (<25% area)
- High Resistance: I²R heating at a discrete contact/joint (same localized signature as connection)
- Phase Imbalance: One phase significantly hotter than the other two (multi-phase view required)
- Overload: Uniform heating across entire conductor length only (>75% area)
- Harmonic Heating: Neutral hotter than phases

**Mechanical Faults (per ISO 18434-1):**
- Friction: Linear temperature gradient along moving surface
- Misalignment: Asymmetric heating pattern on coupling/bearing
- Lubrication Failure: Elevated bearing temperature, uniform heat distribution
- Bearing Defect: Localized heating at bearing race locations

**Required fields:**
- analysis.spatial_pattern_type — one of: "Localized Hotspot" | "Uniform Diffuse" | "Symmetrical Mechanical"
- analysis.visual_evidence — MUST answer the three MANDATORY VISUAL ANALYSIS questions (percentage, Localized vs Uniform, hottest-point location) and justify fault_type from geometry
- analysis.pattern_validation — MUST state: "Heat distribution: [X]% of area affected. Pattern type: [Localized/Uniform]. Therefore fault type: [connection/overload]."

### C. Severity Assessment (NFPA 70B 2026 Section 7.4):
**For Electrical Equipment:**
- **Class 1 (LOW):** ΔT 1-3°C (1.8-5.4°F) → Monitor, routine re-inspection
- **Class 2 (MEDIUM):** ΔT 4-15°C (7.2-27°F) → Schedule repair within 30 days
- **Class 3 (HIGH):** ΔT 16-40°C (28.8-72°F) → Priority repair within 7 days
- **Class 4 (CRITICAL):** ΔT >40°C (>72°F) → Immediate action required (24-48 hrs)

**For Mechanical Equipment (ISO 18434-1):**
- Apply similar ΔT thresholds adjusted for bearing class and speed

**health_score (0–100) — map from severity class (do NOT invent other scales):**
- Class 1 / Green → health_score = 90
- Class 2 / Yellow → health_score = 70
- Class 3 / Orange → health_score = 40
- Class 4 / Red → health_score = 10
- None Detected / healthy → health_score = 90

### D. Confidence Scoring (0.0-1.0):
Base confidence on:
- Image quality (resolution, focus, clarity): 0-0.3 points
- Load conditions (≥40% = +0.3, <40% = +0.1): 0-0.3 points
- Measurement clarity (clear markers vs visual estimate): 0-0.2 points
- Environmental factors (controlled vs variable): 0-0.2 points

## STEP 3: SAFETY & COMPLIANCE

**NFPA 70E Safety Requirements:**
- PPE Category based on equipment voltage and fault type
- Arc flash boundary calculation
- Lockout/Tagout (LOTO) requirements
- De-energization recommendation for Class 3/4 faults

## SPECIAL HANDLING FOR STANDARD IMAGES:
If image is standard JPG/PNG (not radiometric):
- Use computer vision to detect color gradients and hotspot locations
- Estimate relative temperature based on color palette position
- Note: "Temperature values estimated from visual analysis; radiometric data recommended for precise measurement"
- Reduce confidence score by 0.2 points
- Still provide full fault classification and severity assessment using Spatial Heat Pattern + Visual Pattern Recognition Rules above

## REQUIRED JSON OUTPUT FORMAT:
Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema.
Do NOT include financial_impact, ROI, repair costs, downtime costs, or actionable_recommendations — those are computed by backend code.
{
  "extracted_data": {
    "emissivity": "number or 'Not visible'",
    "temperature_scale": {"min": number, "max": number, "unit": "°F or °C"},
    "radiometric": {
      "boxAverageTemperature": number,
      "emissivitySetting": number,
      "isothermThreshold": number,
      "scaleMaxBoundary": number,
      "scaleMinBoundary": number,
      "roiStatisticalMean": number
    },
    "hotspot_temperature": number,
    "reference_temperature": number,
    "ambient_temperature": number,
    "load_percentage": number or null,
    "visible_identifiers": "string"
  },
  "analysis": {
    "anomaly_detected": boolean,
    "equipment_category": "Electrical" | "Mechanical",
    "fault_type": "Loose Connection" | "Phase Imbalance" | "Overload" | "Friction" | "Misalignment" | "Lubrication Failure" | "Bearing Defect" | "Harmonic Heating" | "High Resistance" | "None Detected" | string,
    "spatial_pattern_type": "Localized Hotspot" | "Uniform Diffuse" | "Symmetrical Mechanical",
    "visual_evidence": "REQUIRED: answer (1) % of component area hot, (2) Localized vs Uniform, (3) exact hottest-point location, then justify fault_type from geometry — never claim uniform heating unless >75% area is hot",
    "pattern_validation": "REQUIRED exact style: Heat distribution: [X]% of area affected. Pattern type: [Localized/Uniform]. Therefore fault type: [connection/overload].",
    "delta_t": {"value": number, "unit": "°F or °C"},
    "load_corrected": boolean,
    "severity_class": "Class 1" | "Class 2" | "Class 3" | "Class 4",
    "severity_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "nfpa_70b_compliant": boolean,
    "health_score": number,
    "repair_urgency": "Routine" | "Schedule 30 days" | "Priority 7 days" | "Immediate 24-48hrs",
    "safety_requirements": {
      "ppe_category": "Category 1-4",
      "arc_flash_boundary": "distance in inches/cm",
      "loto_required": boolean
    },
    "confidence_score": number,
    "confidence_factors": {
      "image_quality": "Good/Fair/Poor",
      "load_adequacy": "Adequate/Marginal/Insufficient",
      "measurement_method": "Radiometric/Visual-Estimate"
    }
  },
  "fault_details": {
    "description": "Technical description of fault mechanism",
    "root_cause": "Probable underlying cause",
    "progression": "Expected degradation timeline if uncorrected",
    "secondary_effects": "Potential collateral damage",
    "verification_method": "How to confirm repair success"
  }
}

If no meaningful thermal anomaly is present:
- analysis.anomaly_detected = false
- analysis.fault_type = "None Detected"
- analysis.spatial_pattern_type = "Uniform Diffuse"
- analysis.visual_evidence = "1) ~0% of the component area is above threshold. 2) No anomalous Localized or Uniform heating. 3) No distinct hottest point above ambient/reference."
- analysis.pattern_validation = "Heat distribution: 0% of area affected. Pattern type: Uniform. Therefore fault type: none."
- analysis.severity_level = "LOW"
- analysis.severity_class = "Class 1"
- analysis.health_score = 90`;

function asText(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse overlay numbers; rejects "Not visible" and non-numeric strings. */
function pickRadiometricNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null || v === "") continue;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed || /not visible|n\/a|unknown/i.test(trimmed)) continue;
      const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      if (!m) continue;
      const n = Number(m[0]);
      if (Number.isFinite(n)) return n;
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Normalize radiometric / isotherm fields from AI JSON (camelCase, snake_case, nested).
 */
export function extractRadiometricMetrics(
  source: Record<string, unknown> | null | undefined
): ThermographyRadiometricMetrics {
  const root = source && typeof source === "object" ? source : {};
  const extracted =
    root.extracted_data && typeof root.extracted_data === "object"
      ? (root.extracted_data as Record<string, unknown>)
      : root;
  const radiometric =
    extracted.radiometric && typeof extracted.radiometric === "object"
      ? (extracted.radiometric as Record<string, unknown>)
      : root.radiometric && typeof root.radiometric === "object"
        ? (root.radiometric as Record<string, unknown>)
        : {};
  const analysis =
    root.analysis && typeof root.analysis === "object"
      ? (root.analysis as Record<string, unknown>)
      : null;
  const tempScale =
    extracted.temperature_scale && typeof extracted.temperature_scale === "object"
      ? (extracted.temperature_scale as Record<string, unknown>)
      : {};

  const boxAverageTemperature = pickRadiometricNum(
    radiometric.boxAverageTemperature,
    extracted.boxAverageTemperature,
    extracted.box_average_temperature,
    extracted.box_average_temp,
    extracted.box_avg_temp,
    extracted.box_avg,
    extracted.area_avg
  );
  const roiStatisticalMean = pickRadiometricNum(
    radiometric.roiStatisticalMean,
    extracted.roiStatisticalMean,
    extracted.roi_statistical_mean,
    extracted.roi_mean,
    extracted.mean_temp,
    extracted.box_mean,
    radiometric.boxAverageTemperature,
    boxAverageTemperature
  );

  return {
    boxAverageTemperature,
    emissivitySetting: pickRadiometricNum(
      radiometric.emissivitySetting,
      extracted.emissivitySetting,
      extracted.emissivity_setting,
      extracted.emissivity,
      extracted.epsilon
    ),
    isothermThreshold: pickRadiometricNum(
      radiometric.isothermThreshold,
      extracted.isothermThreshold,
      extracted.isotherm_threshold,
      extracted.isotherm,
      analysis?.isotherm_threshold,
      analysis?.isothermThreshold
    ),
    scaleMaxBoundary: pickRadiometricNum(
      radiometric.scaleMaxBoundary,
      extracted.scaleMaxBoundary,
      extracted.scale_max_boundary,
      extracted.scale_max,
      extracted.palette_max,
      tempScale.max,
      tempScale.maximum
    ),
    scaleMinBoundary: pickRadiometricNum(
      radiometric.scaleMinBoundary,
      extracted.scaleMinBoundary,
      extracted.scale_min_boundary,
      extracted.scale_min,
      extracted.palette_min,
      tempScale.min,
      tempScale.minimum
    ),
    roiStatisticalMean
  };
}

function normalizeSeverity(raw: unknown): ThermographyFaultSeverity {
  const s = String(raw || "").toUpperCase();
  if (s.includes("CLASS 4") || s === "CRITICAL") return "CRITICAL";
  if (s.includes("CLASS 3") || s === "HIGH") return "HIGH";
  if (s.includes("CLASS 2") || s === "MEDIUM" || s === "ANOMALY" || s === "WARNING")
    return "MEDIUM";
  if (s.includes("CLASS 1")) return "LOW";
  return "LOW";
}

function confidenceToPercent(raw: unknown, fallback = 75): number {
  const n = num(raw, fallback);
  // Model may return 0–1 or 0–100
  if (n >= 0 && n <= 1) return clamp(Math.round(n * 100), 0, 100);
  return clamp(Math.round(n), 0, 100);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return asText(o.step ?? o.action ?? o.text ?? o.description, "").trim();
      }
      return String(item || "").trim();
    })
    .filter(Boolean);
}

/**
 * Coerce model JSON (flat legacy OR Level-III nested schema) into ThermographyResult.
 */
export function normalizeThermographyResult(raw: unknown): ThermographyResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const extracted =
    obj.extracted_data && typeof obj.extracted_data === "object"
      ? (obj.extracted_data as Record<string, unknown>)
      : null;
  const analysis =
    obj.analysis && typeof obj.analysis === "object"
      ? (obj.analysis as Record<string, unknown>)
      : null;
  const faultDetails =
    obj.fault_details && typeof obj.fault_details === "object"
      ? (obj.fault_details as Record<string, unknown>)
      : null;

  const peaksRaw =
    obj.peaks && typeof obj.peaks === "object"
      ? (obj.peaks as Record<string, unknown>)
      : {};

  const finNested =
    analysis?.financial_impact && typeof analysis.financial_impact === "object"
      ? (analysis.financial_impact as Record<string, unknown>)
      : null;
  const finRaw =
    finNested ||
    (obj.financial_impact && typeof obj.financial_impact === "object"
      ? (obj.financial_impact as Record<string, unknown>)
      : {});

  const deltaObj =
    analysis?.delta_t && typeof analysis.delta_t === "object"
      ? (analysis.delta_t as Record<string, unknown>)
      : null;

  const hotspot = num(
    peaksRaw.hotspot_temp ??
      extracted?.hotspot_temperature ??
      analysis?.hotspot_temperature,
    0
  );
  const reference = num(
    peaksRaw.reference_temp ??
      extracted?.reference_temperature ??
      analysis?.reference_temperature,
    0
  );
  const delta =
    peaksRaw.delta_t != null
      ? num(peaksRaw.delta_t, Math.abs(hotspot - reference))
      : deltaObj?.value != null
        ? num(deltaObj.value, Math.abs(hotspot - reference))
        : Math.abs(hotspot - reference);

  const preventive = num(
    finRaw.preventive_cost ??
      finRaw.preventive_repair_cost ??
      finRaw.preventiveRepairCost,
    2500
  );
  const failure = num(
    finRaw.failure_cost ??
      finRaw.failure_cost_if_delayed ??
      finRaw.failureCostIfDelayed,
    25000
  );
  const downtime = num(
    finRaw.downtime_loss ??
      finRaw.downtime_cost_per_hour ??
      finRaw.downtimeLossPerHour,
    5000
  );
  const roi =
    finRaw.roi_percentage != null
      ? num(finRaw.roi_percentage, 0)
      : preventive > 0
        ? Math.round(((failure - preventive) / preventive) * 100)
        : 0;

  const severityLevel = normalizeSeverity(
    analysis?.severity_level ?? analysis?.severity_class ?? obj.severity
  );
  const confidencePct = confidenceToPercent(
    analysis?.confidence_score ?? obj.confidence,
    75
  );

  const faultType = asText(
    analysis?.fault_type ?? obj.primary_fault,
    ""
  ).trim();
  const anomaly =
    analysis?.anomaly_detected === true ||
    (analysis?.anomaly_detected !== false &&
      faultType !== "" &&
      faultType.toLowerCase() !== "none detected");

  const primary =
    faultType ||
    asText(obj.primary_fault, "").trim() ||
    (anomaly ? "Localized Overheating" : "None Detected");

  const descriptionParts = [
    asText(faultDetails?.description, ""),
    asText(analysis?.recommended_action, ""),
    asText(faultDetails?.root_cause, "")
      ? `Root cause: ${asText(faultDetails?.root_cause, "")}`
      : ""
  ].filter((s) => s && s !== "—");

  let fault_list: ThermographyFaultItem[] = [];
  const faultListRaw = Array.isArray(obj.fault_list) ? obj.fault_list : [];
  if (faultListRaw.length > 0) {
    fault_list = faultListRaw
      .map((item) => {
        const f = (item && typeof item === "object" ? item : {}) as Record<
          string,
          unknown
        >;
        const fault = asText(f.fault ?? f.title, "").trim();
        if (!fault) return null;
        return {
          fault,
          severity: normalizeSeverity(f.severity),
          confidence: confidenceToPercent(f.confidence ?? f.confidencePercent, 70),
          description: asText(f.description ?? f.detail, "")
        };
      })
      .filter(Boolean) as ThermographyFaultItem[];
  } else if (primary !== "None Detected" && anomaly) {
    fault_list = [
      {
        fault: primary,
        severity: severityLevel,
        confidence: confidencePct,
        description: descriptionParts.join(" ") || `${primary} detected via IR analysis.`
      }
    ];
  }

  const actionable = asStringList(obj.actionable_recommendations);
  const legacyRecs = asStringList(obj.recommendations);
  const recommendedAction = asText(analysis?.recommended_action, "").trim();
  const recommendations =
    actionable.length > 0
      ? actionable
      : legacyRecs.length > 0
        ? legacyRecs
        : recommendedAction
          ? [recommendedAction]
          : primary === "None Detected"
            ? [
                "Continue routine IR route monitoring per NFPA 70B.",
                "Trend ΔT on next inspection cycle.",
                "Maintain load ≥40% for severity-valid resurvey when possible."
              ]
            : [
                "Verify load and re-scan under similar operating conditions.",
                "Inspect connections / cooling path at the indicated hotspot.",
                "Apply LOTO and PPE per NFPA 70E before corrective work.",
                "Document corrective action and re-scan after repair."
              ];

  const health = clamp(
    Math.round(
      num(
        analysis?.health_score ?? obj.health_score ?? obj.overallHealthScore,
        primary === "None Detected"
          ? 90
          : severityLevel === "CRITICAL"
            ? 25
            : severityLevel === "HIGH"
              ? 45
              : severityLevel === "MEDIUM"
                ? 65
                : 82
      )
    ),
    0,
    100
  );

  const measurementMethod = asText(
    (analysis?.confidence_factors as Record<string, unknown> | undefined)
      ?.measurement_method,
    ""
  );
  const visualNote =
    measurementMethod.toLowerCase().includes("visual")
      ? "Temperature values estimated from visual analysis; radiometric data recommended for precise measurement"
      : null;

  const radiometric = extractRadiometricMetrics({
    extracted_data: extracted || undefined,
    analysis: analysis || undefined
  });
  const hasRadiometric = Object.values(radiometric).some((v) => v != null);
  const extractedMerged: Record<string, unknown> = {
    ...(extracted || {}),
    radiometric: {
      boxAverageTemperature: radiometric.boxAverageTemperature,
      emissivitySetting: radiometric.emissivitySetting,
      isothermThreshold: radiometric.isothermThreshold,
      scaleMaxBoundary: radiometric.scaleMaxBoundary,
      scaleMinBoundary: radiometric.scaleMinBoundary,
      roiStatisticalMean: radiometric.roiStatisticalMean
    },
    ...(radiometric.emissivitySetting != null
      ? { emissivity: radiometric.emissivitySetting }
      : {}),
    ...(radiometric.scaleMinBoundary != null || radiometric.scaleMaxBoundary != null
      ? {
          temperature_scale: {
            ...(extracted?.temperature_scale &&
            typeof extracted.temperature_scale === "object"
              ? (extracted.temperature_scale as Record<string, unknown>)
              : {}),
            min:
              radiometric.scaleMinBoundary ??
              pickRadiometricNum(
                (extracted?.temperature_scale as Record<string, unknown> | undefined)
                  ?.min
              ),
            max:
              radiometric.scaleMaxBoundary ??
              pickRadiometricNum(
                (extracted?.temperature_scale as Record<string, unknown> | undefined)
                  ?.max
              )
          }
        }
      : {})
  };

  const detailed: ThermographyDetailedAnalysis = {
    extracted_data: extracted || hasRadiometric ? extractedMerged : undefined,
    radiometric,
    analysis: analysis || undefined,
    fault_details: faultDetails || undefined,
    actionable_recommendations: actionable.length ? actionable : undefined,
    severity_class: asText(analysis?.severity_class, "") || undefined,
    repair_urgency: asText(analysis?.repair_urgency, "") || undefined,
    equipment_category: asText(analysis?.equipment_category, "") || undefined,
    confidence_score:
      analysis?.confidence_score != null
        ? num(analysis.confidence_score, confidencePct / 100)
        : confidencePct / 100,
    nfpa_70b_compliant: analysis?.nfpa_70b_compliant === true,
    visual_estimate_note: visualNote
  };

  return {
    health_score: health,
    primary_fault: primary === "None Detected" || !anomaly ? "None Detected" : primary,
    fault_list: primary === "None Detected" || !anomaly ? [] : fault_list,
    peaks: {
      hotspot_temp: hotspot,
      reference_temp: reference,
      delta_t: Math.round(delta * 10) / 10
    },
    financial_impact: {
      preventive_cost: Math.round(preventive),
      failure_cost: Math.round(failure),
      roi_percentage: Math.round(roi),
      downtime_loss: Math.round(downtime)
    },
    recommendations,
    detailed:
      extracted || analysis || faultDetails || hasRadiometric
        ? detailed
        : null
  };
}

/** Build the user message (equipment + physics context) for the vision model. */
export function buildThermographyUserPrompt(metadata: ThermographyMetadata): string {
  const looksStandardImage =
    metadata.fileName &&
    /\.(jpe?g|png|gif|webp)$/i.test(String(metadata.fileName)) &&
    !/\.(r-?jpe?g|is2|seq)$/i.test(String(metadata.fileName));

  return `Perform the full Level III thermography analysis workflow (Steps 1–3) on this thermal image and return ONLY the REQUIRED JSON OUTPUT FORMAT.

=== EQUIPMENT / ROUTE CONTEXT (OPERATOR-PROVIDED) ===
Asset: ${asText(metadata.asset, "Unknown")}
Asset Tag: ${asText(metadata.assetTag, "—")}
Component: ${asText(metadata.component, "Unknown")}
Route: ${asText(metadata.route, "—")}
Location: ${asText(metadata.location, "—")}
Voltage: ${asText(metadata.voltage, "—")}
File: ${asText(metadata.fileName, "thermal-image")}
Image type hint: ${looksStandardImage ? "Likely standard JPG/PNG screenshot (apply visual-estimate handling)" : "Possibly radiometric or unknown — inspect overlays"}

=== ENVIRONMENTAL / PHYSICS METADATA (OPERATOR-PROVIDED) ===
Temp Unit preference: ${asText(metadata.tempUnit, "°F")}
Ambient Temp: ${asText(metadata.ambientTemp, "unknown")}
Emissivity (ε): ${asText(metadata.emissivity, "unknown")}
Reflected Apparent Temp: ${asText(metadata.reflectedTemp, "unknown")}
Distance: ${asText(metadata.distance, "unknown")} ${asText(metadata.distanceUnit, "")}
Humidity %: ${asText(metadata.humidity, "unknown")}
Wind Speed: ${asText(metadata.windSpeed, "unknown")}
Solar Condition: ${asText(metadata.solarCondition, "unknown")}
Load %: ${asText(metadata.loadPercent, "unknown")}

=== ASSET-SPECIFIC TELEMETRY (OPERATOR-PROVIDED, OPTIONAL) ===
Asset Type: ${asText(metadata.asset_type, "unknown")}
Phase A Temp: ${asText(metadata.phase_a_temp, "—")}
Phase B Temp: ${asText(metadata.phase_b_temp, "—")}
Phase C Temp: ${asText(metadata.phase_c_temp, "—")}
Measured Amps: ${asText(metadata.measured_amps, "—")}
Rated Amps: ${asText(metadata.rated_amps, "—")}
DE Bearing Temp: ${asText(metadata.de_bearing_temp, "—")}
ODE Bearing Temp: ${asText(metadata.ode_bearing_temp, "—")}
Refractory Skin Temp: ${asText(metadata.refractory_skin_temp, "—")}
Max Allowable Limit: ${asText(metadata.max_allowable_limit, "—")}

Prefer operator-provided emissivity/ambient/load when image overlays are missing.
When camera HUD shows palette scale, isotherm, emissivity, or box/ROI statistics, you MUST
fill extracted_data.radiometric with boxAverageTemperature, emissivitySetting, isothermThreshold,
scaleMaxBoundary, scaleMinBoundary, and roiStatisticalMean as numbers.
If load < 40%, set analysis.load_corrected appropriately and note limited severity validity.
Apply NFPA 70B 2026 ΔT class thresholds and NFPA 70E safety fields.`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read thermal image file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Client helper: File → API → ThermographyResult.
 */
export async function analyzeThermalImage(
  imageFile: File,
  metadata: ThermographyMetadata = {}
): Promise<ThermographyResult> {
  const imageBase64 = await fileToDataUrl(imageFile);
  const res = await fetch(ANALYZE_THERMOGRAPHY_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64,
      metadata: { ...metadata, fileName: metadata.fileName || imageFile.name }
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        payload?.detail ||
        `Thermography analysis failed (HTTP ${res.status})`
    );
  }
  const data = payload?.data ?? payload;
  return normalizeThermographyResult(data);
}

function mapFaultSeverityToApi(
  sev: ThermographyFaultSeverity
): "NORMAL" | "ANOMALY" | "CRITICAL" {
  if (sev === "CRITICAL" || sev === "HIGH") return "CRITICAL";
  if (sev === "MEDIUM") return "ANOMALY";
  return "NORMAL";
}

function overallSeverityFromResult(
  result: ThermographyResult
): "NORMAL" | "ANOMALY" | "CRITICAL" {
  if (
    result.primary_fault === "None Detected" ||
    result.fault_list.length === 0
  ) {
    return result.health_score >= 80 ? "NORMAL" : "ANOMALY";
  }
  const ranks: Record<ThermographyFaultSeverity, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
  };
  let max: ThermographyFaultSeverity = "LOW";
  for (const f of result.fault_list) {
    if (ranks[f.severity] > ranks[max]) max = f.severity;
  }
  return mapFaultSeverityToApi(max);
}

function urgencyActionWindow(result: ThermographyResult, severity: string): string {
  const urgency = result.detailed?.repair_urgency || "";
  if (urgency) return urgency;
  if (severity === "CRITICAL") {
    return "Immediate action required (24–48 hrs) — NFPA 70B Class 4.";
  }
  if (severity === "ANOMALY") {
    return "Schedule repair within 30 days (NFPA 70B Class 2) or sooner if trending.";
  }
  return "Routine monitoring — continue IR route per NFPA 70B.";
}

/**
 * Map canonical ThermographyResult → existing Run Diagnostics UI shape
 * (ThermographyResultsDashboard currently consumes VibrationAnalysisResult).
 */
export function mapThermographyToUiResult(
  result: ThermographyResult
): VibrationAnalysisResult {
  const severity = overallSeverityFromResult(result);
  const primarySev =
    result.fault_list.find((f) => f.fault === result.primary_fault)?.severity ||
    (severity === "CRITICAL" ? "CRITICAL" : severity === "ANOMALY" ? "MEDIUM" : "LOW");

  const classLabel = result.detailed?.severity_class
    ? ` · ${result.detailed.severity_class}`
    : "";
  const visualNote = result.detailed?.visual_estimate_note
    ? ` ${result.detailed.visual_estimate_note}`
    : "";

  const conf =
    result.fault_list.find((f) => f.fault === result.primary_fault)?.confidence ??
    (result.detailed?.confidence_score != null
      ? confidenceToPercent(result.detailed.confidence_score, 80)
      : result.primary_fault === "None Detected"
        ? 85
        : 80);

  return {
    overallHealthScore: result.health_score,
    severity,
    summary:
      result.primary_fault === "None Detected"
        ? `Thermal scan healthy${classLabel}. Hotspot ${result.peaks.hotspot_temp} vs reference ${result.peaks.reference_temp} (ΔT ${result.peaks.delta_t}).${visualNote}`
        : `${result.primary_fault}${classLabel}: hotspot ${result.peaks.hotspot_temp} vs reference ${result.peaks.reference_temp} (ΔT ${result.peaks.delta_t}).${visualNote}`,
    primaryFault: {
      title: result.primary_fault,
      frequencyHz: 0,
      confidencePercent: clamp(conf, 0, 100),
      severity: mapFaultSeverityToApi(normalizeSeverity(primarySev)),
      actionWindow: urgencyActionWindow(result, severity)
    },
    identifiedFaults: result.fault_list.map((f) => ({
      title: f.fault,
      frequencyHz: 0,
      confidencePercent: f.confidence,
      severity: mapFaultSeverityToApi(f.severity),
      description: f.description
    })),
    financialImpact: {
      preventiveRepairCost: result.financial_impact.preventive_cost,
      failureCostIfDelayed: result.financial_impact.failure_cost,
      downtimeLossPerHour: result.financial_impact.downtime_loss
    },
    repairRecommendations: result.recommendations,
    consensusDetails: {
      modelA_Hypothesis: `Level III IR · ΔT ${result.peaks.delta_t}${classLabel}`,
      modelB_Hypothesis: `Hotspot ${result.peaks.hotspot_temp} / Ref ${result.peaks.reference_temp}${
        result.detailed?.equipment_category
          ? ` · ${result.detailed.equipment_category}`
          : ""
      }`,
      refereeDebateSummary: JSON.stringify({
        roi_percentage: result.financial_impact.roi_percentage,
        pipeline: "thermographyAnalysis",
        nfpa_70b: result.detailed?.nfpa_70b_compliant ?? null,
        confidence_score: result.detailed?.confidence_score ?? null,
        repair_urgency: result.detailed?.repair_urgency ?? null,
        extracted_data: result.detailed?.extracted_data ?? null,
        analysis: result.detailed?.analysis ?? null,
        fault_details: result.detailed?.fault_details ?? null
      })
    }
  };
}

/** Peaks payload suitable for /api/save-analysis-result (jsonb array). */
export function thermographyPeaksForSave(result: ThermographyResult): unknown[] {
  const extracted =
    result.detailed?.extracted_data &&
    typeof result.detailed.extracted_data === "object"
      ? (result.detailed.extracted_data as Record<string, unknown>)
      : {};
  const analysis =
    result.detailed?.analysis && typeof result.detailed.analysis === "object"
      ? (result.detailed.analysis as Record<string, unknown>)
      : {};

  const radiometric =
    result.detailed?.radiometric ??
    extractRadiometricMetrics({
      extracted_data: extracted,
      analysis
    });

  const pickNum = (...vals: unknown[]): number | null => {
    for (const v of vals) {
      const n = pickRadiometricNum(v);
      if (n != null) return n;
    }
    return null;
  };

  const boxAvg =
    radiometric.boxAverageTemperature ?? radiometric.roiStatisticalMean;
  const roiMean =
    radiometric.roiStatisticalMean ?? radiometric.boxAverageTemperature;

  return [
    {
      type: "thermography",
      hotspot_temp: result.peaks.hotspot_temp,
      reference_temp: result.peaks.reference_temp,
      delta_t: result.peaks.delta_t,
      severity_class: result.detailed?.severity_class ?? null,
      equipment_category: result.detailed?.equipment_category ?? null,
      // Optional richer fields when AI / metadata provides them (Trend Analyzer tabs)
      phase_a_temp: pickNum(extracted.phase_a_temp, extracted.phase_a),
      phase_b_temp: pickNum(extracted.phase_b_temp, extracted.phase_b),
      phase_c_temp: pickNum(extracted.phase_c_temp, extracted.phase_c),
      load_percentage: pickNum(
        extracted.load_percentage,
        extracted.load_percent,
        analysis.load_percentage
      ),
      calculated_i2r_delta: pickNum(
        analysis.calculated_i2r_delta,
        analysis.i2r_delta
      ),
      i2r_normalized_delta_t: pickNum(
        analysis.i2r_normalized_delta_t,
        analysis.normalized_delta_t,
        analysis.delta_t_at_full_load
      ),
      current_amps: pickNum(extracted.current_amps, extracted.amperage, extracted.amps),
      rated_amps: pickNum(extracted.rated_amps, extracted.fla, extracted.full_load_amps),
      // Radiometric & isotherm — canonical camelCase + snake_case for persistence / charts
      boxAverageTemperature: boxAvg,
      emissivitySetting: radiometric.emissivitySetting,
      isothermThreshold: radiometric.isothermThreshold,
      scaleMaxBoundary: radiometric.scaleMaxBoundary,
      scaleMinBoundary: radiometric.scaleMinBoundary,
      roiStatisticalMean: roiMean,
      emissivity: radiometric.emissivitySetting,
      emissivity_setting: radiometric.emissivitySetting,
      scale_min: radiometric.scaleMinBoundary,
      scale_max: radiometric.scaleMaxBoundary,
      isotherm_threshold: radiometric.isothermThreshold,
      box_average_temp: boxAvg,
      box_average_temperature: boxAvg,
      roi_statistical_mean: roiMean,
      reflected_apparent_temp: pickNum(
        extracted.reflected_apparent_temp,
        extracted.reflected_temp
      ),
      de_bearing_temp: pickNum(extracted.de_bearing_temp, extracted.bearing_de),
      ode_bearing_temp: pickNum(
        extracted.ode_bearing_temp,
        extracted.nde_bearing_temp,
        extracted.bearing_nde
      ),
      skin_temp: pickNum(extracted.skin_temp, extracted.housing_temp),
      refractory_skin_temp: pickNum(
        extracted.refractory_skin_temp,
        extracted.lagging_temp,
        extracted.shell_temp
      ),
      ambient_reference_temp: pickNum(
        extracted.ambient_reference_temp,
        extracted.ambient_temp,
        extracted.reference_temperature
      ),
      max_allowable_limit: pickNum(
        analysis.max_allowable_limit,
        analysis.alarm_limit
      ),
      thermal_gradient: pickNum(analysis.thermal_gradient, analysis.gradient),
      thermal_dissipation_rate: pickNum(
        analysis.thermal_dissipation_rate,
        analysis.creep_rate,
        analysis.temp_rise_rate
      ),
      frictional_severity: (() => {
        const v =
          analysis.frictional_severity ??
          analysis.iso_18434_severity ??
          analysis.mechanical_severity;
        return v != null && String(v).trim() ? String(v).trim() : null;
      })(),
      frictional_anomaly:
        analysis.frictional_anomaly === true ||
        analysis.frictional_anomaly === false
          ? analysis.frictional_anomaly
          : null
    }
  ];
}
