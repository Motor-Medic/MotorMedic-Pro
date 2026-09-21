import React, { useState, useEffect } from "react";

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

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const s = new Date(start.getFullYear(), start.getMonth(), 1);
  const e = new Date(end.getFullYear(), end.getMonth(), 1);
  while (s <= e) {
    months.push(`${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`);
    s.setMonth(s.getMonth() + 1);
  }
  return months;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function daysSince(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (86400000)
  );
}

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

const SEV_COLORS: Record<string, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-400",
  Medium: "bg-yellow-400",
  Low: "bg-slate-500",
};

interface BacklogVelocityTabProps {
  selectedCompanyId: number;
}

export default function BacklogVelocityTab({
  selectedCompanyId,
}: BacklogVelocityTabProps) {
  const [faults, setFaults] = useState<FaultEntry[]>([]);

  useEffect(() => {
    setFaults(loadFaults());
  }, []);

  const now = Date.now();

  const openFaults = faults.filter((f) => f.woStatus === "open");
  const closedFaults = faults.filter((f) => f.woStatus === "closed");

  const ageBuckets = ["<3 months", "3\u20136 months", "6\u201312 months", ">12 months"] as const;

  function bucketIndex(days: number): number {
    if (days < 90) return 0;
    if (days < 180) return 1;
    if (days < 365) return 2;
    return 3;
  }

  const bucketData: Record<string, Record<string, number>> = {};
  for (const b of ageBuckets) bucketData[b] = {};
  for (const f of openFaults) {
    const age = daysSince(f.firstSeen);
    const b = ageBuckets[bucketIndex(age)];
    bucketData[b][f.severityClass] =
      (bucketData[b][f.severityClass] ?? 0) + 1;
  }

  const criticalOver90 = openFaults.filter(
    (f) => f.severityClass === "Critical" && daysSince(f.firstSeen) > 90
  );

  const allFaultsWithDates = faults.filter(
    (f) => f.firstSeen || f.woClosedDate
  );

  const earliest = allFaultsWithDates.reduce(
    (min, f) => {
      const d = f.firstSeen
        ? new Date(f.firstSeen).getTime()
        : Infinity;
      return d < min ? d : min;
    },
    Infinity
  );
  const latest = allFaultsWithDates.reduce(
    (max, f) => {
      const dates = [f.firstSeen, f.woClosedDate].filter(Boolean);
      const d = dates.reduce(
        (m, s) => Math.max(m, new Date(s!).getTime()),
        0
      );
      return d > max ? d : max;
    },
    0
  );

  const monthKeys =
    earliest !== Infinity && latest > 0
      ? monthsBetween(new Date(earliest), new Date(latest))
      : [];

  const newByMonth: Record<string, number> = {};
  for (const f of faults) {
    if (f.firstSeen) {
      const mk = monthKey(f.firstSeen);
      newByMonth[mk] = (newByMonth[mk] ?? 0) + 1;
    }
  }

  const implementedByMonth: Record<string, number> = {};
  const closedMonthsMissingDate: string[] = [];
  for (const f of closedFaults) {
    if (f.woClosedDate) {
      const mk = monthKey(f.woClosedDate);
      implementedByMonth[mk] = (implementedByMonth[mk] ?? 0) + 1;
    } else {
      closedMonthsMissingDate.push(f.id);
    }
  }

  const trailing3 = monthKeys.slice(-3);
  const newTrailing3 = trailing3.reduce((s, m) => s + (newByMonth[m] ?? 0), 0);
  const implTrailing3 = trailing3.reduce(
    (s, m) => s + (implementedByMonth[m] ?? 0),
    0
  );
  const isFallingBehind = newTrailing3 > implTrailing3 && trailing3.length > 0;

  const maxBar = Math.max(
    1,
    ...monthKeys.map(
      (m) => (newByMonth[m] ?? 0) + (implementedByMonth[m] ?? 0)
    )
  );

  return (
    <div className="space-y-8">
      {/* P1 AGING MATRIX */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          P1 \u2014 Fault Aging Matrix
        </h3>
        <p className="text-[10px] text-slate-500 mb-4">
          Open faults age to today; closed faults age to work-order close.
        </p>

        <div className="space-y-3">
          {ageBuckets.map((bucket) => {
            const counts = bucketData[bucket];
            const total = SEVERITIES.reduce(
              (s, sev) => s + (counts[sev] ?? 0),
              0
            );
            if (total === 0) return null;
            return (
              <div key={bucket} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-24 shrink-0">
                  {bucket}
                </span>
                <div className="flex-1 flex items-center gap-0.5 h-6">
                  {SEVERITIES.map((sev) => {
                    const c = counts[sev] ?? 0;
                    if (c === 0) return null;
                    const pct = (c / total) * 100;
                    return (
                      <div
                        key={sev}
                        className={`${SEV_COLORS[sev]} h-full rounded-sm`}
                        style={{ width: `${pct}%` }}
                        title={`${sev}: ${c}`}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-slate-300 font-mono w-8 text-right">
                  {total}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-3">
          {SEVERITIES.map((sev) => (
            <span key={sev} className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEV_COLORS[sev]}`} />
              {sev}
            </span>
          ))}
        </div>

        {criticalOver90.length > 0 && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-400 font-semibold">
              Unaddressed critical fault{criticalOver90.length !== 1 ? "s" : ""}{" "}
              exceeding 90 days \u2014 structural failure risk compounding
              (guidance flag, not a diagnosis)
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {criticalOver90.map((f) => (
                <li key={f.id} className="text-[10px] text-amber-300/70">
                  {f.asset} \u2014 {f.component} ({daysSince(f.firstSeen)}d
                  open, first seen{" "}
                  {new Date(f.firstSeen).toLocaleDateString()})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* P2 EXECUTION VELOCITY */}
      <section>
        <h3 className="text-sm font-bold text-white mb-3">
          P2 \u2014 Execution Velocity
        </h3>
        <p className="text-[10px] text-slate-500 mb-4">
          New faults (firstSeen) vs implemented work orders (woClosedDate) per
          month.
        </p>

        {monthKeys.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No fault entries with dates recorded \u2014 velocity cannot be
            computed.
          </p>
        ) : (
          <div className="space-y-1">
            {monthKeys.map((mk) => {
              const n = newByMonth[mk] ?? 0;
              const impl = implementedByMonth[mk];
              const hasImpl = impl !== undefined;
              const nPct = (n / maxBar) * 100;
              const iPct = hasImpl ? (impl / maxBar) * 100 : 0;

              return (
                <div key={mk} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 w-16 shrink-0">
                    {labelMonth(mk)}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <div
                        className="h-3 bg-cyan-500 rounded-sm"
                        style={{ width: `${nPct}%`, minWidth: n > 0 ? 4 : 0 }}
                        title={`New: ${n}`}
                      />
                      <span className="text-[9px] text-cyan-400 font-mono">
                        {n > 0 ? n : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasImpl ? (
                        <>
                          <div
                            className="h-3 bg-emerald-500 rounded-sm"
                            style={{
                              width: `${iPct}%`,
                              minWidth: impl > 0 ? 4 : 0,
                            }}
                            title={`Implemented: ${impl}`}
                          />
                          <span className="text-[9px] text-emerald-400 font-mono">
                            {impl > 0 ? impl : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-[9px] text-slate-600 italic">
                          close date not recorded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-cyan-500" />
            New (firstSeen)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Implemented (woClosedDate)
          </span>
        </div>

        {isFallingBehind && (
          <p className="text-xs text-amber-400/80 italic mt-3 border-l-2 border-amber-400/40 pl-3">
            Corrective work is falling behind detection over the trailing 3
            months (guidance).
          </p>
        )}

        {closedMonthsMissingDate.length > 0 && (
          <p className="text-[10px] text-slate-500 mt-2 italic">
            {closedMonthsMissingDate.length} closed fault
            {closedMonthsMissingDate.length !== 1 ? "s" : ""} lack
            woClosedDate \u2014 counted in new series only, gap in implemented
            series.
          </p>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-[10px] text-slate-500 italic">
          Aging is computed from firstSeen (open) or woClosedDate (closed).
          Velocity gaps indicate months where close data was not recorded,
          not months with zero implementations.
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
