import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AI_SPLIT_MARKER,
  ARTIFACT_DISCLAIMER,
  ARTIFACT_DISCLAIMER_PARAGRAPHS,
  EXPORT_CONFIRM_BODY,
  confirmArtifactExport
} from "./ArtifactDisclaimer";
import ArtifactDisclaimer from "./ArtifactDisclaimer";
import { buildReportPdf, reportCsvText } from "../lib/reportExport";
import type { SavedAnalysisResult } from "../lib/analysisPersistence";

const read = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const legalSrc = read("./LegalDocuments.tsx");
const artifactSrc = read("./ArtifactDisclaimer.tsx");
const appSrc = read("../App.tsx");
const loginSrc = read("./Login.tsx");
const diagnoseSrc = read("./Diagnose.tsx");
const analysisReportSrc = read("./AnalysisReport.tsx");
const trendSrc = read("./TrendAnalyzer.tsx");
const logsSrc = read("./DiagnosisLogs.tsx");
const plannerSrc = read("./MountingPlanner.tsx");
const explorerSrc = read("./EquipmentExplorer.tsx");
const bridgeSrc = read("./diagnostics/CmmsPayloadBridge.tsx");
const cmmsPayloadSrc = read("../lib/diagnostics/cmmsPayload.ts");
const reportExportSrc = read("../lib/reportExport.ts");
const serverSrc = read("../../server.ts");
const middlewareSrc = read("../lib/auth/middleware.ts");
const migrationSrc = read("../../migrations/016_terms_accepted.sql");

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizedLegal = normalize(legalSrc);

describe("LEGAL-WRAPPER-A — disclaimer prose is a verbatim reuse, never new copy", () => {
  it("every paragraph label exists in LegalDocuments.tsx", () => {
    for (const { label } of ARTIFACT_DISCLAIMER_PARAGRAPHS) {
      expect(normalizedLegal).toContain(normalize(`<strong>${label}</strong>`));
    }
  });

  it("every paragraph body exists in LegalDocuments.tsx, verbatim", () => {
    for (const { body } of ARTIFACT_DISCLAIMER_PARAGRAPHS) {
      expect(normalizedLegal).toContain(normalize(body));
    }
  });

  it("the plain-string form is just those paragraphs joined — nothing added", () => {
    expect(ARTIFACT_DISCLAIMER).toBe(
      ARTIFACT_DISCLAIMER_PARAGRAPHS.map((p) => `${p.label} ${p.body}`).join("\n\n")
    );
    expect(ARTIFACT_DISCLAIMER.split("\n\n")).toHaveLength(
      ARTIFACT_DISCLAIMER_PARAGRAPHS.length
    );
  });

  it("AI_SPLIT_MARKER stays empty, with the slice-B comment guarding it", () => {
    expect(AI_SPLIT_MARKER).toBe("");
    expect(artifactSrc).toContain("SLICE B: lawyer-supplied, do not invent.");
    expect(artifactSrc).toContain('export const AI_SPLIT_MARKER = "";');
  });

  it("confirm copy is the neutral E7 body, not legal prose", () => {
    expect(EXPORT_CONFIRM_BODY).toBe(
      "This file will leave the application when you save or share it. Continue?"
    );
  });

  it("flags the July 8 (LegalDocuments) vs July 10 (Terms) effective-date conflict for slice B", () => {
    expect(legalSrc).toContain("Effective Date: July 8, 2026");
    expect(read("./Terms.tsx")).toContain("Effective Date:</strong> July 10, 2026");
    expect(artifactSrc).toContain("TODO(SLICE B");
    expect(artifactSrc).toContain("July 8");
    expect(artifactSrc).toContain("July 10");
  });
});

describe("confirmArtifactExport (E7)", () => {
  it("combines the action label with the shared body and returns the answer", () => {
    const seen: string[] = [];
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        confirm: (message: string) => {
          seen.push(message);
          return false;
        }
      }
    });
    try {
      expect(confirmArtifactExport("Export PDF report")).toBe(false);
      expect(seen).toEqual([`Export PDF report? ${EXPORT_CONFIRM_BODY}`]);
    } finally {
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("does not block when there is no window (SSR / server generators)", () => {
    expect(confirmArtifactExport("anything")).toBe(true);
  });
});

