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

export type GroundwallResult = {
  kT: number;
  ir40MOmega: number;
  irIeeeMinMOmega: number;
  irIeeePass: boolean;
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

function isolateGroundwallFault(params: {
  ir40MOmega: number;
  pi: number | null;
  dar: number | null;
}): {
  fault: string;
  severity: GroundwallFaultSeverity;
  recommendation: string;
} {
  const { ir40MOmega, pi, dar } = params;

  if (ir40MOmega < 100) {
    return {
      fault: "Groundwall Insulation Breakdown / Direct Ground Fault",
      severity: "CRITICAL",
      recommendation:
        "Do not energize. Perform Hi-Pot test and winding dry-out procedures."
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
  const windingTempC =
    params.windingTempC != null && Number.isFinite(Number(params.windingTempC))
      ? Number(params.windingTempC)
      : 40;
  const insulationClass: InsulationClass =
    params.insulationClass === "A" ||
    params.insulationClass === "B" ||
    params.insulationClass === "F" ||
    params.insulationClass === "H"
      ? params.insulationClass
      : "F";

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
      irIeeeMinMOmega: 100,
      irIeeePass: false,
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

  const kT = ieee43TempCorrectionFactor(windingTempC);
  const ir40MOmega = round3(ir1mMOmega * kT);
  const irIeeeMinMOmega = 100;
  const irIeeePass = ir40MOmega >= irIeeeMinMOmega;

  const dar =
    ir30sMOmega != null && ir30sMOmega > 0 && ir1mMOmega > 0
      ? round3(ir1mMOmega / ir30sMOmega)
      : null;
  const darStatus = darStatusFrom(dar);

  const pi =
    ir10mMOmega != null && ir10mMOmega > 0 && ir1mMOmega > 0
      ? round3(ir10mMOmega / ir1mMOmega)
      : null;
  const piStatus = piStatusFrom(pi);
  const piIeeeMin = ieeePiMinimum(insulationClass);
  const piIeeePass = pi != null ? pi >= piIeeeMin : null;

  // I(μA) = V / R(MΩ)  ≡  (V / (R×1e6)) × 1e6
  const leakageCurrentUA =
    ir40MOmega > 0
      ? round2((testVoltageV / (ir40MOmega * 1e6)) * 1e6)
      : 0;

  const isolated = isolateGroundwallFault({ ir40MOmega, pi, dar });

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
        raw != null ? round3(correctIrTo40C(raw, windingTempC)) : null
    };
  });

  return {
    kT: round3(kT),
    ir40MOmega,
    irIeeeMinMOmega,
    irIeeePass,
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
