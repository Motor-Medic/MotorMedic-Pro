/** Sanity checks for the fluid chemistry calculation helpers. */
import {
  noriaLifeExtensionFactor,
  parseIsoCode,
  projectTanTbnCrossover,
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

console.log(failures === 0 ? "\nAll metric checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
