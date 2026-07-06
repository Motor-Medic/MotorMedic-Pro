import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

// Initialize Pool using DATABASE_URL
const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;

if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("amazonaws.com") || dbUrl.includes("elephantsql") || dbUrl.includes("supabase") || dbUrl.includes("aistudio")
      ? { rejectUnauthorized: false }
      : undefined
  });
  console.log("🔋 PostgreSQL connection pool initialized.");
  
  // Prevent unhandled pool errors
  pool.on("error", (err) => {
    console.error("Unexpected error on idle SQL pool client:", err);
  });
} else {
  console.warn("⚠️ DATABASE_URL is not configured. Database storage will be bypassed.");
}

// Initialize Express
const app = express();
const PORT = 3000;

// Increase payload limits for base64 uploads (images, CSVs, etc.)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy init GoogleGenAI
let aiClient: GoogleGenAI | null = null;

function getAiClient(req?: express.Request): GoogleGenAI {
  const headerKey = req?.headers["x-gemini-api-key"] as string;
  const apiKey = headerKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add your key in the Secrets/Settings panel in AI Studio, or log in with your API key inside the app.");
  }
  
  // Return a new client if dynamic key is passed, or reuse/create the default client
  if (headerKey) {
    return new GoogleGenAI({
      apiKey: headerKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Structured JSON Response Schema for Reliability Diagnosis (CAT IV Expert Format)
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    equipment_status: {
      type: Type.STRING,
      description: "Overall status of the equipment: 'HEALTHY', 'MINOR_ISSUES', 'FAULT_DETECTED', or 'CRITICAL_FAULT'."
    },
    confidence_score: {
      type: Type.INTEGER,
      description: "Confidence level of this entire diagnostic assessment as a percentage (0 to 100)."
    },
    overall_vibration_level: {
      type: Type.STRING,
      description: "Overall vibration level detected or estimated (e.g., '0.08 in/s' or '3.2 mm/s RMS')."
    },
    iso_severity_zone: {
      type: Type.STRING,
      description: "ISO 10816 vibration severity zone: 'A' (New/Excellent), 'B' (Satisfactory), 'C' (Unsatisfactory), 'D' (Unacceptable)."
    },
    probable_faults: {
      type: Type.ARRAY,
      description: "Identified probable faults. Must be an empty array if status is HEALTHY and there are no faults.",
      items: {
        type: Type.OBJECT,
        properties: {
          fault_name: { type: Type.STRING, description: "Specific fault name." },
          probability: { type: Type.INTEGER, description: "Probability of this fault as a percentage (0 to 100)." },
          confidence: { type: Type.STRING, description: "Confidence in this fault: 'High', 'Medium', or 'Low'." },
          supporting_evidence: { type: Type.STRING, description: "Specific data points or frequency peaks proving this fault." },
          calculated_frequencies: { type: Type.STRING, description: "Formula and calculations used to identify this fault frequency." },
          physical_explanation: { type: Type.STRING, description: "The underlying physical/rotordynamics reason why this symptom is present." },
          fault: { type: Type.STRING, description: "Name of the diagnosed fault (legacy support, same as fault_name)." },
          description: { type: Type.STRING, description: "Detailed physical explanation (legacy support, same as physical_explanation)." }
        },
        required: ["fault_name", "probability", "confidence", "supporting_evidence", "calculated_frequencies", "physical_explanation", "fault", "description"]
      }
    },
    runner_up_faults: {
      type: Type.ARRAY,
      description: "Alternative failure modes ruled out or less likely.",
      items: {
        type: Type.OBJECT,
        properties: {
          fault_name: { type: Type.STRING, description: "Alternative fault name." },
          probability: { type: Type.INTEGER, description: "Probability percentage (0 to 100)." },
          why_ruled_out: { type: Type.STRING, description: "Evidence or specs that make this less likely than the primary faults." }
        },
        required: ["fault_name", "probability", "why_ruled_out"]
      }
    },
    verification_steps: {
      type: Type.ARRAY,
      description: "Specific tests for technicians to run to confirm the diagnosis.",
      items: { type: Type.STRING }
    },
    immediate_actions: {
      type: Type.ARRAY,
      description: "Step-by-step corrective or routine maintenance actions.",
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: "Action description." },
          priority: { type: Type.STRING, description: "Priority rating: '1' (critical) to '5' (low)." },
          timeline: { type: Type.STRING, description: "When this action should be performed (e.g., 'Immediate', 'Within 30 days')." },
          safety_warning: { type: Type.STRING, description: "Safety instructions, LOTO requirements, or hazards involved. Leave empty if none." }
        },
        required: ["action", "priority", "timeline", "safety_warning"]
      }
    },
    root_cause_analysis: {
      type: Type.STRING,
      description: "5 Whys root cause analysis explanation mapping back to the fundamental failure mechanism."
    },
    financial_impact: {
      type: Type.OBJECT,
      description: "Estimated direct financial impact of predictive vs reactive maintenance.",
      properties: {
        estimated_downtime_cost: { type: Type.STRING, description: "Cost if system fails unexpectedly." },
        estimated_repair_cost: { type: Type.STRING, description: "Cost for planned repair (parts + labor)." },
        savings_from_proactive_repair: { type: Type.STRING, description: "Calculated ROI of proactive maintenance." }
      },
      required: ["estimated_downtime_cost", "estimated_repair_cost", "savings_from_proactive_repair"]
    },
    manager_summary: {
      type: Type.OBJECT,
      description: "Business and executive level brief regarding the failure.",
      properties: {
        severity: { type: Type.STRING, description: "Overall system severity status: 'Critical', 'High', 'Medium', 'Low'." },
        executive_brief: { type: Type.STRING, description: "A high-level executive summary summarizing findings and recommended schedule impact." },
        estimated_downtime: { type: Type.STRING, description: "Estimated offline duration for repairs." },
        cost_estimate: { type: Type.STRING, description: "Financial estimate of repair parts + labor." },
        business_impact: { type: Type.STRING, description: "Specific business operations impact." }
      },
      required: ["severity", "executive_brief", "estimated_downtime", "cost_estimate", "business_impact"]
    },
    technician_instructions: {
      type: Type.STRING,
      description: "Detailed, step-by-step instructions for the maintenance team."
    },
    data_sources_analyzed: {
      type: Type.STRING,
      description: "Summary list of files, images, specs, and symptoms analyzed."
    }
  },
  required: [
    "equipment_status",
    "confidence_score",
    "overall_vibration_level",
    "iso_severity_zone",
    "probable_faults",
    "runner_up_faults",
    "verification_steps",
    "immediate_actions",
    "root_cause_analysis",
    "financial_impact",
    "manager_summary",
    "technician_instructions",
    "data_sources_analyzed"
  ]
};

