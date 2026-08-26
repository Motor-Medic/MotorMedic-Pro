/**
 * Client-side report exports.
 *
 * Both exporters run entirely in the browser against the saved analysis record,
 * so they produce a real file without needing a reporting backend. Every value
 * written comes from the record; nothing is templated in.
 */
import { jsPDF } from "jspdf";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SavedAnalysisResult } from "./analysisPersistence";

export interface ReportExportContext {
  assetLabel: string;
  component?: string | null;
  technology: string;
  analysis: SavedAnalysisResult | null;
  /** Records backing the CSV; defaults to just `analysis`. */
  records?: SavedAnalysisResult[];
  generatedAt?: Date;
}

const MARGIN = 14;
const LINE = 5.2;

function slug(value: string): string {
  return (
    value
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "report"
  );
}

function stamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function text(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

/** Cursor that wraps text and breaks pages as content grows. */
function makeCursor(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  return {
    get y() {
      return y;
    },
    width,
    pageWidth,
    gap(amount = LINE) {
      y += amount;
    },
    write(value: string, opts: { size?: number; bold?: boolean; indent?: number } = {}) {
      const { size = 10, bold = false, indent = 0 } = opts;
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(value, width - indent) as string[];
      for (const line of lines) {
        ensure(LINE);
        doc.text(line, MARGIN + indent, y);
        y += LINE;
      }
    },
    heading(value: string) {
      y += 3;
      ensure(LINE * 2);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(value.toUpperCase(), MARGIN, y);
      y += 2;
      doc.setDrawColor(180);
      doc.line(MARGIN, y, MARGIN + width, y);
      y += LINE;
    },
    pair(label: string, value: string) {
      ensure(LINE);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(label, MARGIN, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(value, width - 42) as string[];
      doc.text(lines[0] ?? "—", MARGIN + 42, y);
      y += LINE;
      for (const line of lines.slice(1)) {
        ensure(LINE);
        doc.text(line, MARGIN + 42, y);
        y += LINE;
      }
    }
  };
}

export function reportPdfFilename(ctx: ReportExportContext): string {
  return `${slug(ctx.assetLabel)}-${slug(ctx.technology)}-${stamp(
    ctx.generatedAt ?? new Date()
  )}.pdf`;
}

/** Builds the document without saving it, so the layout can be tested. */
export function buildReportPdf(ctx: ReportExportContext): jsPDF {
  const { analysis } = ctx;
  if (!analysis) throw new Error("No saved analysis to export");

  const generatedAt = ctx.generatedAt ?? new Date();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc);

  c.write("Condition Monitoring Analysis Report", { size: 16, bold: true });
  c.write(
    `${ctx.technology} · generated ${generatedAt.toLocaleString()}`,
    { size: 9 }
  );
  c.gap(2);

  c.heading("Asset");
  c.pair("Asset", text(ctx.assetLabel));
  c.pair("Component", text(ctx.component));
  c.pair("Analysed", text(analysis.timestamp && new Date(analysis.timestamp).toLocaleString()));
  c.pair("Record ID", text(analysis.id));

  c.heading("Finding");
  c.pair("Primary fault", text(analysis.primary_fault));
  c.pair("Severity", text(analysis.severity));
  c.pair(
    "Health score",
    analysis.health_score == null ? "—" : `${analysis.health_score}`
  );
  if (analysis.summary) {
    c.gap(1);
    c.write(analysis.summary, { size: 9 });
  }

  if (analysis.fault_list?.length) {
    c.heading("Identified faults");
    analysis.fault_list.forEach((fault, i) => {
      const confidence = fault.confidencePercent ?? fault.confidence;
      const bits = [
        fault.severity ? `severity ${fault.severity}` : null,
        confidence == null ? null : `confidence ${confidence}%`,
        fault.frequencyHz != null
          ? `${fault.frequencyHz} Hz`
          : fault.frequency != null
            ? String(fault.frequency)
            : null
      ].filter(Boolean);
      c.write(
        `${i + 1}. ${fault.title}${bits.length ? ` (${bits.join(", ")})` : ""}`,
        { size: 9.5 }
      );
      const detail = fault.detail || fault.description;
      if (detail) c.write(detail, { size: 8.5, indent: 5 });
    });
  }

  if (analysis.recommendations?.length) {
    c.heading("Recommendations");
    analysis.recommendations.forEach((rec, i) => {
      c.write(`${i + 1}. ${rec}`, { size: 9.5 });
    });
  }

  const financial = Object.entries(analysis.financial_impact ?? {}).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v)
  );
  if (financial.length) {
    c.heading("Financial impact");
    for (const [key, value] of financial) {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
      c.pair(label, `$${Number(value).toLocaleString()}`);
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(
      `${ctx.assetLabel} · page ${p} of ${pages}`,
      MARGIN,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  return doc;
}

/**
 * Writes a PDF of the saved analysis and hands it to the browser's download.
 * Returns the filename so the caller can report exactly what was saved.
 */
export function exportReportPdf(ctx: ReportExportContext): string {
  const doc = buildReportPdf(ctx);
  const filename = reportPdfFilename(ctx);
  doc.save(filename);
  return filename;
}

const CSV_COLUMNS: { key: keyof SavedAnalysisResult; label: string }[] = [
  { key: "timestamp", label: "Timestamp" },
  { key: "asset_id", label: "Asset ID" },
  { key: "component", label: "Component" },
  { key: "analysis_type", label: "Analysis Type" },
  { key: "severity", label: "Severity" },
  { key: "health_score", label: "Health Score" },
  { key: "primary_fault", label: "Primary Fault" },
  { key: "phase_a_temp", label: "Phase A Temp" },
  { key: "phase_b_temp", label: "Phase B Temp" },
  { key: "phase_c_temp", label: "Phase C Temp" },
  { key: "measured_amps", label: "Measured Amps" },
  { key: "rated_amps", label: "Rated Amps" },
  { key: "de_bearing_temp", label: "DE Bearing Temp" },
  { key: "ode_bearing_temp", label: "ODE Bearing Temp" },
  { key: "waveform_peak_to_peak", label: "Waveform Peak-to-Peak" },
  { key: "waveform_crest_factor", label: "Waveform Crest Factor" },
  { key: "waveform_impact_count", label: "Waveform Impact Count" },
  { key: "envelope_peak_amplitude", label: "Envelope Peak Amplitude" },
  { key: "envelope_dominant_frequency", label: "Envelope Dominant Freq" },
  { key: "envelope_energy", label: "Envelope Energy" }
];

function measurementRows(ctx: ReportExportContext) {
  const records = ctx.records?.length
    ? ctx.records
    : ctx.analysis
      ? [ctx.analysis]
      : [];
  if (records.length === 0) throw new Error("No saved analysis to export");

  return records.map((record) => {
    const row: Record<string, string | number> = {};
    for (const col of CSV_COLUMNS) {
      const value = record[col.key];
      row[col.label] = value == null ? "" : (value as string | number);
    }
    return row;
  });
}

function download(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

/** Writes the measurement columns of each saved record to a downloaded CSV. */
export function exportReportCsv(ctx: ReportExportContext): string {
  const generatedAt = ctx.generatedAt ?? new Date();
  const csv = Papa.unparse(measurementRows(ctx), {
    columns: CSV_COLUMNS.map((c) => c.label)
  });

  // BOM keeps Excel from mangling non-ASCII asset names.
  return download(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
    `${slug(ctx.assetLabel)}-${slug(ctx.technology)}-${stamp(generatedAt)}.csv`
  );
}

/** Same measurement columns as the CSV, written as a real .xlsx workbook. */
export function exportReportXlsx(ctx: ReportExportContext): string {
  const generatedAt = ctx.generatedAt ?? new Date();
  const sheet = XLSX.utils.json_to_sheet(measurementRows(ctx), {
    header: CSV_COLUMNS.map((c) => c.label)
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Measurements");

  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" });
  return download(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }),
    `${slug(ctx.assetLabel)}-${slug(ctx.technology)}-${stamp(generatedAt)}.xlsx`
  );
}
