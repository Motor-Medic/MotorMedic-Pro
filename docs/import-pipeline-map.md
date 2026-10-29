# Import Pipeline Map — AI/Screenshot Import, Hierarchy, and Staging

**Status:** investigation only. No code, tables, or migrations were changed. This is the only new file.
**Method:** static inspection of `server.ts`, `migrations/`, and `src/`. No database writes or resets were performed. Paths are relative to the project root.

**Bottom line:** today there is no staged/draft import into the hierarchy. The real hierarchy importer writes directly to live tables, row by row, with no transaction, no import/batch handle, and no external-tag identity. The "AI Data Migration" screen is a production-hidden simulation that never reads the selected file and never writes to the database. A 4,000-asset import can partially land and still return `success: true`.

---

## CURRENT STATE

### 1. STAGE OR LIVE — direct-to-live, and NOT atomic

There is no preview/draft state on the only real hierarchy write path.

- The real endpoint is `POST /api/assets/bulk-import` (aliases `/api/bulk-import`, `/api/assets/upload`) at `server.ts:14603`.
- It writes straight into live tables inside a per-row loop at `server.ts:14638`:
  - plant find-or-create: `server.ts:14661-14673`
  - route find-or-create: `server.ts:14676-14688`
  - asset insert: `server.ts:14698-14705`
  - component inserts: `server.ts:14730-14739`
- There is **no `BEGIN` / `COMMIT` / `ROLLBACK` in the bulk-import handler** (`server.ts:14603-14854`). Every `pool.query` autocommits independently.
- The shortest accurate description of the "commit" is: the asset `INSERT` at `server.ts:14698-14704` (and each following component `INSERT` at `server.ts:14735-14736`) persists immediately; there is no single call that turns a preview into persisted rows.

**Answer to the critical sub-question: the commit boundary is NOT wrapped in one SQL transaction.**

Concrete failure at node 3,000 of 4,000:

- The loop is `for (let i = 0; i < assets.length; i++)` at `server.ts:14638`.
- Every row is wrapped in its own `try/catch` (`server.ts:14649`, `catch` at `server.ts:14830-14834`). A validation failure skips the row and **continues the loop** (`server.ts:14643-14647`); a database/constraint failure also skips and continues at `server.ts:14830-14834`.
- The handler then returns `success: true` with counts and warnings at `server.ts:14837-14844`.

Therefore a failure on row 3,000 can leave rows 1–2,999 promoted (and the loop may also continue past row 3,000), with 1,001 unwritten, while the response still says success. This non-atomic path is the top risk the build must close.

**The AI/screenshot path is even more disconnected:**

- `POST /api/ai-extract-csv` at `server.ts:14541` only calls Gemini and returns parsed JSON (`server.ts:14571-14595`). It writes nothing.
- The "Automated Legacy Data Migration" UI (`src/components/AIDataMigration.tsx`) is explicitly a simulation and returns `null` in production builds:
  - `src/components/AIDataMigration.tsx:74-77`
  - `processSelectedFile` never reads file contents; it waits 2.2s then installs hardcoded rows: `src/components/AIDataMigration.tsx:136-150`
  - "Start Migration" only runs a `setInterval`: `src/components/AIDataMigration.tsx:193-221`
- No client file calls `/api/assets/bulk-import`; a repo-wide search for that endpoint found only the server definition and project-structure text.

**Secondary live-write path:** the onboarding wizard writes plant → route → asset → component live, one request per step, with no transaction (`src/components/OnboardingWizard.tsx:63-71`, `103-111`, `145-158`, `168-178`). It is single-asset, but it confirms the codebase's default is write-then-live.

**Other transaction usage is not a reusable helper:** the only `BEGIN`/`COMMIT` blocks in `server.ts` are in collection-point batch handlers (`server.ts:15600-15651`, `15722-15758`, `15808-15831`). They issue `BEGIN` via `pool.query` rather than a pinned `pool.connect()` client, so they are not a safe pattern to copy for a 4,000-row import.

### 2. IDENTITY KEY — generated ID + name/route, not customer external tag

The hierarchy is keyed on the generated `SERIAL` primary key, and bulk import de-duplicates on **name**, not on tag:

- Assets are matched with `LOWER(name)` + `route_id`:
  `SELECT id FROM assets WHERE LOWER(name) = LOWER($1) AND route_id = $2` at `server.ts:14691-14693`.
