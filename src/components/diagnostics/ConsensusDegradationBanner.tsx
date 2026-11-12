/**
 * VS-3 — honest consensus degradation banner.
 *
 * The engine tags a run `single-model-degraded` when fewer responders than
 * configured completed the synthesis. This banner reuses that status string
 * and names the provider that actually answered; multi-model runs render
 * nothing (their UI stays exactly as before).
 */

import {
  describeConsensusDegradation,
  type ConsensusDetails
} from "../../lib/consensusEngine";

interface ConsensusDegradationBannerProps {
  details?: Partial<ConsensusDetails> | null;
  className?: string;
}

export default function ConsensusDegradationBanner({
  details,
  className = ""
}: ConsensusDegradationBannerProps) {
  const message = describeConsensusDegradation(details);
  if (!message) return null;

  return (
    <div
      data-testid="consensus-degradation-banner"
      role="status"
      className={`mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ${className}`.trim()}
    >
      {message}
    </div>
  );
}
