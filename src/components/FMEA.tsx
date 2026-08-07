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

const FMECA_ROWS: FmecaRow[] = [
  {
    id: "seal",
    item: "Mechanical Seal",
    failureMode: "Intermittent leak → Fluid loss",
    initial: { s: 7, o: 4, d: 6, rpn: 168 },
    sensorTag: "Vibration RMS #2, Oil Debris #1",
    controls: "Upgrade to Plan 53B, online filtration",
    residual: { s: 7, o: 2, d: 2, rpn: 28 },
    status: "normal",
    statusLabel: "🟢 Normal",
    matrixS: 4,
    matrixO: 4
  },
  {
    id: "bearing",
    item: "Pump NDE Bearing",
    failureMode: "Outer race spalling → High vibration",
    initial: { s: 8, o: 3, d: 4, rpn: 96 },
    sensorTag: "Ultrasound gSE #1, Temp #3",
    controls: "Precision lubrication protocol",
    residual: { s: 8, o: 1, d: 2, rpn: 16 },
    status: "warning",
    statusLabel: "🟡 Warning",
    matrixS: 5,
    matrixO: 3
  },
  {
    id: "coupling",
    item: "Coupling",
    failureMode: "Misalignment → Shaft stress",
    initial: { s: 6, o: 5, d: 5, rpn: 150 },
    sensorTag: "2X Harmonics Trend",
    controls: "Laser alignment check",
    residual: { s: 6, o: 2, d: 2, rpn: 24 },
    status: "alarm",
    statusLabel: "🔴 Alarm Triggered",
    matrixS: 3,
    matrixO: 5
  }
];

const PF_PINS = [
  {
    label: "NDE Bearing",
    left: "18%",
    title: "NDE Bearing Spalling",
    leadTime: "Lead Time to Failure: ~75 Days",
    detection: "Primary Detection: Peak gSE Ultrasound / High-Freq Vib"
  },
  {
    label: "Mechanical Seal",
    left: "42%",
    title: "Mechanical Seal Leak Path",
    leadTime: "Lead Time to Failure: ~45 Days",
    detection: "Primary Detection: Vibration RMS #2 / Oil Debris"
  },
  {
    label: "Coupling",
    left: "68%",
    title: "Coupling Misalignment",
    leadTime: "Lead Time to Failure: ~20 Days",
    detection: "Primary Detection: 2X Harmonics Trend / Laser Alignment"
  }
];

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
    if (!selectedCell) return FMECA_ROWS;
    return FMECA_ROWS.filter(
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
              <div className={PILL}>ASSET: Boiler Feed Pump A (P-101A)</div>
              <div className={PILL}>COMPONENT: Motor DE</div>
              <div className={PILL}>MODES: 3 Active</div>
              <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold">
                MAX RPN: 168 (Mechanical Seal)
              </div>
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
          <p className="mt-3 text-xs text-cyan-300">
            AI populated 3 failure modes from live vibration, ultrasound, and oil telemetry
            tags.
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
              <p className="text-xs text-slate-400">Showing all active failure modes</p>
            )}
          </div>

          <div className="w-full overflow-x-auto rounded-lg border border-white/10">
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
          </div>
        </div>
      )}

      {/* ===== TAB 3: P-F CURVE & CBM TASK MAPPER ===== */}
      {activeFmeaTab === 3 && (
        <>
          <div className={`${CARD} mb-6 overflow-visible`}>
            <h3 className="text-base font-bold text-white mb-1">P-F Interval Visualizer</h3>
            <p className="text-xs text-slate-400 mb-6">
              Point of Potential Failure → Functional Failure detection window
            </p>

            <div className="relative mb-10">
              <div className="flex h-10 w-full overflow-hidden rounded-lg border border-white/10">
                <div
                  className="h-full bg-green-500/70 flex items-center justify-center text-[10px] font-bold text-slate-950 px-1"
                  style={{ width: "30%" }}
                  title="Ultrasound Stage"
                >
                  UE 60–90d
                </div>
                <div
                  className="h-full bg-yellow-500/80 flex items-center justify-center text-[10px] font-bold text-slate-950 px-1"
                  style={{ width: "30%" }}
                  title="Vibration Analysis Stage"
                >
                  Vib 30–60d
                </div>
                <div
                  className="h-full bg-orange-500/80 flex items-center justify-center text-[10px] font-bold text-slate-950 px-1"
                  style={{ width: "25%" }}
                  title="Thermal / Oil Analysis Stage"
                >
                  IR/Oil 10–30d
                </div>
                <div
                  className="h-full bg-red-500/80 flex items-center justify-center text-[10px] font-bold text-slate-950 px-1"
                  style={{ width: "15%" }}
                  title="Audible Noise / Heat Stage"
                >
                  1–10d
                </div>
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 mt-2">
                <span>P — Potential Failure</span>
                <span>F — Functional Failure</span>
              </div>

              <div className="relative h-24 mt-4 overflow-visible">
                {PF_PINS.map((pin) => (
                  <div
                    key={pin.label}
                    className="group absolute flex flex-col items-center"
                    style={{ left: pin.left, transform: "translateX(-50%)" }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-900 border border-white/10 rounded-lg p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <p className="text-sm font-bold text-white mb-1">{pin.title}</p>
                      <p className="text-xs text-slate-300 mb-1">{pin.leadTime}</p>
                      <p className="text-xs text-cyan-400">{pin.detection}</p>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900" />
                    </div>
                    <div className="w-0.5 h-4 bg-white/70" />
                    <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-950" />
                    <p className="text-[10px] text-cyan-300 font-semibold mt-1 whitespace-nowrap">
                      {pin.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Ultrasound (60–90 Days)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Vibration (30–60 Days)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Thermal / Oil (10–30 Days)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Audible / Heat (1–10 Days)
              </span>
            </div>
          </div>

          <div className={`${CARD} mb-6 text-center`}>
            <button
              type="button"
              onClick={() =>
                alert("Generating CBM inspection route in CMMS for high-risk modes…")
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold cursor-pointer transition-colors"
            >
              ➕ Generate CBM Task in CMMS
            </button>
            <p className="text-xs text-slate-400 mt-3 max-w-xl mx-auto">
              Translates high-risk failure modes into automated recurring maintenance
              inspection routes.
            </p>
          </div>
        </>
      )}

      {/* ===== TAB 4: RESIDUAL RISK ROI ===== */}
      {activeFmeaTab === 4 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div className={CARD}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                Risk Reduction
              </p>
              <div className="space-y-3">
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400">
                    Initial Total Risk Exposure (Sum of RPNs)
                  </span>
                  <span className="text-sm font-bold text-white">408</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400">
                    Residual Risk Exposure (Post-Mitigation)
                  </span>
                  <span className="text-sm font-bold text-white">84</span>
                </div>
                <p className="text-2xl font-bold text-green-400 pt-2">
                  Overall Risk Reduction: 79.4%
                </p>
              </div>
            </div>

            <div className={CARD}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                Financial Impact
              </p>
              <div className="space-y-3">
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400">Unmitigated Financial Exposure</span>
                  <span className="text-sm font-bold text-red-500">$240,000 / yr</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400">
                    Mitigated Financial Risk Exposure
                  </span>
                  <span className="text-sm font-bold text-green-400">$35,000 / yr</span>
                </div>
                <p className="text-2xl font-bold text-cyan-400 pt-2">
                  Net Risk Value Created: $205,000 / yr
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-6">
            Based on average cost of unplanned downtime and component replacement for this
            asset class.
          </p>
        </>
      )}
    </div>
  );
}
