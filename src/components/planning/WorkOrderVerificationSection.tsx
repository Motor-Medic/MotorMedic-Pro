import React, { useCallback, useEffect, useState } from "react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult,
  type SavedFaultItem
} from "../../lib/analysisPersistence";
import {
  getPrescription,
  type SeverityZones
} from "../../lib/maintenance/prescriptiveDictionary";
import {
  loadClosedWoStore,
  type ClosedWorkOrder,
  type ClosedWoStore,
  type SeededVerificationRun
} from "../../lib/maintenance/closedWorkOrderSeed";
import {
  loadCostModel,
  COST_MODEL_EVENT,
  type CostModel
} from "../scorecard/CostDock";

const DAY_MS = 86400000;
const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * DAY_MS;

const CLASS_HOURS: Record<string, number> = {
  Critical: 24,
  High: 8,
  Medium: 4,
  Low: 1
};

const UNIT_BY_ANALYSIS: Record<string, string> = {
  vibration: "mm/s",
  ultrasound: "dB",
  infrared: "°C",
  thermography: "°C",
  mca: "A",
  oil_analysis: "ppm"
};

type Verdict = "HEALED" | "NOT HEALED" | "INCONCLUSIVE";

const VERDICT_STYLE: Record<Verdict, string> = {
  HEALED: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  "NOT HEALED": "bg-amber-500/15 border-amber-500/40 text-amber-400",
  INCONCLUSIVE: "bg-slate-500/15 border-slate-500/40 text-slate-300"
};

interface Peak {
  frequencyHz: number;
  amplitude: number;
}

interface FaultItem {
  title: string;
  frequencyHz: number | null;
  severity: string | null;
}

interface RunRecord {
  id: string;
  tsMs: number;
  seeded: boolean;
  analysisType: string | null;
  peaks: Peak[];
  faults: FaultItem[];
  primaryFault: string | null;
  severity: string | null;
  healthScore: number | null;
  waveformPp: number | null;
  phaseTemps: number[];
}

interface MetricReading {
  value: number | null;
  label: string;
  unit: string;
  source: string;
}

interface ZoneRead {
  label: string;
  unit: string;
}

interface FaultState {
  reported: boolean;
  detail: string;
}

interface VerdictRead {
  verdict: Verdict;
  reason: string;
}

function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePeak(raw: unknown): Peak | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const f = toNumberOrNull(
    o.frequencyHz ??
      o.frequency_hz ??
      o.freqHz ??
      o.freq_hz ??
      o.frequency ??
      o.freq ??
      o.hz ??
      o.count
  );
  const a = toNumberOrNull(o.amplitude ?? o.amp ?? o.value);
  if (f === null || a === null) return null;
  return { frequencyHz: f, amplitude: a };
}

function normalizeApiRun(r: SavedAnalysisResult): RunRecord {
  const tsMs = new Date(r.timestamp || r.created_at || "").getTime();
  const temps = [r.phase_a_temp, r.phase_b_temp, r.phase_c_temp]
    .map((t) => toNumberOrNull(t))
    .filter((t): t is number => t !== null);
  return {
    id: r.id,
    tsMs: Number.isFinite(tsMs) ? tsMs : NaN,
    seeded: false,
    analysisType: r.analysis_type ?? null,
    peaks: Array.isArray(r.peaks)
      ? r.peaks.map((p) => parsePeak(p)).filter((p): p is Peak => p !== null)
      : [],
    faults: (r.fault_list ?? []).map((f: SavedFaultItem) => ({
      title: typeof f?.title === "string" ? f.title : "",
      frequencyHz: toNumberOrNull(f?.frequencyHz ?? f?.frequency),
      severity: typeof f?.severity === "string" ? f.severity : null
    })),
    primaryFault: r.primary_fault ?? null,
    severity: r.severity ?? null,
    healthScore: toNumberOrNull(r.health_score),
    waveformPp: toNumberOrNull(r.waveform_peak_to_peak),
    phaseTemps: temps
  };
}

function normalizeSeededRun(r: SeededVerificationRun): RunRecord {
  const tsMs = new Date(r.timestamp).getTime();
  return {
    id: r.id,
    tsMs: Number.isFinite(tsMs) ? tsMs : NaN,
    seeded: true,
    analysisType: r.analysisType,
    peaks: r.peaks.map((p) => ({ frequencyHz: p.frequencyHz, amplitude: p.amplitude })),
    faults: r.fault_list.map((f) => ({
      title: f.title,
      frequencyHz: toNumberOrNull(f.frequencyHz),
      severity: typeof f.severity === "string" ? f.severity : null
    })),
    primaryFault: r.primary_fault,
    severity: r.severity,
    healthScore: r.health_score,
    waveformPp: null,
    phaseTemps: []
  };
}

