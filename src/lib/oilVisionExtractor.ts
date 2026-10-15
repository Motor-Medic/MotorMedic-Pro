/**
 * Oil lab report screenshot / PDF page → structured OilReportData via OpenRouter vision.
 * Transcription-first mapping: model returns raw_table, code maps deterministically via synonym dictionary.
 * Technology gate: only auto-fill when detected_technology === "OIL".
 */

import {
  OPENROUTER_API_BASE,
  OPENROUTER_CONSENSUS_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_VISION_MODEL,
  isLmStudioDevMode,
  openRouterRefererHeaders
} from "./openRouterModels";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess
} from "./pipelineTrace";
import type {
  OilReportData,
  OilReportFluidProperties,
  OilReportHeader,
  OilReportMetals,
  OilReportOperatingParams
} from "../types/oilVision";
import {
  MASTER_VISION_PROMPT,
  type MasterField,
  type MasterOilSchema,
  type MasterVisionResponse
} from "./vision/masterVisionPrompt";

export const OIL_VISION_API_PATH = "/api/oil-analysis/vision-extract";

/** Primary vision model (kept for reference); the live fallback array below leads with gpt-4o. */
export const VISION_MODEL = "google/gemini-3.1-pro-preview";

/** OpenRouter candidate list (chain entry #5). Stale google/gemini-2.0-flash-001 retired (404). */
export const OIL_VISION_MODELS = [
  "openai/gpt-4o",
  "google/gemini-3.1-pro-preview",
  "openai/gpt-4-turbo",
  "qwen/qwen-2.5-vl-72b-instruct"
] as const;

/* ------------------------------------------------------------------ */
/* Vision provider chain (AR-23c) — probe-verified 2026-10-09.         */
/* Every model id below answered HTTP 200 with the exact production    */
/* payload shape (image + MASTER_VISION_PROMPT + json mode) before      */
/* landing here. Sequential, key-gated: entries whose env key is       */
/* absent are skipped cleanly and never crashed on.                    */
/* Probe outcomes that EXCLUDED entries:                               */
/*  - gemini-3.8-flash: never 200 (repeated timeout / 503)             */
/*  - gemini-2.5-flash, gemini-2.0-flash: 404 (retired)                */
/*  - DashScope qwen3-vl-plus/qwen-vl-max: 401 on all four host        */
/*    variants → key cannot be certified → entry withheld              */
/* ------------------------------------------------------------------ */

export interface VisionProviderSpec {
  id: string;
  label: string;
  envKey: string;
  transport: "gemini" | "openai-compatible" | "lm-studio";
  /** Base URL — gemini entries append `/${model}:generateContent`. */
  url: string;
  models: readonly string[];
}

export const VISION_PROVIDER_CHAIN: readonly VisionProviderSpec[] = [
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    transport: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    models: ["gemini-3.5-flash"]
  },
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    transport: "openai-compatible",
    url: "https://api.groq.com/openai/v1/chat/completions",
    models: ["qwen/qwen3.8-27b"]
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    transport: "openai-compatible",
    url: "https://api.mistral.ai/v1/chat/completions",
    models: ["pixtral-12b-2409"]
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    transport: "openai-compatible",
    url: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    transport: "openai-compatible",
    url: `${OPENROUTER_API_BASE}/chat/completions`,
    models: OIL_VISION_MODELS
  }
];

interface VisionCandidate {
  spec: VisionProviderSpec;
  model: string;
}

interface VisionSkip {
  label: string;
  providerId: string;
  envKey: string;
}

interface VisionAttemptRecord {
  providerLabel: string;
  providerId: string;
  model: string;
  httpStatus: number | null;
  reason: string;
}

function visionKeyPresent(envKey: string): boolean {
  const v = process.env[envKey];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Builds the ordered candidate list for one extraction run. LM Studio
 * dev-mode short-circuits to the local endpoint (unchanged). Otherwise
 * every chain entry whose env key is present contributes its models in
 * chain order; absent keys are reported as skips, never thrown on.
 * `models` (caller-supplied) overrides the OpenRouter entry's list,
 * preserving the historical input.models contract.
 */
function buildVisionCandidates(
  useLmStudio: boolean,
  models?: string[]
): { candidates: VisionCandidate[]; skipped: VisionSkip[] } {
  const candidates: VisionCandidate[] = [];
  const skipped: VisionSkip[] = [];
  if (useLmStudio) {
    const endpoint = process.env.LM_STUDIO_ENDPOINT;
    if (endpoint && endpoint.trim()) {
      const spec: VisionProviderSpec = {
        id: "lm-studio",
        label: "LM Studio",
        envKey: "LM_STUDIO_ENDPOINT",
        transport: "lm-studio",
        url: endpoint.trim(),
        models: [process.env.LM_STUDIO_MODEL || OIL_VISION_MODELS[0]]
      };
      const model = spec.models[0];
      if (model) candidates.push({ spec, model });
    } else {
      skipped.push({ label: "LM Studio", providerId: "lm-studio", envKey: "LM_STUDIO_ENDPOINT" });
    }
    return { candidates, skipped };
  }
  const override =
    models && models.length > 0 ? Array.from(new Set(models)) : null;
  for (const spec of VISION_PROVIDER_CHAIN) {
    if (!visionKeyPresent(spec.envKey)) {
      skipped.push({ label: spec.label, providerId: spec.id, envKey: spec.envKey });
      continue;
    }
    const list = override && spec.id === "openrouter" ? override : spec.models;
    for (const model of list) candidates.push({ spec, model });
  }
  return { candidates, skipped };
}

function describeAttempt(a: VisionAttemptRecord): string {
  const via = `(${a.model} via ${a.providerLabel})`;
  if (a.httpStatus == null) return `vision: no response ${via} - ${a.reason}`;
  return `vision: ${a.httpStatus} ${a.reason} ${via}`;
}

function describeSkip(s: VisionSkip): string {
  return `vision: skipped - ${s.envKey} missing (${s.providerId} via ${s.label})`;
}

/** Per-provider failure list — the client toast renders this verbatim; never a bare VISION_FAILED. */
function buildVisionFailureMessage(
  attempts: VisionAttemptRecord[],
  skipped: VisionSkip[]
): string {
  const parts = [...attempts.map(describeAttempt), ...skipped.map(describeSkip)];
  if (parts.length === 0) return "No vision provider configured.";
  return parts.join("; ");
}

function clipReason(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 117)}...` : t;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseBodyJson(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  return isRecord(parsed) ? parsed : {};
}

/** Human-readable upstream reason from an error body (OpenAI-shaped or Gemini-shaped). */
function upstreamReason(body: string, status: number): string {
  try {
    const json = parseBodyJson(body);
    const err: unknown = json.error;
    if (typeof err === "string" && err.trim()) return clipReason(err);
    if (isRecord(err) && typeof err.message === "string" && err.message.trim()) {
      return clipReason(err.message);
    }
    if (typeof json.message === "string" && json.message.trim()) {
      return clipReason(json.message);
    }
  } catch {
    /* body is not JSON */
  }
  return `HTTP ${status}`;
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (match && match[1] && match[2] !== undefined) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/png", data: dataUrl.replace(/^data:[^,]*,/, "") };
}

function readOpenAiContent(json: Record<string, unknown>): string | null {
  const choices = json.choices;
  if (Array.isArray(choices)) {
    const first: unknown = choices[0];
    if (isRecord(first) && isRecord(first.message)) {
      const content: unknown = first.message.content;
      if (typeof content === "string" && content) return content;
    }
  }
  if (typeof json.content === "string" && json.content) return json.content;
  return null;
}

function readGeminiText(json: Record<string, unknown>): string | null {
  const candidates = json.candidates;
  if (!Array.isArray(candidates)) return null;
  const first: unknown = candidates[0];
  if (!isRecord(first) || !isRecord(first.content)) return null;
  const parts = first.content.parts;
  if (!Array.isArray(parts)) return null;
  const texts: string[] = [];
  for (const part of parts) {
    if (isRecord(part) && typeof part.text === "string") texts.push(part.text);
  }
  const joined = texts.join("");
  return joined || null;
}

/** Non-2xx upstream response carrying its HTTP status + upstream reason. */
class VisionHttpError extends Error {
  readonly httpStatus: number;
  readonly reason: string;
  constructor(httpStatus: number, reason: string) {
    super(`${reason} (HTTP ${httpStatus})`);
    this.name = "VisionHttpError";
    this.httpStatus = httpStatus;
    this.reason = reason;
  }
}

/**
 * Fires one provider attempt. Payload content is identical to the legacy
 * OpenRouter call (same image data URL, same MASTER_VISION_PROMPT,
 * max_tokens 6000, temperature 0.0, json mode) — only the wire envelope
 * differs per transport.
 */
async function callVisionProvider(
  candidate: VisionCandidate,
  imageUrl: string,
  maxTokens: number
): Promise<{ status: number; body: string }> {
  const { spec, model } = candidate;
  if (spec.transport === "gemini") {
    const { mimeType, data } = splitDataUrl(imageUrl);
    const res = await fetch(`${spec.url}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": (process.env[spec.envKey] || "").trim()
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data } },
              { text: MASTER_VISION_PROMPT }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.0,
          responseMimeType: "application/json"
        }
      })
    });
    return { status: res.status, body: await res.text().catch(() => "") };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (spec.transport === "openai-compatible") {
    headers.Authorization = `Bearer ${(process.env[spec.envKey] || "").trim()}`;
    if (spec.id === "openrouter") Object.assign(headers, openRouterRefererHeaders());
  }
  const res = await fetch(spec.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.0,
      ...(spec.transport === "lm-studio" ? {} : { response_format: { type: "json_object" } }),
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: MASTER_VISION_PROMPT }
          ]
        }
      ]
    })
  });
  return { status: res.status, body: await res.text().catch(() => "") };
}

