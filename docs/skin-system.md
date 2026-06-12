# Skin System

Skins control the visual presentation and layout of narrative elements and
concept pages. Each skin is a self-contained folder with a CSS file and a
JavaScript module that exports a factory function.

---

## Folder layout

```
skins/
  index.json              ← skin registry
  linear/
    linear.css
    linear.js             ← exports createLinearSkin(ctx)
  concept-default/
    concept-default.css
    concept-default.js    ← exports createConceptDefaultSkin(ctx)
  my-skin/
    my-skin.css
    my-skin.js            ← exports createMySkinSkin(ctx)
```

---

## `skins/index.json`

Declares every available skin and sets the global default.

```json
{
  "defaultSkin": "linear",
  "defaultConceptSkin": "concept-default",
  "skins": [
    { "id": "linear",         "name": "Linear",         "scope": ["narrative"] },
    { "id": "scrolly",        "name": "Scrolly",        "scope": ["narrative"] },
    { "id": "concept-default","name": "Padrão",         "scope": ["concept"] },
    { "id": "concept-scrolly","name": "Scrolly",        "scope": ["concept"],
      "dataContract": { "type": "narrative" } },
    { "id": "scrolly-staged", "name": "Staged Scrolly", "scope": ["narrative", "concept"],
      "dataContract": { "type": "narrative" } }
  ]
}
```

### `scope`

Controls where a skin can be used and whether it appears in the skin switcher:

| Value | Appears in |
|-------|-----------|
| `"narrative"` | Narrative skin selector |
| `"concept"` | Concept skin switcher |
| `["narrative", "concept"]` | Both |

### `dataContract`

When `dataContract.type` is set, the skin requires a **Concept Skins** XLSX entry
with a matching `dataSourceID` to work. The skin switcher **only shows the option**
to a user when that concept has a configured entry for the skin. Without the entry,
the option is hidden to prevent errors.

---

## `locales` (optional, site-owned)

Sites with more than one language declare the extra locales in a top-level
`locales` array, instead of editing the framework's `js/i18n.js` (which is
overwritten by `sync.py`):

```json
{
  "defaultSkin": "linear",
  "skins": [ /* ... */ ],
  "locales": [
    { "code": "en", "label": "English" }
  ]
}
```

`code` must match the suffix used for `data/conceptual_graph.<code>.xlsx`
and `i18n/<code>.json`. The framework's built-in `pt-BR` locale is always
available and does not need to be listed. The language switcher stays
hidden when only one locale is available in total.

---

## Factory function convention

Every skin JS file must export a factory function named
`create{PascalCaseID}Skin`:

| Skin ID | Factory name |
|---------|-------------|
| `linear` | `createLinearSkin` |
| `concept-default` | `createConceptDefaultSkin` |
| `my-cool-skin` | `createMyCoolSkinSkin` |

The factory receives a `ctx` context object and returns an object with a
`render` method:

```js
export function createLinearSkin(ctx) {
  function render(narrativeID, elementID, skinParams) {
    // Build and insert DOM for this element
  }
  return { render };
}
```

---

## Context object (`ctx`)

`app.js` assembles a context object before passing it to the factory. Fields
vary slightly between narrative and concept skins; the core fields are:

| Field | Type | Description |
|-------|------|-------------|
| `appStore` | object | Live application state (graph, narrativeStore, …) |
| `buildGalleryHtml(scope, id, label, overrideItems?)` | fn → string | Render gallery HTML |
| `wireUpGallery(el)` | fn | Attach lightbox/carousel listeners |
| `loadSkinAssets(scope, id)` | fn → Promise | Probe filesystem for assets |
| `loadHelpConfig()` | fn → Promise | Lazy-load tooltip config |
| `applyTooltips(root)` | fn | Wire up tooltip triggers inside `root` |
| `renderConceptIndex(fragment, slug)` | fn | Populate sidebar (concept skins only) |
| `t(key, fallback?)` | fn → string | i18n helper |
| `applyI18n(fragment)` | fn | Translate `data-i18n` attributes in a fragment |

---

## Lifecycle

