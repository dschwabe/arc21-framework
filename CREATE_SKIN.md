# ARC21 — Create a new skin or hero diagram renderer

This file is a self-contained guide for a Claude Code session. Read it fully
before touching any file.

---

## How to use this guide

Open Claude Code in the site repo where the skin will live and say:
> "Follow CREATE_SKIN.md to create a new skin."

Claude Code will ask which type of skin, then a few details, and execute all
steps automatically.

---

## Questions to ask the user before starting

1. **What to create?**
   - A) A new **narrative skin** (controls how narratives are presented)
   - B) A new **hero diagram renderer** (controls the home-screen diagram)

2. **Skin / renderer ID** — a short lowercase kebab-case identifier, no spaces.
   Examples: `magazine`, `timeline`, `cards`, `constellation`.
   This becomes the folder name and the value of `hero.diagram` in the Site sheet.

3. **Where does it live?**
   - **This site only** (site-local — never synced to the framework)
   - **The framework** (to be shared with all sites)
   Default: this site only. If the user says "the framework", use the framework
   repo path instead of the site repo path for all file creation steps.

4. **For narrative skins only — render style:**
   - **full** — one function renders the entire narrative at once (like `scrolly`)
   - **paged** — two functions: `renderStart` for the cover, `renderElement` per page (like `linear`)

Do not proceed until you have all answers.

---

## PART A — New narrative skin

A narrative skin controls how the overlay looks when a user opens a narrative.

### File structure

```
skins/<ID>/
  <ID>.js         ← JS module; exports the factory function
  <ID>.css        ← scoped styles (body.skin-<ID> { … })
  slots.json      ← declares which asset slots this skin uses
  template.html   ← optional HTML template reference (can be a comment-only file)
```

---

### Step A1 — Create the skin folder

```bash
mkdir -p "skins/<ID>"
```

---

### Step A2 — Write `slots.json`

Slots declare which image assets the skin can display. The loader probes for
files at `assets/narratives/<narrativeID>/<slot>.jpg` (and other image
extensions) and passes resolved URLs to the skin via `ctx.loadSkinAssets()`.

Write `skins/<ID>/slots.json`:

```json
{
  "slots": [
    { "id": "bg",  "type": "background" },
    { "id": "1",   "type": "background" },
    { "id": "2",   "type": "background" },
    { "id": "3",   "type": "background" },
    { "id": "4",   "type": "background" }
  ]
}
```

Slot types:
- `"background"` — full-bleed image behind content
- `"image"` — inline image within content

Add or remove numbered slots to match how many per-element backgrounds the skin
will use. The `bg` slot is conventionally the narrative-level background.

---

### Step A3 — Write `template.html`

This file is a human-readable reference; the skin builds its DOM in JS.
Write `skins/<ID>/template.html`:

```html
<!-- skins/<ID>/template.html
     <SKIN_NAME> skin — slot-based HTML template reference.

     Available slots (see slots.json):
       {{bg}}  — narrative background image (type: background)
       {{1}}   — element 1 background
       …
-->
```

---

### Step A4 — Write `<ID>.css`

All styles must be scoped under `body.skin-<ID>` to avoid leaking into other
skins. The CSS file is loaded lazily by the framework when the skin is first
activated — it does not need to be linked from `index.html`.

Write `skins/<ID>/<ID>.css`:

```css
/* skins/<ID>/<ID>.css — <SKIN_NAME> skin */

body.skin-<ID> .narrative-overlay {
  /* overlay container styles */
}

body.skin-<ID> .narrative-overlay .overlay-content {
  /* scrollable content area */
}

/* Add all skin-specific styles here, always scoped to body.skin-<ID> */
```

---

### Step A5 — Write `<ID>.js`

The JS module must export a factory function named
`create<PascalCaseID>Skin(ctx)`. The factory is called once and returns an
object with render functions. It is **not** called with `new`.

**ID → factory name examples:**

| ID | Factory name |
|---|---|
| `magazine` | `createMagazineSkin` |
| `timeline` | `createTimelineSkin` |
| `my-cards` | `createMyCardsSkin` |

The `ctx` object passed to the factory:

