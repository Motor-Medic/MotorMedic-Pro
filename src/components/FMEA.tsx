import React, { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

/* ========================================================================== */
/* Props (unchanged contract for App.tsx)                                     */
/* ========================================================================== */

interface FMEAProps {
  selectedCompanyId?: number;
}

const CARD = "bg-slate-900/50 border border-white/10 rounded-xl p-6";
const PILL =
  "px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300";

type FmeaTab = 1 | 2 | 3 | 4;
type ScoringMode = "rpn" | "ap";
type LiveStatus = "normal" | "warning" | "alarm";

interface MatrixCell {
  s: number;
  o: number;
  rpn: number;
  ap: "H" | "M" | "L";
  tone: "green" | "yellow" | "orange" | "red";
}

interface FmecaRow {
  id: string;
  item: string;
  failureMode: string;
  initial: { s: number; o: number; d: number; rpn: number };
  sensorTag: string;
  controls: string;
  residual: { s: number; o: number; d: number; rpn: number };
  status: LiveStatus;
  statusLabel: string;
  matrixS: number;
  matrixO: number;
}

const FMEA_TABS: { id: FmeaTab; label: string }[] = [
  { id: 1, label: "🛡️ 5x5 Risk Matrix & AP" },
  { id: 2, label: "📝 Telemetry-Linked FMECA" },
  { id: 3, label: "📈 P-F Curve & Task Mapper" },
  { id: 4, label: "💰 Residual Risk ROI" }
];

/** No persisted FMEA table exists yet — worksheet rows load from DB when available. */
const SAVED_FMECA_ROWS: FmecaRow[] = [];

/** AIAG-VDA AP letter from severity. Matrix is 1–5; map ×2 to classic 1–10 scale. */
function getApFromSeverity(s: number): { letter: "H" | "M" | "L"; className: string } {
  const severity = s * 2;
  if (severity >= 8) {
    return {
      letter: "H",
      className: "bg-red-500/20 text-red-400 border-red-500/30"
    };
  }
  if (severity >= 5) {
    return {
      letter: "M",
      className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    };
  }
  return {
    letter: "L",
    className: "bg-green-500/20 text-green-400 border-green-500/30"
  };
}

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
    active
      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
      : "bg-slate-800 border-slate-700 text-slate-400"
  }`;

function buildMatrix(): MatrixCell[][] {
  // Rows = Severity 5→1 (top to bottom), Cols = Occurrence 1→5
  const rows: MatrixCell[][] = [];
  for (let s = 5; s >= 1; s -= 1) {
    const row: MatrixCell[] = [];
    for (let o = 1; o <= 5; o += 1) {
      const rpn = s * o * 5; // mock detection=5 scale for matrix display
      let tone: MatrixCell["tone"] = "green";
      let ap: MatrixCell["ap"] = "L";
      if (s >= 4 && o >= 4) {
        tone = "red";
        ap = "H";
      } else if (s >= 4 || o >= 4 || rpn >= 60) {
        tone = "orange";
        ap = "H";
      } else if (s >= 3 || o >= 3 || rpn >= 30) {
        tone = "yellow";
        ap = "M";
      }
      row.push({ s, o, rpn, ap, tone });
    }
    rows.push(row);
  }
  return rows;
}

const MATRIX = buildMatrix();

const cellToneClass = (tone: MatrixCell["tone"], selected: boolean) => {
  const base =
    tone === "green"
      ? "bg-green-500/20 text-green-400"
      : tone === "yellow"
        ? "bg-yellow-500/20 text-yellow-400"
        : tone === "orange"
          ? "bg-orange-500/25 text-orange-400"
          : "bg-red-500/25 text-red-400";
  return `${base} ${
    selected ? "ring-2 ring-cyan-400 border-cyan-400" : "border-white/10"
  }`;
};

const statusBadgeClass = (status: LiveStatus) => {
  if (status === "normal") {
    return "bg-green-500/15 border border-green-500/30 text-green-400";
  }
  if (status === "warning") {
    return "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400";
  }
  return "bg-red-500/15 border border-red-500/30 text-red-400 animate-pulse";
};

const rpnTone = (rpn: number) => {
  if (rpn >= 100) return "text-red-500 font-bold";
  if (rpn >= 50) return "text-yellow-500 font-semibold";
  return "text-green-400 font-semibold";
};

export default function FMEA({ selectedCompanyId }: FMEAProps) {
  void selectedCompanyId;

  const [activeFmeaTab, setActiveFmeaTab] = useState<FmeaTab>(1);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("rpn");
  const [selectedCell, setSelectedCell] = useState<{ s: number; o: number } | null>(
    null
  );
  const [aiPopulated, setAiPopulated] = useState(false);

  const filteredRows = useMemo(() => {
    if (!selectedCell) return SAVED_FMECA_ROWS;
    return SAVED_FMECA_ROWS.filter(
      (row) => row.matrixS === selectedCell.s && row.matrixO === selectedCell.o
    );
  }, [selectedCell]);

  return (
    <div className="w-full min-h-full bg-slate-950 text-white px-4 py-6 md:px-6">
      {/* ===== GLOBAL HEADER ===== */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              FMEA / FMECA Engine
            </p>
            <div className="flex flex-wrap gap-2">
              <div className={PILL}>No saved FMEA worksheet</div>
              <div className={PILL}>Risk matrix available as reference</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAiPopulated(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 text-xs font-semibold cursor-pointer hover:border-cyan-500/50 transition-colors shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span className="bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">
              ✨ AI Auto-Populate
            </span>
          </button>
        </div>
        {aiPopulated && (
          <p className="mt-3 text-xs text-amber-300">
            AI auto-populate requires saved FMECA rows — none are on file yet.
          </p>
        )}
      </div>

      {/* ===== SUB-TAB NAV ===== */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FMEA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFmeaTab(tab.id)}
            className={tabBtn(activeFmeaTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: 5x5 RISK MATRIX ===== */}
      {activeFmeaTab === 1 && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => setScoringMode("rpn")}
              className={tabBtn(scoringMode === "rpn")}
            >
              Traditional RPN
            </button>
            <button
              type="button"
              onClick={() => setScoringMode("ap")}
              className={tabBtn(scoringMode === "ap")}
            >
              AIAG-VDA Action Priority (AP)
            </button>
          </div>

          <div className={`${CARD} mb-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h3 className="text-base font-bold text-white">
                Interactive 5×5 Risk Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Y = Severity · X = Occurrence · Click a cell to filter the FMECA worksheet
              </p>
            </div>

            <div className="overflow-x-auto">
              <div className="inline-block min-w-[420px]">
                <div className="grid grid-cols-[40px_repeat(5,minmax(56px,1fr))] gap-1 mb-1">
                  <div />
                  {[1, 2, 3, 4, 5].map((o) => (
                    <div
                      key={`o-${o}`}
                      className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1"
                    >
                      O{o}
                    </div>
                  ))}
                </div>

                {MATRIX.map((row) => (
                  <div
                    key={`s-${row[0].s}`}
                    className="grid grid-cols-[40px_repeat(5,minmax(56px,1fr))] gap-1 mb-1"
                  >
                    <div className="flex items-center justify-center text-[10px] font-bold text-slate-500">
                      S{row[0].s}
                    </div>
                    {row.map((cell) => {
                      const selected =
                        selectedCell?.s === cell.s && selectedCell?.o === cell.o;
                      const ap = getApFromSeverity(cell.s);
                      const rpnClass = cellToneClass(cell.tone, selected);
                      const apClass = `${ap.className} ${
                        selected ? "ring-2 ring-cyan-400 border-cyan-400" : ""
                      }`;
                      return (
                        <button
                          key={`${cell.s}-${cell.o}`}
                          type="button"
                          onClick={() => {
                            setSelectedCell(
                              selected ? null : { s: cell.s, o: cell.o }
                            );
                            setActiveFmeaTab(2);
                          }}
                          className={`h-14 rounded-lg border text-sm font-bold cursor-pointer transition-all hover:brightness-110 ${
                            scoringMode === "ap" ? apClass : rpnClass
                          }`}
                          title={`S${cell.s} × O${cell.o}`}
                        >
                          {scoringMode === "ap" ? ap.letter : cell.rpn}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500/50" /> Low
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/50" /> Medium
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/50" /> High
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500/50" /> Critical
              </span>
            </div>

            {selectedCell && (
              <p className="text-xs text-cyan-400 mt-3">
                Filter active: Severity {selectedCell.s} × Occurrence {selectedCell.o} —
                opening Telemetry-Linked FMECA…
              </p>
            )}
          </div>
        </>
      )}

      {/* ===== TAB 2: TELEMETRY-LINKED FMECA ===== */}
      {activeFmeaTab === 2 && (
        <div className={`${CARD} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-base font-bold text-white">
              Telemetry-Linked FMECA Worksheet
            </h3>
            {selectedCell ? (
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Clear matrix filter (S{selectedCell.s}×O{selectedCell.o})
              </button>
            ) : (
              <p className="text-xs text-slate-400">No saved FMEA worksheet rows</p>
            )}
          </div>

          <div className="w-full overflow-x-auto rounded-lg border border-white/10">
            {SAVED_FMECA_ROWS.length === 0 ? (
              <div className="py-16 text-center px-4">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  No FMEA entries saved for this asset.
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Run an FMEA workshop or import a worksheet when the FMEA persistence table is
                  available. The risk matrix above remains available as a scoring reference.
                </p>
              </div>
            ) : (
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-left text-[10px] uppercase tracking-widest">
                  <th className="px-3 py-2 font-bold">Item / Function</th>
                  <th className="px-3 py-2 font-bold">Failure Mode &amp; Effect</th>
                  <th className="px-3 py-2 font-bold">Initial (S × O × D)</th>
                  <th className="px-3 py-2 font-bold">Live Sensor Tag</th>
                  <th className="px-3 py-2 font-bold">Controls &amp; Mitigations</th>
                  <th className="px-3 py-2 font-bold">Residual (S′ × O′ × D′)</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedCell && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-3">
                      <div className="col-span-full py-12 text-center bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                        <p className="text-sm text-slate-300">
                          No failure modes mapped to this specific risk cell.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedCell(null)}
                          className="mt-3 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm cursor-pointer"
                        >
                          Show All Failure Modes
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10 align-top">
                      <td className="px-3 py-3 text-white font-medium whitespace-nowrap">
                        {row.item}
                      </td>
                      <td className="px-3 py-3 text-slate-300">{row.failureMode}</td>
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                        <span className="text-slate-400">
                          {row.initial.s} × {row.initial.o} × {row.initial.d} ={" "}
                        </span>
                        <span className={rpnTone(row.initial.rpn)}>{row.initial.rpn}</span>
                      </td>
                      <td className="px-3 py-3 text-cyan-400 text-xs">{row.sensorTag}</td>
                      <td className="px-3 py-3 text-slate-300 text-xs">{row.controls}</td>
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                        <span className="text-slate-400">
                          {row.residual.s} × {row.residual.o} × {row.residual.d} ={" "}
                        </span>
                        <span className={rpnTone(row.residual.rpn)}>
                          {row.residual.rpn}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${statusBadgeClass(
                            row.status
                          )}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB 3: P-F CURVE & CBM TASK MAPPER ===== */}
      {activeFmeaTab === 3 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">
            No P-F interval data on file.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            P-F curve pins populate from saved FMEA failure modes linked to live telemetry. Save an
            FMECA worksheet to map detection lead times here.
          </p>
        </section>
      )}

      {/* ===== TAB 4: RESIDUAL RISK ROI ===== */}
      {activeFmeaTab === 4 && (
        <section className={`${CARD} mb-6 text-center py-16 px-4`}>
          <p className="text-sm font-semibold text-slate-300 mb-1">
            No residual risk ROI calculated.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Financial exposure figures require saved FMECA rows with initial and residual RPN scores.
            No worksheet is on file yet.
          </p>
        </section>
      )}
    </div>
  );
}