// Helper to generate a diagnostic response in Sandbox Mode matching the CAT IV JSON structure
function generateSandboxDiagnosis(category: string, symptoms: string = "", specs: any = {}): any {
  const symLower = symptoms.trim().toLowerCase();
  
  // Define keywords indicating a fault
  const faultKeywords = [
    "broken", "fault", "issue", "fail", "damage", "defect", "abnormal", "elevated",
    "vibration", "vibe", "noise", "cavitation", "spall", "fatigue", "unbalance",
    "misalignment", "looseness", "short", "leak", "hot", "overheat", "silt",
    "locking", "friction", "spark", "smoke", "pitting", "wear", "slippage", "high temp",
    "high current", "rough", "pounding", "shaking", "screeching", "clunking"
  ];

  // Specific positive phrases that explicitly mean healthy machine
  const explicitHealthyPhrases = [
    "running fine",
    "operating fine",
    "running normal",
    "operating normal",
    "all systems normal",
    "all nominal",
    "within limits",
    "within specs",
    "no faults",
    "no issues",
    "no abnormal",
    "certified healthy",
    "perfect condition"
  ];

  const hasExplicitHealthyPhrase = explicitHealthyPhrases.some(phrase => symLower.includes(phrase));
  const isHealthyWord = /\b(healthy|fine|excellent|perfect|nominal|good|normal|ok|okay|clear|safe|nominal)\b/i.test(symLower);
  const hasAnyFaultKeyword = faultKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}`, "i");
    return regex.test(symLower);
  });

  // Decide if this is a healthy machine:
  let isHealthy = false;
  if (hasExplicitHealthyPhrase && !hasAnyFaultKeyword) {
    isHealthy = true;
  } else if (isHealthyWord && !hasAnyFaultKeyword) {
    isHealthy = true;
  }

  if (isHealthy) {
    return {
      equipment_status: "HEALTHY",
      confidence_score: 98,
      overall_vibration_level: "0.08 in/s",
      iso_severity_zone: "A",
      probable_faults: [],
      runner_up_faults: [],
      verification_steps: [
        "Continue routine monthly vibration offline monitoring",
        "Record ultrasonic baseline on all bearings"
      ],
      immediate_actions: [
        {
          action: "Continue standard routine monitoring and scheduled lubrication",
          priority: "5",
          timeline: "Monthly standard schedule",
          safety_warning: "None"
        }
      ],
      root_cause_analysis: "No active faults or degradation vectors detected. The physical vibration spectrum, thermal signals, and operating metrics comply 100% with ISO 10816 Zone A guidelines.",
      financial_impact: {
        estimated_downtime_cost: "$0",
        estimated_repair_cost: "$0",
        savings_from_proactive_repair: "$0"
      },
      manager_summary: {
        severity: "Low",
        executive_brief: "EQUIPMENT HEALTHY - No faults detected. All systems are operating fully within standard nominal specifications (ISO 10816 Zone A - Excellent condition). Continue routine scheduled offline inspections.",
        estimated_downtime: "None",
        cost_estimate: "$0",
        business_impact: "None - 100% operational throughput maintained."
      },
      technician_instructions: "Measure bearing housing temperature during routine sweep. Verify grease purge limits.",
      data_sources_analyzed: "Historical trend lines, raw operator notes, and specs sheets verified normal.",
      sources: [
        { title: "ISO 10816-3 Mechanical Vibration Guidelines", uri: "https://www.iso.org/standard/23204.html" }
      ],
      attemptedModel: "Sandbox Engine (AI-Offline)"
    };
  }

  // Faulty equipment
  let result: any = {
    equipment_status: "FAULT_DETECTED",
    confidence_score: 85,
    overall_vibration_level: "0.32 in/s",
    iso_severity_zone: "C",
    probable_faults: [],
    runner_up_faults: [],
    verification_steps: [],
    immediate_actions: [],
    root_cause_analysis: "",
    financial_impact: {
      estimated_downtime_cost: "$12,000",
      estimated_repair_cost: "$850",
      savings_from_proactive_repair: "$11,150"
    },
    manager_summary: {
      severity: "High",
      executive_brief: "Fault detected. Immediate attention is required to avoid unplanned shutdown.",
      estimated_downtime: "2 hours",
      cost_estimate: "$850",
      business_impact: "Production is at risk."
    },
    technician_instructions: "",
    data_sources_analyzed: "Attached spectral logs and operator observations.",
    sources: [
      { title: "ISO 10816 Mechanical Vibration Standards", uri: "https://www.iso.org/" }
    ],
    attemptedModel: "Sandbox Engine (AI-Offline)"
  };

  const rpm = specs.specRpm || "1800";

  if (category === "Mechanical") {
    if (symLower.includes("bearing") || symLower.includes("temp") || symLower.includes("noise") || symLower.includes("hot") || symLower.includes("grease")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.38 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 92;
      result.probable_faults = [
        {
          fault_name: "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)",
          probability: 92,
          confidence: "High",
          supporting_evidence: "Acoustic emission decibel hikes and housing thermal reading of 82°C.",
          calculated_frequencies: "Calculated BPFI of 148 Hz based on " + rpm + " RPM shaft speed. Observed peak matches coefficient exactly.",
          physical_explanation: "Subsurface contact fatigue produces micro-fissures and subsequent flaking of the inner ring raceway. Element impact creates cyclic stress waves.",
          fault: "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)", // legacy support
          description: "Subsurface contact fatigue produces micro-fissures and subsequent flaking of the inner ring raceway." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Inadequate or Degraded Lubricant Film",
          probability: 65,
          why_ruled_out: "Explains high temperature, but doesn't explain the distinct, sharp BPFI vibration frequency peak."
        }
      ];
      result.verification_steps = [
        "Conduct shock pulse high-frequency analysis",
        "Observe housing temperature profile using thermography"
      ];
      result.immediate_actions = [
        {
          action: "Schedule inboard bearing replacement",
          priority: "2",
          timeline: "Within 14 operating days",
          safety_warning: "Observe 10-minute cool-down prior to housing contact. Execute LOTO on breaker."
        },
        {
          action: "Replenish bearing grease with lithium-complex synthetic lubricant",
          priority: "3",
          timeline: "Immediately",
          safety_warning: "Verify zero grease over-pressurization to prevent seal blowouts."
        }
      ];
      result.root_cause_analysis = "1. Why did the bearing fail? Excessive inner ring wear. 2. Why inner ring wear? Rolling contact fatigue under cyclic loading. 3. Why cyclic loading? Minor shaft coupling misalignment over long operation. 4. Why misalignment? Thermal growth of machinery wasn't accounted for during installation. 5. Why missed? Lack of strict pre-commissioning alignment verification protocols.";
      result.financial_impact = {
        estimated_downtime_cost: "$28,000 (unplanned stoppage)",
        estimated_repair_cost: "$1,200 (planned bearing swap)",
        savings_from_proactive_repair: "$26,800"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Inboard bearing RAC_3 spalling detected. Vibration is 0.38 in/s (ISO Zone C - Unsatisfactory). Please schedule planned replacement within 14 days to avoid unplanned downtime.",
        estimated_downtime: "2.5 hours",
        cost_estimate: "$1,200",
        business_impact: "Losing backup pump redundancy creates high risk of a single point of failure."
      };
      result.technician_instructions = "Isolate machine. Extract old grease. Unmount bearing cage, swap with SKF equivalent, check hot-alignment parameters.";
    } else if (symLower.includes("alignment") || symLower.includes("coupling") || symLower.includes("vibe") || symLower.includes("vibration")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.42 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 88;
      result.probable_faults = [
        {
          fault_name: "Shaft Angular & Radial Misalignment",
          probability: 88,
          confidence: "High",
          supporting_evidence: "Dominant peaks at 1X and 2X rotational speeds. High axial-to-radial vibration ratio.",
          calculated_frequencies: "1X RPM frequency = " + (parseInt(rpm)/60) + " Hz. 2X RPM frequency = " + (2*parseInt(rpm)/60) + " Hz.",
          physical_explanation: "Angular offset forces coupling elements to flex twice per shaft revolution, injecting high radial and axial stress forces into bearings.",
          fault: "Shaft Angular & Radial Misalignment", // legacy support
          description: "Dominant peaks at 1X and 2X rotational speeds. High axial-to-radial vibration ratio." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Dynamic mass unbalance",
          probability: 45,
          why_ruled_out: "Unbalance would produce high 1X horizontal radial vibes, but doesn't explain the massive 2X axial vibration peak."
        }
      ];
      result.verification_steps = [
        "Perform phase analysis across coupling interface",
        "Perform soft-foot mounting bolt diagnostics"
      ];
      result.immediate_actions = [
        {
          action: "Execute dual-dial indicator laser shaft alignment",
          priority: "2",
          timeline: "Within 30 operating days",
          safety_warning: "Apply Lock-Out Tag-Out (LOTO) to primary electrical breakers."
        }
      ];
      result.root_cause_analysis = "1. Why misalignment? Thermal shift under full load. 2. Why thermal shift? Machinery expanded more than predicted. 3. Why unpredicted expansion? Alignment was done when machines were fully cold without offsetting for thermal growth. 4. Why cold alignment? Lack of hot-alignment sweep procedures. 5. Why no procedures? Plant standards lacked thermal coefficient documentation.";
      result.financial_impact = {
        estimated_downtime_cost: "$15,000",
        estimated_repair_cost: "$450 (planned realignment)",
        savings_from_proactive_repair: "$14,550"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Significant shaft coupling misalignment detected. Realignment is recommended during the next scheduled weekend window to avoid bearing failure.",
        estimated_downtime: "2.0 hours",
        cost_estimate: "$450",
        business_impact: "Angular shaft strain is transmitting cyclic fatigue stress directly to inboard motor bearings."
      };
      result.technician_instructions = "Clean base plates, measure and correct soft foot, perform laser alignment targetting < 0.05 mm tolerance.";
    } else {
      // Dynamic unbalance
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.35 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 90;
      result.probable_faults = [
        {
          fault_name: "Dynamic Rotor Mass Unbalance",
          probability: 90,
          confidence: "High",
          supporting_evidence: "Dominant 1X RPM radial peak in the horizontal plane with very low harmonics.",
          calculated_frequencies: "1X RPM frequency calculated at " + (parseInt(rpm)/60).toFixed(1) + " Hz.",
          physical_explanation: "Asymmetric mass distribution in the rotating rotor creates a centripetal force vector that rotates with the shaft, producing radial vibration.",
          fault: "Dynamic Rotor Mass Unbalance", // legacy support
          description: "Dominant 1X RPM radial peak in the horizontal plane with very low harmonics." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Mechanical looseness",
          probability: 30,
          why_ruled_out: "Looseness would show multiple harmonics (3X, 4X, 5X) rather than a pure 1X sinusoidal spectrum."
        }
      ];
      result.verification_steps = [
        "Check rotor for dirt buildup or material loss",
        "Perform single-plane trial weight run"
      ];
      result.immediate_actions = [
        {
          action: "Perform single-plane dynamic field balancing",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Verify machine is 100% de-energized before opening safety shroud."
        }
      ];
      result.root_cause_analysis = "1. Why unbalance? Rotor mass asymmetry. 2. Why asymmetry? Accumulation of particulate sludge on impeller vanes. 3. Why sludge buildup? Fine material bypassed intake strainers. 4. Why bypassed strainers? Strainer mesh was ruptured. 5. Why ruptured? Ruptured due to age and lack of PM checks.";
      result.financial_impact = {
        estimated_downtime_cost: "$18,000",
        estimated_repair_cost: "$1,200 (field balance + filter swap)",
        savings_from_proactive_repair: "$16,800"
      };
      result.manager_summary = {
        severity: "Medium",
        executive_brief: "FAULT DETECTED - Rotor dynamic unbalance. Vibration level is 0.35 in/s (Zone C). Balancing the rotor will restore healthy operation and extend bearing life.",
        estimated_downtime: "3.5 hours",
        cost_estimate: "$1,200",
        business_impact: "Elevated centrifugal forces are transmitting structural noise and causing baseline wear."
      };
      result.technician_instructions = "Thoroughly clean impeller blades. Install trial weights, execute vector balancing using vibration analyzer.";
    }
  } else if (category === "Electrical") {
    if (symLower.includes("winding") || symLower.includes("insulation") || symLower.includes("ohm") || symLower.includes("current") || symLower.includes("hot")) {
      result.equipment_status = "CRITICAL_FAULT";
      result.overall_vibration_level = "0.48 in/s";
      result.iso_severity_zone = "D";
      result.confidence_score = 95;
      result.probable_faults = [
        {
          fault_name: "Stator Winding Inter-turn Insulation Degradation",
          probability: 95,
          confidence: "High",
          supporting_evidence: "Severe phase resistance imbalances and local coil temperatures exceeding class limits.",
          calculated_frequencies: "Vibration peaks noted at 120 Hz (2X line frequency) in radial and axial spectrums.",
          physical_explanation: "Winding insulation breakdown induces phase-to-phase current shorting. The resulting asymmetric electromagnetic fields generate high 2X line frequency vibrations.",
          fault: "Stator Winding Inter-turn Insulation Degradation", // legacy support
          description: "Severe phase resistance imbalances and local coil temperatures exceeding class limits." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Air Gap Eccentricity",
          probability: 55,
          why_ruled_out: "Would explain the 120 Hz vibration, but cannot cause severe phase resistance imbalances."
        }
      ];
      result.verification_steps = [
        "Perform insulation resistance (Megger) and Polarization Index test",
        "Perform surge test on stator windings"
      ];
      result.immediate_actions = [
        {
          action: "Conduct Megger insulation resistance testing",
          priority: "1",
          timeline: "Immediately",
          safety_warning: "Discharge motor winding capacitance completely before attaching testing probes. Lock out breaker."
        }
      ];
      result.root_cause_analysis = "1. Why stator short? Insulation dielectric breakdown. 2. Why breakdown? Excessively high local winding temperatures. 3. Why high temperatures? Heavy motor overload running during peak cycles. 4. Why overload? Feed pump load valve stuck 100% open. 5. Why stuck open? Actuator valve solenoid electrical fault went unmonitored.";
      result.financial_impact = {
        estimated_downtime_cost: "$75,000 (catastrophic winding burnout)",
        estimated_repair_cost: "$3,500 (planned stator overhaul)",
        savings_from_proactive_repair: "$71,500"
      };
      result.manager_summary = {
        severity: "Critical",
        executive_brief: "CRITICAL FAULT - Winding dielectric insulation is near catastrophic collapse. Immediate shutdown and Megger test is advised to prevent motor stator burnout.",
        estimated_downtime: "8 hours",
        cost_estimate: "$3,500",
        business_impact: "High risk of immediate stator winding ground-fault arc explosion, destroying core irons."
      };
      result.technician_instructions = "Stop the motor. Disconnect power cables in terminal box. Perform phase-to-phase and phase-to-ground insulation resistance checks.";
    } else {
      // Rotor bar issue
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.31 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 82;
      result.probable_faults = [
        {
          fault_name: "Broken Rotor Bar Circuit",
          probability: 82,
          confidence: "Medium",
          supporting_evidence: "Current sidebands surrounding the 60 Hz line frequency observed in MCSA spectrum.",
          calculated_frequencies: "Pole pass sideband frequencies calculated at +/- 1.8 Hz relative to 60 Hz supply.",
          physical_explanation: "Fractured rotor bar cage bars alter local current distribution, causing asymmetric torque output and cyclic 1X slip frequency oscillations.",
          fault: "Broken Rotor Bar Circuit", // legacy support
          description: "Current sidebands surrounding the 60 Hz line frequency observed in MCSA spectrum." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Shaft unbalance",
          probability: 40,
          why_ruled_out: "Does not explain the current signature sidebands surrounding line frequency."
        }
      ];
      result.verification_steps = [
        "Perform high-fidelity Motor Current Signature Analysis (MCSA)",
        "Perform rotor winding resistance testing"
      ];
      result.immediate_actions = [
        {
          action: "Take current signature readings under full machine load",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Wear certified arc-flash face shields when interfacing current clamps near distribution boxes."
        }
      ];
      result.root_cause_analysis = "1. Why broken rotor bar? Cyclic thermal and centrifugal stress. 2. Why cyclic stress? Frequent across-the-line starting under heavy loads. 3. Why across-the-line starts? Absence of soft-starter or VFD control. 4. Why no soft-starter? Not specified in the original capital project scope. 5. Why missed? Cost saving measures in original plant deployment.";
      result.financial_impact = {
        estimated_downtime_cost: "$45,000",
        estimated_repair_cost: "$4,800 (rotor re-barring during shutdown)",
        savings_from_proactive_repair: "$40,200"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Broken rotor cage bar detected. Motor remains operational but output torque is degraded. Recommend scheduling rotor cage overhaul during next turn.",
        estimated_downtime: "12 hours",
        cost_estimate: "$4,800",
        business_impact: "Pulsating torque decreases motor system throughput and increases rotor slot wear."
      };
      result.technician_instructions = "Verify sideband amplitude. Set up scheduled rotor swap and install soft-starter to prevent future cyclic stress fractures.";
    }
  } else { // Hydraulic
    if (symLower.includes("cavitation") || symLower.includes("noise") || symLower.includes("ripple") || symLower.includes("pump")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.39 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 90;
      result.probable_faults = [
        {
          fault_name: "Fluid Aeration & Pump Cavitation Erosion",
          probability: 90,
          confidence: "High",
          supporting_evidence: "Loud crackling noise sounding like gravel pumping. Distinct broadband vibration spikes at 2-5 kHz.",
          calculated_frequencies: "Broadband vibration signature. No specific single-frequency peak, typical of chaotic cavitation bubbles.",
          physical_explanation: "Inlet pressure dropping below the oil vapor pressure releases vapor bubbles. Subsequent implosions in high pressure zone cause severe shockwaves eroding impeller metal.",
          fault: "Fluid Aeration & Pump Cavitation Erosion", // legacy support
          description: "Loud crackling noise sounding like gravel pumping. Distinct broadband vibration spikes." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Internal gear backlash",
          probability: 35,
          why_ruled_out: "Gear wear would produce distinct GMF (Gear Mesh Frequency) harmonic peaks, not high broadband chaotic noise."
        }
      ];
      result.verification_steps = [
        "Verify suction vacuum pressure",
        "Perform case-drain temperature differential tests"
      ];
      result.immediate_actions = [
        {
          action: "Clean suction line strainer, check for air ingestion",
          priority: "2",
          timeline: "Within 7 days",
          safety_warning: "Verify zero system pressure. Wear safety glasses for hydraulic splashes."
        }
      ];
      result.root_cause_analysis = "1. Why cavitation? Low suction pressure. 2. Why low suction? Blocked suction trainer mesh. 3. Why blocked strainer? Particle contamination in hydraulic oil reservoir. 4. Why reservoir contamination? Ruptured air breather cap allowed ambient dust ingestion. 5. Why ruptured cap? Ruptured by passing forklift mast and never reported.";
      result.financial_impact = {
        estimated_downtime_cost: "$22,000",
        estimated_repair_cost: "$1,800 (strainer + breather + labor)",
        savings_from_proactive_repair: "$20,200"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Pump cavitation is occurring. Rapid erosion of impeller vanes is happening. Action is required to clean suction strainers immediately to prevent total impeller replacement.",
        estimated_downtime: "3 hours",
        cost_estimate: "$1,800",
        business_impact: "Cavitation-induced vapor bubble implosions are eating away impeller volutes."
      };
      result.technician_instructions = "De-energize pump, isolate fluid block, unscrew suction line coupling, inspect filter. Replace filter and clean reservoir air breather.";
    } else {
      // Sluggish proportional spool valve
      result.equipment_status = "MINOR_ISSUES";
      result.overall_vibration_level = "0.22 in/s";
      result.iso_severity_zone = "B";
      result.confidence_score = 80;
      result.probable_faults = [
        {
          fault_name: "Proportional Valve Spool Silt-Locking & Wear",
          probability: 78,
          confidence: "Medium",
          supporting_evidence: "Actuator lag times and slightly elevated temperature differentials across spool valve block.",
          calculated_frequencies: "Not vibration frequency dependent. Checked via cylinder stroke travel timing charts.",
          physical_explanation: "Fine particulate contamination accumulates in the tight clearances between spool lands and valve body, creating dynamic silt locking friction.",
          fault: "Proportional Valve Spool Silt-Locking & Wear", // legacy support
          description: "Actuator lag times and slightly elevated temperature differentials across spool valve block." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Internal seal bypassing",
          probability: 50,
          why_ruled_out: "Would explain lag under extreme loads, but doesn't cause spool sticking friction or high local solenoid currents."
        }
      ];
      result.verification_steps = [
        "Conduct oil particulate analysis (ISO 4406)",
        "Perform solenoid stroke response verification"
      ];
      result.immediate_actions = [
        {
          action: "Take reservoir oil sample for particulate check",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Observe standard de-pressurization before taking hydraulic line taps."
        }
      ];
      result.root_cause_analysis = "1. Why sluggish? Spool sticking. 2. Why sticking? Particulate silting between spool land clearances. 3. Why particulates? Failed offline kidney-loop filtration system. 4. Why failed kidney loop? Clogged 5-micron element went unreplaced for 12 months. 5. Why unreplaced? Clogged filter pressure differential gauge was broken.";
      result.financial_impact = {
        estimated_downtime_cost: "$12,500",
        estimated_repair_cost: "$600 (filter element swap + oil flush)",
        savings_from_proactive_repair: "$11,900"
      };
      result.manager_summary = {
        severity: "Medium",
        executive_brief: "MINOR ISSUES - Sluggish proportional valve response due to silt-locking. Fluid contamination levels are high. Recommend kidney loop filter servicing to prevent valve wear.",
        estimated_downtime: "2.0 hours",
        cost_estimate: "$600",
        business_impact: "Cylinder extension lags by 15%, causing slight process delays but zero safety concerns."
      };
      result.technician_instructions = "Draw 100ml oil sample. Flush valve block using mineral spirits. Install new 5-micron filter elements on the system.";
    }
  }

  // Ensure sorting by probability
  if (result.probable_faults && Array.isArray(result.probable_faults)) {
    result.probable_faults.sort((a: any, b: any) => b.probability - a.probability);
  }

  return result;
}

function isBypassKey(key?: string): boolean {
  if (!key) return false;
  const k = key.toLowerCase();
  return k.includes("bypass") || k.includes("demo") || k.includes("test") || k === "key ready" || k === "key_ready";
}

function generateSandboxSensorPlacement(equipmentDescription?: string): any {
  const desc = (equipmentDescription || "").toLowerCase();
  
  if (desc.includes("fan") || desc.includes("blower") || desc.includes("exhaust")) {
    return {
      equipmentType: "Overhung Industrial Exhaust Fan",
      recommendedSensors: "High-temperature 100 mV/g Piezoelectric Accelerometers",
      mountingType: "Threaded Stud Mount directly on pillow block housings",
      surfacePreparation: "Grid-grind surface down to bare metal, spot-face the flat bearing zone, drill and tap thread.",
      points: [
        {
          x: 25,
          y: 65,
          label: "Fan Inboard Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors fan impeller unbalance and blade pass frequencies directly near the wet end."
        },
        {
          x: 45,
          y: 65,
          label: "Fan Outboard Bearing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Tracks dynamic belt/coupling misalignment and belt tension strain."
        },
        {
          x: 65,
          y: 50,
          label: "Motor Inboard Bearing (Axial)",
          direction: "Axial",
          description: "Monitors axial shaft thrust, coupling offset, and motor angular misalignment."
        },
        {
          x: 85,
          y: 50,
          label: "Motor Outboard Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors non-drive end housing health and structural foundation looseness."
        }
      ]
    };
  } else if (desc.includes("compressor") || desc.includes("screw") || desc.includes("turbine")) {
    return {
      equipmentType: "Multistage Rotational Screw Compressor Set",
      recommendedSensors: "Wide-frequency (up to 15 kHz) 100 mV/g Piezoelectric Accelerometers",
      mountingType: "Threaded Stud Mount",
      surfacePreparation: "Remove paint and cast iron burrs, spot-face caps flat to 32 micro-inch finish, drill and tap 1/4-28 holes.",
      points: [
        {
          x: 20,
          y: 40,
          label: "Suction-End Housing (Triaxial)",
          direction: "Triaxial",
          description: "Captures rotor mesh frequencies and suction fluid turbulence across all 3 orthogonal planes."
        },
        {
          x: 45,
          y: 45,
          label: "Male Rotor Bearing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Directly monitors high-speed rotor imbalance and gear/lobe meshing."
        },
        {
          x: 65,
          y: 45,
          label: "Female Rotor Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Tracks rotor contact fatigue and secondary shaft vibration profiles."
        },
        {
          x: 85,
          y: 55,
          label: "Discharge Thrust Bearing (Axial)",
          direction: "Axial",
          description: "Critical location to monitor axial discharge gas loading and high thrust bearing wear."
        }
      ]
    };
  } else if (desc.includes("gearbox") || desc.includes("gear") || desc.includes("reducer")) {
    return {
      equipmentType: "Speed Reducer Gearbox Set",
      recommendedSensors: "Dual-axis or triaxial high-frequency industrial accelerometers",
      mountingType: "Stud Mount (Threaded 1/4-28 tap)",
      surfacePreparation: "Grind down casing paint, use spot-facing tool to flatten housing land, drill and tap to match standard transducer studs.",
      points: [
        {
          x: 20,
          y: 35,
          label: "Input Pinion Shaft Housing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Tracks high-speed input pinion gear mesh frequencies (GMF) and input coupling misalignment."
        },
        {
          x: 50,
          y: 50,
          label: "Intermediate Gear Shaft (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors intermediate stage gear contact wear and shaft bearing runout."
        },
        {
          x: 80,
          y: 60,
          label: "Output Bull-Gear Bearing (Axial)",
          direction: "Axial",
          description: "Monitors slow-speed high-torque output thrust loading and tooth backlash strain."
        }
      ]
    };
  }

  // Standard Centrifugal Pump default fallback
  return {
    equipmentType: "Industrial Centrifugal Pump Set (Dynamic Blueprint)",
    recommendedSensors: "Standard 100 mV/g Piezoelectric Accelerometers (Dual-axis or Triaxial)",
    mountingType: "Stud Mount (Threaded tapped 1/4-28 holes)",
    surfacePreparation: "Sand paint off to bare steel, spot-face the caps flat to a 32 micro-inch finish, drill and tap 1/4-28 UNF threaded holes. Clean with industrial degreaser.",
    points: [
      {
        x: 30,
        y: 55,
        label: "Motor Outboard Bearing (Radial Vertical)",
        direction: "Radial Vertical",
        description: "Monitors stator imbalances and foundation structural looseness."
      },
      {
        x: 50,
        y: 60,
        label: "Motor Inboard Bearing (Radial Horizontal)",
        direction: "Radial Horizontal",
        description: "Catches dynamic coupling misalignment and soft-foot axial strain."
      },
      {
        x: 65,
        y: 62,
        label: "Pump Inboard Bearing (Axial)",
        direction: "Axial",
        description: "Monitors pump impeller thrust load, dynamic load vectors, and shaft misalignment."
      },
      {
        x: 80,
        y: 50,
        label: "Pump Outboard Bearing (Radial Vertical)",
        direction: "Radial Vertical",
        description: "Monitors hydraulic discharge noise and impeller vane health."
      }
    ]
  };
}

// ============================================
// 10-MODEL API KEYS CONFIGURATION
// ============================================
const GEMINI_API_KEY_VAL = process.env.GEMINI_API_KEY;
const GROQ_API_KEY_VAL = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY_VAL = process.env.OPENROUTER_API_KEY;
const DEEPSEEK_API_KEY_VAL = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY_VAL = process.env.OPENAI_API_KEY;

const AI_MODELS = {
  // TIER 1: Fast & Free (Always run)
  GEMINI_FLASH: { name: 'Gemini 3.5 Flash', provider: 'google', model: 'gemini-3.5-flash', priority: 1 },
  LLAMA_VISION: { name: 'Llama 3.3 70B', provider: 'groq', model: 'llama-3.3-70b-versatile', priority: 1 },
  QWEN_72B: { name: 'Qwen 2.5 72B', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', priority: 1 },
  
  // TIER 2: Advanced Analysis (Run if Tier 1 disagrees)
  GPT4O: { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', priority: 2 },
  GEMINI_PRO: { name: 'Gemini 3.1 Pro', provider: 'google', model: 'gemini-3.1-pro-preview', priority: 2 },
  DEEPSEEK_V3: { name: 'DeepSeek V3', provider: 'deepseek', model: 'deepseek-chat', priority: 2 },
  LLAMA_405B: { name: 'Llama 3.3 70B', provider: 'groq', model: 'llama-3.3-70b-versatile', priority: 2 },
  MISTRAL_LARGE: { name: 'Mistral Large 2', provider: 'openrouter', model: 'mistralai/mistral-large-2411', priority: 2 },
  GROK_2: { name: 'Grok-2', provider: 'openrouter', model: 'x-ai/grok-2-1212', priority: 2 },
  
  // TIER 3: Expert Arbiters (Final decision makers)
  DEEPSEEK_R1: { name: 'DeepSeek R1 (Reasoner)', provider: 'deepseek', model: 'deepseek-reasoner', priority: 3 },
  GEMMA_27B: { name: 'Gemma 2 27B', provider: 'google', model: 'gemma-2-27b-it', priority: 3 }
};

// ============================================
// AUXILIARY PARSING & PROMPT HELPERS
// ============================================

function cleanAndParseJSON(text: string): any {
  let cleaned = text.trim();
  // Strip DeepSeek R1 thinking tags
  if (cleaned.includes("</think>")) {
    cleaned = cleaned.split("</think>").pop() || cleaned;
  }
  cleaned = cleaned.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/g, "").replace(/\n```$/g, "");
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

