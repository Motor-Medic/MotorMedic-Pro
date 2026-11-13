/**
 * SLICE-HARNESS — cross-tech DOM honesty contract helpers.
 *
 * DOCTRINE (why this file exists): the per-slice render tests each reinvent
 * their own ~40-line setup (verified: no shared helper existed before this
 * file — see the 5 copy-pasted beforeEach blocks in
 * src/components/TrendAnalyzer.vs7Thermography.render.test.tsx:112-131,
 * TrendAnalyzer.mcaGroundwallHonesty.render.test.tsx:101-120,
 * TrendAnalyzer.leaksManual.test.tsx:90-107, etc.).
 *
 * This module is the foolproof layer:
 *  1. ONE seeding/render path (equipment store + /api/analysis-results rows +
 *     /api/oil-analysis samples) for every technology tab.
 *  2. Contract asserts that READ THE RENDERED DOM (never function returns)
 *     and THROW ContractViolation on the exact honesty breach.
 *  3. A mutation-test helper (plantDomLie) so every spec can prove its
 *     contracts go RED on a planted lie. A harness that passes on a lie is
 *     a failure.
 *  4. A Google-truth hook: fixtures carry the real-standard expected value
 *     per field; expectGoogleTruth asserts the rendered DOM matches the
 *     standard-derived expectation and emits a per-field checklist
 *     (field -> standard -> rendered) for the Google pass.
 *
 * Relative paths only. Never touches production Neon, never commits.
 */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// pdfjs-dist is only needed for PDF extraction; its real build requires
// DOMMatrix (absent in jsdom). Same pair of mocks every slice render test
// hoists — hoisted here once for the whole harness.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn()
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: ""
}));

import TrendAnalyzer from "../../components/TrendAnalyzer";
import { saveEquipmentStore, type EquipmentStore } from "../../data/equipmentDb";

export type TechId =
  | "vibration"
  | "thermography"
  | "ultrasound"
  | "mca"
  | "oil_analysis";

/** One real-standard expectation per rendered field (Google-truth hook). */
export interface GoogleTruthEntry {
  /** Rendered field name, e.g. "overall velocity". */
  field: string;
  /** Which real standard / SSOT constant the expectation derives from. */
  standard: string;
  /** The exact string the DOM must show if reality matches the standard. */
  expected: string;
}

export interface TechFixtureState {
  name: string;
  rows: Array<Record<string, unknown>>;
  oilSamples?: Array<Record<string, unknown>>;
  truth: GoogleTruthEntry[];
}

export interface TechFixtures {
  tech: TechId;
  good: TechFixtureState;
  empty: TechFixtureState;
  edge: TechFixtureState;
}

/** Thrown by every contract assert when the rendered DOM breaches honesty. */
export class ContractViolation extends Error {
  readonly contract: string;
  constructor(contract: string, message: string) {
    super(`[${contract}] ${message}`);
    this.contract = contract;
    this.name = "ContractViolation";
  }
}

/* ------------------------------------------------------------------ */
/* Shared seeding path                                                 */
/* ------------------------------------------------------------------ */

export const HARNESS_EQUIPMENT_STORE: EquipmentStore = {
  plants: [
    {
      id: "plant-1",
      name: "Harness Plant",
      location: "Harness Plant",
      facilityType: "Power Plant"
    }
  ],
  units: [],
  routes: [
    {
      id: "route-1",
      name: "Harness Route",
      location: "Harness Plant",
      assets: [
        {
          id: "asset-1",
          tag: "M-101",
          name: "Harness Motor",
          location: "Harness Plant",
          components: []
        }
      ]
    }
  ]
};

/** Store whose single component carries a stored nameplate voltage (MCA). */
export function equipmentStoreWithVoltage(
  voltage = "460 V"
): EquipmentStore {
  return {
    ...HARNESS_EQUIPMENT_STORE,
    routes: [
      {
        ...HARNESS_EQUIPMENT_STORE.routes[0],
        assets: [
          {
            ...HARNESS_EQUIPMENT_STORE.routes[0].assets[0],
            components: [{ id: "comp-1", name: "Stator", kinematics: { voltage } }]
          }
        ]
      }
    ]
  } as EquipmentStore;
}

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export interface Harness {
  /** Analysis rows served by the stubbed /api/analysis-results endpoint. */
  rows: Array<Record<string, unknown>>;
  /** Oil sample db rows served by the stubbed /api/oil-analysis endpoint. */
  oilSamples: Array<Record<string, unknown>>;
}

