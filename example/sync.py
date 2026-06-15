#!/usr/bin/env python3
"""
sync.py  —  Pull framework updates from arc21-framework into this site.

Usage:
  python sync.py [path/to/arc21-framework]

If no path is given, the last-used path is read from framework.lock.
Run with --check to report whether the framework has updates without syncing.
"""

import os, shutil, json, subprocess, sys, hashlib
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
    "index.html",      # public shell (title, meta tags)
    "mgmt.html",       # management shell (site-owned; customize title only)
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


def _should_skip_file(name):
    """Skip macOS cruft and backup files — never synced, at any depth."""
    return name.startswith(".") or name.startswith("Icon") or name.endswith(".bak")


def _file_hash(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_dir(src, dst, top):
    """Copy src directory to dst, respecting SUBPATH_OWNED.

    `top` is the directory's name relative to the repo root (e.g. "skins"),
    so SUBPATH_OWNED entries like skins/index.json are compared against the
    full site-relative path. (A bug here once compared bare filenames, so
    the protection silently never applied and site files were clobbered.)

    Change 5 — collision detection: if the framework is about to overwrite a
    site file that is NOT in SITE_OWNED or SUBPATH_OWNED and has been locally
    modified, we report it rather than silently clobbering. The copy still
    proceeds — this is a report, not a block — so the framework wins and the
    site maintainer can decide whether to add the file to SUBPATH_OWNED.
    """
    os.makedirs(dst, exist_ok=True)
    skipped_owned = []
    collisions = []
    for root, dirs, files in os.walk(src):
        rel_root = os.path.relpath(root, src)
        for fname in files:
            if _should_skip_file(fname):
                continue
            rel_file = os.path.normpath(os.path.join(top, rel_root, fname))
            # Check if this subpath is site-owned
            if rel_file in SUBPATH_OWNED:
                skipped_owned.append(rel_file)
                continue
            src_file = os.path.join(root, fname)
            dst_file = os.path.join(dst, os.path.relpath(rel_file, top))
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            # Detect silent overwrites of locally modified files.
            if os.path.exists(dst_file) and _file_hash(src_file) != _file_hash(dst_file):
                collisions.append(rel_file)
            shutil.copy2(src_file, dst_file)
    if collisions:
        print(f"  ⚠  Framework overwrote {len(collisions)} locally-modified file(s):")
        for c in sorted(collisions):
            print(f"       {c}")
        print(f"     To protect a file, add it to SUBPATH_OWNED in this sync.py.")
    return skipped_owned


def sync(framework_path, site_path="."):
    framework_path = os.path.abspath(framework_path)
    if not os.path.isdir(framework_path):
        sys.exit(f"Error: framework path not found:\n  {framework_path}")

    # Skip CLAUDE.md and docs/ from the framework — they are framework-internal
    framework_skip = {"CLAUDE.md", "docs", "example", ".git", ".github", "dependents.json"}

    copied, skipped = [], []
    owned_kept = []

    for name in sorted(os.listdir(framework_path)):
        if _should_skip_file(name) or name in SITE_OWNED or name in framework_skip:
            skipped.append(name)
            continue
        src = os.path.join(framework_path, name)
        dst = os.path.join(site_path, name)
        if os.path.isdir(src):
            owned_kept += copy_dir(src, dst, name)
        else:
            shutil.copy2(src, dst)
        copied.append(name)

    if owned_kept:
        print(f"  Kept site-owned subpaths: {', '.join(sorted(owned_kept))}")

    version = git_head(framework_path)
    lock = {
        "framework_version": version,
        "framework_commit_message": git_log_oneline(framework_path, version),
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "framework_path": framework_path,
        "merge_semantics_version": 1,
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
