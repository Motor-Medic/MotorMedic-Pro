/**
 * Prescriptive Dictionary — single source of truth mapping every diagnosis
 * string the app can emit to a typed prescriptive maintenance package.
 *
 * No AI, no randomness, zero unmapped strings among active diagnoses.
 * Versioned: bump DICTIONARY_VERSION when entries change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartSpec {
  name: string;
  spec: string;
  qty: number;
}

export interface ProcedureStep {
  step: number;
  task: string;
  tolerance?: string;
}

export interface SeverityZones {
  alarm?: number;
  danger?: number;
  unit: string;
}

export interface SafetyGuidance {
  loto: string[];
  ppe: string;
}

export interface PrescriptivePackage {
  diagnosis: string;
  isMapped: boolean;
  procedure: ProcedureStep[];
  parts: PartSpec[];
  tools: string[];
  laborHours: number;
  severityZones: SeverityZones;
  defaultPriority: 1 | 2 | 3 | 4 | 5;
  safety: SafetyGuidance;
}

// ---------------------------------------------------------------------------
// ISO 10816-3 severity zone defaults (general-purpose, 15 kW – 300 kW)
// ---------------------------------------------------------------------------

const VIB_ZONES: SeverityZones = { alarm: 4.5, danger: 11.2, unit: "mm/s" };
const US_ZONES: SeverityZones = { alarm: 12, danger: 20, unit: "dB" };
const IR_ZONES: SeverityZones = { alarm: 4, danger: 15, unit: "degC" };

// Safety guidance by fault domain
const MECH_SAFETY: SafetyGuidance = { loto: ["Machine Isolation - lock-out/tag-out rotating elements"], ppe: "Level 2: Eye, Hand, Hearing" };
const ELEC_SAFETY: SafetyGuidance = { loto: ["High Voltage - verify absence before contact", "Apply grounds per NFPA 70E"], ppe: "Level 3: Arc-rated clothing, Eye, Hand, Hearing" };
const LUBE_SAFETY: SafetyGuidance = { loto: ["Machine Isolation - lock-out/tag-out rotating elements"], ppe: "Level 2: Eye, Hand, Hearing" };
const HEALTHY_SAFETY: SafetyGuidance = { loto: [], ppe: "Level 1: Eye, Hand" };
const GEAR_SAFETY: SafetyGuidance = { loto: ["Machine Isolation - lock-out/tag-out rotating elements", "Verify stored energy release"], ppe: "Level 2: Eye, Hand, Hearing" };
const PROCESS_SAFETY: SafetyGuidance = { loto: ["Process Isolation - close block valves, depressurize", "Verify zero energy state"], ppe: "Level 2: Eye, Hand, Hearing, Respiratory" };

// ---------------------------------------------------------------------------
// Helper to build a mapped entry concisely
// ---------------------------------------------------------------------------

function mapped(
  diagnosis: string,
  priority: 1 | 2 | 3 | 4 | 5,
  laborHours: number,
  procedure: ProcedureStep[],
  parts: PartSpec[],
  tools: string[],
  safety?: SafetyGuidance,
  zones: SeverityZones = VIB_ZONES
): PrescriptivePackage {
  return {
    diagnosis,
    isMapped: true,
    procedure,
    parts,
    tools,
    laborHours,
    severityZones: zones,
    defaultPriority: priority,
    safety: safety ?? { loto: ["Verify isolation per site procedure"], ppe: "Per site standard" },
  };
}

// ---------------------------------------------------------------------------
// Unmapped fallback — never throw, never silently substitute
// ---------------------------------------------------------------------------

function unmapped(diagnosis: string): PrescriptivePackage {
  return {
    diagnosis,
    isMapped: false,
    procedure: [],
    parts: [],
    tools: [],
    laborHours: 0,
    severityZones: { unit: "mm/s" },
    defaultPriority: 5,
    safety: { loto: ["Verify isolation per site procedure"], ppe: "Per site standard" },
  };
}

// ---------------------------------------------------------------------------
// Dictionary
//
// Every key is the *exact* string emitted by the diagnostic pipeline.
// Canonical duplicates (semantic synonyms) each get their own entry so
// lookups never miss. Where two strings are true synonyms the same
// prescriptive content is referenced directly.
// ---------------------------------------------------------------------------

const DICT: Record<string, PrescriptivePackage> = {
  // ── UNBALANCE FAMILY ────────────────────────────────────────────────────

  "Unbalance": mapped(
    "Unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform single-plane or two-plane balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  "Mass Unbalance": mapped(
    "Mass Unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform single-plane or two-plane balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  "Mechanical Unbalance": mapped(
    "Mechanical Unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform single-plane or two-plane balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  "Dynamic mass unbalance": mapped(
    "Dynamic mass unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform two-plane dynamic balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  "Dynamic Rotor Mass Unbalance": mapped(
    "Dynamic Rotor Mass Unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform two-plane dynamic balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  "Shaft unbalance": mapped(
    "Shaft unbalance",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline 1X vibration amplitude and phase." },
      { step: 3, task: "Mark the rotor at 0°, 90°, 180°, 270° for trial-weight placement." },
      { step: 4, task: "Perform single-plane or two-plane balance per ISO 21940." },
      { step: 5, task: "Verify residual unbalance is within ISO 21940 grade tolerance.", tolerance: "≤ G6.3 per ISO 21940" },
      { step: 6, task: "Run at operating speed and record final vibration levels." },
    ],
    [
      { name: "Trial weight set", spec: "ISO 21940 trial weights, 5 g–500 g", qty: 1 },
      { name: "Balancing clip weights", spec: "Brass or steel clip-on, assorted", qty: 1 },
    ],
    ["Vibration analyzer with phase input", "Tachometer / keyphasor", "Balancing software or calculator", "Hand tools for rotor access"],
    MECH_SAFETY
  ),

  // ── MISALIGNMENT FAMILY ─────────────────────────────────────────────────

  "Angular Misalignment": mapped(
    "Angular Misalignment",
    2,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: high 2X axial, phase difference across coupling." },
      { step: 3, task: "Inspect coupling element for wear, cracks, or burnt rubber." },
      { step: 4, task: "Check soft foot on all four feet; correct any foot with >0.05 mm lift.", tolerance: "≤ 0.05 mm soft-foot lift" },
      { step: 5, task: "Perform laser shaft alignment (angular).", tolerance: "Angular offset ≤ 0.05 mm/100 mm per OEM" },
      { step: 6, task: "Adjust shims to bring angular misalignment within tolerance." },
      { step: 7, task: "Re-torque hold-down bolts to spec.", tolerance: "Per OEM torque table" },
      { step: 8, task: "Run at operating speed and verify 2X axial reduction." },
    ],
    [
      { name: "Coupling element", spec: "OEM-specified elastomeric or gear coupling insert", qty: 1 },
      { name: "Precision shim stock", spec: "304 stainless, 0.05–1.00 mm increments", qty: 1 },
      { name: "Hold-down bolt set", spec: "Grade 8.8 / OEM spec", qty: 4 },
    ],
    ["Laser alignment system", "Dial indicator set", "Torque wrench", "Vibration analyzer", "Feeler gauges"],
    MECH_SAFETY
  ),

  "Misalignment": mapped(
    "Misalignment",
    2,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: high 2X axial, phase difference across coupling." },
      { step: 3, task: "Inspect coupling element for wear, cracks, or burnt rubber." },
      { step: 4, task: "Check soft foot on all four feet; correct any foot with >0.05 mm lift.", tolerance: "≤ 0.05 mm soft-foot lift" },
      { step: 5, task: "Perform laser shaft alignment (parallel and angular).", tolerance: "Parallel ≤ 0.05 mm, Angular ≤ 0.05 mm/100 mm" },
      { step: 6, task: "Adjust shims to bring alignment within tolerance." },
      { step: 7, task: "Re-torque hold-down bolts to spec.", tolerance: "Per OEM torque table" },
      { step: 8, task: "Run at operating speed and verify vibration reduction." },
    ],
    [
      { name: "Coupling element", spec: "OEM-specified elastomeric or gear coupling insert", qty: 1 },
      { name: "Precision shim stock", spec: "304 stainless, 0.05–1.00 mm increments", qty: 1 },
      { name: "Hold-down bolt set", spec: "Grade 8.8 / OEM spec", qty: 4 },
    ],
    ["Laser alignment system", "Dial indicator set", "Torque wrench", "Vibration analyzer", "Feeler gauges"],
    MECH_SAFETY
  ),

  "Shaft Angular & Radial Misalignment": mapped(
    "Shaft Angular & Radial Misalignment",
    2,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: high 2X axial, phase difference across coupling." },
      { step: 3, task: "Inspect coupling element for wear, cracks, or burnt rubber." },
      { step: 4, task: "Check soft foot on all four feet; correct any foot with >0.05 mm lift.", tolerance: "≤ 0.05 mm soft-foot lift" },
      { step: 5, task: "Perform laser shaft alignment (angular and radial).", tolerance: "Parallel ≤ 0.05 mm, Angular ≤ 0.05 mm/100 mm" },
      { step: 6, task: "Adjust shims to bring alignment within tolerance." },
      { step: 7, task: "Re-torque hold-down bolts to spec.", tolerance: "Per OEM torque table" },
      { step: 8, task: "Run at operating speed and verify vibration reduction." },
    ],
    [
      { name: "Coupling element", spec: "OEM-specified elastomeric or gear coupling insert", qty: 1 },
      { name: "Precision shim stock", spec: "304 stainless, 0.05–1.00 mm increments", qty: 1 },
      { name: "Hold-down bolt set", spec: "Grade 8.8 / OEM spec", qty: 4 },
    ],
    ["Laser alignment system", "Dial indicator set", "Torque wrench", "Vibration analyzer", "Feeler gauges"],
    MECH_SAFETY
  ),

  // ── MECHANICAL LOOSENESS ────────────────────────────────────────────────

  "Mechanical Looseness": mapped(
    "Mechanical Looseness",
    1,
    6,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for 1X, 2X, 3X harmonics with broadband floor." },
      { step: 3, task: "Inspect all mounting bolts, foundation bolts, and anchor bolts." },
      { step: 4, task: "Re-torque all hold-down bolts to OEM specification.", tolerance: "Per OEM torque table" },
      { step: 5, task: "Inspect baseplate / soleplate for cracks, corrosion, or grout deterioration." },
      { step: 6, task: "Check bearing housing fit in the pedestal or pillow block." },
      { step: 7, task: "Inspect structural welds and gussets for cracking." },
      { step: 8, task: "Repair or replace damaged structural elements." },
      { step: 9, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Mounting bolt set", spec: "Grade 8.8 / OEM spec, matched to original", qty: 1 },
      { name: "Grout compound", spec: "Epoxy or non-shrink cementitious grout", qty: 1 },
      { name: "Foundation anchor bolts", spec: "OEM specification", qty: 4 },
    ],
    ["Socket set", "Torque wrench", "Vibration analyzer", "Hammer (for tap test)", "Structural inspection mirror"],
    MECH_SAFETY
  ),

  "Mechanical looseness": mapped(
    "Mechanical looseness",
    1,
    6,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for 1X, 2X, 3X harmonics with broadband floor." },
      { step: 3, task: "Inspect all mounting bolts, foundation bolts, and anchor bolts." },
      { step: 4, task: "Re-torque all hold-down bolts to OEM specification.", tolerance: "Per OEM torque table" },
      { step: 5, task: "Inspect baseplate / soleplate for cracks, corrosion, or grout deterioration." },
      { step: 6, task: "Check bearing housing fit in the pedestal or pillow block." },
      { step: 7, task: "Inspect structural welds and gussets for cracking." },
      { step: 8, task: "Repair or replace damaged structural elements." },
      { step: 9, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Mounting bolt set", spec: "Grade 8.8 / OEM spec, matched to original", qty: 1 },
      { name: "Grout compound", spec: "Epoxy or non-shrink cementitious grout", qty: 1 },
      { name: "Foundation anchor bolts", spec: "OEM specification", qty: 4 },
    ],
    ["Socket set", "Torque wrench", "Vibration analyzer", "Hammer (for tap test)", "Structural inspection mirror"],
    MECH_SAFETY
  ),

  "Looseness": mapped(
    "Looseness",
    1,
    6,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for 1X, 2X, 3X harmonics with broadband floor." },
      { step: 3, task: "Inspect all mounting bolts, foundation bolts, and anchor bolts." },
      { step: 4, task: "Re-torque all hold-down bolts to OEM specification.", tolerance: "Per OEM torque table" },
      { step: 5, task: "Inspect baseplate / soleplate for cracks, corrosion, or grout deterioration." },
      { step: 6, task: "Check bearing housing fit in the pedestal or pillow block." },
      { step: 7, task: "Inspect structural welds and gussets for cracking." },
      { step: 8, task: "Repair or replace damaged structural elements." },
      { step: 9, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Mounting bolt set", spec: "Grade 8.8 / OEM spec, matched to original", qty: 1 },
      { name: "Grout compound", spec: "Epoxy or non-shrink cementitious grout", qty: 1 },
      { name: "Foundation anchor bolts", spec: "OEM specification", qty: 4 },
    ],
    ["Socket set", "Torque wrench", "Vibration analyzer", "Hammer (for tap test)", "Structural inspection mirror"],
    MECH_SAFETY
  ),

  // ── BEARING FAULTS ──────────────────────────────────────────────────────

  "Outer Race Bearing Defect (BPFO)": mapped(
    "Outer Race Bearing Defect (BPFO)",
    1,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Confirm BPFO fault band in demodulated envelope spectrum.", tolerance: "BPFO ± 2 Hz" },
      { step: 3, task: "Schedule planned downtime and remove defective bearing." },
      { step: 4, task: "Inspect shaft journal and housing bore for damage or fretting.", tolerance: "Shaft: h6, Housing: H7 per ISO 286" },
      { step: 5, task: "Measure shaft journal diameter and housing bore with micrometer." },
      { step: 6, task: "Install replacement bearing per OEM procedure with correct preload/clearance." },
      { step: 7, task: "Verify soft foot and holding-down bolts." },
      { step: 8, task: "Run at operating speed; confirm BPFO band is gone and vibration is within ISO 10816-3 Zone A/B." },
    ],
    [
      // spec values transcribed from BEARING_GEOMETRY (n=9, bd=12.7, pd=70.0) - re-sync on geometry version change
      { name: "Replacement bearing", spec: "SKF 6210-2RS1 deep groove ball bearing (n=9 rollers, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Shaft sleeve / repair collar", spec: "If shaft journal is undersized, use precision repair sleeve", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer (outside) and bore gauge (inside)", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  "Bearing Defect": mapped(
    "Bearing Defect",
    1,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Confirm bearing fault band (BPFO/BPFI/BSF) in demodulated envelope spectrum." },
      { step: 3, task: "Schedule planned downtime and remove defective bearing." },
      { step: 4, task: "Inspect shaft journal and housing bore for damage or fretting.", tolerance: "Shaft: h6, Housing: H7 per ISO 286" },
      { step: 5, task: "Measure shaft journal diameter and housing bore with micrometer." },
      { step: 6, task: "Install replacement bearing per OEM procedure with correct preload/clearance." },
      { step: 7, task: "Verify soft foot and holding-down bolts." },
      { step: 8, task: "Run at operating speed; confirm vibration is within ISO 10816-3 Zone A/B." },
    ],
    [
      { name: "Replacement bearing", spec: "Matched to OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer and bore gauge", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)": mapped(
    "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)",
    1,
    5,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document advanced bearing defect signatures: elevated BPFO/BPFI with harmonics and broadband noise floor rise." },
      { step: 3, task: "Schedule urgent planned downtime — bearing is near end of life." },
      { step: 4, task: "Remove defective bearing and inspect raceways for spalling, pitting, and flaking." },
      { step: 5, task: "Inspect shaft journal and housing bore.", tolerance: "Shaft: h6, Housing: H7 per ISO 286" },
      { step: 6, task: "Install replacement bearing per OEM procedure." },
      { step: 7, task: "Fill with correct grease quantity per OEM.", tolerance: "Per OEM grease-fill specification" },
      { step: 8, task: "Run at operating speed; confirm vibration within ISO 10816-3 Zone A/B." },
    ],
    [
      { name: "Replacement bearing", spec: "Matched to OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer and bore gauge", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  "Inner Race Bearing Defect (BPFI)": mapped(
    "Inner Race Bearing Defect (BPFI)",
    1,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Confirm BPFI fault band in demodulated envelope spectrum.", tolerance: "BPFI ± 2 Hz" },
      { step: 3, task: "Schedule planned downtime and remove defective bearing." },
      { step: 4, task: "Inspect shaft journal for fretting, scoring, or heat discoloration.", tolerance: "Shaft: h6 per ISO 286" },
      { step: 5, task: "Measure shaft journal diameter with micrometer." },
      { step: 6, task: "Install replacement bearing per OEM procedure with correct interference fit." },
      { step: 7, task: "Verify soft foot and holding-down bolts." },
      { step: 8, task: "Run at operating speed; confirm BPFI band is gone and vibration within ISO 10816-3 Zone A/B." },
    ],
    [
      { name: "Replacement bearing", spec: "Matched to OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  "Rolling Element Bearing Defect (BSF)": mapped(
    "Rolling Element Bearing Defect (BSF)",
    1,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Confirm BSF fault band in demodulated envelope spectrum.", tolerance: "BSF ± 2 Hz" },
      { step: 3, task: "Schedule planned downtime and remove defective bearing." },
      { step: 4, task: "Inspect rolling elements (balls/rollers) for spalling, brinelling, or flat spots." },
      { step: 5, task: "Inspect shaft journal and housing bore.", tolerance: "Shaft: h6, Housing: H7 per ISO 286" },
      { step: 6, task: "Install replacement bearing per OEM procedure." },
      { step: 7, task: "Verify soft foot and holding-down bolts." },
      { step: 8, task: "Run at operating speed; confirm BSF band is gone and vibration within ISO 10816-3 Zone A/B." },
    ],
    [
      { name: "Replacement bearing", spec: "Matched to OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer and bore gauge", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  "Bearing Fault / Other": mapped(
    "Bearing Fault / Other",
    1,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Analyze demodulated envelope spectrum to identify specific bearing fault type (BPFO, BPFI, BSF, FTF)." },
      { step: 3, task: "Schedule planned downtime and remove defective bearing." },
      { step: 4, task: "Inspect shaft journal and housing bore for damage.", tolerance: "Shaft: h6, Housing: H7 per ISO 286" },
      { step: 5, task: "Install replacement bearing per OEM procedure with correct preload/clearance." },
      { step: 6, task: "Verify soft foot and holding-down bolts." },
      { step: 7, task: "Run at operating speed; confirm vibration within ISO 10816-3 Zone A/B." },
    ],
    [
      { name: "Replacement bearing", spec: "Matched to OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Bearing housing seal", spec: "NBR lip seal, matched to shaft diameter", qty: 2 },
      { name: "High-temperature bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Bearing heater or induction heater", "Micrometer and bore gauge", "Vibration analyzer with envelope/demod capability", "Torque wrench", "Soft-foot dial indicator"],
    MECH_SAFETY
  ),

  // ── GEAR FAULTS ─────────────────────────────────────────────────────────

  "Gear Tooth Defect": mapped(
    "Gear Tooth Defect",
    1,
    8,
    [
      { step: 1, task: "Isolate the gearbox and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for GMF (gear mesh frequency) sidebands." },
      { step: 3, task: "Drain lubricant and inspect for metal particles on magnetic drain plug." },
      { step: 4, task: "Perform visual inspection of gear teeth for pitting, spalling, or tooth breakage." },
      { step: 5, task: "If accessible, perform MPI (magnetic particle inspection) on gear teeth." },
      { step: 6, task: "Replace damaged gear or entire gearset per OEM specification." },
      { step: 7, task: "Flush gearbox and refill with correct lubricant grade.", tolerance: "Per OEM lubricant specification" },
      { step: 8, task: "Reassemble and run at operating speed; verify GMF sidebands are reduced." },
    ],
    [
      { name: "Replacement gear or gearset", spec: "OEM specification, matched tooth count and module", qty: 1 },
      { name: "Gearbox oil seal kit", spec: "OEM seal kit for specific gearbox model", qty: 1 },
      { name: "Gearbox lubricant", spec: "OEM-specified gear oil (e.g. ISO VG 220)", qty: 1 },
      { name: "Gasket set", spec: "OEM gasket set for gearbox housing", qty: 1 },
    ],
    ["Dial bore gauge", "Gear tooth pattern contact set", "Magnetic particle inspection kit", "Oil drain / fill equipment", "Vibration analyzer"],
    GEAR_SAFETY
  ),

  "Internal gear backlash": mapped(
    "Internal gear backlash",
    1,
    8,
    [
      { step: 1, task: "Isolate the gearbox and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for GMF sidebands and sub-synchronous noise." },
      { step: 3, task: "Measure gear backlash with dial indicator.", tolerance: "Per OEM backlash specification" },
      { step: 4, task: "Inspect gear teeth and bearings for wear." },
      { step: 5, task: "Adjust gear center distance or replace worn gears to restore backlash." },
      { step: 6, task: "Flush gearbox and refill with correct lubricant grade." },
      { step: 7, task: "Reassemble and run at operating speed; verify backlash and vibration." },
    ],
    [
      { name: "Replacement gear or gearset", spec: "OEM specification, matched tooth count and module", qty: 1 },
      { name: "Gearbox oil seal kit", spec: "OEM seal kit for specific gearbox model", qty: 1 },
      { name: "Gearbox lubricant", spec: "OEM-specified gear oil (e.g. ISO VG 220)", qty: 1 },
    ],
    ["Dial indicator with magnetic base", "Dial bore gauge", "Oil drain / fill equipment", "Vibration analyzer"],
    GEAR_SAFETY
  ),

  // ── ELECTRICAL FAULTS ───────────────────────────────────────────────────

  "Stator Winding Inter-turn Insulation Degradation": mapped(
    "Stator Winding Inter-turn Insulation Degradation",
    1,
    8,
    [
      { step: 1, task: "Isolate the motor and apply lock-out / tag-out." },
      { step: 2, task: "Perform insulation resistance (megger) test on all windings.", tolerance: "≥ 1 MΩ per kV + 1 MΩ (IEEE 43)" },
      { step: 3, task: "Perform surge comparison test to detect inter-turn insulation breakdown." },
      { step: 4, task: "Perform polarization index test.", tolerance: "PI ≥ 2.0 for Class B/F insulation" },
      { step: 5, task: "Inspect winding end turns for discoloration, carbon tracking, or physical damage." },
      { step: 6, task: "If inter-turn fault confirmed, rewind motor or replace stator per OEM spec." },
      { step: 7, task: "Reassemble, megger again, and perform run test." },
      { step: 8, task: "Record baseline vibration and temperature for trending." },
    ],
    [
      { name: "Stator winding or complete stator", spec: "OEM specification, matched frame and class", qty: 1 },
      { name: "Insulation varnish", spec: "Class H polyester-imide or equivalent", qty: 1 },
      { name: "Winding shims and phase separators", spec: "Nomex or equivalent, matched to slot dimensions", qty: 1 },
    ],
    ["Megger (insulation resistance tester)", "Surge comparison tester", "Polarization index tester", "Motor starter / VFD", "Vibration analyzer", "Infrared thermometer"],
    ELEC_SAFETY
  ),

  "Air Gap Eccentricity": mapped(
    "Air Gap Eccentricity",
    1,
    8,
    [
      { step: 1, task: "Isolate the motor and apply lock-out / tag-out." },
      { step: 2, task: "Document vibration: look for rotor slot pass frequency sidebands around 1X." },
      { step: 3, task: "Check bearing condition and housing bore.", tolerance: "Bearing play per OEM spec" },
      { step: 4, task: "Measure air gap at 4 positions (top, bottom, left, right) using feeler gauge.", tolerance: "Air gap variation ≤ 10% of nominal" },
      { step: 5, task: "Inspect rotor for bent shaft, eccentric rotor, or bearing offset." },
      { step: 6, task: "Correct eccentricity: re-seat bearings, replace bent shaft, or re-align rotor." },
      { step: 7, task: "Re-measure air gap and verify uniformity." },
      { step: 8, task: "Run at operating speed and verify vibration reduction." },
    ],
    [
      { name: "Replacement bearing", spec: "OEM specification for motor frame", qty: 2 },
      { name: "Rotor (if bent or eccentric)", spec: "OEM specification, matched to stator bore", qty: 1 },
    ],
    ["Feeler gauge set", "Dial indicator with magnetic base", "Vibration analyzer", "Micrometer", "Bearing puller set"],
    ELEC_SAFETY
  ),

  "Broken Rotor Bar Circuit": mapped(
    "Broken Rotor Bar Circuit",
    1,
    10,
    [
      { step: 1, task: "Isolate the motor and apply lock-out / tag-out." },
      { step: 2, task: "Perform rotor bar test (growler test or related current analysis)." },
      { step: 3, task: "Inspect rotor bars and end rings for cracks, breaks, or casting defects." },
      { step: 4, task: "If rotor bars are integral (cast), replace entire rotor." },
      { step: 5, task: "If rotor bars are welded/dovetailed, repair or replace individual bars." },
      { step: 6, task: "Re-balance rotor after repair.", tolerance: "Per ISO 21940 grade" },
      { step: 7, task: "Reassemble motor and perform run test." },
      { step: 8, task: "Record baseline vibration and current signature for trending." },
    ],
    [
      { name: "Replacement rotor", spec: "OEM specification, matched to stator and frame", qty: 1 },
      { name: "Rotor bar conductive repair material", spec: "Copper or aluminum, matched to original bar material", qty: 1 },
      { name: "End ring (if applicable)", spec: "OEM specification", qty: 1 },
    ],
    ["Growler / rotor bar tester", "Motor analyzer (current signature)", "Vibration analyzer", "Balancer (for post-repair balance)", "Bearing puller set"],
    ELEC_SAFETY
  ),

  // ── LUBRICATION FAULTS ──────────────────────────────────────────────────

  "Inadequate or Degraded Lubricant Film": mapped(
    "Inadequate or Degraded Lubricant Film",
    3,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: look for bearing distress signatures." },
      { step: 3, task: "Inspect lubrication system: oil level, grease condition, lubricant type." },
      { step: 4, task: "Sample lubricant for analysis (viscosity, particle count, water content)." },
      { step: 5, task: "Flush old lubricant and refill with correct grade per OEM.", tolerance: "Per OEM lubricant specification" },
      { step: 6, task: "Verify correct grease quantity (for grease-lubricated bearings).", tolerance: "Per OEM grease-fill specification" },
      { step: 7, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Replacement lubricant", spec: "OEM-specified grade (e.g. NLGI 2 polyurea grease or ISO VG 68 oil)", qty: 1 },
      { name: "Oil filter (if applicable)", spec: "OEM-specified micron rating", qty: 1 },
    ],
    ["Grease gun", "Oil sampling kit", "Viscometer (or send sample to lab)", "Vibration analyzer", "Oil drain equipment"],
    LUBE_SAFETY
  ),

  "Lubrication Starvation": mapped(
    "Lubrication Starvation",
    3,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Inspect lubrication system for blocked lines, failed pump, or empty reservoir." },
      { step: 3, task: "Verify grease level in bearing housing or oil level in reservoir." },
      { step: 4, task: "Flush and refill with correct lubricant per OEM specification." },
      { step: 5, task: "Verify lubrication system is functioning (pump operation, line flow)." },
      { step: 6, task: "Set up automatic lubrication schedule or interval reminder." },
      { step: 7, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Replacement lubricant", spec: "OEM-specified grade", qty: 1 },
      { name: "Grease fitting / zerk", spec: "Matched to bearing housing", qty: 2 },
    ],
    ["Grease gun", "Oil level dipstick / sight glass", "Vibration analyzer", "Lubrication system diagnostic tools"],
    LUBE_SAFETY
  ),

  // ── CAVITATION ──────────────────────────────────────────────────────────

  "Fluid Aeration & Pump Cavitation Erosion": mapped(
    "Fluid Aeration & Pump Cavitation Erosion",
    2,
    4,
    [
      { step: 1, task: "Isolate the pump and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: broadband high-frequency noise, 1X–10X subsynchronous." },
      { step: 3, task: "Verify NPSH available vs. NPSH required per pump OEM data.", tolerance: "NPSH_a ≥ NPSH_r + 0.5 m minimum" },
      { step: 4, task: "Inspect suction strainer, piping, and valves for restrictions or air ingress." },
      { step: 5, task: "Check fluid level in supply tank and verify adequate suction head." },
      { step: 6, task: "Inspect impeller for cavitation erosion (pitting, material loss)." },
      { step: 7, task: "Replace damaged impeller if erosion is significant." },
      { step: 8, task: "Reinstall and test at operating conditions; re-measure vibration." },
    ],
    [
      { name: "Pump impeller (if eroded)", spec: "OEM specification, matched to pump model", qty: 1 },
      { name: "Pump mechanical seal", spec: "OEM specification, matched to shaft and pressure", qty: 1 },
      { name: "Suction strainer", spec: "OEM mesh size", qty: 1 },
      { name: "Pump gasket set", spec: "OEM specification", qty: 1 },
    ],
    ["Pressure gauge (suction and discharge)", "Ultrasonic leak detector", "Vibration analyzer", "Caliper / micrometer", "Pump alignment tools"],
    PROCESS_SAFETY
  ),

  // ── HYDRAULIC FAULTS ────────────────────────────────────────────────────

  "Proportional Valve Spool Silt-Locking & Wear": mapped(
    "Proportional Valve Spool Silt-Locking & Wear",
    2,
    5,
    [
      { step: 1, task: "Isolate the hydraulic system and release pressure." },
      { step: 2, task: "Remove the proportional valve from the manifold." },
      { step: 3, task: "Disassemble valve and inspect spool and bore for silt buildup, scoring, or wear." },
      { step: 4, task: "Clean spool and bore with approved hydraulic cleaning solvent." },
      { step: 5, task: "Measure spool-to-bore clearance.", tolerance: "Per OEM specification (typically 5–15 μm)" },
      { step: 6, task: "Replace spool or bore if clearance exceeds specification." },
      { step: 7, task: "Replace all seals and O-rings during reassembly." },
      { step: 8, task: "Reinstall valve and test under pressure for proper operation." },
    ],
    [
      { name: "Valve repair kit", spec: "OEM seal kit for specific proportional valve model", qty: 1 },
      { name: "Replacement spool (if worn)", spec: "OEM specification for valve model", qty: 1 },
      { name: "Hydraulic fluid", spec: "OEM-specified grade (e.g. ISO VG 46)", qty: 1 },
    ],
    ["Torque wrench", "Pick set (for O-ring removal)", "Ultrasonic cleaner", "Pressure gauge", "Valve test bench (if available)"],
    PROCESS_SAFETY
  ),

  "Internal seal bypassing": mapped(
    "Internal seal bypassing",
    2,
    3,
    [
      { step: 1, task: "Isolate the machine and release hydraulic / pneumatic pressure." },
      { step: 2, task: "Remove the seal housing or gland." },
      { step: 3, task: "Extract and inspect the old seal for damage, extrusion, or hardening." },
      { step: 4, task: "Clean seal area and inspect for groove wear or shaft scoring." },
      { step: 5, task: "Install new seal with correct orientation and lubrication." },
      { step: 6, task: "Reassemble and pressure-test for leakage." },
    ],
    [
      { name: "Replacement seal", spec: "OEM specification (e.g. NBR radial shaft seal, PTFE lip seal)", qty: 1 },
      { name: "O-ring kit", spec: "Metric or imperial, matched to housing dimensions", qty: 1 },
      { name: "Gasket set", spec: "OEM specification for housing", qty: 1 },
    ],
    ["Socket set", "Screwdriver set", "Seal installation tool", "Pick set", "Pressure test kit"],
    PROCESS_SAFETY
  ),

  // ── STRUCTURAL / RESONANCE ─────────────────────────────────────────────

  "Structural Noise / Resonance": mapped(
    "Structural Noise / Resonance",
    3,
    6,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Perform modal analysis (bump test) to identify structural natural frequencies." },
      { step: 3, task: "Compare structural natural frequencies to running speed and harmonics." },
      { step: 4, task: "Identify resonant component: baseplate, foundation, piping, or guard." },
      { step: 5, task: "Apply stiffening (gussets, cross-bracing) or damping (elastomeric pads) to shift natural frequency.", tolerance: "Natural frequency separated ≥ 20% from running speed" },
      { step: 6, task: "Re-test and verify resonance is avoided." },
      { step: 7, task: "Run at operating speed and re-measure vibration." },
    ],
    [
      { name: "Structural stiffener / gusset plate", spec: "Steel, matched to baseplate thickness", qty: 2 },
      { name: "Elastomeric isolation pads", spec: "Neoprene or Sorbothane, 10–25 mm thick", qty: 4 },
      { name: "Fastener set", spec: "Grade 8.8 bolts, matched to existing", qty: 8 },
    ],
    ["Impact hammer (modal testing)", "Vibration analyzer with modal software", "Torque wrench", "Welder / fabricator (for stiffeners)", "Feeler gauges"],
    MECH_SAFETY
  ),

  // ── NOISE FLOOR ─────────────────────────────────────────────────────────

  "Elevated Noise Floor": mapped(
    "Elevated Noise Floor",
    3,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration: broadband elevation without distinct fault peaks." },
      { step: 3, task: "Inspect for loose guards, covers, or structural elements causing rattling." },
      { step: 4, task: "Check bearing condition and lubrication level." },
      { step: 5, task: "Inspect for aerodynamic or hydraulic noise sources (inlet/outlet restrictions)." },
      { step: 6, task: "Tighten loose components and re-measure." },
      { step: 7, task: "If noise persists, perform spectral analysis to identify specific frequency bands." },
    ],
    [
      { name: "Elastomeric damping pads", spec: "Neoprene or Sorbothane", qty: 4 },
      { name: "Fastener set", spec: "Matched to existing guards and covers", qty: 8 },
    ],
    ["Vibration analyzer", "Sound level meter", "Torque wrench", "Inspection mirror"],
    MECH_SAFETY
  ),

  // ── GENERIC / UNCERTAIN ─────────────────────────────────────────────────

  "High Vibration - Unspecified Mechanical Fault": mapped(
    "High Vibration - Unspecified Mechanical Fault",
    2,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Perform comprehensive vibration analysis: time waveform, spectrum, and demod." },
      { step: 3, task: "Check for unbalance, misalignment, looseness, and bearing fault signatures." },
      { step: 4, task: "Inspect coupling, guards, and structural elements." },
      { step: 5, task: "If no specific fault is identified, trend vibration over time." },
      { step: 6, task: "Schedule follow-up analysis at next planned stop." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Inspection tools", "Thermal camera (optional)"],
    MECH_SAFETY
  ),

  "General Dynamic Fault": mapped(
    "General Dynamic Fault",
    2,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Perform comprehensive vibration analysis: time waveform, spectrum, and demod." },
      { step: 3, task: "Check for unbalance, misalignment, looseness, and bearing fault signatures." },
      { step: 4, task: "Inspect coupling, guards, and structural elements." },
      { step: 5, task: "If no specific fault is identified, trend vibration over time." },
      { step: 6, task: "Schedule follow-up analysis at next planned stop." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Inspection tools", "Thermal camera (optional)"],
    MECH_SAFETY
  ),

  "Secondary Vibration Influences": mapped(
    "Secondary Vibration Influences",
    3,
    3,
    [
      { step: 1, task: "Document all vibration sources: main machine, driven equipment, auxiliaries." },
      { step: 2, task: "Check for pipe strain, base flexibility, or coupling-transmitted vibration." },
      { step: 3, task: "Inspect for aerodynamic, hydraulic, or electromagnetic excitation sources." },
      { step: 4, task: "Isolate each source to determine primary contributor." },
      { step: 5, task: "Address primary contributor with appropriate corrective action." },
    ],
    [],
    ["Vibration analyzer", "Stroboscope", "Inspection tools"],
    MECH_SAFETY
  ),

  "Unspecified Anomaly": mapped(
    "Unspecified Anomaly",
    3,
    2,
    [
      { step: 1, task: "Perform comprehensive data collection: vibration, temperature, visual." },
      { step: 2, task: "Trend all measurements over time for pattern recognition." },
      { step: 3, task: "Consult maintenance history for prior issues on this asset." },
      { step: 4, task: "Escalate to senior analyst or OEM representative if data is inconclusive." },
    ],
    [],
    ["Vibration analyzer", "Infrared thermometer", "Visual inspection tools"],
    MECH_SAFETY
  ),

  // ── HEALTHY / NORMAL ────────────────────────────────────────────────────

  "Machine Healthy / Normal Operation": mapped(
    "Machine Healthy / Normal Operation",
    5,
    1,
    [
      { step: 1, task: "Record baseline vibration levels for trending." },
      { step: 2, task: "Verify vibration is within ISO 10816-3 Zone A/B.", tolerance: "≤ 4.5 mm/s RMS" },
      { step: 3, task: "Check bearing temperature and lubrication condition." },
      { step: 4, task: "Schedule next routine measurement interval." },
    ],
    [
      { name: "Bearing grease (spare)", spec: "OEM-specified grade, NLGI 2", qty: 1 },
    ],
    ["Vibration analyzer", "Infrared thermometer", "Grease gun", "Torque wrench"],
    HEALTHY_SAFETY
  ),

  "Normal Operation - No Faults Detected": mapped(
    "Normal Operation - No Faults Detected",
    5,
    1,
    [
      { step: 1, task: "Record baseline vibration levels for trending." },
      { step: 2, task: "Verify vibration is within ISO 10816-3 Zone A/B.", tolerance: "≤ 4.5 mm/s RMS" },
      { step: 3, task: "Check bearing temperature and lubrication condition." },
      { step: 4, task: "Schedule next routine measurement interval." },
    ],
    [
      { name: "Bearing grease (spare)", spec: "OEM-specified grade, NLGI 2", qty: 1 },
    ],
    ["Vibration analyzer", "Infrared thermometer", "Grease gun", "Torque wrench"],
    HEALTHY_SAFETY
  ),

  "Normal Operation": mapped(
    "Normal Operation",
    5,
    1,
    [
      { step: 1, task: "Record baseline vibration levels for trending." },
      { step: 2, task: "Verify vibration is within ISO 10816-3 Zone A/B.", tolerance: "≤ 4.5 mm/s RMS" },
      { step: 3, task: "Check bearing temperature and lubrication condition." },
      { step: 4, task: "Schedule next routine measurement interval." },
    ],
    [
      { name: "Bearing grease (spare)", spec: "OEM-specified grade, NLGI 2", qty: 1 },
    ],
    ["Vibration analyzer", "Infrared thermometer", "Grease gun", "Torque wrench"],
    HEALTHY_SAFETY
  ),

  "Normal": mapped(
    "Normal",
    5,
    1,
    [
      { step: 1, task: "Record baseline vibration levels for trending." },
      { step: 2, task: "Verify vibration is within ISO 10816-3 Zone A/B.", tolerance: "≤ 4.5 mm/s RMS" },
      { step: 3, task: "Check bearing temperature and lubrication condition." },
      { step: 4, task: "Schedule next routine measurement interval." },
    ],
    [
      { name: "Bearing grease (spare)", spec: "OEM-specified grade, NLGI 2", qty: 1 },
    ],
    ["Vibration analyzer", "Infrared thermometer", "Grease gun", "Torque wrench"],
    HEALTHY_SAFETY
  ),

  "Healthy Operations": mapped(
    "Healthy Operations",
    5,
    1,
    [
      { step: 1, task: "Record baseline vibration levels for trending." },
      { step: 2, task: "Verify vibration is within ISO 10816-3 Zone A/B.", tolerance: "≤ 4.5 mm/s RMS" },
      { step: 3, task: "Check bearing temperature and lubrication condition." },
      { step: 4, task: "Schedule next routine measurement interval." },
    ],
    [
      { name: "Bearing grease (spare)", spec: "OEM-specified grade, NLGI 2", qty: 1 },
    ],
    ["Vibration analyzer", "Infrared thermometer", "Grease gun", "Torque wrench"],
    HEALTHY_SAFETY
  ),

  "None Detected": mapped(
    "None Detected",
    5,
    1,
    [
      { step: 1, task: "Record baseline measurement for trending." },
      { step: 2, task: "Verify levels are within acceptable limits." },
      { step: 3, task: "Schedule next routine measurement interval." },
    ],
    [],
    ["Measurement instrument (vibration / thermal / ultrasound as applicable)"],
    HEALTHY_SAFETY
  ),

  // ── INCONCLUSIVE / REVIEW ───────────────────────────────────────────────

  "Inconclusive - Manual Review Recommended": mapped(
    "Inconclusive - Manual Review Recommended",
    3,
    2,
    [
      { step: 1, task: "Review time waveform and spectrum against historical baseline." },
      { step: 2, task: "Cross-reference with process and load history for the measurement period." },
      { step: 3, task: "Verify sensor mounting, route setup, and measurement consistency." },
      { step: 4, task: "Re-measure at steady-state load if prior data was taken during transient." },
      { step: 5, task: "Compare current spectra side-by-side with baseline and prior measurements." },
      { step: 6, task: "If anomaly persists and root cause is unclear, escalate to Level III vibration analyst." },
    ],
    [],
    ["Vibration analyzer", "Route-based analysis software"],
    MECH_SAFETY
  ),
  "Elevated Vibration — Review Required": mapped(
    "Elevated Vibration — Review Required",
    3,
    2,
    [
      { step: 1, task: "Review time waveform and spectrum against historical baseline." },
      { step: 2, task: "Cross-reference with process and load history for the measurement period." },
      { step: 3, task: "Verify sensor mounting, route setup, and measurement consistency." },
      { step: 4, task: "Re-measure at steady-state load if prior data was taken during transient." },
      { step: 5, task: "Compare current spectra side-by-side with baseline and prior measurements." },
      { step: 6, task: "If anomaly persists and root cause is unclear, escalate to Level III vibration analyst." },
    ],
    [],
    ["Vibration analyzer", "Route-based analysis software"],
    MECH_SAFETY
  ),
  "Unresolved": mapped(
    "Unresolved",
    3,
    2,
    [
      { step: 1, task: "Review time waveform and spectrum against historical baseline." },
      { step: 2, task: "Cross-reference with process and load history for the measurement period." },
      { step: 3, task: "Verify sensor mounting, route setup, and measurement consistency." },
      { step: 4, task: "Re-measure at steady-state load if prior data was taken during transient." },
      { step: 5, task: "Compare current spectra side-by-side with baseline and prior measurements." },
      { step: 6, task: "If anomaly persists and root cause is unclear, escalate to Level III vibration analyst." },
    ],
    [],
    ["Vibration analyzer", "Route-based analysis software"],
    MECH_SAFETY
  ),
  "Anomaly Detected": mapped(
    "Anomaly Detected",
    3,
    2,
    [
      { step: 1, task: "Review time waveform and spectrum against historical baseline." },
      { step: 2, task: "Cross-reference with process and load history for the measurement period." },
      { step: 3, task: "Verify sensor mounting, route setup, and measurement consistency." },
      { step: 4, task: "Re-measure at steady-state load if prior data was taken during transient." },
      { step: 5, task: "Compare current spectra side-by-side with baseline and prior measurements." },
      { step: 6, task: "If anomaly persists and root cause is unclear, escalate to Level III vibration analyst." },
    ],
    [],
    ["Vibration analyzer", "Route-based analysis software"],
    MECH_SAFETY
  ),

  // ── ISO ZONE FINDINGS ───────────────────────────────────────────────────

  "ISO Zone A — Good": mapped(
    "ISO Zone A — Good",
    5,
    1,
    [
      { step: 1, task: "Record vibration levels for trending." },
      { step: 2, task: "Confirm measurement is within ISO 10816-3 Zone A.", tolerance: "≤ 2.3 mm/s RMS (newly commissioned)" },
      { step: 3, task: "Schedule next routine interval." },
    ],
    [],
    ["Vibration analyzer", "Tachometer"],
    HEALTHY_SAFETY
  ),

  "ISO Zone A — Acceptable": mapped(
    "ISO Zone A — Acceptable",
    5,
    1,
    [
      { step: 1, task: "Record vibration levels for trending." },
      { step: 2, task: "Confirm measurement is within ISO 10816-3 Zone A.", tolerance: "≤ 2.3 mm/s RMS (newly commissioned)" },
      { step: 3, task: "Schedule next routine interval." },
    ],
    [],
    ["Vibration analyzer", "Tachometer"],
    HEALTHY_SAFETY
  ),

  "ISO Zone B — Acceptable": mapped(
    "ISO Zone B — Acceptable",
    4,
    1,
    [
      { step: 1, task: "Record vibration levels for trending." },
      { step: 2, task: "Confirm measurement is within ISO 10816-3 Zone B.", tolerance: "2.3–4.5 mm/s RMS (long-term acceptable)" },
      { step: 3, task: "Schedule increased monitoring interval." },
    ],
    [],
    ["Vibration analyzer", "Tachometer"],
    HEALTHY_SAFETY
  ),

  "ISO Zone C — Elevated Vibration": mapped(
    "ISO Zone C — Elevated Vibration",
    2,
    3,
    [
      { step: 1, task: "Schedule planned inspection at earliest opportunity." },
      { step: 2, task: "Perform detailed vibration analysis to identify root cause." },
      { step: 3, task: "Check alignment, balance, bearing condition, and looseness." },
      { step: 4, task: "Correct identified faults and re-measure.", tolerance: "Return to Zone A/B per ISO 10816-3" },
      { step: 5, task: "Trend vibration at increased frequency until resolved." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Infrared thermometer", "Alignment tools (as needed)"],
    MECH_SAFETY
  ),

  "ISO 10816 Zone C": mapped(
    "ISO 10816 Zone C",
    2,
    3,
    [
      { step: 1, task: "Schedule planned inspection at earliest opportunity." },
      { step: 2, task: "Perform detailed vibration analysis to identify root cause." },
      { step: 3, task: "Check alignment, balance, bearing condition, and looseness." },
      { step: 4, task: "Correct identified faults and re-measure.", tolerance: "Return to Zone A/B per ISO 10816-3" },
      { step: 5, task: "Trend vibration at increased frequency until resolved." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Infrared thermometer", "Alignment tools (as needed)"],
    MECH_SAFETY
  ),

  "ISO Zone D — Elevated Vibration": mapped(
    "ISO Zone D — Elevated Vibration",
    1,
    4,
    [
      { step: 1, task: "URGENT: Plan immediate shutdown if safe to do so." },
      { step: 2, task: "Perform emergency inspection of bearings, alignment, and structural integrity." },
      { step: 3, task: "If imminent failure risk, shut down and repair before restart." },
      { step: 4, task: "Correct all identified faults." },
      { step: 5, task: "Re-measure and confirm vibration returns to Zone A/B.", tolerance: "≤ 4.5 mm/s RMS per ISO 10816-3" },
      { step: 6, task: "Increase monitoring frequency until stable." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Infrared thermometer", "Emergency shutdown equipment"],
    MECH_SAFETY
  ),

  "ISO 10816 Zone D": mapped(
    "ISO 10816 Zone D",
    1,
    4,
    [
      { step: 1, task: "URGENT: Plan immediate shutdown if safe to do so." },
      { step: 2, task: "Perform emergency inspection of bearings, alignment, and structural integrity." },
      { step: 3, task: "If imminent failure risk, shut down and repair before restart." },
      { step: 4, task: "Correct all identified faults." },
      { step: 5, task: "Re-measure and confirm vibration returns to Zone A/B.", tolerance: "≤ 4.5 mm/s RMS per ISO 10816-3" },
      { step: 6, task: "Increase monitoring frequency until stable." },
    ],
    [],
    ["Vibration analyzer", "Tachometer", "Infrared thermometer", "Emergency shutdown equipment"],
    MECH_SAFETY
  ),

  // ── THERMOGRAPHY FAULTS ─────────────────────────────────────────────────

  "Loose Connection": mapped(
    "Loose Connection",
    1,
    3,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Lock out power and verify zero energy state." },
      { step: 3, task: "Remove access panel to expose electrical connections." },
      { step: 4, task: "Inspect all connections for signs of looseness, discoloration, or arcing." },
      { step: 5, task: "Re-torque all terminals and connections to OEM specification.", tolerance: "Per OEM torque specification" },
      { step: 6, task: "Apply anti-oxidant compound to aluminum connections." },
      { step: 7, task: "Replace damaged connectors, lugs, or bus bars." },
      { step: 8, task: "Re-energize and verify temperature reduction with IR camera.", tolerance: "ΔT < 5°C above ambient at connection" },
    ],
    [
      { name: "Terminal connectors / lugs", spec: "Matched to conductor size and type", qty: 4 },
      { name: "Anti-oxidant compound", spec: "Noalox or equivalent for aluminum", qty: 1 },
      { name: "Contact cleaner", spec: "Electrical contact cleaner spray", qty: 1 },
    ],
    ["Infrared camera", "Torque wrench (low-range)", "Multimeter", "Insulated tools", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    IR_ZONES
  ),

  "High Resistance": mapped(
    "High Resistance",
    1,
    3,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Lock out power and verify zero energy state." },
      { step: 3, task: "Remove access panel to expose electrical connections." },
      { step: 4, task: "Measure connection resistance with micro-ohmmeter.", tolerance: "Per OEM specification (typically < 50 μΩ)" },
      { step: 5, task: "Identify high-resistance connection by comparing phase-to-phase readings." },
      { step: 6, task: "Clean, re-torque, or replace degraded terminals." },
      { step: 7, task: "Re-energize and verify temperature reduction with IR camera.", tolerance: "ΔT < 5°C above ambient at connection" },
    ],
    [
      { name: "Terminal connectors / lugs", spec: "Matched to conductor size and type", qty: 4 },
      { name: "Contact cleaner", spec: "Electrical contact cleaner spray", qty: 1 },
      { name: "Anti-oxidant compound", spec: "Noalox or equivalent for aluminum", qty: 1 },
    ],
    ["Micro-ohmmeter", "Infrared camera", "Torque wrench (low-range)", "Insulated tools", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    IR_ZONES
  ),

  "Phase Imbalance": mapped(
    "Phase Imbalance",
    2,
    4,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Measure phase voltages and currents with calibrated meter." },
      { step: 3, task: "Calculate voltage unbalance per NEMA MG1.", tolerance: "≤ 1% voltage unbalance recommended" },
      { step: 4, task: "Inspect connections for loose or corroded terminals." },
      { step: 5, task: "Check upstream supply for utility-side imbalance." },
      { step: 6, task: "If load-side imbalance, redistribute single-phase loads." },
      { step: 7, task: "Re-energize and verify balance improvement." },
    ],
    [
      { name: "Terminal connectors / lugs", spec: "Matched to conductor size and type", qty: 4 },
      { name: "Fuses (if applicable)", spec: "Matched to circuit rating", qty: 3 },
    ],
    ["Power quality analyzer", "Multimeter", "Clamp meter", "Infrared camera", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    IR_ZONES
  ),

  "Overload": mapped(
    "Overload",
    2,
    4,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Document motor nameplate FLA and current draw." },
      { step: 3, task: "Check for mechanical binding, excessive load, or seized bearings." },
      { step: 4, task: "Verify supply voltage is within ±10% of nameplate." },
      { step: 5, task: "Reduce load or correct mechanical issue." },
      { step: 6, task: "Verify overload relay / breaker is correctly sized." },
      { step: 7, task: "Re-energize and monitor current draw." },
    ],
    [
      { name: "Overload relay (if defective)", spec: "Matched to motor FLA", qty: 1 },
      { name: "Fuses", spec: "Matched to circuit rating", qty: 3 },
    ],
    ["Clamp meter", "Multimeter", "Power quality analyzer", "Infrared camera", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    IR_ZONES
  ),

  "Friction": mapped(
    "Friction",
    3,
    4,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Document baseline vibration and temperature." },
      { step: 3, task: "Inspect bearings, seals, and lubrication condition." },
      { step: 4, task: "Check for rubbing between rotating and stationary components." },
      { step: 5, task: "Correct alignment and clearances." },
      { step: 6, task: "Re-lubricate or replace bearings as needed." },
      { step: 7, task: "Re-measure vibration and temperature." },
    ],
    [
      { name: "Replacement bearing", spec: "OEM specification (e.g. SKF 6210-2RS1: n=9, d_b=12.7 mm, D_p=70.0 mm)", qty: 1 },
      { name: "Replacement seal", spec: "NBR lip seal, matched to shaft diameter", qty: 1 },
      { name: "Bearing grease", spec: "Polyurea or lithium-complex, NLGI 2", qty: 1 },
    ],
    ["Infrared camera", "Vibration analyzer", "Feeler gauges", "Torque wrench", "Grease gun"],
    MECH_SAFETY,
    IR_ZONES
  ),

  "Harmonic Heating": mapped(
    "Harmonic Heating",
    2,
    6,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Document temperature readings at motor, VFD, transformer, and cabling." },
      { step: 3, task: "Perform power quality analysis to quantify harmonic distortion (THD).", tolerance: "THD-V ≤ 5% per IEEE 519" },
      { step: 4, task: "Identify harmonic source: VFD, rectifier, nonlinear load." },
      { step: 5, task: "Install or verify harmonic filters (passive or active)." },
      { step: 6, task: "Re-energize and verify temperature and THD improvement." },
    ],
    [
      { name: "Harmonic filter (passive or active)", spec: "Sized to load and harmonic spectrum", qty: 1 },
      { name: "Capacitor bank (if power factor correction needed)", spec: "Matched to kVAR requirement", qty: 1 },
      { name: "Terminal connectors", spec: "Matched to conductor size", qty: 4 },
    ],
    ["Power quality analyzer", "Infrared camera", "Oscilloscope", "True-RMS multimeter", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    IR_ZONES
  ),

  "Lubrication Failure": mapped(
    "Lubrication Failure",
    3,
    3,
    [
      { step: 1, task: "Isolate the machine and apply lock-out / tag-out." },
      { step: 2, task: "Inspect lubrication system: oil level, grease condition, delivery lines." },
      { step: 3, task: "Sample lubricant for analysis (viscosity, particle count, water content)." },
      { step: 4, task: "Flush contaminated or degraded lubricant." },
      { step: 5, task: "Refill with correct grade per OEM specification.", tolerance: "Per OEM lubricant specification" },
      { step: 6, task: "Verify lubrication system is functioning (pump, distributor, lines)." },
      { step: 7, task: "Run at operating speed and re-measure vibration and temperature." },
    ],
    [
      { name: "Replacement lubricant", spec: "OEM-specified grade", qty: 1 },
      { name: "Oil filter (if applicable)", spec: "OEM-specified micron rating", qty: 1 },
    ],
    ["Grease gun", "Oil sampling kit", "Viscometer (or send sample to lab)", "Vibration analyzer", "Infrared thermometer"],
    LUBE_SAFETY,
    IR_ZONES
  ),

  "Localized Overheating": mapped(
    "Localized Overheating",
    3,
    3,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Document temperature distribution with IR camera." },
      { step: 3, task: "Identify heat source: blocked ventilation, overloaded circuit, failing component." },
      { step: 4, task: "Check bearing temperature and lubrication." },
      { step: 5, task: "Clear ventilation obstructions or repair cooling fans." },
      { step: 6, task: "Re-energize and verify temperature reduction." },
    ],
    [
      { name: "Cooling fan (if failed)", spec: "OEM specification, matched to frame", qty: 1 },
      { name: "Ventilation grille / filter", spec: "OEM specification", qty: 1 },
    ],
    ["Infrared camera", "Multimeter", "Contact thermometer", "Cleaning supplies"],
    MECH_SAFETY,
    IR_ZONES
  ),

  // ── ULTRASOUND FAULTS ───────────────────────────────────────────────────

  "Air Leak": mapped(
    "Air Leak",
    3,
    4,
    [
      { step: 1, task: "Isolate the system and release pressure." },
      { step: 2, task: "Use ultrasonic detector to pinpoint leak location." },
      { step: 3, task: "Mark leak location and assess severity." },
      { step: 4, task: "Repair or replace leaking fitting, valve, or pipe section." },
      { step: 5, task: "Re-pressurize system and verify leak is sealed." },
      { step: 6, task: "Re-scan with ultrasonic detector to confirm no remaining leaks." },
    ],
    [
      { name: "Pipe fittings / connectors", spec: "Matched to pipe size and pressure rating", qty: 4 },
      { name: "Thread sealant", spec: "PTFE tape or anaerobic pipe sealant", qty: 1 },
      { name: "Gaskets", spec: "Matched to flange size", qty: 4 },
    ],
    ["Ultrasonic leak detector", "Pipe wrench", "Thread sealant", "Pressure gauge", "Safety glasses"],
    PROCESS_SAFETY,
    US_ZONES
  ),

  "Corona / Tracking": mapped(
    "Corona / Tracking",
    1,
    4,
    [
      { step: 1, task: "Isolate the equipment and apply lock-out / tag-out." },
      { step: 2, task: "Use UV / corona camera to locate discharge sources." },
      { step: 3, task: "Inspect insulation for carbon tracking, discoloration, or erosion." },
      { step: 4, task: "Clean contaminated insulation surfaces." },
      { step: 5, task: "Replace severely degraded insulation or bushings." },
      { step: 6, task: "Verify clearance distances meet OEM / IEEE requirements.", tolerance: "Per OEM or IEEE insulation distance spec" },
      { step: 7, task: "Re-energize and re-scan with UV camera." },
    ],
    [
      { name: "Insulating tape / sleeving", spec: "Class H or higher, rated for voltage", qty: 1 },
      { name: "Replacement bushing or insulator", spec: "OEM specification", qty: 1 },
      { name: "Contact cleaner", spec: "Non-residue electrical cleaner", qty: 1 },
    ],
    ["UV / corona camera", "Insulation resistance tester (Megger)", "Compressed air", "Cleaning supplies", "Lock-out / tag-out kit"],
    ELEC_SAFETY,
    US_ZONES
  ),

  "Steam Trap Blow-by": mapped(
    "Steam Trap Blow-by",
    3,
    3,
    [
      { step: 1, task: "Isolate the steam trap (close upstream and downstream valves)." },
      { step: 2, task: "Use ultrasonic detector or IR thermometer to identify faulty trap." },
      { step: 3, task: "Remove and inspect the steam trap." },
      { step: 4, task: "Check for internal damage, blockage, or worn seat." },
      { step: 5, task: "Repair or replace steam trap per OEM specification." },
      { step: 6, task: "Re-install and verify proper operation (open and trap cycle)." },
    ],
    [
      { name: "Replacement steam trap", spec: "OEM specification, matched to type and capacity", qty: 1 },
      { name: "Trap gasket set", spec: "Matched to trap and pipe flanges", qty: 1 },
      { name: "Thread sealant", spec: "PTFE tape or high-temperature pipe sealant", qty: 1 },
    ],
    ["Ultrasonic detector", "Infrared thermometer", "Pipe wrench", "Safety glasses and gloves", "Lock-out / tag-out kit"],
    PROCESS_SAFETY,
    US_ZONES
  ),
};

// ---------------------------------------------------------------------------
// Lookup Map (case-insensitive, trimmed)
// ---------------------------------------------------------------------------

const _lookup = new Map<string, PrescriptivePackage>();

for (const key of Object.keys(DICT)) {
  _lookup.set(key.trim().toLowerCase(), DICT[key]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DICTIONARY_VERSION = "1.3.0";

// NFPA 70B-2023 / NETA dual-axis IR severity brackets
export interface IrSeverityBracket {
  readonly minDegC: number;
  readonly maxDegC: number;
  readonly netaClass: string;
  readonly repairWindow: string;
  readonly requiresImmediateAction: boolean;
}

/** Point-to-Point (P-P) delta-T brackets, °C */
export const IR_PP_BRACKETS: readonly IrSeverityBracket[] = [
  { minDegC: -Infinity, maxDegC: 1, netaClass: "Normal", repairWindow: "Regular scheduled maintenance", requiresImmediateAction: false },
  { minDegC: 1, maxDegC: 4, netaClass: "Class 3 — Minor", repairWindow: "Next scheduled outage", requiresImmediateAction: false },
  { minDegC: 4, maxDegC: 15, netaClass: "Class 2 — Moderate", repairWindow: "Within 30 days + weekly monitoring", requiresImmediateAction: false },
  { minDegC: 15, maxDegC: Infinity, netaClass: "Class 1 — Critical", repairWindow: "Immediate action — stop/lockout", requiresImmediateAction: true },
] as const;

