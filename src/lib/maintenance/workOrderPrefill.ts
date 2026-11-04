/**
 * SLICE-K - Trend Analyzer -> work-order prefill handoff.
 *
 * The action card already resolves the ISO-zone recommendation (and suppresses
 * it to `AUDIT_SAFE_FALLBACK` when the zone is unresolved or the agents
 * contradict). This module carries that resolved action into the existing
 * work-order draft path without putting diagnostic prose in the URL.
 *
 * Transition safety: the payload is written synchronously to an in-memory
 * snapshot plus sessionStorage before navigation, and consumers bind through
 * useSyncExternalStore. A fresh route chunk therefore reads a complete prefill,
 * never an empty form.
 */

import {
  AUDIT_SAFE_FALLBACK,
  resolveActionCardAction
} from "../../components/trendAnalyzer/VibrationSeverityPanels";
import type { PrognosticsModality } from "../../components/reports/prognosticsResolvers";
import { isoZoneLabel, type IsoZone } from "../vibration/isoZone";
import {
  formatVelocityDisplay,
  type VelocityDisplayUnit
} from "../vibration/units";

export const WORK_ORDER_PREFILL_KEY = "spectra_work_order_prefill_v1";
export const WORK_ORDER_PREFILL_EVENT = "workOrderPrefillChanged";

export interface WorkOrderPrefillInput {
  assetTag: string;
  assetName?: string | null;
  component?: string | null;
  zone: IsoZone | null;
  recommendation?: string | null;
  consensusConflict?: boolean;
  /**
   * Already-resolved action from the action card. When provided it wins so the
   * prefill can never recompute or bypass Slice-J suppression.
   */
  action?: string;
  /** Canonical mm/s RMS value; formatted for display with `velocityUnit`. */
  velocityMmS?: number | null;
  velocityUnit?: VelocityDisplayUnit;
  /** Where the prefill came from (defaults to "Trend Analyzer"). */
  sourceLabel?: string | null;
  /** Modality carried into the draft proposal (defaults to vibration). */
  modality?: PrognosticsModality;
  modalityLabel?: string | null;
  trackedMetric?: string | null;
  unit?: string | null;
  /** Extra already-resolved context lines (steam-trap ID, status, etc.). */
  contextLines?: readonly string[];
}

export interface WorkOrderPrefill {
  id: string;
  assetTag: string;
  assetName: string | null;
  component: string | null;
  isoZone: IsoZone | null;
  action: string;
  fault: string;
  description: string;
  velocityMmS: number | null;
  velocityDisplay: string | null;
  velocityUnit: VelocityDisplayUnit;
  suppressed: boolean;
  generatedAt: string;
  sourceLabel?: string;
  modality?: PrognosticsModality;
  modalityLabel?: string;
  trackedMetric?: string;
  unit?: string;
}