- Components are matched with `LOWER(name)` + `asset_id` at `server.ts:14730-14732`.
- `tag_number` is only **stored** in the insert (`server.ts:14700-14703`), never used in the match.
- The asset insert is `INSERT INTO assets (route_id, company_id, name, tag_number, type, status, criticality, description)` at `server.ts:14698-14704`.

Schema reality:

- `assets.id SERIAL PRIMARY KEY` at `server.ts:16834`.
- `assets.tag_number VARCHAR(100)` at `server.ts:16838`; added idempotently at `server.ts:16854`. There is **no unique constraint** on it.
- `components.id SERIAL PRIMARY KEY` at `server.ts:16944`.
- No `external_id`, `external_source`, `source_system`, or `external_key` column exists in `server.ts` or `migrations/`. A search for SAP/Maximo/KKS finds only outbound CMMS-payload vocabulary (`src/lib/diagnostics/cmmsPayload.ts:33-34`), not import identity.
- `tag_number` is used elsewhere as a *lookup fallback* alongside id/name (e.g., `migrations/008_auth_sessions_rbac.sql:83-108`, `migrations/019_oil_analysis_tenant.sql:22`), which confirms it is semantically a customer tag but not a uniqueness guarantee.

**Answer:** imported assets/components key on generated IDs plus find-or-create by name/route. Customer tags (SAP/Maximo/KKS) are not the identity key and are not unique.

### 3. BATCH HANDLE — none

- There is no `import_id`, `batch_id`, `migration_batch`, or staging namespace in `src/` or `migrations/`; a search returns zero matches.
- The bulk-import handler returns only counts and warnings (`server.ts:14837-14844`), no handle.
- The UI's "Imports are tagged with migration batch IDs" (`src/components/AIDataMigration.tsx:412-414`) and "Importing Batch #2026-MIG" (`src/components/AIDataMigration.tsx:707`) are hardcoded display copy, not a real handle.

**Answer:** row-by-row writes with no single rollback handle. Batch undo is currently impossible without a schema change.

### 4. APPROVAL PREVIEW UX — a fake 10-row client table; the live tree is naive full-DOM

There are two distinct things to separate:

**a) The import "preview" UI**

- It is a plain `<table>` in `src/components/AIDataMigration.tsx` (`609-674`).
- The heading is literally "First 10 Rows Data Preview" (`src/components/AIDataMigration.tsx:583`).
- Rows come from the hardcoded `INITIAL_PREVIEW_ROWS` array of exactly 10 objects (`src/components/AIDataMigration.tsx:60-71`), installed regardless of the uploaded file (`136-150`).
- It has a client-only error filter (`src/components/AIDataMigration.tsx:94`, `585`) and client-only "Auto-Fix" (`177-190`).
- There is no virtualization, no pagination, no tree, no server preview, and no DB write. The component is hidden in production (`74-77`).

So for the import flow specifically, **no 4,000-node rendering exists today**. Neither disqualifying failure mode is exercised because the screen is not real. The risk is that the build mistakes this for a working preview surface: it has no file parsing, no validation engine, and no persistence.

**b) The live hierarchy browser (the likely foundation to extend)**

- It builds a recursive tree from the full store: `buildExplorerTree` at `src/components/EquipmentExplorer.tsx:1350-1514`.
- Nodes render recursively with plain React (`src/components/EquipmentExplorer.tsx:1698-1714`); the root maps the tree directly into the DOM (`4742-4756`).
- It is collapsed-by-default below depth 2 via `expanded[node.id] ?? depth < 2` (`src/components/EquipmentExplorer.tsx:1561`), with only the site root pre-expanded (`1914-1916`).
- There is **no virtualization library** in `package.json` (no `react-window`, `react-virtualized`, or `react-virtuoso`), and no pagination or search/filter over tree nodes. The only "search" is the unrelated AI component-spec search.

**Answer:** today the import preview is a fake 10-row full-DOM table. The reusable live tree is also naive full-DOM, but starts collapsed, so it does not hang on first paint. If the staging browser simply reuses that tree and expands 4,000 staged nodes, it will build 4,000+ DOM subtrees and hang; if it forces one-asset-at-a-time detail, it will train rubber-stamping. The build must add a bounded, scannable surface (server-side pagination/filtering or virtualization) rather than expand this tree to full size.

### 5. SCHEMA ROOM — no draft namespace; operational `assets.status` only

Real hierarchy columns from the boot DDL (which mirrors the SQL migrations):