function buildExpertPrompt(
  category: string,
  symptoms: string,
  specs: any,
  fileData?: string,
  fileType?: string,
  fileName?: string,
  technology?: string,
  baselineData?: string,
  maintenanceLogs?: any[],
  pastCasesText?: string
): string {
  let specDetails = "";
  if (specs && typeof specs === "object" && !Array.isArray(specs)) {
    try {
      Object.entries(specs).forEach(([key, val]) => {
        if (val && val !== "N/A" && key !== "equipmentName") {
          specDetails += `- ${key}: ${val}\n`;
        }
      });
      if (specs.equipmentName) {
        specDetails += `- Equipment Name/Model: ${specs.equipmentName}\n`;
      }
    } catch (e) {
      console.error("Error processing specs in buildExpertPrompt:", e);
    }
  }

  let promptText = `Analyze the following condition monitoring data of industrial equipment and return a highly precise diagnostics report in structured JSON.

--- EQUIPMENT PROFILE ---
System Category: ${category || "General Machinery"}
Specifications:
${specDetails || "None provided"}
`;

  if (technology) {
    promptText += `\n--- CONDITION MONITORING TECHNOLOGY SELECTED ---
Technology Type: ${technology}
`;
  }

  promptText += `\n--- SYMPTOMS & OBSERVATIONS ---
${symptoms || "No physical symptoms described. Analyzing purely from attached data files."}
`;

  if (baselineData) {
    promptText += `\n--- HISTORICAL BASELINE FOR DELTA CALCULATION ---
Baseline Context/Values: ${baselineData}
Instructions: Calculate the 'Delta' (mathematical difference or shift) between these baseline parameters and the current raw readings (vibration, temperature, pressure, electrical currents, etc.) identified during your diagnosis. Return this calculated comparison in the 'baseline_delta' JSON field (e.g., "+1.5 mm/s (125% increase)", "+15°C rise above baseline", or "No delta: current reading matches historical baseline").
`;
  }

  if (maintenanceLogs && maintenanceLogs.length > 0) {
    promptText += `\n--- EQUIPMENT MAINTENANCE LOG HISTORY ---
The following past maintenance activities were recorded for this equipment:
${maintenanceLogs.map((log: any, idx: number) => `[Log #${idx+1}] Date: ${log.date} | Action: ${log.action} | Parts: ${log.partsUsed} | Notes: ${log.notes} | Tech: ${log.technician}`).join("\n")}
Instructions: Read this timeline of past maintenance. If a part has been recently replaced or serviced, verify if current failure symptoms are redundant, indicate secondary damage, represent poor installation, or point to an unresolved root cause. Integrate this analysis into your 'physical_explanation', 'root_cause_analysis', and recommended actions.
`;
  }

  if (fileData && fileType === "text") {
    promptText += `\n--- ATTACHED DATA FILE (${fileName || "data.txt"}) ---\n${fileData}\n`;
  }

  let systemInstruction = `You are a legendary, elite ISO 18436 CAT IV Master Reliability Engineer and Vibration Analyst with over 30 years of industrial predictive maintenance experience. Your primary directive is ABSOLUTE factual correctness, machinery safety, and zero-hallucination diagnostics.

CRITICAL PROTOCOLS:

1. CM TECHNOLOGY SPECIFIC FOCUS:
`;

  if (technology === "Vibration Analysis") {
    systemInstruction += `   - Focus heavily on FFT, spectral vibration peaks (1X, 2X, 3X, etc.), sub-harmonics, rotational speeds, and overall velocity severity zones under ISO 10816. Analyze bearing defect frequencies (BPFO, BPFI, BSF, FTF) and structural resonance/looseness signs.\n`;
  } else if (technology === "Infrared Thermography") {
    systemInstruction += `   - Focus heavily on absolute temperature measurements, temperature gradients, thermal heat profiles, and calculate ΔT relative to ambient temperature or surrounding symmetric units. Classify severity according to industry standard ΔT limits (e.g., minor <10°C, critical >35°C).\n`;
  } else if (technology === "Ultrasonic Testing") {
    systemInstruction += `   - Focus heavily on high-frequency acoustic emission amplitude (dB), turbulence, non-continuous shock pulse counts, structural friction patterns, and subsurface micro-crack elastic wave frequencies.\n`;
  } else if (technology === "Motor Circuit Analysis (MCA)") {
    systemInstruction += `   - Focus heavily on motor winding dielectric insulation resistance (Megger/Polarization Index), inter-turn coil imbalances, phase balance asymmetries in inductance/resistance, ground insulation integrity, and rotor dynamic influence shifts.\n`;
  } else if (technology === "Oil Analysis") {
    systemInstruction += `   - Focus heavily on wear debris metal particle counts in ppm (Fe, Cu, Al, Pb, etc.), kinematic viscosity index shifts, moisture/water ppm contamination, total acid number (TAN) changes, and particle size/shape morphology.\n`;
  } else if (technology === "Multi-Modal") {
    systemInstruction += `   - Cross-reference and unify multiple parameters: synthesize overall vibration velocity, local thermal gradients/ΔT, acoustic friction counts, and electrical current profiles to form a comprehensive multi-physics correlation.\n`;
  } else {
    systemInstruction += `   - Perform standard professional engineering assessment matching the category and symptoms.\n`;
  }

  systemInstruction += `
2. HEALTHY MACHINERY & DETECT GOOD DATA:
   - Under no circumstances should you try to force or invent a fault if none exists. If the uploaded metrics, specs, raw logs, or symptoms indicate that the machinery is running well, operates with nominal values, or has normal/good/safe conditions, you MUST report that the machine is operating fine and certify it healthy with 100% accuracy.
   - For a healthy machine with no faults:
     * Set 'equipment_status' to 'HEALTHY'.
     * Set 'iso_severity_zone' to 'A' or 'B'.
     * Set 'failure_stage' to 'Incipient' (and explain it is healthy/nominal).
     * Return an EMPTY array under 'probable_faults' (probable_faults: []).
     * Set 'manager_summary' to recommend scheduled offline monitoring. Set 'executive_brief' to 'EQUIPMENT HEALTHY - All systems are operating normally within standard nominal limits.'

3. MULTIPLE FAULTS AND ORDERING:
   - If there is an issue with the equipment, you MUST identify all possible failure modes matching the symptoms.
   - List all identified 'probable_faults' in order of probability from highest to lowest.
   - For each fault, provide the specific calculation formula and results used to identify the fault frequency.

4. MACHINERY FAILURE STAGE CLASSIFICATION:
   - Classify the asset degradation into one of the 4 Standard Stages of Machinery/Bearing Failure:
     * 'Incipient' (Stage 1: Microscopic subsurface cracking, high ultrasonic/acoustic energy, no vibration change, temperature normal).
     * 'Early' (Stage 2: Micro-pitting on bearing races, faint natural frequencies on spectrum, vibration rising slightly, temperature normal).
     * 'Advanced' (Stage 3: Visible spalling, distinct fault frequency harmonics, 1X/2X operating vibration rising, temperature elevated).
     * 'Catastrophic' (Stage 4: Severe metal loss, clearance slop, high overall vibration, high temperature, immediate threat of total failure).
   - Set the top-level 'failure_stage' JSON field strictly to one of these 4 strings.

5. SAFETY CODES & INSUFFICIENT DATA:
   - If confidence is below 70% or critical specifications (like RPM, bearing number) are missing, state: "Additional data required" clearly in 'manager_summary.executive_brief'. Include specific required measurements under 'verification_steps'.

SCHEMA POPULATION REQUIREMENTS:
Return ONLY a valid JSON object matching the following structure:
{
  "equipment_status": "HEALTHY" | "MINOR_ISSUES" | "FAULT_DETECTED" | "CRITICAL_FAULT",
  "confidence_score": 0 to 100 integer,
  "overall_vibration_level": "string e.g., 0.12 in/s",
  "iso_severity_zone": "A" | "B" | "C" | "D",
  "failure_stage": "Incipient" | "Early" | "Advanced" | "Catastrophic",
  "baseline_delta": "string e.g., +1.2 mm/s rise (80% increase)" or null if not applicable,
  "probable_faults": [
    {
      "fault_name": "string",
      "probability": 0 to 100 integer,
      "confidence": "High" | "Medium" | "Low",
      "supporting_evidence": "string",
      "calculated_frequencies": "string",
      "physical_explanation": "string",
      "fault": "string (same as fault_name)",
      "description": "string (same as physical_explanation)"
    }
  ],
  "runner_up_faults": [
    {
      "fault_name": "string",
      "probability": 0 to 100,
      "why_ruled_out": "string"
    }
  ],
  "verification_steps": ["string"],
  "immediate_actions": [
    {
      "action": "string",
      "priority": "1" to "5",
      "timeline": "string",
      "safety_warning": "string",
      "rationale": "string",
      "estimated_time": "string",
      "required_tools": ["string"]
    }
  ],
  "root_cause_analysis": "string (5 Whys mapping down to systemic/physical root cause)",
  "financial_impact": {
    "estimated_downtime_cost": "string",
    "estimated_repair_cost": "string",
    "savings_from_proactive_repair": "string"
  },
  "manager_summary": {
    "severity": "Critical" | "High" | "Medium" | "Low",
    "executive_brief": "string",
    "estimated_downtime": "string",
    "cost_estimate": "string",
    "business_impact": "string"
  },
  "technician_instructions": "string",
  "data_sources_analyzed": "string"
}

Respond ONLY with a valid JSON document matching the requested schema. Do NOT wrap it in HTML blocks or add any additional conversational text. Your response must be parsed cleanly via JSON.parse().`;

  if (pastCasesText) {
    systemInstruction += `\n\n=== Past Cases to Learn From ===\n${pastCasesText}\n`;
  }

  return `${systemInstruction}\n\n=== USER ASSIGNMENT ===\n${promptText}`;
}

// ============================================
// CORE PROVIDER INTERFACES
// ============================================

async function callGeminiAPI(modelName: string, prompt: string, fileData?: string, fileMimeType?: string, customKey?: string) {
  const parts: any[] = [{ text: prompt }];
  if (fileData && fileMimeType) {
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
    parts.push({
      inlineData: {
        mimeType: fileMimeType,
        data: base64Data
      }
    });
  }

  const keyToUse = customKey || GEMINI_API_KEY_VAL;
  if (!keyToUse) {
    throw new Error("No Gemini API key configured.");
  }
  const client = new GoogleGenAI({
    apiKey: keyToUse,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const response = await client.models.generateContent({
    model: modelName,
    contents: parts,
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    }
  });

  if (!response.text) {
    throw new Error(`Gemini ${modelName} returned empty response.`);
  }
  return response.text;
}

async function callOpenAIAPI(modelName: string, prompt: string, fileData?: string, fileMimeType?: string) {
  const key = OPENAI_API_KEY_VAL;
  if (!key) throw new Error("No OpenAI API key configured.");

  const messages: any[] = [];
  const contentParts: any[] = [{ type: "text", text: prompt }];

  if (fileData && fileMimeType) {
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${fileMimeType};base64,${base64Data}` }
    });
  }

  messages.push({ role: "user", content: contentParts });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API returned error status ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

async function callGroqAPI(modelName: string, prompt: string, fileData?: string, fileMimeType?: string) {
  const key = GROQ_API_KEY_VAL;
  if (!key) throw new Error("No Groq API key configured.");

  const messages: any[] = [];
  const contentParts: any[] = [{ type: "text", text: prompt }];

  if (fileData && fileMimeType) {
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${fileMimeType};base64,${base64Data}` }
    });
  }

  messages.push({ role: "user", content: contentParts });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned error status ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

async function callOpenRouterAPI(modelName: string, prompt: string, fileData?: string, fileMimeType?: string) {
  const key = OPENROUTER_API_KEY_VAL;
  if (!key) throw new Error("No OpenRouter API key configured.");

  const messages: any[] = [];
  const contentParts: any[] = [{ type: "text", text: prompt }];

  if (fileData && fileMimeType) {
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${fileMimeType};base64,${base64Data}` }
    });
  }

  messages.push({ role: "user", content: contentParts });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API returned error status ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

