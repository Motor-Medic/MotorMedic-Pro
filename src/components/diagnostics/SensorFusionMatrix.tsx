/**
 * Multi-technology sensor fusion matrix.
 *
 * One row per condition-monitoring technology. Technologies with no saved
 * record render greyed out with no percentage at all — a blank is honest, a
 * zero would imply we measured and found nothing.
 */

import { CheckCircle2, CircleDashed, HelpCircle } from "lucide-react";
import {
  FAULT_FAMILY_LABEL,
  type FaultFamily
} from "../../lib/diagnostics/faultFamily";
import {
  THERMOGRAPHY_DELTA_T_BANDS_C,
  ULTRASOUND_DB_BANDS,
  type FusionResult,
  type TechnologyEvidence
} from "../../lib/diagnostics/sensorFusion";

export interface SensorFusionMatrixProps {
  fusion: FusionResult;
  diagnosisLabel: string;
}

function scoreStyles(score: number): string {
  if (score >= 75) return "text-green-400 border-green-500/40 bg-green-500/10";
  if (score >= 50) return "text-yellow-300 border-yellow-500/40 bg-yellow-500/10";
  if (score > 0) return "text-orange-300 border-orange-500/40 bg-orange-500/10";
  return "text-slate-400 border-slate-600 bg-slate-700/40";
}

function formatRecordedAt(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function renderEvidenceRow(row: TechnologyEvidence) {
  const unavailable = row.score == null;

  return (
    <tr
      key={row.technology}
      className={`border-b border-slate-800 ${unavailable ? "opacity-60" : "hover:bg-slate-800/40"}`}
    >
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          {unavailable ? (
            <CircleDashed className="h-4 w-4 text-slate-600 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-slate-500 shrink-0" />
          )}
          <span
            className={`font-semibold ${unavailable ? "text-slate-500" : "text-white"}`}
          >
            {row.label}
          </span>
        </div>
      </td>

      <td className="px-4 py-3 align-top whitespace-nowrap">
        {row.score == null ? (
          <span className="text-xs text-slate-600">—</span>
        ) : (
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreStyles(row.score)}`}
          >
            {row.score}%
          </span>
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <p className={unavailable ? "text-slate-500" : "text-slate-300"}>
          {row.reason}
        </p>
        {row.detail.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {row.detail.map((d) => (
              <li
                key={d}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400"
              >
                {d}
              </li>
            ))}
          </ul>
        )}
      </td>

      <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-slate-500">
        {formatRecordedAt(row.recordedAt)}
      </td>
    </tr>
  );
}

export default function SensorFusionMatrix({
  fusion,
  diagnosisLabel
}: SensorFusionMatrixProps) {
  const { rows, scored, aggregate, status, diagnosisFamily } = fusion;
  const withRecords = rows.filter((r) => r.hasRecord).length;
  const hasDiagnosis = diagnosisLabel.trim().length > 0;

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-white">
            Multi-Technology Sensor Fusion
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {hasDiagnosis ? (
              <>
                Saved records cross-checked against{" "}
                <span className="text-slate-300">{diagnosisLabel}</span>
                {diagnosisFamily !== "unknown" && (
                  <>
                    {" "}
                    <span className="text-slate-600">
                      (
                      {FAULT_FAMILY_LABEL[diagnosisFamily as FaultFamily]}{" "}
                      family)
                    </span>
                  </>
                )}
              </>
            ) : (
              // Without an active diagnosis there is nothing to corroborate
              // against, so scores reflect each record's own severity only.
              "No active diagnosis to cross-check - showing the latest saved record per technology"
            )}
          </p>
        </div>

        {aggregate != null ? (
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Aggregated Corroboration
            </div>
            <div
              className={`text-3xl font-bold ${
                aggregate >= 75
                  ? "text-green-400"
                  : aggregate >= 50
                    ? "text-yellow-300"
                    : "text-orange-300"
              }`}
            >
              {aggregate}%
            </div>
            <div className="text-[11px] text-slate-500">
              mean of {scored.length} scored technologies
            </div>
          </div>
        ) : (
          <div className="max-w-xs rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-right">
            <div className="text-xs font-semibold text-cyan-300">
              Single-domain diagnosis - cross-validation pending
            </div>
            <div className="mt-1 text-[11px] text-cyan-200/70">
              {withRecords === 0
                ? "No technology has a saved record for this asset yet."
                : `Only ${scored.length} technolog${scored.length === 1 ? "y" : "ies"} could be scored; at least 2 are needed for an aggregate.`}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Technology</th>
              <th className="px-4 py-3">Corroboration</th>
              <th className="px-4 py-3">Evidence from saved record</th>
              <th className="px-4 py-3">Captured</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(renderEvidenceRow)}
          </tbody>
        </table>
      </div>

      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200">
          <HelpCircle className="h-3.5 w-3.5" />
          How corroboration is scored
        </summary>
        <div className="space-y-2 border-t border-slate-800 px-4 py-3 text-xs leading-relaxed text-slate-500">
          <p>
            A technology with no saved record is not scored and is excluded from
            the aggregate. A score of 0 means the record exists and shows no
            supporting evidence — it is not the same as missing data.
          </p>
          <p>
            <span className="font-semibold text-slate-400">Vibration:</span> 100
            when the saved primary fault belongs to the diagnosed fault family
            (or a documented cause-effect neighbour), 50 when the record is
            ANOMALY or CRITICAL in a different family, 0 when NORMAL.
          </p>
          <p>
            <span className="font-semibold text-slate-400">Oil:</span> 100 when a
            wear-metal, ISO 4406, water, MPC or RULER exceedance points at the
            diagnosed family, 50 when any exceedance exists in another family, 0
            when every measured parameter is within limits.
          </p>
          <p>
            <span className="font-semibold text-slate-400">Ultrasound:</span> from
            saved dB over baseline —{" "}
            {ULTRASOUND_DB_BANDS.map((b) => `≥+${b.min} dB = ${b.score}`).join(
              ", "
            )}
            , otherwise 0.
          </p>
          <p>
            <span className="font-semibold text-slate-400">Thermography:</span>{" "}
            from saved ΔT converted to °C —{" "}
            {THERMOGRAPHY_DELTA_T_BANDS_C.map(
              (b) => `≥${b.min}°C = ${b.score}`
            ).join(", ")}
            , otherwise 0. When no temperature unit was stored the ΔT is not
            graded, and the analyst&apos;s NETA severity class is used instead.
          </p>
          <p>
            <span className="font-semibold text-slate-400">
              Family cap on ultrasound and thermography:
            </span>{" "}
            these two grade a single scalar, which shows a problem exists rather
            than that this specific diagnosis is correct. A band score above 50
            is therefore held at 50 unless the record&apos;s own fault family
            matches the diagnosed family. Full marks require agreement on
            <em> what</em> is wrong, not just <em>how much</em>.
          </p>
          <p>
            <span className="font-semibold text-slate-400">Aggregate:</span>{" "}
            unweighted mean of scored technologies, rounded. Withheld entirely
            below two scored technologies.
          </p>
        </div>
      </details>
    </section>
  );
}
