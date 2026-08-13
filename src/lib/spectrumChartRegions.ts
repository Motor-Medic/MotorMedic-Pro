/**
 * Hybrid spectrum chart display — shared types, Canvas cropping, and API path.
 * Vision detection runs server-side (see detectSpectrumRegions.ts).
 */

/** Express + client path for GPT-4o chart-panel localization */
export const DETECT_SPECTRUM_REGIONS_API_PATH = "/api/detect-spectrum-regions";

export type ChartRegionKind = "twf" | "fft" | "envelope";

/** Normalized bounding box — fractions of full image width/height (0–1). */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface ChartAxisRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xUnit?: string;
  yUnit?: string;
}

export interface SpectrumChartPeak {
  frequencyHz: number;
  amplitude: number;
  label?: string;
  chart?: ChartRegionKind;
}

export interface SpectrumRegionDetection {
  regions: Partial<Record<ChartRegionKind, NormalizedBox>>;
  peaks: SpectrumChartPeak[];
  axisRanges?: Partial<Record<ChartRegionKind, ChartAxisRange>>;
  /** Visible x-axis numeric tick labels per spectral panel (FFT denser than D-Mod). */
  xTickCounts?: Partial<Record<"fft" | "envelope", number>>;
  detectionConfidence: number;
  notes?: string;
}

export interface CroppedChartRegions {
  twf?: string;
  fft?: string;
  envelope?: string;
}

export type ChartRegionDetectStatus =
  | "idle"
  | "detecting"
  | "ready"
  | "failed";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Accept 0–1 fractions or absolute pixel boxes (when imageSize is known). */
export function normalizeBox(
  raw: unknown,
  imageSize?: { width: number; height: number }
): NormalizedBox | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  let x = Number(o.x ?? o.left ?? o.x0);
  let y = Number(o.y ?? o.top ?? o.y0);
  let width = Number(o.width ?? o.w);
  let height = Number(o.height ?? o.h);

  // x1/y1/x2/y2 style
  if ((!Number.isFinite(width) || width <= 0) && o.x2 != null && o.x1 != null) {
    x = Number(o.x1);
    width = Number(o.x2) - Number(o.x1);
  }
  if ((!Number.isFinite(height) || height <= 0) && o.y2 != null && o.y1 != null) {
    y = Number(o.y1);
    height = Number(o.y2) - Number(o.y1);
  }

  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null;
  if (width <= 0 || height <= 0) return null;

  const looksNormalized =
    x >= 0 &&
    y >= 0 &&
    x <= 1.05 &&
    y <= 1.05 &&
    width <= 1.05 &&
    height <= 1.05;

  if (!looksNormalized && imageSize?.width && imageSize?.height) {
    x /= imageSize.width;
    y /= imageSize.height;
    width /= imageSize.width;
    height /= imageSize.height;
  } else if (!looksNormalized) {
    // Assume percentages 0–100
    if (x > 1 || y > 1 || width > 1 || height > 1) {
      x /= 100;
      y /= 100;
      width /= 100;
      height /= 100;
    }
  }

  x = clamp01(x);
  y = clamp01(y);
  width = clamp01(width);
  height = clamp01(height);
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  if (width < 0.04 || height < 0.04) return null;

  const confidence = Number(o.confidence);
  return {
    x,
    y,
    width,
    height,
    ...(Number.isFinite(confidence) ? { confidence } : {})
  };
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load spectrum image for cropping."));
    img.src = src;
  });
}

/**
 * Crop a normalized region from an image (blob URL or data URL) via Canvas.
 * Returns a PNG data URL.
 */
