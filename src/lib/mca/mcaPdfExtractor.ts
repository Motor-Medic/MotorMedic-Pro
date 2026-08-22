/**
 * Client-side MCA PDF text extraction (ALL-TEST Pro / Megger Baker / generic).
 * Uses local pdf.js worker — no CDN / network calls at runtime.
 */

import * as pdfjsLib from "pdfjs-dist";
// Vite resolves worker URL from node_modules (offline-capable)
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  sanitizeRicPoint,
  type RicDataPoint
} from "./rotorInfluenceCalculator";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type McaPdfFormat =
  | "ALL_TEST_PRO"
  | "MEGGER_BAKER"
  | "GENERIC_TABULAR"
  | "UNKNOWN";

export type McaInsulationClass = "A" | "B" | "F" | "H";

export interface McaExtractedData {
  phaseR: [number, number, number];
  phaseL: [number, number, number];
  phaseZ: [number, number, number];
  phaseFi: [number, number, number];
  phaseIF: [number, number, number];
  windingTempC?: number;
  ratedHp?: number;
  /** Groundwall / IR test voltage (V DC). */
  testVoltageV?: number;
  /** Insulation resistance at 15 s (MΩ). */
  ir15sMOmega?: number;
  /** Insulation resistance at 30 s (MΩ). */
  ir30sMOmega?: number;
  /** Insulation resistance at 1 min (MΩ). */
  ir1mMOmega?: number;
  /** Insulation resistance at 10 min (MΩ). */
  ir10mMOmega?: number;
  /** Pre-calculated Polarization Index from report. */
  reportPi?: number;
  /** Pre-calculated Dielectric Absorption Ratio from report. */
  reportDar?: number;
  insulationClass?: McaInsulationClass;
  /** Rotor Influence Check inductance-vs-angle series. */
  ricData?: RicDataPoint[];
  rawText: string;
  formatDetected: McaPdfFormat;
  confidenceScore: number;
}

export type { RicDataPoint };

type Triplet = [number, number, number];

const ZERO: Triplet = [0, 0, 0];

function isValidTriplet(t: Triplet | null | undefined): t is Triplet {
  return (
    Array.isArray(t) &&
    t.length >= 3 &&
    t.slice(0, 3).every((n) => Number.isFinite(n) && n !== 0)
  );
}

function hasAnyFinite(t: Triplet): boolean {
  return t.some((n) => Number.isFinite(n) && n !== 0);
}

function toTriplet(nums: number[]): Triplet | null {
  if (nums.length < 3) return null;
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  const c = Number(nums[2]);
  if (![a, b, c].every((n) => Number.isFinite(n))) return null;
  return [a, b, c];
}

function parseFloats(chunk: string): number[] {
  const out: number[] = [];
  const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) !== null) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Extract first 3 floats after a keyword (case-insensitive). */
function extractAfterKeyword(text: string, keywords: string[]): Triplet | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx < 0) continue;
    const window = text.slice(idx, idx + 280);
    const floats = parseFloats(window);
    // Skip the keyword's own embedded numbers if any; take first 3 plausible values
    const triplet = toTriplet(floats);
    if (triplet) return triplet;
  }
  return null;
}

/**
 * Megger/Baker style: collect values near T1-T2 / T2-T3 / T3-T1 (or Phase 1/2/3)
 * for a named metric, returning ordered triplet.
 */
