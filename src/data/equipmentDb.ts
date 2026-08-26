/* Shared Equipment DB mock hierarchy — used by Diagnosis Logs, Alerts, etc. */

interface VelocityDataPoint {
  cpm: number;
  ips: number;
}

interface AccelerationDataPoint {
  hz: number;
  ge: number;
}

interface TimeWaveformDataPoint {
  sec: number;
  g: number;
}

export interface MultiTraceVibrationData {
  velocity: {
    "1H"?: VelocityDataPoint[];
    "1V"?: VelocityDataPoint[];
    "1A"?: VelocityDataPoint[];
    "2H"?: VelocityDataPoint[];
    "2V"?: VelocityDataPoint[];
    "2A"?: VelocityDataPoint[];
  };
  acceleration: {
    "1H"?: AccelerationDataPoint[];
    "1V"?: AccelerationDataPoint[];
    "1A"?: AccelerationDataPoint[];
    "2H"?: AccelerationDataPoint[];
    "2V"?: AccelerationDataPoint[];
    "2A"?: AccelerationDataPoint[];
  };
  timeWaveform: {
    "1H"?: TimeWaveformDataPoint[];
    "1V"?: TimeWaveformDataPoint[];
    "1A"?: TimeWaveformDataPoint[];
    "2H"?: TimeWaveformDataPoint[];
    "2V"?: TimeWaveformDataPoint[];
    "2A"?: TimeWaveformDataPoint[];
  };
}

export type EquipHealthStatus = "Normal" | "Warning" | "Critical";
export type IsoMachineClass = "Class I" | "Class II" | "Class III" | "Class IV";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  vibration: number; // mm/s RMS
  temperature: number; // °C
}

export interface EquipCollectionPoint {
  id: string;
  name: string;
  orientation: "Horizontal" | "Vertical" | "Axial" | "Radial";
  measurementType: "Vibration" | "Temp" | "Ultrasound";
}

export type EquipComponentType =
  | "Electric Motor (AC / DC / VFD)"
  | "Centrifugal Pump"
  | "Positive Displacement / Gear Pump"
  | "Gearbox / Speed Reducer"
  | "Fan / Blower (Centrifugal / Axial)"
  | "Screw / Reciprocating Compressor"
  | "Machine Tool Spindle"
  | "Other (Custom / AI Spec Search)";

export type CouplingType =
  | "Flexible Grid"
  | "Gear"
  | "Disc"
  | "Direct Rigid"
  | "Belt";

/** Optional kinematics / technical specs captured via progressive disclosure. */
export interface ComponentKinematics {
  /** Operating limits */
  motorHpKw?: string;
  ratedRpm?: string;
  minOperatingRpm?: string;
  maxOperatingRpm?: string;
  lineFrequency?: "50Hz" | "60Hz";
  /** Motor faults */
  motorPoles?: "2" | "4" | "6" | "8" | "10" | "12";
  rotorBars?: string;
  statorSlots?: string;
  vfdDriven?: boolean;
  /** Pump */
  impellerVanes?: string;
  pumpStages?: string;
  voluteClearance?: string;
  suctionSizeIn?: string;
  dischargeSizeIn?: string;
  /** Gearbox */
  inputRpm?: string;
  gearTeethZ1?: string;
  gearTeethZ2?: string;
  gearTeethZ3?: string;
  gearTeethZ4?: string;
  gearboxRatio?: string;
  /** Fan / blower */
  fanBladeCount?: string;
  driveArrangement?: "Direct Drive" | "Belt Drive";
  motorSheaveDia?: string;
  fanSheaveDia?: string;
  beltLength?: string;
  /** Compressor */
  maleLobeCount?: string;
  femaleLobeCount?: string;
  /** Spindle / Other */
  customEquipmentType?: string;
  spindleClass?: string;
  /**
   * Nameplate electrical data. Not collected by the kinematics form — these
   * arrive with imported or legacy component specs, so both are optional.
   */
  voltage?: string;
  operationalDuty?: string;
  /** Bearings & coupling */
  bearingDe?: string;
  bearingNde?: string;
  thrustBearing?: string;
  couplingType?: CouplingType;
  /** ISO thresholds */
  isoClass?: "Class I" | "Class II" | "Class III" | "Class IV";
  warningLimitMms?: string;
  criticalLimitMms?: string;
  vibrationUnit?: "mm/s RMS" | "in/s pk";
}

