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
  graph/
    parser.js       ← XLSX → graph object
    navigation.js   ← URL builders (conceptUrl, narrativeElementUrl, …)
  render/
    content.js      ← linkifyDescription and inline text helpers
    gallery.js      ← buildGalleryHtml and wireUpGallery
  skin/
    loader.js       ← skin lifecycle: CSS injection, JS lazy-load, asset probing
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
         → parse with js/graph/parser.js
         → save to localStorage
      3. Load i18n strings
      4. Register hashchange listener
      5. Dispatch initial route (window.location.hash)
```

Routes are matched by prefix:

| Hash prefix | Handler |
|-------------|---------|
| `#concept/` | `showConcept(slug)` |
| `#narrative/` | `showNarrative(id, elementID)` |
| `#search` | `showSearch(query)` |
| *(empty)* | `showHome()` |

---

## Data flow

```
XLSX file
  → parser.js → graph object (bySlug, concepts[], relations[])
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
import { loadSkinIndex } from "./js/skin/loader.js?v=6";
```

Bump the version number whenever you change a module's exported interface or
any logic that affects stored data. A simple heuristic: if you'd want users to
get the new code immediately after a deploy, bump it.

---

## Routing and navigation

All navigation is via `window.location.hash`. `app.js` listens for
`hashchange` and dispatches to the appropriate view function.

URL helpers live in `js/graph/navigation.js`:

```js
conceptUrl(slug)                  // → "#concept/slug"
narrativeElementUrl(nid, eid)     // → "#narrative/N002/E007"
```

Use these helpers everywhere rather than constructing hash strings manually.

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
| `concept.relation.connector` | ` é ` |
| `concept.relatedEmpty` | `Nenhuma relação informada para este conceito.` |
| `concept.narrativeRefsTitle` | `Aparece nas narrativas` |
| `concept.pov.fallback` | `Perspectiva` |
| `eg.title` | `Mapa de exploração` |

---

## Extending the framework

| Goal | Where to change |
|------|----------------|
| New content type | Add a tab to the XLSX; add a parser in `js/graph/parser.js`; add a store helper in `js/store.js` |
| New page layout | Add a skin (see [Skin System](skin-system.md)) |
| New asset slot | Extend `loadSkinAssets` in `js/skin/loader.js` |
| New tooltip | Add an entry to `data/help.json` |
| New CSS token | Add to the `:root` block in `default.css` (see [CSS Tokens](css-tokens.md)) |
