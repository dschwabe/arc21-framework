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
  "skins": [
    { "id": "linear",           "name": "Linear" },
    { "id": "scrolly",          "name": "Rolagem" },
    { "id": "concept-default",  "name": "Conceito padrão" }
  ],
  "globalConceptSkins": [
    { "id": "concept-default",  "name": "Padrão" }
  ]
}
```

`globalConceptSkins` lists skins available for every concept page. A per-concept
override can be set in the **ConceptSkins** spreadsheet tab.

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
- Register it under `globalConceptSkins` in `index.json` to make it available
  for all concepts, or assign it per-concept in the **ConceptSkins** tab.

---

## Built-in skins

| ID | Purpose |
|----|---------|
| `linear` | Default narrative skin; stacked text + media cards |
| `scrolly` | Scroll-driven narrative with parallax sections |
| `concept-default` | Default concept detail page |
