# ARC21 Framework — Refactoring Instructions

This file is a self-contained guide for a Claude Code session whose sole task is
to perform the **framework / site separation** refactor. Read it fully before
touching any file.

---

## 1. What this refactor does

**Before:** Each site repo is a full copy of the framework code plus its own data and
assets. Updating the framework means manually editing every site.

**After:**
- `arc21-framework` holds all reusable code (JS modules, skins, generic CSS, build tools).
- Each site repo holds only what is site-specific: data, assets, palette CSS, Firebase
  config, and a `sync.py` script that pulls framework updates.
- A `framework.lock` file in each site records which framework commit it was last synced
  to.
- GitHub Actions in the framework repo notify each registered site when the framework is
  updated.

---

## 2. Repo locations (local disk)

```
/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/

  ARC21 framework/          ← this repo (arc21-framework, public)
  Infancia Algoritmica V6/  ← site repo (Infancia-Algoritmica-V6, private)
  ARC21 root/               ← site repo (ARC21-root, private)
```

GitHub remotes:
- `https://github.com/dschwabe/arc21-framework.git`
- `https://github.com/dschwabe/Infancia-Algoritmica-V6.git`
- `https://github.com/dschwabe/ARC21-root.git`

The local paths have spaces. Always quote them in shell commands.

---

## 3. Current file layout (what each repo actually contains today)

### Both site repos share these framework files (identical or near-identical):
```
app.js
build.py
default.css        ← framework styles + site palette tokens mixed together
help-config.json   ← may have site-specific tooltip overrides
index.html         ← site-specific <title> and meta, but framework templates
js/
  graph/
  parse/
  render/
  skin/
  store.js
  utils.js
skins/
  concept-default/
  concept-scrolly/
  linear/
  scrolly/
  index.json       ← site controls which skins are active
```

### V6-only files (not in ARC21 root):
```
js/i18n.js         ← i18n module (could be in framework if ARC21 root ever uses it)
i18n/pt-BR.json    ← SITE-SPECIFIC translation strings
translate.py       ← SITE-SPECIFIC translation helper script
firebase.json      ← SITE-SPECIFIC
```

### ARC21 root-only files (not in V6):
```
js/diagram/        ← UNKNOWN — check whether this is site-specific or framework
css/               ← empty folder (macOS artefact, ignore)
```

### Site-specific in both repos:
```
data/              ← XLSX content files
assets/            ← images, skin packs, concept images
docs/              ← site-specific documentation
```

---

## 4. What the framework repo should contain after this refactor

```
arc21-framework/
  CLAUDE.md              ← this file
  README.md              ← already exists
  .gitignore             ← already exists
  docs/                  ← already exists (developer-guide.md, etc.)

  ── NEW: framework code ──────────────────────────────────────────
  app.js                 ← copied from V6, no site-specific changes needed
  build.py               ← copied from V6
  default.css            ← GENERIC version (palette tokens set to neutral values)
  help-config.json       ← empty/minimal generic version

  js/
    graph/
    parse/
    render/
    skin/
    i18n.js              ← from V6 (generic i18n module)
    store.js
    utils.js

  skins/
    concept-default/
    concept-scrolly/
    linear/
    scrolly/
    index.json           ← reference/default registry (sites keep their own copy)

  ── NEW: example site ────────────────────────────────────────────
  example/
    README.md            ← "minimal demo site; shows how to use the framework"
    index.html           ← generic shell with placeholder title
    site.css             ← placeholder palette (copy of framework default tokens)
    data/
      conceptual_graph.xlsx   ← minimal demo XLSX (5-10 concepts, 1 narrative)
    assets/              ← a few placeholder images
    skins/
      index.json         ← minimal skin registry
    framework.lock       ← pinned to a known-good commit
    sync.py              ← same sync.py as site repos
```

---

## 5. What each site repo should contain after this refactor

```
[site-repo]/
  ── SITE-SPECIFIC (never overwritten by sync) ────────────────────
  index.html             ← site <title>, meta; loads default.css + site.css
  site.css               ← palette token overrides ONLY
  firebase.json          ← if applicable
  help-config.json       ← site-specific tooltip config
  skins/index.json       ← which skins this site enables
  i18n/                  ← translation files (V6 only)
  translate.py           ← V6 only
  data/
  assets/
  docs/
  README.md
  .gitignore
  sync.py                ← pulls framework updates into this repo
  framework.lock         ← records which framework commit was last synced

  ── FRAMEWORK FILES (overwritten by sync) ────────────────────────
  app.js
  build.py
  default.css            ← generic; palette overridden by site.css
  js/
  skins/                 ← skin folders only; skins/index.json is site-owned
```