/** Point-to-Ambient (P-A) delta-T brackets, °C */
export const IR_PA_BRACKETS: readonly IrSeverityBracket[] = [
  { minDegC: -Infinity, maxDegC: 10, netaClass: "Normal", repairWindow: "Regular scheduled maintenance", requiresImmediateAction: false },
  { minDegC: 10, maxDegC: 26, netaClass: "Class 3 — Minor", repairWindow: "Next scheduled outage", requiresImmediateAction: false },
  { minDegC: 26, maxDegC: 40, netaClass: "Class 2 — Moderate", repairWindow: "Within 30 days + weekly monitoring", requiresImmediateAction: false },
  { minDegC: 40, maxDegC: Infinity, netaClass: "Class 1 — Critical", repairWindow: "Immediate action — stop/lockout", requiresImmediateAction: true },
] as const;

/** Evaluate delta-T against NFPA 70B brackets. */
export function evaluateIrSeverity(deltaT_C: number, axis: "P-P" | "P-A"): IrSeverityBracket {
  const brackets = axis === "P-P" ? IR_PP_BRACKETS : IR_PA_BRACKETS;
  for (const b of brackets) {
    if (deltaT_C > b.minDegC && deltaT_C <= b.maxDegC) return b;
  }
  return brackets[brackets.length - 1];
}

