import { describe, expect, it } from "vitest";
import {
  isConsensusVibrationResult,
  normalizeStage3ExpertResponse,
  type ConsensusVibrationResult
} from "./consensusEngine";

type Payload = Record<string, unknown>;

const EXTRACTION = { peaks: [], runningSpeed1xHz: 29.7 };

/** The Stage-3 normalize/fallback confession - malformed input must land here. */
const CONFESSION = "Inconclusive - Manual Review Required";

const IN_UNION = ["NORMAL", "ANOMALY", "CRITICAL"];

function validPayload(): Payload {
  return {
    overallHealthScore: 42,
    severity: "ANOMALY",
    summary: "Outer Race Bearing Defect (BPFO) at 29.7 Hz",
    primaryFault: {
      title: "Outer Race Bearing Defect (BPFO)",
      frequencyHz: 29.7,
      confidencePercent: 88,
      severity: "CRITICAL",
      actionWindow: "Inspect within 7 days."
    },
    identifiedFaults: [
      {
        title: "Outer Race Bearing Defect (BPFO)",
        frequencyHz: 29.7,
        confidencePercent: 88,
        severity: "CRITICAL",
        description: "BPFO peak at 29.7 Hz on the outer race."
      }
    ],
    financialImpact: {
      preventiveRepairCost: 2500,
      failureCostIfDelayed: 12500,
      downtimeLossPerHour: 0
    },
    repairRecommendations: ["Replace the defective bearing per OEM procedure."],
    consensusDetails: {
      modelA_Hypothesis: "Outer race defect at 88% confidence.",
      modelB_Hypothesis: "ISO Zone C - Alert.",
      refereeDebateSummary: "Both agents agree on the BPFO finding.",
      consensusMode: "multi-model",
      answeringModels: ["gemini", "groq"]
    },
    success: true
  };
}

const clone = (payload: Payload): Payload =>
  JSON.parse(JSON.stringify(payload)) as Payload;

/** Valid fixture with a targeted mutation applied - summary intact, so the
 *  injected defect is the SOLE reason a rejection can happen. */
const fixture = (mutate?: (payload: Payload) => void): Payload => {
  const payload = clone(validPayload());
  if (mutate) mutate(payload);
  return payload;
};

/** Same mutation on a fixture with no diagnosable text: the fallback must
 *  confess instead of inventing a diagnosis. */
const confessingFixture = (mutate?: (payload: Payload) => void): Payload => {
  const payload = fixture(mutate);
  delete payload.summary;
  return payload;
};

const normalize = (payload: Payload): ConsensusVibrationResult =>
  normalizeStage3ExpertResponse(payload, EXTRACTION, null, null);

/** Guard rejects the payload (summary intact - the injected defect is the sole
 *  reason), so the result MUST come from the normalize/fallback path (a new
 *  object, never the early-exit passthrough) and be well-typed afterwards. */
function expectFallbackTaken(payload: Payload): ConsensusVibrationResult {
  expect(isConsensusVibrationResult(payload)).toBe(false);
  const result = normalize(payload);
  expect(result).not.toBe(payload);
  expect(isConsensusVibrationResult(result)).toBe(true);
  return result;
}

/** Full contract for a no-summary payload: confession, zero fabrication. */
function expectConfession(payload: Payload): ConsensusVibrationResult {
  const result = expectFallbackTaken(payload);
  expect(result.summary).toBe(CONFESSION);
  expect(result.primaryFault.title).toBe(CONFESSION);
  expect(result.summary).not.toContain("Outer Race");
  return result;
}

const primaryFaultWith = (patch: Payload): Payload => ({
  title: "Outer Race Bearing Defect (BPFO)",
  frequencyHz: 29.7,
  confidencePercent: 88,
  severity: "CRITICAL",
  actionWindow: "Inspect within 7 days.",
  ...patch
});

