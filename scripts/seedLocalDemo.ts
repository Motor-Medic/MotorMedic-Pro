/**
 * SLICE-F - DEV ONLY local demo tenant seed.
 *
 * Run: npx tsx scripts/seedLocalDemo.ts
 *
 * This is a DATA seed, not a migration. It never lives in migrations/ and must
 * never be executed by production boot. It writes one internally consistent
 * tenant so the Health Dashboard, Trend Analyzer and Equipment DB render real
 * rows instead of empty-state CTAs / reference degradation mock data.
 *
 * Safety:
 *   - refuses NODE_ENV=production / RENDER=true
 *   - refuses a database containing a known production company fingerprint
 *   - refuses an uninitialised database (the 020-029 tables must already exist)
 *   - one transaction; a second run deletes and recreates the ENTIRE seeded
 *     graph by the seed marker/import_id, so counts stay identical.
 */
import dotenv from "dotenv";
import pg from "pg";
import { hashPasswordSync } from "../src/lib/auth/password";
import {
  buildPoolConfig,
  resolveTlsModeForPool
} from "../src/lib/dbConnection";
import {
  inchPerSecondToMmPerSecond,
  MM_PER_INCH,
  CANONICAL_VELOCITY_UNIT
} from "../src/lib/vibration/units";
import { classifyZone } from "../src/lib/vibration/isoZone";

dotenv.config();

const SEED_MARKER = "local-demo-seed-v1";
const SEED_KIND = "local_demo_seed";
const DEMO_COMPANY_NAME = "Spectra Demo Manufacturing";
const DEMO_USERNAME = "demo";
const DEMO_EMAIL = "shanedufrene1989@gmail.com";
const DEMO_PASSWORD = "demo123";
const DEMO_ROLE = "system-admin";

const FORBIDDEN_COMPANY_NAMES = [
  "allied reliability",
  "exxonmobil",
  "demo reliability corp"
];

const REQUIRED_TABLES = [
  "tenant_entitlements",
  "good_catches",
  "bearing_specs",
  "route_assignments",
  "component_assessments",
  "notifications",
  "imports",
  "analysis_results",
  "analysis_history",
  "measurement_points"
];

type TrendMode = "degrade" | "watch" | "stable";

interface AssetSpec {
  tag: string;
  name: string;
  type: string;
  criticality: string;
  manufacturer: string;
  model: string;
  serial: string;
  rpm: number;
  /** Legacy in/s baseline; converted to canonical mm/s RMS once below. */
  baseVelocity: number;
  trend: TrendMode;
  /** Main component name shown in diagnoses / Trend Analyzer. */
  component: string;
  componentType: string;
  bearing: string;
}

interface RouteSpec {
  name: string;
  area: string;
  description: string;
  assets: AssetSpec[];
}

interface PlantSpec {
  name: string;
  location: string;
  routes: RouteSpec[];
}

const PLANTS: PlantSpec[] = [
  {
    name: "North River Plant",
    location: "North River, OH",
    routes: [
      {
        name: "Process Water Route A",
        area: "Utilities",
        description: "Cooling water and process utilities route",
        assets: [
          {
            tag: "TAG-P101A",
            name: "Cooling Water Pump P-101A",
            type: "Centrifugal Pump",
            criticality: "Critical",
            manufacturer: "Flowserve",
            model: "LNN-200",
            serial: "NR-P101A-4471",
            rpm: 1780,
            baseVelocity: 0.07,
            trend: "degrade",
            component: "Drive-End Bearing",
            componentType: "Electric Motor (AC / DC / VFD)",
            bearing: "SKF 6312 C3"
          },
          {
            tag: "TAG-P101B",
            name: "Cooling Water Pump P-101B",
            type: "Centrifugal Pump",
            criticality: "High",
            manufacturer: "Flowserve",
            model: "LNN-200",
            serial: "NR-P101B-4472",
            rpm: 1780,
            baseVelocity: 0.11,
            trend: "stable",
            component: "Drive-End Bearing",
            componentType: "Electric Motor (AC / DC / VFD)",
            bearing: "SKF 6312 C3"
          },
          {
            tag: "TAG-M201A",
            name: "Induced Draft Fan M-201A",
            type: "Fan / Blower",
            criticality: "High",
            manufacturer: "Howden",
            model: "AF-72",
            serial: "NR-M201A-8890",
            rpm: 1180,
            baseVelocity: 0.16,
            trend: "watch",
            component: "Drive-End Bearing",
            componentType: "Fan / Blower (Centrifugal / Axial)",
            bearing: "SKF 22220 E"
          },
          {
            tag: "TAG-G301",
            name: "Gearbox G-301",
            type: "Gearbox / Speed Reducer",
            criticality: "Medium",
            manufacturer: "Siemens",
            model: "H2-315",
            serial: "NR-G301-3320",
            rpm: 900,
            baseVelocity: 0.09,
            trend: "stable",
            component: "Input Shaft Bearing",
            componentType: "Gearbox / Speed Reducer",
            bearing: "FAG 32216"
          }
        ]
      }
    ]
  },
  {
    name: "Westfield Pump Station",
    location: "Westfield, PA",
    routes: [
      {
        name: "Lift Station Route B",
        area: "Wastewater",
        description: "Lift station and boiler feed pumping route",
        assets: [
          {
            tag: "TAG-P204A",
            name: "Boiler Feed Pump P-204A",
            type: "Centrifugal Pump",
            criticality: "Critical",
            manufacturer: "Sulzer",
            model: "HPT-250",
            serial: "WF-P204A-1102",
            rpm: 3560,
            baseVelocity: 0.13,
            trend: "watch",
            component: "Drive-End Bearing",
            componentType: "Centrifugal Pump",
            bearing: "SKF 7311 BECBM"
          },
          {
            tag: "TAG-P501B",
            name: "Lift Station Pump P-501B",
            type: "Centrifugal Pump",
            criticality: "Medium",
            manufacturer: "Grundfos",
            model: "NK 80-200",
            serial: "WF-P501B-2209",
            rpm: 1770,
            baseVelocity: 0.08,
            trend: "stable",
            component: "Drive-End Bearing",
            componentType: "Centrifugal Pump",
            bearing: "SKF 6309 C3"
          },
          {
            tag: "TAG-C401",
            name: "Instrument Air Compressor C-401",
            type: "Screw Compressor",
            criticality: "High",
            manufacturer: "Atlas Copco",
            model: "GA-90",
            serial: "WF-C401-5510",
            rpm: 1500,
            baseVelocity: 0.14,
            trend: "stable",
            component: "Drive-End Bearing",
            componentType: "Screw / Reciprocating Compressor",
            bearing: "SKF 6214 C3"
          }
        ]
      }
    ]
  }
];

