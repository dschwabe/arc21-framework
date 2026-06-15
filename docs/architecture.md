# Architecture

ARC21 is a zero-build, zero-dependency single-page application (SPA). It uses
native ES modules, hash-based routing, and `localStorage` for persistence.
There is no bundler, no transpiler, and no runtime framework.

---

## File structure

```
index.html          ← shell; loads app.js as type="module"
app.js              ← application entry point; routing, data loading, skin dispatch
default.css         ← global base styles and CSS custom properties (tokens)

js/
  store.js          ← shared mutable state (appStore) and localStorage helpers
  i18n.js           ← translation loader and helpers
  help.js           ← tooltip/help overlay system
  version.js        ← ARC21_VERSION (cache-busting ?v=N for all module imports)
  search.js         ← full-text search index + "did you mean" suggestions
  explore-graph.js  ← floating Explore Graph panel (visit history → live concept map)
  parse/
    xlsx.js         ← low-level XLSX (OOXML ZIP) binary reader
    csv.js          ← CSV delimiter detection and parsing
    workbook.js     ← high-level XLSX → row objects (parseCombinedWorkbook)
  graph/
    builder.js      ← row objects → graph object (buildGraph)
    navigation.js   ← URL builders (conceptUrl, narrativeElementUrl, …)
  render/
    content.js      ← linkifyDescription and inline text helpers
    gallery.js      ← buildGalleryHtml and wireUpGallery
  skin/
    loader.js       ← skin lifecycle: CSS injection, JS lazy-load, asset probing
  diagram/          ← hero/relations diagram renderers (see hero-diagram-tutorial.md)
  utils.js          ← escapeHTML, escapeAttr, misc

skins/
  index.json        ← skin registry (defaultSkin, globalConceptSkins, …)
  linear/           ← one folder per skin
  scrolly/
  concept-default/

data/
  conceptual_graph.xlsx    ← primary content (or equivalent per site)
  help.json                ← optional tooltip definitions
  content/                 ← optional .html fragment files for rich descriptions

assets/
  concepts/{ID}/    ← concept images (auto-discovered, no XLSX entry needed)
  skins/{ID}/       ← narrative / element background and numbered images
  icons/

templates/          ← HTML <template> elements; loaded on demand
```

---

## Boot sequence

```
index.html
  <script type="module" src="app.js">
    app.js
      1. Load stored data from localStorage (graph, narratives, media, skins, …)
      2. Fetch data/{locale}/conceptual_graph.xlsx  (or fallback locale)
         → parse with js/parse/workbook.js  (parseCombinedWorkbook)
         → build graph with js/graph/builder.js  (buildGraph)
         → save to localStorage
      3. Load i18n strings
      4. Register hashchange listener
      5. Dispatch initial route (window.location.hash)
```

Routes are matched against `location.hash` by `router()`:

| Hash pattern | Handler |
|-------------|---------|
| `#/concept/<slugOrID>` | `renderConcept(slug, skin)` |
| `#/narrative/<id>` | `_renderWithSkin(narrativeID, skinID)` |
| `#/narrative/<id>/element/<elementID>` | `renderNarrativeElement(narrativeID, elementID, highlight)` |
| *(empty / no match)* | `renderHero()` |