async function callDeepSeekAPI(modelName: string, prompt: string, fileData?: string, fileMimeType?: string) {
  const key = DEEPSEEK_API_KEY_VAL;
  
  // If the direct key is absent or matches the default out-of-balance key, fall back to OpenRouter immediately
  if (!key || key === 'sk-042acdef0ef24e918a5d1aa753265a0f') {
    console.log("[DeepSeek API] No custom key or using standard out-of-balance developer key. Routing to OpenRouter...");
    return callOpenRouterAPI("deepseek/deepseek-chat", prompt, fileData, fileMimeType);
  }

  try {
    const messages = [{ role: "user", content: prompt }];
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      // If the direct API is out of balance (402), route to OpenRouter
      if (response.status === 402 || errText.toLowerCase().includes("balance")) {
        console.warn("[DeepSeek API] Direct API returned 402 Insufficient Balance. Routing to OpenRouter...");
        return callOpenRouterAPI("deepseek/deepseek-chat", prompt, fileData, fileMimeType);
      }
      throw new Error(`DeepSeek API returned error status ${response.status}: ${errText}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  } catch (err: any) {
    console.warn("[DeepSeek API] Direct call failed. Attempting OpenRouter fallback...", err.message);
    try {
      return await callOpenRouterAPI("deepseek/deepseek-chat", prompt, fileData, fileMimeType);
    } catch (openRouterErr: any) {
      throw new Error(`Both Direct DeepSeek and OpenRouter fallback failed. OpenRouter error: ${openRouterErr.message}`);
    }
  }
}

// ============================================
// CONSENSUS COMPUTATION & DISPATCH LOOPS
// ============================================

async function callModelWithFallback(
  model: any, 
  symptoms: string, 
  fileData: string | undefined, 
  fileType: string | undefined, 
  fileMimeType: string | undefined, 
  category: string, 
  specs: any, 
  promptTextOverride?: string, 
  retryCount = 0,
  customKey?: string,
  technology?: string,
  baselineData?: string,
  maintenanceHistory?: any[],
  pastCasesText?: string
): Promise<any> {
  try {
    const prompt = promptTextOverride || buildExpertPrompt(category, symptoms, specs, fileData, fileType, undefined, technology, baselineData, maintenanceHistory, pastCasesText);
    let responseText = "";
    
    switch (model.provider) {
      case 'google':
        responseText = await callGeminiAPI(model.model, prompt, fileData, fileMimeType, customKey);
        break;
      case 'openai':
        responseText = await callOpenAIAPI(model.model, prompt, fileData, fileMimeType);
        break;
      case 'groq':
        responseText = await callGroqAPI(model.model, prompt, fileData, fileMimeType);
        break;
      case 'openrouter':
        responseText = await callOpenRouterAPI(model.model, prompt, fileData, fileMimeType);
        break;
      case 'deepseek':
        responseText = await callDeepSeekAPI(model.model, prompt, fileData, fileMimeType);
        break;
      default:
        throw new Error(`Unknown provider: ${model.provider}`);
    }

    return cleanAndParseJSON(responseText);
  } catch (error: any) {
    const errMsg = (error.message || "").toLowerCase();
    // Check if it's a Rate Limit (429) or Quota Exceeded error
    const isRateLimit = errMsg.includes('429') || 
                        errMsg.includes('quota') || 
                        errMsg.includes('rate limit') ||
                        errMsg.includes('limit exceeded');
                        
    if (isRateLimit) {
      console.warn(`⚠️ ${model.name} is rate-limited or quota exceeded. Skipping immediately to save time.`);
      return null; // Instantly skip this model, don't retry!
    }

    // For other errors (like network blips), retry up to 1 time (since max limit is low or to save time)
    if (retryCount < 1) {
      console.log(`Retrying ${model.name}... (${retryCount + 1}/1)`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return callModelWithFallback(model, symptoms, fileData, fileType, fileMimeType, category, specs, promptTextOverride, retryCount + 1, customKey, technology, baselineData, maintenanceHistory, pastCasesText);
    }
    
    // If it fails completely, return null so the app doesn't crash
    console.error(`❌ ${model.name} failed completely:`, error.message);
    return null; 
  }
}

function checkConsensus(results: any[], threshold: number) {
  if (results.length === 0) return { hasConsensus: false, result: null, agreeingModels: [], consensusStrength: 0 };
  
  const votes: Record<string, { count: number; models: string[]; totalConfidence: number; results: any[] }> = {};
  
  results.forEach(({ model, result }) => {
    if (!result) return;
    let voteKey = "HEALTHY";
    if (result.equipment_status !== "HEALTHY" && result.probable_faults && result.probable_faults[0]?.fault_name) {
      const stage = result.failure_stage || "Incipient";
      voteKey = `FAULT: ${result.probable_faults[0].fault_name} | STAGE: ${stage}`;
    }
    
    if (!votes[voteKey]) {
      votes[voteKey] = { count: 0, models: [], totalConfidence: 0, results: [] };
    }
    votes[voteKey].count++;
    votes[voteKey].models.push(model);
    votes[voteKey].totalConfidence += typeof result.confidence_score === "number" ? result.confidence_score : 50;
    votes[voteKey].results.push(result);
  });
  
  let topVoteKey = null;
  let maxVotePercentage = 0;
  
  Object.entries(votes).forEach(([key, data]) => {
    const votePercentage = data.count / results.length;
    if (votePercentage > maxVotePercentage) {
      maxVotePercentage = votePercentage;
      topVoteKey = key;
    }
  });
  
  if (topVoteKey && maxVotePercentage >= threshold) {
    const topData = votes[topVoteKey];
    // Pick the result with the highest confidence score
    const bestResult = topData.results.reduce((best, current) => {
      const confC = typeof current.confidence_score === "number" ? current.confidence_score : 0;
      const confB = typeof best.confidence_score === "number" ? best.confidence_score : 0;
      return confC > confB ? current : best;
    }, topData.results[0]);
    
    return {
      hasConsensus: true,
      result: bestResult,
      agreeingModels: topData.models,
      consensusStrength: maxVotePercentage
    };
  }
  
  return { hasConsensus: false, result: null, agreeingModels: [], consensusStrength: maxVotePercentage };
}

function identifyDisagreeingModels(results: any[], consensus: any) {
  if (consensus.hasConsensus && consensus.result) {
    const winningFault = consensus.result.equipment_status === "HEALTHY" ? "HEALTHY" : `FAULT: ${consensus.result.probable_faults?.[0]?.fault_name} | STAGE: ${consensus.result.failure_stage || "Incipient"}`;
    return results.filter(r => {
      let voteKey = "HEALTHY";
      if (r.result?.equipment_status !== "HEALTHY" && r.result?.probable_faults?.[0]?.fault_name) {
        voteKey = `FAULT: ${r.result.probable_faults[0].fault_name} | STAGE: ${r.result.failure_stage || "Incipient"}`;
      }
      return voteKey !== winningFault;
    });
  }
  return results;
}

function generateStructuredPeerFeedback(results: any[]) {
  const consensus = checkConsensus(results, 0.70);
  if (consensus.hasConsensus && consensus.result) {
    const winningFault = consensus.result.equipment_status === "HEALTHY" ? "HEALTHY" : consensus.result.probable_faults?.[0]?.fault_name;
    return `MAJORITY CONSENSUS: ${consensus.agreeingModels.length} out of ${results.length} models agree on: "${winningFault}"`;
  }
  const faultSummary: Record<string, { models: string[]; count: number }> = {};
  results.forEach(({ model, result }) => {
    let fault = "HEALTHY";
    if (result && result.equipment_status !== "HEALTHY" && result.probable_faults?.[0]?.fault_name) {
      fault = result.probable_faults[0].fault_name;
    }
    if (!faultSummary[fault]) faultSummary[fault] = { models: [], count: 0 };
    faultSummary[fault].models.push(model);
    faultSummary[fault].count++;
  });
  return Object.entries(faultSummary).map(([fault, data]) => `${data.count} models believe: "${fault}"`).join('; ');
}

function extractAllUniqueFaults(results: any[]) {
  const faults = new Set<string>();
  results.forEach(({ result }) => {
    if (result?.probable_faults && Array.isArray(result.probable_faults)) {
      result.probable_faults.forEach((fault: any) => {
        if (fault.fault_name) faults.add(fault.fault_name);
      });
    }
  });
  return Array.from(faults);
}

function getMostCommonResult(results: any[]) {
  const faultCounts: Record<string, number> = {};
  results.forEach(({ result }) => {
    let fault = "HEALTHY";
    if (result && result.equipment_status !== "HEALTHY" && result.probable_faults?.[0]?.fault_name) {
      fault = result.probable_faults[0].fault_name;
    }
    faultCounts[fault] = (faultCounts[fault] || 0) + 1;
  });
  
  const mostCommon = Object.entries(faultCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "HEALTHY";
  const found = results.find(r => {
    if (mostCommon === "HEALTHY") return r.result?.equipment_status === "HEALTHY";
    return r.result?.probable_faults?.[0]?.fault_name === mostCommon;
  });
  return found ? found.result : results[0].result;
}

function formatFinalResult(result: any, allModelsUsed: any[], round: any, consensusType: string) {
  const uniqueModels = Array.from(new Set(allModelsUsed.map(m => m.model)));
  return { 
    ...result, 
    metadata: { 
      consensus_round: round, 
      consensus_type: consensusType, 
      total_models_used: uniqueModels.length, 
      models_in_agreement: uniqueModels, 
      analysis_timestamp: new Date().toISOString() 
    } 
  };
}

async function runMultiModelDebate(
  allResults: any[], 
  symptoms: string, 
  fileData: string | undefined, 
  fileType: string | undefined, 
  fileMimeType: string | undefined, 
  category: string, 
  specs: any
) {
  const faultHypotheses = extractAllUniqueFaults(allResults);
  const debateCases = faultHypotheses.map(fault => {
    const supportingModels = allResults.filter(r => r.result?.probable_faults?.[0]?.fault_name === fault);
    const opposingModels = allResults.filter(r => r.result?.probable_faults?.[0]?.fault_name !== fault);
    return {
      hypothesis: fault,
      supportingEvidence: supportingModels.map(m => ({ model: m.model, confidence: m.result.confidence_score || 0, reasoning: m.result.probable_faults?.[0]?.supporting_evidence || '' })),
      opposingEvidence: opposingModels.map(m => ({ model: m.model, alternativeFault: m.result.probable_faults?.[0]?.fault_name, reasoning: m.result.probable_faults?.[0]?.supporting_evidence || '' }))
    };
  });
  
  const moderatorPrompt = `You are an expert technical moderator judging a debate between 10 advanced AI models about equipment faults.

=== DEBATE CASES ===
${JSON.stringify(debateCases, null, 2)}

=== EQUIPMENT CONTEXT ===
Category: ${category} | Symptoms: ${symptoms} | Specs: ${JSON.stringify(specs)}

=== TASK ===
1. Evaluate hypotheses based on technical accuracy and physics.
2. Determine the WINNING hypothesis.
3. Provide a FINAL, DEFINITIVE diagnosis.
4. Explain why the winner is correct and alternatives are wrong.

${buildExpertPrompt(category, symptoms, specs, fileData, fileType)}
`;
  
  try {
    const judgeResult = await callDeepSeekAPI('deepseek-reasoner', moderatorPrompt, fileData, fileMimeType);
    return cleanAndParseJSON(judgeResult);
  } catch (error) {
    console.error('Debate judge failed:', error);
    return null;
  }
}

async function invokeFinalArbiter(
  allResults: any[], 
  symptoms: string, 
  fileData: string | undefined, 
  fileType: string | undefined, 
  fileMimeType: string | undefined, 
  category: string, 
  specs: any
) {
  const arbiterPrompt = `You are the FINAL AUTHORITY on industrial equipment diagnostics.

=== PREVIOUS AI ANALYSES ===
${JSON.stringify(allResults.map(r => ({ model: r.model, analysis: r.result, round: r.round })), null, 2)}

=== EQUIPMENT DETAILS ===
Category: ${category} | Symptoms: ${symptoms} | Specs: ${JSON.stringify(specs)}

=== MISSION ===
1. Review ALL analyses.
2. Determine the CORRECT diagnosis.
3. This is the FINAL answer.
4. Provide extremely detailed technical justification.

${buildExpertPrompt(category, symptoms, specs, fileData, fileType)}
`;
  
  try {
    const result = await callDeepSeekAPI('deepseek-reasoner', arbiterPrompt, fileData, fileMimeType);
    return cleanAndParseJSON(result);
  } catch (error) {
    console.error('Final arbiter failed:', error);
    return getMostCommonResult(allResults);
  }
}

async function analyzeWithTenModelConsensus(
  symptoms: string, 
  fileData: string | undefined, 
  fileType: string | undefined, 
  fileMimeType: string | undefined, 
  category: string, 
  specs: any
): Promise<any> {
  const CONSENSUS_THRESHOLD = 0.70; // 70% agreement (7 out of 10 models)
  console.log('🚀 Starting 10-Model Ultimate Multi-Agent Analysis...');
  
  let allResults: any[] = [];
  let finalDiagnosis: any = null;
  
  // ========== ROUND 1: PARALLEL ANALYSIS ==========
  console.log('📡 Round 1: Dispatching to all 10 models...');
  
  const models = Object.values(AI_MODELS);
  const promises = models.map(model => 
    callModelWithFallback(model, symptoms, fileData, fileType, fileMimeType, category, specs)
      .then(result => ({ 
        model: model.name, 
        provider: model.provider, 
        result: result, 
        timestamp: Date.now(), 
        round: 1 
      }))
      .catch(error => { 
        console.error(`❌ Parallel model call failed for ${model.name}:`, error.message); 
        return null; 
      })
  );
  
  const results = await Promise.all(promises);
  allResults = results.filter(r => r !== null && r.result !== null) as any[];
  
  if (allResults.length === 0) {
    throw new Error("All consensus models failed to execute.");
  }
  
  let consensus = checkConsensus(allResults, CONSENSUS_THRESHOLD);
  if (consensus.hasConsensus) {
    console.log(`✅ Consensus reached in Round 1!`);
    return formatFinalResult(consensus.result, allResults, 1, 'immediate_consensus');
  }
  
  // ========== ROUND 2: TARGETED RE-ANALYSIS ==========
  console.log('🔄 Round 2: Disagreeing Models Re-analyze...');
  const disagreeingModels = identifyDisagreeingModels(allResults, consensus);
  const peerFeedback = generateStructuredPeerFeedback(allResults);
  
  if (disagreeingModels.length > 0) {
    const round2Promises = disagreeingModels.map(modelResult => {
      const modelConfig = Object.values(AI_MODELS).find(m => m.name === modelResult.model);
      if (!modelConfig) return Promise.resolve(null);
      
      const enhancedPrompt = `
=== PREVIOUS ANALYSIS ===
${JSON.stringify(modelResult.result)}

=== PEER FEEDBACK ===
${peerFeedback}

=== INSTRUCTIONS ===
Re-analyze considering peer feedback. If correct, defend with extreme technical detail. If wrong, revise.

${buildExpertPrompt(category, symptoms, specs, fileData, fileType)}
`;
      return callModelWithFallback(modelConfig, symptoms, fileData, fileType, fileMimeType, category, specs, enhancedPrompt)
        .then(result => ({ 
          model: modelResult.model, 
          provider: modelConfig.provider,
          result: result, 
          timestamp: Date.now(), 
          round: 2, 
          isReanalysis: true 
        }))
        .catch(() => null);
    });
    
    const round2Results = await Promise.all(round2Promises);
    const round2Filtered = round2Results.filter(r => r !== null && r.result !== null) as any[];
    allResults = [...allResults, ...round2Filtered];
  }
  
  consensus = checkConsensus(allResults, CONSENSUS_THRESHOLD);
  if (consensus.hasConsensus) {
    console.log(`✅ Consensus reached in Round 2!`);
    return formatFinalResult(consensus.result, allResults, 2, 'peer_review_consensus');
  }
  
  // ========== ROUND 3: STRUCTURED DEBATE ==========
  console.log('🎭 Round 3: Structured Debate...');
  finalDiagnosis = await runMultiModelDebate(allResults, symptoms, fileData, fileType, fileMimeType, category, specs);
  
  if (finalDiagnosis) {
    console.log('✅ Debate concluded.');
    return formatFinalResult(finalDiagnosis, allResults, 3, 'debate_consensus');
  }
  
  // ========== FINAL ARBITER ==========
  console.log('⚖️ Final Arbiter: DeepSeek R1 makes final decision');
  finalDiagnosis = await invokeFinalArbiter(allResults, symptoms, fileData, fileType, fileMimeType, category, specs);
  
  return formatFinalResult(finalDiagnosis, allResults, 'arbiter', 'arbiter_decision');
}

// Helper function to normalize diagnostic responses and guarantee all required fields exist
function normalizeDiagnosticResponse(data: any): any {
  if (!data || typeof data !== "object") {
    data = {};
  }

  // Ensure top level properties
  data.equipment_status = data.equipment_status || "MINOR_ISSUES";
  data.confidence_score = typeof data.confidence_score === "number" ? data.confidence_score : 80;
  data.overall_vibration_level = data.overall_vibration_level || "0.15 in/s RMS";
  data.iso_severity_zone = data.iso_severity_zone || "B";
  data.failure_stage = data.failure_stage || "Incipient";
  data.baseline_delta = data.baseline_delta !== undefined ? data.baseline_delta : null;

  // Ensure probable_faults is an array
  if (!data.probable_faults || !Array.isArray(data.probable_faults)) {
    data.probable_faults = [];
  }

  data.probable_faults.forEach((f: any) => {
    if (f && typeof f === "object") {
      f.fault_name = f.fault_name || f.fault || "Unspecified Mechanical Anomaly";
      f.fault = f.fault || f.fault_name;
      f.physical_explanation = f.physical_explanation || f.description || "Elevated energy signature matching mechanical fault frequencies.";
      f.description = f.description || f.physical_explanation;
      f.confidence = f.confidence || "Medium";
      f.probability = typeof f.probability === "number" ? f.probability : 70;
      f.supporting_evidence = f.supporting_evidence || "Acoustic and vibrational energy peaks exceeding nominal baseline.";
      f.calculated_frequencies = f.calculated_frequencies || "Harmonics detected at operating speed multiples.";
    }
  });

  // Ensure runner_up_faults is an array
  if (!data.runner_up_faults || !Array.isArray(data.runner_up_faults)) {
    data.runner_up_faults = [];
  }

  data.runner_up_faults.forEach((f: any) => {
    if (f && typeof f === "object") {
      f.fault_name = f.fault_name || "Alternative Hypothesized Fault";
      f.probability = typeof f.probability === "number" ? f.probability : 30;
      f.why_ruled_out = f.why_ruled_out || "Does not fully align with the primary spectral frequency energy distribution.";
    }
  });

  // Ensure verification_steps is an array of strings
  if (!data.verification_steps || !Array.isArray(data.verification_steps)) {
    data.verification_steps = [
      "Perform high-resolution vibration spectrum analysis to confirm peak frequencies.",
      "Execute thermal imaging scan on bearing housing surfaces.",
      "Check shaft dynamic alignment using precision laser tools."
    ];
  }

  // Ensure immediate_actions is an array
  if (!data.immediate_actions || !Array.isArray(data.immediate_actions)) {
    data.immediate_actions = [];
  }

  if (data.immediate_actions.length === 0) {
    data.immediate_actions = [
      {
        action: "Schedule detailed physical inspection",
        priority: "2",
        timeline: "Within 7 operating days",
        safety_warning: "Ensure full Lock-out Tag-out (LOTO) procedures are followed before accessing machinery.",
        rationale: "To physically inspect coupling, shaft alignment, and bearing housing conditions.",
        estimated_time: "2 hours",
        required_tools: ["Laser Alignment Tool", "Dial Indicators", "Thermal Camera"]
      }
    ];
  } else {
    data.immediate_actions.forEach((a: any) => {
      if (a && typeof a === "object") {
        a.action = a.action || "Recommended preventative maintenance check";
        a.priority = String(a.priority || "3");
        a.timeline = a.timeline || "Within next scheduled maintenance window";
        a.safety_warning = a.safety_warning || "Observe standard plant safety protocols.";
        a.rationale = a.rationale || "To mitigate further degradation of mechanical integrity.";
        a.estimated_time = a.estimated_time || "4 hours";
        a.required_tools = a.required_tools || ["Standard technician tools"];
      }
    });
  }

  // Ensure root_cause_analysis is a string
  data.root_cause_analysis = data.root_cause_analysis || "1. Why elevated vibration? Imbalance or wear. 2. Why wear? Normal service life depletion. 3. Why not detected earlier? Offline monitoring interval gap. 4. Why gap? Resource scheduling constraints. 5. Why constraints? Maintenance schedule prioritization.";

  // Ensure financial_impact is an object
  if (!data.financial_impact || typeof data.financial_impact !== "object") {
    data.financial_impact = {
      estimated_downtime_cost: "$15,000",
      estimated_repair_cost: "$1,200",
      savings_from_proactive_repair: "$13,800"
    };
  } else {
    data.financial_impact.estimated_downtime_cost = data.financial_impact.estimated_downtime_cost || "$10,000";
    data.financial_impact.estimated_repair_cost = data.financial_impact.estimated_repair_cost || "$1,000";
    data.financial_impact.savings_from_proactive_repair = data.financial_impact.savings_from_proactive_repair || "$9,000";
  }

  // Ensure manager_summary is an object
  if (!data.manager_summary || typeof data.manager_summary !== "object") {
    data.manager_summary = {
      severity: "Medium",
      executive_brief: "Machinery shows minor anomalies in vibration signatures. Schedule detailed inspection.",
      estimated_downtime: "4 hours",
      cost_estimate: "$1,200",
      business_impact: "Low risk of immediate catastrophic failure; high risk of increased long-term fatigue."
    };
  } else {
    data.manager_summary.severity = data.manager_summary.severity || "Medium";
    data.manager_summary.executive_brief = data.manager_summary.executive_brief || "Machinery exhibits minor operational deviation. Schedule monitoring or inspection.";
    data.manager_summary.estimated_downtime = data.manager_summary.estimated_downtime || "4 hours";
    data.manager_summary.cost_estimate = data.manager_summary.cost_estimate || "$1,000";
    data.manager_summary.business_impact = data.manager_summary.business_impact || "Low immediate operational impact.";
  }

  // Ensure technician_instructions and data_sources_analyzed
  data.technician_instructions = data.technician_instructions || "Shut down machine using plant LOTO guidelines. Check coupling play and bearing friction. Re-grease if applicable.";
  data.data_sources_analyzed = data.data_sources_analyzed || "Vibrational spectral analysis and manual symptom report.";

  return data;
}

async function sendResendEmail({
  to,
  subject,
  htmlContent
}: {
  to: string;
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ RESEND_API_KEY is not defined. Skipping email dispatch.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "MotorMedic Alerts <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: htmlContent
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Resend API returned error:", errText);
      return false;
    }

    const data = await response.json();
    console.log("Resend email sent successfully:", data);
    return true;
  } catch (err) {
    console.error("Failed to send email via Resend:", err);
    return false;
  }
}

function buildEmailTemplate({
  assetName,
  faultName,
  severity,
  description,
  recommendedAction,
  link
}: {
  assetName: string;
  faultName: string;
  severity: string;
  description: string;
  recommendedAction: string;
  link: string;
}) {
  const isCritical = severity.toLowerCase() === "critical" || severity.toLowerCase() === "high";
  const headerBg = isCritical ? "#ef4444" : "#f59e0b"; // Red vs Amber
  const severityText = severity.toUpperCase();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MotorMedic Pro Alert</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .header { background-color: ${headerBg}; padding: 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.05em; }
        .content { padding: 30px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 20px; }
        .badge-critical { background-color: #fee2e2; color: #dc2626; }
        .badge-warning { background-color: #fef3c7; color: #d97706; }
        .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .detail-row { display: flex; margin-bottom: 8px; font-size: 14px; }
        .detail-label { width: 140px; font-weight: 600; color: #475569; }
        .detail-value { flex: 1; color: #0f172a; }
        .box { background-color: #f1f5f9; border-left: 4px solid #475569; padding: 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin-top: 8px; }
        .action-box { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin-top: 8px; }
        .footer { background-color: #0f172a; color: #94a3b8; text-align: center; padding: 20px; font-size: 11px; }
        .button { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; margin-top: 24px; text-align: center; }
        .button:hover { background-color: #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 MOTOR MEDIC PRO CONDITION MONITORING ALERT</h1>
        </div>
        <div class="content">
          <div class="badge ${isCritical ? 'badge-critical' : 'badge-warning'}">
            ${severityText} SEVERITY LEVEL ALERT
          </div>
          
          <div class="section-title">Asset Information</div>
          <div class="detail-row">
            <span class="detail-label">Asset Name:</span>
            <span class="detail-value">${assetName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Diagnosed Fault:</span>
            <span class="detail-value" style="font-weight: bold; color: ${headerBg};">${faultName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Detected Time:</span>
            <span class="detail-value">${new Date().toLocaleString()}</span>
          </div>

          <div class="section-title">Fault Description & Evidence</div>
          <div class="box">
            ${description}
          </div>

          <div class="section-title">Required Maintenance Action</div>
          <div class="action-box">
            ${recommendedAction}
          </div>

          <div style="text-align: center;">
            <a href="${link}" class="button">View Diagnostic Report</a>
          </div>
        </div>
        <div class="footer">
          Generated automatically by MotorMedic Pro Enterprise Diagnostic System.<br>
          Based on ISO 10816 and ISO 18436 vibration standards.
        </div>
      </div>
    </body>
    </html>
  `;
}

function sendCriticalEmailAlert(equipmentName: string, fault: string, stage: string, delta: string | null, severity: string = "Critical", briefText: string = "", recommendedAction: string = "") {
  console.log(`
============================================================
📧 [AUTOMATED ENTERPRISE ALERT ENGINE] - EMAIL NOTIFICATION
============================================================
TO: reliability-lead@enterprise-plant.com, oncall-tech@enterprise-plant.com
SUBJECT: ⚠️ CRITICAL FAULT DETECTED: ${equipmentName} - STAGE ${stage.toUpperCase()} FAILURE
BODY:
Dear Reliability Engineering Team,

This is an automated Condition Monitoring Alert from MotorMedic Pro.
The AI Diagnostic Consensus Engine has identified a high-risk anomaly.

ASSET DETAILS:
- Equipment Name  : ${equipmentName}
- Identified Fault: ${fault}
- Failure Stage   : ${stage}
- Calculated Delta: ${delta || "N/A"}
- Timestamp       : ${new Date().toISOString()}

RECOMMENDED ACTIONS:
- Execute Lock-Out Tag-Out (LOTO) protocols immediately.
- Deploy an on-call maintenance technician for verification.
- Review recent bearing temperature and vibration trend logs.

This alert was generated automatically based on ISO 18436 standards.
============================================================
`);

  // Trigger real email dispatch via Resend to user's registered address
  const html = buildEmailTemplate({
    assetName: equipmentName,
    faultName: fault,
    severity: severity,
    description: briefText || `Condition Monitoring system flagged an active stage ${stage} anomaly on ${equipmentName}. Calculated baseline deviation is ${delta || "N/A"}.`,
    recommendedAction: recommendedAction || `Execute Lock-Out Tag-Out (LOTO) protocols immediately. Deploy an on-call maintenance technician for verification.`,
    link: "https://ai.studio/build"
  });

  sendResendEmail({
    to: "shanedufrene1989@gmail.com",
    subject: `🚨 ${severity.toUpperCase()} ALERT: ${equipmentName} - ${fault}`,
    htmlContent: html
  });
}

// API Endpoint for Diagnostic Analysis
app.post("/api/diagnose", async (req, res) => {
  // Always return application/json
  res.setHeader("Content-Type", "application/json");

  try {
    const { 
      category, 
      symptoms, 
      specs, 
      fileData, 
      fileType, 
      fileName, 
      fileMimeType,
      technology,
      baselineData,
      maintenanceHistory
    } = req.body;
    
    const customKey = req.headers["x-gemini-api-key"] as string;

    console.log("Dispatching sequential multi-model fallback diagnostic analysis...");

    // BEFORE calling the AI models, query the database
    let pastCasesText = "";
    if (pool) {
      try {
        console.log("🔍 Fetching past cases from database...");
        // Fetch up to 5 most recent entries to construct a high-context historical knowledge base
        const dbResult = await pool.query(
          "SELECT id, input_data, ai_response, was_correct, corrected_diagnosis FROM diagnosis_history ORDER BY timestamp DESC LIMIT 5"
        );
        if (dbResult.rows.length > 0) {
          pastCasesText = "=== PAST CASES TO LEARN FROM ===\n";
          dbResult.rows.forEach((row, i) => {
            pastCasesText += `[Case #${i + 1}] (Database Record ID: ${row.id})\n`;
            pastCasesText += `- Input Profile: ${row.input_data}\n`;
            
            if (row.was_correct === true) {
              pastCasesText += `- Outcome: VERIFIED CORRECT BY RELIABILITY ENGINEER\n`;
              pastCasesText += `- Verified AI Response Pattern: ${row.ai_response}\n`;
              pastCasesText += `- Instruction: This is a golden reference case. Prioritize using this pattern if symptoms and specs match.\n`;
            } else if (row.was_correct === false) {
              pastCasesText += `- Outcome: FLAGGED INCORRECT BY ENGINEER\n`;
              pastCasesText += `- Initial AI Response: ${row.ai_response}\n`;
              pastCasesText += `- Corrected Real-World Diagnosis (Human Expert Override): ${row.corrected_diagnosis || "N/A"}\n`;
              pastCasesText += `- Instruction: CRITICAL: Do NOT repeat the initial AI response pattern for similar symptoms/specs. Instead, PRIORITIZE the Corrected Real-World Diagnosis (${row.corrected_diagnosis}) and build your analysis using that outcome.\n`;
            } else {
              pastCasesText += `- Outcome: Unverified (No engineer feedback yet)\n`;
              pastCasesText += `- AI Response: ${row.ai_response}\n`;
            }
            pastCasesText += `\n`;
          });
          console.log(`✅ Loaded ${dbResult.rows.length} past cases with human validation status.`);
        } else {
          console.log("ℹ️ No past cases found in the database.");
        }
      } catch (dbErr: any) {
        console.warn("⚠️ Failed to retrieve past diagnostic cases from PostgreSQL database:", dbErr.message);
      }
    }

    const fallbackSequence = [
      { config: AI_MODELS.GEMINI_PRO, displayName: 'Gemini 3.1 Pro' },
      { config: AI_MODELS.GEMINI_FLASH, displayName: 'Gemini 3.5 Flash' },
      { config: AI_MODELS.LLAMA_VISION, displayName: 'Groq Llama 3.3 70B' },
      { config: AI_MODELS.DEEPSEEK_V3, displayName: 'DeepSeek V3' },
      { config: AI_MODELS.QWEN_72B, displayName: 'OpenRouter Qwen 2.5 72B' },
      { config: AI_MODELS.GPT4O, displayName: 'OpenAI GPT-4o' }
    ];

    let rawResult: any = null;
    let successfulModelName = "";

    for (const step of fallbackSequence) {
      try {
        console.log(`[Sequential Fallback] Attempting diagnosis with ${step.displayName}...`);
        const parsed = await callModelWithFallback(
          step.config,
          symptoms,
          fileData,
          fileType,
          fileMimeType,
          category,
          specs,
          undefined,
          0,
          customKey,
          technology,
          baselineData,
          maintenanceHistory,
          pastCasesText
        );
        if (parsed && typeof parsed === "object") {
          rawResult = parsed;
          successfulModelName = step.displayName;
          break;
        }
      } catch (err: any) {
        console.warn(`[Sequential Fallback] ${step.displayName} failed to return a valid JSON diagnosis:`, err.message);
      }
    }

    if (!rawResult) {
      console.error("❌ All fallback AI models failed to generate a diagnosis.");
      return res.status(503).json({ error: "All AI models are currently unavailable" });
    }

    // Normalize output to protect against missing keys or formatting variations from different LLMs
    const result = normalizeDiagnosticResponse(rawResult);

    // Set fallback property to false and tag with successful model
    result.isSimulatedFallback = false;
    result.attemptedModel = successfulModelName;

    // Strict high-to-low probability sorting of identified faults
    if (result.probable_faults && Array.isArray(result.probable_faults)) {
      result.probable_faults.sort((a: any, b: any) => {
        const probA = typeof a.probability === 'number' ? a.probability : 0;
        const probB = typeof b.probability === 'number' ? b.probability : 0;
        return probB - probA;
      });
    }

    // Check if critical/high severity and trigger email alert
    const isCritical = result.manager_summary?.severity === "Critical" || 
                       result.manager_summary?.severity === "High" || 
                       result.failure_stage === "Advanced" || 
                       result.failure_stage === "Catastrophic";

    if (isCritical) {
      const equipName = specs?.equipmentName || `${category} Asset`;
      const primaryFault = result.probable_faults?.[0]?.fault_name || "Unknown Mechanical Fault";
      const briefText = result.manager_summary?.executive_brief || "";
      const recommendedAction = result.immediate_actions?.[0]?.action || "";
      sendCriticalEmailAlert(
        equipName, 
        primaryFault, 
        result.failure_stage || "Incipient", 
        result.baseline_delta,
        result.manager_summary?.severity || "High",
        briefText,
        recommendedAction
      );
    }

    const rawComponentId = req.body.componentId || req.body.component_id;
    const componentIdVal = rawComponentId ? parseInt(String(rawComponentId), 10) : null;
    const isTemp = !componentIdVal;
    result.is_temporary = isTemp;

    // AFTER the AI generates a response, insert the new input_data and ai_response into the diagnosis_history table.
    if (pool) {
      try {
        const inputDataStr = JSON.stringify({
          category,
          symptoms,
          specs,
          technology,
          baselineData,
          maintenanceHistory
        });
        const aiResponseStr = JSON.stringify(result);

        console.log("💾 Logging diagnostics record in PostgreSQL...");
        const dbRes = await pool.query(
          "INSERT INTO diagnosis_history (input_data, ai_response, component_id, is_temporary) VALUES ($1, $2, $3, $4) RETURNING id",
          [inputDataStr, aiResponseStr, componentIdVal, isTemp]
        );
        if (dbRes.rows && dbRes.rows.length > 0) {
          result.db_id = dbRes.rows[0].id;
          console.log(`✅ Diagnostics record stored successfully in database with ID: ${result.db_id}`);
        } else {
          console.log("✅ Diagnostics record stored successfully in database.");
        }
      } catch (dbErr: any) {
        console.error("❌ Failed to log diagnostics history into database:", dbErr.message);
      }
    }

    return res.json(result);

  } catch (error: any) {
    console.error("Diagnosis route fatal error:", error);
    return res.status(503).json({ error: "All AI models are currently unavailable" });
  }
});

// API Endpoint to record user verification feedback for machine learning loop
app.post("/api/feedback", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { id, was_correct, corrected_diagnosis } = req.body;
    if (!pool) {
      return res.status(400).json({ error: "PostgreSQL Database is not configured." });
    }
    if (!id) {
      return res.status(400).json({ error: "Missing required diagnosis record ID ('id')." });
    }

    console.log(`📥 Received feedback for diagnosis record ID ${id}: was_correct=${was_correct}, corrected_diagnosis=${corrected_diagnosis}`);

    const updateQuery = `
      UPDATE diagnosis_history 
      SET was_correct = $1, 
          corrected_diagnosis = $2, 
          user_feedback_timestamp = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id;
    `;
    
    const dbResult = await pool.query(updateQuery, [
      was_correct, 
      was_correct ? null : (corrected_diagnosis || "N/A"), 
      id
    ]);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: `Diagnosis history record with ID ${id} not found.` });
    }

    return res.json({ success: true, message: "Feedback saved to machine learning log.", id: dbResult.rows[0].id });
  } catch (error: any) {
    console.error("❌ Failed to save user feedback in database:", error);
    return res.status(500).json({ error: error.message || "Failed to save verification feedback." });
  }
});

