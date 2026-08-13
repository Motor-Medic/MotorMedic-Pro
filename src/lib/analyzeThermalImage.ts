/**
 * Client-side relative thermography analysis for standard screenshots
 * (JPG/PNG/WebP/GIF) and radiometric camera exports.
 *
 * Does not require absolute °C/°F pixel data — uses color-gradient heuristics
 * typical of ironbow / rainbow / white-hot thermal palettes.
 */

export type ThermalVisualAnalysis = {
  mode: "visual" | "radiometric_candidate";
  /** 0–1 fraction of pixels classified as warm/hot */
  hotspotRatio: number;
  /** 0–1 peak heat index in the frame */
  maxHeatIndex: number;
  /** 0–1 mean heat index */
  avgHeatIndex: number;
  /** Relative ΔT proxy (°F-scale) for UI — not a calibrated measurement */
  estimatedDeltaTF: number;
  /** Estimated hotspot display temp (°F) for UI — relative only */
  estimatedHotspotF: number;
  /** Estimated cooler reference (°F) */
  estimatedRefF: number;
  severity: "NORMAL" | "ANOMALY" | "CRITICAL";
  overallHealthScore: number;
  primaryFaultTitle: string;
  confidencePercent: number;
  summaryHint: string;
};

function isRadiometricCandidate(fileName: string): boolean {
  return /\.(r-?jpe?g|is2|seq)$/i.test(fileName);
}

/** Map RGB → heat index 0–1 for common thermal false-color palettes. */
function rgbToHeatIndex(r: number, g: number, b: number): number {
  // Luminance — white-hot / high-temp tips
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // Warm hue bias (reds / yellows / oranges common in ironbow & rainbow)
  const warm = Math.max(0, (r - b) / 255) * 0.55 + Math.max(0, (r - g) / 255) * 0.2;
  // Magenta/purple mid-tones in ironbow (still elevated vs deep blue)
  const magenta = Math.min(r, b) / 255 - g / 255;
  const purpleBias = magenta > 0.05 ? magenta * 0.35 : 0;
  // Deep blue / cyan = cold
  const coldPenalty = Math.max(0, (b - r) / 255) * 0.45;
  return Math.max(0, Math.min(1, lum * 0.45 + warm + purpleBias - coldPenalty));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode thermal image."));
    img.src = url;
  });
}

/**
 * Sample the image on a downscaled canvas and score relative hotspots.
 */
export async function analyzeThermalImageVisual(
  imageUrl: string,
  fileName?: string
): Promise<ThermalVisualAnalysis> {
  const img = await loadImage(imageUrl);
  const maxSide = 160;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
  const w = Math.max(8, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(8, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas unavailable for thermal visual analysis.");
  }
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let sum = 0;
  let maxHeat = 0;
  let hotCount = 0;
  const n = w * h;
  for (let i = 0; i < data.length; i += 4) {
    const heat = rgbToHeatIndex(data[i], data[i + 1], data[i + 2]);
    sum += heat;
    if (heat > maxHeat) maxHeat = heat;
    if (heat >= 0.55) hotCount += 1;
  }

  const avgHeatIndex = sum / n;
  const hotspotRatio = hotCount / n;
  const radiometric = fileName ? isRadiometricCandidate(fileName) : false;

  // Relative °F proxies for UI (not calibrated radiometry)
  const estimatedHotspotF = Math.round(70 + maxHeat * 110);
  const estimatedRefF = Math.round(70 + avgHeatIndex * 45);
  const estimatedDeltaTF = Math.max(0, Math.round((estimatedHotspotF - estimatedRefF) * 10) / 10);

  let severity: ThermalVisualAnalysis["severity"] = "NORMAL";
  let overallHealthScore = 88;
  let primaryFaultTitle = "None Detected";
  let confidencePercent = 78;
  let summaryHint =
    "Visual thermal review shows balanced color distribution — no dominant hotspot.";

  if (maxHeat >= 0.78 || hotspotRatio >= 0.12 || estimatedDeltaTF >= 35) {
    severity = "CRITICAL";
    overallHealthScore = Math.max(18, Math.round(42 - hotspotRatio * 80 - maxHeat * 12));
    primaryFaultTitle = "Loose Connection";
    confidencePercent = Math.min(96, Math.round(82 + maxHeat * 14));
    summaryHint =
      "Visual hotspot detection found a localized high-heat region consistent with a high-resistance connection or severe overheating.";
  } else if (maxHeat >= 0.58 || hotspotRatio >= 0.05 || estimatedDeltaTF >= 18) {
    severity = "ANOMALY";
    overallHealthScore = Math.max(45, Math.round(72 - hotspotRatio * 90 - maxHeat * 18));
    primaryFaultTitle = "Localized Overheating";
    confidencePercent = Math.min(92, Math.round(75 + maxHeat * 12));
    summaryHint =
      "Elevated warm-zone gradient detected. Relative analysis suggests developing thermal stress — schedule inspection.";
  }

  return {
    mode: radiometric ? "radiometric_candidate" : "visual",
    hotspotRatio,
    maxHeatIndex: maxHeat,
    avgHeatIndex,
    estimatedDeltaTF,
    estimatedHotspotF,
    estimatedRefF,
    severity,
    overallHealthScore,
    primaryFaultTitle,
    confidencePercent,
    summaryHint
  };
}
