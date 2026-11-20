# MotorMedic-Pro Honesty Doctrine

Canonical capture of the project's honesty doctrine. Every rule is derived from an existing source and cited (file:line). Nothing here is invented, generalized, or softened. Where a rule is implied by test behavior but not stated in product text, it is marked "derived from test behavior" with its citation.

This document is documentation only. It changes no behavior.

## Source of truth for this capture

- Test locks: `src/test/harness/*.test.tsx` (N-VS*, N-IR*, N-HARNESS, N-VS9 regression locks)
- Honesty assertions across `src/lib/*.test.ts` and `src/components/**/*.test.tsx`
- UI constants: `"No baseline is invented"`, `ISO_4406_ORDINAL_RULE`, `ISO_PARTICLE_METHOD_NOT_STORED`, `MASTER_VISION_PROMPT` usage rules
- Architecture summary cross-reference: `docs/repo-map.md` §2 "Honesty doctrine" (itself cited to source lines)

---

## (a) Null-on-unreadable / never zero-fill

**A1. Absent/unreadable cells render null, never a default or estimate.**
- `src/lib/vision/masterVisionPrompt.ts:19` — "Blank cell -> value null, status 'absent'. Unreadable cell -> value null, status 'illegible'. Never guess or interpolate."
- `src/lib/vision/masterVisionPrompt.ts:22-23` — "Absent = null. No defaults, no estimates, no internal knowledge substituted." / "Zero Rule: a printed '0' is a REAL measurement. Emit value 0 with status 'extracted' and high confidence. Never omit, never substitute, never treat 0 as absent. Only blank or unmeasured cells are value null with status 'absent'."
- `src/lib/thermographyTrendSeries.ts:17-20` — null-trio `NOT_MEASURED` / `NOT_REPORTED` / `NOT_DETECTED` / `NOT_RECORDED` are deliberately distinct so an absent stored measurement is never blurred into "no fault found".
- `src/lib/oilAnalysisMetrics.ts:1219` — "UI renders '—' instead of a zero-filled or divide-by-zero ratio."
- `src/lib/mca/mcaSsot.ts:151` — "Incomplete triplets are absent. Never zero-fill a missing phase: a 0 Ω..."
- `src/lib/mca/mcaPersistence.ts:924` — "A partial measurement is absent, never a zero-filled triplet: a 0 Ω..."

**A2. Missing spectral peaks / order amplitudes are null, never zero-flattened.**
- `src/lib/vibration/spectralTrend.ts:356` — "Amplitude missing -> null so a peak is never zero-flattened."
- `src/lib/vibration/spectralTrend.test.ts:53-79` (derived from test behavior) — "does not zero-fill or fake 1X/2X when RPM is absent"; `amp1X`/`amp2X` stay `null`, `overall` still reported.
- `src/lib/vibration/spectralTrend.test.ts:106-114` (derived from test behavior) — "never zero-flattens a missing peak amplitude".

**A3. Wear-metal division-by-zero is confessed verbatim, never silently computed.**
- `src/test/harness/oil.harness.test.tsx:10-11` — "known-edge: aluminum reported 0 ppm → the division-by-zero is confessed verbatim, never silently computed".

---

## (b) Provenance — extracted vs inferred vs caller-supplied; a caller argument is never labeled "stored"

**B1. Stored ≠ derived; every computed value names its inputs and provenance.**
- `src/lib/vibration/spectralTrend.ts:54-71` — `OrderAmplitudeSource = "stored" | "derived"`; `SPECTRAL_ORDER_PROVENANCE_STORED` ("as extracted at collection"), `SPECTRAL_ORDER_PROVENANCE_DERIVED` ("re-extracted from stored FFT bins at the sample RPM"), `SPECTRAL_ORDER_PROVENANCE_MIXED`.
- `src/lib/vibration/rpmProvenance.ts:15-20` — `VibrationRpmSource = "measured" | "configured" | "default" | "unknown" | "absent"`; only measured/configured may gate frequency-domain interpretation.
- `src/lib/vibration/rpmProvenance.ts:12-13` — `CAPTURE_DEFAULT_VIBRATION_RPM = 1780` is the historical capture fallback, displayed never used to gate physics.
- `src/lib/thermographyTrendSeries.ts:659-690` — emissivity source classification: `"file-extracted"` vs `"app-default"` vs `null`, resolved from STORED markers only, never from an inferred substrate/material value.
- `src/lib/oilTribologyGuidance.ts:317-318` — `ISO_TREND_MEAN_NOTE`: "Per-band ordinal steps only — ISO 4406 codes are never averaged."

**B2. A caller argument is never labeled "stored"; only a record can unlock a verdict.**
- `src/lib/oilAnalysisMetrics.ts:1621-1629` — `hasFreshOilFtirBaseline`: "Deliberately takes a RECORD, not a caller-supplied boolean: a flag could be fabricated at the call site. A boolean or any non-record value is false."
- `src/lib/oilAnalysisOa2.test.ts:234-238` (derived from test behavior) — "never derives a verdict without a stored fresh-oil reference record"; `hasFreshOilFtirBaseline(true as unknown)` is `false`; "A caller-supplied flag is not a record and cannot unlock a verdict."
- `src/lib/vision/masterVisionPrompt.ts:35` — "data.* stay EMPTY: the code maps raw_table deterministically. Do NOT hand-map canonical keys."

