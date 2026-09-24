import React, { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import {
  ArrowLeft, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, Droplets, Eye,
  FileText, ImageOff, Info, Layers, Loader2, Maximize2, Minus, Plus, Printer, RefreshCw,
  RotateCcw, Ruler, Search, ShieldCheck, Target, Wrench, X, Zap
} from "lucide-react";
import { useToast } from "./Toast";

// Types for Reference Guides and Scanner
export interface ReferencePoint {
  id: string;
  number: number;
  name: string;
  direction: "Radial Horizontal" | "Radial Vertical" | "Axial";
  quality: "Ideal" | "Acceptable" | "Avoid";
  x: number; // percentage 0-100 for SVG overlay
  y: number; // percentage 0-100 for SVG overlay
  whyChosen: string;
  diagnosticFocus: string;
  surfaceTip: string;
}

export interface ReferenceGuide {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  isoStandard: string;
  recommendedMounting: string;
  svgType: "motor_h" | "motor_v" | "pump" | "gearbox" | "fan" | "compressor";
  points: ReferencePoint[];
  generalAdvice: string;
  surfaceFinish: string;
}

const AVOID_ZONE_WARNING =
  "⛔ AVOID ZONE: Resonance Noise Risk. Surface thickness < 3mm. Accelerometer signals will suffer high-frequency distortion. Move to rigid bearing housing.";

type MountTechnique = "stud" | "magnet" | "epoxy" | "handheld";

interface AiAssetInfo {
  equipmentType: string;
  identifiedBearings: string;
  surfaceMaterial: string;
}

type GalleryCategoryId = "all" | "pumps" | "motors" | "gearboxes" | "fans";

const GALLERY_FILTERS: { id: GalleryCategoryId; label: string; matchCategory: string | null }[] = [
  { id: "all", label: "All", matchCategory: null },
  { id: "pumps", label: "Pumps", matchCategory: "Fluid Machinery" },
  { id: "motors", label: "Electric Motors", matchCategory: "Electric Drives" },
  { id: "gearboxes", label: "Gearboxes", matchCategory: "Power Transmission" },
  { id: "fans", label: "Fans / Blowers", matchCategory: "Air Handling" }
];

const PRESET_AI_INFO: Record<string, AiAssetInfo> = {
  "preset-pump": {
    equipmentType: "Overhung Centrifugal Pump (Class II, 15-75kW)",
    identifiedBearings: "Drive End (DE) Ball Bearing & Non-Drive End (NDE) Roller Bearing",
    surfaceMaterial: "Cast Iron Housing with Industrial Enamel Finish"
  },
  "preset-motor": {
    equipmentType: "Horizontal 3-Phase Induction Motor (Class II, 37-75kW)",
    identifiedBearings: "Drive End (DE) Deep-Groove Ball Bearing & NDE Roller Bearing",
    surfaceMaterial: "Cast Iron End-Bell with Industrial Enamel Finish"
  },
  "preset-gearbox": {
    equipmentType: "Helical Speed Reducer (Class III, Rigid Foundation)",
    identifiedBearings: "High-Speed Input Roller Bearing & Low-Speed Output Spherical Roller",
    surfaceMaterial: "Cast Iron Split Casing with Machined Bearing Caps"
  },
  "preset-fan": {
    equipmentType: "Overhung Industrial Blower (Class II, Pedestal Mount)",
    identifiedBearings: "Drive End Pillow-Block Ball Bearing & NDE Pedestal Roller",
    surfaceMaterial: "Fabricated Steel Pedestal with Painted Fan Scroll"
  }
};

function inferAiAssetInfo(fileName: string): AiAssetInfo {
  const n = fileName.toLowerCase();
  if (n.includes("motor") || n.includes("mtr")) return PRESET_AI_INFO["preset-motor"];
  if (n.includes("gear") || n.includes("gb")) return PRESET_AI_INFO["preset-gearbox"];
  if (n.includes("fan") || n.includes("blow")) return PRESET_AI_INFO["preset-fan"];
  return PRESET_AI_INFO["preset-pump"];
}

const MOUNT_TECHNIQUES: {
  id: MountTechnique;
  icon: string;
  label: string;
  integrity: string;
  maxFreq: string;
  iso: string;
  tone: string;
}[] = [
  {
    id: "stud",
    icon: "🔩",
    label: "Threaded Stud Mount",
    integrity: "99%",
    maxFreq: "10,000 Hz",
    iso: "Preferred",
    tone: "text-emerald-400"
  },
  {
    id: "magnet",
    icon: "🧲",
    label: "2-Pole Magnet Base",
    integrity: "88%",
    maxFreq: "3,000 Hz (-11% HF Dampening)",
    iso: "Acceptable for Routine Walk",
    tone: "text-amber-400"
  },
  {
    id: "epoxy",
    icon: "🧪",
    label: "Epoxy/Adhesive Pad",
    integrity: "94%",
    maxFreq: "8,000 Hz",
    iso: "Acceptable Permanent Alternate",
    tone: "text-yellow-400"
  },
  {
    id: "handheld",
    icon: "🖐️",
    label: "Handheld Probe",
    integrity: "62%",
    maxFreq: "1,000 Hz (-37% High Frequency Dampening)",
    iso: "Not Recommended for Baseline",
    tone: "text-red-400"
  }
];

// Mock presets for "Scan Your Equipment"
const SCAN_PRESETS = [
  {
    id: "preset-pump",
    name: "Centrifugal Pump P-101",
    category: "Fluid Machinery",
    imgUrl: "/images/pump.jpg",
    optimalPoint: {
      x: 41,
      y: 43,
      boxWidth: 14,
      boxHeight: 18,
      label: "Optimal Sensor Mounting Point",
      locationName: "Pump Inboard Bearing (DE) - Radial Horizontal",
      quality: "Ideal" as const,
      reason: "Direct path to primary impeller hydraulic load zone & shaft radial forces."
    },
    secondaryPoints: [
      { x: 70, y: 40, label: "Motor Inboard Bearing", quality: "Ideal" as const, locationName: "Motor Drive End (DE) - Radial Vertical" },
      { x: 24, y: 41, label: "Pump Volute Axial", quality: "Acceptable" as const, locationName: "Pump Outboard (NDE) - Axial" },
      {
        x: 52,
        y: 34,
        label: "Thin Motor Cowling / Fan Cover",
        quality: "Avoid" as const,
        locationName: "Thin Motor Cowling / Fan Cover",
        reason: AVOID_ZONE_WARNING
      }
    ]
  },
  {
    id: "preset-motor",
    name: "3-Phase Induction Motor M-204",
    category: "Electric Drives",
    imgUrl: "/images/motor.jpg",
    optimalPoint: {
      x: 66,
      y: 36,
      boxWidth: 14,
      boxHeight: 18,
      label: "Optimal Sensor Mounting Point",
      locationName: "Drive End (DE) Bearing Housing - Horizontal Axis",
      quality: "Ideal" as const,
      reason: "Primary load line of rotor mass & alignment strain; optimal for 1X/2X unbalance detection."
    },
    secondaryPoints: [
      { x: 24, y: 58, label: "Non-Drive End (NDE)", quality: "Acceptable" as const, locationName: "Fan Housing NDE Bearing - Vertical" },
      {
        x: 48,
        y: 32,
        label: "Thin Motor Cowling / Fan Cover",
        quality: "Avoid" as const,
        locationName: "Thin Motor Cowling / Fan Cover",
        reason: AVOID_ZONE_WARNING
      }
    ]
  },
  {
    id: "preset-gearbox",
    name: "Helical Gear Reducer GB-302",
    category: "Power Transmission",
    imgUrl: "/images/gearbox.jpg",
    optimalPoint: {
      x: 41,
      y: 63,
      boxWidth: 26,
      boxHeight: 28,
      label: "Optimal Sensor Mounting Point",
      locationName: "High-Speed Input Shaft Bearing Housing - Axial Vector",
      quality: "Ideal" as const,
      reason: "Captures helical gear mesh frequencies (GMF) and axial thrust loads."
    },
    secondaryPoints: [
      { x: 67, y: 40, label: "Low-Speed Output Shaft", quality: "Ideal" as const, locationName: "Output Shaft Housing - Radial Horizontal" },
      {
        x: 18,
        y: 22,
        label: "Thin Inspection Cover",
        quality: "Avoid" as const,
        locationName: "Thin Inspection Cover / Sheet Metal Guard",
        reason: AVOID_ZONE_WARNING
      }
    ]
  },
  {
    id: "preset-fan",
    name: "Industrial Blower Fan F-501",
    category: "Air Handling",
    imgUrl: "/images/large_machine.png",
    optimalPoint: {
      x: 54,
      y: 56,
      boxWidth: 16,
      boxHeight: 18,
      label: "Optimal Sensor Mounting Point",
      locationName: "Fan Pedestal Main Bearing (DE) - Radial Horizontal",
      quality: "Ideal" as const,
      reason: "Highest sensitivity plane for overhung aerodynamic unbalance and blade pass forces."
    },
    secondaryPoints: [
      { x: 35, y: 55, label: "Pedestal NDE Bearing", quality: "Acceptable" as const, locationName: "Non-Drive End - Radial Vertical" },
      {
        x: 72,
        y: 28,
        label: "Sheet Metal Duct / Cowling",
        quality: "Avoid" as const,
        locationName: "Thin Fan Cowling / Duct Skin",
        reason: AVOID_ZONE_WARNING
      }
    ]
  }
];

// Mock Reference Guides Data for Tab 2
const REFERENCE_GUIDES: ReferenceGuide[] = [
  {
    id: "ref-motor-h",
    title: "Electric Motor (Horizontal)",
    subtitle: "Standard 3-Phase AC / DC Induction Motors",
    category: "Electric Drives",
    isoStandard: "ISO 10816-3 Class I/II/III",
    recommendedMounting: "1/4-28 Tapped Stud Mount or Structural Epoxy Pad",
    svgType: "motor_h",
    surfaceFinish: "Spot-face flat land to 32 µin finish, 1.25\" diameter minimum",
    generalAdvice: "Mount accelerometer directly on solid bearing end-bells. Avoid mounting on sheet metal fan covers, junction boxes, or cooling fins which act as mechanical amplifiers.",
    points: [
      {
        id: "m-de-h",
        number: 1,
        name: "Drive End (DE) - Radial Horizontal",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 35,
        y: 50,
        whyChosen: "Primary load zone for rotor mass unbalance and horizontal shaft forces. Highly responsive to dynamic coupling misalignments.",
        diagnosticFocus: "Rotor unbalance (1X), misalignment (2X), structural looseness.",
        surfaceTip: "Locate on the thickest casting shoulder near shaft exit."
      },
      {
        id: "m-de-v",
        number: 2,
        name: "Drive End (DE) - Radial Vertical",
        direction: "Radial Vertical",
        quality: "Ideal",
        x: 35,
        y: 28,
        whyChosen: "Confirms rotor unbalance in orthogonal plane and reveals soft foot / base resonance stiffness differentials.",
        diagnosticFocus: "Soft foot, foundation stiffness, 2X electrical hum, bearing race defects.",
        surfaceTip: "Clean top vertical surface on bearing cap, flat land required."
      },
      {
        id: "m-de-a",
        number: 3,
        name: "Drive End (DE) - Axial Axis",
        direction: "Axial",
        quality: "Ideal",
        x: 22,
        y: 50,
        whyChosen: "Essential for detecting angular misalignment across the coupling and internal rotor axial float.",
        diagnosticFocus: "Angular coupling misalignment, bent shaft, axial thrust loads.",
        surfaceTip: "Mount on solid face parallel to shaft axis."
      },
      {
        id: "m-nde-v",
        number: 4,
        name: "Non-Drive End (NDE) - Radial Vertical",
        direction: "Radial Vertical",
        quality: "Acceptable",
        x: 75,
        y: 28,
        whyChosen: "Monitors non-drive end bearing state and internal cooling fan imbalance.",
        diagnosticFocus: "NDE bearing spalling, fan blade unbalance, rotor cocking.",
        surfaceTip: "Ensure mount reaches inner bearing housing, not outer shroud."
      }
    ]
  },
  {
    id: "ref-motor-v",
    title: "Electric Motor (Vertical)",
    subtitle: "Vertical Pump Drivers & Agitator Motors",
    category: "Electric Drives",
    isoStandard: "ISO 10816-3 Class II/IV",
    recommendedMounting: "Direct Tapped Stud or Heavy-Duty Magnetic Base (for temporary testing)",
    svgType: "motor_v",
    surfaceFinish: "Flat land machined surface on upper and lower bearing flanges",
    generalAdvice: "Vertical motors are sensitive to top-heavy reed frequency resonance. Always measure orthogonal radial directions (X and Y) at the top bearing.",
    points: [
      {
        id: "mv-top-x",
        number: 1,
        name: "Upper Thrust Bearing - Radial X-Axis",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 50,
        y: 22,
        whyChosen: "Highest deflection point on vertical motor structure. Captures top bearing load and structural reed resonance.",
        diagnosticFocus: "Top-heavy reed resonance, upper thrust bearing impact, unbalance.",
        surfaceTip: "Mount at 90° relative to discharge piping line."
      },
      {
        id: "mv-top-y",
        number: 2,
        name: "Upper Thrust Bearing - Radial Y-Axis",
        direction: "Radial Vertical",
        quality: "Ideal",
        x: 70,
        y: 22,
        whyChosen: "Orthogonal pair to X-axis; completes orbit analysis to differentiate structural resonance from pure unbalance.",
        diagnosticFocus: "Resonant directional stiffness, unbalance orbits.",
        surfaceTip: "In line with main support frame orientation."
      },
      {
        id: "mv-lower-r",
        number: 3,
        name: "Lower Guide Bearing - Radial",
        direction: "Radial Horizontal",
        quality: "Acceptable",
        x: 50,
        y: 72,
        whyChosen: "Monitors lower guide bearing near the flange mounting surface to detect lower sleeve/ball wear.",
        diagnosticFocus: "Lower sleeve bearing clearance, seal rubbing, flange looseness.",
        surfaceTip: "Place directly on lower flange housing ring."
      }
    ]
  },
  {
    id: "ref-pump",
    title: "Centrifugal Pump",
    subtitle: "Single/Multistage Horizontal Process Pumps",
    category: "Fluid Machinery",
    isoStandard: "ISO 10816-7 / Hydraulic Institute",
    recommendedMounting: "Spot-Faced Stud Mount or Epoxy Disc",
    svgType: "pump",
    surfaceFinish: "32 µin smoothness, ground flat land direct to bearing frame",
    generalAdvice: "Vibration on pumps is strongly influenced by hydraulic operating point (BEP). Mount sensors close to bearing races to distinguish hydraulic turbulence from mechanical defects.",
    points: [
      {
        id: "p-inboard-h",
        number: 1,
        name: "Inboard Bearing (DE) - Radial Horizontal",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 42,
        y: 52,
        whyChosen: "Primary response point for coupling misalignment strain and radial impeller hydraulic forces.",
        diagnosticFocus: "Coupling misalignment, 1X unbalance, shaft deflection.",
        surfaceTip: "Mount on bearing housing frame directly inline with shaft center."
      },
      {
        id: "p-outboard-v",
        number: 2,
        name: "Outboard Bearing (NDE) - Radial Vertical",
        direction: "Radial Vertical",
        quality: "Ideal",
        x: 72,
        y: 38,
        whyChosen: "Detects thrust bearing impacts, impeller unbalance, and high-frequency roller bearing degradation.",
        diagnosticFocus: "Impeller unbalance, bearing fault frequencies (BPFO/BPFI), cavitation.",
        surfaceTip: "Locate on top center of outboard bearing housing."
      },
      {
        id: "p-axial",
        number: 3,
        name: "Thrust Bearing - Axial Direction",
        direction: "Axial",
        quality: "Ideal",
        x: 82,
        y: 52,
        whyChosen: "Crucial for capturing hydraulic thrust load imbalances, bent pump shafts, and axial shuttle motion.",
        diagnosticFocus: "Axial thrust load, impeller vane pass frequency (VPF), bent shaft.",
        surfaceTip: "Mount on end cover face parallel to pump shaft."
      },
      {
        id: "p-volute",
        number: 4,
        name: "Thin Motor Cowling / Fan Cover",
        direction: "Radial Vertical",
        quality: "Avoid",
        x: 55,
        y: 18,
        whyChosen: AVOID_ZONE_WARNING,
        diagnosticFocus: "Do not use for baseline or high-frequency bearing detection. Signal path is a resonating skin.",
        surfaceTip: "Move the accelerometer to the rigid inboard bearing housing."
      }
    ]
  },
  {
    id: "ref-gearbox",
    title: "Gearbox / Speed Reducer",
    subtitle: "Helical, Planetary & Bevel Gear Reducers",
    category: "Power Transmission",
    isoStandard: "ISO 10816-3 / AGMA 6000",
    recommendedMounting: "Direct Tapped Stud Mount Only (High Frequency Range)",
    svgType: "gearbox",
    surfaceFinish: "Spot-faced flat land 1/4-28 UNF thread depth 3/8\"",
    generalAdvice: "Gear mesh frequencies (GMF) generate high frequencies (>2 kHz). Avoid magnetic mounts or long probe extensions which act as low-pass filters.",
    points: [
      {
        id: "gb-hs-a",
        number: 1,
        name: "High-Speed Input Shaft - Axial",
        direction: "Axial",
        quality: "Ideal",
        x: 25,
        y: 45,
        whyChosen: "Helical gear tooth angles generate primary forces in the axial vector. Essential for high-speed gear mesh health.",
        diagnosticFocus: "Gear mesh frequency (GMF), tooth pitting, axial thrust wear.",
        surfaceTip: "Rigid end-cover housing plate."
      },
      {
        id: "gb-hs-r",
        number: 2,
        name: "High-Speed Input Shaft - Radial",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 35,
        y: 65,
        whyChosen: "Captures high-speed pinion unbalance and input shaft bearing defect frequencies.",
        diagnosticFocus: "High-speed bearing faults, input pinion unbalance.",
        surfaceTip: "Solid wall of upper gear casing."
      },
      {
        id: "gb-ls-r",
        number: 3,
        name: "Low-Speed Output Shaft - Radial",
        direction: "Radial Vertical",
        quality: "Ideal",
        x: 75,
        y: 35,
        whyChosen: "Monitors heavy output torque forces, low-speed shaft unbalance, and output bearing condition.",
        diagnosticFocus: "Low-speed shaft unbalance, broken gear teeth, output bearing impact.",
        surfaceTip: "Thick web casing wall over output bearing."
      }
    ]
  },
  {
    id: "ref-fan",
    title: "Industrial Fan / Blower",
    subtitle: "Overhung & Between-Bearings Exhaust Fans",
    category: "Air Handling",
    isoStandard: "ISO 10816-3 / AMCA 204",
    recommendedMounting: "Stud Mount or Solid Epoxy Disk",
    svgType: "fan",
    surfaceFinish: "Smooth bare metal flat land on pillow block housing",
    generalAdvice: "Large fans suffer from aerodynamic turbulence and dust accumulation on blades. Mount sensors directly on pillow block bearing housings, never on sheet metal ductwork.",
    points: [
      {
        id: "f-fan-h",
        number: 1,
        name: "Wheel Bearing (DE) - Radial Horizontal",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 45,
        y: 54,
        whyChosen: "Highest sensitivity plane for overhung blade unbalance and aerodynamic eccentricity forces.",
        diagnosticFocus: "Fan blade unbalance (1X), dirt buildup on impeller, aerodynamic stall.",
        surfaceTip: "Directly on pillow block casting side wall."
      },
      {
        id: "f-fan-a",
        number: 2,
        name: "Wheel Bearing (DE) - Axial Axis",
        direction: "Axial",
        quality: "Ideal",
        x: 36,
        y: 54,
        whyChosen: "Overhung fan wheels create high dynamic overturning axial moments when unbalanced or cocked.",
        diagnosticFocus: "Overturning moment, angular misalignment, bent fan shaft.",
        surfaceTip: "End wall of pillow block bearing housing."
      },
      {
        id: "f-drive-v",
        number: 3,
        name: "Drive Bearing (NDE) - Radial Vertical",
        direction: "Radial Vertical",
        quality: "Acceptable",
        x: 72,
        y: 36,
        whyChosen: "Monitors belt tension strain or coupling forces on the non-drive end bearing.",
        diagnosticFocus: "Sheave misalignment, over-tightened belt tension, NDE bearing wear.",
        surfaceTip: "Top center of rear pillow block."
      }
    ]
  },
  {
    id: "ref-compressor",
    title: "Air Compressor",
    subtitle: "Rotary Screw & Reciprocating Air Compressors",
    category: "Compressors",
    isoStandard: "ISO 10816-3 / CAGI Standards",
    recommendedMounting: "Spot-Faced Stud Mount",
    svgType: "compressor",
    surfaceFinish: "Machined flat land directly on rotor housing casting",
    generalAdvice: "Rotary screw compressors operate with high male/female lobe meshing frequencies. High-frequency accelerometers (10 kHz+) are recommended.",
    points: [
      {
        id: "c-discharge-a",
        number: 1,
        name: "Male Rotor Discharge - Axial",
        direction: "Axial",
        quality: "Ideal",
        x: 65,
        y: 48,
        whyChosen: "High pressure discharge end bears severe axial gas thrust loads and lobe meshing pulses.",
        diagnosticFocus: "Rotor lobe meshing frequency (RMF), thrust bearing wear, gas pulsation.",
        surfaceTip: "Mount on discharge bearing housing cover."
      },
      {
        id: "c-suction-r",
        number: 2,
        name: "Suction End Bearing - Radial Horizontal",
        direction: "Radial Horizontal",
        quality: "Ideal",
        x: 32,
        y: 54,
        whyChosen: "Monitors inlet rotor stability, drive coupling alignment, and suction bearing health.",
        diagnosticFocus: "Drive coupling misalignment, inlet bearing wear, rotor unbalance.",
        surfaceTip: "Solid cast iron wall at suction cover."
      },
      {
        id: "c-housing-v",
        number: 3,
        name: "Rotor Casing - Radial Vertical",
        direction: "Radial Vertical",
        quality: "Acceptable",
        x: 48,
        y: 30,
        whyChosen: "Captures rotor-to-stator casing clearance rubbing and harmonic casing resonance.",
        diagnosticFocus: "Rotor contact/rubbing, liquid slugging impacts.",
        surfaceTip: "Heavy rib on main compressor barrel."
      }
    ]
  }
];

/** Every card on this page shares one surface treatment so the layout reads as a single tool. */
const CARD = "bg-slate-800/50 border border-slate-700 rounded-2xl";

const CATEGORY_FILTERS = [
  "All",
  "Electric Drives",
  "Fluid Machinery",
  "Power Transmission",
  "Air Handling",
  "Compressors"
];

interface MountingStep {
  id: number;
  title: string;
  summary: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  specs: { label: string; value: string }[];
}

const MOUNTING_STEPS: MountingStep[] = [
  {
    id: 1,
    title: "Surface Cleaning & Degreasing",
    summary: "Bare metal, citrus solvent applied",
    icon: Droplets,
    description:
      "Scrape off paint, rust, and oil using citrus degreaser. Surface must be bare metal.",
    specs: [
      { label: "Finish", value: "Bare metal" },
      { label: "Solvent", value: "Citrus degreaser" }
    ]
  },
  {
    id: 2,
    title: "Surface Flatness & Spot-Facing",
    summary: "1.25\" land, 32 µin finish verified",
    icon: Ruler,
    description:
      "Prepare a 1.25\" diameter flat land with smooth 32 µin finish using a spot-facing tool.",
    specs: [
      { label: "Land diameter", value: "1.25 in min" },
      { label: "Roughness", value: "32 µin" }
    ]
  },
  {
    id: 3,
    title: "Attachment Method & Torque",
    summary: "1/4-28 UNF thread, 2-3 ft-lbs torque applied",
    icon: Wrench,
    description:
      "Drill & tap 1/4-28 UNF thread, then torque the stud-mount sensor to specification. Two-part epoxy is acceptable where drilling is not permitted.",
    specs: [
      { label: "Thread", value: "1/4-28 UNF" },
      { label: "Torque", value: "2-3 ft-lbs" }
    ]
  }
];

const FACILITY_NAME = "Faustina Facility";
const TECHNICIAN_SIGNOFF = "M. Delgado (Verified)";

interface IsoAlarmRow {
  zone: "A" | "B" | "C" | "D";
  label: string;
  limit: string;
  action: string;
}

interface IsoAlarmTable {
  className: string;
  standard: string;
  rows: IsoAlarmRow[];
}

const ISO_ALARM_BY_CATEGORY: Record<string, IsoAlarmTable> = {
  "Fluid Machinery": {
    className: "Class II — Centrifugal Pumps (rigid foundation)",
    standard: "ISO 10816-7 / ISO 20816-3",
    rows: [
      { zone: "A", label: "Newly commissioned", limit: "≤ 2.3 mm/s RMS", action: "Accept — establish baseline" },
      { zone: "B", label: "Unrestricted operation", limit: "2.3 – 4.5 mm/s RMS", action: "Trend on route interval" },
      { zone: "C", label: "Limited operation", limit: "4.5 – 7.1 mm/s RMS", action: "Investigate within 14 days" },
      { zone: "D", label: "Damage likely", limit: "> 7.1 mm/s RMS", action: "Restrict / planned shutdown" }
    ]
  },
  "Electric Drives": {
    className: "Class II — Medium motors 15–300 kW (rigid)",
    standard: "ISO 10816-3 / ISO 20816-3",
    rows: [
      { zone: "A", label: "Newly commissioned", limit: "≤ 2.3 mm/s RMS", action: "Accept — establish baseline" },
      { zone: "B", label: "Unrestricted operation", limit: "2.3 – 4.5 mm/s RMS", action: "Continue routine CBM" },
      { zone: "C", label: "Limited operation", limit: "4.5 – 7.1 mm/s RMS", action: "Schedule alignment / balance check" },
      { zone: "D", label: "Damage likely", limit: "> 7.1 mm/s RMS", action: "Remove from service" }
    ]
  },
  "Power Transmission": {
    className: "Class III — Large gear reducers (rigid)",
    standard: "ISO 10816-3 / AGMA 6000",
    rows: [
      { zone: "A", label: "Newly commissioned", limit: "≤ 2.8 mm/s RMS", action: "Accept — mesh baseline" },
      { zone: "B", label: "Unrestricted operation", limit: "2.8 – 7.1 mm/s RMS", action: "Trend GMF sidebands" },
      { zone: "C", label: "Limited operation", limit: "7.1 – 11.2 mm/s RMS", action: "Oil analysis + inspection" },
      { zone: "D", label: "Damage likely", limit: "> 11.2 mm/s RMS", action: "Restrict load / overhaul" }
    ]
  },
  "Air Handling": {
    className: "Class II — Fans & blowers (rigid pedestal)",
    standard: "ISO 10816-3 / AMCA 204",
    rows: [
      { zone: "A", label: "Newly commissioned", limit: "≤ 2.8 mm/s RMS", action: "Accept — establish baseline" },
      { zone: "B", label: "Unrestricted operation", limit: "2.8 – 7.1 mm/s RMS", action: "Trend blade-pass energy" },
      { zone: "C", label: "Limited operation", limit: "7.1 – 11.2 mm/s RMS", action: "Balance / belt inspection" },
      { zone: "D", label: "Damage likely", limit: "> 11.2 mm/s RMS", action: "Restrict / shutdown" }
    ]
  },
  Compressors: {
    className: "Class III — Process compressors (rigid)",
    standard: "ISO 10816-3 / CAGI",
    rows: [
      { zone: "A", label: "Newly commissioned", limit: "≤ 2.8 mm/s RMS", action: "Accept — establish baseline" },
      { zone: "B", label: "Unrestricted operation", limit: "2.8 – 7.1 mm/s RMS", action: "Continue route trending" },
      { zone: "C", label: "Limited operation", limit: "7.1 – 11.2 mm/s RMS", action: "Investigate rotor / bearings" },
      { zone: "D", label: "Damage likely", limit: "> 11.2 mm/s RMS", action: "Restrict / shutdown" }
    ]
  }
};

const DEFAULT_ISO_ALARM: IsoAlarmTable = ISO_ALARM_BY_CATEGORY["Electric Drives"];

function getAssetTag(name: string): string {
  const match = name.match(/\b([A-Z]{1,3}-\d{2,4})\b/);
  return match?.[1] ?? name;
}

/** Optimal and secondary markers flattened into one numbered list for the overlay and selector. */
interface PlannerPoint {
  x: number;
  y: number;
  label: string;
  locationName: string;
  quality: "Ideal" | "Acceptable" | "Avoid";
  reason: string | null;
  primary: boolean;
}

export default function MountingPlanner() {
  const { toast } = useToast();

  // ===== Planner state =====
  const [selectedPresetId, setSelectedPresetId] = useState<string>("preset-pump");
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customImageName, setCustomImageName] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(0);
  const [openSteps, setOpenSteps] = useState<number[]>([MOUNTING_STEPS[0].id, 3]);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [isSopModalOpen, setIsSopModalOpen] = useState(false);
  const [isSurfaceInspectorOpen, setIsSurfaceInspectorOpen] = useState(false);
  const [sopIssuedAt, setSopIssuedAt] = useState("");
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [photoState, setPhotoState] = useState<"loading" | "ready" | "error">("loading");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [mountTechnique, setMountTechnique] = useState<MountTechnique>("stud");
  const [isArModeOpen, setIsArModeOpen] = useState(false);
  const [arTargetLocked, setArTargetLocked] = useState(false);
  const [isAiIdentifying, setIsAiIdentifying] = useState(false);
  const [aiIdentifyStage, setAiIdentifyStage] = useState("Analyzing Machine Geometry...");
  const [aiAssetInfo, setAiAssetInfo] = useState<AiAssetInfo>(PRESET_AI_INFO["preset-pump"]);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryCategory, setGalleryCategory] = useState<GalleryCategoryId>("all");
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const aiTimeoutsRef = useRef<number[]>([]);

  // ===== Reference library state =====
  const [libraryOpen, setLibraryOpen] = useState<boolean>(false);
  const [modalGuide, setModalGuide] = useState<ReferenceGuide | null>(null);
  const [selectedGuidePoint, setSelectedGuidePoint] = useState<ReferencePoint | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Scan Preset Data
  const activePreset = SCAN_PRESETS.find(p => p.id === selectedPresetId) || SCAN_PRESETS[0];
  const activePhoto = customImage || activePreset.imgUrl;

  // Pin 1 is always the optimal point; secondary points continue the numbering.
  const measurementPoints: PlannerPoint[] = [
    {
      x: activePreset.optimalPoint.x,
      y: activePreset.optimalPoint.y,
      label: activePreset.optimalPoint.label,
      locationName: activePreset.optimalPoint.locationName,
      quality: activePreset.optimalPoint.quality,
      reason: activePreset.optimalPoint.reason,
      primary: true
    },
    ...activePreset.secondaryPoints.map(pt => ({
      x: pt.x,
      y: pt.y,
      label: pt.label,
      locationName: pt.locationName,
      quality: pt.quality,
      reason: "reason" in pt ? pt.reason ?? null : null,
      primary: false
    }))
  ];

  const activePointIndex = Math.min(selectedPointIndex, measurementPoints.length - 1);
  const activePoint = measurementPoints[activePointIndex];
  const allStepsVerified = MOUNTING_STEPS.every((step) => checkedSteps.includes(step.id));
  const assetTag = getAssetTag(activePreset.name);
  const isoAlarmTable = ISO_ALARM_BY_CATEGORY[activePreset.category] ?? DEFAULT_ISO_ALARM;
  const filteredGalleryPresets = SCAN_PRESETS.filter((preset) => {
    const filter = GALLERY_FILTERS.find((f) => f.id === galleryCategory);
    const matchesCategory = !filter?.matchCategory || preset.category === filter.matchCategory;
    const q = gallerySearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      preset.name.toLowerCase().includes(q) ||
      preset.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  // Remote preset photos need a load indicator; reset it whenever the source changes.
  useEffect(() => {
    setPhotoState("loading");
  }, [activePhoto]);

  const clearAiTimeouts = () => {
    aiTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    aiTimeoutsRef.current = [];
  };

  const runAiAssetIdentification = (fileName: string) => {
    clearAiTimeouts();
    setIsAiIdentifying(true);
    setAiIdentifyStage("Analyzing Machine Geometry...");
    const stageTimer = window.setTimeout(() => {
      setAiIdentifyStage("Classifying Shaft & Bearing Locations...");
    }, 900);
    const doneTimer = window.setTimeout(() => {
      setAiAssetInfo(inferAiAssetInfo(fileName));
      setIsAiIdentifying(false);
      triggerScanningAnimation();
      toast("AI successfully generated 3 ISO 20816 mounting coordinates for uploaded asset", "success");
    }, 2000);
    aiTimeoutsRef.current = [stageTimer, doneTimer];
  };

  // File Upload Handlers
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("Upload an image file (PNG, JPG, or WEBP).", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCustomImage(e.target?.result as string);
      setCustomImageName(file.name);
      setMapZoom(1);
      setMapPan({ x: 0, y: 0 });
      setCheckedSteps([]);
      runAiAssetIdentification(file.name);
    };
    reader.readAsDataURL(file);
  };

  const triggerScanningAnimation = () => {
    setIsScanning(true);
    setSelectedPointIndex(0);
    setTimeout(() => {
      setIsScanning(false);
    }, 1200);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setCustomImage(null);
    setCustomImageName("");
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
    setCheckedSteps([]);
    setAiAssetInfo(PRESET_AI_INFO[presetId] ?? PRESET_AI_INFO["preset-pump"]);
    triggerScanningAnimation();
  };

  const handleZoomIn = () => setMapZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => {
    setMapZoom((z) => {
      const next = Math.max(1, Number((z - 0.25).toFixed(2)));
      if (next === 1) setMapPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetView = () => {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  };

  const handleReanalyzeScan = () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    window.setTimeout(() => {
      setIsReanalyzing(false);
      toast("AI Computer Vision re-evaluated 4 surface zones", "success");
    }, 1500);
  };

  const handleMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mapZoom <= 1 || e.button !== 0) return;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: mapPan.x,
      panY: mapPan.y
    };
    setIsPanning(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handleMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current) return;
    setMapPan({
      x: panDragRef.current.panX + (e.clientX - panDragRef.current.startX),
      y: panDragRef.current.panY + (e.clientY - panDragRef.current.startY)
    });
  };

  const handleMapPointerUp = () => {
    panDragRef.current = null;
    setIsPanning(false);
  };

  const handleResetToPreset = () => {
    setCustomImage(null);
    setCustomImageName("");
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
    setAiAssetInfo(PRESET_AI_INFO[selectedPresetId] ?? PRESET_AI_INFO["preset-pump"]);
    triggerScanningAnimation();
  };

  const openArMode = () => {
    setArTargetLocked(false);
    setIsArModeOpen(true);
  };

  const closeArMode = () => {
    setIsArModeOpen(false);
    setArTargetLocked(false);
  };

  const handleArSnapLock = () => {
    setArTargetLocked(true);
    toast("AR target locked — mounting coordinate captured.", "success");
  };

  const toggleStep = (id: number) => {
    setOpenSteps(prev => (prev.includes(id) ? prev.filter(step => step !== id) : [...prev, id]));
  };

  const toggleCheckedStep = (id: number) => {
    setCheckedSteps((prev) =>
      prev.includes(id) ? prev.filter((stepId) => stepId !== id) : [...prev, id]
    );
  };

  const openSopModal = () => {
    if (!allStepsVerified) {
      toast("Complete all 3 mounting steps to unlock the installation SOP.", "warning");
      return;
    }
    setSopIssuedAt(
      new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    );
    setIsSopModalOpen(true);
  };

  const closeSopModal = () => setIsSopModalOpen(false);

  const handleDownloadSopPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const margin = 16;
    let y = 18;

    doc.setFillColor(10, 14, 26);
    doc.rect(0, 0, 216, 28, "F");
    doc.setTextColor(255, 199, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Spectra CM Official Installation SOP", margin, 12);
    doc.setFontSize(9);
    doc.setTextColor(226, 232, 240);
    doc.text("Standard Operating Procedure & Installation Certificate", margin, 20);

    y = 38;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const headerLines = [
      `Asset Tag: ${assetTag}`,
      `Asset: ${activePreset.name}`,
      `Facility: ${FACILITY_NAME}`,
      `Issued: ${sopIssuedAt || new Date().toLocaleString()}`,
      `Mount Point: ${activePoint.locationName}`,
      `Technique: ${MOUNT_TECHNIQUES.find((t) => t.id === mountTechnique)?.label ?? "Threaded Stud Mount"}`
    ];
    headerLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 6;
    });

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Verified Checklist", margin, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    MOUNTING_STEPS.forEach((step) => {
      const done = checkedSteps.includes(step.id);
      const summary = step.summary.replace(/µ/g, "u").replace(/"/g, "in ");
      doc.text(`${done ? "[x]" : "[ ]"}  Step ${step.id}: ${step.title} - ${summary}`, margin, y);
      y += 7;
    });
    doc.setFont("helvetica", "bold");
    doc.text(`Technician Sign-Off: ${TECHNICIAN_SIGNOFF}`, margin, y);
    y += 12;

    doc.setFontSize(12);
    doc.text(`ISO Alarm Limits — ${isoAlarmTable.standard}`, margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(isoAlarmTable.className, margin, y);
    y += 8;
    isoAlarmTable.rows.forEach((row) => {
      doc.text(
        `Zone ${row.zone}  ${row.label}  ${row.limit.replace(/–/g, "-")}  ${row.action.replace(/—/g, "-")}`,
        margin,
        y
      );
      y += 6;
    });

    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Generated by Spectra CM • ISO 20816 installation verification record.", margin, y);

    doc.save(`Spectra-SOP-${assetTag}.pdf`);
    toast("Installation SOP PDF downloaded.", "success");
  };

  useEffect(() => {
    if (!isSopModalOpen && !isSurfaceInspectorOpen && !isArModeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSopModalOpen(false);
        setIsSurfaceInspectorOpen(false);
        setIsArModeOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSopModalOpen, isSurfaceInspectorOpen, isArModeOpen]);

  useEffect(() => () => clearAiTimeouts(), []);

  // Specs always describe the point the technician currently has selected.
  const handleCopySpecs = async () => {
    const text = [
      "MOUNTING INSTRUCTIONS:",
      `Asset: ${activePreset.name}`,
      `Location: ${activePoint.locationName}`,
      ...(activePoint.reason ? [`Requirement: ${activePoint.reason}`] : []),
      `Placement Quality: ${activePoint.quality}`,
      "Surface Prep: Clean to bare metal, spot-face to 32 µin finish.",
      "Mounting: 1/4\"-28 UNF Stud or Epoxy Disc.",
      "Torque: 2-3 ft-lbs (24-36 in-lbs)."
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    } catch {
      toast("Clipboard unavailable in this browser context.", "error");
    }
  };

  // Filtered reference guides
  const filteredGuides = REFERENCE_GUIDES.filter(g => {
    const matchesCategory = categoryFilter === "All" || g.category === categoryFilter;
    const matchesSearch = g.title.toLowerCase().includes(searchFilter.toLowerCase()) || 
                          g.subtitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          g.isoStandard.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const openGuide = (guide: ReferenceGuide) => {
    setModalGuide(guide);
    setSelectedGuidePoint(guide.points[0] || null);
  };

  const closeLibrary = () => {
    setLibraryOpen(false);
    setModalGuide(null);
  };

  const clearGuideFilters = () => {
    setCategoryFilter("All");
    setSearchFilter("");
  };

  return (
    <div className="space-y-5 w-full max-w-full pb-28 lg:pb-8">

      {/* ===== Header ===== */}
      <header className={`${CARD} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-11 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Mounting Planner</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Sensor placement coordinates, surface preparation specs, and the ISO 10816 reference
              library.
            </p>
            <p className="text-[11px] text-slate-500 mt-1 italic">
              Reference guidance — not asset-specific data.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="shrink-0 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 hover:border-yellow-400/50 hover:text-yellow-400 transition-colors cursor-pointer"
        >
          <Layers className="h-4 w-4 text-yellow-400" />
          <span>Reference Guides</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
            {REFERENCE_GUIDES.length}
          </span>
        </button>
      </header>

      {/* ===== Equipment selection ===== */}
      <section className={`${CARD} p-4 sm:p-5 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sample Equipment</h2>
          <p className="text-xs text-slate-400">
            Select an asset to load its mounting points, or upload your own photo below.
          </p>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={gallerySearch}
            onChange={(e) => setGallerySearch(e.target.value)}
            placeholder="Filter sample assets..."
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[#0A0E1A] border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#FFC700]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {GALLERY_FILTERS.map((filter) => {
            const count = filter.matchCategory
              ? SCAN_PRESETS.filter((p) => p.category === filter.matchCategory).length
              : SCAN_PRESETS.length;
            const isActive = galleryCategory === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setGalleryCategory(filter.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? "bg-[#FFC700] text-slate-950"
                    : "bg-[#0A0E1A] border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                }`}
              >
                {filter.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {filteredGalleryPresets.map((preset) => {
            const isSelected = selectedPresetId === preset.id && !customImage;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                aria-pressed={isSelected}
                title={preset.name}
                className={`group rounded-xl border overflow-hidden text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-yellow-400 bg-yellow-400/5 shadow-lg shadow-yellow-400/10"
                    : "border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900"
                }`}
              >
                <span className="relative block aspect-[16/10] bg-slate-950 overflow-hidden">
                  <img
                    src={preset.imgUrl}
                    alt={preset.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className={`block h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${
                      isSelected ? "opacity-100" : "opacity-75 group-hover:opacity-100"
                    }`}
                  />
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-yellow-400 text-slate-950 flex items-center justify-center shadow-lg">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="block p-2.5">
                  <span
                    className={`block text-xs font-bold truncate ${
                      isSelected ? "text-yellow-400" : "text-slate-200 group-hover:text-white"
                    }`}
                  >
                    {preset.name}
                  </span>
                  <span className="block text-[11px] text-slate-500 font-mono truncate mt-0.5">
                    {preset.category}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {filteredGalleryPresets.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-3">No sample assets match that filter.</p>
        )}
      </section>

      {/* ===== Main content ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ===== Left column (60%): photo stage & markers ===== */}
        <section className={`lg:col-span-3 ${CARD} p-4 sm:p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Camera className="h-4 w-4 text-yellow-400" />
              <span>Measurement Point Map</span>
            </h2>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-slate-400 font-mono truncate max-w-[10rem] sm:max-w-[14rem] text-right">
                {customImage ? customImageName : activePreset.name}
              </span>
              <button
                type="button"
                onClick={openArMode}
                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-xl bg-[#FFC700]/10 border border-[#FFC700]/50 text-[#FFC700] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#FFC700]/20 cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" />
                AR Field Mode
              </button>
            </div>
          </div>

          {/* Drag and Drop Zone / Photo Container */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative bg-slate-950 border-2 rounded-xl overflow-hidden transition-colors ${
              dragActive ? "border-yellow-400" : "border-slate-700"
            }`}
          >
            {/* Photo view area with measurement overlays */}
            {/* 4:3 matches the source photos, so marker percentages map 1:1 with no cover-crop drift. */}
            <div className="relative aspect-[4/3] w-full min-h-[260px] overflow-hidden select-none">
              <style>{`
                @keyframes mmp-laser-scan {
                  from { top: 0%; opacity: 0.2; }
                  to { top: 100%; opacity: 1; }
                }
              `}</style>
              <div
                className={`absolute inset-0 origin-center ${mapZoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                style={{
                  transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
                  transition: isPanning ? "none" : "transform 280ms ease-out"
                }}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={handleMapPointerUp}
                onPointerCancel={handleMapPointerUp}
              >
              {photoState === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <ImageOff className="h-8 w-8 text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">Equipment photo could not be loaded</p>
                  <p className="text-xs text-slate-500">
                    Upload a photo of the asset to place its mounting points.
                  </p>
                </div>
              ) : (
                <img
                  src={activePhoto}
                  alt={`${customImage ? customImageName : activePreset.name} mounting reference`}
                  onLoad={() => setPhotoState("ready")}
                  onError={() => setPhotoState("error")}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className={`block h-full w-full object-cover transition-all duration-500 ${
                    isScanning || photoState === "loading"
                      ? "opacity-40 blur-sm scale-105"
                      : "opacity-95"
                  }`}
                />
              )}

              {/* Photo loading state */}
              {photoState === "loading" && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2.5 bg-slate-950/60">
                  <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
                  <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest font-mono">
                    Loading photo
                  </p>
                </div>
              )}

              {/* Point placement transition */}
              {isScanning && photoState !== "loading" && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-slate-950/70">
                  <span className="relative flex h-14 w-14 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-4 border-yellow-400/20 border-t-yellow-400 animate-spin" />
                    <Target className="h-6 w-6 text-yellow-400" />
                  </span>
                  <div className="text-center px-4">
                    <p className="text-[11px] font-bold text-yellow-400 uppercase tracking-widest font-mono">
                      Placing mounting points
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Aligning shaft axes &amp; bearing load zones...
                    </p>
                  </div>
                </div>
              )}

              {/* Measurement overlays */}
              {!isScanning && photoState === "ready" && (
                <>
                  {/* Optimal mounting zone bounding box (no long banner — pins carry identity) */}
                  <div
                    style={{
                      left: `${activePreset.optimalPoint.x - activePreset.optimalPoint.boxWidth / 2}%`,
                      top: `${activePreset.optimalPoint.y - activePreset.optimalPoint.boxHeight / 2}%`,
                      width: `${activePreset.optimalPoint.boxWidth}%`,
                      height: `${activePreset.optimalPoint.boxHeight}%`
                    }}
                    className="absolute z-20 border-2 border-emerald-400 bg-emerald-500/10 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.45)] pointer-events-none"
                  >
                    <span className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-emerald-300" />
                    <span className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-emerald-300" />
                    <span className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-emerald-300" />
                    <span className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-emerald-300" />
                  </div>

                  {/* Numbered pins — label chip only on the selected point to avoid overlap */}
                  {measurementPoints.map((pt, index) => {
                    const isSelected = index === activePointIndex;
                    const isIdeal = pt.quality === "Ideal";
                    const isAvoid = pt.quality === "Avoid";
                    // Keep the callout inside the frame: near the top edge → below; otherwise above.
                    const labelBelow = pt.y < 22;
                    const chipText = isAvoid ? "AVOID" : pt.primary ? "OPTIMAL" : `P${index + 1}`;
                    // Nudge the chip inward when the pin sits near a side edge.
                    const chipShift =
                      pt.x < 14 ? "translate-x-3" : pt.x > 86 ? "-translate-x-3" : "";

                    const chipClass = `max-w-[9rem] px-2 py-1 rounded border bg-slate-950/95 text-[10px] font-bold font-mono leading-tight text-center shadow-[0_2px_8px_rgba(2,6,23,0.85)] whitespace-normal break-words ${chipShift} ${
                      isAvoid
                        ? "text-red-300 border-red-500/50"
                        : isIdeal
                          ? "text-emerald-300 border-emerald-500/50"
                          : "text-amber-300 border-amber-500/50"
                    }`;

                    return (
                      <button
                        key={`${pt.locationName}-${index}`}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setSelectedPointIndex(index)}
                        aria-pressed={isSelected}
                        aria-label={`Point ${index + 1}: ${pt.locationName}`}
                        title={pt.locationName}
                        style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-transform ${
                          isSelected ? "z-40 scale-110" : "z-30 hover:scale-105"
                        }`}
                      >
                        {isSelected && !labelBelow && (
                          <span className={`mb-1.5 ${chipClass}`}>{chipText}</span>
                        )}

                        <span className="relative flex items-center justify-center">
                          {isSelected && (
                            <span
                              className={`absolute h-9 w-9 rounded-full ${
                                isAvoid
                                  ? "bg-red-500/40"
                                  : isIdeal
                                    ? "bg-emerald-400/30"
                                    : "bg-amber-400/30"
                              } animate-ping`}
                            />
                          )}
                          <span
                            className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                              isAvoid
                                ? "bg-red-600"
                                : isIdeal
                                  ? "bg-emerald-500"
                                  : "bg-amber-500"
                            } text-slate-950 font-mono text-xs font-bold border-2 shadow-[0_2px_10px_rgba(2,6,23,0.85)] ${
                              isSelected ? "border-white ring-2 ring-white/60" : "border-white/90"
                            }`}
                          >
                            {isAvoid ? <X className="h-4 w-4 text-white" strokeWidth={3} /> : index + 1}
                          </span>
                        </span>

                        {isSelected && labelBelow && (
                          <span className={`mt-1.5 ${chipClass}`}>{chipText}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
              </div>

              {/* Overlay status badges + map controls (unscaled) */}
              {!isScanning && photoState === "ready" && (
                <div className="absolute top-2.5 left-2.5 right-2.5 z-40 flex items-start justify-between gap-2 pointer-events-none">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="px-2.5 py-1.5 bg-slate-950/90 backdrop-blur-md rounded-lg border border-slate-700 text-[11px] font-mono text-slate-300 inline-flex items-center gap-1.5 shadow-lg w-fit">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>
                        Reference layout &middot;{" "}
                        <strong className="text-white">{measurementPoints.length} points</strong>
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex w-fit px-2.5 py-1 bg-emerald-500/10 backdrop-blur-md rounded-lg border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                      ISO 10816 SURFACE READY
                    </span>
                  </div>
                  <div className="pointer-events-auto inline-flex h-9 shrink-0 items-stretch rounded-xl border border-white/10 bg-[#0A0E1A]/80 backdrop-blur-md shadow-[0_8px_24px_rgba(2,6,23,0.55)] overflow-hidden divide-x divide-white/10">
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      aria-label="Zoom In"
                      className="h-9 w-9 text-[#FFC700] hover:bg-white/5 cursor-pointer inline-flex items-center justify-center"
                      title="Zoom In"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      aria-label="Zoom Out"
                      className="h-9 w-9 text-[#FFC700] hover:bg-white/5 cursor-pointer inline-flex items-center justify-center"
                      title="Zoom Out"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={handleResetView}
                      className="h-9 px-3 text-slate-200 text-[11px] font-bold hover:bg-white/5 hover:text-[#FFC700] cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset View
                    </button>
                    <button
                      type="button"
                      onClick={handleReanalyzeScan}
                      disabled={isReanalyzing}
                      className="h-9 px-3 text-[#FFC700] text-[11px] font-bold hover:bg-[#FFC700]/10 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-60"
                    >
                      <Zap className="h-3 w-3" />
                      Re-analyze AI Scan
                    </button>
                  </div>
                </div>
              )}

              {isReanalyzing && (
                <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 bg-yellow-400/5" />
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-[#FFC700] shadow-[0_0_18px_#FFC700,0_0_36px_#FFC700]"
                    style={{ animation: "mmp-laser-scan 1.5s linear forwards" }}
                  />
                </div>
              )}
            </div>

            {/* Legend & drag hint */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 bg-slate-900/80 border-t border-slate-700">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Ideal
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  Acceptable
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 relative">
                    <span className="absolute inset-0 rounded-full bg-red-500/50 animate-ping" />
                  </span>
                  Avoid Zone
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Drag &amp; drop a photo here to plan on your own asset.
              </span>
            </div>
          </div>

          {/* Photo actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 hover:border-yellow-400/50 hover:text-yellow-400 transition-colors cursor-pointer"
            >
              <Camera className="h-4 w-4 text-yellow-400" />
              <span>{customImage ? "Change Photo" : "Upload / Take Photo"}</span>
            </button>

            {customImage && (
              <button
                type="button"
                onClick={handleResetToPreset}
                title="Reset to the sample asset"
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reset to Sample</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Point selector — the pins are small on touch screens */}
          <div className="space-y-2 pt-1 border-t border-slate-700/70">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block pt-3">
              Measurement Points
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {measurementPoints.map((pt, index) => {
                const isSelected = index === activePointIndex;
                const isIdeal = pt.quality === "Ideal";
                const isAvoid = pt.quality === "Avoid";
                return (
                  <button
                    key={`selector-${pt.locationName}-${index}`}
                    type="button"
                    onClick={() => setSelectedPointIndex(index)}
                    aria-pressed={isSelected}
                    title={pt.locationName}
                    className={`min-h-[56px] min-w-0 p-3 rounded-xl border text-left flex items-start gap-2 transition-colors cursor-pointer overflow-hidden ${
                      isSelected
                        ? isAvoid
                          ? "bg-red-500/10 border-red-500/50"
                          : "bg-yellow-400/10 border-yellow-400/50"
                        : "bg-slate-900/60 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <span
                      className={`h-6 w-6 rounded-full ${
                        isAvoid ? "bg-red-600" : isIdeal ? "bg-emerald-500" : "bg-amber-500"
                      } text-slate-950 text-xs font-bold font-mono flex items-center justify-center shrink-0`}
                    >
                      {isAvoid ? <X className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-xs font-bold truncate ${
                          isSelected
                            ? isAvoid
                              ? "text-red-300"
                              : "text-yellow-400"
                            : "text-slate-200"
                        }`}
                      >
                        {pt.primary ? "Optimal Point" : pt.label}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                        {pt.quality}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ===== Right column (40%): instructions ===== */}
        <div className="lg:col-span-2 space-y-5">

          <section className={`${CARD} p-4 sm:p-5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#FFC700]" />
                <span>AI Asset Identification</span>
              </h2>
              <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold font-mono text-emerald-400">
                {customImage ? "LIVE SCAN" : "PRESET"}
              </span>
            </div>
            <dl className="space-y-2.5">
              <div className="rounded-xl border border-slate-700 bg-[#0A0E1A] px-3 py-2.5">
                <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Equipment Type</dt>
                <dd className="mt-1 text-xs font-bold text-slate-100 leading-snug">{aiAssetInfo.equipmentType}</dd>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#0A0E1A] px-3 py-2.5">
                <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Identified Bearings</dt>
                <dd className="mt-1 text-xs font-bold text-slate-100 leading-snug">{aiAssetInfo.identifiedBearings}</dd>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#0A0E1A] px-3 py-2.5">
                <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Surface Material Detected</dt>
                <dd className="mt-1 text-xs font-bold text-slate-100 leading-snug">{aiAssetInfo.surfaceMaterial}</dd>
              </div>
            </dl>
          </section>

          {/* Field instruction banner */}
          {activePoint.quality === "Avoid" ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
              <span className="h-10 w-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
                <X className="h-5 w-5" strokeWidth={3} />
              </span>
              <div className="min-w-0 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-400 block">
                  Do Not Mount Here
                </span>
                <p className="text-sm font-bold text-white leading-snug">
                  This is a negative-training avoid zone. Relocate to a rigid bearing housing before taking a reading.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4 flex items-start gap-3">
              <span className="h-10 w-10 rounded-xl bg-yellow-400 text-slate-950 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-yellow-400 block">
                  Field Mechanic Instruction
                </span>
                <p className="text-sm font-bold text-white leading-snug">
                  Mount the sensor on the highlighted point. The surface must be clean, flat, and bare metal.
                </p>
              </div>
            </div>
          )}

          {/* Selected point detail */}
          <section className={`${CARD} p-4 sm:p-5 space-y-2.5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Target className="h-4 w-4 text-yellow-400" />
                <span>{activePoint.quality === "Avoid" ? "Avoid Zone" : "Target Bearing Zone"}</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded border text-[11px] font-bold font-mono ${
                  activePoint.quality === "Avoid"
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : activePoint.quality === "Ideal"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}
              >
                {activePoint.quality.toUpperCase()}
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <span
                className={`h-6 w-6 rounded-full ${
                  activePoint.quality === "Avoid"
                    ? "bg-red-600"
                    : activePoint.quality === "Ideal"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                } text-slate-950 text-xs font-bold font-mono flex items-center justify-center shrink-0 mt-0.5`}
              >
                {activePoint.quality === "Avoid" ? (
                  <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                ) : (
                  activePointIndex + 1
                )}
              </span>
              <p className="text-sm font-bold text-white leading-snug">{activePoint.locationName}</p>
            </div>

            {activePoint.quality === "Avoid" ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 leading-relaxed">
                {activePoint.reason || AVOID_ZONE_WARNING}
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                {activePoint.reason ?? "Supporting point — see the reference guides for the full placement rationale."}
              </p>
            )}
          </section>

          {/* Collapsible mounting procedure */}
          <section className={`${CARD} p-4 sm:p-5 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Wrench className="h-4 w-4 text-yellow-400" />
                <span>Step-by-Step Mounting Guide</span>
              </h2>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono font-bold text-slate-400">
                {checkedSteps.length}/3 VERIFIED
              </span>
            </div>

            {allStepsVerified && (
              <div className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-3.5 py-3 flex items-center gap-2.5 shadow-[0_0_28px_rgba(16,185,129,0.35)]">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse shrink-0" />
                <p className="text-sm font-bold text-emerald-300 tracking-wide">
                  🟢 ISO 20816 INSTALLATION VERIFIED
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              {MOUNTING_STEPS.map((step) => {
                const Icon = step.icon;
                const isOpen = openSteps.includes(step.id);
                const isChecked = checkedSteps.includes(step.id);
                return (
                  <div
                    key={step.id}
                    className={`bg-slate-900/60 border rounded-xl overflow-hidden ${
                      isChecked ? "border-emerald-500/40" : "border-slate-700"
                    }`}
                  >
                    <div className="w-full min-h-[56px] p-3.5 flex items-start gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`Mark step ${step.id} complete`}
                        onClick={() => toggleCheckedStep(step.id)}
                        className={`h-6 w-6 mt-1.5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-emerald-500 border-emerald-400 text-slate-950"
                            : "bg-[#0A0E1A] border-slate-500 hover:border-[#FFC700]"
                        }`}
                      >
                        {isChecked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStep(step.id)}
                        aria-expanded={isOpen}
                        className="min-w-0 flex-1 flex items-start gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <span className="h-9 w-9 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 font-mono text-sm font-bold flex items-center justify-center shrink-0">
                          {step.id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-100 whitespace-normal break-words leading-snug">
                            {step.title}
                          </span>
                          <span className="block text-[11px] text-slate-500 font-mono whitespace-normal break-words mt-1 leading-snug">
                            {step.summary}
                          </span>
                        </span>
                        <Icon className="h-4 w-4 text-slate-500 shrink-0 mt-1" />
                        <ChevronDown
                          className={`h-4 w-4 text-slate-500 shrink-0 mt-1 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-3.5 pb-4 pt-1 space-y-3 border-t border-slate-800">
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-normal break-words pt-3">
                          {step.description}
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {step.specs.map((spec) => (
                            <div
                              key={spec.label}
                              className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5 min-h-[3.25rem]"
                            >
                              <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-normal break-words">
                                {spec.label}
                              </dt>
                              <dd className="text-xs font-bold text-slate-200 font-mono whitespace-normal break-words mt-1 leading-snug">
                                {spec.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {step.id === 1 && (
                          <button
                            type="button"
                            onClick={() => setIsSurfaceInspectorOpen(true)}
                            className="w-full min-h-[44px] px-3 py-2.5 rounded-lg bg-[#0A0E1A] border border-slate-700 text-xs font-bold text-slate-200 hover:border-[#FFC700] hover:text-[#FFC700] transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Inspect Bare Metal Prep Photo
                          </button>
                        )}
                        {step.id === 3 && (
                          <div className="space-y-3 pt-1">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                              Mounting Technique Comparator
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {MOUNT_TECHNIQUES.map((tech) => (
                                <button
                                  key={tech.id}
                                  type="button"
                                  onClick={() => setMountTechnique(tech.id)}
                                  className={`min-h-[44px] px-3 py-2 rounded-lg border text-left text-xs font-semibold cursor-pointer transition-colors ${
                                    mountTechnique === tech.id
                                      ? "bg-[#FFC700]/10 border-[#FFC700] text-[#FFC700]"
                                      : "bg-[#0A0E1A] border-slate-700 text-slate-300 hover:border-slate-500"
                                  }`}
                                >
                                  {tech.icon} {tech.label}
                                </button>
                              ))}
                            </div>
                            {(() => {
                              const activeTech =
                                MOUNT_TECHNIQUES.find((t) => t.id === mountTechnique) ??
                                MOUNT_TECHNIQUES[0];
                              return (
                                <div className="rounded-xl border border-slate-700 bg-[#0A0E1A] p-3 space-y-1.5">
                                  <p className="text-xs text-slate-200">
                                    Signal Integrity:{" "}
                                    <span className={`font-bold font-mono ${activeTech.tone}`}>
                                      {activeTech.integrity}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-200">
                                    Max Frequency:{" "}
                                    <span className="font-bold font-mono text-slate-100">
                                      {activeTech.maxFreq}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-200">
                                    ISO Status:{" "}
                                    <span className={`font-bold ${activeTech.tone}`}>{activeTech.iso}</span>
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ===== Bottom actions ===== */}
      <section className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleCopySpecs}
            className="sm:min-w-[260px] min-h-[48px] px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 text-sm font-bold shadow-lg shadow-yellow-400/10 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {copiedNotification ? (
              <>
                <Check className="h-4 w-4" strokeWidth={3} />
                <span>Copied to Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy Mounting Specs</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openSopModal}
            disabled={!allStepsVerified}
            title={allStepsVerified ? "Open installation SOP" : "Complete all 3 mounting steps to unlock"}
            className={`sm:min-w-[220px] min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allStepsVerified
                ? "bg-[#FFC700] hover:bg-yellow-300 text-slate-950 shadow-[0_0_28px_rgba(255,199,0,0.45)] ring-2 ring-[#FFC700]/70 cursor-pointer"
                : "bg-slate-900 border border-slate-700 text-slate-500 cursor-not-allowed opacity-60"
            }`}
          >
            <Printer className="h-4 w-4" />
            <span>Print Field Sheet</span>
          </button>

          <button
            type="button"
            onClick={openSopModal}
            disabled={!allStepsVerified}
            title={allStepsVerified ? "Export mounting SOP" : "Complete all 3 mounting steps to unlock"}
            className={`sm:min-w-[220px] min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allStepsVerified
                ? "bg-[#FFC700]/15 hover:bg-[#FFC700]/25 border border-[#FFC700] text-[#FFC700] shadow-[0_0_20px_rgba(255,199,0,0.25)] cursor-pointer"
                : "bg-slate-900 border border-slate-700 text-slate-500 cursor-not-allowed opacity-60"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Export SOP</span>
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          Specs cover <strong className="text-slate-200">{activePoint.locationName}</strong> on{" "}
          {activePreset.name}.
        </p>
      </section>

      {/* ===== Reference guide library ===== */}
      {libraryOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 flex items-start sm:items-center justify-center overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-left">

            {/* Library header */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-700 shrink-0">
              {modalGuide ? (
                <div className="min-w-0 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setModalGuide(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-yellow-400 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>All reference guides</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-yellow-400/10 border border-yellow-400/30 text-[11px] font-mono font-bold uppercase text-yellow-400">
                      {modalGuide.category}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono font-bold text-slate-300">
                      {modalGuide.isoStandard}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">{modalGuide.title}</h2>
                  <p className="text-xs sm:text-sm text-slate-400">{modalGuide.subtitle}</p>
                </div>
              ) : (
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="h-5 w-5 text-yellow-400" />
                    <span>Reference Guides</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    ISO 10816 measurement point layouts and surface preparation rules by machine type.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={closeLibrary}
                aria-label="Close reference guides"
                className="shrink-0 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
              {!modalGuide ? (
                <div className="space-y-4">
                  {/* Filters & search */}
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 lg:pb-0">
                      {CATEGORY_FILTERS.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            categoryFilter === cat
                              ? "bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/10"
                              : "bg-slate-950 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="relative shrink-0 lg:ml-auto lg:w-72">
                      <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search machinery, ISO standards..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full min-h-[40px] pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 font-mono">
                    Showing {filteredGuides.length} of {REFERENCE_GUIDES.length} guides
                  </p>

                  {filteredGuides.length === 0 ? (
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 flex flex-col items-center gap-3 text-center">
                      <Info className="h-6 w-6 text-slate-500" />
                      <p className="text-sm font-bold text-slate-300">No guides match these filters</p>
                      <button
                        type="button"
                        onClick={clearGuideFilters}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 hover:border-yellow-400/50 hover:text-yellow-400 transition-colors cursor-pointer"
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredGuides.map((guide) => (
                        <button
                          key={guide.id}
                          type="button"
                          onClick={() => openGuide(guide)}
                          className={`${CARD} group p-4 text-left flex flex-col justify-between gap-4 hover:border-yellow-400/50 hover:-translate-y-0.5 transition-all cursor-pointer`}
                        >
                          <span className="block space-y-3">
                            {/* Card header */}
                            <span className="flex items-start justify-between gap-2">
                              <span className="block min-w-0">
                                <span className="block text-[11px] font-bold text-yellow-400 uppercase font-mono tracking-widest">
                                  {guide.category}
                                </span>
                                <span className="block text-base font-bold text-white group-hover:text-yellow-400 transition-colors mt-0.5">
                                  {guide.title}
                                </span>
                                <span className="block text-xs text-slate-400 mt-0.5">{guide.subtitle}</span>
                              </span>
                              <span className="shrink-0 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono font-bold text-slate-300">
                                {guide.isoStandard}
                              </span>
                            </span>

                            {/* Diagram with pins */}
                            <span className="relative flex aspect-[16/10] items-center justify-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden p-4 group-hover:border-slate-600 transition-colors">
                              <RenderMachineSVG type={guide.svgType} />

                              {guide.points.map((pt) => {
                                const isIdeal = pt.quality === "Ideal";
                                const isAvoid = pt.quality === "Avoid";
                                return (
                                  <span
                                    key={pt.id}
                                    style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                                  >
                                    <span
                                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                        isAvoid ? "bg-red-600" : isIdeal ? "bg-emerald-500" : "bg-amber-500"
                                      } text-slate-950 font-mono text-[11px] font-bold border-2 border-white shadow-md`}
                                    >
                                      {isAvoid ? <X className="h-3 w-3 text-white" strokeWidth={3} /> : pt.number}
                                    </span>
                                  </span>
                                );
                              })}

                              <span className="absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/90 border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center gap-1 group-hover:bg-yellow-400 group-hover:text-slate-950 group-hover:border-yellow-400 transition-colors">
                                <Maximize2 className="h-3 w-3" />
                                <span>Inspect Points</span>
                              </span>
                            </span>

                            {/* Quick specs */}
                            <span className="block space-y-1.5">
                              <span className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-500">Measurement points:</span>
                                <span className="font-mono font-bold text-slate-200">
                                  {guide.points.length} configured
                                </span>
                              </span>
                              <span className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-500 shrink-0">Recommended mount:</span>
                                <span className="font-mono font-bold text-yellow-400 truncate">
                                  {guide.recommendedMounting.split("Or")[0]}
                                </span>
                              </span>
                            </span>
                          </span>

                          <span className="flex items-center justify-between gap-2 pt-3 border-t border-slate-700 text-xs font-bold text-yellow-400">
                            <span>View diagram &amp; placement rules</span>
                            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (

                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

                    {/* Diagram with interactive pins */}
                    <div className="lg:col-span-3 space-y-4">
                      <div className="relative aspect-[16/10] bg-slate-950 border border-slate-700 rounded-xl overflow-hidden p-6 flex items-center justify-center">
                        <RenderMachineSVG type={modalGuide.svgType} />

                        {modalGuide.points.map((pt) => {
                          const isSelected = selectedGuidePoint?.id === pt.id;
                          const isIdeal = pt.quality === "Ideal";
                          const isAvoid = pt.quality === "Avoid";
                          return (
                            <button
                              key={pt.id}
                              type="button"
                              onClick={() => setSelectedGuidePoint(pt)}
                              aria-pressed={isSelected}
                              title={pt.name}
                              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                              className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-transform cursor-pointer ${
                                isSelected ? "scale-110 z-40" : "z-30 hover:scale-105"
                              }`}
                            >
                              <span className="relative flex items-center justify-center">
                                {(isSelected || isAvoid) && (
                                  <span
                                    className={`absolute h-10 w-10 rounded-full ${
                                      isAvoid
                                        ? "bg-red-500/40"
                                        : isIdeal
                                          ? "bg-emerald-400/40"
                                          : "bg-amber-400/40"
                                    } animate-ping`}
                                  />
                                )}
                                <span
                                  className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                                    isAvoid ? "bg-red-600" : isIdeal ? "bg-emerald-500" : "bg-amber-500"
                                  } text-slate-950 font-mono text-xs font-bold border-2 shadow-lg ${
                                    isSelected ? "border-white ring-2 ring-white/50" : "border-white/80"
                                  }`}
                                >
                                  {isAvoid ? <X className="h-4 w-4 text-white" strokeWidth={3} /> : pt.number}
                                </span>
                              </span>
                              <span
                                className={`mt-1 px-2 py-0.5 rounded border bg-slate-950/90 text-[11px] font-bold font-mono whitespace-nowrap shadow-md ${
                                  isAvoid
                                    ? "text-red-300 border-red-500/40"
                                    : isIdeal
                                      ? "text-emerald-300 border-emerald-500/40"
                                      : "text-amber-300 border-amber-500/40"
                                }`}
                              >
                                {isAvoid ? "AVOID" : pt.name.split(" - ")[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Point selector */}
                      <div className="space-y-2">
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Select Measurement Point
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {modalGuide.points.map((pt) => {
                            const isSelected = selectedGuidePoint?.id === pt.id;
                            const isIdeal = pt.quality === "Ideal";
                            const isAvoid = pt.quality === "Avoid";
                            return (
                              <button
                                key={pt.id}
                                type="button"
                                onClick={() => setSelectedGuidePoint(pt)}
                                aria-pressed={isSelected}
                                title={pt.name}
                                className={`min-h-[48px] p-2.5 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                                  isSelected
                                    ? isAvoid
                                      ? "bg-red-500/10 border-red-500/50 text-red-300"
                                      : "bg-yellow-400/10 border-yellow-400/50 text-yellow-400"
                                    : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600"
                                }`}
                              >
                                <span
                                  className={`h-6 w-6 rounded-full ${
                                    isAvoid ? "bg-red-600" : isIdeal ? "bg-emerald-500" : "bg-amber-500"
                                  } text-slate-950 font-mono text-[11px] font-bold flex items-center justify-center shrink-0`}
                                >
                                  {isAvoid ? <X className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : pt.number}
                                </span>
                                <span className="truncate">{isAvoid ? `AVOID — ${pt.name}` : pt.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Point detail & machine standard */}
                    <div className="lg:col-span-2 space-y-4">
                      {selectedGuidePoint ? (
                        <div className={`${CARD} p-4 space-y-3`}>
                          <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`h-6 w-6 rounded-full ${
                                  selectedGuidePoint.quality === "Avoid"
                                    ? "bg-red-600"
                                    : selectedGuidePoint.quality === "Ideal"
                                      ? "bg-emerald-500"
                                      : "bg-amber-500"
                                } text-slate-950 font-mono text-xs font-bold flex items-center justify-center shrink-0`}
                              >
                                {selectedGuidePoint.quality === "Avoid" ? (
                                  <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                ) : (
                                  selectedGuidePoint.number
                                )}
                              </span>
                              <h3 className="text-sm font-bold text-white truncate">
                                {selectedGuidePoint.name}
                              </h3>
                            </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded border text-[11px] font-bold font-mono ${
                                selectedGuidePoint.quality === "Avoid"
                                  ? "bg-red-500/10 text-red-400 border-red-500/30"
                                  : selectedGuidePoint.quality === "Ideal"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {selectedGuidePoint.quality.toUpperCase()}
                            </span>
                          </div>

                          <div className="space-y-3">
                            {selectedGuidePoint.quality === "Avoid" && (
                              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 leading-relaxed">
                                {AVOID_ZONE_WARNING}
                              </div>
                            )}

                            <div>
                              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                {selectedGuidePoint.quality === "Avoid" ? "Why this zone is rejected" : "Why this point is chosen"}
                              </span>
                              <p className="mt-1 text-xs text-slate-200 leading-relaxed bg-slate-900/70 border border-slate-700 rounded-xl p-3">
                                {selectedGuidePoint.whyChosen}
                              </p>
                            </div>

                            <div>
                              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                Diagnostic fault focus
                              </span>
                              <p className="mt-1 text-xs font-mono text-yellow-400 leading-relaxed bg-slate-900/70 border border-slate-700 rounded-xl p-3">
                                {selectedGuidePoint.diagnosticFocus}
                              </p>
                            </div>

                            <div>
                              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                Surface preparation rule
                              </span>
                              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                                {selectedGuidePoint.surfaceTip}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={`${CARD} p-6 text-center text-xs text-slate-500`}>
                          Click any point on the diagram to see technical details.
                        </div>
                      )}

                      {/* General standard */}
                      <div className={`${CARD} p-4 space-y-3`}>
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-yellow-400" />
                          <span>General Mounting Standard</span>
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed">{modalGuide.generalAdvice}</p>

                        <dl className="pt-3 border-t border-slate-700 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-xs text-slate-500 shrink-0">Recommended mount:</dt>
                            <dd className="text-xs font-mono font-bold text-yellow-400 text-right">
                              {modalGuide.recommendedMounting}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-xs text-slate-500 shrink-0">Surface finish:</dt>
                            <dd className="text-xs font-mono font-bold text-slate-200 text-right">
                              {modalGuide.surfaceFinish}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setModalGuide(null)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-bold text-slate-200 hover:border-slate-600 hover:text-white transition-colors cursor-pointer"
                    >
                      Back to Guides
                    </button>
                    <button
                      type="button"
                      onClick={closeLibrary}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 text-sm font-bold shadow-lg shadow-yellow-400/10 transition-colors cursor-pointer"
                    >
                      Close Guide
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== AI vision processing ===== */}
      {isAiIdentifying && (
        <div className="fixed inset-0 z-[75] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-id-title"
            className="w-full max-w-md rounded-2xl border border-[#FFC700]/40 bg-[#0A0E1A] p-6 shadow-[0_0_40px_rgba(255,199,0,0.15)] text-center space-y-4"
          >
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full border-4 border-[#FFC700]/20 border-t-[#FFC700] animate-spin" />
              <Zap className="h-7 w-7 text-[#FFC700]" />
            </span>
            <div className="space-y-1.5">
              <h3 id="ai-id-title" className="text-base font-bold text-white">AI Vision Processing</h3>
              <p className="text-sm font-bold text-[#FFC700] font-mono">{aiIdentifyStage}</p>
              <p className="text-xs text-slate-400">Mapping ISO 20816 mounting coordinates from machine geometry.</p>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full w-2/3 bg-[#FFC700] animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* ===== AR Mobile Field View ===== */}
      {isArModeOpen && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col">
          <style>{`
            @keyframes mmp-ar-tilt {
              0%, 100% { transform: translateX(-18%); }
              50% { transform: translateX(18%); }
            }
            @keyframes mmp-ar-float {
              0%, 100% { transform: translate(-50%, -50%) translateY(0); }
              50% { transform: translate(-50%, -50%) translateY(-4px); }
            }
          `}</style>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <img
              src={activePhoto}
              alt="AR camera feed"
              className="absolute inset-0 h-full w-full object-cover opacity-90"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-transparent to-slate-950/70" />

            <span className="absolute top-4 left-4 h-10 w-10 border-t-2 border-l-2 border-[#FFC700]" />
            <span className="absolute top-4 right-4 h-10 w-10 border-t-2 border-r-2 border-[#FFC700]" />
            <span className="absolute bottom-28 left-4 h-10 w-10 border-b-2 border-l-2 border-[#FFC700]" />
            <span className="absolute bottom-28 right-4 h-10 w-10 border-b-2 border-r-2 border-[#FFC700]" />

            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-40 rounded-full border border-slate-600 bg-[#0A0E1A]/85 px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center mb-1">Spirit Level</p>
              <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[#FFC700]/70" />
                <span
                  className="absolute top-0.5 h-1 w-4 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
                  style={{ left: "50%", animation: "mmp-ar-tilt 3.2s ease-in-out infinite" }}
                />
              </div>
            </div>

            <div className="absolute top-16 left-3 right-3 sm:left-6 sm:right-6 flex flex-wrap items-center justify-between gap-2">
              <span className="px-2.5 py-1.5 rounded-lg bg-[#0A0E1A]/90 border border-[#FFC700]/40 text-[11px] font-mono font-bold text-[#FFC700]">
                REC · AR VIEWFINDER
              </span>
              <span className="px-2.5 py-1.5 rounded-lg bg-[#0A0E1A]/90 border border-slate-600 text-[11px] font-mono text-slate-200">
                Camera Position: 0.8m | Alignment: OPTIMAL | Distance: GOOD
              </span>
            </div>

            {measurementPoints.map((pt, index) => {
              const isAvoid = pt.quality === "Avoid";
              const isIdeal = pt.quality === "Ideal";
              const isActive = index === activePointIndex;
              return (
                <button
                  key={`ar-pin-${index}`}
                  type="button"
                  onClick={() => {
                    setSelectedPointIndex(index);
                    setArTargetLocked(false);
                  }}
                  style={{ left: `${pt.x}%`, top: `${pt.y}%`, animation: "mmp-ar-float 2.4s ease-in-out infinite" }}
                  className={`absolute z-20 flex flex-col items-center ${isActive ? "z-30" : ""}`}
                >
                  <span
                    className={`h-10 w-10 rounded-full border-2 border-white/90 flex items-center justify-center font-mono text-xs font-bold shadow-[0_8px_18px_rgba(0,0,0,0.55)] ${
                      isAvoid ? "bg-red-600 text-white" : isIdeal ? "bg-emerald-500 text-slate-950" : "bg-amber-400 text-slate-950"
                    } ${isActive && arTargetLocked ? "ring-4 ring-[#FFC700]" : ""}`}
                    style={{ transform: "perspective(120px) rotateX(18deg)" }}
                  >
                    {isAvoid ? "✕" : index + 1}
                  </span>
                  <span className="mt-1 px-1.5 py-0.5 rounded bg-[#0A0E1A]/90 border border-slate-600 text-[10px] font-bold whitespace-nowrap">
                    {isAvoid ? "🔴 Avoid Zone" : isIdeal ? "🟢 Ideal" : "🟡 Acceptable"}
                  </span>
                </button>
              );
            })}

            {arTargetLocked && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/50 text-xs font-bold text-emerald-300">
                Target locked · {activePoint.locationName}
              </div>
            )}
          </div>

          <div className="shrink-0 bg-[#0A0E1A] border-t border-slate-800 p-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleArSnapLock}
              className="flex-1 min-h-[48px] rounded-xl bg-[#FFC700] hover:bg-yellow-300 text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Camera className="h-4 w-4" />
              📸 Snap & Lock Target
            </button>
            <button
              type="button"
              onClick={closeArMode}
              className="flex-1 min-h-[48px] rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-bold hover:border-slate-500 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              ✕ Exit AR Mode
            </button>
          </div>
        </div>
      )}

      {/* ===== Bare metal surface inspector ===== */}
      {isSurfaceInspectorOpen && (
        <div
          className="fixed inset-0 z-[68] bg-slate-950/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsSurfaceInspectorOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="surface-inspector-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0A0E1A] border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl text-left overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
              <div>
                <h3 id="surface-inspector-title" className="text-base font-bold text-white flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#FFC700]" />
                  Bare Metal Prep Scanner
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Macro close-up · AI surface readiness</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSurfaceInspectorOpen(false)}
                aria-label="Close surface inspector"
                className="shrink-0 p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(92deg, rgba(203,213,225,0.22) 0px, rgba(248,250,252,0.55) 0.8px, rgba(71,85,105,0.25) 1.6px, rgba(15,23,42,0.7) 3.2px),
                      radial-gradient(circle at 38% 42%, rgba(255,255,255,0.22), transparent 42%),
                      linear-gradient(165deg, #94a3b8 0%, #334155 38%, #0f172a 100%)
                    `
                  }}
                />
                {photoState === "ready" && (
                  <img
                    src={activePhoto}
                    alt="Bare metal prep reference"
                    className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-overlay scale-150 origin-center"
                    draggable={false}
                  />
                )}
                <div className="absolute inset-0 pointer-events-none">
                  <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[#FFC700]/30" />
                  <span className="absolute top-1/2 left-0 right-0 h-px bg-[#FFC700]/30" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20 border border-[#FFC700]/70 rounded-sm shadow-[0_0_18px_rgba(255,199,0,0.35)]" />
                </div>
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-slate-950/85 border border-slate-700 text-[10px] font-mono text-[#FFC700]">
                  MACRO · 12.5×
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">AI Surface Rating</p>
                <p className="text-xs text-slate-200 leading-relaxed font-mono">
                  Surface Finish: 32 µin | Flatness: 0.02 mm deviation | ISO Grade: PASS (100% Metal-to-Metal Contact)
                </p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-300">
                  🟢 Surface Readiness: ISO Compliant
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SOP Field Sheet & Certificate ===== */}
      {isSopModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={closeSopModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sop-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0A0E1A] border border-slate-700 rounded-2xl w-full max-w-4xl my-4 shadow-2xl text-left overflow-hidden"
          >
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#FFC700]">
                    Spectra CM Official Installation SOP
                  </p>
                  <h3 id="sop-modal-title" className="text-lg sm:text-xl font-bold text-white">
                    Standard Operating Procedure & Installation Certificate
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                    <span>Asset Tag: <strong className="text-white">{assetTag}</strong></span>
                    <span>Facility: <strong className="text-white">{FACILITY_NAME}</strong></span>
                    <span>Issued: <strong className="text-white">{sopIssuedAt}</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSopModal}
                  aria-label="Close SOP modal"
                  className="shrink-0 p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  1. Analyzed Asset Photo
                </h4>
                <div className="relative aspect-[16/10] rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                  <img
                    src={activePhoto}
                    alt={`${activePreset.name} mounting map`}
                    className="block h-full w-full object-cover"
                    draggable={false}
                  />
                  {measurementPoints.map((pt, index) => {
                    const isAvoid = pt.quality === "Avoid";
                    const isIdeal = pt.quality === "Ideal";
                    return (
                      <span
                        key={`sop-pin-${index}`}
                        style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                      >
                        <span
                          className={`h-6 w-6 rounded-full border-2 border-white text-[10px] font-bold font-mono flex items-center justify-center ${
                            isAvoid ? "bg-red-600 text-white" : isIdeal ? "bg-emerald-500 text-slate-950" : "bg-amber-400 text-slate-950"
                          }`}
                        >
                          {isAvoid ? "✕" : index + 1}
                        </span>
                        <span className="mt-0.5 text-[10px] font-bold">
                          {isAvoid ? "🔴" : isIdeal ? "🟢" : "🟡"}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  🟢 Ideal · 🟡 Acceptable · 🔴 Avoid · Target: {activePoint.locationName}
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  2. Verified Checklist
                </h4>
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="px-3 py-2 font-bold">Step</th>
                        <th className="px-3 py-2 font-bold">Requirement</th>
                        <th className="px-3 py-2 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOUNTING_STEPS.map((step) => (
                        <tr key={`sop-step-${step.id}`} className="border-t border-slate-800">
                          <td className="px-3 py-2.5 font-bold text-white whitespace-nowrap">Step {step.id}</td>
                          <td className="px-3 py-2.5 text-slate-300">
                            {step.title} ({step.summary})
                          </td>
                          <td className="px-3 py-2.5 text-emerald-400 font-bold font-mono">
                            <span className="inline-flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Verified
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs font-bold text-emerald-300">
                  Technician Sign-Off: {TECHNICIAN_SIGNOFF}
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  3. ISO 10816 Alarm Limit Table
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">
                  {isoAlarmTable.standard} · {isoAlarmTable.className}
                </p>
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="px-3 py-2 font-bold">Zone</th>
                        <th className="px-3 py-2 font-bold">Condition</th>
                        <th className="px-3 py-2 font-bold">Overall Velocity</th>
                        <th className="px-3 py-2 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isoAlarmTable.rows.map((row) => (
                        <tr key={row.zone} className="border-t border-slate-800">
                          <td className="px-3 py-2.5 font-bold text-[#FFC700]">{row.zone}</td>
                          <td className="px-3 py-2.5 text-slate-200">{row.label}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-300">{row.limit}</td>
                          <td className="px-3 py-2.5 text-slate-400">{row.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-800 flex flex-col sm:flex-row sm:justify-end gap-2 bg-slate-950/40">
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-slate-200 hover:border-[#FFC700] hover:text-[#FFC700] cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                🖨️ Print Document
              </button>
              <button
                type="button"
                onClick={handleDownloadSopPdf}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-bold text-slate-200 hover:border-[#FFC700] hover:text-[#FFC700] cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                📄 Download PDF
              </button>
              <button
                type="button"
                onClick={closeSopModal}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FFC700] hover:bg-yellow-300 text-slate-950 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                ✕ Close Modal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom Technical Line Drawing Vector SVGs for Machine Types
function RenderMachineSVG({ type }: { type: ReferenceGuide["svgType"] }) {
  switch (type) {
    case "motor_h":
      return (
        <svg viewBox="0 0 400 240" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Base Feet */}
          <rect x="60" y="170" width="50" height="15" rx="2" className="fill-slate-900 stroke-slate-600" strokeWidth="2" />
          <rect x="290" y="170" width="50" height="15" rx="2" className="fill-slate-900 stroke-slate-600" strokeWidth="2" />
          <line x1="40" y1="185" x2="360" y2="185" stroke="#334155" strokeWidth="4" />
          
          {/* Main Stator Barrel Body */}
          <rect x="100" y="60" width="200" height="110" rx="8" className="fill-slate-900/90 stroke-slate-500" strokeWidth="2.5" />
          
          {/* Stator Cooling Fins */}
          <line x1="120" y1="60" x2="120" y2="170" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1="150" y1="60" x2="150" y2="170" stroke="#475569" strokeWidth="1.5" />
          <line x1="180" y1="60" x2="180" y2="170" stroke="#475569" strokeWidth="1.5" />
          <line x1="210" y1="60" x2="210" y2="170" stroke="#475569" strokeWidth="1.5" />
          <line x1="240" y1="60" x2="240" y2="170" stroke="#475569" strokeWidth="1.5" />
          <line x1="270" y1="60" x2="270" y2="170" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 4" />

          {/* Drive End Bearing Housing (DE) */}
          <path d="M 100 70 L 70 85 L 70 145 L 100 160 Z" className="fill-slate-800 stroke-slate-400" strokeWidth="2" />
          
          {/* Non-Drive End Fan Housing (NDE) */}
          <path d="M 300 65 L 340 75 L 340 155 L 300 165 Z" className="fill-slate-800 stroke-slate-400" strokeWidth="2" />
          
          {/* Shaft Extension */}
          <rect x="30" y="105" width="40" height="20" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />
          <line x1="15" y1="115" x2="385" y2="115" stroke="#22c55e" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />

          {/* Terminal Box */}
          <rect x="170" y="35" width="60" height="25" rx="3" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />
        </svg>
      );

    case "motor_v":
      return (
        <svg viewBox="0 0 240 320" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Mounting Flange Bottom */}
          <rect x="50" y="250" width="140" height="20" rx="3" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />
          <line x1="20" y1="270" x2="220" y2="270" stroke="#334155" strokeWidth="4" />
          
          {/* Lower Bearing Housing */}
          <rect x="70" y="190" width="100" height="60" rx="4" className="fill-slate-900 stroke-slate-500" strokeWidth="2" />
          
          {/* Stator Casing */}
          <rect x="60" y="80" width="120" height="110" rx="6" className="fill-slate-900 stroke-slate-400" strokeWidth="2" />
          <line x1="60" y1="110" x2="180" y2="110" stroke="#475569" strokeWidth="1.5" />
          <line x1="60" y1="140" x2="180" y2="140" stroke="#475569" strokeWidth="1.5" />
          <line x1="60" y1="170" x2="180" y2="170" stroke="#475569" strokeWidth="1.5" />

          {/* Top Thrust Bearing Cap */}
          <path d="M 60 80 L 80 40 L 160 40 L 180 80 Z" className="fill-slate-800 stroke-slate-300" strokeWidth="2" />
          
          {/* Vertical Shaft Line */}
          <line x1="120" y1="20" x2="120" y2="300" stroke="#22c55e" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
          <rect x="110" y="270" width="20" height="35" className="fill-slate-700 stroke-slate-400" strokeWidth="2" />
        </svg>
      );

    case "pump":
      return (
        <svg viewBox="0 0 400 240" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Baseplate */}
          <rect x="30" y="185" width="340" height="15" rx="2" className="fill-slate-900 stroke-slate-600" strokeWidth="2" />

          {/* Volute Casing (Suction & Discharge) */}
          <circle cx="110" cy="115" r="50" className="fill-slate-900 stroke-slate-400" strokeWidth="2.5" />
          <path d="M 110 65 L 110 20 L 145 20 L 135 65 Z" className="fill-slate-800 stroke-slate-400" strokeWidth="2" />
          {/* Discharge Flange */}
          <rect x="100" y="15" width="55" height="10" rx="2" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />
          {/* Suction Flange */}
          <circle cx="110" cy="115" r="25" className="fill-slate-950 stroke-slate-500" strokeWidth="2" />

          {/* Stuffing Box & Frame */}
          <rect x="160" y="95" width="50" height="40" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />
          
          {/* Bearing Housing Frame */}
          <rect x="210" y="80" width="110" height="70" rx="4" className="fill-slate-900 stroke-slate-400" strokeWidth="2.5" />
          
          {/* Shaft */}
          <rect x="320" y="105" width="40" height="20" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />
          <line x1="20" y1="115" x2="380" y2="115" stroke="#22c55e" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
        </svg>
      );

    case "gearbox":
      return (
        <svg viewBox="0 0 400 240" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Heavy Base Casing */}
          <polygon points="50,180 350,180 330,60 70,60" className="fill-slate-900 stroke-slate-400" strokeWidth="2.5" />
          <rect x="40" y="180" width="320" height="15" rx="2" className="fill-slate-800 stroke-slate-600" strokeWidth="2" />

          {/* Internal Gear Lines (Simulated Mesh) */}
          <circle cx="120" cy="115" r="35" className="fill-slate-950/80 stroke-emerald-500/50" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="260" cy="120" r="55" className="fill-slate-950/80 stroke-amber-500/50" strokeWidth="2" strokeDasharray="4 3" />

          {/* High Speed Input Shaft */}
          <rect x="20" y="105" width="50" height="20" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />

          {/* Low Speed Output Shaft */}
          <rect x="330" y="110" width="50" height="26" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />

          {/* Casing Inspection Cover */}
          <rect x="150" y="70" width="100" height="30" rx="3" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />
        </svg>
      );

    case "fan":
      return (
        <svg viewBox="0 0 400 240" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Scroll Blower Housing */}
          <path d="M 70 170 C 20 120, 30 50, 100 40 C 170 30, 200 80, 200 170 Z" className="fill-slate-900 stroke-slate-400" strokeWidth="2.5" />
          <rect x="140" y="120" width="60" height="60" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />

          {/* Shaft Pedestal Pillow Blocks */}
          <rect x="230" y="110" width="40" height="60" rx="3" className="fill-slate-900 stroke-slate-400" strokeWidth="2" />
          <rect x="310" y="110" width="40" height="60" rx="3" className="fill-slate-900 stroke-slate-400" strokeWidth="2" />
          
          {/* Common Shaft */}
          <rect x="110" y="125" width="260" height="18" className="fill-slate-700 stroke-slate-300" strokeWidth="2" />
          <line x1="210" y1="170" x2="370" y2="170" stroke="#334155" strokeWidth="4" />
        </svg>
      );

    case "compressor":
      return (
        <svg viewBox="0 0 400 240" className="w-full h-full text-slate-400" fill="none" stroke="currentColor">
          {/* Main Twin Screw Rotor Barrel */}
          <rect x="90" y="60" width="220" height="110" rx="10" className="fill-slate-900 stroke-slate-400" strokeWidth="2.5" />
          
          {/* Twin Lobe Circles */}
          <ellipse cx="200" cy="95" rx="80" ry="20" className="fill-slate-950 stroke-emerald-500/40" strokeWidth="1.5" />
          <ellipse cx="200" cy="135" rx="80" ry="20" className="fill-slate-950 stroke-emerald-500/40" strokeWidth="1.5" />

          {/* Suction Flange */}
          <rect x="40" y="95" width="50" height="40" rx="3" className="fill-slate-800 stroke-slate-500" strokeWidth="2" />
          
          {/* Discharge End Cap */}
          <rect x="310" y="70" width="45" height="90" rx="4" className="fill-slate-800 stroke-slate-300" strokeWidth="2" />
          <line x1="20" y1="115" x2="380" y2="115" stroke="#22c55e" strokeWidth="1" strokeDasharray="6 3" opacity="0.6" />
        </svg>
      );

    default:
      return null;
  }
}
