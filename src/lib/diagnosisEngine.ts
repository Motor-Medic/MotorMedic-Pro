export interface VibrationData {
  overall_velocity: number;
  oneX_rpm: number;
  twoX_rpm: number;
  bearing_inner: number;
  bearing_outer: number;
  equipment_type?: string;
  gear_mesh_freq?: number;
  shaft_name?: string;
  rpm?: number;
  bearing_freq?: number;
}

export interface Fault {
  type: string;
  severity: 'Normal' | 'Warning' | 'Critical';
  evidence: string;
  frequency?: string;
  affected_shaft?: string;
  recommendation: string;
}

const THRESHOLDS = {
  unbalance_1X: 0.10,      // in/s
  misalignment_2X: 0.05,   // in/s
  bearing_defect: 0.02,    // in/s
  overall_velocity: 0.30,  // in/s
  gear_mesh_freq: 0.08     // in/s (for gearboxes)
};

export function analyzeVibration(data: any): { 
  faultDetected: boolean; 
  faults: Fault[]; 
  overallSeverity: 'Normal' | 'Warning' | 'Critical'; 
} {
  const faults: Fault[] = [];
  
  // Convert inputs to float safely
  const rpm = parseFloat(data.rpm) || 1750;
  const oneX_rpm = parseFloat(data.oneX_rpm) || 0;
  const twoX_rpm = parseFloat(data.twoX_rpm) || 0;
  const bearing_inner = parseFloat(data.bearing_inner) || 0;
  const bearing_outer = parseFloat(data.bearing_outer) || 0;
  const bearing_freq = parseFloat(data.bearing_freq) || Math.max(bearing_inner, bearing_outer);
  const overall_velocity = parseFloat(data.overall_velocity) || 0;
  const equipment_type = data.equipment_type || data.equipmentType || '';

  // 1X RPM Unbalance
  if (oneX_rpm > THRESHOLDS.unbalance_1X) {
    faults.push({
      type: "Mechanical Unbalance",
      severity: oneX_rpm > 0.20 ? "Critical" : "Warning",
      evidence: `1X RPM amplitude: ${oneX_rpm.toFixed(3)} in/s (threshold: ${THRESHOLDS.unbalance_1X})`,
      frequency: `${rpm} RPM (1X running speed)`,
      recommendation: "Perform dynamic balancing of the rotor assembly and check for structural looseness or material buildup."
    });
  }
  
  // 2X RPM Misalignment
  if (twoX_rpm > THRESHOLDS.misalignment_2X) {
    faults.push({
      type: "Misalignment",
      severity: twoX_rpm > 0.10 ? "Critical" : "Warning",
      evidence: `2X RPM amplitude: ${twoX_rpm.toFixed(3)} in/s (threshold: ${THRESHOLDS.misalignment_2X})`,
      frequency: `${(rpm * 2).toFixed(0)} RPM (2X running speed)`,
      recommendation: "Re-align shafts using precision laser alignment equipment, check soft foot, and inspect flexible couplings for wear."
    });
  }
  
  // Bearing Defect
  if (bearing_freq > THRESHOLDS.bearing_defect) {
    faults.push({
      type: "Bearing Defect",
      severity: "Critical",
      evidence: `Bearing frequency amplitude: ${bearing_freq.toFixed(3)} in/s (threshold: ${THRESHOLDS.bearing_defect})`,
      recommendation: "Schedule immediate bearing replacement. Inspect lubrication channels for contamination and verify housing tolerances."
    });
  }
  
  // Gearbox-specific analysis
  if (equipment_type === 'Gearbox') {
    const gmf = parseFloat(data.gear_mesh_freq) || 0;
    if (gmf > THRESHOLDS.gear_mesh_freq) {
      faults.push({
        type: "Gear Tooth Defect",
        severity: "Critical",
        evidence: `Gear Mesh Frequency (GMF) amplitude: ${gmf.toFixed(3)} in/s (threshold: ${THRESHOLDS.gear_mesh_freq})`,
        affected_shaft: data.shaft_name || "Unknown Shaft",
        recommendation: "Inspect gear mesh teeth for wear, backlash, chipping, or pitting. Verify gear alignment and lubrication level."
      });
    }
  }
  
  // Check overall velocity threshold (ISO 10816-3 Zone C/D entry)
  if (overall_velocity > THRESHOLDS.overall_velocity && faults.length === 0) {
    faults.push({
      type: "High Vibration - Unspecified Mechanical Fault",
      severity: "Critical",
      evidence: `Overall velocity: ${overall_velocity.toFixed(3)} in/s (threshold: ${THRESHOLDS.overall_velocity})`,
      recommendation: "Conduct full structural audit, check foundation anchor bolts, and verify process load conditions."
    });
  }

  // Determine overall severity
  let overallSeverity: 'Normal' | 'Warning' | 'Critical' = 'Normal';
  if (faults.some(f => f.severity === "Critical") || overall_velocity > THRESHOLDS.overall_velocity) {
    overallSeverity = "Critical";
  } else if (faults.length > 0 || overall_velocity > 0.15) {
    overallSeverity = "Warning";
  }

  return {
    faultDetected: faults.length > 0,
    faults,
    overallSeverity
  };
}