function extractByPhaseLabels(
  text: string,
  metricKeywords: string[]
): Triplet | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const phaseKeys = [
    [/t1[\s\-–]*t2/i, /phase\s*1\b/i, /\bu[\s\-–]*v\b/i],
    [/t2[\s\-–]*t3/i, /phase\s*2\b/i, /\bv[\s\-–]*w\b/i],
    [/t3[\s\-–]*t1/i, /phase\s*3\b/i, /\bw[\s\-–]*u\b/i]
  ];

  const values: (number | null)[] = [null, null, null];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const metricHit = metricKeywords.some((k) =>
      new RegExp(k, "i").test(line)
    );
    const context = [line, lines[i + 1] || "", lines[i - 1] || ""].join(" ");

    for (let p = 0; p < 3; p++) {
      if (values[p] != null) continue;
      const labelHit = phaseKeys[p].some((re) => re.test(context));
      if (!labelHit && !metricHit) continue;
      if (labelHit) {
        // Prefer floats on same or next line when metric nearby in window
        const window = [lines[i - 1], line, lines[i + 1], lines[i + 2]]
          .filter(Boolean)
          .join(" ");
        const hasMetric =
          metricHit ||
          metricKeywords.some((k) => new RegExp(k, "i").test(window));
        if (!hasMetric) continue;
        const floats = parseFloats(window);
        if (floats.length > 0) values[p] = floats[0];
      }
    }
  }

  // Alternate: metric header row followed by three phase values
  if (values.some((v) => v == null)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!metricKeywords.some((k) => new RegExp(k, "i").test(line))) continue;
      const floats = parseFloats(
        [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ")
      );
      const t = toTriplet(floats);
      if (t) return t;
    }
  }

  if (values.every((v) => v != null && Number.isFinite(v))) {
    return [values[0]!, values[1]!, values[2]!];
  }
  return null;
}

