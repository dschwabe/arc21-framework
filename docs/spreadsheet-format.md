# Spreadsheet format

The app reads a single `.xlsx` file that may contain multiple named tabs. This page documents every tab and every column the parser recognises.

**Header matching is flexible:** column names are matched case-insensitively and underscore/space variants are equivalent. Use the canonical spellings listed here for new spreadsheets.

---

## Required tabs

### `Concepts`

One row per concept.

| Column | Required | Description |
|---|---|---|
| `conceptID` | Yes | Stable identifier, e.g. `C024`. Unique. Never changes even if the label is renamed. |
| `ConceptLabel` | Yes | Human-readable name displayed in the UI. |
| `description` | No | Long-form text. Supports `[[wikilinks]]` using either a label or an ID. |
| `sourceUrl` | No | Public URL associated with this concept. |
| `imagePath` | No | Legacy: relative path to an image. Prefer auto-discovery (see [asset-discovery.md](asset-discovery.md)). |
| `sourceTitle` | No | Display title for the `sourceUrl` link. |

### `Relations`

One row per directed relation. Two column formats are accepted.

**Legacy format:**

| Column | Required | Description |
|---|---|---|
| `ConceptId` | Yes | Source concept ID. |
| `relationName` | Yes | Relation label shown in the UI. |
| `relatedConcept` | Yes | Target concept ID. |
| `explanation` | No | Free-text explanation shown below the relation label. |

**Normalised format** (requires a `Relation Types` tab):

| Column | Required | Description |
|---|---|---|
| `ConceptId` | Yes | Source concept ID. |
| `relationTypeID` | Yes | ID from the `Relation Types` tab. |
| `relatedConcept` | Yes | Target concept ID. |
| `explanation` | No | Free-text explanation. |

The parser detects the format automatically from the presence of `relationTypeID`.

---

## Optional tabs

### `Relation Types`

Required when `Relations` uses the normalised format.

| Column | Description |
|---|---|
| `relationID` | Stable identifier matching `relationTypeID` values in `Relations`. |
| `relationType` | Human-readable label shown in the UI. |
| `category` | Optional grouping category. |
| `description` | Optional description of what this relation type means. |

---

### `Narratives`

Defines ordered narrative sequences. Requires `Elements` to also be present.

| Column | Required | Description |
|---|---|---|
| `narrativeID` | Yes | Stable identifier, e.g. `N001`. |
| `narrativeTitle` | Yes | Title shown in the sidebar and overlay bar. |
| `narrativeStart` | No | `elementID` of the first element in linear mode. Defaults to first in `elements`. |
| `narrativeSummary` | No | Short summary shown on the cover screen. |
| `elements` | Yes | Comma-separated ordered list of element IDs. |
| `subtitle` | No | Subtitle on the cover. |
| `eyebrow` | No | Small label above the title on the cover. |
| `year` | No | Year or date label on the cover. |
| `outroQuote` | No | Closing quote at the end of the narrative. |
| `outroMeta` | No | Attribution for `outroQuote`. |
| `skin` | No | Legacy skin hint (`scrolly` or `linear`). Prefer `Narrative Skins` tab. |
| `hidden` | No | `true` or `1` to hide this narrative from the sidebar. |

---

### `Elements`

Each row is one element (chapter) within a narrative.

| Column | Required | Description |
|---|---|---|
| `elementID` | Yes | Stable identifier, e.g. `E001`. |
| `elementTitle` | No | Chapter title. |
| `elementContent` | No | Full content text. Supports `[[wikilinks]]` and inline Markdown subset. |
| `referencedConceptIDs` | No | Comma-separated concept IDs — used to surface "Appears in narratives" links. |

---

### `Media`

> **Note for concept images:** The `Media` tab is **not required** for concept images. Place files at `assets/concepts/{ID}/1.png` (etc.) and they will be discovered automatically — no XLSX entry needed. See [asset-discovery.md](asset-discovery.md).
>
> Use the `Media` tab for: narrative/element media, video embeds, HTML embeds, explicit captions and source URLs, or when you need per-image metadata in a multi-image gallery.

