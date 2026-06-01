#!/usr/bin/env python3
"""
build.py — ARC21 v4 single-file bundler
Run from the project root: python3 build.py
Produces: bundle.html  (no server needed, open directly in Chrome/Firefox/Edge)
"""

import re, os, json, glob, argparse, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))

# ── JS files in topological dependency order ──────────────────────────────────
JS_FILES = [
    "js/utils.js",
    "js/store.js",
    "js/parse/csv.js",
    "js/parse/xlsx.js",
    "js/parse/workbook.js",
    "js/graph/builder.js",
    "js/graph/navigation.js",
    "js/render/content.js",
    "js/skin/loader.js",
    "skins/concept-default/concept-default.js",
    "skins/linear/linear.js",
    "skins/scrolly/scrolly.js",
    "skins/concept-scrolly/concept-scrolly.js",
    "app.js",
]

CSS_FILES = [
    "default.css",
    "skins/concept-default/concept-default.css",
    "skins/linear/linear.css",
    "skins/scrolly/scrolly.css",
    "skins/concept-scrolly/concept-scrolly.css",
]

# Only these extensions are included in the asset manifest and zip.
ASSET_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg",
              ".mp4", ".webm", ".html", ".htm", ".txt"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def scan_assets():
    """Return sorted list of asset paths (relative to BASE) found in assets/."""
    assets_dir = os.path.join(BASE, "assets")
    paths = []
    if not os.path.isdir(assets_dir):
        return paths
    for root, dirs, files in os.walk(assets_dir):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for fname in sorted(files):
            if fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in ASSET_EXTS:
                continue
            rel = os.path.relpath(os.path.join(root, fname), BASE).replace(os.sep, "/")
            paths.append(rel)
    return paths


def build_zip(bundle_path, zip_path, asset_paths):
    """Create a zip containing bundle.html and all assets/."""
    assets_dir = os.path.join(BASE, "assets")
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(bundle_path, "bundle.html")
        for rel in asset_paths:
            full = os.path.join(BASE, rel)
            if os.path.isfile(full):
                zf.write(full, rel)
                count += 1
    return count


def read(path):
    with open(os.path.join(BASE, path), encoding="utf-8") as f:
        return f.read()

def strip_modules(src):
    """Remove ES module import/export syntax."""
    # Multi-line and single-line: import { ... } from "...";
    src = re.sub(r'import\s*\{[^}]*\}\s*from\s*["\'][^"\']*["\'];?', '', src, flags=re.DOTALL)
    # Bare: import "..."
    src = re.sub(r'import\s+["\'][^"\']*["\'];?', '', src)
    # Re-export: export { ... }
    src = re.sub(r'export\s*\{[^}]*\};?', '', src, flags=re.DOTALL)
    # export keyword before declarations (function, class, const, let, var, async function)
    src = re.sub(r'\bexport\s+((?:async\s+)?(?:function\*?|class|const|let|var)\b)', r'\1', src)
    # export default
    src = re.sub(r'\bexport\s+default\b\s*', '', src)
    return src

def patch_loader(src, skin_index_json):
    """
    Patch loader.js for standalone use:
    1. Replace fetch-based skin index load with inlined JSON.
    2. Replace dynamic import() with a registry lookup.
    """
    # 1. Replace the fetch chain inside loadSkinIndex with inline data.
    src = src.replace(
        '_skinIndexCache.promise = fetch("skins/index.json")\n'
        '    .then(function (r) { return r.ok ? r.json() : null; })\n'
        '    .then(function (data) {\n'
        '      _skinIndexCache.value = data || { defaultSkin: "linear", skins: [] };\n'
        '      return _skinIndexCache.value;\n'
        '    })\n'
        '    .catch(function () {\n'
        '      _skinIndexCache.value = { defaultSkin: "linear", skins: [] };\n'
        '      return _skinIndexCache.value;\n'
        '    });\n'
        '  return _skinIndexCache.promise;',
        '_skinIndexCache.value = ' + json.dumps(skin_index_json, ensure_ascii=False) + ';\n'
        '  return Promise.resolve(_skinIndexCache.value);'
    )

    # 2. Replace dynamic import() with bundle registry lookup.
    src = src.replace(
        'const mod = await import("../../skins/" + skinID + "/" + skinID + ".js");',
        'const mod = _BUNDLED_SKIN_REGISTRY;'
    )
    return src

# ── Collect CSS ────────────────────────────────────────────────────────────────

def build_css():
    parts = []
    for f in CSS_FILES:
        path = os.path.join(BASE, f)
        if os.path.exists(path):
            parts.append("/* === " + f + " === */")
            parts.append(read(f))
    return "\n".join(parts)

# ── Collect JS ─────────────────────────────────────────────────────────────────