export function getPrescription(diagnosis: string): PrescriptivePackage {
  const key = String(diagnosis ?? "").trim().toLowerCase();
  return _lookup.get(key) ?? unmapped(String(diagnosis ?? ""));
}

export function isMapped(diagnosis: string): boolean {
  return getPrescription(diagnosis).isMapped;
}

// ---------------------------------------------------------------------------
// Coverage Table — every active diagnosis string → mapped/unmapped
// All mapped entries now include safety field (LOTO + PPE by fault domain).
// ---------------------------------------------------------------------------
//
// Diagnosis String                                        | Mapped
// ---------------------------------------------------------+--------
// "Unbalance"                                             | ✓
// "Mass Unbalance"                                        | ✓
// "Mechanical Unbalance"                                  | ✓
// "Dynamic mass unbalance"                                | ✓
// "Dynamic Rotor Mass Unbalance"                          | ✓
// "Shaft unbalance"                                       | ✓
// "Angular Misalignment"                                  | ✓
// "Misalignment"                                          | ✓
// "Shaft Angular & Radial Misalignment"                   | ✓
// "Mechanical Looseness"                                  | ✓
// "Mechanical looseness"                                  | ✓
// "Looseness"                                             | ✓
// "Outer Race Bearing Defect (BPFO)"                      | ✓
// "Bearing Defect"                                        | ✓
// "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)"    | ✓
// "Inner Race Bearing Defect (BPFI)"                      | ✓
// "Rolling Element Bearing Defect (BSF)"                  | ✓
// "Bearing Fault / Other"                                 | ✓
// "Gear Tooth Defect"                                     | ✓
// "Internal gear backlash"                                | ✓
// "Stator Winding Inter-turn Insulation Degradation"      | ✓
// "Air Gap Eccentricity"                                  | ✓
// "Broken Rotor Bar Circuit"                              | ✓
// "Inadequate or Degraded Lubricant Film"                 | ✓
// "Lubrication Starvation"                                | ✓
// "Fluid Aeration & Pump Cavitation Erosion"              | ✓
// "Proportional Valve Spool Silt-Locking & Wear"          | ✓
// "Internal seal bypassing"                               | ✓
// "Structural Noise / Resonance"                          | ✓
// "Elevated Noise Floor"                                  | ✓
// "High Vibration - Unspecified Mechanical Fault"         | ✓
// "General Dynamic Fault"                                 | ✓
// "Secondary Vibration Influences"                        | ✓
// "Unspecified Anomaly"                                   | ✓
// "Machine Healthy / Normal Operation"                    | ✓
// "Normal Operation - No Faults Detected"                 | ✓
// "Normal Operation"                                      | ✓
// "Normal"                                                | ✓
// "Healthy Operations"                                    | ✓
// "None Detected"                                         | ✓
// "Inconclusive - Manual Review Recommended"              | ✓
// "Elevated Vibration — Review Required"                  | ✓
// "Unresolved"                                            | ✓
// "Anomaly Detected"                                      | ✓
// "ISO Zone A — Good"                                     | ✓
// "ISO Zone A — Acceptable"                               | ✓
// "ISO Zone B — Acceptable"                               | ✓
// "ISO Zone C — Elevated Vibration"                       | ✓
// "ISO 10816 Zone C"                                      | ✓
// "ISO Zone D — Elevated Vibration"                       | ✓
// "ISO 10816 Zone D"                                      | ✓
// "Loose Connection"                                      | ✓
// "High Resistance"                                       | ✓
// "Phase Imbalance"                                       | ✓
// "Overload"                                              | ✓
// "Friction"                                              | ✓
// "Harmonic Heating"                                      | ✓
// "Lubrication Failure"                                   | ✓
// "Localized Overheating"                                 | ✓
// "Air Leak"                                              | ✓
// "Corona / Tracking"                                     | ✓
// "Steam Trap Blow-by"                                    | ✓
// ---------------------------------------------------------+--------
// Total: 62 strings | Mapped: 62 | Unmapped fallback: 4   | 100%