function mergeRuns(
  api: SavedAnalysisResult[],
  seeded: SeededVerificationRun[],
  wo: ClosedWorkOrder
): RunRecord[] {
  const component = wo.component.trim().toLowerCase();
  const seen = new Set<string>();
  const out: RunRecord[] = [];
  for (const raw of api) {
    const asset = (raw.asset_id ?? "").trim();
    const runComponent = (raw.component ?? "").trim().toLowerCase();
    if (asset !== wo.assetId) continue;
    if (component.length > 0 && runComponent !== component) continue;
    const rec = normalizeApiRun(raw);
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  for (const raw of seeded) {
    if (raw.assetId !== wo.assetId) continue;
    if (component.length > 0 && raw.component.trim().toLowerCase() !== component) continue;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push(normalizeSeededRun(raw));
  }
  return out;
}

function trackedHzTolerance(trackedHz: number): number {
  return Math.max(2, Math.abs(trackedHz) * 0.02);
}

function readPrimaryMetric(wo: ClosedWorkOrder, run: RunRecord | null): MetricReading {
  if (!run) {
    return { value: null, label: "primary metric", unit: "", source: "no run on record" };
  }
  const typeKey = (run.analysisType ?? "").trim().toLowerCase();
  if (wo.trackedHz !== null) {
    const tol = trackedHzTolerance(wo.trackedHz);
    let hit: Peak | null = null;
    for (const p of run.peaks) {
      if (Math.abs(p.frequencyHz - wo.trackedHz) <= tol) {
        if (hit === null || p.amplitude > hit.amplitude) hit = p;
      }
    }
    if (hit !== null) {
      const mapped = UNIT_BY_ANALYSIS[typeKey];
      if (mapped) {
        return {
          value: hit.amplitude,
          label: `Amplitude @ ${wo.trackedHz} Hz`,
          unit: mapped,
          source: `peak within tolerance of tracked ${wo.trackedHz} Hz (max(2 Hz, 2% of tracked))`
        };
      }
      return {
        value: null,
        label: `Amplitude @ ${wo.trackedHz} Hz`,
        unit: "",
        source: "peak found at tracked Hz but unit not on record for this analysis type"
      };
    }
  }
  if (run.waveformPp !== null) {
    return {
      value: run.waveformPp,
      label: "Waveform peak-to-peak",
      unit: "mm/s",
      source: "structured waveform field on the run"
    };
  }
  if (run.phaseTemps.length > 0) {
    return {
      value: Math.max(...run.phaseTemps),
      label: "Phase temperature (max)",
      unit: "°C",
      source: "structured thermography fields on the run"
    };
  }
  return {
    value: null,
    label: "primary metric",
    unit: "",
    source: "no structured primary metric on record - summary prose not parsed"
  };
}

function zoneFor(value: number | null, zones: SeverityZones): ZoneRead {
  const unit = zones.unit || "unit not on record";
  const alarm = zones.alarm != null && Number.isFinite(Number(zones.alarm)) ? Number(zones.alarm) : null;
  const danger = zones.danger != null && Number.isFinite(Number(zones.danger)) ? Number(zones.danger) : null;
  if (value === null || alarm === null) {
    return { label: "no severity zone on record for this metric", unit };
  }
  if (value < alarm) {
    return { label: `below site alarm (${alarm} ${unit})`, unit };
  }
  if (danger !== null && value < danger) {
    return {
      label: `at/above site alarm (${alarm} ${unit}), below danger (${danger} ${unit})`,
      unit
    };
  }
  return { label: `at/above danger (${danger ?? alarm} ${unit})`, unit };
}

function faultStateAt(run: RunRecord | null, wo: ClosedWorkOrder): FaultState {
  if (!run) return { reported: false, detail: "no run on record" };
  const target = wo.targetFault.trim().toLowerCase();
  const tol = wo.trackedHz !== null ? trackedHzTolerance(wo.trackedHz) : null;
  for (const f of run.faults) {
    const title = f.title.trim().toLowerCase();
    const titleHit =
      target.length > 0 &&
      title.length > 0 &&
      (title === target || title.includes(target) || target.includes(title));
    const hzHit =
      tol !== null && wo.trackedHz !== null && f.frequencyHz !== null &&
      Math.abs(f.frequencyHz - wo.trackedHz) <= tol;
    if (titleHit || hzHit) {
      const bits: string[] = [];
      if (f.title) bits.push(f.title);
      if (f.frequencyHz !== null) bits.push(`${f.frequencyHz} Hz`);
      if (f.severity) bits.push(f.severity);
      return { reported: true, detail: bits.join(" - ") || "target fault reported" };
    }
  }
  const primary = (run.primaryFault ?? "").trim().toLowerCase();
  if (target.length > 0 && primary.length > 0 && (primary === target || primary.includes(target))) {
    return { reported: true, detail: run.primaryFault ?? "target fault reported" };
  }
  return { reported: false, detail: "target fault not reported" };
}

function evaluateVerdict(args: {
  closeMs: number;
  post: RunRecord | null;
  postMetric: MetricReading;
  threshold: number | null;
  ladderUnit: string;
  postFault: FaultState;
}): VerdictRead {
  if (!Number.isFinite(args.closeMs)) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "close date not on record - verification window cannot be computed"
    };
  }
  if (!args.post) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `no post-repair run within ${WINDOW_DAYS} days of close`
    };
  }
  if (args.postFault.reported) {
    return {
      verdict: "NOT HEALED",
      reason: `target fault still reported on the post-repair run (${args.postFault.detail}) - re-inspection advised`
    };
  }
  if (args.postMetric.value === null) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `primary metric not on record on the post-repair run - ${args.postMetric.source}`
    };
  }
  const metricUnit = args.postMetric.unit.trim();
  const ladderUnit = args.ladderUnit.trim();
  if (metricUnit.length > 0 && ladderUnit.length > 0 && metricUnit !== ladderUnit) {
    return {
      verdict: "INCONCLUSIVE",
      reason: `metric unit (${metricUnit}) does not match severity ladder unit (${ladderUnit}) - below-detection check cannot be evaluated`
    };
  }
  if (args.threshold === null) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "no detection threshold on record for this fault - below-detection check cannot be evaluated"
    };
  }
  if (args.postMetric.value >= args.threshold) {
    return {
      verdict: "NOT HEALED",
      reason: `post-repair metric ${args.postMetric.value} ${args.postMetric.unit} is at or above the site alarm ${args.threshold} ${ladderUnit} - re-inspection advised`
    };
  }
  return {
    verdict: "HEALED",
    reason: `post-repair run within ${WINDOW_DAYS} days of close: target fault no longer reported and metric ${args.postMetric.value} ${args.postMetric.unit} below the site alarm ${args.threshold} ${ladderUnit} - repair verified by the post-repair evidence, not by work-order closure`
  };
}

