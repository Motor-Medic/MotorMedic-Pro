/**
 * Server-side GPT-4o Vision: locate TWF / FFT / Envelope panels and extract peaks.
 * Keep this module server-only (OpenAI SDK) — client uses spectrumChartRegions.ts.
 *
 * FFT vs D-Mod disambiguation priority:
 *   1. X-axis tick density (FFT ≈ 8–12 labels, D-Mod ≈ 4–6)
 *   2. Panel position (top-right = envelope, bottom = FFT)
 * Axis units alone are unreliable — both panels are often in Hz.
 */

import OpenAI from "openai";
import {
  normalizeBox,
  type ChartAxisRange,
  type ChartRegionKind,
  type NormalizedBox,
  type SpectrumChartPeak,
  type SpectrumRegionDetection
} from "./spectrumChartRegions";

const OPENAI_VISION_MODELS = ["gpt-4o", "gpt-4-turbo"] as const;

const SYSTEM_PROMPT = `You are an expert vibration analyst reading multi-panel analyzer screenshots (SmartCBM, CSI, etc.).
Identify chart panel regions by POSITION and by X-AXIS TICK DENSITY.
Standard layout: top-left = Time Waveform, top-right = D-Mod/Envelope, bottom = FFT Spectrum.
FFT panels have MANY x-axis numeric ticks (typically 8–12). D-Mod/Envelope has FEWER (typically 4–6).
Both spectral panels may use Hz — do not use axis units alone.
Return JSON only.`;

function stripDataUrl(imageBase64: string): { data: string; mimeType: string } {
  const trimmed = imageBase64.trim();
  const mimeMatch = /^data:(image\/\w+);base64,/i.exec(trimmed);
  const mimeType = mimeMatch?.[1] || "image/png";
  const data = trimmed.replace(/^data:image\/\w+;base64,/, "");
  return { data, mimeType };
}

function parseVisionJsonResponse(text: string): unknown {
  const cleaned = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return JSON.parse(cleaned.slice(objStart, objEnd + 1));
  }
  throw new Error("Model response did not contain valid JSON.");
}

function parseAxisRange(raw: unknown): ChartAxisRange | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const xMin = Number(o.xMin ?? o.xmin ?? 0);
  const xMax = Number(o.xMax ?? o.xmax ?? o.fmax ?? 0);
  const yMin = Number(o.yMin ?? o.ymin ?? 0);
  const yMax = Number(o.yMax ?? o.ymax ?? 0);
  if (!(xMax > xMin) || !(yMax >= yMin)) return undefined;
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    xUnit: o.xUnit != null ? String(o.xUnit) : undefined,
    yUnit: o.yUnit != null ? String(o.yUnit) : undefined
  };
}

function mapRegionKey(key: string): ChartRegionKind | null {
  const k = key.toLowerCase().replace(/[\s_-]+/g, "");
  if (
    k === "twf" ||
    k === "timewaveform" ||
    k === "waveform" ||
    k === "time" ||
    k.includes("waveform") ||
    k.includes("twf")
  ) {
    return "twf";
  }
  // Envelope / D-Mod MUST be checked before generic "spectrum".
  if (
    k === "envelope" ||
    k === "demod" ||
    k === "dmod" ||
    k === "demodulated" ||
    k === "enveloped" ||
    k.includes("envelope") ||
    k.includes("demod") ||
    k.includes("dmod") ||
    k.includes("peakvue")
  ) {
    return "envelope";
  }
  if (
    k === "fft" ||
    k === "spectrum" ||
    k === "fftspectrum" ||
    k.includes("fft") ||
    k.includes("spectrum") ||
    k.includes("cpm")
  ) {
    return "fft";
  }
  return null;
}

function centerOf(box: NormalizedBox) {
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2
  };
}

function isTopRight(box: NormalizedBox) {
  const { cx, cy } = centerOf(box);
  return cy < 0.5 && cx > 0.5;
}

function isBottom(box: NormalizedBox) {
  return centerOf(box).cy > 0.5;
}