- `plants`: `id`, `name`, `location`, `company_id`, `user_id`, `created_at` — `server.ts:16751-16758`. **No status/draft column.**
- `units`: `id`, `plant_id`, `name`, `created_at` — `server.ts:16771-16776` and `migrations/017_hierarchy_flex.sql:20-25`. **No status/draft column.**
- `routes`: `id`, `plant_id`, `unit_id`, `name`, `area`, `description`, `is_system`, `created_at` — `server.ts:16781-16790`; `is_system` also in `migrations/017_hierarchy_flex.sql:15-17`. **No status/draft column.**
- `assets`: `id`, `route_id`, `company_id`, `name`, `tag_number`, `type`, `manufacturer`, `model`, `serial_number`, `install_date`, `criticality`, `status`, `technology_type`, `description`, `created_at` — `server.ts:16833-16849`.
  - `assets.status VARCHAR(50) DEFAULT 'Active'` at `server.ts:16845` is **operational status** (defaulted to `'Active'` in create paths at `server.ts:14937` and `14960`), not import lifecycle. Do not overload it for draft/staging.
- `components`: `id`, `asset_id`, `name`, `type`, `manufacturer`, `model`, `specifications`, `specs`, `notes`, `created_at` — `server.ts:16943-16953`. **No status/draft column.**
- Tenant scoping is explicit via `company_id` on plants/assets and lineage joins (`migrations/018_hierarchy_tenant_backfill.sql`), but there is no import namespace.

**Next free migration number:** `migrations/` currently ends at `027_tenant_invites.sql`. The next free number is **028**.

### 6. TEMPLATE HOME — three unrelated "template" tables, no ISO 14224 typology

These tables exist, but none is an ISO 14224 hierarchy/typology engine:

- `component_spec_templates` — boot-only DDL at `server.ts:17226-17234`: `component_type`, `spec_fields JSONB`, `source`. It stores a list of **spec field names** per component type, used by `/api/get-component-specs` (`server.ts:8185-8195`) and AI-generated on cache miss (`server.ts:8264-8267`). A built-in list of names lives in `DEFAULT_TEMPLATES` (`server.ts:8101-8118`). This is a spec-field cache, not a taxonomy or equipment-class tree.
- `learning_database` — boot DDL at `server.ts:17203-17211`: `spectrum_image_url`, `extracted_values JSONB`, `correct_fault_type`, `confidence_score`, `source`, `timestamp`. It is a **vibration analysis training/label store**, written by diagnosis and SmartCBM import (`server.ts:6064-6066`, `6140-6144`). It is not a typology seed.
- `custom_cmms_templates` — `migrations/013_custom_cmms_templates.sql`, uniqueness in `migrations/015_cmms_templates_unique.sql`: `program_name`, `field_schema JSONB`, `created_by_tenant`. It is a **CMMS work-order field mapping** created from screenshots (`server.ts:18394-18402`), not an asset typology.

The only ISO 14224 material is hardcoded application taxonomy:

- `src/lib/failureModes.ts:1-16` declares a starter failure-mode taxonomy sourced from ISO 14224:2016.
- The array begins at `src/lib/failureModes.ts:33`; the header says it is deliberately a starter list, not an exhaustive export, and has no admin editor (`1-16`).

**Answer:** a typology/ISO 14224 engine is greenfield at the data layer. `failureModes.ts` is a useful seed for failure modes, but there is no table for equipment classes, component types, failure modes, or mappings. `component_spec_templates` and `learning_database` must not be repurposed as typology stores without an explicit migration and contract change.

---

## GAPS