describe("AR-30b - consensus LLM payload runtime guard (R1 closed)", () => {
  describe("valid payloads behave identically (early-exit passthrough, no cast)", () => {
    it("returns a fully valid referee payload unchanged (same reference)", () => {
      const payload = validPayload();
      expect(isConsensusVibrationResult(payload)).toBe(true);
      expect(normalize(payload)).toBe(payload);
    });

    it("accepts an empty identifiedFaults array and absent optional members", () => {
      const payload = fixture((p) => {
        p.identifiedFaults = [];
        delete p.success;
        p.consensusDetails = {
          modelA_Hypothesis: "Agent A unavailable.",
          modelB_Hypothesis: "Agent B unavailable.",
          refereeDebateSummary: "Referee synthesis complete."
        };
      });
      expect(isConsensusVibrationResult(payload)).toBe(true);
      expect(normalize(payload)).toBe(payload);
    });

    it("accepts empty repairRecommendations / answeringModels arrays", () => {
      const payload = fixture((p) => {
        p.repairRecommendations = [];
        p.consensusDetails = {
          modelA_Hypothesis: "A",
          modelB_Hypothesis: "B",
          refereeDebateSummary: "C",
          answeringModels: []
        };
      });
      expect(isConsensusVibrationResult(payload)).toBe(true);
      expect(normalize(payload)).toBe(payload);
    });

    it("accepts both ConsensusCascadeMode union members (read from source)", () => {
      for (const mode of ["multi-model", "single-model-degraded"]) {
        const payload = fixture((p) => {
          p.consensusDetails = {
            modelA_Hypothesis: "A",
            modelB_Hypothesis: "B",
            refereeDebateSummary: "C",
            consensusMode: mode
          };
        });
        expect(isConsensusVibrationResult(payload)).toBe(true);
      }
    });
  });

  describe("field-level rejection onto the fallback path (rule 7)", () => {
    it("(a) consensusDetails absent -> fallback + confession, never fabricated", () => {
      expectFallbackTaken(fixture((p) => delete p.consensusDetails));
      const result = expectConfession(
        confessingFixture((p) => delete p.consensusDetails)
      );
      expect(result.consensusDetails).toBeDefined();
      expect(result.consensusDetails.modelA_Hypothesis).toBe("Agent A unavailable.");
    });

    it("(b) nested primaryFault severity outside the ApiSeverity union -> rejected", () => {
      const badSeverity = primaryFaultWith({ severity: "HIGH" });
      const result = expectFallbackTaken(
        fixture((p) => {
          p.primaryFault = badSeverity;
        })
      );
      expect(result.primaryFault.severity).not.toBe("HIGH");
      expect(IN_UNION).toContain(result.primaryFault.severity);
      expectConfession(
        confessingFixture((p) => {
          p.primaryFault = badSeverity;
        })
      );
    });

    it("(b) top-level severity outside the ApiSeverity union -> rejected", () => {
      const result = expectFallbackTaken(fixture((p) => {
        p.severity = "SEVERE";
      }));
      expect(result.severity).not.toBe("SEVERE");
      expect(IN_UNION).toContain(result.severity);
      expectConfession(confessingFixture((p) => {
        p.severity = "SEVERE";
      }));
    });

    it("(b) consensusMode outside the ConsensusCascadeMode union -> rejected", () => {
      const badMode = (): Payload => ({
        modelA_Hypothesis: "A",
        modelB_Hypothesis: "B",
        refereeDebateSummary: "C",
        consensusMode: "turbo"
      });
      const result = expectFallbackTaken(fixture((p) => {
        p.consensusDetails = badMode();
      }));
      expect(result.consensusDetails.consensusMode).toBeUndefined();
      expectConfession(confessingFixture((p) => {
        p.consensusDetails = badMode();
      }));
    });

    it("(c) overallHealthScore delivered as a string -> rejected, coerced honestly", () => {
      const result = expectFallbackTaken(fixture((p) => {
        p.overallHealthScore = "42";
      }));
      expect(typeof result.overallHealthScore).toBe("number");
      expect(result.overallHealthScore).not.toBe("42");

      // Healthy-summary variant pins the honest Number() coercion value.
      const healthy = fixture((p) => {
        p.summary = "Machine Healthy / Normal Operation";
        p.overallHealthScore = "42";
      });
      expect(isConsensusVibrationResult(healthy)).toBe(false);
      const healed = normalize(healthy);
      expect(healed).not.toBe(healthy);
      expect(healed.overallHealthScore).toBe(42);
      expect(isConsensusVibrationResult(healed)).toBe(true);
    });

    it("(c) primaryFault.confidencePercent delivered as a string -> rejected", () => {
      const badConfidence = primaryFaultWith({ confidencePercent: "88" });
      const result = expectFallbackTaken(fixture((p) => {
        p.primaryFault = badConfidence;
      }));
      expect(typeof result.primaryFault.confidencePercent).toBe("number");
      expect(result.primaryFault.confidencePercent).not.toBe("88");
      expectConfession(confessingFixture((p) => {
        p.primaryFault = badConfidence;
      }));
    });

    it("(c) identifiedFaults element frequencyHz delivered as a string -> rejected", () => {
      expectFallbackTaken(fixture((p) => {
        p.identifiedFaults = [
          {
            title: "Outer Race Bearing Defect (BPFO)",
            frequencyHz: "29.7",
            confidencePercent: 88,
            severity: "CRITICAL",
            description: "BPFO peak at 29.7 Hz on the outer race."
          }
        ];
      }));
    });

    it("identifiedFaults absent -> rejected; fallback rebuilds a typed fault list", () => {
      const result = expectFallbackTaken(
        fixture((p) => delete p.identifiedFaults)
      );
      expect(Array.isArray(result.identifiedFaults)).toBe(true);
      expect(result.identifiedFaults.length).toBeGreaterThan(0);
      expectConfession(confessingFixture((p) => delete p.identifiedFaults));
    });
  });

  describe("garbage, primitives, and numeric poison never throw", () => {
    it("wholly malformed payload -> no throw, confession, zero fabricated diagnosis", () => {
      const garbage: Payload = { primaryFault: "not-an-object", overallHealthScore: 50 };
      expect(isConsensusVibrationResult(garbage)).toBe(false);
      expect(() => normalize(garbage)).not.toThrow();
      const result = normalize(garbage);
      expect(result.summary).toBe(CONFESSION);
      expect(result.primaryFault.title).toBe(CONFESSION);
      expect(JSON.stringify(result)).not.toContain("not-an-object");
      expect(isConsensusVibrationResult(result)).toBe(true);
    });

    it("null / undefined / primitives / arrays / functions are rejected, no throw", () => {
      for (const bad of [null, undefined, "garbage", 42, true, [1, 2, 3], () => {}]) {
        expect(() => expect(isConsensusVibrationResult(bad)).toBe(false)).not.toThrow();
      }
    });

    it("NaN / Infinity numeric fields are rejected onto the fallback", () => {
      expectFallbackTaken(fixture((p) => {
        p.overallHealthScore = NaN;
      }));
      expectFallbackTaken(fixture((p) => {
        p.overallHealthScore = Infinity;
      }));
      expectFallbackTaken(fixture((p) => {
        p.financialImpact = {
          preventiveRepairCost: NaN,
          failureCostIfDelayed: 12500,
          downtimeLossPerHour: 0
        };
      }));
      expectFallbackTaken(fixture((p) => {
        p.primaryFault = primaryFaultWith({ frequencyHz: NaN });
      }));
    });

    it("success must be the literal true when present; absent stays type-legal", () => {
      expect(isConsensusVibrationResult(fixture((p) => { p.success = "true"; }))).toBe(false);
      expect(isConsensusVibrationResult(fixture((p) => { p.success = false; }))).toBe(false);
      expect(isConsensusVibrationResult(fixture((p) => { p.success = 1; }))).toBe(false);
      expect(isConsensusVibrationResult(fixture((p) => { delete p.success; }))).toBe(true);
      expect(isConsensusVibrationResult(fixture((p) => { p.success = true; }))).toBe(true);
    });

    it("non-array arrays, non-string strings, and missing required fields rejected", () => {
      expect(
        isConsensusVibrationResult(fixture((p) => { p.identifiedFaults = "none"; }))
      ).toBe(false);
      expect(
        isConsensusVibrationResult(fixture((p) => { p.repairRecommendations = "check it"; }))
      ).toBe(false);
      expect(
        isConsensusVibrationResult(fixture((p) => { p.repairRecommendations = [42]; }))
      ).toBe(false);
      expect(isConsensusVibrationResult(fixture((p) => { p.summary = 42; }))).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.consensusDetails = {
              modelA_Hypothesis: "A",
              modelB_Hypothesis: "B",
              refereeDebateSummary: 42
            };
          })
        )
      ).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.consensusDetails = {
              modelA_Hypothesis: "A",
              modelB_Hypothesis: "B",
              refereeDebateSummary: "C",
              answeringModels: ["gemini", 42]
            };
          })
        )
      ).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.financialImpact = { preventiveRepairCost: 2500, failureCostIfDelayed: 12500 };
          })
        )
      ).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.primaryFault = {
              title: "Outer Race Bearing Defect (BPFO)",
              frequencyHz: 29.7,
              confidencePercent: 88,
              severity: "CRITICAL"
            };
          })
        )
      ).toBe(false);
    });

    it("an identifiedFaults element with a wrong nested enum or string number rejected", () => {
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.identifiedFaults = [
              {
                title: "F",
                frequencyHz: 29.7,
                confidencePercent: 90,
                severity: "HIGH",
                description: "d"
              }
            ];
          })
        )
      ).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.identifiedFaults = [
              {
                title: "F",
                frequencyHz: 29.7,
                confidencePercent: "90",
                severity: "CRITICAL",
                description: "d"
              }
            ];
          })
        )
      ).toBe(false);
      expect(
        isConsensusVibrationResult(
          fixture((p) => {
            p.identifiedFaults = [
              { title: "F", frequencyHz: 29.7, confidencePercent: 90, severity: "CRITICAL" }
            ];
          })
        )
      ).toBe(false);
    });
  });
});
