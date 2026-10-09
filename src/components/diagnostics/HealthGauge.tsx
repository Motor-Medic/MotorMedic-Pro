import { TrendingDown } from "lucide-react";
import {
  DIAGNOSE_HEALTH_SCORE_SOURCE,
  DIAGNOSE_NOT_RECORDED,
  DIAGNOSE_SEVERITY_NOT_COMPUTED
} from "../../lib/maintenance/prescriptiveDictionary";

export interface HealthGaugeProps {
  gaugeScore: number;
  apiSeverity: string | null;
}

export default function HealthGauge({
  gaugeScore,
  apiSeverity
}: HealthGaugeProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-5 flex flex-col">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Overall Health Score
      </p>
      <div className="mt-4 flex items-center gap-4 flex-1">
        <div className="relative h-28 w-28 shrink-0">
          <svg
            viewBox="0 0 36 36"
            className={`h-full w-full -rotate-90 ${
              apiSeverity === "NORMAL"
                ? "drop-shadow-[0_0_16px_rgba(16,185,129,0.35)]"
                : apiSeverity === "ANOMALY"
                  ? "drop-shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                  : apiSeverity == null
                    ? "drop-shadow-[0_0_12px_rgba(148,163,184,0.25)]"
                    : "drop-shadow-[0_0_16px_rgba(239,68,68,0.4)]"
            }`}
          >
            <defs>
              <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                <stop
                  offset="0%"
                  stopColor={
                    apiSeverity === "NORMAL"
                      ? "#34d399"
                      : apiSeverity === "ANOMALY"
                        ? "#fbbf24"
                        : apiSeverity == null
                          ? "#94a3b8"
                          : "#f97316"
                  }
                />
                <stop
                  offset="100%"
                  stopColor={
                    apiSeverity === "NORMAL"
                      ? "#10b981"
                      : apiSeverity === "ANOMALY"
                        ? "#f59e0b"
                        : apiSeverity == null
                          ? "#64748b"
                          : "#ef4444"
                  }
                />
              </linearGradient>
            </defs>
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#1e293b"
              strokeWidth="3.5"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="url(#healthGrad)"
              strokeWidth="3.5"
              strokeDasharray={
                Number.isFinite(gaugeScore)
                  ? `${gaugeScore}, 100`
                  : "0, 100"
              }
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 80ms linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`text-2xl font-black leading-none text-center break-words px-1 ${
                apiSeverity === "NORMAL"
                  ? "text-emerald-400"
                  : apiSeverity === "ANOMALY"
                    ? "text-amber-400"
                    : apiSeverity == null
                      ? "text-slate-300"
                      : "text-red-500"
              }`}
            >
              {Number.isFinite(gaugeScore)
                ? gaugeScore
                : DIAGNOSE_NOT_RECORDED}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p
            className={`text-xl font-bold break-words ${
              apiSeverity === "NORMAL"
                ? "text-emerald-400"
                : apiSeverity === "ANOMALY"
                  ? "text-amber-400"
                  : apiSeverity == null
                    ? "text-slate-300"
                    : "text-red-500"
            }`}
          >
            {Number.isFinite(gaugeScore)
              ? `${gaugeScore} / 100`
              : DIAGNOSE_NOT_RECORDED}
          </p>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            {apiSeverity == null
              ? DIAGNOSE_SEVERITY_NOT_COMPUTED
              : apiSeverity === "CRITICAL"
                ? "Immediate attention required."
                : apiSeverity === "ANOMALY"
                  ? "Elevated risk — plan corrective action."
                  : "Within acceptable operating envelope."}{" "}
            {apiSeverity === "CRITICAL" && (
              <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                <TrendingDown className="h-3.5 w-3.5" />
                Priority repair window.
              </span>
            )}
          </p>
          <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
            {DIAGNOSE_HEALTH_SCORE_SOURCE}
          </p>
        </div>
      </div>
    </div>
  );
}
