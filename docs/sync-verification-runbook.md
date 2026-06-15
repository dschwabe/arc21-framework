# Runbook — verify `sync.py` semantics before implementing extensibility

Goal: establish, by reading `sync.py` and running controlled tests, the facts the extensibility design (`framework-extensibility-design.md`) forks on. Do not assume — confirm. Fill in the report template at the end and hand it back.

## Safety first (non-negotiable on this setup)
The repos live in a Google Drive–synced folder. **Work on scratch copies on local disk**, never the live folders, so a mid-operation Drive sync can't corrupt the test or the real repos.

```bash
# adjust paths; quote them — they contain spaces
cp -R "/Volumes/Crucial X9/Google Drive dschwabe00@gmail.com/Hipertextos e LLMs/ARC21 framework" /tmp/arc21-fw
cp -R "/path/to/an/example/site-or-HyperTorah"                                                    /tmp/site-test
```

Run everything below against `/tmp/...`. If you must test in place, pause Drive sync first and back up.

---

## Q1 — What does `sync.py` copy, and how? (the central question)
Determine which copy model it uses:
- **(a) Overwrite-list** — copies a fixed enumerated set of files/dirs.
- **(b) Directory-replace** — deletes whole destination dirs (`rmtree`/`rm -rf`) then copies; site-added files inside those dirs are destroyed.
- **(c) Additive-merge** — copies framework files over, leaves unlisted destination files untouched.

```bash
grep -nE "rmtree|rm -rf|copytree|copy2|copyfile|shutil|glob|os.walk|ignore|exclude|dirs_exist_ok" /tmp/arc21-fw/sync.py
sed -n '1,250p' /tmp/arc21-fw/sync.py
```
Capture: the exact source→destination path list, whether it deletes before copying, and whether it globs dirs or names files.

## Q2 — Do site-added files inside a framework directory survive a sync?
The hero-diagram docs have sites add `js/diagram/<name>.js`. Test it, plus a candidate reserved namespace:

```bash
cd /tmp/site-test
mkdir -p js/diagram js/site
echo "// probe" > js/diagram/__probe__.js
echo "// probe" > js/site/__probe2__.js
python sync.py /tmp/arc21-fw
ls js/diagram/__probe__.js js/site/__probe2__.js 2>&1   # present = survives; "No such file" = clobbered
```
Result tells you directly whether a reserved site namespace already works or must be engineered.

## Q3 — How are "site-owned, never overwritten" files protected today?
`new-site.md` lists `data/`, `site.css`, `index.html`, `skins/index.json`, etc. as never overwritten. Find the mechanism — hardcoded skip list, `.syncignore`, or a naming/dir convention — since that is the seam the reserved-namespace change extends.

```bash
grep -nE "site\.css|skins/index|index\.html|data/|ignore|skip|exclude|keep|preserve" /tmp/arc21-fw/sync.py
ls -a /tmp/site-test | grep -iE "ignore|sync"
```

## Q4 — How does the framework discover and load skins?
Determines whether site-owned skins (design change 2) are feasible without forking the loader.

```bash
grep -rnE "skins/index\.json|loadSkin|registerSkin|skin|import.*skin" /tmp/arc21-fw/app.js /tmp/arc21-fw/js 2>/dev/null | head -40
sed -n '1,80p' /tmp/site-test/skins/index.json
```
Capture: is loading driven by `skins/index.json` (resolve folder by id), or a scan of a framework skins dir? Could a skin folder resolve from a site-owned path?

## Q5 — Where is the XLSX parser, and does it currently drop unknown columns?
Resolve the doc discrepancy (`js/parse/workbook.js` per the dev guide vs `js/graph/parser.js` per architecture.md) and check the current behaviour for unrecognised columns (design change 1).

```bash
ls /tmp/arc21-fw/js/parse /tmp/arc21-fw/js/graph 2>&1
grep -rnE "header|column|conceptID|relationType|unknown|extra|Object\.keys|row\[" /tmp/arc21-fw/js 2>/dev/null | head -50
```
Capture: confirmed parser file path; whether unknown columns are dropped, and where the per-row object is assembled (the insertion point for an `extra` map).

## Q6 — What does `sync.py` record, and is there a version/compat check?
```bash
grep -nE "framework\.lock|version|ARC21_VERSION|commit|lock" /tmp/arc21-fw/sync.py
cat /tmp/site-test/framework.lock 2>/dev/null
```

## Q7 — Does the loader assume a single concept source? (merge backward-compat)
The framework-level multi-source merge (extensibility design, change 2) must degenerate to today's behaviour for registry-less sites. To make that backward-compatibility hold *by construction* — single-source as the N=1 case of one union path, not a separate legacy branch — confirm how concepts are assembled today.

```bash
grep -rnE "Concepts|buildGraph|nodes|bySlug|byId|conceptID|new Map|dedupe|merge|push\(" /tmp/arc21-fw/js 2>/dev/null | head -50
```
Capture:
- Does concept-loading read exactly one `Concepts` tab and assume a single source?
- Where is the node set assembled — the insertion point for a union of N sources?
- Are concepts keyed (by `conceptID` / `sefariaRef`) in a way that already supports keyed merge/override, or is it positional / append-only?
- Any existing notion of merging or deduping concepts to build on?

This decides whether "union N sources, single-source = N=1" is an additive generalisation or whether the current code hard-assumes one source (which would need refactoring to stay backward-compatible).

---

## Report back (fill in)
- **Q1 — copy model:** (a / b / c). Source→dest list: … Deletes before copy? …
- **Q2 — probe survival:** `js/diagram` survived? … `js/site` survived? …
- **Q3 — site-owned protection mechanism:** …
- **Q4 — skin loading:** index.json-driven? site-owned skin folder feasible? …
- **Q5 — parser:** confirmed path = … ; drops unknown columns? … ; per-row assembly site = …
- **Q6 — lock contents / version check:** …
- **Q7 — concept-source assumption:** single `Concepts` source assumed? node-set assembly site = … ; keyed (merge-ready) or positional? ; union additive or needs refactor?
- **Net for the design:** which of changes 1–4 are already supported vs need framework work, and any surprises.