function detectFormat(text: string): McaPdfFormat {
  const t = text.toLowerCase();
  if (
    /all[\s\-]?test/i.test(text) ||
    /at\d{2,}/i.test(text) ||
    (/resistance/i.test(text) && /i\/f/i.test(text) && /fi\s*\(/i.test(text))
  ) {
    return "ALL_TEST_PRO";
  }
  if (
    /megger/i.test(text) ||
    /baker/i.test(text) ||
    /awa\b/i.test(text) ||
    /adx\b/i.test(text) ||
    (/t1[\s\-–]*t2/i.test(text) && /t2[\s\-–]*t3/i.test(text))
  ) {
    return "MEGGER_BAKER";
  }
  if (
    /resistance|inductance|impedance|phase\s*angle/i.test(t) &&
    parseFloats(text).length >= 6
  ) {
    return "GENERIC_TABULAR";
  }
  return "UNKNOWN";
}

function extractWindingTemp(text: string): number | undefined {
  const m =
    text.match(
      /(?:winding\s*temp(?:erature)?|temp(?:erature)?\s*winding|Tw)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)\s*°?\s*C/i
    ) ||
    text.match(/([-+]?\d+(?:\.\d+)?)\s*°\s*C(?:\s*\(?winding)?/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function extractRatedHp(text: string): number | undefined {
  const m =
    text.match(/(?:rated\s*)?(?:hp|horsepower)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/i) ||
    text.match(/([-+]?\d+(?:\.\d+)?)\s*(?:hp|HP)\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Convert a magnitude + optional GΩ/MΩ/kΩ unit token into MΩ. */
function toMegaOhms(value: number, unitHint?: string): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const u = String(unitHint || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!u) {
    // Bare numbers on IR reports are almost always MΩ (or GΩ if tiny like 0.5–50 and labeled elsewhere)
    return value;
  }
  if (/^g|gω|gohm|gohms|gΩ|gig/.test(u)) return value * 1000;
  if (/^k|kω|kohm|kohms|kΩ/.test(u)) return value / 1000;
  if (/^m|mω|mohm|mohms|mΩ|meg/.test(u)) return value;
  if (/ohm|Ω|ω/.test(u) && !/[gkm]/.test(u)) return value / 1e6; // raw ohms → MΩ
  return value;
}

function parseUnitCapture(raw: string | undefined): string {
  return String(raw || "").trim();
}

/**
 * Match first IR magnitude after a label; tolerates newlines between label and value.
 */
function matchIrValue(
  text: string,
  patterns: RegExp[]
): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(String(m[1]).replace(/,/g, ""));
    const unit = parseUnitCapture(m[2] || m[3] || m[4]);
    const mega = toMegaOhms(n, unit);
    if (mega != null && mega > 0) return mega;
  }
  return undefined;
}

/**
 * Scan line-oriented layouts:
 *   "30 s    450 MΩ"
 *   "IR @ 1 min: 1.2 GΩ"
 *   "R60  880"
 * Also tabular header rows: "15s  30s  1m  10m" then values on next line.
 */
function extractIrFromLines(
  text: string
): Partial<{
  ir15sMOmega: number;
  ir30sMOmega: number;
  ir1mMOmega: number;
  ir10mMOmega: number;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: {
    ir15sMOmega?: number;
    ir30sMOmega?: number;
    ir1mMOmega?: number;
    ir10mMOmega?: number;
  } = {};

  const assign = (
    key: keyof typeof out,
    value: number | undefined
  ) => {
    if (value == null || !(value > 0)) return;
    if (out[key] == null) out[key] = value;
  };

  const valueOnLine = (line: string): number | undefined => {
    // Prefer explicit unit tokens
    const withUnit = line.match(
      /([-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?)\s*(GΩ|GOhm|Gohms|G\s*Ω|MΩ|MOhm|Mohms|M\s*Ω|Megohm|Megohms|kΩ|kOhm|KΩ|G|M|K)\b/i
    );
    if (withUnit) {
      return toMegaOhms(
        Number(withUnit[1].replace(/,/g, "")),
        withUnit[2]
      );
    }
    const bare = line.match(
      /(?:^|[:=\s])([-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?)(?:\s|$)/
    );
    if (bare) {
      const n = Number(bare[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 1e9) return n; // assume MΩ
    }
    return undefined;
  };

  const classifyInterval = (
    line: string
  ): keyof typeof out | null => {
    const s = line.toLowerCase();
    // Order matters: 15 before 1, 10 before 1, 30 before 3
    if (
      /\b(?:ir[\s_\-]*)?15\s*(?:s|sec|secs|seconds?)\b/.test(s) ||
      /\br\s*15\b/.test(s) ||
      /\b15\s*s(?:ec)?\b/.test(s)
    ) {
      return "ir15sMOmega";
    }
    if (
      /\b(?:ir[\s_\-]*)?30\s*(?:s|sec|secs|seconds?)\b/.test(s) ||
      /\br\s*30\b/.test(s) ||
      /\br30\b/.test(s) ||
      /\b30\s*s(?:ec)?\b/.test(s)
    ) {
      return "ir30sMOmega";
    }
    if (
      /\b(?:ir[\s_\-]*)?10\s*(?:m|min|mins|minutes?)\b/.test(s) ||
      /\br\s*10\b/.test(s) ||
      /\br10(?:min)?\b/.test(s) ||
      /\br\s*600\b/.test(s) ||
      /\b600\s*s(?:ec)?\b/.test(s) ||
      /\b10\s*min/.test(s)
    ) {
      return "ir10mMOmega";
    }
    if (
      /\b(?:ir[\s_\-]*)?1\s*(?:m|min|mins|minutes?)\b/.test(s) ||
      /\b(?:ir[\s_\-]*)?60\s*(?:s|sec|secs|seconds?)\b/.test(s) ||
      /\br\s*60\b/.test(s) ||
      /\br60\b/.test(s) ||
      /\br1(?:min)?\b/.test(s) ||
      /\b1\s*min/.test(s) ||
      /\bir[\s_\-]*1\s*m\b/.test(s)
    ) {
      return "ir1mMOmega";
    }
    return null;
  };

  // Header row with multiple time columns → values on following line(s)
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].toLowerCase();
    const hasMulti =
      (/15/.test(header) || /30/.test(header)) &&
      (/1\s*m|60\s*s|10\s*m/.test(header) ||
        (/30/.test(header) && /10/.test(header)));
    const looksHeader =
      hasMulti &&
      /(ir|mΩ|mohm|ohm|sec|min|time|resistance)/i.test(header);
    if (!looksHeader) continue;

    const slots: (keyof typeof out)[] = [];
    const tokenRe =
      /15\s*s(?:ec)?|30\s*s(?:ec)?|60\s*s(?:ec)?|1\s*m(?:in)?|10\s*m(?:in)?|r15|r30|r60|r10/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tokenRe.exec(header)) !== null) {
      const key = classifyInterval(tm[0]);
      if (key) slots.push(key);
    }
    if (slots.length < 2) continue;

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const nums: number[] = [];
      const numRe =
        /([-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?)\s*(GΩ|GOhm|MΩ|MOhm|Megohm|kΩ|kOhm|G|M|K)?/gi;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(lines[j])) !== null) {
        const mega = toMegaOhms(
          Number(nm[1].replace(/,/g, "")),
          nm[2] || "M"
        );
        if (mega != null && mega > 0) nums.push(mega);
      }
      if (nums.length >= 2) {
        for (let k = 0; k < Math.min(slots.length, nums.length); k++) {
          assign(slots[k], nums[k]);
        }
        break;
      }
    }
  }

  // Per-line label + value (same line or next line)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = classifyInterval(line);
    if (!key) continue;
    let val = valueOnLine(line);
    // Value alone on next line (common in ALL-TEST / Baker exports)
    if (val == null && lines[i + 1]) {
      const nextKey = classifyInterval(lines[i + 1]);
      if (!nextKey) val = valueOnLine(lines[i + 1]);
    }
    assign(key, val);
  }

  return out;
}

