# Enterprise Roadmap — post-pilot backlog

Nothing in this document is built before the pilot completes and a customer pays.
Build order is set by pilot demand, not by the order below. When a pilot site
asks for an item, it moves to the active queue; until then it stays here.

## Gatekeepers (IT / Security / Procurement)
1. SSO (SAML / OIDC: Okta, Entra ID, Google Workspace). Removes IT's
   password-management objection. High effort.
2. Immutable security audit log: who logged in, who changed a baseline, who
   exported data. Compliance requirement. Medium.
3. Data portability: one-click export-all (CSV/JSON) and delete-all. Kills the
   vendor lock-in fear during procurement. Medium.

## Budget holders (Plant Manager / VP Operations)
4. Cost-avoidance dashboard: translate alerts into dollars avoided. Turns the
   app from an expense into a profit protector. Medium.
5. Automated weekly executive summary: one-page PDF/email with criticals,
   warnings, healthy count, and recommended actions. Low-Medium.
6. Shift handover notes: daily habit loop that makes the app part of shift
   change. Low.

## Daily users (Reliability Engineer)
7. CMMS / work-order push. STATUS: EXISTS (work-order feature). Enhance with API
   push to Maximo / SAP PM / Fiix. Medium.
8. "Explain this diagnosis": show the exact math behind a flag (ISO zone,
   1X delta, bearing frequency). Builds trust; matches the honesty doctrine. Low.

## Architecture decisions (decide before first paying customer)
9. Isolation model: shared-schema + tenant_id (current) vs database-per-tenant
   on Neon. Per-tenant makes cross-tenant leaks structurally impossible and gives
   per-customer restore/export; costs connection routing and per-tenant
   migrations. Decide pre-launch, not after real data exists.

## Pilot feedback mechanism
At each pilot site ask: "Which of SSO, CMMS push, cost-avoidance dashboard,
executive summary, or shift handover would make this indispensable to your team?"
Build the top-voted item first, so the next feature already has buyers waiting.
## Plan tier (launch requirement, decided 2026-11-21)

10. Vercel Pro + Neon paid plan before any pilot customer. Evidence from tonight:
    the Hobby project auto-paused and served 503 DEPLOYMENT_PAUSED with no card
    on file - protective, not punitive, but a prospect clicking the link would
    have seen a dead site. Pro removes these pauses and unlocks Neon branch
    protection + longer PITR (both paid-tier, unavailable tonight). This is the
    infrastructure line item, not optional polish.
