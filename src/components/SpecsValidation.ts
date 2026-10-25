// SpecsValidation.ts - Validation logic, Tooltips & Unit Converters for Spectra CM

export interface ManufacturerModelPreset {
  id: string;
  manufacturer: string;
  model: string;
  equipmentType: string;
  category: string;
  description: string;
  specs: Record<string, string>;
  commonBearings: {
    inboard: string;
    outboard: string;
  };
}

export interface ExistingAssetPreset {
  id: string;
  assetName: string;
  serialNumber: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  location: string;
  specs: Record<string, string>;
}

export const FIELD_TOOLTIPS: Record<string, string> = {
  manufacturer: "The original equipment manufacturer (OEM) brand name.",
  model: "Exact OEM model or catalog number stamped on the nameplate.",
  serialNumber: "Unique plant serial number for tracking maintenance logs & preventing duplicates.",
  equipmentType: "Primary mechanical classification governing vibration analysis standards.",
  assetCriticality: "Plant operational risk level. Critical assets trigger tighter ISO vibration alarm limits.",
  specOrientation: "Physical mounting plane. Vertical units experience top-heavy structural reed resonance.",
  specRpm: "Target nominal operating shaft speed in Revolutions Per Minute. Critical 1X fundamental frequency.",
  horsepower: "Engineered power capacity rating in Horsepower (HP). Used to calculate torque loads.",
  powerRating: "Nominal electrical or mechanical power rating (kW or HP).",
  voltage: "Operating electrical line voltage rating (e.g. 230/460V AC).",
  current: "Full load current draw rating in Amperes (FLA).",
  lineFrequency: "AC power grid supply frequency (60 Hz North America, 50 Hz Europe/Asia).",
  numPoles: "Number of magnetic stator poles. Governs synchronous speed (e.g., 4 Poles = 1800 RPM @ 60Hz).",
  motorType: "Stator / rotor construction (e.g., Induction, Synchronous, VFD-driven, DC).",
  motorWinding: "Stator winding geometry and insulation grade.",
  insulationClass: "Thermal endurance rating (Class F = 155°C, Class H = 180°C).",
  numRotorBars: "Count of conductive squirrel-cage rotor bars. Essential for detecting broken rotor bar harmonics (RBPF).",
  frameSize: "NEMA or IEC standard mounting footprint dimensions.",
  pumpType: "Hydraulic pump mechanism type (Centrifugal, Positive Displacement, Multistage).",
  impellerVanes: "Number of internal impeller blades. Directly determines Vane Pass Frequency (VPF = RPM x Vanes / 60).",
  impellerDiameter: "Outer diameter of the fitted impeller in inches.",
  flowRate_GPM: "Nominal volumetric fluid flow rate in Gallons Per Minute.",
  headPressure: "Total dynamic head pressure developed by pump in feet or PSI.",
  suctionPressure: "Inlet NPSH static suction pressure in PSI.",
  dischargePressure: "Outlet discharge line pressure in PSI.",
  numBlades: "Count of fan/blower rotor blades. Directly determines Blade Pass Frequency (BPF = RPM x Blades / 60).",
  fanType: "Aerodynamic airflow design (Centrifugal, Axial Flow, Propeller, Blower).",
  bladeAngle: "Blade pitch arrangement (Fixed Pitch, Variable Vane, Backward Curved).",
  gearRatio: "Ratio of input shaft speed to output shaft speed.",
  gearType: "Tooth engagement profile (Spur, Helical, Bevel, Planetary, Worm).",
  inputTeeth: "Pinion gear tooth count on high-speed input shaft.",
  outputTeeth: "Driven gear tooth count on low-speed output shaft.",
  compressorType: "Compression technology (Rotary Screw, Centrifugal Turbo, Reciprocating).",
  numStages: "Number of sequential compression stages.",
  numCylinders: "Count of reciprocating piston cylinders.",
  numLobes: "Count of male & female rotor helical lobes. Determines Lobe Mesh Frequency.",
  bearingType: "Rolling element bearing construction (Ball, Tapered Roller, Spherical, Sleeve).",
  bearing_inner: "Inboard bearing part number (e.g. SKF 6308 C3). Crucial for BPFO/BPFI calculation.",
  bearing_outer: "Outboard bearing part number (e.g. SKF 6207).",
  driveType: "Power transmission coupling method (Direct Coupled, Belt Drive, Gear Drive, Magnetic).",
  lubricationType: "Specified grease grade or synthetic ISO VG oil viscosity grade."
};

