# Sync verification report — Stage 2

Findings from running `docs/sync-verification-runbook.md` (Q1–Q7) against
scratch copies (`/tmp/arc21-fw` = framework, `/tmp/site-test` = a
post-sync HyperTorah copy). No live files were touched. This is the Stage 2
review-gate deliverable required by `build-order.md` before any Stage 3
framework code is written.

---

## Q1 — Copy model

**(c) Additive-merge.** Confirmed in `example/sync.py`:

- Top level: `for name in sorted(os.listdir(framework_path))` — skips
  `_should_skip_file()` matches (dotfiles, `Icon*`, `*.bak`), names in
  `SITE_OWNED`, and names in `framework_skip = {"CLAUDE.md", "docs",
  "example", ".git", ".github", "dependents.json"}`. Everything else is
  either `shutil.copy2`'d (files) or passed to `copy_dir()` (directories).
- `copy_dir()`: `os.walk(src)` + `shutil.copy2(src_file, dst_file)` per
  file, `os.makedirs(..., exist_ok=True)`. **No `rmtree`, `copytree`, or
  `dirs_exist_ok` anywhere** — destination files/dirs not present in the
  framework source are never touched, never deleted.
- The only "don't overwrite" exception inside a copied directory is
  `SUBPATH_OWNED = {"skins/index.json"}`, checked by full site-relative
  path (`rel_file in SUBPATH_OWNED`), so it works regardless of which
  top-level dir is being walked.

**SITE_OWNED** (top-level names sync.py never copies over):
`data, assets, docs, site.css, firebase.json, i18n, translate.py,
help-config.json, index.html, mgmt.html, README.md, .gitignore, sync.py,
framework.lock, CLAUDE.md` (+ `skins/index.json` via `SUBPATH_OWNED`).

**framework_skip** (top-level names sync.py never copies *from* the
framework root): `CLAUDE.md, docs, example, .git, .github,
dependents.json`.

**Deletes before copy?** No. Pure additive overlay — copy-and-overwrite
known framework paths, leave everything else alone.

**Source→dest:** 1:1 by name, framework repo root → site repo root
(e.g. `app.js → app.js`, `js/ → js/`, `skins/ → skins/` minus
`skins/index.json`, `build.py → build.py`, etc.). No path remapping.

---

## Q2 — Site-added files inside a framework directory survive a sync?

**Yes, confirmed by direct test.** Both probes…

```
/tmp/site-test/js/diagram/__probe__.js   (existing framework dir)
/tmp/site-test/js/site/__probe2__.js     (new, framework doesn't have js/site/)
```

…survived `python sync.py /tmp/arc21-fw` and are still present afterward.
This is a direct consequence of Q1's additive-merge model: `os.walk(src)`
only enumerates files that exist *in the framework copy*; it never inspects
or deletes anything that exists only on the destination side — whether
that's a new file dropped into an existing framework dir (`js/diagram/`) or
an entirely new directory the framework doesn't ship (`js/site/`).

**Implication:** a reserved `js/site/**` namespace (Change 5) **already
works today, with zero sync.py changes** — it's a documentation/convention
problem, not a code problem. The only remaining risk is the *opposite*
direction: if the framework ever ships a file at a path a site already
occupies (e.g. framework adds `js/site/foo.js` for some future built-in
feature), `shutil.copy2` would silently overwrite the site's file with no
warning. That collision-detection gap is the actual scope of Change 5 (see
"Net for the design" below) — not "build a reserved namespace" (which
exists for free) but "detect when the framework's growth collides with it."

---

## Q3 — "Site-owned, never overwritten" protection mechanism