function clean(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function composeDescription(input: {
  assetTag: string;
  component: string | null;
  action: string;
  suppressed: boolean;
  velocityDisplay: string | null;
  zone: IsoZone | null;
  sourceLabel: string;
  contextLines: readonly string[];
}): string {
  const subject =
    [input.assetTag.trim(), input.component ?? ""].filter(Boolean).join(" / ") ||
    "the selected asset";
  const lines = [
    `Work order prefill from ${input.sourceLabel} for ${subject}.`
  ];

  if (input.suppressed) {
    lines.push(AUDIT_SAFE_FALLBACK);
    lines.push(
      "No repair action is recommended until the failure mode is confirmed."
    );
  } else {
    lines.push(`Recommended action: ${input.action}`);
  }

  for (const line of input.contextLines) {
    const text = line.trim();
    if (text) lines.push(text);
  }

  if (input.velocityDisplay) {
    lines.push(`Overall velocity: ${input.velocityDisplay}.`);
  }
  if (input.zone) {
    lines.push(`ISO 20816 Zone ${input.zone} - ${isoZoneLabel(input.zone)}.`);
  }

  return lines.join("\n");
}

export function buildWorkOrderPrefill(
  input: WorkOrderPrefillInput
): WorkOrderPrefill {
  const zone = input.zone ?? null;
  const recommendation = clean(input.recommendation);
  const action = (
    clean(input.action) ??
    resolveActionCardAction({
      zone,
      recommendation,
      consensusConflict: input.consensusConflict ?? false
    })
  ).trim();

  // Suppression is decided by the resolved action itself, never re-derived from
  // the raw recommendation. A suppressed card therefore cannot leak a repair.
  const suppressed = action === AUDIT_SAFE_FALLBACK;
  const component = clean(input.component);
  const assetName = clean(input.assetName);
  const velocityUnit: VelocityDisplayUnit =
    input.velocityUnit === "in/s" ? "in/s" : "mm/s";
  const velocityMmS =
    input.velocityMmS != null &&
    Number.isFinite(input.velocityMmS) &&
    input.velocityMmS >= 0
      ? input.velocityMmS
      : null;
  const velocityDisplay =
    velocityMmS != null
      ? formatVelocityDisplay(velocityMmS, velocityUnit)
      : null;
  const generatedAt = new Date().toISOString();
  const sourceLabel = clean(input.sourceLabel) ?? "Trend Analyzer";
  const modality: PrognosticsModality = input.modality ?? "vibration";
  const modalityLabel =
    clean(input.modalityLabel) ??
    (modality === "vibration"
      ? "Vibration"
      : modality === "ultrasound"
        ? "Ultrasound"
        : modality === "thermography"
          ? "Thermography"
          : modality === "mca"
            ? "MCA"
            : "Oil");
  const trackedMetric = clean(input.trackedMetric) ?? "Overall velocity";
  const unit = clean(input.unit) ?? velocityUnit;
  const contextLines = (input.contextLines ?? [])
    .map((line) => String(line ?? "").trim())
    .filter((line) => line !== "");

  return {
    id: `${input.assetTag.trim()}::${generatedAt}`,
    assetTag: input.assetTag.trim(),
    assetName,
    component,
    isoZone: zone,
    action,
    fault: suppressed ? AUDIT_SAFE_FALLBACK : action,
    description: composeDescription({
      assetTag: input.assetTag,
      component,
      action,
      suppressed,
      velocityDisplay,
      zone,
      sourceLabel,
      contextLines
    }),
    velocityMmS,
    velocityDisplay,
    velocityUnit,
    suppressed,
    generatedAt,
    sourceLabel,
    modality,
    modalityLabel,
    trackedMetric,
    unit
  };
}

function sanitizePrefill(value: unknown): WorkOrderPrefill | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.assetTag !== "string" ||
    typeof record.action !== "string" ||
    typeof record.description !== "string"
  ) {
    return null;
  }
  const zone =
    record.isoZone === "A" ||
    record.isoZone === "B" ||
    record.isoZone === "C" ||
    record.isoZone === "D"
      ? record.isoZone
      : null;
  const velocityUnit =
    record.velocityUnit === "in/s" ? "in/s" : "mm/s";
  const velocityMmS =
    typeof record.velocityMmS === "number" &&
    Number.isFinite(record.velocityMmS)
      ? record.velocityMmS
      : null;
  return {
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `${record.assetTag}::${record.generatedAt ?? ""}`,
    assetTag: record.assetTag,
    assetName: typeof record.assetName === "string" ? record.assetName : null,
    component: typeof record.component === "string" ? record.component : null,
    isoZone: zone,
    action: record.action,
    fault:
      typeof record.fault === "string" ? record.fault : record.action,
    description: record.description,
    velocityMmS,
    velocityDisplay:
      typeof record.velocityDisplay === "string"
        ? record.velocityDisplay
        : null,
    velocityUnit,
    suppressed: record.suppressed === true,
    generatedAt:
      typeof record.generatedAt === "string" ? record.generatedAt : "",
    sourceLabel:
      typeof record.sourceLabel === "string" && record.sourceLabel
        ? record.sourceLabel
        : "Trend Analyzer",
    modality:
      record.modality === "vibration" ||
      record.modality === "thermography" ||
      record.modality === "ultrasound" ||
      record.modality === "mca" ||
      record.modality === "oil"
        ? record.modality
        : "vibration",
    modalityLabel:
      typeof record.modalityLabel === "string" && record.modalityLabel
        ? record.modalityLabel
        : "Vibration",
    trackedMetric:
      typeof record.trackedMetric === "string" && record.trackedMetric
        ? record.trackedMetric
        : "Overall velocity",
    unit: typeof record.unit === "string" && record.unit ? record.unit : velocityUnit
  };
}

let cache: WorkOrderPrefill | null | undefined;

function readStorage(): WorkOrderPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WORK_ORDER_PREFILL_KEY);
    if (!raw) return null;
    return sanitizePrefill(JSON.parse(raw));
  } catch {
    return null;
  }
}

function read(): WorkOrderPrefill | null {
  if (cache === undefined) cache = readStorage();
  return cache;
}

function emit(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORK_ORDER_PREFILL_EVENT));
}

/** Write a complete prefill before navigation; returns the cached snapshot. */
export function stageWorkOrderPrefill(
  input: WorkOrderPrefillInput
): WorkOrderPrefill {
  const prefill = buildWorkOrderPrefill(input);
  cache = prefill;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        WORK_ORDER_PREFILL_KEY,
        JSON.stringify(prefill)
      );
    } catch {
      // Storage unavailable - the in-memory snapshot still serves this route.
    }
  }
  emit();
  return prefill;
}

/** Stable snapshot for useSyncExternalStore. */
export function getWorkOrderPrefillSnapshot(): WorkOrderPrefill | null {
  return read();
}

export function subscribeWorkOrderPrefill(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const refresh = () => {
    cache = readStorage();
    onChange();
  };
  window.addEventListener(WORK_ORDER_PREFILL_EVENT, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(WORK_ORDER_PREFILL_EVENT, refresh);
    window.removeEventListener("storage", refresh);
  };
}

export function clearWorkOrderPrefill(): void {
  cache = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(WORK_ORDER_PREFILL_KEY);
    } catch {
      // Storage unavailable - cache is already cleared.
    }
  }
  emit();
}
