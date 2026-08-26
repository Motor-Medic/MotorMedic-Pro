/**
 * Client wrapper for the `/api/reports` endpoints.
 *
 * Rows come back in the database's snake_case, matching the convention the
 * analysis and sign-off helpers already use. The one transformation applied is
 * re-expanding `technology_summary` into the ordered technology list the
 * viewer renders, which is deliberately lossless: no value is recomputed, so a
 * reopened report shows exactly the numbers that were saved.
 */

import {
  fromTechnologySummaryMap,
  toTechnologySummaryMap,
  type MultiTechReport,
  type ReportFault,
  type ReportSeverity,
  type ReportTechnologyId,
  type TechnologyReport,
  type TechnologySummaryMap
} from "./technologySummary";

export const REPORTS_PATH = "/api/reports";

/** A report row exactly as stored. */
export interface SavedReportRow {
  id: string;
  asset_id: string;
  company_id: number | null;
  title: string | null;
  technology_summary: TechnologySummaryMap;
  overall_severity: ReportSeverity;
  fault_diagnoses: ReportFault[];
  recommendations: string[];
  technologies_with_data: ReportTechnologyId[];
  generated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveReportInput {
  assetId: string;
  companyId?: number | null;
  title?: string | null;
  generatedBy?: string | null;
  report: MultiTechReport;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function saveReport(input: SaveReportInput): Promise<SavedReportRow> {
  const { report } = input;
  const res = await fetch(REPORTS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: input.assetId,
      companyId: input.companyId ?? null,
      title: input.title ?? null,
      generatedBy: input.generatedBy ?? null,
      technologySummary: toTechnologySummaryMap(report),
      overallSeverity: report.overallSeverity,
      faultDiagnoses: report.faultDiagnoses,
      recommendations: report.recommendations,
      technologiesWithData: report.technologiesWithData
    })
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to save report."));
  const body = await res.json();
  return body.report as SavedReportRow;
}

export async function fetchReports(params: {
  assetId?: string;
  companyId?: number | null;
  limit?: number;
} = {}): Promise<SavedReportRow[]> {
  const query = new URLSearchParams();
  if (params.assetId) query.set("asset_id", params.assetId);
  if (params.companyId != null) query.set("company_id", String(params.companyId));
  if (params.limit != null) query.set("limit", String(params.limit));

  const res = await fetch(`${REPORTS_PATH}?${query.toString()}`);
  if (!res.ok) throw new Error(await readError(res, "Failed to load reports."));
  const body = await res.json();
  return Array.isArray(body.reports) ? (body.reports as SavedReportRow[]) : [];
}

export async function fetchReport(id: string): Promise<SavedReportRow> {
  const res = await fetch(`${REPORTS_PATH}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await readError(res, "Failed to load report."));
  const body = await res.json();
  return body.report as SavedReportRow;
}

export async function deleteReport(id: string): Promise<void> {
  const res = await fetch(`${REPORTS_PATH}/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to delete report."));
}

/**
 * Turn a stored row back into the structure the live viewer renders, so one
 * component serves both a freshly computed assessment and a historical one.
 */
export function rehydrateReport(row: SavedReportRow): MultiTechReport {
  const technologies: TechnologyReport[] = fromTechnologySummaryMap(
    row.technology_summary
  );
  return {
    assetId: row.asset_id,
    technologies,
    technologiesWithData: Array.isArray(row.technologies_with_data)
      ? row.technologies_with_data
      : technologies.filter((t) => t.hasData).map((t) => t.technology),
    overallSeverity: row.overall_severity,
    faultDiagnoses: Array.isArray(row.fault_diagnoses) ? row.fault_diagnoses : [],
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : []
  };
}
