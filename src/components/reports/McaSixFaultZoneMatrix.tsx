/**
 * SLICE-MCA-VISION v2 — six fault-zone surfaces for grouped-bar MCA reports.
 *
 * Reads ONLY the stored record (peak.bar_chart / telemetry_data.bar_chart).
 * When a value is unreadable the cell shows "not extracted" — the component
 * never substitutes, interpolates, or carries a value across rotor positions.
 */
import React from "react";
import { AlertTriangle, Grid3x3, Info } from "lucide-react";
import {
  MCA_BAR_METRIC_UNIT,
  MCA_BAR_METRICS,
  deriveMcaSixFaultZones,
  type McaBarChartRecord,
  type McaBarMetric,
  type McaFaultZone
} from "../../lib/mca/mcaBarChart";
import { MCA_IMBALANCE_SOURCE } from "../../lib/maintenance/prescriptiveDictionary";

export interface McaSixFaultZoneMatrixProps {
  barChart: McaBarChartRecord | null;
}

function fmtMetric(metric: McaBarMetric, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "not extracted";
  return `${value} ${MCA_BAR_METRIC_UNIT[metric]}`;
}

function zoneCell(zone: McaFaultZone, phase: "A" | "B" | "C"): string {
  const cell = zone.cells.find((c) => c.phase === phase);
  if (!cell) return "not extracted";
  const metrics = MCA_BAR_METRICS.filter(
    (m) => cell.values[m] != null && Number.isFinite(cell.values[m] as number)
  );
  if (metrics.length === 0) return "not extracted";
  return metrics
    .map((m) => `${fmtMetric(m, cell.values[m] as number)}`)
    .join(" · ");
}

const CARD = "rounded-xl border border-white/10 bg-slate-950/40 p-4";
const TH = "text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5 text-left";
const TD = "px-2 py-1.5 text-xs text-slate-300 font-mono align-top";

export default function McaSixFaultZoneMatrix({ barChart }: McaSixFaultZoneMatrixProps) {
  const zones = deriveMcaSixFaultZones(barChart);

  return (
    <div className={CARD} data-testid="mca-six-fault-zone-matrix">
      <div className="flex items-center gap-2 mb-2">
        <Grid3x3 className="h-4 w-4 text-cyan-400 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-300">
          Six Fault Zones — Grouped-Bar Report
        </p>
      </div>

      {!barChart || zones.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          No grouped-bar MCA data stored for this run — not extracted (no values
          fabricated).
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[34rem]">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className={TH}>Fault zone</th>
                  <th className={TH}>Phase A</th>
                  <th className={TH}>Phase B</th>
                  <th className={TH}>Phase C</th>
                  <th className={TH}>Unbalance / basis</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id} className="border-b border-slate-900">
                    <td className="px-2 py-1.5 text-xs text-slate-200 font-semibold align-top">
                      {zone.label}
                    </td>
                    <td className={TD}>{zoneCell(zone, "A")}</td>
                    <td className={TD}>{zoneCell(zone, "B")}</td>
                    <td className={TD}>{zoneCell(zone, "C")}</td>
                    <td className={TD}>
                      {zone.unbalance_pct != null
                        ? `${zone.unbalance_pct}%${zone.severity ? ` · ${zone.severity.clazz}` : ""}`
                        : "descriptive only"}
                      <span className="block text-[10px] text-slate-500 font-sans mt-0.5">
                        {zone.basis}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500 mt-2 break-words">
            <span className="font-semibold">Provenance: </span>
            {barChart.provenance}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 break-words">
            <span className="font-semibold">Axis-read disclosure: </span>
            {barChart.tolerance_disclosure}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 flex items-start gap-1 break-words">
            <Info className="h-3 w-3 inline shrink-0 mt-0.5" />
            {MCA_IMBALANCE_SOURCE}
          </p>
        </>
      )}

      <p className="text-[10px] text-slate-600 mt-1 flex items-start gap-1 break-words">
        <AlertTriangle className="h-3 w-3 inline shrink-0 mt-0.5" />
        Only stored, axis-read values are shown. Unreadable bars are reported as
        not extracted; no value is inferred from bar geometry beyond the
        disclosed tolerance.
      </p>
    </div>
  );
}
