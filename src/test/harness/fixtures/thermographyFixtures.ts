/**
 * SLICE-HARNESS fixtures — THERMOGRAPHY tab (hotspot / radiometric).
 *
 * Row shape mirrors the proven SLICE-VS7 factory
 * (src/components/TrendAnalyzer.vs7Thermography.render.test.tsx:56-98).
 *
 * Google-truth baseline: NETA/NFPA 70B ΔT severity classes live in
 * src/lib/thermographyAnalysis.ts:238-241 and the stored-class repair window
 * matrix in src/lib/thermographyTrendSeries.ts:311-330 — ΔT 50 °C ≡ Class 3
 * territory, but the row STORES "Class 2", so the honest render is the stored
 * class, never a recomputed one.
 *
 * SLICE-THERMO-FAULT adds a SMALL-ΔT fixture (~2 °F rise): per the real
 * NETA/NFPA 70B bands (thermographyAnalysis.ts:238, Class 1 LOW = ΔT 1–3 °C)
 * a 2.3 rise is Class 1 territory — the honest render is the stored low
 * class / "None Detected" pairing plus the stored-provenance disclosure
 * (TrendAnalyzer.tsx thermo-kpi-provenance), never an inflated
 * "ANOMALY / Loose Connection" verdict. This is the fixture gap that
 * previously let the implausible stored pairing render undisclosed.
 */
import type { TechFixtureState, TechFixtures } from "../contract";

const TS_A = "2026-11-13T09:00:00.000Z";

type Row = Record<string, unknown>;

function thermoRow(overrides: Row = {}): Row {
  return {
    id: "row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "thermography",
    timestamp: TS_A,
    health_score: 60,
    primary_fault: "Loose connection",
    recommendations: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: 120,
        reference_temp: 70,
        delta_t: 50,
        severity_class: "Class 2",
        load_percentage: 75,
        phase_a_temp: 118,
        phase_b_temp: 108,
        phase_c_temp: 104,
        de_bearing_temp: 130,
        ode_bearing_temp: 125,
        refractory_skin_temp: 150,
        ...(overrides.peak as Row | undefined)
      }
    ],
    telemetry_data: {
      environmental: {
        emissivity: 0.92,
        ambient_temp: 70,
        reflected_temp: 75,
        temp_unit: "°F"
      },
      ...(overrides.telemetry as Row | undefined)
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "peak" && key !== "telemetry"
      )
    )
  };
}

export const thermographyFixtures: TechFixtures = {
  tech: "thermography",
  /** Data present -> gates activate, real values render. */
  good: {
    name: "thermo-known-good",
    rows: [thermoRow()],
    truth: [
      {
        field: "NETA severity class",
        standard:
          "NETA/NFPA 70B stored severity class rendered verbatim (src/lib/thermographyAnalysis.ts:238-241 Class 2 MEDIUM band 4–15 °C)",
        expected: "Class 2 (MEDIUM)"
      },
      {
        field: "NETA repair window",
        standard:
          "NETA_STORED_CLASS_REPAIR_WINDOW — Class 2 → 30 days (src/lib/thermographyTrendSeries.ts:311-330)",
        expected: "Schedule repair within 30 days"
      },
      {
        field: "emissivity",
        standard:
          "dimensionless ε (0–1) stored value, never temp-converted (thermographyTrendSeries.ts:350-356)",
        expected: "Emissivity: 0.92"
      },
      {
        field: "reflected temperature provenance",
        standard:
          "radiometric T_refl shown in STORED units, never re-labelled (TrendAnalyzer.tsx:6973-6999)",
        expected: "Reflected: 75°F (stored units)"
      }
    ]
  },

  /** No data -> honest empty, NO fabricated default. */
  empty: {
    name: "thermo-known-empty",
    rows: [],
    truth: []
  },

  /**
   * Partial data: hotspot-only row. T_ref missing -> radiometric gate;
   * ε missing -> NO default 0.95; severity missing -> Not reported;
   * and no projection may appear.
   */
  edge: {
    name: "thermo-known-edge",
    rows: [
      thermoRow({
        peak: {
          hotspot_temp: 80,
          reference_temp: null,
          delta_t: 20,
          severity_class: null,
          load_percentage: null,
          phase_a_temp: null,
          phase_b_temp: null,
          phase_c_temp: null,
          de_bearing_temp: null,
          ode_bearing_temp: null,
          refractory_skin_temp: null
        },
        telemetry: { environmental: { temp_unit: "°F" } }
      })
    ],
    truth: []
  }
};

