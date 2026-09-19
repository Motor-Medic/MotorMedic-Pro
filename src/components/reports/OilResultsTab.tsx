/**
 * OilResultsTab — Oil Analysis / Tribology Lab Snapshot (Tab 1).
 * Five cards: Header, Logistics, Fluid Chemistry, Contamination, Wear Debris,
 * Severity & Diagnoses.  Oil data fetched from oil_samples via fetchOilSamples();
 * absence != normal; viscosity always rendered with its reference temperature;
 * guidance labeled; standards cited only when verifiable.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Beaker, Droplet, Info, ShieldAlert } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { classifyFaultFamily } from "../../lib/diagnostics/faultFamily";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";
import { DEFAULT_ALARM_LIMITS, ISO_CLEANLINESS_TARGET } from "../../types/oilAnalysis";

export interface OilResultsTabProps {
  selectedAnalysis: SavedAnalysisResult | null;
  allAnalyses?: SavedAnalysisResult[];
  assetId?: string | null;
  /** Equipment-selection asset ID — present before any Load Report click. */
  equipmentAssetId?: string | null;
}

const card = "rounded-xl border border-slate-700 bg-slate-950/50 p-4";
const label = "text-[10px] font-bold uppercase tracking-wider text-slate-500";
const dash = <span className="text-slate-600">&mdash;</span>;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : iso;
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.round(ms / 86_400_000);
}

function isoCode(s: OilSample): string | null {
  if (s.iso4um == null || s.iso6um == null || s.iso14um == null) return null;
  return `${s.iso4um}/${s.iso6um}/${s.iso14um}`;
}

/** ISO 4406 rounding: ceil(log2(count_per_mL)) but never below 0. */
function computeIsoCode(countPerMl: number): number {
  if (countPerMl <= 0) return 0;
  return Math.ceil(Math.log2(countPerMl));
}

function waterUnit(sample: OilSample): string {
  if (sample.waterPpm != null) return "ppm";
  return "";
}