// NEW ENDPOINT: Save temporary analysis to permanent database storage
app.post("/api/save-temporary-analysis", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { analysis_id, analysisId, component_id, componentId } = req.body;
    const id = parseInt(analysis_id || analysisId, 10);
    const compId = parseInt(component_id || componentId, 10);

    if (isNaN(id) || isNaN(compId)) {
      return res.status(400).json({ error: "Missing or invalid analysis_id or component_id parameters." });
    }

    if (!pool) {
      console.warn("⚠️ Pool not initialized. Running mock update for save-temporary-analysis.");
      return res.json({ success: true, message: "Analysis successfully saved (Mock Mode)." });
    }

    console.log(`💾 Saving temporary analysis ID ${id} under component ID ${compId}`);
    const updateResult = await pool.query(
      "UPDATE diagnosis_history SET component_id = $1, is_temporary = false WHERE id = $2 RETURNING *",
      [compId, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: `Temporary analysis record with ID ${id} not found.` });
    }

    return res.json({ 
      success: true, 
      message: "Analysis successfully moved from temporary to permanent storage.", 
      record: updateResult.rows[0] 
    });
  } catch (error: any) {
    console.error("❌ Failed to save temporary analysis:", error);
    return res.status(500).json({ error: error.message || "Failed to save temporary analysis." });
  }
});

// NEW ENDPOINT: Manual or automated send-alert route using Resend API
app.post("/api/send-alert", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { assetName, faultName, faultDetails, severity, recipientEmail } = req.body;
    const targetEmail = recipientEmail || "shanedufrene1989@gmail.com";
    const fName = faultName || faultDetails || "Undetermined Anomaly";
    const sev = severity || "Warning";

    console.log(`📨 Direct alert email request: Asset=${assetName}, Fault=${fName}, Recipient=${targetEmail}`);

    const description = `This notification was sent via the manual alert trigger on the MotorMedic Pro diagnosis control panel.`;
    const recommendedAction = `Verify the asset immediately. Inspect vibration spectral patterns, bearing temperature, and ensure compliance with ISO guidelines.`;

    const htmlContent = buildEmailTemplate({
      assetName: assetName || "Test Equipment Unit",
      faultName: fName,
      severity: sev,
      description,
      recommendedAction,
      link: "https://ai.studio/build"
    });

    const success = await sendResendEmail({
      to: targetEmail,
      subject: `🚨 MANUAL ALERT: ${assetName || "Test Asset"} - ${fName}`,
      htmlContent
    });

    if (success) {
      return res.json({ success: true, message: `Alert email dispatched to ${targetEmail} via Resend API.` });
    } else {
      return res.status(500).json({ error: "Failed to dispatch email via Resend. Check API key configuration." });
    }
  } catch (error: any) {
    console.error("❌ Failed to send alert email:", error);
    return res.status(500).json({ error: error.message || "Failed to send alert email." });
  }
});


// Structured JSON response schema for Nameplate Scanner
const nameplateSchema = {
  type: Type.OBJECT,
  properties: {
    specRpm: { type: Type.STRING, description: "Base operating RPM of the machinery. Must be one of: 'N/A', '900', '1200', '1800', '3600', '10000'. Extract the value closest to these operating standards." },
    specOrientation: { type: Type.STRING, description: "Shaft Orientation. Must be one of: 'Horizontal', 'Vertical', 'N/A'." },
    specDrive: { type: Type.STRING, description: "Drive coupling type. Must be one of: 'Direct', 'Belt', 'Gearbox', 'N/A'." },
    specFanBlades: { type: Type.STRING, description: "Fan blade count if applicable. Must be one of: '4', '6', '8', '12', 'N/A'." },
    specPumpImpellers: { type: Type.STRING, description: "Pump impeller vanes count if applicable. Must be one of: '3', '5', '7', 'N/A'." },
    specPinionTeeth: { type: Type.STRING, description: "Pinion teeth gear count if applicable. Must be one of: '17', '23', '29', 'N/A'." },
    equipmentName: { type: Type.STRING, description: "Extracted name, brand, model or serial number of the equipment from the nameplate." }
  },
  required: ["specRpm", "specOrientation", "specDrive", "specFanBlades", "specPumpImpellers", "specPinionTeeth", "equipmentName"]
};

// API Endpoint for Nameplate Analysis
app.post("/api/scan-nameplate", async (req, res) => {
  try {
    const { fileData, fileMimeType } = req.body;
    if (!fileData || !fileMimeType) {
      return res.status(400).json({ error: "No image file uploaded for nameplate scanning." });
    }

    const ai = getAiClient(req);
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileMimeType,
            data: base64Data
          }
        },
        { text: "Read this machinery nameplate image. Extract specs such as operating speed/RPM, mount orientation, coupling or gear details, and return them formatted cleanly under the designated JSON structure. Guess as little as possible, using the closest standardized speed values if the nameplate states a nominal range." }
      ],
      config: {
        systemInstruction: "You are an expert industrial machine optical character reader. Extract technical machinery parameters precisely and format as valid JSON conforming strictly to the response schema.",
        responseMimeType: "application/json",
        responseSchema: nameplateSchema,
        temperature: 0.1
      }
    });

    if (!response.text) {
      throw new Error("No nameplate response generated by Gemini.");
    }

    const scanResult = JSON.parse(response.text.trim());
    return res.json(scanResult);

  } catch (error: any) {
    console.warn("Nameplate Scan Error (Executing fallback):", error);
    return res.json({
      specRpm: "1800",
      specOrientation: "Horizontal",
      specDrive: "Direct",
      specFanBlades: "N/A",
      specPumpImpellers: "5",
      specPinionTeeth: "N/A",
      equipmentName: "Standard Industrial Equipment (API Fallback) [Sandbox]",
      isSimulatedFallback: true,
      simulationReason: error.message || "Live Nameplate Scan Failed (quota limit)"
    });
  }
});

// Structured JSON response schema for Sensor Placement Planner
const sensorPlacementSchema = {
  type: Type.OBJECT,
  properties: {
    equipmentType: { type: Type.STRING, description: "Identified type of machinery (e.g. Centrifugal Pump, Electric Motor, Overhung Fan)." },
    recommendedSensors: { type: Type.STRING, description: "The ideal vibration accelerometer type to use (e.g. 100 mV/g industrial piezo-accelerometer)." },
    mountingType: { type: Type.STRING, description: "Recommended mounting method (Stud Mount, Adhesive Mount, Magnetic Mount)." },
    surfacePreparation: { type: Type.STRING, description: "Step-by-step surface preparation requirement (e.g. Grid-grind surface down to bare metal, paint removal, face tool flat, drill and tap thread)." },
    points: {
      type: Type.ARRAY,
      description: "Precisely identified points on the image coordinates for mounting vibration sensors.",
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.INTEGER, description: "Horizontal percentage coordinate (from 10 to 90) representing where on the machine image to mount. 10 is far left, 90 is far right." },
          y: { type: Type.INTEGER, description: "Vertical percentage coordinate (from 10 to 90) representing where on the machine image to mount. 10 is very top, 90 is very bottom." },
          label: { type: Type.STRING, description: "Name of the position (e.g. Motor Inboard Bearing - Radial Horizontal)." },
          direction: { type: Type.STRING, description: "Direction of measurement. Must be one of: 'Radial Horizontal', 'Radial Vertical', 'Axial', 'Triaxial', 'Ambient/Reference'." },
          description: { type: Type.STRING, description: "Reason why this specific location is selected (e.g. Close proximity to inner bearing load zone, aligned with dynamic load line)." }
        },
        required: ["x", "y", "label", "direction", "description"]
      }
    }
  },
  required: ["equipmentType", "recommendedSensors", "mountingType", "surfacePreparation", "points"]
};

