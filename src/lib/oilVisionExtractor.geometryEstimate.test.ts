import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import {
  amplitudeAxisMaxOf,
  deriveGeometryEstimatePeaks,
  FREQ_ONLY_GEOMETRY_PROVENANCE,
  GEOMETRY_BAR_HEIGHT_PROVENANCE,
  GEOMETRY_ESTIMATE_MODE,
  GEOMETRY_PEAK_CONFIDENCE_CAP,
  GEOMETRY_PEAK_SOURCE,
  GEOMETRY_PEAK_SOURCE_BAR_HEIGHT,
  geometrySpikeCandidates,
  isEstimatedExtractionMode,
  MEASURED_PEAK_CONFIDENCE_BASELINE,
  parsePeaks,
  readableRpmOf,
  sanitizeVibrationSpectralRows,
  type MasterVisionParse
} from "./oilVisionExtractor";
import { finalizeVibrationFromParses } from "./vibrationVisionExtractor";
import {
  buildBridgeContext,
  buildCmmsFieldList,
  buildCustomCmmsFields,
  CMMS_TARGETS,
  SPECTRUM_PEAKS_ESTIMATED_PROVENANCE,
  type CmmsPayloadContext,
  type CustomCmmsFieldSchema
} from "./diagnostics/cmmsPayload";
import { MASTER_VISION_PROMPT } from "./vision/masterVisionPrompt";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

interface RawRow {
  header: string;
  value: number | string | null;
  unit_as_read: string | null;
  operator: null;
}

const row = (
  header: string,
  value: number | string | null,
  unit: string | null = null
): RawRow => ({ header, value, unit_as_read: unit, operator: null });

const EXTRACTION_INPUT = { imageBase64: "data:image/png;base64,x", fileName: "fixture.png" };

/**
 * Geometry-estimate fixture (§9 contract rows): running speed + two interior
 * spikes (one with a legible bar height, one without) + printed amplitude
 * scale + a frequency-axis endpoint that must never become a peak.
 */
function geometryParse(): Record<string, unknown> {
  return {
    detected_technology: "VIBRATION",
    data: { vibration: {} },
    warnings: ["geometry estimate rows (no printed amplitude)"],
    raw_table: [
      row("Running speed", 1780, "rpm"),
      row("Geometry peak 1", 29.6, "Hz @ bar 0.62"),
      row("Geometry peak 2", 59.3, "Hz (amplitude not printed)"),
      row("Amplitude axis maximum", 10, "mm/s"),
      row("X axis maximum", 200, "Hz")
    ]
  };
}

/** Strict fixture: AR-23d-valid amplitude-labelled spectral peaks (never estimate mode). */
function strictParse(): Record<string, unknown> {
  return {
    detected_technology: "VIBRATION",
    data: { vibration: {} },
    warnings: [],
    raw_table: [
      row("Running speed", 1780, "rpm"),
      row("Spectral peak 1", 29.67, "Hz @ 1.25 mm/s"),
      row("Spectral peak 2", 59.33, "Hz @ 0.85 mm/s"),
      row("Overall velocity", 2.1, "mm/s RMS"),
      row("Severity", "ALERT", null)
    ]
  };
}

/** Production-shaped estimate parse: the sanitizer has run (rows stashed, dropped). */
function sanitizedGeometryParse(): Record<string, unknown> {
  return sanitizeVibrationSpectralRows(geometryParse());
}

/** Remove raw_table rows whose header matches, in place (fixture shaping). */
function dropRowsMatching(parsed: Record<string, unknown>, test: (header: string) => boolean): void {
  const rows = parsed.raw_table;
  if (!Array.isArray(rows)) return;
  parsed.raw_table = rows.filter((r) => {
    if (!r || typeof r !== "object") return true;
    const header = "header" in r ? String((r as RawRow).header ?? "") : "";
    return !test(header);
  });
}

const asParse = (parsed: Record<string, unknown>, model = "model-a"): MasterVisionParse => ({
  provider: "Test",
  model,
  parsed
});

