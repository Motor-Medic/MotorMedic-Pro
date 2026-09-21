import React, { useState, useEffect } from "react";
import {
  getEquipmentStore,
  type EquipComponent,
  type EquipAsset,
} from "../../data/equipmentDb";

const FAULTS_KEY = "spectra_reliability_faults_v1";

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

interface ComponentInfo {
  componentId: string;
  componentName: string;
  assetId: string;
  assetName: string;
  criticality: string | null;
  isoClass: string | undefined;
  hasVibData: boolean;
  hasIrData: boolean;
}

function collectComponents(): ComponentInfo[] {
  const store = getEquipmentStore();
  const result: ComponentInfo[] = [];
  for (const route of store.routes) {
    for (const asset of route.assets) {
      for (const comp of asset.components) {
        result.push({
          componentId: comp.id,
          componentName: comp.name,
          assetId: asset.id,
          assetName: asset.name,
          criticality: asset.criticality ?? null,
          isoClass: asset.isoClass,
          hasVibData: !!(comp.overallVibration || comp.trend30Days?.length),
          hasIrData: !!(comp.temperature),
        });
      }
    }
  }
  return result;
}

const MODALITIES = [
  { key: "vibration", label: "Vibration" },
  { key: "infrared", label: "Infrared" },
  { key: "ultrasound", label: "Ultrasound" },
  { key: "mca", label: "MCA" },
  { key: "oil_analysis", label: "Oil Analysis" },
] as const;

function daysSince(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86400000
  );
}

function windowLabel(days: number): string {
  if (days <= 30) return "30-day window";
  if (days <= 90) return "90-day window";
  if (days <= 182) return "6-month window";
  if (days <= 365) return "12-month window";
  const months = Math.round(days / 30);
  return `${months}-month window`;
}

interface CoverageBadActorsTabProps {
  selectedCompanyId: number;
}