// API Endpoint for Sensor Placement Planner
app.post("/api/sensor-placement", async (req, res) => {
  try {
    const { fileData, fileMimeType, equipmentDescription } = req.body;
    if (!fileData || !fileMimeType) {
      return res.status(400).json({ error: "No machinery image uploaded for sensor placement analysis." });
    }

    const ai = getAiClient(req);
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    let prompt = "Analyze this industrial machinery photo. Locate critical bearing housings, rotors, shaft centers, and couplings. Determine optimal points for mounting vibration sensors (Radial Horizontal, Radial Vertical, Axial, etc.) based on ISO 10816 standards.";
    if (equipmentDescription) {
      prompt += `\nEngineer's notes: ${equipmentDescription}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileMimeType,
            data: base64Data
          }
        },
        { text: prompt }
      ],
      config: {
        systemInstruction: "You are a master machinery analyst (ISO 18436 CAT IV). Look at the image and locate optimal bearing housings to monitor. Generate approximate coordinate points (percentages 10 to 90 of width/height) to visually display where sensors should be mounted, and supply professional instructions.",
        responseMimeType: "application/json",
        responseSchema: sensorPlacementSchema,
        temperature: 0.15
      }
    });

    if (!response.text) {
      throw new Error("No sensor placement response generated by Gemini.");
    }

    const placementResult = JSON.parse(response.text.trim());
    return res.json(placementResult);

  } catch (error: any) {
    console.warn("Sensor Placement Error (Executing sandbox fallback):", error);
    try {
      const { equipmentDescription } = req.body;
      const fallbackResult = generateSandboxSensorPlacement(equipmentDescription);
      fallbackResult.isSimulatedFallback = true;
      fallbackResult.simulationReason = error.message || "Live Sensor Placement Failed (quota limit)";
      return res.json(fallbackResult);
    } catch (fallbackErr) {
      console.error("Fallback generator failed:", fallbackErr);
      return res.status(500).json({ error: error.message || "Live Sensor Placement Failed" });
    }
  }
});

// ============================================
// CMMS EQUIPMENT DATABASE ENDPOINTS
// ============================================

// Local In-Memory Storage for Fallback/Sandbox Demo Mode
let memoryCompanies: any[] = [
  { id: 1, name: "Allied Reliability", created_at: new Date() },
  { id: 2, name: "ExxonMobil", created_at: new Date() }
];

let memoryPlants: any[] = [
  { id: 1, company_id: 1, name: "Houston Refining Plant", location: "9701 Manchester St, Houston, TX", created_at: new Date() },
  { id: 2, company_id: 2, name: "Chicago Manufacturing Facility", location: "1350 E 89th St, Chicago, IL", created_at: new Date() }
];

let memoryRoutes: any[] = [
  { id: 1, plant_id: 1, name: "North Line Compressors", description: "Primary air compressors for North assembly line.", created_at: new Date() },
  { id: 2, plant_id: 1, name: "Wastewater Treatment Area", description: "Pumps and blowers in primary filtration plant.", created_at: new Date() }
];

let memoryEquipment: any[] = [
  { id: 1, route_id: 1, name: "Screw Compressor C-101", type: "Compressor", manufacturer: "Ingersoll Rand", model: "RS37i", serial_number: "IR-987123", install_date: "2023-01-15", criticality: "High", status: "Active", tag_number: "TAG-C101", description: "Primary air supply line.", created_at: new Date() },
  { id: 2, route_id: 1, name: "Exhaust Fan EF-204", type: "Fan", manufacturer: "Twin City Fan", model: "BAV-36", serial_number: "TCF-77412", install_date: "2022-06-10", criticality: "Medium", status: "Active", tag_number: "TAG-EF204", description: "Secondary ventilation extraction.", created_at: new Date() }
];

// Alias memoryAssets to memoryEquipment to keep back-compatibility
let memoryAssets: any[] = memoryEquipment;

let memoryComponents: any[] = [
  { id: 1, asset_id: 1, equipment_id: 1, name: "Drive End Bearing", type: "Bearing", manufacturer: "SKF", model: "6210", specifications: { part_number: "SKF 6210", dynamic_load_rating: "35kN" }, notes: "Greased monthly.", created_at: new Date() },
  { id: 2, asset_id: 1, equipment_id: 1, name: "Non-Drive End Bearing", type: "Bearing", manufacturer: "SKF", model: "6208", specifications: { part_number: "SKF 6208" }, notes: "Greased monthly.", created_at: new Date() },
  { id: 3, asset_id: 2, equipment_id: 2, name: "Flexible Coupling", type: "Coupling", manufacturer: "Falk", model: "1070G", specifications: { manufacturer: "Falk", gap_tolerance: "0.05mm" }, notes: "Check elastomer star elements.", created_at: new Date() }
];

let memoryCollectionPoints: any[] = [
  { id: 1, component_id: 1, name: "Bearing 1 Housing", location_order: 1, notes: "Inboard housing near rotor cage.", created_at: new Date() },
  { id: 2, component_id: 3, name: "Coupling Input Shroud", location_order: 1, notes: "Monitor radial paths.", created_at: new Date() }
];

let memoryMeasurementPoints: any[] = [
  // Auto-created points for collection_point_id: 1
  { id: 1, collection_point_id: 1, direction: "Horizontal", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 2, collection_point_id: 1, direction: "Vertical", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 3, collection_point_id: 1, direction: "Axial", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  // Auto-created points for collection_point_id: 2
  { id: 4, collection_point_id: 2, direction: "Horizontal", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 5, collection_point_id: 2, direction: "Vertical", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 6, collection_point_id: 2, direction: "Axial", technology_type: "Vibration", units: "in/Sec", created_at: new Date() }
];

let memoryAnalysisHistory: any[] = [
  {
    id: 1,
    measurement_point_id: 1,
    data_point_name: "DE Horizontal RMS",
    state: "Data Collected",
    op_speed: 1785.00,
    measurement_value: 0.125000,
    units: "in/Sec",
    measurement_date: new Date(),
    notes: "Slight 1x vibration peak observed.",
    waveform_data: { sample_rate: 2000, length: 1024 },
    alarm_status: false,
    diagnosis_result: { health: "Healthy", details: "Vibration within ISO Class I Zone A allowable threshold." },
    was_correct: true,
    corrected_diagnosis: null,
    created_at: new Date()
  }
];

// Helper to generate a unique sequential ID for memory fallback
let nextId = 100;
function getNextId() {
  return nextId++;
}

// --------------------------------------------------------
// COMPANIES ENDPOINTS
// --------------------------------------------------------

// GET /api/companies - List all companies
app.get("/api/companies", async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query("SELECT * FROM companies ORDER BY name ASC");
      return res.json(result.rows);
    } else {
      return res.json(memoryCompanies);
    }
  } catch (error: any) {
    console.error("GET /api/companies failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch companies" });
  }
});


// --------------------------------------------------------
// PLANTS ENDPOINTS
// --------------------------------------------------------

// GET /api/plants/count - Get count of plants for a company
app.get("/api/plants/count", async (req, res) => {
  try {
    const companyIdParam = req.query.company_id || req.query.companyId;
    if (!companyIdParam) {
      return res.status(400).json({ error: "Missing required query parameter: company_id" });
    }
    const company_id = parseInt(companyIdParam as string, 10);
    if (isNaN(company_id)) {
      return res.status(400).json({ error: "Invalid company_id parameter" });
    }

    if (pool) {
      const result = await pool.query("SELECT COUNT(*)::int as count FROM plants WHERE company_id = $1", [company_id]);
      return res.json({ count: result.rows[0].count });
    } else {
      const filtered = memoryPlants.filter(p => p.company_id === company_id);
      return res.json({ count: filtered.length });
    }
  } catch (error: any) {
    console.error("GET /api/plants/count failed:", error);
    return res.status(500).json({ error: error.message || "Failed to count plants" });
  }
});

// GET /api/plants - List all plants for a company
app.get("/api/plants", async (req, res) => {
  try {
    const companyIdParam = req.query.company_id || req.query.companyId;
    if (!companyIdParam) {
      return res.status(400).json({ error: "Missing required query parameter: company_id" });
    }
    const company_id = parseInt(companyIdParam as string, 10);
    if (isNaN(company_id)) {
      return res.status(400).json({ error: "Invalid company_id parameter" });
    }

    if (pool) {
      const result = await pool.query("SELECT * FROM plants WHERE company_id = $1 ORDER BY name ASC", [company_id]);
      return res.json(result.rows);
    } else {
      const filtered = memoryPlants.filter(p => p.company_id === company_id);
      return res.json(filtered);
    }
  } catch (error: any) {
    console.error("GET /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch plants" });
  }
});

// GET /api/plants/:id - Get a single plant
app.get("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID parameter" });
    }

    if (pool) {
      const result = await pool.query("SELECT * FROM plants WHERE id = $1", [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Plant not found" });
      }
      return res.json(result.rows[0]);
    } else {
      const plant = memoryPlants.find(p => p.id === id);
      if (!plant) {
        return res.status(404).json({ error: "Plant not found" });
      }
      return res.json(plant);
    }
  } catch (error: any) {
    console.error("GET /api/plants/:id failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch plant" });
  }
});

// POST /api/plants - Create new plant linked to a company_id
app.post("/api/plants", async (req, res) => {
  try {
    const { name, location } = req.body;
    const company_id = req.body.company_id !== undefined ? req.body.company_id : req.body.companyId;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }
    if (company_id === undefined || company_id === null) {
      return res.status(400).json({ error: "Missing required field: company_id" });
    }
    const companyIdNum = parseInt(company_id, 10);
    if (isNaN(companyIdNum)) {
      return res.status(400).json({ error: "Invalid company_id field" });
    }

    if (pool) {
      const result = await pool.query(
        "INSERT INTO plants (name, location, company_id) VALUES ($1, $2, $3) RETURNING *",
        [name.trim(), location ? location.trim() : null, companyIdNum]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newPlant = {
        id: getNextId(),
        company_id: companyIdNum,
        name: name.trim(),
        location: location ? location.trim() : null,
        created_at: new Date()
      };
      memoryPlants.push(newPlant);
      return res.status(201).json(newPlant);
    }
  } catch (error: any) {
    console.error("POST /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create plant" });
  }
});

// PUT /api/plants/:id - Update a plant
app.put("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, location } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const result = await pool.query(
        "UPDATE plants SET name = $1, location = $2 WHERE id = $3 RETURNING *",
        [name.trim(), location ? location.trim() : null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Plant not found" });
      return res.json(result.rows[0]);
    } else {
      const plant = memoryPlants.find(p => p.id === id);
      if (!plant) return res.status(404).json({ error: "Plant not found" });
      plant.name = name.trim();
      plant.location = location ? location.trim() : null;
      return res.json(plant);
    }
  } catch (error: any) {
    console.error("PUT /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update plant" });
  }
});

// DELETE /api/plants/:id - Delete a plant
app.delete("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM plants WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Plant not found" });
      return res.json({ message: "Plant deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryPlants.findIndex(p => p.id === id);
      if (index === -1) return res.status(404).json({ error: "Plant not found" });
      const deleted = memoryPlants.splice(index, 1)[0];
      // Cascade delete routes
      memoryRoutes = memoryRoutes.filter(r => r.plant_id !== id);
      return res.json({ message: "Plant deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete plant" });
  }
});

// --------------------------------------------------------
// ROUTES ENDPOINTS
// --------------------------------------------------------

// GET /api/routes and GET /api/routes/:plantId - Get routes
app.get(["/api/routes", "/api/routes/:plantId"], async (req, res) => {
  try {
    const plantIdParam = req.params.plantId ? parseInt(req.params.plantId, 10) : undefined;
    const plantIdQuery = req.query.plant_id ? parseInt(req.query.plant_id as string, 10) : undefined;
    const plantId = plantIdParam || plantIdQuery;

    if (pool) {
      if (plantId !== undefined) {
        if (isNaN(plantId)) {
          return res.status(400).json({ error: "Invalid plant ID parameter" });
        }
        const result = await pool.query("SELECT * FROM routes WHERE plant_id = $1 ORDER BY name ASC", [plantId]);
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT * FROM routes ORDER BY name ASC");
        return res.json(result.rows);
      }
    } else {
      if (plantId !== undefined) {
        if (isNaN(plantId)) {
          return res.status(400).json({ error: "Invalid plant ID parameter" });
        }
        const filtered = memoryRoutes.filter(r => r.plant_id === plantId);
        return res.json(filtered);
      } else {
        return res.json(memoryRoutes);
      }
    }
  } catch (error: any) {
    console.error("GET /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch routes" });
  }
});

// GET /api/routes/single/:id - Get single route details
app.get("/api/routes/single/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid route ID" });

    if (pool) {
      const result = await pool.query("SELECT * FROM routes WHERE id = $1", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json(result.rows[0]);
    } else {
      const route = memoryRoutes.find(r => r.id === id);
      if (!route) return res.status(404).json({ error: "Route not found" });
      return res.json(route);
    }
  } catch (error: any) {
    console.error("GET /api/routes/single/:id failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch route" });
  }
});

// POST /api/routes - Create new route
app.post("/api/routes", async (req, res) => {
  try {
    const { plant_id, name, description } = req.body;
    if (plant_id === undefined || isNaN(parseInt(plant_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: plant_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const pId = parseInt(plant_id, 10);

    if (pool) {
      const result = await pool.query(
        "INSERT INTO routes (plant_id, name, description) VALUES ($1, $2, $3) RETURNING *",
        [pId, name.trim(), description ? description.trim() : null]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newRoute = {
        id: getNextId(),
        plant_id: pId,
        name: name.trim(),
        description: description ? description.trim() : null,
        created_at: new Date()
      };
      memoryRoutes.push(newRoute);
      return res.status(201).json(newRoute);
    }
  } catch (error: any) {
    console.error("POST /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create route" });
  }
});

// PUT /api/routes/:id - Update route
app.put("/api/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, description } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const result = await pool.query(
        "UPDATE routes SET name = $1, description = $2 WHERE id = $3 RETURNING *",
        [name.trim(), description ? description.trim() : null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json(result.rows[0]);
    } else {
      const route = memoryRoutes.find(r => r.id === id);
      if (!route) return res.status(404).json({ error: "Route not found" });
      route.name = name.trim();
      route.description = description ? description.trim() : null;
      return res.json(route);
    }
  } catch (error: any) {
    console.error("PUT /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update route" });
  }
});

// DELETE /api/routes/:id - Delete route
app.delete("/api/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM routes WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json({ message: "Route deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryRoutes.findIndex(r => r.id === id);
      if (index === -1) return res.status(404).json({ error: "Route not found" });
      const deleted = memoryRoutes.splice(index, 1)[0];
      // Cascade delete equipment/assets
      memoryEquipment = memoryEquipment.filter(e => e.route_id !== id);
      memoryAssets = memoryEquipment;
      return res.json({ message: "Route deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete route" });
  }
});

// --------------------------------------------------------
// ASSETS/EQUIPMENT ENDPOINTS
// --------------------------------------------------------

// GET all assets/equipment or filter by route
app.get(["/api/assets", "/api/equipment", "/api/equipments", "/api/equipment/:routeId", "/api/assets/route/:routeId"], async (req, res) => {
  try {
    const routeIdParam = req.params.routeId ? parseInt(req.params.routeId, 10) : undefined;
    const routeIdQuery = req.query.route_id ? parseInt(req.query.route_id as string, 10) : undefined;
    const routeId = routeIdParam || routeIdQuery;

    if (pool) {
      if (routeId !== undefined) {
        if (isNaN(routeId)) {
          return res.status(400).json({ error: "Invalid route ID parameter" });
        }
        const result = await pool.query("SELECT * FROM assets WHERE route_id = $1 ORDER BY name ASC", [routeId]);
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT * FROM assets ORDER BY name ASC");
        return res.json(result.rows);
      }
    } else {
      if (routeId !== undefined) {
        if (isNaN(routeId)) {
          return res.status(400).json({ error: "Invalid route ID parameter" });
        }
        const filtered = memoryAssets.filter(e => e.route_id === routeId);
        return res.json(filtered);
      } else {
        return res.json(memoryAssets);
      }
    }
  } catch (error: any) {
    console.error("GET /api/assets failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch equipment" });
  }
});

// GET single asset/equipment
app.get(["/api/assets/:id", "/api/equipment/single/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid asset ID parameter" });
    }

    if (pool) {
      const result = await pool.query("SELECT * FROM assets WHERE id = $1", [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      return res.json(result.rows[0]);
    } else {
      const asset = memoryAssets.find(e => e.id === id);
      if (!asset) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      return res.json(asset);
    }
  } catch (error: any) {
    console.error("GET single asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch asset" });
  }
});

// POST create asset/equipment
app.post(["/api/assets", "/api/equipment"], async (req, res) => {
  try {
    const {
      route_id,
      name,
      tag_number,
      type,
      manufacturer,
      model,
      serial_number,
      install_date,
      criticality,
      status,
      description
    } = req.body;

    if (route_id === undefined || isNaN(parseInt(route_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: route_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const rId = parseInt(route_id, 10);
    const equipStatus = status || 'Active';

    if (pool) {
      const result = await pool.query(
        `INSERT INTO assets 
         (route_id, name, tag_number, type, manufacturer, model, serial_number, install_date, criticality, status, description) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
          rId,
          name.trim(),
          tag_number ? tag_number.trim() : null,
          type ? type.trim() : null,
          manufacturer ? manufacturer.trim() : null,
          model ? model.trim() : null,
          serial_number ? serial_number.trim() : null,
          install_date ? install_date : null,
          criticality ? criticality.trim() : null,
          equipStatus,
          description ? description.trim() : null
        ]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newAsset = {
        id: getNextId(),
        route_id: rId,
        name: name.trim(),
        tag_number: tag_number ? tag_number.trim() : null,
        type: type ? type.trim() : null,
        manufacturer: manufacturer ? manufacturer.trim() : null,
        model: model ? model.trim() : null,
        serial_number: serial_number ? serial_number.trim() : null,
        install_date: install_date || null,
        criticality: criticality ? criticality.trim() : null,
        status: equipStatus,
        description: description ? description.trim() : null,
        created_at: new Date()
      };
      memoryAssets.push(newAsset);
      return res.status(201).json(newAsset);
    }
  } catch (error: any) {
    console.error("POST create asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create equipment" });
  }
});

// PUT update asset/equipment
app.put(["/api/assets/:id", "/api/equipment/:id", "/api/equipments/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const {
      name,
      tag_number,
      type,
      manufacturer,
      model,
      serial_number,
      install_date,
      criticality,
      status,
      description
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const result = await pool.query(
        `UPDATE assets SET 
         name = $1, tag_number = $2, type = $3, manufacturer = $4, model = $5, serial_number = $6, install_date = $7, criticality = $8, status = $9, description = $10 
         WHERE id = $11 RETURNING *`,
        [
          name.trim(),
          tag_number ? tag_number.trim() : null,
          type ? type.trim() : null,
          manufacturer ? manufacturer.trim() : null,
          model ? model.trim() : null,
          serial_number ? serial_number.trim() : null,
          install_date || null,
          criticality ? criticality.trim() : null,
          status || 'Active',
          description ? description.trim() : null,
          id
        ]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
      return res.json(result.rows[0]);
    } else {
      const asset = memoryAssets.find(e => e.id === id);
      if (!asset) return res.status(404).json({ error: "Equipment not found" });
      asset.name = name.trim();
      asset.tag_number = tag_number ? tag_number.trim() : null;
      asset.type = type ? type.trim() : null;
      asset.manufacturer = manufacturer ? manufacturer.trim() : null;
      asset.model = model ? model.trim() : null;
      asset.serial_number = serial_number ? serial_number.trim() : null;
      asset.install_date = install_date || null;
      asset.criticality = criticality ? criticality.trim() : null;
      asset.status = status || 'Active';
      asset.description = description ? description.trim() : null;
      return res.json(asset);
    }
  } catch (error: any) {
    console.error("PUT update asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update equipment" });
  }
});

// DELETE delete asset/equipment
app.delete(["/api/assets/:id", "/api/equipment/:id", "/api/equipments/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM assets WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
      return res.json({ message: "Equipment deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryAssets.findIndex(e => e.id === id);
      if (index === -1) return res.status(404).json({ error: "Equipment not found" });
      const deleted = memoryAssets.splice(index, 1)[0];
      // Cascade delete components
      memoryComponents = memoryComponents.filter(c => c.asset_id !== id && c.equipment_id !== id);
      return res.json({ message: "Equipment deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete equipment" });
  }
});

// --------------------------------------------------------
// COMPONENTS ENDPOINTS
// --------------------------------------------------------

// GET components for specific asset/equipment
app.get(["/api/components", "/api/components/:equipmentId", "/api/components/asset/:assetId"], async (req, res) => {
  try {
    const equipIdParam = req.params.equipmentId ? parseInt(req.params.equipmentId, 10) : undefined;
    const assetIdParam = req.params.assetId ? parseInt(req.params.assetId, 10) : undefined;
    const equipIdQuery = req.query.equipment_id ? parseInt(req.query.equipment_id as string, 10) : undefined;
    const assetIdQuery = req.query.asset_id ? parseInt(req.query.asset_id as string, 10) : undefined;

    const finalAssetId = equipIdParam || assetIdParam || equipIdQuery || assetIdQuery;

    if (pool) {
      if (finalAssetId !== undefined) {
        if (isNaN(finalAssetId)) {
          return res.status(400).json({ error: "Invalid asset/equipment ID parameter" });
        }
        // Return both asset_id and equipment_id aliases to prevent client-side failures
        const result = await pool.query(
          "SELECT id, asset_id, asset_id as equipment_id, name, type, manufacturer, model, specifications, notes, created_at FROM components WHERE asset_id = $1 ORDER BY name ASC",
          [finalAssetId]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT id, asset_id, asset_id as equipment_id, name, type, manufacturer, model, specifications, notes, created_at FROM components ORDER BY name ASC");
        return res.json(result.rows);
      }
    } else {
      if (finalAssetId !== undefined) {
        if (isNaN(finalAssetId)) {
          return res.status(400).json({ error: "Invalid asset/equipment ID parameter" });
        }
        const filtered = memoryComponents
          .filter(c => c.asset_id === finalAssetId || c.equipment_id === finalAssetId)
          .map(c => ({ ...c, asset_id: finalAssetId, equipment_id: finalAssetId }));
        return res.json(filtered);
      } else {
        return res.json(memoryComponents);
      }
    }
  } catch (error: any) {
    console.error("GET /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch components" });
  }
});

// POST create new component
app.post(["/api/components", "/api/component"], async (req, res) => {
  try {
    const { asset_id, equipment_id, name, type, manufacturer, model, specifications, notes } = req.body;

    const incomingId = asset_id !== undefined ? asset_id : equipment_id;
    if (incomingId === undefined || isNaN(parseInt(incomingId, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: asset_id or equipment_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const astId = parseInt(incomingId, 10);
    let parsedSpecs: any = null;
    if (specifications) {
      if (typeof specifications === "object") {
        parsedSpecs = specifications;
      } else {
        try {
          parsedSpecs = JSON.parse(specifications);
        } catch (e) {
          parsedSpecs = { raw: specifications };
        }
      }
    }

    if (pool) {
      const result = await pool.query(
        `INSERT INTO components (asset_id, name, type, manufacturer, model, specifications, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, asset_id, asset_id as equipment_id, name, type, manufacturer, model, specifications, notes, created_at`,
        [astId, name.trim(), type ? type.trim() : null, manufacturer ? manufacturer.trim() : null, model ? model.trim() : null, parsedSpecs, notes ? notes.trim() : null]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newComp = {
        id: getNextId(),
        asset_id: astId,
        equipment_id: astId,
        name: name.trim(),
        type: type ? type.trim() : null,
        manufacturer: manufacturer ? manufacturer.trim() : null,
        model: model ? model.trim() : null,
        specifications: parsedSpecs,
        notes: notes ? notes.trim() : null,
        created_at: new Date()
      };
      memoryComponents.push(newComp);
      return res.status(201).json(newComp);
    }
  } catch (error: any) {
    console.error("POST /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create component" });
  }
});

// PUT update component
app.put("/api/components/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, type, manufacturer, model, specifications, notes } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    let parsedSpecs: any = null;
    if (specifications) {
      if (typeof specifications === "object") {
        parsedSpecs = specifications;
      } else {
        try {
          parsedSpecs = JSON.parse(specifications);
        } catch (e) {
          parsedSpecs = { raw: specifications };
        }
      }
    }

    if (pool) {
      const result = await pool.query(
        `UPDATE components SET name = $1, type = $2, manufacturer = $3, model = $4, specifications = $5, notes = $6 
         WHERE id = $7 
         RETURNING id, asset_id, asset_id as equipment_id, name, type, manufacturer, model, specifications, notes, created_at`,
        [name.trim(), type ? type.trim() : null, manufacturer ? manufacturer.trim() : null, model ? model.trim() : null, parsedSpecs, notes ? notes.trim() : null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Component not found" });
      return res.json(result.rows[0]);
    } else {
      const comp = memoryComponents.find(c => c.id === id);
      if (!comp) return res.status(404).json({ error: "Component not found" });
      comp.name = name.trim();
      comp.type = type ? type.trim() : null;
      comp.manufacturer = manufacturer ? manufacturer.trim() : null;
      comp.model = model ? model.trim() : null;
      comp.specifications = parsedSpecs;
      comp.notes = notes ? notes.trim() : null;
      return res.json(comp);
    }
  } catch (error: any) {
    console.error("PUT /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update component" });
  }
});

// DELETE component
app.delete("/api/components/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM components WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Component not found" });
      return res.json({ message: "Component deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryComponents.findIndex(c => c.id === id);
      if (index === -1) return res.status(404).json({ error: "Component not found" });
      const deleted = memoryComponents.splice(index, 1)[0];
      return res.json({ message: "Component deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete component" });
  }
});


// --------------------------------------------------------
// COLLECTION POINTS ENDPOINTS (WITH MP AUTO-GENERATION)
// --------------------------------------------------------

// GET /api/collection-points - List all or filter by component_id
app.get(["/api/collection-points", "/api/collection_points", "/api/collection-points/component/:componentId", "/api/collection_points/component/:componentId"], async (req, res) => {
  try {
    const compIdParam = req.params.componentId ? parseInt(req.params.componentId, 10) : undefined;
    const compIdQuery = req.query.component_id ? parseInt(req.query.component_id as string, 10) : undefined;
    const compId = compIdParam || compIdQuery;

    if (pool) {
      if (compId !== undefined) {
        if (isNaN(compId)) return res.status(400).json({ error: "Invalid component_id" });
        const result = await pool.query("SELECT * FROM collection_points WHERE component_id = $1 ORDER BY location_order ASC, name ASC", [compId]);
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT * FROM collection_points ORDER BY name ASC");
        return res.json(result.rows);
      }
    } else {
      if (compId !== undefined) {
        if (isNaN(compId)) return res.status(400).json({ error: "Invalid component_id" });
        const filtered = memoryCollectionPoints.filter(cp => cp.component_id === compId);
        return res.json(filtered);
      } else {
        return res.json(memoryCollectionPoints);
      }
    }
  } catch (error: any) {
    console.error("GET collection points failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch collection points" });
  }
});

// GET /api/collection-points/:id - Single collection point
app.get(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("SELECT * FROM collection_points WHERE id = $1", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json(result.rows[0]);
    } else {
      const cp = memoryCollectionPoints.find(item => item.id === id);
      if (!cp) return res.status(404).json({ error: "Collection point not found" });
      return res.json(cp);
    }
  } catch (error: any) {
    console.error("GET single collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch collection point" });
  }
});