// 4. UNIT CONVERSION HELPERS
export const UnitConverters = {
  kwToHp: (kw: number): number => Math.round((kw * 1.34102) * 10) / 10,
  hpToKw: (hp: number): number => Math.round((hp * 0.7457) * 10) / 10,
  gpmToM3h: (gpm: number): number => Math.round((gpm * 0.227125) * 10) / 10,
  m3hToGpm: (m3h: number): number => Math.round((m3h * 4.40287) * 10) / 10,
  psiToBar: (psi: number): number => Math.round((psi * 0.0689476) * 100) / 100,
  barToPsi: (bar: number): number => Math.round((bar * 14.5038) * 10) / 10
};

// 5. FIELD VALIDATION STATUS RESULT
export interface FieldValidation {
  status: "valid" | "warning" | "error";
  message?: string;
}

// 6. REAL-TIME VALIDATION HELPER FUNCTION WITH USEFUL CONTEXTUAL MESSAGES
export function validateField(key: string, value: string, specs: Record<string, string>, equipmentType: string): FieldValidation {
  if (!value || value.trim() === "") {
    return { status: "valid" }; // Empty value handled by required checks
  }

  const numVal = parseFloat(value);

  switch (key) {
    case "specRpm":
      if (isNaN(numVal) || numVal <= 0) {
        return { status: "error", message: "RPM must be a positive number greater than 0." };
      }
      if (equipmentType === "Electric Motor" || equipmentType === "Motor") {
        if (numVal < 300 || numVal > 7200) {
          return { status: "warning", message: "Unusual motor RPM. Typical induction motor speeds are 850 - 3600 RPM." };
        }
        // Check if close to standard 60Hz induction speeds (3600, 1800, 1200, 900)
        const stdSpeeds = [3600, 1800, 1200, 900, 720, 600, 3000, 1500, 1000];
        const isNearStd = stdSpeeds.some(s => Math.abs(numVal - s) < 150);
        if (!isNearStd) {
          return { status: "warning", message: `Note: ${numVal} RPM is non-standard. Consider slip speed (e.g. 1775 for 1800 sync).` };
        }
      }
      return { status: "valid" };

    case "horsepower":
    case "powerRating":
      if (isNaN(numVal) || numVal < 0) {
        return { status: "error", message: "Power rating must be 0 or a positive number." };
      }
      if (numVal > 5000) {
        return { status: "warning", message: "High power rating detected (>5,000 HP). Ensure correct unit." };
      }
      return { status: "valid" };

    case "impellerVanes":
      if (isNaN(numVal) || !Number.isInteger(numVal) || numVal <= 0) {
        return { status: "error", message: "Impeller vanes must be a positive whole integer (e.g. 3, 5, 7)." };
      }
      if (numVal < 2 || numVal > 16) {
        return { status: "warning", message: "Most pump impellers have 3 to 12 vanes." };
      }
      return { status: "valid" };

    case "numBlades":
      if (isNaN(numVal) || !Number.isInteger(numVal) || numVal <= 0) {
        return { status: "error", message: "Blade count must be a positive whole integer (e.g. 6, 8, 12)." };
      }
      if (numVal > 60) {
        return { status: "warning", message: "High blade count (>60). Verify if this is a high-density turbine or blower." };
      }
      return { status: "valid" };

    case "numRotorBars":
      if (isNaN(numVal) || !Number.isInteger(numVal) || numVal < 0) {
        return { status: "error", message: "Rotor bar count must be 0 or a positive integer." };
      }
      if (numVal > 0 && (numVal < 14 || numVal > 96)) {
        return { status: "warning", message: "Unusual rotor bar count. Standard 3-phase motors typically have 28-72 bars." };
      }
      return { status: "valid" };

    case "lineFrequency":
      if (numVal !== 50 && numVal !== 60 && numVal !== 400 && value !== "50" && value !== "60") {
        return { status: "warning", message: "Standard grid line frequency is 60 Hz (Americas) or 50 Hz (Europe/Asia)." };
      }
      return { status: "valid" };

    case "numPoles":
      if (isNaN(numVal) || numVal % 2 !== 0 || numVal <= 0) {
        return { status: "error", message: "Motor pole count must be an EVEN integer (2, 4, 6, 8, 10, 12)." };
      }
      return { status: "valid" };

    case "gearRatio":
      if (isNaN(numVal) || numVal <= 0) {
        return { status: "error", message: "Gear ratio must be a positive number greater than 0." };
      }
      if (numVal > 200) {
        return { status: "warning", message: "High gear ratio (>200:1). Ensure total multi-stage reduction ratio is calculated." };
      }
      return { status: "valid" };

    case "serialNumber":
      if (value.length < 3) {
        return { status: "warning", message: "Serial number is unusually short." };
      }
      return { status: "valid" };

    default:
      return { status: "valid" };
  }
}

