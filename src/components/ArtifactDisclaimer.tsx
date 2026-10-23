/**
 * LEGAL-WRAPPER-A — one placement point for the legal text this repo already
 * owns, plus the shared confirm gate for artifacts that leave the application.
 *
 * THE ONE RULE for this file:
 *   - Every sentence in ARTIFACT_DISCLAIMER_PARAGRAPHS is a verbatim copy of
 *     the "CRITICAL PLATFORM DISCLAIMERS" prose already published in
 *     LegalDocuments.tsx (placement, not authoring). Nothing here is new legal
 *     copy.
 *   - The only slot that still needs lawyer-supplied text is AI_SPLIT_MARKER,
 *     which is intentionally empty.
 *   - EXPORT_CONFIRM_BODY / confirmArtifactExport carry neutral procedural UI
 *     copy only (a confirm dialog that points at the file leaving the app).
 */
import React from "react";

// TODO(SLICE B — lawyer): LegalDocuments.tsx states "Effective Date: July 8,
// 2026" while Terms.tsx states "Effective Date: July 10, 2026". Left as-is by
// design (no prose edits in either document); slice B must reconcile.

export interface DisclaimerParagraph {
  /** Bold lead-in, copied verbatim from LegalDocuments.tsx. */
  label: string;
  /** Body sentence(s), copied verbatim from LegalDocuments.tsx. */
  body: string;
}

/**
 * Verbatim reuse of LegalDocuments.tsx "CRITICAL PLATFORM DISCLAIMERS"
 * paragraphs (lines 185-201). Do not edit the prose here — edit the source
 * document instead and re-copy.
 */
export const ARTIFACT_DISCLAIMER_PARAGRAPHS: readonly DisclaimerParagraph[] = [
  {
    label: "Diagnostic Disclaimer:",
    body: "The predictive models and multi-agent debate loops integrated within Spectra CM provide engineering suggestions, baseline trends, and probable fault hypotheses. These suggestions **DO NOT** guarantee mechanical or operational accuracy. The Customer and its certified reliability personnel bear absolute responsibility for validating any diagnostic findings and supervising physical engineering decisions."
  },
  {
    label: "Industrial Equipment Safety Disclaimer:",
    body: "We are strictly not liable for industrial machinery failures, catastrophic damage, operational downtime, loss of production, plant shutdowns, or physical injuries/accidents occurring in connection with the use, misuse, or failure of the platform."
  },
  {
    label: "No Replacement for Professional Certified Expertise:",
    body: "This software is a monitoring tool and is **NOT** a replacement for on-site certified Category II/III ISO 18436 vibration specialists or professional reliability engineering consulting."
  }
] as const;

/**
 * Plain-string form of the same reused prose, for the non-React generators
 * (jsPDF footers, CSV/XLSX notes, JSON payloads).
 */
export const ARTIFACT_DISCLAIMER: string =
  ARTIFACT_DISCLAIMER_PARAGRAPHS.map((p) => `${p.label} ${p.body}`).join("\n\n");

// SLICE B: lawyer-supplied, do not invent.
// Empty today — ArtifactDisclaimer renders nothing for this slot until a
// lawyer supplies the sentence. Leave it empty; do not write one here.
export const AI_SPLIT_MARKER = "";

/**
 * Neutral procedural confirm copy for artifacts that leave the application.
 * Contains no liability/advisory posture wording by design.
 */
export const EXPORT_CONFIRM_BODY =
  "This file will leave the application when you save or share it. Continue?";

/**
 * Confirm step for every export / work-order action (E7). The action label is
 * the button's own neutral UI text; the body is the shared procedural copy.
 * Returns true when the caller should proceed.
 */
export function confirmArtifactExport(actionLabel: string): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }
  return window.confirm(`${actionLabel}? ${EXPORT_CONFIRM_BODY}`);
}

interface ArtifactDisclaimerProps {
  /**
   * "block" renders in-flow (default). "print" renders only inside @media
   * print so a printed page carries the same text as the file exports.
   */
  variant?: "block" | "print";
}

export default function ArtifactDisclaimer({
  variant = "block"
}: ArtifactDisclaimerProps) {
  if (!ARTIFACT_DISCLAIMER && !AI_SPLIT_MARKER) return null;

  const className =
    variant === "print"
      ? "hidden print:block print:fixed print:bottom-0 print:left-0 print:right-0 print:px-6 print:py-1 print:border-t print:border-slate-300 print:text-[6.5pt] print:leading-snug print:text-slate-600"
      : "text-xs leading-relaxed text-slate-500 space-y-2";

  return (
    <div className={className} data-artifact-disclaimer={variant}>
      {ARTIFACT_DISCLAIMER_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph.label}>
          <strong>{paragraph.label}</strong> {paragraph.body}
        </p>
      ))}
      {AI_SPLIT_MARKER ? <p>{AI_SPLIT_MARKER}</p> : null}
    </div>
  );
}
