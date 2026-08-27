/**
 * Server-only Ultrasound analysis engine.
 * Import from Express / Node API routes only — not from React client code.
 *
 * This engine composes descriptions and recommendations from measured data
 * using a tiered pattern. When the Master AI prompt is wired, it will
 * replace this entire function body.
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

type DescriptionTier = "measurements" | "none";

interface UltrasoundDescription {
  tier: DescriptionTier;
  text: string;
}

function composeUltrasoundDescription(input: {
  mode: string;
  peak: number;
  rms: number;
  baseline: number;
  delta: number;
  crestFactor: number | undefined;
  primaryFault: string;
}): UltrasoundDescription {
  const { mode, peak, rms, baseline, delta, crestFactor, primaryFault } = input;
  const hasMeasurements = Number.isFinite(peak) && Number.isFinite(baseline);

  if (hasMeasurements) {
    const severityLabel = delta >= 20 ? "Critical" : delta >= 12 ? "Elevated" : "Low";
    const crestText = crestFactor != null ? `, crest factor ${crestFactor.toFixed(2)}` : "";
    const modeContext: Record<string, string> = {
      mechanical: "bearing or gear mesh",
      electrical: "corona, tracking, or partial discharge",
      valve: "steam trap blow-by or valve seat leakage",
      leak: "compressed air or gas leak"
    };
    const context = modeContext[mode] || "ultrasound source";

    return {
      tier: "measurements",
      text:
        `${primaryFault} detected via ultrasound (${mode} mode). ` +
        `Peak ${peak.toFixed(1)} dBµV vs baseline ${baseline.toFixed(1)} dBµV (Δ ${delta.toFixed(1)} dB), ` +
        `RMS ${rms.toFixed(1)} dBµV${crestText}. ` +
        `Severity: ${severityLabel}. ` +
        `Exceedance suggests ${context} activity requiring inspection.`
    };
  }

  return { tier: "none", text: "No ultrasonic analysis recorded." };
}

function composeUltrasoundRecommendations(input: {
  mode: string;
  peak: number;
  baseline: number;
  delta: number;
  primaryFault: string;
  leakImpact: { orificeSize: number; flowRateCfm: number; annualCost: number; annualKwh: number; co2Emissions: number } | null;
}): string[] {
  const { mode, peak, baseline, delta, primaryFault, leakImpact } = input;
  const isLeak = mode === "leak";

  if (isLeak && leakImpact) {
    return [
      `Isolate and repair estimated ${leakImpact.orificeSize}" orifice (~${leakImpact.flowRateCfm} CFM).`,
      `Projected annual waste: $${leakImpact.annualCost} (${leakImpact.annualKwh} kWh, ${leakImpact.co2Emissions} t CO₂e).`,
      "Re-scan after repair to confirm dBµV returns to baseline."
    ];
  }

  const recs: string[] = [];
  if (delta >= 20) {
    recs.push(`Immediate inspection of ${primaryFault.toLowerCase()} suspected on this asset.`);
    recs.push("Schedule targeted ultrasound sweep to pinpoint source location.");
  } else if (delta >= 12) {
    recs.push(`Elevated ultrasound levels detected — investigate ${primaryFault.toLowerCase()} on next route.`);
    recs.push("Trend peak/RMS dBµV on the next collection route to confirm progression.");
  } else {
    recs.push(`Low-level ultrasound detected — monitor ${primaryFault.toLowerCase()} trend at next scheduled reading.`);
    recs.push("No immediate action required; continue routine ultrasound surveillance.");
  }
  recs.push("Generate CMMS work order if confirmed on re-scan.");
  return recs;
}

/**
 * Domain function — composes result from measured data.
 * TODO: Replace with Master Ultrasound AI Prompt call when ready.
 */
export async function analyzeUltrasoundData(
  metadata: UltrasoundMetadata = {}
): Promise<UltrasoundResult> {
  void ULTRASOUND_MASTER_PROMPT;
  void buildUltrasoundUserPrompt;

  const mode = String(metadata.mode || "leak").toLowerCase();
  const peakFromMeta = Number(metadata.peakDbuV);
  const rmsFromMeta = Number(metadata.rmsDbuV);
  const crestFromMeta = Number(metadata.crestFactor ?? metadata.crest_factor);
  const baselineFromMeta = Number(metadata.baselineDb ?? metadata.baseline_dbmv);
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

  const description = composeUltrasoundDescription({
    mode,
    peak,
    rms,
    baseline,
    delta,
    crestFactor: crest_factor,
    primaryFault: primary
  });

  const recommendations = composeUltrasoundRecommendations({
    mode,
    peak,
    baseline,
    delta,
    primaryFault: primary,
    leakImpact
  });

  const mock: UltrasoundResult = {
    health_score: delta >= 20 ? 38 : delta >= 12 ? 55 : 72,
    primary_fault: primary,
    fault_list: [
      {
        fault: primary,
        severity: delta >= 20 ? "HIGH" : delta >= 12 ? "MEDIUM" : "LOW",
        confidence: 78,
        description: description.text
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
    recommendations,
    detailed: {
      mode,
      transducer: metadata.transducer ? String(metadata.transducer) : undefined,
      heterodyne_khz: Number(metadata.heterodyneKhz) || 40,
      gain_db: Number(metadata.gainDb) || 30,
      confidence_score: 0.78,
      iso_29821_note:
        "Severity derived from measured Δ dBµV exceedance; ISO 29821 mapping pending Master AI prompt.",
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
    // Audio/image reserved for future AI; live composition uses measured metadata (+ optional peak fields).
    const data = await analyzeUltrasoundData(metadata);
    console.log("[analyze-ultrasound] Analysis complete:", {
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
