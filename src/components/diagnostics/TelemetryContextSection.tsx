import { paramInput, paramLabel, sectionHint, sectionTitle } from "./intakeSectionStyles";

export interface TelemetryContextSectionProps {
  operatingRpm: string;
  setOperatingRpm: (value: string) => void;
  setVibRpm: (value: string) => void;
  loadPercentage: string;
  setLoadPercentage: (value: string) => void;
  processParameter: string;
  setProcessParameter: (value: string) => void;
  processParamLabel: string;
}

export default function TelemetryContextSection({
  operatingRpm,
  setOperatingRpm,
  setVibRpm,
  loadPercentage,
  setLoadPercentage,
  processParameter,
  setProcessParameter,
  processParamLabel
}: TelemetryContextSectionProps) {
  return (
    <section className="bg-slate-900/50 border border-white/80 rounded-xl p-6 mb-6 space-y-4 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all">
      <div>
        <h2 className={sectionTitle}>Operating Parameters at Time of Measurement</h2>
        <p className={sectionHint}>Capture speed, load, and process conditions during acquisition</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block min-w-0">
          <span className={paramLabel}>Operating Speed (RPM)</span>
          <input
            type="number"
            value={operatingRpm}
            onChange={(e) => {
              setOperatingRpm(e.target.value);
              setVibRpm(e.target.value);
            }}
            placeholder="e.g., 1780"
            className={paramInput}
          />
        </label>
        <label className="block min-w-0">
          <span className={paramLabel}>Load Percentage</span>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={loadPercentage}
              onChange={(e) => setLoadPercentage(e.target.value)}
              placeholder="e.g., 85"
              className={`${paramInput} pr-8`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
          </div>
        </label>
        <label className="block min-w-0">
          <span className={paramLabel}>{processParamLabel}</span>
          <input
            type="text"
            value={processParameter}
            onChange={(e) => setProcessParameter(e.target.value)}
            placeholder="Enter process value"
            className={paramInput}
          />
        </label>
      </div>
    </section>
  );
}
