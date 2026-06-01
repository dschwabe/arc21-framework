# Creating a new site

This guide explains how to create a new site that is powered by the ARC21 framework.

---

## Overview

Every ARC21 site is its own repository. It contains only site-specific content:
data, assets, palette CSS, and a shell HTML file. All reusable code lives in
`arc21-framework` and is pulled into the site via `sync.py`.

---

## Prerequisites

- Python 3 (for the local server and sync script)
- Git
- A GitHub account with access to `arc21-framework` (or a local clone of it)
- An `.xlsx` spreadsheet for your content (see [spreadsheet-format.md](spreadsheet-format.md))

---

## Step 1 — Create the site repo

```bash
mkdir my-site
cd my-site
git init
```

Or create a new repo on GitHub first and clone it.

---

## Step 2 — Copy the example site

The `example/` folder in `arc21-framework` is a minimal working site.
Copy it as your starting point:

```bash
cp -r /path/to/arc21-framework/example/. .
```

This gives you:

| File / folder | Purpose |
|---|---|
| `index.html` | Site shell — edit title and meta tags |
| `site.css` | Palette token overrides |
| `skins/index.json` | Which skins are active |
| `data/conceptual_graph.xlsx` | Demo graph — replace with your data |
| `assets/` | Placeholder images |
| `sync.py` | Pulls framework updates |

---

## Step 3 — Pull in the framework files

```bash
python sync.py /path/to/arc21-framework
```

This copies `app.js`, `js/`, `skins/` (skin folders), `build.py`, and `default.css`
into your site and writes `framework.lock` recording which framework commit you are on.

---

## Step 4 — Customise the site

### Palette — `site.css`

Replace the neutral placeholder values with your site's colour palette.
Every property is a CSS custom property that overrides `default.css`:

```css
/* site.css */
:root {
  --bg:          #080b0e;   /* page background */
  --paper:       #10151b;   /* card / panel background */
  --ink:         #f4efe6;   /* primary text */
  --ink-strong:  #ffffff;   /* headings, emphasis */
  --muted:       #7a6e62;   /* secondary text */
  --accent:      #f0a33a;   /* buttons, highlights */
  --accent-2:    #7a4f1e;   /* button gradient end */
  --accent-soft: rgba(240,163,58,.11); /* tinted backgrounds */
  --accent-glow: rgba(240,163,58,.55); /* glow effects */
  --accent-fg:   #11100d;   /* text on accent-coloured backgrounds */
  --link:        #ffbf66;   /* hyperlinks */
  --link-hover:  #ffe1aa;   /* hovered links */
  --line:        rgba(240,163,58,.14); /* subtle borders */
  --line-strong: rgba(240,163,58,.26); /* stronger borders */
  --danger:      #ff8a65;   /* error states */
  --ok:          #53a583;   /* success states */
}
```

See [css-tokens.md](css-tokens.md) for a full reference of every token.

### Title and meta — `index.html`

Change only `<title>` and any `<meta>` tags. Do not modify the `<template>` blocks
inside — those are framework-controlled and will be overwritten by sync.

### Data — `data/conceptual_graph.xlsx`

Replace the demo spreadsheet with your own. The required sheet structure is
described in [spreadsheet-format.md](spreadsheet-format.md).

### Site sheet — `data/conceptual_graph.xlsx` → **Site** tab

The Site sheet is a two-column key-value table (`Key`, `Value`). Its contents are
parsed on every XLSX load and stored in `localStorage` as `siteConfig`. Framework
features that read `siteConfig` include the hero diagram dispatcher.

| Key | Example value | Purpose |
|---|---|---|
| `hero.eyebrow` | `Teia conceitual navegável` | Small label above the hero title |
| `hero.lede` | `Uma teia de conceitos…` | Hero subtitle |
| `hero.root` | `C001` | conceptID of the diagram centre concept |
| `hero.diagram` | `nebulosa` | Hero diagram renderer (see below) |

**Hero diagram renderers** — set `hero.diagram` to one of:

- `nebulosa` — glowing circles (framework-curated; requires concepts with `level = nebulosa`)
- `infra` — radial spokes (framework-curated; requires relations with `relationCategory = infraestrutura`)
- *(omit)* — built-in generic radial diagram
- Any other name — loads `js/diagram/<name>.js` from the site; falls back to built-in if absent

To add a local renderer: create `js/diagram/myrenderer.js` (export `render(container, graph, siteConfig)`),
set `hero.diagram: myrenderer` in the Site sheet. No framework changes needed.

### Active skins — `skins/index.json`

```json
{
  "defaultSkin": "linear",
  "skins": [
    { "id": "linear",           "label": "Linear" },
    { "id": "concept-default",  "label": "Conceitos" }
  ]
}
```

Available skin IDs: `linear`, `scrolly`, `concept-default`, `concept-scrolly`.

---

## Step 5 — Test locally

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

---

## Step 6 — Register the site for framework update notifications

Add an entry to `arc21-framework/dependents.json`:

```json
{
  "sites": [
    { "repo": "github-username/my-site", "name": "My Site" }
  ]
}
```

Then add the GitHub Actions workflow to your site repo at
`.github/workflows/framework-update-alert.yml` (copy from either existing site repo).
When the framework is updated, a GitHub issue will be opened in your repo as a reminder
to run `python sync.py`.

---

## Keeping in sync with the framework

```bash
python sync.py                  # sync using the path saved in framework.lock
python sync.py --check          # check if updates are available without syncing
python sync.py /path/to/fw      # sync from an explicit path
```

After syncing, review the changes, commit them, and push.

---

## Site-owned files (never overwritten by sync)

```
data/               XLSX content
assets/             images, skin packs
site.css            palette
index.html          title and meta
help-config.json    tooltip overrides (create if needed)
skins/index.json    active skin registry
sync.py             sync script
framework.lock      pinned framework commit
README.md
.gitignore
CLAUDE.md           AI assistant instructions (create if desired)
```

---

## Public vs management HTML

Every ARC21 site ships two HTML entry points:

| File | URL | Purpose |
|------|-----|---------|
| `index.html` | `https://your-site.tld/` | **Public** — auto-loads the XLSX, no data management UI |
| `mgmt.html` | `https://your-site.tld/mgmt.html` | **Management** — full file-picker, narrative import, loader card |

Both are **site-owned** (never overwritten by sync) so you can customise the
`<title>` tag and any other meta. Firebase Hosting serves static files before
applying SPA rewrites, so no rewrite rule is needed for `mgmt.html`.

### What is removed from `index.html`

- "Trocar arquivo" topbar button and its hidden file input
- Narrative import dialog (`#narrativeImportDialog`)
- Hero loader card (manual XLSX/CSV file selection)
- Hero "Trocar arquivo de dados" button
- Data status `<div>`

`app.js` null-checks every management button, so removing them from the HTML
requires no JS changes.

### Customising the title

After your first sync copies `mgmt.html`, open it and update `<title>`:

```html
<!-- mgmt.html -->
<title>My Site — Gestão</title>
```