def build_js(skin_index, asset_paths):
    parts = []

    # Asset manifest — injected as a global Set so probeFile() can resolve
    # images when bundle.html is opened via file:// (where fetch() is blocked).
    parts.append("// ===== asset manifest (file:// mode) =====")
    parts.append(
        "var __ARC21_ASSET_MANIFEST__ = new Set("
        + json.dumps(asset_paths, ensure_ascii=False)
        + ");"
    )

    for path in JS_FILES:
        src = read(path)
        src = strip_modules(src)
        if path == "js/skin/loader.js":
            src = patch_loader(src, skin_index)
        parts.append("// ===== " + path + " =====")
        parts.append(src)

    # Skin module registry (must come after all skin files, before app.js uses it)
    registry_insert = """
// ===== bundled skin registry =====
const _BUNDLED_SKIN_REGISTRY = {
  createConceptDefaultSkin:  typeof createConceptDefaultSkin  !== "undefined" ? createConceptDefaultSkin  : null,
  createLinearSkin:          typeof createLinearSkin          !== "undefined" ? createLinearSkin          : null,
  createScrollySkin:         typeof createScrollySkin         !== "undefined" ? createScrollySkin         : null,
  createConceptScrollySkin:  typeof createConceptScrollySkin  !== "undefined" ? createConceptScrollySkin  : null,
};
"""
    # Insert registry just before app.js section
    app_marker = "// ===== app.js ====="
    idx = None
    for i, p in enumerate(parts):
        if p == app_marker:
            idx = i
            break
    if idx is not None:
        parts.insert(idx, registry_insert)

    return "\n".join(parts)

# ── Build HTML ─────────────────────────────────────────────────────────────────

def build_html(asset_paths):
    html = read("index.html")
    skin_index = json.loads(read("skins/index.json"))

    css = build_css()
    js  = build_js(skin_index, asset_paths)

    # Replace <link rel="stylesheet" href="./default.css" /> with inline <style>
    html = html.replace(
        '<link rel="stylesheet" href="./default.css" />',
        '<style>\n' + css + '\n</style>'
    )

    # Replace <script type="module" src="./app.js?v=3"></script> with inline <script>
    script_block = '<script>\n' + js + '\n</script>'
    html = re.sub(
        r'<script\s+type="module"\s+src="[^"]*"></script>',
        lambda _: script_block,
        html
    )

    return html

# ── Translation sync check ────────────────────────────────────────────────────


def build_mgmt():
    """Generate mgmt.html from index.html — never edit mgmt.html directly."""
    import re as _re
    html = read("index.html")
    html = html.replace("<html ", "<html data-mgmt ", 1)
    html = _re.sub(r"(<title>)(.*?)(</title>)", lambda m: m.group(1) + m.group(2) + " — Gestão" + m.group(3), html, count=1)
    mgmt_path = os.path.join(BASE, "mgmt.html")
    with open(mgmt_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("mgmt.html    written")


def check_translation_sync():
    """Warn if any translated XLSX is older than the source, or if translation
    cache files exist but are missing entries for the current source content.

    Uses only mtime comparison (no openpyxl needed).  For a detailed cell-
    level diff run:  python3 translate.py --check
    """
    src = os.path.join(BASE, "data", "conceptual_graph.xlsx")
    if not os.path.exists(src):
        return  # no source XLSX yet, nothing to check

    src_mtime = os.path.getmtime(src)
    stale: list[str] = []

    # 1. Check translated XLSX files against source mtime
    pattern = os.path.join(BASE, "data", "conceptual_graph.*.xlsx")
    for path in sorted(glob.glob(pattern)):
        fname  = os.path.basename(path)
        locale = fname[len("conceptual_graph."):-len(".xlsx")]
        if os.path.getmtime(path) < src_mtime:
            stale.append(locale)

    # 2. Also flag locales whose cache exists but no translated XLSX does
    cache_pattern = os.path.join(BASE, ".translate_cache.*.json")
    for cache_path in sorted(glob.glob(cache_pattern)):
        fname  = os.path.basename(cache_path)               # .translate_cache.en.json
        locale = fname[len(".translate_cache."):-len(".json")]
        out    = os.path.join(BASE, "data", f"conceptual_graph.{locale}.xlsx")
        if not os.path.exists(out) and locale not in stale:
            stale.append(locale)

    if stale:
        print("\n⚠  Translation sync warning — these locales may be out of date:")
        for locale in stale:
            out = os.path.join(BASE, "data", f"conceptual_graph.{locale}.xlsx")
            if not os.path.exists(out):
                reason = "translated XLSX missing"
            else:
                reason = "source XLSX is newer"
            print(f"   {locale} ({reason})")
            print(f"         → python3 translate.py --target {locale}")
        print(f"   For a cell-level diff: python3 translate.py --check\n")


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ARC21 single-file bundler",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python3 build.py           # bundle.html only\n"
            "  python3 build.py --zip     # bundle.html + bundle.zip (with assets/)\n"
        ),
    )
    parser.add_argument(
        "--zip", action="store_true",
        help="also produce bundle.zip containing bundle.html and assets/ "
             "for fully offline use (open bundle.html after extracting)",
    )
    args = parser.parse_args()

    asset_paths = scan_assets()
    out = build_html(asset_paths)
    out_path = os.path.join(BASE, "bundle.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"bundle.html  written  ({size_kb} KB)  [{len(asset_paths)} assets in manifest]")

    if args.zip:
        zip_path = os.path.join(BASE, "bundle.zip")
        count = build_zip(out_path, zip_path, asset_paths)
        zip_kb  = os.path.getsize(zip_path) // 1024
        print(f"bundle.zip   written  ({zip_kb} KB)  [{count} asset files]")
        print(f"  → extract the zip, then open bundle.html from the extracted folder")

    build_mgmt()
    check_translation_sync()
