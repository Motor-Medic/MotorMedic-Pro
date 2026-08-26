import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity, CircleDot, Disc, Factory, Gauge, Hash, Layers, Loader2,
  Settings2, Sparkles, Tag, Thermometer, Wind, X, Zap, Droplets
} from "lucide-react";

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

export type SpecTabId =
  | "core"
  | "bearings"
  | "electrical"
  | "gear"
  | "hydraulic"
  | "impeller";

export type ComponentTypeOption =
  | "Electric Motor"
  | "Gearbox"
  | "Pump"
  | "Fan/Blower"
  | "Compressor"
  | "Coupling"
  | "Shaft"
  | "Other"
  | string;

export interface CreateComponentResult {
  name: string;
  componentType: string;
  manufacturer: string;
  specs: Record<string, string>;
}

export interface ComponentTypeTemplate {
  type: string;
  manufacturer?: string;
  specs: Record<string, string>;
  /** Custom AI-researched field schema (for "Other" saved types) */
  customFields?: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  section?: string;
  icon?: IconKey;
}

type IconKey =
  | "gauge"
  | "zap"
  | "layers"
  | "disc"
  | "settings"
  | "droplets"
  | "wind"
  | "factory"
  | "tag"
  | "activity"
  | "hash"
  | "thermometer"
  | "circle";

interface TabDef {
  id: SpecTabId;
  label: string;
}

const TEMPLATE_KEY = "motormedic.equipmentDb.componentTypeTemplates.v2";
const CUSTOM_TYPES_KEY = "motormedic.equipmentDb.customComponentTypes.v1";

export const BASE_COMPONENT_TYPES = [
  "Electric Motor",
  "Gearbox",
  "Pump",
  "Fan/Blower",
  "Compressor",
  "Coupling",
  "Shaft",
  "Other"
] as const;

/** @deprecated prefer BASE_COMPONENT_TYPES + custom */
export const COMPONENT_TYPE_OPTIONS = [...BASE_COMPONENT_TYPES];

const ICON_MAP: Record<IconKey, typeof Gauge> = {
  gauge: Gauge,
  zap: Zap,
  layers: Layers,
  disc: Disc,
  settings: Settings2,
  droplets: Droplets,
  wind: Wind,
  factory: Factory,
  tag: Tag,
  activity: Activity,
  hash: Hash,
  thermometer: Thermometer,
  circle: CircleDot
};

function resolveIcon(field: FieldDef): IconKey {
  if (field.icon) return field.icon;
  const k = `${field.key} ${field.label}`.toLowerCase();
  if (/rpm|speed|ratio/.test(k)) return "gauge";
  if (/volt|amp|fla|nla|freq|pole|electr|power factor|insulat|winding/.test(k)) return "zap";
  if (/stage|shaft|layer|teeth|blade|vane|cylinder|lobe/.test(k)) return "layers";
  if (/bearing/.test(k)) return "disc";
  if (/oil|lube|grease|fluid|npsh|flow|gpm|cfm|scfm|pressure|head/.test(k)) return "droplets";
  if (/fan|air|impeller|wheel|wind/.test(k)) return "wind";
  if (/temp|thermal/.test(k)) return "thermometer";
  if (/manuf|oem|model|make|frame|enclos/.test(k)) return "factory";
  if (/name|type|tag|critical|orient|drive|mode|config/.test(k)) return "tag";
  if (/tonnage|capacity|diameter|width|length|size|bore/.test(k)) return "hash";
  if (/vibrat|monitor|activity/.test(k)) return "activity";
  return "settings";
}

/* ========================================================================== */
/* Tab map by component type                                                  */
/* ========================================================================== */

const TABS_BY_TYPE: Record<string, TabDef[]> = {
  "Electric Motor": [
    { id: "core", label: "Core Specs" },
    { id: "bearings", label: "Bearings" },
    { id: "electrical", label: "Electrical" }
  ],
  Gearbox: [
    { id: "core", label: "Core Specs" },
    { id: "gear", label: "Gear Details" },
    { id: "bearings", label: "Bearings" }
  ],
  Pump: [
    { id: "core", label: "Core Specs" },
    { id: "hydraulic", label: "Hydraulic" },
    { id: "bearings", label: "Bearings" }
  ],
  "Fan/Blower": [
    { id: "core", label: "Core Specs" },
    { id: "impeller", label: "Impeller" }
  ],
  Compressor: [{ id: "core", label: "Core Specs" }],
  Coupling: [{ id: "core", label: "Core Specs" }],
  Shaft: [{ id: "core", label: "Core Specs" }],
  Other: [{ id: "core", label: "Core Specs" }]
};

/* ========================================================================== */
/* Field schemas                                                              */
/* ========================================================================== */

