import React from "react";
import { Wrench } from "lucide-react";

interface MaintenanceLogsSectionProps {
  quickAnalysisMode: boolean;
  selectedAssetId: number | "";
  maintenanceLogs: any[];
  isAddingLog: boolean;
  setIsAddingLog: (val: boolean) => void;
  newLog: {
    work_date: string;
    work_type: string;
    technician_name: string;
    notes: string;
    parts_used: string;
  };
  setNewLog: React.Dispatch<React.SetStateAction<{
    work_date: string;
    work_type: string;
    technician_name: string;
    notes: string;
    parts_used: string;
  }>>;
  handleAddMaintenanceLog: (e: React.FormEvent) => void;
}

export default function MaintenanceLogsSection({
  quickAnalysisMode,
  selectedAssetId,
  maintenanceLogs,
  isAddingLog,
  setIsAddingLog,
  newLog,
  setNewLog,
  handleAddMaintenanceLog
}: MaintenanceLogsSectionProps) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <Wrench className="w-3.5 h-3.5 text-yellow-400" />
            Maintenance Logs
          </h3>
          <p className="text-[10px] text-slate-500 font-mono">Past field service history</p>
        </div>
        
        {!quickAnalysisMode && selectedAssetId && (
          <button
            type="button"
            onClick={() => setIsAddingLog(!isAddingLog)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-yellow-400 border border-slate-700 font-bold text-[10px] rounded-lg transition-all cursor-pointer font-mono"
          >
            {isAddingLog ? "Cancel" : "+ Log Work"}
          </button>
        )}
      </div>

      {quickAnalysisMode ? (
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 text-center">
          <p className="text-[10px] text-slate-500 font-mono">Bypassed during Quick Analysis.</p>
        </div>
      ) : !selectedAssetId ? (
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 text-center">
          <p className="text-[10px] text-slate-500 font-mono">Select a machinery asset to retrieve logs.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Form to add a new maintenance log */}
          {isAddingLog && (
            <form onSubmit={handleAddMaintenanceLog} className="bg-slate-950/80 p-4 border border-slate-850 rounded-xl space-y-3.5 animate-fade-in text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                <span className="text-[10px] font-mono text-yellow-400 font-bold uppercase tracking-wider">New Service Log</span>
                <span className="text-[9px] text-slate-500 font-mono">Asset ID: {selectedAssetId}</span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Service Date</label>
                  <input 
                    type="date"
                    required
                    value={newLog.work_date}
                    onChange={e => setNewLog(prev => ({ ...prev, work_date: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-yellow-400 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Work Type</label>
                  <select 
                    value={newLog.work_type}
                    onChange={e => setNewLog(prev => ({ ...prev, work_type: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white outline-none focus:border-yellow-400 cursor-pointer text-[11px]"
                  >
                    <option value="Bearing Replacement">Bearing Replacement</option>
                    <option value="Lubrication Service">Lubrication Service</option>
                    <option value="Coupling Alignment">Coupling Alignment</option>
                    <option value="Impeller Balancing">Impeller Balancing</option>
                    <option value="Routine Inspection">Routine Inspection</option>
                    <option value="Gear Backlash Calibration">Gear Backlash Calibration</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Technician</label>
                  <input 
                    type="text"
                    required
                    placeholder="E.g. Marcus Vance"
                    value={newLog.technician_name}
                    onChange={e => setNewLog(prev => ({ ...prev, technician_name: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-yellow-400 text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Service Notes</label>
                  <textarea 
                    required
                    placeholder="Detail service records, measurements..."
                    value={newLog.notes}
                    onChange={e => setNewLog(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white outline-none focus:border-yellow-400 resize-none text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-mono text-slate-500 uppercase block mb-1">Parts Used (comma-separated)</label>
                  <input 
                    type="text"
                    placeholder="E.g. SKF-6312 Bearing"
                    value={newLog.parts_used}
                    onChange={e => setNewLog(prev => ({ ...prev, parts_used: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-yellow-400 text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingLog(false)}
                  className="px-2.5 py-1.5 bg-slate-900 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold cursor-pointer font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black rounded-lg text-[10px] transition-all cursor-pointer font-mono"
                >
                  Save Log
                </button>
              </div>
            </form>
          )}

          {/* Display existing maintenance logs */}
          {maintenanceLogs.length === 0 ? (
            <p className="text-[10px] text-slate-500 text-center py-4 italic bg-slate-950/40 rounded-xl border border-slate-850">
              No past service logs found.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {maintenanceLogs.map((log) => {
                let parts: string[] = [];
                try {
                  const parsedParts = typeof log.parts_used === "string" ? JSON.parse(log.parts_used) : log.parts_used;
                  if (parsedParts && parsedParts.items) {
                    parts = parsedParts.items;
                  } else if (Array.isArray(parsedParts)) {
                    parts = parsedParts;
                  } else if (parsedParts) {
                    parts = Object.values(parsedParts).filter(Boolean).map(String);
                  }
                } catch (_) {
                  if (log.parts_used) parts = [String(log.parts_used)];
                }

                return (
                  <div key={log.id} className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex flex-col border-b border-slate-850/60 pb-1.5 gap-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-200">{log.work_type}</span>
                        <span className="text-[9px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                          {new Date(log.work_date).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">
                        Tech: <strong className="text-slate-400">{log.technician_name}</strong>
                      </span>
                    </div>

                    <p className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-wrap">{log.notes}</p>

                    {parts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1 text-[9px]">
                        <span className="text-slate-500 font-mono">Parts:</span>
                        {parts.map((part, pIdx) => (
                          <span key={pIdx} className="bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[8px]">
                            {part}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