| # | Gap | Current evidence | What the pipeline needs |
|---|-----|------------------|--------------------------|
| G1 | No stage/live boundary | Direct inserts in `server.ts:14698-14739` | `import_id` + draft visibility on every hierarchy level; all reads default to live-only |
| G2 | No atomic write | Loop `server.ts:14638`; per-row catch `14830-14834`; no `BEGIN` in handler | One pinned-client transaction per import; commit only after all rows validate/write |
| G3 | No batch handle | No `import_id`/`batch_id` anywhere; response counts only `14837-14844` | A batch record returned to the client and persisted on every row |
| G4 | No idempotent re-upload | Match on name+route `14691-14693`; `tag_number` not unique `16838` | Canonical external identity (`external_source` + `external_tag` or normalized `tag_number`) with a tenant-scoped unique constraint and upsert |
| G5 | No batch undo | No handle; routes/assets cascade deletes | Undo by `import_id` in one transaction; dependency guard so post-promotion measurements are not destroyed |
| G6 | No real preview/approval UI | Fake 10-row table `AIDataMigration.tsx:60-71`, `583`; file ignored `136-150`; hidden in prod `74-77` | Real server-backed staging query, summary counts, filters, bulk-approve clean set, exception detail |
| G7 | 4,000-node rendering not bounded | Recursive DOM `EquipmentExplorer.tsx:1698-1714`, root `4742-4756`; no virtualization dependency | Server-side pagination/filtering or virtualization; never render all 4,000 staged nodes at once |
| G8 | No scannable-first controls for imports | Only "First 10 Rows" + error toggle `AIDataMigration.tsx:583-604` | Search by tag, filter by error type/severity, collapsed groups, summary-first layout |
| G9 | Draft leakage risk | `GET /api/hierarchy` selects all rows `server.ts:13671-13705`; `normalizeHierarchy` includes all `src/lib/hierarchyApi.ts` around `73-170` | A single visibility predicate/view used by every hierarchy consumer and every dashboard/report join |
| G10 | No CSV transport | `papaparse` and `xlsx` are dependencies, but no server multipart/CSV parser; UI ignores file | Server-side CSV parse → normalized import rows → same atomic writer as AI |
| G11 | No ISO 14224 typology store | `failureModes.ts` hardcoded; no typology table | Seeded equipment-class/component/failure-mode model with explicit mapping, versioned and idempotent |
| G12 | No import audit trail | No batch table or per-row outcome persisted | Batch + row-level status/error storage so a completed import is auditable after the response |

---

## PROPOSED SLICE BREAKDOWN

The ordering below is driven by one constraint: nothing can stage a row until the schema can distinguish draft from live and identify a batch; nothing can display a staging browser until an atomic writer produces trustworthy draft rows; nothing can approve until a single-transaction promotion exists.

### Slice 1 — Migration 028: import identity, batch, and draft visibility (keystone)

**Contents (proposed, not built):**

- Add `import_id` / `import_state` (or equivalent visibility pair) to `plants`, `units`, `routes`, `assets`, and `components`, or introduce per-level staging rows that share the same batch id.
- Add an import/batch table keyed by `import_id` with tenant, source (`ai_screenshot` / `csv`), actor, timestamps, counts, and terminal state.
- Add external identity: `external_source` and `external_tag` (or a deliberately normalized `tag_number` contract) plus a tenant-scoped unique index for idempotent upsert.
- Pre-migration duplicate audit/backfill plan for existing freeform tags before any unique index is added.
- Define the live visibility predicate (view or shared SQL fragment) so drafts cannot leak.

**Depends on:** nothing. Must land before any other slice.
**Why first:** it is simultaneously the staging, idempotency, and batch-undo foundation. Batch undo specifically **does need a migration first** for `import_id`; there is no handle to undo against today.

**Independently certifiable by:** idempotent re-run on both boots; `information_schema` assertions for the new columns/indexes/constraints; existing test suite green; duplicate-audit query proves no rows would violate the new key.

### Slice 2 — Atomic staged writer (shared by AI and CSV)

**Contents:**

- One pinned `pool.connect()` transaction for the whole import: create batch → validate/normalize all rows → upsert by external identity → insert as draft → commit.
- All-or-nothing: any validation or constraint failure rolls back the entire batch; the response carries `import_id` and per-row errors only on failure.
- Re-upload of the same external tags updates the same draft rows (idempotent), never duplicates and never touches live rows.
- Replace the current name+route match (`server.ts:14691-14693`) with the external key.

**Depends on:** Slice 1. Must land before the staging browser (it is the only legitimate producer of draft rows) and before CSV (CSV must reuse it).

**Independently certifiable by:** forced failure at row N leaves zero new rows and no batch record; repeating the same payload creates no duplicates; a batch row exists only after commit; tenant isolation tests.

### Slice 3 — Single-transaction promotion

**Contents:**

- `POST` promote by `import_id` (or selected clean rows): re-validate, then flip `import_state` from draft to live for the whole batch in one transaction.
- Idempotent: promoting twice is a no-op or returns the same result.
- No row movement, no second database, no copy window.

**Depends on:** Slice 1 + Slice 2. Must land before the staging browser's approve button can be real.

