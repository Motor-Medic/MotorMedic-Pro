/**
 * Thermography Vision Extractor — transcription-first master-vision pipeline.
 *
 * Mirrors src/lib/mcaVisionExtractor.ts but finalizes into a ThermographyReportData
 * using the thermography-specific dictionary (emissivity, spot/area temps, delta T, etc).
 * The shared model loop (runMasterVisionModelLoop) lives in oilVisionExtractor.ts so the
 * model is called once.
 *
 * Technology gate: thermography fields are auto-filled ONLY when the thermography gate
 * passes (>= 2 distinct positive thermography markers and no ambiguous negative markers).
 */

import {
  runMasterVisionModelLoop,
  type MasterVisionParse,
  OIL_VISION_API_PATH
} from "./oilVisionExtractor";

export interface ThermographyReportData {
  maxTempC: number | null;
  referenceTempC: number | null;
  deltaTK: number | null;
  avgTempC: number | null;
  emissivity: number | null;
  ambientTempC: number | null;
  relativeHumidityPct: number | null;
  severityClass: string | null;
  confidenceScore: number;
  sourceFileName?: string | null;
  model?: string;
  detectedTechnology?: string | null;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
}

interface ThermographyTranscriptionRow {
  header?: string | null;
  value?: number | string | null;
  unit_as_read?: string | null;
  operator?: string | null;
}

export interface ThermographyTranscriptionResult {
  maxTempC: number | null;
  referenceTempC: number | null;
  deltaTK: number | null;
  avgTempC: number | null;
  emissivity: number | null;
  ambientTempC: number | null;
  relativeHumidityPct: number | null;
  severityClass: string | null;
  /** Labels of fields filled by overlay heuristics / unit-fallback — drives amber verify chips. */
  flagged?: string[];
}

/** UI chip labels — MUST match ThermographyInputAccordions exactly. */
const THERMO_FIELD_LABELS: Record<string, string> = {
  maxTempC: "Max Temp (°C)",
  referenceTempC: "Reference (°C)",
  deltaTK: "ΔT (K)",
  avgTempC: "Avg Temp (°C)",
  emissivity: "Emissivity",
  ambientTempC: "Ambient (°C)",
  relativeHumidityPct: "Humidity (%)",
  severityClass: "Severity"
};

function pushThermoFlag(flagged: string[], label: string) {
  if (!flagged.includes(label)) flagged.push(label);
}

/* ------------------------------------------------------------------ */
/* Number / unit / header helpers                                     */
/* ------------------------------------------------------------------ */

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null|—|-/i.test(trimmed)) return null;
    // Normalize Unicode minus (U+2212) to ASCII "-" so signed values parse with sign preserved.
    const ascii = trimmed.replace(/−/g, "-");
    const m = ascii.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
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

/* ------------------------------------------------------------------ */
/* Thermography transcription mapper                                 */
/* ------------------------------------------------------------------ */

type ThermographyMetric =
  | "max_temp_c"
  | "reference_temp_c"
  | "delta_t_k"
  | "avg_temp_c"
  | "emissivity"
  | "ambient_temp_c"
  | "relative_humidity_pct"
  | "severity_class";

function resolveThermographyMetric(h: string): ThermographyMetric | null {
  const n = normalizeHeader(h);
  if (/^(max|tmax|hottest|spot max|area max|max temp|hot spot)$/.test(n)) return "max_temp_c";
  if (/^(ref|reference|tref|ref temp|cool spot)$/.test(n)) return "reference_temp_c";
  if (/^(dt|delta t|Δt|temp rise|rise|difference|deltat)$/.test(n)) return "delta_t_k";
  if (/^(avg|average|area avg|mean)$/.test(n)) return "avg_temp_c";
  if (/^(emissivity|e-value|epsilon)$/.test(n)) return "emissivity";
  if (/^(ambient|ta|room temp)$/.test(n)) return "ambient_temp_c";
  if (/^(humidity|rh|rel humidity)$/.test(n)) return "relative_humidity_pct";
  if (/^(severity|class|rating|neta|iso 18436|priority)$/.test(n)) return "severity_class";
  return null;
}

function metricCanonicalKey(metric: ThermographyMetric): keyof ThermographyTranscriptionResult | null {
  switch (metric) {
    case "max_temp_c":
      return "maxTempC";
    case "reference_temp_c":
      return "referenceTempC";
    case "delta_t_k":
      return "deltaTK";
    case "avg_temp_c":
      return "avgTempC";
    case "emissivity":
      return "emissivity";
    case "ambient_temp_c":
      return "ambientTempC";
    case "relative_humidity_pct":
      return "relativeHumidityPct";
    case "severity_class":
      return "severityClass";
    default:
      return null;
  }
}