export async function cropNormalizedRegion(
  imageSrc: string,
  box: NormalizedBox,
  padding = 0.01
): Promise<string> {
  const img = await loadImageElement(imageSrc);
  const padX = Math.max(0, padding) * img.naturalWidth;
  const padY = Math.max(0, padding) * img.naturalHeight;

  let sx = box.x * img.naturalWidth - padX;
  let sy = box.y * img.naturalHeight - padY;
  let sw = box.width * img.naturalWidth + padX * 2;
  let sh = box.height * img.naturalHeight + padY * 2;

  sx = Math.max(0, Math.min(img.naturalWidth - 1, sx));
  sy = Math.max(0, Math.min(img.naturalHeight - 1, sy));
  sw = Math.max(1, Math.min(img.naturalWidth - sx, sw));
  sh = Math.max(1, Math.min(img.naturalHeight - sy, sh));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function cropAllChartRegions(
  imageSrc: string,
  regions: Partial<Record<ChartRegionKind, NormalizedBox>>
): Promise<CroppedChartRegions> {
  const out: CroppedChartRegions = {};
  const kinds: ChartRegionKind[] = ["twf", "fft", "envelope"];

  await Promise.all(
    kinds.map(async (kind) => {
      const box = regions[kind];
      if (!box) return;
      try {
        out[kind] = await cropNormalizedRegion(imageSrc, box);
      } catch (err) {
        console.warn(`[spectrumChartRegions] Crop failed for ${kind}:`, err);
      }
    })
  );

  return out;
}

/**
 * Client-side safety: if envelope reports more x-axis ticks than fft, swap roles.
 * FFT typically has 8–12 tick labels; D-Mod/Envelope typically has 4–6.
 */
export function applyTickDensityRoleCorrection(
  detection: SpectrumRegionDetection
): SpectrumRegionDetection {
  const fftTicks = Number(detection.xTickCounts?.fft);
  const envTicks = Number(detection.xTickCounts?.envelope);
  if (!Number.isFinite(fftTicks) || !Number.isFinite(envTicks)) {
    return detection;
  }

  const shouldSwap =
    envTicks >= fftTicks + 2 || (envTicks >= 8 && fftTicks <= 6) || (fftTicks <= 6 && envTicks >= 7);

  if (!shouldSwap) return detection;
  if (!detection.regions.fft && !detection.regions.envelope) return detection;

  console.log(
    `[spectrumChartRegions] Client swap fft↔envelope (ticks fft=${fftTicks}, envelope=${envTicks})`
  );

  const regions = { ...detection.regions };
  const tmpR = regions.fft;
  regions.fft = regions.envelope;
  regions.envelope = tmpR;

  const axisRanges = { ...(detection.axisRanges || {}) };
  const tmpA = axisRanges.fft;
  axisRanges.fft = axisRanges.envelope;
  axisRanges.envelope = tmpA;

  const xTickCounts = { ...(detection.xTickCounts || {}) };
  const tmpT = xTickCounts.fft;
  xTickCounts.fft = xTickCounts.envelope;
  xTickCounts.envelope = tmpT;

  const peaks = (detection.peaks || []).map((p) => {
    if (p.chart === "fft") return { ...p, chart: "envelope" as const };
    if (p.chart === "envelope") return { ...p, chart: "fft" as const };
    return p;
  });

  return {
    ...detection,
    regions,
    axisRanges,
    xTickCounts,
    peaks,
    notes: [detection.notes, `client tick-density swap (fft=${fftTicks}→env, env=${envTicks}→fft)`]
      .filter(Boolean)
      .join(" | ")
  };
}

/** Map peak frequency into 0–100% left position within a chart plot area. */
export function peakXPercent(
  frequencyHz: number,
  axis?: ChartAxisRange | null,
  fallbackMaxHz = 1000
): number {
  const min = axis?.xMin ?? 0;
  const max = axis?.xMax && axis.xMax > min ? axis.xMax : fallbackMaxHz;
  const pct = ((frequencyHz - min) / (max - min)) * 100;
  return Math.max(2, Math.min(98, pct));
}

export function peakYPercent(
  amplitude: number,
  axis?: ChartAxisRange | null,
  fallbackMax = 10
): number {
  const min = axis?.yMin ?? 0;
  const max = axis?.yMax && axis.yMax > min ? axis.yMax : fallbackMax;
  // CSS top: 0 is top of image — invert so higher amp sits higher on chart
  const fromBottom = ((amplitude - min) / (max - min)) * 100;
  const top = 100 - fromBottom;
  return Math.max(4, Math.min(96, top));
}

export async function requestSpectrumRegionDetection(
  imageBase64: string
): Promise<SpectrumRegionDetection> {
  const res = await fetch(DETECT_SPECTRUM_REGIONS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 })
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Region detection failed (HTTP ${res.status}).`
    );
  }

  return payload as SpectrumRegionDetection;
}
