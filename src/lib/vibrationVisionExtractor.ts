/**
 * Vibration Vision Extractor — transcription-first master-vision pipeline.
 *
 * Mirrors the oil extractor (src/lib/oilVisionExtractor.ts) but finalizes into a
 * VibrationReportData. The shared model loop (runMasterVisionModelLoop) lives in
 * the oil extractor so the model is only called once; this module adds the
 * vibration-specific transcription mapper, per-field consensus, and finalizer.
 *
 * Technology gate: vibration fields are auto-filled ONLY when detected_technology
 * === "VIBRATION" OR the raw_table headers contain >= 3 vibration markers. Oil
 * fields are never touched here (this returns a vibration-shaped result only).
 */

import {
  runMasterVisionModelLoop,
  type MasterVisionParse,
  OIL_VISION_API_PATH
} from "./oilVisionExtractor";

export type VibSeverity = "NORMAL" | "ALERT" | "CRITICAL" | null;

export interface VibrationReportData {
  overallVelocityRms: number | null;
  peakAccelerationG: number | null;
  runningSpeedRpm: number | null;
  amplitude1x: number | null;
  peakFrequencies: (number | string)[] | null;
  severity: VibSeverity;
  confidenceScore: number;
  sourceFileName?: string | null;
  /** Attached at runtime (not part of the strict schema). */
  model?: string;
  detectedTechnology?: string | null;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
}

interface VibTranscriptionRow {
  header?: string | null;
  value?: number | string | null;
  unit_as_read?: string | null;
  operator?: string | null;
}

export interface VibrationTranscriptionResult {
  overallVelocityRms: number | null;
  peakAccelerationG: number | null;
  runningSpeedRpm: number | null;
  amplitude1x: number | null;
  peakFrequencies: (number | string)[] | null;
  severity: string | null;
}

/* ------------------------------------------------------------------ */
/* Number / header helpers                                            */
/* ------------------------------------------------------------------ */

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null|—|-/i.test(trimmed)) return null;
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return null;
}

function valueFromField(field: unknown): number | null {
  if (field == null) return null;
  if (typeof field === "object") {
    const f = field as { value?: unknown; status?: string };
    if (f.status === "absent" || f.status === "illegible") return null;
    return finiteNum(f.value);
  }
  return finiteNum(field);
}

function normalizeHeader(h: string | null | undefined): string {
  if (!h) return "";
  return String(h)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[):]/g, "")
    .trim();
}

type VibKind =
  | "overallVelocity"
  | "peakAccel"
  | "rpm"
  | "amp1x"
  | "severity"
  | "spectral";

function resolveVibKind(h: string): VibKind | null {
  const n = normalizeHeader(h);
  if (!n) return null;
  if (/(^|[^a-z])1x(\b|$)|1x amplitude|1x velocity|fundamental|running speed.*1x/i.test(n)) {
    if (/amplitude|velocity|fundamental/.test(n)) return "amp1x";
  }
  if (/overall velocity|velocity|in\/s|mm\/s/.test(n)) return "overallVelocity";
  if (/accel|g'?s|g-pk|peak accel/.test(n)) return "peakAccel";
  if (/rpm|\bcpm\b|running speed|speed/.test(n)) return "rpm";
  if (/\b1x\b|1 x|fundamental|order/.test(n)) return "amp1x";
  if (/severity|alarm|status|condition/.test(n)) return "severity";
  if (/hz|\bcp|\bfreq|peak|order|bp[foi]|fft|spectr|amplitude/.test(n)) return "spectral";
  return null;
}

function normalizeSeverity(s: string | null): VibSeverity {
  if (!s) return null;
  const u = s.trim().toUpperCase();
  if (u === "NORMAL" || u === "GOOD" || u === "OK" || u === "ACCEPTABLE" || u === "HEALTHY")
    return "NORMAL";
  if (u === "ALERT" || u === "WARNING" || u === "CAUTION" || u === "ELEVATED" || u === "ATTENTION")
    return "ALERT";
  if (u === "CRITICAL" || u === "FAULT" || u === "DANGER" || u === "SEVERE" || u === "FAIL")
    return "CRITICAL";
  return null;
}

/* ------------------------------------------------------------------ */
/* Transcription-first mapper                                        */
/* ------------------------------------------------------------------ */

export function mapVibrationTranscription(rows: unknown): VibrationTranscriptionResult {
  const result: VibrationTranscriptionResult = {
    overallVelocityRms: null,
    peakAccelerationG: null,
    runningSpeedRpm: null,
    amplitude1x: null,
    peakFrequencies: null,
    severity: null
  };
  if (!Array.isArray(rows)) return result;

  const freqs: (number | string)[] = [];

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as VibTranscriptionRow;
    const h = normalizeHeader(row.header ?? null);
    const kind = resolveVibKind(h);
    if (!kind) continue;
    const v = valueFromField(row.value ?? row);

    switch (kind) {
      case "overallVelocity":
        if (v != null) result.overallVelocityRms = Math.max(result.overallVelocityRms ?? -Infinity, v);
        break;
      case "peakAccel":
        if (v != null) result.peakAccelerationG = Math.max(result.peakAccelerationG ?? -Infinity, v);
        break;
      case "rpm":
        if (v != null && result.runningSpeedRpm == null) result.runningSpeedRpm = v;
        break;
      case "amp1x":
        if (v != null) result.amplitude1x = Math.max(result.amplitude1x ?? -Infinity, v);
        break;
      case "severity": {
        const sv = normalizeSeverity(String(row.value ?? ""));
        if (sv && result.severity == null) result.severity = sv;
        break;
      }
      case "spectral":
        if (v != null) freqs.push(v);
        else if (typeof row.value === "string" && row.value.trim()) freqs.push(row.value.trim());
        break;
    }
  }

  if (freqs.length) result.peakFrequencies = freqs;
  return result;
}