export interface EquipComponent {
  id: string;
  name: string;
  /** Optional component-level diagnostic metadata */
  status?: EquipHealthStatus;
  overallVibration?: number;
  peakAcceleration?: number;
  temperature?: number;
  speedRpm?: number;
  isoClass?: IsoMachineClass;
  warningThreshold?: number;
  criticalThreshold?: number;
  bearingType?: string;
  faultSignature?: string;
  trend30Days?: TrendPoint[];
  multiTrace?: MultiTraceVibrationData;
  collectionPoints?: EquipCollectionPoint[];
  componentType?: EquipComponentType;
  kinematics?: ComponentKinematics;
  /** Machine / nameplate photo (data URL or remote URL). */
  photoUrl?: string;
}

export interface EquipAsset {
  id: string;
  tag: string;
  name: string;
  location: string;
  components: EquipComponent[];
  /** Optional asset-level diagnostic metadata */
  status?: EquipHealthStatus;
  overallVibration?: number;
  peakAcceleration?: number;
  temperature?: number;
  speedRpm?: number;
  isoClass?: IsoMachineClass;
  warningThreshold?: number;
  criticalThreshold?: number;
  bearingType?: string;
  faultSignature?: string;
  trend30Days?: TrendPoint[];
  multiTrace?: MultiTraceVibrationData;
  criticality?: "Low" | "Medium" | "High" | "Critical";
  machineType?: string;
  /** Machine / nameplate photo (data URL or remote URL). */
  photoUrl?: string;
}

export interface EquipRoute {
  id: string;
  name: string;
  location: string;
  assets: EquipAsset[];
  plantId?: string;
  unitId?: string;
  collectionFrequency?:
    | "Daily"
    | "Weekly"
    | "Bi-Weekly"
    | "Monthly"
    | "Bi-Monthly"
    | "Quarterly"
    | "Semi-Annually"
    | "Annually";
}

export interface EquipPlant {
  id: string;
  name: string;
  location: string;
  facilityType: "Refinery" | "Paper Mill" | "Motor Shop" | "Power Plant";
}

export interface EquipUnit {
  id: string;
  name: string;
  plantId: string;
}

export interface EquipmentStore {
  plants: EquipPlant[];
  units: EquipUnit[];
  routes: EquipRoute[];
}

export interface FlatEquipAsset {
  id: string;
  tag: string;
  name: string;
  location: string;
  routeId: string;
  routeName: string;
  hierarchyPath: string;
  components: EquipComponent[];
  status?: EquipHealthStatus;
  overallVibration?: number;
  peakAcceleration?: number;
  temperature?: number;
  speedRpm?: number;
  isoClass?: IsoMachineClass;
  warningThreshold?: number;
  criticalThreshold?: number;
  bearingType?: string;
  faultSignature?: string;
  trend30Days?: TrendPoint[];
  multiTrace?: MultiTraceVibrationData;
}

/** Build 30 daily readings ending on `endDate` (YYYY-MM-DD). */
function makeTrend30Days(opts: {
  endDate?: string;
  baseVib: number;
  baseTemp: number;
  /** Final vibration on day 30 (defaults to baseVib ± small noise). */
  endVib?: number;
  endTemp?: number;
  /** Days at end of window that ramp toward endVib (default 0 = flat). */
  spikeLastDays?: number;
  seed?: number;
}): TrendPoint[] {
  const end = opts.endDate ?? "2026-08-06";
  const endMs = new Date(`${end}T12:00:00Z`).getTime();
  const spikeDays = opts.spikeLastDays ?? 0;
  const endVib = opts.endVib ?? opts.baseVib;
  const endTemp = opts.endTemp ?? opts.baseTemp;
  const seed = opts.seed ?? 1;

  return Array.from({ length: 30 }, (_, i) => {
    const dayIndex = i; // 0 = oldest, 29 = newest
    const d = new Date(endMs - (29 - dayIndex) * 86400000);
    const date = d.toISOString().slice(0, 10);
    const noise = (((seed * 17 + i * 13) % 10) - 4.5) / 40;

    let vibration: number;
    let temperature: number;

    if (spikeDays > 0 && dayIndex >= 30 - spikeDays) {
      const t = (dayIndex - (30 - spikeDays) + 1) / spikeDays;
      vibration = opts.baseVib + (endVib - opts.baseVib) * t + noise * 0.3;
      temperature = opts.baseTemp + (endTemp - opts.baseTemp) * t + noise * 2;
    } else {
      vibration = Math.max(0.2, opts.baseVib + noise * 0.25);
      temperature = opts.baseTemp + noise * 1.5;
    }

    return {
      date,
      vibration: +vibration.toFixed(2),
      temperature: +temperature.toFixed(1)
    };
  });
}