const EXTRACTION_TIMEOUT_MS = 180_000;

/** Named constants for sump capacity conversion — 4 qt = 1 gal */
export const QT_PER_GALLON = 4;
export const LITERS_PER_GALLON = 3.78541;
export const OIL_COST_PER_GAL = 30; // used in financial footnote downstream

// --- Master Vision helpers (strict) ---
function parseMasterJsonStrict(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("Vision model must return raw JSON starting with { and ending with } — no markdown fences");
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

// Strip code fences and isolate the outermost JSON object so prose or commentary
// surrounding the JSON does not break strict parsing.
function salvageJsonString(raw: string): string {
  let cleaned = (raw || "").trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function masterFieldValue(field: unknown): number | null {
  if (!field || typeof field !== "object") return null;
  const f = field as Record<string, unknown>;
  const status = String(f.status || "").toLowerCase();
  if (status === "illegible" || status === "absent") return null;
  const conf = typeof f.confidence === "number" ? f.confidence : Number(f.confidence);
  if (Number.isFinite(conf) && conf < 0.8) return null;
  const v = f.value;
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function masterFieldString(field: unknown): string | null {
  if (!field || typeof field !== "object") return null;
  const f = field as Record<string, unknown>;
  const status = String(f.status || "").toLowerCase();
  if (status === "illegible" || status === "absent") return null;
  const conf = typeof f.confidence === "number" ? f.confidence : Number(f.confidence);
  if (Number.isFinite(conf) && conf < 0.8) return null;
  const v = f.value;
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s || null;
}
function masterFieldOperator(field: unknown): string | null {
  if (!field || typeof field !== "object") return null;
  const f = field as Record<string, unknown>;
  return f.operator != null ? String(f.operator) : null;
}

/* ========================================================================== */
/* Transcription-first oil mapping                                             */
/* The vision model returns a raw_table of { header, value, unit_as_read,      */
/* operator }. The model transcribes verbatim; this code maps normalized       */
/* header text -> canonical field via a strict synonym dictionary. The model's */
/* own data.oil key mapping is bypassed for oil — raw_table is the single     */
/* source of truth.                                                           */
/* ========================================================================== */

export interface OilTranscriptionRow {
  header: string | null;
  value: number | null;
  unit_as_read: string | null;
  operator: string | null;
}

export interface OilTranscriptionResult {
  metals: {
    iron: number | null;
    copper: number | null;
    aluminum: number | null;
    silicon: number | null;
    sodium: number | null;
    potassium: number | null;
    zinc: number | null;
    phosphorus: number | null;
    calcium: number | null;
    magnesium: number | null;
    boron: number | null;
    molybdenum: number | null;
    chromium: number | null;
    lead: number | null;
    nickel: number | null;
    tin: number | null;
  };
  fluid: {
    viscosity40C: number | null;
    viscosity100C: number | null;
    acidNumber: number | null; // TAN
    baseNumber: number | null; // BN
    oxidation: number | null; // Abs/cm
    nitration: number | null; // Abs/cm
    particleCountIso4406: string | null;
  };
  operatingHours: number | null;
  lubeTimeHours: number | null; // time on oil / fluid age
  unitTimeHours: number | null; // unit / equipment hours
  sumpCapacityGallons: number | null;
  extra: Record<string, number | null>;
}

function normalizeHeader(raw: string | null): string {
  if (!raw) return "";
  return String(raw)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop parentheticals e.g. "Iron (Fe)"
    .replace(/[^a-z0-9%/.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const METAL_CANON: Record<string, keyof OilTranscriptionResult["metals"]> = {
  iron: "iron",
  fe: "iron",
  copper: "copper",
  cu: "copper",
  aluminum: "aluminum",
  aluminium: "aluminum",
  al: "aluminum",
  silicon: "silicon",
  si: "silicon",
  sodium: "sodium",
  na: "sodium",
  potassium: "potassium",
  k: "potassium",
  zinc: "zinc",
  zn: "zinc",
  phosphorus: "phosphorus",
  phos: "phosphorus",
  p: "phosphorus",
  calcium: "calcium",
  ca: "calcium",
  magnesium: "magnesium",
  mg: "magnesium",
  boron: "boron",
  b: "boron",
  molybdenum: "molybdenum",
  mo: "molybdenum"
};

function resolveMetal(h: string): keyof OilTranscriptionResult["metals"] | null {
  if (METAL_CANON[h]) return METAL_CANON[h];
  for (const token of [
    "fe",
    "cu",
    "al",
    "si",
    "na",
    "k",
    "zn",
    "p",
    "ca",
    "mg",
    "b",
    "mo",
    "iron",
    "copper",
    "aluminum",
    "aluminium",
    "silicon",
    "sodium",
    "potassium",
    "zinc",
    "phosphorus",
    "calcium",
    "magnesium",
    "boron",
    "molybdenum"
  ]) {
    const re = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i");
    if (re.test(h)) return METAL_CANON[token];
  }
  return null;
}

type CanonicalTarget =
  | { kind: "metal"; key: keyof OilTranscriptionResult["metals"] }
  | { kind: "fluid"; key: keyof OilTranscriptionResult["fluid"] }
  | { kind: "operatingHours" }
  | { kind: "lubeTimeHours" }
  | { kind: "unitTimeHours" }
  | { kind: "sump" }
  | { kind: "exclude" }
  | { kind: "extra"; label: string };

function classifyHeader(rawHeader: string | null): CanonicalTarget {
  const h = normalizeHeader(rawHeader);
  if (!h) return { kind: "exclude" };

  // Row identifiers never map into measurement fields (code-excluded).
  if (
    /sample\s*#|lab\s*#|tracking\s*#|sample\s*(id|no)|lab\s*(id|no)|tracking\s*(id|no)|report\s*#|report\s*(id|no)/.test(
      h
    )
  ) {
    return { kind: "exclude" };
  }
  if (/^(date|time|sampledate|receiveddate)$/.test(h)) return { kind: "exclude" };

  // Viscosity (by temperature)
  if (h.includes("visc")) {
    if (h.includes("100")) return { kind: "fluid", key: "viscosity100C" };
    if (h.includes("40")) return { kind: "fluid", key: "viscosity40C" };
  }
  // Base number (BN) — strictly BN, never TAN
  if (
    (h.includes("base") && (h.includes("no") || h.includes("number") || h.includes("bn"))) ||
    h === "bn"
  ) {
    return { kind: "fluid", key: "baseNumber" };
  }
  // Acid number (TAN) — strictly TAN, never BN
  if (
    (h.includes("acid") && (h.includes("number") || h.includes("tan"))) ||
    h === "tan"
  ) {
    return { kind: "fluid", key: "acidNumber" };
  }
  if (h.includes("sump")) return { kind: "sump" };

  // FTIR oxidation / nitration (Abs/cm) — distinct from additive "Ca/Zn/P" metals
  if (h.includes("oxidation") || h === "ox") return { kind: "fluid", key: "oxidation" };
  if (h.includes("nitration") || h === "nit") return { kind: "fluid", key: "nitration" };

  // Lube time / fluid age (time on oil)
  if (
    h.includes("lube time") ||
    h.includes("lube hrs") ||
    h.includes("time on oil") ||
    h.includes("fluid age")
  ) {
    return { kind: "lubeTimeHours" };
  }
  // Unit / equipment time (component hours)
  if (
    h.includes("unit time") ||
    h.includes("unit hrs") ||
    h.includes("component time") ||
    h.includes("equipment hrs") ||
    (h.includes("equipment") && h.includes("hr"))
  ) {
    return { kind: "unitTimeHours" };
  }

  if (h.includes("hour")) return { kind: "operatingHours" };
  if (h.includes("iso")) return { kind: "fluid", key: "particleCountIso4406" };

  const metal = resolveMetal(h);
  if (metal) return { kind: "metal", key: metal };

  return { kind: "extra", label: String(rawHeader || "").trim() };
}

export function mapOilTranscription(rows: unknown): OilTranscriptionResult {
  const result: OilTranscriptionResult = {
    metals: {
      iron: null,
      copper: null,
      aluminum: null,
      silicon: null,
      sodium: null,
      potassium: null,
      zinc: null,
      phosphorus: null,
      calcium: null,
      magnesium: null,
      boron: null,
      molybdenum: null,
      chromium: null,
      lead: null,
      nickel: null,
      tin: null
    },
    fluid: {
      viscosity40C: null,
      viscosity100C: null,
      acidNumber: null,
      baseNumber: null,
      oxidation: null,
      nitration: null,
      particleCountIso4406: null
    },
    operatingHours: null,
    lubeTimeHours: null,
    unitTimeHours: null,
    sumpCapacityGallons: null,
    extra: {}
  };

  if (!Array.isArray(rows)) return result;

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<OilTranscriptionRow>;
    const header = row.header ?? null;
    // Explicit null/undefined/empty sanitization so numeric 0 (Pb, Cr, Sn, K, ...)
    // is preserved and mapped as 0 rather than dropped by JS truthy checks.
    const rawValue: unknown = row.value;
    const value =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? null
        : finiteNum(rawValue);
    const target = classifyHeader(header);

    switch (target.kind) {
      case "metal":
        if (value != null) result.metals[target.key] = value;
        break;
      case "fluid":
        if (target.key === "particleCountIso4406") {
          const s = row.value == null ? null : String(row.value).trim();
          if (s && /^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(s)) {
            result.fluid.particleCountIso4406 = s;
          }
        } else if (value != null) {
          result.fluid[target.key] = value;
        }
        break;
      case "operatingHours":
        if (value != null) result.operatingHours = value;
        break;
      case "lubeTimeHours":
        if (value != null) result.lubeTimeHours = value;
        break;
      case "unitTimeHours":
        if (value != null) result.unitTimeHours = value;
        break;
      case "sump": {
        const unit = String(row.unit_as_read || "").toLowerCase();
        if (value != null) {
          let g = value;
          if (unit.includes("qt")) g = value / QT_PER_GALLON;
          else if (unit.includes("l")) g = value / LITERS_PER_GALLON;
          else if (unit.includes("gal")) g = value;
          else g = value; // assume gallons if unit missing
          result.sumpCapacityGallons = Math.round(g * 100) / 100;
        }
        break;
      }
      case "extra":
        if (value != null) result.extra[target.label] = value;
        break;
      case "exclude":
      default:
        break;
    }
  }

  return result;
}

// --- Dual-model per-field consensus --------------------------------------------
type TxFluidKey =
  | "viscosity40C" | "viscosity100C" | "acidNumber" | "baseNumber"
  | "oxidation" | "nitration" | "sulfation" | "sootPercent" | "waterPpm"
  | "particleCountIso4406";

const TX_FLUID_KEYS: TxFluidKey[] = [
  "viscosity40C", "viscosity100C", "acidNumber", "baseNumber",
  "oxidation", "nitration", "sulfation", "sootPercent", "waterPpm",
  "particleCountIso4406"
];
const TX_SCALAR_KEYS = [
  "operatingHours", "lubeTimeHours", "unitTimeHours", "sumpCapacityGallons"
] as const;

/**
 * Per-field consensus: a field auto-fills ONLY when both models returned the same
 * extracted numeric value. Otherwise it is left blank and flagged for review.
 * (Operator "<" equality is handled upstream — values are already numeric, so a
 * "<0.1" detection (0.1) compares as the numeric 0.1.)
 */
export function mergeConsensus(
  a: OilTranscriptionResult,
  b: OilTranscriptionResult
): { result: OilTranscriptionResult; flaggedFields: string[] } {
  const flaggedFields: string[] = [];
  const pick = (
    va: number | string | null,
    vb: number | string | null,
    key: string
  ): number | string | null => {
    // Both present and equal → agree, fill.
    if (va != null && vb != null) {
      if (va === vb) return va;
      flaggedFields.push(key); // disagreement
      return null;
    }
    // Present in exactly one model → cannot confirm → flag + blank.
    if (va != null || vb != null) {
      flaggedFields.push(key);
      return null;
    }
    // Absent in both → genuinely no data, not a disagreement → blank, no flag.
    return null;
  };

  const metalKeys = Array.from(
    new Set([...Object.keys(a.metals), ...Object.keys(b.metals)])
  );
  const metals: Record<string, number | null> = {};
  for (const k of metalKeys) {
    metals[k] = pick(
      (a.metals as Record<string, number | null>)[k],
      (b.metals as Record<string, number | null>)[k],
      k
    ) as number | null;
  }

  const fluid = {} as Record<TxFluidKey, number | string | null>;
  for (const k of TX_FLUID_KEYS) fluid[k] = pick(a.fluid[k], b.fluid[k], k);

  const operatingHours = pick(a.operatingHours, b.operatingHours, "operatingHours");
  const lubeTimeHours = pick(a.lubeTimeHours, b.lubeTimeHours, "lubeTimeHours");
  const unitTimeHours = pick(a.unitTimeHours, b.unitTimeHours, "unitTimeHours");
  const sumpCapacityGallons = pick(a.sumpCapacityGallons, b.sumpCapacityGallons, "sumpCapacityGallons");

  const result: OilTranscriptionResult = {
    metals: metals as unknown as OilTranscriptionResult["metals"],
    fluid: fluid as OilTranscriptionResult["fluid"],
    operatingHours: operatingHours as number | null,
    lubeTimeHours: lubeTimeHours as number | null,
    unitTimeHours: unitTimeHours as number | null,
    sumpCapacityGallons: sumpCapacityGallons as number | null,
    extra: {}
  };
  return { result, flaggedFields };
}

/** Single-model mode: flag every field that received a value for manual review. */
export function flagAllFilled(tx: OilTranscriptionResult): string[] {
  const flagged: string[] = [];
  for (const k of Object.keys(tx.metals)) {
    if ((tx.metals as Record<string, unknown>)[k] != null) flagged.push(k);
  }
  for (const k of TX_FLUID_KEYS) if (tx.fluid[k] != null) flagged.push(k);
  for (const k of TX_SCALAR_KEYS) {
    if ((tx as unknown as Record<string, unknown>)[k] != null) flagged.push(k);
  }
  return flagged;
}

/**
 * Code-side oil classification for the enforced gate. Counts distinct oil-marker
 * categories present in the raw_table headers. A report is treated as an oil
 * report only when >= 3 of {iron, copper, viscosity, ppm, wear metals} appear.
 * This is the deterministic second path beside an explicit detected_technology: "OIL".
 */
function rawTableLooksLikeOil(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const found = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<OilTranscriptionRow>;
    const h = normalizeHeader(row.header ?? null);
    if (!h) continue;
    if (/(^|[^a-z0-9])(fe|iron)([^a-z0-9]|$)/.test(h)) found.add("iron");
    else if (/(^|[^a-z0-9])(cu|copper)([^a-z0-9]|$)/.test(h)) found.add("copper");
    else if (h.includes("visc")) found.add("viscosity");
    else if (h.includes("ppm")) found.add("ppm");
    else if (h.includes("wear")) found.add("wear");
  }
  return found.size >= 3;
}

// Legacy OIL_VISION_PROMPT retired — the live server path uses MASTER_VISION_PROMPT (verbatim) only.

function stripMarkdownJsonFences(raw: string): string {
  return String(raw || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonObjectText(raw: string): string {
  const cleaned = stripMarkdownJsonFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Vision model did not return oil analysis JSON.");
  }
  return cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
}

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || /not visible|n\/a|unknown|null|—|-/i.test(trimmed)) {
      return null;
    }
    const m = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^(n\/a|null|none|not visible|—|-)$/i.test(s)) return null;
  return s;
}

function boolOrNull(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function parseFormat(raw: unknown): OilReportData["formatDetected"] {
  const s = String(raw || "").toUpperCase();
  if (s.includes("POLARIS")) return "POLARIS";
  if (s.includes("TESTOIL") || s.includes("TEST OIL")) return "TESTOIL";
  if (/\bALS\b/.test(s)) return "ALS";
  if (s.includes("BUREAU") || s.includes("VERITAS")) return "BUREAU_VERITAS";
  if (s.includes("GENERIC") || s.includes("LAB")) return "GENERIC_LAB";
  if (s.includes("VISION")) return "VISION_SCREENSHOT";
  return "UNKNOWN";
}

function emptyHeader(): OilReportHeader {
  return {
    labName: null,
    reportNumber: null,
    sampleDate: null,
    receivedDate: null,
    assetId: null,
    assetDescription: null,
    component: null,
    lubricantBrand: null,
    lubricantGrade: null,
    samplePoint: null
  };
}

function emptyMetals(): OilReportMetals {
  return {
    iron: null,
    copper: null,
    chromium: null,
    lead: null,
    aluminum: null,
    silicon: null,
    tin: null,
    nickel: null,
    molybdenum: null,
    magnesium: null,
    calcium: null,
    zinc: null,
    sodium: null,
    potassium: null,
    boron: null,
    silver: null,
    titanium: null,
    vanadium: null
  };
}

function emptyFluid(): OilReportFluidProperties {
  return {
    viscosity40C: null,
    viscosity100C: null,
    viscosityIndex: null,
    waterPpm: null,
    waterPercent: null,
    acidNumber: null,
    baseNumber: null,
    oxidation: null,
    nitration: null,
    sulfation: null,
    sootPercent: null,
    flashPointC: null,
    particleCountIso4406: null,
    particles4um: null,
    particles6um: null,
    particles14um: null,
    pqIndex: null
  };
}

function emptyOps(): OilReportOperatingParams {
  return {
    operatingHours: null,
    oilHours: null,
    milesOrKm: null,
    makeUpOilLiters: null,
    filterChanged: null,
    oilChanged: null
  };
}

function mapHeader(raw: unknown): OilReportHeader {
  const h = asRecord(raw) || {};
  return {
    labName: strOrNull(h.labName ?? h.lab_name),
    reportNumber: strOrNull(h.reportNumber ?? h.report_number),
    sampleDate: strOrNull(h.sampleDate ?? h.sample_date),
    receivedDate: strOrNull(h.receivedDate ?? h.received_date),
    assetId: strOrNull(h.assetId ?? h.asset_id ?? h.unitId),
    assetDescription: strOrNull(h.assetDescription ?? h.asset_description),
    component: strOrNull(h.component),
    lubricantBrand: strOrNull(h.lubricantBrand ?? h.lubricant_brand ?? h.oilBrand),
    lubricantGrade: strOrNull(h.lubricantGrade ?? h.lubricant_grade ?? h.oilGrade),
    samplePoint: strOrNull(h.samplePoint ?? h.sample_point)
  };
}

function mapMetals(raw: unknown): OilReportMetals {
  const m = asRecord(raw) || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const n = finiteNum(m[k]);
      if (n != null) return n;
    }
    return null;
  };
  return {
    iron: pick("iron", "Fe", "fe"),
    copper: pick("copper", "Cu", "cu"),
    chromium: pick("chromium", "Cr", "cr"),
    lead: pick("lead", "Pb", "pb"),
    aluminum: pick("aluminum", "aluminium", "Al", "al"),
    silicon: pick("silicon", "Si", "si"),
    tin: pick("tin", "Sn", "sn"),
    nickel: pick("nickel", "Ni", "ni"),
    molybdenum: pick("molybdenum", "Mo", "mo"),
    magnesium: pick("magnesium", "Mg", "mg"),
    calcium: pick("calcium", "Ca", "ca"),
    zinc: pick("zinc", "Zn", "zn"),
    sodium: pick("sodium", "Na", "na"),
    potassium: pick("potassium", "K"),
    boron: pick("boron", "B"),
    silver: pick("silver", "Ag", "ag"),
    titanium: pick("titanium", "Ti", "ti"),
    vanadium: pick("vanadium", "V")
  };
}