function swapFftEnvelopeFields(detection: {
  regions: SpectrumRegionDetection["regions"];
  axisRanges: NonNullable<SpectrumRegionDetection["axisRanges"]>;
  peaks: SpectrumChartPeak[];
  xTickCounts?: SpectrumRegionDetection["xTickCounts"];
}): void {
  const { regions, axisRanges, peaks } = detection;

  const tmpRegion = regions.fft;
  regions.fft = regions.envelope;
  regions.envelope = tmpRegion;

  const tmpAxis = axisRanges.fft;
  axisRanges.fft = axisRanges.envelope;
  axisRanges.envelope = tmpAxis;

  if (detection.xTickCounts) {
    const tmpTicks = detection.xTickCounts.fft;
    detection.xTickCounts.fft = detection.xTickCounts.envelope;
    detection.xTickCounts.envelope = tmpTicks;
  }

  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    if (p.chart === "fft") peaks[i] = { ...p, chart: "envelope" };
    else if (p.chart === "envelope") peaks[i] = { ...p, chart: "fft" };
  }
}

/**
 * Decide whether labeled fft/envelope roles should be swapped.
 * Tick density wins: MORE x-axis numeric labels → FFT; FEWER → D-Mod/Envelope.
 */
function shouldSwapByTickDensity(
  fftTicks: number | undefined,
  envTicks: number | undefined
): { swap: boolean; reason: string } | null {
  if (
    !Number.isFinite(fftTicks as number) ||
    !Number.isFinite(envTicks as number)
  ) {
    return null;
  }
  const f = Number(fftTicks);
  const e = Number(envTicks);

  // Clear inversion: envelope panel has denser ticks than fft panel.
  if (e >= f + 2) {
    return {
      swap: true,
      reason: `tick density inverted (fft=${f}, envelope=${e})`
    };
  }
  // Envelope looks like FFT (8+) while fft looks like D-Mod (≤6).
  if (e >= 8 && f <= 6) {
    return {
      swap: true,
      reason: `envelope has FFT-like ticks (${e}) vs fft (${f})`
    };
  }
  // Labeled fft is sparse (D-Mod-like) and envelope is denser or mid.
  if (f <= 6 && e >= 7) {
    return {
      swap: true,
      reason: `fft too sparse (${f}) vs envelope (${e})`
    };
  }
  // Already correct density pattern.
  if (f >= 8 && e <= 6) {
    return {
      swap: false,
      reason: `tick density OK (fft=${f}, envelope=${e})`
    };
  }
  if (f > e) {
    return {
      swap: false,
      reason: `tick density favors current labels (fft=${f}, envelope=${e})`
    };
  }
  return null;
}

/**
 * Correct FFT ↔ Envelope using tick density first, then position.
 */
