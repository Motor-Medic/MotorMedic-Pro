import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  History, Mail, ShieldCheck, RefreshCw, Clock, 
  AlertTriangle, ArrowRight, ShieldAlert, BadgeAlert, FileCheck
} from "lucide-react";
import { useToast } from "./Toast";

interface AlertLog {
  id: number;
  severity: string;
  sent_at: string;
  status: string;
  analysis_id?: number | null;
  analysis_time?: string | null;
  equipment_name?: string | null;
  fault_name?: string | null;
}

interface AlertHistoryProps {
  userId: number;
}

export default function AlertHistory({ userId }: AlertHistoryProps) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/history?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data || []);
      } else {
        showToast("Failed to fetch alert logs from backend.", "error");
      }
    } catch (err) {
      console.error("Error fetching alert history:", err);
      showToast("Unable to reach service to load logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  return (
    <div className="space-y-6" id="alert-history-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-yellow-400" />
            Alert Dispatch History Logs
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Audit trail of automatically triggered enterprise email notifications and API delivery statuses.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-xs font-semibold text-slate-300 transition-all duration-200 cursor-pointer disabled:opacity-50"
          id="refresh-history-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-yellow-400" : ""}`} />
          <span>Refresh Audit Logs</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Fetching real-time alert logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 border border-dashed border-slate-900 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3">
          <Mail className="w-10 h-10 text-slate-700" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">No Alert Activity Logged</h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-normal">
              No automated notification dispatches have occurred yet. Alerts are triggered when vibration diagnostics return High or Critical faults.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-slate-900 bg-slate-950/20 rounded-2xl overflow-hidden" id="alert-history-table-wrapper">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/40 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-3.5 px-4">Alert Event</th>
                  <th className="py-3.5 px-4">Asset Details</th>
                  <th className="py-3.5 px-4">Severity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-xs font-sans text-slate-300">
                {logs.map((log) => {
                  const isCritical = log.severity?.toLowerCase() === "critical";
                  const isHigh = log.severity?.toLowerCase() === "high";

                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className="hover:bg-slate-900/20 transition-colors"
                      id={`alert-log-row-${log.id}`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg shrink-0 ${
                            isCritical ? "bg-rose-950/30 text-rose-400" : isHigh ? "bg-amber-950/30 text-amber-400" : "bg-slate-900 text-slate-400"
                          }`}>
                            <Mail className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-200">Email Notification</span>
                            <span className="text-[10px] text-slate-500 font-mono block">Log ID: #{log.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-300">{log.equipment_name || "Enterprise Rotating Asset"}</span>
                          {log.fault_name && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-yellow-400/80" />
                              {log.fault_name}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          isCritical
                            ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                            : isHigh
                            ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}>
                          {log.severity || "High"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                          log.status?.toLowerCase() === "sent"
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                        }`}>
                          {log.status === "Sent" ? "✓ DISPATCHED" : "✗ FAILED"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-[10px] text-slate-500">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-600" />
                          <span>{new Date(log.sent_at).toLocaleString()}</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