function mapFluid(raw: unknown): OilReportFluidProperties {
  const f = asRecord(raw) || {};
  return {
    viscosity40C: finiteNum(f.viscosity40C ?? f.viscosity_40c ?? f.visc40),
    viscosity100C: finiteNum(f.viscosity100C ?? f.viscosity_100c ?? f.visc100),
    viscosityIndex: finiteNum(f.viscosityIndex ?? f.viscosity_index ?? f.vi),
    waterPpm: finiteNum(f.waterPpm ?? f.water_ppm),
    waterPercent: finiteNum(f.waterPercent ?? f.water_percent ?? f.waterPct),
    acidNumber: finiteNum(f.acidNumber ?? f.acid_number ?? f.tan),
    baseNumber: finiteNum(f.baseNumber ?? f.base_number ?? f.tbn),
    oxidation: finiteNum(f.oxidation),
    nitration: finiteNum(f.nitration),
    sulfation: finiteNum(f.sulfation),
    sootPercent: finiteNum(f.sootPercent ?? f.soot_percent ?? f.soot),
    flashPointC: finiteNum(f.flashPointC ?? f.flash_point_c),
    particleCountIso4406: strOrNull(
      f.particleCountIso4406 ?? f.particle_count_iso4406 ?? f.iso4406
    ),
    particles4um: finiteNum(f.particles4um ?? f.particles_4um ?? f.count4um),
    particles6um: finiteNum(f.particles6um ?? f.particles_6um ?? f.count6um),
    particles14um: finiteNum(
      f.particles14um ?? f.particles_14um ?? f.count14um
    ),
    pqIndex: finiteNum(f.pqIndex ?? f.pq_index ?? f.pq)
  };
}

