\# Launch Readiness Bar — the pilot gate



This replaces "a version I feel is ready" with a finite, verifiable bar.

Each line is yes/no with evidence. When every line is yes, the pilot starts -

not before, and not "a bit more polish" after.



\## Security (P0) - all must be yes

1\. Migrations 031-033 applied on a Neon branch, verified, then main - OR the

&#x20;  sign-off / planning / maintenance features consciously deferred and hidden.

2\. Least-privilege DB role: app role cannot DROP / TRUNCATE / ALTER; migrations

&#x20;  run as a separate admin role.

3\. TRUSTED\_PROXY\_IPS set in the production environment and production boots.

4\. Client cache namespaced by tenant (SEC-11) + legacy bare-key cleanup and

&#x20;  tenant-switch re-key (SEC-13).

5\. Full suite green and tsc 0 on the exact commit being deployed.



\## Product (pilot-facing flows only)

6\. Core flow on a REAL lab report: upload PDF -> vision extract -> values

&#x20;  populate -> diagnosis -> report export. Repeat with a photo/image.

7\. Manual entry path works for plants without digital reports.

8\. No dead buttons/links on: upload, assets/hierarchy, analysis, reports,

&#x20;  alerts, work orders. Scoped list - not every tab in the app.

9\. Signup -> login -> password reset works unattended (the 2AM test).

10\. Alerts reach a human (email at minimum). "Notifies you when maintenance is

&#x20;   due" is the marketing line; delivery must actually exist.

11\. Tenant can export their own data (CSV / report).

12\. Two-tenant demo proves isolation visually (also the demo-video trust beat).

13\. Demo and video run in DB mode - reports return 503 in memory mode.



\## Operability

14\. Errors are visible to you (log capture) so a pilot failure at 2AM is

&#x20;   debuggable, not invisible.

15\. Backup/restore written down: Neon PITR window set + a protected branch that

&#x20;   is never deployed against.



\## Legal (before any real customer data enters)

16\. Pilot agreement signed: limited liability, data handled as processor,

&#x20;   feedback obligations, no warranty of fitness, data-deletion-on-exit.

17\. One-page privacy policy: where data lives (Neon + region), who can access

&#x20;   it, and retention period.