const DAYS = 60;

interface SeedIds {
  companyId: number;
  userId: number;
  importId: number;
  plantIdByRoute: Map<string, number>;
  routeIdByName: Map<string, number>;
  assetIdByTag: Map<string, number>;
  componentIdByTag: Map<string, number>;
}

function zoneForVelocity(velocityMmS: number): "A" | "B" | "C" | "D" {
  // Canonical ISO 20816 Class II bands (mm/s RMS): 2.3 / 4.5 / 7.1.
  return classifyZone(velocityMmS, "Class II") ?? "A";
}

function severityForHealth(health: number): string {
  if (health >= 85) return "LOW";
  if (health >= 70) return "MEDIUM";
  if (health >= 50) return "HIGH";
  return "CRITICAL";
}

function deterministicNoise(seed: number): number {
  return (Math.sin(seed * 12.9898) + Math.sin(seed * 78.233)) / 2;
}

function daysAgoForDay(dayIndex: number): number {
  return DAYS - 1 - dayIndex;
}

function velocityFor(spec: AssetSpec, dayIndex: number, assetIndex: number): number {
  const t = dayIndex / (DAYS - 1);
  // Legacy curve factors are in in/s; convert the whole result once to the
  // canonical mm/s RMS so every downstream row and chart shares one unit.
  const jitter = inchPerSecondToMmPerSecond(
    deterministicNoise(dayIndex + assetIndex * 137) * 0.008
  );
  if (spec.trend === "degrade") {
    return inchPerSecondToMmPerSecond(
      0.07 + (0.47 - 0.07) * Math.pow(t, 1.35)
    ) + jitter;
  }
  if (spec.trend === "watch") {
    return inchPerSecondToMmPerSecond(spec.baseVelocity * (1 + 0.35 * t)) + jitter;
  }
  return inchPerSecondToMmPerSecond(spec.baseVelocity) + jitter;
}

function healthFor(spec: AssetSpec, dayIndex: number, assetIndex: number): number {
  const t = dayIndex / (DAYS - 1);
  if (spec.trend === "degrade") {
    return Math.round(92 - 60 * Math.pow(t, 1.5));
  }
  if (spec.trend === "watch") {
    return Math.round(86 - 14 * t + deterministicNoise(dayIndex + assetIndex) * 1.5);
  }
  return Math.round(93 + deterministicNoise(dayIndex + assetIndex) * 2);
}

