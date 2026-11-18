/**
 * SLICE-MCA-VISION v2 fixture — grouped-bar MCA report (rotor 0°/90°).
 *
 * Values are the printed bar-top readings from the chart under test. Axis
 * steps encode the printed gridlines; the axis-read tolerance is half the
 * minor division (0.25 Ω, 0.05 mH, 1°, 0.025 rel).
 */

export const MCA_BAR_CHART_AXES = {
  z_ohm: { min: 0, max: 5, major_step: 1, minor_step: 0.5 },
  l_mh: { min: 0, max: 2, major_step: 0.5, minor_step: 0.1 },
  angle_deg: { min: 60, max: 90, major_step: 10, minor_step: 2 },
  c_rel: { min: 0, max: 1, major_step: 0.25, minor_step: 0.05 }
} as const;

/** Expected per-phase columns, in A/B/C order. */
export const MCA_BAR_CHART_TRUTH = {
  z0: [4.17, 4.0, 4.0],
  z90: [4.0, 4.17, 4.0],
  l0: [1.67, 1.59, 1.59],
  l90: [1.59, 1.67, 1.59],
  angle0: [84, 83, 83],
  angle90: [83, 84, 83],
  c0: [0.51, 0.5, 0.5],
  c90: [0.5, 0.51, 0.5]
} as const;

export const MCA_BAR_METRIC_TOLERANCE = {
  z_ohm: 0.25,
  l_mh: 0.05,
  angle_deg: 1,
  c_rel: 0.025
} as const;

type SeriesEntry = {
  phase: "A" | "B" | "C";
  rotor_deg: 0 | 90;
  z_ohm: number;
  l_mh: number;
  angle_deg: number;
  c_rel: number;
  status: "extracted";
  confidence: number;
};

function entry(
  phase: "A" | "B" | "C",
  rotor: 0 | 90,
  z: number,
  l: number,
  angle: number,
  c: number
): SeriesEntry {
  return {
    phase,
    rotor_deg: rotor,
    z_ohm: z,
    l_mh: l,
    angle_deg: angle,
    c_rel: c,
    status: "extracted",
    confidence: 0.9
  };
}

/** Model-shaped fixture: what the MCA-only prompt returns for this chart. */
export const MCA_GROUPED_BAR_VISION_FIXTURE = {
  detected_technology: "MCA",
  warnings: [],
  data: {},
  raw_table: [
    {
      header: "Impedance Z",
      value: 4.17,
      unit_as_read: "Ω",
      operator: null
    },
    {
      header: "Inductance L",
      value: 1.67,
      unit_as_read: "mH",
      operator: null
    },
    {
      header: "Phase angle",
      value: 84,
      unit_as_read: "°",
      operator: null
    }
  ],
  mca_bar_chart: {
    axes: MCA_BAR_CHART_AXES,
    series: [
      entry("A", 0, 4.17, 1.67, 84, 0.51),
      entry("B", 0, 4.0, 1.59, 83, 0.5),
      entry("C", 0, 4.0, 1.59, 83, 0.5),
      entry("A", 90, 4.0, 1.59, 83, 0.5),
      entry("B", 90, 4.17, 1.67, 84, 0.51),
      entry("C", 90, 4.0, 1.59, 83, 0.5)
    ]
  }
};
