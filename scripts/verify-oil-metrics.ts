/** Sanity checks for the fluid chemistry calculation helpers. */
import {
  calculateParticleRatio,
  detectMorphologyTransitions,
  drFerroIndices,
  isoNotchDelta,
  isoToNasClass,
  isoToSaeClass,
  linearRatePerHour,
  mpcBand,
  noriaLifeExtensionFactor,
  parseIsoCode,
  primaryMorphology,
  projectHoursToThreshold,
  projectTanTbnCrossover,
  recommendedFilterBeta,
  rulerBand,
  varnishRiskIndex,
  waterPhaseAlert
} from "../src/lib/oilAnalysisMetrics";
import type { OilSample } from "../src/types/oilAnalysis";

const base = {
  assetId: "T",
  iron: 0,
  copper: 0,
  chromium: 0,
  lead: 0,
  aluminum: 0,
  silicon: 0,
  ironAlarmLimit: 100,
  copperAlarmLimit: 50,
  chromiumAlarmLimit: 25,
  leadAlarmLimit: 30,
  aluminumAlarmLimit: 40,
  siliconAlarmLimit: 30
};

const mk = (
  sampleDate: string,
  operatingHours: number,
  acidNumber?: number,
  tbn?: number
): OilSample => ({ ...base, sampleDate, operatingHours, acidNumber, tbn });

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${name}` +
      (ok ? "" : `\n   expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  );
}

// Converging TAN/TBN -> projected crossover.
const converging = projectTanTbnCrossover([
  mk("2025-09-15", 2500, 0.55, 9.4),
  mk("2025-12-10", 3350, 1.05, 7.8),
  mk("2026-06-22", 5050, 2.3, 5.1)
]);
check("converging status", converging.status, "projected");
check(
  "converging projected hours",
  Math.round(converging.projectedAtHours ?? 0),
  6230
);

// TAN already above TBN.
check(
  "exceeded",
  projectTanTbnCrossover([mk("2025-01-01", 100, 1, 5), mk("2026-01-01", 900, 6.2, 4.1)]).status,
  "exceeded"
);

// Gap widening -> no projection.
check(
  "diverging",
  projectTanTbnCrossover([mk("2025-01-01", 100, 2, 5), mk("2026-01-01", 900, 1.2, 6.0)]).status,
  "none"
);

// Not enough data.
check("single sample", projectTanTbnCrossover([mk("2025-01-01", 100, 1, 5)]).status, "none");
check("empty", projectTanTbnCrossover([]).status, "none");
check(
  "missing tbn",
  projectTanTbnCrossover([mk("2025-01-01", 100, 1), mk("2026-01-01", 900, 2)]).status,
  "none"
);

// A partially-filled early sample must not distort the slope.
check(
  "partial early sample ignored",
  projectTanTbnCrossover([
    mk("2025-01-01", 500, undefined, 9.9),
    mk("2025-09-15", 2500, 0.55, 9.4),
    mk("2026-06-22", 5050, 2.3, 5.1)
  ]).status,
  "projected"
);

// Noria factor: worst channel is 7 notches -> 1.25^7 = 4.77 -> 4.8
check("noria 7 notches", noriaLifeExtensionFactor([22, 20, 16], [15, 13, 10]), 4.8);
check("noria already clean", noriaLifeExtensionFactor([15, 13, 10], [15, 13, 10]), 1);
check("noria cleaner than target", noriaLifeExtensionFactor([12, 10, 8], [15, 13, 10]), 1);
check("noria capped at 10", noriaLifeExtensionFactor([28, 26, 23], [15, 13, 10]), 10);

check("water none", waterPhaseAlert(undefined), null);
check("water normal", waterPhaseAlert(150), null);
check("water warning", waterPhaseAlert(240)?.startsWith("Approaching"), true);
check("water critical", waterPhaseAlert(620)?.startsWith("FREE/EMULSIFIED"), true);

check("iso parse", parseIsoCode("18/16/13"), [18, 16, 13]);
check("iso parse spaced", parseIsoCode(" 20 / 18 / 14 "), [20, 18, 14]);
check("iso parse two-part rejected", parseIsoCode("16/13"), null);
check("iso parse null", parseIsoCode(null), null);

// --- Cleanliness (tab 3) ---
check("NAS from iso6 18", isoToNasClass(18), 11);
check("SAE from iso6 18", isoToSaeClass(18), 12);
check("NAS floors at 0", isoToNasClass(3), 0);
check("SAE floors at 0", isoToSaeClass(2), 0);

check("ratio siltation", calculateParticleRatio(120000, 500).diagnosis.startsWith("Siltation"), true);
check("ratio spalling", calculateParticleRatio(4000, 800).diagnosis.startsWith("Spalling"), true);
check("ratio balanced", calculateParticleRatio(10000, 500).diagnosis.startsWith("Balanced"), true);
check("ratio value", Number(calculateParticleRatio(10000, 500).ratio?.toFixed(1)), 20);
check("ratio missing p14", calculateParticleRatio(10000, null).ratio, null);
check("ratio zero p14 no divide", calculateParticleRatio(10000, 0).ratio, null);
check("ratio negative p14", calculateParticleRatio(10000, -5).ratio, null);