function mapOps(raw: unknown): OilReportOperatingParams {
  const o = asRecord(raw) || {};
  return {
    operatingHours: finiteNum(
      o.operatingHours ?? o.operating_hours ?? o.unitHours
    ),
    oilHours: finiteNum(o.oilHours ?? o.oil_hours),
    milesOrKm: finiteNum(o.milesOrKm ?? o.miles_or_km ?? o.miles),
    makeUpOilLiters: finiteNum(
      o.makeUpOilLiters ?? o.make_up_oil_liters ?? o.makeupOil
    ),
    filterChanged: boolOrNull(o.filterChanged ?? o.filter_changed),
    oilChanged: boolOrNull(o.oilChanged ?? o.oil_changed)
  };
}

function scoreConfidence(data: OilReportData, modelScore: number | null): number {
  if (modelScore != null && modelScore > 0) {
    return Math.max(1, Math.min(100, Math.round(modelScore)));
  }
  let score = 10;
  const m = data.metals;
  const metalsHit = [
    m.iron,
    m.copper,
    m.chromium,
    m.lead,
    m.aluminum,
    m.silicon
  ].filter((n) => n != null && n >= 0).length;
  score += metalsHit * 8;
  if (data.header.sampleDate) score += 10;
  if (data.operatingParams.operatingHours != null) score += 10;
  if (data.fluidProperties.viscosity40C != null) score += 8;
  if (data.fluidProperties.acidNumber != null) score += 5;
  if (data.header.labName || data.header.reportNumber) score += 5;
  return Math.max(1, Math.min(100, score));
}