export default function CoverageBadActorsTab({
  selectedCompanyId,
}: CoverageBadActorsTabProps) {
  const [faults, setFaults] = useState<FaultEntry[]>([]);
  const [components, setComponents] = useState<ComponentInfo[]>([]);

  useEffect(() => {
    setFaults(loadFaults());
    setComponents(collectComponents());
  }, []);

  const totalComponents = components.length;

  const modalityMonitored: Record<string, Set<string>> = {};
  for (const m of MODALITIES) modalityMonitored[m.key] = new Set();
  for (const f of faults) {
    modalityMonitored[f.modality]?.add(f.component);
  }

  const distinctMonitored = new Set<string>();
  for (const m of MODALITIES) {
    for (const name of modalityMonitored[m.key]) distinctMonitored.add(name);
  }

  const unmonitoredComponents = components.filter(
    (c) => !distinctMonitored.has(c.componentName)
  );

  const criticalFlaggedInHierarchy = components.filter(
    (c) =>
      c.criticality === "Critical" || c.isoClass === "Class I" || c.isoClass === "Class II"
  );

  const criticalBlindSpots = criticalFlaggedInHierarchy.filter(
    (c) => !MODALITIES.some((m) => modalityMonitored[m.key]?.has(c.componentName))
  );

  const assetFaultCounts: Record<
    string,
    { count: number; modalities: Set<string>; earliest: string; latest: string }
  > = {};
  for (const f of faults) {
    const key = f.asset;
    if (!assetFaultCounts[key]) {
      assetFaultCounts[key] = {
        count: 0,
        modalities: new Set(),
        earliest: f.firstSeen,
        latest: f.firstSeen,
      };
    }
    assetFaultCounts[key].count += 1;
    assetFaultCounts[key].modalities.add(f.modality);
    if (f.firstSeen < assetFaultCounts[key].earliest)
      assetFaultCounts[key].earliest = f.firstSeen;
    if (f.firstSeen > assetFaultCounts[key].latest)
      assetFaultCounts[key].latest = f.firstSeen;
  }

  const badActors = Object.entries(assetFaultCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* C1 DIAGNOSTIC COVERAGE */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          C1 — Diagnostic Coverage
        </h3>

        {totalComponents === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No components found in the equipment hierarchy.
          </p>
        ) : (
          <div className="space-y-2">
            {MODALITIES.map((m) => {
              const count = modalityMonitored[m.key].size;
              const pct =
                totalComponents > 0
                  ? Math.round((count / totalComponents) * 100)
                  : 0;
              return (
                <div
                  key={m.key}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="text-slate-300 w-28 shrink-0">
                    {m.label}
                  </span>
                  <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-slate-400 font-mono w-40 text-right">
                    {count} / {totalComponents} components ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {totalComponents > 0 && (
          <p className="text-[10px] text-slate-500 mt-2">
            Overall:{" "}
            {MODALITIES.reduce(
              (s, m) => s + modalityMonitored[m.key].size,
              0
            )}{" "}
            monitored component slots across{" "}
            {MODALITIES.filter((m) => modalityMonitored[m.key].size > 0).length}{" "}
            modalities of {totalComponents} total components.
          </p>
        )}

        {unmonitoredComponents.length > 0 && (
          <div className="mt-3 bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
            <p className="text-xs text-amber-400/80 italic">
              {unmonitoredComponents.length} of {totalComponents} components carry
              no diagnostic coverage in any modality.
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {unmonitoredComponents.slice(0, 10).map((c) => (
                <li key={c.componentId} className="text-[10px] text-slate-400">
                  {c.assetName} — {c.componentName}
                </li>
              ))}
              {unmonitoredComponents.length > 10 && (
                <li className="text-[10px] text-slate-500 italic">
                  +{unmonitoredComponents.length - 10} more
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {/* C2 CRITICAL BLIND SPOTS */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          C2 — Critical Blind Spots
        </h3>

        {criticalFlaggedInHierarchy.length === 0 ? (
          <p className="text-xs text-slate-300">
            No critical-flagged components in stored hierarchy.
          </p>
        ) : criticalBlindSpots.length === 0 ? (
          <p className="text-xs text-slate-300">
            No critical component lacks coverage.
          </p>
        ) : (
          <div className="space-y-1.5">
            {criticalBlindSpots.slice(0, 10).map((c) => (
              <div
                key={c.componentId}
                className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-center gap-2"
              >
                <span className="text-[10px] font-bold text-amber-400 uppercase bg-amber-400/10 px-1.5 py-0.5 rounded">
                  Blind Spot
                </span>
                <span className="text-xs text-white">
                  {c.assetName} — {c.componentName}
                </span>
                <span className="text-[10px] text-slate-500">
                  {c.criticality ?? c.isoClass ?? "critical-flagged"}
                </span>
              </div>
            ))}
            {criticalBlindSpots.length > 10 && (
              <p className="text-[10px] text-slate-500 italic">
                +{criticalBlindSpots.length - 10} more critical blind spots
              </p>
            )}
            <p className="text-[10px] text-slate-500 italic">
              Guidance flag, not a diagnosis.
            </p>
          </div>
        )}
      </section>

      {/* C3 BAD ACTORS */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          C3 — Bad Actors (Recurring Faults)
        </h3>

        {badActors.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No fault entries recorded in the ledger.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 uppercase font-bold px-3 pb-1">
              <span className="col-span-1">#</span>
              <span className="col-span-4">Asset</span>
              <span className="col-span-2">Faults</span>
              <span className="col-span-2">Window</span>
              <span className="col-span-3">Modalities</span>
            </div>
            {badActors.map(([assetName, info], idx) => {
              const spanDays =
                daysSince(info.latest) - daysSince(info.earliest);
              const isThin = info.count < 2;
              const span = isThin
                ? `single fault ${new Date(info.earliest).toLocaleDateString()} — no span`
                : windowLabel(Math.abs(spanDays) + 1);
              const modList = Array.from(info.modalities).join(", ");
              return (
                <div
                  key={assetName}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30 text-xs"
                >
                  <span className="col-span-1 text-slate-500 font-mono">
                    {idx + 1}
                  </span>
                  <span className="col-span-4 text-white">{assetName}</span>
                  <span className="col-span-2 text-slate-300 font-mono">
                    {info.count}
                  </span>
                  <span className="col-span-2 text-slate-400">{span}</span>
                  <span className="col-span-3 text-slate-400 text-[10px]">
                    {isThin ? (
                      <span className="italic">
                        single-occurrence faults only — recurrence not
                        established
                      </span>
                    ) : (
                      modList
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-[10px] text-slate-500 italic">
          Coverage is derived from the stored equipment hierarchy and the
          fault ledger. Components without fault entries or diagnostic
          metadata in any modality are counted as unmonitored. Bad-actor
          ranking is by raw fault count, not severity-weighted.
        </p>
        <p className="text-[10px] text-slate-500">
          Watchlist:{" "}
          {badActors.length > 0
            ? badActors
                .slice(0, 5)
                .map(([name, info]) => `${name} (${info.count})`)
                .join(", ")
            : "none"}
        </p>
      </footer>
    </div>
  );
}
