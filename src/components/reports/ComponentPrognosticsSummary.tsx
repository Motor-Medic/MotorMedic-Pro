/**
 * ComponentPrognosticsSummary — component-level P-F front door rendered between
 * the Technology tiles and Equipment Selection: one verdict row per modality.
 * Rows run the SAME resolvers + pfEngine as each modality's Prognostics tab
 * (tab 4), with the tab's default inputs: default series selection (largest N,
 * ties by severity), threshold ladder with stored / named-proxy provenance.
 * Row click drills into that modality's Prognostics tab for the full basis
 * card, series selector, and uncertainty band — no basis recomputed here.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { fetchOilSamples } from "../../lib/oilSampleRow";
import type { OilSample } from "../../types/oilAnalysis";
import {
  componentExclusionVerdict,
  derivePf,
  type ExclusionVerdict,
  type PfDerivation,
  type SeriesCandidate,
} from "./pfEngine";
import {
  type PrognosticsModality,
  type RunsSplit,
  type SummaryVerdict,
  type ThresholdKind,
  type ThresholdResolved,
  mcaCandidates,
  mcaRuns,
  mcaThreshold,
  oilCandidates,
  oilThreshold,
  resolveOilAssetId,
  storedDetectionOf,
  summarySentence,
  summaryVerdict,
  thermographyCandidates,
  thermographyRuns,
  thermographyThreshold,
  ultrasoundCandidates,
  ultrasoundRuns,
  ultrasoundThreshold,
  vibrationCandidates,
  vibrationRuns,
  vibrationThreshold,
} from "./prognosticsResolvers";

interface Props {
  selectedAnalysis: SavedAnalysisResult | null;
  loadedAnalyses: SavedAnalysisResult[];
  equipmentAssetId?: string | null;
  onSelectModality: (id: PrognosticsModality) => void;
}

type RowChip = SummaryVerdict | "NO SERIES" | "LOADING" | "UNAVAILABLE";

interface SummaryRow {
  id: PrognosticsModality;
  title: string;
  chip: RowChip;
  kind: ThresholdKind;
  sentence: string;
  n: number;
  spanDays: number;
  seriesLabel: string;
  unit: string;
  exclusion: ExclusionVerdict;
}

const MODALITY_META: Record<PrognosticsModality, { title: string; empty: string }> = {
  vibration: {
    title: "Vibration",
    empty: "no vibration series stored for this component - run a vibration analysis to seed P-F history.",
  },
  thermography: {
    title: "Thermography",
    empty: "no thermography series stored for this component - run a thermography analysis to seed P-F history.",
  },
  ultrasound: {
    title: "Ultrasound",
    empty: "no ultrasound series stored for this component - run an ultrasound analysis to seed P-F history.",
  },
  mca: {
    title: "MCA",
    empty: "no MCA series stored for this component - run an MCA test to seed imbalance / IR history.",
  },
  oil: {
    title: "Oil analysis",
    empty: "no oil wear-metal series stored - log a lab sample to seed the P-F series.",
  },
};

const CHIP_CLASS: Record<RowChip, string> = {
  CROSSED: "bg-red-500/15 text-red-300 border-red-500/40",
  WINDOW: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  THIN: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "NO-THRESHOLD": "bg-amber-500/15 text-amber-300 border-amber-500/40",
  STABLE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  IMPROVING: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "NO SERIES": "bg-slate-500/15 text-slate-300 border-slate-500/40",
  LOADING: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  UNAVAILABLE: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const KIND_TAG_CLASS: Record<ThresholdKind, string> = {
  stored: "border-emerald-500/40 text-emerald-300",
  "named proxy": "border-amber-500/40 text-amber-300",
  none: "border-slate-500/40 text-slate-400",
};

const KIND_TAG_LABEL: Record<ThresholdKind, string> = {
  stored: "threshold: stored",
  "named proxy": "threshold: named proxy",
  none: "threshold: none",
};

function rowFromDerivation(
  id: PrognosticsModality,
  split: RunsSplit,
  candidates: SeriesCandidate[],
  resolved: ThresholdResolved,
  d: PfDerivation,
  component: string | null,
): SummaryRow {
  const meta = MODALITY_META[id];
  const exclusion = componentExclusionVerdict(split.assetRuns, component);
  if (!candidates.length) {
    return {
      id,
      title: meta.title,
      chip: "NO SERIES",
      kind: "none",
      sentence: meta.empty,
      n: 0,
      spanDays: 0,
      seriesLabel: "—",
      unit: d.unit,
      exclusion,
    };
  }
  return {
    id,
    title: meta.title,
    chip: summaryVerdict(d),
    kind: resolved.kind,
    sentence: summarySentence(d),
    n: d.n,
    spanDays: d.spanDays,
    seriesLabel: d.seriesLabel,
    unit: d.unit,
    exclusion,
  };
}

export default function ComponentPrognosticsSummary({
  selectedAnalysis,
  loadedAnalyses,
  equipmentAssetId,
  onSelectModality,
}: Props) {
  const asset = selectedAnalysis?.asset_id ?? null;
  const component = selectedAnalysis?.component ?? null;

  const [oilSamples, setOilSamples] = useState<OilSample[]>([]);
  const [oilStatus, setOilStatus] = useState<"loading" | "ready" | "error">("loading");
  const [oilError, setOilError] = useState<string | null>(null);

  const oilAssetId = resolveOilAssetId(equipmentAssetId, selectedAnalysis, loadedAnalyses);

  useEffect(() => {
    if (!selectedAnalysis) {
      setOilSamples([]);
      setOilStatus("loading");
      setOilError(null);
      return;
    }
    if (!oilAssetId) {
      setOilSamples([]);
      setOilStatus("error");
      setOilError("asset id unavailable - oil verdict not computed");
      return;
    }
    let cancelled = false;
    setOilStatus("loading");
    fetchOilSamples(oilAssetId)
      .then((s) => {
        if (!cancelled) {
          setOilSamples(s);
          setOilError(null);
          setOilStatus("ready");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setOilError(String(e));
          setOilStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAnalysis, oilAssetId]);

  const sortedOil = useMemo(
    () => [...oilSamples].sort((a, b) => a.sampleDate.localeCompare(b.sampleDate)),
    [oilSamples],
  );

  const vibrationRow = useMemo<SummaryRow | null>(() => {
    if (!selectedAnalysis) return null;
    const split = vibrationRuns(loadedAnalyses, asset, component);
    const candidates = vibrationCandidates(split.runs, selectedAnalysis);
    const resolved = vibrationThreshold(candidates, null, selectedAnalysis);
    const d = derivePf({
      candidates,
      overrideId: null,
      threshold: resolved.threshold,
      storedDetection: storedDetectionOf(selectedAnalysis),
    });
    return rowFromDerivation("vibration", split, candidates, resolved, d, component);
  }, [selectedAnalysis, loadedAnalyses, asset, component]);

  const thermographyRow = useMemo<SummaryRow | null>(() => {
    if (!selectedAnalysis) return null;
    const split = thermographyRuns(loadedAnalyses, asset, component);
    const candidates = thermographyCandidates(split.runs);
    const resolved = thermographyThreshold(candidates, null, selectedAnalysis);
    const d = derivePf({
      candidates,
      overrideId: null,
      threshold: resolved.threshold,
      storedDetection: storedDetectionOf(selectedAnalysis),
    });
    return rowFromDerivation("thermography", split, candidates, resolved, d, component);
  }, [selectedAnalysis, loadedAnalyses, asset, component]);

  const ultrasoundRow = useMemo<SummaryRow | null>(() => {
    if (!selectedAnalysis) return null;
    const split = ultrasoundRuns(loadedAnalyses, asset, component);
    const candidates = ultrasoundCandidates(split.runs);
    const resolved = ultrasoundThreshold(candidates, null);
    const d = derivePf({
      candidates,
      overrideId: null,
      threshold: resolved.threshold,
      storedDetection: storedDetectionOf(selectedAnalysis),
    });
    return rowFromDerivation("ultrasound", split, candidates, resolved, d, component);
  }, [selectedAnalysis, loadedAnalyses, asset, component]);

  const mcaRow = useMemo<SummaryRow | null>(() => {
    if (!selectedAnalysis) return null;
    const split = mcaRuns(loadedAnalyses, asset, component);
    const candidates = mcaCandidates(split.runs);
    const resolved = mcaThreshold(candidates, null, split.runs);
    const d = derivePf({
      candidates,
      overrideId: null,
      threshold: resolved.threshold,
      storedDetection: null,
    });
    return rowFromDerivation("mca", split, candidates, resolved, d, component);
  }, [selectedAnalysis, loadedAnalyses, asset, component]);

  const oilRow = useMemo<SummaryRow | null>(() => {
    if (!selectedAnalysis) return null;
    const split: RunsSplit = { assetRuns: [], runs: [] };
    if (oilStatus === "loading") {
      return {
        id: "oil",
        title: MODALITY_META.oil.title,
        chip: "LOADING",
        kind: "none",
        sentence: "loading stored oil samples - verdict not yet computed.",
        n: 0,
        spanDays: 0,
        seriesLabel: "—",
        unit: "ppm",
        exclusion: { count: 0, components: [] },
      };
    }
    if (oilStatus === "error") {
      return {
        id: "oil",
        title: MODALITY_META.oil.title,
        chip: "UNAVAILABLE",
        kind: "none",
        sentence: `failed to load oil samples: ${oilError ?? "unknown error"} - slope not computed from missing data.`,
        n: 0,
        spanDays: 0,
        seriesLabel: "—",
        unit: "ppm",
        exclusion: { count: 0, components: [] },
      };
    }
    const candidates = oilCandidates(sortedOil);
    const resolved = oilThreshold(candidates, null, sortedOil);
    const d = derivePf({
      candidates,
      overrideId: null,
      threshold: resolved.threshold,
      storedDetection: null,
    });
    return rowFromDerivation("oil", split, candidates, resolved, d, null);
  }, [selectedAnalysis, oilStatus, oilError, sortedOil]);

  const rows: SummaryRow[] = [vibrationRow, thermographyRow, ultrasoundRow, mcaRow, oilRow].filter(
    (r): r is SummaryRow => r != null,
  );

  return (
    <section className="bg-slate-900/50 border border-white/80 rounded-xl p-4 space-y-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
      <div>
        <h2 className="text-sm font-bold text-white tracking-tight">Component prognosis</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          One P/F verdict per modality — click a row to open that modality's Prognostics tab for the full basis
        </p>
      </div>

      {!selectedAnalysis && (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          No analysis selected - component prognosis unavailable until an analysis is chosen.
        </p>
      )}

      {selectedAnalysis && !selectedAnalysis.component && (
        <p className="text-xs italic text-amber-400 border-l-2 border-amber-400/40 pl-3">
          No component recorded on this analysis - series scoped to all runs for asset{" "}
          {selectedAnalysis.asset_id ?? "unknown"} (same scoping rule as the Prognostics tabs).
        </p>
      )}

      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelectModality(row.id)}
          className="w-full text-left bg-slate-800/50 border border-slate-700/60 rounded-lg p-3 flex items-start gap-3 hover:border-yellow-500/60 hover:bg-slate-800 transition-all cursor-pointer"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">{row.title}</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CHIP_CLASS[row.chip]}`}
              >
                {row.chip}
              </span>
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_TAG_CLASS[row.kind]}`}
              >
                {KIND_TAG_LABEL[row.kind]}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{row.sentence}</p>
            <p className="text-[10px] text-slate-500">
              N = {row.n} over {row.spanDays.toFixed(1)} days · series: {row.seriesLabel} · unit:{" "}
              {row.unit || "—"}
            </p>
            {row.exclusion.count > 0 && (
              <p className="text-[10px] text-amber-400">
                {row.exclusion.count} stored run{row.exclusion.count === 1 ? "" : "s"} excluded - mismatched
                sub-component ({row.exclusion.components.join(", ")}); series scoped to tracked component "
                {component}"
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
        </button>
      ))}

      <footer className="border-t border-slate-800 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          Verdicts are modeled estimates from ordinary linear regression over stored history (G8) - not
          measurements. Insufficient history is confessed, not extrapolated (G9). Threshold provenance is labeled
          stored vs named proxy; named proxies are site-practice boundaries, not stored functional limits. Default
          series selection: largest N, ties by severity.
        </p>
      </footer>
    </section>
  );
}