```
ctx.appStore                    app state (graph, narrativeStore, etc.)
ctx.nContent()                  → HTMLElement  the overlay's scrollable content div
ctx.nScroller()                 → HTMLElement  the overlay's scroll container
ctx.nEl()                       → HTMLElement  the overlay root element
ctx.openNarrativeOverlay(id, mode)             opens/shows the overlay
ctx.updateNavContext(concept)                  pass null for narrative views
ctx.loadHelpConfig()            → Promise      loads help-config.json
ctx.applyTooltips(rootEl)                      wires up tooltip UI
ctx.wireUpGallery(el)                          activates gallery lightbox
ctx.buildGalleryHtml(scope, id, label)→ string builds gallery HTML
ctx.renderNotFound(slug)                       renders 404 page
ctx.getNarrative(id)            → narrative    narrative data object
ctx.renderLinearStart(id)       → Promise      fallback: render as linear
ctx.loadSkinAssets(scope, id)   → Promise<{slotID: url}>  probes asset files
ctx.getMediaFor(scope, id)      → Array        Media-tab entries
ctx.mediaFilePath(scope, id, item) → string    resolves a media item to a URL
ctx.minimizeNarrativeOverlay()               minimizes overlay to PiP
ctx.expandAppSidebar()                         expands the sidebar
ctx.flashAppSidebar()                          briefly highlights sidebar
ctx.renderConceptIndex(el, concept)            renders the concept index
```

#### Template for a **full** render-style skin

The factory returns `{ render(narrativeID, skinParams) }`.
`app.js` calls `s.render(narrativeID, skinParams)`.

Write `skins/<ID>/<ID>.js`:

```javascript
/**
 * skins/<ID>/<ID>.js
 * <SKIN_NAME> skin — <brief description>.
 *
 * Call create<PascalID>Skin(ctx); returns { render }.
 */

import { escapeHTML } from "../../js/utils.js?v=6";
import { linkifyNarrativeText } from "../../js/render/content.js?v=6";
import { narrativeElementUrl, narrativeUrl, getNarrativeElement } from "../../js/graph/navigation.js?v=6";

export function create<PascalID>Skin(ctx) {

  async function render(narrativeID, skinParams) {
    skinParams = skinParams || {};

    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) { ctx.renderNotFound("narrative/" + narrativeID); return; }
    ctx.appStore.currentConceptSlug = null;

    const elements = (narrative.elements || [])
      .map(function (eid) { return getNarrativeElement(eid); })
      .filter(Boolean);

    if (!elements.length) {
      ctx.renderLinearStart(narrativeID);
      return;
    }

    // Load asset slots for each element
    const slotResults = await Promise.all(
      elements.map(function (el) {
        return ctx.loadSkinAssets("element", narrativeID + "/" + el.elementID);
      })
    );

    const overlayContent = ctx.nContent();
    if (!overlayContent) return;

    // Build HTML
    overlayContent.innerHTML = buildHtml(narrative, elements, slotResults, narrativeID, skinParams);
    const scr = ctx.nScroller();
    if (scr) scr.scrollTop = 0;

    ctx.openNarrativeOverlay(narrativeID, "<ID>");
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });
  }

  function buildHtml(narrative, elements, slotResults, narrativeID, skinParams) {
    // Build and return the full overlay HTML string.
    // Use escapeHTML() for all user-supplied text.
    // Use narrativeElementUrl(narrativeID, elementID) for navigation links.
    var parts = [];
    parts.push('<div class="<ID>-wrapper">');
    // … your HTML here …
    parts.push('</div>');
    return parts.join('');
  }

  return { render };
}
```

#### Template for a **paged** render-style skin

The factory returns `{ renderStart(narrativeID), renderElement(narrativeID, elementID) }`.
`app.js` calls `s.renderStart()` for the cover page and falls back to `linear`
for individual elements (unless you also implement `renderElement`).

Write `skins/<ID>/<ID>.js`:

```javascript
/**
 * skins/<ID>/<ID>.js
 * <SKIN_NAME> skin — <brief description>.
 *
 * Call create<PascalID>Skin(ctx); returns { renderStart, renderElement }.
 */

import { escapeHTML } from "../../js/utils.js?v=6";
import { linkifyNarrativeText, renderElementContentLinear, toRoman } from "../../js/render/content.js?v=6";
import { narrativeElementUrl, narrativeUrl, getNarrativeElement } from "../../js/graph/navigation.js?v=6";

export function create<PascalID>Skin(ctx) {

  function renderStart(narrativeID) {
    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) { ctx.renderNotFound("narrative/" + narrativeID); return; }
    ctx.appStore.currentConceptSlug = null;

    const content = ctx.nContent();
    if (content) {
      content.innerHTML = buildStartHtml(narrative, narrativeID);
      const scr = ctx.nScroller();
      if (scr) scr.scrollTop = 0;
    }
    ctx.openNarrativeOverlay(narrativeID, "<ID>");
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });
  }

  function renderElement(narrativeID, elementID) {
    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    const element = getNarrativeElement(elementID);
    if (!narrative || !element) {
      ctx.renderNotFound("narrative/" + narrativeID + "/element/" + elementID);
      return;
    }
    ctx.appStore.currentConceptSlug = null;

    const sequence = narrative.elements || [];
    const idx    = sequence.indexOf(elementID);
    const prevID = idx > 0 ? sequence[idx - 1] : "";
    const nextID = idx >= 0 && idx < sequence.length - 1 ? sequence[idx + 1] : "";

    const content = ctx.nContent();
    if (!content) return;
    content.innerHTML = buildElementHtml(element, narrativeID, elementID, idx, prevID, nextID);
    const scr = ctx.nScroller();
    if (scr) scr.scrollTop = 0;

    ctx.openNarrativeOverlay(narrativeID, "<ID>");
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });
  }

  function buildStartHtml(narrative, narrativeID) {
    return '<div class="<ID>-start">'
      + '<h1>' + escapeHTML(narrative.narrativeTitle || narrativeID) + '</h1>'
      + '<div>' + linkifyNarrativeText(narrative.narrativeSummary || "") + '</div>'
      + '<a href="' + narrativeElementUrl(narrativeID, narrative.narrativeStart) + '">Começar</a>'
      + '</div>';
  }

  function buildElementHtml(element, narrativeID, elementID, idx, prevID, nextID) {
    return '<div class="<ID>-element">'
      + '<p>' + escapeHTML(toRoman(idx + 1)) + '</p>'
      + '<h1>' + escapeHTML(element.elementTitle || elementID) + '</h1>'
      + '<div>' + renderElementContentLinear(element.elementContent || "") + '</div>'
      + '<nav>'
      + (prevID
          ? '<a href="' + narrativeElementUrl(narrativeID, prevID) + '">← Anterior</a>'
          : '<a href="' + narrativeUrl(narrativeID) + '">← Início</a>')
      + (nextID
          ? '<a href="' + narrativeElementUrl(narrativeID, nextID) + '">Próximo →</a>'
          : '')
      + '</nav>'
      + '</div>';
  }

  return { renderStart, renderElement };
}
```

---

### Step A6 — Register in `skins/index.json`

Open `skins/index.json` and add an entry to the `skins` array:

```json
{ "id": "<ID>", "name": "<DISPLAY_NAME>", "scope": ["narrative"], "dataContract": {} }
```

`dataContract: {}` means the skin has no special spreadsheet data requirements.
Use `"dataContract": { "builtin": true }` only for framework-built skins.

---

### Step A7 — Verify

Start the local server, load a narrative, and select the new skin from the skin
selector in the top bar. Check:
- The skin CSS loads (no unstyled flash)
- All narrative elements render
- Navigation (prev/next or scroll) works
- The overlay closes cleanly

---

## PART B — New hero diagram renderer

See `docs/hero-diagram-tutorial.md` for a full walkthrough of the data model
and SVG techniques. This section covers only the mechanical steps.

---

### Step B1 — Create the renderer file

Write `js/diagram/<ID>.js`:

```javascript
/**
 * js/diagram/<ID>.js
 * Hero diagram style: <describe what it shows>.
 */

import { wrapText }   from "../render/content.js?v=4";
import { escapeHTML } from "../utils.js?v=4";
import { conceptUrl } from "../graph/navigation.js?v=4";

export function render(container, graph, siteConfig) {
  // 1. Resolve root concept
  var rootId   = String((siteConfig && siteConfig["hero.root"]) || "").trim().toUpperCase();
  var rootSlug = (rootId && graph.idToSlug) ? graph.idToSlug[rootId] : null;
  rootSlug     = rootSlug || (graph.order && graph.order[0]);
  if (!rootSlug || !graph.bySlug[rootSlug]) {
    container.innerHTML = '<p class="hero-diagram-empty">Conceito raiz não encontrado.</p>';
    return;
  }
  var root = graph.bySlug[rootSlug];

  // 2. Select items — choose ONE of:
  //
  //    A. Filter all concepts by a field value:
  //       var items = graph.order
  //         .map(function(s) { return graph.bySlug[s]; })
  //         .filter(function(c) { return c && c.level === "myvalue"; });
  //
  //    B. Filter root's direct relations by category or name:
  //       var items = (root.relations || [])
  //         .filter(function(rel) { return rel.relationCategory === "mycategory"; })
  //         .map(function(rel) { return graph.bySlug[rel.targetSlug]; })
  //         .filter(Boolean);

  var items = []; // ← populate above
  if (!items.length) {
    container.innerHTML = '<p class="hero-diagram-empty">Nenhum item encontrado.</p>';
    return;
  }

  // 3. Layout — SVG coordinate system
  var W = 1300, H = 900, cx = W / 2, cy = H / 2;
  // Compute positions for each item…

  // 4. Build SVG via string concatenation
  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H
    + '" class="hero-diagram-svg" preserveAspectRatio="xMidYMid meet">');
  parts.push('<defs>');
  // gradients and filters here
  parts.push('</defs>');

  // background
  parts.push('<rect width="' + W + '" height="' + H + '" fill="#0d0d0d"/>');

  // nodes — mark each with class="hero-diagram-node" data-slug="<slug>"
  items.forEach(function (item, i) {
    var label = item.concept || '';
    var lines = wrapText(label, 16, 3);
    parts.push('<g class="hero-diagram-node" data-slug="' + escapeHTML(item.slug) + '">');
    // … your node SVG here …
    parts.push('</g>');
  });

  // centre node
  parts.push('<g class="hero-diagram-center">');
  // … your centre SVG here …
  parts.push('</g>');

  parts.push('</svg>');
  container.innerHTML = parts.join('');

  // 5. Wire click navigation
  container.querySelectorAll('.hero-diagram-node').forEach(function (node) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', function () {
      var slug = node.getAttribute('data-slug');
      if (slug) location.hash = conceptUrl(slug);
    });
  });
  var center = container.querySelector('.hero-diagram-center');
  if (center) {
    center.style.cursor = 'pointer';
    center.addEventListener('click', function () { location.hash = conceptUrl(rootSlug); });
  }
}
```

Replace all `<ID>` placeholders with the actual renderer ID.

---

### Step B2 — Configure the Site sheet

In the site's `data/conceptual_graph.xlsx`, open the **Site** sheet and set:

| Key | Value |
|---|---|
| `hero.diagram` | `<ID>` |

If there is no Site sheet, create one with columns `Key` and `Value`.

If the renderer uses concept-level filtering (option A above), ensure the
Concepts sheet has the relevant column (e.g. `level`) populated with the
expected values.

---

### Step B3 — Verify

Reload with a localStorage clear so the Site sheet is re-parsed:

```javascript
Object.keys(localStorage)
  .filter(k => k.startsWith('conceptGraph'))
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

Check:
- The correct diagram renders on the home screen
- Clicking a node navigates to the concept
- Clicking the centre navigates to the root concept

---

## Sharing a skin or renderer with the framework

Both skins and hero diagram renderers start life as site-local files. To share
one with all sites via the framework:

1. Copy the file(s) to the equivalent location in `arc21-framework`:
   - Skin: `arc21-framework/skins/<ID>/`
   - Renderer: `arc21-framework/js/diagram/<ID>.js`
2. For a skin, also add it to the framework's `skins/index.json` as a reference
   entry (sites will still manage their own `skins/index.json` to opt in).
3. Commit and push to `arc21-framework`.
4. Run `python sync.py` in each site repo to receive the new files.
