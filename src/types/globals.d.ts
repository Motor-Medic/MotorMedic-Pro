/**
 * AR-30 shared browser-global augmentations — the single source for every
 * window-shape extension the app reads at runtime (never inline duplicates).
 */

interface Window {
  /** Runtime-injected env bridge (e.g. Stripe price ids); absent outside the injected shell. */
  _env_?: Record<string, string | undefined>;
  /** Legacy WebKit-prefixed AudioContext constructor. */
  webkitAudioContext?: typeof AudioContext;
}
