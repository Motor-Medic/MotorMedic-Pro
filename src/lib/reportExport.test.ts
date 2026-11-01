import { describe, expect, it } from "vitest";
import type { SavedAnalysisResult } from "./analysisPersistence";
import { reportCsvText } from "./reportExport";

function row(extra: Partial<SavedAnalysisResult> = {}): SavedAnalysisResult {
  return {
    id: "row-h2",
    asset_id: "asset-h2",
    component: "Drive End",
    timestamp: "2026-01-01T00:00:00.000Z",
    health_score: 61,
    primary_fault: "Imbalance",
    fault_list: [],
    peaks: [],
    spectrum_image_url: null,
    recommendations: [],
    financial_impact: {},
    envelope_dominant_frequency: 30,
    telemetry_data: {
      overall_velocity: 25.4,
      overall_acceleration: 1,
      rpm: 1800
    },
    ...extra
  };
}

describe("SLICE-H2 report exports use display units (canonical storage untouched)", () => {
  it("stamps the selected units into CSV column headers and converts values", () => {
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Vibration",
      analysis: row(),
      displayUnits: {
        velocity: "in/s",
        acceleration: "mm/s2",
        frequency: "CPM"
      }
    });

    expect(csv).toContain("Overall Velocity (in/s)");
    expect(csv).toContain("Overall Acceleration (mm/s2)");
    expect(csv).toContain("Envelope Dominant Freq (CPM)");
    expect(csv).toContain("1");
    expect(csv).toContain("9.80665");
    expect(csv).toContain("1800");
    // The canonical stored value is not rewritten in place.
    expect(row().telemetry_data?.overall_velocity).toBe(25.4);
  });

  it("falls back to an Hz header for orders when a row has no RPM", () => {
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Vibration",
      analysis: row({ telemetry_data: { overall_velocity: 11.85 } }),
      displayUnits: {
        velocity: "mm/s",
        acceleration: "g",
        frequency: "orders"
      }
    });

    expect(csv).toContain("Envelope Dominant Freq (Hz)");
    expect(csv).not.toContain("Envelope Dominant Freq (orders)");
  });

  it("keeps canonical mm/s, g and Hz headers as the default", () => {
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Vibration",
      analysis: row()
    });
    expect(csv).toContain("Overall Velocity (mm/s)");
    expect(csv).toContain("Overall Acceleration (g)");
    expect(csv).toContain("Envelope Dominant Freq (Hz)");
  });
});

function thermoRow(): SavedAnalysisResult {
  return row({
    analysis_type: "thermography",
    phase_a_temp: 212,
    phase_b_temp: 194,
    de_bearing_temp: 176,
    peaks: [
      {
        type: "thermography",
        hotspot_temp: 212,
        reference_temp: 194,
        delta_t: 18,
        severity_class: "Class 2"
      }
    ],
    telemetry_data: {
      environmental: { temp_unit: "°F" }
    }
  });
}

describe("SLICE-U temperature export headers follow the tenant preference", () => {
  it("labels and converts temperature columns into the selected unit", () => {
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Thermography",
      analysis: thermoRow(),
      displayUnits: {
        velocity: "mm/s",
        acceleration: "g",
        frequency: "Hz",
        temperature: "°C"
      }
    });
    expect(csv).toContain("Phase A Temp (°C)");
    expect(csv).toContain("DE Bearing Temp (°C)");
    expect(csv).not.toContain("Phase A Temp (°F)");
    expect(csv).toContain("100"); // 212°F → 100°C
    expect(csv).toContain("90"); // 194°F → 90°C
  });

  it("defaults to the STORED unit and never converts on first load", () => {
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Thermography",
      analysis: thermoRow()
    });
    expect(csv).toContain("Phase A Temp (°F)");
    expect(csv).toContain("212");
    expect(csv).not.toContain("Phase A Temp (°C)");
  });
});
