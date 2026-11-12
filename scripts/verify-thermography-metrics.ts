/**
 * Verify-script consumer for the PARKED (SLICE-VS7) I²R projection formatter.
 *
 * The projection is a hypothetical 100%-load state, so it is removed from all
 * UI/report surfaces. This script keeps the exported math honest for audit:
 * sub-0.1° values must keep real magnitude and never collapse to a fake zero.
 */
import {
  NOT_DETECTED,
  NOT_MEASURED,
  NOT_REPORTED,
  PROJECTION_DISPLAY_FLOOR,
  PROJECTION_LOW_LOAD_CAVEAT,
  PROJECTION_MIN_VALID_LOAD_PERCENT,
  THERMO_REF_TEMP_MISSING,
  buildThermoChartSeries,
  formatTemperatureProjection,
  planThermoTrendAxis
} from "../src/lib/thermographyTrendSeries";
import type { SavedAnalysisResult } from "../src/lib/analysisPersistence";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${name}` +
      (ok
        ? ""
        : `\n   expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  );
}

check("projection floor kept", PROJECTION_DISPLAY_FLOOR, 0.0001);
check("validity floor kept", PROJECTION_MIN_VALID_LOAD_PERCENT, 40);
check("low-load caveat kept", /below 40%/i.test(PROJECTION_LOW_LOAD_CAVEAT), true);
check(
  "adaptive precision keeps magnitude",
  formatTemperatureProjection(0.015972222222222222, "°C"),
  "0.016°C"
);
check(
  "adaptive precision avoids fake zero",
  formatTemperatureProjection(0.0098765, "°C"),
  "0.00988°C"
);
check(
  "sub-floor is a bound, not zero",
  formatTemperatureProjection(0.00004, "°C"),
  `<${PROJECTION_DISPLAY_FLOOR}°C`
);
check("null stays null", formatTemperatureProjection(null, "°C"), null);

check("null trio distinct", new Set([NOT_MEASURED, NOT_REPORTED, NOT_DETECTED]).size, 3);
check(
  "T_ref gate copy verbatim",
  THERMO_REF_TEMP_MISSING,
  "Reference temperature not recorded - radiometric analysis not available"
);

function row(id: string, timestamp: string): SavedAnalysisResult {
  return {
    id,
    asset_id: "asset-1",
    component: null,
    timestamp,
    health_score: 80,
    primary_fault: null,
    fault_list: [],
    peaks: [{ type: "thermography", delta_t: 10, hotspot_temp: 80 }],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: null,
    analysis_type: "thermography",
    telemetry_data: {}
  };
}

// Same-date rows arrive unsorted and must resolve to deterministic `· n` labels.
const series = buildThermoChartSeries([
  row("b", "2026-10-30T16:34:00.000Z"),
  row("a", "2026-10-30T16:33:00.000Z"),
  row("c", "2026-10-30T16:35:00.000Z")
]);
check(
  "same-date labels deterministic",
  series.map((p) => p.dateLabel),
  [`Oct 30 · 1`, `Oct 30 · 2`, `Oct 30 · 3`]
);
check("sequence 1-based", series.map((p) => p.sequence), [1, 2, 3]);
check("axis reads dateLabel", planThermoTrendAxis(series).dataKey, "dateLabel");

console.log(
  failures === 0 ? "\nAll thermography metric checks passed." : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);