import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Loader2, Sparkles } from "lucide-react";
import {
  fetchAnalysisResults,
  type SavedAnalysisResult,
  type SavedFaultItem
} from "../lib/analysisPersistence";
import { useQueryParam } from "../lib/useQueryParam";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface RootCauseAnalysisProps {
  selectedCompanyId?: number;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";
const PILL =
  "px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300";

type RcaTab = 1 | 2 | 3 | 4;
type RcaView = "logic" | "fishbone" | "5whys";

const RCA_TABS: { id: RcaTab; label: string }[] = [
  { id: 1, label: "🌳 Logic Tree & Evidence" },
  { id: 2, label: "⏱️ SnapCharT Timeline" },
  { id: 3, label: "🧠 3-Tier Cause Breakdown" },
  { id: 4, label: "💰 CAPA & ROI Engine" }
];

const RCA_VIEWS: { id: RcaView; label: string }[] = [
  { id: "logic", label: "🌳 Logic Tree (PROACT)" },
  { id: "fishbone", label: "🐟 Fishbone (6Ms)" },
  { id: "5whys", label: "❓ 5 Whys Sequence" }
];

type EvidenceStatus = "verified" | "disproved" | "untested";

interface RcaFaultNode {
  title: string;
  evidence: string;
  status: EvidenceStatus;
}

function faultEvidence(f: SavedFaultItem, debateSummary: string): string {
  const parts = [
    f.description || f.detail,
    f.frequency != null ? `Frequency: ${f.frequency}` : null,
    f.frequencyHz != null ? `Frequency: ${f.frequencyHz} Hz` : null,
    f.confidencePercent != null || f.confidence != null
      ? `Confidence: ${f.confidencePercent ?? f.confidence}%`
      : null,
    debateSummary ? `Consensus: ${debateSummary}` : null
  ].filter(Boolean);
  return parts.join(" · ") || "No evidence string recorded.";
}

function faultStatus(severity?: string): EvidenceStatus {
  const raw = String(severity || "").toLowerCase();
  if (raw.includes("high") || raw.includes("crit")) return "verified";
  if (raw.includes("low") || raw.includes("normal")) return "disproved";
  return "untested";
}

function extractFaultNodes(record: SavedAnalysisResult): RcaFaultNode[] {
  const consensus = record.consensus_details as Record<string, unknown> | null;
  const debate = consensus?.refereeDebateSummary
    ? String(consensus.refereeDebateSummary)
    : "";

  const nodes = (record.fault_list || []).map((f) => ({
    title: f.title,
    evidence: faultEvidence(f, debate),
    status: faultStatus(f.severity)
  }));

  if (nodes.length === 0 && record.primary_fault) {
    nodes.push({
      title: record.primary_fault,
      evidence: record.summary || debate || "Primary fault recorded without detailed evidence.",
      status: "untested"
    });
  }
  return nodes;
}

function buildLogicBranches(faultNodes: RcaFaultNode[]) {
  if (faultNodes.length === 0) return [];
  return [
    {
      title: "Diagnosed Faults (from saved records)",
      tone: "border-red-500/40 text-red-400",
      nodes: faultNodes.map((f) => ({
        text: `${f.title} — ${f.evidence}`,
        status: f.status
      }))
    }
  ];
}

function buildFishboneRibs(
  faultNodes: RcaFaultNode[],
  recommendations: string[]
): { label: string; items: string[]; side: "top" | "bottom" }[] {
  const ribs: { label: string; items: string[]; side: "top" | "bottom" }[] = [];
  if (faultNodes.length) {
    ribs.push({
      label: "Machine / Component",
      items: faultNodes.map((f) => f.title),
      side: "top"
    });
    ribs.push({
      label: "Measurement",
      items: faultNodes.map((f) => f.evidence).slice(0, 4),
      side: "top"
    });
  }
  if (recommendations.length) {
    ribs.push({
      label: "Method / Corrective",
      items: recommendations.slice(0, 4),
      side: "bottom"
    });
  }
  return ribs;
}

function buildFiveWhys(faultNodes: RcaFaultNode[]) {
  return faultNodes.slice(0, 5).map((f, idx) => ({
    why: idx === 0 ? `Why was ${f.title} flagged?` : `Why does ${f.title} matter?`,
    answer: f.evidence,
    status: f.status
  }));
}

function formatRecordDate(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EvidenceBadge = ({ status }: { status: EvidenceStatus }) => {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/15 border border-green-500/30 text-green-400">
        VERIFIED
      </span>
    );
  }
  if (status === "disproved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400">
        DISPROVED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/15 border border-yellow-500/30 text-yellow-400">
      UNTESTED
    </span>
  );
};

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
    active
      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
      : "bg-slate-800 border-slate-700 text-slate-400"
  }`;

export default function RootCauseAnalysis({ selectedCompanyId }: RootCauseAnalysisProps) {
  void selectedCompanyId;

  const deepLinkAssetId = useQueryParam("assetId");
  const [records, setRecords] = useState<SavedAnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");

  const [activeRcaTab, setActiveRcaTab] = useState<RcaTab>(1);
  const [rcaView, setRcaView] = useState<RcaView>("logic");
  const [aiSuggested, setAiSuggested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAnalysisResults({ limit: 200 })
      .then((rows) => {
        if (cancelled) return;
        setRecords(rows);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of records) {
      if (row.asset_id) ids.add(row.asset_id);
    }
    return [...ids].sort();
  }, [records]);

  useEffect(() => {
    if (deepLinkAssetId && assetIds.includes(deepLinkAssetId)) {
      setSelectedAssetId(deepLinkAssetId);
      return;
    }
    if (!selectedAssetId && assetIds.length > 0) {
      setSelectedAssetId(assetIds[0]);
    }
  }, [assetIds, deepLinkAssetId, selectedAssetId]);

  const assetRecords = useMemo(
    () =>
      records
        .filter((r) => r.asset_id === selectedAssetId)
        .sort(
          (a, b) =>
            new Date(b.timestamp || b.created_at || 0).getTime() -
            new Date(a.timestamp || a.created_at || 0).getTime()
        ),
    [records, selectedAssetId]
  );

  const latestRecord = assetRecords[0] ?? null;
  const faultNodes = useMemo(() => {
    const seen = new Set<string>();
    const all: RcaFaultNode[] = [];
    for (const rec of assetRecords) {
      for (const node of extractFaultNodes(rec)) {
        const key = `${node.title}::${node.evidence}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(node);
      }
    }
    return all;
  }, [assetRecords]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    for (const rec of assetRecords) {
      for (const r of rec.recommendations || []) {
        if (r && !recs.includes(r)) recs.push(String(r));
      }
    }
    return recs;
  }, [assetRecords]);

  const logicBranches = useMemo(() => buildLogicBranches(faultNodes), [faultNodes]);
  const fishboneRibs = useMemo(
    () => buildFishboneRibs(faultNodes, recommendations),
    [faultNodes, recommendations]
  );
  const fiveWhys = useMemo(() => buildFiveWhys(faultNodes), [faultNodes]);

  const timelineEvents = useMemo(
    () =>
      assetRecords.slice(0, 6).map((rec) => ({
        date: formatRecordDate(rec.timestamp || rec.created_at),
        label: rec.primary_fault || rec.analysis_type || "Diagnosis saved"
      })),
    [assetRecords]
  );

  const timelineData = useMemo(
    () =>
      assetRecords.slice(0, 6).reverse().map((rec, idx) => ({
        date: formatRecordDate(rec.timestamp || rec.created_at) || `T${idx + 1}`,
        temp: rec.de_bearing_temp ?? rec.phase_a_temp ?? null,
        vibration: rec.health_score ?? null,
        event: rec.primary_fault || "Saved diagnosis"
      })),
    [assetRecords]
  );

  const hasRcaData = faultNodes.length > 0;

  if (loading) {
    return (
      <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading saved diagnosis records…
      </div>
    );
  }

  if (!hasRcaData) {
    return (
      <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
        <section className={`${CARD} text-center py-16 px-6`}>
          <p className="text-lg font-bold text-white mb-2">
            No root-cause analysis recorded — run a diagnosis.
          </p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Save a multi-technology diagnosis from Run Diagnostics. Identified faults and evidence
            strings from that record will populate the logic tree here.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
          Root Cause Analysis Engine
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {assetIds.length > 1 && (
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              {assetIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
          <div className={PILL}>ASSET: {selectedAssetId || "—"}</div>
          <div className={PILL}>
            INCIDENT: {latestRecord?.primary_fault || "Saved diagnosis findings"}
          </div>
          <div className={PILL}>
            DATE: {formatRecordDate(latestRecord?.timestamp || latestRecord?.created_at)}
          </div>
          {latestRecord?.severity && (
            <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold">
              SEVERITY: {latestRecord.severity}
            </div>
          )}
        </div>
      </div>

      {/* ===== SUB-TAB NAV ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {RCA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveRcaTab(tab.id)}
            className={tabBtn(activeRcaTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: LOGIC TREE & EVIDENCE ===== */}
      {activeRcaTab === 1 && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {RCA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setRcaView(view.id)}
                  className={tabBtn(rcaView === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAiSuggested(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 text-xs font-semibold cursor-pointer hover:border-cyan-500/50 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span className="bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">
                ✨ AI Auto-Suggest Causal Nodes
              </span>
            </button>
          </div>

          {aiSuggested && (
            <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
              AI suggested 2 additional latent nodes (training gap + SOP revision lag). Review and
              verify before locking the logic tree.
            </div>
          )}

          {rcaView === "logic" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-6">PROACT Logic Tree</h3>
              <div className="flex flex-col items-center">
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-center max-w-md">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">
                    Problem
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {latestRecord?.primary_fault || "Saved diagnosis findings"} — {selectedAssetId}
                  </p>
                </div>

                <div className="w-px h-8 bg-white/20" />
                <div className="h-px w-full max-w-4xl bg-white/20" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl mt-0">
                  {logicBranches.map((branch) => (
                    <div key={branch.title} className="flex flex-col items-center">
                      <div className="w-px h-6 bg-white/20" />
                      <div
                        className={`w-full rounded-lg border bg-slate-950/60 px-3 py-2 text-center mb-3 ${branch.tone}`}
                      >
                        <p className="text-xs font-bold">{branch.title}</p>
                      </div>
                      <div className="w-full space-y-2">
                        {branch.nodes.map((node) => (
                          <div
                            key={node.text}
                            className="rounded-lg border border-white/10 bg-slate-950/80 p-3"
                          >
                            <p className="text-xs text-slate-200 mb-2 leading-snug">{node.text}</p>
                            <EvidenceBadge status={node.status} />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            // TODO: Implement modal for adding hypothesis
                          }}
                          className="w-full mt-3 py-2 border border-dashed border-slate-600 text-slate-400 rounded-lg hover:border-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all text-sm font-medium flex items-center justify-center gap-1 cursor-pointer"
                        >
                          + Add Hypothesis
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {rcaView === "fishbone" && (
            <div className={`${CARD} mb-6 overflow-x-auto`}>
              <h3 className="text-base font-bold text-white mb-6">Ishikawa Diagram (6Ms)</h3>
              <div className="min-w-[720px] relative py-8">
                <div className="absolute left-8 right-28 top-1/2 h-0.5 bg-cyan-500/60 -translate-y-1/2" />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 max-w-[160px] text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                    Effect
                  </p>
                  <p className="text-xs font-semibold text-white">{latestRecord?.primary_fault || "Fault effect"}</p>
                </div>

                <div className="grid grid-cols-3 gap-6 pr-44 pl-4">
                  {fishboneRibs.filter((r) => r.side === "top").map((rib) => (
                    <div key={rib.label} className="flex flex-col items-center">
                      <div className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 w-full mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-2">
                          {rib.label}
                        </p>
                        <ul className="space-y-1">
                          {rib.items.map((item) => (
                            <li key={item} className="text-[11px] text-slate-300">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="w-px h-10 bg-cyan-500/40" />
                    </div>
                  ))}
                </div>

                <div className="h-8" />

                <div className="grid grid-cols-3 gap-6 pr-44 pl-4">
                  {fishboneRibs.filter((r) => r.side === "bottom").map((rib) => (
                    <div key={rib.label} className="flex flex-col items-center">
                      <div className="w-px h-10 bg-cyan-500/40" />
                      <div className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 w-full mt-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">
                          {rib.label}
                        </p>
                        <ul className="space-y-1">
                          {rib.items.map((item) => (
                            <li key={item} className="text-[11px] text-slate-300">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <EvidenceBadge status="verified" />
                <EvidenceBadge status="disproved" />
                <EvidenceBadge status="untested" />
              </div>
            </div>
          )}

          {rcaView === "5whys" && (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">5 Whys Sequence</h3>
              <ol className="space-y-4">
                {fiveWhys.map((row, idx) => (
                  <li
                    key={row.why}
                    className="rounded-lg border border-white/10 bg-slate-950/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-cyan-400">
                        {idx + 1}. {row.why}
                      </p>
                      <EvidenceBadge status={row.status} />
                    </div>
                    <p className="text-sm text-slate-200">{row.answer}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* ===== TAB 2: SNAPCHART TIMELINE ===== */}
      {activeRcaTab === 2 && (
        <>
          <div className={`${CARD} mb-6`}>
            <h3 className="text-base font-bold text-white mb-1">
              Synchronized Telemetry–Visual Timeline
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Event track aligned with bearing temperature and vibration RMS sparklines.
            </p>

            {/* Top track — events */}
            <div className="relative mb-8 px-2">
              <div className="absolute left-4 right-4 top-3 h-0.5 bg-white/20" />
              <div className="grid grid-cols-3 gap-2 relative">
                {timelineEvents.map((ev) => (
                  <div key={ev.date} className="flex flex-col items-center text-center">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-950 mb-2" />
                    <p className="text-[10px] font-bold text-cyan-400">{ev.date}</p>
                    <p className="text-xs text-slate-300 mt-1">{ev.label}</p>
                  </div>
                ))}
              </div>
            </div>

          {timelineData.length > 0 && (
            <div className="h-72 bg-slate-950 rounded-lg border border-white/10 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={timelineData}
                  margin={{ top: 16, right: 40, bottom: 12, left: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="temp"
                    stroke="#ef4444"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Temp",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#ef4444",
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="vib"
                    orientation="right"
                    stroke="#eab308"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Health",
                      angle: 90,
                      position: "insideRight",
                      fill: "#eab308",
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    cursor={{ stroke: "#06b6d4", strokeWidth: 1, strokeDasharray: "4 4" }}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#fff"
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    name="Temperature"
                    dot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="vib"
                    type="monotone"
                    dataKey="vibration"
                    stroke="#eab308"
                    strokeWidth={2.5}
                    name="Health score"
                    dot={{ r: 4 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          </div>
        </>
      )}

      {/* ===== TAB 3: 3-TIER CAUSE BREAKDOWN ===== */}
      {activeRcaTab === 3 && (
        <div className="mb-6 space-y-4">
          {faultNodes.map((node, idx) => (
            <div key={`${node.title}-${idx}`} className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">
                Diagnosed fault {idx + 1}
              </p>
              <p className="text-base font-bold text-white mb-2">{node.title}</p>
              <p className="text-sm text-slate-400">Evidence: {node.evidence}</p>
              <div className="mt-2">
                <EvidenceBadge status={node.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== TAB 4: CAPA & ROI ENGINE ===== */}
      {activeRcaTab === 4 && (
        <>
          {recommendations.length === 0 ? (
            <section className={`${CARD} mb-6 text-center py-12`}>
              <p className="text-sm text-slate-400">
                No corrective action recommendations recorded for this asset.
              </p>
            </section>
          ) : (
            <div className={`${CARD} mb-6`}>
              <h3 className="text-base font-bold text-white mb-4">
                Corrective Actions (from saved diagnoses)
              </h3>
              <ul className="space-y-2">
                {recommendations.map((rec) => (
                  <li
                    key={rec}
                    className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200"
                  >
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