**Independently certifiable by:** before/after visibility through the live read path; failed re-validation rolls back every row; double promotion does not duplicate or re-write rows; response counts match the batch.

### Slice 4 — Batch undo by `import_id`

**Contents:**

- Undo a draft batch (delete or tombstone) and undo a promoted batch (revert to draft/quarantine or hard-delete only when unreferenced) in one transaction.
- Dependency guard: refuse or soft-revert if post-promotion analysis/measurement rows reference the batch's assets/components.
- One implementation based on `import_id`; no per-row client loop.

**Depends on:** Slice 1 (migration) + Slice 2. To avoid ambiguity about promoted rows, schedule after Slice 3.

**Independently certifiable by:** draft undo leaves no visible rows; promoted undo either reverts cleanly or refuses with a precise dependency list; no partial batch state; tenant scoping.

### Slice 5 — Staging query API (bounded, scannable)

**Contents:**

- Server-side paginated, filtered, sorted query over drafts: `import_id`, status, error reason, asset type, tag search.
- Summary endpoint for counts (clean, warning, error, duplicate) without shipping all rows.
- Explicitly no unbounded 4,000-row response.

**Depends on:** Slice 1 + Slice 2. Must land before the browser UI. Does not need promotion or undo to exist.

**Independently certifiable by:** page-size cap, stable pagination, filter correctness, tenant isolation, and a draft-leak test proving `/api/hierarchy` and the staging query are mutually exclusive.

### Slice 6 — Staging browser UI (scannable-first)

**Contents:**

- Summary tiles first, collapsed groups (plant/route/asset type), search + filter-by-error, bulk-approve the clean set, and one-asset detail only for exceptions.
- Bounded rendering (server-side pages and/or virtualization); replace the fake `AIDataMigration` preview rather than extending its hardcoded 10-row table.
- Keep the existing collapsed tree grammar only as navigation, not as the 4,000-row surface.

**Depends on:** Slice 5 (data) + Slice 3 (real approve). Slice 4 provides undo but approval can ship first.
**Why last among the hierarchy slices:** it is the only slice that has no data contract once Slice 5 exists; it is pure interaction over a stable, bounded API.

**Independently certifiable by:** a 4,000-row fixture renders a bounded DOM; bulk approve sends only clean row ids; flagged exceptions open detail; a draft never appears in the live Explorer; no per-asset click requirement for the clean set.

### Slice 7 — CSV transport adapter

**Contents:**

- Server-side CSV parse (the repo already depends on `papaparse` and `xlsx`) into the same normalized row contract as the AI path.
- Dry-run/summary must use the same validation rules as the writer.
- No separate persistence path.

**Depends on:** Slice 2 (and therefore Slice 1). Can run in parallel with Slices 3–5 once the writer contract is fixed.
**Why after Slice 2:** a second transport before the writer would create a second, divergent import implementation.

**Independently certifiable by:** CSV and AI fixtures produce identical normalized rows; quoting/encoding/blank-row handling; idempotent re-upload of the same CSV; failure rolls back.

### Slice 8 — ISO 14224 typology engine

**Contents:**

- Seeded equipment-class/component/failure-mode typology (reuse `src/lib/failureModes.ts:33+` as the starter taxonomy) with versioning and idempotent seeding.
- Resolver used by import validation and by staging grouping/labels.
- Explicit mapping from customer/external type strings to internal typology; unknown values fall back rather than being guessed.

**Depends on:** Slice 1 (identity) and ideally Slice 2; can start in parallel after Slice 1. Must land before Slice 6 if the browser groups and filters by typology.
**Why not first:** it cannot validate or group staged rows until there are staged rows and a stable row contract.

**Independently certifiable by:** idempotent seed across boots; resolver tests for known/unknown/ambiguous types; no invented ISO codes; staging grouping uses the same resolver.

### Ordering summary

```
Slice 1 (migration 028)
   └─> Slice 2 (atomic staged writer)
          ├─> Slice 3 (promotion) ─> Slice 4 (batch undo)
          ├─> Slice 7 (CSV transport)        [parallel]
          ├─> Slice 8 (typology)             [parallel, integrate before 6]
          └─> Slice 5 (staging query API) ─> Slice 6 (staging browser)
```

Hard dependency answers:

- **What must land before the staging browser can exist?** Slice 1 (draft/batch schema), Slice 2 (real draft rows), Slice 5 (bounded query API), and Slice 3 for the approve action. The browser is not viable on top of the current simulated preview.
- **Does batch undo need a migration first?** Yes. `import_id` (or equivalent) does not exist, so Slice 1 is a prerequisite.