function correctFftEnvelopeAssignment(
  detection: SpectrumRegionDetection
): SpectrumRegionDetection {
  const regions = { ...detection.regions };
  const axisRanges = { ...(detection.axisRanges || {}) };
  const peaks = [...(detection.peaks || [])];
  const xTickCounts = detection.xTickCounts
    ? { ...detection.xTickCounts }
    : undefined;

  const state = { regions, axisRanges, peaks, xTickCounts };
  const notes: string[] = [];
  if (detection.notes) notes.push(detection.notes);

  const fftBox = regions.fft;
  const envBox = regions.envelope;

  // --- 1) Tick-density correction (primary) ---
  const tickDecision = shouldSwapByTickDensity(
    xTickCounts?.fft,
    xTickCounts?.envelope
  );
  if (tickDecision?.swap) {
    console.log(
      `[detect-spectrum-regions] Swapping fft ↔ envelope (${tickDecision.reason}).`
    );
    swapFftEnvelopeFields(state);
    notes.push(`swapped by ${tickDecision.reason}`);
  } else if (tickDecision && !tickDecision.swap) {
    console.log(`[detect-spectrum-regions] ${tickDecision.reason}`);
    notes.push(tickDecision.reason);
  } else if (fftBox && envBox) {
    // --- 2) Position fallback when ticks unavailable ---
    const fftC = centerOf(fftBox);
    const envC = centerOf(envBox);
    if (fftC.cy < envC.cy - 0.02) {
      console.log(
        `[detect-spectrum-regions] Swapping fft ↔ envelope (position: fft above envelope).`
      );
      swapFftEnvelopeFields(state);
      notes.push("swapped by vertical position");
    } else if (isTopRight(fftBox) && isBottom(envBox)) {
      console.log(
        "[detect-spectrum-regions] Swapping fft ↔ envelope (top-right vs bottom zones)."
      );
      swapFftEnvelopeFields(state);
      notes.push("swapped by quadrant zones");
    } else if (
      Math.abs(fftC.cy - envC.cy) < 0.12 &&
      fftC.cx > envC.cx + 0.05
    ) {
      swapFftEnvelopeFields(state);
      notes.push("swapped by side-by-side right=envelope rule");
    }
  } else if (fftBox && !envBox && isTopRight(fftBox)) {
    regions.envelope = fftBox;
    delete regions.fft;
    if (axisRanges.fft) {
      axisRanges.envelope = axisRanges.fft;
      delete axisRanges.fft;
    }
    if (xTickCounts?.fft != null) {
      xTickCounts.envelope = xTickCounts.fft;
      delete xTickCounts.fft;
    }
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i].chart === "fft") {
        peaks[i] = { ...peaks[i], chart: "envelope" };
      }
    }
    notes.push("relabeled lone top-right fft → envelope");
  } else if (envBox && !fftBox && isBottom(envBox)) {
    regions.fft = envBox;
    delete regions.envelope;
    if (axisRanges.envelope) {
      axisRanges.fft = axisRanges.envelope;
      delete axisRanges.envelope;
    }
    if (xTickCounts?.envelope != null) {
      xTickCounts.fft = xTickCounts.envelope;
      delete xTickCounts.envelope;
    }
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i].chart === "envelope") {
        peaks[i] = { ...peaks[i], chart: "fft" };
      }
    }
    notes.push("relabeled lone bottom envelope → fft");
  }

  notes.push("validated: more x-ticks=fft, fewer=envelope; top-right=envelope, bottom=fft");

  return {
    ...detection,
    regions,
    ...(Object.keys(axisRanges).length ? { axisRanges } : {}),
    ...(xTickCounts && Object.keys(xTickCounts).length
      ? { xTickCounts }
      : {}),
    peaks,
    notes: notes.filter(Boolean).join(" | ")
  };
}

function parseTickCounts(
  raw: unknown
): SpectrumRegionDetection["xTickCounts"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: NonNullable<SpectrumRegionDetection["xTickCounts"]> = {};

  const read = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };

  // Nested { fft, envelope } or { fftSpectrum, dmod, ... }
  for (const [key, value] of Object.entries(o)) {
    const kind = mapRegionKey(key);
    if (kind === "fft" || kind === "envelope") {
      const n = read(value);
      if (n != null) out[kind] = n;
    }
  }

  // Flat aliases
  const fftFlat = read(
    o.fftXTickCount ?? o.fftTickCount ?? o.fftTicks ?? o.fft_tick_count
  );
  const envFlat = read(
    o.envelopeXTickCount ??
      o.envelopeTickCount ??
      o.envelopeTicks ??
      o.dmodTickCount ??
      o.dModTickCount ??
      o.demodTickCount
  );
  if (fftFlat != null) out.fft = fftFlat;
  if (envFlat != null) out.envelope = envFlat;

  return Object.keys(out).length ? out : undefined;
}