function faultFor(spec: AssetSpec, t: number): string {
  if (spec.trend === "degrade") {
    return t > 0.55
      ? "Outer-race bearing defect (BPFO)"
      : "Early-stage bearing wear";
  }
  if (spec.trend === "watch") {
    return "Shaft misalignment (2X)";
  }
  return "No significant fault";
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildPeaks(
  spec: AssetSpec,
  velocity: number,
  t: number
): Array<{ frequency: number; amplitude: number; label: string }> {
  const h1 = spec.rpm / 60;
  const peaks = [
    { frequency: round(h1, 2), amplitude: round(velocity * 0.78), label: "1X" },
    { frequency: round(h1 * 2, 2), amplitude: round(velocity * 0.3), label: "2X" },
    { frequency: round(h1 * 3, 2), amplitude: round(velocity * 0.12), label: "3X" },
    { frequency: round(h1 * 5, 2), amplitude: round(velocity), label: "Broadband" }
  ];
  if (spec.trend === "degrade") {
    peaks.push({
      frequency: round(h1 * 3.58, 2),
      amplitude: round(velocity * (0.28 + 0.2 * t)),
      label: "BPFO"
    });
    peaks.push({
      frequency: round(h1 * 5.42, 2),
      amplitude: round(velocity * (0.16 + 0.12 * t)),
      label: "BPFI"
    });
  }
  return peaks;
}

function buildEnvelope(spec: AssetSpec, velocity: number, t: number) {
  const h1 = spec.rpm / 60;
  const factor = spec.trend === "degrade" ? 0.22 + 0.3 * t : 0.1;
  return [
    { frequency: round(h1 * 3.58, 2), amplitude: round(velocity * factor), label: "BPFO" },
    { frequency: round(h1 * 5.42, 2), amplitude: round(velocity * factor * 0.72), label: "BPFI" },
    { frequency: round(h1 * 2.33, 2), amplitude: round(velocity * factor * 0.45), label: "BSF" },
    { frequency: round(h1 * 0.4, 2), amplitude: round(velocity * factor * 0.3), label: "FTF" }
  ];
}

function buildTelemetry(
  spec: AssetSpec,
  assetId: number,
  velocity: number,
  health: number,
  fault: string,
  timestampIso: string,
  peaks: Array<{ frequency: number; amplitude: number; label: string }>
) {
  return {
    seed_marker: SEED_MARKER,
    rpm: spec.rpm,
    overall_velocity: round(velocity),
    // Acceleration stays in g. The legacy seed derived it from in/s, so keep
    // the same physical value now that velocity is canonical mm/s RMS.
    overall_acceleration: round(velocity * (2.8 / MM_PER_INCH)),
    vibration_trend_record: {
      assetId: String(assetId),
      timestamp: timestampIso,
      broadband: {
        overallVelocity: round(velocity),
        overallAcceleration: round(velocity * (2.8 / MM_PER_INCH)),
        healthScore: health,
        primaryFault: fault,
        peakGe: round(velocity * (0.6 / MM_PER_INCH)),
        kurtosis: round(3.1 + (spec.trend === "degrade" ? 0.9 : 0.1))
      },
      spectral: peaks.map((p) => ({
        frequency: p.frequency,
        amplitude: p.amplitude,
        label: p.label
      })),
      enveloping: buildEnvelope(spec, velocity, 0.5),
      waveform: [],
      rpm: spec.rpm,
      component: spec.component,
      context: {
        motorSpeedRPM: spec.rpm,
        loadFactorPercent: 72,
        analysisType: "vibration"
      },
      metadata: {
        processedAt: timestampIso,
        extractionMethod: "vision",
        extractionConfidence: 0.92
      }
    }
  };
}

async function guardTarget(client: pg.PoolClient): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.RENDER === "true") {
    throw new Error(
      "Refusing to seed: this script is DEV ONLY (NODE_ENV=production / RENDER=true)."
    );
  }

  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = $1",
    ["public"]
  );
  const have = new Set(tables.rows.map((r: { table_name: string }) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Refusing to seed: target is missing new-schema tables [${missing.join(
        ", "
      )}]. Initialise the dev database first.`
    );
  }

  const companies = await client.query("select id, name from companies order by id");
  const offenders = companies.rows.filter((row: { name: string }) =>
    FORBIDDEN_COMPANY_NAMES.includes(String(row.name).trim().toLowerCase())
  );
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to seed: production company fingerprint(s) found: ${offenders
        .map((r: { name: string }) => r.name)
        .join(", ")}`
    );
  }
}

export async function resolveTenant(
  client: pg.PoolClient
): Promise<{ companyId: number; userId: number; createdUser: boolean }> {
  // AUTHFIX: POST /api/auth/login authenticates strictly by LOWER(username)
  // (server.ts:11571-11574) — it never falls back to email and is not
  // tenant-scoped. The demo row therefore must carry username="demo", and its
  // password_hash must always be re-stamped with the same bcrypt helper login
  // verifies against (hashPasswordSync -> verifyPassword), otherwise a stale
  // hash on a pre-existing row permanently blocks demo/demo123 even after a
  // re-seed.
  const byUsername = await client.query(
    `SELECT id, company_id
       FROM users
      WHERE LOWER(username) = LOWER($1)
      ORDER BY id ASC
      LIMIT 1`,
    [DEMO_USERNAME]
  );

  let existing: { id: number | string; company_id: number | null } | undefined =
    byUsername.rows[0];

  if (existing == null) {
    // No "demo" username yet — adopt an email-matched account (renamed to
    // "demo" in the UPDATE below) before falling back to a fresh insert.
    const byEmail = await client.query(
      `SELECT id, company_id
         FROM users
        WHERE email IS NOT NULL AND LOWER(email) = LOWER($1)
        ORDER BY id ASC
        LIMIT 1`,
      [DEMO_EMAIL]
    );
    existing = byEmail.rows[0];
  }

  let companyId: number;
  if (existing != null && existing.company_id != null) {
    companyId = Number(existing.company_id);
  } else {
    const companyByName = await client.query(
      "SELECT id FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [DEMO_COMPANY_NAME]
    );
    if (companyByName.rows.length > 0) {
      companyId = Number(companyByName.rows[0].id);
    } else {
      const createdCompany = await client.query(
        `INSERT INTO companies (name, subscription_plan)
         VALUES ($1, 'module_entitlements')
         RETURNING id`,
        [DEMO_COMPANY_NAME]
      );
      companyId = Number(createdCompany.rows[0].id);
    }
  }

  if (existing != null) {
    // Always repair the credential: username, bcrypt hash of DEMO_PASSWORD and
    // account flags. A pre-existing row (e.g. created by register or an older
    // seed) keeps its company and data but gets a sign-in-able form.
    const updated = await client.query(
      `UPDATE users
          SET company_id = $1,
              username = $2,
              password_hash = $3,
              role = $4,
              is_temp_password = FALSE,
              is_disabled = FALSE,
              terms_accepted_at = NOW()
        WHERE id = $5
        RETURNING id`,
      [
        companyId,
        DEMO_USERNAME,
        hashPasswordSync(DEMO_PASSWORD),
        DEMO_ROLE,
        existing.id
      ]
    );
    return {
      companyId,
      userId: Number(updated.rows[0].id),
      createdUser: false
    };
  }

  const createdUser = await client.query(
    `INSERT INTO users
       (company_id, username, email, password_hash, role, is_temp_password,
        is_disabled, terms_accepted_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, NOW())
     RETURNING id`,
    [
      companyId,
      DEMO_USERNAME,
      DEMO_EMAIL,
      hashPasswordSync(DEMO_PASSWORD),
      DEMO_ROLE
    ]
  );
  return {
    companyId,
    userId: Number(createdUser.rows[0].id),
    createdUser: true
  };
}

