import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./McaResultsDashboard.tsx", import.meta.url)),
  "utf8",
);

const MCA_LITERAL = "default score - not a measured result";
const HEALTH_LITERAL = "default-derived - not measured";

describe("P5 McaResultsDashboard points of use", () => {
  it("imports both provenance notes from the dictionary", () => {
    expect(src).toContain('from "../lib/maintenance/prescriptiveDictionary"');
    expect(src).toContain("MCA_DEFAULT_SCORE_PROVENANCE");
    expect(src).toContain("HEALTH_SCORE_DEFAULT_PROVENANCE");
  });

  it("renders the default-score provenance at the radar", () => {
    expect(src).toContain("{MCA_DEFAULT_SCORE_PROVENANCE}");
  });

  it("guards the health provenance caption behind the in-memory default flag", () => {
    expect(src).toContain("{healthScoreIsDefault && (");
    expect(src).toContain("{HEALTH_SCORE_DEFAULT_PROVENANCE}");
  });

  it("never re-declares the provenance literals", () => {
    expect(src.includes(MCA_LITERAL)).toBe(false);
    expect(src.includes(HEALTH_LITERAL)).toBe(false);
  });
});
