\# Security Requirements — binding on every slice



These are non-negotiable. A slice that violates one is rejected, not merged.

Security is sequenced BEFORE new features.



\## The five guarantees

1\. NO CROSS-TENANT ACCESS. Every read/write of tenant-owned rows carries a

&#x20;  tenant predicate at the QUERY layer, derived from the server session only.

&#x20;  Never from body, header, or query param. Requires a negative test proving

&#x20;  tenant A cannot read, write, or delete tenant B's rows.

2\. NO UNAUTHENTICATED ACCESS. Every route requires a session on BOTH the

&#x20;  App Router and the Express mount. No exceptions without a written reason here.

3\. NO SECRET EXPOSURE. Keys are server-only. Logs emit key NAMES/STATUS, never

&#x20;  VALUES. No key in any client-imported module or bundle.

4\. NO UNBOUNDED COST. Every paid-provider call sits behind auth + per-tenant

&#x20;  AND per-IP rate limits + input size caps. Fail closed before the provider.

5\. NO UNBOUNDED DESTRUCTION. No DELETE/UPDATE without a tenant predicate.

&#x20;  Bulk destruction additionally requires a role gate and explicit confirmation.



\## Per-slice security gate — answer all six in the report

1\. Touches tenant-owned data? -> cite the tenant predicate + the negative test.

2\. Adds a route? -> cite auth, tenant derivation, and rate limit if expensive.

3\. Touches secrets/config? -> confirm names/status only in logs.

4\. Adds a paid-provider call? -> cite auth + rate limit + size cap ordering.

5\. Adds destructive SQL? -> cite tenant predicate + role gate + confirmation.

6\. Did the test count decrease? -> if yes, the slice is rejected.



\## Already enforced (do not rebuild)

\- Tenant isolation: oil persistence, collection-point batch (pool + memory).

\- Unscoped-DELETE and wipe-route regression locks: wipeEquipmentRoute.test.ts.

\- Key exposure guard: keyExposureGuard.test.ts.

\- Rate limiting: visionRateLimit.ts (pre-auth IP + per-tenant), fail closed.

\- Fail-closed identity/baseline: see DOCTRINE.md.



\## Outstanding (see SECURITY-PLAN.md for the working queue)

\- Tenant columns missing on diagnosis\_sign\_off, planning\_configs,

&#x20; maintenance\_logs (migrations 031-033 written, NOT applied).

\- Shared rate-limit store before multi-instance deploy.

\- TRUSTED\_PROXY\_IPS required in production; add to envGuard fail-fast.

\- equipmentDb localStorage has no tenant key (shared-tablet leak).

\- Reports: companyId taken from request body.