describe("disclaimer reaches the generated artifacts (E1/E4)", () => {
  const analysis: SavedAnalysisResult = {
    id: "test-record",
    asset_id: "motor-1",
    component: "DE bearing",
    timestamp: "2026-01-01T00:00:00.000Z",
    health_score: 72,
    primary_fault: "Outer race defect",
    fault_list: [],
    peaks: [],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    severity: "Warning"
  };

  it("the PDF footer carries the reused disclaimer on every page", async () => {
    const doc = await buildReportPdf({
      assetLabel: "Test Motor",
      technology: "Vibration",
      analysis
    });
    const raw = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
    for (const { label, body } of ARTIFACT_DISCLAIMER_PARAGRAPHS) {
      expect(raw).toContain(label);
      // The body wraps across PDF lines; assert on a stable prefix.
      expect(raw).toContain(body.slice(0, 40));
    }
    expect(raw).toContain(`Test Motor · page 1 of ${doc.getNumberOfPages()}`);
    expect(reportExportSrc).toContain("FOOTER_BAND");
    expect(reportExportSrc).toContain("ARTIFACT_DISCLAIMER");
  });

  it("the CSV body ends with the reused disclaimer rows", () => {
    const csv = reportCsvText({ assetLabel: "Test Motor", technology: "Vibration", analysis });
    for (const paragraph of ARTIFACT_DISCLAIMER.split("\n\n")) {
      expect(csv).toContain(paragraph.slice(0, 40));
    }
  });

  it("the PDF generator reserves the footer band so content never overlaps it", () => {
    expect(reportExportSrc).toContain("makeCursor(doc, FOOTER_BAND)");
  });
});

describe("ArtifactDisclaimer component renders the reused prose (E6 surface)", () => {
  it("block variant prints every label and body", () => {
    const html = renderToStaticMarkup(<ArtifactDisclaimer />);
    for (const { label, body } of ARTIFACT_DISCLAIMER_PARAGRAPHS) {
      expect(html).toContain(label);
      expect(html).toContain(body.slice(0, 40));
    }
  });

  it("print variant is hidden on screen and fixed to the printed page foot", () => {
    const html = renderToStaticMarkup(<ArtifactDisclaimer variant="print" />);
    expect(html).toContain("print:block");
    expect(html).toContain("print:fixed");
    expect(html).toContain('data-artifact-disclaimer="print"');
  });
});

describe("E5 registration clickwrap", () => {
  it("Login sends termsAccepted and blocks submit without the checkbox", () => {
    expect(loginSrc).toContain('id="login-terms-checkbox"');
    expect(loginSrc).toContain('id="login-terms-consent"');
    expect(loginSrc).toContain("termsAccepted: true");
    expect(loginSrc).toContain('if (!termsAccepted)');
    expect(loginSrc).toContain('onShowLegal?.("terms")');
    expect(loginSrc).toContain('onShowLegal?.("privacy")');
  });

  it("server rejects registration without consent and stamps acceptance on both paths", () => {
    expect(serverSrc).toContain("if (termsAccepted !== true)");
    expect(serverSrc).toContain(
      'error: "Acceptance of the Terms of Service and Privacy Policy is required to register."'
    );
    const insertCount = (serverSrc.match(/terms_accepted_at\) VALUES/g) ?? []).length;
    expect(insertCount).toBe(2);
    expect(serverSrc).toContain("terms_accepted_at: new Date()");
    expect(serverSrc).toContain("terms_accepted_at: u.terms_accepted_at ?? null");
  });

  it("the column exists in the migration and in initializeDatabase()", () => {
    expect(migrationSrc).toContain(
      "ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ"
    );
    expect(serverSrc).toContain(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;"
    );
  });
});

describe("E6 first-login assent interstitial", () => {
  it("App renders the blocking interstitial while terms_accepted_at is null", () => {
    expect(appSrc).toContain("if (user.terms_accepted_at === null)");
    expect(appSrc).toContain('id="first-login-assent"');
    expect(appSrc).toContain('id="first-login-assent-agree"');
    expect(appSrc).toContain("<LegalDocuments />");
    expect(appSrc).toContain('"/api/auth/terms-accepted"');
  });

  it("the acceptance endpoint is session-guarded and stamps server-side", () => {
    expect(serverSrc).toContain('app.post("/api/auth/terms-accepted"');
    const endpointIdx = serverSrc.indexOf('app.post("/api/auth/terms-accepted"');
    const body = serverSrc.slice(endpointIdx, endpointIdx + 900);
    expect(body).toContain("if (!req.auth)");
    expect(body).toContain("UPDATE users SET terms_accepted_at = NOW()");
    expect(middlewareSrc).toContain('"/auth/login"');
    expect(middlewareSrc.includes('"/auth/terms-accepted"')).toBe(false);
    expect(middlewareSrc).toContain("terms_accepted_at");
  });

  it("session payloads carry terms_accepted_at to the client", () => {
    expect(serverSrc).toContain("terms_accepted_at: user.terms_accepted_at");
    expect(loginSrc).toContain("terms_accepted_at?: string | null");
  });
});