function coerceDetection(raw: unknown): SpectrumRegionDetection {
  const empty: SpectrumRegionDetection = {
    regions: {},
    peaks: [],
    detectionConfidence: 0
  };
  if (!raw || typeof raw !== "object") return empty;

  const root = raw as Record<string, unknown>;
  const regionsIn =
    (root.regions as Record<string, unknown>) ||
    (root.panels as Record<string, unknown>) ||
    (root.boundingBoxes as Record<string, unknown>) ||
    {};

  const regions: SpectrumRegionDetection["regions"] = {};
  const regionTickHints: NonNullable<SpectrumRegionDetection["xTickCounts"]> =
    {};

  for (const [key, value] of Object.entries(regionsIn)) {
    const kind = mapRegionKey(key);
    if (!kind) continue;
    const box = normalizeBox(value);
    if (box) regions[kind] = box;
    if (value && typeof value === "object") {
      const tick = Number(
        (value as Record<string, unknown>).xTickCount ??
          (value as Record<string, unknown>).tickCount ??
          (value as Record<string, unknown>).xTicks
      );
      if (
        (kind === "fft" || kind === "envelope") &&
        Number.isFinite(tick) &&
        tick >= 0
      ) {
        regionTickHints[kind] = Math.round(tick);
      }
    }
  }

  if (Array.isArray(root.regions)) {
    for (const item of root.regions) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const kind = mapRegionKey(
        String(row.type ?? row.kind ?? row.label ?? row.name ?? "")
      );
      if (!kind) continue;
      const box = normalizeBox(row.box ?? row.bbox ?? row);
      if (box) regions[kind] = box;
      const tick = Number(row.xTickCount ?? row.tickCount ?? row.xTicks);
      if (
        (kind === "fft" || kind === "envelope") &&
        Number.isFinite(tick) &&
        tick >= 0
      ) {
        regionTickHints[kind] = Math.round(tick);
      }
    }
  }

  const axisRaw =
    (root.axisRanges as Record<string, unknown>) ||
    (root.axes as Record<string, unknown>) ||
    {};
  const axisRanges: NonNullable<SpectrumRegionDetection["axisRanges"]> = {};
  for (const [key, value] of Object.entries(axisRaw)) {
    const kind = mapRegionKey(key);
    if (!kind) continue;
    const axis = parseAxisRange(value);
    if (axis) axisRanges[kind] = axis;
  }

  const peakRows = Array.isArray(root.peaks) ? root.peaks : [];
  const peaks: SpectrumChartPeak[] = peakRows
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const row = p as Record<string, unknown>;
      const frequencyHz = Number(row.frequencyHz ?? row.frequency ?? row.hz ?? 0);
      const amplitude = Number(row.amplitude ?? row.amp ?? 0);
      if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null;
      const chartKey = row.chart != null ? mapRegionKey(String(row.chart)) : null;
      return {
        frequencyHz,
        amplitude: Number.isFinite(amplitude) ? amplitude : 0,
        label: row.label != null ? String(row.label) : undefined,
        ...(chartKey ? { chart: chartKey } : { chart: "fft" as const })
      };
    })
    .filter(Boolean) as SpectrumChartPeak[];

  const xTickCounts =
    parseTickCounts(root.xTickCounts) ||
    parseTickCounts(root.tickCounts) ||
    (Object.keys(regionTickHints).length ? regionTickHints : undefined);

  const detectionConfidence = Number(
    root.detectionConfidence ??
      root.confidence ??
      (Object.keys(regions).length ? 70 : 0)
  );

  return correctFftEnvelopeAssignment({
    regions,
    peaks,
    ...(Object.keys(axisRanges).length ? { axisRanges } : {}),
    ...(xTickCounts ? { xTickCounts } : {}),
    detectionConfidence: Number.isFinite(detectionConfidence)
      ? Math.max(0, Math.min(100, detectionConfidence))
      : 0,
    notes: root.notes != null ? String(root.notes) : undefined
  });
}

/**
 * Second Vision pass: count x-axis numeric tick labels in each spectral panel.
 * More reliable than position/units when both charts are in Hz.
 */
