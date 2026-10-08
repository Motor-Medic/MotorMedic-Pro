import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCmmsFieldList,
  buildCmmsPayload,
  buildCustomCmmsFields,
  CMMS_TARGETS,
  type CmmsPayloadContext,
  type CustomCmmsFieldSchema,
} from "./cmmsPayload";
import { HEALTH_SCORE_DEFAULT_PROVENANCE } from "../maintenance/prescriptiveDictionary";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const ctx = (over: Partial<CmmsPayloadContext> = {}): CmmsPayloadContext => ({
  assetTag: "M-100",
  component: "Motor",
  faultTitle: "Outer Race Bearing Defect (BPFO)",
  severity: "CRITICAL",
  confidencePercent: 87,
  healthScore: 42,
  healthScoreIsDefault: false,
  horizonHours: 500,
  horizonDriver: "BPFO defect frequency",
  horizonBasis: "operating",
  corroborationPercent: 75,
  technologiesWithData: ["vibration", "oil"],
  signOffStatus: "approved",
  signOffEngineer: "J. Rivera, CAT III",
  signOffAt: "2026-08-24T14:32:00.000Z",
  recommendations: ["Re-lubricate bearing"],
  diagnosisId: "dx-1",
  diagnosisAt: "2026-08-20T10:00:00.000Z",
  ...over,
});

const TARGET_IDS = CMMS_TARGETS.map((t) => t.id);

describe("P2 a default health score never reaches a CMMS payload", () => {
  for (const target of TARGET_IDS) {
    it(`${target}: default score is withheld; provenance explains the omission`, () => {
      const fields = buildCmmsFieldList(target, ctx({ healthScoreIsDefault: true }));
      expect(fields.some((f) => f.label === "Health Score")).toBe(false);
      const prov = fields.filter((f) => f.label === "Health Score Provenance");
      expect(prov).toHaveLength(1);
      expect(prov[0].value).toBe(HEALTH_SCORE_DEFAULT_PROVENANCE);
    });

    it(`${target}: a measured score is shipped with no provenance row`, () => {
      const fields = buildCmmsFieldList(target, ctx());
      const health = fields.filter((f) => f.label === "Health Score");
      expect(health).toHaveLength(1);
      expect(health[0].value).toBe("42");
      expect(fields.some((f) => f.label === "Health Score Provenance")).toBe(false);
    });

    it(`${target}: payload object carries the provenance text and no numeric health key`, () => {
      const payload = buildCmmsPayload(target, ctx({ healthScoreIsDefault: true }));
      const healthKeys = Object.keys(payload).filter(
        (k) => /health/i.test(k) && !/provenance/i.test(k),
      );
      expect(healthKeys).toHaveLength(0);
      expect(Object.values(payload)).toContain(HEALTH_SCORE_DEFAULT_PROVENANCE);
    });
  }

  it("custom template withholds a default-derived score and appends provenance", () => {
    const template: CustomCmmsFieldSchema = {
      fields: [{ key: "HS", label: "Health Score", sourcePath: "healthScore" }],
      priorityMapping: { CRITICAL: "High", ANOMALY: "Medium", NORMAL: "Low" },
      workTypeMapping: { CRITICAL: "Corrective", ANOMALY: "Corrective", NORMAL: "Preventive" },
    };
    const out = buildCustomCmmsFields(ctx({ healthScoreIsDefault: true }), template);
    expect(out.some((f) => f.key === "HS")).toBe(false);
    const prov = out.filter((f) => f.label === "Health Score Provenance");
    expect(prov).toHaveLength(1);
    expect(prov[0].value).toBe(HEALTH_SCORE_DEFAULT_PROVENANCE);
  });

  it("custom template ships the measured number with no provenance row", () => {
    const template: CustomCmmsFieldSchema = {
      fields: [{ key: "HS", label: "Health Score", sourcePath: "healthScore" }],
      priorityMapping: { CRITICAL: "High", ANOMALY: "Medium", NORMAL: "Low" },
      workTypeMapping: { CRITICAL: "Corrective", ANOMALY: "Corrective", NORMAL: "Preventive" },
    };
    const out = buildCustomCmmsFields(ctx(), template);
    const health = out.find((f) => f.key === "HS");
    expect(health?.value).toBe("42");
    expect(out.some((f) => f.label === "Health Score Provenance")).toBe(false);
  });

  it("absent horizon and parts are omitted, never defaulted", () => {
    const fields = buildCmmsFieldList(
      "sap",
      ctx({ horizonHours: null, horizonDriver: null, horizonBasis: null, requiredParts: [] }),
    );
    expect(fields.some((f) => f.label === "Failure Horizon")).toBe(false);
    expect(fields.some((f) => f.label === "Required Parts")).toBe(false);
  });

  it("builder withholds the number behind the provenance flag (source)", () => {
    const src = readRel("./cmmsPayload.ts");
    expect(src).toContain("ctx.healthScoreIsDefault ? null : ctx.healthScore");
    expect(src).not.toContain("healthScore ?? 0");
    expect(src).not.toContain("healthScore || 0");
    expect(src).not.toContain("health_score ?? 0");
    expect(src).not.toContain("health_score || 0");
  });
});