/**
 * SLICE-IR1 — ε FILE-EXTRACTED fixture: the row carries a radiometric /
 * ai_vision file marker (Diagnose.tsx stores ai_vision.emissivitySetting from
 * the THERMO-RAD decode) and no environmental ε entry, so the displayed ε is
 * file-extracted — the badge renders the THERMO-RAD cyan provenance note and
 * never the app-default warning. No substrate ε is invented anywhere.
 */
export const thermographyEmissivityExtractedFixture: TechFixtureState = {
  name: "thermo-eps-extracted",
  rows: [
    thermoRow({
      telemetry: {
        environmental: { ambient_temp: 70, temp_unit: "°F" },
        ai_vision: {
          emissivitySetting: 0.92,
          emissivity_setting: 0.92,
          radiometric: { emissivitySetting: 0.92 }
        }
      }
    })
  ],
  truth: [
    {
      field: "emissivity provenance (file-extracted)",
      standard:
        "THERMO-RAD: ε decoded from the file's FLIR radiometric metadata (ai_vision.radiometric.emissivitySetting, Diagnose.tsx ai_vision block) — displayed verbatim, never read from colors",
      expected:
        "Emissivity (ε) decoded from the file's FLIR radiometric metadata — not read from colors."
    }
  ]
};

/**
 * SLICE-THERMO-FAULT — SMALL-ΔT fixture (~2 °F rise). The stored pairing is
 * the honest low one: "None Detected" fault + stored Class 1, ΔT 2.3 °F
 * (≈1.3 °C — Class 1 LOW band 1–3 °C per thermographyAnalysis.ts:238).
 * Nothing in the render chain may inflate this to "ANOMALY / Loose
 * Connection": the verdict is stored from the scan (disclosed on the KPI
 * card via thermo-kpi-provenance), never ΔT-derived.
 */
export const thermographySmallDeltaFixture: TechFixtureState = {
  name: "thermo-small-delta",
  rows: [
    thermoRow({
      primary_fault: "None Detected",
      health_score: 90,
      peak: {
        hotspot_temp: 22.9,
        reference_temp: 20.6,
        delta_t: 2.3,
        severity_class: "Class 1",
        load_percentage: 75,
        phase_a_temp: null,
        phase_b_temp: null,
        phase_c_temp: null,
        de_bearing_temp: null,
        ode_bearing_temp: null,
        refractory_skin_temp: null
      },
      telemetry: {
        environmental: { emissivity: 0.92, ambient_temp: 68, temp_unit: "°F" }
      }
    })
  ],
  truth: [
    {
      field: "NETA severity class (small ΔT)",
      standard:
        "NETA/NFPA 70B Class 1 LOW band ΔT 1–3 °C (src/lib/thermographyAnalysis.ts:238) — 2.3 °F ≈ 1.3 °C is Class 1 territory; stored class renders verbatim, never inflated",
      expected: "Class 1"
    },
    {
      field: "NETA repair window (small ΔT)",
      standard:
        "NETA_STORED_CLASS_REPAIR_WINDOW — Class 1 → Monitor (src/lib/thermographyTrendSeries.ts:311-330)",
      expected: "Class 1 (LOW)"
    },
    {
      field: "fault/verdict provenance",
      standard:
        "KPI card disclosure: fault & NETA verdict stored from the saved scan, not ΔT-derived (TrendAnalyzer.tsx thermo-kpi-provenance)",
      expected: "Fault / NETA verdict stored from the saved scan — not ΔT-derived."
    }
  ]
};