```
hash change
  → app.js resolves skin ID (URL param, XLSX assignment, or default)
  → getSkinInstance(skinID, ctx)   [js/skin/loader.js]
      → import("../../skins/{id}/{id}.js")   (lazy, cached)
      → calls factory once, caches the instance
  → skinInstance.render(...)
      → synchronous DOM build
      → async asset probe (loadSkinAssets) runs in background
```

`getSkinInstance` caches the instance in `_skinInstances`, so the factory is
called **once per skin per page load**. The `render` method may be called
multiple times (on navigation).

---

## CSS loading

`ensureSkinCSS(skinID)` appends a `<link>` tag for `skins/{id}/{id}.css` the
first time a skin is activated. Subsequent calls are no-ops (guarded by
`_skinCSSLoaded`). The body class `skin-{id}` is also set, allowing global
overrides from `default.css`.

---

## Skin parameters (`skinParams`)

`render` receives a `skinParams` object assembled by `app.js` from the URL and
the XLSX SkinData tab:

| Key | Source |
|-----|--------|
| `activeSkinID` | `?skin=` URL param or resolved default |
| `globalConceptSkins` | `skins/index.json` → `globalConceptSkins` |
| `[arbitrary keys]` | SkinData tab rows matching this skin |

Custom skin data (colours, layout toggles, etc.) should be declared in the
**SkinData** spreadsheet tab and accessed via `skinParams`.

---

## Adding a new narrative skin

1. Create `skins/my-skin/my-skin.js` exporting `createMySkinSkin(ctx)`.
2. Create `skins/my-skin/my-skin.css` with styles scoped to `.skin-my-skin`.
3. Register it in `skins/index.json`.
4. Assign it to a narrative in the **NarrativeSkins** spreadsheet tab, or set
   it as `defaultSkin`.

---

## Adding a new concept skin

Same steps as above, but:

- The factory receives the concept render context (includes `renderConceptIndex`).
- Set `scope` to include `"concept"` in `index.json`.
- If the skin requires external configuration (e.g. a `dataSourceID`), set
  `dataContract: { "type": "narrative" }`. The switcher will hide the option for
  concepts that have no matching entry in the **Concept Skins** sheet.

---

## Built-in skins

| ID | Scope | Purpose |
|----|-------|---------|
| `linear` | narrative | Default narrative skin; stacked text + media cards |
| `scrolly` | narrative | Scroll-driven narrative with parallax sections and slideshow |
| `concept-default` | concept | Default concept detail page |
| `concept-scrolly` | concept | Scrollytelling view of a concept, driven by a narrative (`dataSourceID` required) |
| `scrolly-staged` | narrative + concept | Sticky layered-stage scrollytelling with up to 11 composited PNG/SVG layers (`dataSourceID` required when used as a concept skin) |

### `scrolly-staged` asset slots

Place layer images in `assets/skins/<narrativeID>/` as numbered files:

| Slot | Layer role |
|------|-----------|
| `1` | Base room — normal blend, always visible |
| `2` | Soft interface dust |
| `3` | Recommendation halo |
| `4` | Gesture / data trails |
| `5` | Archive tile cloud |
| `6` | Camera frame overlay |
| `7` | Digital double |
| `8` | Metadata dots |
| `9` | Privacy membrane |
| `10` | Consent gap overlay |
| `11` | Inner drawings — final reveal (replaced by CTA if `more.png` is present) |

All layers except slot 1 use `mix-blend-mode: screen`. The default choreography
is tuned for a 3-element narrative; other element counts use linear interpolation.
See `skins/scrolly-staged/slots.json` for full notes.

### `scrolly-staged` end-of-narrative CTA widget

When the user reaches the last scene, an optional "Para saber mais" image widget
can replace slot 11. It is configured through two files in `assets/skins/<narrativeID>/`:

| File | Role |
|------|------|
| `more.png` (or `.jpg`, `.webp`) | Clickable image shown as the CTA widget. Discovered automatically by the asset probe. |
| `more.html` (or any URL in `urls.txt` as `more: <url>`) | Opened in a full-screen iframe overlay when the CTA is clicked. |

Both files are optional independently:
- Only `more.html` → standard "Para saber mais" button (no image widget; slot 11 plays normally).
- Both → image widget replaces slot 11; clicking opens `more.html` in iframe overlay.
- Neither → slot 11 (`innerDrawings`) plays as normal; no CTA.
