import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./CmmsPayloadBridge.tsx", import.meta.url)),
  "utf8",
);

describe("P5 CmmsPayloadBridge payload honesty", () => {
  it("health score follows the in-memory default flag in the posted payload", () => {
    expect(src).toContain(
      "healthScore: context.healthScoreIsDefault ? null : context.healthScore",
    );
    expect(src).toContain("? HEALTH_SCORE_DEFAULT_PROVENANCE");
  });

  it("imports the provenance note from the dictionary, never re-declares it", () => {
    expect(src).toContain('from "../../lib/maintenance/prescriptiveDictionary"');
    expect(src.includes("default-derived - not measured")).toBe(false);
  });

  it("wrapped payload rows are never truncated — full provenance stays readable", () => {
    expect(src).toContain("flex flex-wrap gap-2 items-start");
    expect(src.includes("truncate")).toBe(false);
  });
});
