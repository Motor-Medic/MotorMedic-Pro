/**
 * Stacked container for the Run Diagnostics intelligence modules: sensor
 * fusion, computed prognosis, engineer sign-off and the CMMS bridge.
 *
 * Used where the four modules sit together (the vibration results view). The
 * oil view mounts them individually against its own sections using the same
 * `useDiagnosticsIntelligence` hook, so both paths read one shared fetch.
 */

import {
  useDiagnosticsIntelligence,
  type UseDiagnosticsIntelligenceInput
} from "../../lib/diagnostics/useDiagnosticsIntelligence";
import type { DiagnosisSignOff } from "../../lib/diagnostics/signOff";
import SensorFusionMatrix from "./SensorFusionMatrix";
import PrognosisPanel from "./PrognosisPanel";
import EngineerSignOff from "./EngineerSignOff";
import CmmsPayloadBridge from "./CmmsPayloadBridge";

export interface DiagnosticsIntelligencePanelProps
  extends UseDiagnosticsIntelligenceInput {
  /** Pre-fills the sign-off name field with the logged-in user. */
  engineerName?: string;
  onToast?: (
    message: string,
    type?: "success" | "info" | "warning" | "error"
  ) => void;
  onDispatchWorkOrder?: (signOff: DiagnosisSignOff) => void;
}

export default function DiagnosticsIntelligencePanel({
  engineerName,
  onToast,
  onDispatchWorkOrder,
  ...input
}: DiagnosticsIntelligencePanelProps) {
  const {
    loading,
    error,
    fusion,
    prognosis,
    signOff,
    setSignOff,
    cmmsContext
  } = useDiagnosticsIntelligence(input);

  if (loading) {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
        <p className="text-sm text-slate-400">
          Loading saved records for {input.assetTag || "this asset"}…
        </p>
      </section>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Could not load saved analysis records: {error}
        </div>
      )}

      <SensorFusionMatrix fusion={fusion} diagnosisLabel={input.primaryFault} />
      <PrognosisPanel prognosis={prognosis} />
      <EngineerSignOff
        diagnosisId={input.savedAnalysisId}
        signOff={signOff}
        defaultEngineerName={engineerName}
        onSaved={setSignOff}
        onToast={onToast}
        onDispatchWorkOrder={onDispatchWorkOrder}
      />
      <CmmsPayloadBridge context={cmmsContext} onToast={onToast} />
    </>
  );
}
