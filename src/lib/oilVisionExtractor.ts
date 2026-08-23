/**
 * Oil lab report screenshot / PDF page → structured OilReportData via OpenRouter vision.
 * Mirrors MCA vision pattern (prompt + model fallbacks + strict JSON mapping).
 */

import {
  OPENROUTER_API_BASE,
  OPENROUTER_CONSENSUS_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_VISION_MODEL,
  hasOpenRouterKey,
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

export const OIL_VISION_API_PATH = "/api/oil-analysis/vision-extract";

export const OIL_VISION_MODELS = [
  OPENROUTER_VISION_MODEL,
  OPENROUTER_VISION_FALLBACK_MODEL,
  OPENROUTER_CONSENSUS_MODEL,
  "google/gemini-2.0-flash-001"
] as const;

const EXTRACTION_TIMEOUT_MS = 90_000;

export const OIL_VISION_PROMPT = `
You are a Level II Oil Analysis technician reading a laboratory oil analysis report
(Polaris, TestOil, ALS Tribology, Bureau Veritas, or similar PDF/screenshot).

CRITICAL: Return ONE JSON object with the schema below. Use null for fields not visible.
Never invent numbers. Prefer PPM for wear metals. Dates as YYYY-MM-DD when possible.

REQUIRED JSON (no markdown, no commentary):
{
  "formatDetected": "POLARIS" | "TESTOIL" | "ALS" | "BUREAU_VERITAS" | "GENERIC_LAB" | "UNKNOWN",
  "confidenceScore": <0-100>,
  "rawNotes": <string or null>,
  "header": {
    "labName": <string or null>,
    "reportNumber": <string or null>,
    "sampleDate": <YYYY-MM-DD or null>,
    "receivedDate": <YYYY-MM-DD or null>,
    "assetId": <string or null>,
    "assetDescription": <string or null>,
    "component": <string or null>,
    "lubricantBrand": <string or null>,
    "lubricantGrade": <string or null>,
    "samplePoint": <string or null>
  },
  "metals": {
    "iron": <PPM or null>,
    "copper": <PPM or null>,
    "chromium": <PPM or null>,
    "lead": <PPM or null>,
    "aluminum": <PPM or null>,
    "silicon": <PPM or null>,
    "tin": <PPM or null>,
    "nickel": <PPM or null>,
    "molybdenum": <PPM or null>,
    "magnesium": <PPM or null>,
    "calcium": <PPM or null>,
    "zinc": <PPM or null>,
    "sodium": <PPM or null>,
    "potassium": <PPM or null>,
    "boron": <PPM or null>,
    "silver": <PPM or null>,
    "titanium": <PPM or null>,
    "vanadium": <PPM or null>
  },
  "fluidProperties": {
    "viscosity40C": <cSt @ 40°C or null>,
    "viscosity100C": <cSt @ 100°C or null>,
    "viscosityIndex": <number or null>,
    "waterPpm": <PPM or null>,
    "waterPercent": <% or null>,
    "acidNumber": <TAN mg KOH/g or null>,
    "baseNumber": <TBN mg KOH/g or null>,
    "oxidation": <number or null>,
    "nitration": <number or null>,
    "sulfation": <number or null>,
    "sootPercent": <% or null>,
    "flashPointC": <°C or null>,
    "particleCountIso4406": <"XX/YY/ZZ" or null>,
    "pqIndex": <number or null>
  },
  "operatingParams": {
    "operatingHours": <number or null>,
    "oilHours": <number or null>,
    "milesOrKm": <number or null>,
    "makeUpOilLiters": <number or null>,
    "filterChanged": <true|false|null>,
    "oilChanged": <true|false|null>
  }
}

Element aliases: Fe=iron, Cu=copper, Cr=chromium, Pb=lead, Al=aluminum, Si=silicon,
Sn=tin, Ni=nickel, Mo=molybdenum, Mg=magnesium, Ca=calcium, Zn=zinc, Na=sodium, K=potassium.
`.trim();

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

/** Map raw vision JSON → typed OilReportData. */
export function mapVisionJsonToOilReportData(
  parsed: Record<string, unknown>,
  fileName?: string | null
): OilReportData {
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

  const useLmStudio = isLmStudioDevMode();
  if (!useLmStudio && !hasOpenRouterKey()) {
    logPipelineFail(
      "oilVisionExtractor",
      startTime,
      new Error("OPENROUTER_API_KEY missing")
    );
    return {
      success: false,
      error: "MISSING_API_KEY",
      message:
        "OPENROUTER_API_KEY is not configured. Set it in .env for oil report vision extraction.",
      httpStatus: 503
    };
  }

  const upstreamUrl = useLmStudio
    ? process.env.LM_STUDIO_ENDPOINT!
    : `${OPENROUTER_API_BASE}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (!useLmStudio) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY!.trim()}`;
    Object.assign(headers, openRouterRefererHeaders());
  }

  const modelsToTry = (
    useLmStudio
      ? [process.env.LM_STUDIO_MODEL || OIL_VISION_MODELS[0]]
      : input.models && input.models.length > 0
        ? input.models
        : [...OIL_VISION_MODELS]
  ).filter((m, i, arr) => arr.indexOf(m) === i);

  const maxTokens = input.maxTokens ?? 4500;
  let lastError: unknown;
  let content: string | null = null;
  let usedModel = modelsToTry[0];

  logPipelineSend("oilVisionExtractor", {
    provider: useLmStudio ? "lm-studio-dev" : "openrouter",
    models: modelsToTry
  });

  for (const tryModel of modelsToTry) {
    usedModel = tryModel;
    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
        body: JSON.stringify({
          model: tryModel,
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imageUrl } },
                { type: "text", text: OIL_VISION_PROMPT }
              ]
            }
          ]
        })
      });

      const upstreamJson = (await upstream.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!upstream.ok) {
        lastError = new Error(
          (typeof upstreamJson.error === "string" && upstreamJson.error) ||
            `Vision provider HTTP ${upstream.status} (${tryModel})`
        );
        console.warn(
          `[oilVisionExtractor] Model ${tryModel} failed:`,
          upstream.status,
          upstreamJson
        );
        continue;
      }

      const choices = upstreamJson.choices;
      const first =
        Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
          ? (choices[0] as { message?: { content?: string } })
          : null;
      const text =
        first?.message?.content ||
        (typeof upstreamJson.content === "string"
          ? upstreamJson.content
          : null);

      if (text && typeof text === "string") {
        content = text;
        break;
      }

      lastError = new Error(`Vision model ${tryModel} returned no text content.`);
    } catch (fetchErr) {
      lastError = fetchErr;
      console.warn(`[oilVisionExtractor] Model ${tryModel} fetch error:`, fetchErr);
    }
  }

  if (!content) {
    logPipelineFail(
      "oilVisionExtractor",
      startTime,
      lastError || new Error("no content")
    );
    return {
      success: false,
      error: "VISION_EMPTY",
      message:
        "Could not extract oil analysis fields from the image. Try a clearer full-report PNG/JPEG.",
      httpStatus: 422,
      detail:
        lastError instanceof Error ? lastError.message : String(lastError || "")
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObjectText(content)) as Record<
      string,
      unknown
    >;
  } catch (err) {
    logPipelineFail("oilVisionExtractor:parse", startTime, err);
    return {
      success: false,
      error: "PARSE_FAILED",
      message:
        "Could not parse oil analysis JSON from the vision model. Try another screenshot.",
      httpStatus: 422,
      detail: err instanceof Error ? err.message : String(err)
    };
  }

  const data = mapVisionJsonToOilReportData(parsed, input.fileName);
  logPipelineSuccess("oilVisionExtractor", startTime, {
    confidence: data.confidenceScore,
    model: usedModel,
    format: data.formatDetected
  });

  return { success: true, data, model: usedModel };
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
        "Oil vision extraction timed out. Try a clearer screenshot."
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
    throw new Error(
      (typeof result.error === "string" && result.error) ||
        (typeof result.message === "string" && result.message) ||
        `Oil vision extraction failed (${response.status}).`
    );
  }

  if (result.data && typeof result.data === "object") {
    return mapVisionJsonToOilReportData(
      result.data as Record<string, unknown>,
      imageFile.name
    );
  }

  return mapVisionJsonToOilReportData(result, imageFile.name);
}
