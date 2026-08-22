/**
 * Server-only Ultrasound analysis engine.
 * Import from Express / Node API routes only — not from React client code.
 *
 * PLACEHOLDER: returns mock UltrasoundResult until Master AI prompt + model call are wired.
 * Leak mode: attaches calculateLeakImpact() economics onto peaks + financial_impact.
 *
 * WHERE TO INSERT THE MASTER ULTRASOUND AI PROMPT:
 *   1. Paste full prompt into `ULTRASOUND_MASTER_PROMPT` in `ultrasoundAnalysis.ts`
 *   2. Replace `analyzeUltrasoundData()` body below — call the model with:
 *        system: ULTRASOUND_MASTER_PROMPT
 *        user:   buildUltrasoundUserPrompt(metadata) (+ audio/image parts later)
 *   3. Parse JSON → normalizeUltrasoundResult(parsed)
 */

import {
  ULTRASOUND_MASTER_PROMPT,
  buildUltrasoundUserPrompt,
  crestFactorFromPeakRmsDb,
  normalizeUltrasoundResult,
  type AnalyzeUltrasoundOutcome,
  type AnalyzeUltrasoundRequest,
  type UltrasoundMetadata,
  type UltrasoundResult
} from "./ultrasoundAnalysis";
import { calculateLeakImpact } from "./ultrasound/leakCalculator";

function optionalPositiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function optionalNonNegNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Placeholder domain function — mock result matching UltrasoundResult.
 * // TODO: Insert Master Ultrasound AI Prompt here
 */
