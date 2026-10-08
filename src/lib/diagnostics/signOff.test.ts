import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_SIGN_OFF_PATH,
  SIGN_OFF_STATUS_LABEL,
  formatVerification,
  type DiagnosisSignOff,
} from "./signOff";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const signOff = (over: Partial<DiagnosisSignOff> = {}): DiagnosisSignOff => ({
  id: "s1",
  diagnosis_id: "d1",
  status: "approved",
  engineer_name: "J. Rivera, CAT III",
  override_note: null,
  created_at: "2026-08-24T14:32:00.000Z",
  updated_at: "2026-08-24T14:32:00.000Z",
  ...over,
});

describe("row-1 promotion: sign-off verification stamp", () => {
  it("formats a real sign-off as 'Verified by <engineer> at <stamp>'", () => {
    expect(formatVerification(signOff())).toMatch(
      /^Verified by J\. Rivera, CAT III at /,
    );
  });

  it("falls back to the raw timestamp on an invalid date — never 'Invalid Date'", () => {
    const text = formatVerification(
      signOff({ updated_at: "not-a-date", created_at: "not-a-date" }),
    );
    expect(text).toContain("not-a-date");
    expect(text.includes("Invalid Date")).toBe(false);
    expect(text.includes("NaN")).toBe(false);
  });

  it("confesses a missing engineer name instead of printing 'null'", () => {
    expect(formatVerification(signOff({ engineer_name: null }))).toContain(
      "unnamed engineer",
    );
  });

  it("labels cover exactly the three statuses", () => {
    expect(Object.keys(SIGN_OFF_STATUS_LABEL).sort()).toEqual([
      "approved",
      "modified",
      "pending",
    ]);
  });

  it("the client targets the documented API path", () => {
    expect(DIAGNOSIS_SIGN_OFF_PATH).toBe("/api/diagnosis-sign-off");
  });

  it("client degrades an absent sign-off to null, not a 404 (source)", () => {
    const src = readRel("./signOff.ts");
    expect(src).toContain("the API returns null rather than a 404");
    expect(src).toContain("(data?.signOff as DiagnosisSignOff | null) ?? null");
  });
});

describe("row-1 promotion: sign-off schema and API honesty", () => {
  const migration = readRel("../../../migrations/012_diagnosis_sign_off.sql");
  const server = readRel("../../../server.ts");

  it("one sign-off row per diagnosis, cascade with the diagnosis", () => {
    expect(migration).toContain("diagnosis_id UUID NOT NULL UNIQUE");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain("CHECK (status IN ('pending', 'approved', 'modified'))");
  });

  it("GET returns null for an absent sign-off — never a 404", () => {
    expect(server).toContain("signOff: result.rows[0] ?? null");
  });

  it("re-signing replaces in place via ON CONFLICT, no duplicate rows", () => {
    expect(server).toContain("ON CONFLICT (diagnosis_id) DO UPDATE");
  });

  it("approval and modification require the engineer's name and note", () => {
    expect(server).toContain("engineerName is required to approve or modify.");
    expect(server).toContain("overrideNote is required when modifying a diagnosis.");
  });

  it("server registers the documented route", () => {
    expect(server).toContain("/api/diagnosis-sign-off");
  });
});
