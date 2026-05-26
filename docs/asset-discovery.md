# Asset Discovery

ARC21 sites automatically probe the filesystem for image assets without requiring
any XLSX configuration. This lets you add visuals simply by dropping files in the
right folder.

---

## Folder conventions

| Scope | Folder pattern |
|-------|---------------|
| Concept | `assets/concepts/{CONCEPT_ID}/` |
| Narrative | `assets/skins/{NARRATIVE_ID}/` |
| Element | `assets/skins/{NARRATIVE_ID}/{ELEMENT_ID}/` |

IDs are **uppercase** (e.g. `C024`, `N002`, `N002/E007`).

---

## Numbered image slots

Place images named with bare integers — **no zero-padding**:

```
assets/concepts/C024/1.png
assets/concepts/C024/2.jpg
assets/concepts/C024/3.webp
```

The loader probes extensions in this order for each slot:
`jpg · jpeg · png · webp · gif · svg`

It stops at the first gap, so a missing `3.*` means `4.*` is never checked.
A hard cap of **30 slots** prevents runaway HTTP traffic.

---

## The `bg` slot (narratives and elements only)

A file named `bg.<ext>` becomes the background image for a narrative or element view.
Concepts do not use a `bg` slot.

**Element fallback**: if no `bg.*` is found in the element folder, the loader checks
the parent narrative folder (`assets/skins/{NARRATIVE_ID}/`) — both the file probe
and a `urls.txt` lookup.

---

## `urls.txt` — named and remote assets

Drop a `urls.txt` in any asset folder to register additional slots or point to
external URLs.

```
# Named slot — key: value
hero: https://cdn.example.com/hero.jpg
diagram: diagrams/overview.png    # relative path resolved against this folder

# Positional slot — fills the next unfilled numbered slot
https://cdn.example.com/photo.jpg
another-local.png
```

Rules:

- Lines starting with `#` are comments and are ignored.
- **Named entries** (`key: value`) use the key as the slot ID. A locally probed
  file wins over a `urls.txt` entry for the same slot.
- **Positional entries** fill numbered slots in order, skipping any already filled
  by filesystem probing.
- Paths that don't start with `https?://`, `//`, or `/` are treated as relative and
  resolved against the folder that contains the `urls.txt`.

---

## Firebase / SPA-rewrite safety

Static hosting platforms (Firebase Hosting, Netlify, Vercel, etc.) typically
redirect all unknown paths to `index.html` and return HTTP 200 with
`Content-Type: text/html`. Without a guard, this would make every probe appear
to succeed.

The loader rejects any 200 response whose `Content-Type` starts with `text/html`
— both in `probeFile()` HEAD requests and in the `urls.txt` fetch — so false
positives never enter the asset map.

---

## API reference — `loadSkinAssets(scope, id)`

Exported from `js/skin/loader.js`.

```js
const assets = await loadSkinAssets("concept", "C024");
// assets["1"] → "assets/concepts/C024/1.png"
// assets["2"] → "assets/concepts/C024/2.jpg"
```

| Parameter | Values |
|-----------|--------|
| `scope` | `"concept"` · `"narrative"` · `"element"` |
| `id` | Concept/narrative ID, or `"{NARRATIVE_ID}/{ELEMENT_ID}"` for elements |

Returns a plain object: `{ slotID: resolvedURL }`.

---

## How concept images reach the page

`concept-default.js` runs an async probe **after** the synchronous render
completes, so the page is never blocked:

```js
(async function () {
  var assets = await ctx.loadSkinAssets("concept", conceptID);
  var items = [];
  for (var n = 1; ; n++) {
    var url = assets[String(n)];
    if (!url) break;
    items.push({ src: url, alt: concept.concept || "",
                 caption: "", sourceUrl: "", sourceTitle: "" });
  }
  if (!items.length) return;          // nothing found — gallery stays empty
  var galleryHost = app.querySelector("#conceptGallery");
  if (!galleryHost) return;
  galleryHost.innerHTML = ctx.buildGalleryHtml("concept", conceptID,
                                               concept.concept, items);
  ctx.wireUpGallery(galleryHost);
})();
```

The fourth argument to `buildGalleryHtml` (`overrideItems`) bypasses the XLSX
Media store entirely, so **no Media tab is needed** in the spreadsheet for
concept images.

---

## Adding images — quick checklist

1. Name files with bare integers: `1.png`, `2.jpg`, …
2. Place them in the correct folder for the scope.
3. Reload the page — no spreadsheet edits required.
4. For external or non-standard names, add a `urls.txt` to the same folder.