function selectRuns(closeMs: number, runs: RunRecord[]): { pre: RunRecord | null; post: RunRecord | null } {
  if (!Number.isFinite(closeMs)) return { pre: null, post: null };
  let pre: RunRecord | null = null;
  let post: RunRecord | null = null;
  for (const r of runs) {
    if (!Number.isFinite(r.tsMs)) continue;
    if (r.tsMs < closeMs) {
      if (pre === null || r.tsMs > pre.tsMs) pre = r;
    } else {
      const delta = r.tsMs - closeMs;
      if (delta <= WINDOW_MS && (post === null || r.tsMs < post.tsMs)) post = r;
    }
  }
  return { pre, post };
}

function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function dayOffsetLabel(deltaMs: number): string {
  const days = Math.abs(deltaMs) / DAY_MS;
  return `${days.toFixed(1)} days`;
}

function isoDate(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "close date not on record";
  return new Date(ms).toISOString().slice(0, 10);
}

interface VerdictCardProps {
  wo: ClosedWorkOrder;
  runs: RunRecord[];
  costModel: CostModel;
  fetchFailed: boolean;
}

function VerdictCard({ wo, runs, costModel, fetchFailed }: VerdictCardProps) {
  const closeMs = new Date(wo.closeDate).getTime();
  const { pre, post } = selectRuns(closeMs, runs);
  const preMetric = readPrimaryMetric(wo, pre);
  const postMetric = readPrimaryMetric(wo, post);
  const prescription = getPrescription(wo.targetFault);
  const zones = prescription.severityZones;
  const threshold =
    zones.alarm != null && Number.isFinite(Number(zones.alarm)) ? Number(zones.alarm) : null;
  const preZone = zoneFor(preMetric.value, zones);
  const postZone = zoneFor(postMetric.value, zones);
  const preFault = faultStateAt(pre, wo);
  const postFault = faultStateAt(post, wo);
  const read = evaluateVerdict({
    closeMs,
    post,
    postMetric,
    threshold,
    ladderUnit: zones.unit || "",
    postFault
  });

  const isDockConfigured = costModel.downtimeCostPerHour !== null;
  const rate = costModel.downtimeCostPerHour?.value ?? null;
  const classHours = CLASS_HOURS[wo.severityClass] ?? null;

  const ladderProvenance =
    threshold !== null
      ? `site alarm ${threshold} ${zones.unit} - prescriptive dictionary severity ladder for ${wo.targetFault} (ISO 10816-3 defaults)`
      : `no severity ladder on record for ${wo.targetFault} - below-detection check withheld`;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <p className="text-sm font-bold text-white font-mono">{wo.id}</p>
          {wo.seeded && (
            <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[9px] font-bold text-amber-400 uppercase">
              demo seed
            </span>
          )}
          <span className="text-[11px] text-slate-400">
            {wo.assetId} / {wo.component || "component not on record"} - {wo.title || "title not on record"}
          </span>
        </div>
        <span
          className={`shrink-0 px-2 py-1 rounded-lg border text-[11px] font-bold ${VERDICT_STYLE[read.verdict]}`}
        >
          {read.verdict}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px] text-slate-400">
        <span>target fault: {wo.targetFault || "not on record"}</span>
        <span>
          tracked peak: {wo.trackedHz !== null ? `${wo.trackedHz} Hz` : "not on record"}
        </span>
        <span>closed: {isoDate(wo.closeDate)}</span>
        <span>prescription mapped: {prescription.isMapped ? "yes" : "no"}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            pre-repair run
          </p>
          {!pre ? (
            <p className="text-[11px] italic text-slate-500">
              {fetchFailed
                ? "verification runs unavailable - fetch failed"
                : "no pre-repair run on record before the close date"}
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                {isoDate(new Date(pre.tsMs).toISOString())} -{" "}
                {dayOffsetLabel(pre.tsMs - closeMs)} before close
              </p>
              <p className="text-lg font-bold text-white mt-1">
                {preMetric.value !== null
                  ? `${preMetric.value} ${preMetric.unit}`
                  : "metric not on record"}
              </p>
              <p className="text-[10px] text-slate-500">{preMetric.label}</p>
              <p className="text-[11px] text-slate-400 mt-1">zone: {preZone.label}</p>
              <p className="text-[11px] text-slate-400">
                run severity: {pre.severity ?? "not on record"}
                {pre.healthScore !== null ? ` - health ${pre.healthScore}` : ""}
              </p>
              <p className="text-[11px] text-slate-400">
                fault: {preFault.detail}
              </p>
            </>
          )}
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              post-repair run
            </p>
            {post?.seeded && (
              <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-[9px] font-bold text-amber-400 uppercase">
                demo seed
              </span>
            )}
          </div>
          {!post ? (
            <p className="text-[11px] italic text-slate-500">
              {fetchFailed
                ? "verification runs unavailable - fetch failed"
                : `no run within ${WINDOW_DAYS} days after the close date`}
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                {isoDate(new Date(post.tsMs).toISOString())} -{" "}
                {dayOffsetLabel(post.tsMs - closeMs)} after close
              </p>
              <p className="text-lg font-bold text-white mt-1">
                {postMetric.value !== null
                  ? `${postMetric.value} ${postMetric.unit}`
                  : "metric not on record"}
              </p>
              <p className="text-[10px] text-slate-500">{postMetric.label}</p>
              <p className="text-[11px] text-slate-400 mt-1">zone: {postZone.label}</p>
              <p className="text-[11px] text-slate-400">
                run severity: {post.severity ?? "not on record"}
                {post.healthScore !== null ? ` - health ${post.healthScore}` : ""}
              </p>
              <p className="text-[11px] text-slate-400">fault: {postFault.detail}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-xs text-slate-300">{read.reason}</p>
        <p className="text-[10px] text-slate-500">detection threshold: {ladderProvenance}</p>

        {isDockConfigured && read.verdict === "HEALED" && rate !== null && classHours !== null && (
          <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                avoided exposure (modeled)
              </p>
              <span className="px-1.5 py-0.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-[9px] font-bold text-yellow-500">
                G2
              </span>
            </div>
            <p className="text-sm font-bold text-yellow-400 mt-1">
              {formatUsd(rate * classHours)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              = downtime {formatUsd(rate)}/hr × {classHours}h site-practice class hours (
              {wo.severityClass}: critical 24h / high 8h / medium 4h / low 1h)
            </p>
            <p className="text-[10px] text-slate-500 italic mt-1">
              modeled estimate, not a financial audit (G2)
            </p>
          </div>
        )}

        {isDockConfigured && read.verdict === "HEALED" && classHours === null && (
          <p className="text-[10px] italic text-amber-400/80">
            severity class not on record - avoided exposure not computed
          </p>
        )}

        <p className="text-[10px] text-slate-500 italic">guidance, not a diagnosis</p>
      </div>
    </div>
  );
}

export default function WorkOrderVerificationSection() {
  const [store] = useState<ClosedWoStore>(() => loadClosedWoStore());
  const [costModel, setCostModel] = useState<CostModel>(loadCostModel);
  const [runsByWo, setRunsByWo] = useState<Record<string, RunRecord[]>>({});
  const [loading, setLoading] = useState(store.workOrders.length > 0);
  const [fetchFailed, setFetchFailed] = useState(false);

  const onCostChange = useCallback(() => {
    setCostModel(loadCostModel());
  }, []);

  useEffect(() => {
    window.addEventListener(COST_MODEL_EVENT, onCostChange);
    window.addEventListener("storage", onCostChange);
    return () => {
      window.removeEventListener(COST_MODEL_EVENT, onCostChange);
      window.removeEventListener("storage", onCostChange);
    };
  }, [onCostChange]);

  useEffect(() => {
    const orders = store.workOrders;
    if (orders.length === 0) {
      setRunsByWo({});
      setLoading(false);
      setFetchFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    void Promise.all(
      orders.map((wo) =>
        fetchAnalysisResults({
          asset_id: wo.assetId,
          component: wo.component || undefined,
          limit: 100
        })
          .then((results) => ({ wo, results, ok: true as const }))
          .catch(() => ({ wo, results: [] as SavedAnalysisResult[], ok: false as const }))
      )
    ).then((batch) => {
      if (cancelled) return;
      const map: Record<string, RunRecord[]> = {};
      let anyFailed = false;
      for (const item of batch) {
        if (!item.ok) anyFailed = true;
        map[item.wo.id] = mergeRuns(item.results, store.postRepairRuns, item.wo);
      }
      setRunsByWo(map);
      setFetchFailed(anyFailed);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const seededWoCount = store.workOrders.filter((w) => w.seeded).length;
  const seededRunCount = store.postRepairRuns.length;
  const hasSeeded = seededWoCount > 0 || seededRunCount > 0;

  if (store.workOrders.length === 0) {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
          Closed-WO Verification Loop
        </p>
        <p className="text-sm italic text-slate-400">
          no closed work orders on record - verification loop empty
        </p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Closed-WO Verification Loop
      </p>
      <p className="text-xs text-slate-400 mb-4">
        every closed work order is re-checked against post-repair evidence - a repair is verified
        by the measurement, not by the work order closing
      </p>

      {hasSeeded && (
        <p className="text-[10px] text-amber-400/90 italic mb-3">
          seeded demo data declared: {seededWoCount} closed work order
          {seededWoCount === 1 ? "" : "s"} and {seededRunCount} post-repair run
          {seededRunCount === 1 ? "" : "s"} live in the client-side browser store (demo seed,
          not CMMS records); pre-repair runs are fetched from the analysis-results API.
        </p>
      )}

      {loading && (
        <p className="text-xs text-slate-400 mb-3">loading verification runs…</p>
      )}
      {!loading && fetchFailed && (
        <p className="text-xs text-amber-400 mb-3">
          verification runs unavailable - fetch failed; verdicts below rest on partial evidence
        </p>
      )}

      <div className="space-y-4">
        {store.workOrders.map((wo) => (
          <div key={wo.id}>
            <VerdictCard
              wo={wo}
              runs={runsByWo[wo.id] ?? []}
              costModel={costModel}
              fetchFailed={fetchFailed}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