async function validateRolesByTickDensity(
  client: OpenAI,
  dataUrl: string,
  detection: SpectrumRegionDetection,
  model: string
): Promise<SpectrumRegionDetection> {
  const fftBox = detection.regions.fft;
  const envBox = detection.regions.envelope;
  if (!fftBox || !envBox) return detection;

  const prompt = `Count the visible NUMERIC X-AXIS TICK LABELS (the numbers along the bottom axis) in each chart panel below.

Panel A (currently labeled "fft"):
  box = x:${fftBox.x.toFixed(3)}, y:${fftBox.y.toFixed(3)}, w:${fftBox.width.toFixed(3)}, h:${fftBox.height.toFixed(3)}

Panel B (currently labeled "envelope" / D-Mod):
  box = x:${envBox.x.toFixed(3)}, y:${envBox.y.toFixed(3)}, w:${envBox.width.toFixed(3)}, h:${envBox.height.toFixed(3)}

Rules for counting:
- Count distinct numeric labels on the horizontal axis only (e.g. 0, 1000, 2000, …).
- Do NOT count y-axis labels.
- FFT / full spectrum panels typically have MANY ticks (about 8–12).
- D-Mod / Envelope panels typically have FEWER ticks (about 4–6).

Return JSON only:
{
  "panelA_tickCount": number,
  "panelB_tickCount": number,
  "panelA_is": "fft" | "envelope",
  "panelB_is": "fft" | "envelope",
  "reason": string
}`;

  try {
    console.log(
      `[detect-spectrum-regions] Tick-density validation via ${model}…`
    );
    let contentText = "";
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Count x-axis tick labels on vibration analyzer chart panels. Return JSON only."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
            ]
          }
        ]
      });
      contentText = response.choices[0]?.message?.content || "";
    } catch {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Count x-axis tick labels on vibration analyzer chart panels. Return JSON only."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
            ]
          }
        ]
      });
      contentText = response.choices[0]?.message?.content || "";
    }

    if (!contentText.trim()) return detection;

    const parsed = parseVisionJsonResponse(contentText) as Record<
      string,
      unknown
    >;
    const panelA = Number(
      parsed.panelA_tickCount ?? parsed.fftTickCount ?? parsed.a
    );
    const panelB = Number(
      parsed.panelB_tickCount ?? parsed.envelopeTickCount ?? parsed.b
    );

    const xTickCounts = {
      fft: Number.isFinite(panelA) ? Math.round(panelA) : detection.xTickCounts?.fft,
      envelope: Number.isFinite(panelB)
        ? Math.round(panelB)
        : detection.xTickCounts?.envelope
    };

    console.log("[detect-spectrum-regions] Tick counts:", {
      panelA_fftLabel: xTickCounts.fft,
      panelB_envelopeLabel: xTickCounts.envelope,
      panelA_is: parsed.panelA_is,
      panelB_is: parsed.panelB_is,
      reason: parsed.reason
    });

    // Explicit role suggestion from the model (Panel A = current fft box).
    const aIs = String(parsed.panelA_is || "").toLowerCase();
    const bIs = String(parsed.panelB_is || "").toLowerCase();
    let forcedSwap: boolean | null = null;
    if (
      (aIs.includes("envelope") || aIs.includes("dmod") || aIs.includes("demod")) &&
      (bIs.includes("fft") || bIs.includes("spectrum"))
    ) {
      forcedSwap = true;
    } else if (
      (aIs.includes("fft") || aIs === "spectrum") &&
      (bIs.includes("envelope") || bIs.includes("dmod") || bIs.includes("demod"))
    ) {
      forcedSwap = false;
    }

    const withTicks: SpectrumRegionDetection = {
      ...detection,
      xTickCounts
    };

    if (forcedSwap === true) {
      const regions = { ...withTicks.regions };
      const axisRanges = { ...(withTicks.axisRanges || {}) };
      const peaks = [...(withTicks.peaks || [])];
      const ticks = { ...xTickCounts };
      swapFftEnvelopeFields({
        regions,
        axisRanges,
        peaks,
        xTickCounts: ticks
      });
      console.log(
        "[detect-spectrum-regions] Swapped by explicit panelA_is/panelB_is from tick pass."
      );
      return {
        ...withTicks,
        regions,
        axisRanges,
        peaks,
        xTickCounts: ticks,
        notes: [
          withTicks.notes,
          `tick-validation swap (A=${xTickCounts.fft}, B=${xTickCounts.envelope})`
        ]
          .filter(Boolean)
          .join(" | ")
      };
    }

    return correctFftEnvelopeAssignment(withTicks);
  } catch (err) {
    console.warn(
      "[detect-spectrum-regions] Tick-density validation failed:",
      err instanceof Error ? err.message : err
    );
    return detection;
  }
}

/**
 * Detect TWF / FFT / Envelope panel boxes (normalized 0–1) and extract peaks.
 */