---

## 6. Step-by-step instructions

Work through these steps in order. Do not skip ahead.

---

### Step 1 — Tag current state of both site repos

```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/Infancia Algoritmica V6"
git tag v1-pre-refactor
git push origin v1-pre-refactor

cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 root"
git tag v1-pre-refactor
git push origin v1-pre-refactor
```

### Step 2 — Create refactoring branches in both site repos

```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/Infancia Algoritmica V6"
git checkout -b refactor/framework-separation

cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 root"
git checkout -b refactor/framework-separation
```

All site changes in this refactor go on these branches. `main` is never touched.

---

### Step 3 — Investigate js/diagram/ in ARC21 root

Before copying anything to the framework, check what `js/diagram/` contains:

```bash
ls "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 root/js/diagram/"
```

- If it contains code specific to ARC21's hero diagram visualisation → it is
  **site-specific** and stays in the ARC21 root repo only (add `js/diagram` to
  SITE_OWNED in that site's `sync.py`).
- If it is a generic graph-drawing utility with no ARC21-specific content → it
  belongs in the framework.

Note your conclusion here before proceeding: _________________________

---

### Step 4 — Copy framework code into arc21-framework

Use V6 as the source of truth (it is more complete: has i18n.js, all four skins).

```bash
FRAMEWORK="/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 framework"
V6="/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/Infancia Algoritmica V6"

# Copy JS modules
cp -r "$V6/js/"          "$FRAMEWORK/js/"
cp    "$V6/app.js"       "$FRAMEWORK/app.js"
cp    "$V6/build.py"     "$FRAMEWORK/build.py"

# Copy skins (all four folders + index.json as reference)
cp -r "$V6/skins/"       "$FRAMEWORK/skins/"

# Copy help config as a minimal starting point
cp    "$V6/help-config.json"  "$FRAMEWORK/help-config.json"
```

Do **not** copy `default.css` yet — it needs to be genericised first (Step 5).
Do **not** copy `index.html` yet — the framework will have its own generic version.

---

### Step 5 — Create a generic default.css for the framework

Open V6's `default.css` and identify the `:root { }` block that defines CSS tokens
(variables like `--bg`, `--accent`, `--ink`, etc.).

The framework's `default.css` should contain **all the same structural rules and layout
CSS** as V6's version, but the palette token values in `:root` should be replaced with
neutral placeholders. Copy the file, then replace the token values:

```css
/* In arc21-framework/default.css — :root palette tokens */
:root {
  --bg:           #0d0d0d;     /* near-black; sites override with their palette */
  --paper:        #161616;
  --panel:        #1e1e1e;
  --ink:          #f0f0f0;
  --ink-strong:   #ffffff;
  --muted:        #999999;
  --accent:       #4488ff;     /* neutral blue placeholder */
  --accent-dim:   rgba(68,136,255,.15);
  --line:         rgba(68,136,255,.15);
  /* font stacks, spacing, layout rules remain unchanged from V6 */
}
```

Write this as `arc21-framework/default.css`.

---

### Step 6 — Create a generic index.html for the framework

The framework's `index.html` is the canonical reference template. It is not directly
used by sites (they keep their own `index.html`), but it shows exactly what the shell
should look like.

Copy V6's `index.html` to `arc21-framework/index.html` and make these changes:
- `<title>ARC21 Framework</title>`
- Add `<link rel="stylesheet" href="site.css">` immediately after the `default.css` link
  (sites load their palette override this way)
- Remove any V6-specific meta tags if present

---

### Step 7 — Extract site palettes into site.css for each site repo

#### V6

Open `Infancia Algoritmica V6/default.css`. Copy the `:root { }` token block (palette
variables only — `--bg`, `--paper`, `--ink`, `--accent`, etc.) into a new file:

```
Infancia Algoritmica V6/site.css
```

Content: just the `:root { }` block with V6's amber palette values, plus any other
V6-specific overrides. Example structure:

```css
/* site.css — Infância Algorítmica V6 palette */
:root {
  --bg:      #080b0e;
  --paper:   #10151b;
  --ink:     #f4efe6;
  --accent:  #f0a33a;
  /* … all other V6-specific token values … */
}
```

#### ARC21 root

Same process: copy the teal-mint palette tokens from `ARC21 root/default.css` into
`ARC21 root/site.css`.

---

### Step 8 — Update index.html in both site repos to load site.css

In each site's `index.html`, find the line that loads `default.css` and add
`site.css` immediately after it:

```html
<link rel="stylesheet" href="default.css">
<link rel="stylesheet" href="site.css">   ← add this line
```

---

### Step 9 — Create the example site in arc21-framework

```
arc21-framework/example/
  README.md
  index.html      ← copy arc21-framework/index.html, title = "ARC21 Example"
  site.css        ← copy arc21-framework/default.css :root block as-is (neutral palette)
  skins/
    index.json    ← minimal: defaultSkin "linear", skins: [linear, concept-default]
  data/
    conceptual_graph.xlsx   ← create or copy a minimal demo XLSX
  assets/         ← empty or a couple of placeholder images
  framework.lock  ← will be written by sync.py in Step 11
  sync.py         ← symlink or copy of the sync.py from Step 10
```

The demo XLSX needs at minimum: a `Concepts` tab with 5-10 rows and a `Relations`
tab. It can be copied from V6 and stripped down, or created from scratch.

---

### Step 10 — Write sync.py into each site repo (and the example)

Write the following file to:
- `Infancia Algoritmica V6/sync.py`
- `ARC21 root/sync.py`
- `arc21-framework/example/sync.py`

```python
#!/usr/bin/env python3
"""
sync.py  —  Pull framework updates from arc21-framework into this site.

Usage:
  python sync.py [path/to/arc21-framework]

If no path is given, the last-used path is read from framework.lock.
Run with --check to report whether the framework has updates without syncing.
"""

import os, shutil, json, subprocess, sys
from datetime import datetime, timezone

# ── Site-owned files and folders — never overwritten by sync ──────────────
# Edit this list if your site has additional site-specific items.
SITE_OWNED = {
    "data",            # XLSX content
    "assets",          # images, skin packs
    "docs",            # site documentation
    "site.css",        # palette + site overrides
    "firebase.json",   # Firebase hosting config
    "i18n",            # translation files (V6 only)
    "translate.py",    # translation script (V6 only)
    "help-config.json",# site-specific tooltip config
    "index.html",      # site shell (title, meta tags)
    "README.md",
    ".gitignore",
    "sync.py",
    "framework.lock",
    "CLAUDE.md",
    # skins/index.json is handled separately below
}

# Paths within copied directories that should not be overwritten
SUBPATH_OWNED = {
    os.path.join("skins", "index.json"),   # site controls its own skin registry
}


def git_head(path):
    r = subprocess.run(["git", "rev-parse", "HEAD"],
                       capture_output=True, text=True, cwd=path)
    return r.stdout.strip() if r.returncode == 0 else "unknown"


def git_log_oneline(path, ref):
    r = subprocess.run(["git", "log", "--oneline", "-1", ref],
                       capture_output=True, text=True, cwd=path)
    return r.stdout.strip() if r.returncode == 0 else ref


def copy_dir(src, dst):
    """Copy src directory to dst, respecting SUBPATH_OWNED."""
    os.makedirs(dst, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel_root = os.path.relpath(root, src)
        for fname in files:
            rel_file = os.path.normpath(os.path.join(rel_root, fname))
            # Check if this subpath is site-owned
            if rel_file in SUBPATH_OWNED:
                continue
            src_file = os.path.join(root, fname)
            dst_file = os.path.join(dst, rel_file)
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            shutil.copy2(src_file, dst_file)


def sync(framework_path, site_path="."):
    framework_path = os.path.abspath(framework_path)
    if not os.path.isdir(framework_path):
        sys.exit(f"Error: framework path not found:\n  {framework_path}")

    # Skip CLAUDE.md and docs/ from the framework — they are framework-internal
    framework_skip = {"CLAUDE.md", "docs", "example", ".git", ".github"}

    copied, skipped = [], []

    for name in sorted(os.listdir(framework_path)):
        if name.startswith(".") or name in SITE_OWNED or name in framework_skip:
            skipped.append(name)
            continue
        src = os.path.join(framework_path, name)
        dst = os.path.join(site_path, name)
        if os.path.isdir(src):
            copy_dir(src, dst)
        else:
            shutil.copy2(src, dst)
        copied.append(name)

    version = git_head(framework_path)
    lock = {
        "framework_version": version,
        "framework_commit_message": git_log_oneline(framework_path, version),
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "framework_path": framework_path,
    }
    with open(os.path.join(site_path, "framework.lock"), "w") as f:
        json.dump(lock, f, indent=2)
        f.write("\n")

    print(f"✓ Synced {len(copied)} items from arc21-framework @ {version[:8]}")
    print(f"  {lock['framework_commit_message']}")
    print(f"  Skipped (site-owned): {', '.join(sorted(skipped))}")
    print(f"  framework.lock updated.")


def check(site_path="."):
    lock_path = os.path.join(site_path, "framework.lock")
    if not os.path.exists(lock_path):
        print("⚠  No framework.lock — run sync.py first.")
        return
    with open(lock_path) as f:
        lock = json.load(f)
    framework_path = lock.get("framework_path", "")
    if not os.path.isdir(framework_path):
        print(f"⚠  framework_path in lock not found on this machine:")
        print(f"   {framework_path}")
        return
    current = git_head(framework_path)
    synced  = lock["framework_version"]
    if current == synced:
        print(f"✓  Up to date with arc21-framework @ {current[:8]}")
        print(f"   {lock.get('framework_commit_message', '')}")
    else:
        print(f"⚠  Framework has been updated since last sync.")
        print(f"   Synced:  {synced[:8]}  —  {lock.get('framework_commit_message','')}")
        print(f"            (synced {lock['synced_at']})")
        print(f"   Current: {current[:8]}  —  {git_log_oneline(framework_path, current)}")
        print(f"   Run:     python sync.py")


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--check" in args:
        args = [a for a in args if a != "--check"]
        lock_path = "framework.lock"
        fw_path = args[0] if args else (
            json.load(open(lock_path)).get("framework_path", "") if os.path.exists(lock_path) else ""
        )
        check(".")
        sys.exit(0)

    if args:
        sync(args[0])
    elif os.path.exists("framework.lock"):
        with open("framework.lock") as f:
            saved = json.load(f).get("framework_path", "")
        if saved:
            sync(saved)
        else:
            sys.exit("No framework_path in framework.lock. Pass the path explicitly.")
    else:
        framework_default = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "..", "ARC21 framework")
        if os.path.isdir(framework_default):
            sync(framework_default)
        else:
            sys.exit("Usage: python sync.py [path/to/arc21-framework]")
```

---

### Step 11 — Run sync on both site repos to generate framework.lock

```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/Infancia Algoritmica V6"
python sync.py "../ARC21 framework"

cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 root"
python sync.py "../ARC21 framework"
```

Check the output. `framework.lock` should now exist in each site repo.

---

### Step 12 — Test that both sites still serve correctly

For each site:
1. Start a local HTTP server in the site folder.
2. Open the site in a browser.
3. Verify: concepts load, navigation works, at least one narrative opens, concept
   images appear (for a concept that has assets).
4. Verify: the palette looks correct (V6 amber / ARC21 teal — not the neutral
   framework placeholder).

**V6:** `python3 -m http.server 8000` → `http://localhost:8000`
**ARC21 root:** `python3 -m http.server 8765` → `http://localhost:8765`

Do not proceed to Step 13 until both sites pass this check.

---

### Step 13 — Add dependents.json to arc21-framework

Create `arc21-framework/dependents.json`:

```json
{
  "sites": [
    {
      "repo": "dschwabe/Infancia-Algoritmica-V6",
      "name": "Infância Algorítmica V6"
    },
    {
      "repo": "dschwabe/ARC21-root",
      "name": "ARC21 Root"
    }
  ]
}
```

---

### Step 14 — Add GitHub Actions workflows

#### arc21-framework: notify dependents on push

Create `.github/workflows/notify-dependents.yml` in `arc21-framework`:

```yaml
name: Notify dependent sites
on:
  push:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Dispatch update event to each registered site
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.FRAMEWORK_NOTIFY_TOKEN }}
          script: |
            const fs = require('fs');
            const { sites } = JSON.parse(fs.readFileSync('dependents.json', 'utf8'));
            const msg = context.payload.head_commit.message.split('\n')[0];
            const sha = context.sha.slice(0, 8);
            for (const site of sites) {
              const [owner, repo] = site.repo.split('/');
              try {
                await github.rest.repos.createDispatchEvent({
                  owner, repo,
                  event_type: 'arc21-framework-updated',
                  client_payload: { sha, message: msg }
                });
                console.log(`Notified ${site.repo}`);
              } catch (e) {
                console.error(`Failed to notify ${site.repo}: ${e.message}`);
              }
            }
```

#### Each site repo: open an issue when notified

Create `.github/workflows/framework-update-alert.yml` in each site repo
(`Infancia Algoritmica V6` and `ARC21 root`):

```yaml
name: Framework update alert
on:
  repository_dispatch:
    types: [arc21-framework-updated]

jobs:
  open-issue:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const { sha, message } = context.payload.client_payload;
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo:  context.repo.repo,
              title: `Framework update available (${sha})`,
              body: [
                `**arc21-framework** was updated:`,
                `> ${message}`,
                ``,
                `To sync this site, run:`,
                `\`\`\`bash`,
                `python sync.py`,
                `\`\`\``,
                `Then review the changes, commit, and push.`,
                ``,
                `Close this issue once the sync commit is on \`main\`.`,
              ].join('\n'),
              labels: ['framework-update'],
            });