function extractRatioMetric(
  text: string,
  patterns: RegExp[],
  max = 50
): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && n < max) return n;
  }
  return undefined;
}

function extractTestVoltageV(text: string): number | undefined {
  const m =
    text.match(
      /(?:test\s*voltage|applied\s*voltage|v\s*test|megger\s*voltage|ir\s*test\s*voltage|voltage)\s*[:=]?\s*([-+]?\d+(?:[.,]\d+)?)\s*(?:v\s*dc|vdc|v)?/i
    ) ||
    text.match(/([-+]?\d+(?:[.,]\d+)?)\s*(?:v\s*dc|vdc)\b/i) ||
    text.match(/\b(250|500|1000|2500|5000|10000)\s*V(?:\s*DC)?\b/i);
  if (!m) return undefined;
  const n = Number(String(m[1]).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractInsulationClass(text: string): McaInsulationClass | undefined {
  const m = text.match(
    /(?:insulation\s*class|class\s*of\s*insulation|temp(?:erature)?\s*class|thermal\s*class)\s*[:=]?\s*(?:class\s*)?([ABFH])/i
  );
  if (!m) return undefined;
  const c = m[1].toUpperCase();
  if (c === "A" || c === "B" || c === "F" || c === "H") return c;
  return undefined;
}

/**
 * Parse groundwall IR / PI / DAR fields from report text (MΩ basis).
 * Handles ALL-TEST Pro, Megger ADX, Baker AWA, and generic tabular layouts.
 */
function extractGroundwallMetrics(text: string): Partial<McaExtractedData> {
  if (!text || !text.trim()) return {};

  // Normalize common PDF quirks for regex matching
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/M\s*Ω/gi, "MΩ")
    .replace(/G\s*Ω/gi, "GΩ")
    .replace(/Mohm?s?/gi, "MΩ")
    .replace(/Gohm?s?/gi, "GΩ");

  const fromLines = extractIrFromLines(normalized);

  const ir15sMOmega =
    fromLines.ir15sMOmega ??
    matchIrValue(normalized, [
      /(?:IR[\s_\-]*15\s*s|15\s*(?:sec(?:onds?)?|s)\s*(?:IR|insulation)?|insulation\s*resistance\s*@?\s*15\s*s)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ|kΩ)?/i,
      /15\s*s(?:ec)?\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i,
      /\bR\s*15\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i
    ]);

  const ir30sMOmega =
    fromLines.ir30sMOmega ??
    matchIrValue(normalized, [
      /(?:IR[\s_\-]*30\s*s|30\s*(?:sec(?:onds?)?|s)\s*(?:IR|insulation)?|DAR\s*30|IR\s*@?\s*30)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ|kΩ)?/i,
      /(?:IR\s*@?\s*30\s*s|R\s*30|R30)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i,
      /30\s*(?:sec(?:onds?)?|s)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i
    ]);

  const ir1mMOmega =
    fromLines.ir1mMOmega ??
    matchIrValue(normalized, [
      /(?:IR[\s_\-]*1\s*m(?:in)?(?:ute)?|1\s*min(?:ute)?\s*(?:IR|insulation)?|IR[\s_\-]*60\s*s|IR\s*@?\s*1\s*min|R\s*60|R60|R\s*1\s*min)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ|kΩ)?/i,
      /60\s*(?:sec(?:onds?)?|s)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i,
      /1\s*min(?:ute)?s?\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i
    ]);

  // Generic "Insulation Resistance" / "IR =" only if 1m still missing (avoid stealing 30s/10m)
  const ir1mFallback =
    ir1mMOmega ??
    matchIrValue(normalized, [
      /(?:insulation\s*resistance|megohm\s*reading|ir\s*reading)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i
    ]);

  const ir10mMOmega =
    fromLines.ir10mMOmega ??
    matchIrValue(normalized, [
      /(?:IR[\s_\-]*10\s*m(?:in)?(?:ute)?|10\s*min(?:ute)?\s*(?:IR|insulation)?|IR\s*@?\s*10\s*min|R\s*10|R10|R\s*600|R600)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ|kΩ)?/i,
      /10\s*min(?:ute)?s?\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i,
      /600\s*(?:sec(?:onds?)?|s)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)\s*(G|M|K|GΩ|MΩ)?/i
    ]);

  let reportPi = extractRatioMetric(normalized, [
    /(?:polarization\s*index|\bP\.?\s*I\.?\b)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i,
    /\bPI\b\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i,
    /(?:10\s*min\s*\/\s*1\s*min|R10\s*\/\s*R60|R10\s*\/\s*R1)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i
  ]);
  let reportDar = extractRatioMetric(normalized, [
    /(?:dielectric\s*absorption(?:\s*ratio)?|\bD\.?\s*A\.?\s*R\.?\b)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i,
    /\bDAR\b\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i,
    /(?:60\s*s\s*\/\s*30\s*s|R60\s*\/\s*R30|1\s*min\s*\/\s*30\s*s)\s*[:=\s]+([-+]?\d+(?:[.,]\d+)?)/i
  ]);

  // Derive PI / DAR from IR points when the report omits them
  const ir1 = ir1mFallback;
  const ir30 = ir30sMOmega;
  const ir10 = ir10mMOmega;
  if (reportPi == null && ir10 != null && ir1 != null && ir1 > 0) {
    const derived = ir10 / ir1;
    if (derived > 0 && derived < 50) reportPi = Math.round(derived * 1000) / 1000;
  }
  if (reportDar == null && ir1 != null && ir30 != null && ir30 > 0) {
    const derived = ir1 / ir30;
    if (derived > 0 && derived < 50) reportDar = Math.round(derived * 1000) / 1000;
  }

  const testVoltageV = extractTestVoltageV(normalized);
  const insulationClass = extractInsulationClass(normalized);

  return {
    ...(ir15sMOmega != null ? { ir15sMOmega } : {}),
    ...(ir30 != null ? { ir30sMOmega: ir30 } : {}),
    ...(ir1 != null ? { ir1mMOmega: ir1 } : {}),
    ...(ir10 != null ? { ir10mMOmega: ir10 } : {}),
    ...(reportPi != null ? { reportPi } : {}),
    ...(reportDar != null ? { reportDar } : {}),
    ...(testVoltageV != null ? { testVoltageV } : {}),
    ...(insulationClass != null ? { insulationClass } : {})
  };
}

