/**
 * Safe JSON serialization for diagnostic API routes.
 * Prevents empty 0-byte 200 responses when payloads fail to stringify.
 */

export interface VibrationApiBroadband {
  velocity: number;
  acceleration?: number;
  rpm?: number;
}

export interface VibrationApiSpectralPoint {
  frequency: number;
  amplitude: number;
  label?: string;
}

export interface VibrationApiMetadata {
  processedAt: string;
  [key: string]: unknown;
}

/** Strip circular refs / BigInt so Express and Next always emit valid JSON. */
export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString();
    if (val !== null && typeof val === "object") {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    if (val === undefined) return null;
    return val;
  });
}

export function buildAnalyzeVibrationSuccessBody(
  data: Record<string, unknown>
): Record<string, unknown> {
  const peaks = Array.isArray(data.spectrumPeaks) ? data.spectrumPeaks : [];
  const spectral: VibrationApiSpectralPoint[] = Array.isArray(data.spectral)
    ? (data.spectral as VibrationApiSpectralPoint[])
    : peaks.map((raw) => {
        const p = raw as Record<string, unknown>;
        return {
          frequency: Number(p.frequencyHz ?? p.frequency ?? 0),
          amplitude: Number(p.amplitude ?? 0),
          ...(typeof p.label === "string" ? { label: p.label } : {})
        };
      });

  const broadbandRaw = data.broadband;
  const broadbandObj =
    broadbandRaw && typeof broadbandRaw === "object"
      ? (broadbandRaw as Record<string, unknown>)
      : null;
  const broadband: VibrationApiBroadband & { peakGe?: number } =
    broadbandObj
      ? {
          velocity: Number(broadbandObj.velocity ?? 0),
          ...(broadbandObj.acceleration != null
            ? { acceleration: Number(broadbandObj.acceleration) }
            : {}),
          ...(broadbandObj.rpm != null ? { rpm: Number(broadbandObj.rpm) } : {}),
          ...(broadbandObj.peakGe != null && Number(broadbandObj.peakGe) > 0
            ? { peakGe: Number(broadbandObj.peakGe) }
            : {})
        }
      : { velocity: Number(data.overallRmsVelocity ?? 0) };

  const metadata: VibrationApiMetadata = {
    processedAt: new Date().toISOString(),
    ...(typeof data.metadata === "object" && data.metadata
      ? (data.metadata as Record<string, unknown>)
      : {})
  };

  // Preserve envelope when present (do not coerce missing → null)
  const envelopeRaw = data.envelope;
  const envelope =
    envelopeRaw && typeof envelopeRaw === "object" && !Array.isArray(envelopeRaw)
      ? {
          peakAmplitude: Number(
            (envelopeRaw as Record<string, unknown>).peakAmplitude ?? 0
          ),
          dominantFrequency: Number(
            (envelopeRaw as Record<string, unknown>).dominantFrequency ?? 0
          ),
          energy: Number((envelopeRaw as Record<string, unknown>).energy ?? 0)
        }
      : undefined;

  const { envelope: _dropEnvelope, ...dataRest } = data;

  return {
    success: true,
    ...dataRest,
    broadband,
    spectral,
    metadata,
    analysisSource: data.analysisSource || "consensus",
    ...(envelope &&
    (envelope.peakAmplitude > 0 ||
      envelope.dominantFrequency > 0 ||
      envelope.energy > 0)
      ? { envelope }
      : {})
  };
}

export function buildAnalyzeVibrationErrorBody(
  error: unknown,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Internal server synthesis error";
  return {
    success: false,
    error: message,
    message,
    metadata: { processedAt: new Date().toISOString() },
    ...extra
  };
}

export interface ExpressLikeResponse {
  headersSent: boolean;
  status(code: number): ExpressLikeResponse;
  setHeader(name: string, value: string | number): void;
  end(body?: string): void;
  json?(body: unknown): ExpressLikeResponse;
}

/** Write JSON with explicit Content-Length so clients never see 0-byte bodies. */
export function sendExpressJson(
  res: ExpressLikeResponse,
  body: unknown,
  status = 200
): ExpressLikeResponse {
  if (res.headersSent) {
    console.error("[safeApiJson] Headers already sent — cannot write JSON body.");
    return res;
  }
  try {
    const payload = safeJsonStringify(body);
    const bytes = Buffer.byteLength(payload, "utf8");
    if (bytes === 0) {
      throw new Error("Refusing to send 0-byte JSON response.");
    }
    res.status(status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", bytes);
    res.end(payload);
    return res;
  } catch (serializeErr) {
    console.error("[safeApiJson] Serialization failed:", serializeErr);
    const fallback = buildAnalyzeVibrationErrorBody(serializeErr, {
      errorType: "GATEWAY_TIMEOUT",
      title: "Consensus Diagnostic Error"
    });
    const payload = safeJsonStringify(fallback);
    if (!res.headersSent) {
      res.status(500);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Length", Buffer.byteLength(payload, "utf8"));
      res.end(payload);
    }
    return res;
  }
}

export function jsonResponseBody(body: unknown, status = 200): Response {
  try {
    const payload = safeJsonStringify(body);
    if (Buffer.byteLength(payload, "utf8") === 0) {
      throw new Error("Refusing to send 0-byte JSON response.");
    }
    return new Response(payload, {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(payload, "utf8"))
      }
    });
  } catch (serializeErr) {
    console.error("[safeApiJson] Next/jsonResponseBody failed:", serializeErr);
    const fallback = buildAnalyzeVibrationErrorBody(serializeErr);
    const payload = safeJsonStringify(fallback);
    return new Response(payload, {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(payload, "utf8"))
      }
    });
  }
}