```

#### GitHub secret required

The `FRAMEWORK_NOTIFY_TOKEN` secret must be set in `arc21-framework`'s GitHub
repo settings. It must be a Personal Access Token (classic or fine-grained) with
`repo` scope on all three repos (since they're all owned by `dschwabe`).

To create it:
1. GitHub → Settings → Developer settings → Personal access tokens
2. Create token with `repo` scope
3. Go to `arc21-framework` repo → Settings → Secrets → Actions → New secret
4. Name: `FRAMEWORK_NOTIFY_TOKEN`, value: the token

Also create a label `framework-update` (blue, or any colour) in both site repos
so the workflow doesn't fail on a missing label:
```bash
gh label create "framework-update" --color "0075ca" --repo dschwabe/Infancia-Algoritmica-V6
gh label create "framework-update" --color "0075ca" --repo dschwabe/ARC21-root
```

---

### Step 15 — Update CLAUDE.md in each site repo

Replace the contents of each site repo's `CLAUDE.md` (create it if it doesn't
exist) with the appropriate site-specific version. See Section 7 below for the
exact content.

---

### Step 16 — Commit everything

#### arc21-framework
```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 framework"
git add .
git commit -m "Add framework code, sync tooling, and notification workflows"
git push
```

#### V6 (on refactor/framework-separation branch)
```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/Infancia Algoritmica V6"
git add .
git commit -m "Separate framework code from site-specific content"
git push -u origin refactor/framework-separation
```

#### ARC21 root (on refactor/framework-separation branch)
```bash
cd "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 root"
git add .
git commit -m "Separate framework code from site-specific content"
git push -u origin refactor/framework-separation
```

---

### Step 17 — Test sync round-trip

Make a trivial change to a framework file (e.g., add a comment to `app.js`),
commit and push it to `arc21-framework/main`. Then:

1. Verify a GitHub issue opens in both site repos (may take ~1 minute).
2. Run `python sync.py` in one of the site repos.
3. Verify `app.js` was updated and `framework.lock` shows the new commit hash.
4. Verify the site still works in the browser.

---

### Step 18 — Merge to main

When both sites pass testing on their `refactor/framework-separation` branches,
merge to `main` (use a PR or merge locally):

```bash
cd "[site-repo]"
git checkout main
git merge refactor/framework-separation
git push
```

---

## 7. CLAUDE.md content for site repos

After the refactor, each site repo should have its own `CLAUDE.md` with standing
instructions. Write the following files:

### Infancia Algoritmica V6/CLAUDE.md

```markdown
# Infância Algorítmica V6 — Project Instructions

