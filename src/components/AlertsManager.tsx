import React, { useState } from "react";
import { Bell, History, Settings } from "lucide-react";
import AlertSettings from "./AlertSettings";
import AlertHistory from "./AlertHistory";

interface AlertsManagerProps {
  userId: number;
}

export default function AlertsManager({ userId }: AlertsManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<"settings" | "history">("settings");

  return (
    <div className="space-y-6" id="alerts-manager-container">
      {/* Tab Menu */}
      <div className="flex gap-2 border-b border-slate-900 pb-px">
        <button
          onClick={() => setActiveSubTab("settings")}
          className={`px-4 py-2 text-xs font-bold transition-all relative ${
            activeSubTab === "settings"
              ? "text-yellow-400 border-b-2 border-yellow-400 font-extrabold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="alerts-tab-settings"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Alert Preferences
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab("history")}
          className={`px-4 py-2 text-xs font-bold transition-all relative ${
            activeSubTab === "history"
              ? "text-yellow-400 border-b-2 border-yellow-400 font-extrabold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="alerts-tab-history"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Dispatch Audit Logs
          </span>
        </button>
      </div>

      <div className="pt-2 animate-fade-in">
        {activeSubTab === "settings" ? (
          <AlertSettings userId={userId} />
        ) : (
          <AlertHistory userId={userId} />
        )}
      </div>
    </div>
  );
}