/** Resolve a temperature value, converting °F/K to °C as needed, preserving sign. */
function resolveTemperatureValue(rawStr: unknown): number | null {
  if (rawStr == null) return null;
  const s = String(rawStr).replace(/−/g, "-").replace(/,/g, "").trim();
  if (!s) return null;
  const numMatch = s.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  let value: number | null = numMatch ? Number(numMatch[0]) : null;
  if (value == null) return null;
  const lower = s.toLowerCase();
  if (/°f|\bf\b|fahr/.test(lower)) {
    value = ((value - 32) * 5) / 9;
  } else if (/°k|\bk\b|kelvin/.test(lower)) {
    value = value - 273.15;
  }
  // °C (default) kept as-is.
  return value;
}

export function mapThermographyTranscription(rows: unknown): ThermographyTranscriptionResult {
  const result: ThermographyTranscriptionResult = {
    maxTempC: null,
    referenceTempC: null,
    deltaTK: null,
    avgTempC: null,
    emissivity: null,
    ambientTempC: null,
    relativeHumidityPct: null,
    severityClass: null,
    flagged: []
  };
  if (!Array.isArray(rows)) return result;

  const flagged: string[] = [];

  // Global scan: is an explicit °C/°F present anywhere in the transcribed text?
  let hasExplicitTempUnit = false;
  const fullScan = (rows as unknown[])
    .filter((r): r is ThermographyTranscriptionRow => !!r && typeof r === "object")
    .map((r) => [r.header, r.value, r.unit_as_read].filter(Boolean).map(String).join(" "))
    .join(" ");
  if (/°c|°f/i.test(fullScan)) hasExplicitTempUnit = true;

  for (const raw of rows as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as ThermographyTranscriptionRow;
    const h = normalizeHeader(row.header ?? null);
    const metric = h ? resolveThermographyMetric(h) : null;

    // --- Labeled synonym: trusted fill (no verify chip unless unit was assumed) ---
    if (metric) {
      if (metric === "severity_class") {
        const sv = row.value != null ? String(row.value).trim() : null;
        if (sv && result.severityClass == null) result.severityClass = sv;
        continue;
      }
      const key = metricCanonicalKey(metric)!;
      const label = THERMO_FIELD_LABELS[key];
      const combined = [String(row.value ?? ""), row.unit_as_read ?? ""].filter(Boolean).join(" ");

      let value: number | null;
      if (metric === "delta_t_k") value = finiteNum(combined);
      else if (metric === "emissivity" || metric === "relative_humidity_pct") value = finiteNum(combined);
      else value = resolveTemperatureValue(combined);
      if (value == null) continue;

      if (metric === "emissivity" && (value < 0.1 || value > 1.0)) {
        // Suspicious emissivity range — keep but force verify
        if (result.emissivity == null) result.emissivity = value;
        pushThermoFlag(flagged, label);
        continue;
      }

      if (result[key] == null) (result[key] as number | null) = value;
      // Safety: no explicit unit anywhere -> °C assumption is risky -> force verify
      if (
        !hasExplicitTempUnit &&
        key !== "emissivity" &&
        key !== "relativeHumidityPct" &&
        key !== "severityClass"
      ) {
        pushThermoFlag(flagged, label);
      }
      continue;
    }

    if (!h) {
      // Empty header: only a bare "%" value can be safely read (as relative humidity).
      const valStr = String(row.value ?? "").trim();
      const unit = String(row.unit_as_read ?? "").trim().toLowerCase();
      const combined = [valStr, unit].filter(Boolean).join(" ");
      const num = finiteNum(combined);
      if (num != null && (/%/.test(combined) || unit === "%")) {
        if (num >= 0 && num <= 100 && result.relativeHumidityPct == null) {
          result.relativeHumidityPct = num;
          pushThermoFlag(flagged, THERMO_FIELD_LABELS.relativeHumidityPct);
        }
        // Outside 0-100 -> drop it (never inject an impossible humidity).
      }
      continue; // no other heuristic applies without text context
    }

    // --- Overlay heuristics (only after labeled synonyms fail) ---
    const valStr = String(row.value ?? "").trim();
    const unit = String(row.unit_as_read ?? "").trim().toLowerCase();
    const combined = [valStr, unit].filter(Boolean).join(" ");
    const num = finiteNum(combined);
    const text = `${h} ${combined}`;

    // 1) Bare "%" value with no other label -> relative humidity (bounds guardrail 0-100)
    if (num != null && (/%/.test(combined) || unit === "%")) {
      if (num >= 0 && num <= 100 && result.relativeHumidityPct == null) {
        result.relativeHumidityPct = num;
        pushThermoFlag(flagged, THERMO_FIELD_LABELS.relativeHumidityPct);
      }
      // Outside 0-100 -> drop it (never inject an impossible humidity)
      continue;
    }

    if (num == null) continue;

    // 2) Warning / triangle / hot-spot marker -> max_temp_c (assume °C unless °F shown)
    if (/warning|alert|△|▲|!|flame|hot|peak|max|marker/i.test(text)) {
      if (result.maxTempC == null) {
        result.maxTempC = resolveTemperatureValue(combined);
        pushThermoFlag(flagged, THERMO_FIELD_LABELS.maxTempC);
      }
      continue;
    }

    // 3) Color-scale min / cold endpoint -> reference_temp_c (flagged)
    if (/min|scale|color|cold/i.test(text)) {
      if (result.referenceTempC == null) {
        result.referenceTempC = resolveTemperatureValue(combined);
        pushThermoFlag(flagged, THERMO_FIELD_LABELS.referenceTempC);
      }
      continue;
    }
  }

  result.flagged = flagged;
  return result;
}