/* ------------------------------------------------------------------ */
/* Per-field consensus                                               */
/* ------------------------------------------------------------------ */

const VIB_NUMERIC_KEYS: (keyof VibrationTranscriptionResult)[] = [
  "overallVelocityRms",
  "peakAccelerationG",
  "runningSpeedRpm",
  "amplitude1x"
];

function numClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01 * Math.abs(a), 0.05);
}

export function mergeVibConsensus(
  a: VibrationTranscriptionResult,
  b: VibrationTranscriptionResult
): { result: VibrationTranscriptionResult; flaggedFields: string[] } {
  const flaggedFields: string[] = [];
  const result: VibrationTranscriptionResult = {
    overallVelocityRms: null,
    peakAccelerationG: null,
    runningSpeedRpm: null,
    amplitude1x: null,
    peakFrequencies: null,
    severity: null
  };

  for (const k of VIB_NUMERIC_KEYS) {
    const av = a[k] as number | null;
    const bv = b[k] as number | null;
    if (av != null && bv != null && numClose(av, bv)) {
      (result[k] as number | null) = av;
    } else if (av != null || bv != null) {
      flaggedFields.push(k);
    }
  }

  if (a.severity && b.severity && a.severity.toUpperCase() === b.severity.toUpperCase()) {
    result.severity = a.severity;
  } else if (a.severity || b.severity) {
    flaggedFields.push("severity");
  }

  const af = a.peakFrequencies;
  const bf = b.peakFrequencies;
  if (af && bf && af.length && bf.length) {
    const a0 = typeof af[0] === "number" ? af[0] : finiteNum(af[0]);
    const b0 = typeof bf[0] === "number" ? bf[0] : finiteNum(bf[0]);
    if (a0 != null && b0 != null && numClose(a0, b0)) {
      result.peakFrequencies = af;
    } else {
      flaggedFields.push("peakFrequencies");
    }
  } else if (af || bf) {
    flaggedFields.push("peakFrequencies");
  }

  return { result, flaggedFields };
}

/** Single-model mode: flag every populated field for operator review. */
export function flagAllVibFilled(tx: VibrationTranscriptionResult): string[] {
  const flagged: string[] = [];
  for (const k of VIB_NUMERIC_KEYS) if ((tx[k] as number | null) != null) flagged.push(k);
  if (tx.severity) flagged.push("severity");
  if (tx.peakFrequencies && tx.peakFrequencies.length) flagged.push("peakFrequencies");
  return flagged;
}

/* ------------------------------------------------------------------ */
/* Map master JSON -> VibrationReportData                             */
/* ------------------------------------------------------------------ */

