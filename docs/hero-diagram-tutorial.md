# Custom hero diagram tutorial

The hero diagram is the visual centrepiece of the home screen. This tutorial
explains how to write your own renderer, using the two framework-provided
examples — `nebulosa` and `infra` — as annotated walkthroughs.

---

## How the renderer is selected

When the home screen loads, `app.js` reads `siteConfig["hero.diagram"]` from
`localStorage` (populated from the Site sheet of your XLSX) and does:

```javascript
import('./js/diagram/' + style + '.js')
  .then(mod => mod.render(container, graph, siteConfig))
  .catch(() => _renderBuiltinHeroDiagram(container))
```

So a renderer named `"myrenderer"` must live at `js/diagram/myrenderer.js`
and export a `render` function. If the file is absent the built-in generic
diagram is used as fallback.

---

## The render function contract

Every renderer exports one function:

```javascript
export function render(container, graph, siteConfig) { … }
```

| Parameter | Type | Contents |
|---|---|---|
| `container` | `HTMLElement` | The `<div id="heroDiagram">` element — write into it |
| `graph` | `Object` | The full in-memory concept graph (see below) |
| `siteConfig` | `Object` | Key-value pairs from the Site sheet of the XLSX |

The function must be **synchronous** and must set `container.innerHTML`
(or append children) before returning.

---

## The `graph` object

```
graph.bySlug      Object  slug → concept object
graph.order       Array   slugs in insertion order (first = root by default)
graph.idToSlug    Object  conceptID → slug  (e.g. "C001" → "ciberespaco")
```

### Concept object fields

```
concept.slug          string  URL-safe identifier
concept.concept       string  display name
concept.conceptID     string  spreadsheet ID (e.g. "C001")
concept.description   string  full description text
concept.level         string  value from the Concepts sheet "level" column
concept.camada        string  value from the Concepts sheet "camada" column
concept.sourceUrl     string
concept.imagePath     string
concept.sourceTitle   string
concept.relations     Array   outgoing relation objects (see below)
```

### Relation object fields (inside `concept.relations`)

```
rel.target              string  display name of the related concept
rel.targetSlug          string  slug of the related concept
rel.targetConceptID     string  spreadsheet ID of the related concept
rel.relationTypeID      string  e.g. "RT004"
rel.relationName        string  e.g. "infraestrutura_sustentacao"
rel.relationCategory    string  e.g. "infraestrutura"
rel.explanation         string
```

---

## Available imports

These framework utilities are safe to use from any renderer:

```javascript
import { wrapText }   from "../render/content.js?v=10";
import { escapeHTML } from "../utils.js?v=10";
import { conceptUrl } from "../graph/navigation.js?v=10";
```

| Function | Signature | Purpose |
|---|---|---|
| `wrapText(text, maxChars, maxLines)` | `→ string[]` | Break a label into lines for SVG `<text>` elements |
| `escapeHTML(str)` | `→ string` | Escape `<`, `>`, `&`, `"` before inserting into SVG |
| `conceptUrl(slug)` | `→ string` | URL hash to navigate to a concept (use with `location.hash`) |

---

## Walkthrough 1 — `nebulosa.js` (concept-level filter)

`nebulosa` visualises a curated set of top-level concepts as glowing coloured
circles. The data selection is **concept-level**: it scans all concepts and
picks those marked with `level = "nebulosa"` in the Concepts sheet.

### Step 1 — Resolve the root concept

```javascript
var rootId   = String((siteConfig && siteConfig["hero.root"]) || "").trim().toUpperCase();
var rootSlug = (rootId && graph.idToSlug) ? graph.idToSlug[rootId] : null;
rootSlug     = rootSlug || (graph.order && graph.order[0]);  // fallback: first concept
var root     = graph.bySlug[rootSlug];
```

`siteConfig["hero.root"]` is a conceptID (e.g. `"C001"`). `idToSlug` maps it to
a slug. If not configured, fall back to the first concept in insertion order.
Always guard against missing concepts and set `container.innerHTML` to an error
message if the root is not found.

### Step 2 — Select the items to display

```javascript
var PALETTE = ['#ecb586', '#f472b6', '#3b82f6', '#a155f0', '#14a68c', '#2dd4bf'];

var items = graph.order
  .map(function (s) { return graph.bySlug[s]; })
  .filter(function (c) { return c && String(c.level || "").toLowerCase() === "nebulosa"; })
  .map(function (c, i) {
    return { slug: c.slug, label: c.concept, camada: c.camada || "", color: PALETTE[i % PALETTE.length] };
  });
```

Walk `graph.order` (preserves spreadsheet row order) to keep item order
predictable. The `camada` field is an optional secondary label shown beneath
the circle. Assign colours by cycling a fixed palette — `i % PALETTE.length`
prevents an out-of-bounds error if there are more items than colours.

### Step 3 — Layout

```javascript
var W = 1300, H = 900, cx = W / 2, cy = H / 2, R = 310, N = items.length;

function pointAt(i) {
  var ang = (-90 + (360 / N) * i) * Math.PI / 180;
  return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, ang: ang };
}
```

