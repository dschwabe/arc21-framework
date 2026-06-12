# ARC21 Framework — Developer Guide

> Organised using the [Diátaxis](https://diataxis.fr) framework.  
> Four sections, four modes of use:
> **Tutorials** (learning) · **How-to guides** (tasks) · **Reference** (lookup) · **Explanation** (understanding)

> Examples in this guide use values from the Infância Algorítmica V6 site
> (port `8000`, Firebase project `arq21-73196`, language `pt-BR`).
> Substitute the values for your own site where indicated.

---

## Table of contents

### Tutorials
1. [Getting started: load your first graph](#tutorial-1-getting-started)
2. [Build and open your first narrative](#tutorial-2-build-your-first-narrative)
3. [Implement a scrollytelling skin](#tutorial-3-implement-a-scrollytelling-skin)
4. [Embed an HTML file in a concept page](#tutorial-4-embed-an-html-file-in-a-concept-page)

### How-to guides
3. [Serve the app locally](#how-to-serve-locally)
4. [Load a different data file](#how-to-load-a-different-data-file)
5. [Format the spreadsheet](#how-to-format-the-spreadsheet)
6. [Add images, videos, and HTML embeds to media slots](#how-to-add-media)
7. [Create a skin asset pack](#how-to-create-a-skin-asset-pack)
8. [Add a "Para saber mais" overlay to a narrative](#how-to-add-a-more-page)
9. [Switch skins at runtime](#how-to-switch-skins)
10. [Deploy to Firebase Hosting](#how-to-deploy-to-firebase)

### Reference
11. [Hash-based URL routing](#reference-url-routing)
12. [Spreadsheet format — all tabs and columns](#reference-spreadsheet-format)
13. [Skin registry — `skins/index.json`](#reference-skin-registry)
14. [Skin module API](#reference-skin-module-api)
15. [Asset discovery — `loadSkinAssets` and `urls.txt`](#reference-asset-discovery)
16. [`appStore` and storage keys](#reference-appstore)
17. [CSS design tokens](#reference-css-tokens)
18. [Module dependency graph](#reference-module-graph)

### Explanation
19. [Architecture overview](#explanation-architecture)
20. [The graph model: slugs, IDs and relations](#explanation-graph-model)
21. [The narrative model: overlays, elements and skins](#explanation-narrative-model)
22. [The skin system: lazy loading and the context object](#explanation-skin-system)
23. [Data flow: from spreadsheet to rendered page](#explanation-data-flow)

---

---

# Tutorials

Tutorials are **learning by doing**. Follow each step in order; by the end you will have something working.

---

## Tutorial 1: Getting started

**Goal:** serve the app, load the default spreadsheet, and navigate the concept graph.

### Prerequisites
- Python 3 (for the local server) **or** any HTTP server
- The project folder checked out locally
- The file `data/conceptual_graph.xlsx` present in the folder

### Steps

**1. Start a local HTTP server**

Open a terminal in the project root and run:

```bash
python3 -m http.server 8000   # use any free port
```

Then open `http://localhost:8000` in your browser. You should see the hero screen with the site logo and a loader card.

> ⚠️ Opening `index.html` directly as a `file://` URL will work for file-picker loading but will fail for path-based loading due to browser CORS rules.

**2. Load the data**

The loader card shows a text field pre-filled with `data/conceptual_graph.xlsx`. Click the **load by path** button. After a moment the status bar shows a success message with the number of concepts loaded.

The hero diagram also updates to show the root concept and its aspects radiating outward.

**3. Navigate the graph**

Click the start link (labelled with the root concept name). The concept page opens inside the collapsible shell. Notice:

- **Left sidebar** — the concept index (alphabetical) and the narrative list
- **Top bar** — path trail showing the route from root to current concept, back button, history button
- **Main area** — concept title, description, related concepts list, and a media gallery on the right

Click any `[[wikilink]]` in the description or any related concept in the list to navigate further.

**4. Open a narrative**

In the left sidebar under **Narrativas**, click any narrative link. The narrative overlay opens full-screen with a top bar. The skin selector (`<select>`) lets you toggle between **Scrolly** and **Linear** presentation.

**5. Minimise and resume**

In the narrative top bar, click **⊟ Minimizar**. The overlay collapses to a picture-in-picture card in the bottom-right corner. Click the card to expand it again, or click the **×** button to close it entirely.

---

## Tutorial 2: Build your first narrative

**Goal:** add a new narrative with two elements to the spreadsheet and view it in the app.

### Steps

**1. Open `data/conceptual_graph.xlsx` in Excel or LibreOffice.**

**2. Go to the `Narratives` tab.** Add a new row:

| narrativeID | narrativeTitle | narrativeStart | narrativeSummary | elements |
|---|---|---|---|---|
| N099 | Minha Primeira Narrativa | E099a | Uma breve introdução de teste. | E099a, E099b |

**3. Go to the `Elements` tab.** Add two rows:

| elementID | elementTitle | elementContent | referencedConceptIDs |
|---|---|---|---|
| E099a | Abertura | Este é o primeiro capítulo. Fala sobre [[Infância algorítmica]]. | C051 |
| E099b | Conclusão | Este é o segundo capítulo. Exploração concluída. | |

**4. Save the file as `.xlsx`.**

**5. In the app**, click **Trocar arquivo** in the top navigation bar. A file picker opens. Select your saved file.

**6.** The status bar confirms the load. In the left sidebar, **Narrativas** now shows **Minha Primeira Narrativa**. Click it.

**7.** The narrative opens in the linear skin. The chapter title **Abertura** is shown, with the wikilink `[[Infância algorítmica]]` resolved to a real concept link. Click **→ Próximo** to advance to **Conclusão**.

**8. Try the scrolly skin:** use the skin selector in the top bar to switch to **Scrolly**. The same content is now rendered as a scrollytelling experience.

---

## Tutorial 3: Implement a scrollytelling skin

**Goal:** understand the scrollytelling architecture and build a working minimal narrative scrolly skin from scratch.

### Background: the two scrolly skins

The project ships two different scrollytelling renderers:

| Skin ID | Scope | Data source | File |
|---|---|---|---|
| `scrolly` | `narrative` | Narrative elements from the spreadsheet | `skins/scrolly/scrolly.js` |
| `concept-scrolly` | `concept` | A narrative used *as* a concept's visual layer | `skins/concept-scrolly/concept-scrolly.js` |

This tutorial focuses on the **narrative `scrolly` skin** pattern, which is the canonical scrollytelling implementation. The `concept-scrolly` skin uses an identical scroll engine but wraps it in a concept-page context.

### How the engine works

Every scrolly skin is built around a single layout invariant:

```
┌──────────────────────────────────────────────┐  ← position: sticky; top: topbarHeight
│  Sticky viewport  (100svh − topbar)           │
│  ┌──────────────────┐  ┌────────────────────┐ │
│  │  Text pane (56%) │  │  Image pane (44%)  │ │
│  │                  │  │                    │ │
│  │  word-by-word    │  │  card stack        │ │
│  │  reveal          │  │  (images flip as   │ │
│  │                  │  │   text advances)   │ │
│  └──────────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│  Invisible scroll spacer                      │
│  height = panels × scrollPerPanel             │
└──────────────────────────────────────────────┘
```

The user never actually scrolls through visible content. The sticky viewport stays fixed while the spacer below it accumulates scroll distance. The engine reads `window.scrollY`, converts it to a progress value between 0 and 1, and drives all animations — text reveal, card flips, panel transitions — from that single number.

### Per-panel scroll phases

Each panel occupies a fixed scroll height divided into four sequential phases:

| Phase | Duration | What happens |
|---|---|---|
| `textProgress` (0→1) | `vh × 2.0` | Text words reveal one by one; image cards flip in the stack |
| `descProg` (0→1) | `vh × 2.2` | Last card descends from the stack into the text area |
| `pauseProg` (0→1) | `vh × 0.7` | Last card sits still; reader absorbs it |
| `fadeProg` (0→1) | `vh × 0.8` | Last card and text fade out; next panel is ready |

When `fadeProg >= 0.5` on the **last panel**, the `scs-at-end` class is added to the root, which makes the end-of-narrative action buttons visible.

### Steps to build a minimal narrative scrolly skin

**Prerequisites:** a working local HTTP server and a spreadsheet with at least one narrative with two or more elements.

---

**Step 1 — Create the skin folder and register it**

```
skins/
└── my-scrolly/
    ├── my-scrolly.js
    └── my-scrolly.css
```

Add to `skins/index.json`:

```json
{ "id": "my-scrolly", "name": "My Scrolly", "scope": ["narrative"] }
```

---

**Step 2 — Write the CSS skeleton**

The core layout relies on `position: sticky`. A critical constraint: **do not set `overflow: hidden` on any ancestor of the sticky element** — the browser silently treats that ancestor as the scroll container, which breaks the sticky behaviour entirely.

```css
/* skins/my-scrolly/my-scrolly.css */

.my-scrolly-root {
  --ms-bg:     #07080e;
  --ms-text:   #e4e0d6;
  --ms-accent: #c89b6e;
  --ms-top:    0px;   /* overridden by JS: topbar offsetHeight */
  position: relative;
  width: 100%;
  background: var(--ms-bg);
  color: var(--ms-text);
  /* ⚠️ No overflow:hidden here — it would break position:sticky */
}

/* The sticky viewport fills the visible screen minus the topbar */
.my-scrolly-viewport {
  position: sticky;
  top: var(--ms-top);
  width: 100%;
  height: calc(100svh - var(--ms-top));
  display: flex;
  overflow: hidden;   /* OK here — inside the sticky element, not on an ancestor */
}

/* The spacer provides the scroll distance.
   Its height is set by JS: panels × scrollPerPanel */
.my-scrolly-spacer {
  pointer-events: none;
}

/* Two-column split */
.ms-text-pane  { width: 56%; display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem; }
.ms-image-pane { width: 44%; position: relative; }

/* Word reveal */
.ms-word { opacity: 0; transition: opacity 0.2s; }
.ms-word.revealed { opacity: 1; }
```

---

**Step 3 — Write the JS module**

```js
// skins/my-scrolly/my-scrolly.js
import { getNarrativeElement } from "../../js/graph/navigation.js?v=10";
import { escapeHTML } from "../../js/utils.js?v=10";

export function createMyScrollySkin(ctx) {

  async function render(narrativeID) {
    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) { ctx.renderNotFound("narrative/" + narrativeID); return; }
    ctx.appStore.currentConceptSlug = null;

    // 1. Collect elements
    const elements = (narrative.elements || [])
      .map(function (eid) { return getNarrativeElement(eid); })
      .filter(Boolean);
    if (!elements.length) { ctx.renderLinearStart(narrativeID); return; }

    // 2. Build panels data structure
    const panels = elements.map(function (el) {
      return {
        text:   el.elementContent || el.elementTitle || "",
        images: []   // filled later from assets
      };
    });

    // 3. Render into the overlay content area
    const overlayContent = ctx.nContent();
    if (!overlayContent) return;
    overlayContent.innerHTML = buildHTML(panels, narrative.narrativeTitle || narrativeID);

    const root = overlayContent.querySelector(".my-scrolly-root");

    // 4. Open the overlay
    ctx.nScroller().scrollTop = 0;
    ctx.openNarrativeOverlay(narrativeID, "scrolly");

    // 5. Wire the scroll engine
    const topbarEl = document.querySelector(".topbar");
    const topH = topbarEl ? topbarEl.offsetHeight : 0;
    root.style.setProperty("--ms-top", topH + "px");

    const VH = window.innerHeight;
    const SCROLL_PER_PANEL = VH * 5.7;  // total scroll distance per panel
    const SCROLL_TEXT      = VH * 2.0;  // phase 1: text reveal

    const spacer = root.querySelector(".my-scrolly-spacer");
    spacer.style.height = panels.length * SCROLL_PER_PANEL + "px";

    const scroller = ctx.nScroller();
    scroller.addEventListener("scroll", function () {
      const localY = scroller.scrollTop;
      const panelIdx = Math.min(
        panels.length - 1,
        Math.floor(localY / SCROLL_PER_PANEL)
      );
      const panelY = localY - panelIdx * SCROLL_PER_PANEL;
      const textProgress = Math.min(1, panelY / SCROLL_TEXT);
      updateTextReveal(root, panelIdx, textProgress);
    }, { passive: true });

    // 6. Load real images in background
    const assets = await ctx.loadSkinAssets("narrative", narrativeID);
    // (use assets["1"], assets["2"], etc. to populate image slots)
  }

  // ── HTML builder ──────────────────────────────────────────────────────
  function buildHTML(panels, title) {
    let panelsHtml = "";
    panels.forEach(function (panel, i) {
      const words = panel.text.split(/(\s+)/).map(function (part) {
        if (/^\s+$/.test(part)) return part;
        return '<span class="ms-word">' + escapeHTML(part) + '</span>';
      }).join("");
      panelsHtml +=
        '<div class="ms-panel" data-index="' + i + '" style="display:none">' +
          '<div class="ms-text-content">' + words + '</div>' +
        '</div>';
    });

    return (
      '<div class="my-scrolly-root">' +
        '<div class="my-scrolly-viewport">' +
          '<div class="ms-text-pane">' +
            '<div id="ms-active-panel">' + panelsHtml + '</div>' +
          '</div>' +
          '<div class="ms-image-pane"></div>' +
        '</div>' +
        '<div class="my-scrolly-spacer"></div>' +
      '</div>'
    );
  }

  // ── Scroll handler ────────────────────────────────────────────────────
  let _currentPanelIdx = -1;

  function updateTextReveal(root, panelIdx, textProgress) {
    if (panelIdx !== _currentPanelIdx) {
      // Switch panel
      root.querySelectorAll(".ms-panel").forEach(function (el, i) {
        el.style.display = i === panelIdx ? "" : "none";
      });
      _currentPanelIdx = panelIdx;
    }
    const panel = root.querySelector(".ms-panel[data-index='" + panelIdx + "']");
    if (!panel) return;
    const words = panel.querySelectorAll(".ms-word");
    const revealCount = Math.round(textProgress * words.length);
    words.forEach(function (w, i) {
      w.classList.toggle("revealed", i < revealCount);
    });
  }

  return { render };
}
```

---

**Step 4 — Add the `#app` container override**

The narrative overlay (`#nOverlayContent`) has no container constraints, so the skin gets full width automatically. But if you build a *concept* scrolly skin that renders into `#app` instead, you must override the app container's padding and `max-width`, then restore them on cleanup:

```js
const app = document.getElementById("app");
const _origPad = app.style.padding;
app.style.padding  = "0";
app.style.maxWidth = "100%";
// ... register cleanup:
_cleanupFns.push(function () { app.style.padding = _origPad; });
```

The `concept-scrolly.css` file also does this declaratively via `:has()` for browsers that support it:
```css
#app:has(.concept-scrolly-root) {
  padding: 0 !important;
  max-width: 100% !important;
}
```

---

**Step 5 — Add a sidebar tab**

Full-page skins hide the normal left sidebar. Add a floating `›`/`‹` tab so the concept index stays reachable:

```js
var sidebarPane = null;

function openSidebarOverlay() {
  if (sidebarPane) return;
  var pane = document.createElement("aside");
  pane.className = "concept-index-pane sidebar-overlay";
  pane.innerHTML =
    '<div class="sidebar-overlay-header"><span>Índice</span>' +
    '<button class="sidebar-toggle-btn" type="button">‹</button></div>' +
    '<details class="sidebar-section narrative-index-section" open>' +
    '<summary>Narrativas</summary>' +
    '<div id="narrativeList" class="narrative-list"></div></details>';
  ctx.renderConceptIndex(pane, null);
  pane.querySelector(".sidebar-toggle-btn")
      .addEventListener("click", closeSidebarOverlay);
  var backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  backdrop.addEventListener("click", closeSidebarOverlay);
  document.body.appendChild(backdrop);
  document.body.appendChild(pane);
  sidebarPane = pane;
}

function closeSidebarOverlay() {
  if (sidebarPane) { sidebarPane.remove(); sidebarPane = null; }
}

var tab = document.createElement("button");
tab.className  = "skin-sidebar-tab";
tab.type       = "button";
tab.textContent = "›";
tab.addEventListener("click", function () {
  sidebarPane ? closeSidebarOverlay() : openSidebarOverlay();
});
document.body.appendChild(tab);
```

`skin-sidebar-tab` is a global class defined in `default.css` — it positions the button as a fixed tab on the left edge of the screen.

---

**Step 6 — Wire end-of-narrative actions**

When `fadeProg >= 0.5` on the last panel, show "Para saber mais" and "Sair" buttons:

```js
// In the scroll handler, after computing fadeProg on the last panel:
const atEnd = panelIdx === panels.length - 1 && fadeProg >= 0.5;
root.classList.toggle("scs-at-end", atEnd);
```

```css
/* In your skin CSS */
#ms-action-buttons { display: none; }
.my-scrolly-root.scs-at-end #ms-action-buttons { display: flex; gap: 0.6rem; }
```

```js
// Wire the buttons
actionsEl.querySelector(".ms-btn-more").addEventListener("click", function () {
  moreOverlay.hidden = false;   // opens the more.html iframe
});
actionsEl.querySelector(".ms-btn-sair").addEventListener("click", function () {
  ctx.minimizeNarrativeOverlay();
  ctx.expandAppSidebar();
  setTimeout(function () { ctx.flashAppSidebar(); }, 150);
});
```

---

**Step 7 — Test**

1. Reload the app and navigate to the narrative in the sidebar.
2. Change the skin selector to **My Scrolly** — the overlay should show the first panel with text.
3. Scroll slowly — words should reveal as you scroll. At `window.scrollY = SCROLL_PER_PANEL`, the second panel appears.
4. On the last panel, scroll until fade-out: the action buttons appear.

### What the production `concept-scrolly` skin adds on top

The built-in `concept-scrolly` skin extends this minimal pattern with:

- **Card stack animations** — `computeCardTransforms()` calculates per-card `transform` / `opacity` / `zIndex` using easing functions so cards peel off in sequence as text progresses
- **Last-card descent** — the final card detaches from the stack (`position: fixed`) and animates down into the text pane, computed by `computeLastCardTarget()`
- **Auto-sizing text** — `fitTextToPane()` binary-searches for the largest `font-size` that keeps the text within 65% of the pane height
- **Background image** — loaded asynchronously from `assets/skins/<narrativeID>/bg.*` via `loadSkinAssets("narrative", narrativeID)`
- **Per-element image assets** — loaded asynchronously from `assets/skins/<narrativeID>/<elementID>/1.*`, `2.*`, etc.
- **Placeholder SVGs** — generated inline while real images load, using the element index as a hue offset

### Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `overflow: hidden` on an ancestor of the sticky element | Viewport snaps to top and won't stick | Remove or scope `overflow` to inside the sticky element |
| Measuring viewport dimensions before rendering | Wrong scroll distances | Call `makeCFG()` / `window.innerHeight` after the DOM is visible |
| Forgetting `window.scrollTo(0, 0)` before computing container offset | Panels are offset by the current scroll position | Always scroll to top before calling `getBoundingClientRect()` on the container |
| Setting `--scs-top` after the sticky element exists | Top gap is wrong on first load | Set the CSS variable on the root before inserting into the DOM |
| Not registering a cleanup function | Scroll listeners accumulate across navigations | Return and call a cleanup fn from `init()`; store it in `_cleanupFns` |
| Starting `setInterval` for slideshows immediately | Images flip on page load before the user scrolls | Only start `setInterval` when the image pane first enters the viewport (via `getBoundingClientRect`) |

---

## Tutorial 4: Embed an HTML file in a concept page

**Goal:** understand the two ways to embed a self-contained HTML file in a concept page, their constraints, and how to style the embedded document to match the site.

### The two embed paths

| Path | Where it appears | How to set it up |
|---|---|---|
| **Gallery slot** (`type=html`) | Media column, inside the gallery thumb strip | `Media` tab in the spreadsheet: `type=html`, `file=myfile.html` |
| **Description iframe** | Main content area, in place of the concept description | `Concept description` field = a filename ending in `.html` or `.htm` |

---

### Path A — Gallery HTML slot

The `Media` tab supports `type=html` as a media slot type. The slot renders as a sandboxed `<iframe>` inside the gallery, alongside image and video slots.

**Spreadsheet setup (Media tab):**

| scope | scopeID | type | file | aspectRatio | sandbox |
|---|---|---|---|---|---|
| concept | C051 | html | interactive/index.html | 16:9 | allow-scripts allow-same-origin |

**File placement:**
```
assets/concepts/C051/interactive/index.html
assets/concepts/C051/interactive/style.css   ← optional
assets/concepts/C051/interactive/script.js   ← optional
```

**What the app does:**

```html
<!-- Generated by buildGalleryHtml / _buildSlot -->
<div class="gallery-slot gallery-slot--html" style="aspect-ratio:16/9">
  <iframe
    src="assets/concepts/C051/interactive/index.html"
    sandbox="allow-scripts allow-same-origin"
    loading="lazy"
    frameborder="0"
    title="…">
  </iframe>
</div>
```

The `<iframe>` is sized to the aspect ratio you specify. The gallery handles show/hide and keyboard navigation automatically.

---

### Path B — Description iframe (seamless)

If the concept's description field in the spreadsheet is a filename ending in `.html` or `.htm` (instead of text), `concept-default.js` renders it as a seamless auto-sizing iframe that replaces the description text area.

**Spreadsheet setup (Concepts tab):**

| conceptID | ConceptLabel | description |
|---|---|---|
| C051 | Infância algorítmica | infancia-algoritmica-desc.html |

**File placement:**
```
assets/concepts/C051/infancia-algoritmica-desc.html
```

Wait — there is no automatic asset folder association here. The path in the description field is used **as-is** as the `src` attribute of the iframe. It must be a path **relative to the site root** (or a `https://` URL). For a file in the concept's asset folder, write the full relative path:

```
description = assets/concepts/C051/infancia-algoritmica-desc.html
```

**What the app does:**

```html
<!-- concept-default.js → mountHtmlFrame() -->
<div id="conceptDescription">
  <iframe
    src="assets/concepts/C051/infancia-algoritmica-desc.html"
    class="concept-html-frame"
    scrolling="no"
    style="width:100%; border:none; display:block; min-height:4rem;">
  </iframe>
</div>
```

The iframe fires a `load` event; `mountHtmlFrame()` then reads `doc.documentElement.scrollHeight` and sets `frame.style.height` to match. A `ResizeObserver` is attached to the iframe body so the height updates if the content changes after load.

---

### Linking to `default.css` from the embedded file

The embedded HTML file lives in a sub-folder, so the relative path to `default.css` is **not** `./default.css` — it must climb back to the project root:

```html
<!-- In assets/concepts/C051/interactive/index.html -->
<link rel="stylesheet" href="../../../../default.css" />
<!--  ^     ^        ^   ^     |
      assets/  C051/  interactive/  → 4 levels up  -->

<!-- In assets/concepts/C051/description.html -->
<link rel="stylesheet" href="../../../default.css" />
<!--  ^      ^       ^     |
      assets/  C051/  → 3 levels up  -->
```

Once linked, all CSS custom properties (`--bg`, `--ink`, `--accent`, etc.) are inherited and your HTML file automatically matches the site's dark theme.

> ⚠️ **The `default.css` link only works on `http://`**. When the site is opened as `file://`, the iframe `src` resolves correctly but `fetch()` and cross-frame resource loads are blocked by the browser. Test on a local HTTP server, not a `file://` URL.

---

### Styling the embedded document

Recommended minimal boilerplate for an embedded HTML file:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="../../../default.css" />  <!-- adjust depth -->
  <style>
    /* Fallback tokens in case default.css fails to load */
    :root {
      --bg:     #080b0e;
      --paper:  #10151b;
      --ink:    #f4efe6;
      --muted:  #a69d91;
      --accent: #f0a33a;
    }

    body {
      margin: 0;
      padding: 1.5rem 2rem;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body, "Inter", sans-serif);
    }
  </style>
</head>
<body>
  <!-- Your content here -->
</body>
</html>
```

---

### Caveats and restrictions

> These are hard browser constraints, not app decisions. They cannot be worked around without changing the architecture.

#### 1. Same-origin requirement

The embedded file **must be served from the same origin** as the main page (`http://localhost:8000` or the deployed Firebase domain). Cross-origin iframes are blocked by the browser's same-origin policy — `mountHtmlFrame()` will catch the exception and silently skip height-fitting.

```
✓ http://localhost:8000/assets/concepts/C051/desc.html
✓ https://your-project.web.app/assets/concepts/C051/desc.html
✗ https://external-host.com/page.html     ← cross-origin, height-fit will fail
```

For `https://` URLs in gallery slots, the gallery uses them as-is — they display in the iframe, but auto-sizing and `default.css` injection won't work.

#### 2. `sandbox` attribute (gallery slots)

Gallery HTML slots always get a `sandbox` attribute. The default value is `allow-scripts`. You can expand it in the `sandbox` column of the Media tab:

| Value to add | What it enables |
|---|---|
| `allow-scripts` | JavaScript execution **(always included)** |
| `allow-same-origin` | Access to localStorage, cookies, fetch same-origin |
| `allow-forms` | Form submission |
| `allow-popups` | `window.open()`, `target="_blank"` links |
| `allow-top-navigation` | Navigate the parent page — **use with caution** |

> ⚠️ **`allow-same-origin` + `allow-scripts` together** effectively lifts the sandbox. Only add `allow-same-origin` if the embedded file is fully under your control.

The description iframe (Path B) has **no sandbox attribute** — it runs with the same privileges as the parent page because it is a trusted, same-origin file. If you embed untrusted third-party HTML this way, it can access `localStorage` and navigate the parent page.

#### 3. No `file://` support

Both embed paths require the site to be served over HTTP. Opening `index.html` directly as `file://` will cause the iframe `src` load to fail silently in most browsers.

#### 4. Auto-sizing only works for Path B

Path A (gallery slot) is sized by the `aspectRatio` column — the iframe is fixed at that ratio. It does not auto-resize.

Path B (description iframe) auto-resizes via `ResizeObserver`. If your content loads lazily (e.g. images that arrive after the initial render), the height may not adjust until the next content change. Force a resize by dispatching a `resize` event from inside the frame:

```js
// Inside your embedded HTML's script
window.dispatchEvent(new Event("resize"));
```

#### 5. No parent-frame navigation from inside the iframe (gallery slots)

With the default sandbox (`allow-scripts`), links inside gallery-slot iframes cannot navigate the parent page — `<a href="…">` clicks are intercepted by the sandbox. Add `allow-top-navigation-by-user-activation` to the `sandbox` column if you need links to work.

#### 6. `localStorage` is isolated

With `allow-scripts` only (no `allow-same-origin`), the iframe cannot read or write to the main page's `localStorage`. This means appStore data is not accessible from inside the embedded document. If your embed needs to react to the currently displayed concept, pass the concept ID as a query parameter in the `src`:

```
file=interactive/index.html?concept=C051
```

Then read it inside the iframe:
```js
const params = new URLSearchParams(location.search);
const conceptID = params.get("concept"); // "C051"
```

#### 7. Layout constraints for Path B

The description iframe is rendered inside `.concept-main`, which has a `max-width` and is part of a two-column grid (`.concept-page`). The iframe width is constrained by the description column — it will not span the full page. If you need full-width, use a `concept-scrolly` skin instead.

#### 8. Print and accessibility

Screen readers may not read iframe content by default. Add an accessible `title` attribute (done automatically for gallery slots from the `alt` column; set manually for description iframes by using a `<title>` element inside the embedded document).

---

---

# How-to guides

How-to guides are **task-oriented**. Each guide solves a specific real-world problem. They assume you know what you want to do.

---

## How to: Serve locally

Use any of these three options:

```bash
# Python (built-in)
python3 -m http.server 8000

# Node (npx)
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000`. The app auto-loads `data/conceptual_graph.xlsx` on path load.

---

## How to: Load a different data file

**Option A — Path input (HTTP only)**

1. In the loader card on the hero page, clear the path field and type the relative path to your file, e.g. `data/my_graph.xlsx`.
2. Click **Carregar por caminho**.

**Option B — File picker (works on `file://` too)**

1. Click **Trocar arquivo** in the top navigation bar (available on all pages).
2. Select any `.xlsx` or `.csv` file from your computer.
3. The graph and narratives are replaced immediately.

**Option C — URL parameter (advanced)**

Not yet supported via URL; all loading is user-initiated.

---

## How to: Format the spreadsheet

The app reads a single consolidated `.xlsx` file. The recognised tabs are:

| Tab name | Required | Purpose |
|---|---|---|
| `Concepts` | ✓ | One row per concept |
| `Relations` | ✓ | One row per directed edge |
| `Relation Types` | When using typed relations | Maps `relationTypeID` to names |
| `Narratives` | Optional | One row per narrative |
| `Elements` | With Narratives | One row per narrative element |
| `Media` | Optional | Images, videos, HTML embeds |
| `Narrative Skins` | Optional | Skin assignments per narrative |
| `Concept Skins` | Optional | Skin assignments per concept |
| `Templates` | Optional | Template metadata |
| `ConceptTexts` | Optional | POV texts per concept |

Full column definitions for each tab are in the [Spreadsheet format reference](#reference-spreadsheet-format).

**Header matching is flexible.** `conceptID`, `ConceptID`, `Concept_Id` are all equivalent. Leave optional columns empty — they are ignored.

---

## How to: Add media

Media items (images, videos, HTML embeds) are defined in the `Media` tab of the spreadsheet. Each row links one media item to a concept, narrative, or element.

**Minimum required columns:**

| column | value |
|---|---|
| `scope` | `concept`, `narrative`, or `element` |
| `scopeID` | e.g. `C051`, `N004`, `E025` |
| `type` | `image`, `video`, or `html` |
| `file` | filename relative to the asset folder, or a full URL |

**Image example:**
```
scope=concept  scopeID=C051  type=image  file=01.jpg  caption=Descrição da imagem
```
Place the file at `assets/concepts/C051/01.jpg`.

**YouTube video:**
```
scope=element  scopeID=E025  type=video  file=https://www.youtube.com/watch?v=XXXXXXXXXXX
```
The app automatically extracts the video ID and uses the YouTube nocookie embed URL.

**Local mp4:**
```
scope=element  scopeID=E025  type=video  file=video.mp4
```
Place the file at `assets/elements/E025/video.mp4`.

**HTML embed:**
```
scope=concept  scopeID=N004  type=html  file=interactive/index.html
aspectRatio=16:9  sandbox=allow-scripts allow-same-origin
```
Place the file at `assets/concepts/N004/interactive/index.html`.

Multiple media items for the same scope+ID appear as a thumbnail strip gallery. Sort order is controlled by the `order` column (integer, ascending).

---

## How to: Create a skin asset pack

A skin asset pack is a folder under `assets/skins/` that provides visual resources for a narrative, element, or concept.

**Folder naming:**
```
assets/skins/N004/          ← narrative-level pack
assets/skins/N004/E025/     ← element-level pack (inherits narrative bg)
assets/skins/C051/          ← concept-level pack
```

**File naming — automatic slots:**

| Filename | Slot | Description |
|---|---|---|
| `bg.jpg` (or `.png`, `.webp`, …) | `bg` | Background image for the skin |
| `1.jpg`, `2.jpg`, … | `1`, `2`, … | Numbered image slots (probed sequentially until a gap) |

**Named slots via `urls.txt`:**

Create a text file `urls.txt` in the folder. Each line is either:

```
# this is a comment

# Named entry — any slot name:
more: more.html
poster: https://cdn.example.com/thumb.jpg

# Positional entry — must be a full https:// URL:
https://example.com/image.jpg
```

- **Named entries** with a relative path are resolved against the folder. Named entries with `https://`, `//`, or `/` are used as-is.
- **Positional entries** (bare `https://` URLs) fill numbered slots not already occupied by local files.
- Local files always take precedence over `urls.txt` entries of the same name.

---

## How to: Add a "Para saber mais" overlay to a narrative

The scrolly and concept-scrolly skins display a **"Para saber mais"** button when the reader reaches the last panel. It opens an overlay iframe with supplementary content.

**Step 1 — Create the more page**

Create `assets/skins/<narrativeID>/more.html`. The file should use the site's dark colour palette. Use CSS custom properties that inherit from `default.css`:

```css
:root {
  --doc-bg:    var(--bg,     #080b0e);
  --doc-paper: var(--paper,  #10151b);
  --doc-ink:   var(--ink,    #f4efe6);
  --doc-accent: var(--accent, #f0a33a);
}
body { background: var(--doc-bg); color: var(--doc-ink); }
```

The app injects `default.css` into the iframe at load time so all site CSS variables are available.

**Step 2 — Register it in `urls.txt`**

Create or edit `assets/skins/<narrativeID>/urls.txt`:

```
more: more.html
```

**Step 3 — Verify**

Scroll to the last panel of the narrative. The **"Para saber mais"** and **"Sair"** buttons should appear below the text column. "Para saber mais" opens the overlay; "Sair" minimises the narrative to PiP and flashes the app sidebar.

---

## How to: Switch skins

**For narratives:** use the skin `<select>` dropdown in either the narrative top bar (`nSkinSelect`) or the main top navigation bar (`topSkinSelect`). Selecting a different skin triggers a hash-based navigation that reloads the narrative with the new skin parameter.

**For concepts:** use the `<select>` labelled **Skin do conceito** at the top of the concept page, or append `?skin=<skinID>` to the concept URL.

**Via URL directly:**
```
#/concept/C051?skin=concept-scrolly
#/narrative/N004?skin=S002
```

---

## How to: Deploy to Firebase Hosting

ARC21 sites deploy to Firebase Hosting. Replace `YOUR_PROJECT_ID` with your own Firebase project ID throughout.

**Manual deploy (from your machine):**

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Authenticate: `firebase login`
3. From the project root: `firebase deploy --only hosting --project YOUR_PROJECT_ID`

**GitHub Actions CI/CD** (`.github/workflows/firebase-hosting-merge.yml`) runs on every push to `main`. It requires the repository secret `FIREBASE_SERVICE_ACCOUNT_YOUR_PROJECT_ID`. To set it up:

1. Firebase Console → your project → **Project settings** → **Service accounts**
2. Click **Generate new private key** — download the JSON
3. In GitHub → repo **Settings** → **Secrets and variables** → **Actions** → add a secret with the full JSON content

Pull request previews are deployed to a temporary channel via `.github/workflows/firebase-hosting-pull-request.yml`.

---

---

# Reference

Reference material is **information-dense and lookup-oriented**. Use it when you already know what you are looking for.

---

## Reference: URL routing

The app is a single-page application. All routes are encoded in the URL hash.

| Hash pattern | What it renders |
|---|---|
| `#/` or `#` (empty) | Hero page |
| `#/concept/<slugOrID>` | Concept page (`concept-default` or configured skin) |
| `#/concept/<slugOrID>?skin=<skinID>` | Concept page with explicit skin |
| `#/narrative/<narrativeID>` | Narrative start cover (linear skin default) |
| `#/narrative/<narrativeID>?skin=<skinID>` | Narrative start with explicit skin |
| `#/narrative/<narrativeID>/element/<elementID>` | Narrative element page (linear skin) |
| `#/narrative/<narrativeID>/element/<elementID>?skin=<skinID>` | Element page with explicit skin |

**Concept URL resolution:** `#/concept/C051` and `#/concept/infancia-algoritmica` both resolve to the same concept. ID-based URLs are preferred because they survive label changes.

**`?skin=` parameter** accepts either a skin implementation ID (`scrolly`, `linear`, `concept-default`, `concept-scrolly`) or a skin record ID from the `Narrative Skins` / `Concept Skins` tabs of the spreadsheet (e.g. `S002`).

---

## Reference: Spreadsheet format

### Tab `Concepts` (required)

| Column | Required | Notes |
|---|---|---|
| `conceptID` | ✓ | Stable ID, e.g. `C051`. Case-insensitive on read. |
| `ConceptLabel` | ✓ | Human-readable name |
| `description` | | May contain `[[ID]]` or `[[Label]]` wikilinks |
| `sourceUrl` | | URL of the source post/article |
| `imagePath` | | Relative path to a local image or an https:// URL |
| `sourceTitle` | | Title of the source |

### Tab `Relations` (required)

**Legacy format:**

| Column | Notes |
|---|---|
| `ConceptId` | Source concept ID |
| `relationName` | Free-text relation label |
| `relatedConcept` | Target concept ID or label |
| `explanation` | Why these concepts are related |

**Normalised format (preferred):**

| Column | Notes |
|---|---|
| `ConceptId` (or `source`) | Source concept ID |
| `relationTypeID` | References `Relation Types.relationID` |
| `relatedConcept` (or `target`) | Target concept ID or label |
| `explanation` | Why these concepts are related |

### Tab `Relation Types` (required with normalised Relations)

| Column | Notes |
|---|---|
| `relationID` | Stable ID, e.g. `R001` |
| `relationType` | Human-readable label |
| `category` | Optional grouping label |
| `description` | Optional description of the relation type |

### Tab `Narratives` (optional)

| Column | Required | Notes |
|---|---|---|
| `narrativeID` | ✓ | e.g. `N004` |
| `narrativeTitle` | ✓ | Display name |
| `narrativeStart` | | First element ID; defaults to first in `elements` |
| `narrativeSummary` | | Shown on the start cover |
| `elements` | ✓ | Comma-separated ordered list of element IDs |
| `subtitle` | | Subtitle shown in some skins |
| `eyebrow` | | Small label shown above the title |
| `year` | | Year string |
| `outroQuote` | | Closing quote text |
| `outroMeta` | | Attribution for the closing quote |
| `skin` | | Default skin ID (overridden by `Narrative Skins` tab) |
| `hidden` | | `TRUE` to hide from the sidebar list |

### Tab `Elements` (required with Narratives)

| Column | Required | Notes |
|---|---|---|
| `elementID` | ✓ | e.g. `E025` |
| `elementTitle` | ✓ | Chapter title |
| `elementContent` | | Rich text body; supports `[[wikilinks]]` |
| `referencedConceptIDs` | | Comma-separated concept IDs shown as related links |

### Tab `Media` (optional)

| Column | Required | Notes |
|---|---|---|
| `scope` | ✓ | `concept`, `narrative`, or `element` |
| `scopeID` | ✓ | e.g. `C051`, `N004`, `E025` |
| `type` | | `image` (default), `video`, or `html` |
| `file` | | Filename or https:// URL |
| `order` | | Integer sort key (ascending) |
| `caption` | | Caption text |
| `sourceUrl` | | URL for the "Abrir post original" link |
| `sourceTitle` | | Label for the source link |
| `alt` | | Accessible alt text |
| `aspectRatio` | | e.g. `16:9`, `4:3` (default `16:9` for video/html) |
| `poster` | | Thumbnail file for video slots |
| `sandbox` | | CSP sandbox string for `html` type (default: `allow-scripts`) |

### Tab `Narrative Skins` (optional)

| Column | Required | Notes |
|---|---|---|
| `skinID` | ✓ | e.g. `S002` |
| `narrativeID` | ✓ | Links to `Narratives.narrativeID` |
| `skinName` | | Display label in the skin selector |
| `isDefault` | | `TRUE` to make this the default skin for that narrative |
| `templateID` | | Links to `Templates.templateID`; determines scrolly vs. linear |
| `parameters` | | Semicolon-separated `key=value` pairs |
| `coverImage` | | Optional cover image path |
| `tags` | | Comma-separated tags |

### Tab `Concept Skins` (optional)

| Column | Required | Notes |
|---|---|---|
| `skinID` | ✓ | e.g. `SK01` |
| `conceptID` | ✓ | Links to `Concepts.conceptID` |
| `skinName` | | Display label |
| `skinImplID` | | Override the implementation ID (e.g. `concept-scrolly`) |
| `isDefault` | | `TRUE` for the default skin |
| `dataSourceType` | | `narrative` to use a narrative as data source |
| `dataSourceID` | | e.g. `N004` when `dataSourceType=narrative` |
| `parameters` | | Semicolon-separated `key=value` pairs |

### Tab `Templates` (optional)

| Column | Notes |
|---|---|
| `templateID` | Stable ID |
| `templateName` | If it contains "scrolly" or "rolagem", it maps to the scrolly skin |
| `appliesTo` | Comma-separated: `narrative`, `concept` |
| `isDefaultNarrative` | `TRUE` to make default for narratives |
| `isDefaultConcept` | `TRUE` to make default for concepts |
| `parameters` | Semicolon-separated `key=value` pairs |

### Tab `ConceptTexts` (optional)

| Column | Notes |
|---|---|
| `conceptID` | Links to `Concepts.conceptID` |
| `text` | Rich text body |
| `pov` | Point-of-view label |
| `author` | Author name |
| `style` | Style tag (free text) |
| `lang` | Language code, default `pt-BR` |
| `textVersion` | Version string |
| `isDefault` | `TRUE` for default POV text |
| `mediaScope` | Optional media scope override |

---

## Reference: Skin registry

**File:** `skins/index.json`

```jsonc
{
  "defaultSkin": "linear",            // used when no skin param present
  "defaultConceptSkin": "concept-default",
  "skins": [
    {
      "id": "linear",                 // implementation ID (matches folder name)
      "name": "Linear",               // display name in <select>
      "scope": ["narrative"],         // "narrative" | "concept" | both
      "dataContract": { "builtin": true }
    },
    {
      "id": "scrolly",
      "name": "Scrolly",
      "scope": ["narrative"],
      "dataContract": { "builtin": true }
    },
    {
      "id": "concept-default",
      "name": "Padrão",
      "scope": ["concept"],
      "dataContract": { "builtin": true }
    },
    {
      "id": "concept-scrolly",
      "name": "Scrolly",
      "scope": ["concept"],
      "dataContract": { "type": "narrative", "builtin": true }
    }
  ]
}
```

**`dataContract`** describes what data the skin reads from the spreadsheet. `{ "builtin": true }` means the skin uses the built-in appStore structures. Non-builtin contracts specify `sheet`, `keyColumn`, and `rowShape` to read a custom tab from the spreadsheet.

---

## Reference: Skin module API

Every skin is an ES module at `skins/<id>/<id>.js`. It must export a factory function named `create<PascalCaseId>Skin(ctx)` that returns a skin instance object.

**Factory name derivation:**
- `linear` → `createLinearSkin`
- `concept-scrolly` → `createConceptScrollySkin`
- `concept-default` → `createConceptDefaultSkin`

**Skin instance interface:**

*Narrative skins* must expose:
```js
{
  renderStart(narrativeID),           // renders the narrative start cover
  renderElement(narrativeID, elementID) // renders a single element
}
```

*Concept skins* must expose:
```js
{
  render(slug, skinParams)            // renders the full concept page
}
```

**The `ctx` object** (narrative skins) — passed by `app.js` via `_skinCtx()`:

| Property | Type | Description |
|---|---|---|
| `appStore` | Object | Live application state (graph, narratives, media, …) |
| `nContent()` | `() → Element` | Returns the `#nOverlayContent` div |
| `nScroller()` | `() → Element` | Returns the `#nOverlayScroller` div |
| `nEl()` | `() → Element` | Returns the `#narrativeOverlay` div |
| `openNarrativeOverlay(id, mode)` | Function | Opens the overlay full-screen |
| `minimizeNarrativeOverlay()` | Function | Collapses overlay to PiP card |
| `expandAppSidebar()` | Function | Expands collapsed sidebar |
| `flashAppSidebar()` | Function | Plays `app-sidebar-flash` animation on sidebar |
| `updateNavContext(concept)` | Function | Updates the breadcrumb trail |
| `loadHelpConfig()` | `() → Promise` | Loads `help-config.json` |
| `applyTooltips(root)` | Function | Applies tooltip attributes from helpConfig |
| `wireUpGallery(el)` | Function | Wires gallery interactivity |
| `buildGalleryHtml(scope, id, label)` | Function | Returns gallery HTML string |
| `renderNotFound(slug)` | Function | Renders a 404 page |
| `getNarrative(id)` | Function | Returns narrative object from narrativeStore |
| `renderConceptIndex(fragment, slug)` | Function | Populates sidebar concept list |
| `loadSkinAssets(scope, id)` | `async Function` | Discovers asset URLs for a scope/ID |
| `getMediaFor(scope, id)` | Function | Returns sorted media items from mediaStore |
| `mediaFilePath(scope, id, item)` | Function | Resolves a media item to a URL |
| `renderLinearStart(id)` | `async Function` | Activates linear skin and renders start |

**The `ctx` object** (concept skins) — passed via `_conceptSkinCtx()`:

| Property | Type | Description |
|---|---|---|
| `appStore` | Object | Live application state |
| `renderConceptIndex(fragment, slug)` | Function | Populates sidebar concept list |
| `buildGalleryHtml(scope, id, label)` | Function | Returns gallery HTML string |
| `wireUpGallery(el)` | Function | Wires gallery interactivity |
| `loadHelpConfig()` | `() → Promise` | Loads help config |
| `applyTooltips(root)` | Function | Applies tooltip attributes |
| `t(key, fallback)` | Function | i18n string lookup |
| `applyI18n(root)` | Function | Applies all `data-i18n` attributes |

---

## Reference: Asset discovery

**Function:** `loadSkinAssets(scope, id)` in `js/skin/loader.js`

- `scope` — `"narrative"` | `"element"` | `"concept"`
- `id` — for elements, pass `"N002/E007"`; for others, the ID directly

**Returns:** `Promise<{ [slotID]: url }>` — a plain object mapping slot names to resolved URL strings.

**Discovery order:**

1. **`bg` slot** — probes `bg.jpg`, `bg.jpeg`, `bg.png`, `bg.webp`, `bg.gif`, `bg.svg` in the asset folder.
2. **Numbered slots** (`1`, `2`, `3`, …) — probes `1.jpg` (all extensions), then `2.jpg`, etc. Stops at the first missing number. Hard cap: 30.
3. **`urls.txt`** — reads named and positional entries (see below).
4. **Narrative-level `bg` fallback** (elements only) — if the element folder has no `bg`, the parent narrative folder is checked for one.

**SPA rewrite guard:** `probeFile` sends a `HEAD` request and rejects responses with `Content-Type: text/html` (Firebase / Netlify fallback pages). This prevents ghost "found" results for missing assets on SPA hosts.

**`urls.txt` format:**

```
# Lines starting with # are comments and are ignored.

# Named entry — slotName: path-or-url
# Relative path → resolved against this folder
more: more.html
# Absolute URL → used as-is
poster: https://cdn.example.com/thumb.jpg
# Root-relative path → used as-is
bg: /static/bg-override.jpg

# Positional entry — bare https:// URL fills the next numbered slot
https://example.com/image1.jpg
https://example.com/image2.jpg
```

**Precedence:** local files (numbered probing) always win over `urls.txt` entries of the same slot name.

---

## Reference: `appStore`

**Module:** `js/store.js`

```js
appStore = {
  graph:               null,   // built by buildGraph(); bySlug, order, idToSlug
  narrativeStore:      { byId: {}, order: [], elementsById: {}, loadedAt: "" },
  mediaStore:          {},     // keyed by "scope:SCOPEID"
  templatesStore:      {},     // keyed by templateID
  narrativeSkinsStore: {},     // keyed by narrativeID → array of skin entries
  conceptSkinsStore:   {},     // keyed by conceptID  → array of skin entries
  conceptTextsStore:   {},     // keyed by conceptID  → array of text entries
  skinDataStore:       {},     // keyed by contract type → keyed by ID
  currentConceptSlug:  null,
  helpConfig:          null,   // loaded from help-config.json + DEFAULT_HELP_CONFIG
  helpConfigPromise:   null
}
```

**Storage keys** (`SK` object):

| Key | localStorage key | Content |
|---|---|---|
| `SK.data` | `conceptGraph.data.v4` | Serialised graph |
| `SK.history` | `conceptGraph.history.v1` | Navigation history |
| `SK.previous` | `conceptGraph.previousConcept.v1` | Last visited concept slug |
| `SK.narratives` | `conceptGraph.narratives.v1` | Serialised narrative store |
| `SK.media` | `conceptGraph.media.v1` | Serialised media store |
| `SK.templates` | `conceptGraph.templates.v1` | Serialised templates |
| `SK.skins` | `conceptGraph.narrativeSkins.v1` | Narrative skin assignments |
| `SK.conceptSkins` | `conceptGraph.conceptSkins.v1` | Concept skin assignments |
| `SK.conceptTexts` | `conceptGraph.conceptTexts.v1` | Concept POV texts |
| `SK.skinData` | `conceptGraph.skinData.v1` | Generic contract-driven data |

**Locale scoping:** when the active locale is not `pt-BR`, `localeSK(locale)` returns scoped keys (e.g. `conceptGraph.data.v4.en`). This allows the same browser to store graphs in multiple languages without collision.

---

## Reference: CSS design tokens

Defined in `default.css` on `:root`. All skins and the `more.html` overlay inherit these.

| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#080b0e` | Page background (darkest) |
| `--paper` | `#10151b` | Card / panel background |
| `--panel` | `#131820` | Slightly lighter panel |
| `--ink` | `#f4efe6` | Primary text |
| `--ink-strong` | `#ffffff` | Headings / emphasis |
| `--muted` | `#a69d91` | Secondary / dim text |
| `--accent` | `#f0a33a` | Amber accent (links, highlights) |
| `--accent-dim` | `rgba(240,163,58,.18)` | Faint amber fill |
| `--line` | `rgba(240,163,58,.18)` | Border colour |
| `--font-body` | `"Inter"` | Body text |
| `--font-heading` | `"IBM Plex Sans"` | Headings |
| `--font-mono` | `"IBM Plex Mono"` | Code / labels |

**Animation classes:**

| Class | Effect |
|---|---|
| `app-sidebar-flash` | Pulses the app sidebar with an amber glow (`@keyframes app-sidebar-flash` in `default.css`) |
| `scrolly-sidebar-flash` | Pulses the scrolly sidebar overlay (`scrolly.css` / `concept-scrolly.css`) |

---

## Reference: Module dependency graph

```
index.html
  └── app.js
        ├── js/utils.js
        ├── js/store.js
        ├── js/i18n.js
        ├── js/parse/csv.js
        ├── js/parse/xlsx.js
        ├── js/parse/workbook.js
        │     ├── js/parse/xlsx.js
        │     └── js/utils.js
        ├── js/graph/builder.js
        │     └── js/utils.js
        ├── js/graph/navigation.js
        │     ├── js/store.js
        │     └── js/utils.js
        ├── js/render/content.js
        ├── js/skin/loader.js          ← lazy-loads skin modules below
        │     └── (dynamic imports)
        │           ├── skins/linear/linear.js
        │           ├── skins/scrolly/scrolly.js
        │           ├── skins/concept-default/concept-default.js
        │           └── skins/concept-scrolly/concept-scrolly.js
        └── js/i18n.js
```

All inter-module imports use a `?v=N` cache-busting suffix (currently `?v=10`), kept in sync with `ARC21_VERSION` in `js/version.js`. There is no build step — the browser resolves native ES modules directly.

---

---

# Explanation

Explanation material is **understanding-oriented**. It illuminates *why* the system works the way it does.

---

## Explanation: Architecture overview

Infância Algorítmica V6 is a **zero-build, zero-dependency SPA** (single-page application). The entire application runs in a single browser tab from a flat folder of static files:

```
index.html          ← shell HTML; contains templates and the overlay
default.css         ← global design tokens and layout
app.js              ← main ES module, ~1 900 lines; orchestrates everything
js/                 ← utility and domain modules
skins/              ← lazy-loaded skin modules + their CSS
assets/             ← images, skin asset packs, more.html pages
data/               ← conceptual_graph.xlsx
```

**There is no bundler, no transpiler, no framework.** The browser loads `app.js` as an ES module; `app.js` uses native dynamic `import()` to lazy-load skin modules on demand. This keeps the initial load fast and the code auditable without tooling.

**Routing is hash-based.** Every navigation is a `location.hash` change. The single `hashchange` listener in `app.js` dispatches to the correct renderer. Because hashes are client-side only, the Firebase hosting SPA rewrite rule (`"source": "**"` → `/index.html`) handles direct URL access without exposing a 404.

**State is stored in `localStorage`.** When the user loads a spreadsheet, the parsed graph, narratives, media, and skin assignments are serialised to `localStorage`. On the next visit, the app hydrates from storage before the user does anything. This makes the app work offline after the first load.

**Cache-busting** uses `?v=N` query suffixes on all module imports and stylesheet links, with `N` centralized as `ARC21_VERSION` in `js/version.js` (currently 10). Static `import` specifiers must be string literals, so bumping the version means updating `ARC21_VERSION` and find/replacing `?v=<old>` → `?v=<new>` across `app.js`, `js/**/*.js`, `index.html`, and `mgmt.html` — `js/skin/loader.js` builds its skin-asset paths at runtime from `ARC21_VERSION` directly and needs no edit. Minor updates within a version are handled by Firebase's `Cache-Control: public, max-age=3600` headers.

---

## Explanation: The graph model

The graph is an **in-memory directed multigraph** built from the spreadsheet's `Concepts` and `Relations` tabs by `js/graph/builder.js`.

**Slugs vs IDs:**

Every concept has two handles:
- **Slug** — a URL-safe, lowercase, diacritic-stripped string derived from the label (e.g. `infancia-algoritmica`). Slugs are volatile: renaming a concept changes its slug.
- **ID** — a stable, human-assigned string from the spreadsheet (e.g. `C051`). IDs never change once published.

The graph object stores:
- `bySlug` — the primary lookup table
- `idToSlug` — maps `C051` → `infancia-algoritmica` for redirect resolution
- `order` — insertion order array of slugs

Concept URLs prefer the ID form (`#/concept/C051`) so links survive label changes. The router calls `resolveConceptSlug(token)` which tries a direct slug match first, then an ID lookup.

**Wikilinks** inside description and element text use `[[ID]]` or `[[Label]]` syntax. `resolveConceptSlug(slugify(target))` resolves both forms to the same page.

**Relations** are stored on the source concept as an array:
```js
{ target, targetSlug, targetConceptID, relationTypeID, relationName,
  relationCategory, relationTypeDescription, explanation }
```

The graph is not bidirectional by default — only outgoing relations are stored. The concept page renders all outgoing relations as a list.

---

## Explanation: The narrative model

A **narrative** is an ordered sequence of **elements** (chapters) with associated metadata.

**Overlay states:**

The narrative overlay (`#narrativeOverlay`) has three CSS states managed by class:

| Class | State | Description |
|---|---|---|
| *(none)* | `hidden` | Overlay is invisible |
| `is-pip` | `pip` | Collapsed to a picture-in-picture card (bottom-right) |
| `is-full` | `full` | Full-screen panel |

State transitions:
- `openNarrativeOverlay(id, mode)` → `full`
- `minimizeNarrativeOverlay()` → `pip`
- `maximizeNarrativeOverlay()` → `full`
- `closeNarrativeOverlay()` → `hidden`

The PiP card is **draggable** via mouse and touch events on `#nOverlayDrag`. Its position is constrained to stay within the viewport.

**End-of-narrative actions:**

When the reader reaches the last panel, skins call:
1. `minimizeNarrativeOverlay()` — collapses to PiP
2. `expandAppSidebar()` — opens the collapsed sidebar (if closed)
3. (150 ms delay) `flashAppSidebar()` — plays the amber pulse animation to draw attention to the concept index / narrative list

**Skin resolution priority** for narratives:
1. `?skin=` URL parameter (skinID or impl ID)
2. `narrativeSkinsStore` default for this narrative ID
3. `narrative.skin` column (legacy, single-value)
4. `skins/index.json` `defaultSkin`
5. Hardcoded fallback: `"linear"`

---

## Explanation: The skin system

The skin system answers one question: *how do you swap the entire visual presentation of a concept or narrative without reloading the page?*

**The answer is lazy-loaded ES modules + a shared context object.**

When `app.js` needs to render a concept with skin `concept-scrolly`, it calls:

```js
const instance = await getSkinInstance("concept-scrolly", ctx);
instance.render(slug, skinParams);
```

`getSkinInstance` does a dynamic `import("../../skins/concept-scrolly/concept-scrolly.js")`, derives the factory name (`createConceptScrollySkin`), calls it with `ctx`, caches the returned instance, and returns it. Subsequent calls return the cached instance immediately.

**Why a context object?**

Skins are isolated modules. They cannot import from `app.js` (that would create a circular dependency). Instead, `app.js` passes a `ctx` object that is a curated API surface: DOM accessors, state mutators, helper functions. Skins call `ctx.openNarrativeOverlay()` rather than knowing about `app.js` internals.

This also makes skins **testable in isolation**: you can instantiate a skin with a mock `ctx` without loading the full application.

**CSS injection:**

`ensureSkinCSS(skinID)` appends a `<link>` tag for `skins/<id>/<id>.css` the first time a skin is activated. The `<link>` is never removed — once a skin's CSS is loaded, it stays loaded. This is safe because each skin scopes its selectors with a `skin-<id>` body class, and `activateSkin(id)` replaces the body class atomically.

---

## Explanation: Data flow

From spreadsheet to rendered page:

```
User selects .xlsx file
  │
  ▼
loadFileAsArrayBuffer(file)         ← FileReader API
  │
  ▼
parseCombinedWorkbook(buffer)       ← js/parse/workbook.js
  │   unzips the XLSX, reads every sheet,
  │   validates required tabs/columns,
  │   returns { rows, narratives, media, templates,
  │             narrativeSkins, conceptSkins, … }
  │
  ▼
buildGraph(rows)                    ← js/graph/builder.js
  │   groups rows by concept label,
  │   builds bySlug / idToSlug indexes,
  │   auto-generates descriptions for concepts with none
  │
  ▼
saveStoredGraph(graph, key)         ← js/store.js → localStorage
saveStoredNarratives(…)
saveStoredMedia(…)
  … (all parsed data persisted)
  │
  ▼
appStore.graph = graph              ← live state updated
  │
  ▼
hashchange → renderConcept(slug)    ← app.js router
  │
  ▼
_resolveConceptSkin(conceptID)      ← checks conceptSkinsStore,
  │                                    then skins/index.json
  ▼
getSkinInstance(implID, ctx)        ← js/skin/loader.js
  │   dynamic import if not cached
  ▼
skin.render(slug, skinParams)       ← e.g. concept-default.js
  │   reads appStore.graph.bySlug[slug]
  │   reads appStore.mediaStore
  │   builds HTML string
  │   inserts into DOM
  ▼
wireUpGallery(host)                 ← app.js
  ← gallery thumbnail strip is interactive
```

**Key insight:** the parsing step and the rendering step are completely decoupled by `appStore`. The parser writes to `appStore`; the renderer reads from it. Neither knows about the other. This is why the same graph can be rendered by four different skins without re-parsing.