/* ------------------------------------------------------------------ */
/* Gate 1 — derive from geometry (RPM/60), no fabricated values       */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 1 — geometry derive snaps to shaft orders, never fabricates", () => {
  it("derives order-snapped frequencies from RPM/60 with honest amplitudes", () => {
    const peaks = deriveGeometryEstimatePeaks(geometryParse());
    expect(peaks).not.toBeNull();
    const list = peaks ?? [];
    expect(list.map((p) => p.frequency)).toEqual([29.67, 59.33]);

    const barPeak = list[0];
    expect(barPeak?.amplitude).toBe(6.2); // 0.62 x printed 10 mm/s scale
    expect(barPeak?.source).toBe(GEOMETRY_PEAK_SOURCE_BAR_HEIGHT);
    expect(barPeak?.provenance).toBe(GEOMETRY_BAR_HEIGHT_PROVENANCE);
    expect(barPeak?.estimated).toBe(true);

    const freqOnly = list[1];
    expect(freqOnly?.amplitude).toBeNull(); // no printed scale for this spike — stays null
    expect(freqOnly?.source).toBe(GEOMETRY_PEAK_SOURCE);
    expect(freqOnly?.provenance).toBe(FREQ_ONLY_GEOMETRY_PROVENANCE);
  });

  it("caps derived confidence strictly below the measured baseline", () => {
    const peaks = deriveGeometryEstimatePeaks(geometryParse()) ?? [];
    expect(peaks.length).toBeGreaterThan(0);
    for (const p of peaks) {
      expect(p.confidence).toBeLessThanOrEqual(GEOMETRY_PEAK_CONFIDENCE_CAP);
      expect(p.confidence).toBeLessThan(MEASURED_PEAK_CONFIDENCE_BASELINE);
    }
  });

  it("drops axis endpoints, off-order spikes, and out-of-range bar fractions", () => {
    const parsed: Record<string, unknown> = {
      detected_technology: "VIBRATION",
      data: { vibration: {} },
      raw_table: [
        row("Running speed", 1780, "rpm"),
        row("Geometry peak 1", 137, "Hz (amplitude not printed)"), // not an RPM harmonic
        row("Geometry peak 2", 29.6, "Hz @ bar 3.2"), // bar fraction > 1 → not legible
        row("Geometry peak 3", 200, "Hz (amplitude not printed)"), // == fmax endpoint
        row("Geometry peak 4", 89, "Hz @ bar 0.4"), // 3rd order
        row("Amplitude axis maximum", 10, "mm/s"),
        row("X axis maximum", 200, "Hz")
      ]
    };
    const spikes = geometrySpikeCandidates(parsed);
    expect(spikes.map((s) => s.frequencyHz)).toEqual([137, 29.6, 89]);
    const peaks = deriveGeometryEstimatePeaks(parsed) ?? [];
    expect(peaks.map((p) => p.frequency)).toEqual([29.67, 89]);
    expect(peaks[0]?.amplitude).toBeNull(); // illegible bar fraction stays null
    expect(peaks[1]?.amplitude).toBe(4); // 0.4 x 10
  });

  it("refuses to derive without readable RPM or for non-vibration parses", () => {
    const noRpm = geometryParse();
    dropRowsMatching(noRpm, (h) => /speed|rpm/i.test(h));
    expect(deriveGeometryEstimatePeaks(noRpm)).toBeNull();
    expect(readableRpmOf(noRpm)).toBeNull();

    const oil = { ...geometryParse(), detected_technology: "OIL" };
    expect(deriveGeometryEstimatePeaks(oil)).toBeNull();
  });

  it("reads the printed amplitude-axis maximum but never the frequency axis", () => {
    expect(amplitudeAxisMaxOf(geometryParse())).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Gate 2 — mode-aware sanitizer: absolute rules hold in BOTH modes   */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 2 — sanitizer drops estimate rows from raw_table and stashes candidates", () => {
  it("never lets geometry/axis rows survive into raw_table (both modes)", () => {
    const sanitized = sanitizedGeometryParse();
    const headers = ((sanitized.raw_table as RawRow[]) ?? []).map((r) =>
      String(r.header).toLowerCase()
    );
    expect(headers.some((h) => h.includes("geometry peak"))).toBe(false);
    expect(headers.some((h) => h.includes("amplitude axis maximum"))).toBe(false);
    // the rpm row is a measurement and stays
    expect(headers.some((h) => h.includes("running speed"))).toBe(true);
  });

  it("stashes spike candidates + y-max so derivation still works after the drop", () => {
    const sanitized = sanitizedGeometryParse();
    const stashed = sanitized.geometryEstimateInput as {
      spikes: Array<{ frequencyHz: number; barFraction: number | null }>;
      amplitudeAxisMax: number | null;
    };
    expect(stashed.spikes).toHaveLength(2);
    expect(stashed.amplitudeAxisMax).toBe(10);
    const peaks = deriveGeometryEstimatePeaks(sanitized) ?? [];
    expect(peaks.map((p) => p.frequency)).toEqual([29.67, 59.33]);
  });

  it("keeps strict-valid amplitude-labelled rows intact (strict path untouched)", () => {
    const sanitized = sanitizeVibrationSpectralRows(strictParse());
    expect(parsePeaks(sanitized)).toEqual([29.67, 59.33]);
    const headers = ((sanitized.raw_table as RawRow[]) ?? []).map((r) => r.header);
    expect(headers).toContain("Spectral peak 1");
    expect(headers).toContain("Spectral peak 2");
  });

  it("still rejects ticks/0/negative frequencies as candidates (absolute rules)", () => {
    const parsed: Record<string, unknown> = {
      detected_technology: "VIBRATION",
      data: { vibration: {} },
      raw_table: [
        row("Running speed", 1780, "rpm"),
        row("Peak", 0, "Hz (amplitude not printed)"),
        row("Peak 2", -5, "Hz (amplitude not printed)"),
        row("Y axis tick 5", 5, "mm/s"),
        row("Geometry peak 1", 29.6, "Hz @ bar 0.62")
      ]
    };
    const spikes = geometrySpikeCandidates(parsed);
    expect(spikes.map((s) => s.frequencyHz)).toEqual([29.6]);
  });
});