const TECH_CARD_NAME: Record<TechId, RegExp> = {
  vibration: /Vibration Analysis/,
  thermography: /Thermography/,
  ultrasound: /Ultrasound/,
  mca: /Motor Circuit Analysis/,
  oil_analysis: /Oil Analysis/
};

const TECH_LOADING_TEXT: Record<TechId, string> = {
  vibration: "Loading analysis trends…",
  thermography: "Loading thermography trends…",
  ultrasound: "Loading ultrasound trends…",
  mca: "Loading MCA trends…",
  oil_analysis: "Loading oil analysis data..."
};

/**
 * Registers the shared beforeEach/afterEach once per spec file and returns
 * the mutable seed state. Call at the top level of a spec file.
 */
export function setupHarness(): Harness {
  const state: Harness = { rows: [], oilSamples: [] };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    saveEquipmentStore(HARNESS_EQUIPMENT_STORE);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/tenant-settings")) return jsonResponse({});
        if (url.startsWith("/api/analysis-results")) {
          return jsonResponse({ results: state.rows });
        }
        if (url.startsWith("/api/oil-analysis")) {
          return jsonResponse({ samples: state.oilSamples });
        }
        return jsonResponse({});
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    state.rows = [];
    state.oilSamples = [];
  });

  return state;
}

/**
 * Loads a fixture state into the seed path. For oil samples it must be
 * called BEFORE openTech (the oil sub-tab fetches on mount).
 */
export function loadFixture(state: Harness, fixture: TechFixtureState): void {
  state.rows = fixture.rows;
  state.oilSamples = fixture.oilSamples ?? [];
}

/**
 * Renders TrendAnalyzer, opens the technology card, waits for the tab's
 * loading state to clear, and optionally clicks a sub-mode button.
 */
export async function openTech(
  tech: TechId,
  modeButton?: string | RegExp
): Promise<void> {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(
    within(cards).getByRole("button", { name: TECH_CARD_NAME[tech] })
  );
  await waitFor(() => {
    expect(screen.queryByText(TECH_LOADING_TEXT[tech])).toBeNull();
  });
  if (modeButton) {
    fireEvent.click(screen.getByRole("button", { name: modeButton }));
  }
}

/* ------------------------------------------------------------------ */
/* Mutation-test primitive                                             */
/* ------------------------------------------------------------------ */

/**
 * Plants a fabricated value directly into the rendered DOM — exactly what a
 * lying render path would output. Contract asserts read the DOM, so they
 * must go RED on this. afterEach cleanup removes it.
 */
export function plantDomLie(text: string): void {
  const el = document.createElement("div");
  el.setAttribute("data-harness-mutation", "planted-lie");
  el.textContent = text;
  document.body.appendChild(el);
}

/* ------------------------------------------------------------------ */
/* DOM contract asserts (all throw ContractViolation)                  */
/* ------------------------------------------------------------------ */

