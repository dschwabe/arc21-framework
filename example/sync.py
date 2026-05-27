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