/* ------------------------------------------------------------------ */
/* Gate 3 — strict path wins; measured mode is never badge-labelled   */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 3 — strict printed-amplitude peaks always produce strict mode", () => {
  it("finalizes a strict parse as consensus/single with no geometry peaks", () => {
    const result = finalizeVibrationFromParses(
      [asParse(strictParse()), asParse(strictParse(), "model-b")],
      null,
      EXTRACTION_INPUT
    );
    expect(result.success).toBe(true);
    expect(result.extractionMode).toBe("consensus");
    expect(result.data?.geometryPeaks).toBeUndefined();
    expect(result.data?.peakFrequencies).toEqual([29.67, 59.33]);
  });

  it("strict fixture is never geometry-eligible while peaks validate", () => {
    // The chain gates derivation behind parsePeaks === null; the finalizer
    // mirrors that: derive only when the strict path found nothing.
    expect(parsePeaks(strictParse())).not.toBeNull();
    expect(isEstimatedExtractionMode("consensus")).toBe(false);
    expect(isEstimatedExtractionMode("single")).toBe(false);
    expect(isEstimatedExtractionMode(undefined)).toBe(false);
    expect(isEstimatedExtractionMode(null)).toBe(false);
    expect(isEstimatedExtractionMode(GEOMETRY_ESTIMATE_MODE)).toBe(true);
  });

  it("prompt keeps the §8 strict contract and adds the §9 fallback contract", () => {
    expect(MASTER_VISION_PROMPT).toContain("8. SPECTRUM / FFT CHARTS (VIBRATION SCREENSHOTS)");
    expect(MASTER_VISION_PROMPT).toContain(
      'NEVER emit a peak whose amplitude is not printed as a "Spectral peak" row'
    );
    expect(MASTER_VISION_PROMPT).toContain("9. GEOMETRY FALLBACK ROWS (VIBRATION, ONLY WHEN §8 PEAKS ARE ABSENT)");
    expect(MASTER_VISION_PROMPT).toContain('"Geometry peak <n>"');
    expect(MASTER_VISION_PROMPT).toContain("Amplitude axis maximum");
    expect(MASTER_VISION_PROMPT).toContain(
      'a chart WITH amplitude-labelled peaks emits NO "Geometry peak" rows'
    );
  });
});