Full-text search (`js/search.js`) is **not** a route — it's a `<dialog>`
overlay opened via the search button or a keyboard shortcut. See
[Full-text search](#full-text-search-jssearchjs) below.

---

## Data flow

```
XLSX file
  → js/parse/workbook.js (parseCombinedWorkbook) → row objects
  → js/graph/builder.js (buildGraph) → graph object (bySlug, order, idToSlug, …)
  → saved to localStorage (SK.data)
  → appStore.graph

XLSX Narratives tab
  → narrativeStore { byId, order, elementsById }
  → appStore.narrativeStore

XLSX NarrativeSkins / ConceptSkins / SkinData tabs
  → appStore.narrativeSkinsStore / conceptSkinsStore / skinDataStore

Skin render
  → reads appStore for content
  → calls buildGalleryHtml (reads appStore.mediaStore for XLSX media)
  → calls loadSkinAssets (HTTP HEAD probes for filesystem images)
```

---

## State management (`js/store.js`)

`appStore` is a plain mutable object. All modules import it directly — there
is no reactive framework or pub/sub.

Persistence uses `localStorage` with versioned keys defined in `SK`:

```js
SK.data         → "conceptGraph.data.v4"
SK.narratives   → "conceptGraph.narratives.v1"
SK.media        → "conceptGraph.media.v1"
// …
```

When the parse pipeline changes in a way that alters the stored shape, bump
the version suffix (e.g. `v4` → `v5`) **and** update the module `?v=` query
string so browsers reload the cached module.

---

## Module versioning (`?v=` query strings)

Because browsers cache ES modules aggressively, every `import` statement in
`app.js` (and transitively in skin files) appends `?v=N`:

```js
import { loadSkinIndex } from "./js/skin/loader.js?v=10";
```

`N` is centralized as `ARC21_VERSION` in `js/version.js` — every static
import across the codebase must use the same literal number. Bump the
version whenever you change a module's exported interface or any logic that
affects stored data (heuristic: if you'd want users to get the new code
immediately after a deploy, bump it). Bumping means updating
`ARC21_VERSION` and find/replacing `?v=<old>` → `?v=<new>` across `app.js`,
`js/**/*.js`, `index.html`, and `mgmt.html` — `js/skin/loader.js` reads
`ARC21_VERSION` at runtime and needs no edit.

---

## Routing and navigation

All navigation is via `window.location.hash`. `app.js` listens for
`hashchange` and dispatches to the appropriate view function.

URL helpers live in `js/graph/navigation.js`:

```js
conceptUrl(slug)                  // → "#/concept/C051" (ID form, falls back to slug)
narrativeElementUrl(nid, eid)     // → "#/narrative/N002/element/E007"
```

Use these helpers everywhere rather than constructing hash strings manually.

---

## Explore Graph (`js/explore-graph.js`)

The Explore Graph (EG) is a floating panel that builds a live map of the concepts
the user has visited, wiring navigation history into a visual graph.

### Visibility states

The panel has three visibility states controlled by `setMode(mode)`:

| Mode | CSS class | Description |
|------|-----------|-------------|
| `"normal"` | *(none)* | Fully visible, draggable, resizable |
| `"minimized"` | `.eg-minimized` | Title bar only — graph body hidden |
| `"hidden"` | `.eg-hidden` | Panel not visible |

### Where state changes happen

| Trigger | New state |
|---------|-----------|
| Hero page renders | `hidden` |
| Concept page visited with default skin | `normal` |
| Concept page visited with scrolly-type skin | `hidden` (default) |
| Concept `egMode` column set explicitly | Uses that value |
| Narrative opens with scrolly skin | `hidden` (default) |
| Narrative opens with linear skin | `normal` (default) |
| Last scrolly element scrolls into view | `normal` |
| Narrative skin has explicit `egMode` column | Uses that value |
| `scrolly-staged` skin: 65 % through last scene | `normal` |

The `egMode` column in the **Narrative Skins** and **Concept Skins** XLSX sheets
overrides the skin-type default for a specific skin assignment. Valid values:
`hidden`, `minimized`, `normal`.

### Node interaction

Nodes support two interaction modes that the user switches between:

| Mode | How to enter | How to exit | Cursor |
|------|-------------|-------------|--------|
| **Navigation** (default) | — | — | `pointer` |
| **Reposition** | Hold any node ≥ 400 ms | Click SVG background | `grab` / `grabbing` |

In navigation mode a tap/click on a node navigates to that concept.
In reposition mode dragging any node repositions it within the SVG; the
viewBox auto-adjusts to keep all nodes in view. Positions reset when a
new concept is visited.

### Panel controls

| Control | Location | Action |
|---------|----------|--------|
| Title bar drag | Drag anywhere on bar | Move the panel |
| NW resize handle | Top-left corner | Resize (right/bottom edges stay fixed) |
| SE resize handle | Bottom-right corner | Resize (left/top edges stay fixed) |
| Expand button | Top-right (⤢) | Toggle 90 vw × 90 vh large mode |
| Close button | Top-right (×) | Hide panel |

### Public API

```js
import { visit, setMode } from "./js/explore-graph.js";

visit(slug, concept, graph, fromSlug);  // called by app.js on every concept render
setMode("hidden" | "minimized" | "normal");  // called by app.js on route changes
```

---

## Full-text search (`js/search.js`)

A pure data module (no DOM) providing accent- and case-insensitive search
over every concept and narrative already held in memory — no fetch, so it
works identically in the live site and the offline `bundle.html`.

### Index

`buildSearchIndex(appStore)` flattens the graph and narrative stores into
`appStore.searchIndex`, an array of records:

```js
{ kind: "concept" | "narrative", title, context, url, fields: [{text, weight}], haystack }
```

- `fields` covers titles, descriptions, relation explanations, POV concept
  texts, and narrative/element prose — each cleaned with `stripMarkup()`,
  which strips `##…##` grammar markup and resolves bare `[[conceptID]]`
  wikilinks to the target concept's title (via `resolveWikiTarget`).
- `haystack` is the `normalizeText()`-folded concatenation of all fields,
  used for fast substring matching.
- `buildSearchIndex` also builds `appStore.searchVocab`, a word-frequency
  table over the same text, used for suggestions (below).

The index is rebuilt from scratch every time the search dialog opens — the
corpus is small enough that this is cheaper than invalidation tracking.

### Query

`searchAll(query, appStore)` tokenizes the (normalized) query into terms and
returns `{ concepts, narratives, total, suggestions }`. A record matches only
if **every** term is a substring of its `haystack` (AND). Matches are scored
by occurrence count × field weight plus a whole-word bonus, and each result
carries an HTML snippet (`makeSnippet`) with matched terms wrapped in
`<mark>`.

### "Did you mean" suggestions

When a query matches nothing, `searchAll` looks at each term with zero
substring hits anywhere in the index and finds the closest word(s) in
`appStore.searchVocab` by Levenshtein distance (tolerance grows with term
length: ≤4 chars → 1, ≤8 → 2, else → 3). For each near match it rebuilds the
full query with just that term substituted, up to 5 suggestions total. These
render as clickable pills that re-run the search with the corrected query.

### UI

The search UI lives in `installSearch()` in `app.js`, backed by
`<dialog id="searchDialog">` in `index.html`:

| Trigger | Action |
|---------|--------|
| `#searchBtn` click | Open dialog |
| `Cmd/Ctrl-K` (anywhere) | Open dialog |
| `/` (when not typing in a field) | Open dialog |
| ↑ / ↓ | Move active result |
| `Enter` | Navigate to active (or first) result |
| Esc / click outside | Close dialog |

Results are grouped under "Conceitos" / "Narrativas" headings
(`search.group.concepts` / `search.group.narratives`); an empty query shows
`search.hint`, a zero-result query shows `search.noResults` plus any
suggestion pills under `search.didYouMean`.

---

## Template system

HTML `<template>` elements in `index.html` are cloned for each render.
Templates are identified by id (e.g. `conceptTemplate`, `narrativeTemplate`).
Cloning is always deep (`tpl.content.cloneNode(true)`), so the original
template is never mutated.

---

## Build / deploy

For production, `build.py` concatenates all JS modules into `bundle.html` —
a single self-contained HTML file with no external dependencies. This makes
the site deployable to any static host, including Firebase Hosting.

When deploying to Firebase or similar SPA hosts, configure a rewrite rule so
all paths serve `index.html`:

```json
// firebase.json
"rewrites": [{ "source": "**", "destination": "/index.html" }]
```

The asset loader guards against this: any HTTP 200 response with
`Content-Type: text/html` is treated as a miss (not a real file).

---

## Internationalisation

Language files live under `data/{locale}/conceptual_graph.xlsx` (or a
locale-specific subfolder). `js/i18n.js` loads string overrides from a JSON
file and exposes a `t(key, fallback)` helper.

Locale-scoped localStorage keys are produced by `localeSK(baseKey, locale)` in
`js/i18n.js`, so users switching languages don't see stale data from a
different language's parse.

### UI string catalog (`i18n/<locale>.json`)

Place a JSON file at `i18n/pt-BR.json` (or any locale code) to override UI
strings. Every key has a hardcoded fallback so the file is optional. Known keys:

| Key | Default (pt-BR) |
|-----|-----------------|
| `concept.diagram.title` | `Mapa de Relações` |
| `concept.externalRef.prompt` | `Aprofunde este tema em` |
| `concept.externalRef.edgeLabel` | `site externo` |
| `concept.narrativeRefsTitle` | `Aparece nas narrativas` |
| `concept.pov.fallback` | `Perspectiva` |
| `concept.skinSelect.title` | `Visual` |
| `concept.povSwitcher.title` | `P. de vista` |
| `eg.title` | `Mapa de exploração` |
| `search.button` | `Buscar` |
| `search.button.title` | `Buscar em conceitos e narrativas (atalho: / ou Ctrl/⌘+K)` |
| `search.placeholder` | `Buscar conceitos e narrativas…` |
| `search.hint` | `Digite para buscar em conceitos e narrativas.` |
| `search.noResults` | `Nenhum resultado encontrado.` |
| `search.didYouMean` | `Você quis dizer:` |
| `search.group.concepts` | `Conceitos` |
| `search.group.narratives` | `Narrativas` |

---

## Extending the framework

| Goal | Where to change |
|------|----------------|
| New content type | Add a tab to the XLSX; add a row parser in `js/parse/workbook.js`; extend `js/graph/builder.js`; add a store helper in `js/store.js` |
| New page layout | Add a skin (see [Skin System](skin-system.md)) |
| New asset slot | Extend `loadSkinAssets` in `js/skin/loader.js` |
| New tooltip | Add an entry to `data/help.json` |
| New CSS token | Add to the `:root` block in `default.css` (see [CSS Tokens](css-tokens.md)) |