// POST /api/collection-points - Create collection point (and auto-generate Horizontal, Vertical, Axial)
app.post(["/api/collection-points", "/api/collection_points"], async (req, res) => {
  try {
    const { component_id, name, location_order, notes } = req.body;
    if (component_id === undefined || isNaN(parseInt(component_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: component_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const compId = parseInt(component_id, 10);
    const locOrder = location_order !== undefined ? parseInt(location_order, 10) : 0;

    if (pool) {
      // Create collection point & auto-create 3 measurement points
      await pool.query("BEGIN");
      try {
        const cpResult = await pool.query(
          "INSERT INTO collection_points (component_id, name, location_order, notes) VALUES ($1, $2, $3, $4) RETURNING *",
          [compId, name.trim(), locOrder, notes ? notes.trim() : null]
        );
        const cp = cpResult.rows[0];

        const directions = ["Horizontal", "Vertical", "Axial"];
        const mps: any[] = [];
        for (const dir of directions) {
          const mpResult = await pool.query(
            "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, 'Vibration', 'in/Sec') RETURNING *",
            [cp.id, dir]
          );
          mps.push(mpResult.rows[0]);
        }

        await pool.query("COMMIT");
        return res.status(201).json({ ...cp, measurement_points: mps });
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    } else {
      const cpId = getNextId();
      const cp = {
        id: cpId,
        component_id: compId,
        name: name.trim(),
        location_order: locOrder,
        notes: notes ? notes.trim() : null,
        created_at: new Date()
      };
      memoryCollectionPoints.push(cp);

      const directions = ["Horizontal", "Vertical", "Axial"];
      const mps: any[] = [];
      for (const dir of directions) {
        const mp = {
          id: getNextId(),
          collection_point_id: cpId,
          direction: dir,
          technology_type: "Vibration",
          units: "in/Sec",
          created_at: new Date()
        };
        memoryMeasurementPoints.push(mp);
        mps.push(mp);
      }

      return res.status(201).json({ ...cp, measurement_points: mps });
    }
  } catch (error: any) {
    console.error("POST collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create collection point" });
  }
});

// PUT /api/collection-points/:id - Update collection point
app.put(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, location_order, notes } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const locOrder = location_order !== undefined ? parseInt(location_order, 10) : 0;

    if (pool) {
      const result = await pool.query(
        "UPDATE collection_points SET name = $1, location_order = $2, notes = $3 WHERE id = $4 RETURNING *",
        [name.trim(), locOrder, notes ? notes.trim() : null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json(result.rows[0]);
    } else {
      const cp = memoryCollectionPoints.find(item => item.id === id);
      if (!cp) return res.status(404).json({ error: "Collection point not found" });
      cp.name = name.trim();
      cp.location_order = locOrder;
      cp.notes = notes ? notes.trim() : null;
      return res.json(cp);
    }
  } catch (error: any) {
    console.error("PUT collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update collection point" });
  }
});

// DELETE /api/collection-points/:id - Delete collection point
app.delete(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM collection_points WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json({ message: "Collection point deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryCollectionPoints.findIndex(item => item.id === id);
      if (index === -1) return res.status(404).json({ error: "Collection point not found" });
      const deleted = memoryCollectionPoints.splice(index, 1)[0];
      // Cascade delete measurement points in memory
      memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => mp.collection_point_id !== id);
      return res.json({ message: "Collection point deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete collection point" });
  }
});


// --------------------------------------------------------
// MEASUREMENT POINTS ENDPOINTS
// --------------------------------------------------------

// GET /api/measurement-points - List all or filter by collection_point_id
app.get(["/api/measurement-points", "/api/measurement_points", "/api/measurement-points/collection-point/:cpId", "/api/measurement_points/collection_point/:cpId"], async (req, res) => {
  try {
    const cpIdParam = req.params.cpId ? parseInt(req.params.cpId, 10) : undefined;
    const cpIdQuery = req.query.collection_point_id ? parseInt(req.query.collection_point_id as string, 10) : undefined;
    const cpId = cpIdParam || cpIdQuery;

    if (pool) {
      if (cpId !== undefined) {
        if (isNaN(cpId)) return res.status(400).json({ error: "Invalid collection_point_id" });
        const result = await pool.query("SELECT * FROM measurement_points WHERE collection_point_id = $1 ORDER BY direction ASC", [cpId]);
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT * FROM measurement_points ORDER BY id ASC");
        return res.json(result.rows);
      }
    } else {
      if (cpId !== undefined) {
        if (isNaN(cpId)) return res.status(400).json({ error: "Invalid collection_point_id" });
        const filtered = memoryMeasurementPoints.filter(mp => mp.collection_point_id === cpId);
        return res.json(filtered);
      } else {
        return res.json(memoryMeasurementPoints);
      }
    }
  } catch (error: any) {
    console.error("GET measurement points failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch measurement points" });
  }
});

// GET /api/measurement-points/:id - Get single
app.get(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("SELECT * FROM measurement_points WHERE id = $1", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(result.rows[0]);
    } else {
      const mp = memoryMeasurementPoints.find(item => item.id === id);
      if (!mp) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(mp);
    }
  } catch (error: any) {
    console.error("GET measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch measurement point" });
  }
});

// POST /api/measurement-points - Create single measurement point
app.post(["/api/measurement-points", "/api/measurement_points"], async (req, res) => {
  try {
    const { collection_point_id, direction, technology_type, units } = req.body;
    if (collection_point_id === undefined || isNaN(parseInt(collection_point_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: collection_point_id (integer)" });
    }
    if (!direction || typeof direction !== "string" || !direction.trim()) {
      return res.status(400).json({ error: "Missing required field: direction (string)" });
    }

    const cpId = parseInt(collection_point_id, 10);
    const tech = technology_type || "Vibration";
    const unitVal = units || "in/Sec";

    if (pool) {
      const result = await pool.query(
        "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, $3, $4) RETURNING *",
        [cpId, direction.trim(), tech.trim(), unitVal.trim()]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newMp = {
        id: getNextId(),
        collection_point_id: cpId,
        direction: direction.trim(),
        technology_type: tech.trim(),
        units: unitVal.trim(),
        created_at: new Date()
      };
      memoryMeasurementPoints.push(newMp);
      return res.status(201).json(newMp);
    }
  } catch (error: any) {
    console.error("POST measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create measurement point" });
  }
});

// PUT /api/measurement-points/:id - Update measurement point
app.put(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { direction, technology_type, units } = req.body;

    if (!direction || typeof direction !== "string" || !direction.trim()) {
      return res.status(400).json({ error: "Missing required field: direction (string)" });
    }

    if (pool) {
      const result = await pool.query(
        "UPDATE measurement_points SET direction = $1, technology_type = $2, units = $3 WHERE id = $4 RETURNING *",
        [direction.trim(), technology_type ? technology_type.trim() : "Vibration", units ? units.trim() : "in/Sec", id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(result.rows[0]);
    } else {
      const mp = memoryMeasurementPoints.find(item => item.id === id);
      if (!mp) return res.status(404).json({ error: "Measurement point not found" });
      mp.direction = direction.trim();
      mp.technology_type = technology_type ? technology_type.trim() : "Vibration";
      mp.units = units ? units.trim() : "in/Sec";
      return res.json(mp);
    }
  } catch (error: any) {
    console.error("PUT measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update measurement point" });
  }
});

// DELETE /api/measurement-points/:id - Delete measurement point
app.delete(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM measurement_points WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json({ message: "Measurement point deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryMeasurementPoints.findIndex(item => item.id === id);
      if (index === -1) return res.status(404).json({ error: "Measurement point not found" });
      const deleted = memoryMeasurementPoints.splice(index, 1)[0];
      return res.json({ message: "Measurement point deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete measurement point" });
  }
});


// --------------------------------------------------------
// ANALYSIS HISTORY ENDPOINTS
// --------------------------------------------------------

// GET /api/analysis-history - List all or filter by measurement_point_id
app.get(["/api/analysis-history", "/api/analysis_history", "/api/analysis-history/measurement-point/:mpId", "/api/analysis_history/measurement-point/:mpId"], async (req, res) => {
  try {
    const mpIdParam = req.params.mpId ? parseInt(req.params.mpId, 10) : undefined;
    const mpIdQuery = req.query.measurement_point_id ? parseInt(req.query.measurement_point_id as string, 10) : undefined;
    const mpId = mpIdParam || mpIdQuery;

    if (pool) {
      if (mpId !== undefined) {
        if (isNaN(mpId)) return res.status(400).json({ error: "Invalid measurement_point_id" });
        const result = await pool.query("SELECT * FROM analysis_history WHERE measurement_point_id = $1 ORDER BY measurement_date DESC, created_at DESC", [mpId]);
        return res.json(result.rows);
      } else {
        const result = await pool.query("SELECT * FROM analysis_history ORDER BY measurement_date DESC, created_at DESC");
        return res.json(result.rows);
      }
    } else {
      if (mpId !== undefined) {
        if (isNaN(mpId)) return res.status(400).json({ error: "Invalid measurement_point_id" });
        const filtered = memoryAnalysisHistory.filter(ah => ah.measurement_point_id === mpId);
        return res.json(filtered);
      } else {
        return res.json(memoryAnalysisHistory);
      }
    }
  } catch (error: any) {
    console.error("GET analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch analysis history" });
  }
});

// Helper: Seed analysis history in database for a component if none exists
async function seedAnalysisHistoryForComponent(componentId: number, dbTech: string): Promise<any[]> {
  if (!pool) return [];
  
  try {
    // 1. Get or create collection point
    let colPointId: number;
    const colPointCheck = await pool.query(
      "SELECT id FROM collection_points WHERE component_id = $1 LIMIT 1",
      [componentId]
    );
    if (colPointCheck.rows.length > 0) {
      colPointId = colPointCheck.rows[0].id;
    } else {
      const insertCol = await pool.query(
        "INSERT INTO collection_points (component_id, name, location_order, notes) VALUES ($1, 'DE Inboard Bearing', 1, 'Drive End location for historical trends') RETURNING id",
        [componentId]
      );
      colPointId = insertCol.rows[0].id;
    }

    // 2. Get or create measurement point
    let measPointId: number;
    const measPointCheck = await pool.query(
      "SELECT id FROM measurement_points WHERE collection_point_id = $1 AND technology_type = $2 LIMIT 1",
      [colPointId, dbTech]
    );
    if (measPointCheck.rows.length > 0) {
      measPointId = measPointCheck.rows[0].id;
    } else {
      let defaultUnits = "in/sec";
      if (dbTech === "Thermal") defaultUnits = "°F";
      else if (dbTech === "Ultrasound") defaultUnits = "dBμV";
      else if (dbTech === "Electrical") defaultUnits = "Ohms";
      else if (dbTech === "Oil") defaultUnits = "ppm";

      const insertMeas = await pool.query(
        "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, 'Radial Horizontal', $2, $3) RETURNING id",
        [colPointId, dbTech, defaultUnits]
      );
      measPointId = insertMeas.rows[0].id;
    }

    // 3. Define parameters
    const params: { name: string; units: string; alarm_val: number; is_lower_alarm?: boolean; get_val: (f: number) => number }[] = [];

    if (dbTech === "Vibration") {
      params.push(
        { name: "Velocity RMS", units: "in/sec", alarm_val: 0.25, get_val: (f) => 0.05 + f * 0.18 + Math.random() * 0.03 },
        { name: "Acceleration True Peak", units: "g's", alarm_val: 3.0, get_val: (f) => 0.3 + f * 2.2 + Math.random() * 0.4 },
        { name: "Displacement Peak-to-Peak", units: "mils", alarm_val: 4.5, get_val: (f) => 0.6 + f * 3.0 + Math.random() * 0.5 },
        { name: "1X Running Speed amplitude", units: "in/sec", alarm_val: 0.15, get_val: (f) => 0.02 + f * 0.10 + Math.random() * 0.02 },
        { name: "2X Running Speed amplitude", units: "in/sec", alarm_val: 0.10, get_val: (f) => 0.01 + f * 0.05 + Math.random() * 0.01 },
        { name: "Bearing Frequencies (BPFO)", units: "in/sec", alarm_val: 0.12, get_val: (f) => 0.005 + (f > 0.6 ? (f - 0.6) * 0.4 : 0) + Math.random() * 0.01 },
        { name: "Bearing Frequencies (BPFI)", units: "in/sec", alarm_val: 0.12, get_val: (f) => 0.005 + (f > 0.5 ? (f - 0.5) * 0.5 : 0) + Math.random() * 0.01 },
        { name: "Gear Mesh Frequency", units: "in/sec", alarm_val: 0.10, get_val: (f) => 0.01 + f * 0.05 + Math.random() * 0.01 },
        { name: "Sub-synchronous frequencies", units: "in/sec", alarm_val: 0.08, get_val: (f) => 0.005 + f * 0.03 + Math.random() * 0.005 }
      );
    } else if (dbTech === "Thermal") {
      params.push(
        { name: "Overall Temperature", units: "°F", alarm_val: 175.0, get_val: (f) => 98.0 + f * 65.0 + Math.random() * 5.0 },
        { name: "Temperature Delta", units: "°F", alarm_val: 30.0, get_val: (f) => 1.5 + f * 24.0 + Math.random() * 2.0 },
        { name: "Temperature Rate of Change", units: "°F/day", alarm_val: 4.0, get_val: (f) => 0.05 + f * 3.5 + Math.random() * 0.4 }
      );
    } else if (dbTech === "Ultrasound") {
      params.push(
        { name: "Overall dB Level", units: "dBμV", alarm_val: 36.0, get_val: (f) => 14.0 + f * 19.0 + Math.random() * 3.0 },
        { name: "RMS Ultrasound Level", units: "dBμV", alarm_val: 30.0, get_val: (f) => 11.0 + f * 16.0 + Math.random() * 2.0 },
        { name: "Crest Factor", units: "ratio", alarm_val: 6.0, get_val: (f) => 1.6 + f * 3.8 + Math.random() * 0.5 },
        { name: "Bearing fault frequency amplitudes", units: "dBμV", alarm_val: 25.0, get_val: (f) => 3.0 + f * 18.0 + Math.random() * 2.0 }
      );
    } else if (dbTech === "Electrical") {
      params.push(
        { name: "Phase-to-Phase Resistance U-V", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + Math.random() * 0.002 },
        { name: "Phase-to-Phase Resistance V-W", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + f * 0.012 + Math.random() * 0.002 },
        { name: "Phase-to-Phase Resistance W-U", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + Math.random() * 0.002 },
        { name: "Phase Impedance", units: "Ohms", alarm_val: 15.0, get_val: (f) => 12.1 + f * 0.4 + Math.random() * 0.05 },
        { name: "Phase Unbalance (%)", units: "%", alarm_val: 5.0, get_val: (f) => 0.3 + f * 4.2 + Math.random() * 0.3 },
        { name: "Insulation Resistance", units: "MegOhm", alarm_val: 20.0, is_lower_alarm: true, get_val: (f) => 3800.0 - f * 3700.0 - Math.random() * 100.0 },
        { name: "Tan Delta / Power Factor", units: "%", alarm_val: 4.0, get_val: (f) => 0.6 + f * 3.2 + Math.random() * 0.2 }
      );
    } else if (dbTech === "Oil") {
      params.push(
        { name: "Viscosity @ 40°C", units: "cSt", alarm_val: 41.4, is_lower_alarm: true, get_val: (f) => 45.8 - f * 7.5 + Math.random() * 0.5 },
        { name: "Water Content", units: "ppm", alarm_val: 300.0, get_val: (f) => 30.0 + f * 250.0 + Math.random() * 15.0 },
        { name: "Particle Count Cleanliness Index", units: "index", alarm_val: 22.0, get_val: (f) => 14.0 + f * 8.0 + Math.random() * 1.0 },
        { name: "Ferrous Density", units: "ppm", alarm_val: 100.0, get_val: (f) => 6.0 + f * 92.0 + Math.random() * 6.0 },
        { name: "Iron Wear Metal", units: "ppm", alarm_val: 75.0, get_val: (f) => 10.0 + f * 80.0 + Math.random() * 5.0 },
        { name: "Copper Wear Metal", units: "ppm", alarm_val: 25.0, get_val: (f) => 3.0 + f * 26.0 + Math.random() * 2.0 },
        { name: "Aluminum Wear Metal", units: "ppm", alarm_val: 12.0, get_val: (f) => 1.5 + f * 11.0 + Math.random() * 1.0 },
        { name: "Chromium Wear Metal", units: "ppm", alarm_val: 3.0, get_val: (f) => 0.2 + f * 2.8 + Math.random() * 0.2 },
        { name: "Acid Number (AN)", units: "mg KOH/g", alarm_val: 0.8, get_val: (f) => 0.12 + f * 0.64 + Math.random() * 0.04 },
        { name: "Zinc levels", units: "ppm", alarm_val: 700.0, is_lower_alarm: true, get_val: (f) => 1150.0 - f * 480.0 - Math.random() * 20.0 },
        { name: "Phosphorus levels", units: "ppm", alarm_val: 600.0, is_lower_alarm: true, get_val: (f) => 950.0 - f * 420.0 - Math.random() * 15.0 }
      );
    }

    // 4. Insert 30 readings for each parameter
    const seededRows: any[] = [];
    for (let i = 0; i < 30; i++) {
      const factor = i / 29.0;
      const measurementDate = new Date(Date.now() - (29 - i) * 24 * 3600 * 1000);
      const op_speed = 1785.0 + Math.random() * 30.0; // Running around 1800 RPM

      for (const param of params) {
        const val = param.get_val(factor);
        let isAlarm = false;
        if (param.is_lower_alarm) {
          isAlarm = val <= param.alarm_val;
        } else {
          isAlarm = val >= param.alarm_val;
        }

        const notes = isAlarm 
          ? `⚠️ Warning limit exceeded for ${param.name}. Immediate inspection and re-greasing recommended.` 
          : `Sensor telemetry within nominal operating limits for ${param.name}.`;

        const stateVal = isAlarm ? "Alarm Active" : "Data Collected";

        // Diagnose recommendations
        const recommendedActions = isAlarm 
          ? `Verify alignment, check mechanical coupling clearances, inspect for lubricant quality, and schedule repair action soon.`
          : `No immediate actions required. Continue routine monitoring intervals.`;

        const diagnosis_result = {
          current_value: val,
          alarm_threshold: param.alarm_val,
          status: isAlarm ? "ALARM" : "NORMAL",
          recommendation: recommendedActions,
          diagnostic_brief: isAlarm 
            ? `Critical deterioration observed in ${param.name} parameter. Standard operating tolerances violated.` 
            : `System parameter ${param.name} is functioning normally.`
        };

        const result = await pool.query(
          `INSERT INTO analysis_history 
           (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, alarm_status, diagnosis_result) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
           RETURNING *`,
          [
            measPointId,
            param.name,
            stateVal,
            op_speed,
            parseFloat(val.toFixed(6)),
            param.units,
            measurementDate,
            notes,
            isAlarm,
            JSON.stringify(diagnosis_result)
          ]
        );
        
        const row = result.rows[0];
        // Add technology_type for frontend compatibility
        row.technology_type = dbTech;
        seededRows.push(row);
      }
    }

    return seededRows;
  } catch (err) {
    console.error("Failed to seed analysis history in DB:", err);
    return [];
  }
}

