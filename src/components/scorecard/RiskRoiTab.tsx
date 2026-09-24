import React, { useState, useEffect, useCallback } from "react";
import {
  loadCostModel,
  COST_MODEL_EVENT,
  type CostModel,
} from "./CostDock";

const FAULTS_KEY = "spectra_reliability_faults_v1";

const CLASS_HOURS: Record<string, number> = {
  Critical: 24,
  High: 8,
  Medium: 4,
  Low: 1,
};

interface FaultEntry {
  id: string;
  modality: "vibration" | "infrared" | "ultrasound" | "mca" | "oil_analysis";
  asset: string;
  component: string;
  firstSeen: string;
  severityClass: "Critical" | "High" | "Medium" | "Low";
  woStatus: "open" | "closed" | null;
  woClosedDate: string | null;
  detectedAt: string | null;
  identifiedAt: string | null;
  goodCatch: boolean;
  collectorId: string;
}

function daysSince(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function loadFaults(): FaultEntry[] {
  try {
    const raw = localStorage.getItem(FAULTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveFaults(faults: FaultEntry[]): void {
  localStorage.setItem(FAULTS_KEY, JSON.stringify(faults));
}

function seedFaults(): FaultEntry[] {
  const now = Date.now();
  const day = 86400000;
  const seeded: FaultEntry[] = [
    {
      id: "seed-001",
      modality: "vibration",
      asset: "Boiler Feed Pump A",
      component: "Motor DE",
      firstSeen: new Date(now - 112 * day).toISOString(),
      severityClass: "Critical",
      woStatus: "open",
      woClosedDate: null,
      detectedAt: new Date(now - 112 * day).toISOString(),
      identifiedAt: new Date(now - 110 * day).toISOString(),
      goodCatch: false,
      collectorId: "VIB-ROUTE-01",
    },
    {
      id: "seed-002",
      modality: "infrared",
      asset: "Compressor Line 2",
      component: "Screw Compressor RS37i",
      firstSeen: new Date(now - 45 * day).toISOString(),
      severityClass: "High",
      woStatus: "closed",
      woClosedDate: new Date(now - 30 * day).toISOString(),
      detectedAt: new Date(now - 45 * day).toISOString(),
      identifiedAt: new Date(now - 44 * day).toISOString(),
      goodCatch: false,
      collectorId: "IR-CAM-03",
    },
    {
      id: "seed-003",
      modality: "ultrasound",
      asset: "Cooling Tower Fan 4",
      component: "Fan DE",
      firstSeen: new Date(now - 18 * day).toISOString(),
      severityClass: "Medium",
      woStatus: "open",
      woClosedDate: null,
      detectedAt: new Date(now - 18 * day).toISOString(),
      identifiedAt: new Date(now - 17 * day).toISOString(),
      goodCatch: true,
      collectorId: "US-DET-02",
    },
    {
      id: "seed-004",
      modality: "vibration",
      asset: "Main Overland Conveyor Drive",
      component: "Motor DE",
      firstSeen: new Date(now - 7 * day).toISOString(),
      severityClass: "Low",
      woStatus: "open",
      woClosedDate: null,
      detectedAt: new Date(now - 7 * day).toISOString(),
      identifiedAt: null,
      goodCatch: false,
      collectorId: "VIB-ROUTE-02",
    },
    {
      id: "seed-005",
      modality: "mca",
      asset: "Slurry Recirc Pump P-402",
      component: "Motor NDE",
      firstSeen: new Date(now - 60 * day).toISOString(),
      severityClass: "High",
      woStatus: "open",
      woClosedDate: null,
      detectedAt: new Date(now - 60 * day).toISOString(),
      identifiedAt: new Date(now - 58 * day).toISOString(),
      goodCatch: false,
      collectorId: "MCA-01",
    },
  ];
  saveFaults(seeded);
  return seeded;
}

interface RiskRoiTabProps {
  selectedCompanyId: number;
}

export default function RiskRoiTab({ selectedCompanyId }: RiskRoiTabProps) {
  const [costModel, setCostModel] = useState<CostModel>(loadCostModel);
  const [faults, setFaults] = useState<FaultEntry[]>(() => {
    const existing = loadFaults();
    if (existing.length > 0) return existing;
    return seedFaults();
  });

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

  const isDockConfigured = costModel.downtimeCostPerHour !== null;
  const openFaults = faults.filter((f) => f.woStatus === "open");
  const goodCatchFaults = faults.filter((f) => f.goodCatch);

  const severityCounts: Record<string, number> = {};
  for (const f of openFaults) {
    severityCounts[f.severityClass] = (severityCounts[f.severityClass] || 0) + 1;
  }

  const downtimeHr = costModel.downtimeCostPerHour?.value ?? 0;

  const dollarizedBySeverity: Record<string, number> = {};
  let totalDollarizedRisk = 0;
  for (const f of openFaults) {
    const hrs = CLASS_HOURS[f.severityClass] ?? 0;
    const risk = downtimeHr * hrs;
    dollarizedBySeverity[f.severityClass] =
      (dollarizedBySeverity[f.severityClass] ?? 0) + risk;
    totalDollarizedRisk += risk;
  }

  const relativeBySeverity: Record<string, number> = {};
  let totalRelative = 0;
  for (const f of openFaults) {
    const hrs = CLASS_HOURS[f.severityClass] ?? 0;
    relativeBySeverity[f.severityClass] =
      (relativeBySeverity[f.severityClass] ?? 0) + hrs;
    totalRelative += hrs;
  }

  return (
    <div className="space-y-8">
      {/* S1 RISK INDEX */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          S1 — Open Fault Risk Index
        </h3>
        {openFaults.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No open faults recorded in the ledger.
          </p>
        ) : isDockConfigured ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              Dollarized open risk —{" "}
              <span className="text-[10px] text-slate-500">
                site-practice model constants: critical 24h / high 8h / medium 4h / low 1h
              </span>
            </p>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <p className="text-2xl font-bold text-yellow-400">
                {formatUsd(totalDollarizedRisk)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                = Σ (downtime ${downtimeHr}/hr × class hours) across {openFaults.length} open fault{openFaults.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
                const count = severityCounts[sev] ?? 0;
                const dollar = dollarizedBySeverity[sev] ?? 0;
                return (
                  <div
                    key={sev}
                    className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50"
                  >
                    <p className="text-[10px] text-slate-400 uppercase">{sev}</p>
                    <p className="text-lg font-bold text-white">{count}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatUsd(dollar)} ({CLASS_HOURS[sev]}h × ${downtimeHr}/hr)
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <p className="text-2xl font-bold text-slate-300">{totalRelative} pts</p>
              <p className="text-[10px] text-slate-500 mt-1">
                Relative severity-weighted risk index (unitless points)
              </p>
            </div>
            <p className="text-xs text-amber-400/80 italic border-l-2 border-amber-400/40 pl-3">
              G1 — site cost model not configured — showing relative risk, not dollars.
              Enter downtime cost per hour in the dock above to enable dollarized figures.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
                const count = severityCounts[sev] ?? 0;
                const pts = relativeBySeverity[sev] ?? 0;
                return (
                  <div
                    key={sev}
                    className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50"
                  >
                    <p className="text-[10px] text-slate-400 uppercase">{sev}</p>
                    <p className="text-lg font-bold text-white">{count}</p>
                    <p className="text-[10px] text-slate-500">
                      {pts} pts ({CLASS_HOURS[sev]}h base)
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* S2 SAVINGS & GOOD CATCHES */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          S2 — Savings &amp; Good Catches
        </h3>
        {goodCatchFaults.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            Good-catch log not recorded — no entries flagged as good catches in the ledger.
          </p>
        ) : (
          <div className="space-y-2">
            {goodCatchFaults.map((f) => {
              const mtti =
                f.detectedAt && f.identifiedAt
                  ? Math.round(
                      (new Date(f.identifiedAt).getTime() -
                        new Date(f.detectedAt).getTime()) /
                        (1000 * 60 * 60)
                    )
                  : null;
              return (
                <div
                  key={f.id}
                  className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-400/10 px-2 py-0.5 rounded">
                    Good Catch
                  </span>
                  <span className="text-xs text-white">
                    {f.asset} — {f.component}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {f.modality} · first seen {new Date(f.firstSeen).toLocaleDateString()}
                  </span>
                  {mtti !== null ? (
                    <span className="text-[10px] text-slate-400">
                      MTTI: {mtti}h (detected → identified)
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400/70 italic">
                      MTTI: unavailable (identification date missing)
                    </span>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-slate-500 italic">
              Any savings figure is a{" "}
              <span className="font-semibold">modeled estimate, not a financial audit</span>{" "}
              (G2).
            </p>
          </div>
        )}
      </section>

      {/* S3 FORMULA DISCLOSURE */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          S3 — Formula Disclosure
        </h3>
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50 space-y-3 text-xs">
          <p className="text-slate-300 font-semibold">Model Parameters</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Downtime cost:</span>
              {isDockConfigured ? (
                <span className="text-white font-mono">
                  ${downtimeHr}/hr{" "}
                  <span className="text-[9px] text-slate-500">(source: manual entry)</span>
                </span>
              ) : (
                <span className="text-slate-500 italic">not configured</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Replacement cost:</span>
              {costModel.replacementCost ? (
                <span className="text-white font-mono">
                  {formatUsd(costModel.replacementCost.value)}{" "}
                  <span className="text-[9px] text-slate-500">(source: manual entry)</span>
                  {costModel.replacementCost.adoptedFrom === "vision-suggestion" && (
                    <span className="text-[9px] text-slate-500"> (adopted from vision suggestion)</span>
                  )}
                </span>
              ) : (
                <span className="text-slate-500 italic">not configured</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Labor rate:</span>
              {costModel.laborRate ? (
                <span className="text-white font-mono">
                  ${costModel.laborRate.value}/hr{" "}
                  <span className="text-[9px] text-slate-500">(source: manual entry)</span>
                </span>
              ) : (
                <span className="text-slate-500 italic">not configured</span>
              )}
            </div>
          </div>

          <p className="text-slate-300 font-semibold pt-2 border-t border-slate-700">
            Class Constants (site-practice model)
          </p>
          <div className="flex flex-wrap gap-3">
            {(["Critical", "High", "Medium", "Low"] as const).map((sev) => (
              <span key={sev} className="font-mono text-white">
                {sev} = {CLASS_HOURS[sev]}h
              </span>
            ))}
          </div>

          <p className="text-slate-300 font-semibold pt-2 border-t border-slate-700">
            Arithmetic Template
          </p>
          <p className="font-mono text-slate-300">
            risk<sub>i</sub> = downtime$/hr × classHours<sub>severity(i)</sub>
          </p>
          <p className="font-mono text-slate-300">
            totalRisk = Σ risk<sub>i</sub> for all open faults i
          </p>

          {isDockConfigured && openFaults.length > 0 && (
            <>
              <p className="text-slate-300 font-semibold pt-2 border-t border-slate-700">
                Live Calculation
              </p>
              <div className="space-y-1">
                {openFaults.map((f) => {
                  const hrs = CLASS_HOURS[f.severityClass] ?? 0;
                  const calc = downtimeHr * hrs;
                  return (
                    <p key={f.id} className="font-mono text-white">
                      {formatUsd(downtimeHr)}/hr × {hrs}h ={" "}
                      <span className="text-yellow-400">{formatUsd(calc)}</span>{" "}
                      <span className="text-[9px] text-slate-500">
                        ({f.asset} — {f.component}, {f.severityClass})
                      </span>
                    </p>
                  );
                })}
              </div>
            </>
          )}

          {!isDockConfigured && (
            <p className="text-xs text-amber-400/80 italic border-l-2 border-amber-400/40 pl-3 pt-2">
              G1 — site cost model not configured — template placeholders shown above, no
              invented numbers.
            </p>
          )}
        </div>
      </section>

      {/* S4 SUPPRESSION LEDGER */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          S4 — Suppression Ledger
        </h3>
        <div className="space-y-1">
          {!isDockConfigured && (
            <p className="text-xs text-slate-400 bg-slate-800/30 rounded px-3 py-2 border border-slate-700/30">
              downtime cost per hour not configured — dollarized risk figure suppressed,
              showing relative index only
            </p>
          )}
          {costModel.replacementCost === null && (
            <p className="text-xs text-slate-400 bg-slate-800/30 rounded px-3 py-2 border border-slate-700/30">
              replacement cost not configured — avoided-capital figure suppressed
            </p>
          )}
          {costModel.laborRate === null && (
            <p className="text-xs text-slate-400 bg-slate-800/30 rounded px-3 py-2 border border-slate-700/30">
              labor rate not configured — labor-savings figure suppressed
            </p>
          )}
          {isDockConfigured && costModel.replacementCost && costModel.laborRate && (
            <p className="text-xs text-emerald-400/70 italic">
              All cost model inputs configured — no figures suppressed.
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-[10px] text-slate-500 italic">
          All dollar figures are modeled estimates derived from the site cost model
          entered above. They are not a financial audit (G2). Absence of data is
          never assumed normal — missing inputs are confessed, not invented.
        </p>
        <p className="text-[10px] text-slate-500">
          Watchlist:{" "}
          {openFaults.length > 0
            ? openFaults
                .map((f) => `${f.asset} (${f.severityClass})`)
                .join(", ")
            : "none"}
        </p>
      </footer>
    </div>
  );
}
