/**
 * Client helpers for Run Diagnostics → app-wide persistence
 * (Trend Analyzer, Alerts, Analysis Reports, Diagnosis Logs).
 */

export const SAVE_ANALYSIS_RESULT_PATH = "/api/save-analysis-result";
export const ANALYSIS_RESULTS_PATH = "/api/analysis-results";
export const ALERTS_PATH = "/api/alerts";
export const DIAGNOSIS_LOGS_PATH = "/api/diagnosis-logs";
export const SET_BASELINE_PATH = "/api/analysis-results";

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface SavedFaultItem {
  title: string;
  frequency?: string | number;
  frequencyHz?: number;
  confidence?: number;
  confidencePercent?: number;
  severity?: string;
  detail?: string;
  description?: string;
}

export interface SavedAnalysisResult {
  id: string;
  asset_id: string | null;
  component: string | null;
  timestamp: string;
  health_score: number | null;
  primary_fault: string | null;
  fault_list: SavedFaultItem[];
  peaks: unknown[];
  spectrum_image_url: string | null;
  recommendations: string[];
  financial_impact: Record<string, number>;
  severity?: string | null;
  summary?: string | null;
  is_baseline?: boolean;
  consensus_details?: Record<string, unknown> | null;
  analysis_type?: string | null;
  created_at?: string;
  asset_type?: string | null;
  phase_a_temp?: number | null;
  phase_b_temp?: number | null;
  phase_c_temp?: number | null;
  measured_amps?: number | null;
  rated_amps?: number | null;
  de_bearing_temp?: number | null;
  ode_bearing_temp?: number | null;
  refractory_skin_temp?: number | null;
  max_allowable_limit?: number | null;
  i2r_normalized_delta_t?: number | null;
  /** Hybrid polymorphic JSONB (environmental + AI vision + extras). */
  telemetry_data?: Record<string, unknown> | null;
  waveform_peak_to_peak?: number | null;
  waveform_crest_factor?: number | null;
  waveform_impact_count?: number | null;
  waveform_symmetry?: string | null;
  waveform_modulation?: string | null;
  envelope_peak_amplitude?: number | null;
  envelope_dominant_frequency?: number | null;
  envelope_energy?: number | null;
}

export interface SavedAlert {
  id: string;
  analysis_result_id: string | null;
  asset_id: string | null;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  created_at: string;
  acknowledged: boolean;
}

export interface SavedDiagnosisLog {
  id: string;
  asset_id: string | null;
  analysis_type: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: "success" | "failed";
  result_summary: Record<string, unknown>;
  analysis_result_id?: string | null;
  created_at?: string;
}

export interface SaveAnalysisPayload {
  asset_id?: string | null;
  component?: string | null;
  health_score?: number | null;
  primary_fault?: string | null;
  fault_list?: SavedFaultItem[];
  peaks?: unknown[];
  spectrum_image_url?: string | null;
  recommendations?: string[];
  financial_impact?: Record<string, number>;
  severity?: string | null;
  summary?: string | null;
  consensus_details?: Record<string, unknown> | null;
  analysis_type?: string;
  started_at?: string | null;
  create_alerts_for_high?: boolean;
  /** Polymorphic thermography columns (optional / nullable). */
  asset_type?: string | null;
  phase_a_temp?: number | null;
  phase_b_temp?: number | null;
  phase_c_temp?: number | null;
  measured_amps?: number | null;
  rated_amps?: number | null;
  de_bearing_temp?: number | null;
  ode_bearing_temp?: number | null;
  refractory_skin_temp?: number | null;
  max_allowable_limit?: number | null;
  i2r_normalized_delta_t?: number | null;
  /** Hybrid polymorphic JSONB (environmental + AI vision + extras). */
  telemetry_data?: Record<string, unknown> | null;
  waveform_peak_to_peak?: number | null;
  waveform_crest_factor?: number | null;
  waveform_impact_count?: number | null;
  waveform_symmetry?: string | null;
  waveform_modulation?: string | null;
  envelope_peak_amplitude?: number | null;
  envelope_dominant_frequency?: number | null;
  envelope_energy?: number | null;
}

export async function saveAnalysisResult(
  payload: SaveAnalysisPayload
): Promise<{
  success: boolean;
  analysis: SavedAnalysisResult;
  alerts_created: number;
  log_id?: string;
}> {
  const res = await fetch(SAVE_ANALYSIS_RESULT_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
  }
  return data;
}

export async function fetchAnalysisResults(params?: {
  asset_id?: string;
  component?: string;
  limit?: number;
}): Promise<SavedAnalysisResult[]> {
  const q = new URLSearchParams();
  if (params?.asset_id) q.set("asset_id", params.asset_id);
  if (params?.component) q.set("component", params.component);
  if (params?.limit) q.set("limit", String(params.limit));
  const res = await fetch(
    `${ANALYSIS_RESULTS_PATH}${q.toString() ? `?${q}` : ""}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load analysis results`);
  }
  return Array.isArray(data?.results) ? data.results : [];
}

export async function fetchAlerts(params?: {
  asset_id?: string;
  acknowledged?: boolean;
  severity?: string;
  limit?: number;
}): Promise<SavedAlert[]> {
  const q = new URLSearchParams();
  if (params?.asset_id) q.set("asset_id", params.asset_id);
  if (params?.acknowledged != null) q.set("acknowledged", String(params.acknowledged));
  if (params?.severity) q.set("severity", params.severity);
  if (params?.limit) q.set("limit", String(params.limit));
  const res = await fetch(`${ALERTS_PATH}${q.toString() ? `?${q}` : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to load alerts");
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export async function acknowledgeAlert(id: string): Promise<SavedAlert> {
  const res = await fetch(`${ALERTS_PATH}/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to acknowledge alert");
  return data.alert as SavedAlert;
}

export async function fetchDiagnosisLogs(params?: {
  asset_id?: string;
  limit?: number;
}): Promise<SavedDiagnosisLog[]> {
  const q = new URLSearchParams();
  if (params?.asset_id) q.set("asset_id", params.asset_id);
  if (params?.limit) q.set("limit", String(params.limit));
  const res = await fetch(
    `${DIAGNOSIS_LOGS_PATH}${q.toString() ? `?${q}` : ""}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to load diagnosis logs");
  return Array.isArray(data?.logs) ? data.logs : [];
}

export async function setAnalysisBaseline(id: string): Promise<SavedAnalysisResult> {
  const res = await fetch(
    `${SET_BASELINE_PATH}/${encodeURIComponent(id)}/baseline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to set baseline");
  return data.analysis as SavedAnalysisResult;
}