/**
 * Parse RIC tables: angle / position (0–360°) with T1-T2 / T2-T3 / T3-T1 inductance.
 */
function extractRicData(text: string): RicDataPoint[] | undefined {
  if (!text) return undefined;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byAngle = new Map<number, RicDataPoint>();

  const looksLikeRicContext = /ric|rotor\s*influence|rotor\s*check|inductance\s*vs|position\s*\(/i.test(
    text
  );

  for (const line of lines) {
    if (/angle|position|deg|l12|t1[\s\-–]*t2|header/i.test(line) && !/\d/.test(line)) {
      continue;
    }

    // Pattern: angle then three inductances (mH)
    const m =
      line.match(
        /(?:^|\s)(\d{1,3}(?:\.\d+)?)\s*°?\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)/
      ) ||
      line.match(
        /(\d{1,3}(?:\.\d+)?)\s*[,;\t|]\s*([-+]?\d+(?:\.\d+)?)\s*[,;\t|]\s*([-+]?\d+(?:\.\d+)?)\s*[,;\t|]\s*([-+]?\d+(?:\.\d+)?)/
      );

    if (!m) continue;
    const angle = Number(m[1]);
    const l12 = Number(m[2]);
    const l23 = Number(m[3]);
    const l31 = Number(m[4]);
    const point = sanitizeRicPoint({ angle, l12, l23, l31 });
    if (!point) continue;

    // Prefer RIC-context rows; still accept dense angle tables (many 0–360 samples)
    if (!looksLikeRicContext && !(angle % 10 === 0 || angle % 5 === 0)) {
      // Keep if inductance magnitudes look like mH motor windings (0.1–500)
      if (l12 < 0.05 || l12 > 2000) continue;
    }
    byAngle.set(Math.round(point.angle * 10) / 10, point);
  }

  // Alternate: scan whole text for "0° ... 10° ..." blocks near RIC keywords
  if (byAngle.size < 3 && looksLikeRicContext) {
    const floatRe =
      /(\d{1,3}(?:\.\d+)?)\s*°\s*[^\d-+]*([-+]?\d+(?:\.\d+)?)\s+[^\d-+]*([-+]?\d+(?:\.\d+)?)\s+[^\d-+]*([-+]?\d+(?:\.\d+)?)/g;
    let mm: RegExpExecArray | null;
    while ((mm = floatRe.exec(text)) !== null) {
      const point = sanitizeRicPoint({
        angle: Number(mm[1]),
        l12: Number(mm[2]),
        l23: Number(mm[3]),
        l31: Number(mm[4])
      });
      if (point) byAngle.set(Math.round(point.angle * 10) / 10, point);
    }
  }

  if (byAngle.size < 3) return undefined;
  return [...byAngle.values()].sort((a, b) => a.angle - b.angle);
}