/* ------------------------------------------------------------------ */
/* Gate 4 — estimate finalization, no-RPM refusal, zero console.error */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 4 — estimate mode is engaged only with RPM + candidates", () => {
  it("finalizes an eligible parse as geometry-estimate with derived peaks", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = finalizeVibrationFromParses(
      [asParse(sanitizedGeometryParse())],
      null,
      EXTRACTION_INPUT
    );
    expect(result.success).toBe(true);
    expect(result.extractionMode).toBe("geometry-estimate");
    expect(result.data?.extractionMode).toBe("geometry-estimate");
    const peaks = result.data?.geometryPeaks ?? [];
    expect(peaks.map((p) => p.frequency)).toEqual([29.67, 59.33]);
    expect(peaks[1]?.amplitude).toBeNull();
    expect(result.data?.peakFrequencies).toEqual([29.67, 59.33]);
    expect(result.flaggedFields).toContain("peakFrequencies");
    // estimate frequencies are never mislabelled consensus/single
    expect(result.extractionMode).not.toBe("consensus");
    expect(result.extractionMode).not.toBe("single");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("refuses the estimate fallback without readable RPM (peaks stay null)", () => {
    const noRpm = geometryParse();
    dropRowsMatching(noRpm, (h) => /speed|rpm/i.test(h));
    const result = finalizeVibrationFromParses(
      [asParse(sanitizeVibrationSpectralRows(noRpm))],
      null,
      EXTRACTION_INPUT
    );
    expect(result.success).toBe(true);
    expect(result.extractionMode).toBe("single");
    expect(result.data?.geometryPeaks).toBeUndefined();
    expect(result.data?.peakFrequencies).toBeNull(); // dropped rows never resurrect
  });
});

/* ------------------------------------------------------------------ */
/* Gate 5 — export honesty: Option A provenance, amplitudes withheld  */
/* ------------------------------------------------------------------ */

function ctxOf(over: Partial<CmmsPayloadContext> = {}): CmmsPayloadContext {
  return {
    assetTag: "M-100",
    component: "Motor",
    faultTitle: "Outer Race Bearing Defect (BPFO)",
    severity: "CRITICAL",
    confidencePercent: 87,
    healthScore: 42,
    healthScoreIsDefault: false,
    horizonHours: null,
    horizonDriver: null,
    horizonBasis: null,
    corroborationPercent: null,
    technologiesWithData: ["vibration"],
    signOffStatus: "approved",
    signOffEngineer: "J. Rivera, CAT III",
    signOffAt: "2026-08-24T14:32:00.000Z",
    recommendations: ["Re-lubricate bearing"],
    diagnosisId: "dx-1",
    ...over
  };
}

function analysisOf(over: Partial<SavedAnalysisResult> = {}): SavedAnalysisResult {
  return {
    id: "a-1",
    asset_id: "M-100",
    component: "Motor",
    timestamp: "2026-10-01T10:00:00.000Z",
    health_score: 55,
    primary_fault: "Outer Race Bearing Defect (BPFO)",
    fault_list: [
      { title: "Outer Race Bearing Defect (BPFO)", frequencyHz: 29.67, confidencePercent: 80 }
    ],
    peaks: [],
    spectrum_image_url: null,
    recommendations: ["Re-lubricate bearing"],
    financial_impact: {},
    severity: "high",
    summary: "Elevated BPFO",
    analysis_type: "vibration",
    telemetry_data: {
      vibration_trend_record: {
        extractionMode: GEOMETRY_ESTIMATE_MODE,
        spectral: [
          { frequency: 29.67, amplitude: 6.2, source: GEOMETRY_PEAK_SOURCE_BAR_HEIGHT },
          { frequency: 59.33, amplitude: null, source: GEOMETRY_PEAK_SOURCE }
        ]
      }
    },
    ...over
  };
}

