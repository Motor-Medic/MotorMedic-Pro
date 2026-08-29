/**
 * MCA (Motor Circuit Analysis) Vision Extractor — transcription-first master-vision pipeline.
 *
 * Mirrors src/lib/vibrationVisionExtractor.ts but finalizes into an McaReportData using the
 * vendor-agnostic dictionary (PdMA / Baker / ALL-TEST PRO). The shared model loop
 * (runMasterVisionModelLoop) lives in oilVisionExtractor.ts so the model is called once.
 *
 * Technology gate: MCA fields are auto-filled ONLY when the MCA gate passes (>= 2 distinct
 * positive MCA markers and no ambiguous negative markers). Oil / vibration fields are never
 * touched here (this returns an MCA-shaped result only).
 */

import {
  runMasterVisionModelLoop,
  type MasterVisionParse,
  OIL_VISION_API_PATH
} from "./oilVisionExtractor";

export interface McaReportData {
  resistanceAb: number | null;
  resistanceBc: number | null;
  resistanceCa: number | null;
  resistanceImbalancePct: number | null;
  inductanceAb: number | null;
  inductanceBc: number | null;
  inductanceCa: number | null;
  inductanceImbalancePct: number | null;
  impedanceAb: number | null;
  impedanceBc: number | null;
  impedanceCa: number | null;
  phaseAngleAb: number | null;
  phaseAngleBc: number | null;
  phaseAngleCa: number | null;
  fi: number | null;
  insulationResistanceMohm: number | null;
  confidenceScore: number;
  sourceFileName?: string | null;
  model?: string;
  detectedTechnology?: string | null;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
}

interface McaTranscriptionRow {
  header?: string | null;
  value?: number | string | null;
  unit_as_read?: string | null;
  operator?: string | null;
}

export interface McaTranscriptionResult {
  resistanceAb: number | null;
  resistanceBc: number | null;
  resistanceCa: number | null;
  resistanceImbalancePct: number | null;
  inductanceAb: number | null;
  inductanceBc: number | null;
  inductanceCa: number | null;
  inductanceImbalancePct: number | null;
  impedanceAb: number | null;
  impedanceBc: number | null;
  impedanceCa: number | null;
  phaseAngleAb: number | null;
  phaseAngleBc: number | null;
  phaseAngleCa: number | null;
  fi: number | null;
  insulationResistanceMohm: number | null;
}

/* ------------------------------------------------------------------ */
/* Number / unit / header helpers                                     */
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
    .replace(/[):]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a raw value string (optionally with unit) to its base unit.
 *  - Resistance / Impedance base = Ohm
 *  - Inductance base = mH
 *  - Insulation base = MΩ (Mohm)
 * Returns the numeric value already converted into the base unit.
 */
export function parseMcaValueAndUnit(rawStr: unknown): { value: number | null; unit: string | null } {
  if (rawStr == null) return { value: null, unit: null };
  const s = String(rawStr).replace(/,/g, "").trim();
  if (!s) return { value: null, unit: null };
  const numMatch = s.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  let value: number | null = numMatch ? Number(numMatch[0]) : null;
  const lower = s.toLowerCase();

  const UNIT_RULES: [RegExp, string, number][] = [
    [/µh|\bu\s*h\b|micro/i, "mH", 1 / 1000], // microhenry -> mH
    [/mohm/i, "Ohm", 1 / 1000], // milliOhm -> Ohm
    [/kohm/i, "Mohm", 1 / 1000], // kiloOhm -> Mohm
    [/gohm/i, "Mohm", 1000], // gigaOhm -> Mohm
    [/mω|mΩ|megohm/i, "Mohm", 1], // megaOhm -> Mohm
    [/mh\b/i, "mH", 1], // milliHenry -> mH
    [/ohm|ω/i, "Ohm", 1] // Ohm
  ];

  let unit: string | null = null;
  for (const [re, baseUnit, factor] of UNIT_RULES) {
    if (re.test(lower)) {
      unit = baseUnit;
      if (value != null) value = value * factor;
      break;
    }
  }
  return { value, unit };
}

