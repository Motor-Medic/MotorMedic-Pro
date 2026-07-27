import React, { useState, useRef } from "react";
import { 
  Camera, Upload, Info, AlertTriangle, Target, CheckCircle2, ChevronRight, 
  HelpCircle, Eye, Settings, RefreshCw, X, Layers, FileText, Check, 
  Maximize2, Zap, ShieldCheck, Download, Search, Wrench, ArrowRight
} from "lucide-react";

// Types for Reference Guides and Scanner
export interface ReferencePoint {
  id: string;
  number: number;
  name: string;
  direction: "Radial Horizontal" | "Radial Vertical" | "Axial";
  quality: "Ideal" | "Acceptable";
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

// Mock presets for "Scan Your Equipment"
const SCAN_PRESETS = [
  {
    id: "preset-pump",
    name: "Centrifugal Pump P-101",
    category: "Fluid Machinery",
    imgUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee15b?w=1000&auto=format&fit=crop&q=80",
    optimalPoint: {
      x: 62,
      y: 54,
      boxWidth: 22,
      boxHeight: 28,
      label: "Optimal Sensor Mounting Point",
      locationName: "Pump Inboard Bearing (DE) - Radial Horizontal",
      quality: "Ideal" as const,
      reason: "Direct path to primary impeller hydraulic load zone & shaft radial forces."
    },
    secondaryPoints: [
      { x: 32, y: 48, label: "Motor Inboard Bearing", quality: "Ideal" as const, locationName: "Motor Drive End (DE) - Radial Vertical" },
      { x: 80, y: 44, label: "Pump Volute Axial", quality: "Acceptable" as const, locationName: "Pump Outboard (NDE) - Axial" }
    ]
  },
  {
    id: "preset-motor",
    name: "3-Phase Induction Motor M-204",
    category: "Electric Drives",
    imgUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1000&auto=format&fit=crop&q=80",
    optimalPoint: {
      x: 42,
      y: 52,
      boxWidth: 24,
      boxHeight: 30,
      label: "Optimal Sensor Mounting Point",
      locationName: "Drive End (DE) Bearing Housing - Horizontal Axis",
      quality: "Ideal" as const,
      reason: "Primary load line of rotor mass & alignment strain; optimal for 1X/2X unbalance detection."
    },
    secondaryPoints: [
      { x: 78, y: 46, label: "Non-Drive End (NDE)", quality: "Acceptable" as const, locationName: "Fan Housing NDE Bearing - Vertical" }
    ]
  },
  {
    id: "preset-gearbox",
    name: "Helical Gear Reducer GB-302",
    category: "Power Transmission",
    imgUrl: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1000&auto=format&fit=crop&q=80",
    optimalPoint: {
      x: 52,
      y: 48,
      boxWidth: 26,
      boxHeight: 32,
      label: "Optimal Sensor Mounting Point",
      locationName: "High-Speed Input Shaft Bearing Housing - Axial Vector",
      quality: "Ideal" as const,
      reason: "Captures helical gear mesh frequencies (GMF) and axial thrust loads."
    },
    secondaryPoints: [
      { x: 26, y: 56, label: "Low-Speed Output Shaft", quality: "Ideal" as const, locationName: "Output Shaft Housing - Radial Horizontal" }
    ]
  },
  {
    id: "preset-fan",
    name: "Industrial Blower Fan F-501",
    category: "Air Handling",
    imgUrl: "https://images.unsplash.com/photo-1532601428956-78cb138456b7?w=1000&auto=format&fit=crop&q=80",
    optimalPoint: {
      x: 48,
      y: 45,
      boxWidth: 25,
      boxHeight: 28,
      label: "Optimal Sensor Mounting Point",
      locationName: "Fan Pedestal Main Bearing (DE) - Radial Horizontal",
      quality: "Ideal" as const,
      reason: "Highest sensitivity plane for overhung aerodynamic unbalance and blade pass forces."
    },
    secondaryPoints: [
      { x: 72, y: 52, label: "Pedestal NDE Bearing", quality: "Acceptable" as const, locationName: "Non-Drive End - Radial Vertical" }
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
        name: "Volute Casing - Hydraulic Reference",
        direction: "Radial Vertical",
        quality: "Acceptable",
        x: 28,
        y: 28,
        whyChosen: "Detects fluid recirculation shock and high-frequency acoustic impact from severe cavitation.",
        diagnosticFocus: "Fluid cavitation, vane pass frequency (VPF), discharge turbulence.",
        surfaceTip: "Place on heavy volute wall, avoid thin suction pipe flanges."
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

export default function MountingPlanner() {
  const [activeTab, setActiveTab] = useState<"scan" | "reference">("scan");

  // Tab 1: Scan States
  const [selectedPresetId, setSelectedPresetId] = useState<string>("preset-pump");
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customImageName, setCustomImageName] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(0);
  const [showPrintChecklist, setShowPrintChecklist] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Tab 2: Reference Guide States
  const [selectedGuideId, setSelectedGuideId] = useState<string>("ref-motor-h");
  const [modalGuide, setModalGuide] = useState<ReferenceGuide | null>(null);
  const [selectedGuidePoint, setSelectedGuidePoint] = useState<ReferencePoint | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Scan Preset Data
  const activePreset = SCAN_PRESETS.find(p => p.id === selectedPresetId) || SCAN_PRESETS[0];
  const activePhoto = customImage || activePreset.imgUrl;

  // File Upload Handlers
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setCustomImage(e.target?.result as string);
      setCustomImageName(file.name);
      triggerScanningAnimation();
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
    triggerScanningAnimation();
  };

  const handleCopySpecs = () => {
    const text = `MOUNTING INSTRUCTIONS:\nLocation: ${activePreset.optimalPoint.locationName}\nRequirement: ${activePreset.optimalPoint.reason}\nSurface Prep: Clean to bare metal, spot-face to 32 µin finish.\nMounting: 1/4"-28 UNF Stud or Epoxy Disc.\nTorque: 2-3 ft-lbs (24-36 in-lbs).`;
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // Filtered reference guides
  const filteredGuides = REFERENCE_GUIDES.filter(g => {
    const matchesCategory = categoryFilter === "All" || g.category === categoryFilter;
    const matchesSearch = g.title.toLowerCase().includes(searchFilter.toLowerCase()) || 
                          g.subtitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          g.isoStandard.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Title & Header Navigation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight font-display">
                Mounting Planner & Field Guide
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Exact sensor placement coordinates, surface preparation specs, and ISO 10816 visual reference library for field mechanics.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Toggle Navigation (Large Tablet-Friendly Controls) */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto shrink-0 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex-1 md:flex-initial px-5 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2.5 min-h-[44px] ${
              activeTab === "scan"
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-extrabold"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Scan Your Equipment</span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] uppercase font-mono rounded bg-slate-900/80 text-emerald-400 border border-emerald-500/30">
              Core
            </span>
          </button>

          <button
            onClick={() => setActiveTab("reference")}
            className={`flex-1 md:flex-initial px-5 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2.5 min-h-[44px] ${
              activeTab === "reference"
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-extrabold"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Reference Guides</span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] uppercase font-mono rounded bg-slate-900/80 text-slate-300 border border-slate-700">
              Library
            </span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: SCAN YOUR EQUIPMENT (THE CORE FEATURE)                       */}
      {/* ==================================================================== */}
      {activeTab === "scan" && (
        <div className="space-y-6">
          {/* Quick Presets Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Or Select Sample Equipment Photo:</span>
              </label>
              <span className="text-[11px] text-slate-500">Click any asset to auto-locate sensors</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SCAN_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id && !customImage;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 group min-h-[52px] ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-950/20"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <img 
                      src={preset.imgUrl} 
                      alt={preset.name}
                      className="w-9 h-9 rounded-lg object-cover border border-slate-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate group-hover:text-emerald-400 transition-colors">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate font-mono">{preset.category}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT / TOP: Image Area with AI Bounding Box Overlay (7 Cols on desktop) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Drag and Drop Zone / Photo Container */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative bg-slate-950 border-2 rounded-2xl overflow-hidden transition-all shadow-2xl ${
                  dragActive
                    ? "border-emerald-400 bg-emerald-950/20"
                    : "border-slate-800"
                }`}
              >
                {/* Upload Action Overlay Header */}
                <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-xs font-bold text-slate-200 font-mono">
                      {customImage ? `Uploaded: ${customImageName}` : activePreset.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 min-h-[36px]"
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{customImage ? "Change Photo" : "Upload / Take Photo"}</span>
                    </button>

                    {customImage && (
                      <button
                        onClick={() => {
                          setCustomImage(null);
                          setCustomImageName("");
                          triggerScanningAnimation();
                        }}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-red-950 hover:text-red-400 text-slate-400 text-xs rounded-lg border border-slate-800 transition-colors min-h-[36px]"
                        title="Reset to preset"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>

                {/* Main Photo View Area with AI Overlays */}
                <div className="relative aspect-video sm:aspect-[4/3] lg:aspect-video w-full bg-black flex items-center justify-center overflow-hidden select-none group">
                  <img
                    src={activePhoto}
                    alt="Equipment"
                    className={`w-full h-full object-cover transition-all duration-500 ${
                      isScanning ? "filter blur-sm opacity-60 scale-105" : "opacity-90 group-hover:opacity-100"
                    }`}
                    referrerPolicy="no-referrer"
                  />

                  {/* Scanning Animation Effect */}
                  {isScanning && (
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-40 space-y-3">
                      <div className="relative w-16 h-16 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin"></div>
                        <Target className="w-8 h-8 text-emerald-400 animate-pulse" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider font-mono">
                          AI COMPUTER VISION SCANNING
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Locating shaft axes & bearing load zones...</p>
                      </div>
                    </div>
                  )}

                  {/* AI OVERLAY: Glowing Green Bounding Box & Target Pins */}
                  {!isScanning && (
                    <>
                      {/* 1. Primary Optimal Mounting Point Bounding Box (Glowing Neon Green) */}
                      <div
                        style={{
                          left: `${activePreset.optimalPoint.x - activePreset.optimalPoint.boxWidth / 2}%`,
                          top: `${activePreset.optimalPoint.y - activePreset.optimalPoint.boxHeight / 2}%`,
                          width: `${activePreset.optimalPoint.boxWidth}%`,
                          height: `${activePreset.optimalPoint.boxHeight}%`
                        }}
                        className="absolute border-2 border-emerald-400 bg-emerald-500/15 rounded-xl shadow-[0_0_25px_rgba(34,197,94,0.6)] transition-all z-20 pointer-events-none animate-pulse"
                      >
                        {/* Corner Target Brackets */}
                        <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-300"></div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-300"></div>
                        <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-300"></div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-300"></div>

                        {/* Top Label Badge */}
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 bg-emerald-500 text-slate-950 font-mono text-[10px] font-extrabold tracking-wider rounded shadow-lg flex items-center gap-1 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 fill-slate-950 text-emerald-400" />
                          <span>{activePreset.optimalPoint.label}</span>
                        </div>
                      </div>

                      {/* Targeted Pin Marker on Primary Spot */}
                      <button
                        onClick={() => setSelectedPointIndex(0)}
                        style={{
                          left: `${activePreset.optimalPoint.x}%`,
                          top: `${activePreset.optimalPoint.y}%`
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-all cursor-pointer flex flex-col items-center group/pin ${
                          selectedPointIndex === 0 ? "scale-125" : "hover:scale-110"
                        }`}
                      >
                        <div className="relative flex items-center justify-center">
                          <span className="absolute w-8 h-8 rounded-full bg-emerald-400/40 animate-ping"></span>
                          <div className="w-9 h-9 rounded-full bg-emerald-500 border-2 border-white text-slate-950 font-extrabold font-mono text-xs flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.9)]">
                            1
                          </div>
                        </div>
                        <span className="mt-1 px-2 py-0.5 bg-slate-950/90 text-emerald-400 font-mono text-[9px] font-bold rounded border border-emerald-500/40 whitespace-nowrap shadow-md">
                          OPTIMAL SPOT
                        </span>
                      </button>

                      {/* Secondary Pins (Amber / Acceptable) */}
                      {activePreset.secondaryPoints.map((pt, idx) => {
                        const pointNum = idx + 2;
                        const isSelected = selectedPointIndex === pointNum - 1;
                        const isIdeal = pt.quality === "Ideal";
                        const colorClass = isIdeal 
                          ? "bg-emerald-500 text-slate-950 border-white text-emerald-400" 
                          : "bg-amber-500 text-slate-950 border-white text-amber-400";

                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedPointIndex(pointNum - 1)}
                            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 z-25 transition-all cursor-pointer flex flex-col items-center ${
                              isSelected ? "scale-125" : "hover:scale-110"
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full ${isIdeal ? 'bg-emerald-500' : 'bg-amber-500'} border-2 border-white font-extrabold font-mono text-[11px] text-slate-950 flex items-center justify-center shadow-lg`}>
                              {pointNum}
                            </div>
                            <span className={`mt-0.5 px-1.5 py-0.5 bg-slate-950/90 font-mono text-[8px] font-bold rounded border ${isIdeal ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'} whitespace-nowrap`}>
                              {pt.label}
                            </span>
                          </button>
                        );
                      })}

                      {/* HUD Overlay Footer Badge */}
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                        <div className="px-3 py-1.5 bg-slate-950/90 backdrop-blur-md rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 flex items-center gap-2 shadow-lg">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>AI COMPUTER VISION: <strong>OPTIMAL POINT DETECTED</strong></span>
                        </div>
                        <div className="hidden sm:flex px-2.5 py-1 bg-emerald-500/10 backdrop-blur-md rounded-xl border border-emerald-500/30 text-[10px] font-mono text-emerald-400 font-bold">
                          ISO 10816 SURFACE READY
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Drag and drop prompt helper */}
                <div className="p-3 bg-slate-900/60 border-t border-slate-800 text-center text-xs text-slate-400">
                  <span>💡 Drag & drop any equipment photo into the box above to analyze mounting spots in field.</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Side Panel Instruction Box for Mechanics (5 Cols on desktop) */}
            <div className="lg:col-span-5 space-y-4">
              {/* PRIMARY HIGH-CONTRAST INSTRUCTION BANNER (As requested) */}
              <div className="bg-emerald-500/15 border-2 border-emerald-500/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-start gap-3 relative z-10">
                  <div className="p-2.5 bg-emerald-500 rounded-xl text-slate-950 font-black shrink-0 mt-0.5 shadow-md shadow-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded">
                        FIELD MECHANIC INSTRUCTION
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                      Mount sensor here for best data collection. Ensure surface is clean and flat.
                    </h3>
                  </div>
                </div>
              </div>

              {/* Actionable Surface Prep & Mounting Instructions */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-left shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Step-by-Step Mounting Guide
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-[10px] rounded">
                    ISO 10816 SPEC
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-xl border border-slate-850">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </div>
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-slate-200">Surface Cleaning & Degreasing</p>
                      <p className="text-slate-400 leading-relaxed">
                        Scrape off paint, rust, and oil using citrus degreaser. Surface must be bare metal.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-xl border border-slate-850">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      2
                    </div>
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-slate-200">Surface Flatness & Spot-Facing</p>
                      <p className="text-slate-400 leading-relaxed">
                        Prepare a 1.25" diameter flat land with smooth 32 µin finish using a spot-facing tool.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-xl border border-slate-850">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      3
                    </div>
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-slate-200">Attachment Method & Torque</p>
                      <p className="text-slate-400 leading-relaxed">
                        Drill & tap 1/4-28 UNF thread. Torque stud-mount sensor to <strong>2-3 ft-lbs (24-36 in-lbs)</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Target location details */}
                <div className="p-3.5 bg-slate-950/80 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 font-mono uppercase">Target Bearing Zone:</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold font-mono rounded border border-emerald-500/30">
                      Ideal Target Spot
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white">
                    {activePreset.optimalPoint.locationName}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {activePreset.optimalPoint.reason}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                  <button
                    onClick={handleCopySpecs}
                    className="w-full sm:flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {copiedNotification ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        <span>Copy Mounting Specs</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowPrintChecklist(true)}
                    className="w-full sm:flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Print Field Sheet</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: REFERENCE GUIDES (THE VISUAL LIBRARY)                        */}
      {/* ==================================================================== */}
      {activeTab === "reference" && (
        <div className="space-y-6">
          {/* Controls & Search Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-lg">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {["All", "Electric Drives", "Fluid Machinery", "Power Transmission", "Air Handling", "Compressors"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[40px] ${
                    categoryFilter === cat
                      ? "bg-emerald-500 text-slate-950 font-extrabold shadow-md shadow-emerald-500/20"
                      : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative shrink-0 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search machinery, ISO standards..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Grid of Clean Technical Vector Diagrams */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGuides.map((guide) => {
              return (
                <div
                  key={guide.id}
                  onClick={() => {
                    setModalGuide(guide);
                    setSelectedGuidePoint(guide.points[0] || null);
                  }}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 transition-all group cursor-pointer shadow-lg hover:shadow-emerald-950/20 flex flex-col justify-between hover:-translate-y-1 relative overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase font-mono tracking-wider">
                          {guide.category}
                        </span>
                        <h3 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                          {guide.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{guide.subtitle}</p>
                      </div>

                      <span className="px-2 py-1 bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 font-bold rounded shrink-0">
                        {guide.isoStandard}
                      </span>
                    </div>

                    {/* SVG Line Drawing Container with Pins */}
                    <div className="relative aspect-[16/10] bg-slate-950 border border-slate-850 rounded-xl overflow-hidden p-4 flex items-center justify-center group-hover:border-slate-700 transition-colors">
                      <RenderMachineSVG type={guide.svgType} />

                      {/* Pins on Diagram */}
                      {guide.points.map((pt) => {
                        const isIdeal = pt.quality === "Ideal";
                        return (
                          <div
                            key={pt.id}
                            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center"
                          >
                            <span className={`absolute w-6 h-6 rounded-full ${isIdeal ? 'bg-emerald-400/40' : 'bg-amber-400/40'} animate-ping`}></span>
                            <div className={`w-6 h-6 rounded-full ${isIdeal ? 'bg-emerald-500' : 'bg-amber-500'} text-slate-950 font-extrabold font-mono text-[10px] flex items-center justify-center border-2 border-white shadow-md`}>
                              {pt.number}
                            </div>
                          </div>
                        );
                      })}

                      {/* Expand prompt badge */}
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-slate-900/90 text-[10px] font-mono text-slate-300 rounded border border-slate-800 flex items-center gap-1 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                        <Maximize2 className="w-3 h-3" />
                        <span>Inspect Points</span>
                      </div>
                    </div>

                    {/* Quick Specs Footer */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">ISO Measurement Points:</span>
                        <span className="font-mono font-bold text-slate-200">{guide.points.length} Points Configured</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Recommended Mount:</span>
                        <span className="font-mono text-emerald-400 font-bold truncate max-w-[180px]">
                          {guide.recommendedMounting.split("Or")[0]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom CTA */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                    <span>View Diagram & Placement Rules</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* EXPANDED MODAL FOR REFERENCE GUIDE DIAGRAMS                          */}
      {/* ==================================================================== */}
      {modalGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 p-6 relative text-left">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase rounded">
                    {modalGuide.category}
                  </span>
                  <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-mono font-bold rounded">
                    {modalGuide.isoStandard}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">{modalGuide.title}</h2>
                <p className="text-xs text-slate-400">{modalGuide.subtitle}</p>
              </div>

              <button
                onClick={() => setModalGuide(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Large Diagram with Clickable Interactive Pins (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="relative aspect-[16/10] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-6 flex items-center justify-center shadow-inner">
                  <RenderMachineSVG type={modalGuide.svgType} />

                  {/* Interactive Pins */}
                  {modalGuide.points.map((pt) => {
                    const isSelected = selectedGuidePoint?.id === pt.id;
                    const isIdeal = pt.quality === "Ideal";

                    return (
                      <button
                        key={pt.id}
                        onClick={() => setSelectedGuidePoint(pt)}
                        style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-all cursor-pointer flex flex-col items-center ${
                          isSelected ? "scale-125 z-40" : "hover:scale-110"
                        }`}
                      >
                        <div className="relative flex items-center justify-center">
                          {isSelected && (
                            <span className={`absolute w-10 h-10 rounded-full ${isIdeal ? 'bg-emerald-400/50' : 'bg-amber-400/50'} animate-ping`}></span>
                          )}
                          <div
                            className={`w-8 h-8 rounded-full ${
                              isIdeal ? 'bg-emerald-500' : 'bg-amber-500'
                            } text-slate-950 font-black font-mono text-xs flex items-center justify-center border-2 border-white shadow-[0_0_15px_rgba(0,0,0,0.5)]`}
                          >
                            {pt.number}
                          </div>
                        </div>
                        <span className={`mt-1 px-2 py-0.5 bg-slate-950/90 font-mono text-[9px] font-bold rounded border ${
                          isIdeal ? 'text-emerald-400 border-emerald-500/40' : 'text-amber-400 border-amber-500/40'
                        } whitespace-nowrap shadow-md`}>
                          {pt.name.split(" - ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Point Selector Pills */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Select Measurement Point:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {modalGuide.points.map((pt) => {
                      const isSelected = selectedGuidePoint?.id === pt.id;
                      const isIdeal = pt.quality === "Ideal";
                      return (
                        <button
                          key={pt.id}
                          onClick={() => setSelectedGuidePoint(pt)}
                          className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2 ${
                            isSelected
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md"
                              : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full ${isIdeal ? 'bg-emerald-500' : 'bg-amber-500'} text-slate-950 font-mono text-[10px] flex items-center justify-center shrink-0`}>
                            {pt.number}
                          </span>
                          <span className="truncate">{pt.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Detailed Technical Explanation Side Panel (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {selectedGuidePoint ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-mono font-extrabold text-xs flex items-center justify-center">
                          {selectedGuidePoint.number}
                        </span>
                        <h3 className="text-sm font-bold text-white">{selectedGuidePoint.name}</h3>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded border ${
                        selectedGuidePoint.quality === "Ideal" 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      }`}>
                        {selectedGuidePoint.quality.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
                          Why This Specific Point is Chosen:
                        </span>
                        <p className="text-slate-200 mt-1 leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-850">
                          {selectedGuidePoint.whyChosen}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
                          Diagnostic Fault Focus:
                        </span>
                        <p className="text-emerald-400 font-mono mt-1 bg-slate-900 p-2.5 rounded-xl border border-slate-850">
                          {selectedGuidePoint.diagnosticFocus}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
                          Surface Preparation Rule:
                        </span>
                        <p className="text-slate-300 mt-1 leading-relaxed">
                          {selectedGuidePoint.surfaceTip}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
                    Click any point on the diagram to see technical details.
                  </div>
                )}

                {/* Overall Machinery Guidelines Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
                  <h4 className="font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>General Mounting Standard</span>
                  </h4>
                  <p className="text-slate-300 leading-relaxed">
                    {modalGuide.generalAdvice}
                  </p>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Recommended Mount:</span>
                    <span className="font-mono text-emerald-400 font-bold">{modalGuide.recommendedMounting}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setModalGuide(null)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-colors"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT FIELD CHECKLIST MODAL */}
      {showPrintChecklist && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span>Field Sensor Mounting Checklist</span>
              </h3>
              <button onClick={() => setShowPrintChecklist(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-1">
                <p className="font-bold text-emerald-400">Target Asset: {activePreset.name}</p>
                <p className="text-slate-400">Optimal Location: {activePreset.optimalPoint.locationName}</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-2 bg-slate-950 rounded-lg cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-700 text-emerald-500 focus:ring-0" />
                  <span>Degrease and remove paint/rust (bare metal land)</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 bg-slate-950 rounded-lg cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-700 text-emerald-500 focus:ring-0" />
                  <span>Spot-face flat land (1.25" diameter, 32 µin finish)</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 bg-slate-950 rounded-lg cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-700 text-emerald-500 focus:ring-0" />
                  <span>Drill & tap 1/4"-28 UNF thread or apply 2-part epoxy</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 bg-slate-950 rounded-lg cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-700 text-emerald-500 focus:ring-0" />
                  <span>Torque stud mount to 24-36 in-lbs (2-3 ft-lbs)</span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => {
                  window.print();
                  setShowPrintChecklist(false);
                }}
                className="px-4 py-2.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-emerald-400 transition-colors"
              >
                Print Document
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
