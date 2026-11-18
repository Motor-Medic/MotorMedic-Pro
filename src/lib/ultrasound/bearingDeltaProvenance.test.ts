/**
 * SLICE-US1 — stored-baseline ΔdB provenance + stored-class passthrough.
 *
 * These are unit-level proofs for the MISSING Bearings & Mechanical surface:
 *  - ΔdB is descriptive subtraction of stored levels (never a CF, never a class)
 *  - provenance is stored / modeled-fallback / "baseline not stored"
 *  - a stored class string is returned verbatim, never re-derived from Δ
 *  - negative dBµV is a valid reading; only missing/NaN becomes null
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { crestFactorFromPeakRmsDb } from "../ultrasoundAnalysis";
import { analyzeUltrasoundData } from "../ultrasoundAnalysisEngine";
import {
  describeUeBearingDelta,
  finiteDb,
  formatUeDeltaDb,
  ueBaselineProvenanceLabel,
  ueStoredClassLabel,
  ueUltrasoundPeakRecord,
  UE_BASELINE_NOT_STORED_LABEL,
  UE_BEARING_DELTA_DESCRIPTIVE_NOTE,
  UE_STORED_CLASS_ABSENT_LABEL
} from "./bearingDeltaProvenance";

const src = readFileSync(
  fileURLToPath(new URL("./bearingDeltaProvenance.ts", import.meta.url)),
  "utf8"
);

describe("SLICE-US1 baseline provenance — stored / fallback / absent", () => {
  it("uses a stored baseline and reports a measured descriptive delta", () => {
    const d = describeUeBearingDelta({
      type: "ultrasound",
      probe_type: "contact",
      peak_dbmv: 60,
      baseline_dbmv: 44,
      baseline_source: "stored"
    });
    expect(d.baselineProvenance).toBe("stored");
    expect(d.baselineDb).toBe(44);
    expect(d.deltaDb).toBe(16);
    expect(d.deltaIsMeasured).toBe(true);
    expect(ueBaselineProvenanceLabel(d)).toBe("Stored baseline (44.0 dBµV)");
  });

  it("treats a stored baseline without an explicit source as stored, never measured by accident from a fallback", () => {
    const d = describeUeBearingDelta({ peak_dbmv: 55, baseline_dbmv: 28 });
    expect(d.baselineProvenance).toBe("stored");
    expect(d.deltaDb).toBe(27);
  });

  it("labels a modeled fallback as modeled, not measured", () => {
    const d = describeUeBearingDelta({
      peak_dbmv: 44,
      baseline_source: "fallback",
      baseline_fallback: true,
      baseline_fallback_db: 28
    });
    expect(d.baselineProvenance).toBe("fallback");
    expect(d.baselineDb).toBe(28);
    expect(d.deltaDb).toBe(16);
    expect(d.deltaIsMeasured).toBe(false);
    expect(ueBaselineProvenanceLabel(d)).toBe(
      "Modeled fallback (28.0 dBµV) — delta modeled, not measured"
    );
  });

  it("renders 'baseline not stored' and NO delta when no baseline exists", () => {
    const d = describeUeBearingDelta({
      peak_dbmv: 44,
      // A stray delta_db without a baseline is not contextualised: omit it.
      delta_db: 16
    });
    expect(d.baselineProvenance).toBe("not-stored");
    expect(d.baselineDb).toBeNull();
    expect(d.deltaDb).toBeNull();
    expect(d.deltaIsMeasured).toBe(false);
    expect(ueBaselineProvenanceLabel(d)).toBe(UE_BASELINE_NOT_STORED_LABEL);
    expect(UE_BASELINE_NOT_STORED_LABEL).toBe("baseline not stored");
    expect(formatUeDeltaDb(d.deltaDb)).toBe("—");
  });
});

describe("SLICE-US1 stored class is verbatim only", () => {
  it("surfaces the stored class and action exactly as saved", () => {
    const d = describeUeBearingDelta({
      type: "ultrasound",
      peak_dbmv: 60,
      baseline_dbmv: 40,
      baseline_source: "stored",
      severity_class: "Class 3 — Minor",
      class_action: "Lubricate bearing at next route"
    });
    // Δ 20 would sit in the Class 1 bracket, but the stored class wins.
    expect(d.deltaDb).toBe(20);
    expect(d.storedClass).toBe("Class 3 — Minor");
    expect(d.storedAction).toBe("Lubricate bearing at next route");
    expect(ueStoredClassLabel(d)).toBe("Class 3 — Minor");
  });

  it("never derives a class from delta, probe type or fault text", () => {
    const d = describeUeBearingDelta({
      type: "ultrasound",
      probe_type: "contact",
      peak_dbmv: 90,
      baseline_dbmv: 40,
      baseline_source: "stored",
      mode: "mechanical",
      fault: "Bearing Defect"
    });
    expect(d.deltaDb).toBe(50);
    expect(d.storedClass).toBeNull();
    expect(ueStoredClassLabel(d)).toBe(UE_STORED_CLASS_ABSENT_LABEL);
    // No ladder import / bracket lookup exists on this descriptive path.
    expect(src).not.toContain("evaluateUsSeverity");
    expect(src).not.toContain("US_DDB_BRACKETS");
    expect(src).not.toContain("bearingLadderApplicable");
  });

  it("ignores non-string class noise instead of inventing a label", () => {
    const d = describeUeBearingDelta({
      peak_dbmv: 60,
      baseline_dbmv: 40,
      severity_class: 3,
      class: "   "
    });
    expect(d.storedClass).toBeNull();
  });
});

describe("SLICE-US1 negative dBµV is valid", () => {
  it("keeps negative peak/baseline values and subtracts them honestly", () => {
    const d = describeUeBearingDelta({
      peak_dbmv: -5,
      baseline_dbmv: -15,
      baseline_source: "stored"
    });
    expect(d.peakDb).toBe(-5);
    expect(d.baselineDb).toBe(-15);
    expect(d.deltaDb).toBe(10);
    expect(ueBaselineProvenanceLabel(d)).toBe("Stored baseline (-15.0 dBµV)");
  });

  it("only missing / NaN becomes an honest empty", () => {
    expect(finiteDb(-12.4)).toBe(-12.4);
    expect(finiteDb("0")).toBe(0);
    expect(finiteDb(null)).toBeNull();
    expect(finiteDb("")).toBeNull();
    expect(finiteDb("not-a-number")).toBeNull();
    expect(finiteDb(Number.NaN)).toBeNull();
    expect(finiteDb(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("SLICE-US1 ΔdB is never a crest factor", () => {
  it("proves the CF is the linear peak/RMS ratio, not the dB difference", () => {
    // CF = 10^((55 − 39)/20) = 6.31 ≡ 55_lin / 39_lin.
    expect(crestFactorFromPeakRmsDb(55, 39)).toBe(6.31);
    // The factory ΔdB is 16 — labelling that as a crest factor is false.
    const d = describeUeBearingDelta({ peak_dbmv: 55, baseline_dbmv: 39 });
    expect(d.deltaDb).toBe(16);
    expect(d.deltaDb).not.toBe(6.31);
    // Negative levels are valid and still produce a dimensionless ratio.
    expect(crestFactorFromPeakRmsDb(-5, -15)).toBe(3.16);
  });

  it("keeps the descriptive note unit-free and the delta in dB only", () => {
    expect(UE_BEARING_DELTA_DESCRIPTIVE_NOTE).toContain(
      "descriptive subtraction of two stored dBµV levels"
    );
    expect(UE_BEARING_DELTA_DESCRIPTIVE_NOTE).toContain("not a crest factor");
    expect(UE_BEARING_DELTA_DESCRIPTIVE_NOTE).not.toMatch(/\d+(\.\d+)?\s*µV/);
    expect(formatUeDeltaDb(16)).toBe("16.0 dB");
    expect(formatUeDeltaDb(16)).not.toContain("dBµV");
  });
});

describe("SLICE-US1 record selection", () => {
  it("picks only the ultrasound peak record, never a foreign modality", () => {
    const record = ueUltrasoundPeakRecord([
      { type: "vibration", peak_dbmv: 99 },
      { type: "ultrasound", peak_dbmv: 44 }
    ]);
    expect(record?.peak_dbmv).toBe(44);
    expect(ueUltrasoundPeakRecord([{ type: "vibration" }])).toBeNull();
    expect(ueUltrasoundPeakRecord(undefined)).toBeNull();
  });
});

describe("SLICE-US1 engine keeps negative dBµV levels", () => {
  it("preserves negative peak/RMS/baseline instead of swapping in defaults", async () => {
    const result = await analyzeUltrasoundData({
      mode: "leak",
      peakDbuV: -5,
      rmsDbuV: -12,
      baselineDb: -15
    });
    expect(result.peaks.peak_dbmv).toBe(-5);
    expect(result.peaks.rms_dbmv).toBe(-12);
    expect(result.peaks.baseline_dbmv).toBe(-15);
    expect(result.peaks.delta_db).toBe(10);
    expect(result.peaks.baseline_source).toBe("stored");
  });
});