export const DEMO_EQUIPMENT_SEED: EquipRoute[] = [
  {
    id: "route-bfs",
    name: "Boiler Feed System",
    location: "Powerhouse",
    assets: [
      {
        id: "p-101a",
        tag: "P-101A",
        name: "Boiler Feed Pump A",
        location: "Powerhouse — Floor 1",
        status: "Critical",
        overallVibration: 8.2,
        peakAcceleration: 4.5,
        temperature: 88,
        speedRpm: 3580,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 6320 C3",
        faultSignature: "BPFO @ 152 Hz (Outer Race Bearing Defect)",
        trend30Days: makeTrend30Days({
          baseVib: 2.1,
          baseTemp: 54,
          endVib: 8.2,
          endTemp: 88,
          spikeLastDays: 5,
          seed: 11
        }),
        components: [
          {
            id: "p-101a-mde",
            name: "Motor DE",
            status: "Critical",
            overallVibration: 8.2,
            peakAcceleration: 4.5,
            temperature: 88,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6320 C3",
            faultSignature: "BPFO @ 152 Hz (Outer Race Bearing Defect)",
            trend30Days: makeTrend30Days({
              baseVib: 2.1,
              baseTemp: 54,
              endVib: 8.2,
              endTemp: 88,
              spikeLastDays: 5,
              seed: 11
            })
          },
          {
            id: "p-101a-mnde",
            name: "Motor NDE",
            status: "Warning",
            overallVibration: 4.8,
            peakAcceleration: 2.1,
            temperature: 72,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6318 C3"
          },
          {
            id: "p-101a-pde",
            name: "Pump DE",
            status: "Warning",
            overallVibration: 5.1,
            peakAcceleration: 2.4,
            temperature: 68,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 7315 BECBM"
          },
          {
            id: "p-101a-pnde",
            name: "Pump NDE",
            status: "Normal",
            overallVibration: 2.6,
            peakAcceleration: 1.1,
            temperature: 61,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 7315 BECBM"
          }
        ]
      },
      {
        id: "p-101b",
        tag: "P-101B",
        name: "Boiler Feed Pump B",
        location: "Powerhouse — Floor 1",
        status: "Normal",
        overallVibration: 1.8,
        peakAcceleration: 0.8,
        temperature: 52,
        speedRpm: 3580,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 6320 C3",
        trend30Days: makeTrend30Days({
          baseVib: 1.8,
          baseTemp: 52,
          seed: 22
        }),
        components: [
          {
            id: "p-101b-mde",
            name: "Motor DE",
            status: "Normal",
            overallVibration: 1.7,
            peakAcceleration: 0.75,
            temperature: 51,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6320 C3"
          },
          {
            id: "p-101b-pnde",
            name: "Pump NDE",
            status: "Normal",
            overallVibration: 1.9,
            peakAcceleration: 0.85,
            temperature: 53,
            speedRpm: 3580,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 7315 BECBM"
          }
        ]
      },
      {
        id: "m-101a",
        tag: "M-101A",
        name: "Drive Motor M-101A",
        location: "Powerhouse — Drive Bay",
        status: "Warning",
        overallVibration: 4.9,
        peakAcceleration: 2.2,
        temperature: 71,
        speedRpm: 3565,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 6319 C3",
        faultSignature: "1× RPM unbalance rising with load",
        trend30Days: makeTrend30Days({
          baseVib: 2.8,
          baseTemp: 58,
          endVib: 4.9,
          endTemp: 71,
          spikeLastDays: 8,
          seed: 33
        }),
        components: [
          {
            id: "m-101a-de",
            name: "Motor DE",
            status: "Warning",
            overallVibration: 4.9,
            peakAcceleration: 2.2,
            temperature: 71,
            speedRpm: 3565,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6319 C3"
          },
          {
            id: "m-101a-nde",
            name: "Motor NDE",
            status: "Normal",
            overallVibration: 2.4,
            peakAcceleration: 1.0,
            temperature: 62,
            speedRpm: 3565,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6317 C3"
          }
        ]
      }
    ]
  },
  {
    id: "route-comp2",
    name: "Compressor Line 2",
    location: "Compressor Shelter",
    assets: [
      {
        id: "cmp-37",
        tag: "CMP-37",
        name: "Screw Compressor RS37i",
        location: "Shelter Bay 2",
        status: "Warning",
        overallVibration: 5.4,
        peakAcceleration: 2.8,
        temperature: 76,
        speedRpm: 1780,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF NU 314 ECP",
        faultSignature: "Gear Mesh Frequency (GMF) Harmonics",
        trend30Days: makeTrend30Days({
          baseVib: 3.2,
          baseTemp: 64,
          endVib: 5.4,
          endTemp: 76,
          spikeLastDays: 10,
          seed: 44
        }),
        components: [
          {
            id: "cmp-37-de",
            name: "Airend DE",
            status: "Warning",
            overallVibration: 5.4,
            peakAcceleration: 2.8,
            temperature: 76,
            speedRpm: 1780,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF NU 314 ECP",
            faultSignature: "Gear Mesh Frequency (GMF) Harmonics"
          },
          {
            id: "cmp-37-mde",
            name: "Motor DE",
            status: "Normal",
            overallVibration: 2.9,
            peakAcceleration: 1.3,
            temperature: 66,
            speedRpm: 1780,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6314 C3"
          }
        ]
      },
      {
        id: "m-210",
        tag: "M-210",
        name: "Primary Induction Motor",
        location: "Shelter Bay 1",
        status: "Normal",
        overallVibration: 2.1,
        peakAcceleration: 0.9,
        temperature: 58,
        speedRpm: 1785,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 6315 C3",
        trend30Days: makeTrend30Days({
          baseVib: 2.1,
          baseTemp: 58,
          seed: 55
        }),
        components: [
          {
            id: "m-210-de",
            name: "Motor DE",
            status: "Normal",
            overallVibration: 2.1,
            peakAcceleration: 0.9,
            temperature: 58,
            speedRpm: 1785,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6315 C3"
          },
          {
            id: "m-210-nde",
            name: "Motor NDE",
            status: "Normal",
            overallVibration: 1.9,
            peakAcceleration: 0.8,
            temperature: 56,
            speedRpm: 1785,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6313 C3"
          }
        ]
      }
    ]
  },
  {
    id: "route-rmh",
    name: "Raw Material Handling",
    location: "Conveyor Bay",
    assets: [
      {
        id: "cv-201",
        tag: "CV-201",
        name: "Main Overland Conveyor Drive",
        location: "Conveyor Bay — Head Pulley",
        status: "Normal",
        overallVibration: 1.2,
        peakAcceleration: 0.5,
        temperature: 44,
        speedRpm: 890,
        isoClass: "Class III",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 22220 E",
        trend30Days: makeTrend30Days({
          baseVib: 1.2,
          baseTemp: 44,
          seed: 66
        }),
        components: [
          {
            id: "cv-201-mde",
            name: "Motor DE",
            status: "Normal",
            overallVibration: 1.1,
            peakAcceleration: 0.45,
            temperature: 43,
            speedRpm: 1780,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6312 C3"
          },
          {
            id: "cv-201-gb",
            name: "Gearbox Output",
            status: "Normal",
            overallVibration: 1.2,
            peakAcceleration: 0.5,
            temperature: 44,
            speedRpm: 890,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22220 E"
          },
          {
            id: "cv-201-pulley",
            name: "Head Pulley",
            status: "Normal",
            overallVibration: 1.0,
            peakAcceleration: 0.4,
            temperature: 41,
            speedRpm: 120,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22222 E"
          }
        ]
      }
    ]
  },
  {
    id: "route-extrusion",
    name: "Extrusion Line 3",
    location: "Building B",
    assets: [
      {
        id: "gb-302",
        tag: "GB-302",
        name: "Extruder Gearbox GB-302",
        location: "Extrusion Hall",
        status: "Critical",
        overallVibration: 5.85,
        peakAcceleration: 3.1,
        temperature: 82,
        speedRpm: 1180,
        isoClass: "Class III",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 22316 E",
        faultSignature: "GMF sidebands — tooth wear / eccentricity",
        trend30Days: makeTrend30Days({
          baseVib: 3.0,
          baseTemp: 68,
          endVib: 5.85,
          endTemp: 82,
          spikeLastDays: 7,
          seed: 77
        }),
        components: [
          {
            id: "gb-302-in",
            name: "Input Shaft",
            status: "Critical",
            overallVibration: 5.85,
            peakAcceleration: 3.1,
            temperature: 82,
            speedRpm: 1180,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22316 E",
            faultSignature: "GMF sidebands — tooth wear / eccentricity"
          },
          {
            id: "gb-302-out",
            name: "Output Shaft",
            status: "Warning",
            overallVibration: 4.6,
            peakAcceleration: 2.0,
            temperature: 74,
            speedRpm: 48,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22320 E"
          }
        ]
      },
      {
        id: "cv-gb-3",
        tag: "CV-GB-3",
        name: "Conveyor Gearbox 3",
        location: "Packaging Feed",
        status: "Normal",
        overallVibration: 2.4,
        peakAcceleration: 1.0,
        temperature: 55,
        speedRpm: 720,
        isoClass: "Class III",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 22218 E",
        trend30Days: makeTrend30Days({
          baseVib: 2.4,
          baseTemp: 55,
          seed: 88
        }),
        components: [
          {
            id: "cv-gb-3-de",
            name: "Gearbox DE",
            status: "Normal",
            overallVibration: 2.4,
            peakAcceleration: 1.0,
            temperature: 55,
            speedRpm: 720,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22218 E"
          },
          {
            id: "cv-gb-3-nde",
            name: "Gearbox NDE",
            status: "Normal",
            overallVibration: 2.2,
            peakAcceleration: 0.9,
            temperature: 53,
            speedRpm: 720,
            isoClass: "Class III",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22218 E"
          }
        ]
      }
    ]
  },
  {
    id: "route-cooling",
    name: "Cooling Tower",
    location: "Yard",
    assets: [
      {
        id: "fn-04",
        tag: "FN-04",
        name: "Cooling Tower Fan 4",
        location: "Cooling Tower Cell 4",
        status: "Warning",
        overallVibration: 3.6,
        peakAcceleration: 1.6,
        temperature: 48,
        speedRpm: 240,
        isoClass: "Class IV",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 22224 CC/W33",
        faultSignature: "1× RPM — blade deposit / aerodynamic unbalance",
        trend30Days: makeTrend30Days({
          baseVib: 2.5,
          baseTemp: 42,
          endVib: 3.6,
          endTemp: 48,
          spikeLastDays: 6,
          seed: 99
        }),
        components: [
          {
            id: "fn-04-de",
            name: "Fan DE",
            status: "Warning",
            overallVibration: 3.6,
            peakAcceleration: 1.6,
            temperature: 48,
            speedRpm: 240,
            isoClass: "Class IV",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 22224 CC/W33"
          },
          {
            id: "fn-04-mtr",
            name: "Motor DE",
            status: "Normal",
            overallVibration: 2.0,
            peakAcceleration: 0.85,
            temperature: 55,
            speedRpm: 1785,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6314 C3"
          }
        ]
      }
    ]
  },
  {
    id: "route-process",
    name: "Process Utilities",
    location: "Site A",
    assets: [
      {
        id: "p-402",
        tag: "P-402",
        name: "Slurry Recirc Pump P-402",
        location: "Process Floor",
        status: "Warning",
        overallVibration: 3.8,
        peakAcceleration: 1.7,
        temperature: 63,
        speedRpm: 1750,
        isoClass: "Class II",
        warningThreshold: 4.5,
        criticalThreshold: 7.1,
        bearingType: "SKF 6316 C3",
        trend30Days: makeTrend30Days({
          baseVib: 2.6,
          baseTemp: 55,
          endVib: 3.8,
          endTemp: 63,
          spikeLastDays: 4,
          seed: 101
        }),
        components: [
          {
            id: "p-402-mde",
            name: "Motor DE",
            status: "Warning",
            overallVibration: 3.8,
            peakAcceleration: 1.7,
            temperature: 63,
            speedRpm: 1750,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 6316 C3"
          },
          {
            id: "p-402-pnde",
            name: "Pump NDE",
            status: "Normal",
            overallVibration: 2.3,
            peakAcceleration: 1.0,
            temperature: 57,
            speedRpm: 1750,
            isoClass: "Class II",
            warningThreshold: 4.5,
            criticalThreshold: 7.1,
            bearingType: "SKF 7314 BECBM"
          }
        ]
      },
      {
        id: "hx-12",
        tag: "HX-12",
        name: "Heat Exchanger Bundle 12",
        location: "Utilities Deck",
        status: "Normal",
        overallVibration: 0.9,
        peakAcceleration: 0.3,
        temperature: 78,
        speedRpm: 0,
        isoClass: "Class III",
        warningThreshold: 2.8,
        criticalThreshold: 4.5,
        trend30Days: makeTrend30Days({
          baseVib: 0.9,
          baseTemp: 78,
          seed: 112
        }),
        components: [
          {
            id: "hx-12-shell",
            name: "Shell Side",
            status: "Normal",
            overallVibration: 0.9,
            peakAcceleration: 0.3,
            temperature: 78,
            isoClass: "Class III",
            warningThreshold: 2.8,
            criticalThreshold: 4.5
          },
          {
            id: "hx-12-tube",
            name: "Tube Side",
            status: "Normal",
            overallVibration: 0.7,
            peakAcceleration: 0.25,
            temperature: 72,
            isoClass: "Class III",
            warningThreshold: 2.8,
            criticalThreshold: 4.5
          }
        ]
      }
    ]
  }
];

