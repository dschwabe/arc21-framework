# Build order — HyperTorah bring-up & ARC21 extensibility

Execution plan for this initiative: stand up the HyperTorah site and extend the ARC21 framework to support site-specific columns and shared content. Written to be followed step by step with Claude Code. This file is the *order, the repo for each step, and the review gates* — the detailed specs live in the referenced docs.

This is an initiative plan, not permanent framework documentation; it can be retired once HyperTorah is live and the extensibility changes have landed.

## Orientation
- **Two repos.** Site work (instantiation, data, rendering skin) happens in the **HyperTorah** site repo. Code changes (parser, merge, skin resolution, sync) happen in the **arc21-framework** repo and reach the site only via `sync.py`.
- **Governing rule:** never edit framework files inside the site repo — `sync.py` overwrites them.
- **Reframe of the build brief:** `claude-code-brief.md`'s Phases 1–5 are redistributed here — parsing changes become *framework* changes (Stage 3), rendering becomes a *site skin* (Stage 4). Do not follow the brief as a single in-repo sequence.

## Prerequisites
- Framework repo: `/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 framework`
- Site repo (HyperTorah): `/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/HyperTorah`
- Pause Google Drive sync during `git` and `sync.py`, or work on local-disk copies. Stage 2 runs on `/tmp` scratch copies — never the live folders.

## Stage 1 — Stand up HyperTorah on stock ARC21  · site repo
Goal: the site loads and renders the pilot data on the *current* framework (no framework changes needed).
Doc: `instantiation-runbook.md` (site repo `docs/`).
Steps: create repo → copy framework `example/` → `python sync.py "<framework path>"` → place `korach-pilot.xlsx` as `data/conceptual_graph.xlsx` (+ `joseph-spies-eden.xlsx` alongside) → add `CLAUDE.md` + `docs/` → edit `index.html` (title/meta only), `skins/index.json`, `site.css` → `python3 build.py` → `python3 -m http.server 8000`.
Gate: home shows **11 concepts** + a Start link; `[[wikilinks]]` resolve; Sefaria `sourceUrl` links present; the `N101` narrative plays. Extended columns **not** rendering yet is expected, not a fault.

## Stage 2 — Verify framework facts  · ✅ COMPLETE
Done — findings in `sync-verification-report.md`. Confirmed: **additive-merge** sync (no deletes; site files survive), `js/parse/workbook.js` is the real parser (`architecture.md`'s `parser.js` is stale), and site-owned skins + reserved namespaces already survive sync by construction. Review gate cleared; Stage 3 scope below reflects the report.

## Stage 3 — Implement framework extensibility  · framework repo  · ⛔ REVIEW GATE at end
Goal: the generic mechanisms for HyperTorah's columns and the future registry, with **no domain content** entering the framework.
Doc: `framework-extensibility-design.md` (framework repo `docs/`).
Order — **Change 1 must precede Change 2** (hard dependency):
1. **Change 1 — preserve unknown columns → `extra`.** Three insertion points in `js/parse/workbook.js` (Concepts, Relations, Relation Types row assembly) + one shared `extraFrom(row, knownAliases)` helper in `js/utils.js`. `buildGraph()` passes `extra` through using the existing "first non-empty wins" pattern (shallow-merge for the object).
2. **Change 2 — multi-source concept merge.** A new union/merge stage wrapping the existing per-source parse; **N=1 = identity** (today's behaviour, by construction — no legacy branch). Keyed on `extra.sefariaRef` with `conceptID` fallback. **Requires Change 1** — `sefariaRef` only exists once Change 1 lands it in `extra`, so Change 2 cannot be built or tested before it. Add a `merge_semantics_version` field to `framework.lock` (additive; absent = no merge).
3. **Change 3 — site-owned skins: NO framework code.** Verified already supported by construction. Deliverable is a one-paragraph **naming convention**: site skins use a project-specific id (e.g. `concept-hypertorah`), never a generic one a future framework skin might claim. Document alongside Change 5 (same collision-risk class).
4. **Change 5 — collision *detection*, not reservation.** Reserved namespaces already survive sync. The gap: a future framework file at a path a site occupies would `shutil.copy2`-overwrite silently. Add a pre-copy check that reports rather than clobbers. **Rollout note:** `sync.py` is itself `SITE_OWNED`, so this logic does not reach existing sites via a normal sync — each needs `example/sync.py` re-copied once.
5. **Change 4 — hook signature only, do not implement.** Specify `afterParse(graph, rawSheets, siteConfig)`. Note `rawSheets` requires Change 1's restructure to retain per-sheet raw rows (currently discarded), so the signature carries that dependency.
Then bump `ARC21_VERSION` across its checklist (`js/version.js`).
Gate: an existing registry-less site (e.g. Infância Algorítmica) still loads **unchanged** after Changes 1–2 + a sync. This validly tests 1–2 (they live in `app.js`/`js/`, which sync); it does **not** test Change 5 (`sync.py` is site-owned, won't have synced — don't expect collision behaviour on a stale-sync site). **Stop and confirm before Stage 4.**

## Stage 4 — Light up HyperTorah's rendering  · site repo, after sync
Goal: the typed-overlay display the data was authored for.
Steps: `python sync.py` into HyperTorah to pull Stage 3 → build the site-owned `concept-hypertorah` skin reading `extra`: typed links grouped by category, speculative links dimmed/badged, witness highlighting, inbound-symmetric merge, Sefaria fetch at render → activate in `skins/index.json`.
Doc: `claude-code-brief.md` Phases 3–4 (rendering specifics, site repo `docs/`).
Gate: evidence, confidence dimming, and reverse-symmetric links now render; speculative links toggle. JSON-LD export (brief Phase 5) slots here or later.

## Stage 5 — Portfolio registry + boundary parser  · later; framework + portfolio
Goal: real coverage beyond the pilot, on a shared pericope spine.
Docs: `boundary-parser-runbook.md`, `two-site-architecture.md`.
Steps: build the boundary parser → emit the pericope registry (shared content, ~669 atoms, the **290 / 379 / 669** completeness check) → wire HyperTorah to consume it via the Change-2 merge → reconcile the pilot's `masoreticAligned = pending` scene-level nodes to registry atoms.
Do not author much more hand-boundaried data before this exists, or the reconciliation list grows.

## Cross-cutting (every stage)
- Pause Drive sync during `git` / `sync.py`, or work local.
- Framework files (`app.js`, `js/**`, `build.py`, `default.css`, framework skin folders) are never edited in the site repo.
- New edges follow the data discipline: concordance-validate lexical links before `certain`, a witness on every edge, honest `confidence`, negatives preserved.
- The merge/override semantics (Change 2) are shared API once shipped — bump `ARC21_VERSION` and add a `framework.lock` compatibility marker on any change to precedence rules; a bug there has whole-portfolio blast radius.

## Review checkpoints
1. After Stage 2's report — before any framework code.
2. After Stage 3's backward-compat check — before lighting up rendering.
These are the two points where a surprise is cheapest to absorb.

## Start here
Stage 1 (or Stage 2 in parallel). Begin with the instantiation runbook; the site rendering on stock ARC21 is the baseline everything else builds on.