function bodyText(): string {
  return document.body.textContent ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Contract: value renders iff stored (present-if-stored, positive side). */
export function expectTextRendered(pattern: RegExp | string): void {
  if (typeof pattern === "string") {
    if (!bodyText().includes(pattern)) {
      throw new ContractViolation(
        "gate-present-when-stored",
        `expected rendered text not found in DOM: "${pattern}"`
      );
    }
    return;
  }
  if (!pattern.test(bodyText())) {
    throw new ContractViolation(
      "gate-present-when-stored",
      `expected rendered text not found in DOM: ${String(pattern)}`
    );
  }
}

/** Contract: gate absent when nothing is stored (present-if-stored, negative). */
export function expectTextAbsent(pattern: RegExp | string): void {
  if (typeof pattern === "string") {
    if (bodyText().includes(pattern)) {
      throw new ContractViolation(
        "gate-absent-when-empty",
        `forbidden text found in DOM: "${pattern}"`
      );
    }
    return;
  }
  if (pattern.test(bodyText())) {
    throw new ContractViolation(
      "gate-absent-when-empty",
      `forbidden text found in DOM: ${String(pattern)}`
    );
  }
}

/** Alias with the no-fabricated-value contract name for mutation reds. */
export function expectNoFabricatedValue(pattern: RegExp | string): void {
  try {
    expectTextAbsent(pattern);
  } catch (error) {
    if (error instanceof ContractViolation) {
      throw new ContractViolation(
        "no-fabricated-value",
        error.message.replace(/^\[gate-absent-when-empty\] /, "")
      );
    }
    throw error;
  }
}

/** testid-gated surface must exist and contain every phrase. */
export function expectTestIdContent(
  testId: string,
  phrases: Array<string | RegExp>
): HTMLElement {
  const el = screen.queryByTestId(testId);
  if (!el) {
    throw new ContractViolation(
      "gate-present-when-stored",
      `data-testid="${testId}" not rendered`
    );
  }
  const text = el.textContent ?? "";
  for (const phrase of phrases) {
    const ok =
      typeof phrase === "string" ? text.includes(phrase) : phrase.test(text);
    if (!ok) {
      throw new ContractViolation(
        "gate-present-when-stored",
        `data-testid="${testId}" missing phrase ${String(phrase)} — got "${text.slice(0, 200)}"`
      );
    }
  }
  return el;
}

/** testid-gated surface must NOT exist (honest empty / suppressed). */
export function expectTestIdAbsent(testId: string): void {
  if (screen.queryByTestId(testId)) {
    throw new ContractViolation(
      "gate-absent-when-empty",
      `data-testid="${testId}" rendered but nothing is stored`
    );
  }
}

/** Honest empty state copy must render. */
export function expectHonestEmptyState(text: string): void {
  if (!bodyText().includes(text)) {
    throw new ContractViolation(
      "honest-empty-state",
      `expected honest empty state not found: "${text}"`
    );
  }
}

/**
 * Null-trio vocabulary: NOT_MEASURED / NOT_REPORTED / NOT_DETECTED
 * (src/lib/thermographyTrendSeries.ts:15-17).
 */
export function expectNullTrio(opts?: {
  measured?: boolean;
  reported?: boolean;
  detected?: boolean;
}): void {
  const { measured = true, reported = true, detected = false } = opts ?? {};
  const parts: Array<[boolean, string]> = [
    [measured, "Not measured"],
    [reported, "Not reported"],
    [detected, "Not detected"]
  ];
  for (const [required, literal] of parts) {
    if (!required) continue;
    if (!bodyText().includes(literal)) {
      throw new ContractViolation(
        "null-trio",
        `"${literal}" absent from rendered DOM`
      );
    }
  }
}

/**
 * Unit/dimensionless isolation: a ratio/log readout must carry its basis
 * note and must NEVER show a converted physical unit next to it.
 */
export function expectUnitIsolation(
  testId: string,
  opts: { dimensionlessNote?: string; bannedUnits?: RegExp[] }
): void {
  const { dimensionlessNote, bannedUnits = [] } = opts;
  const el = screen.queryByTestId(testId);
  if (!el) {
    throw new ContractViolation(
      "unit-isolation",
      `data-testid="${testId}" not rendered`
    );
  }
  const text = el.textContent ?? "";
  if (dimensionlessNote && !text.includes(dimensionlessNote)) {
    throw new ContractViolation(
      "unit-isolation",
      `data-testid="${testId}" missing dimensionless basis note "${dimensionlessNote}" — got "${text}"`
    );
  }
  for (const unit of bannedUnits) {
    if (unit.test(text)) {
      throw new ContractViolation(
        "unit-isolation",
        `data-testid="${testId}" shows a converted physical unit ${String(unit)} on a dimensionless quantity — got "${text}"`
      );
    }
  }
}

/** Same-date sequence labels: nth run on a date renders "date · n". */
export function expectSameDateLabel(baseDate: string, ordinal = 2): void {
  const re = new RegExp(`${escapeRegExp(baseDate)}\\s*·\\s*${ordinal}`);
  if (!re.test(bodyText())) {
    throw new ContractViolation(
      "same-date-label",
      `same-date sequence label "${baseDate} · ${ordinal}" absent from rendered DOM`
    );
  }
}

/**
 * Citation contract: the exact SSOT citation string (imported from
 * prescriptiveDictionary, never re-typed) must render verbatim, and no
 * fabricated severity-standard claim may appear.
 */
const FAKE_CITATION_PATTERNS: RegExp[] = [
  /IEEE 43 (severity )?(certified )?(pass\/fail|classification)/i,
  /per NEMA MG-1 resistance severity/i,
  /ISO 20816 severity class for (MCA|ultrasound|oil)/i,
  /NETA certified (CFM|leak-rate)/i,
  /ASTM D5185 alarm limits/i
];

export function expectCitationIsRealSource(
  citation: string,
  fakePatterns: RegExp[] = FAKE_CITATION_PATTERNS
): void {
  if (!bodyText().includes(citation)) {
    throw new ContractViolation(
      "citation-is-real-source",
      `real-source citation not rendered verbatim: "${citation.slice(0, 80)}…"`
    );
  }
  for (const fake of fakePatterns) {
    if (fake.test(bodyText())) {
      throw new ContractViolation(
        "citation-is-real-source",
        `fabricated standard claim rendered in DOM: ${String(fake)}`
      );
    }
  }
}

/** Extrapolation must never surface (projection/parking honesty). */
export function expectNoExtrapolation(
  banned: Array<string | RegExp>
): void {
  for (const item of banned) {
    const hit =
      typeof item === "string" ? bodyText().includes(item) : item.test(bodyText());
    if (hit) {
      throw new ContractViolation(
        "no-extrapolation-in-DOM",
        `extrapolated/fabricated output surfaced in DOM: ${String(item)}`
      );
    }
  }
}

/** Provenance caption (modeled-vs-measured, radiometric-vs-badge, probe). */
export function expectProvenanceCaption(
  testId: string,
  phrases: Array<string | RegExp>
): void {
  const el = screen.queryByTestId(testId);
  if (!el) {
    throw new ContractViolation(
      "provenance-caption-present",
      `data-testid="${testId}" not rendered`
    );
  }
  const text = el.textContent ?? "";
  for (const phrase of phrases) {
    const ok =
      typeof phrase === "string" ? text.includes(phrase) : phrase.test(text);
    if (!ok) {
      throw new ContractViolation(
        "provenance-caption-present",
        `data-testid="${testId}" missing provenance phrase ${String(phrase)} — got "${text.slice(0, 200)}"`
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Google-truth hook                                                   */
/* ------------------------------------------------------------------ */

interface ChecklistRow extends GoogleTruthEntry {
  rendered: boolean;
}

const googleChecklist: ChecklistRow[] = [];

/**
 * Asserts each standard-derived expected value is actually rendered, and
 * records the field -> standard -> rendered row for the emitted checklist.
 */
export function expectGoogleTruth(entries: GoogleTruthEntry[]): void {
  for (const entry of entries) {
    if (!bodyText().includes(entry.expected)) {
      throw new ContractViolation(
        "google-truth",
        `field "${entry.field}" (${entry.standard}): expected-from-standard "${entry.expected}" not rendered`
      );
    }
    googleChecklist.push({ ...entry, rendered: true });
  }
}

/** Emits the per-field reality checklist (console.log is mocked in specs). */
export function printGoogleChecklist(label: string): void {
  const rows = googleChecklist;
  console.info(`\n=== GOOGLE-TRUTH CHECKLIST — ${label} (${rows.length} fields) ===`);
  for (const row of rows) {
    console.info(
      `field=${row.field}\n  standard: ${row.standard}\n  expected-from-standard: ${row.expected}\n  rendered: ${String(row.rendered)}`
    );
  }
}

export function googleChecklistSize(): number {
  return googleChecklist.length;
}