/** Map raw vision JSON → typed OilReportData. Supports both legacy flat JSON and Master Vision strict schema. */
export function mapVisionJsonToOilReportData(
  parsed: Record<string, unknown>,
  fileName?: string | null,
  mergedTx?: OilTranscriptionResult
): OilReportData {
  // --- Master Vision strict path: {detected_technology, data:{oil:{...}}, extra, warnings}
  const isMaster = typeof parsed.detected_technology === "string" && typeof parsed.data === "object" && parsed.data !== null;
  if (isMaster) {
    const master = parsed as unknown as MasterVisionResponse;
    const oil = (master.data?.oil || {}) as MasterOilSchema;
    const extra = master.extra || {};
    const warnings = master.warnings || [];

    // Helper to get numeric value with honesty rules (illegible/absent or confidence <0.8 -> null)
    const num = (key: string): number | null => masterFieldValue((oil as Record<string, unknown>)[key]);
    const str = (key: string): string | null => masterFieldString((oil as Record<string, unknown>)[key]);

    // Sump capacity conversion with named constants
    let sumpGallons: number | null = null;
    const sumpField = oil.sump_capacity as unknown as MasterField | undefined;
    if (sumpField && sumpField.status === "extracted" && typeof sumpField.confidence === "number" && sumpField.confidence >= 0.8 && sumpField.value != null) {
      const rawVal = typeof sumpField.value === "number" ? sumpField.value : Number(String(sumpField.value).replace(/,/g, ""));
      const unit = String(sumpField.unit_as_read || "").toLowerCase();
      if (Number.isFinite(rawVal)) {
        if (unit.includes("qt")) sumpGallons = rawVal / QT_PER_GALLON;
        else if (unit.includes("l")) sumpGallons = rawVal / LITERS_PER_GALLON;
        else if (unit.includes("gal")) sumpGallons = rawVal;
        else sumpGallons = rawVal; // assume gallons if unit missing
        sumpGallons = Math.round(sumpGallons * 100) / 100;
      }
    }

    const data: OilReportData = {
      header: {
        labName: null,
        reportNumber: null,
        sampleDate: str("sampled_date"),
        receivedDate: null,
        assetId: null,
        assetDescription: null,
        component: null,
        lubricantBrand: null,
        lubricantGrade: null,
        samplePoint: null
      },
      metals: {
        iron: num("wear_metals_Fe"),
        copper: num("wear_metals_Cu"),
        chromium: num("wear_metals_Cr"),
        lead: num("wear_metals_Pb"),
        aluminum: num("wear_metals_Al"),
        silicon: num("contaminants_Si"),
        tin: num("wear_metals_Sn"),
        nickel: num("wear_metals_Ni"),
        molybdenum: num("multi_source_Mo"),
        magnesium: num("additives_Mg"),
        calcium: num("additives_Ca"),
        zinc: num("additives_Zn"),
        sodium: num("contaminants_Na"),
        potassium: num("contaminants_K"),
        boron: num("multi_source_B"),
        silver: num("wear_metals_Ag"),
        titanium: num("multi_source_Ti"),
        vanadium: num("wear_metals_V")
      },
      fluidProperties: {
        viscosity40C: num("viscosity_40C"),
        viscosity100C: num("viscosity_100C"),
        viscosityIndex: null,
        waterPpm: null,
        waterPercent: num("water_percent"),
        acidNumber: num("TAN"),
        baseNumber: num("BN"),
        oxidation: null,
        nitration: null,
        sulfation: null,
        sootPercent: num("soot_percent"),
        flashPointC: null,
        particleCountIso4406: str("iso_4406"),
        particles4um: null,
        particles6um: null,
        particles14um: null,
        pqIndex: null
      },
      operatingParams: {
        operatingHours: null,
        oilHours: null,
        milesOrKm: null,
        makeUpOilLiters: null,
        filterChanged: null,
        oilChanged: null
      },
      formatDetected: "UNKNOWN",
      confidenceScore: 95,
      rawNotes: JSON.stringify({ sumpCapacityGallons: sumpGallons, sumpRaw: sumpField || null, extra, warnings }),
      sourceFileName: fileName ?? null
    } as OilReportData & { sumpCapacityGallons?: number | null };

    // Handle water 0.1 with operator "<" — value already 0.1, operator preserved in sumpRaw but sanitizers handle < as 0.1
    // Fuel dilution maps to operating context but we store in extra for form to pick up
    const fuelVal = num("fuel_dilution_percent");
    if (fuelVal != null) {
      (data as unknown as Record<string, unknown>).fuelDilutionPercent = fuelVal;
    }
    // Attach sump gallons for form conversion
    (data as unknown as Record<string, unknown>).sumpCapacityGallons = sumpGallons;
    // Attach phosphorus and barium which are not in OilReportMetals but are in form's ppm keys
    const pVal = num("additives_P");
    if (pVal != null) (data as unknown as Record<string, unknown>).phosphorus = pVal;
    const baVal = num("additives_Ba");
    if (baVal != null) (data as unknown as Record<string, unknown>).barium = baVal;

    // --- Transcription-first override: raw_table is the single source of truth for oil ---
    // The model's own data.oil key mapping is bypassed whenever raw_table is present.
    const rawTableRows = (master as unknown as { raw_table?: unknown }).raw_table;
    if (mergedTx || (Array.isArray(rawTableRows) && rawTableRows.length > 0)) {
      const tx = mergedTx ?? mapOilTranscription(rawTableRows);
      data.metals.iron = tx.metals.iron;
      data.metals.copper = tx.metals.copper;
      data.metals.aluminum = tx.metals.aluminum;
      data.metals.silicon = tx.metals.silicon;
      data.metals.sodium = tx.metals.sodium;
      data.metals.potassium = tx.metals.potassium;
      data.metals.zinc = tx.metals.zinc;
      data.metals.calcium = tx.metals.calcium;
      data.metals.magnesium = tx.metals.magnesium;
      data.metals.boron = tx.metals.boron;
      data.metals.molybdenum = tx.metals.molybdenum;
      data.metals.chromium = tx.metals.chromium;
      data.metals.lead = tx.metals.lead;
      data.metals.nickel = tx.metals.nickel;
      data.metals.tin = tx.metals.tin;
      data.fluidProperties.viscosity40C = tx.fluid.viscosity40C;
      data.fluidProperties.viscosity100C = tx.fluid.viscosity100C;
      data.fluidProperties.acidNumber = tx.fluid.acidNumber;
      data.fluidProperties.baseNumber = tx.fluid.baseNumber;
      data.fluidProperties.oxidation = tx.fluid.oxidation;
      data.fluidProperties.nitration = tx.fluid.nitration;
      data.fluidProperties.particleCountIso4406 = tx.fluid.particleCountIso4406;
      data.operatingParams.oilHours = tx.lubeTimeHours;
      data.operatingParams.operatingHours =
        tx.unitTimeHours != null ? tx.unitTimeHours : tx.operatingHours;
      (data as unknown as Record<string, unknown>).sumpCapacityGallons = tx.sumpCapacityGallons;
      // Phosphorus is not on OilReportMetals; attach via the same consensus result.
      (data as unknown as Record<string, unknown>).phosphorus = tx.metals.phosphorus;
      data.rawNotes = JSON.stringify({
        sumpCapacityGallons: tx.sumpCapacityGallons,
        extra: tx.extra,
        warnings
      });
    }

    return data;
  }

  const metalsRaw =
    asRecord(parsed.metals) ||
    asRecord(parsed.wear_metals) ||
    asRecord(parsed.wearMetals) ||
    parsed;

  const data: OilReportData = {
    header: mapHeader(parsed.header ?? parsed),
    metals: mapMetals(metalsRaw),
    fluidProperties: mapFluid(
      parsed.fluidProperties ?? parsed.fluid_properties ?? parsed.chemistry
    ),
    operatingParams: mapOps(
      parsed.operatingParams ?? parsed.operating_params ?? parsed.ops
    ),
    formatDetected: parseFormat(parsed.formatDetected ?? parsed.format_detected),
    confidenceScore: 0,
    rawNotes: strOrNull(parsed.rawNotes ?? parsed.raw_notes ?? parsed.notes),
    sourceFileName: fileName ?? strOrNull(parsed.sourceFileName) ?? null
  };

  // If metals nested under header-only parse missed Fe/Cu at root
  if (
    data.metals.iron == null &&
    data.metals.copper == null &&
    asRecord(parsed.metals) == null
  ) {
    data.metals = mapMetals(parsed);
  }

  data.confidenceScore = scoreConfidence(
    data,
    finiteNum(parsed.confidenceScore ?? parsed.confidence)
  );

  return data;
}

export function emptyOilReportData(fileName?: string | null): OilReportData {
  return {
    header: emptyHeader(),
    metals: emptyMetals(),
    fluidProperties: emptyFluid(),
    operatingParams: emptyOps(),
    formatDetected: "UNKNOWN",
    confidenceScore: 0,
    rawNotes: null,
    sourceFileName: fileName ?? null
  };
}

function normalizeImageUrl(imageBase64: string): string {
  const raw = String(imageBase64 || "").trim();
  if (!raw) throw new Error("imageBase64 is required.");
  if (raw.startsWith("data:")) return raw;
  return `data:image/png;base64,${raw}`;
}

export type OilVisionExtractResult =
  | { success: true; data: OilReportData; model: string }
  | {
      success: false;
      error: string;
      message: string;
      httpStatus: number;
      detail?: string;
    };

/**
 * Server-side OpenRouter vision call — used by API route / Express mount.
 */
export async function extractOilReportFromImageBase64(input: {
  imageBase64: string;
  fileName?: string | null;
  models?: string[];
  maxTokens?: number;
}): Promise<OilVisionExtractResult> {
  const startTime = logPipelineStart("oilVisionExtractor", {
    fileName: input.fileName || null
  });

  let imageUrl: string;
  try {
    imageUrl = normalizeImageUrl(input.imageBase64);
  } catch (err) {
    logPipelineFail("oilVisionExtractor", startTime, err);
    return {
      success: false,
      error: "INVALID_REQUEST",
      message: err instanceof Error ? err.message : "imageBase64 is required.",
      httpStatus: 400
    };
  }

  logPayloadSize("oilVisionExtractor", imageUrl);

  // Key-presence gate (AR-23c): no OpenRouter requirement — the chain runs
  // on whatever providers have keys. Zero configured providers still fails
  // honestly, with the per-provider skip reasons instead of a bare code.
  if (!isLmStudioDevMode()) {
    const { candidates, skipped } = buildVisionCandidates(false, input.models);
    if (candidates.length === 0) {
      const message = buildVisionFailureMessage([], skipped);
      logPipelineFail("oilVisionExtractor", startTime, new Error(message));
      return {
        success: false,
        error: "VISION_FAILED",
        message,
        httpStatus: 503
      };
    }
  }

  try {
    const { parses, lastError } = await runMasterVisionModelLoop(input);
    return finalizeOilFromParses(parses, lastError, input);
  } catch (err) {
    logPipelineFail("oilVisionExtractor", startTime, err);
    return {
      success: false,
      error: "VISION_FAILED",
      message:
        err instanceof Error && err.message
          ? err.message
          : "Vision extraction failed.",
      httpStatus: 500
    };
  }
}

/**
 * Browser helper — POST base64 image to OIL_VISION_API_PATH and return typed data.
 */
export async function extractOilReportFromImage(
  imageFile: File
): Promise<OilReportData> {
  if (
    !imageFile ||
    !(
      /^image\//i.test(imageFile.type) ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name)
    )
  ) {
    throw new Error("Upload a PNG, JPEG, or WebP oil lab report screenshot.");
  }

  const base64Image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Failed to read oil report image as base64."));
    reader.readAsDataURL(imageFile);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OIL_VISION_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64: base64Image,
        fileName: imageFile.name
      })
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      throw new Error(
        "Extraction timed out or failed. Please try again."
      );
    }
    throw err;
  }
  clearTimeout(timeoutId);

  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const code =
      typeof result.error === "string" && result.error ? result.error : null;
    const detail =
      typeof result.message === "string" && result.message ? result.message : null;
    // VISION_FAILED must never surface bare — the message carries the
    // per-provider "vision: <code> <reason> (<model> via <provider>)" list.
    throw new Error(
      code === "VISION_FAILED" && detail
        ? detail
        : code || detail || `Oil vision extraction failed (${response.status}).`
    );
  }

  // The unified endpoint may fall through to another technology's finalizer.
  // From the oil tab we only accept an OIL result.
  const technology = typeof result.technology === "string" ? result.technology : null;
  if (technology && technology !== "OIL") {
    throw new Error("Report type not recognized - enter values manually or re-upload.");
  }

  if (result.data && typeof result.data === "object") {
    return mapVisionJsonToOilReportData(
      result.data as Record<string, unknown>,
      imageFile.name
    );
  }

  return mapVisionJsonToOilReportData(result, imageFile.name);
}