const STORAGE_KEY = "motormedic_equipment";

function emptyStore(): EquipmentStore {
  return { plants: [], units: [], routes: [] };
}

function normalizeStore(raw: unknown): EquipmentStore {
  if (raw == null) return emptyStore();
  if (Array.isArray(raw)) {
    return { plants: [], units: [], routes: raw as EquipRoute[] };
  }
  if (typeof raw === "object") {
    const obj = raw as Partial<EquipmentStore>;
    return {
      plants: Array.isArray(obj.plants) ? obj.plants : [],
      units: Array.isArray(obj.units) ? obj.units : [],
      routes: Array.isArray(obj.routes) ? obj.routes : []
    };
  }
  return emptyStore();
}

export function flattenEquipment(routes: EquipRoute[]): FlatEquipAsset[] {
  return routes.flatMap((route) =>
    route.assets.map((asset) => ({
      id: asset.id,
      tag: asset.tag,
      name: asset.name,
      location: asset.location,
      routeId: route.id,
      routeName: route.name,
      hierarchyPath: `${route.location} → ${route.name} → ${asset.name}`,
      components: asset.components,
      status: asset.status,
      overallVibration: asset.overallVibration,
      peakAcceleration: asset.peakAcceleration,
      temperature: asset.temperature,
      speedRpm: asset.speedRpm,
      isoClass: asset.isoClass,
      warningThreshold: asset.warningThreshold,
      criticalThreshold: asset.criticalThreshold,
      bearingType: asset.bearingType,
      faultSignature: asset.faultSignature,
      trend30Days: asset.trend30Days,
      multiTrace: asset.multiTrace
    }))
  );
}

