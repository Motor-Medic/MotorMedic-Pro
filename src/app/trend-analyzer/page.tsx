/**
 * Trend Analyzer route (/trend-analyzer)
 *
 * Production UI: App.tsx → Trends.tsx → TrendAnalyzer.tsx (Vite + Express).
 * Oil Analysis integration (oil_analysis tech + Wear Metals sub-tab) lives in
 * TrendAnalyzer.tsx — this module mirrors the route for App Router parity.
 */

import TrendAnalyzer from "../../components/TrendAnalyzer";

export default function TrendAnalyzerPage() {
  return <TrendAnalyzer />;
}
