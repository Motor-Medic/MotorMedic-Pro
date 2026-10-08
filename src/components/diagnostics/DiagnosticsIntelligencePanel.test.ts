import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./DiagnosticsIntelligencePanel.tsx", import.meta.url)),
  "utf8",
);

describe("P5 DiagnosticsIntelligencePanel provenance caption", () => {
  it("health provenance caption renders only when the score was default-derived", () => {
    expect(src).toContain("{cmmsContext.healthScoreIsDefault && (");
    expect(src).toContain("{HEALTH_SCORE_DEFAULT_PROVENANCE}");
  });

  it("imports the note from the dictionary and never re-declares the literal", () => {
    expect(src).toContain('from "../../lib/maintenance/prescriptiveDictionary"');
    expect(src.includes("default-derived - not measured")).toBe(false);
  });
});