async function findSeedImport(client: pg.PoolClient, companyId: number): Promise<number> {
  const found = await client.query(
    "SELECT id FROM imports WHERE tenant_id = $1 AND kind = $2 ORDER BY id ASC LIMIT 1",
    [companyId, SEED_KIND]
  );
  if (found.rows.length > 0) {
    return Number(found.rows[0].id);
  }
  const created = await client.query(
    `INSERT INTO imports (tenant_id, kind, status, completed_at)
     VALUES ($1, $2, 'completed', NOW())
     RETURNING id`,
    [companyId, SEED_KIND]
  );
  return Number(created.rows[0].id);
}

async function clearSeedGraph(
  client: pg.PoolClient,
  companyId: number,
  importId: number
): Promise<void> {
  const markerPrefix = `${SEED_MARKER}%`;

  await client.query(
    `DELETE FROM component_assessments
      WHERE tenant_id = $1
        AND (notes LIKE $2 OR component_id IN (SELECT id FROM components WHERE import_id = $3))`,
    [companyId, markerPrefix, importId]
  );
  await client.query(
    `DELETE FROM bearing_specs
      WHERE tenant_id = $1
        AND (reference_label LIKE $2 OR component_id IN (SELECT id FROM components WHERE import_id = $3))`,
    [companyId, markerPrefix, importId]
  );
  await client.query(
    `DELETE FROM route_assignments
      WHERE tenant_id = $1
        AND (notes LIKE $2 OR route_id IN (SELECT id FROM routes WHERE import_id = $3))`,
    [companyId, markerPrefix, importId]
  );
  await client.query(
    `DELETE FROM good_catches
      WHERE tenant_id = $1
        AND (description LIKE $2 OR title LIKE $2 OR asset_id IN (SELECT id FROM assets WHERE import_id = $3))`,
    [companyId, markerPrefix, importId]
  );
  await client.query(
    `DELETE FROM notifications
      WHERE tenant_id = $1 AND (body_text LIKE $2 OR subject LIKE $2)`,
    [companyId, markerPrefix]
  );
  await client.query(
    `DELETE FROM alerts
      WHERE tenant_id = $1 AND (description LIKE $2 OR title LIKE $2)`,
    [companyId, markerPrefix]
  );
  await client.query(
    `DELETE FROM analysis_results
      WHERE tenant_id = $1 AND telemetry_data->>'seed_marker' = $2`,
    [companyId, SEED_MARKER]
  );
  await client.query(
    `DELETE FROM analysis_history WHERE tenant_id = $1 AND notes LIKE $2`,
    [companyId, markerPrefix]
  );
  await client.query("DELETE FROM measurement_points WHERE import_id = $1", [importId]);
  await client.query("DELETE FROM collection_points WHERE import_id = $1", [importId]);
  await client.query("DELETE FROM components WHERE import_id = $1", [importId]);
  await client.query("DELETE FROM assets WHERE import_id = $1", [importId]);
  await client.query("DELETE FROM routes WHERE import_id = $1", [importId]);
  await client.query("DELETE FROM plants WHERE import_id = $1", [importId]);
}

