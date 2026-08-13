/**
 * SCADA / live plant telemetry integration framework.
 *
 * This module is the single place to plug real historian / PLC connectors later.
 * Until then it returns deterministic MOCK data when SCADA_ENABLED=true.
 *
 * TODO: Replace mock implementation with actual SCADA API call
 * Example for OSIsoft PI: const response = await fetch(`http://pi-server/api/streams/${assetId}`);
 * Example for Modbus PLC: const response = await modbusClient.readHoldingRegisters(address, length);
 */

export interface TelemetryData {
  phaseA: number;
  phaseB: number;
  phaseC: number;
  measuredAmps: number;
  loadPercentage: number;
  timestamp: string;
  /** Optional extras when a real connector provides them */
  deBearingTemp?: number | null;
  odeBearingTemp?: number | null;
  refractorySkinTemp?: number | null;
  ratedAmps?: number | null;
  maxAllowableLimit?: number | null;
}

/** Server env flag — default false so plants without SCADA are unaffected. */
export function isScadaEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const raw = String(env.SCADA_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Fetch live telemetry for an asset tag / id.
 * Returns null when SCADA is disabled or the connector has no point for this asset.
 */
export async function fetchLiveTelemetry(
  assetId: string
): Promise<TelemetryData | null> {
  if (!isScadaEnabled()) {
    return null;
  }

  const key = String(assetId || "").trim();
  if (!key) return null;

  // -------------------------------------------------------------------------
  // MOCK FRAMEWORK — safe default until a real connector is wired
  // -------------------------------------------------------------------------
  // Slightly vary mock values by asset id so multi-asset demos look distinct.
  const hash = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const wobble = (hash % 17) * 0.05;

  const mock: TelemetryData = {
    phaseA: Number((38.5 + wobble).toFixed(1)),
    phaseB: Number((37.2 + wobble * 0.6).toFixed(1)),
    phaseC: Number((38.1 + wobble * 0.8).toFixed(1)),
    measuredAmps: Number((14.2 + wobble).toFixed(1)),
    loadPercentage: Math.min(100, Math.round(81 + (hash % 7))),
    timestamp: new Date().toISOString()
  };

  // Simulate a short network hop (real connectors will await HTTP / Modbus I/O)
  await new Promise((r) => setTimeout(r, 15));

  return mock;

  // -------------------------------------------------------------------------
  // FUTURE: Real connectors (examples)
  // -------------------------------------------------------------------------
  // OSIsoft PI Web API:
  //   const response = await fetch(
  //     `${process.env.SCADA_PI_BASE_URL}/streams/${encodeURIComponent(key)}/value`,
  //     { headers: { Authorization: `Bearer ${process.env.SCADA_PI_TOKEN}` } }
  //   );
  //   const json = await response.json();
  //   return mapPiPayloadToTelemetryData(json);
  //
  // Modbus TCP PLC:
  //   const registers = await modbusClient.readHoldingRegisters(startAddress, length);
  //   return mapModbusRegistersToTelemetryData(registers);
}

/** Map connector payload into the shape used by /api/asset/:id/telemetry-context. */
export function liveTelemetryToContextFields(
  live: TelemetryData | null
): Record<string, number | string | null> | null {
  if (!live) return null;
  return {
    phase_a_temp: live.phaseA,
    phase_b_temp: live.phaseB,
    phase_c_temp: live.phaseC,
    measured_amps: live.measuredAmps,
    load_percentage: live.loadPercentage,
    de_bearing_temp: live.deBearingTemp ?? null,
    ode_bearing_temp: live.odeBearingTemp ?? null,
    refractory_skin_temp: live.refractorySkinTemp ?? null,
    rated_amps: live.ratedAmps ?? null,
    max_allowable_limit: live.maxAllowableLimit ?? null,
    timestamp: live.timestamp
  };
}
