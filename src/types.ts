/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ProbableFault {
  fault?: string; // legacy support
  fault_name: string;
  confidence: "High" | "Medium" | "Low";
  probability: number;
  description?: string; // legacy support
  subsystem?: string; // legacy support
  failure_mode?: string; // legacy support
  supporting_evidence?: string;
  calculated_frequencies?: string;
  physical_explanation?: string;
}

export interface RunnerUpFault {
  fault_name: string;
  probability: number;
  why_ruled_out: string;
}

export interface ImmediateAction {
  action: string;
  priority: string;
  timeline?: string;
  safety_warning?: string;
  rationale?: string; // legacy support
  estimated_time?: string; // legacy support
  required_tools?: string[]; // legacy support
}

export interface ManagerSummary {
  severity: "Critical" | "High" | "Medium" | "Low";
  executive_brief: string;
  estimated_downtime: string;
  cost_estimate: string;
  business_impact: string;
}

export interface FinancialImpact {
  estimated_downtime_cost: string;
  estimated_repair_cost: string;
  savings_from_proactive_repair: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface DiagnosticResponse {
  equipment_status: "HEALTHY" | "MINOR_ISSUES" | "FAULT_DETECTED" | "CRITICAL_FAULT";
  confidence_score: number;
  overall_vibration_level: string;
  iso_severity_zone: "A" | "B" | "C" | "D" | string;
  probable_faults: ProbableFault[];
  runner_up_faults?: RunnerUpFault[];
  verification_steps?: string[];
  immediate_actions: ImmediateAction[];
  root_cause_analysis?: string;
  financial_impact?: FinancialImpact;
  manager_summary: ManagerSummary;
  technician_instructions?: string;
  data_sources_analyzed?: string;
  sources?: GroundingSource[];
  attemptedModel?: string;
  isSimulatedFallback?: boolean;
  simulationReason?: string;
  failure_stage?: "Incipient" | "Early" | "Advanced" | "Catastrophic" | string;
  baseline_delta?: string | null;
  db_id?: number;
}

export interface MaintenanceLog {
  id: string;
  equipmentName: string;
  date: string;
  action: string;
  partsUsed: string;
  notes: string;
  technician: string;
}

export interface SavedReport {
  id: string;
  date: string;
  category: "Mechanical" | "Electrical" | "Hydraulic" | "All";
  symptoms: string;
  specs: Record<string, string>;
  fileName?: string;
  fileType?: string;
  technology?: string;
  data: DiagnosticResponse;
  systemHealthImpact?: {
    mechanical: number;
    electrical: number;
    hydraulic: number;
  };
}

export interface SystemHealth {
  mechanical: number;
  electrical: number;
  hydraulic: number;
}

export interface TrendDataPoint {
  id: string;
  timestamp: string;
  equipmentName: string;
  vibrationVelocity: number; // in mm/s RMS
  bearingTemperature: number; // in °C
  hydraulicPressure: number; // in bar
  electricalAmperage: number; // in Amps
}

export interface NameplateScanResult {
  specRpm?: string;
  specOrientation?: string;
  specDrive?: string;
  specFanBlades?: string;
  specPumpImpellers?: string;
  specPinionTeeth?: string;
  equipmentName?: string;
}

export interface SensorPoint {
  x: number; // percentage coordinate 0-100 on the image
  y: number; // percentage coordinate 0-100 on the image
  label: string;
  direction: "Radial Horizontal" | "Radial Vertical" | "Axial" | "Triaxial" | "Ambient/Reference";
  description: string;
}

export interface SensorPlacementResult {
  equipmentType: string;
  recommendedSensors: string;
  mountingType: string;
  surfacePreparation: string;
  points: SensorPoint[];
  isSimulatedFallback?: boolean;
  simulationReason?: string;
}