async function insertHierarchy(
  client: pg.PoolClient,
  companyId: number,
  importId: number
): Promise<SeedIds> {
  const plantIdByRoute = new Map<string, number>();
  const routeIdByName = new Map<string, number>();
  const assetIdByTag = new Map<string, number>();
  const componentIdByTag = new Map<string, number>();

  for (const plant of PLANTS) {
    const plantRow = await client.query(
      `INSERT INTO plants (name, location, company_id, import_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [plant.name, plant.location, companyId, importId]
    );
    const plantId = Number(plantRow.rows[0].id);

    for (const route of plant.routes) {
      const routeRow = await client.query(
        `INSERT INTO routes (plant_id, name, area, description, is_system, import_id)
         VALUES ($1, $2, $3, $4, FALSE, $5)
         RETURNING id`,
        [plantId, route.name, route.area, route.description, importId]
      );
      const routeId = Number(routeRow.rows[0].id);
      routeIdByName.set(route.name, routeId);
      plantIdByRoute.set(route.name, plantId);

      for (const asset of route.assets) {
        const assetRow = await client.query(
          `INSERT INTO assets
             (route_id, company_id, name, tag_number, type, manufacturer, model,
              serial_number, install_date, criticality, status, technology_type,
              description, horsepower, rated_amps, import_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE - 900, $9,
                   'Active', 'Vibration', $10, $11, $12, $13)
           RETURNING id`,
          [
            routeId,
            companyId,
            asset.name,
            asset.tag,
            asset.type,
            asset.manufacturer,
            asset.model,
            asset.serial,
            asset.criticality,
            `${asset.type} on ${route.name}; seeded demo asset.`,
            asset.type.includes("Pump") ? 150 : 250,
            asset.type.includes("Pump") ? 180 : 280,
            importId
          ]
        );
        const assetId = Number(assetRow.rows[0].id);
        assetIdByTag.set(asset.tag, assetId);

        const kinematics = {
          ratedRpm: String(asset.rpm),
          isoClass: "Class II",
          bearingDe: asset.bearing,
          bearingNde: asset.bearing,
          warningLimitMms: "4.5",
          criticalLimitMms: "7.1",
          vibrationUnit: CANONICAL_VELOCITY_UNIT
        };
        const componentRow = await client.query(
          `INSERT INTO components
             (asset_id, name, type, manufacturer, model, specifications, specs,
              notes, import_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $6::jsonb, $7, $8)
           RETURNING id`,
          [
            assetId,
            asset.component,
            asset.componentType,
            asset.manufacturer,
            asset.model,
            JSON.stringify({ kinematics }),
            `${SEED_MARKER}: main monitored component for ${asset.tag}.`,
            importId
          ]
        );
        const componentId = Number(componentRow.rows[0].id);
        componentIdByTag.set(asset.tag, componentId);

        const collectionPoints = [
          { name: "Drive End", orientation: "Horizontal", order: 1 },
          { name: "Non-Drive End", orientation: "Horizontal", order: 2 }
        ];
        for (const cp of collectionPoints) {
          const cpRow = await client.query(
            `INSERT INTO collection_points
               (component_id, name, location_order, orientation, notes, import_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              componentId,
              cp.name,
              cp.order,
              cp.orientation,
              `${SEED_MARKER}: ${cp.name} collection point.`,
              importId
            ]
          );
          const cpId = Number(cpRow.rows[0].id);
          for (const direction of ["Horizontal", "Vertical", "Axial"]) {
            await client.query(
              `INSERT INTO measurement_points
                 (collection_point_id, direction, technology_type, units, import_id)
               VALUES ($1, $2, 'Vibration', $4, $3)`,
              [cpId, direction, importId, CANONICAL_VELOCITY_UNIT]
            );
          }
        }
      }
    }
  }

  return {
    companyId,
    userId: 0,
    importId,
    plantIdByRoute,
    routeIdByName,
    assetIdByTag,
    componentIdByTag
  };
}

async function insertAnalysisHistory(
  client: pg.PoolClient,
  companyId: number,
  importId: number
): Promise<number> {
  const points = await client.query(
    `SELECT mp.id AS measurement_point_id,
            mp.direction,
            cp.name AS collection_point_name,
            c.asset_id,
            a.tag_number
       FROM measurement_points mp
       JOIN collection_points cp ON cp.id = mp.collection_point_id
       JOIN components c ON c.id = cp.component_id
       JOIN assets a ON a.id = c.asset_id
      WHERE mp.import_id = $1
      ORDER BY a.id, cp.location_order, mp.id`,
    [importId]
  );

  const specByTag = new Map<string, AssetSpec>();
  const assetIndexByTag = new Map<string, number>();
  let assetIndex = 0;
  for (const plant of PLANTS) {
    for (const route of plant.routes) {
      for (const asset of route.assets) {
        specByTag.set(asset.tag, asset);
        assetIndexByTag.set(asset.tag, assetIndex++);
      }
    }
  }

  const pointFactor: Record<string, number> = {
    Horizontal: 1,
    Vertical: 0.85,
    Axial: 0.7
  };

  type HistoryRow = {
    measurementPointId: number;
    dataPointName: string;
    state: string;
    opSpeed: number;
    value: number;
    units: string;
    daysAgo: number;
    notes: string;
    alarm: boolean;
    diagnosis: string;
    tenantId: number;
  };

  const rows: HistoryRow[] = [];
  for (const point of points.rows) {
    const spec = specByTag.get(String(point.tag_number));
    if (!spec) continue;
    const index = assetIndexByTag.get(spec.tag) ?? 0;
    const cpFactor = String(point.collection_point_name).includes("Non-Drive End")
      ? 0.78
      : 1;
    for (let day = 0; day < DAYS; day += 1) {
      const assetVelocity = velocityFor(spec, day, index);
      const value =
        assetVelocity * (pointFactor[String(point.direction)] ?? 1) * cpFactor;
      const health = healthFor(spec, day, index);
      const fault = faultFor(spec, day / (DAYS - 1));
      const zone = zoneForVelocity(value);
      rows.push({
        measurementPointId: Number(point.measurement_point_id),
        dataPointName: `${point.collection_point_name} ${point.direction}`,
        state: "Data Collected",
        opSpeed: spec.rpm,
        value: round(value, 6),
        units: CANONICAL_VELOCITY_UNIT,
        daysAgo: daysAgoForDay(day),
        notes: `${SEED_MARKER}: ${spec.tag} ${point.collection_point_name} ${point.direction}`,
        alarm: zone === "C" || zone === "D",
        diagnosis: JSON.stringify({
          manager_summary: { severity: severityForHealth(health) },
          probable_faults: [{ fault_name: fault }],
          overall_velocity: round(value),
          iso_zone: zone,
          health_score: health
        }),
        tenantId: companyId
      });
    }
  }

  const columns = [
    "measurement_point_id",
    "data_point_name",
    "state",
    "op_speed",
    "measurement_value",
    "units",
    "measurement_date",
    "notes",
    "alarm_status",
    "diagnosis_result",
    "tenant_id"
  ];
  const chunkSize = 250;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    chunk.forEach((row, i) => {
      const b = i * 11;
      placeholders.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},` +
          `NOW() - ($${b + 7}::int * INTERVAL '1 day'),$${b + 8},$${b + 9},` +
          `$${b + 10}::jsonb,$${b + 11})`
      );
      values.push(
        row.measurementPointId,
        row.dataPointName,
        row.state,
        row.opSpeed,
        row.value,
        row.units,
        row.daysAgo,
        row.notes,
        row.alarm,
        row.diagnosis,
        row.tenantId
      );
    });
    await client.query(
      `INSERT INTO analysis_history (${columns.join(", ")})
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }
  return rows.length;
}