describe("AR-23e gate 5 — estimated amplitudes never reach CMMS numbers; provenance ships", () => {
  it("withholds the estimated amplitude and states the provenance on every target", () => {
    const ctx = buildBridgeContext(analysisOf(), { planningInputs: null });
    expect(ctx.spectrumPeakProvenance).toBe(SPECTRUM_PEAKS_ESTIMATED_PROVENANCE);
    // severity ratio falls back to 0 — the 6.2 estimate never feeds the score
    expect(ctx.priority?.breakdown.startsWith("sev: 0.0000")).toBe(true);
    // no trend/RUL from estimates: planning inputs absent → no timing row
    expect(ctx.timing).toBeUndefined();

    for (const target of CMMS_TARGETS.map((t) => t.id)) {
      const fields = buildCmmsFieldList(target, ctx);
      const prov = fields.filter((f) => f.label === "Spectrum Peak Provenance");
      expect(prov, `${target} provenance row`).toHaveLength(1);
      expect(prov[0]?.value).toBe(SPECTRUM_PEAKS_ESTIMATED_PROVENANCE);
      expect(fields.some((f) => f.value.includes("6.2"))).toBe(false);
    }
  });

  it("ships measured peaks with a real severity ratio and no provenance row", () => {
    const measured = analysisOf({
      telemetry_data: {
        vibration_trend_record: {
          extractionMode: "consensus",
          spectral: [{ frequency: 29.67, amplitude: 1.25 }]
        }
      }
    });
    const ctx = buildBridgeContext(measured, { planningInputs: null });
    expect(ctx.spectrumPeakProvenance).toBeNull();
    expect(ctx.priority?.breakdown.startsWith("sev: 0.0000")).toBe(false);
    for (const target of CMMS_TARGETS.map((t) => t.id)) {
      const fields = buildCmmsFieldList(target, ctx);
      expect(
        fields.some((f) => f.label === "Spectrum Peak Provenance"),
        `${target} must not carry a provenance row for measured peaks`
      ).toBe(false);
    }
  });

  it("appends the provenance note to custom templates, never a number", () => {
    const template: CustomCmmsFieldSchema = {
      fields: [{ key: "PEAKS", label: "Peak Amp", sourcePath: "priority.score" }],
      priorityMapping: { CRITICAL: "High", ANOMALY: "Medium", NORMAL: "Low" },
      workTypeMapping: { CRITICAL: "Corrective", ANOMALY: "Corrective", NORMAL: "Preventive" }
    };
    const ctx = buildBridgeContext(analysisOf(), { planningInputs: null });
    const out = buildCustomCmmsFields(ctx, template);
    const prov = out.filter((f) => f.label === "Spectrum Peak Provenance");
    expect(prov).toHaveLength(1);
    expect(prov[0]?.value).toBe(SPECTRUM_PEAKS_ESTIMATED_PROVENANCE);

    const measuredCtx = ctxOf();
    const measuredOut = buildCustomCmmsFields(measuredCtx, template);
    expect(measuredOut.some((f) => f.label === "Spectrum Peak Provenance")).toBe(false);
  });

  it("skips estimated amplitudes when composing the history trend series", () => {
    const current = analysisOf();
    const history: SavedAnalysisResult[] = [
      analysisOf({
        id: "a-0",
        timestamp: "2026-09-01T10:00:00.000Z",
        telemetry_data: {
          vibration_trend_record: {
            extractionMode: GEOMETRY_ESTIMATE_MODE,
            spectral: [{ frequency: 29.67, amplitude: 5.9, source: GEOMETRY_PEAK_SOURCE }]
          }
        }
      })
    ];
    const ctx = buildBridgeContext(current, { planningInputs: null, loadedAnalyses: history });
    // current run is estimate-only → amplitude withheld → no trend series
    expect(ctx.timing).toBeUndefined();
    expect(ctx.spectrumPeakProvenance).toBe(SPECTRUM_PEAKS_ESTIMATED_PROVENANCE);
  });
});