function parseAllTestPro(text: string): Partial<McaExtractedData> {
  return {
    phaseR: extractAfterKeyword(text, [
      "Resistance (Ω)",
      "Resistance (Ohms)",
      "R (Ω)",
      "Resistance"
    ]) || ZERO,
    phaseL: extractAfterKeyword(text, [
      "Inductance (mH)",
      "L (mH)",
      "Inductance"
    ]) || ZERO,
    phaseZ: extractAfterKeyword(text, [
      "Impedance (Ω)",
      "Z (Ω)",
      "Impedance"
    ]) || ZERO,
    phaseFi: extractAfterKeyword(text, [
      "Phase Angle (Fi)",
      "Fi (°)",
      "Phase Angle",
      "Fi"
    ]) || ZERO,
    phaseIF: extractAfterKeyword(text, [
      "I/F (%)",
      "I/F",
      "IF (%)",
      "Current/Frequency"
    ]) || ZERO
  };
}

function parseMeggerBaker(text: string): Partial<McaExtractedData> {
  return {
    phaseR:
      extractByPhaseLabels(text, ["resistance", "ohms", "r\\s*\\(Ω\\)", "Ω"]) ||
      ZERO,
    phaseL:
      extractByPhaseLabels(text, ["inductance", "mH", "l\\s*\\(mH\\)"]) || ZERO,
    phaseZ:
      extractByPhaseLabels(text, ["impedance", "z\\s*\\(Ω\\)"]) || ZERO,
    phaseFi:
      extractByPhaseLabels(text, ["phase\\s*angle", "fi\\s*\\(", "degrees"]) ||
      ZERO,
    phaseIF:
      extractByPhaseLabels(text, ["i\\/f", "if\\s*ratio", "current.?frequency"]) ||
      ZERO
  };
}

function parseGenericTabular(text: string): Partial<McaExtractedData> {
  return {
    phaseR:
      extractAfterKeyword(text, ["Resistance", "R (Ω)", "Ohms"]) || ZERO,
    phaseL:
      extractAfterKeyword(text, ["Inductance", "L (mH)", "mH"]) || ZERO,
    phaseZ:
      extractAfterKeyword(text, ["Impedance", "Z (Ω)"]) || ZERO,
    phaseFi:
      extractAfterKeyword(text, ["Phase Angle", "Fi", "Degrees"]) || ZERO,
    phaseIF:
      extractAfterKeyword(text, ["I/F", "IF", "Current/Frequency"]) || ZERO
  };
}