/* ------------------------------------------------------------------ */
/* Vendor-agnostic transcription mapper                              */
/* ------------------------------------------------------------------ */

type McaMetric =
  | "resistance"
  | "inductance"
  | "impedance"
  | "phaseAngle"
  | "fi"
  | "insulation"
  | "imbalanceR"
  | "imbalanceL";

function resolveMcaMetric(h: string): McaMetric | null {
  const n = normalizeHeader(h);
  if (/insulation|megger|\bir\b|irc/.test(n)) return "insulation";
  if (/imbalance/.test(n)) return /inductance|\bl\b/.test(n) ? "imbalanceL" : "imbalanceR";
  if (/phase\s*angle|∠|phaseangle/.test(n)) return "phaseAngle";
  if (/fault\s*index|\bf\s*\/?\s*i\b|\bi\s*\/?\s*f\b|\bfi\b/.test(n)) return "fi";
  if (/impedance|\bz\b|z\s*\(/.test(n)) return "impedance";
  if (/inductance|\bl\b|l\s*\(/.test(n)) return "inductance";
  if (/resistance|\br\b|ohm|ω/.test(n)) return "resistance";
  return null;
}

function resolveMcaPhase(h: string): "ab" | "bc" | "ca" | null {
  const n = normalizeHeader(h);
  if (/1-2|t1-t2|r-s|a-b|u-v|\buv\b|\bab\b/.test(n)) return "ab";
  if (/2-3|t2-t3|s-t|b-c|v-w|\bvw\b|\bbc\b/.test(n)) return "bc";
  if (/3-1|t3-t1|t-r|c-a|w-u|\bwu\b|\bca\b/.test(n)) return "ca";
  return null;
}

function metricCanonicalKey(metric: McaMetric, phase: "ab" | "bc" | "ca" | null): keyof McaTranscriptionResult | null {
  switch (metric) {
    case "resistance":
      return (phase === "ab" ? "resistanceAb" : phase === "bc" ? "resistanceBc" : phase === "ca" ? "resistanceCa" : null);
    case "inductance":
      return (phase === "ab" ? "inductanceAb" : phase === "bc" ? "inductanceBc" : phase === "ca" ? "inductanceCa" : null);
    case "impedance":
      return (phase === "ab" ? "impedanceAb" : phase === "bc" ? "impedanceBc" : phase === "ca" ? "impedanceCa" : null);
    case "phaseAngle":
      return (phase === "ab" ? "phaseAngleAb" : phase === "bc" ? "phaseAngleBc" : phase === "ca" ? "phaseAngleCa" : null);
    case "fi":
      return "fi";
    case "insulation":
      return "insulationResistanceMohm";
    case "imbalanceR":
      return "resistanceImbalancePct";
    case "imbalanceL":
      return "inductanceImbalancePct";
    default:
      return null;
  }
}

export function mapMcaTranscription(rows: unknown): McaTranscriptionResult {
  const result: McaTranscriptionResult = {
    resistanceAb: null,
    resistanceBc: null,
    resistanceCa: null,
    resistanceImbalancePct: null,
    inductanceAb: null,
    inductanceBc: null,
    inductanceCa: null,
    inductanceImbalancePct: null,
    impedanceAb: null,
    impedanceBc: null,
    impedanceCa: null,
    phaseAngleAb: null,
    phaseAngleBc: null,
    phaseAngleCa: null,
    fi: null,
    insulationResistanceMohm: null
  };
  if (!Array.isArray(rows)) return result;

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as McaTranscriptionRow;
    const h = normalizeHeader(row.header ?? null);
    if (!h) continue;
    const metric = resolveMcaMetric(h);
    if (!metric) continue;
    const phase = resolveMcaPhase(h);
    const key = metricCanonicalKey(metric, phase);
    if (!key) continue;

    const combined = [String(row.value ?? ""), row.unit_as_read ?? ""].filter(Boolean).join(" ");
    const { value } = parseMcaValueAndUnit(combined);
    if (value == null) continue;
    // First non-null wins (transcription order = document order)
    if (result[key] == null) result[key] = value;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Per-field consensus (vendor-agnostic; dual-model)                 */
/* ------------------------------------------------------------------ */

const MCA_NUMERIC_KEYS: (keyof McaTranscriptionResult)[] = [
  "resistanceAb",
  "resistanceBc",
  "resistanceCa",
  "resistanceImbalancePct",
  "inductanceAb",
  "inductanceBc",
  "inductanceCa",
  "inductanceImbalancePct",
  "impedanceAb",
  "impedanceBc",
  "impedanceCa",
  "phaseAngleAb",
  "phaseAngleBc",
  "phaseAngleCa",
  "fi",
  "insulationResistanceMohm"
];

function magnitudeClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));
}