/* ------------------------------------------------------------------ */
/* Shared model loop + dual-technology finalizers (oil + vibration)   */
/* ------------------------------------------------------------------ */

export interface MasterVisionParse {
  provider?: string;
  providerId?: string;
  model: string;
  parsed: Record<string, unknown>;
}
export interface MasterVisionLoopResult {
  parses: MasterVisionParse[];
  lastError: unknown;
  upstreamStatus: number | null;
}

/* ------------------------------------------------------------------ */
/* AR-23c peaks amendment: vibration peaks-aware chain control        */
/* (local mirrors of vibrationVisionExtractor helpers — importing     */
/* would be circular, classification order must stay identical)       */
/* ------------------------------------------------------------------ */

type VibPeaksKind =
  | "overallVelocity"
  | "peakAccel"
  | "rpm"
  | "amp1x"
  | "severity"
  | "spectral";

function normalizeVibHeaderForPeaks(h: unknown): string {
  if (!h) return "";
  return String(h)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[):]/g, "")
    .trim();
}

/** Mirrors vibrationVisionExtractor.resolveVibKind — classification order matters. */
function vibKindForPeaks(h: unknown): VibPeaksKind | null {
  const n = normalizeVibHeaderForPeaks(h);
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

/* --- AR-23d peak sanity: amplitude, axis endpoint, interior-maximum rules --- */

/** Amplitude of a spectral-peak row, parsed from header/unit/value text ("Hz @ 0.250 in/s"). */
function peakAmplitudeOf(row: Record<string, unknown>): number | null {
  const parts: string[] = [];
  if (typeof row.header === "string") parts.push(row.header);
  if (typeof row.unit_as_read === "string") parts.push(row.unit_as_read);
  if (typeof row.value === "string") parts.push(row.value);
  const text = parts.join(" ");
  const m = /(?:^|[^a-z])(?:amp(?:litude)?|@)\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(text);
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Peak number of a "Spectral peak <n>" header, or null. */
function spectralPeakKey(h: unknown): string | null {
  const m = /spectral peak\s*(\d+)/.exec(normalizeVibHeaderForPeaks(h));
  return m && m[1] !== undefined ? m[1] : null;
}

/** A spectral row that states an amplitude rather than a frequency ("Spectral peak 1 amplitude"). */
function isSpectralAmpRow(h: unknown): boolean {
  return /amplitude|\bamp\b/.test(normalizeVibHeaderForPeaks(h));
}

/** Best-effort printed axis maximum (fmax) from axis-endpoint rows; null when unknown. */
function axisMaxOf(parsed: Record<string, unknown>): number | null {
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return null;
  let max: number | null = null;
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const n = normalizeVibHeaderForPeaks(raw.header);
    if (!/(axis|fmax|full scale|frequency range)/.test(n)) continue;
    if (!/(max|maximum|end|upper|limit|\bto\b)/.test(n)) continue;
    const v = finiteNum(raw.value);
    if (v != null && v > 0 && (max == null || v > max)) max = v;
  }
  return max;
}

/**
 * Valid spectral-peak rows: interior positive frequency (strictly below the
 * printed axis maximum when known) WITH a printed amplitude (inline in the
 * row, or on a matching "Spectral peak n amplitude" sibling row). Axis ticks,
 * the 0 origin, bare frequencies and amplitude-less rows are all rejected —
 * a parse whose spectral rows are all invalid counts as having no peaks.
 */
function validSpectralPeakRows(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return [];
  const axisMax = axisMaxOf(parsed);
  const ampByKey = new Map<string, number>();
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    if (vibKindForPeaks(raw.header) !== "spectral") continue;
    if (!isSpectralAmpRow(raw.header)) continue;
    const key = spectralPeakKey(raw.header);
    const amp = finiteNum(raw.value);
    if (key != null && amp != null && amp > 0) ampByKey.set(key, amp);
  }
  const valid: Record<string, unknown>[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    if (vibKindForPeaks(raw.header) !== "spectral") continue;
    if (isSpectralAmpRow(raw.header)) continue;
    const freq = finiteNum(raw.value);
    if (freq == null || freq <= 0) continue;
    if (axisMax != null && freq >= axisMax) continue;
    const inline = peakAmplitudeOf(raw);
    const key = spectralPeakKey(raw.header);
    const amp = inline ?? (key != null ? (ampByKey.get(key) ?? null) : null);
    if (amp == null || amp <= 0) continue;
    valid.push(raw);
  }
  return valid;
}

/**
 * Peak-frequency list for one parse — local mirror of the spectral-row branch of
 * vibrationVisionExtractor.mapVibrationTranscription, plus AR-23d sanity:
 * only amplitude-labelled interior peaks count; ticks and bare freqs are never
 * peaks. Null when raw_table has no valid spectral rows.
 */
export function parsePeaks(parsed: Record<string, unknown>): (number | string)[] | null {
  const freqs: number[] = [];
  for (const row of validSpectralPeakRows(parsed)) {
    const v = finiteNum(row.value);
    if (v != null) freqs.push(v);
  }
  return freqs.length > 0 ? freqs : null;
}

/* --- AR-23e geometry-estimate fallback (gated, RPM/60) --------------------- */

export const VISION_EXTRACTION_MODES = ["consensus", "single", "geometry-estimate"] as const;
export type VisionExtractionMode = (typeof VISION_EXTRACTION_MODES)[number];

export const GEOMETRY_ESTIMATE_MODE: VisionExtractionMode = "geometry-estimate";
export const GEOMETRY_PEAK_SOURCE = "geometry (RPM/60)";
export const GEOMETRY_PEAK_SOURCE_BAR_HEIGHT = "geometry (RPM/60 + bar height)";
export const GEOMETRY_BAR_HEIGHT_PROVENANCE =
  "geometry estimate (bar height x printed amplitude scale)";
export const FREQ_ONLY_GEOMETRY_PROVENANCE = "freq-only geometry (RPM/60)";
/** Hard cap for any geometry-derived confidence — estimates never read as measurements. */
export const GEOMETRY_PEAK_CONFIDENCE_CAP = 60;
/** Baseline confidence of a measured (strict-path) peak — estimates must score strictly below. */
export const MEASURED_PEAK_CONFIDENCE_BASELINE = 90;
export const ESTIMATED_PEAK_BADGE = "ESTIMATED";

export interface GeometryEstimatedPeak {
  /** Order-snapped frequency (printed spike frequency rounded to the nearest shaft order). */
  frequency: number;
  /** Null when the chart printed no legible amplitude scale — never fabricated. */
  amplitude: number | null;
  source: string;
  confidence: number;
  provenance: string;
  estimated: true;
}

export interface GeometrySpikeCandidate {
  frequencyHz: number;
  /** Spike bar height as a fraction of full scale (0–1], parsed from unit_as_read; null when illegible. */
  barFraction: number | null;
}

/** UI/export helper — true only for the geometry-estimate extraction mode. */
export function isEstimatedExtractionMode(
  mode: VisionExtractionMode | string | null | undefined
): boolean {
  return mode === GEOMETRY_ESTIMATE_MODE;
}

/** Axis-like spectral headers (ticks/scales) — excluded in BOTH strict and estimate modes. */
const AXIS_LIKE_SPECTRAL_HEADER =
  /\b(axis|tick|ticks|scale|fmax|full\s*scale|frequency\s*range|origin|cursor|marker)\b/;

/** Bar-height fraction from a §9 contract unit ("Hz @ bar 0.62"); null when absent or out of (0,1]. */
function barFractionOf(unitAsRead: unknown): number | null {
  if (typeof unitAsRead !== "string") return null;
  const m = /(?:@|amp(?:litude)?)\s*bar\s*(\d*\.?\d+)/i.exec(unitAsRead);
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
}

/**
 * Printed amplitude-axis maximum ("Amplitude axis maximum" §9 row, or any
 * amplitude/velocity/acceleration/y-axis top-of-scale row). Frequency-axis
 * rows never qualify. Null when unknown.
 */
export function amplitudeAxisMaxOf(parsed: Record<string, unknown>): number | null {
  const stashed = parsed.geometryEstimateInput;
  if (isRecord(stashed)) {
    const v = finiteNum(stashed.amplitudeAxisMax);
    if (v != null && v > 0) return v;
  }
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return null;
  let max: number | null = null;
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const n = normalizeVibHeaderForPeaks(raw.header);
    if (!n) continue;
    if (!/(amplitude|velocity|acceleration|y[\s-]?axis|full\s*scale)/.test(n)) continue;
    if (/(freq|hz|x[\s-]?axis)/.test(n)) continue;
    if (!/(max|maximum|top|upper|end|limit|full)/.test(n)) continue;
    const v = finiteNum(raw.value);
    if (v != null && v > 0 && (max == null || v > max)) max = v;
  }
  return max;
}

/**
 * Interior spike candidates for the geometry-estimate fallback: spectral-kind
 * rows with NO printed amplitude, positive frequency strictly below the printed
 * fmax (when known), excluding axis-like headers. Consults the AR-23e stash
 * (the sanitizer drops these rows from raw_table) and falls back to scanning
 * raw_table directly (unsanitized / test input). Ticks, the 0 origin and
 * negative frequencies are excluded in BOTH modes — absolute rules.
 */
