import React, { useState } from "react";
import CostDock from "./CostDock";
import RiskRoiTab from "./RiskRoiTab";
import BacklogVelocityTab from "./BacklogVelocityTab";

interface ReliabilityScorecardProps {
  selectedCompanyId: number;
}

const TABS = ["1. Risk & ROI", "2. Backlog & Execution Velocity"] as const;

export default function ReliabilityScorecard({ selectedCompanyId }: ReliabilityScorecardProps) {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [costModel, setCostModel] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-white">Reliability Scorecard</h2>
      </div>

      <CostDock onChange={setCostModel} />

      <div className="flex gap-1 border-b border-slate-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? "text-yellow-400 border-b-2 border-yellow-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "1. Risk & ROI" && (
        <RiskRoiTab selectedCompanyId={selectedCompanyId} />
      )}
      {activeTab === "2. Backlog & Execution Velocity" && (
        <BacklogVelocityTab selectedCompanyId={selectedCompanyId} />
      )}
    </div>
  );
}
