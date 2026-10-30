/**
 * Peak-velocity alert/danger threshold resolution for trend charts.
 *
 * Thresholds are always canonical **mm/s RMS** until the final display
 * projection. Plant-provided values win when both are set; otherwise the
 * ISO 20816 B/C (alert) and C/D (danger) edges for the machine class apply.
 */

import {
  isoZoneEdges,
  parseMachineClass,
  type IsoMachineClass
} from "./isoZone";
import {
  formatVelocityValue,
  velocityUnitLabel,
  velocityValueForDisplay,
  type VelocityDisplayUnit
} from "./units";

export type VelocityThresholdSource = "plant" | "iso";

export interface VelocityThresholdInput {
  machineClass?: string | null;
  /** Plant alert threshold, canonical mm/s RMS. */
  warningThresholdMmS?: number | null;
  /** Plant danger threshold, canonical mm/s RMS. */
  criticalThresholdMmS?: number | null;
  unit?: VelocityDisplayUnit;
}

export interface VelocityThresholdResolution {
  source: VelocityThresholdSource;
  machineClass: IsoMachineClass;
  /** Effective threshold in canonical mm/s RMS. */
  alertMmS: number;
  dangerMmS: number;
  /** Effective threshold in the active display unit (chart y coordinate). */
  alertDisplay: number;
  dangerDisplay: number;
  /** Value + unit labels for the threshold lines. */
  alertLabel: string;
  dangerLabel: string;
  /** Honest provenance copy for the chart header. */
  provenance: string;
}

function isSet(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/**
 * Resolve alert/danger thresholds from plant values or ISO defaults.
 * Plant override is a complete pair: if either value is missing the ISO
 * defaults for both lines apply, so the header never claims a mixed source.
 */
export function resolveVelocityThresholds({
  machineClass,
  warningThresholdMmS,
  criticalThresholdMmS,
  unit = "mm/s"
}: VelocityThresholdInput = {}): VelocityThresholdResolution {
  const cls = parseMachineClass(machineClass);
  const [, alertEdgeMmS, dangerEdgeMmS] = isoZoneEdges(cls);

  const plantAlertMmS = isSet(warningThresholdMmS) ? warningThresholdMmS : null;
  const plantDangerMmS = isSet(criticalThresholdMmS)
    ? criticalThresholdMmS
    : null;
  const hasPlantPair = plantAlertMmS != null && plantDangerMmS != null;

  const source: VelocityThresholdSource = hasPlantPair ? "plant" : "iso";
  const alertMmS = hasPlantPair ? plantAlertMmS : alertEdgeMmS;
  const dangerMmS = hasPlantPair ? plantDangerMmS : dangerEdgeMmS;

  const alertValue = formatVelocityValue(alertMmS, unit);
  const dangerValue = formatVelocityValue(dangerMmS, unit);
  const unitLabel = velocityUnitLabel(unit);
  const provenance =
    source === "plant"
      ? `Plant thresholds - alert ${alertValue}, danger ${dangerValue} ${unitLabel}`
      : `ISO ${cls} defaults - alert ${alertValue}, danger ${dangerValue} ${unitLabel}`;

  return {
    source,
    machineClass: cls,
    alertMmS,
    dangerMmS,
    alertDisplay: velocityValueForDisplay(alertMmS, unit),
    dangerDisplay: velocityValueForDisplay(dangerMmS, unit),
    alertLabel: `Alert ${alertValue} ${unitLabel}`,
    dangerLabel: `Danger ${dangerValue} ${unitLabel}`,
    provenance
  };
}