/* ------------------------------------------------------------------ */
/* Per-field consensus (dual-model)                                   */
/* ------------------------------------------------------------------ */

const THERMO_NUMERIC_KEYS: (keyof ThermographyTranscriptionResult)[] = [
  "maxTempC",
  "referenceTempC",
  "deltaTK",
  "avgTempC",
  "emissivity",
  "ambientTempC",
  "relativeHumidityPct"
];

export function mergeThermographyConsensus(
  a: ThermographyTranscriptionResult,
  b: ThermographyTranscriptionResult
): { result: ThermographyTranscriptionResult; flaggedFields: string[] } {
  const flaggedFields: string[] = [];
  const result: ThermographyTranscriptionResult = { ...emptyThermographyTranscription() };

  const TOLERANCE: Partial<Record<keyof ThermographyTranscriptionResult, number>> = {
    maxTempC: 2,
    referenceTempC: 2,
    avgTempC: 2,
    ambientTempC: 2,
    emissivity: 0.05,
    relativeHumidityPct: 5,
    deltaTK: 2
  };

  for (const k of THERMO_NUMERIC_KEYS) {
    const av = a[k] as number | null;
    const bv = b[k] as number | null;
    if (av != null && bv != null) {
      const tol = TOLERANCE[k] ?? 0;
      if (Math.abs(av - bv) <= tol) (result[k] as number | null) = av;
      else flaggedFields.push(THERMO_FIELD_LABELS[k]);
    } else if (av != null || bv != null) {
      flaggedFields.push(THERMO_FIELD_LABELS[k]);
    }
  }

  const aSev = a.severityClass;
  const bSev = b.severityClass;
  if (aSev != null && bSev != null) {
    result.severityClass = aSev;
    if (aSev !== bSev) flaggedFields.push(THERMO_FIELD_LABELS.severityClass);
  } else if (aSev != null || bSev != null) {
    result.severityClass = aSev ?? bSev;
    flaggedFields.push(THERMO_FIELD_LABELS.severityClass);
  }

  // Persist heuristic/overlay verify flags from each model
  for (const f of a.flagged ?? []) if (!flaggedFields.includes(f)) flaggedFields.push(f);
  for (const f of b.flagged ?? []) if (!flaggedFields.includes(f)) flaggedFields.push(f);

  return { result, flaggedFields };
}

/** Single-model mode: prefer heuristic/overlay flags; fall back to flagging every populated field. */
export function flagAllThermographyFilled(tx: ThermographyTranscriptionResult): string[] {
  if (tx.flagged && tx.flagged.length) return tx.flagged;
  const flagged: string[] = [];
  for (const k of THERMO_NUMERIC_KEYS) {
    if ((tx[k] as number | null) != null) flagged.push(THERMO_FIELD_LABELS[k]);
  }
  if (tx.severityClass != null) flagged.push(THERMO_FIELD_LABELS.severityClass);
  return flagged;
}

function emptyThermographyTranscription(): ThermographyTranscriptionResult {
  return {
    maxTempC: null,
    referenceTempC: null,
    deltaTK: null,
    avgTempC: null,
    emissivity: null,
    ambientTempC: null,
    relativeHumidityPct: null,
    severityClass: null
  };
}

/* ------------------------------------------------------------------ */
/* Map master JSON -> ThermographyReportData                          */
/* ------------------------------------------------------------------ */