**Hardcoded sets in `sync.py` itself** — `SITE_OWNED` (top-level) +
`SUBPATH_OWNED` (`skins/index.json`) + `_should_skip_file()` (dotfiles,
`Icon*`, `*.bak`, applied at every depth via `copy_dir`'s `os.walk`). No
`.syncignore` file exists anywhere (`ls -a /tmp/site-test | grep -iE
"ignore|sync"` → only `.gitignore` and `sync.py` itself, both of which are
themselves in `SITE_OWNED`).

Re-verified directly on the scratch copies: `/tmp/site-test/skins/index.json`
still holds HyperTorah's own `{"defaultSkin": "concept-default", "skins":
[concept-default, linear]}` after the sync (not overwritten by whatever
`example/skins/index.json` contains), and `/tmp/site-test/docs/` still
holds HyperTorah's own docs (framework's `docs/` was never copied in either
direction).

**Notable cross-cutting fact:** `sync.py` is *itself* listed in
`SITE_OWNED`. A site's `sync.py` is a frozen copy from whenever the site was
instantiated (from `example/sync.py`) — `python sync.py` never updates its
own logic. Any Stage 3 change to sync.py's *behavior* (Change 5's ownership
manifest / collision detection) will not reach existing sites via a normal
sync; each site needs `example/sync.py` re-copied by hand (or a one-time
opt-in step). Worth calling out explicitly in Stage 3's design doc as a
rollout note, not a blocker.

---

## Q4 — Skin discovery/loading

**Yes, `skins/index.json`-driven**, and a site-owned skin folder is
**already feasible with zero loader changes**:

- `js/skin/loader.js`: `loadSkinIndex()` fetches `skins/index.json` (a
  `SUBPATH_OWNED`, site-controlled file) to get `{defaultSkin, skins:
  [{id, label}, ...]}`.
- `getSkinInstance(skinID, ctx)` does:
  `await import("../../skins/" + skinID + "/" + skinID + ".js?v=" +
  ARC21_VERSION)` — a path *relative to `js/skin/loader.js`*, which always
  resolves to `<site-root>/skins/<id>/<id>.js` regardless of whether that
  file was placed there by `sync.py` (framework skin) or hand-authored by
  the site (site skin). Factory function convention:
  `create<PascalCase(id)>Skin`.
- `ensureSkinCSS` resolves `skins/<id>/<id>.css` the same way.
- `app.js` skin resolution order: URL `?skin=` param → resolved
  concept/narrative skin (from `skins/index.json` defaults or per-item
  mapping) → fallback `"concept-default"`.

Combined with Q1/Q2: a site can create `skins/concept-hypertorah/` (with
`.js`/`.css`/`slots.json`/`template.html` as needed), list it in its own
`skins/index.json`, and the loader will import and render it — **the
framework doesn't ship anything at that path, so `copy_dir`'s `os.walk`
never visits it, and it survives every future sync untouched.** Change 3
("site-owned skin resolution + reserved namespace") is **already supported
by construction**; the only gap is a *naming convention* to avoid a future
framework skin id colliding with a site's custom id (e.g. recommend site
skins use a project-specific prefix like `concept-hypertorah` rather than a
generic name a future framework skin might also claim — same class of risk
as Change 5's collision concern, and could be documented together).

---

## Q5 — XLSX parser location, unknown-column handling, `extra` insertion point

**Confirmed path: `js/parse/workbook.js`** (`js/graph/builder.js` is a
*second*, later stage — see Q7). `js/graph/parser.js` referenced by
`architecture.md` does not exist; that doc is stale.

**Unknown columns ARE currently dropped**, at three explicit-allowlist
assembly points inside `parseCombinedWorkbook()`:

1. **Concepts** (`js/parse/workbook.js` ~L132–141) —
   `conceptsById[id] = { id, label, description, sourceUrl, imagePath,
   sourceTitle, level, camada, externalRef }`. Any other column on the
   `Concepts` sheet (e.g. HyperTorah's `sefariaRef`, `parashah`, `parentID`,
   `masoreticAligned`, `boundaryAuthority`) is read off `row` by nothing —
   the raw `row` object is discarded once this object is built.
2. **Relations → outputRows** (~L178–188 for rows with an outgoing
   relation, ~L193–200 for concept-only rows) — same pattern: an explicit
   field list (`conceptID, ConceptLabel, concept, description,
   relatedConceptID, relatedConcept, relationTypeID, relationCategory,
   relationTypeDescription, relationName, explanation, sourceUrl,
   imagePath, sourceTitle, level, camada, externalRef`). HyperTorah's
   `evidence`, `evidenceLocus`, `witnessNodeID`, `confidence` columns on
   `Relations` are dropped here.
3. **Relation Types** (~L109–114) —
   `relationTypesById[relationID] = { relationID, relationType, category,
   description }`. HyperTorah's `symmetric`, `inverseName`,
   `expectedEvidenceForm` columns are dropped here.

**Insertion point for `extra`:** all three of the above. The shared helper
is `get(row, [...aliases])` (`js/utils.js` L91–101), which builds a
`normalizeHeader()`-keyed copy of `row` and looks up the first matching
alias. An `extra`-builder would do the inverse: given `row` and the *full
set of alias names already consumed* for that sheet, return
`{ [normalizeHeader-preserving original key]: value }` for every key in
`row` not in that consumed set. Then:

- `conceptsById[id].extra = extraFrom(row, conceptKnownAliases)`
- each `outputRows.push({...})` gets its own `relation.extra =
  extraFrom(row, relationKnownAliases)` (Relations-sheet row) — and the
  concept-level `extra` travels along on `concept.extra` (already on
  `conceptsById[id]`, just pass through).
- `relationTypesById[relationID].extra = extraFrom(row,
  relationTypeKnownAliases)`, attached to `outputRows[...].relationTypeExtra`
  or similar when `relationTypeInfo` is looked up.

Because `outputRows` is the flat per-row structure that `js/graph/builder.js`
consumes next (Q7), `extra` objects placed on these rows pass straight
through to `buildGraph()`'s `bySlug[slug].extra` / `relations[].extra` with
the same "first non-empty wins" pattern already used for `description`,
`sourceUrl`, etc. — no separate plumbing needed downstream.

---

## Q6 — `framework.lock` contents / version check

`/tmp/site-test/framework.lock` (written by the scratch sync):

```json
{
  "framework_version": "unknown",
  "framework_commit_message": "unknown",
  "synced_at": "2026-06-15T19:33:44.371768+00:00",
  "framework_path": "/tmp/arc21-fw"
}
```

`"unknown"` is expected here — `/tmp/arc21-fw` is a plain `cp -R` with no
`.git`, so `git_head()`'s `git rev-parse HEAD` fails and `sync.py` falls
back to the literal string `"unknown"` (`example/sync.py` L44–47). On a
real framework checkout this would be a commit hash, and `python sync.py
--check` compares `lock["framework_version"]` against a fresh `git_head()`
to detect drift.

`js/version.js` — `ARC21_VERSION = 10`, with a documented bump checklist:
update the constant, then find/replace `?v=10` → `?v=11` across `app.js`,
`js/**/*.js`, `index.html`, `mgmt.html` (script/link tags). Loader's
runtime-constructed dynamic `import()` paths read `ARC21_VERSION` directly
and don't need the find/replace step.

**No compatibility-marker field exists yet** beyond the git-hash
`framework_version`. The build-order's cross-cutting note ("bump
ARC21_VERSION and add a framework.lock compatibility marker on any change to
precedence rules") implies Change 2 should **add a new field** to the lock
schema (e.g. `merge_semantics_version`), additive — old lock files simply
lack it, and code should treat absence as "v1 / no registry merge."

---

## Q7 — Concept-source assembly: single-source assumption?

**Today: single hardcoded sheet, keyed by `conceptID`, plain dict
assignment — not positional, not currently mergeable.**

- `parseCombinedWorkbook()` calls `getSheetInfoByName(sheetInfo,
  "Concepts")` (and `"Relations"`, `"Relation Types"`) — exactly one sheet
  per name, matched via `normalizeHeader()` (case/space/underscore
  insensitive, but still one sheet). Same for `js/parse/csv.js` (one
  CSV = one source).
- `conceptsById[id] = {...}` is keyed by `normalizeConceptId(get(row,
  ["conceptID", "ConceptID", "ConceptId", "id"]))` — **keyed by `conceptID`,
  not `sefariaRef`** (sefariaRef isn't read as a field at all today; per Q5
  it would only become visible via `extra`). Plain object assignment: a
  duplicate `conceptID` in the sheet would silently last-write-win, no merge
  logic exists.
- `js/graph/builder.js`'s `buildGraph(rows)` is a **second pass** over the
  already-flattened `outputRows` from workbook.js (or `parsedRows` from
  csv.js) — it re-derives fields via its own `get()`-with-aliases and builds
  `bySlug` keyed by `slugify(conceptName)`, with `idToSlug[conceptID] =
  slug` as a secondary index. It has no visibility into the original
  per-sheet rows, only the flat row list.
- In `app.js`, every load path (`changeSourceFileInput`, CSV path-load,
  initial `data/graph.json` load, narrative-skin reloads) does `appStore.graph
  = buildGraph(rows)` — **a full wholesale replace**, never a merge into an
  existing `appStore.graph`. The one existing "secondary source" precedent
  (`narrativesFileInput` → `parseNarrativesWorkbook` → `saveStoredNarratives`)
  is narratives-only, stored separately, and referenced by ID at render
  time — it never touches `bySlug`/concept assembly, so it's not a
  precedent for concept-level merging either.

**Is "union of N sources, N=1 = today" additive or a refactor?**

**Additive**, with one new wrapping stage — not a rewrite of the existing
single-source path:

1. Wrap today's per-sheet parse (the `conceptsById` build in
   `workbook.js`) as "load one source → `conceptsById` + `conceptOrder` +
   `outputRows`" — this is exactly what exists today, unchanged.
2. Add a new union/merge step that takes 1..N such results and produces one
   merged `conceptsById`/`conceptOrder`/`outputRows`, keyed by
   `extra.sefariaRef` when present (cross-source identity) with `conceptID`
   as the per-source fallback key (today's only key, for sources with no
   `sefariaRef` — e.g. Infância Algorítmica, which has none). Site fields
   override registry fields per merged key; site-only composites just add
   nodes.
3. For **N=1**, step 2 is the identity function on step 1's output — bit-for-bit
   today's behavior, by construction (not a separate "legacy" branch).

This is **conditional on Change 1 landing first** (sefariaRef must be
populated into `extra` before it can be used as a merge key), but does not
require touching `js/graph/builder.js`'s second pass at all — `buildGraph()`
already treats its input as "a flat row list from *a* parser," and a merged
multi-source row list is still just a flat row list.

---

## Net for the design

| Change | Status | Notes |
|---|---|---|
| **1 — preserve unknown columns (`extra`)** | **Needs framework work**, but small & localized | 3 insertion points in `js/parse/workbook.js` (Concepts, Relations, Relation Types row assembly), one shared `extraFrom(row, knownAliases)` helper in `js/utils.js`. `buildGraph()` passes `extra` through unchanged (same pattern as existing pass-through fields). |
| **2 — multi-source concept merge (registry)** | **Needs framework work**, additive | New wrapping union/merge stage around the existing per-source parse (Q7); keyed on `extra.sefariaRef` (depends on Change 1) with `conceptID` fallback. N=1 is the identity case — no refactor of existing single-source code. Add a `merge_semantics_version`-style field to `framework.lock` (Q6) so precedence-rule changes are detectable. |
| **3 — site-owned skin resolution + reserved namespace** | **Already works today — no framework code change** | `skins/<custom-id>/` + an entry in the site's own `skins/index.json` loads via the existing `getSkinInstance`/`ensureSkinCSS` relative-path resolution (Q4), and survives sync untouched (Q1/Q2). Only "change" needed is a documented naming convention to avoid future id collisions with framework-shipped skins. |
| **5 — sync.py ownership manifest + reserved namespaces** | **Mostly already works; gap is collision *detection*, not reservation** | `js/site/**` and site skin folders already survive sync untouched (Q2) by construction of the additive-merge model. The actual gap: if the framework ever adds a file at a path a site already occupies, `shutil.copy2` silently overwrites with no report. Change 5 should add a *pre-copy collision check* (does `dst_file` already exist and differ from what sync is about to write, at a path not already in `SITE_OWNED`/`SUBPATH_OWNED`?) and report rather than clobber. Also: `sync.py` is `SITE_OWNED` (Q3) — any Stage 3 changes to sync.py's own logic need a rollout note for existing sites (manual re-copy from `example/sync.py`). |
| **4 — `afterParse(graph, rawSheets, siteConfig)` hook** | **Not implemented (per build-order)** | Signature only, for Stage 3 doc. Natural call site: after `buildGraph()` in `app.js`, before `appStore.graph` is assigned — `rawSheets` would need `parseCombinedWorkbook` to optionally retain per-sheet raw rows (currently discarded after `outputRows` assembly per Q5), so the hook's `rawSheets` arg has a dependency on how Change 1 restructures `workbook.js`. |

### Surprises worth flagging
- **Two-pass architecture** (`workbook.js` → flat rows → `builder.js` →
  `bySlug`/`relations`) means `extra` has to be threaded through *both*
  passes, but `builder.js`'s existing "first non-empty wins" merge pattern
  for scalar fields (`sourceUrl`, `description`, etc.) generalizes cleanly
  to object-valued `extra` — just a shallow merge instead of an
  empty-check.
- **`sefariaRef` is not a first-class field anywhere today** — Change 2's
  merge key only exists once Change 1 ships and a source's `Concepts` sheet
  has a `sefariaRef` column, which lands in `extra`. Change 2 cannot be
  built or tested independently of Change 1.
- **Change 3 requires no code** — worth confirming with the user whether
  Stage 3 should still produce a short *doc* change (naming convention) even
  though no `app.js`/`loader.js` edit is needed, so Stage 4's
  `concept-hypertorah` skin has a documented home.
- `sync.py` being `SITE_OWNED` (self-protecting) is a one-time-cost detail
  for Change 5's rollout, not a design blocker — flagging so Stage 3's
  gate-check ("an existing registry-less site still loads unchanged after a
  sync") doesn't get confused by a site running a *stale* `sync.py` that
  predates the ownership-manifest logic.