export default function OilResultsTab({
  selectedAnalysis,
  allAnalyses,
  assetId: assetIdProp,
  equipmentAssetId,
}: OilResultsTabProps) {
  const assetId = equipmentAssetId ?? assetIdProp ?? selectedAnalysis?.asset_id ?? (() => {
    if (!allAnalyses?.length) return null;
    const ids = [...new Set(allAnalyses.map((r) => r.asset_id).filter(Boolean))];
    return ids.length === 1 ? ids[0]! : null;
  })();

  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) { setSamples([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchOilSamples(assetId)
      .then((s) => { if (!cancelled) { setSamples(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [assetId]);

  const latest = useMemo(() => {
    if (samples.length === 0) return null;
    return samples.reduce((n, s) => {
      const sTime = new Date(s.sampleDate).getTime();
      const nTime = new Date(n.sampleDate).getTime();
      if (sTime > nTime) return s;
      if (sTime < nTime) return n;
      return s.id > n.id ? s : n;
    });
  }, [samples]);

  const reportDate = latest?.createdAt ?? latest?.updatedAt ?? null;
  const sampleDate = latest?.sampleDate ?? null;
  const lagDays = sampleDate && reportDate ? daysBetween(sampleDate, reportDate) : null;

  const hasTopOff = latest != null && "makeUpOilLiters" in latest;
  const topOffVal = latest && typeof (latest as Record<string, unknown>).makeUpOilLiters === "number"
    ? ((latest as Record<string, unknown>).makeUpOilLiters as number)
    : null;
  const topOffTrue = hasTopOff && topOffVal != null && topOffVal > 0;

  if (!assetId)
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <Droplet className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          Select an asset with oil analysis samples
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Open an oil report or select a location to view the lab snapshot.
        </p>
      </div>
    );

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-2 mb-1">
        <Droplet className="h-4 w-4 text-cyan-400 shrink-0" />
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Oil Analysis / Tribology Lab Snapshot
        </h4>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">
        wear limits are lab and OEM practice &mdash; no universal ISO severity
        class standard exists for oil analysis
      </p>

      {loading && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-400 italic">Loading oil samples&hellip;</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && samples.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400 italic">
            No oil samples on file for this asset. Capture a sample to populate
            the lab snapshot.
          </p>
        </div>
      )}

      {!loading && !error && latest && (
        <div className="space-y-4">
          {/* ===== LOGISTICS CARD ===== */}
          <div className={card}>
            <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">
              Logistics
            </h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className={label}>Sample date</span>
                <p className="text-slate-300 font-mono">{fmtDate(sampleDate!)}</p>
              </div>
              <div>
                <span className={label}>Report date</span>
                <p className="text-slate-300 font-mono">
                  {reportDate ? fmtDate(reportDate) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Sample-to-report lag</span>
                <p className="text-slate-300 font-mono">
                  {lagDays != null ? (
                    <span className={lagDays > 14 ? "text-amber-400" : ""}>
                      {lagDays} day{lagDays !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    dash
                  )}
                </p>
              </div>
              <div>
                <span className={label}>Oil age</span>
                <p className="text-slate-300 font-mono">
                  {latest.oilHours != null && latest.oilHours > 0
                    ? `${latest.oilHours.toLocaleString()} hrs`
                    : dash}
                </p>
              </div>
              <div>
                <span className={label}>Machine age</span>
                <p className="text-slate-300 font-mono">
                  {latest.operatingHours != null && latest.operatingHours > 0
                    ? `${latest.operatingHours.toLocaleString()} hrs`
                    : dash}
                </p>
              </div>
              <div>
                <span className={label}>Sampler ID</span>
                <p className="text-slate-300">
                  {"samplerId" in latest && (latest as Record<string, unknown>).samplerId
                    ? String((latest as Record<string, unknown>).samplerId)
                    : <span className="italic text-slate-500">not recorded</span>}
                </p>
              </div>
            </div>

            {topOffTrue && (
              <div className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 font-semibold">
                  DILUTION WARNING: make-up fluid added prior to sample &mdash;
                  wear concentrations and chemistry are diluted
                </p>
              </div>
            )}

            {!("makeUpOilLiters" in (latest ?? {})) && (
              <p className="text-[10px] text-slate-500 mt-2 italic">
                top-off / make-up oil events not recorded &mdash; dilution
                cannot be ruled out
              </p>
            )}
          </div>

          {/* ===== FLUID CHEMISTRY CARD ===== */}
          <div className={card}>
            <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">
              Fluid Chemistry
            </h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className={label}>Viscosity @ 40 C</span>
                <p className="text-slate-300 font-mono">
                  {latest.viscosity40C != null
                    ? `${latest.viscosity40C.toFixed(1)} mm²/s (cSt)`
                    : dash}
                </p>
              </div>
              <div>
                <span className={label}>Viscosity @ 100 C</span>
                <p className="text-slate-300 font-mono">
                  {latest.viscosity100C != null
                    ? `${latest.viscosity100C.toFixed(1)} mm²/s (cSt)`
                    : dash}
                </p>
              </div>
              <div>
                <span className={label}>Viscosity index</span>
                <p className="text-slate-300 font-mono">
                  {latest.viscosityIndex != null ? latest.viscosityIndex.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>TAN (mg KOH/g)</span>
                <p className="text-slate-300 font-mono">
                  {latest.acidNumber != null ? latest.acidNumber.toFixed(2) : dash}
                </p>
              </div>
              <div>
                <span className={label}>TBN (mg KOH/g)</span>
                <p className="text-slate-300 font-mono">
                  {latest.tbn != null ? latest.tbn.toFixed(2) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Oxidation (Abs/cm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.oxidation != null ? latest.oxidation.toFixed(3) : dash}
                </p>
              </div>
            </div>
          </div>

          {/* ===== CONTAMINATION CARD ===== */}
          <div className={card}>
            <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">
              Contamination
            </h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className={label}>ISO 4406 code</span>
                <p className="text-slate-300 font-mono">
                  {isoCode(latest) ?? dash}
                </p>
              </div>
              <div>
                <span className={label}>Water</span>
                <p className="text-slate-300 font-mono">
                  {latest.waterPpm != null
                    ? `${latest.waterPpm} ${waterUnit(latest)}`
                    : dash}
                </p>
              </div>
            </div>

            {/* ISO code audit when raw counts stored */}
            {latest.particles4um != null &&
              latest.particles6um != null &&
              latest.particles14um != null && (
                <div className="mt-2 text-[10px] text-slate-500">
                  {(() => {
                    const stored = isoCode(latest);
                    const c4 = latest.particles4um;
                    const c6 = latest.particles6um;
                    const c14 = latest.particles14um;
                    const codeDirect  = `${computeIsoCode(c4)}/${computeIsoCode(c6)}/${computeIsoCode(c14)}`;
                    const codeTimes100 = `${computeIsoCode(c4 * 100)}/${computeIsoCode(c6 * 100)}/${computeIsoCode(c14 * 100)}`;
                    const codeDiv100  = `${computeIsoCode(c4 / 100)}/${computeIsoCode(c6 / 100)}/${computeIsoCode(c14 / 100)}`;
                    if (stored && codeDirect === stored) {
                      return <>ISO 4406:1999 per-mL basis: code(c) = {codeDirect} &mdash; matches stored {stored}; per-100-mL equivalent: code(c&times;100) = {codeTimes100}</>;
                    }
                    if (stored && codeTimes100 === stored) {
                      return <>per-100-mL basis (ISO 4406:1987 style) from per-mL counts: code(c&times;100) = {codeTimes100} &mdash; matches stored {stored}; ISO 4406:1999 per-mL equivalent: code(c) = {codeDirect}</>;
                    }
                    if (stored && codeDiv100 === stored) {
                      return <>ISO 4406:1999 per-mL basis from per-100-mL counts: code(c/100) = {codeDiv100} &mdash; matches stored {stored}; per-100-mL equivalent: code(c) = {codeDirect}</>;
                    }
                    return <>code(c) = {codeDirect}; code(c&times;100) = {codeTimes100}; code(c/100) = {codeDiv100} &mdash; vs stored {stored ?? "N/A"} (mismatch)</>;
                  })()}
                </div>
              )}

            {latest.particles4um == null &&
              latest.particles6um == null &&
              latest.particles14um == null && (
                <p className="text-[10px] text-slate-500 mt-2 italic">
                  particle counts not recorded &mdash; code as reported by lab
                </p>
              )}
          </div>

          {/* ===== WEAR DEBRIS CARD ===== */}
          <div className={card}>
            <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">
              Wear Debris
            </h5>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className={label}>Fe (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.iron != null ? latest.iron.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Cu (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.copper != null ? latest.copper.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Pb (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.lead != null ? latest.lead.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Cr (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.chromium != null ? latest.chromium.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Al (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.aluminum != null ? latest.aluminum.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>Si (ppm)</span>
                <p className="text-slate-300 font-mono">
                  {latest.silicon != null ? latest.silicon.toFixed(0) : dash}
                </p>
              </div>
              <div>
                <span className={label}>PQ index</span>
                <p className="text-slate-300 font-mono">
                  {"pqIndex" in latest &&
                  (latest as Record<string, unknown>).pqIndex != null
                    ? (
                        (latest as Record<string, unknown>).pqIndex as number
                      ).toFixed(0)
                    : dash}
                </p>
              </div>
            </div>
          </div>

          {/* ===== SEVERITY & DIAGNOSES CARD ===== */}
          <div className={card}>
            <h5 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">
              Severity &amp; Diagnoses
            </h5>

            <div className="flex flex-wrap gap-3 text-xs mb-2">
              <div>
                <span className={label}>Lab-flagged severity</span>
                <p className="text-slate-300">
                  {latest.severity != null ? latest.severity : <span className="italic text-slate-500">not recorded</span>}
                </p>
              </div>
              <div>
                <span className={label}>Internal asset baseline</span>
                <p className="text-slate-300">
                  {latest.iso4um != null &&
                  latest.iso4um > ISO_CLEANLINESS_TARGET[0]
                    ? "above target"
                    : latest.iso4um != null
                      ? "within target"
                      : dash}
                </p>
              </div>
            </div>

            {latest.severity == null && (
              <p className="text-[10px] text-slate-500 mb-2 italic">
                lab-flagged severity not recorded &mdash; baseline comparison only
              </p>
            )}

            <p className="text-[10px] text-slate-500 mb-3">
              no universal ISO severity class standard exists for oil analysis
            </p>

            {/* Fault list */}
            {selectedAnalysis?.fault_list &&
              selectedAnalysis.fault_list.length > 0 && (
                <div className="mb-2">
                  <span className={label}>Faults</span>
                  <ul className="mt-1 space-y-1">
                    {selectedAnalysis.fault_list.map((f, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        {f.title}
                        {f.confidencePercent != null && (
                          <span className="text-slate-500 ml-1">
                            ({f.confidencePercent.toFixed(0)}%)
                          </span>
                        )}
                        <span className="text-slate-600 ml-1">
                          [{classifyFaultFamily(f.title)}]
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Recommendations */}
            {selectedAnalysis?.recommendations &&
              selectedAnalysis.recommendations.length > 0 && (
                <div>
                  <span className={label}>Recommendations</span>
                  <ul className="mt-1 space-y-1">
                    {selectedAnalysis.recommendations.map((r, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        {r.toLowerCase().startsWith("oil:") ? r : `Unattributed (stored consensus): ${r}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {!selectedAnalysis?.fault_list?.length &&
              !selectedAnalysis?.recommendations?.length && (
                <p className="text-xs text-slate-500 italic">
                  no diagnoses or recommendations stored for this record
                </p>
              )}
          </div>

          {/* ===== Gate line ===== */}
          <p className="text-[10px] text-slate-600 italic text-center">
            not a vibration spectrum for oil
          </p>
        </div>
      )}

      {/* ===== Source ===== */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 mt-3">
        <p className="text-[10px] text-slate-500">
          <Info className="h-3 w-3 inline text-slate-400 mr-1" />
          oil analysis lab snapshot &mdash; fluid chemistry, contamination, and
          wear debris assessed separately
        </p>
      </div>
    </div>
  );
}
