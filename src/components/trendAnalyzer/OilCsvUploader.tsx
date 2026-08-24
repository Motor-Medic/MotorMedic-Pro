/**
 * CSV lab report uploader — parses wear-metal rows and POSTs to /api/oil-analysis.
 */

import { useRef, useState, type ChangeEvent } from "react";
import Papa from "papaparse";
import type { OilSampleCSVRow } from "../../types/oilAnalysis";

/** Keep this constant local — do not import oilAnalysisPersistence (pulls pg into the browser). */
const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";

export interface OilCsvUploaderProps {
  assetId: string;
  onUploadComplete: () => void;
}

function parseCsvRow(raw: Record<string, string>): OilSampleCSVRow | null {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const val = raw[key]?.trim();
      if (val) return val;
    }
    return "";
  };

  const sampleDate = pick("sampleDate", "sample_date", "date", "Sample Date");
  const operatingHoursRaw = pick(
    "operatingHours",
    "operating_hours",
    "hours",
    "Operating Hours"
  );
  const ironRaw = pick("iron", "Iron", "Fe");
  const copperRaw = pick("copper", "Copper", "Cu");
  const chromiumRaw = pick("chromium", "Chromium", "Cr");
  const leadRaw = pick("lead", "Lead", "Pb");
  const aluminumRaw = pick("aluminum", "Aluminum", "Al");
  const siliconRaw = pick("silicon", "Silicon", "Si");
  const viscosity40Raw = pick(
    "viscosity40C",
    "viscosity_40c",
    "visc40",
    "Viscosity40",
    "Viscosity @40C"
  );
  const viscosity100Raw = pick(
    "viscosity100C",
    "viscosity_100c",
    "visc100",
    "Viscosity100"
  );
  const acidRaw = pick(
    "acidNumber",
    "acid_number",
    "tan",
    "TAN",
    "Acid Number"
  );

  if (!sampleDate || !operatingHoursRaw) return null;

  const operatingHours = Number.parseInt(operatingHoursRaw.replace(/,/g, ""), 10);
  if (!Number.isFinite(operatingHours)) return null;

  const iron = Number.parseFloat(ironRaw);
  const copper = Number.parseFloat(copperRaw);
  const chromium = Number.parseFloat(chromiumRaw);
  const lead = Number.parseFloat(leadRaw);
  const aluminum = Number.parseFloat(aluminumRaw);
  const silicon = Number.parseFloat(siliconRaw);

  if (
    ![iron, copper, chromium, lead, aluminum, silicon].every((n) =>
      Number.isFinite(n)
    )
  ) {
    return null;
  }

  const viscosity40C = viscosity40Raw
    ? Number.parseFloat(viscosity40Raw)
    : undefined;
  const viscosity100C = viscosity100Raw
    ? Number.parseFloat(viscosity100Raw)
    : undefined;
  const acidNumber = acidRaw ? Number.parseFloat(acidRaw) : undefined;

  return {
    sampleDate,
    operatingHours,
    iron,
    copper,
    chromium,
    lead,
    aluminum,
    silicon,
    ...(Number.isFinite(viscosity40C) ? { viscosity40C } : {}),
    ...(Number.isFinite(viscosity100C) ? { viscosity100C } : {}),
    ...(Number.isFinite(acidNumber) ? { acidNumber } : {})
  };
}

function parseCsvText(text: string): OilSampleCSVRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  });

  if (parsed.data.length > 0 && parsed.meta.fields?.length) {
    return parsed.data
      .map((row) => parseCsvRow(row))
      .filter((row): row is OilSampleCSVRow => row != null);
  }

  // Fallback: headerless comma-separated rows
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  const dataLines = lines.slice(1);
  const rows: OilSampleCSVRow[] = [];

  for (const line of dataLines) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 8) continue;
    const [
      sampleDate,
      operatingHours,
      iron,
      copper,
      chromium,
      lead,
      aluminum,
      silicon
    ] = cols;
    const hours = Number.parseInt(operatingHours, 10);
    if (!sampleDate || !Number.isFinite(hours)) continue;
    const metals = [iron, copper, chromium, lead, aluminum, silicon].map(
      Number.parseFloat
    );
    if (!metals.every(Number.isFinite)) continue;
    rows.push({
      sampleDate,
      operatingHours: hours,
      iron: metals[0],
      copper: metals[1],
      chromium: metals[2],
      lead: metals[3],
      aluminum: metals[4],
      silicon: metals[5]
    });
  }

  return rows;
}

async function ensureOilAnalysisRecord(assetId: string): Promise<void> {
  const res = await fetch(
    `${OIL_ANALYSIS_API_PATH}?assetId=${encodeURIComponent(assetId)}`
  );
  if (!res.ok) {
    throw new Error("Failed to initialize oil analysis record for this asset.");
  }
}

export function OilCsvUploader({
  assetId,
  onUploadComplete
}: OilCsvUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assetId) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const rows = parseCsvText(text);

      if (rows.length === 0) {
        setError("No valid rows found in CSV.");
        return;
      }

      await ensureOilAnalysisRecord(assetId);

      let uploadedCount = 0;
      let failedCount = 0;

      for (const row of rows) {
        const res = await fetch(OIL_ANALYSIS_API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            sampleDate: row.sampleDate,
            operatingHours: row.operatingHours,
            iron: row.iron,
            copper: row.copper,
            chromium: row.chromium,
            lead: row.lead,
            aluminum: row.aluminum,
            silicon: row.silicon,
            ...(row.viscosity40C != null
              ? { viscosity40C: row.viscosity40C }
              : {}),
            ...(row.viscosity100C != null
              ? { viscosity100C: row.viscosity100C }
              : {}),
            ...(row.acidNumber != null ? { acidNumber: row.acidNumber } : {})
          })
        });

        if (res.ok) {
          uploadedCount++;
        } else {
          failedCount++;
        }
      }

      if (uploadedCount > 0) {
        setSuccess(
          `Successfully uploaded ${uploadedCount} sample${uploadedCount === 1 ? "" : "s"}${
            failedCount > 0 ? ` (${failedCount} failed)` : ""
          }.`
        );
        onUploadComplete();
      } else {
        setError("Upload failed — no samples were saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="border border-slate-700 rounded-lg p-6 bg-slate-800/50">
      <h3 className="text-lg font-semibold mb-2 text-white">
        Upload Lab Report (CSV)
      </h3>
      <p className="text-sm text-slate-400 mb-4">
        Format:{" "}
        <code className="bg-slate-900 px-1 rounded text-cyan-300">
          sampleDate, operatingHours, iron, copper, chromium, lead, aluminum,
          silicon[, viscosity40C, acidNumber]
        </code>
      </p>

      <label className="block">
        <span className="sr-only">Choose CSV file</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void handleFileUpload(e)}
          disabled={loading || !assetId}
          className="block w-full text-sm text-slate-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-cyan-600 file:text-white
            hover:file:bg-cyan-500
            disabled:opacity-50 cursor-pointer"
        />
      </label>

      {!assetId && (
        <p className="mt-2 text-sm text-amber-400">
          Select an asset before uploading.
        </p>
      )}
      {loading && (
        <p className="mt-2 text-sm text-cyan-400">Processing CSV…</p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-2 text-sm text-green-400">{success}</p>}
    </div>
  );
}

export default OilCsvUploader;