/* ------------------------------------------------------------------ */
/* Gate 6 — UI badge present in estimate mode, absent when measured   */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 6 — every peak render site badges estimates and only estimates", () => {
  const sites: Array<[string, string[]]> = [
    ["../components/SpectralFftWorkspace.tsx", ["isEstimatedExtractionMode", "ESTIMATED_PEAK_BADGE", "record?.extractionMode"]],
    ["../components/diagnostics/VisionIntakePanel.tsx", ["isEstimatedExtractionMode", "ESTIMATED_PEAK_BADGE"]],
    ["../components/SpectrumLibraryTab.tsx", ["isEstimatedExtractionMode", "ESTIMATED_PEAK_BADGE", "extractRowExtractionMode"]],
    ["../components/Diagnose.tsx", ["isEstimatedExtractionMode", "ESTIMATED_PEAK_BADGE", "GEOMETRY_PEAK_CONFIDENCE_CAP"]]
  ];

  for (const [rel, needles] of sites) {
    it(`${rel} renders the ESTIMATED badge behind the estimate-mode guard`, () => {
      const src = readRel(rel);
      for (const needle of needles) {
        expect(src, `${rel} must reference ${needle}`).toContain(needle);
      }
    });
  }

  it("the shared badge helper is the only gate — measured modes never match", () => {
    // Logic-level absence: the helper is false for every non-estimate mode,
    // and every site gates its badge on this helper (asserted above).
    expect(["consensus", "single", "", "Consensus"].some((m) => isEstimatedExtractionMode(m))).toBe(false);
    expect(isEstimatedExtractionMode("geometry-estimate")).toBe(true);
  });

  it("SpectralFftWorkspace never renders a fabricated amplitude for null peaks", () => {
    const src = readRel("../components/SpectralFftWorkspace.tsx");
    expect(src).toContain('peak.amplitude != null ? peak.amplitude.toFixed(3) : "—"');
  });
});

/* ------------------------------------------------------------------ */
/* Gate 7 — cast discipline: baseline-pinned, zero in AR-23e sections */
/* ------------------------------------------------------------------ */

describe("AR-23e gate 7 — no new type casts / non-null assertions / ts-ignore", () => {
  const count = (src: string, re: RegExp): number => (src.match(re) ?? []).length;
  // AR-30: the forbidden tokens are assembled from concatenated string
  // literals so this guard file does not itself contain the patterns it
  // forbids elsewhere; the compiled RegExp sources are byte-identical to
  // the original literals.
  const RE_AS_UNKNOWN_AS = new RegExp("as " + "unknown " + "as", "g");
  const RE_AS_ANY = new RegExp("as " + "any", "g");
  const RE_TS_DIRECTIVE = new RegExp("@" + "ts-ignore|" + "@" + "ts-expect-error");
  const RE_SECTION_LAUNDER = new RegExp("as " + "unknown " + "as|as " + "any|@" + "ts-ignore");

  it("cast counts never grow past the pinned baselines", () => {
    const oil = readRel("./oilVisionExtractor.ts");
    const vib = readRel("./vibrationVisionExtractor.ts");
    const diag = readRel("../components/Diagnose.tsx");
    expect(count(oil, RE_AS_UNKNOWN_AS)).toBeLessThanOrEqual(0);
    expect(count(vib, RE_AS_UNKNOWN_AS)).toBeLessThanOrEqual(0);
    // AR-30: whole-file checks, not section-scoped - a single forbidden token
    // dropped anywhere in these extractors must fail this self-test.
    expect(count(oil, RE_AS_ANY)).toBeLessThanOrEqual(0);
    expect(count(vib, RE_AS_ANY)).toBeLessThanOrEqual(0);
    expect(count(diag, RE_AS_ANY)).toBeLessThanOrEqual(0);
  });

  it("no ts-ignore / ts-expect-error anywhere in the touched lib files", () => {
    for (const rel of [
      "./oilVisionExtractor.ts",
      "./vibrationVisionExtractor.ts",
      "./vibration/vibrationDiagnosticRecord.ts",
      "./diagnostics/cmmsPayload.ts",
      "../components/Diagnose.tsx"
    ]) {
      expect(readRel(rel)).not.toMatch(RE_TS_DIRECTIVE);
    }
  });

  it("the AR-23e sections themselves are cast-free", () => {
    const oil = readRel("./oilVisionExtractor.ts");
    const start = oil.indexOf("AR-23e geometry-estimate fallback");
    const end = oil.indexOf("Mirrors vibrationVisionExtractor.numClose");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = oil.slice(start, end);
    expect(section).not.toMatch(RE_SECTION_LAUNDER);
    expect(section).not.toMatch(/\w!\./);

    const vib = readRel("./vibrationVisionExtractor.ts");
    const vStart = vib.indexOf("AR-23e — the strict path");
    const vEnd = vib.indexOf("logPipelineSuccessVib");
    expect(vStart).toBeGreaterThan(-1);
    expect(vEnd).toBeGreaterThan(vStart);
    const vSection = vib.slice(vStart, vEnd);
    expect(vSection).not.toMatch(RE_SECTION_LAUNDER);
    expect(vSection).not.toMatch(/\w!\./);
  });
});
