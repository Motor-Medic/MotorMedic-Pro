import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_DB_PATH,
  KINEMATIC_SPECS_EMPTY_MESSAGE,
  KINEMATIC_SPECS_OUTAGE_MESSAGE,
  classifyOptionalSpecResponse,
  optionalSpecNetworkFailure
} from "./componentSpecs";

interface SpecRow {
  id: number;
}

describe("SLICE-J optional spec-record resilience", () => {
  it("treats a 404 on an optional spec record as an honest empty state", () => {
    const outcome = classifyOptionalSpecResponse<SpecRow>(404, {
      error: "Component not found."
    });
    expect(outcome.kind).toBe("empty");
    if (outcome.kind === "empty") {
      expect(outcome.message).toBe(KINEMATIC_SPECS_EMPTY_MESSAGE);
    }
  });

  it("treats an empty 200 body on an optional spec record as empty", () => {
    expect(
      classifyOptionalSpecResponse<SpecRow>(200, {
        success: true,
        specs: [],
        spec: null
      }).kind
    ).toBe("empty");
    expect(
      classifyOptionalSpecResponse<SpecRow>(200, { spec: null }).kind
    ).toBe("empty");
    expect(classifyOptionalSpecResponse<SpecRow>(200, {}).kind).toBe("empty");
  });

  it("returns the spec when one exists", () => {
    const outcome = classifyOptionalSpecResponse<SpecRow>(200, {
      success: true,
      spec: { id: 7 }
    });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.spec).toEqual({ id: 7 });
  });

  it("still surfaces a genuine 5xx as an outage", () => {
    for (const status of [500, 502, 503]) {
      const outcome = classifyOptionalSpecResponse<SpecRow>(status, {
        error: "Internal server error"
      });
      expect(outcome.kind).toBe("outage");
      if (outcome.kind === "outage") {
        expect(outcome.message).toBe(KINEMATIC_SPECS_OUTAGE_MESSAGE);
      }
    }
  });

  it("still surfaces a network failure as an outage", () => {
    expect(optionalSpecNetworkFailure<SpecRow>().kind).toBe("outage");
  });

  it("keeps the empty-state and outage messages distinct", () => {
    expect(KINEMATIC_SPECS_EMPTY_MESSAGE).toContain(
      "Kinematic specs not configured"
    );
    expect(KINEMATIC_SPECS_EMPTY_MESSAGE).toContain("Equipment DB");
    expect(KINEMATIC_SPECS_OUTAGE_MESSAGE).toContain(
      "couldn't reach the server"
    );
    expect(KINEMATIC_SPECS_OUTAGE_MESSAGE).not.toBe(
      KINEMATIC_SPECS_EMPTY_MESSAGE
    );
    expect(EQUIPMENT_DB_PATH).toBe("/equipment-db");
  });
});
