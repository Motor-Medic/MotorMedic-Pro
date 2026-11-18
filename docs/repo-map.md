# Repository Map — Spectra CM / MotorMedic-Pro

**Status:** read-only navigation index. No product code, schema, or migrations were changed to produce this file.
**Snapshot:** `main` @ `59ddc06` (2026-11-17). The working tree also contains an uncommitted SLICE-US1 ultrasound change (`src/lib/ultrasound/bearingDeltaProvenance.ts`, `src/test/harness/ultrasoundUs1.test.tsx`, edits to `TrendAnalyzer.tsx` + `ultrasoundAnalysisEngine.ts`); those are marked **[working tree]** below.
**Purpose:** let a human or model navigate the five modality tabs and the core libraries without re-discovering where logic, storage, and locks live.

**Append-only convention.** This file is a ledger. Future slices append rows to:
1. `## 11. Slice history` (newest row at the bottom of the table), and
2. `## 13. Index log` (`file:line` + one-line purpose).

Never rewrite or renumber earlier rows. Correct an error only by appending a `CORRECTION:` row.

---

## 0. Orientation in one screen

| Concern | Where |
|---|---|
| Process entry / API + SPA host | `server.ts` (Express 4 + Vite middleware) |
| Browser entry | `index.html` → `src/main.tsx` → `src/App.tsx` |
| Route table (SPA) | `src/navigation.ts:22-60` (`TAB_TO_PATH` / `PATH_TO_TAB`) |
| Run Diagnostics surface | `src/components/Diagnose.tsx` |
| Trend Analyzer (5 tech tabs) | `src/components/TrendAnalyzer.tsx` |
| Shared persistence client | `src/lib/analysisPersistence.ts` |
| Shared SQL schema boot | `server.ts:17086-18560` + `migrations/001…030` |
| Honesty test harness | `src/test/harness/contract.tsx` + fixtures |
| Unit tests | `src/**/*.test.ts` (node project) and `src/**/*.test.tsx` (jsdom project) |

**Do not mistake these for production paths:**
- `src/app/api/**/route.ts`, `src/app/trend-analyzer/page.tsx` — Next.js App Router *parity* copies; production is Vite + Express (`src/app/trend-analyzer/page.tsx:1-7`).
- `src/components/AIDataMigration.tsx` — production-hidden simulation; it never reads the file and never writes the DB (`docs/import-pipeline-map.md:35-42`).
- `dist/` — build output. `node_modules/` — dependencies.

---

## 1. How to run and verify

### 1.1 Install / environment

```powershell
npm install
Copy-Item .env.example .env   # then fill values
```