const MOTOR_CORE: FieldDef[] = [
  { key: "horsepower", label: "Horsepower (HP/kW)", kind: "text", placeholder: "e.g., 150 kW", required: true, section: "Performance", icon: "zap" },
  { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 1750", required: true, section: "Performance", icon: "gauge" },
  { key: "voltage", label: "Voltage (V)", kind: "number", placeholder: "e.g., 460", section: "Performance", icon: "zap" },
  { key: "lineFrequency", label: "Line Frequency (Hz)", kind: "number", placeholder: "e.g., 60", required: true, section: "Performance", icon: "zap" },
  { key: "numPoles", label: "Number of Poles", kind: "number", placeholder: "e.g., 4", required: true, section: "Mechanical", icon: "hash" },
  { key: "rotorBars", label: "Rotor Bars", kind: "number", placeholder: "e.g., 40", required: true, section: "Mechanical", icon: "layers" },
  { key: "statorSlots", label: "Stator Slots", kind: "number", placeholder: "e.g., 48", required: true, section: "Mechanical", icon: "layers" },
  { key: "motorType", label: "Motor Type", kind: "select", options: ["Induction", "Synchronous", "DC", "Wound Rotor"], required: true, section: "Mechanical", icon: "tag" },
  { key: "frameSize", label: "Frame Size", kind: "text", placeholder: "e.g., 365T", section: "Mechanical", icon: "factory" },
  { key: "enclosureType", label: "Enclosure Type", kind: "select", options: ["TEFC", "ODP", "Explosion Proof", "TEAO", "WPII", "TENV"], section: "Mechanical", icon: "settings" },
  { key: "driveMode", label: "Drive Mode", kind: "select", options: ["Direct Coupled", "Belt Driven", "Gear Drive", "VFD"], required: true, section: "Mechanical", icon: "settings" },
  { key: "assetCriticality", label: "Asset Criticality", kind: "select", options: ["Class I Critical", "Class II Standard", "Class III Non-critical"], required: true, section: "Mechanical", icon: "activity" }
];

const MOTOR_BEARINGS: FieldDef[] = [
  { key: "bearingDe", label: "Drive End Bearing Type", kind: "text", placeholder: "e.g., 6320 C3", required: true, section: "Bearings", icon: "disc" },
  { key: "bearingNde", label: "Non-Drive End Bearing Type", kind: "text", placeholder: "e.g., 6318 C3", required: true, section: "Bearings", icon: "disc" },
  { key: "bearingManufacturer", label: "Bearing Manufacturer", kind: "select", options: ["SKF", "FAG", "Timken", "NSK", "NTN", "Other"], section: "Bearings", icon: "factory" },
  { key: "bearingLubeType", label: "Lubrication Type", kind: "select", options: ["Grease", "Oil"], section: "Bearings", icon: "droplets" }
];

const MOTOR_ELECTRICAL: FieldDef[] = [
  { key: "fla", label: "Full Load Amps (FLA)", kind: "number", placeholder: "e.g., 180", section: "Electrical", icon: "zap" },
  { key: "nla", label: "No Load Amps", kind: "number", placeholder: "e.g., 45", section: "Electrical", icon: "zap" },
  { key: "serviceFactor", label: "Service Factor", kind: "number", placeholder: "e.g., 1.15", section: "Electrical", icon: "hash" },
  { key: "efficiencyRating", label: "Efficiency Rating", kind: "text", placeholder: "e.g., IE3 / 95.4%", section: "Electrical", icon: "activity" },
  { key: "powerFactor", label: "Power Factor", kind: "number", placeholder: "e.g., 0.88", section: "Electrical", icon: "zap" },
  { key: "insulationClass", label: "Insulation Class", kind: "select", options: ["Class B", "Class F", "Class H", "Class A"], section: "Electrical", icon: "tag" },
  { key: "windingConfig", label: "Winding Configuration", kind: "select", options: ["Delta", "Wye"], section: "Electrical", icon: "settings" }
];

const GEARBOX_CORE: FieldDef[] = [
  { key: "gearRatio", label: "Gear Ratio", kind: "text", placeholder: "e.g., 4.15:1", required: true, section: "Performance", icon: "gauge" },
  { key: "inputSpeed", label: "Input Speed (RPM)", kind: "number", placeholder: "e.g., 1750", required: true, section: "Performance", icon: "gauge" },
  { key: "outputSpeed", label: "Output Speed (RPM)", kind: "number", placeholder: "e.g., 420", required: true, section: "Performance", icon: "gauge" },
  { key: "numShafts", label: "Number of Shafts", kind: "number", placeholder: "e.g., 2", required: true, section: "Mechanical", icon: "layers" },
  { key: "gearType", label: "Gear Type", kind: "select", options: ["Helical", "Spur", "Bevel", "Worm", "Planetary"], required: true, section: "Mechanical", icon: "settings" },
  { key: "oilViscosity", label: "Oil Type/Viscosity", kind: "text", placeholder: "e.g., ISO VG 220", required: true, section: "Lubrication", icon: "droplets" },
  { key: "oilCapacity", label: "Oil Capacity (gal/L)", kind: "text", placeholder: "e.g., 12 L", section: "Lubrication", icon: "droplets" },
  { key: "gearboxOrientation", label: "Gearbox Orientation", kind: "select", options: ["Horizontal", "Vertical"], required: true, section: "Mechanical", icon: "tag" }
];

const GEARBOX_GEAR: FieldDef[] = [
  { key: "pinionTeeth", label: "Pinion Teeth Count", kind: "number", placeholder: "e.g., 23", required: true, section: "Mesh Geometry", icon: "hash" },
  { key: "gearTeeth", label: "Gear Teeth Count", kind: "number", placeholder: "e.g., 87", required: true, section: "Mesh Geometry", icon: "hash" },
  { key: "pinionSpeed", label: "Pinion Speed (RPM)", kind: "number", placeholder: "e.g., 1750", section: "Mesh Geometry", icon: "gauge" },
  { key: "gearSpeed", label: "Gear Speed (RPM)", kind: "number", placeholder: "e.g., 420", section: "Mesh Geometry", icon: "gauge" },
  { key: "modulePitch", label: "Module / Diametral Pitch", kind: "text", placeholder: "e.g., Module 4 / DP 6", section: "Geometry", icon: "settings" },
  { key: "faceWidth", label: "Face Width", kind: "text", placeholder: "e.g., 65 mm", section: "Geometry", icon: "hash" },
  { key: "helixAngle", label: "Helix Angle (°)", kind: "number", placeholder: "e.g., 15", section: "Geometry", icon: "activity" }
];

const GEARBOX_BEARINGS: FieldDef[] = [
  { key: "inputBearingDe", label: "Input Shaft Bearing DE", kind: "text", placeholder: "e.g., 22216 E", required: true, section: "Input Shaft", icon: "disc" },
  { key: "inputBearingNde", label: "Input Shaft Bearing NDE", kind: "text", placeholder: "e.g., 22214 E", required: true, section: "Input Shaft", icon: "disc" },
  { key: "interBearingDe", label: "Intermediate Shaft Bearing DE", kind: "text", placeholder: "e.g., 22212 E", section: "Intermediate Shaft", icon: "disc" },
  { key: "interBearingNde", label: "Intermediate Shaft Bearing NDE", kind: "text", placeholder: "e.g., 22210 E", section: "Intermediate Shaft", icon: "disc" },
  { key: "outputBearingDe", label: "Output Shaft Bearing DE", kind: "text", placeholder: "e.g., 22214 E", required: true, section: "Output Shaft", icon: "disc" },
  { key: "outputBearingNde", label: "Output Shaft Bearing NDE", kind: "text", placeholder: "e.g., 22212 E", required: true, section: "Output Shaft", icon: "disc" }
];

const PUMP_CORE: FieldDef[] = [
  { key: "flowRateGpm", label: "Flow Rate (GPM)", kind: "number", placeholder: "e.g., 1200", required: true, section: "Performance", icon: "droplets" },
  { key: "pressureHead", label: "Pressure / Head (PSI or ft)", kind: "text", placeholder: "e.g., 85 PSI / 196 ft", required: true, section: "Performance", icon: "gauge" },
  { key: "rpm", label: "Speed (RPM)", kind: "number", placeholder: "e.g., 1780", required: true, section: "Performance", icon: "gauge" },
  { key: "impellerBlades", label: "Number of Impeller Blades", kind: "number", placeholder: "e.g., 5", required: true, section: "Mechanical", icon: "layers" },
  { key: "pumpType", label: "Pump Type", kind: "select", options: ["Centrifugal", "Positive Displacement", "Multistage", "Axial Flow"], required: true, section: "Mechanical", icon: "tag" },
  { key: "numStages", label: "Number of Stages", kind: "number", placeholder: "e.g., 1", section: "Mechanical", icon: "layers" },
  { key: "suctionSpecificSpeed", label: "Suction Specific Speed", kind: "number", placeholder: "e.g., 8500", section: "Performance", icon: "activity" },
  { key: "impellerDiameter", label: "Impeller Diameter (in/mm)", kind: "text", placeholder: "e.g., 12.5 in", section: "Mechanical", icon: "hash" },
  { key: "temperature", label: "Temperature (°F/°C)", kind: "text", placeholder: "e.g., 140 °F", section: "Process", icon: "thermometer" }
];

const PUMP_HYDRAULIC: FieldDef[] = [
  { key: "suctionSize", label: "Suction Size (inches)", kind: "text", placeholder: "e.g., 8 in", section: "Hydraulics", icon: "hash" },
  { key: "dischargeSize", label: "Discharge Size (inches)", kind: "text", placeholder: "e.g., 6 in", section: "Hydraulics", icon: "hash" },
  { key: "npshRequired", label: "NPSH Required (feet)", kind: "number", placeholder: "e.g., 12", section: "Hydraulics", icon: "droplets" },
  { key: "shutOffHead", label: "Shut-off Head (feet)", kind: "number", placeholder: "e.g., 220", section: "Hydraulics", icon: "gauge" },
  { key: "bepFlow", label: "Best Efficiency Point (BEP) Flow", kind: "text", placeholder: "e.g., 1100 GPM", section: "Hydraulics", icon: "activity" },
  { key: "specificSpeed", label: "Specific Speed", kind: "number", placeholder: "e.g., 1800", section: "Hydraulics", icon: "gauge" }
];

const PUMP_BEARINGS: FieldDef[] = [
  { key: "bearingDe", label: "Drive End Bearing Type", kind: "text", placeholder: "e.g., 6320 C3", required: true, section: "Bearings", icon: "disc" },
  { key: "bearingNde", label: "Non-Drive End Bearing Type", kind: "text", placeholder: "e.g., 6318 C3", required: true, section: "Bearings", icon: "disc" },
  { key: "bearingHousing", label: "Bearing Housing Type", kind: "select", options: ["Pillow Block", "Flange", "Cartridge", "Integrated", "Other"], section: "Bearings", icon: "settings" }
];

const FAN_CORE: FieldDef[] = [
  { key: "numBlades", label: "Number of Blades", kind: "number", placeholder: "e.g., 8", required: true, section: "Performance", icon: "layers" },
  { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 1180", required: true, section: "Performance", icon: "gauge" },
  { key: "wheelDiameter", label: "Wheel Diameter (in/mm)", kind: "text", placeholder: "e.g., 36 in", section: "Performance", icon: "hash" },
  { key: "airFlowCfm", label: "Air Flow Rate (CFM)", kind: "number", placeholder: "e.g., 25000", section: "Performance", icon: "wind" },
  { key: "staticPressure", label: "Static Pressure (in WC)", kind: "number", placeholder: "e.g., 4.5", section: "Performance", icon: "gauge" },
  { key: "fanType", label: "Fan Type", kind: "select", options: ["Centrifugal", "Axial", "Mixed Flow"], required: true, section: "Mechanical", icon: "tag" },
  { key: "bladeAngle", label: "Blade Angle", kind: "select", options: ["Fixed", "Variable Pitch"], section: "Mechanical", icon: "settings" },
  { key: "driveType", label: "Drive Type", kind: "select", options: ["Direct", "Belt", "VFD"], required: true, section: "Mechanical", icon: "settings" }
];

const FAN_IMPELLER: FieldDef[] = [
  { key: "impellerWidth", label: "Impeller Width", kind: "text", placeholder: "e.g., 14 in", section: "Impeller", icon: "hash" },
  { key: "bladeType", label: "Blade Type", kind: "select", options: ["Forward Curved", "Backward Curved", "Radial"], section: "Impeller", icon: "wind" },
  { key: "numVanes", label: "Number of Vanes", kind: "number", placeholder: "e.g., 8", section: "Impeller", icon: "layers" },
  { key: "inletDiameter", label: "Inlet Diameter", kind: "text", placeholder: "e.g., 24 in", section: "Impeller", icon: "circle" }
];

const COMPRESSOR_CORE: FieldDef[] = [
  { key: "compressorType", label: "Type", kind: "select", options: ["Reciprocating", "Centrifugal", "Screw", "Rotary Vane"], required: true, section: "Performance", icon: "tag" },
  { key: "rpm", label: "Speed (RPM)", kind: "number", placeholder: "e.g., 3550", required: true, section: "Performance", icon: "gauge" },
  { key: "numCylinders", label: "Number of Cylinders", kind: "number", placeholder: "e.g., 4", section: "Mechanical", icon: "layers" },
  { key: "numLobes", label: "Number of Lobes / Vanes", kind: "number", placeholder: "e.g., 5", section: "Mechanical", icon: "layers" },
  { key: "dischargePressure", label: "Discharge Pressure (PSI)", kind: "number", placeholder: "e.g., 125", required: true, section: "Performance", icon: "gauge" },
  { key: "suctionPressure", label: "Suction Pressure (PSI)", kind: "number", placeholder: "e.g., 14.7", section: "Performance", icon: "gauge" },
  { key: "flowScfm", label: "Flow Rate (SCFM)", kind: "number", placeholder: "e.g., 450", section: "Performance", icon: "wind" },
  { key: "compressionRatio", label: "Compression Ratio", kind: "number", placeholder: "e.g., 8.5", section: "Performance", icon: "hash" },
  { key: "numStages", label: "Number of Stages", kind: "number", placeholder: "e.g., 1", section: "Mechanical", icon: "layers" }
];

const COUPLING_CORE: FieldDef[] = [
  { key: "couplingType", label: "Type", kind: "select", options: ["Flexible", "Rigid", "Gear", "Grid", "Elastomeric", "Universal Joint"], required: true, section: "Mechanical", icon: "tag" },
  { key: "couplingModel", label: "Manufacturer / Model", kind: "text", placeholder: "e.g., Falk 1030T10", required: true, section: "Mechanical", icon: "factory" },
  { key: "maxRpm", label: "Maximum RPM Rating", kind: "number", placeholder: "e.g., 3600", required: true, section: "Ratings", icon: "gauge" },
  { key: "boreSize", label: "Bore Size (in/mm)", kind: "text", placeholder: "e.g., 2.375 in", section: "Ratings", icon: "hash" },
  { key: "keyway", label: "Keyway", kind: "select", options: ["Yes", "No"], section: "Ratings", icon: "settings" },
  { key: "spacerLength", label: "Spacer Length", kind: "text", placeholder: "e.g., 7 in", section: "Geometry", icon: "hash" },
  { key: "misalignmentTolerance", label: "Misalignment Tolerance", kind: "text", placeholder: "e.g., 0.5° / 0.015 in", section: "Geometry", icon: "activity" }
];

const SHAFT_CORE: FieldDef[] = [
  { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 1750", required: true, section: "Mechanical", icon: "gauge" },
  { key: "shaftDiameter", label: "Shaft Diameter (in/mm)", kind: "text", placeholder: "e.g., 2.5 in", section: "Mechanical", icon: "hash" },
  { key: "bearingDe", label: "Drive End Bearing", kind: "text", placeholder: "e.g., 6316 C3", section: "Bearings", icon: "disc" },
  { key: "bearingNde", label: "Non-Drive End Bearing", kind: "text", placeholder: "e.g., 6316 C3", section: "Bearings", icon: "disc" },
  { key: "orientation", label: "Orientation", kind: "select", options: ["Horizontal", "Vertical"], section: "Mechanical", icon: "tag" }
];

const OTHER_BASE: FieldDef[] = [
  { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 1750", required: true, section: "General", icon: "gauge" },
  { key: "notes", label: "Notes / Description", kind: "text", placeholder: "Describe the asset…", section: "General", icon: "tag" }
];

const FIELDS: Record<string, Partial<Record<SpecTabId, FieldDef[]>>> = {
  "Electric Motor": { core: MOTOR_CORE, bearings: MOTOR_BEARINGS, electrical: MOTOR_ELECTRICAL },
  Gearbox: { core: GEARBOX_CORE, gear: GEARBOX_GEAR, bearings: GEARBOX_BEARINGS },
  Pump: { core: PUMP_CORE, hydraulic: PUMP_HYDRAULIC, bearings: PUMP_BEARINGS },
  "Fan/Blower": { core: FAN_CORE, impeller: FAN_IMPELLER },
  Compressor: { core: COMPRESSOR_CORE },
  Coupling: { core: COUPLING_CORE },
  Shaft: { core: SHAFT_CORE },
  Other: { core: OTHER_BASE }
};

const AI_DEFAULTS: Record<string, { manufacturer?: string; specs: Record<string, string> }> = {
  "Electric Motor": {
    manufacturer: "Baldor",
    specs: {
      horsepower: "150 kW", rpm: "1750", voltage: "460", lineFrequency: "60", numPoles: "4",
      rotorBars: "40", statorSlots: "48", motorType: "Induction", frameSize: "365T",
      enclosureType: "TEFC", driveMode: "Direct Coupled", assetCriticality: "Class II Standard",
      bearingDe: "6320 C3", bearingNde: "6318 C3", bearingManufacturer: "SKF", bearingLubeType: "Grease",
      fla: "180", nla: "45", serviceFactor: "1.15", efficiencyRating: "IE3 / 95.4%",
      powerFactor: "0.88", insulationClass: "Class F", windingConfig: "Delta"
    }
  },
  Gearbox: {
    manufacturer: "Falk",
    specs: {
      gearRatio: "4.15:1", inputSpeed: "1750", outputSpeed: "422", numShafts: "2", gearType: "Helical",
      oilViscosity: "ISO VG 220", oilCapacity: "12 L", gearboxOrientation: "Horizontal",
      pinionTeeth: "23", gearTeeth: "87", pinionSpeed: "1750", gearSpeed: "422",
      modulePitch: "Module 4", faceWidth: "65 mm", helixAngle: "15",
      inputBearingDe: "22216 E", inputBearingNde: "22214 E", outputBearingDe: "22214 E", outputBearingNde: "22212 E"
    }
  },
  Pump: {
    manufacturer: "Flowserve",
    specs: {
      flowRateGpm: "1200", pressureHead: "85 PSI / 196 ft", rpm: "1780", impellerBlades: "5",
      pumpType: "Centrifugal", numStages: "1", suctionSpecificSpeed: "8500", impellerDiameter: "12.5 in",
      temperature: "140 °F", suctionSize: "8 in", dischargeSize: "6 in", npshRequired: "12",
      shutOffHead: "220", bepFlow: "1100 GPM", specificSpeed: "1800",
      bearingDe: "6320 C3", bearingNde: "6318 C3", bearingHousing: "Cartridge"
    }
  },
  "Fan/Blower": {
    manufacturer: "Howden",
    specs: {
      numBlades: "8", rpm: "1180", wheelDiameter: "36 in", airFlowCfm: "25000", staticPressure: "4.5",
      fanType: "Centrifugal", bladeAngle: "Fixed", driveType: "Belt",
      impellerWidth: "14 in", bladeType: "Backward Curved", numVanes: "8", inletDiameter: "24 in"
    }
  },
  Compressor: {
    manufacturer: "Atlas Copco",
    specs: {
      compressorType: "Screw", rpm: "3550", numLobes: "5", dischargePressure: "125",
      suctionPressure: "14.7", flowScfm: "450", compressionRatio: "8.5", numStages: "1"
    }
  },
  Coupling: {
    manufacturer: "Falk",
    specs: {
      couplingType: "Flexible", couplingModel: "Falk 1030T10", maxRpm: "3600",
      boreSize: "2.375 in", keyway: "Yes", spacerLength: "7 in", misalignmentTolerance: "0.5° / 0.015 in"
    }
  },
  Shaft: {
    manufacturer: "SKF",
    specs: { rpm: "1750", shaftDiameter: "2.5 in", bearingDe: "6316 C3", bearingNde: "6316 C3", orientation: "Horizontal" }
  },
  Other: { specs: { rpm: "1750", notes: "" } }
};

/* ========================================================================== */
/* Custom type AI research mocks                                              */
/* ========================================================================== */

function researchCustomType(query: string): { fields: FieldDef[]; defaults: Record<string, string> } {
  const q = query.toLowerCase();

  if (/chiller|hvac|refrigerat/.test(q)) {
    return {
      fields: [
        { key: "tonnage", label: "Tonnage (TR)", kind: "number", placeholder: "e.g., 500", required: true, section: "Performance", icon: "gauge" },
        { key: "refrigerantType", label: "Refrigerant Type", kind: "select", options: ["R-134a", "R-123", "R-410A", "Ammonia", "Other"], required: true, section: "Performance", icon: "droplets" },
        { key: "compressorType", label: "Compressor Type", kind: "select", options: ["Centrifugal", "Screw", "Scroll", "Reciprocating"], required: true, section: "Mechanical", icon: "settings" },
        { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 3600", required: true, section: "Mechanical", icon: "gauge" },
        { key: "bearingDe", label: "Drive End Bearing", kind: "text", placeholder: "e.g., 6319 C3", section: "Bearings", icon: "disc" },
        { key: "bearingNde", label: "Non-Drive End Bearing", kind: "text", placeholder: "e.g., 6317 C3", section: "Bearings", icon: "disc" }
      ],
      defaults: {
        tonnage: "500", refrigerantType: "R-134a", compressorType: "Centrifugal",
        rpm: "3600", bearingDe: "6319 C3", bearingNde: "6317 C3"
      }
    };
  }

  if (/kiln|rotary kiln|furnace/.test(q)) {
    return {
      fields: [
        { key: "kilnLength", label: "Kiln Length (ft/m)", kind: "text", placeholder: "e.g., 250 ft", required: true, section: "Geometry", icon: "hash" },
        { key: "operatingTemp", label: "Operating Temperature (°F/°C)", kind: "text", placeholder: "e.g., 1450 °C", required: true, section: "Process", icon: "thermometer" },
        { key: "rpm", label: "Rotation Speed (RPM)", kind: "number", placeholder: "e.g., 1.5", required: true, section: "Mechanical", icon: "gauge" },
        { key: "supportRollers", label: "Number of Support Rollers", kind: "number", placeholder: "e.g., 4", section: "Mechanical", icon: "layers" },
        { key: "refractoryType", label: "Refractory Type", kind: "text", placeholder: "e.g., Magnesia-chrome", section: "Process", icon: "tag" }
      ],
      defaults: {
        kilnLength: "250 ft", operatingTemp: "1450 °C", rpm: "1.5",
        supportRollers: "4", refractoryType: "Magnesia-chrome"
      }
    };
  }

  if (/conveyor|belt/.test(q)) {
    return {
      fields: [
        { key: "beltSpeed", label: "Belt Speed (fpm)", kind: "number", placeholder: "e.g., 350", required: true, section: "Performance", icon: "gauge" },
        { key: "beltWidth", label: "Belt Width (in)", kind: "text", placeholder: "e.g., 48 in", required: true, section: "Geometry", icon: "hash" },
        { key: "drivePower", label: "Drive Power (HP/kW)", kind: "text", placeholder: "e.g., 75 HP", section: "Performance", icon: "zap" },
        { key: "pulleyDiameter", label: "Drive Pulley Diameter", kind: "text", placeholder: "e.g., 24 in", section: "Mechanical", icon: "circle" },
        { key: "rpm", label: "Drive RPM", kind: "number", placeholder: "e.g., 1750", section: "Mechanical", icon: "gauge" }
      ],
      defaults: {
        beltSpeed: "350", beltWidth: "48 in", drivePower: "75 HP",
        pulleyDiameter: "24 in", rpm: "1750"
      }
    };
  }

  if (/agitator|mixer|blender/.test(q)) {
    return {
      fields: [
        { key: "impellerDiameter", label: "Impeller Diameter", kind: "text", placeholder: "e.g., 36 in", required: true, section: "Mechanical", icon: "hash" },
        { key: "rpm", label: "Agitator Speed (RPM)", kind: "number", placeholder: "e.g., 68", required: true, section: "Performance", icon: "gauge" },
        { key: "tankVolume", label: "Tank Volume", kind: "text", placeholder: "e.g., 10,000 gal", section: "Process", icon: "droplets" },
        { key: "viscosity", label: "Fluid Viscosity", kind: "text", placeholder: "e.g., 500 cP", section: "Process", icon: "droplets" },
        { key: "bearingDe", label: "Drive End Bearing", kind: "text", placeholder: "e.g., 22216 E", section: "Bearings", icon: "disc" }
      ],
      defaults: {
        impellerDiameter: "36 in", rpm: "68", tankVolume: "10,000 gal",
        viscosity: "500 cP", bearingDe: "22216 E"
      }
    };
  }

  // Generic industrial machine fallback
  return {
    fields: [
      { key: "rpm", label: "Operating Speed (RPM)", kind: "number", placeholder: "e.g., 1750", required: true, section: "Performance", icon: "gauge" },
      { key: "powerRating", label: "Power Rating (HP/kW)", kind: "text", placeholder: "e.g., 100 kW", required: true, section: "Performance", icon: "zap" },
      { key: "bearingDe", label: "Drive End Bearing", kind: "text", placeholder: "e.g., 6316 C3", section: "Bearings", icon: "disc" },
      { key: "bearingNde", label: "Non-Drive End Bearing", kind: "text", placeholder: "e.g., 6316 C3", section: "Bearings", icon: "disc" },
      { key: "assetCriticality", label: "Asset Criticality", kind: "select", options: ["Class I Critical", "Class II Standard", "Class III Non-critical"], section: "Mechanical", icon: "activity" },
      { key: "notes", label: "Notes", kind: "text", placeholder: "Vibration-relevant notes…", section: "General", icon: "tag" }
    ],
    defaults: {
      rpm: "1750", powerRating: "100 kW", bearingDe: "6316 C3",
      bearingNde: "6316 C3", assetCriticality: "Class II Standard", notes: ""
    }
  };
}

/* ========================================================================== */
/* Storage                                                                    */
/* ========================================================================== */

export function loadTypeTemplates(): ComponentTypeTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTypeTemplate(tpl: ComponentTypeTemplate) {
  const all = loadTypeTemplates().filter((t) => t.type.toLowerCase() !== tpl.type.toLowerCase());
  all.unshift(tpl);
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all.slice(0, 80)));
}

export function loadCustomTypes(): ComponentTypeTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomType(tpl: ComponentTypeTemplate) {
  const all = loadCustomTypes().filter((t) => t.type.toLowerCase() !== tpl.type.toLowerCase());
  all.unshift(tpl);
  localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(all.slice(0, 40)));
  // also mirror into templates for auto-fill
  saveTypeTemplate(tpl);
}

function findTemplate(type: string, templates: ComponentTypeTemplate[]) {
  return templates.find((t) => t.type.toLowerCase() === type.toLowerCase());
}

export function fieldsFor(
  type: string,
  tab: SpecTabId,
  customFields?: FieldDef[] | null
): FieldDef[] {
  if (customFields && customFields.length && tab === "core") return customFields;
  const custom = loadCustomTypes().find((t) => t.type.toLowerCase() === type.toLowerCase());
  if (custom?.customFields?.length && tab === "core" && !FIELDS[type]) {
    return custom.customFields;
  }
  return FIELDS[type]?.[tab] ?? (tab === "core" ? OTHER_BASE : []);
}

function emptyFromFields(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = "";
  return out;
}

export function emptySpecsFor(type: string, customFields?: FieldDef[] | null): Record<string, string> {
  if (customFields?.length) return emptyFromFields(customFields);
  const tabs = TABS_BY_TYPE[type] ?? TABS_BY_TYPE.Other;
  const out: Record<string, string> = {};
  for (const t of tabs) {
    for (const f of fieldsFor(type, t.id)) out[f.key] = "";
  }
  return out;
}

export function getSpecTabs(type: string): { id: SpecTabId; label: string }[] {
  return TABS_BY_TYPE[type] ?? TABS_BY_TYPE.Other;
}

/* ========================================================================== */
/* UI primitives                                                              */
/* ========================================================================== */

const INPUT_BASE =
  "w-full min-h-[44px] rounded-lg bg-slate-900/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500";

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
      {label}
      {required && <span className="text-amber-400 ml-0.5">*</span>}
    </span>
  );
}