One row per media item, grouped by `scope` + `scopeID`.

| Column | Required | Description |
|---|---|---|
| `scope` | Yes | `concept`, `narrative`, or `element`. |
| `scopeID` | Yes | ID of the concept, narrative, or element. |
| `type` | No | `image` (default), `video`, or `html`. |
| `file` | No | Relative filename or absolute URL. |
| `order` | No | Integer sort key, ascending. |
| `caption` | No | Caption text. |
| `sourceUrl` | No | Link to the original source. |
| `sourceTitle` | No | Display text for `sourceUrl`. |
| `alt` | No | Accessible alt text. |
| `aspectRatio` | No | e.g. `16/9` — sizes the media container. |
| `poster` | No | Poster image URL for video items. |
| `sandbox` | No | Sandbox attribute for HTML embed iframes (default: `allow-scripts`). |

---

### `Narrative Skins`

Assigns skins to narratives.

| Column | Description |
|---|---|
| `skinID` | Stable skin assignment ID (e.g. `S001`). |
| `narrativeID` | The narrative this assignment applies to. |
| `skinName` | Display name in the skin selector. |
| `isDefault` | `true`/`1` to make this the default skin for the narrative. |
| `templateID` | Links to `Templates.templateID`. Controls scrolly vs. linear layout. |
| `parameters` | Semicolon-separated `key=value` pairs passed as `skinParams`. |
| `coverImage` | Cover image path or URL for this skin variant. |
| `tags` | Comma-separated tags (informational). |

---

### `Concept Skins`

Assigns skins to individual concept pages.

| Column | Description |
|---|---|
| `skinID` | Stable skin assignment ID. |
| `conceptID` | The concept this assignment applies to. |
| `skinName` | Display name in the skin selector. |
| `skinImplID` | Skin implementation ID — must match an entry in `skins/index.json`. |
| `isDefault` | `true`/`1` for the default skin for this concept. |
| `dataSourceType` | e.g. `narrative` — tells the skin where to load content from. |
| `dataSourceID` | ID of the data source (e.g. a `narrativeID`). |
| `parameters` | Semicolon-separated `key=value` pairs. |

---

### `Templates`

Reusable display templates referenced by `Narrative Skins` and `Concept Skins`.

| Column | Description |
|---|---|
| `templateID` | Stable identifier. |
| `templateName` | Human-readable label. If it contains "scrolly" or "rolagem", maps to scrolly skin. |
| `appliesTo` | Comma-separated list: `narrative`, `concept`, or both. |
| `isDefaultNarrative` | `true`/`1` for the global default narrative template. |
| `isDefaultConcept` | `true`/`1` for the global default concept template. |
| `parameters` | Semicolon-separated default parameter pairs. |

---

### `ConceptTexts`

Multiple text variants (POVs) for a concept's description. When multiple rows share a `conceptID`, a POV-switcher button group appears on the concept page.

| Column | Description |
|---|---|
| `conceptID` | ID of the concept this text belongs to. |
| `text` | Full description text. Supports `[[wikilinks]]`. |
| `pov` | Short label for the POV button (e.g. `Technical`, `Social`). |
| `author` | Optional attribution. |
| `style` | Alternate button label used if `pov` is empty. |
| `lang` | BCP-47 language tag (default `pt-BR`). |
| `textVersion` | Version string (default `1`). |
| `isDefault` | `true`/`1` to show this POV first. |
| `mediaScope` | Optional scope override for media lookup. |

---

### `Site`

Key-value configuration pairs for site-level settings (supported by ARC21 Root).

| Key | Description |
|---|---|
| `hero.root` | Concept ID to use as the diagram root on the home screen. |
| `hero.diagram` | Hero diagram style (`nebulosa` or `infra`). |