describe("E10 — the legal surface the interstitial relies on is actually rendered", () => {
  it("App renders LegalDocuments with the requested tab", () => {
    expect(appSrc).toContain('initialTab={showLegalDoc}');
    expect(appSrc).toContain('onClose={() => setShowLegalDoc(null)}');
  });
});

describe("E9 print disclaimer", () => {
  it("the app shell mounts the print-only disclaimer", () => {
    expect(appSrc).toContain('<ArtifactDisclaimer variant="print" />');
    expect(appSrc).toContain('import ArtifactDisclaimer from "./components/ArtifactDisclaimer"');
  });
});

describe("E7/E3 confirm gates on export and work-order actions", () => {
  it("Diagnose gates the PDF export, embeds the disclaimer, and gates the picking ticket", () => {
    expect(diagnoseSrc).toContain('confirmArtifactExport("Export PDF report")');
    expect(diagnoseSrc).toContain("confirmArtifactExport(\"Print picking ticket\")");
    expect(diagnoseSrc).toContain("ARTIFACT_DISCLAIMER");
    expect(diagnoseSrc.indexOf("ARTIFACT_DISCLAIMER")).toBeLessThan(
      diagnoseSrc.indexOf("doc.save(")
    );
  });

  it("AnalysisReport funnels every export through runExport and stamps NFPA JSON with the disclaimer", () => {
    expect(analysisReportSrc).toContain("confirmArtifactExport(`Export ${kind}`)");
    expect(analysisReportSrc).toContain('disclaimer: ARTIFACT_DISCLAIMER');
    expect(analysisReportSrc).toContain("guardedWorkOrder(");
    expect(analysisReportSrc).toContain("confirmArtifactExport(\"Create work order draft\")");
  });

  it("TrendAnalyzer confirms before work-order JSON / report JSON / CSV / print and stamps the disclaimer", () => {
    expect(trendSrc).toContain('confirmArtifactExport("Generate work order")');
    expect(trendSrc).toContain("disclaimer: ARTIFACT_DISCLAIMER");
    expect(trendSrc).toContain('_meta: { disclaimer: ARTIFACT_DISCLAIMER }');
    expect(trendSrc).toContain('confirmArtifactExport("Export trend report")');
    expect(trendSrc).toContain('confirmArtifactExport("Export CSV")');
    expect(trendSrc).toContain('confirmArtifactExport("Email trend report")');
    expect(trendSrc).toContain('confirmArtifactExport("Print trend report")');
  });

  it("DiagnosisLogs confirms before CSV export and work-order creation", () => {
    expect(logsSrc).toContain('confirmArtifactExport("Export diagnosis logs")');
    expect(logsSrc).toContain('confirmArtifactExport("Create work order")');
  });

  it("MountingPlanner and EquipmentExplorer confirm before PDF/print", () => {
    expect(plannerSrc).toContain('confirmArtifactExport("Download installation SOP PDF")');
    expect(plannerSrc).toContain('confirmArtifactExport("Print document")');
    expect(explorerSrc).toContain('confirmArtifactExport("Print report")');
  });
});

describe("E8 — CMMS clipboard respects engineer sign-off", () => {
  it("the bridge refuses every copy while sign-off is pending, reusing the cmmsPayload line", () => {
    expect(bridgeSrc).toContain('context.signOffStatus === "pending"');
    expect(bridgeSrc).toContain("PENDING ENGINEER SIGN-OFF - AI recommendation not yet certified");
    expect(cmmsPayloadSrc).toContain("PENDING ENGINEER SIGN-OFF - AI recommendation not yet certified");
  });

  it("the full-payload copy is also confirmed before it leaves the app", () => {
    expect(bridgeSrc).toContain('confirmArtifactExport("Copy full work-order payload")');
    expect(bridgeSrc).toContain("if (!signOffPending && !confirmArtifactExport(");
  });
});
