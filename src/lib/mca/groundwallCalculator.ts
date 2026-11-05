/**
 * MCA Groundwall Insulation — PI, DAR, IR@40°C, IEEE 43-2013 compliance.
 */

export type InsulationClass = "A" | "B" | "F" | "H";

export type GroundwallParams = {
  ir15sMOmega?: number;
  ir30sMOmega?: number;
  /** Required 1-minute insulation resistance (MΩ). */
  ir1mMOmega: number;
  ir10mMOmega?: number;
  testVoltageV: number;
  windingTempC?: number;
  insulationClass?: InsulationClass;
  /**
   * Stored nameplate line-to-line voltage (V). Drives the IEEE 43
   * voltage-rated minimum-IR threshold and the DC test-voltage ceiling.
   * When absent, the compliance verdict and ceiling guard are omitted.
   */
  ratedVoltageV?: number;
};

export type GroundwallFaultSeverity = "NORMAL" | "WARNING" | "CRITICAL";

export type DarStatus =
  | "Dangerous / Moisture Ingress"
  | "Questionable"
  | "Good Insulation"
  | "N/A";

export type PiStatus =
  | "Critical Degradation / Wet Winding"
  | "Warning / Contaminated"
  | "Good Insulation Health"
  | "N/A";

/**
 * Data-quality gate for the IR absorption timeline. Dielectric absorption
 * makes IR non-decreasing with time (15s ≤ 30s ≤ 1m ≤ 10m). A decreasing
 * sequence, DAR < 1, or PI > 10 means the entry order / units are suspect,
 * so PI / DAR / leakage / fault must not be trusted.
 */
export type GroundwallDataQuality = {
  valid: boolean;
  nonMonotonic: boolean;
  darArtifact: boolean;
  piArtifact: boolean;
  reasons: string[];
  /** Derived ratios before the artifact gate suppressed them (transparency). */
  rawDar: number | null;
  rawPi: number | null;
};

export type GroundwallResult = {
  kT: number;
  ir40MOmega: number;
  /**
   * IEEE 43 voltage-rated minimum IR (MΩ). Null when no nameplate voltage is
   * stored — a flat 100 MΩ constant must never masquerade as the IEEE 43
   * minimum for every machine.
   */
  irIeeeMinMOmega: number | null;
  /** Pass/fail only when a provenanced threshold exists; null = verdict omitted. */
  irIeeePass: boolean | null;
  irIeeeMinProvenance: string;
  /** True only when a winding temperature was recorded (kT actually applied). */
  tempCorrected: boolean;
  /** Winding temperature actually used, or null when not recorded. */
  windingTempC: number | null;
  dataQuality: GroundwallDataQuality;
  dar: number | null;
  darStatus: DarStatus;
  pi: number | null;
  piStatus: PiStatus;
  piIeeeMin: number;
  piIeeePass: boolean | null;
  leakageCurrentUA: number;
  fault: string;
  severity: GroundwallFaultSeverity;
  recommendation: string;
  /** False when IR / voltage inputs are missing. */
  hasData: boolean;
  /** Temperature-corrected IR curve points for charting (MΩ). */
  curvePoints: {
    label: string;
    seconds: number;
    rawMOmega: number | null;
    corrected40MOmega: number | null;
  }[];
};

/** Allowed measurement noise before a decreasing IR step is called invalid. */
const MONOTONIC_TOLERANCE = 0.02;
/** PI above this band is an artifact signature, not a healthy winding. */
const PI_ARTIFACT_ABOVE = 10;

/**
 * Static in-repo IEEE 43 DC test-voltage ceiling table (by machine rating).
 * Cross-referenced against stored nameplate voltage — never a guess.
 */
export const IEEE43_MAX_DC_TEST_VOLTAGE_TABLE = [
  { ratedBand: "< 1000 V", maxRatedV: 999, maxDcTestV: 500 },
  { ratedBand: "1000–2500 V", maxRatedV: 2500, maxDcTestV: 1000 },
  { ratedBand: "2501–5000 V", maxRatedV: 5000, maxDcTestV: 2500 },
  { ratedBand: "5001–12000 V", maxRatedV: 12000, maxDcTestV: 5000 },
  {
    ratedBand: "> 12000 V",
    maxRatedV: Number.POSITIVE_INFINITY,
    maxDcTestV: 10000
  }
] as const;

function finiteOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalPositive(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** IEEE 43-2013 IR temperature correction to 40°C: kT = 0.5^((40−T)/10). */
export function ieee43TempCorrectionFactor(windingTempC: number): number {
  const t = finiteOr(windingTempC, 40);
  const kT = Math.pow(0.5, (40 - t) / 10);
  return Number.isFinite(kT) && kT > 0 ? kT : 1;
}

export function correctIrTo40C(
  irMOmega: number,
  windingTempC?: number
): number {
  const ir = finiteOr(irMOmega, 0);
  const kT = ieee43TempCorrectionFactor(windingTempC ?? 40);
  return ir * kT;
}

/**
 * Parse a stored nameplate voltage string ("480V", "4.16 kV", "230/460").
 * Returns volts, or null when no positive voltage can be read.
 */
export function parseRatedVoltageVolts(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  const kvMatches = [...s.matchAll(/([\d.]+)\s*kv/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (kvMatches.length > 0) return Math.max(...kvMatches) * 1000;

  const nums = [...s.matchAll(/([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return /[/~-]/.test(s) ? Math.max(...nums) : nums[0];
}

/**
 * IEEE 43 minimum IR for a machine: kV + 1 MΩ, with a 100 MΩ floor for
 * machines rated 10 kV and above. Null when the nameplate voltage is absent.
 */
export function ieee43MinIrMOmega(ratedVoltageV?: number): number | null {
  if (
    ratedVoltageV == null ||
    !Number.isFinite(ratedVoltageV) ||
    ratedVoltageV <= 0
  ) {
    return null;
  }
  const kv = ratedVoltageV / 1000;
  return kv >= 10 ? 100 : round3(kv + 1);
}

/** Human-readable provenance for the IR compliance threshold. */
export function ieee43ThresholdProvenance(ratedVoltageV?: number): string {
  if (
    ratedVoltageV == null ||
    !Number.isFinite(ratedVoltageV) ||
    ratedVoltageV <= 0
  ) {
    return "No nameplate voltage stored — the IEEE 43 voltage-rated minimum cannot be applied; IR pass/fail verdict omitted (never a flat 100 MΩ constant).";
  }
  const kv = ratedVoltageV / 1000;
  const min = ieee43MinIrMOmega(ratedVoltageV);
  return `IEEE 43 voltage-rated minimum = ${min} MΩ (${kv.toFixed(
    2
  )} kV nameplate, kV + 1 MΩ${kv >= 10 ? "; 100 MΩ floor for ≥ 10 kV" : ""}) — not a flat 100 MΩ constant.`;
}

/** IEEE 43 maximum DC test voltage for a given nameplate rating, or null. */
export function ieee43MaxDcTestVoltageV(
  ratedVoltageV?: number
): number | null {
  if (
    ratedVoltageV == null ||
    !Number.isFinite(ratedVoltageV) ||
    ratedVoltageV <= 0
  ) {
    return null;
  }
  for (const band of IEEE43_MAX_DC_TEST_VOLTAGE_TABLE) {
    if (ratedVoltageV <= band.maxRatedV) return band.maxDcTestV;
  }
  return null;
}

export type GroundwallVoltageGuard = {
  applicable: boolean;
  ratedVoltageV: number | null;
  maxDcTestVoltageV: number | null;
  overVoltage: boolean;
  message: string;
  provenance: string;
};

/**
 * Safety guard for the applied DC test voltage. Applicable only when a
 * stored nameplate voltage exists — otherwise the ceiling cannot be derived.
 */
export function evaluateGroundwallTestVoltage(params: {
  testVoltageV?: number | null;
  ratedVoltageV?: number | null;
}): GroundwallVoltageGuard {
  const rated =
    params.ratedVoltageV != null &&
    Number.isFinite(params.ratedVoltageV) &&
    params.ratedVoltageV > 0
      ? params.ratedVoltageV
      : null;
  const test =
    params.testVoltageV != null &&
    Number.isFinite(params.testVoltageV) &&
    params.testVoltageV > 0
      ? params.testVoltageV
      : null;

  if (rated == null || test == null) {
    return {
      applicable: false,
      ratedVoltageV: rated,
      maxDcTestVoltageV: null,
      overVoltage: false,
      message: "",
      provenance: ""
    };
  }

  const max = ieee43MaxDcTestVoltageV(rated);
  if (max == null) {
    return {
      applicable: false,
      ratedVoltageV: rated,
      maxDcTestVoltageV: null,
      overVoltage: false,
      message: "",
      provenance: ""
    };
  }

  const band =
    IEEE43_MAX_DC_TEST_VOLTAGE_TABLE.find((b) => rated <= b.maxRatedV) ?? null;
  const over = test > max;
  const kv = (rated / 1000).toFixed(2);
  return {
    applicable: true,
    ratedVoltageV: rated,
    maxDcTestVoltageV: max,
    overVoltage: over,
    message: over
      ? `Test voltage ${test} V DC exceeds the IEEE 43 maximum ${max} V DC for a ${kv} kV machine. Reduce the test voltage before testing.`
      : `Test voltage ${test} V DC is within the IEEE 43 maximum ${max} V DC for a ${kv} kV machine.`,
    provenance: `IEEE 43 DC test-voltage ceiling table (${band?.ratedBand ?? "rating band"}) — static in-repo table cross-referenced against stored nameplate voltage; not a guess.`
  };
}

/**
 * Validate the IR absorption timeline before any PI / DAR / fault is trusted.
 * Raw ratios are retained for transparency, but the gate suppresses them.
 */
export function evaluateGroundwallDataQuality(params: {
  ir15sMOmega?: number;
  ir30sMOmega?: number;
  ir1mMOmega: number;
  ir10mMOmega?: number;
  dar: number | null;
  pi: number | null;
}): GroundwallDataQuality {
  const sequence = [
    { label: "15s", value: params.ir15sMOmega },
    { label: "30s", value: params.ir30sMOmega },
    { label: "1m", value: params.ir1mMOmega },
    { label: "10m", value: params.ir10mMOmega }
  ].filter(
    (p): p is { label: string; value: number } =>
      p.value != null && Number.isFinite(p.value) && p.value > 0
  );

  const reasons: string[] = [];
  let nonMonotonic = false;
  for (let i = 1; i < sequence.length; i += 1) {
    const prev = sequence[i - 1];
    const cur = sequence[i];
    if (cur.value < prev.value * (1 - MONOTONIC_TOLERANCE)) {
      nonMonotonic = true;
      reasons.push(`${cur.label} ${cur.value} MΩ < ${prev.label} ${prev.value} MΩ`);
    }
  }

  const darArtifact = params.dar != null && params.dar < 1;
  const piArtifact = params.pi != null && params.pi > PI_ARTIFACT_ABOVE;

  if (nonMonotonic) {
    reasons.unshift(
      "IR sequence non-monotonic — readings inconsistent with dielectric absorption; verify 30s/1m/10m entry order before trusting PI/DAR/fault."
    );
  }
  if (darArtifact) {
    reasons.push("DAR < 1 is an artifact signature (1m reading below 30s).");
  }
  if (piArtifact) {
    reasons.push(
      `PI > ${PI_ARTIFACT_ABOVE} is outside the dielectric-absorption artifact band.`
    );
  }

  return {
    valid: !nonMonotonic && !darArtifact && !piArtifact,
    nonMonotonic,
    darArtifact,
    piArtifact,
    reasons,
    rawDar: params.dar,
    rawPi: params.pi
  };
}

function darStatusFrom(dar: number | null): DarStatus {
  if (dar == null || !Number.isFinite(dar)) return "N/A";
  if (dar < 1.0) return "Dangerous / Moisture Ingress";
  if (dar <= 1.4) return "Questionable";
  return "Good Insulation";
}

function piStatusFrom(pi: number | null): PiStatus {
  if (pi == null || !Number.isFinite(pi)) return "N/A";
  if (pi < 1.5) return "Critical Degradation / Wet Winding";
  if (pi < 2.0) return "Warning / Contaminated";
  return "Good Insulation Health";
}

function ieeePiMinimum(insulationClass: InsulationClass): number {
  return insulationClass === "A" ? 1.5 : 2.0;
}

function isolatedDataQualityFault(dataQuality: GroundwallDataQuality): {
  fault: string;
  severity: GroundwallFaultSeverity;
  recommendation: string;
} {
  const detail = dataQuality.reasons.length > 0 ? ` (${dataQuality.reasons.join("; ")})` : "";
  return {
    fault: "IR Data Quality — verify test entry order",
    severity: "WARNING",
    recommendation: `IR sequence non-monotonic — readings inconsistent with dielectric absorption; verify 30s/1m/10m entry order before trusting PI/DAR/fault${detail}. Do not condemn the motor from a physically invalid test.`
  };
}

function isolateGroundwallFault(params: {
  ir40MOmega: number;
  pi: number | null;
  dar: number | null;
  irIeeeMinMOmega: number | null;
  dataQuality: GroundwallDataQuality;
}): {
  fault: string;
  severity: GroundwallFaultSeverity;
  recommendation: string;
} {
  const { ir40MOmega, pi, dar, irIeeeMinMOmega, dataQuality } = params;

  if (!dataQuality.valid) {
    return isolatedDataQualityFault(dataQuality);
  }

  // Never fire CRITICAL without a provenanced IEEE 43 threshold. The flat
  // 100 MΩ constant was a safety fabrication when no nameplate voltage exists.
  if (irIeeeMinMOmega != null && ir40MOmega < irIeeeMinMOmega) {
    return {
      fault: "Groundwall Insulation Below IEEE 43 Minimum",
      severity: "CRITICAL",
      recommendation: `Do not energize. IR@40°C ${ir40MOmega} MΩ is below the IEEE 43 voltage-rated minimum ${irIeeeMinMOmega} MΩ. Retest after cleaning/inspection; use Hi-Pot and professional winding dry-out procedures only after a valid retest.`
    };
  }
  if ((pi !== null && pi < 1.5) || (dar !== null && dar < 1.0)) {
    return {
      fault: "Moisture Ingress / Winding Contamination",
      severity: "WARNING",
      recommendation:
        "Clean and bake motor windings; inspect junction box seal integrity."
    };
  }
  if (irIeeeMinMOmega == null) {
    return {
      fault: "IR Recorded — IEEE 43 Verdict Unavailable",
      severity: "NORMAL",
      recommendation:
        "Nameplate voltage is not stored, so the IEEE 43 voltage-rated minimum cannot be applied. Record the nameplate voltage to judge compliance."
    };
  }
  return {
    fault: "Healthy Groundwall Insulation",
    severity: "NORMAL",
    recommendation: "Passed IEEE 43 Insulation Requirements"
  };
}

/**
 * Full groundwall insulation analysis (IR@40°C, DAR, PI, leakage, IEEE 43).
 */
export function calculateGroundwallInsulation(
  params: GroundwallParams
): GroundwallResult {
  const ir1mMOmega = Math.max(0, finiteOr(params.ir1mMOmega, 0));
  const ir15sMOmega = optionalPositive(params.ir15sMOmega);
  const ir30sMOmega = optionalPositive(params.ir30sMOmega);
  const ir10mMOmega = optionalPositive(params.ir10mMOmega);
  const testVoltageV = Math.max(0, finiteOr(params.testVoltageV, 0));

  // Missing temperature is NOT coerced to 0°C (which would apply a bogus
  // kT = 0.5^4) and is not silently presented as "corrected to 40°C".
  const hasWindingTemp =
    params.windingTempC != null &&
    Number.isFinite(Number(params.windingTempC));
  const windingTempC = hasWindingTemp ? Number(params.windingTempC) : null;

  const insulationClass: InsulationClass =
    params.insulationClass === "A" ||
    params.insulationClass === "B" ||
    params.insulationClass === "F" ||
    params.insulationClass === "H"
      ? params.insulationClass
      : "F";

  const ratedVoltageV =
    params.ratedVoltageV != null &&
    Number.isFinite(Number(params.ratedVoltageV)) &&
    Number(params.ratedVoltageV) > 0
      ? Number(params.ratedVoltageV)
      : undefined;

  const irIeeeMinMOmega = ieee43MinIrMOmega(ratedVoltageV);
  const irIeeeMinProvenance = ieee43ThresholdProvenance(ratedVoltageV);

  const hasData =
    ir1mMOmega > 0 ||
    ir15sMOmega != null ||
    ir30sMOmega != null ||
    ir10mMOmega != null;

  const emptyCurve = [
    { label: "15s", seconds: 15, rawMOmega: null, corrected40MOmega: null },
    { label: "30s", seconds: 30, rawMOmega: null, corrected40MOmega: null },
    { label: "1m", seconds: 60, rawMOmega: null, corrected40MOmega: null },
    { label: "10m", seconds: 600, rawMOmega: null, corrected40MOmega: null }
  ];

  if (!hasData) {
    return {
      kT: 1,
      ir40MOmega: 0,
      irIeeeMinMOmega,
      irIeeePass: null,
      irIeeeMinProvenance,
      tempCorrected: false,
      windingTempC,
      dataQuality: {
        valid: true,
        nonMonotonic: false,
        darArtifact: false,
        piArtifact: false,
        reasons: [],
        rawDar: null,
        rawPi: null
      },
      dar: null,
      darStatus: "N/A",
      pi: null,
      piStatus: "N/A",
      piIeeeMin: ieeePiMinimum(insulationClass),
      piIeeePass: null,
      leakageCurrentUA: 0,
      fault: "Awaiting Data",
      severity: "NORMAL",
      recommendation: "Upload MCA PDF or enter IR values manually",
      hasData: false,
      curvePoints: emptyCurve
    };
  }

  const kT = windingTempC == null ? 1 : ieee43TempCorrectionFactor(windingTempC);
  const tempCorrected = windingTempC != null;
  const ir40MOmega = round3(ir1mMOmega * kT);
  const irIeeePass =
    irIeeeMinMOmega != null ? ir40MOmega >= irIeeeMinMOmega : null;

  const rawDar =
    ir30sMOmega != null && ir30sMOmega > 0 && ir1mMOmega > 0
      ? round3(ir1mMOmega / ir30sMOmega)
      : null;
  const rawPi =
    ir10mMOmega != null && ir10mMOmega > 0 && ir1mMOmega > 0
      ? round3(ir10mMOmega / ir1mMOmega)
      : null;

  const dataQuality = evaluateGroundwallDataQuality({
    ir15sMOmega,
    ir30sMOmega,
    ir1mMOmega,
    ir10mMOmega,
    dar: rawDar,
    pi: rawPi
  });

  // Artifact inputs must not render a scary PI/DAR diagnosis.
  const dar = dataQuality.valid ? rawDar : null;
  const darStatus = darStatusFrom(dar);
  const pi = dataQuality.valid ? rawPi : null;
  const piStatus = piStatusFrom(pi);
  const piIeeeMin = ieeePiMinimum(insulationClass);
  const piIeeePass = pi != null ? pi >= piIeeeMin : null;

  // Leakage is derived from the raw 1-minute IR (Ohm's law), not measured
  // independently. V / R(MΩ) = µA.
  const leakageCurrentUA =
    dataQuality.valid && ir1mMOmega > 0 && testVoltageV > 0
      ? round2(testVoltageV / ir1mMOmega)
      : 0;

  const isolated = isolateGroundwallFault({
    ir40MOmega,
    pi,
    dar,
    irIeeeMinMOmega,
    dataQuality
  });

  const curveSpec: { label: string; seconds: number; raw?: number }[] = [
    { label: "15s", seconds: 15, raw: ir15sMOmega },
    { label: "30s", seconds: 30, raw: ir30sMOmega },
    { label: "1m", seconds: 60, raw: ir1mMOmega > 0 ? ir1mMOmega : undefined },
    { label: "10m", seconds: 600, raw: ir10mMOmega }
  ];

  const curvePoints = curveSpec.map((p) => {
    const raw = p.raw != null && Number.isFinite(p.raw) ? p.raw : null;
    return {
      label: p.label,
      seconds: p.seconds,
      rawMOmega: raw != null ? round3(raw) : null,
      corrected40MOmega:
        raw != null ? round3(correctIrTo40C(raw, windingTempC ?? undefined)) : null
    };
  });

  return {
    kT: round3(kT),
    ir40MOmega,
    irIeeeMinMOmega,
    irIeeePass,
    irIeeeMinProvenance,
    tempCorrected,
    windingTempC,
    dataQuality,
    dar,
    darStatus,
    pi,
    piStatus,
    piIeeeMin,
    piIeeePass,
    leakageCurrentUA,
    fault: isolated.fault,
    severity: isolated.severity,
    recommendation: isolated.recommendation,
    hasData: true,
    curvePoints
  };
}