---

## ARCHITECTURE DECISION — same-DB visibility flag, single-transaction promotion (recommended)

**Recommendation:** keep one database. Add an explicit import visibility dimension (`import_id` + `import_state`, or draft/promoted columns) to the hierarchy and promote with a single transaction that flips visibility. Do **not** overload `assets.status`, because that column is already operational (`DEFAULT 'Active'` at `server.ts:16845`, defaulted in create paths at `server.ts:14937`/`14960`) and exists only on assets, not on plants/routes/components.

### Why same-DB wins

1. **One connection, one pool.** A second database means a second connection configuration and a second failure surface in every request.
2. **No duplicated migrations.** This repo already mirrors every SQL migration inside `initializeDatabase()` (start at `server.ts:16535`; e.g., `migrations/025` mirrored at `server.ts:17869`, `026` at `17895`, `027` at `17934`). A second database doubles that maintenance and invites drift.
3. **No duplicated undo logic.** Batch undo is one `import_id`-scoped transaction against the same tables. A second database would need a parallel undo implementation plus reconciliation.
4. **No half-migrated copy window.** Promotion is `UPDATE ... WHERE import_id = $1` inside one transaction. No data moves, so there is no period where some rows exist in both or neither store.
5. **Referential integrity stays intact.** Existing FK/cascade relationships (`components.asset_id → assets`, `collection_points.component_id → components`, `routes.plant_id → plants`) continue to work during draft and promotion.
6. **Tenant scoping is already solved.** `company_id` and lineage joins are established (`migrations/018`), so draft rows can be tenant-scoped exactly like live rows.
7. **Split-brain is impossible.** All readers see the same commit boundary. A second database creates a two-source truth problem the moment a promotion partially succeeds.

### The real cost to accept

Draft rows live in the same tables, so **every read path must filter them out**. Today `GET /api/hierarchy` selects every row with no visibility predicate (`server.ts:13671-13705`), and the client normalizer includes everything it receives (`src/lib/hierarchyApi.ts` around `73-170`). Same-DB staging therefore requires:

- a single live-visibility view or shared predicate used by the Explorer, dashboards, reports, and joins;
- a test that fails if a draft appears in any live read;
- promotion and undo implemented as state flips, not data copies.

This is still materially cheaper than a second database, because the filtering is a one-time schema/read-path discipline rather than permanent dual-write and reconciliation.

### Why the alternatives lose

- **Second database:** second connection, duplicated migrations, duplicated undo, copy-promotion with a half-migrated window, no cross-DB FK or single transaction, and ID remapping. Rejected.
- **Overloading `assets.status`:** cannot represent draft state for plants/routes/components, and collides with the operational status already used by the app. Rejected.
- **Client-side-only staging (no rows until promote):** cannot survive a 4,000-row browser refresh, cannot be audited server-side, cannot be idempotently re-uploaded, and cannot support batch undo. Rejected.

### Batch undo under the same-DB model

Undo is one transaction keyed by `import_id`. Two modes are required:

- **Draft undo:** delete/tombstone only draft rows.
- **Promoted undo:** soft-revert to draft/quarantine by default, or hard-delete only when dependency checks prove no post-promotion measurement/analysis rows reference the batch. Cascades make blind deletion dangerous (`server.ts:16835`, `16945`, `16967`), because deleting an asset can remove components, collection points, measurement points, and analysis history.

This keeps undo atomic and avoids a second copy of the data.

---

## Pre-build checks implied by this map

1. Decide the canonical external identity (`external_source` + `external_tag` vs. normalized `tag_number`) and run a duplicate audit before adding any unique index.
2. Define behavior for rows with no customer tag (generated key) so re-upload does not create duplicates.
3. Enumerate every live read path that must exclude drafts, starting with `GET /api/hierarchy` (`server.ts:13642`) and dashboard/report joins.
4. Decide whether a promoted batch may be hard-deleted or only soft-reverted when dependents exist.
5. Confirm the ISO 14224 seed scope and licensing, and treat `failureModes.ts` as a starter seed, not an exhaustive standard export.
6. Replace the simulated `AIDataMigration` preview rather than extending it; it currently cannot parse a file (`src/components/AIDataMigration.tsx:136-150`) and cannot write to the database (`193-221`).