export function mergeMcaConsensus(
  a: McaTranscriptionResult,
  b: McaTranscriptionResult
): { result: McaTranscriptionResult; flaggedFields: string[] } {
  const flaggedFields: string[] = [];
  const result: McaTranscriptionResult = { ...emptyMcaTranscription() };

  for (const k of MCA_NUMERIC_KEYS) {
    const av = a[k] as number | null;
    const bv = b[k] as number | null;
    const isPhaseAngle = k.startsWith("phaseAngle");
    if (av != null && bv != null) {
      const ok = isPhaseAngle ? Math.abs(av - bv) <= 2 : magnitudeClose(av, bv);
      if (ok) (result[k] as number | null) = av;
      else flaggedFields.push(k);
    } else if (av != null || bv != null) {
      flaggedFields.push(k);
    }
  }
  return { result, flaggedFields };
}

/** Single-model mode: flag every populated field for operator review. */
export function flagAllMcaFilled(tx: McaTranscriptionResult): string[] {
  const flagged: string[] = [];
  for (const k of MCA_NUMERIC_KEYS) if ((tx[k] as number | null) != null) flagged.push(k);
  return flagged;
}

function emptyMcaTranscription(): McaTranscriptionResult {
  return {
    resistanceAb: null,
    resistanceBc: null,
    resistanceCa: null,
    resistanceImbalancePct: null,
    inductanceAb: null,
    inductanceBc: null,
    inductanceCa: null,
    inductanceImbalancePct: null,
    impedanceAb: null,
    impedanceBc: null,
    impedanceCa: null,
    phaseAngleAb: null,
    phaseAngleBc: null,
    phaseAngleCa: null,
    fi: null,
    insulationResistanceMohm: null
  };
}

/* ------------------------------------------------------------------ */
/* Map master JSON -> McaReportData                                   */
/* ------------------------------------------------------------------ */