check("beta at target", recommendedFilterBeta([15, 13, 10], [15, 13, 10]).startsWith("At target"), true);
check("beta cleaner than target", recommendedFilterBeta([12, 10, 8], [15, 13, 10]).startsWith("At target"), true);
check("beta 2 notches", recommendedFilterBeta([17, 15, 12], [15, 13, 10]).includes("200"), true);
check("beta 4 notches", recommendedFilterBeta([19, 17, 14], [15, 13, 10]).includes("kidney-loop"), true);
check("beta severe", recommendedFilterBeta([22, 20, 16], [15, 13, 10]).includes("ingress"), true);

check("notch delta dirtier", isoNotchDelta([18, 16, 13], [20, 17, 13]), [2, 1, 0]);
check("notch delta cleaner", isoNotchDelta([20, 18, 15], [18, 16, 13]), [-2, -2, -2]);

// --- Ferrography & varnish (tab 4) ---
check("dr indices missing", drFerroIndices(null, 10), null);
check("dr indices wpc", drFerroIndices(40, 10)?.wpc, 50);
check("dr indices wsi", drFerroIndices(40, 10)?.wsi, 1500);
check("dr indices plp", drFerroIndices(40, 10)?.plp, 60);
check("dr indices ratio", drFerroIndices(40, 10)?.dlDsRatio, 4);
check("dr ds zero -> null ratio, no divide", drFerroIndices(40, 0)?.dlDsRatio, null);
check("dr both zero -> plp 0 not NaN", drFerroIndices(0, 0)?.plp, 0);
check("dr wsi never negative", drFerroIndices(5, 40)?.wsi, 0);

check("rate single point", linearRatePerHour([{ hours: 100, value: 5 }]), null);
check("rate flat hours", linearRatePerHour([{ hours: 100, value: 5 }, { hours: 100, value: 9 }]), null);
check("rate rising", linearRatePerHour([{ hours: 1000, value: 10 }, { hours: 2000, value: 30 }]), 0.02);

check("project rising reaches", projectHoursToThreshold(10, 0.01, 30, "rising"), 2000);
check("project rising already past", projectHoursToThreshold(35, 0.01, 30, "rising"), 0);
check("project rising flat -> null", projectHoursToThreshold(10, 0, 30, "rising"), null);
check("project rising falling -> null", projectHoursToThreshold(10, -0.01, 30, "rising"), null);
check("project falling reaches", projectHoursToThreshold(75, -0.01, 25, "falling"), 5000);
check("project falling already past", projectHoursToThreshold(20, -0.01, 25, "falling"), 0);
check("project falling rising -> null", projectHoursToThreshold(75, 0.01, 25, "falling"), null);
check("project null rate", projectHoursToThreshold(10, null, 30, "rising"), null);

check("mpc good", mpcBand(10), "good");
check("mpc monitor", mpcBand(20), "monitor");
check("mpc abnormal", mpcBand(30), "abnormal");
check("mpc critical", mpcBand(40), "critical");
check("ruler healthy", rulerBand(80), "healthy");
check("ruler monitor", rulerBand(60), "monitor");
check("ruler warning", rulerBand(30), "warning");
check("ruler critical", rulerBand(10), "critical");

check("varnish risk needs both", varnishRiskIndex(20, null), null);
check("varnish risk mid", varnishRiskIndex(17.5, 50), 50);
check("varnish risk clamps over-range mpc", varnishRiskIndex(70, 0), 100);

check(
  "morph new detection",
  detectMorphologyTransitions(null, { cutting: "moderate" })[0]?.startsWith("NEW Cutting Wear"),
  true
);
check(
  "morph escalation",
  detectMorphologyTransitions({ cutting: "mild" }, { cutting: "severe" })[0]?.includes("escalated from mild to severe"),
  true
);
check("morph trace ignored", detectMorphologyTransitions(null, { cutting: "trace" }).length, 0);
check("morph unchanged ignored", detectMorphologyTransitions({ cutting: "mild" }, { cutting: "mild" }).length, 0);
check("morph improvement ignored", detectMorphologyTransitions({ cutting: "severe" }, { cutting: "mild" }).length, 0);
check("morph not_detected ignored", detectMorphologyTransitions({ cutting: "severe" }, { cutting: "not_detected" }).length, 0);

check("primary morphology picks worst", primaryMorphology({ rubbing: "mild", fatigue_chunk: "severe" })?.key, "fatigue_chunk");
check("primary morphology none", primaryMorphology({ rubbing: "not_detected" }), null);
check("primary morphology undefined", primaryMorphology(undefined), null);

console.log(failures === 0 ? "\nAll metric checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