function readStoreFromStorage(): EquipmentStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return emptyStore();
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return emptyStore();
  }
}

function writeStoreToStorage(store: EquipmentStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Full hierarchy store (plants, units, routes). */
export function getEquipmentStore(): EquipmentStore {
  return readStoreFromStorage();
}

/** Persist full hierarchy store. */
export function saveEquipmentStore(store: EquipmentStore): EquipmentStore {
  const next: EquipmentStore = {
    plants: store.plants ?? [],
    units: store.units ?? [],
    routes: store.routes ?? []
  };
  writeStoreToStorage(next);
  return next;
}

/** Returns current equipment routes from localStorage (fresh = []). */
export function getEquipmentData(): EquipRoute[] {
  return readStoreFromStorage().routes;
}

/** Flat asset list derived from current equipment state. */
export function getFlatEquipment(): FlatEquipAsset[] {
  return flattenEquipment(getEquipmentData());
}

/** Licensed single-tenant facility root — never create a second plant. */
export const SITE_PLANT_ID = "site-licensed-plant";

/**
 * Hidden bucket route for assets / components / points attached directly
 * under the licensed facility (no intermediate Unit/Route required).
 */
export const SITE_FACILITY_ROUTE_ID = "site-facility-direct";

/** Holding asset inside the facility bucket for orphan components & points. */
export const SITE_FACILITY_HOLDING_ASSET_ID = "site-facility-holding";

/** Component host for collection points attached directly under the facility. */
export const SITE_FACILITY_POINTS_COMP_ID = "site-facility-points";

const DEFAULT_FACILITY_NAME = "Main Facility";

/**
 * Pins the store to exactly one non-deletable plant root named after the
 * registered facility. Remaps units/routes to SITE_PLANT_ID.
 */
export function ensureSitePlantRoot(
  facilityName: string = DEFAULT_FACILITY_NAME
): EquipmentStore {
  const current = readStoreFromStorage();
  const name = (facilityName || DEFAULT_FACILITY_NAME).trim() || DEFAULT_FACILITY_NAME;
  const prior = current.plants.find((p) => p.id === SITE_PLANT_ID) ?? current.plants[0];
  const plant: EquipPlant = {
    id: SITE_PLANT_ID,
    name,
    location: prior?.location || name,
    facilityType: prior?.facilityType || "Power Plant"
  };
  const next: EquipmentStore = {
    plants: [plant],
    units: current.units.map((u) => ({ ...u, plantId: SITE_PLANT_ID })),
    routes: current.routes.map((r) => ({ ...r, plantId: SITE_PLANT_ID }))
  };
  writeStoreToStorage(next);
  return next;
}

/** Sample industrial equipment / nameplate photos for Demo Mode. */
export const DEMO_PHOTO_URLS = {
  centrifugalPump:
    "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=640&h=480&fit=crop&q=80",
  electricMotor:
    "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=640&h=480&fit=crop&q=80",
  industrialFan:
    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=640&h=480&fit=crop&q=80",
  gearbox:
    "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=640&h=480&fit=crop&q=80",
  nameplate:
    "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=640&h=480&fit=crop&q=80"
} as const;

function demoPhotoForAsset(asset: EquipAsset): string {
  const hay = `${asset.tag} ${asset.name} ${asset.machineType || ""}`.toLowerCase();
  if (hay.includes("fan") || hay.includes("blower") || hay.startsWith("fn")) {
    return DEMO_PHOTO_URLS.industrialFan;
  }
  if (hay.includes("gear") || hay.includes("gb")) {
    return DEMO_PHOTO_URLS.gearbox;
  }
  if (hay.includes("motor") || hay.startsWith("m-")) {
    return DEMO_PHOTO_URLS.electricMotor;
  }
  return DEMO_PHOTO_URLS.centrifugalPump;
}

function demoPhotoForComponent(comp: EquipComponent, asset: EquipAsset): string {
  const hay = `${comp.name} ${comp.componentType || ""}`.toLowerCase();
  if (hay.includes("motor")) return DEMO_PHOTO_URLS.electricMotor;
  if (hay.includes("fan")) return DEMO_PHOTO_URLS.industrialFan;
  if (hay.includes("gear")) return DEMO_PHOTO_URLS.gearbox;
  if (hay.includes("pump")) return DEMO_PHOTO_URLS.centrifugalPump;
  if (hay.includes("nde") || hay.includes("de")) return DEMO_PHOTO_URLS.nameplate;
  return demoPhotoForAsset(asset);
}

/** Attach realistic placeholder photos to demo assets & components. */
export function attachDemoPhotos(routes: EquipRoute[]): EquipRoute[] {
  return routes.map((route) => ({
    ...route,
    assets: route.assets.map((asset) => ({
      ...asset,
      photoUrl: asset.photoUrl || demoPhotoForAsset(asset),
      components: asset.components.map((comp) => ({
        ...comp,
        photoUrl: comp.photoUrl || demoPhotoForComponent(comp, asset)
      }))
    }))
  }));
}

/** Seeds localStorage with the industrial demo hierarchy under the fixed site plant. */
export function loadDemoData(facilityName?: string): EquipRoute[] {
  const name =
    (facilityName || DEFAULT_FACILITY_NAME).trim() || DEFAULT_FACILITY_NAME;
  const seed = attachDemoPhotos(
    JSON.parse(JSON.stringify(DEMO_EQUIPMENT_SEED)) as EquipRoute[]
  );
  const store: EquipmentStore = {
    plants: [
      {
        id: SITE_PLANT_ID,
        name,
        location: "Gulf Coast",
        facilityType: "Power Plant"
      }
    ],
    units: [
      { id: "unit-powerhouse", name: "Powerhouse", plantId: SITE_PLANT_ID },
      { id: "unit-process", name: "Process Area", plantId: SITE_PLANT_ID }
    ],
    routes: seed.map((r, i) => ({
      ...r,
      plantId: SITE_PLANT_ID,
      unitId: i % 2 === 0 ? "unit-powerhouse" : "unit-process",
      collectionFrequency: "Monthly" as const
    }))
  };
  writeStoreToStorage(store);
  return store.routes;
}

/** Persist routes while preserving plants/units. */
export function saveEquipmentData(routes: EquipRoute[]): EquipRoute[] {
  const current = readStoreFromStorage();
  writeStoreToStorage({ ...current, routes });
  return routes;
}

/** Resets localStorage equipment but keeps the licensed site plant root. */
export function clearAllData(facilityName?: string): EquipRoute[] {
  const name =
    (facilityName || DEFAULT_FACILITY_NAME).trim() || DEFAULT_FACILITY_NAME;
  writeStoreToStorage({
    plants: [
      {
        id: SITE_PLANT_ID,
        name,
        location: name,
        facilityType: "Power Plant"
      }
    ],
    units: [],
    routes: []
  });
  return [];
}

/**
 * Fresh onboarding default (empty). Prefer getEquipmentData() / getFlatEquipment()
 * for live reads after Demo Mode seeds localStorage.
 */
export const EQUIPMENT_DB: EquipRoute[] = [];
export const FLAT_EQUIPMENT: FlatEquipAsset[] = [];

/* ========================================================================== */
/* Active Equipment DB selection (Diagnose quick-sync)                         */
/* ========================================================================== */

const ACTIVE_DB_SELECTION_KEY = "motormedic_active_db_selection";

export interface ActiveDbSelection {
  nodeId: string;
  kind: string;
  routeName: string;
  assetTag: string;
  assetId: string;
  componentName: string;
  componentId: string;
  path: string;
  updatedAt: number;
}

export function saveActiveDbSelection(selection: ActiveDbSelection): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_DB_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    /* ignore quota */
  }
}

