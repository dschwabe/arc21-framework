# ARC21 framework extensibility — site-specific columns, shared content, and the merge model

Status: proposal. Lives in `arc21-framework` (a framework-design decision, not site content). Implementation forks on facts in `sync-verification-runbook.md` — resolve those first.

## Problem
ARC21 sites hold content; reusable code lives in the framework and is copied into each site by `sync.py`, which overwrites framework-owned files on every run. Two needs strain this:
- A site needing **columns** beyond the built-in schema (e.g. HyperTorah's `evidence`, `confidence`, `sefariaRef`) currently must modify the framework parser — polluting the framework, burdening other sites, and living in code `sync.py` overwrites.
- A family of related sites needing a **shared body of nodes** (the Torah sites' ~669-pericope registry) has nowhere to put it: in the framework it would force unrelated sites to carry domain content; duplicated per site it drifts.

The framework's current column model was specialised to the shared design of the first two sites. HyperTorah is the first site whose model diverges, and more are expected. So this is a **general capability built deliberately**, with HyperTorah as its first consumer.

## Principles
1. The framework stays **domain-neutral**. No site's vocabulary or content enters framework code.
2. Sites extend at **declared extension points**, never by overriding framework internals.
3. `sync.py` enforces an explicit **ownership boundary** and reports violations rather than clobbering.
4. Extension interfaces are **versioned API** under `ARC21_VERSION`; a breaking change surfaces at sync time.
5. The framework holds **mechanism, never domain content**. Content shared by a family of sites lives one layer below the framework, not inside it.

## Three layers
1. **Framework** — generic graph schema + mechanisms: column passthrough, multi-source concept merge, skin resolution, sync ownership. Reusable by any ARC21 site, Torah or not. ARC21 is domain-general (the demo graph and existing sites are generic concept maps; the docs are in Portuguese), so domain content must stay out of it.
2. **Portfolio** — shared *content* among a family of related sites. For the Torah family: the pericope registry (the ~669 atomic Masoretic pericopes, identity + boundary fields, two-tier `parentID`/`tier` hierarchy). Output of the boundary parser. Owned by neither the framework nor any single site; consumed *through* the framework's merge mechanism.
3. **Site** — its own edges, narratives, composite/aggregate nodes, and field overrides.

The registry is thus an *instance extension* — just a **portfolio-shared** one rather than a framework-owned one.

## Architecture (framework mechanisms)

### 1. Preserve unknown columns
The parser attaches every unrecognised column to the parsed object as a generic map rather than dropping it:
```
concept.extra      = { sefariaRef, parashah, parentID, masoreticAligned, boundaryAuthority, ... }
relation.extra     = { evidence, evidenceLocus, witnessNodeID, confidence, ... }
relationType.extra = { symmetric, inverseName, expectedEvidenceForm, ... }
```
Domain-neutral. The framework assigns no meaning to `extra` keys — interpretation happens in site rendering. Recognised columns and case/underscore-insensitive header matching are unchanged.

### 2. Multi-source concept merge — the registry mechanism (chosen)
The loader unions N concept sources into the node set, instead of reading a single Concepts tab:
- **Sources:** a base/registry source (portfolio content) ⊕ the site's own Concepts (composites + overrides).
- **Keyed** on the durable key (`sefariaRef`). **Override precedence:** site fields override registry fields per-key; site composites add new nodes above the registry's atomic + tier hierarchy.
- **N is configured at instantiation** — which registry (if any) an instance consumes.
- **Single-source degenerates to identity** = today's behaviour (see Backward compatibility).

This is the chosen mechanism (the per-site merge script is rejected, below). It pairs with #1 under one principle: the framework provides the merge/passthrough *mechanism*; the instance supplies the *sources and columns*. Instantiation = wiring (framework schema) + (chosen registry) + (site data).

### 3. Site-owned rendering via skins
Site-specific *display* of `extra` is a skin concern. ARC21 already renders concepts through skins and already loads site-local modules with framework fallback (the hero-diagram dispatcher: `js/diagram/<name>.js`). Generalise that pattern: reserve a **site-owned skin namespace** the loader resolves alongside framework skins, with fallback; a site ships e.g. `concept-hypertorah` and activates it via `skins/index.json` (already site-owned). Per-site cost: zero framework change.

### 4. Optional post-parse hook (phase 2)
For sites needing ingestion *logic* — validation, derived fields, cross-row checks — register a hook the framework calls after parsing: `afterParse(graph, rawSheets, siteConfig)`. HyperTorah likely doesn't need this initially (its columns are passthrough; validation can be a build-time lint). Specify the signature now; implement when a second consumer needs it.

### 5. sync.py ownership model
`sync.py` gains an explicit manifest: framework-owned paths it overwrites; reserved site-extension namespaces it never writes and reports collisions on (site skins, `js/site/**`, the hook path); existing site-owned files excluded as today. Exact change depends on sync.py's current copy model — see the verification runbook.

## Backward compatibility (required, not automatic)
Existing registry-less sites must be **provably unaffected**:
- the merge of a single source returns it unchanged;
- registry/multi-source is **opt-in**, never required;
- no field becomes newly mandatory on existing concepts.

Guarantee it structurally by making the multi-source union the **only** code path, with single-source as the N=1 case — no separate legacy branch to drift. A framework that *required* a registry would break every existing site on the next sync.

## Source vs generated artifact
For a registry-less site, `data/conceptual_graph.xlsx` is the **source of truth** — edited and committed directly. For a portfolio site that merges, the runtime `conceptual_graph.xlsx` is a **generated build artifact**: edit the registry and the site source, not the merged file (hand edits are overwritten on rebuild, exactly like `mgmt.html` vs `index.html`). In portfolio sites, gitignore or clearly mark the generated file; commit the pinned registry version + the site source instead. The two file *types* are identical in shape; their *provenance* is opposite.

## Rejected alternative — author-time merge script
Earlier option: a per-site `build-graph.py` merges registry + site source into `conceptual_graph.xlsx` with the framework unchanged. **Rejected** because it pushes a generic capability into N per-site scripts that drift, and is less aligned with the framework principle (generic core + instance extension). The trade accepted in exchange: the merge now lives in the framework, so its semantics become shared API — see the cost below.

## Versioning — the cost to name
The `extra` shape, the skin/hook interfaces, and now the **merge/override semantics** are framework API under `ARC21_VERSION`. The merge contract has **whole-portfolio blast radius** — a precedence bug affects every site, where a per-site script would have contained it to one. This raises the versioning bar specifically on the merge rule. `framework.lock` already pins the commit; add a compatibility marker so a site can detect a sync past a breaking interface change. This is the deliberate price of choosing framework power over per-site isolation.

## Staging
- **Now (HyperTorah first consumer):** preserve-columns (1), multi-source merge (2), site-owned skins (3), sync.py boundary (5), with the backward-compatibility guarantee.
- **Portfolio:** stand up the pericope registry as shared content (boundary-parser output); wire HyperTorah to consume it.
- **When a second site needs ingestion logic:** post-parse hook (4).

## Depends on (verify first)
`sync-verification-runbook.md`: copy model, survival of site files in framework dirs, skin loading, parser path/column handling. Add one check: confirm the loader's current single-source assumption, so the N-source generalisation can be made backward-compatible by construction.
