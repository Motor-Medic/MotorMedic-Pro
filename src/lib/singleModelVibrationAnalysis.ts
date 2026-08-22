/**
 * Temporary single-model vibration analysis (OpenRouter GPT-4o).
 * Unblocks UI development while multi-agent consensus is stabilized.
 * ZERO mock diagnostic data — real vision analysis of the uploaded image.
 */

import {
  OPENROUTER_API_BASE,
  OPENROUTER_VISION_MODEL,
  hasOpenRouterKey,
  openRouterRefererHeaders
} from "./openRouterModels";
import {
  normalizeWaveformMetrics,
  timePerRevolutionMs,
  type NormalizedWaveformMetrics
} from "./waveformMetrics";
import type {
  AnalyzeVibrationRequest,
  ApiSeverity,
  ConsensusOutcome,
  ConsensusVibrationResult
} from "./consensusEngine";

const SINGLE_MODEL_PROMPT = `You are a Level III Vibration Analyst. Analyze this vibration spectrum / analyzer screenshot image.

CRITICAL RULES:
1. Read the RPM directly from the image (e.g., "RPM: 1180"). Do NOT use database defaults.
2. Calculate 1X frequency = RPM / 60 (e.g., 1180 RPM = 19.67 Hz). NEVER confuse RPM with Hz.
3. Extract the top 3-5 FFT peaks with their frequency (Hz) and amplitude.
4. Identify the primary fault based on peak patterns:
   - High 1X peak = Unbalance
   - High 2X peak = Misalignment
   - Multiple harmonics (3X, 4X+) = Mechanical Looseness
   - High frequency peaks (>1000 Hz) or envelope bearing peaks = BearingDefect
   - Low overall velocity with normal 1X = Machine Healthy / Normal
5. Estimate overall velocity and map it to ISO 10816 zones (Zone A = Good, B = Acceptable, C = Alert, D = Danger).

MULTI-PANEL SCREENSHOTS (SmartCBM / CSI / PeakVue style):
These images often contain TWO OR THREE panels. You MUST inspect every panel.
- FFT / velocity spectrum → fills "peaks" and overallVelocity
- Top-right Acceleration Envelope / Demodulated Spectrum (gE) → MUST fill "envelope"
- Time waveform → fills "waveform"

PANEL — ENVELOPE SPECTRUM / TOP-RIGHT gE PANEL (REQUIRED when present):
On SmartCBM screenshots, look specifically at the TOP-RIGHT panel. It is the Acceleration
Envelope (demodulated) spectrum and uses units labeled gE (not mm/s velocity).
Also accept labels: Envelope, Enveloping, Demod, Demodulation, PeakVue, gE, or gSE.
Whenever that top-right gE panel is present, you MUST include an "envelope" object in the
JSON with ALL three numeric fields — never null, never omit these keys:
- peakAmplitude: the highest amplitude peak visible in that gE panel (Y-axis, gE units)
- dominantFrequency: the frequency in Hz (X-axis) of that tallest peak in the gE panel
- energy: the overall noise floor or envelope energy level across that panel
Do NOT leave "envelope" as null when the top-right gE panel is visible.
Only omit the entire "envelope" key if no top-right / envelope / gE panel exists in the image.

TIME WAVEFORM PANEL (if visible):
- peakToPeak, crestFactor (= Peak/RMS), impactCount (peaks > 3× RMS)
- symmetry: Symmetric | Clipped | Asymmetric
- timePerRevolution in milliseconds = 60000/RPM
- modulation: None | Amplitude | Frequency
Only omit "waveform" if no time-waveform panel is visible.

Return ONLY valid JSON. No markdown. No explanations.
{
  "rpm": <number>,
  "overallVelocity": <number in mm/s>,
  "peaks": [{"frequency": <Hz>, "amplitude": <value>}],
  "primaryFault": "Unbalance" | "Misalignment" | "Looseness" | "BearingDefect" | "Normal",
  "confidence": <0-100>,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "isoZone": "A" | "B" | "C" | "D",
  "recommendation": <string>,
  "envelope": {
    "peakAmplitude": <highest gE peak in top-right panel>,
    "dominantFrequency": <Hz of that tallest gE peak>,
    "energy": <overall noise floor / envelope energy in that panel>
  },
  "waveform": {
    "peakToPeak": <number>,
    "crestFactor": <number>,
    "impactCount": <number>,
    "symmetry": "Symmetric" | "Clipped" | "Asymmetric",
    "timePerRevolution": <milliseconds>,
    "modulation": "None" | "Amplitude" | "Frequency"
  }
}`;