function confidenceFromMetrics(data: {
  phaseR: Triplet;
  phaseL: Triplet;
  phaseZ: Triplet;
  phaseFi: Triplet;
  phaseIF: Triplet;
  groundwall?: Partial<McaExtractedData>;
}): number {
  const arrays = [
    data.phaseR,
    data.phaseL,
    data.phaseZ,
    data.phaseFi,
    data.phaseIF
  ];
  let score = 100;
  for (const arr of arrays) {
    if (!isValidTriplet(arr) && !hasAnyFinite(arr)) score -= 20;
    else if (!isValidTriplet(arr)) score -= 10;
  }
  // Groundwall-only reports should not look like a failed extract
  const gw = data.groundwall;
  if (gw) {
    let gwHits = 0;
    if (gw.ir30sMOmega != null && gw.ir30sMOmega > 0) gwHits += 1;
    if (gw.ir1mMOmega != null && gw.ir1mMOmega > 0) gwHits += 1;
    if (gw.ir10mMOmega != null && gw.ir10mMOmega > 0) gwHits += 1;
    if (gw.reportPi != null && gw.reportPi > 0) gwHits += 1;
    if (gw.reportDar != null && gw.reportDar > 0) gwHits += 1;
    if (gwHits >= 2) score = Math.max(score, 55 + gwHits * 8);
    else if (gwHits === 1) score = Math.max(score, 40);
  }
  return Math.max(0, Math.min(100, score));
}

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