---

## (c) Baseline gating — no invented baseline; identity must be confirmed

**C1. No baseline is invented.**
- `src/test/harness/oil.harness.test.tsx:9` — "honest empty state: no samples → 'No Oil Analysis Data', no invented baseline ('No baseline is invented.')"
- `src/test/harness/oil.harness.test.tsx:52` — `expectTextRendered("No baseline is invented.");`
- `src/components/trendAnalyzer/OilCleanlinessTab.tsx:715` — "No per-band comparison is derived. No baseline is invented and no code is subtracted or averaged."
- `src/components/trendAnalyzer/OilWearMetalsTab.tsx:400` — "in-window measured sample. No baseline is invented."

**C2. A verdict against a baseline requires a stored reference record; never derived from absence.**
- `src/lib/oilAnalysisMetrics.ts:1621-1635` — `ftirBaselineVerdict`: "Descriptive verdict against a stored fresh-oil reference, or null when no such record exists. Never derives a verdict from an absent baseline."
- `src/lib/oilAnalysisMetrics.ts:1507-1528` — `compareIsoTripletToTarget` returns `null` unless BOTH current and target triplets are reported, so the caller renders "—" with "ISO codes not reported" instead of a comparison against nothing.
- `src/lib/oilAnalysisOa2.test.ts:233-251` (derived from test behavior) — "uses a stored reference when one exists"; absent reference → `null` verdict.

---

## (d) Rate/trend gating — distinct non-zero hours or >=3 distinct dates; endpoint/elapsed-time basis; no projection

**D1. Wear rate requires at least two samples with distinct non-zero operating hours; no extrapolation.**
- `src/lib/oilAnalysisMetrics.ts:50-55` — "Hard-gated: requires at least two samples that carry the element and have distinct non-zero operating hours. A sample with 0/absent hours contributes nothing, so an all-zero-hour demo cannot synthesize a rate. No acceleration or hours-to-limit extrapolation is produced — this is the AQ-parked family."
- `src/lib/oilAnalysisMetrics.ts:56-105` — `calculateWearGenerationRate`: filters out `hours <= 0`; requires `distinctHourCount >= 2`; computes `ppmPer100Hours` from endpoint pair `(last - first) / hoursElapsed * 100`; returns `status: "insufficient"` otherwise.

**D2. TAN–TBN slope requires >=3 distinct dates; endpoint/elapsed-time basis; withheld below the gate.**
- `src/lib/oilAnalysisMetrics.ts:334-435` — `tanTbnTrend`: collapses duplicate dates; `gaps.length < 3` → `slopePerDay: null`, `slopeBasis: null`; `slopeBasis = "elapsed-days"` (endpoint dates) or `"operating-hours"`; hour path requires all dates stamped and `distinctNonZeroHours >= 2`.
- `src/lib/oilAnalysisOa2.test.ts:75-83` (derived from test behavior) — "withholds the slope below three paired distinct dates"; `distinctDateCount: 2` → `slopePerDay: null`.
- `src/lib/oilAnalysisOa2.test.ts:63-73` (derived from test behavior) — "keeps the delta null for unpaired TAN and never zero-fills TBN"; `delta: null`, `delta not toBe(0)`, `distinctDateCount: 0`.

**D3. Projection is parked; no hours-to-limit or curve-fit projection reaches the tab.**
- `src/test/harness/thermographyIr4.test.tsx:238-241` (N-VS9 lock) — "N-VS9 parked curve-fit projection stays out of the tab"; `trendSrc` must not contain "Curve-Fit Failure Projection" or "formatTemperatureProjection".
- `src/test/harness/oil.harness.test.tsx:14-15` — "no-extrapolation: generation rates never project hours-to-limit"; `expectNoExtrapolation([/hours-to-limit projection/i])`.
- `docs/repo-map.md:121` — "Park extrapolation; label what remains. TAN/TBN crossover and Varnish Onset are parked; load-projection on IR is parked".

---

## (e) Ordinal data (ISO codes) never averaged or subtracted