The SVG is always 1300 × 900 with `preserveAspectRatio="xMidYMid meet"` — the
browser scales it to fit the container. `-90` degrees starts the first item at
the top (12 o'clock). `R` is the orbital radius from the centre.

### Step 4 — Build the SVG

`nebulosa` uses string concatenation (`parts.push(...)` then
`container.innerHTML = parts.join('')`). This is intentional: it avoids
`document.createElementNS` boilerplate and is fast for SVG of this size.

Put `<defs>` first: gradients and filters must be declared before they are
referenced. Use unique IDs prefixed with a renderer-specific namespace (e.g.
`hd-`) to avoid collisions if two renderers are ever used on the same page.

**Key SVG techniques used:**
- `<radialGradient>` for the glow halos around each circle
- `<linearGradient gradientUnits="userSpaceOnUse">` for the connecting lines
  (coordinates in SVG space, not percentages, so the gradient follows the line)
- `<feGaussianBlur>` filters for soft glow — apply to a blurred duplicate
  circle behind the sharp one; `<feMerge>` recombines both layers

### Step 5 — Make nodes clickable

```javascript
container.querySelectorAll('.hero-diagram-node').forEach(function (node) {
  node.style.cursor = 'pointer';
  node.addEventListener('click', function () {
    var slug = node.getAttribute('data-slug');
    if (slug) location.hash = conceptUrl(slug);
  });
});
```

Store the slug in `data-slug` on the `<g>` element during SVG construction,
then read it back in the event handler. `conceptUrl(slug)` returns the correct
hash URL; assigning it to `location.hash` navigates without a page reload.

---

## Walkthrough 2 — `infra.js` (relation-level filter)

`infra` visualises the direct neighbours of the root concept, filtered by
relation type. The data selection is **relation-level**: it walks the root's
`relations` array instead of scanning all concepts.

### Step 1 — Select children via relations

```javascript
var children = (root.relations || [])
  .filter(function (rel) {
    var cat  = String(rel.relationCategory || "").toLowerCase();
    var name = String(rel.relationName    || "").toLowerCase();
    return cat === "infraestrutura" || name.indexOf("infraestrutura") === 0;
  })
  .map(function (rel) { return graph.bySlug[rel.targetSlug]; })
  .filter(Boolean);  // drop relations whose target is not in the graph

// Graceful fallback: show first 8 relations if no typed ones exist
if (!children.length) {
  children = (root.relations || []).slice(0, 8)
    .map(function (rel) { return graph.bySlug[rel.targetSlug]; })
    .filter(Boolean);
}
```

Check both `relationCategory` and `relationName` because different spreadsheet
formats store the classification differently. The fallback to the first 8
relations means the diagram is never empty on a correctly-structured graph.

### Step 2 — Simpler layout with rectangular nodes

`infra` uses plain `<rect>` nodes instead of circles, giving a more technical,
diagrammatic look. The `wrapText(label, maxChars, maxLines)` call keeps labels
from overflowing the fixed-width box:

```javascript
var lines = wrapText(child.concept || '', 18, 2);  // max 18 chars, max 2 lines
parts.push('<rect x="' + (p.x - 78) + '" y="' + (p.y - 28) + '" width="156" height="56" rx="6" …/>');
lines.forEach(function (line, j) {
  parts.push('<text … y="' + (p.y - 6 + j * 18) + '" …>' + escapeHTML(line) + '</text>');
});
```

---

## Comparison: when to use each approach

| | `nebulosa` approach | `infra` approach |
|---|---|---|
| **Data source** | `concept.level` field across all concepts | `root.relations` filtered by category/name |
| **What it shows** | A curated taxonomy layer | The immediate neighbourhood of the root |
| **Spreadsheet requirement** | A `level` column in Concepts, value `"nebulosa"` | Relations from the root with the right category/name |
| **Node style** | Glowing circles — organic, atmospheric | Rounded rectangles — structured, technical |
| **Fallback** | Empty state if no `level=nebulosa` concepts | Falls back to first 8 relations |

---

## Minimal custom renderer template

```javascript
/**
 * js/diagram/myrenderer.js
 * Hero diagram style: <describe what it shows>.
 */

import { wrapText }   from "../render/content.js?v=10";
import { escapeHTML } from "../utils.js?v=10";
import { conceptUrl } from "../graph/navigation.js?v=10";

export function render(container, graph, siteConfig) {
  // 1. Resolve the root concept
  var rootId   = String((siteConfig && siteConfig["hero.root"]) || "").trim().toUpperCase();
  var rootSlug = (rootId && graph.idToSlug) ? graph.idToSlug[rootId] : null;
  rootSlug     = rootSlug || (graph.order && graph.order[0]);
  if (!rootSlug || !graph.bySlug[rootSlug]) {
    container.innerHTML = '<p class="hero-diagram-empty">Conceito raiz não encontrado.</p>';
    return;
  }
  var root = graph.bySlug[rootSlug];

  // 2. Select items to display
  //    Option A — concept-level: filter graph.order by a field value
  //    Option B — relation-level: filter root.relations by category/name
  var items = []; // populate with { slug, label, ... }
  if (!items.length) {
    container.innerHTML = '<p class="hero-diagram-empty">Nenhum item encontrado.</p>';
    return;
  }

  // 3. Build layout
  var W = 1300, H = 900, cx = W / 2, cy = H / 2;
  // ... compute positions for each item

  // 4. Build SVG
  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H
    + '" class="hero-diagram-svg" preserveAspectRatio="xMidYMid meet">');
  // ... defs, background, nodes, labels
  parts.push('</svg>');
  container.innerHTML = parts.join('');

  // 5. Wire up click navigation
  container.querySelectorAll('.hero-diagram-node').forEach(function (node) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', function () {
      var slug = node.getAttribute('data-slug');
      if (slug) location.hash = conceptUrl(slug);
    });
  });
}
```

---

## Wiring it up

1. Save the file as `js/diagram/myrenderer.js` in your site repo
2. In the XLSX Site sheet, set `hero.diagram` → `myrenderer`
3. Clear localStorage and reload so the Site sheet is re-parsed:
   ```javascript
   Object.keys(localStorage).filter(k => k.startsWith('conceptGraph')).forEach(k => localStorage.removeItem(k));
   location.reload();
   ```

The file is site-owned — sync will never overwrite it. To share it with other
sites, copy it to `arc21-framework/js/diagram/` and submit it to the framework.