export async function detectSpectrumChartRegionsWithOpenAI(
  imageBase64: string
): Promise<SpectrumRegionDetection> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const { data, mimeType } = stripDataUrl(imageBase64);
  const cleanBase64 = data.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

  const userPrompt = `This image is a vibration analyzer screenshot (e.g. SmartCBM) with multiple chart panels.

Identify panels using POSITION + X-AXIS TICK DENSITY (both spectral charts are often in Hz — do NOT use units alone):

1. "twf" — Time Waveform — TOP-LEFT. Time vs amplitude.
2. "envelope" — D-Mod / Demodulated / Envelope / PeakVue — TOP-RIGHT.
   Bearing defect chart. FEWER x-axis numeric tick labels (typically 4–6), e.g. 0, 500, 1000 … 7500.
3. "fft" — FFT / Frequency Spectrum — BOTTOM (usually full width).
   Full spectrum with 1X/2X/3X. MANY x-axis numeric tick labels (typically 8–12), e.g. 0, 1000, 2000 … 7500+.

CRITICAL DISAMBIGUATION:
- The spectral panel with MORE x-axis tick numbers = "fft".
- The spectral panel with FEWER x-axis tick numbers = "envelope".
- Top-right spectral panel is usually envelope; bottom is usually fft.
- Never call the D-Mod panel "fft" just because the title says "Spectrum".

For each of "fft" and "envelope", count the visible x-axis numeric labels and return them as xTickCount.

Coordinates MUST be normalized fractions of the full image (0.0–1.0):
x = left edge, y = top edge, width, height.

Return JSON with this exact schema:
{
  "regions": {
    "twf": { "x": number, "y": number, "width": number, "height": number, "confidence": number },
    "fft": { "x": number, "y": number, "width": number, "height": number, "confidence": number, "xTickCount": number },
    "envelope": { "x": number, "y": number, "width": number, "height": number, "confidence": number, "xTickCount": number }
  },
  "xTickCounts": { "fft": number, "envelope": number },
  "axisRanges": {
    "fft": { "xMin": number, "xMax": number, "yMin": number, "yMax": number, "xUnit": "Hz"|"CPM", "yUnit": "mm/s" },
    "envelope": { "xMin": number, "xMax": number, "yMin": number, "yMax": number, "xUnit": "Hz", "yUnit": "gE" },
    "twf": { "xMin": number, "xMax": number, "yMin": number, "yMax": number, "xUnit": "s", "yUnit": "mm/s" }
  },
  "peaks": [
    { "frequency": number, "amplitude": number, "label": string, "chart": "fft" | "envelope" }
  ],
  "detectionConfidence": number,
  "notes": string
}

Omit a region key if that panel is not visible. Prefer tight boxes around the plot area.`;

  const client = new OpenAI({ apiKey });
  let lastError: unknown;

  for (const model of OPENAI_VISION_MODELS) {
    try {
      console.log(`[detect-spectrum-regions] OpenAI Vision via ${model}…`);
      let contentText = "";

      try {
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
              ]
            }
          ]
        });
        contentText = response.choices[0]?.message?.content || "";
      } catch (jsonModeErr) {
        console.warn(
          `[detect-spectrum-regions] ${model} JSON mode failed, retrying plain:`,
          jsonModeErr instanceof Error ? jsonModeErr.message : jsonModeErr
        );
        const response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
              ]
            }
          ]
        });
        contentText = response.choices[0]?.message?.content || "";
      }

      if (!contentText.trim()) {
        throw new Error(`Empty response from OpenAI Vision (${model}).`);
      }

      let detection = coerceDetection(parseVisionJsonResponse(contentText));

      // Dedicated second pass: recount ticks and swap if roles are inverted.
      if (detection.regions.fft && detection.regions.envelope) {
        detection = await validateRolesByTickDensity(
          client,
          dataUrl,
          detection,
          model
        );
      }

      const regionCount = Object.keys(detection.regions).length;
      console.log("[detect-spectrum-regions] Result:", {
        model,
        regions: Object.keys(detection.regions),
        xTickCounts: detection.xTickCounts,
        peaks: detection.peaks.length,
        confidence: detection.detectionConfidence,
        notes: detection.notes
      });

      if (regionCount === 0 && detection.peaks.length === 0) {
        throw new Error("Vision returned no chart regions or peaks.");
      }

      return detection;
    } catch (err) {
      lastError = err;
      console.error("[detect-spectrum-regions] Model failed:", err);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI Vision Error: Unable to detect spectrum chart regions.");
}