// ISO Standard Defaults generator for one-click population
export function getIsoStandardDefaults(equipmentType: string): Record<string, string> {
  switch (equipmentType) {
    case "Pump Unit":
    case "Pump":
      return {
        pumpType: "Centrifugal",
        specRpm: "1750",
        impellerVanes: "5",
        impellerDiameter: "8.5",
        flowRate_GPM: "250",
        bearingType: "Ball",
        bearing_inner: "6309 C3",
        bearing_outer: "6208 C3",
        driveType: "Direct Coupled",
        specOrientation: "Horizontal Mount",
        assetCriticality: "Medium",
        lubricationType: "ISO VG 68 Mineral Oil"
      };

    case "Electric Motor":
    case "Motor":
      return {
        motorType: "Induction",
        specRpm: "1775",
        horsepower: "15",
        powerRating: "11 kW",
        lineFrequency: "60",
        numPoles: "4",
        numRotorBars: "36",
        frameSize: "254T",
        insulationClass: "Class F",
        bearingType: "Ball",
        bearing_inner: "6309 C3",
        bearing_outer: "6208 C3",
        driveType: "Direct Coupled",
        specOrientation: "Horizontal Mount",
        assetCriticality: "Medium",
        lubricationType: "Polyurea Grease"
      };

    case "Ventilation Fan":
    case "Fan":
    case "Blower":
      return {
        fanType: "Centrifugal",
        specRpm: "1180",
        numBlades: "10",
        fanBlades: "10",
        bladeAngle: "Backward Inclined",
        driveType: "Belt Drive",
        bearingType: "Pillow Block Ball",
        bearing_inner: "UC209",
        bearing_outer: "UC208",
        specOrientation: "Horizontal Mount",
        assetCriticality: "Medium",
        lubricationType: "Lithium Grease #2"
      };

    case "Gearbox":
      return {
        gearType: "Helical",
        specRpm: "1750",
        gearRatio: "12.5",
        inputTeeth: "20",
        outputTeeth: "250",
        numShafts: "2",
        bearingType: "Tapered Roller",
        bearing_inner: "Timken 32208",
        bearing_outer: "Timken 32210",
        driveType: "Gear Drive",
        specOrientation: "Horizontal Mount",
        assetCriticality: "High",
        lubricationType: "ISO VG 220 Gear Oil"
      };

    case "Compressor":
      return {
        compressorType: "Screw",
        specRpm: "3550",
        numLobes: "4/6",
        numStages: "1",
        dischargePressure: "125",
        bearingType: "Angular Contact Ball",
        bearing_inner: "7312 BECBM",
        bearing_outer: "7310 BECBM",
        driveType: "Direct Coupled",
        specOrientation: "Horizontal Mount",
        assetCriticality: "Critical",
        lubricationType: "Synthetic PAG Compressor Oil"
      };

    default:
      return {
        specRpm: "1750",
        bearingType: "Ball",
        driveType: "Direct Coupled",
        specOrientation: "Horizontal Mount",
        assetCriticality: "Medium"
      };
  }
}
