/**
 * McaResultsTab — MCA / Motor Circuit Analysis tab 1.
 * Phase balance assessment per NEMA MG-1 practice; IEEE 43 for groundwall;
 * absence != normal; guidance labeled; stored values audited.
 */
import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileText, Gauge, Zap } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { SEVERITY_LABEL, SEVERITY_STYLE } from "./reportPresentation";
import { classifyFaultFamily, FAULT_FAMILY_LABEL } from "../../lib/diagnostics/faultFamily";
import {
  evaluateMcaSeverity,
  MCA_IMBALANCE_SOURCE,
} from "../../lib/maintenance/prescriptiveDictionary";
import {
  mcaPeakBlob,
  extractMcaWindingFromSaved,
  extractMcaGroundwallFromSaved,
} from "../../lib/mca/mcaPersistence";
import { percentUnbalance } from "../../lib/mca/windingBalanceCalculator";

export interface McaResultsTabProps {
  selectedAnalysis: SavedAnalysisResult;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const card = "rounded-xl border border-white/10 bg-slate-950/40 p-4";
const cell = "rounded-lg border border-white/10 bg-slate-900/50 p-2.5";

function Field({
  label,
  value,
  unit,
}: {
  label: string;
  value: unknown;
  unit?: string;
}) {
  return (
    <div className={cell}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-sm font-mono mt-0.5 ${
          value != null ? "text-white" : "text-slate-500 italic"
        }`}
      >
        {value != null
          ? `${value}${unit ? ` ${unit}` : ""}`
          : "not recorded"}
      </p>
    </div>
  );
}

function sevTone(clazz: string): string {
  if (clazz.includes("Class 1"))
    return "border-red-500/50 text-red-400 bg-red-500/10";
  if (clazz.includes("Class 2"))
    return "border-amber-500/30 text-amber-400 bg-amber-500/10";
  if (clazz.includes("Class 3"))
    return "border-sky-500/30 text-sky-400 bg-sky-500/10";
  return "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";
}

export default function McaResultsTab({ selectedAnalysis }: McaResultsTabProps) {
  const blob = useMemo(() => mcaPeakBlob(selectedAnalysis), [selectedAnalysis]);
  const winding = useMemo(
    () => extractMcaWindingFromSaved(selectedAnalysis),
    [selectedAnalysis],
  );
  const groundwall = useMemo(
    () => extractMcaGroundwallFromSaved(selectedAnalysis),
    [selectedAnalysis],
  );

  // --- Stored imbalance % (primary) ---
  const storedImbalance = useMemo(() => {
    const v =
      num(blob.imbalance_pct ?? blob.imbalancePct ?? blob.max_unbalance_rl ?? blob.maxUnbalanceRl);
    return v;
  }, [blob]);

  // --- Computed imbalance from phase triplets ---
  const computedImbalance = useMemo(() => {
    if (!winding.fromTelemetry) return null;
    const vals = [winding.phaseR, winding.phaseL, winding.phaseZ];
    const maxUb = Math.max(
      percentUnbalance(winding.phaseR),
      percentUnbalance(winding.phaseL),
      percentUnbalance(winding.phaseZ),
    );
    return maxUb;
  }, [winding]);

  // --- Audit verdict ---
  const audit = useMemo(() => {
    if (storedImbalance == null && computedImbalance == null)
      return "imbalance unavailable - per-phase values not recorded";
    if (storedImbalance == null)
      return `derived from phase values (${computedImbalance?.toFixed(1)}%)`;
    if (computedImbalance == null)
      return "stored value only - computed unavailable";
    return Math.abs(storedImbalance - computedImbalance) < 0.05
      ? "stored matches computed"
      : `stored (${storedImbalance.toFixed(1)}%) vs computed (${computedImbalance.toFixed(1)}%) - stored uses different definition`;
  }, [storedImbalance, computedImbalance]);

  // --- Bracket classification ---
  const bracket = useMemo(
    () =>
      storedImbalance != null
        ? evaluateMcaSeverity(storedImbalance)
        : computedImbalance != null
          ? evaluateMcaSeverity(computedImbalance)
          : null,
    [storedImbalance, computedImbalance],
  );

  // --- PI interpretation ---
  const piInterpretation = useMemo(() => {
    const pi = groundwall.reportPi;
    if (pi == null || pi <= 0) return null;
    if (pi >= 2.0) return "Good - insulation in acceptable condition";
    if (pi >= 1.5) return "Marginal - insulation may be deteriorating";
    return "Poor - insulation may be contaminated or degraded";
  }, [groundwall.reportPi]);

  // --- Faults & recs ---
  const faults = useMemo(
    () =>
      (Array.isArray(selectedAnalysis.fault_list)
        ? selectedAnalysis.fault_list
        : []
      ).map((f) => {
        const o = f as unknown as Record<string, unknown>;
        const t = String(o.fault ?? f.title ?? "Unknown");
        return {
          title: t,
          sev: String(o.severity ?? f.severity ?? "MEDIUM"),
          conf: Number(o.confidence ?? f.confidence ?? 0),
          family: classifyFaultFamily(t),
        };
      }),
    [selectedAnalysis.fault_list],
  );

  const recs = useMemo(
    () =>
      (selectedAnalysis.recommendations ?? []).map((r) => {
        const family = classifyFaultFamily(r);
        return {
          text: r,
          label: family === "unknown" ? "Unattributed (stored consensus)" : "MCA",
        };
      }),
    [selectedAnalysis.recommendations],
  );

  // --- Gate: not ultrasound / vibration / thermography ---
  if (
    !selectedAnalysis ||
    (selectedAnalysis.analysis_type ?? "vibration") !== "mca"
  )
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <FileText className="h-8 w-8 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">
          No MCA run selected
        </p>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          Choose from run history — the MCA tile requires a motor circuit
          analysis record.
        </p>
      </div>
    );

  // --- Severity reconciliation ---
  const storedSeverity = (() => {
    const s = (selectedAnalysis.severity ?? "").toUpperCase();
    if (s.includes("CRITICAL") || s.includes("HIGH")) return "CRITICAL";
    if (s.includes("MODERATE") || s.includes("MEDIUM")) return "ANOMALY";
    if (s.includes("MINOR") || s.includes("LOW")) return "MINOR";
    return "NO_DATA";
  })();
  const bracketSeverity = bracket == null ? "NO_DATA" : bracket.clazz.includes("Class 1") ? "CRITICAL" : bracket.clazz.includes("Class 2") ? "ANOMALY" : bracket.clazz.includes("Class 3") ? "MINOR" : "NORMAL";
  const sevRank = (s: string) => s === "CRITICAL" ? 4 : s === "ANOMALY" ? 3 : s === "MINOR" ? 2 : s === "NORMAL" ? 1 : 0;
  const governing = sevRank(storedSeverity) >= sevRank(bracketSeverity) ? storedSeverity : bracketSeverity;
  const differs = storedSeverity !== bracketSeverity && storedSeverity !== "NO_DATA" && bracketSeverity !== "NO_DATA";

  return (
    <div className="space-y-4">
      {/* ===== HEADER ===== */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400 shrink-0" />
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                Motor Circuit Analysis / Phase Balance Assessment
              </h4>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {selectedAnalysis.component || "\u2014"} ·{" "}
              {selectedAnalysis.asset_id || "\u2014"}
            </p>
          </div>
          <span
            className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shrink-0 ${
              SEVERITY_STYLE[governing as keyof typeof SEVERITY_STYLE]
            }`}
          >
            {SEVERITY_LABEL[governing as keyof typeof SEVERITY_LABEL]}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          {MCA_IMBALANCE_SOURCE}
        </p>
      </div>

      {/* ===== METADATA CARD ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-4 w-4 text-sky-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Capture Metadata
          </h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field
            label="Test Voltage"
            value={groundwall.testVoltageV ?? num(blob.testVoltageV ?? blob.test_voltage_v)}
            unit="V"
          />
          <Field
            label="Winding Temperature"
            value={winding.windingTempC ?? num(blob.windingTempC ?? blob.winding_temp_c)}
            unit="°C"
          />
          <Field
            label="Lead Compensation"
            value={num(blob.lead_compensation ?? blob.leadCompensation)}
          />
        </div>
      </div>

      {/* ===== READINGS CARD ===== */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-4 w-4 text-amber-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Readings
          </h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className={cell}>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              Imbalance
            </p>
            <p
              className={`text-sm font-mono font-bold mt-0.5 ${
                storedImbalance != null
                  ? storedImbalance > 4
                    ? "text-red-400"
                    : storedImbalance > 2
                      ? "text-amber-400"
                      : "text-white"
                  : "text-slate-500 italic"
              }`}
            >
              {storedImbalance != null
                ? `${storedImbalance.toFixed(1)}%`
                : "not recorded"}
            </p>
          </div>
          <Field
            label="Insulation Resistance"
            value={groundwall.ir1mMOmega > 0 ? groundwall.ir1mMOmega : null}
            unit="M\u03A9"
          />
          <Field
            label="Polarization Index"
            value={groundwall.reportPi ?? null}
          />
          <Field
            label="Max Phase Resistance"
            value={num(blob.max_phase_r ?? blob.maxPhaseR)}
            unit="\u03A9"
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          <span className="font-semibold">Imbalance audit: </span>
          {audit}
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          formula: (max|X&#772;&#8345; - X&#772;| / X&#772;) &times; 100
        </p>
        {groundwall.reportPi != null && groundwall.reportPi > 0 && (
          <p className="text-[11px] text-slate-500 mt-2">
            <span className="font-semibold">PI interpretation: </span>
            {piInterpretation}{" "}
            <span className="italic text-slate-600">
              &mdash; IEEE 43 reference bands - test-method guidance, not a
              severity class
            </span>
          </p>
        )}
      </div>

      {/* ===== SEVERITY CARD ===== */}
      <div
        className={`rounded-xl border p-4 ${
          bracket ? sevTone(bracket.clazz) : "border-slate-600 bg-slate-800/30"
        }`}
      >
        <div className="flex items-start gap-3">
          <Zap
            className={`h-5 w-5 shrink-0 mt-0.5 ${
              bracket?.clazz.includes("Class 1")
                ? "text-red-400"
                : "text-amber-400"
            }`}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1">
              MCA Severity Evaluation
            </p>
            {storedImbalance == null && computedImbalance == null ? (
              <p className="text-xs text-slate-400 italic">
                imbalance unavailable - per-phase values not recorded; no
                severity class claimed.
              </p>
            ) : bracket ? (
              <>
                <p className="text-xs text-slate-300">
                  {(storedImbalance ?? computedImbalance)?.toFixed(1)}%:{" "}
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${sevTone(bracket.clazz)}`}
                  >
                    {bracket.clazz}
                  </span>{" "}
                  <span className="text-slate-500">· {bracket.action}</span>
                </p>
                {differs && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    record severity (fault-driven): <span className={`font-bold ${SEVERITY_STYLE[storedSeverity as keyof typeof SEVERITY_STYLE]}`}>{SEVERITY_LABEL[storedSeverity as keyof typeof SEVERITY_LABEL]}</span> — governs header badge · imbalance class: <span className={`font-bold ${sevTone(bracket.clazz)}`}>{bracket.clazz}</span>
                  </p>
                )}
              </>
            ) : null}
            <p className="text-[10px] text-slate-500 mt-1">
              Source: {MCA_IMBALANCE_SOURCE}
            </p>
          </div>
        </div>
      </div>

      {/* ===== FAULT DIAGNOSES ===== */}
      {faults.length > 0 && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              Fault Diagnoses
            </h4>
          </div>
          <ul className="space-y-1.5">
            {faults.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-slate-300"
              >
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    SEVERITY_STYLE[f.sev as keyof typeof SEVERITY_STYLE]
                  }`}
                >
                  {SEVERITY_LABEL[f.sev as keyof typeof SEVERITY_LABEL]}
                </span>
                <span className="font-semibold text-white">{f.title}</span>
                <span className="text-slate-500">
                  ({f.conf}% ·{" "}
                  {FAULT_FAMILY_LABEL[
                    f.family as keyof typeof FAULT_FAMILY_LABEL
                  ]})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== RECOMMENDATIONS ===== */}
      {recs.length > 0 && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              Recommendations
            </h4>
          </div>
          <ul className="space-y-1.5">
            {recs.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-slate-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-slate-500 shrink-0">{r.label}:</span>
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