export function getActiveDbSelection(): ActiveDbSelection | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_DB_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveDbSelection;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolve a tree node id against the live store into a Diagnose-friendly
 * route / asset / component selection snapshot.
 */
export function resolveActiveDbSelectionFromNode(
  nodeId: string,
  kind: string,
  path: string
): ActiveDbSelection | null {
  const store = getEquipmentStore();
  const base = {
    nodeId,
    kind,
    path,
    updatedAt: Date.now(),
    routeName: "",
    assetTag: "",
    assetId: "",
    componentName: "",
    componentId: ""
  };

  for (const route of store.routes) {
    if (kind === "route" && route.id === nodeId) {
      const asset = route.assets[0];
      const comp = asset?.components[0];
      return {
        ...base,
        routeName: route.name,
        assetTag: asset?.tag || "",
        assetId: asset?.id || "",
        componentName: comp?.name || "",
        componentId: comp?.id || ""
      };
    }
    for (const asset of route.assets) {
      if (kind === "asset" && asset.id === nodeId) {
        const comp = asset.components[0];
        return {
          ...base,
          routeName: route.name,
          assetTag: asset.tag,
          assetId: asset.id,
          componentName: comp?.name || "",
          componentId: comp?.id || ""
        };
      }
      for (const comp of asset.components) {
        if (kind === "component" && comp.id === nodeId) {
          return {
            ...base,
            routeName: route.name,
            assetTag: asset.tag,
            assetId: asset.id,
            componentName: comp.name,
            componentId: comp.id
          };
        }
        for (const pt of comp.collectionPoints ?? []) {
          if (kind === "point" && pt.id === nodeId) {
            return {
              ...base,
              routeName: route.name,
              assetTag: asset.tag,
              assetId: asset.id,
              componentName: comp.name,
              componentId: comp.id
            };
          }
        }
      }
    }
  }
  return null;
}