export function geometrySpikeCandidates(parsed: Record<string, unknown>): GeometrySpikeCandidate[] {
  const stashed = parsed.geometryEstimateInput;
  if (isRecord(stashed) && Array.isArray(stashed.spikes)) {
    const out: GeometrySpikeCandidate[] = [];
    for (const s of stashed.spikes) {
      if (!isRecord(s)) continue;
      const frequencyHz = finiteNum(s.frequencyHz);
      if (frequencyHz == null || frequencyHz <= 0) continue;
      const bar = finiteNum(s.barFraction);
      out.push({ frequencyHz, barFraction: bar != null && bar > 0 && bar <= 1 ? bar : null });
    }
    if (out.length > 0) return out;
  }
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return [];
  const axisMax = axisMaxOf(parsed);
  const out: GeometrySpikeCandidate[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    if (vibKindForPeaks(raw.header) !== "spectral") continue;
    if (isSpectralAmpRow(raw.header)) continue; // printed amplitude → strict path owns it
    const n = normalizeVibHeaderForPeaks(raw.header);
    if (!n || AXIS_LIKE_SPECTRAL_HEADER.test(n)) continue;
    const freq = finiteNum(raw.value);
    if (freq == null || freq <= 0) continue;
    if (axisMax != null && freq >= axisMax) continue;
    if (peakAmplitudeOf(raw) != null) continue; // inline amplitude → strict path owns it
    out.push({ frequencyHz: freq, barFraction: barFractionOf(raw.unit_as_read) });
  }
  return out;
}

/** First rpm-kind raw_table row with a positive finite value, or null. */
export function readableRpmOf(parsed: Record<string, unknown>): number | null {
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return null;
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    if (vibKindForPeaks(raw.header) !== "rpm") continue;
    const v = finiteNum(raw.value);
    if (v != null && v > 0) return v;
  }
  return null;
}

/**
 * AR-23e derive: snap each interior spike to the nearest shaft order
 * (order = round(spike / (rpm/60))), emit order × shaft within
 * max(1 Hz, 4 % of spike) tolerance, dedupe. Amplitude is
 * barFraction × printed y-max when BOTH are legible, else null with the
 * freq-only provenance — never fabricated. Confidence is hard-capped at
 * GEOMETRY_PEAK_CONFIDENCE_CAP. Null when RPM or spikes are unreadable.
 * Callers gate on parsePeaks === null — the strict path always wins.
 */
export function deriveGeometryEstimatePeaks(
  parsed: Record<string, unknown>
): GeometryEstimatedPeak[] | null {
  if (!isVibrationParse(parsed)) return null;
  const rpm = readableRpmOf(parsed);
  if (rpm == null) return null;
  const shaftHz = rpm / 60;
  if (!(shaftHz > 0)) return null;
  const spikes = geometrySpikeCandidates(parsed);
  if (spikes.length === 0) return null;
  const yMax = amplitudeAxisMaxOf(parsed);
  const peaks: GeometryEstimatedPeak[] = [];
  const seen = new Set<number>();
  for (const spike of spikes) {
    const order = Math.round(spike.frequencyHz / shaftHz);
    if (order < 1) continue;
    const snapped = order * shaftHz;
    const tolerance = Math.max(1, 0.04 * spike.frequencyHz);
    if (Math.abs(spike.frequencyHz - snapped) > tolerance) continue;
    const frequency = Math.round(snapped * 100) / 100;
    if (seen.has(frequency)) continue;
    seen.add(frequency);
    const bar = spike.barFraction;
    let amplitude: number | null = null;
    let source = GEOMETRY_PEAK_SOURCE;
    let provenance = FREQ_ONLY_GEOMETRY_PROVENANCE;
    if (bar != null && yMax != null) {
      amplitude = Math.round(bar * yMax * 1000) / 1000;
      source = GEOMETRY_PEAK_SOURCE_BAR_HEIGHT;
      provenance = GEOMETRY_BAR_HEIGHT_PROVENANCE;
    }
    peaks.push({
      frequency,
      amplitude,
      source,
      confidence: GEOMETRY_PEAK_CONFIDENCE_CAP,
      provenance,
      estimated: true
    });
  }
  return peaks.length > 0 ? peaks : null;
}

/** True when the parse could produce a geometry estimate (RPM + ≥1 interior spike). */
export function geometryEstimateEligible(parsed: Record<string, unknown>): boolean {
  return deriveGeometryEstimatePeaks(parsed) !== null;
}

/**
 * AR-23d: strip invalid spectral rows (axis ticks, endpoints, bare freqs,
 * amplitude-only rows) from a VIBRATION parse so they can never surface as
 * peaks — flagged or otherwise — in mapVibrationTranscription downstream.
 * AR-23e: amplitude-less interior spikes (geometry-estimate candidates) and
 * the printed amplitude-axis maximum are STASHED on the parse (they are
 * dropped from raw_table under the same absolute rules in both modes).
 */
export function sanitizeVibrationSpectralRows(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!isVibrationParse(parsed)) return parsed;
  const rows: unknown = parsed.raw_table;
  if (!Array.isArray(rows)) return parsed;
  const spikes = geometrySpikeCandidates(parsed);
  const amplitudeAxisMax = amplitudeAxisMaxOf(parsed);
  const validRows = new Set(validSpectralPeakRows(parsed));
  const kept: unknown[] = [];
  let dropped = 0;
  for (const raw of rows) {
    if (isRecord(raw) && vibKindForPeaks(raw.header) === "spectral") {
      if (!validRows.has(raw)) {
        dropped += 1;
        continue;
      }
    }
    kept.push(raw);
  }
  let next = parsed;
  if (dropped > 0) {
    console.info(
      `[vision] peak sanity: dropped ${dropped} invalid spectral row(s) (axis tick / endpoint / missing amplitude)`
    );
    next = { ...parsed, raw_table: kept };
  }
  if (spikes.length > 0 || amplitudeAxisMax != null) {
    next = { ...next, geometryEstimateInput: { spikes, amplitudeAxisMax } };
  }
  return next;
}

/** Mirrors vibrationVisionExtractor.numClose merge tolerance. */
function peaksNumClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01 * Math.abs(a), 0.05);
}

function isVibrationParse(parsed: Record<string, unknown>): boolean {
  return (
    typeof parsed.detected_technology === "string" &&
    parsed.detected_technology.toUpperCase() === "VIBRATION"
  );
}

/** First element of a parse's peak list as a number, or null when absent/non-numeric. */
function firstPeakOf(parse: MasterVisionParse): number | null {
  const peaks = parsePeaks(parse.parsed);
  if (!peaks || peaks.length === 0) return null;
  return finiteNum(peaks[0]);
}

/** Two parses agree when both carry peaks and their first peaks are within merge tolerance. */
function peaksAgree(a: MasterVisionParse, b: MasterVisionParse): boolean {
  const pa = firstPeakOf(a);
  const pb = firstPeakOf(b);
  return pa != null && pb != null && peaksNumClose(pa, pb);
}

/** Earliest peaks-agreeing pair, or null. Vibration finalize only reads [0]/[1]. */
function findAgreedPeaksPair(parses: MasterVisionParse[]): [number, number] | null {
  for (let i = 0; i < parses.length; i += 1) {
    for (let j = i + 1; j < parses.length; j += 1) {
      if (peaksAgree(parses[i], parses[j])) return [i, j];
    }
  }
  return null;
}

/**
 * Runs the master-vision model cascade once and returns every successful parse
 * for downstream per-technology consensus — two parses normally, or exactly the
 * peaks-agreeing pair / a degraded single peaks parse when the lead parse is
 * VIBRATION (AR-23c peaks amendment). Shared by both the oil and vibration
 * extractors so the model is only called once.
 */
