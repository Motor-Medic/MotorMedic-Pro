# SLICE-PROTOCOL — lean slice template

Purpose: future prompts reference this file instead of restating the slice workflow. It is a process template, not product code.

## The four phases

1. **Discover via graphify.** Query the knowledge graph (`graphify-out/graph.json`) for the concern: `graphify explain "<concept>"`, `graphify path "<A>" "<B>"`, `graphify section "<heading>"`. Read raw files only for lines the graph or an earlier read already located. Do not grep-orient first.

2. **Build additive.** Add only new code/constants/tests; do not modify existing product code, tests, Neon, isolation, or vision prompts. Every rule introduced must be traceable to `docs/DOCTRINE.md` (file:line citation). Never invent, generalize, or soften a rule.

3. **Guards by reference to DOCTRINE.md.** Each new behavior must satisfy the applicable doctrine section:
   - (a) null-on-unreadable / never zero-fill
   - (b) provenance — extracted vs inferred vs caller-supplied; caller argument never labeled "stored"
   - (c) baseline gating — no invented baseline; identity confirmed
   - (d) rate/trend gating — distinct non-zero hours or >=3 distinct dates; endpoint/elapsed-time basis; no projection
   - (e) ordinal data (ISO codes) never averaged or subtracted
   - (f) preserve every lock assertion string verbatim (file:line)
   
   If a rule is implied by tests but not stated, mark it "derived from test behavior" with the citation.

4. **Verify.** `npm test -- --run --maxWorkers=1` must be green (1522, unchanged) and `npx tsc --noEmit` exit 0. No source file modified beyond the additive slice.

5. **Compact report.** Summarize: files touched, rules applied with citations, test/tsc results.

6. **No commit.** Do not commit as part of the slice.

## What this replaces

Use this template in place of restating the slice workflow in prompts. Reference `docs/DOCTRINE.md` for the binding rules and `docs/SLICE-PROTOCOL.md` for the process.
