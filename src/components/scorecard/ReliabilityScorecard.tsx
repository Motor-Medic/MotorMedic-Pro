import React, { useState } from "react";
import CostDock from "./CostDock";
import RiskRoiTab from "./RiskRoiTab";
import BacklogVelocityTab from "./BacklogVelocityTab";
import CoverageBadActorsTab from "./CoverageBadActorsTab";

interface ReliabilityScorecardProps {
  selectedCompanyId: number;
}

const TABS = ["1. Risk & ROI", "2. Backlog & Execution Velocity", "3. Coverage & Bad Actors"] as const;

export default function ReliabilityScorecard({ selectedCompanyId }: ReliabilityScorecardProps) {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [costModel, setCostModel] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-white">Reliability Scorecard</h2>
      </div>

      <CostDock onChange={setCostModel} />

      <div className="flex gap-2 border-b border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all cursor-pointer ${
              activeTab === tab
                ? "bg-yellow-400 text-slate-950 border-b-2 border-yellow-400 shadow"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60 border-b-2 border-transparent"
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
      {activeTab === "3. Coverage & Bad Actors" && (
        <CoverageBadActorsTab selectedCompanyId={selectedCompanyId} />
      )}
    </div>
  );
}