function mapVisionJsonToVibrationReportData(
  master: Record<string, unknown>,
  fileName?: string | null,
  mergedTx?: VibrationTranscriptionResult
): VibrationReportData {
  const vib = (master.data ?? {}) as Record<string, unknown>;
  const vibration = (vib.vibration ?? {}) as Record<string, unknown>;

  const data: VibrationReportData = {
    overallVelocityRms: null,
    peakAccelerationG: null,
    runningSpeedRpm: null,
    amplitude1x: null,
    peakFrequencies: null,
    severity: null,
    confidenceScore: 0,
    sourceFileName: fileName ?? null
  };

  const rawTableRows = master.raw_table;
  const tx = mergedTx ?? mapVibrationTranscription(rawTableRows);

  data.overallVelocityRms = tx.overallVelocityRms;
  data.peakAccelerationG = tx.peakAccelerationG;
  data.runningSpeedRpm = tx.runningSpeedRpm;
  data.amplitude1x = tx.amplitude1x;
  data.peakFrequencies = tx.peakFrequencies;
  data.severity = tx.severity ? normalizeSeverity(tx.severity) : null;

  if (data.overallVelocityRms == null)
    data.overallVelocityRms = valueFromField(vibration.overall_velocity_rms);
  if (data.peakAccelerationG == null)
    data.peakAccelerationG = valueFromField(vibration.peak_acceleration_g);
  if (data.runningSpeedRpm == null)
    data.runningSpeedRpm = valueFromField(vibration.running_speed_rpm);
  if (data.amplitude1x == null) data.amplitude1x = valueFromField(vibration.amplitude_1x);
  if (data.severity == null)
    data.severity = normalizeSeverity(String(vibration.vibration_severity ?? ""));
  if (data.peakFrequencies == null) {
    const pf = vibration.peak_frequencies_array;
    if (Array.isArray(pf)) {
      const arr = (pf as unknown[])
        .map((x) => (typeof x === "object" && x != null ? (x as { value?: unknown }).value : x))
        .filter((x) => x != null)
        .map((x) => (typeof x === "number" ? x : finiteNum(x)))
        .filter((x): x is number => x != null);
      if (arr.length) data.peakFrequencies = arr;
    }
  }

  return data;
}

/* ------------------------------------------------------------------ */
/* Technology gate helpers                                           */
/* ------------------------------------------------------------------ */

const POSITIVE_VIB_REGEX = /\b(mm\/s|in\/s|g-pk|g's|hz|rpm|rms|peak|spectrum|velocity|acceleration|frequency|1h|2h|3h)\b/gi;
const NEGATIVE_OIL_REGEX = /\b(blackstone|cst|viscosity|ppm|flashpoint|insolubles|wear metals|elemental analysis)\b/gi;

interface VibGateResult {
  pass: boolean;
  positiveCount: number;
  negativeCount: number;
  details: string;
}

function passesVibrationGate(parsed: Record<string, unknown>): VibGateResult {
  const parts: string[] = [];

  if (typeof parsed.detected_technology === "string") {
    parts.push(parsed.detected_technology);
  }

  const rawTable = parsed.raw_table;
  if (Array.isArray(rawTable)) {
    for (const row of rawTable) {
      if (!row || typeof row !== "object") continue;
      const r = row as VibTranscriptionRow;
      if (r.header) parts.push(String(r.header));
      if (r.value != null) parts.push(String(r.value));
      if (r.unit_as_read) parts.push(String(r.unit_as_read));
    }
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "raw_table" || key === "data") continue;
    if (typeof value === "string") parts.push(value);
    else if (typeof value === "number" || typeof value === "boolean") parts.push(String(value));
  }

  const fullText = parts.join(" ");

  const positiveMatches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = POSITIVE_VIB_REGEX.exec(fullText)) !== null) {
    positiveMatches.add(match[0].toLowerCase());
  }
  const positiveCount = positiveMatches.size;

  const negativeMatches = new Set<string>();
  while ((match = NEGATIVE_OIL_REGEX.exec(fullText)) !== null) {
    negativeMatches.add(match[0].toLowerCase());
  }
  const negativeCount = negativeMatches.size;

  const pass = !((negativeCount > 0 && positiveCount < 2) || positiveCount === 0);
  const details = `positive=${positiveCount}(${[...positiveMatches].join(",")}), negative=${negativeCount}(${[...negativeMatches].join(",")})`;

  return { pass, positiveCount, negativeCount, details };
}

/* ------------------------------------------------------------------ */
/* Finalizer + server entry points                                  */
/* ------------------------------------------------------------------ */

export interface VibrationVisionExtractResult {
  success: boolean;
  data?: VibrationReportData;
  model?: string;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
  error?: string;
  message?: string;
  httpStatus?: number;
  detail?: string;
}