function mapVisionJsonToMcaReportData(
  master: Record<string, unknown>,
  fileName?: string | null,
  mergedTx?: McaTranscriptionResult
): McaReportData {
  const data = (master.data ?? {}) as Record<string, unknown>;
  const mca = (data.mca ?? {}) as Record<string, unknown>;

  const result: McaReportData = {
    resistanceAb: null,
    resistanceBc: null,
    resistanceCa: null,
    resistanceImbalancePct: null,
    inductanceAb: null,
    inductanceBc: null,
    inductanceCa: null,
    inductanceImbalancePct: null,
    impedanceAb: null,
    impedanceBc: null,
    impedanceCa: null,
    phaseAngleAb: null,
    phaseAngleBc: null,
    phaseAngleCa: null,
    fi: null,
    insulationResistanceMohm: null,
    confidenceScore: 0,
    sourceFileName: fileName ?? null
  };

  const rawTableRows = master.raw_table;
  const tx = mergedTx ?? mapMcaTranscription(rawTableRows);

  const assign = (key: keyof McaReportData, srcVal: number | null) => {
    if (srcVal != null) (result[key] as number | null) = srcVal;
  };
  assign("resistanceAb", tx.resistanceAb);
  assign("resistanceBc", tx.resistanceBc);
  assign("resistanceCa", tx.resistanceCa);
  assign("resistanceImbalancePct", tx.resistanceImbalancePct);
  assign("inductanceAb", tx.inductanceAb);
  assign("inductanceBc", tx.inductanceBc);
  assign("inductanceCa", tx.inductanceCa);
  assign("inductanceImbalancePct", tx.inductanceImbalancePct);
  assign("impedanceAb", tx.impedanceAb);
  assign("impedanceBc", tx.impedanceBc);
  assign("impedanceCa", tx.impedanceCa);
  assign("phaseAngleAb", tx.phaseAngleAb);
  assign("phaseAngleBc", tx.phaseAngleBc);
  assign("phaseAngleCa", tx.phaseAngleCa);
  assign("fi", tx.fi);
  assign("insulationResistanceMohm", tx.insulationResistanceMohm);

  // Fallback to master canonical fields when transcription absent
  const fieldMap: Record<string, keyof McaReportData> = {
    resistance_ab: "resistanceAb",
    resistance_bc: "resistanceBc",
    resistance_ca: "resistanceCa",
    resistance_imbalance_pct: "resistanceImbalancePct",
    inductance_ab: "inductanceAb",
    inductance_bc: "inductanceBc",
    inductance_ca: "inductanceCa",
    inductance_imbalance_pct: "inductanceImbalancePct",
    impedance_ab: "impedanceAb",
    impedance_bc: "impedanceBc",
    impedance_ca: "impedanceCa",
    phase_angle_ab: "phaseAngleAb",
    phase_angle_bc: "phaseAngleBc",
    phase_angle_ca: "phaseAngleCa",
    fi: "fi",
    insulation_resistance_mohm: "insulationResistanceMohm"
  };
  for (const [srcKey, destKey] of Object.entries(fieldMap)) {
    if ((result[destKey] as number | null) == null) {
      const v = valueFromField(mca[srcKey]);
      if (v != null) (result[destKey] as number | null) = v;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Technology gate (Unicode-safe regex)                              */
/* ------------------------------------------------------------------ */

const POSITIVE_MCA_REGEX =
  /(?:^|\s|\d)(ohm|mohm|mΩ|ω|megohm|MΩ|GΩ|mH|µH|insulation|impedance|inductance|phase angle|fault index|f\/i|i\/f)(?![A-Za-z0-9])/gi;
const NEGATIVE_MCA_REGEX =
  /\b(ppm|viscosity|cst|hz|rpm|mm\/s|in\/s|wear metals|blackstone|flashpoint)\b/gi;

function passesMcaGate(parsed: Record<string, unknown>): {
  pass: boolean;
  positiveCount: number;
  negativeCount: number;
  details: string;
} {
  const parts: string[] = [];
  if (typeof parsed.detected_technology === "string") parts.push(parsed.detected_technology);
  const rawTable = parsed.raw_table;
  if (Array.isArray(rawTable)) {
    for (const row of rawTable) {
      if (!row || typeof row !== "object") continue;
      const r = row as McaTranscriptionRow;
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
  while ((match = POSITIVE_MCA_REGEX.exec(fullText)) !== null) {
    positiveMatches.add(match[0].toLowerCase());
  }
  const positiveCount = positiveMatches.size;

  const negativeMatches = new Set<string>();
  while ((match = NEGATIVE_MCA_REGEX.exec(fullText)) !== null) {
    negativeMatches.add(match[0].toLowerCase());
  }
  const negativeCount = negativeMatches.size;

  const pass = positiveCount >= 2 && !(negativeCount > 0 && positiveCount < 2);
  const details = `positive=${positiveCount}(${[...positiveMatches].join(",")}), negative=${negativeCount}(${[...negativeMatches].join(",")})`;
  return { pass, positiveCount, negativeCount, details };
}

/* ------------------------------------------------------------------ */
/* Finalizer + server entry points                                   */
/* ------------------------------------------------------------------ */

export interface McaVisionExtractResult {
  success: boolean;
  data?: McaReportData;
  model?: string;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
  error?: string;
  message?: string;
  httpStatus?: number;
  detail?: string;
}

export function finalizeMcaFromParses(
  parses: MasterVisionParse[],
  lastError: unknown,
  input: { imageBase64: string; fileName?: string | null; models?: string[]; maxTokens?: number }
): McaVisionExtractResult {
  const startTime = logPipelineStartMca();
  if (parses.length === 0) {
    logPipelineFailMca(lastError || new Error("no content"));
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

  const parsed = primary.parsed as Record<string, unknown>;
  const gateResult = passesMcaGate(parsed);
  if (!gateResult.pass) {
    console.info("[mca] gate decision: REJECT", gateResult.details);
    logPipelineFailMca(new Error(`mca gate REJECT: ${gateResult.details}`));
    return {
      success: false,
      error: "TECHNOLOGY_NOT_MCA",
      message: "Report type not recognized - enter values manually or re-upload.",
      httpStatus: 422,
      detail: gateResult.details
    };
  }
  console.info("[mca] gate decision: PASS", gateResult.details);

  let mergedTx: McaTranscriptionResult | undefined;
  let flaggedFields: string[] = [];
  let extractionMode: "consensus" | "single" = "single";

  if (parses.length >= 2) {
    extractionMode = "consensus";
    const txA = mapMcaTranscription((parses[0].parsed as Record<string, unknown>).raw_table);
    const txB = mapMcaTranscription((parses[1].parsed as Record<string, unknown>).raw_table);
    const merged = mergeMcaConsensus(txA, txB);
    mergedTx = merged.result;
    flaggedFields = merged.flaggedFields;
  } else {
    extractionMode = "single";
    const txA = mapMcaTranscription((primary.parsed as Record<string, unknown>).raw_table);
    flaggedFields = flagAllMcaFilled(txA);
  }

  const data = mapVisionJsonToMcaReportData(primary.parsed, input.fileName, mergedTx);
  (data as unknown as Record<string, unknown>).model = usedModel;
  (data as unknown as Record<string, unknown>).detectedTechnology = "MCA";
  (data as unknown as Record<string, unknown>).flaggedFields = flaggedFields;
  (data as unknown as Record<string, unknown>).extractionMode = extractionMode;
  (data as unknown as Record<string, unknown>).consensusModels = modelIds;
  logPipelineSuccessMca({ model: usedModel, extractionMode });

  return {
    success: true,
    data,
    model: modelIds.join(" + "),
    flaggedFields,
    extractionMode,
    consensusModels: modelIds
  };
}

/** Server-side entry: run models + finalize MCA. */
export async function extractMcaReportFromImageBase64(input: {
  imageBase64: string;
  fileName?: string | null;
  models?: string[];
  maxTokens?: number;
}): Promise<McaVisionExtractResult> {
  const { parses, lastError } = await runMasterVisionModelLoop(input);
  return finalizeMcaFromParses(parses, lastError, input);
}

/** Browser helper — POST image to the unified vision endpoint and return MCA data. */
export async function extractMcaReportFromImage(imageFile: File): Promise<McaReportData> {
  if (
    !imageFile ||
    !(/^image\//i.test(imageFile.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name))
  ) {
    throw new Error("Upload a PNG, JPEG, or WebP MCA analyzer screenshot.");
  }
  const base64Image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read MCA image as base64."));
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
        `MCA vision extraction failed (${response.status}).`
    );
  }
  // The unified endpoint may fall through to another technology's finalizer.
  // From the MCA tab we only accept an MCA result.
  const technology = typeof result.technology === "string" ? result.technology : null;
  if (technology && technology !== "MCA") {
    throw new Error("Report type not recognized - enter values manually or re-upload.");
  }
  const data = result.data as McaReportData | undefined;
  if (!data || typeof data !== "object") {
    throw new Error("MCA vision extraction returned no data.");
  }
  return data;
}

/* Local logging shims. */
function logPipelineStartMca(): number {
  return Date.now();
}
function logPipelineFailMca(err: unknown): void {
  console.warn("[mcaVisionExtractor] fail", err);
}
function logPipelineSuccessMca(extra?: Record<string, unknown>): void {
  if (extra) console.info(`[mcaVisionExtractor] success`, extra);
}