function SpecField({
  field,
  value,
  onChange
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const iconKey = resolveIcon(field);
  const Icon = ICON_MAP[iconKey];

  if (field.kind === "select") {
    return (
      <div className="block">
        <FieldLabel label={field.label} required={field.required} />
        <div className="relative">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <select
            className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="block">
      <FieldLabel label={field.label} required={field.required} />
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        <input
          type={field.kind === "number" ? "number" : "text"}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          className={`${INPUT_BASE} pl-10 pr-3`}
          value={value}
          onChange={(e) => {
            if (field.kind === "number") {
              const v = e.target.value;
              if (v === "" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
              return;
            }
            onChange(e.target.value);
          }}
          placeholder={field.placeholder}
        />
      </div>
    </div>
  );
}

function groupBySection(fields: FieldDef[]): { section: string; fields: FieldDef[] }[] {
  const order: string[] = [];
  const map = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const s = f.section || "General";
    if (!map.has(s)) {
      map.set(s, []);
      order.push(s);
    }
    map.get(s)!.push(f);
  }
  return order.map((section) => ({ section, fields: map.get(section)! }));
}

/* ========================================================================== */
/* Modal                                                                      */
/* ========================================================================== */

export default function CreateComponentModal({
  onClose,
  onSave,
  isEdit = false,
  initialData
}: {
  onClose: () => void;
  onSave: (result: CreateComponentResult) => void;
  isEdit?: boolean;
  initialData?: Partial<CreateComponentResult>;
}) {
  const [customTypes, setCustomTypes] = useState<ComponentTypeTemplate[]>(() => loadCustomTypes());
  const initialType = initialData?.componentType || "Electric Motor";
  const [name, setName] = useState(initialData?.name || "");
  const [componentType, setComponentType] = useState<string>(initialType);
  const [manufacturer, setManufacturer] = useState(initialData?.manufacturer || "");
  const [specs, setSpecs] = useState<Record<string, string>>(() => ({
    ...emptySpecsFor(initialType),
    ...(initialData?.specs || {})
  }));
  const [tab, setTab] = useState<SpecTabId>("core");
  const [templates, setTemplates] = useState<ComponentTypeTemplate[]>(() => loadTypeTemplates());
  const [aiBusy, setAiBusy] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [aiFlash, setAiFlash] = useState(false);
  const [error, setError] = useState("");
  const skipTypeReset = useRef(!!isEdit && !!initialData);

  // Other workflow
  const [customTypeName, setCustomTypeName] = useState(
    initialType && !(BASE_COMPONENT_TYPES as readonly string[]).includes(initialType) && initialType !== "Other"
      ? initialType
      : ""
  );
  const [generatedFields, setGeneratedFields] = useState<FieldDef[] | null>(() => {
    if (!isEdit || !initialData?.componentType) return null;
    const custom = loadCustomTypes().find(
      (t) => t.type.toLowerCase() === initialData.componentType!.toLowerCase()
    );
    return custom?.customFields ?? null;
  });
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const [researchDone, setResearchDone] = useState(() => {
    if (!isEdit) return false;
    return !!(initialData?.specs && Object.keys(initialData.specs).length > 0);
  });

  const typeOptions = useMemo(() => {
    const customNames = customTypes.map((t) => t.type);
    const base = BASE_COMPONENT_TYPES.filter((t) => t !== "Other");
    const extras =
      initialData?.componentType &&
      !base.some((t) => t === initialData.componentType) &&
      initialData.componentType !== "Other" &&
      !customNames.includes(initialData.componentType)
        ? [initialData.componentType]
        : [];
    return [...base, ...customNames, ...extras, "Other"];
  }, [customTypes, initialData?.componentType]);

  const isOther = componentType === "Other";
  const isSavedCustom = customTypes.some((t) => t.type === componentType);

  const effectiveTypeKey = isOther ? "Other" : componentType;

  const tabs = useMemo(() => {
    if (isOther || isSavedCustom) return TABS_BY_TYPE.Other;
    return TABS_BY_TYPE[componentType] ?? TABS_BY_TYPE.Other;
  }, [componentType, isOther, isSavedCustom]);

  const knownTemplate = useMemo(() => {
    if (isOther) return null;
    return findTemplate(componentType, [...templates, ...customTypes]);
  }, [componentType, templates, customTypes, isOther]);

  const aiEnabled = !isOther && !!componentType && !knownTemplate && !aiBusy && !isEdit;

  const activeCustomFields = useMemo(() => {
    if (isOther && generatedFields) return generatedFields;
    if (isSavedCustom) {
      return customTypes.find((t) => t.type === componentType)?.customFields ?? null;
    }
    return null;
  }, [isOther, generatedFields, isSavedCustom, customTypes, componentType]);

  const patch = (key: string, value: string) =>
    setSpecs((prev) => ({ ...prev, [key]: value }));

  /** Type change → refresh tabs/fields (skip initial hydrate in edit mode) */
  useEffect(() => {
    if (skipTypeReset.current) {
      skipTypeReset.current = false;
      return;
    }
    setTab("core");
    setError("");
    setAiFlash(false);

    if (componentType === "Other") {
      setGeneratedFields(null);
      setResearchDone(false);
      setCustomTypeName("");
      setSpecs(emptyFromFields(OTHER_BASE));
      return;
    }

    const custom = customTypes.find((t) => t.type === componentType);
    if (custom?.customFields?.length) {
      setSpecs({ ...emptyFromFields(custom.customFields), ...custom.specs });
      if (custom.manufacturer) setManufacturer(custom.manufacturer);
      return;
    }

    const tpl = findTemplate(componentType, templates);
    if (tpl) {
      setSpecs({ ...emptySpecsFor(componentType), ...tpl.specs });
      if (tpl.manufacturer) setManufacturer(tpl.manufacturer);
    } else {
      setSpecs(emptySpecsFor(componentType));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentType]);

  const runAiAutoFill = () => {
    if (!aiEnabled) return;
    setAiBusy(true);
    setAiFlash(false);
    window.setTimeout(() => {
      const defaults = AI_DEFAULTS[componentType] ?? AI_DEFAULTS.Other;
      const nextSpecs = { ...emptySpecsFor(componentType), ...defaults.specs };
      const nextMfr = defaults.manufacturer || manufacturer;
      setSpecs(nextSpecs);
      if (nextMfr) setManufacturer(nextMfr);
      if (!name.trim()) setName(componentType);
      saveTypeTemplate({ type: componentType, manufacturer: nextMfr, specs: nextSpecs });
      setTemplates(loadTypeTemplates());
      setAiBusy(false);
      setAiFlash(true);
      setTab("core");
      window.setTimeout(() => setAiFlash(false), 2000);
    }, 650);
  };

  const runAiResearch = () => {
    const q = customTypeName.trim();
    if (!q) {
      setError("Enter a custom component type to research.");
      return;
    }
    setResearchBusy(true);
    setError("");
    window.setTimeout(() => {
      const { fields, defaults } = researchCustomType(q);
      setGeneratedFields(fields);
      setSpecs({ ...emptyFromFields(fields), ...defaults });
      setResearchDone(true);
      setResearchBusy(false);
      setAiFlash(true);
      setTab("core");
      if (!name.trim()) setName(q);
      window.setTimeout(() => setAiFlash(false), 2000);
    }, 900);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError("Name / Label is required.");
      return;
    }

    const resolvedType =
      isOther && customTypeName.trim() ? customTypeName.trim() : componentType;

    if (isOther && !customTypeName.trim()) {
      setError("Enter a custom component type name.");
      return;
    }

    if (isOther && !researchDone && !isEdit) {
      setError("Run Research & Generate Specs before saving.");
      return;
    }

    const fieldsToValidate =
      activeCustomFields ??
      (TABS_BY_TYPE[effectiveTypeKey] ?? TABS_BY_TYPE.Other).flatMap((t) =>
        fieldsFor(effectiveTypeKey, t.id, activeCustomFields)
      );

    for (const f of fieldsToValidate.filter((x) => x.required)) {
      if (!String(specs[f.key] ?? "").trim()) {
        setError(`${f.label} is required.`);
        setTab("core");
        return;
      }
    }

    if (isOther && saveAsTemplate && generatedFields) {
      saveCustomType({
        type: resolvedType,
        manufacturer: manufacturer.trim() || undefined,
        specs,
        customFields: generatedFields
      });
      setCustomTypes(loadCustomTypes());
      setTemplates(loadTypeTemplates());
    } else if (!isOther) {
      saveTypeTemplate({
        type: resolvedType,
        manufacturer: manufacturer.trim() || undefined,
        specs,
        customFields: activeCustomFields ?? undefined
      });
      setTemplates(loadTypeTemplates());
    }

    onSave({
      name: name.trim(),
      componentType: resolvedType,
      manufacturer: manufacturer.trim(),
      specs
    });
  };

  const activeFields = fieldsFor(effectiveTypeKey, tab, activeCustomFields);
  const sections = groupBySection(activeFields);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col mx-4 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-700/50 bg-slate-900">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {isEdit ? (
                <>
                  Edit <span className="text-amber-400">COMPONENT</span>
                </>
              ) : (
                <>
                  Create New <span className="text-amber-400">COMPONENT</span>
                </>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {isEdit
                ? "Update functional hierarchy attributes and vibration-critical specs."
                : "ISO 13373 vibration-critical attributes for predictive diagnostics."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700/60 cursor-pointer shrink-0 transition-all duration-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {error && (
            <p className="text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <FieldLabel label="Name / Label" required />
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                className={`${INPUT_BASE} pl-10 pr-3`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="e.g., Primary Induction Motor, Motor DE"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <FieldLabel label="Component Type" required />
                {!isOther && (
                  <button
                    type="button"
                    disabled={!aiEnabled}
                    onClick={runAiAutoFill}
                    title={
                      knownTemplate
                        ? "Template already saved — specs auto-fill on select"
                        : "Populate industry-standard vibration defaults"
                    }
                    className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                      aiEnabled
                        ? "bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-lg shadow-amber-500/40 ring-1 ring-amber-300/40"
                        : "bg-slate-800 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {aiBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className={`h-3 w-3 ${aiEnabled ? "animate-pulse" : ""}`} />
                    )}
                    {aiBusy ? "Searching…" : "Smart Auto-Fill"}
                  </button>
                )}
              </div>
              <div className="relative">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <select
                  className={`${INPUT_BASE} pl-10 pr-3 appearance-none cursor-pointer`}
                  value={componentType}
                  onChange={(e) => setComponentType(e.target.value)}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {knownTemplate && !isOther && (
                <p className="mt-1.5 text-[10px] text-emerald-400/90 font-medium">
                  Saved template loaded — specs filled instantly.
                </p>
              )}
              {aiFlash && (
                <p className="mt-1.5 text-[10px] text-amber-300 font-medium">
                  Specs updated successfully.
                </p>
              )}
            </div>

            <div>
              <FieldLabel label="Manufacturer" />
              <div className="relative">
                <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  className={`${INPUT_BASE} pl-10 pr-3`}
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g., Baldor, SKF, Falk, Flowserve"
                />
              </div>
            </div>
          </div>

          {/* Other workflow */}
          {isOther && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Custom Component Research
              </p>
              <div>
                <FieldLabel label="Enter Custom Component Type" required />
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400/70 pointer-events-none" />
                    <input
                      className={`${INPUT_BASE} pl-10 pr-3`}
                      value={customTypeName}
                      onChange={(e) => {
                        setCustomTypeName(e.target.value);
                        setResearchDone(false);
                        setError("");
                      }}
                      placeholder="e.g., Centrifugal Chiller, Rotary Kiln"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={researchBusy || !customTypeName.trim()}
                    onClick={runAiResearch}
                    className="min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {researchBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {researchBusy ? "Researching…" : "Research & Generate Specs"}
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs text-slate-300 leading-snug">
                  Save{" "}
                  <span className="text-amber-300 font-semibold">
                    “{customTypeName.trim() || "Custom Type"}”
                  </span>{" "}
                  as a standard template for future users
                </span>
              </label>
              {researchDone && (
                <p className="text-[10px] text-emerald-400 font-medium">
                  Generated {generatedFields?.length ?? 0} vibration-relevant fields for Core Specs.
                </p>
              )}
            </div>
          )}

          {/* Machine Specifications */}
          <section
            className={`rounded-xl border border-slate-700/50 bg-slate-950/40 overflow-hidden transition-all duration-200 ${
              aiFlash ? "ring-1 ring-amber-400/40 shadow-lg shadow-amber-500/10" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-700/50">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
                Machine Specifications
              </h3>
              <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-emerald-400">
                ISO 13373 / 14224
              </span>
            </div>

            {/* Pill tabs */}
            <div className="flex flex-wrap gap-2 p-3 border-b border-slate-700/40 bg-slate-900/30">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[34px] px-3.5 rounded-full text-xs font-bold cursor-pointer transition-all duration-200 ${
                    tab === t.id
                      ? "bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20"
                      : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-5">
              {isOther && !researchDone && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center">
                  <Sparkles className="h-6 w-6 text-amber-400/60 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-300">Awaiting specification research</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Enter a custom type above and run Research to generate vibration-critical Core Specs fields.
                  </p>
                </div>
              )}

              {(!(isOther && !researchDone) || (isOther && researchDone)) &&
                sections.map(({ section, fields }) => (
                  <div key={section} className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 border-b border-slate-800 pb-1.5">
                      {section}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {fields.map((field) => (
                        // The key sits on the Fragment because @types/react is
                        // not installed, so the JSX namespace that normally
                        // permits `key` on a locally typed component is absent.
                        <React.Fragment key={field.key}>
                          <SpecField
                            field={field}
                            value={specs[field.key] ?? ""}
                            onChange={(v) => {
                              patch(field.key, v);
                              setError("");
                            }}
                          />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>

        {/* Footer — sticky buttons */}
        <div className="sticky bottom-0 shrink-0 bg-slate-900 border-t border-slate-800 p-4 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold cursor-pointer transition-all duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[42px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold cursor-pointer transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
