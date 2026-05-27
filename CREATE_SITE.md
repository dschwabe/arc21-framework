# ARC21 — Create a new site

This file is a self-contained guide for a Claude Code session whose sole task is
to scaffold a new ARC21 site. Read it fully before touching any file.

---

## How to use this guide

Open Claude Code in any working directory and say:
> "Follow CREATE_SITE.md to set up a new ARC21 site."

Claude Code will ask you four questions, then execute all steps automatically.

---

## Questions to ask the user before starting

Before running any commands, ask the user:

1. **Site name** — What is the display name of the new site?
   (e.g. "Memórias do Futuro")

2. **Target folder** — Where should the site be created?
   Provide an absolute path, e.g. `/Users/daniel/projects/memorias-do-futuro`.
   If the folder does not exist it will be created.

3. **Framework path** — Where is the `arc21-framework` repo on this machine?
   Default (relative to target): `../ARC21 framework`
   The user can confirm or provide a different path.

4. **Palette** — Which base palette should we start with?
   - **amber** (warm gold, like Infância Algorítmica V6)
   - **teal** (cool green, like ARC21 root)
   - **neutral** (framework defaults — edit site.css later)

Do not proceed until you have all four answers.

---

## Step 1 — Create and initialise the site folder

```bash
mkdir -p "<TARGET_FOLDER>"
cd "<TARGET_FOLDER>"
git init
```

---

## Step 2 — Copy the example site

```bash
cp -r "<FRAMEWORK_PATH>/example/." "<TARGET_FOLDER>/"
```

The example folder contains: `index.html`, `site.css`, `skins/index.json`,
`data/conceptual_graph.xlsx`, `assets/`, `sync.py`.

---

## Step 3 — Pull in all framework files

```bash
cd "<TARGET_FOLDER>"
python sync.py "<FRAMEWORK_PATH>"
```

Expected output: `✓ Synced 7 items from arc21-framework @ <hash>`

This copies `app.js`, `js/`, `skins/` (skin folders), `build.py`, `default.css`,
and writes `framework.lock`.

---

## Step 4 — Update index.html

In `<TARGET_FOLDER>/index.html`, change:
- `<title>` to the site name the user provided
- Any `<meta name="description">` content to match

Do not modify the `<template>` blocks or any script tags.

---

## Step 5 — Write site.css with the chosen palette

Replace the entire contents of `<TARGET_FOLDER>/site.css` with the palette
block below that matches the user's choice.

### amber palette

```css
/* site.css — <SITE_NAME> palette (amber) */
:root {
  --bg:          #080b0e;
  --paper:       #10151b;
  --panel:       rgba(16, 21, 27, 0.88);
  --panel-2:     rgba(13, 17, 22, 0.76);
  --panel-3:     rgba(10, 14, 18, 0.72);
  --ink:         #f4efe6;
  --ink-strong:  #fffdf8;
  --muted:       #7a6e62;
  --muted-2:     #b8a88e;
  --line:        rgba(240, 163, 58, 0.14);
  --line-strong: rgba(240, 163, 58, 0.26);
  --accent:      #f0a33a;
  --accent-2:    #7a4f1e;
  --accent-soft: rgba(240, 163, 58, 0.11);
  --accent-glow: rgba(240, 163, 58, 0.55);
  --accent-fg:   #11100d;
  --link:        #ffbf66;
  --link-hover:  #ffe1aa;
  --danger:      #ff8a65;
  --ok:          #53a583;
}
```

### teal palette

```css
/* site.css — <SITE_NAME> palette (teal) */
:root {
  --bg:          #050f0a;
  --paper:       #091610;
  --panel:       rgba(9, 22, 16, 0.88);
  --panel-2:     rgba(7, 18, 13, 0.76);
  --panel-3:     rgba(5, 13, 10, 0.72);
  --ink:         #98FFC6;
  --ink-strong:  #14a68c;
  --muted:       #0e7f6b;
  --muted-2:     #5db891;
  --line:        rgba(152, 255, 198, 0.14);
  --line-strong: rgba(152, 255, 198, 0.26);
  --accent:      #ecb586;
  --accent-2:    #7f6248;
  --accent-soft: rgba(224, 106, 124, 0.11);
  --accent-glow: rgba(236, 181, 134, 0.55);
  --accent-fg:   #0d0d0d;
  --link:        #c1946d;
  --link-hover:  #edb687;
  --danger:      #ff8a65;
  --ok:          #53a583;
}
```

