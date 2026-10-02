/**
 * Work-order draft proposals (H3-2) - localStorage-backed reactive store.
 *
 * A draft is a PROPOSAL, never a work order: no human has approved it, and
 * an approval is itself only a recorded state that still awaits real CMMS
 * integration (none is built - the approval says so on its face). Every draft
 * carries what generated it: verdict + window/crossed sentence, projected
 * series, N/span, slope +/- SE, and threshold provenance, stamped with its
 * generation time. No dollar figures ever enter a draft (G1: the cost model
 * does not apply to unapproved proposals), absence of drafts is confessed as
 * absence, and every rendered draft labels itself guidance, not a diagnosis.
 *
 * Reactivity follows the audited cost-model pattern (CostDock.tsx): a
 * CustomEvent for same-tab consumers plus the browser "storage" event for
 * cross-tab consumers, zero new dependencies. React binds through
 * useSyncExternalStore over a cached snapshot (referential stability).
 */

import type { PrognosticsModality } from "../../components/reports/prognosticsResolvers";

export const WORK_ORDER_DRAFTS_KEY = "spectra_work_order_drafts_v1";
export const WORK_ORDER_DRAFTS_EVENT = "workOrderDraftsChanged";

export type WorkOrderDraftStatus = "draft" | "approved";

export interface WorkOrderDraft {
  /** One open draft per asset + modality: `${assetId}::${modality}`. */
  id: string;
  assetId: string;
  component: string;
  modality: PrognosticsModality;
  modalityLabel: string;
  target: string;
  trackedMetric: string;
  unit: string;
  verdict: string;
  sentence: string;
  n: number;
  spanDays: number;
  slope: number | null;
  seOfSlope: number | null;
  thresholdProvenance: string;
  generatedAt: string;
  status: WorkOrderDraftStatus;
}

export interface WorkOrderDraftInput {
  assetId: string;
  component: string;
  modality: PrognosticsModality;
  modalityLabel: string;
  target: string;
  trackedMetric: string;
  unit: string;
  verdict: string;
  sentence: string;
  n: number;
  spanDays: number;
  slope: number | null;
  seOfSlope: number | null;
  thresholdProvenance: string;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeDrafts(value: unknown): WorkOrderDraft[] {
  if (!Array.isArray(value)) return [];
  const out: WorkOrderDraft[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.assetId !== "string") continue;
    if (typeof o.modality !== "string") continue;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      assetId: o.assetId,
      component: typeof o.component === "string" ? o.component : "",
      modality: o.modality as PrognosticsModality,
      modalityLabel: typeof o.modalityLabel === "string" ? o.modalityLabel : o.modality,
      target: typeof o.target === "string" ? o.target : "",
      trackedMetric: typeof o.trackedMetric === "string" ? o.trackedMetric : "",
      unit: typeof o.unit === "string" ? o.unit : "",
      verdict: typeof o.verdict === "string" ? o.verdict : "",
      sentence: typeof o.sentence === "string" ? o.sentence : "",
      n: numOrNull(o.n) ?? 0,
      spanDays: numOrNull(o.spanDays) ?? 0,
      slope: numOrNull(o.slope),
      seOfSlope: numOrNull(o.seOfSlope),
      thresholdProvenance:
        typeof o.thresholdProvenance === "string" ? o.thresholdProvenance : "no threshold provenance on record",
      generatedAt: typeof o.generatedAt === "string" ? o.generatedAt : "",
      status: o.status === "approved" ? "approved" : "draft"
    });
  }
  return out;
}

export function loadWorkOrderDrafts(): WorkOrderDraft[] {
  try {
    const raw = localStorage.getItem(WORK_ORDER_DRAFTS_KEY);
    if (!raw) return [];
    return sanitizeDrafts(JSON.parse(raw));
  } catch {
    return [];
  }
}

let cache: WorkOrderDraft[] | null = null;

function read(): WorkOrderDraft[] {
  if (cache === null) cache = loadWorkOrderDrafts();
  return cache;
}

function write(list: WorkOrderDraft[]): void {
  cache = list;
  try {
    localStorage.setItem(WORK_ORDER_DRAFTS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable - the in-memory cache still serves this tab
  }
  window.dispatchEvent(new CustomEvent(WORK_ORDER_DRAFTS_EVENT));
}

/** Cached snapshot - stable reference until a mutation or storage event. */
export function getWorkOrderDraftsSnapshot(): WorkOrderDraft[] {
  return read();
}

export function subscribeWorkOrderDrafts(onChange: () => void): () => void {
  const refresh = () => {
    cache = loadWorkOrderDrafts();
    onChange();
  };
  window.addEventListener(WORK_ORDER_DRAFTS_EVENT, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(WORK_ORDER_DRAFTS_EVENT, refresh);
    window.removeEventListener("storage", refresh);
  };
}

/**
 * Dedupe: ONE draft per asset + modality. An existing open draft (either
 * status - approved still occupies the slot until discarded) returns null so
 * the proposing row can disable itself as "Draft pending".
 */
export function proposeWorkOrderDraft(input: WorkOrderDraftInput): WorkOrderDraft | null {
  const list = read();
  const id = `${input.assetId}::${input.modality}`;
  if (list.some((d) => d.id === id)) return null;
  const draft: WorkOrderDraft = {
    ...input,
    id,
    generatedAt: new Date().toISOString(),
    status: "draft"
  };
  write([...list, draft]);
  return draft;
}

export function approveWorkOrderDraft(id: string): void {
  const list = read().map((d) => (d.id === id ? { ...d, status: "approved" as const } : d));
  write(list);
}

export function discardWorkOrderDraft(id: string): void {
  write(read().filter((d) => d.id !== id));
}