function mapVisionJsonToThermographyReportData(
  master: Record<string, unknown>,
  fileName?: string | null,
  mergedTx?: ThermographyTranscriptionResult
): ThermographyReportData {
  const data = (master.data ?? {}) as Record<string, unknown>;
  const thermo = (data.thermography ?? data.thermo ?? {}) as Record<string, unknown>;

  const result: ThermographyReportData = {
    maxTempC: null,
    referenceTempC: null,
    deltaTK: null,
    avgTempC: null,
    emissivity: null,
    ambientTempC: null,
    relativeHumidityPct: null,
    severityClass: null,
    confidenceScore: 0,
    sourceFileName: fileName ?? null
  };

  const rawTableRows = master.raw_table;
  const tx = mergedTx ?? mapThermographyTranscription(rawTableRows);

  const assign = (key: keyof ThermographyReportData, srcVal: number | null) => {
    if (srcVal != null) (result[key] as number | null) = srcVal;
  };
  assign("maxTempC", tx.maxTempC);
  assign("referenceTempC", tx.referenceTempC);
  assign("deltaTK", tx.deltaTK);
  assign("avgTempC", tx.avgTempC);
  assign("emissivity", tx.emissivity);
  assign("ambientTempC", tx.ambientTempC);
  assign("relativeHumidityPct", tx.relativeHumidityPct);
  if (tx.severityClass != null) result.severityClass = tx.severityClass;

  // Fallback to master canonical fields when transcription absent
  const fieldMap: Record<string, keyof ThermographyReportData> = {
    max_temp_c: "maxTempC",
    reference_temp_c: "referenceTempC",
    delta_t_k: "deltaTK",
    avg_temp_c: "avgTempC",
    emissivity: "emissivity",
    ambient_temp_c: "ambientTempC",
    relative_humidity_pct: "relativeHumidityPct",
    severity_class: "severityClass"
  };
  for (const [srcKey, destKey] of Object.entries(fieldMap)) {
    if (destKey === "severityClass") {
      if (result.severityClass == null) {
        const v = thermo[srcKey];
        if (typeof v === "string" && v.trim()) result.severityClass = v.trim();
      }
    } else if ((result[destKey] as number | null) == null) {
      const v = valueFromField(thermo[srcKey]);
      if (v != null) (result[destKey] as number | null) = v;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Technology gate (Unicode-safe regex — MUST carry `gi` flags)       */
/* ------------------------------------------------------------------ */

const POSITIVE_THERMO_REGEX =
  /(emissivity|°C|°F|delta ?t|thermal|infrared|ir ?image|spot ?\d|flir|thermogra|hot ?spot)(?![A-Za-z0-9])/gi;
const NEGATIVE_THERMO_REGEX =
  /\b(ppm|viscosity|cst|hz|rpm|mm\/s|in\/s|wear metals|blackstone|flashpoint|ohm|mΩ|inductance|phase angle)\b/gi;
const BRAND_THERMO_REGEX =
  /(flir|testo|opgal|fluke thermal|ir camera)(?![A-Za-z0-9])/gi;

function passesThermographyGate(parsed: Record<string, unknown>): {
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
      const r = row as ThermographyTranscriptionRow;
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
  while ((match = POSITIVE_THERMO_REGEX.exec(fullText)) !== null) {
    positiveMatches.add(match[0].toLowerCase());
  }
  const positiveCount = positiveMatches.size;

  const negativeMatches = new Set<string>();
  while ((match = NEGATIVE_THERMO_REGEX.exec(fullText)) !== null) {
    negativeMatches.add(match[0].toLowerCase());
  }
  const negativeCount = negativeMatches.size;

  const brandMatches = new Set<string>();
  while ((match = BRAND_THERMO_REGEX.exec(fullText)) !== null) {
    brandMatches.add(match[0].toLowerCase());
  }
  const brandCount = brandMatches.size;

  // A strong brand marker alone satisfies the positive requirement (oil/vibration/
  // MCA reports never contain these words). Otherwise keep the 2+ distinct positives rule.
  const pass =
    brandCount >= 1 ||
    (positiveCount >= 2 && !(negativeCount > 0 && positiveCount < 2));
  const details = `positive=${positiveCount}(${[...positiveMatches].join(",")}), negative=${negativeCount}(${[...negativeMatches].join(",")}), brand=${brandCount}(${[...brandMatches].join(",")})`;
  return { pass, positiveCount, negativeCount, details };
}

/* ------------------------------------------------------------------ */
/* Finalizer + server entry points                                   */
/* ------------------------------------------------------------------ */

export interface ThermographyVisionExtractResult {
  success: boolean;
  data?: ThermographyReportData;
  model?: string;
  flaggedFields?: string[];
  extractionMode?: "consensus" | "single";
  consensusModels?: string[];
  error?: string;
  message?: string;
  httpStatus?: number;
  detail?: string;
}

export function finalizeThermographyFromParses(
  parses: MasterVisionParse[],
  lastError: unknown,
  input: { imageBase64: string; fileName?: string | null; models?: string[]; maxTokens?: number }
): ThermographyVisionExtractResult {
  const startTime = logPipelineStartThermo();
  if (parses.length === 0) {
    logPipelineFailThermo(lastError || new Error("no content"));
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
  const gateResult = passesThermographyGate(parsed);
  if (!gateResult.pass) {
    console.info("[thermo] gate decision: REJECT", gateResult.details);
    logPipelineFailThermo(new Error(`thermo gate REJECT: ${gateResult.details}`));
    return {
      success: false,
      error: "TECHNOLOGY_NOT_THERMOGRAPHY",
      message: "Report type not recognized - enter values manually or re-upload.",
      httpStatus: 422,
      detail: gateResult.details
    };
  }
  console.info("[thermo] gate decision: PASS", gateResult.details);

  let mergedTx: ThermographyTranscriptionResult | undefined;
  let flaggedFields: string[] = [];
  let extractionMode: "consensus" | "single" = "single";

  if (parses.length >= 2) {
    extractionMode = "consensus";
    const txA = mapThermographyTranscription((parses[0].parsed as Record<string, unknown>).raw_table);
    const txB = mapThermographyTranscription((parses[1].parsed as Record<string, unknown>).raw_table);
    const merged = mergeThermographyConsensus(txA, txB);
    mergedTx = merged.result;
    flaggedFields = merged.flaggedFields;
  } else {
    extractionMode = "single";
    const txA = mapThermographyTranscription((primary.parsed as Record<string, unknown>).raw_table);
    flaggedFields = flagAllThermographyFilled(txA);
  }

  const data = mapVisionJsonToThermographyReportData(primary.parsed, input.fileName, mergedTx);
  (data as unknown as Record<string, unknown>).model = usedModel;
  (data as unknown as Record<string, unknown>).detectedTechnology = "THERMOGRAPHY";
  (data as unknown as Record<string, unknown>).flaggedFields = flaggedFields;
  (data as unknown as Record<string, unknown>).extractionMode = extractionMode;
  (data as unknown as Record<string, unknown>).consensusModels = modelIds;
  logPipelineSuccessThermo({ model: usedModel, extractionMode });

  return {
    success: true,
    data,
    model: modelIds.join(" + "),
    flaggedFields,
    extractionMode,
    consensusModels: modelIds
  };
}

/** Server-side entry: run models + finalize thermography. */
export async function extractThermographyReportFromImageBase64(input: {
  imageBase64: string;
  fileName?: string | null;
  models?: string[];
  maxTokens?: number;
}): Promise<ThermographyVisionExtractResult> {
  const { parses, lastError } = await runMasterVisionModelLoop(input);
  return finalizeThermographyFromParses(parses, lastError, input);
}

/** Browser helper — POST image to the unified vision endpoint and return thermography data. */
export async function extractThermographyReportFromImage(imageFile: File): Promise<ThermographyReportData> {
  if (
    !imageFile ||
    !(/^image\//i.test(imageFile.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name))
  ) {
    throw new Error("Upload a PNG, JPEG, or WebP thermography image.");
  }
  const base64Image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read thermography image as base64."));
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
        `Thermography vision extraction failed (${response.status}).`
    );
  }
  // The unified endpoint may fall through to another technology's finalizer.
  // From the thermography tab we only accept a thermography result.
  const technology = typeof result.technology === "string" ? result.technology : null;
  if (technology && technology !== "THERMOGRAPHY") {
    throw new Error("Report type not recognized - enter values manually or re-upload.");
  }
  const data = result.data as ThermographyReportData | undefined;
  if (!data || typeof data !== "object") {
    throw new Error("Thermography vision extraction returned no data.");
  }
  return data;
}

/* Local logging shims. */
function logPipelineStartThermo(): number {
  return Date.now();
}
function logPipelineFailThermo(err: unknown): void {
  console.warn("[thermographyVisionExtractor] fail", err);
}
function logPipelineSuccessThermo(extra?: Record<string, unknown>): void {
  if (extra) console.info(`[thermographyVisionExtractor] success`, extra);
}