Required for a normal boot:
- `DATABASE_URL` — PostgreSQL. Without it the server runs in in-memory/dev mode (`server.ts:266`, `src/lib/auth/middleware.ts:36-43`).
- `SESSION_SECRET` — required and validated in production (`src/lib/auth/envGuard.ts:62-103`).
- At least one AI key for analysis endpoints (`GEMINI_API_KEY`; consensus/vision chains use `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, etc. — see `.env.example`).

Optional / relevant:
- `ENABLE_DEV_AUTH_SEED=true` — enables demo seed, **never** in production (`src/lib/auth/envGuard.ts:52-55`).
- `DATABASE_SSLMODE` — `verify-full` default logic in `src/lib/dbConnection.ts`.
- `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` — one-time first-admin bootstrap (`src/lib/auth/bootstrapAdmin.ts:36`).
- `VITE_TESTING_MODE=true` — QA/verification affordances.
- `SQUARE_*` — storefront billing; boot refuses token/environment mismatch.

### 1.2 Run

```powershell
npm run dev        # tsx server.ts
```

- **Port: 3000** (`server.ts:252`, `server.ts:19111`).
- In dev the same Express process mounts Vite in middleware mode (`server.ts:19096-19102`); there is **no separate 5173 dev server** and no proxy needed.
- URL: `http://localhost:3000`; liveness: `GET /api/health` (`server.ts:293`).
- Demo login (dev seed only): **username `demo`, password `demo123`** (`server.ts:17563-17580`; re-stamp fix in commit `83e7ad1`). Seeding is username-keyed and requires `ENABLE_DEV_AUTH_SEED=true`.

Production-style run:

```powershell
npm run build      # vite build + esbuild bundle to dist/server.cjs
npm start          # node dist/server.cjs, still port 3000
```

### 1.3 Verify

```powershell
npm test                      # vitest run; 130 spec files
npm run lint                  # tsc --noEmit
npm run check:suppressions    # guard: no as-any / ts-ignore / ts-expect-error drift
```

- Vitest has two projects (`vite.config.ts:87-106`):
  - `dom` (jsdom): `src/**/*.test.tsx`, excludes two node-runtime TSX audits; setup `src/test/setup/jsdomStorage.ts`.
  - `node`: `src/**/*.test.ts` plus `ArtifactDisclaimer.test.tsx` and `McaVisualPass.sliceVS9.test.tsx`.
- Single spec examples:
  ```powershell
  npx vitest run src/lib/vibration/units.test.ts
  npx vitest run src/test/harness/thermographyIr3.test.tsx
  ```
- Optional live verification scripts (`scripts/verify-*.ts`, `scripts/seed-oil-samples.mjs`) are not part of `npm test`.

**Test-authoring rules implied by the harness**
- `expect…` contract helpers read the **rendered DOM** (`src/test/harness/contract.tsx:14-24`).
- Every contract must go RED when a lie is planted (`plantDomLie`); a harness that passes on a lie is itself a failure (`contract.tsx:16-18`, `265-333`).
- Fixtures carry `truth[]` entries with the real standard behind each expected value (`contract.tsx:58-73`).

---

## 2. Honesty doctrine (the rules the code is built around)

This is not a marketing statement; it is enforced by constants, gates, and mutation tests.

1. **Stored ≠ derived.** Anything computed must name its inputs and provenance.
   - Spectral orders: `stored` / `derived` / `mixed` (`src/lib/vibration/spectralTrend.ts:55-71`).
   - IR emissivity: `file-extracted` / `app-default` (`src/lib/thermographyTrendSeries.ts:659-705`).
   - Vibration RPM: measured / configured / default (`src/lib/vibration/rpmProvenance.ts:15-41`).
2. **Never fabricate a default.** Absent data renders as `Not measured`, `Not reported`, `Not recorded`, `Not detected`, or `—` (`src/lib/vibration/trendSsot.ts:34-37`, `src/lib/thermographyTrendSeries.ts:17-20`).
   Examples killed by tests: ε `0.95` preset, `28 dBµV` baseline, insulation `Class F`, ultrasound `38/45` peaks.
3. **Null is not zero; zero is a reading.** Strict null checks everywhere; `finiteOrNull`/`optNum`; `0.0 ppm` must render as a measurement, while untested metal renders `not tested` (`src/lib/oilAnalysisMetrics.ts:643-667`, `src/types/oilAnalysis.ts`).
4. **Gate before verdict.** Refuse a conclusion when inputs are physically impossible or insufficient:
   - ISO 4406 triplet validity (`src/lib/oilAnalysisMetrics.ts:567-637`).
   - Groundwall IR sequence plausibility (`src/lib/mca/groundwallCalculator.ts:314-453`).
   - IEEE 43 DC test voltage ceiling (`src/lib/mca/groundwallCalculator.ts:108-313`).
   - IEEE 522 surge ceiling gated on stored rating (`src/lib/mca/surgeCalculator.ts:253-346`).
   - Wear rate only with positive Δhours (`src/lib/oilAnalysisMetrics.ts:56-108`).
   - Projection only ≥40 % load (`src/lib/thermographyTrendSeries.ts:371-384`).
   - RIC spatial FFT only with full rotation (`src/lib/mca/rotorInfluenceCalculator.ts:101-182`).
5. **Windowing lockstep.** Every KPI, card, chart, and table on a tab reads the **same windowed row set** as its chart. Point-in-time tests (MCA) are windowed like trends (`TrendAnalyzer.tsx:3025-3034`, commit `6cd356f`).
6. **Citation honesty.** Standards are named as guidance, not compliance claims; in-repo practice constants are the single source (`src/lib/maintenance/prescriptiveDictionary.ts:1662-1740`, `1890-1930`).
7. **Park extrapolation; label what remains.** TAN/TBN crossover and Varnish Onset are parked; load-projection on IR is parked; any surviving projection is explicitly caveated (`e954169`, `b581aa9`).
8. **No cross-tech misattribution.** An IR trap ΔT is not an ultrasound ΔT; cross-tech presence is a read-only pill, not a fusion verdict (`TrendAnalyzer.tsx:742`, `thermographyTrendSeries.ts:98-102`).
9. **Vision transcribes, never estimates.** Blank over wrong; `absent`/`illegible`/`extracted` status; no value inferred from plot shape (`src/lib/vision/masterVisionPrompt.ts:6-71`, `src/lib/oilVisionExtractor.ts:1630-1812`).
10. **Tests are the enforcement.** DOM contract + mutation tests + source audits; green must be earned.

---

## 3. Shared storage contract

### 3.1 `analysis_results` — the polymorphic row every modality reads

Boot DDL: `server.ts:17786-17959`. Client shape: `src/lib/analysisPersistence.ts:34-75`.

Core columns read by all tabs:
`id`, `asset_id`, `component`, `timestamp`, `health_score`, `primary_fault`, `fault_list`, `peaks`, `spectrum_image_url`, `recommendations`, `financial_impact`, `severity`, `summary`, `is_baseline`, `consensus_details`, `analysis_type`, `created_at`, `telemetry_data`, `tenant_id`.

Modality-specific nullable columns:
- Thermography: `asset_type`, `phase_a_temp`, `phase_b_temp`, `phase_c_temp`, `measured_amps`, `rated_amps`, `de_bearing_temp`, `ode_bearing_temp`, `refractory_skin_temp`, `max_allowable_limit`, `i2r_normalized_delta_t` (`server.ts:17820-17853`).
- Vibration waveform/envelope: `waveform_peak_to_peak`, `waveform_crest_factor`, `waveform_impact_count`, `waveform_symmetry`, `waveform_modulation`, `envelope_peak_amplitude`, `envelope_dominant_frequency`, `envelope_energy` (`server.ts:17858-17881`).

`peaks` is a JSONB array whose first object carries `type`:
- `type:"thermography"` — `hotspot_temp`, `reference_temp`, `delta_t`, `severity_class`, phase temps, load, I²R, radiometric/isotherm keys (`src/lib/thermographyAnalysis.ts:973-1064`).
- `type:"ultrasound"` — `peak_dbmv`, `rms_dbmv`, `baseline_dbmv`, `delta_db`, `crest_factor`, `mode`, `probe_type`, `baseline_source`, `baseline_fallback`, `baseline_fallback_db` (`src/lib/ultrasoundAnalysis.ts:638-658`).
- `type:"mca"` — winding/phase, groundwall, RIC, surge, operator snapshot keys (`src/lib/mca/mcaPersistence.ts:254-281`; `src/lib/mca/mcaSsot.ts:587-619`). Missing `type` falls back to shape recognition.
- Vibration peaks remain spectral peak objects; waveform/envelope summaries live in the dedicated columns and in `telemetry_data`.

`telemetry_data` keys read:
- Vibration: `vibration_trend_record.context.loadFactorPercent|loadFactor|load_percentage|loadPercent`, `vibration_trend_record.rpm`, `rpm_source`, `context.*` (`src/lib/vibration/trendSsot.ts:58-146`).
- Thermography: `environmental.emissivity/ambient/temp_unit`, `ai_vision.radiometric.*`, polymorphic copies of phase temps/amps (`src/lib/thermographyTrendSeries.ts:611-730`).
- MCA: `winding`/`mca_winding`/`phase`, `groundwall`, `ric`/`rotor_influence`, `surge`, operator snapshot (`src/lib/mca/mcaPersistence.ts:284-311`, `mcaSsot.ts:587-619`).
- Shared: `telemetry_provenance` (`manual` | `default` | `prefilled-run`) at `src/lib/maintenance/prescriptiveDictionary.ts:1767-1788`.

Read path: `fetchAnalysisResults()` (`src/lib/analysisPersistence.ts:190-212`) → `GET /api/analysis-results` (`server.ts:2055-2149`) → `SELECT * FROM analysis_results … ORDER BY timestamp DESC` scoped by tenant.

Write path: `saveAnalysisResult()` (`src/lib/analysisPersistence.ts:170-188`) → `POST /api/save-analysis-result` (`server.ts:1375`).

### 3.2 Oil tables (oil is **not** stored in `analysis_results`)

Boot DDL: `server.ts:18123-18212`; migrations `007`, `008_oil_fluid_properties`, `009`, `010`, `011`, `019`.

- `oil_analysis`: `id`, `asset_id`, `technology_type`, `tenant_id`, `created_at`, `updated_at`.
- `oil_samples`: `id`, `oil_analysis_id`, `sample_date`, `operating_hours`, `iron`, `copper`, `chromium`, `lead`, `aluminum`, `silicon`, `tin`, `nickel`, baseline metals, per-metal alarm limits, `viscosity_40c`, `viscosity_100c`, `viscosity_index`, `acid_number`, `tbn`, `water_ppm`, `oxidation`, `nitration`, `iso_4um`, `iso_6um`, `iso_14um`, `particles_4um`, `particles_6um`, `particles_14um`, `dr_large`, `dr_small`, `mpc_delta_e`, `ruler_percent`, `uc_rating`, `morph_*` (8), `ferrograph_image_url`, `tenant_id`, timestamps.
- NAS 1638 / SAE AS4059 / WPC / WSI / PLP / DL-DS are **derived on read**, never stored (`migrations/010…`, `011…`).

Mapping: `mapOilSampleRow()` (`src/lib/oilSampleRow.ts:123-185`). Read: `fetchOilSamples()` (`oilSampleRow.ts:191-203`) → `GET /api/oil-analysis` (`server.ts:2151-2170`). Write: `coerceSaveOilSampleInput`/`saveOilSample` (`src/lib/oilAnalysisPersistence.ts:124-221`) → `POST /api/oil-analysis` (`server.ts:2172-2198`).

### 3.3 Supporting tables used by tabs

`reports` (`server.ts:18096-18120`), `alerts` (`server.ts:17962-17981`), `diagnosis_logs` (`server.ts:18000-18039`), `diagnosis_sign_off` (`server.ts:18075-18095`), `work_orders` (`server.ts:18055-18070`), `imports` (`server.ts:18501`, `migrations/028`), `tenant_settings` (`migrations/030`).

---

## 4. Vibration modality

**Tab id:** `vibration` (`TrendAnalyzer.tsx:1131-1138`). **Diagnose id:** `vibration` (type union `Diagnose.tsx:277`; selector cards `1062-1090`).
**Sub-tabs:** Broadband & ISO 20816, Spectral & Harmonics, Enveloping & Bearing, Waveform Metrics (`TrendAnalyzer.tsx:1169-1188`).

### 4.1 UI surfaces

| File | Anchors / role |
|---|---|
| `src/components/TrendAnalyzer.tsx` | Tech card `1131-1138`; mode list `1169-1188`; vibration section `5217`; KPI ribbon `5383`; charts `5441`; RUL `5893` |
| `src/components/VibrationInputAccordions.tsx` | Props `60-…`; accordion ids `4-7` (kinematics, metadata, telemetry, ingestion) |
| `src/components/trendAnalyzer/VibrationSeverityPanels.tsx` | `VibrationIsoMatrix` `85`, `VibrationKpiSummary` `172`, `VibrationActionCard` `252` |
| `src/components/trendAnalyzer/WaveformTab.tsx` | `buildWaveformChartModel` `108`, time/crest/impact charts `176/258/338`, `WaveformTab` `402` |
| `src/components/SpectralFftWorkspace.tsx` | spectral workspace (FFT peaks / orders) |
| `src/components/SpectrumLibraryTab.tsx` | saved-spectrum library |
| `src/components/Diagnose.tsx` | input mount `4709`; save `2648` |
| `src/components/reports/VibrationComparisonTab.tsx`, `VibrationPrognosticsTab.tsx` | report surfaces |

### 4.2 Key logic exports

| Module | Key exports (line) |
|---|---|
| `src/lib/vibration/units.ts` | `CANONICAL_VELOCITY_UNIT` `17`, `CANONICAL_DISPLAY_UNITS` `37`, `normalizeDisplayUnits` `77`, `convertTemperatureDelta` `173`, `formatVelocityMmS` `202`, `frequencyDisplayValue` `282` |
| `src/lib/vibration/isoZone.ts` | `ISO_ZONE_LABELS` `20`, `DEFAULT_ISO_MACHINE_CLASS` `39`, `classifyZone` `62`, `healthScoreFromVelocityMmS` `88`, `isoZoneProvenance` `135` |
| `src/lib/vibration/velocityThresholds.ts` | `resolveVelocityThresholds` `57` (plant vs ISO source) |
| `src/lib/vibration/trendSeries.ts` | `TREND_RANGE_DAYS` `21`, `filterTrendByTimeRange` `53`, `windowTrendByTimeRange` `71`, `isSparseTrendSeries` `91`, `applySameDateSequenceLabels` `104` |
| `src/lib/vibration/trendSsot.ts` | `readVibrationLoadPercent` `58`, `readStoredVibrationRpm` `98`, `readVibrationRpmProvenance` `127`, `applyVibrationRunningStateFilter` `192`, `reconcileVibrationVerdict` `424`, `latestVibrationRecordFromRows` `507` |
| `src/lib/vibration/spectralTrend.ts` | `HARMONIC_RATIO_RUBRIC` `255`, `computeHarmonicRatio` `318`, `buildSpectralHarmonicTrend` `361` |
| `src/lib/vibration/rpmProvenance.ts` | `CAPTURE_DEFAULT_VIBRATION_RPM` `13`, `classifyVibrationRpmSource` `77`, `isGatingQualityVibrationRpm` `95` |
| `src/lib/vibration/bearingFaultFrequencies.ts` | `calculateBearingFaultFrequencies` `86`, `resolveBearingFaultFrequencies` `162` |
| `src/lib/vibration/waveformMetrics` (`src/lib/waveformMetrics.ts`) | `assessWaveformSymmetry` `44`, `countImpacts` `82`, `calculateCrestFactor` `109`, `normalizeWaveformMetrics` `185` |
| `src/lib/vibration/vibrationDiagnosticRecord.ts` | `VIBRATION_TREND_RECORD_TYPE` `14`, `buildVibrationDiagnosticRecord` `135`, `readCachedVibrationRecord` `399`, `extractEnvelopingTrendPoint` `630`, `extractWaveformTrendPoint` `746` |
| `src/lib/vibration/visionModelConfig.ts` | `GEMINI_VISION_MODEL` `28`, `LEGACY_VISION_CHAIN` `35`, `VIBRATION_VISION_PROMPT` `153`, `SPECTRAL_EXTRACTION_FAILED_MSG` `189` |
| `src/lib/vibration/vibrationImageExtractor.ts` | `normalizeSpectralData` `145`, `parseVisionModelResponse` `223`, `extractVibrationDataFromImage` `367` |
| `src/lib/consensusEngine.ts` | `ANALYZE_VIBRATION_API_PATH` `40`, `runConsensusVibrationAnalysis` `1809`, `isConsensusVibrationResult` `617` |

**API:** `POST /api/analyze-vibration` (Express mount `server.ts:446-456`; alias `/api/v1/diagnose`), `POST /api/extract-vibration-image` (`server.ts:480`), `POST /api/detect-spectrum-regions` (`server.ts:764`).

### 4.3 DB columns read

`analysis_results` core + `waveform_*` (5) + `envelope_*` (3) + `telemetry_data.vibration_trend_record.*` / `.rpm_source` / `.context.*`. `fault_list` and `peaks` supply the spectral/bearing display. No separate vibration table.

### 4.4 Tests that lock it

Unit (node):
- `src/lib/vibration/units.test.ts`
- `src/lib/vibration/isoZone.test.ts`
- `src/lib/vibration/velocityThresholds.test.ts`
- `src/lib/vibration/trendSeries.test.ts`
- `src/lib/vibration/trendSsot.test.ts`
- `src/lib/vibration/spectralTrend.test.ts`
- `src/lib/vibration/rpmProvenance.test.ts`
- `src/lib/vibration/componentSpecs.test.ts`
- `src/lib/vibration/visionModelConfig.test.ts`
- `src/lib/bearingCalc.test.ts`

Tab contracts (node source-audit + jsdom render):
- `src/components/TrendAnalyzer.vs1Ssot.test.ts` (single windowed SSOT / verdict)
- `src/components/TrendAnalyzer.vs4Spectral.test.ts` + `vs4SpectralRender.test.tsx`
- `src/components/TrendAnalyzer.vs5Enveloping.test.ts` + `vs5EnvelopingRender.test.tsx`
- `src/components/TrendAnalyzer.vs6Waveform.test.ts` + `vs6WaveformRender.test.tsx`
- `src/components/TrendAnalyzer.envCrestAudit.test.ts` + `.render.test.tsx`
- `src/components/TrendAnalyzer.envelopingHistory.test.ts`
- `src/components/TrendAnalyzer.timeRangeIntegrity.test.ts`
- `src/components/TrendAnalyzer.chartExpand.test.ts` + `.chartExpandClick.test.tsx`
- `src/components/TrendAnalyzer.selectorLayout.test.tsx`
- `src/components/trendAnalyzer/VibrationSeverityPanels.test.tsx`
- `src/components/trendAnalyzer/WaveformTab.test.tsx`
- `src/test/harness/vibration.harness.test.tsx`

---

## 5. Thermography (IR) modality

**Tab id:** `thermography` (`TrendAnalyzer.tsx:1139-1145`). **Diagnose id:** `ir` (`Diagnose.tsx:277`; result mount `6054-6082`).
**Sub-tabs:** Hotspot & NETA Severity · Phase Delta & I²R Load · Radiometric & Isotherm · Mechanical & Refractory (`TrendAnalyzer.tsx:1213-1220`).

### 5.1 UI surfaces

| File | Anchors / role |
|---|---|
| `src/components/TrendAnalyzer.tsx` | Tech card `1139-1145`; IR modes `1213-1220`; IR section `6662`; multi-tech pill `7011` |
| `src/components/ThermographyInputAccordions.tsx` | Props `338`; `inferIrAssetTypeFromLabel` `176`; telemetry snapshot `39-…` |
| `src/components/ThermographyResultsDashboard.tsx` | Props `474`; thermal KPI / image / recommendations |
| `src/components/reports/ThermographyResultsTab.tsx` | Props `16` |
| `src/components/reports/ThermalLibraryTab.tsx` | Props `11` |
| `src/components/reports/InfraredPrognosticsTab.tsx` | IR prognostics surface |
| `src/components/reports/NfpaComplianceTab.tsx` | NFPA compliance surface |

### 5.2 Key logic exports

| Module | Key exports (line) |
|---|---|
| `src/lib/thermographyAnalysis.ts` | `ANALYZE_THERMOGRAPHY_API_PATH` `14`, `THERMOGRAPHY_MASTER_PROMPT` `124`, `extractRadiometricMetrics` `377`, `normalizeThermographyResult` `493`, `analyzeThermalImage` `830`, `mapThermographyToUiResult` `902`, `thermographyPeaksForSave` `974` |
| `src/lib/thermographyAnalysisEngine.ts` | `THERMOGRAPHY_ANALYSIS_VISION_CHAIN` `36`, `runThermographyAnalysis` `192` |
| `src/lib/thermographyTrendSeries.ts` | disclosures `17-132`; `PROJECTION_MIN_VALID_LOAD_PERCENT` `371`; `netaRepairWindowForStoredClass` `467`; `thermoLoadTelemetryStored` `488`; `extractThermoChartFields` `611`; `buildThermoChartSeries` `998`; `planThermoTrendAxis` `1072`; `radiometricKpis` `1205`; `mechanicalKpis` `1291`; `thermoDeltaTTrend` `1366`; `thermoI2rProportionality` `1455`; `thermoMechLimitCitations` `1545` |
| `src/lib/radiometricDecoder.ts` | `decodeRadiometric` `579`, `describeRadiometricContainer` `639` |
| `src/lib/extractThermalMetadata.ts` | `EXTRACT_THERMAL_METADATA_API_PATH` `14`, `extractThermalMetadata` `153`, `convertTemp` `292` |
| `src/lib/analyzeThermalImage.ts` | `analyzeThermalImageVisual` `61` |
| `src/lib/thermographyVisionExtractor.ts` | `mapThermographyTranscription` `190`, `mergeThermographyConsensus` `329`, `flagAllThermographyFilled` `376`, `mergeRadiometricIntoThermographyReport` `497`, `finalizeThermographyFromParses` `631`, `extractThermographyReportFromImageBase64` `707` |

**API:** `POST /api/analyze-thermography` (`server.ts:900-918`), `POST /api/extract-thermal-metadata` (`server.ts:925`).

### 5.3 DB columns read

`analysis_results` core plus the thermography polymorphic block (`asset_type`, `phase_a/b/c_temp`, `measured_amps`, `rated_amps`, `de_bearing_temp`, `ode_bearing_temp`, `refractory_skin_temp`, `max_allowable_limit`, `i2r_normalized_delta_t`), and:
- `peaks[type=thermography]`: `hotspot_temp`, `reference_temp`, `delta_t`, `severity_class`, `equipment_category`, phase temps, `load_percentage`, `calculated_i2r_delta`, `i2r_normalized_delta_t`, `current_amps`, `rated_amps`, radiometric/isotherm keys, bearing/skin/refractory/ambient keys (`src/lib/thermographyAnalysis.ts:1005-1100`).
- `telemetry_data.environmental.*`, `ai_vision.radiometric.*`, and polymorphic copies (`src/lib/thermographyTrendSeries.ts:611-730`).
- `telemetry_data.telemetry_provenance` badge.

### 5.4 Tests that lock it

Unit (node):
- `src/lib/thermographyTrendSeries.test.ts`
- `src/lib/thermographyKpi.test.ts`
- `src/lib/thermographyIr1b.test.ts`
- `src/lib/thermographyVs7.test.ts`
- `src/lib/thermographyMechanicalHonesty.test.ts`
- `src/lib/thermographyRadiometricMerge.test.ts`
- `src/lib/radiometricDecoder.test.ts`

Tab contracts (jsdom harness):
- `src/test/harness/thermography.harness.test.tsx`
- `src/test/harness/thermographyDisclosure.test.tsx`
- `src/test/harness/thermographyIr1b.test.tsx`
- `src/test/harness/thermographyIr2.test.tsx`
- `src/test/harness/thermographyIr3.test.tsx`
- `src/test/harness/thermographyIr4.test.tsx`
- `src/components/TrendAnalyzer.vs7Thermography.render.test.tsx`
- `src/components/TrendAnalyzer.irResilience.test.ts`

---

## 6. Ultrasound modality

**Tab id:** `ultrasound` (`TrendAnalyzer.tsx:1146-1152`). **Diagnose id:** `ultrasound` (`Diagnose.tsx:277`; result mount `6085-6111`).
**Sub-tabs:** Bearings & Mechanical · Compressed Air Leaks · Electrical PD · Steam Traps (`TrendAnalyzer.tsx:1222-1254`).

### 6.1 UI surfaces

| File | Anchors / role |
|---|---|
| `src/components/TrendAnalyzer.tsx` | Tech card `1146-1152`; UE modes `1222-1254`; UE section `8011`; leak/steam/PD blocks in `8011-8885` |
| `src/components/UltrasoundInputAccordions.tsx` | `UltrasoundMode` `22`; snapshot `25`; props `149`; modes `30-40` |
| `src/components/UltrasoundResultsDashboard.tsx` | Props `151`; probe/ladder imports `33-39` |
| `src/components/reports/UltrasoundResultsTab.tsx` | `US_RUNGS` `51`, `US_DDB_SOURCE` `58`, `evaluateUsDeltaClass` `60` |
| `src/components/reports/UltrasoundPatternDossierTab.tsx` | pattern dossier |
| `src/components/reports/UltrasoundTrendLibraryTab.tsx` | trend library |
| `src/components/reports/UltrasoundPrognosticsTab.tsx` | prognostics |

### 6.2 Key logic exports

| Module | Key exports (line) |
|---|---|
| `src/lib/ultrasoundAnalysis.ts` | `ANALYZE_ULTRASOUND_API_PATH` `18`, `crestFactorFromPeakRmsDb` `25`, `ULTRASOUND_MASTER_PROMPT` `199`, `normalizeUltrasoundResult` `263`, `analyzeUltrasoundClient` `512`, `ultrasoundPeaksForSave` `639` |
| `src/lib/ultrasoundAnalysisEngine.ts` | `analyzeUltrasoundData` `106`, `runUltrasoundAnalysis` `217` |
| `src/lib/ultrasound/logUnits.ts` | `hasFiniteDbValues` `20`, `powerMeanDb` `29`, `powerMeanDbRounded` `39`, `dbDelta` `50`, `DB_POWER_MEAN_NOTE` `59` |
| `src/lib/ultrasound/probeType.ts` | `UltrasoundProbeType` `15`, `normalizeProbeType` `39`, `deriveProbeTypeFromTransducer` `61`, `usAcousticDomain` `105`, `bearingLadderApplicable` `148` |
| `src/lib/ultrasound/leakCalculator.ts` | `LEAK_IMPACT_DEFAULTS` `56`, `LEAK_BASIS_TEXT/NOTE` `74/82`, `summarizeLeakRunBases` `162`, `leakCostSeverity` `241`, `calculateLeakImpact` `348` |
| `src/lib/ultrasound/bearingDeltaProvenance.ts` **[working tree, SLICE-US1]** | `UeBearingBaselineProvenance` `19`, `ueUltrasoundPeakRecord` `64`, `describeUeBearingDelta` `81`, `ueBaselineProvenanceLabel` `151` |
| `src/lib/ultrasound/audioAnalyzer.ts` | `analyzeUltrasoundWav` `51`, `linearToDb` `41` |

**API:** `POST /api/analyze-ultrasound` (`server.ts:1087-1104`).

### 6.3 DB columns read

`analysis_results` core + `peaks[type=ultrasound]`:
`peak_dbmv`, `rms_dbmv`, `baseline_dbmv`, `delta_db`, `crest_factor`, `mode`, `probe_type`, `baseline_source`, `baseline_fallback`, `baseline_fallback_db`, `prpd_data`, `environmental_context`, `confidence_score` (`src/lib/ultrasoundAnalysis.ts:638-658`).
Leak/per-run basis fields are read from the same peaks blob; `leak_cfm` is provenance-ruled in slice VS8 (`402e560`).

### 6.4 Tests that lock it

Unit (node):
- `src/lib/ultrasound/bearingDeltaProvenance.test.ts` **[working tree]**
- `src/lib/ultrasound/leakPerRunBasis.test.ts`

Tab contracts:
- `src/test/harness/ultrasound.harness.test.tsx`
- `src/test/harness/ultrasoundUs1.test.tsx` **[working tree]**
- `src/test/harness/ultrasoundUs1` covers stored-baseline ΔdB provenance and stored-class verbatim.
- `src/components/TrendAnalyzer.ueBearingsHonesty.test.ts`
- `src/components/TrendAnalyzer.leaksHonesty.test.ts`
- `src/components/TrendAnalyzer.leaksManual.test.tsx`
- `src/components/TrendAnalyzer.leaksPerRunBasis.test.tsx`
- `src/components/TrendAnalyzer.electricalPdHonesty.test.tsx`
- `src/components/TrendAnalyzer.steamTrapHonesty.test.ts`
- `src/components/TrendAnalyzer.steamTrapHonesty.render.test.tsx`
- `src/components/UltrasoundInputAccordions.perRun.test.tsx`

---

## 7. Motor Circuit Analysis (MCA) modality

**Tab id:** `mca` (`TrendAnalyzer.tsx:1153-1159`). **Diagnose id:** `mca` (`Diagnose.tsx:277`; result mount `6115-6135`).
**Sub-tabs:** Winding & Phase Balance · Groundwall/Insulation · Rotor Influence (RIC) · Surge Waveforms (`TrendAnalyzer.tsx:1256-1300`).

### 7.1 UI surfaces

| File | Anchors / role |
|---|---|
| `src/components/TrendAnalyzer.tsx` | Tech card `1153-1159`; modes `1256-1300`; MCA SSOT state `2522-2523`; MCA section `8887`; PDF extraction `3811-4011` |
| `src/components/McaInputAccordions.tsx` | `McaMode` `31`; props `178`; operator snapshot emit |
| `src/components/McaResultsDashboard.tsx` | Props `61` |
| `src/components/reports/McaResultsTab.tsx` | Props `30` |
| `src/components/reports/McaHealthDossierTab.tsx` | Props `31` |
| `src/components/reports/McaTrendLibraryTab.tsx` | Props `28` |
| `src/components/reports/McaPrognosticsTab.tsx` | prognostics |

### 7.2 Key logic exports

| Module | Key exports (line) |
|---|---|
| `src/lib/mca/windingBalanceCalculator.ts` | `COPPER_TEMP_COEFFICIENT_K` `84`, `ALUMINUM_TEMP_COEFFICIENT_K` `86`, `normalizeResistanceTo25C` `145`, `percentUnbalance` `163`, `calculateWindingBalance` `272` |
| `src/lib/mca/groundwallCalculator.ts` | `IEEE43_MAX_DC_TEST_VOLTAGE_TABLE` `108`, `correctIrTo40C` `146`, `ieee43MinIrMOmega` `183`, `evaluateGroundwallDataQuality` `314`, `calculateGroundwallInsulation` `454` |
| `src/lib/mca/rotorInfluenceCalculator.ts` | `RIC_FULL_ROTATION_*` `54-56`, `hasFullRotationRicData` `101`, `computeSpatialSecondHarmonic` `183`, `calculateRotorInfluence` `353`, `parseRicClipboardText` `431` |
| `src/lib/mca/surgeCalculator.ts` | `SURGE_EAR_SOURCE` `19`, `IEEE522_FORM_COIL_WITHSTAND_FACTOR` `57`, `calculateSurgeHealth` `173`, `ieee522SurgeTestVoltageCeilingV` `253`, `calculateSurgeDamping` `359` |
| `src/lib/mca/mcaSsot.ts` | `EMPTY_MCA_SSOT` `99`, `deepMergeMcaSsot` `209`, `mcaSsotFromSaved` `587`, `extractMcaSurgeFromSaved` `622`, `hydrateMcaSsotFromAnalyses` `706`, `mcaSsotPatchFromOperatorSnapshot` `721` |
| `src/lib/mca/mcaPersistence.ts` | `MCA_WINDING_EMPTY` `105`, `mcaPeakBlob` `254`, `extractMcaWindingFromSaved` `313`, `extractMcaGroundwallFromSaved` `515`, `extractMcaRicFromSaved` `790`, `mcaPayloadForSave` `982` |
| `src/lib/mca/mcaPdfExtractor.ts` | `extractMcaDataFromPdf` `804`, `extractMcaDataFromFile` `896`, `mcaExtractHasGroundwall` `944` |
| `src/lib/mca/mcaVisionExtractor.ts` | `MCA_VISION_API_PATH` `31`, `mcaSsotToExtractedData` `275`, `extractMcaDataFromImage` `319` |

**API:** MCA saves through `POST /api/save-analysis-result` (`server.ts:1375`); PDF/image extraction is client-side then persisted. No dedicated MCA server route.

### 7.3 DB columns read

`analysis_results` core + `peaks[type=mca]` / shape-detected blob:
- Winding: `phase_r/l/z`, `resistance`, `inductance`, `impedance`, `phases`, `material`/conductor, `winding`.
- Groundwall: `ir1mMOmega`/`ir_1m`, PI, DAR, `test_voltage_v`, `winding_temp`, `insulation_class`.
- RIC: `ricData`/`ric_data`/`rotor_influence.series`, `peak_variance`, `eccentricity_index`.
- Surge: `surge.waveform`, `test_voltage_v`, `ear`, `peak_error_ratio`.
- `telemetry_data.winding|mca_winding|phase`, `.groundwall`, `.ric|rotor_influence`, `.surge`, operator snapshot.
- `telemetry_data.telemetry_provenance`.

### 7.4 Tests that lock it

- `src/components/McaResultsDashboard.test.ts`
- `src/components/McaVisualPass.sliceVS9.test.tsx`
- `src/components/McaInputAccordions.sliceVS9.render.test.tsx`
- `src/components/TrendAnalyzer.mcaWindingHonesty.test.ts`
- `src/components/TrendAnalyzer.mcaGroundwallHonesty.test.ts` + `.render.test.tsx`
- `src/components/TrendAnalyzer.mcaRotorHonesty.test.ts` + `.render.test.tsx`
- `src/components/TrendAnalyzer.mcaSurgeHonesty.test.ts` + `.render.test.tsx`
- `src/test/harness/mca.harness.test.tsx`

There are **no** `src/lib/mca/*.test.ts` unit specs; MCA is locked by component source-audit + DOM harness tests. Add unit specs if a slice changes pure math.

---

## 8. Oil Analysis modality

**Tab id:** `oil_analysis` (`TrendAnalyzer.tsx:1160-1166`). **Diagnose id:** `oil` (`Diagnose.tsx:277`; result mount `6138-…`).
**Sub-tabs:** Wear Metals & Debris · Fluid Chemistry · Cleanliness · Ferrography & Varnish (`TrendAnalyzer.tsx:1314-1325`).

### 8.1 UI surfaces

| File | Anchors / role |
|---|---|
| `src/components/TrendAnalyzer.tsx` | Tech card `1160-1166`; `OIL_SUB_TABS` `1314-1325`; oil section `10895`; sample-save is delegated to `AddOilSampleModal` → `saveOilSample` (§8.2) |
| `src/components/OilInputAccordions.tsx` | Props `280`; honest ISO parsing `465-472` |
| `src/components/OilResultsDashboard.tsx` | `IdentifiedFault` `94`; props `352` |
| `src/components/trendAnalyzer/OilWearMetalsTab.tsx` | Props `55`; component `107` |
| `src/components/trendAnalyzer/OilFluidChemistryTab.tsx` | Props `38`; component `114` |
| `src/components/trendAnalyzer/OilCleanlinessTab.tsx` | Props `54`; component `111` |
| `src/components/trendAnalyzer/OilFerrographyVarnishTab.tsx` | Props `57`; component `155` |
| `src/components/trendAnalyzer/AddOilSampleModal.tsx` | Props `29`; component `125` |
| `src/components/trendAnalyzer/OilCsvUploader.tsx` | Props `13`; component `226` |
| `src/components/trendAnalyzer/OilVisionDropzone.tsx` | Props `12`; component `39` |
| `src/components/trendAnalyzer/ViscosityTanTrendChart.tsx` | Props `24`; chart `30` |
| `src/components/reports/OilResultsTab.tsx` | Props `37` |
| `src/components/reports/OilTrendLibraryTab.tsx` | Props `24` |
| `src/components/reports/OilProgramDossierTab.tsx` | Props `25` |
| `src/components/reports/OilPrognosticsTab.tsx` | prognostics |

### 8.2 Key logic exports

| Module | Key exports (line) |
|---|---|
| `src/lib/oilAnalysisMetrics.ts` | `WearGenerationRate` `35`, `calculateWearGenerationRate` `56`, `getThresholdStatus` `124`, `projectTanTbnCrossover` `228`, `tanTbnTrend` `292`, `isoToNasClass` `388`, `validateIsoTriplet` `591`, `parseIsoCode` `669`, `validateFerrographyReadings` `803`, `drFerroIndices` `878`, `projectHoursToThreshold` `961`, `varnishRiskIndex` `1004`, `detectMorphologyTransitions` `1026` |
| `src/lib/oilTribologyGuidance.ts` | `ISO_VG_TOLERANCE_PERCENT` `8`, `resolveViscosityGradeGuard` `60`, `ISO_4406_RANGES` `97`, `decodeIso4406` `142`, `wearMetalRatios` `169`, `alloyCoElevationRatios` `199`, `siliconAluminumRatio` `236`, `metallurgyOriginGuidance` `280`, `filterOilSamplesToWindow` `318` |
| `src/lib/oilDiagnosticSave.ts` | `OIL_LAB_MEASUREMENT_KEYS` `64`, `hasOilLabData` `136`, `ferrographySaveWarnings` `151`, `buildOilSampleSavePayload` `209` |
| `src/lib/oilAnalysisPersistence.ts` | `OIL_ANALYSIS_API_PATH` `20`, `coerceSaveOilSampleInput` `124`, `getOrCreateOilAnalysisId` `187`, `fetchOilSamplesForAsset` `201`, `saveOilSample` `221` |
| `src/lib/oilSampleRow.ts` | `OilSampleDbRow` `25`, `mapOilSampleRow` `123`, `fetchOilSamples` `191` |
| `src/lib/oilVisionExtractor.ts` | `OIL_VISION_API_PATH` `34`, `mapOilTranscription` `623`, `mergeConsensus` `742`, `mapVisionJsonToOilReportData` `1103`, `extractOilReportFromImageBase64` `1329`, `VISION_EXTRACTION_MODES` `1627`, `deriveGeometryEstimatePeaks` `1768` |
| `src/types/oilAnalysis.ts` | `MORPH_CATEGORIES` `28`, `MORPH_COLUMN` `76`, `OilSample` `90`, `DEFAULT_ALARM_LIMITS` `245` |
| `src/lib/oilSampleRow.ts` (read path) | `/api/oil-analysis?assetId=` |

**API:** `GET/POST /api/oil-analysis` (`server.ts:2151-2198`), `POST /api/oil-analysis/vision-extract` (`server.ts:2200`). `OIL_ANALYSIS_API_PATH` is defined in three client modules (`oilSampleRow.ts:23`, `oilAnalysisPersistence.ts:20`, `oilDiagnosticSave.ts:23`); they must stay identical.

### 8.3 DB columns read

`oil_analysis` (`id`, `asset_id`, `tenant_id`) and `oil_samples` (all columns listed in §3.2). NAS/SAE/WPC/WSI/PLP/DL-DS are derived. No oil data in `analysis_results.peaks`.

### 8.4 Tests that lock it

Unit (node):
- `src/lib/oilAnalysisPersistence.test.ts`
- `src/lib/oilDiagnosticSave.test.ts`
- `src/lib/oilDiagnosticSave.sliceAO.test.ts`
- `src/lib/oilTribologyGuidance.test.ts`
- `src/lib/oilWearMetalsMetrics.sliceAR.test.ts`
- `src/lib/oilVisionExtractor.geometryEstimate.test.ts`

Tab contracts:
- `src/test/harness/oil.harness.test.tsx`
- `src/components/OilInputAccordions.sliceAO.test.tsx`
- `src/components/reports/OilResultsTab.sliceAL.test.tsx`
- `src/components/trendAnalyzer/AddOilSampleModal.sliceAO.test.tsx`
- `src/components/trendAnalyzer/OilCleanlinessTab.test.ts`
- `src/components/trendAnalyzer/OilCleanlinessTab.sliceAN.test.tsx`
- `src/components/trendAnalyzer/OilFluidChemistryTab.sliceAM.test.tsx`
- `src/components/trendAnalyzer/OilWearMetalsTab.sliceAR.test.tsx`
- `src/components/trendAnalyzer/OilFerrographyVarnishTab.sliceAO.test.tsx`
- `src/components/trendAnalyzer/OilFerrographyVarnishTab.sliceAP.test.tsx`
- `src/components/TrendAnalyzer.oilDiagnosticsSave.test.ts`

---

## 9. Core libraries

### 9.1 Database, TLS, boot

| File | Key exports | Storage touched | Tests |
|---|---|---|---|
| `src/lib/db.ts` | `isDbConfigured` `32`, `query` `36`, `connectWithRetry` `66` | opens `pg.Pool` from `DATABASE_URL` | `src/lib/boot.test.ts` |
| `src/lib/dbConnection.ts` | `normalizeDatabaseUrl` `128`, `isLoopbackDatabaseUrl` `161`, `buildPoolConfig` `191`, `probeVerifyFull` `225`, `resolveBootTlsMode` `264` | no tables; TLS mode / pool config | `src/lib/dbConnection.test.ts` |
| `server.ts` | `PORT` `252`, `initializeDatabase` `16535+`, `setupServer` `19061`, schema `17086-18560` | all tables / migrations | `src/lib/boot.test.ts`, `src/lib/multiTenantIsolation.test.ts` |

### 9.2 Auth, RBAC, tenancy, entitlements

| File | Key exports | Storage touched | Tests |
|---|---|---|---|
| `src/lib/auth/password.ts` | `hashPassword` `24`, `hashPasswordSync` `29`, `verifyPassword` `44` | `users.password_hash` | `password.test.ts` |
| `src/lib/auth/session.ts` | `DEFAULT_AUTH_COOKIE_NAME` `11`, `DEFAULT_SESSION_TTL_HOURS` `12`, `createSession` `123`, `findSessionByToken` `144`, `deleteSession` `166` | `auth_sessions` (`user_id`, `token_hash`, `expires_at`) | `session.test.ts` |
| `src/lib/auth/middleware.ts` | `createApiAuthGuard` `149`, `requireAuth` `207`, `requireRole` `217`, `tenantIdFromRequest` `238`, `stripClientTenancyFields` `134` | `users`, `auth_sessions`, `companies` | `middleware.test.ts`, `src/lib/multiTenantIsolation.test.ts` |
| `src/lib/auth/rbac.ts` | `roleHasPermission` `16`, `roleAtLeast` `20` | pure | `rbac.test.ts` |
| `src/lib/auth/envGuard.ts` | `isDevAuthSeedEnabled` `53`, `collectProductionEnvErrors` `62`, `assertProductionAuthEnv` `103` | pure | `envGuard.test.ts` |
| `src/lib/auth/bootstrapAdmin.ts` | `bootstrapFirstAdmin` `36` | `users` (empty-DB bootstrap only) | `bootstrapAdmin.test.ts` |
| `src/lib/auth/demoSeedLogin` behavior | username-keyed demo row, always re-stamps `demo123` | `users`, `companies` | `demoSeedLogin.test.ts` |
| `src/lib/roles.ts` | `CANONICAL_ROLES` `19`, `Permission` `44`, `ROLE_PERMISSIONS` `108`, `hasPermission` `194`, `requirePermission` `238`, `evaluateRoleChange` `270` | `users.role` | `roles.test.ts` |
| `src/lib/entitlements.ts` | `ModuleKey` `11`, `MODULE_CATALOG` `89`, `getEntitlements` `167`, `getActiveModuleKeys` `182`, `requireModule` `240` | `tenant_entitlements`, `companies` | `entitlements.test.ts` |
| `src/lib/tenantInvites.ts` | `generateInviteToken` `27`, `buildInviteNotification` `82`, `evaluateDisableUser` `126` | `auth_invites`, `users` | `tenantInvites.test.ts` |
| `src/lib/moduleNav.ts` | `TAB_MODULE_REQUIREMENTS` `12`, `isTabEntitled` `23`, `visibleTabs` `32` | session entitlements | `entitlements.test.ts` |

### 9.3 Hierarchy / assets

| File | Key exports | Storage touched | Tests |
|---|---|---|---|
| `src/lib/hierarchyApi.ts` | `fetchHierarchy` `214`, `createUnit` `228`, `createRoute` `235`, `createAsset` `260`, `createComponent` `289`, `createCollectionPoint` `305`, `updateAsset` `339`, `deleteHierarchyNode` `376` | `plants`, `units`, `routes`, `assets`, `components`, `collection_points`, `measurement_points`, `import_id` columns | `hierarchyApi.test.ts`, `hierarchySaveGuard.test.ts`, `multiTenantIsolation.test.ts` |
| `src/lib/hierarchyFlex.ts` | `SYSTEM_ROUTE_NAME` `20`, `SIMPLE_MODE_PLANT_NAME` `21`, `findOrCreateSimpleModeRoute` `60`, `findOrCreateTenantPlant` `90`, `resolveSimpleModeHierarchy` `118` | `plants`, `routes`, `units` | `hierarchyFlex.test.ts` |
| `src/data/equipmentDb.ts` | `EquipmentStore` `224`, `DEMO_EQUIPMENT_SEED` `298`, `flattenEquipment` `966`, `getEquipmentStore` `1010`, `saveEquipmentStore` `1038`, `ensureSitePlantRoot` `1083`, `resolveActiveDbSelectionFromNode` `1269` | browser localStorage mirror of hierarchy; server is source of truth | `equipmentDb.test.ts`, `EquipmentExplorer.tree.test.tsx` |

### 9.4 Persistence / diagnostics / reports

| File | Key exports | Storage touched | Tests |
|---|---|---|---|
| `src/lib/analysisPersistence.ts` | path constants `13-17`, `SavedAnalysisResult` `34`, `saveAnalysisResult` `170`, `fetchAnalysisResults` `190`, `fetchLatestMcaAnalysis` `213`, `fetchAlerts` `229`, `acknowledgeAlert` `246`, `fetchDiagnosisLogs` `257`, `setAnalysisBaseline` `272` | `analysis_results`, `alerts`, `diagnosis_logs` | `telemetryProvenance.test.ts`, tab tests |
| `src/lib/diagnostics/sensorFusion.ts` | `TECHNOLOGY_LABEL` `36`, `ULTRASOUND_DB_BANDS` `80`, `THERMOGRAPHY_DELTA_T_BANDS_C` `88`, `scoreVibration` `191`, `scoreUltrasound` `293`, `scoreThermography` `359`, `scoreOil` `511`, `assembleFusion` `581`, `loadSensorFusion` `650` | reads `analysis_results`, `oil_samples` via loaders | `sensorFusion.test.ts` |
| `src/lib/diagnostics/consensusCascade.ts` | `CONSENSUS_CASCADE_TIMEOUT_MS` `77`, `CONSENSUS_VISION_CHAIN` `81`, `CONSENSUS_TEXT_CHAIN` `116`, `ConsensusProvenanceRecorder` `300`, `runConsensusCascade` `649` | no DB; provider calls | `consensusCascade.test.ts` |
| `src/lib/diagnostics/cmmsPayload.ts` | `CMMS_TARGETS` `32`, `buildCmmsFieldList` `346`, `buildCmmsPayload` `513`, `buildCustomCmmsFields` `528`, `fetchPlanningBundle` `746` | `planning_configs`, `work_orders`, `component_assessments` | `cmmsPayload.test.ts`, `CmmsPayloadBridge.test.ts` |
| `src/lib/diagnostics/prognosis.ts` | `MPC_THRESHOLD` `59`, `RULER_THRESHOLD` `60`, `buildOilProjections` `148`, `buildVibrationProjections` `220`, `buildPrognosis` `273` | derived from tab reads | `pfEngine.test.ts` (adjacent) |
| `src/lib/diagnostics/signOff.ts` | `DIAGNOSIS_SIGN_OFF_PATH` `9`, `fetchSignOff` `37`, `saveSignOff` `50`, `formatVerification` `66` | `diagnosis_sign_off` | `signOff.test.ts` |
| `src/lib/reports/reportPersistence.ts` | `REPORTS_PATH` `23`, `saveReport` `60`, `fetchReports` `82`, `fetchReport` `98`, `deleteReport` `105`, `rehydrateReport` `116` | `reports` | `reportExport.test.ts`, `verify-report-persistence.ts` |
| `src/lib/reports/technologySummary.ts` | `REPORT_TECHNOLOGIES` `31`, `buildMultiTechReport` `369`, `toTechnologySummaryMap` `452`, `fromTechnologySummaryMap` `467` | `reports.technology_summary` | report tests |
| `src/lib/reportExport.ts` | `buildReportPdf` `282`, `exportReportPdf` `490`, `reportCsvText` `655`, `exportReportCsv` `668`, `exportReportXlsx` `684` | generated artifacts; no direct DB | `reportExport.test.ts`, `src/components/ArtifactDisclaimer.test.tsx` |

### 9.5 Maintenance / prescriptive knowledge (single-source citations)

`src/lib/maintenance/prescriptiveDictionary.ts` is the citation and threshold dictionary:
- `IR_PP_BRACKETS` `1440`, `IR_PA_BRACKETS` `1448`, `evaluateIrSeverity` `1456`.
- `US_DDB_SOURCE` `1481`, `US_DDB_BRACKETS` `1492`, `US_CATASTROPHIC_DB` `1499`, `evaluateUsSeverity` `1512`.
- `PD_PEAK_DB_SOURCE` `1550`, `PD_PEAK_DB_BRACKETS` `1553`, `evaluatePdPeakDb` `1589`.
- MCA citations `1662-1714`, `MCA_IMBALANCE_BRACKETS` `1721`, `evaluateMcaSeverity` `1728`.
- Oil citations `1830-1930`, `OIL_WEAR_METALS` `1842`, `formatOilPpm` `1851`, `WEAR_METAL_KEYS` `1877`.
- Telemetry provenance `1767-1788`.
- Tests: `src/lib/maintenance/prescriptiveDictionary.test.ts`.

`src/lib/maintenance/workOrderPrefill.ts` (`buildWorkOrderPrefill` `122`, `stageWorkOrderPrefill` `298`), `workOrderDrafts.ts`, `workOrderEvaluator.ts` (`evaluateVerdict` `195`) — tests: `workOrderPrefill.test.ts`, `plannerCalendarPrefill.test.tsx`, `plannerCalendarFixtures.test.tsx`.

### 9.6 Vision / AI runtime guards

| File | Key exports | Tests |
|---|---|---|
| `src/lib/vision/clientDeadline.ts` | `VISION_EXTRACTION_TIMEOUT_MS` `11`, `withDeadline` `84`, `ClientDeadlineError` `36`, `formatRunStatus` `132` | `clientDeadline.test.ts` |
| `src/lib/vision/useAbortableRun.ts` | `useAbortableRun` `31` | `useAbortableRun.test.tsx` |
| `src/lib/vision/masterVisionPrompt.ts` | `MASTER_VISION_PROMPT` `6`, `MasterVisionData` `179` | `oilVisionExtractor.geometryEstimate.test.ts` |
| `src/lib/ai/aiBootHealth.ts` | `probeAiBootHealth` `329`, `formatAiBootHealth` `335` | `aiBootHealth.test.ts` |
| `src/lib/consensusEngine.ts` | `describeConsensusDegradation` `151`, `analyzeSpectrumWithOpenAI` `1269` | `consensusEngine.test.ts` |

### 9.7 Other core helpers

| File | Purpose | Tests |
|---|---|---|
| `src/lib/roles.ts` | roles/permissions (see 9.2) | `roles.test.ts` |
| `src/lib/anomalyBoard.ts` | anomaly aggregation (`buildAnomalyBoard` `210`) | `anomalyBoard.test.ts` |
| `src/lib/assessmentWizard.ts` | component assessment validation (`validateAssessmentDraft` `186`) | `assessmentWizard.test.ts` |
| `src/lib/goodCatches.ts` | cents-only ROI ledger (`validateGoodCatchLinks` `202`, `buildGoodCatchSummary` `285`) | `goodCatches.test.ts` |
| `src/lib/notifications.ts` | email/in-app ledger builders (`dispatchEmailNotification` `239`) | `notifications.test.ts` |
| `src/lib/tenantSettings.ts` | display-unit preferences (`fetchTenantDisplayUnits` `35`, `useTenantDisplayUnits` `68`) | covered by units + settings paths |
| `src/lib/singleFlight.ts` | dedupe concurrent loads (`createSingleFlight` `18`) | — |
| `src/lib/safeApiJson.ts` | finite-safe JSON responses (`safeJsonStringify` `24`, `buildAnalyzeVibrationSuccessBody` `37`) | — |

### 9.8 Cross-tech harness

`src/test/harness/contract.tsx`:
- `HARNESS_EQUIPMENT_STORE` `96`, `setupHarness` / `openTech` / `loadFixture`, `expectTestIdContent`, `expectUnitIsolation`, `expectNoFabricatedValue`, `plantDomLie` `~265`, `ContractViolation` `83`.
- Fixtures: `src/test/harness/fixtures/{vibration,thermography,ultrasound,mca,oil}Fixtures.ts`, barrel `fixtures/index.ts`.
- Mutation doctrine: `src/test/harness/thermography.harness.test.tsx:168-212`, `ultrasound.harness.test.tsx:161`, `vibration.harness.test.tsx:113-152`.

---

## 10. API map (production Express)

| Endpoint | Handler | Notes |
|---|---|---|
| `GET /api/health` | `server.ts:293` | fast liveness |
| `POST /api/auth/login` | `server.ts:11612` | demo login works with `demo` / `demo123` when seeded |
| `POST /api/analyze-vibration` (+ `/api/v1/diagnose`) | `server.ts:446-456` | consensus engine |
| `POST /api/extract-vibration-image` | `server.ts:480` | vision extraction for vibration/MCA |
| `POST /api/detect-spectrum-regions` | `server.ts:764` | chart region detection |
| `POST /api/analyze-thermography` | `server.ts:900-918` | IR engine |
| `POST /api/extract-thermal-metadata` | `server.ts:925` | EXIF/radiometric metadata |
| `POST /api/analyze-ultrasound` | `server.ts:1087-1104` | UE engine |
| `POST /api/save-analysis-result` | `server.ts:1375` | writes `analysis_results` (+ optional alerts/log) |
| `GET /api/analysis-results` | `server.ts:2055` | all modality tab reads |
| `GET /api/analysis-results/:id` | `server.ts:2289` | detail |
| `POST /api/analysis-results/:id/baseline` | `server.ts:2307` | baseline flag |
| `GET/POST /api/oil-analysis` | `server.ts:2151/2172` | `oil_samples` |
| `POST /api/oil-analysis/vision-extract` | `server.ts:2200` | oil vision |
| `GET/POST /api/reports`, `GET/DELETE /api/reports/:id` | `server.ts:2446-2585` | multi-tech reports |
| `GET /api/alerts`, `POST /api/alerts/:id/acknowledge` | `server.ts:2609`, `2771` | alerts |
| `GET /api/diagnosis-logs` | `server.ts:3155` | run history |
| `GET/POST /api/diagnosis-sign-off` | `server.ts:2348/2370` | engineer sign-off |
| `GET /api/hierarchy` | `server.ts:13797` | hierarchy tree |
| `POST /api/assets/bulk-import` (+ aliases) | `server.ts:14758` | atomic hierarchy import (slice A) |
| `DELETE/POST /api/imports/:id` | `server.ts:15339-15340` | discard one import batch |
| `GET/PUT /api/tenant-settings` | `server.ts` (see `src/lib/tenantSettings.ts:16`) | display units |
| `POST /api/create-portal-session`, Square webhook | `server.ts` (SQUARE-PORT) | billing; not a modality |

---

## 11. Slice history

Chronological. Commit hashes are short SHA-1. Rows are append-only.

### 11.1 Pre-slice foundation (context)

| Commit | Date | Change |
|---|---|---|
| `3638a9c` | 2026-07-04 | Initial commit |
| `b00e20e` | 2026-08-13 | Zero-Touch Thermography / SCADA / EXIF autofill |
| `947f91c` | 2026-08-22 | MCA + groundwall persistence/mapping fix |
| `09b61aa` | 2026-08-24 | Oil analysis tabs + Add Sample modal refactor |
| `cf995d5` | 2026-08-27 | Dual-model consensus oil extraction; oil technology locked |
| `13871f7` | 2026-08-29 | Pass 3: MCA + cross-tech gates, consensus race, race guards |
| `5518859` | 2026-08-29 | Slim master vision prompt to transcription contract |

### 11.2 Slice ledger

| Slice | Commit | Date | Locked / changed |
|---|---|---|---|
| A (import) | `1591599` | 2026-10-29 | Atomic bulk import: pinned transaction, honest failure, `imports` + `import_id`, discard batch |
| B (import) | `d03e04f` | 2026-10-29 | Tag-keyed idempotent upsert |
| C (assets) | `1dc6ef9` | 2026-10-29 | Manual tag unique violation → 409 |
| D (dashboard) | `8b23ddc` | 2026-10-29 | Actionable empty-state CTAs with plant precedence |
| E (api) | `d3af5e2` | 2026-10-29 | Stop shared fetch wrapper misreading 304/204 |
| H (vibration) | `603ea83` | 2026-10-30 | Canonical mm/s RMS + single ISO zone classifier |
| H2 (units) | `82c08eb` | 2026-10-30 | Per-tenant display units (display-only) |
| I + J (vibration) | `3da2b93` | 2026-10-30 | ISO threshold lines + thin-asset resilience |
| K (work order) | `8803f24` | 2026-10-30 | Prefill draft flow from Trend Analyzer action card |
| J2 (vibration) | `ea0eb3c` | 2026-10-30 | Spectral thin-asset guards + chart audit |
| L (trend) | `61a8216` | 2026-10-30 | Enveloping history containment, range binding, kinematic save-sync |
| R (trend) | `2ebf824` | 2026-10-30 | Chart modals for tabs 2–4 outside broadband branch |
| P (trend) | `a8ab6f6` | 2026-10-30 | Remove phantom Spectrum A/B data-point click |
| S (waveform) | `04be08f` | 2026-10-30 | Peak-to-peak through H2 + kill fake-zero impact count |
| T (waveform) | `913254d` | 2026-10-30 | Tab-name honesty per capability |
| U (IR) | `41fca70` | 2026-11-01 | Same-date timestamp axis + temperature units + IR windowing |
| V (IR) | `89930b3` | 2026-11-01 | Emissivity/ambient pill + NETA repair matrix, present-if-stored |
| W (IR) | `e19c60c` | 2026-11-01 | Phase Delta / I²R honesty, adaptive projection, <40 % guard |
| X (IR) | `7f05395` | 2026-11-01 | Radiometric/isotherm honesty, gated T_ref trend, provenance baseline |
| Y (IR) | `a38f6db` | 2026-11-01 | Mechanical/refractory honesty + gated creep/friction/ambient Δ |
| Z (trend+UE) | `c0d7252` | 2026-11-01 | Selector under tech cards + UE Bearings honesty |
| AA (UE) | `57f6e84` / `f28bbc5` | 2026-11-01/02 | Compressed air leaks: basis pill, precision, windowing, gated payback |
| AB (UE) | `07c1848` | 2026-11-02 | Wire collected-but-dropped inputs per run; baseline fallback disclosure |
| AC (UE) | `78e60b2` | 2026-11-02 | Electrical PD honesty, fallback baseline, single severity |
| AD (UE) | `2dea6a7` | 2026-11-04 | Steam traps: kill IR trap-ΔT misattribution, assumption payback |
| AF (MCA) | `ab51bda` | 2026-11-04 | Winding/phase build-right: material-gated temp, NEMA citation, 0-Ω guard |
| AG (MCA) | `57200aa` | 2026-11-05 | Groundwall IR data-quality gate |
| AH (MCA) | `b8cba55` | 2026-11-09 | RIC honesty: gated spatial FFT, true-source ratio, stored baseline |
| AI (MCA) | `b79a351` | 2026-11-10 | Surge honesty: IEEE 522 guard, true-source EAR, gated damping |
| AJ (oil) | `58a18eb` | 2026-11-10 | Persist oil diagnostic runs (save path was missing) |
| AL (oil) | `0e46cc9` | 2026-11-10 | ISO VG guard, ISO 4406 dissector, descriptive metallurgy, ref-temp lock |
| AM (oil) | `d938396` | 2026-11-10 | Fluid chemistry: descriptive TAN/TBN, gated slope, no crossover, FTIR raw |
| AN (oil) | `5a9e1d9` | 2026-11-10 | ISO 4406 triplet validity gate |
| AO (oil) | `bcd690b` | 2026-11-10 | Ferrography/varnish intake end-to-end, null-preserving |
| AP (oil) | `072ec2a` | 2026-11-11 | Ferrography validity gate, windowing lockstep, transition anchoring |
| AQ (oil) | `e954169` | 2026-11-11 | Park varnish onset projection |
| AR (oil) | `d064572` | 2026-11-11 | Wear metals: D5185 citation split, 0h gate, descriptive alloy/Si:Al |
| VS1 (vibration) | `cf447ca` | 2026-11-12 | Single windowed-record SSOT + verdict reconciliation + running-state |
| VS1+VS4 (vibration) | `ab9337f` | 2026-11-12 | Broadband SSOT reconciliation + spectral stored-vs-derived |
| VS2 (AI) | `4e895c6` | 2026-11-12 | Vision client deadline + cancel + honest elapsed status |
| VS3 (AI) | `c2304aa` | 2026-11-12 | Repoint legacy vision, truthful boot health, consensus degradation |
| VS7 (IR) | `b581aa9` | 2026-11-12 | Park I²R load projection, present-if-stored ε/ambient/NETA, T_ref gate |
| DBLOCAL | `9bd26d6` | 2026-11-13 | Loopback TLS short-circuit; remote probe unchanged |
| AUTHFIX | `83e7ad1` | 2026-11-13 | Username-keyed seed always re-stamps `demo123` |
| VS8 (UE) | `402e560` | 2026-11-13 | Log-unit guard, probe typing, threshold citations, `leak_cfm` provenance |
| THERMO-RAD | `13adb7f` | 2026-11-13 | Radiometric decoder + badge-OCR fallback, FLIR `.ir.webp` |
| HARNESS | `a6390b4` | 2026-11-13 | Cross-tech DOM honesty harness + mutation proof; IEEE-43-PASS fix |
| THERMO-FAULT | `e12d1ce` | 2026-11-13 | Stored fault/NETA verdict disclosed as not-ΔT-derived; M5 mutation |
| IR1 (IR) | `0f2a526` | 2026-11-13 | Load + emissivity-provenance gates, no new arithmetic |
| VERIFY-IR1 | `6cd356f` | 2026-11-13 | KPI Fault reads windowed row (windowing restored) |
| VIB-ENV (vibration) | `8faf865` | 2026-11-15 | Enveloping bearing kinematic gating + crest-factor audit |
| VERIFY-VIB-ENV | `68bc869` | 2026-11-15 | Render real `≤` / em-dash (JSX ignores `\uXXXX`) |
| IR1B (IR) | `bc22aa0` | 2026-11-15 | Stored-load verbatim, reference-basis badge, descriptive ΔT/Δt gate |
| IR2 (IR) | `132948b` | 2026-11-15 | Phase Delta I²R descriptive badge, ambient provenance, 40 % band |
| IR3 (IR) | `0380f16` | 2026-11-15 | IR unit-bar hygiene, ε-drift/span/isotherm/ROI provenance |
| IR3+IR3FIX (IR) | `9c077f7` | 2026-11-16 | Same as above + clock-independent multi-date fixture + hand DT slope |
| IR4 (IR) | `7ac7c3a` | 2026-11-16 | Mechanical/refractory; generic limit citations; parked projections |
| TESTENV | `59ddc06` | 2026-11-17 | Vitest jsdom/node project mapping + jsdom storage rebind; net green |

**[working tree] US1 (UE)** — no commit yet:
- `src/lib/ultrasound/bearingDeltaProvenance.ts` (new)
- `src/lib/ultrasound/bearingDeltaProvenance.test.ts` (new)
- `src/test/harness/ultrasoundUs1.test.tsx` (new)
- `src/components/TrendAnalyzer.tsx` (+88 lines), `src/lib/ultrasoundAnalysisEngine.ts` (modified)

Append the merge commit hash here when US1 lands.

---

## 12. Where each concern lives — quick lookup

| Question | Answer |
|---|---|
| Where is the tab selected? | `TrendAnalyzer.tsx:1131-1167` (cards), `Diagnose.tsx:4554-4557` |
| Where is a run saved? | `Diagnose.tsx:2648` → `analysisPersistence.ts:170` → `server.ts:1375` |
| Where does a tab read history? | `fetchAnalysisResults` → `server.ts:2055` |
| Where is oil saved/read? | `oilAnalysisPersistence.ts` / `oilSampleRow.ts` → `server.ts:2151-2198` |
| Where are citations defined? | `src/lib/maintenance/prescriptiveDictionary.ts` |
| Where is unit conversion? | `src/lib/vibration/units.ts` |
| Where is time-window filtering? | `src/lib/vibration/trendSeries.ts:41-78` |
| Where is running-state gating? | `src/lib/vibration/trendSsot.ts:58-182` |
| Where is IR chart extraction? | `src/lib/thermographyTrendSeries.ts:611-1042` |
| Where is MCA SSOT merge? | `src/lib/mca/mcaSsot.ts:209-278` |
| Where is auth/tenancy enforced? | `src/lib/auth/middleware.ts`, `server.ts` route guards |
| Where is the honesty harness? | `src/test/harness/contract.tsx` |
| What is not real? | `AIDataMigration.tsx` (simulation), `src/app/api/**` (parity), `dist/` |

---

## 13. Index log (append-only)

Add one line per slice/change: `YYYY-MM-DD | slice | file:line | what it is`.

```
2026-11-17 | MAP | docs/repo-map.md:1 | initial repository map (this file), no product change
2026-11-17 | US1 (working tree) | src/lib/ultrasound/bearingDeltaProvenance.ts:81 | stored-baseline ΔdB descriptor + verbatim stored class
2026-11-17 | US1 (working tree) | src/test/harness/ultrasoundUs1.test.tsx:1 | DOM locks for baseline provenance + stored class
CORRECTION: 2026-11-17 | MAP | TrendAnalyzer.tsx:5217/6662/8011/8887 | section anchors corrected by +1 (draft rows were off by one)
CORRECTION: 2026-11-17 | MAP | TrendAnalyzer.tsx:7011 | IR multi-tech pill is at 7011, not 7022
CORRECTION: 2026-11-17 | MAP | TrendAnalyzer.tsx:10895 | oil section is at 10895; oil sample save lives in AddOilSampleModal → saveOilSample, not TrendAnalyzer.tsx:5782
CORRECTION: 2026-11-17 | MAP | Diagnose.tsx:277 / 1062-1090 | 277 is the `Technology` type union; selector cards are 1062-1090
```

---

## 14. Known gaps / parked work (so nobody “fixes” them by accident)

- **Parked by design:** TAN/TBN crossover projection (`e954169`), Varnish Onset projection (`e954169`), IR I²R load projection (`b581aa9`), IR mechanical creep/friction projections (`7ac7c3a`).
- **No MCA unit tests** under `src/lib/mca/`; math is covered indirectly by component/harness specs.
- **NCBI/ISO code claims are guidance, not certification**; citations are in-repo strings, not external lookups.
- **Next.js parity files** are not served by the production Express app; changing them does not change runtime behavior.
- **`AIDataMigration`** remains a simulation and is hidden in production; the real import is `POST /api/assets/bulk-import`.
- **Direct oil metrics** (`oilAnalysisMetrics.ts`) have no dedicated spec file; oil behavior is locked via tab specs + `oilTribologyGuidance.test.ts`.
- **US1 is uncommitted**; if you build on it, expect the working-tree diff above.