export async function analyzeUltrasoundData(
  metadata: UltrasoundMetadata = {}
): Promise<UltrasoundResult> {
  // TODO: Insert Master Ultrasound AI Prompt here
  // When ready:
  //   - Use ULTRASOUND_MASTER_PROMPT as the system message
  //   - Use buildUltrasoundUserPrompt(metadata) as the user text
  //   - Parse model JSON and return normalizeUltrasoundResult(parsed)
  void ULTRASOUND_MASTER_PROMPT;
  void buildUltrasoundUserPrompt;

  const mode = String(metadata.mode || "leak").toLowerCase();
  const peakFromMeta = Number(metadata.peakDbuV);
  const rmsFromMeta = Number(metadata.rmsDbuV);
  const crestFromMeta = Number(metadata.crestFactor ?? metadata.crest_factor);
  const baselineFromMeta = Number(metadata.baselineDb ?? metadata.baseline_dbmv);
  // Defaults match live parser / cleaned PMP030 test row (Peak ≥ RMS)
  const peak =
    Number.isFinite(peakFromMeta) && peakFromMeta > 0 ? peakFromMeta : 55;
  const rms =
    Number.isFinite(rmsFromMeta) && rmsFromMeta > 0 ? rmsFromMeta : 39;
  const baseline =
    Number.isFinite(baselineFromMeta) && baselineFromMeta >= 0
      ? baselineFromMeta
      : 28;
  const delta = Math.round((peak - baseline) * 10) / 10;
  const crest_factor =
    Number.isFinite(crestFromMeta) && crestFromMeta > 0
      ? Math.round(crestFromMeta * 100) / 100
      : crestFactorFromPeakRmsDb(peak, rms) ?? undefined;

  const primaryByMode: Record<string, string> = {
    leak: "Air Leak",
    mechanical: "Bearing Defect",
    electrical: "Corona / Tracking",
    valve: "Steam Trap Blow-by"
  };
  const primary = primaryByMode[mode] || "Air Leak";

  const isLeak = mode === "leak";
  const leakImpact = isLeak
    ? calculateLeakImpact({
        peakDb: peak,
        baselineDb: baseline,
        systemPressure: optionalPositiveNumber(metadata.systemPressure),
        electricityCost: optionalNonNegNumber(
          metadata.electricityCost ?? metadata.costPerKwh
        ),
        operatingHours: optionalPositiveNumber(metadata.operatingHours),
        compressorEfficiency: optionalPositiveNumber(
          metadata.compressorEfficiency
        )
      })
    : null;

  const mock: UltrasoundResult = {
    health_score: delta >= 20 ? 38 : delta >= 12 ? 55 : 72,
    primary_fault: primary,
    fault_list: [
      {
        fault: primary,
        severity: delta >= 20 ? "HIGH" : delta >= 12 ? "MEDIUM" : "LOW",
        confidence: 78,
        description: isLeak
          ? `Placeholder UE leak analysis: peak ${peak} dBµV vs baseline ${baseline} (Δ ${delta} dB) · ~${leakImpact?.flowRateCfm} CFM · $${leakImpact?.annualCost}/yr.`
          : `Placeholder UE analysis (${mode}): peak ${peak} dBµV vs baseline ${baseline} (Δ ${delta} dB). Replace with Master AI prompt output.`
      }
    ],
    peaks: {
      peak_dbmv: peak,
      rms_dbmv: rms,
      baseline_dbmv: baseline,
      delta_db: delta,
      crest_factor,
      mode,
      ...(leakImpact
        ? {
            orifice_size: leakImpact.orificeSize,
            estimated_cfm: leakImpact.flowRateCfm,
            annual_kwh: leakImpact.annualKwh,
            annual_cost: leakImpact.annualCost,
            co2_emissions: leakImpact.co2Emissions
          }
        : {})
    },
    financial_impact: {
      preventive_cost: isLeak ? 450 : 1850,
      failure_cost: isLeak
        ? Math.max(9800, Math.round(leakImpact?.annualCost ?? 9800))
        : 22000,
      roi_percentage: isLeak ? 2078 : 1089,
      downtime_loss: 2500,
      ...(leakImpact ? { annual_cost: leakImpact.annualCost } : {})
    },
    recommendations: isLeak
      ? [
          `Isolate and repair estimated ${leakImpact?.orificeSize}" orifice (~${leakImpact?.flowRateCfm} CFM).`,
          `Projected annual waste: $${leakImpact?.annualCost} (${leakImpact?.annualKwh} kWh, ${leakImpact?.co2Emissions} t CO₂e).`,
          "Re-scan after repair to confirm dBµV returns to baseline."
        ]
      : [
          "Placeholder: confirm source with UE probe sweep.",
          "Trend peak/RMS dBµV on the next collection route.",
          "Generate CMMS work order after Master AI prompt is wired."
        ],
    detailed: {
      mode,
      transducer: metadata.transducer ? String(metadata.transducer) : undefined,
      heterodyne_khz: Number(metadata.heterodyneKhz) || 40,
      gain_db: Number(metadata.gainDb) || 30,
      confidence_score: 0.78,
      iso_29821_note:
        "Placeholder engine — ISO 29821 severity mapping will come from Master AI prompt.",
      ...(leakImpact
        ? {
            analysis: {
              leak_impact: {
                orifice_size: leakImpact.orificeSize,
                estimated_cfm: leakImpact.flowRateCfm,
                annual_kwh: leakImpact.annualKwh,
                annual_cost: leakImpact.annualCost,
                co2_emissions: leakImpact.co2Emissions
              }
            }
          }
        : {})
    }
  };

  return normalizeUltrasoundResult(mock);
}

/**
 * Server-side entry — called from Express POST /api/analyze-ultrasound.
 */
export async function runUltrasoundAnalysis(
  body: AnalyzeUltrasoundRequest
): Promise<AnalyzeUltrasoundOutcome> {
  try {
    const metadata = body.metadata || {};
    // Audio/image reserved for future AI; placeholder uses metadata (+ optional peak fields).
    const data = await analyzeUltrasoundData(metadata);
    console.log("[analyze-ultrasound] Placeholder analysis complete:", {
      health: data.health_score,
      primary: data.primary_fault,
      faults: data.fault_list.length,
      peak_dbmv: data.peaks.peak_dbmv,
      mode: data.peaks.mode,
      estimated_cfm: data.peaks.estimated_cfm,
      annual_cost: data.peaks.annual_cost
    });
    return { success: true, data };
  } catch (err) {
    console.error("[analyze-ultrasound] Engine error:", err);
    return {
      success: false,
      errorType: "ANALYSIS_ERROR",
      title: "Ultrasound Analysis Error",
      message: "Unable to run ultrasound analysis.",
      httpStatus: 503,
      detail: err instanceof Error ? err.message : "Unknown error"
    };
  }
}