interface SingleModelEnvelopeFields {
  peakAmplitude?: number;
  dominantFrequency?: number;
  energy?: number;
}

interface SingleModelRawAnalysis {
  rpm?: number;
  overallVelocity?: number;
  peaks?: Array<{ frequency?: number; amplitude?: number; label?: string }>;
  primaryFault?: string;
  confidence?: number;
  severity?: string;
  isoZone?: string;
  recommendation?: string;
  waveform?: Record<string, unknown>;
  envelope?: SingleModelEnvelopeFields | Record<string, unknown> | null;
  /** Alternate root-level keys some models emit */
  envelopePeakAmplitude?: number;
  envelopeDominantFrequency?: number;
  envelopeEnergy?: number;
  peakGe?: number;
  gE?: number;
  gSE?: number;
}

interface NormalizedEnvelopeMetrics {
  peakAmplitude: number;
  dominantFrequency: number;
  energy: number;
}

function finitePositive(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * Accept several model shapes for envelope — never invent values, but recover
 * when the model uses alternate key names or nests fields.
 */
function normalizeEnvelopeMetrics(
  analysis: SingleModelRawAnalysis
): NormalizedEnvelopeMetrics | null {
  const raw = analysis.envelope;
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  // Some models return envelope as an array of peaks
  let fromArrayPeak: number | null = null;
  let fromArrayFreq: number | null = null;
  if (Array.isArray(raw) && raw.length > 0) {
    let bestAmp = 0;
    let bestFreq = 0;
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const amp =
        finitePositive(r.amplitude ?? r.peakAmplitude ?? r.y ?? r.gE) ?? 0;
      const freq =
        finitePositive(r.frequency ?? r.dominantFrequency ?? r.hz ?? r.x) ?? 0;
      if (amp > bestAmp) {
        bestAmp = amp;
        bestFreq = freq;
      }
    }
    if (bestAmp > 0) {
      fromArrayPeak = bestAmp;
      fromArrayFreq = bestFreq > 0 ? bestFreq : null;
    }
  }

  const peakAmplitude =
    finitePositive(o.peakAmplitude) ??
    finitePositive(o.peak_amplitude) ??
    finitePositive(o.peakGe) ??
    finitePositive(o.peak_gE) ??
    finitePositive(o.gE) ??
    finitePositive(o.gSE) ??
    finitePositive(o.amplitude) ??
    finitePositive(o.maxAmplitude) ??
    finitePositive(analysis.envelopePeakAmplitude) ??
    finitePositive(analysis.peakGe) ??
    finitePositive(analysis.gE) ??
    finitePositive(analysis.gSE) ??
    fromArrayPeak;

  const dominantFrequency =
    finitePositive(o.dominantFrequency) ??
    finitePositive(o.dominant_frequency) ??
    finitePositive(o.frequency) ??
    finitePositive(o.freqHz) ??
    finitePositive(o.freq) ??
    finitePositive(o.hz) ??
    finitePositive(analysis.envelopeDominantFrequency) ??
    fromArrayFreq;

  const energy =
    finitePositive(o.energy) ??
    finitePositive(o.overallEnergy) ??
    finitePositive(o.averageAmplitude) ??
    finitePositive(o.avgAmplitude) ??
    finitePositive(o.rms) ??
    finitePositive(analysis.envelopeEnergy);

  if (peakAmplitude == null && dominantFrequency == null && energy == null) {
    return null;
  }

  return {
    peakAmplitude: peakAmplitude ?? 0,
    dominantFrequency: dominantFrequency ?? 0,
    energy: energy ?? 0
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ensureDataUrl(imageBase64: string): string {
  const trimmed = String(imageBase64 || "").trim();
  if (!trimmed) throw new Error("imageBase64 is required for single-model analysis.");
  if (/^data:image\//i.test(trimmed)) return trimmed;
  return `data:image/png;base64,${trimmed.replace(/^data:image\/\w+;base64,/, "")}`;
}

function stripMarkdownFences(raw: string): string {
  return String(raw || "")
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
}

function parseBulletproofJson(rawContent: string): SingleModelRawAnalysis {
  const cleaned = stripMarkdownFences(rawContent);
  try {
    return JSON.parse(cleaned) as SingleModelRawAnalysis;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as SingleModelRawAnalysis;
    }
    throw new Error("AI returned invalid JSON format");
  }
}

function mapSeverity(raw: string | undefined, isoZone: string, primaryFault: string): ApiSeverity {
  const s = String(raw || "").toUpperCase();
  const zone = String(isoZone || "").toUpperCase();
  const fault = String(primaryFault || "").toLowerCase();
  if (s === "CRITICAL" || zone === "D") return "CRITICAL";
  if (s === "HIGH" || s === "MEDIUM" || zone === "C") return "ANOMALY";
  if (
    fault === "normal" ||
    /healthy|normal/.test(fault) ||
    zone === "A" ||
    zone === "B" ||
    s === "LOW"
  ) {
    return "NORMAL";
  }
  return "ANOMALY";
}

function faultTitle(primaryFault: string, isoZone: string): string {
  const f = String(primaryFault || "Normal").trim();
  if (/^normal$/i.test(f) || /healthy/i.test(f)) {
    return "Machine Healthy / Normal Operation";
  }
  if (/bearing/i.test(f)) return "Bearing Defect";
  if (/loose/i.test(f)) return "Mechanical Looseness";
  if (/misalign/i.test(f)) return "Misalignment";
  if (/unbalance|imbalance/i.test(f)) return "Unbalance";
  return f || `ISO Zone ${isoZone || "B"} Finding`;
}

function financialFromFault(title: string): ConsensusVibrationResult["financialImpact"] {
  if (/healthy|normal/i.test(title)) {
    return {
      preventiveRepairCost: 0,
      failureCostIfDelayed: 0,
      downtimeLossPerHour: 0
    };
  }
  if (/bearing/i.test(title)) {
    return {
      preventiveRepairCost: 2500,
      failureCostIfDelayed: 12500,
      downtimeLossPerHour: 40000
    };
  }
  if (/misalign/i.test(title)) {
    return {
      preventiveRepairCost: 800,
      failureCostIfDelayed: 4000,
      downtimeLossPerHour: 20000
    };
  }
  if (/unbalance|imbalance/i.test(title)) {
    return {
      preventiveRepairCost: 600,
      failureCostIfDelayed: 3000,
      downtimeLossPerHour: 15000
    };
  }
  if (/loose/i.test(title)) {
    return {
      preventiveRepairCost: 500,
      failureCostIfDelayed: 2500,
      downtimeLossPerHour: 10000
    };
  }
  return {
    preventiveRepairCost: 1000,
    failureCostIfDelayed: 5000,
    downtimeLossPerHour: 20000
  };
}

function mapToConsensusResult(analysis: SingleModelRawAnalysis): ConsensusVibrationResult {
  const rpm = Number(analysis.rpm) || 0;
  const oneXHz = rpm > 0 ? rpm / 60 : 0;
  const overallVelocity = Number(analysis.overallVelocity) || 0;
  const isoZone = String(analysis.isoZone || "B").toUpperCase();
  const primaryFaultRaw = String(analysis.primaryFault || "Normal");
  const title = faultTitle(primaryFaultRaw, isoZone);
  const severity = mapSeverity(analysis.severity, isoZone, primaryFaultRaw);
  const confidence = clamp(Number(analysis.confidence ?? 75), 0, 100);
  const recommendation =
    String(analysis.recommendation || "").trim() ||
    (severity === "NORMAL"
      ? "Continue routine monitoring."
      : "Inspect the machine and verify operating conditions.");

  const peaks = Array.isArray(analysis.peaks)
    ? analysis.peaks
        .map((p) => ({
          frequencyHz: Number(p.frequency) || 0,
          amplitude: Number(p.amplitude) || 0,
          label: typeof p.label === "string" ? p.label : undefined
        }))
        .filter((p) => p.frequencyHz > 0)
    : [];

  const isHealthy = severity === "NORMAL" || /healthy|normal/i.test(title);
  const primaryFreq =
    peaks.find((p) => Math.abs(p.frequencyHz - oneXHz) <= Math.max(1.5, oneXHz * 0.08))
      ?.frequencyHz ||
    peaks[0]?.frequencyHz ||
    oneXHz;

  const identifiedFaults = isHealthy
    ? []
    : [
        {
          title,
          frequencyHz: primaryFreq,
          confidencePercent: confidence,
          severity,
          description: recommendation
        }
      ];

  const overallHealthScore = clamp(
    isHealthy
      ? isoZone === "A"
        ? 92
        : 82
      : severity === "CRITICAL"
        ? 32
        : 58,
    0,
    100
  );

  const financialImpact = financialFromFault(title);
  const repairRecommendations = isHealthy
    ? [
        "Continue routine condition monitoring on the current route interval.",
        "Archive this spectrum as a baseline for future comparison.",
        recommendation
      ]
    : [recommendation, "Verify image-derived RPM and 1X harmonics against plant tags.", "Remeasure after corrective action."];

  const waveformNorm: NormalizedWaveformMetrics | null = normalizeWaveformMetrics(
    analysis.waveform,
    rpm
  );
  // If AI omitted TPR but RPM is known, fill mathematically (not a mock amplitude)
  if (waveformNorm && waveformNorm.timePerRevolutionMs == null && rpm > 0) {
    waveformNorm.timePerRevolutionMs = timePerRevolutionMs(rpm);
  }

  const envelopeNorm = normalizeEnvelopeMetrics(analysis);

  const envelopePayload = envelopeNorm
    ? {
        peakAmplitude: envelopeNorm.peakAmplitude,
        dominantFrequency: envelopeNorm.dominantFrequency,
        energy: envelopeNorm.energy
      }
    : undefined;

  if (!envelopePayload) {
    console.warn(
      "[single-model] envelope missing after parse. Raw envelope field:",
      analysis.envelope ?? null
    );
  }

  const result = {
    success: true as const,
    overallHealthScore,
    severity,
    summary: isHealthy
      ? `Machine Healthy / Normal Operation — ISO Zone ${isoZone}, overall ${overallVelocity.toFixed(2)} mm/s at ${rpm || "unknown"} RPM (1X ≈ ${oneXHz.toFixed(2)} Hz).`
      : `${title} — ISO Zone ${isoZone}, overall ${overallVelocity.toFixed(2)} mm/s at ${rpm || "unknown"} RPM (1X ≈ ${oneXHz.toFixed(2)} Hz). ${recommendation}`,
    primaryFault: {
      title,
      frequencyHz: primaryFreq,
      confidencePercent: confidence,
      severity,
      actionWindow: recommendation
    },
    identifiedFaults,
    financialImpact,
    repairRecommendations,
    consensusDetails: {
      modelA_Hypothesis: `Single-model GPT-4o: ${primaryFaultRaw} (${confidence}%), ISO Zone ${isoZone}.`,
      modelB_Hypothesis: `Overall velocity ${overallVelocity.toFixed(2)} mm/s → ISO 10816 Zone ${isoZone}.`,
      refereeDebateSummary:
        "Temporary single-model path (multi-agent consensus bypassed for UI development)."
    },
    spectrumPeaks: peaks.map((p) => ({
      frequencyHz: p.frequencyHz,
      amplitude: p.amplitude,
      label: p.label,
      chart: "fft" as const
    })),
    broadband: {
      velocity: overallVelocity,
      ...(rpm > 0 ? { rpm } : {}),
      ...(envelopePayload && envelopePayload.peakAmplitude > 0
        ? { peakGe: envelopePayload.peakAmplitude }
        : {})
    },
    overallRmsVelocity: overallVelocity,
    analysisSource: "single-model-gpt-4o",
    // Only include envelope when real values were extracted (omit key instead of null)
    ...(envelopePayload
      ? {
          envelope: envelopePayload,
          envelopePeakAmplitude: envelopePayload.peakAmplitude,
          envelopeDominantFrequency: envelopePayload.dominantFrequency,
          envelopeEnergy: envelopePayload.energy
        }
      : {}),
    ...(waveformNorm
      ? {
          waveform: {
            peakToPeak: waveformNorm.peakToPeak,
            crestFactor: waveformNorm.crestFactor,
            impactCount: waveformNorm.impactCount,
            symmetry: waveformNorm.symmetry,
            timePerRevolution: waveformNorm.timePerRevolutionMs,
            modulation: waveformNorm.modulation
          },
          waveformMetrics: {
            peakAmplitude:
              waveformNorm.peakAmplitude ?? waveformNorm.peakToPeak / 2,
            crestFactor: waveformNorm.crestFactor,
            rmsValue:
              waveformNorm.rmsValue ??
              (waveformNorm.crestFactor > 0
                ? waveformNorm.peakToPeak / 2 / waveformNorm.crestFactor
                : 0)
          },
          waveformPeakToPeak: waveformNorm.peakToPeak,
          waveformCrestFactor: waveformNorm.crestFactor,
          waveformImpactCount: waveformNorm.impactCount,
          waveformSymmetry: waveformNorm.symmetry,
          waveformModulation: waveformNorm.modulation
        }
      : {})
  };

  return result as ConsensusVibrationResult;
}

/**
 * Single GPT-4o vision + diagnosis call via OpenRouter.
 * Returns the same ConsensusOutcome shape the Express/Next routes already emit.
 */
export async function runSingleModelVibrationAnalysis(
  body: AnalyzeVibrationRequest | { imageBase64?: string; machineType?: string }
): Promise<ConsensusOutcome> {
  if (!hasOpenRouterKey()) {
    return {
      success: false,
      errorType: "GATEWAY_TIMEOUT",
      title: "Single-Model Diagnostic Error",
      message: "OPENROUTER_API_KEY is required for vibration analysis.",
      httpStatus: 503,
      detail: "Missing OPENROUTER_API_KEY"
    };
  }

  const imageBase64 =
    typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!imageBase64) {
    return {
      success: false,
      errorType: "SIGNAL_UNREADABLE",
      title: "OpenAI Vision Error",
      message: "OpenAI Vision Error: Unable to extract spectrum peaks (imageBase64 required).",
      httpStatus: 422
    };
  }

  const dataUrl = ensureDataUrl(imageBase64);
  const machineHint =
    "machineType" in body && body.machineType
      ? `\nMachine type hint (reference only — prefer image RPM): ${body.machineType}`
      : "";

  console.log("[single-model] Calling OpenRouter GPT-4o for vibration analysis…");

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      ...openRouterRefererHeaders()
    },
    body: JSON.stringify({
      model: OPENROUTER_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: SINGLE_MODEL_PROMPT + machineHint }
          ]
        }
      ],
      max_tokens: 2200,
      temperature: 0,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter API failed: ${response.status} ${response.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    throw new Error("OpenRouter returned an empty model response.");
  }

  let analysis: SingleModelRawAnalysis;
  try {
    analysis = parseBulletproofJson(rawContent);
  } catch (parseError) {
    console.error("Failed to parse AI response:", stripMarkdownFences(rawContent));
    throw parseError instanceof Error
      ? parseError
      : new Error("AI returned invalid JSON format");
  }

  console.log("[single-model] Analysis parsed:", {
    rpm: analysis.rpm,
    overallVelocity: analysis.overallVelocity,
    peaks: Array.isArray(analysis.peaks) ? analysis.peaks.length : 0,
    primaryFault: analysis.primaryFault,
    isoZone: analysis.isoZone,
    confidence: analysis.confidence,
    hasWaveform: Boolean(analysis.waveform),
    hasEnvelope: Boolean(analysis.envelope),
    envelope: analysis.envelope ?? null
  });

  const mapped = mapToConsensusResult(analysis);
  console.log("[single-model] Mapped envelope:", (mapped as { envelope?: unknown }).envelope ?? null);
  return { success: true, data: mapped };
}