export function finalizeVibrationFromParses(
  parses: MasterVisionParse[],
  lastError: unknown,
  input: { imageBase64: string; fileName?: string | null; models?: string[]; maxTokens?: number }
): VibrationVisionExtractResult {
  const startTime = logPipelineStartVib();
  if (parses.length === 0) {
    logPipelineFailVib(lastError || new Error("no content"));
    return {
      success: false,
      error: "PARSE_FAILED",
      message: "Could not parse report format.",
      httpStatus: 422,
      detail:
        lastError instanceof Error
          ? lastError.message
          : "All vision models failed to return a parseable report format."
    };
  }

  const primary = parses[0];
  const modelIds = parses.map((p) => p.model);
  const usedModel = primary.model;
  console.info("[vision] extraction succeeded using model(s):", modelIds.join(" + "));

  // --- TECHNOLOGY GATE (strict regex) ---
  const parsed = primary.parsed as Record<string, unknown>;
  const gateResult = passesVibrationGate(parsed);
  if (!gateResult.pass) {
    console.info("[vibration] gate decision: REJECT", gateResult.details);
    logPipelineFailVib(
      new Error(`vibration gate REJECT: ${gateResult.details}`)
    );
    return {
      success: false,
      error: "TECHNOLOGY_NOT_VIBRATION",
      message: "Report type not recognized - enter values manually or re-upload.",
      httpStatus: 422,
      detail: gateResult.details
    };
  }
  console.info("[vibration] gate decision: PASS", gateResult.details);

  let mergedTx: VibrationTranscriptionResult | undefined;
  let flaggedFields: string[] = [];
  let extractionMode: "consensus" | "single" = "single";

  if (parses.length >= 2) {
    extractionMode = "consensus";
    const txA = mapVibrationTranscription((parses[0].parsed as Record<string, unknown>).raw_table);
    const txB = mapVibrationTranscription((parses[1].parsed as Record<string, unknown>).raw_table);
    const merged = mergeVibConsensus(txA, txB);
    mergedTx = merged.result;
    flaggedFields = merged.flaggedFields;
  } else {
    extractionMode = "single";
    const txA = mapVibrationTranscription((primary.parsed as Record<string, unknown>).raw_table);
    flaggedFields = flagAllVibFilled(txA);
  }

  const data = mapVisionJsonToVibrationReportData(primary.parsed, input.fileName, mergedTx);
  (data as unknown as Record<string, unknown>).model = usedModel;
  (data as unknown as Record<string, unknown>).detectedTechnology = "VIBRATION";
  (data as unknown as Record<string, unknown>).flaggedFields = flaggedFields;
  (data as unknown as Record<string, unknown>).extractionMode = extractionMode;
  (data as unknown as Record<string, unknown>).consensusModels = modelIds;
  logPipelineSuccessVib({ model: usedModel, extractionMode });

  return {
    success: true,
    data,
    model: modelIds.join(" + "),
    flaggedFields,
    extractionMode,
    consensusModels: modelIds
  };
}

/** Server-side entry: run models + finalize vibration. */
export async function extractVibrationReportFromImageBase64(input: {
  imageBase64: string;
  fileName?: string | null;
  models?: string[];
  maxTokens?: number;
}): Promise<VibrationVisionExtractResult> {
  const { parses, lastError } = await runMasterVisionModelLoop(input);
  return finalizeVibrationFromParses(parses, lastError, input);
}

/** Browser helper — POST image to the unified vision endpoint and return vibration data. */
export async function extractVibrationReportFromImage(
  imageFile: File
): Promise<VibrationReportData> {
  if (
    !imageFile ||
    !(/^image\//i.test(imageFile.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name))
  ) {
    throw new Error("Upload a PNG, JPEG, or WebP vibration analysis screenshot.");
  }
  const base64Image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read vibration image as base64."));
    reader.readAsDataURL(imageFile);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(OIL_VISION_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ imageBase64: base64Image, fileName: imageFile.name })
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) throw new Error("Extraction timed out or failed. Please try again.");
    throw err;
  }
  clearTimeout(timeoutId);

  console.info("[vision] client received");

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (typeof result.error === "string" && result.error) ||
        (typeof result.message === "string" && result.message) ||
        `Vibration vision extraction failed (${response.status}).`
    );
  }
  // The unified endpoint may fall through to another technology's finalizer.
  // From the vibration tab we only accept a VIBRATION result.
  const technology = typeof result.technology === "string" ? result.technology : null;
  if (technology && technology !== "VIBRATION") {
    throw new Error("Report type not recognized - enter values manually or re-upload.");
  }
  const data = result.data as VibrationReportData | undefined;
  if (!data || typeof data !== "object") {
    throw new Error("Vibration vision extraction returned no data.");
  }
  return data;
}

/* Local logging shims. */
function logPipelineStartVib(): number {
  return Date.now();
}
function logPipelineFailVib(err: unknown): void {
  console.warn("[vibVisionExtractor] fail", err);
}
function logPipelineSuccessVib(extra?: Record<string, unknown>): void {
  if (extra) console.info(`[vibVisionExtractor] success`, extra);
}