**E1. ISO 4406 codes are ordinal log bands; per-band at/above/below comparison only.**
- `src/lib/oilAnalysisMetrics.ts:1488-1494` — `ISO_4406_ORDINAL_RULE`: "ISO 4406 codes are ordinal log bands: each code step is roughly a doubling of particles/mL. Codes must never be averaged or arithmetically subtracted; current vs. target is a per-band at/above/below comparison."
- `src/lib/oilAnalysisMetrics.ts:1507-1528` — `compareIsoTripletToTarget`: "Uses ordinal comparison only — no subtraction, averaging or interpolation." Returns null unless both triplets reported.
- `src/lib/oilTribologyGuidance.ts:317-318` — `ISO_TREND_MEAN_NOTE`: "Per-band ordinal steps only — ISO 4406 codes are never averaged."
- `src/lib/oilTribologyGuidance.ts:320-321` — `ISO_PARTICLE_METHOD_NOT_STORED`: "Particle-counting method/instrument is not stored — ISO 4406 codes are not comparable across samples; cross-sample cleanliness trend withheld."
- `src/lib/oilAnalysisOa2.test.ts:180-182` (derived from test behavior) — asserts `ISO_4406_ORDINAL_RULE` contains "ordinal log bands", "never be averaged", "arithmetically subtracted".
- `src/components/trendAnalyzer/OilCleanlinessTab.test.ts:300-307` — "keeps the ordinal rule, Noria badge and no-baseline wording intact": asserts `ISO_4406_ORDINAL_RULE`, "No baseline is invented", `ISO_PARTICLE_METHOD_NOT_STORED` present; `MASTER_VISION_PROMPT` absent.
- `src/components/trendAnalyzer/OilCleanlinessTab.tsx:715` — "No per-band comparison is derived. No baseline is invented and no code is subtracted or averaged."

**E2. Cross-sample cleanliness trend is withheld when the particle-counting method/instrument is not stored.**
- `src/lib/oilTribologyGuidance.ts:320-321` — `ISO_PARTICLE_METHOD_NOT_STORED` (see E1).
- `src/components/trendAnalyzer/OilCleanlinessTab.tsx:362` — renders `ISO_PARTICLE_METHOD_NOT_STORED` when method not stored.

---

## (f) Lock inventory — exact assertion strings and file:line

| Lock | Assertion string (verbatim) | File:line |
|------|-----------------------------|-----------|
| N-IR1 / N-IR1B | `"Definitive NETA classification assumes minimum load; load telemetry is not stored for this scan — the verdict is stored-only, not load-corrected."` | `src/test/harness/thermographyIr4.test.tsx:218-220` |
| N-IR1 / N-IR1B | `"Descriptive trend, not a failure forecast"` | `src/test/harness/thermographyIr4.test.tsx:221-223` |
| N-IR2 / N-IR3 | `"P ∝ I²R is an in-repo heuristic, not a standard"` (substring) | `src/test/harness/thermographyIr4.test.tsx:228-230` |
| N-IR2 / N-IR3 | `"Stored camera setting (not optically measured)"` | `src/test/harness/thermographyIr4.test.tsx:231-233` |
| N-IR2 / N-IR3 | `"Current operating point, not a projection"` | `src/test/harness/thermographyIr4.test.tsx:234` |
| N-VS9 | `"Curve-Fit Failure Projection"` must be absent | `src/test/harness/thermographyIr4.test.tsx:239` |
| N-VS9 | `"formatTemperatureProjection"` must be absent | `src/test/harness/thermographyIr4.test.tsx:240` |
| HARNESS (oil) | `"No baseline is invented."` | `src/test/harness/oil.harness.test.tsx:52` |
| HARNESS (oil) | `"Limit: 100 PPM"` (DEFAULT_ALARM_LIMITS.iron = 100 PPM) | `src/test/harness/oil.harness.test.tsx:51` |
| VS9 (MCA visual pass) | parked-extrapolation regression lock (AQ pattern e954169) | `src/components/McaVisualPass.sliceVS9.test.tsx:4,213` |
| MASTER_VISION_PROMPT byte-identical (non-MCA rungs) | `expect(request.prompt).toBe(MASTER_VISION_PROMPT)` | `src/lib/vision/visionLiveContracts.test.ts:218-224` |
| MASTER_VISION_PROMPT prefix (MCA rungs) | `expect(request.prompt.startsWith(MASTER_VISION_PROMPT)).toBe(true)` | `src/lib/vision/visionLiveContracts.test.ts:211` |
| MASTER_VISION_PROMPT byte-identical (e2e) | `expect(prompt, ...).toBe(MASTER_VISION_PROMPT)` | `src/lib/mca/mcaBarChart.e2e.test.ts:325` |
| MASTER_VISION_PROMPT startsWith (e2e grouped bar) | `expect(MCA_GROUPED_BAR_PROMPT.startsWith(MASTER_VISION_PROMPT)).toBe(true)` | `src/lib/mca/mcaBarChart.e2e.test.ts:332` |

Note: `N-VS*` / `N-HARNESS` / `N-IR*` / `N-VS9` are the regression-lock naming conventions used across `src/test/harness/` (e.g. `thermographyIr4.test.tsx:213`, `oil.harness.test.tsx` SLICE-HARNESS). Individual harness files carry their own verbatim lock blocks (e.g. `thermographyIr1b.test.tsx:248`, `thermographyIr2.test.tsx:247`, `thermographyIr3.test.tsx:229`).

---

## (g) Verification protocol

Before any change is considered complete:
1. Run the full suite green: `npm test -- --run --maxWorkers=1` (baseline: 1522 passed, 135 files, unchanged).
2. Run typecheck: `npx tsc --noEmit` (baseline: exit 0).
3. No commit until review. Do not commit as part of this capture.

---

## Traceability statement

Every rule above traces to a cited file:line. No rule is invented, generalized, or softened. Rules implied only by test behavior are marked "(derived from test behavior)" with the citation. Lock assertion strings are preserved verbatim.
