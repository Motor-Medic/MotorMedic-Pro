import React from "react";
import TrendAnalyzer from "./TrendAnalyzer";

interface TrendsProps {
  selectedCompanyId?: number;
  subscriptionPlan?: string;
  selectedAssetId?: string;
}

/**
 * Trends page — Category IV Trend Analyzer only.
 * Mode tabs (Category IV vs Plant Telemetry) were removed to reduce confusion.
 */
export default function Trends({ selectedCompanyId = 1, selectedAssetId }: TrendsProps) {
  return <TrendAnalyzer selectedCompanyId={selectedCompanyId} selectedAssetId={selectedAssetId} />;
}
