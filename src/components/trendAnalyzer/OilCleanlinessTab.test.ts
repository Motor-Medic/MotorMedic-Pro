import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  fileURLToPath(new URL("./OilCleanlinessTab.tsx", import.meta.url)),
  "utf8",
);

describe("cleanliness log axis receives only positive finite counts", () => {
  it("logSafe drops null, non-finite and non-positive values", () => {
    expect(src).toContain("function logSafe(value: number | undefined): number | null");
    expect(src).toContain(
      "return value != null && Number.isFinite(value) && value > 0 ? value : null;",
    );
  });

  it("all three particle series route through logSafe before the chart", () => {
    expect(src).toContain("p4: logSafe(s.particles4um)");
    expect(src).toContain("p6: logSafe(s.particles6um)");
    expect(src).toContain("p14: logSafe(s.particles14um)");
  });

  it("table counts confess non-finite values instead of rendering them", () => {
    expect(src).toContain('if (value == null || !Number.isFinite(value)) return "—";');
  });
});