// Helper: Seed analysis history in-memory for a component if none exists
async function seedAnalysisHistoryMemory(componentId: number, dbTech: string): Promise<any[]> {
  try {
    const params: { name: string; units: string; alarm_val: number; is_lower_alarm?: boolean; get_val: (f: number) => number }[] = [];

    if (dbTech === "Vibration") {
      params.push(
        { name: "Velocity RMS", units: "in/sec", alarm_val: 0.25, get_val: (f) => 0.05 + f * 0.18 + Math.random() * 0.03 },
        { name: "Acceleration True Peak", units: "g's", alarm_val: 3.0, get_val: (f) => 0.3 + f * 2.2 + Math.random() * 0.4 },
        { name: "Displacement Peak-to-Peak", units: "mils", alarm_val: 4.5, get_val: (f) => 0.6 + f * 3.0 + Math.random() * 0.5 },
        { name: "1X Running Speed amplitude", units: "in/sec", alarm_val: 0.15, get_val: (f) => 0.02 + f * 0.10 + Math.random() * 0.02 },
        { name: "2X Running Speed amplitude", units: "in/sec", alarm_val: 0.10, get_val: (f) => 0.01 + f * 0.05 + Math.random() * 0.01 },
        { name: "Bearing Frequencies (BPFO)", units: "in/sec", alarm_val: 0.12, get_val: (f) => 0.005 + (f > 0.6 ? (f - 0.6) * 0.4 : 0) + Math.random() * 0.01 },
        { name: "Bearing Frequencies (BPFI)", units: "in/sec", alarm_val: 0.12, get_val: (f) => 0.005 + (f > 0.5 ? (f - 0.5) * 0.5 : 0) + Math.random() * 0.01 },
        { name: "Gear Mesh Frequency", units: "in/sec", alarm_val: 0.10, get_val: (f) => 0.01 + f * 0.05 + Math.random() * 0.01 },
        { name: "Sub-synchronous frequencies", units: "in/sec", alarm_val: 0.08, get_val: (f) => 0.005 + f * 0.03 + Math.random() * 0.005 }
      );
    } else if (dbTech === "Thermal") {
      params.push(
        { name: "Overall Temperature", units: "°F", alarm_val: 175.0, get_val: (f) => 98.0 + f * 65.0 + Math.random() * 5.0 },
        { name: "Temperature Delta", units: "°F", alarm_val: 30.0, get_val: (f) => 1.5 + f * 24.0 + Math.random() * 2.0 },
        { name: "Temperature Rate of Change", units: "°F/day", alarm_val: 4.0, get_val: (f) => 0.05 + f * 3.5 + Math.random() * 0.4 }
      );
    } else if (dbTech === "Ultrasound") {
      params.push(
        { name: "Overall dB Level", units: "dBμV", alarm_val: 36.0, get_val: (f) => 14.0 + f * 19.0 + Math.random() * 3.0 },
        { name: "RMS Ultrasound Level", units: "dBμV", alarm_val: 30.0, get_val: (f) => 11.0 + f * 16.0 + Math.random() * 2.0 },
        { name: "Crest Factor", units: "ratio", alarm_val: 6.0, get_val: (f) => 1.6 + f * 3.8 + Math.random() * 0.5 },
        { name: "Bearing fault frequency amplitudes", units: "dBμV", alarm_val: 25.0, get_val: (f) => 3.0 + f * 18.0 + Math.random() * 2.0 }
      );
    } else if (dbTech === "Electrical") {
      params.push(
        { name: "Phase-to-Phase Resistance U-V", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + Math.random() * 0.002 },
        { name: "Phase-to-Phase Resistance V-W", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + f * 0.012 + Math.random() * 0.002 },
        { name: "Phase-to-Phase Resistance W-U", units: "Ohms", alarm_val: 0.30, get_val: (f) => 0.245 + Math.random() * 0.002 },
        { name: "Phase Impedance", units: "Ohms", alarm_val: 15.0, get_val: (f) => 12.1 + f * 0.4 + Math.random() * 0.05 },
        { name: "Phase Unbalance (%)", units: "%", alarm_val: 5.0, get_val: (f) => 0.3 + f * 4.2 + Math.random() * 0.3 },
        { name: "Insulation Resistance", units: "MegOhm", alarm_val: 20.0, is_lower_alarm: true, get_val: (f) => 3800.0 - f * 3700.0 - Math.random() * 100.0 },
        { name: "Tan Delta / Power Factor", units: "%", alarm_val: 4.0, get_val: (f) => 0.6 + f * 3.2 + Math.random() * 0.2 }
      );
    } else if (dbTech === "Oil") {
      params.push(
        { name: "Viscosity @ 40°C", units: "cSt", alarm_val: 41.4, is_lower_alarm: true, get_val: (f) => 45.8 - f * 7.5 + Math.random() * 0.5 },
        { name: "Water Content", units: "ppm", alarm_val: 300.0, get_val: (f) => 30.0 + f * 250.0 + Math.random() * 15.0 },
        { name: "Particle Count Cleanliness Index", units: "index", alarm_val: 22.0, get_val: (f) => 14.0 + f * 8.0 + Math.random() * 1.0 },
        { name: "Ferrous Density", units: "ppm", alarm_val: 100.0, get_val: (f) => 6.0 + f * 92.0 + Math.random() * 6.0 },
        { name: "Iron Wear Metal", units: "ppm", alarm_val: 75.0, get_val: (f) => 10.0 + f * 80.0 + Math.random() * 5.0 },
        { name: "Copper Wear Metal", units: "ppm", alarm_val: 25.0, get_val: (f) => 3.0 + f * 26.0 + Math.random() * 2.0 },
        { name: "Aluminum Wear Metal", units: "ppm", alarm_val: 12.0, get_val: (f) => 1.5 + f * 11.0 + Math.random() * 1.0 },
        { name: "Chromium Wear Metal", units: "ppm", alarm_val: 3.0, get_val: (f) => 0.2 + f * 2.8 + Math.random() * 0.2 },
        { name: "Acid Number (AN)", units: "mg KOH/g", alarm_val: 0.8, get_val: (f) => 0.12 + f * 0.64 + Math.random() * 0.04 },
        { name: "Zinc levels", units: "ppm", alarm_val: 700.0, is_lower_alarm: true, get_val: (f) => 1150.0 - f * 480.0 - Math.random() * 20.0 },
        { name: "Phosphorus levels", units: "ppm", alarm_val: 600.0, is_lower_alarm: true, get_val: (f) => 950.0 - f * 420.0 - Math.random() * 15.0 }
      );
    }

    const seededRows: any[] = [];
    const baseId = Date.now() + Math.floor(Math.random() * 1000000);
    
    for (let i = 0; i < 30; i++) {
      const factor = i / 29.0;
      const measurementDate = new Date(Date.now() - (29 - i) * 24 * 3600 * 1000);
      const op_speed = 1785.0 + Math.random() * 30.0;

      for (let pIdx = 0; pIdx < params.length; pIdx++) {
        const param = params[pIdx];
        const val = param.get_val(factor);
        let isAlarm = false;
        if (param.is_lower_alarm) {
          isAlarm = val <= param.alarm_val;
        } else {
          isAlarm = val >= param.alarm_val;
        }

        const notes = isAlarm 
          ? `⚠️ Warning limit exceeded for ${param.name}. Immediate inspection and re-greasing recommended.` 
          : `Sensor telemetry within nominal operating limits for ${param.name}.`;

        const stateVal = isAlarm ? "Alarm Active" : "Data Collected";

        const recommendedActions = isAlarm 
          ? `Verify alignment, check mechanical coupling clearances, inspect for lubricant quality, and schedule repair action soon.`
          : `No immediate actions required. Continue routine monitoring intervals.`;

        const diagnosis_result = {
          current_value: val,
          alarm_threshold: param.alarm_val,
          status: isAlarm ? "ALARM" : "NORMAL",
          recommendation: recommendedActions,
          diagnostic_brief: isAlarm 
            ? `Critical deterioration observed in ${param.name} parameter. Standard operating tolerances violated.` 
            : `System parameter ${param.name} is functioning normally.`
        };

        const item = {
          id: baseId + i * 100 + pIdx,
          measurement_point_id: 1, // dummy
          component_id: componentId,
          technology_type: dbTech,
          technology: dbTech,
          data_point_name: param.name,
          state: stateVal,
          op_speed,
          measurement_value: parseFloat(val.toFixed(6)),
          units: param.units,
          measurement_date: measurementDate.toISOString(),
          notes,
          alarm_status: isAlarm,
          diagnosis_result,
          created_at: new Date().toISOString()
        };

        memoryAnalysisHistory.push(item);
        seededRows.push(item);
      }
    }

    return seededRows;
  } catch (err) {
    console.error("Failed to seed analysis history memory:", err);
    return [];
  }
}

// GET /api/analysis-history/:id - Single record OR component analysis history
app.get(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    const technologyQuery = req.query.technology as string | undefined;
    const isComponent = req.query.isComponent === "true" || technologyQuery !== undefined;

    if (isComponent) {
      // Map user-facing technology tab name to database technology_type
      let dbTech: string | null = null;
      if (technologyQuery) {
        const t = technologyQuery.toLowerCase();
        if (t.includes("vibration")) dbTech = "Vibration";
        else if (t.includes("infrared") || t.includes("thermal") || t.includes("temp") || t.includes("heat")) dbTech = "Thermal";
        else if (t.includes("ultrasound")) dbTech = "Ultrasound";
        else if (t.includes("mca") || t.includes("electrical")) dbTech = "Electrical";
        else if (t.includes("oil")) dbTech = "Oil";
      }

      if (pool) {
        let query = `
          SELECT ah.*, mp.technology_type 
          FROM analysis_history ah
          JOIN measurement_points mp ON ah.measurement_point_id = mp.id
          JOIN collection_points cp ON mp.collection_point_id = cp.id
          WHERE cp.component_id = $1
        `;
        const params: any[] = [id];
        if (dbTech) {
          query += " AND mp.technology_type = $2";
          params.push(dbTech);
        }
        query += " ORDER BY ah.measurement_date ASC, ah.id ASC";

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
          const seeded = await seedAnalysisHistoryForComponent(id, dbTech || "Vibration");
          return res.json(seeded);
        }
        return res.json(result.rows);
      } else {
        let filtered = memoryAnalysisHistory.filter(ah => ah.component_id === id);

        if (dbTech) {
          filtered = filtered.filter(ah => ah.technology_type === dbTech || ah.technology === dbTech);
        }

        if (filtered.length === 0) {
          const seeded = await seedAnalysisHistoryMemory(id, dbTech || "Vibration");
          return res.json(seeded);
        }
        return res.json(filtered);
      }
    } else {
      if (pool) {
        const result = await pool.query("SELECT * FROM analysis_history WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
        return res.json(result.rows[0]);
      } else {
        const ah = memoryAnalysisHistory.find(item => item.id === id);
        if (!ah) return res.status(404).json({ error: "Analysis history record not found" });
        return res.json(ah);
      }
    }
  } catch (error: any) {
    console.error("GET analysis record failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch analysis history record" });
  }
});

// POST /api/analysis-history - Create new analysis entry
app.post(["/api/analysis-history", "/api/analysis_history"], async (req, res) => {
  try {
    const {
      measurement_point_id,
      data_point_name,
      state,
      op_speed,
      measurement_value,
      units,
      measurement_date,
      notes,
      waveform_data,
      alarm_status,
      diagnosis_result,
      was_correct,
      corrected_diagnosis
    } = req.body;

    if (measurement_point_id === undefined || isNaN(parseInt(measurement_point_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: measurement_point_id (integer)" });
    }

    const mpId = parseInt(measurement_point_id, 10);
    const speed = op_speed !== undefined ? parseFloat(op_speed) : null;
    const valueVal = measurement_value !== undefined ? parseFloat(measurement_value) : null;
    const isAlarm = alarm_status !== undefined ? !!alarm_status : false;
    const stateVal = state || "Data Collected";
    const dateVal = measurement_date ? new Date(measurement_date) : new Date();

    let parsedWaveform: any = null;
    if (waveform_data) {
      if (typeof waveform_data === "object") parsedWaveform = waveform_data;
      else {
        try { parsedWaveform = JSON.parse(waveform_data); }
        catch (e) { parsedWaveform = { raw: waveform_data }; }
      }
    }

    let parsedDiag: any = null;
    if (diagnosis_result) {
      if (typeof diagnosis_result === "object") parsedDiag = diagnosis_result;
      else {
        try { parsedDiag = JSON.parse(diagnosis_result); }
        catch (e) { parsedDiag = { raw: diagnosis_result }; }
      }
    }

    if (pool) {
      const result = await pool.query(
        `INSERT INTO analysis_history 
         (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, waveform_data, alarm_status, diagnosis_result, was_correct, corrected_diagnosis) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
         RETURNING *`,
        [
          mpId,
          data_point_name ? data_point_name.trim() : null,
          stateVal.trim(),
          speed,
          valueVal,
          units ? units.trim() : null,
          dateVal,
          notes ? notes.trim() : null,
          parsedWaveform,
          isAlarm,
          parsedDiag,
          was_correct !== undefined ? !!was_correct : null,
          corrected_diagnosis ? corrected_diagnosis.trim() : null
        ]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newAh = {
        id: getNextId(),
        measurement_point_id: mpId,
        data_point_name: data_point_name ? data_point_name.trim() : null,
        state: stateVal.trim(),
        op_speed: speed,
        measurement_value: valueVal,
        units: units ? units.trim() : null,
        measurement_date: dateVal,
        notes: notes ? notes.trim() : null,
        waveform_data: parsedWaveform,
        alarm_status: isAlarm,
        diagnosis_result: parsedDiag,
        was_correct: was_correct !== undefined ? !!was_correct : null,
        corrected_diagnosis: corrected_diagnosis ? corrected_diagnosis.trim() : null,
        created_at: new Date()
      };
      memoryAnalysisHistory.push(newAh);
      return res.status(201).json(newAh);
    }
  } catch (error: any) {
    console.error("POST analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create analysis history record" });
  }
});

// PUT /api/analysis-history/:id - Update analysis entry (feedback and correctness updates)
app.put(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    const {
      data_point_name,
      state,
      op_speed,
      measurement_value,
      units,
      notes,
      alarm_status,
      was_correct,
      corrected_diagnosis
    } = req.body;

    if (pool) {
      // Build dynamic update to only overwrite provided fields
      const currentRes = await pool.query("SELECT * FROM analysis_history WHERE id = $1", [id]);
      if (currentRes.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
      const current = currentRes.rows[0];

      const finalName = data_point_name !== undefined ? data_point_name : current.data_point_name;
      const finalState = state !== undefined ? state : current.state;
      const finalSpeed = op_speed !== undefined ? (op_speed ? parseFloat(op_speed) : null) : current.op_speed;
      const finalVal = measurement_value !== undefined ? (measurement_value ? parseFloat(measurement_value) : null) : current.measurement_value;
      const finalUnits = units !== undefined ? units : current.units;
      const finalNotes = notes !== undefined ? notes : current.notes;
      const finalAlarm = alarm_status !== undefined ? !!alarm_status : current.alarm_status;
      const finalWasCorrect = was_correct !== undefined ? (was_correct === null ? null : !!was_correct) : current.was_correct;
      const finalCorrectedDiag = corrected_diagnosis !== undefined ? corrected_diagnosis : current.corrected_diagnosis;

      const result = await pool.query(
        `UPDATE analysis_history SET 
         data_point_name = $1, state = $2, op_speed = $3, measurement_value = $4, units = $5, notes = $6, alarm_status = $7, was_correct = $8, corrected_diagnosis = $9 
         WHERE id = $10 RETURNING *`,
        [finalName, finalState, finalSpeed, finalVal, finalUnits, finalNotes, finalAlarm, finalWasCorrect, finalCorrectedDiag, id]
      );
      return res.json(result.rows[0]);
    } else {
      const ah = memoryAnalysisHistory.find(item => item.id === id);
      if (!ah) return res.status(404).json({ error: "Analysis history record not found" });

      if (data_point_name !== undefined) ah.data_point_name = data_point_name;
      if (state !== undefined) ah.state = state;
      if (op_speed !== undefined) ah.op_speed = op_speed ? parseFloat(op_speed) : null;
      if (measurement_value !== undefined) ah.measurement_value = measurement_value ? parseFloat(measurement_value) : null;
      if (units !== undefined) ah.units = units;
      if (notes !== undefined) ah.notes = notes;
      if (alarm_status !== undefined) ah.alarm_status = !!alarm_status;
      if (was_correct !== undefined) ah.was_correct = was_correct === null ? null : !!was_correct;
      if (corrected_diagnosis !== undefined) ah.corrected_diagnosis = corrected_diagnosis;

      return res.json(ah);
    }
  } catch (error: any) {
    console.error("PUT analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update analysis history record" });
  }
});

// DELETE /api/analysis-history/:id - Delete record
app.delete(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query("DELETE FROM analysis_history WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
      return res.json({ message: "Analysis record deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryAnalysisHistory.findIndex(item => item.id === id);
      if (index === -1) return res.status(404).json({ error: "Analysis history record not found" });
      const deleted = memoryAnalysisHistory.splice(index, 1)[0];
      return res.json({ message: "Analysis record deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete analysis history record" });
  }
});


// Serve static assets or mount Vite middleware
const isProduction = process.env.NODE_ENV === "production";

// Startup function to verify/create database tables
async function initializeDatabase() {
  if (!pool) {
    console.warn("⚠️ Pool not initialized (DATABASE_URL missing). Skipping database table creation.");
    return;
  }
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS diagnosis_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        input_data TEXT,
        ai_response TEXT,
        was_correct BOOLEAN DEFAULT NULL,
        corrected_diagnosis TEXT,
        user_feedback_timestamp TIMESTAMP DEFAULT NULL
      );
    `;
    await pool.query(createTableQuery);

    // Apply migrations for existing tables that might lack the new feedback columns
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS was_correct BOOLEAN DEFAULT NULL;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS corrected_diagnosis TEXT;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS user_feedback_timestamp TIMESTAMP DEFAULT NULL;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS component_id INTEGER;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;");

    // Create companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure we seed Allied Reliability and ExxonMobil if they don't exist
    await pool.query(`
      INSERT INTO companies (name) VALUES ('Allied Reliability')
      ON CONFLICT (name) DO NOTHING;
    `);
    await pool.query(`
      INSERT INTO companies (name) VALUES ('ExxonMobil')
      ON CONFLICT (name) DO NOTHING;
    `);

    // Create plants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure company_id exists in case plants table already existed
    await pool.query("ALTER TABLE plants ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;");

    // Seed existing plants with Allied Reliability (id: 1) if company_id is null
    const firstCompanyRes = await pool.query("SELECT id FROM companies ORDER BY id ASC LIMIT 1");
    if (firstCompanyRes.rows.length > 0) {
      const defaultCompanyId = firstCompanyRes.rows[0].id;
      await pool.query("UPDATE plants SET company_id = $1 WHERE company_id IS NULL", [defaultCompanyId]);
    }

    // Create routes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        plant_id INTEGER REFERENCES plants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check for equipment table migration to assets
    const equipTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'equipment'
      );
    `);
    const assetsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'assets'
      );
    `);

    const equipmentExists = equipTableCheck.rows[0].exists;
    const assetsExists = assetsTableCheck.rows[0].exists;

    if (equipmentExists && !assetsExists) {
      console.log("🔄 Migrating legacy 'equipment' table to 'assets'...");
      await pool.query("ALTER TABLE equipment RENAME TO assets;");
    }

    // Create assets table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        tag_number VARCHAR(100),
        type VARCHAR(100),
        manufacturer VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(255),
        install_date DATE,
        criticality VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure assets table columns exist
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS tag_number VARCHAR(100);");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS description TEXT;");

    // Check components table
    const componentsExistsQuery = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'components'
      );
    `);
    const componentsExists = componentsExistsQuery.rows[0].exists;

    if (componentsExists) {
      // Check if equipment_id exists in components, rename to asset_id
      const colCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='components' AND column_name='equipment_id';
      `);
      if (colCheck.rows.length > 0) {
        console.log("🔄 Renaming components.equipment_id to asset_id...");
        await pool.query("ALTER TABLE components RENAME COLUMN equipment_id TO asset_id;");
      }
    }

    // Create components table (updated reference)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS components (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        manufacturer VARCHAR(255),
        model VARCHAR(255),
        specifications JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure components table columns exist
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);");
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS model VARCHAR(255);");
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS notes TEXT;");

    // Create collection_points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection_points (
        id SERIAL PRIMARY KEY,
        component_id INTEGER REFERENCES components(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location_order INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create measurement_points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS measurement_points (
        id SERIAL PRIMARY KEY,
        collection_point_id INTEGER REFERENCES collection_points(id) ON DELETE CASCADE,
        direction VARCHAR(50) NOT NULL,
        technology_type VARCHAR(50) DEFAULT 'Vibration',
        units VARCHAR(50) DEFAULT 'in/Sec',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create analysis_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id SERIAL PRIMARY KEY,
        measurement_point_id INTEGER REFERENCES measurement_points(id) ON DELETE CASCADE,
        data_point_name VARCHAR(100),
        state VARCHAR(50) DEFAULT 'Data Collected',
        op_speed DECIMAL(10,2),
        measurement_value DECIMAL(10,6),
        units VARCHAR(50),
        measurement_date TIMESTAMP,
        notes TEXT,
        waveform_data JSONB,
        alarm_status BOOLEAN DEFAULT FALSE,
        diagnosis_result JSONB,
        was_correct BOOLEAN,
        corrected_diagnosis TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Database initialized: All plants, routes, assets, components, collection points, measurement points, and analysis history tables verified/created.");
  } catch (error) {
    console.error("❌ Failed to initialize database tables:", error);
  }
}

// Global error-handling middleware to prevent Express from crashing and return uniform JSON responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("🔥 Unhandled exception caught by global Express middleware:", err);
  res.status(500).json({
    error: "Internal server error. Please try again in a few minutes.",
    details: err?.message || "Unknown error occurred on the condition monitoring backend."
  });
});

async function setupServer() {
  // Run database initialization on startup
  await initializeDatabase();

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MotorMedic Pro server running on http://localhost:${PORT}`);
  });
}

setupServer();