export async function runMasterVisionModelLoop(input: {
  imageBase64: string;
  fileName?: string | null;
  models?: string[];
  maxTokens?: number;
}): Promise<MasterVisionLoopResult> {
  const startTime = logPipelineStart("masterVisionLoop", {
    fileName: input.fileName || null
  });
  let imageUrl: string;
  try {
    imageUrl = normalizeImageUrl(input.imageBase64);
  } catch (err) {
    logPipelineFail("masterVisionLoop", startTime, err);
    return { parses: [], lastError: err, upstreamStatus: null };
  }
  logPayloadSize("masterVisionLoop", imageUrl);

  const useLmStudio = isLmStudioDevMode();
  const { candidates, skipped } = buildVisionCandidates(useLmStudio, input.models);
  console.info(
    "[vision] chain:",
    candidates.length > 0
      ? candidates.map((c) => `${c.spec.id}/${c.model}`).join(" -> ")
      : "(none)",
    skipped.length > 0
      ? `| skipped: ${skipped.map((s) => `${s.label} (${s.envKey})`).join(", ")}`
      : ""
  );

  if (candidates.length === 0) {
    const e = new Error(buildVisionFailureMessage([], skipped));
    logPipelineFail("masterVisionLoop", startTime, e);
    throw e;
  }

  const maxTokens = 6000;
  const successes: MasterVisionParse[] = [];
  const attempts: VisionAttemptRecord[] = [];
  let lastError: unknown = null;
  let upstreamStatus: number | null = null;

  // --- Sequential key-gated chain (AR-23c, peaks amendment) ---
  // Walks providers in probed-live order. A non-VIBRATION lead parse keeps
  // the classic rule: stop at the first TWO successful parses. A VIBRATION
  // lead parse switches the chain into peaks mode: it only stops when two
  // parses AGREE on a non-null first peak (merge tolerance); otherwise it
  // advances past every pair — escalation through gpt-4o / OpenRouter —
  // ending either degraded-single (some parse carries peaks) or VISION_FAILED
  // with the per-provider list (chain exhausted, peaks still null).
  for (const candidate of candidates) {
    const leading = successes[0];
    const vibrationMode = leading !== undefined && isVibrationParse(leading.parsed);
    if (vibrationMode) {
      if (findAgreedPeaksPair(successes) !== null) break;
    } else if (successes.length >= 2) {
      break;
    }
    const { spec, model } = candidate;
    let attemptStatus: number | null = null;
    try {
      const { status, body } = await callVisionProvider(candidate, imageUrl, maxTokens);
      attemptStatus = status;
      upstreamStatus = status;
      logPipelineSend(`provider:${spec.id}`, { model, httpStatus: status });
      if (status < 200 || status >= 300) {
        throw new VisionHttpError(status, upstreamReason(body, status));
      }
      let json: Record<string, unknown>;
      try {
        json = parseBodyJson(body);
      } catch {
        throw new Error("response body is not JSON");
      }
      const text =
        spec.transport === "gemini" ? readGeminiText(json) : readOpenAiContent(json);
      if (!text) {
        throw new Error(`Vision model ${model} returned no text content.`);
      }
      // Parse guard — only a successfully fetched AND parsed payload counts.
      console.info("[vision] model:", model, "raw:", text);
      const cleanedJson = salvageJsonString(text);
      console.info("[vision] salvaged:", cleanedJson);
      if (!cleanedJson || !cleanedJson.startsWith("{") || !cleanedJson.endsWith("}")) {
        throw new Error("no JSON object in vision response");
      }
      successes.push({
        provider: spec.label,
        providerId: spec.id,
        model,
        parsed: sanitizeVibrationSpectralRows(parseMasterJsonStrict(cleanedJson))
      });
      console.info(`[vision] attempt ok: ${spec.label} ${model} http=${status}`);
      console.info(
        `[vision] answering provider: ${spec.label} (${spec.id}) model=${model} http=${status}`
      );
      const lead = successes[0];
      if (lead !== undefined && isVibrationParse(lead.parsed)) {
        const pair = findAgreedPeaksPair(successes);
        if (pair) {
          console.info(
            `[vision] consensus locked (peaks): ${successes[pair[0]].model} + ${successes[pair[1]].model}; provider chain stopped`
          );
        } else {
          console.info(
            `[vision] vibration peaks not yet agreed (successes=${successes.length}); advancing chain`
          );
        }
      } else if (successes.length === 2) {
        const a = successes[0];
        const b = successes[1];
        console.info(
          `[vision] consensus locked: ${a ? a.model : "?"} + ${b ? b.model : "?"}; provider chain stopped`
        );
      }
    } catch (err) {
      const httpStatus = err instanceof VisionHttpError ? err.httpStatus : attemptStatus;
      const reason =
        err instanceof VisionHttpError
          ? err.reason
          : err instanceof Error && err.message
            ? err.message
            : String(err);
      attempts.push({
        providerLabel: spec.label,
        providerId: spec.id,
        model,
        httpStatus,
        reason: clipReason(reason)
      });
      lastError = err;
      console.warn(
        `[vision] attempt failed: ${spec.label} ${model} http=${httpStatus ?? "n/a"} reason=${clipReason(reason)}`
      );
    }
  }

  const leadParse = successes[0];
  if (leadParse !== undefined && isVibrationParse(leadParse.parsed)) {
    const pair = findAgreedPeaksPair(successes);
    if (pair) {
      return {
        parses: [successes[pair[0]], successes[pair[1]]],
        lastError,
        upstreamStatus
      };
    }
    let peaksParse: MasterVisionParse | null = null;
    for (const p of successes) {
      if (parsePeaks(p.parsed) !== null) peaksParse = p;
    }
    if (peaksParse) {
      console.warn(
        `[vision] no provider pair agreed on vibration peaks; degraded single-parse fallback: ${peaksParse.model}`
      );
      return { parses: [peaksParse], lastError, upstreamStatus };
    }
    // AR-23e — strict path (printed amplitudes) is exhausted everywhere in the
    // chain: engage the gated geometry-estimate fallback when the parse
    // carries readable RPM + interior spike candidates. Strict peaks always
    // win when present; estimates are never consensus/single-labelled.
    const estimateParse =
      successes.find((p) => geometryEstimateEligible(p.parsed)) ?? null;
    if (estimateParse) {
      console.warn(
        `[vision] no printed-amplitude peaks; geometry-estimate fallback engaged (RPM/60): ${estimateParse.model}`
      );
      return { parses: [estimateParse], lastError, upstreamStatus };
    }
    // Chain exhausted with every parse peaks-null: honest VISION_FAILED with
    // the per-provider list — the HTTP-200 successes are reported too.
    for (const s of successes) {
      attempts.push({
        providerLabel: s.provider ?? "unknown",
        providerId: s.providerId ?? "unknown",
        model: s.model,
        httpStatus: 200,
        reason: "no spectral peaks in response"
      });
    }
    const vibFailure = new Error(buildVisionFailureMessage(attempts, skipped));
    logPipelineFail("masterVisionLoop", startTime, vibFailure);
    throw vibFailure;
  }

  if (successes.length > 0) {
    if (successes.length === 1) {
      console.warn("[vision] degraded single-model fallback; provider chain exhausted");
    }
    return { parses: successes, lastError, upstreamStatus };
  }

  const failure = new Error(buildVisionFailureMessage(attempts, skipped));
  logPipelineFail("masterVisionLoop", startTime, failure);
  throw failure;
}

/** Oil finalizer — consumes a set of master parses and returns oil-shaped data. */
export function finalizeOilFromParses(
  parses: MasterVisionParse[],
  lastError: unknown,
  input: { imageBase64: string; fileName?: string | null; models?: string[]; maxTokens?: number }
): OilVisionExtractResult {
  const startTime = logPipelineStart("oilVisionExtractor", {
    fileName: input.fileName || null
  });
  if (parses.length === 0) {
    logPipelineFail(
      "oilVisionExtractor",
      startTime,
      lastError || new Error("no content")
    );
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
  console.info(
    "[vision] extraction succeeded using provider/model:",
    parses
      .map((p) => `${p.provider ?? "unknown"}/${p.model}`)
      .join(" + ")
  );

  const detectedTech = typeof primary.parsed.detected_technology === "string"
    ? primary.parsed.detected_technology.toUpperCase()
    : null;
  const rawTableRows = (primary.parsed as Record<string, unknown>).raw_table;
  const looksLikeOil = rawTableLooksLikeOil(rawTableRows);
  const autoFillAllowed = detectedTech === "OIL" || looksLikeOil;
  if (!autoFillAllowed) {
    logPipelineFail(
      "oilVisionExtractor:gate",
      startTime,
      new Error(
        `technology not OIL (${primary.parsed.detected_technology}); oil markers=${rawTableLooksLikeOil(rawTableRows)}`
      )
    );
    return {
      success: false,
      error: "TECHNOLOGY_NOT_OIL",
      message: "Report type not recognized - enter values manually or re-upload.",
      httpStatus: 422,
      detail: `detected_technology=${String(primary.parsed.detected_technology)}`
    };
  }

  let mergedTx: OilTranscriptionResult | undefined;
  let flaggedFields: string[] = [];
  let extractionMode: VisionExtractionMode = "single";

  if (parses.length >= 2) {
    extractionMode = "consensus";
    const txA = mapOilTranscription((parses[0].parsed as Record<string, unknown>).raw_table);
    const txB = mapOilTranscription((parses[1].parsed as Record<string, unknown>).raw_table);
    const merged = mergeConsensus(txA, txB);
    mergedTx = merged.result;
    flaggedFields = merged.flaggedFields;
  } else {
    extractionMode = "single";
    const txA = mapOilTranscription((primary.parsed as Record<string, unknown>).raw_table);
    flaggedFields = flagAllFilled(txA);
  }

  const data = mapVisionJsonToOilReportData(primary.parsed, input.fileName, mergedTx);
  (data as unknown as Record<string, unknown>).model = usedModel;
  (data as unknown as Record<string, unknown>).detectedTechnology = "OIL";
  (data as unknown as Record<string, unknown>).flaggedFields = flaggedFields;
  (data as unknown as Record<string, unknown>).extractionMode = extractionMode;
  (data as unknown as Record<string, unknown>).consensusModels = modelIds;
  logPipelineSuccess("oilVisionExtractor", startTime, {
    confidence: data.confidenceScore,
    model: usedModel,
    format: data.formatDetected,
    extractionMode
  });

  return { success: true, data, model: modelIds.join(" + ") };
}