### neutral palette

```css
/* site.css — <SITE_NAME> palette (neutral — edit to taste) */
:root {
  --bg:          #0d0d0d;
  --paper:       #161616;
  --panel:       rgba(22, 22, 22, 0.88);
  --panel-2:     rgba(18, 18, 18, 0.76);
  --panel-3:     rgba(14, 14, 14, 0.72);
  --ink:         #f0f0f0;
  --ink-strong:  #ffffff;
  --muted:       #999999;
  --muted-2:     #bbbbbb;
  --line:        rgba(68, 136, 255, 0.14);
  --line-strong: rgba(68, 136, 255, 0.26);
  --accent:      #4488ff;
  --accent-2:    #1a3a88;
  --accent-soft: rgba(68, 136, 255, 0.11);
  --accent-glow: rgba(68, 136, 255, 0.55);
  --accent-fg:   #0d0d0d;
  --link:        #7ab3ff;
  --link-hover:  #aaccff;
  --danger:      #ff8a65;
  --ok:          #53a583;
}
```

In all three cases, replace `<SITE_NAME>` in the comment with the actual site name.

---

## Step 6 — Create a minimal CLAUDE.md for the new site

Write `<TARGET_FOLDER>/CLAUDE.md` with site-specific instructions:

```markdown
# <SITE_NAME> — Project Instructions

## Framework separation

Framework code (app.js, js/, skins/ folders, build.py, default.css) lives in
the shared `arc21-framework` repo. Do not edit these files directly here — edits
will be overwritten the next time `sync.py` is run.

To fix a framework bug: make the fix in `arc21-framework` first, push it, then
run `python sync.py` here.

## Site-specific files (safe to edit here)

  data/              XLSX content
  assets/            images, skin packs, concept images
  site.css           palette overrides
  index.html         <title> and meta tags only
  help-config.json   tooltip overrides (create if needed)
  skins/index.json   which skins are active

## Local dev

  python3 -m http.server 8000   →   http://localhost:8000

## Syncing framework updates

  python sync.py            # uses path saved in framework.lock
  python sync.py --check    # check without syncing

## Concept images

Place images as assets/concepts/<ID>/1.jpg, 2.png, etc.
No spreadsheet entry needed — discovered automatically.
```

Replace `<SITE_NAME>` with the actual name.

---

## Step 7 — Create a .gitignore

Write `<TARGET_FOLDER>/.gitignore`:

```
.DS_Store
__pycache__/
*.pyc
*.bak
~$*
bundle.zip
```

---

## Step 8 — Make an initial commit

```bash
cd "<TARGET_FOLDER>"
git add .
git commit -m "Initial site scaffold from arc21-framework example"
```

---

## Step 9 — Register the new site in dependents.json (optional)

If the site has a GitHub repo, add it to `<FRAMEWORK_PATH>/dependents.json`:

```json
{ "repo": "github-username/repo-name", "name": "<SITE_NAME>" }
```

Then copy the GitHub Actions workflow from an existing site repo:

```bash
mkdir -p "<TARGET_FOLDER>/.github/workflows"
cp "<FRAMEWORK_PATH>/../Infancia Algoritmica V6/.github/workflows/framework-update-alert.yml" \
   "<TARGET_FOLDER>/.github/workflows/"
```

Commit the updated `dependents.json` in the framework repo separately.

---

## Step 10 — Verify

Start the server and confirm the site loads:

```bash
cd "<TARGET_FOLDER>"
python3 -m http.server 8000
```

Open `http://localhost:8000`. The demo graph from the example should load.
The palette should match the chosen colours (not the neutral framework blue).

Tell the user:
- Replace `data/conceptual_graph.xlsx` with their real spreadsheet
- See `docs/spreadsheet-format.md` in the framework repo for the required format
- See `docs/css-tokens.md` for the full palette token reference

---

## Summary of what was created

After completing all steps, report:
- Target folder path
- Framework commit synced (from framework.lock)
- Palette chosen
- Whether dependents.json was updated