async function insertAnalysisResults(
  client: pg.PoolClient,
  companyId: number,
  ids: SeedIds
): Promise<number> {
  const allAssets: Array<{ spec: AssetSpec; index: number }> = [];
  let index = 0;
  for (const plant of PLANTS) {
    for (const route of plant.routes) {
      for (const asset of route.assets) {
        allAssets.push({ spec: asset, index: index++ });
      }
    }
  }

  type ResultRow = {
    assetId: string;
    component: string;
    daysAgo: number;
    health: number;
    fault: string;
    faultList: string;
    peaks: string;
    recommendations: string;
    financial: string;
    severity: string;
    summary: string;
    isBaseline: boolean;
    consensus: string;
    telemetry: string;
    tenantId: number;
  };

  const rows: ResultRow[] = [];
  for (const { spec, index: assetIndex } of allAssets) {
    const assetId = ids.assetIdByTag.get(spec.tag);
    if (assetId == null) continue;
    for (let day = 0; day < DAYS; day += 1) {
      const t = day / (DAYS - 1);
      const velocity = velocityFor(spec, day, assetIndex);
      const health = healthFor(spec, day, assetIndex);
      const fault = faultFor(spec, t);
      const severity = severityForHealth(health);
      const peaks = buildPeaks(spec, velocity, t);
      const timestampIso = new Date(
        Date.now() - daysAgoForDay(day) * 24 * 60 * 60 * 1000
      ).toISOString();
      const telemetry = buildTelemetry(
        spec,
        assetId,
        velocity,
        health,
        fault,
        timestampIso,
        peaks
      );
      const zone = zoneForVelocity(velocity);
      rows.push({
        assetId: String(assetId),
        component: spec.component,
        daysAgo: daysAgoForDay(day),
        health,
        fault,
        faultList: JSON.stringify([
          {
            title: fault,
            severity,
            confidence: spec.trend === "degrade" ? 0.94 : 0.72
          }
        ]),
        peaks: JSON.stringify(peaks),
        recommendations: JSON.stringify(
          spec.trend === "degrade"
            ? [
                "Schedule bearing replacement within the next 7 days.",
                "Trend BPFO/BPFI amplitudes daily until work is completed."
              ]
            : ["Continue routine condition monitoring."]
        ),
        financial: JSON.stringify({
          failure_exposure: spec.trend === "degrade" ? 42000 : 6000,
          cost_to_fix: spec.trend === "degrade" ? 8500 : 1200
        }),
        severity,
        summary: `ISO 20816 zone ${zone} - overall ${round(velocity, 2)} ${CANONICAL_VELOCITY_UNIT}; ${fault}.`,
        isBaseline: day === 0,
        consensus: JSON.stringify({ model: "seed-local-demo", iso_zone: zone }),
        telemetry: JSON.stringify(telemetry),
        tenantId: companyId
      });
    }
  }

  const columns = [
    "asset_id",
    "component",
    "timestamp",
    "health_score",
    "primary_fault",
    "fault_list",
    "peaks",
    "recommendations",
    "financial_impact",
    "severity",
    "summary",
    "is_baseline",
    "consensus_details",
    "analysis_type",
    "telemetry_data",
    "tenant_id"
  ];
  const chunkSize = 180;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    chunk.forEach((row, i) => {
      const b = i * 16;
      placeholders.push(
        `($${b + 1},$${b + 2},NOW() - ($${b + 3}::int * INTERVAL '1 day'),` +
          `$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7}::jsonb,` +
          `$${b + 8}::jsonb,$${b + 9}::jsonb,$${b + 10},$${b + 11},` +
          `$${b + 12},$${b + 13}::jsonb,$${b + 14},$${b + 15}::jsonb,$${b + 16})`
      );
      values.push(
        row.assetId,
        row.component,
        row.daysAgo,
        row.health,
        row.fault,
        row.faultList,
        row.peaks,
        row.recommendations,
        row.financial,
        row.severity,
        row.summary,
        row.isBaseline,
        row.consensus,
        "vibration",
        row.telemetry,
        row.tenantId
      );
    });
    await client.query(
      `INSERT INTO analysis_results (${columns.join(", ")})
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }
  return rows.length;
}

async function insertSurfaces(
  client: pg.PoolClient,
  ids: SeedIds,
  companyId: number,
  userId: number
): Promise<{ goodCatches: number; assessments: number; notifications: number }> {
  const degradeSpec = PLANTS[0].routes[0].assets[0];
  const watchSpec = PLANTS[0].routes[0].assets[2];
  const degradeAssetId = ids.assetIdByTag.get(degradeSpec.tag)!;
  const watchAssetId = ids.assetIdByTag.get(watchSpec.tag)!;
  const degradeComponentId = ids.componentIdByTag.get(degradeSpec.tag)!;
  const watchComponentId = ids.componentIdByTag.get(watchSpec.tag)!;
  const routeName = PLANTS[0].routes[0].name;
  const routeId = ids.routeIdByName.get(routeName)!;
  const plantId = ids.plantIdByRoute.get(routeName)!;

  const highAlert = await client.query(
    `INSERT INTO alerts
       (asset_id, severity, title, description, created_at, acknowledged, tenant_id)
     VALUES ($1, 'HIGH', $2, $3, NOW() - INTERVAL '2 days', FALSE, $4)
     RETURNING id`,
    [
      String(degradeAssetId),
      `Bearing fault escalation - ${degradeSpec.tag}`,
      `${SEED_MARKER}: BPFO/BPFI amplitudes rising above ISO 20816 zone D on ${degradeSpec.name}.`,
      companyId
    ]
  );
  const highAlertId = highAlert.rows[0].id;

  await client.query(
    `INSERT INTO alerts
       (asset_id, severity, title, description, created_at, acknowledged, tenant_id)
     VALUES ($1, 'MEDIUM', $2, $3, NOW() - INTERVAL '5 days', FALSE, $4)`,
    [
      String(watchAssetId),
      `Misalignment watch - ${watchSpec.tag}`,
      `${SEED_MARKER}: 2X amplitude trending upward on ${watchSpec.name}; alignment check recommended.`,
      companyId
    ]
  );

  const goodCatch = await client.query(
    `INSERT INTO good_catches
       (tenant_id, plant_id, route_id, asset_id, component_id, title, description,
        catch_date, avoided_cost_cents, downtime_hours_avoided, safety_hazard,
        safety_note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE - 3, 1850000, 18.5,
             TRUE, $8, $9)
     RETURNING id`,
    [
      companyId,
      plantId,
      routeId,
      degradeAssetId,
      degradeComponentId,
      `Caught failing bearing on ${degradeSpec.tag} before failure`,
      `${SEED_MARKER}: Rising BPFO energy detected during routine route collection.`,
      "High-energy bearing defect found before catastrophic failure; no one was injured.",
      userId
    ]
  );

  const assessment = await client.query(
    `INSERT INTO component_assessments
       (tenant_id, component_id, alert_id, failure_mode_key, disposition, notes,
        metadata_missing_at_assessment, assessed_by, assessed_at)
     VALUES ($1, $2, $3, 'bearing_outer_race', 'defect', $4, ARRAY[]::text[], $5,
             NOW() - INTERVAL '2 days')
     RETURNING id`,
    [
      companyId,
      degradeComponentId,
      highAlertId,
      `${SEED_MARKER}: Confirmed outer-race bearing defect from BPFO harmonics.`,
      userId
    ]
  );

  const notification = await client.query(
    `INSERT INTO notifications
       (tenant_id, user_id, channel, kind, recipient_email, subject, body_text,
        status, created_at, sent_at)
     VALUES ($1, $2, 'in_app', 'alert', $3, $4, $5, 'sent',
             NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
     RETURNING id`,
    [
      companyId,
      userId,
      DEMO_EMAIL,
      `High vibration alert: ${degradeSpec.tag}`,
      `${SEED_MARKER}: ${degradeSpec.name} crossed ISO 20816 zone D. Review the assessment and schedule bearing replacement.`
    ]
  );

  await client.query(
    `INSERT INTO bearing_specs
       (tenant_id, component_id, z, bd, pd, contact_angle, unit, reference_label)
     VALUES ($1, $2, 9, 22.225, 60.0, 0, 'mm', $3)`,
    [
      companyId,
      degradeComponentId,
      `${SEED_MARKER}: ${degradeSpec.bearing}`
    ]
  );

  await client.query(
    `INSERT INTO route_assignments
       (tenant_id, route_id, assigned_to, status, checked_out_at, checked_in_at,
        notes)
     VALUES ($1, $2, $3, 'checked_in', NOW() - INTERVAL '5 days',
             NOW() - INTERVAL '1 day', $4)`,
    [companyId, routeId, userId, `${SEED_MARKER}: demo route walk completed.`]
  );

  return {
    goodCatches: goodCatch.rowCount ?? 0,
    assessments: assessment.rowCount ?? 0,
    notifications: notification.rowCount ?? 0
  };
}

async function seedEntitlements(client: pg.PoolClient, companyId: number): Promise<void> {
  for (const moduleKey of ["vibration", "thermography", "ultrasound", "oil"]) {
    await client.query(
      `INSERT INTO tenant_entitlements (company_id, module_key, status, updated_at)
       VALUES ($1, $2, 'active', NOW())
       ON CONFLICT (company_id, module_key)
       DO UPDATE SET status = 'active', updated_at = NOW()`,
      [companyId, moduleKey]
    );
  }
}

async function printCounts(client: pg.PoolClient, companyId: number): Promise<void> {
  const queries: Array<[string, string, unknown[]]> = [
    ["plants", "SELECT COUNT(*)::int AS n FROM plants WHERE company_id = $1", [companyId]],
    [
      "routes",
      `SELECT COUNT(*)::int AS n FROM routes r
        JOIN plants p ON p.id = r.plant_id WHERE p.company_id = $1`,
      [companyId]
    ],
    ["assets", "SELECT COUNT(*)::int AS n FROM assets WHERE company_id = $1", [companyId]],
    [
      "components",
      `SELECT COUNT(*)::int AS n FROM components c
        JOIN assets a ON a.id = c.asset_id WHERE a.company_id = $1`,
      [companyId]
    ],
    [
      "collection_points",
      `SELECT COUNT(*)::int AS n FROM collection_points cp
        JOIN components c ON c.id = cp.component_id
        JOIN assets a ON a.id = c.asset_id WHERE a.company_id = $1`,
      [companyId]
    ],
    [
      "measurement_points",
      `SELECT COUNT(*)::int AS n FROM measurement_points mp
        JOIN collection_points cp ON cp.id = mp.collection_point_id
        JOIN components c ON c.id = cp.component_id
        JOIN assets a ON a.id = c.asset_id WHERE a.company_id = $1`,
      [companyId]
    ],
    [
      "analysis_history",
      "SELECT COUNT(*)::int AS n FROM analysis_history WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "analysis_results",
      "SELECT COUNT(*)::int AS n FROM analysis_results WHERE tenant_id = $1",
      [companyId]
    ],
    ["alerts", "SELECT COUNT(*)::int AS n FROM alerts WHERE tenant_id = $1", [companyId]],
    [
      "good_catches",
      "SELECT COUNT(*)::int AS n FROM good_catches WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "component_assessments",
      "SELECT COUNT(*)::int AS n FROM component_assessments WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "notifications",
      "SELECT COUNT(*)::int AS n FROM notifications WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "bearing_specs",
      "SELECT COUNT(*)::int AS n FROM bearing_specs WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "route_assignments",
      "SELECT COUNT(*)::int AS n FROM route_assignments WHERE tenant_id = $1",
      [companyId]
    ],
    [
      "tenant_entitlements",
      "SELECT COUNT(*)::int AS n FROM tenant_entitlements WHERE company_id = $1",
      [companyId]
    ],
    [
      "imports",
      "SELECT COUNT(*)::int AS n FROM imports WHERE tenant_id = $1 AND kind = $2",
      [companyId, SEED_KIND]
    ]
  ];

  console.log("\nPer-table counts (scoped to demo company):");
  for (const [label, sql, params] of queries) {
    const result = await client.query(sql, params);
    console.log(`  ${label.padEnd(24)} ${result.rows[0]?.n ?? 0}`);
  }
}

async function main(): Promise<void> {
  const pool = new pg.Pool(
    buildPoolConfig(process.env.DATABASE_URL ?? "", resolveTlsModeForPool())
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await guardTarget(client);

    const tenant = await resolveTenant(client);
    const importId = await findSeedImport(client, tenant.companyId);
    await clearSeedGraph(client, tenant.companyId, importId);
    const ids = await insertHierarchy(client, tenant.companyId, importId);
    ids.userId = tenant.userId;

    const historyRows = await insertAnalysisHistory(
      client,
      tenant.companyId,
      importId
    );
    const resultRows = await insertAnalysisResults(client, tenant.companyId, ids);
    const surfaces = await insertSurfaces(
      client,
      ids,
      tenant.companyId,
      tenant.userId
    );
    await seedEntitlements(client, tenant.companyId);

    await client.query("COMMIT");

    console.log("SLICE-F local demo seed complete.");
    console.log(`  Company:   ${DEMO_COMPANY_NAME} (id=${tenant.companyId})`);
    console.log(
      `  User:      ${DEMO_USERNAME} / ${DEMO_PASSWORD} <${DEMO_EMAIL}> (id=${tenant.userId}, ${
        tenant.createdUser ? "created" : "reused/reset"
      })`
    );
    console.log(`  Import:    ${SEED_KIND} (id=${importId})`);
    console.log(`  History:   ${historyRows} analysis_history readings`);
    console.log(`  Results:   ${resultRows} analysis_results trend rows`);
    console.log(
      `  Surfaces:  ${surfaces.goodCatches} good catch, ${surfaces.assessments} assessment, ${surfaces.notifications} notification`
    );
    await printCounts(client, tenant.companyId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("SLICE-F seed failed; transaction rolled back.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow the module to be imported by unit tests without executing the seed.
if (!process.env.VITEST) {
  void main();
}