## Framework separation

Framework code (app.js, js/, skins/ folders, build.py, default.css) lives in
the shared `arc21-framework` repo. Do not edit these files directly here — edits
will be overwritten the next time `sync.py` is run.

**If you need to fix a bug in a framework file:**
1. Make the fix in `arc21-framework` first.
2. Commit and push it there.
3. Run `python sync.py` in this repo to pull the fix in.
4. Commit the updated files here.

**If you must make an urgent fix directly in this repo** (before arc21-framework
can be updated), prefix the commit message with `[framework]` so it can be
found and replicated later:
  git commit -m "[framework] fix gallery keyboard nav"

## Site-specific files (safe to edit here)

  data/              XLSX content
  assets/            images, skin packs, concept images
  docs/              site documentation
  site.css           palette (amber: --accent #f0a33a)
  firebase.json      Firebase project arq21-73196
  help-config.json   tooltip overrides
  skins/index.json   which skins are active on this site
  i18n/              translation files (pt-BR)
  index.html         <title> and meta tags only; do not change the template
                     <template> blocks without also updating arc21-framework

## Key facts

  Language:         pt-BR
  Local dev port:   8000  →  python3 -m http.server 8000
  Firebase project: arq21-73196
  GitHub:           dschwabe/Infancia-Algoritmica-V6 (private)
  Framework docs:   https://github.com/dschwabe/arc21-framework

## Syncing framework updates

  python sync.py            # uses path saved in framework.lock
  python sync.py --check    # check if updates are available without syncing

## Concept images

Place images as assets/concepts/<ID>/1.jpg, 2.png, etc. (bare integers,
no zero-padding). No XLSX Media tab entry needed — discovered automatically.
```

### ARC21 root/CLAUDE.md

```markdown
# ARC21 Root — Project Instructions

## Framework separation

Framework code (app.js, js/, skins/ folders, build.py, default.css) lives in
the shared `arc21-framework` repo. Do not edit these files directly here — edits
will be overwritten the next time `sync.py` is run.

**If you need to fix a bug in a framework file:**
1. Make the fix in `arc21-framework` first.
2. Commit and push it there.
3. Run `python sync.py` in this repo to pull the fix in.
4. Commit the updated files here.

**If you must make an urgent fix directly in this repo** (before arc21-framework
can be updated), prefix the commit message with `[framework]` so it can be
found and replicated later:
  git commit -m "[framework] fix probeFile timeout"

## Site-specific files (safe to edit here)

  data/              XLSX content
  assets/            images, skin packs, concept images
  docs/              site documentation
  site.css           palette (teal-mint accent)
  help-config.json   tooltip overrides
  skins/index.json   which skins are active on this site
  index.html         <title> and meta tags only
  js/diagram/        ARC21-specific diagram module — NOT synced from framework

## Key facts

  Local dev port:   8765  →  python3 -m http.server 8765
  GitHub:           dschwabe/ARC21-root (private)
  Framework docs:   https://github.com/dschwabe/arc21-framework

## Syncing framework updates

  python sync.py            # uses path saved in framework.lock
  python sync.py --check    # check if updates are available without syncing

## Concept images

Place images as assets/concepts/<ID>/1.jpg, 2.png, etc. (bare integers,
no zero-padding). No XLSX Media tab entry needed — discovered automatically.
```

---

## 8. Decisions made in the design session (context for the refactoring session)

- `skins/index.json` is **site-owned**: the framework ships all skin folders but
  each site manages its own registry of active skins.
- `index.html` is **site-owned**: the framework provides a reference template, but
  sites keep their own `index.html` to control `<title>` and meta tags.
- `help-config.json` is **site-owned**: tooltip configs are site-specific.
- `default.css` is a **framework file** with generic/neutral token values. Each site
  overrides the palette in `site.css`, loaded after `default.css`.
- `js/diagram/` in ARC21 root is **presumed site-specific** (ARC21 hero diagrams)
  but should be confirmed in Step 3.
- `js/i18n.js` is a **framework file** (lives in the framework, synced to all sites;
  sites that don't use i18n simply don't call it).
- `i18n/*.json` translation files are **site-specific**.
- The `example/` folder in the framework is a minimal demo site, not a template to
  be copied — it shows developers how to wire things up.

---

## 9. Rollback

If anything goes wrong:

```bash
# Restore a site to pre-refactor state
git checkout main
git reset --hard v1-pre-refactor   # only if main was accidentally changed
# OR simply stay on main (which was never touched)
```

The `refactor/framework-separation` branches can be deleted without consequence.
The `v1-pre-refactor` tags are permanent and always available.