/** Rebuild reading-order lines from pdf.js text items (preserves IR tables). */
function textItemsToLines(items: PdfTextItem[]): string {
  type Row = { y: number; parts: { x: number; s: string }[] };
  const rows: Row[] = [];
  const yTol = 3.5;

  for (const item of items) {
    const s = String(item.str || "");
    if (!s.trim()) continue;
    const tr = item.transform;
    const x = Array.isArray(tr) && tr.length >= 5 ? Number(tr[4]) : 0;
    const y = Array.isArray(tr) && tr.length >= 6 ? Number(tr[5]) : 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= yTol);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x: Number.isFinite(x) ? x : 0, s });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let line = "";
      let prevX: number | null = null;
      for (const p of r.parts) {
        if (prevX != null && p.x - prevX > 2) line += " ";
        line += p.s;
        prevX = p.x + p.s.length * 4;
      }
      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items || []) as PdfTextItem[];
    const structured = textItemsToLines(items);
    // Fallback flat join if structure yielded almost nothing
    if (structured.replace(/\s/g, "").length >= 20) {
      parts.push(structured);
    } else {
      parts.push(
        items
          .map((item) => String(item.str || ""))
          .join(" ")
          .trim()
      );
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Parse an MCA instrument PDF entirely in-browser.
 */
export async function extractMcaDataFromPdf(
  file: File
): Promise<McaExtractedData> {
  let rawText = "";
  try {
    rawText = await extractPdfText(file);
  } catch (err) {
    console.warn("[mcaPdfExtractor] PDF parse failed:", err);
    return {
      phaseR: ZERO,
      phaseL: ZERO,
      phaseZ: ZERO,
      phaseFi: ZERO,
      phaseIF: ZERO,
      rawText: "",
      formatDetected: "UNKNOWN",
      confidenceScore: 0
    };
  }

  const formatDetected = detectFormat(rawText);
  let parsed: Partial<McaExtractedData>;
  if (formatDetected === "ALL_TEST_PRO") {
    parsed = parseAllTestPro(rawText);
  } else if (formatDetected === "MEGGER_BAKER") {
    parsed = parseMeggerBaker(rawText);
  } else if (formatDetected === "GENERIC_TABULAR") {
    parsed = parseGenericTabular(rawText);
  } else {
    // Try ALL-TEST then Megger then generic
    parsed = parseAllTestPro(rawText);
    const confProbe = confidenceFromMetrics({
      phaseR: (parsed.phaseR as Triplet) || ZERO,
      phaseL: (parsed.phaseL as Triplet) || ZERO,
      phaseZ: (parsed.phaseZ as Triplet) || ZERO,
      phaseFi: (parsed.phaseFi as Triplet) || ZERO,
      phaseIF: (parsed.phaseIF as Triplet) || ZERO
    });
    if (confProbe < 40) {
      const megger = parseMeggerBaker(rawText);
      const conf2 = confidenceFromMetrics({
        phaseR: (megger.phaseR as Triplet) || ZERO,
        phaseL: (megger.phaseL as Triplet) || ZERO,
        phaseZ: (megger.phaseZ as Triplet) || ZERO,
        phaseFi: (megger.phaseFi as Triplet) || ZERO,
        phaseIF: (megger.phaseIF as Triplet) || ZERO
      });
      if (conf2 > confProbe) parsed = megger;
      else parsed = { ...parsed, ...parseGenericTabular(rawText) };
    }
  }

  const phaseR = (parsed.phaseR as Triplet) || ZERO;
  const phaseL = (parsed.phaseL as Triplet) || ZERO;
  const phaseZ = (parsed.phaseZ as Triplet) || ZERO;
  const phaseFi = (parsed.phaseFi as Triplet) || ZERO;
  const phaseIF = (parsed.phaseIF as Triplet) || ZERO;

  const windingTempC = extractWindingTemp(rawText);
  const ratedHp = extractRatedHp(rawText);
  const groundwall = extractGroundwallMetrics(rawText);
  const ricData = extractRicData(rawText);
  const confidenceScore = confidenceFromMetrics({
    phaseR,
    phaseL,
    phaseZ,
    phaseFi,
    phaseIF,
    groundwall
  });

  return {
    phaseR,
    phaseL,
    phaseZ,
    phaseFi,
    phaseIF,
    ...(windingTempC != null ? { windingTempC } : {}),
    ...(ratedHp != null ? { ratedHp } : {}),
    ...groundwall,
    ...(ricData && ricData.length > 0 ? { ricData } : {}),
    rawText,
    formatDetected,
    confidenceScore
  };
}

/**
 * Unified entry: PDF (text extract) or image screenshot of a digital report.
 * Images without selectable text cannot be OCR'd client-side — returns empty
 * groundwall so the UI can prompt manual entry / PDF re-export.
 */
export async function extractMcaDataFromFile(
  file: File
): Promise<McaExtractedData> {
  const name = file.name || "";
  const type = file.type || "";
  if (/\.pdf$/i.test(name) || type === "application/pdf") {
    return extractMcaDataFromPdf(file);
  }
  if (/^image\//i.test(type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) {
    // Prefer PDF exports for reliable IR tables; image screenshots need OCR.
    console.warn(
      "[mcaPdfExtractor] Image upload detected — use a text PDF export for auto IR/PI/DAR extraction."
    );
    return {
      phaseR: ZERO,
      phaseL: ZERO,
      phaseZ: ZERO,
      phaseFi: ZERO,
      phaseIF: ZERO,
      rawText: "",
      formatDetected: "UNKNOWN",
      confidenceScore: 0
    };
  }
  return extractMcaDataFromPdf(file);
}

export function formatMcaPdfLabel(format: McaPdfFormat): string {
  switch (format) {
    case "ALL_TEST_PRO":
      return "ALL-TEST Pro";
    case "MEGGER_BAKER":
      return "Megger / Baker";
    case "GENERIC_TABULAR":
      return "Generic Tabular";
    default:
      return "Unknown";
  }
}

/** True when groundwall IR / PI / DAR were extracted. */
export function mcaExtractHasGroundwall(data: McaExtractedData | null | undefined): boolean {
  if (!data) return false;
  return (
    (data.ir1mMOmega != null && data.ir1mMOmega > 0) ||
    (data.ir30sMOmega != null && data.ir30sMOmega > 0) ||
    (data.ir10mMOmega != null && data.ir10mMOmega > 0) ||
    (data.ir15sMOmega != null && data.ir15sMOmega > 0) ||
    (data.reportPi != null && data.reportPi > 0) ||
    (data.reportDar != null && data.reportDar > 0)
  );
}
