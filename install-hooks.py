#!/usr/bin/env python3
"""
install-hooks.py
Installs the ARC21 git hooks into .git/hooks/.

Run once after cloning an instance repo:
    python3 install-hooks.py

Hooks installed:
  pre-commit  — checks if data/conceptual_graph.xlsx is newer than
                data/graph.json and runs xlsx2json.py if so.
"""

import os
import sys
import stat

HOOKS_DIR = os.path.join(".git", "hooks")
PRE_COMMIT_PATH = os.path.join(HOOKS_DIR, "pre-commit")

PRE_COMMIT_SCRIPT = """\
#!/bin/sh
# ARC21 pre-commit hook: keep data/graph.json in sync with the XLSX.
# If the XLSX is newer than the JSON, run xlsx2json.py and stage the result.

XLSX="data/conceptual_graph.xlsx"
JSON="data/graph.json"

# Only act if XLSX is present
if [ ! -f "$XLSX" ]; then
  exit 0
fi

# Compare modification times
needs_update=0
if [ ! -f "$JSON" ]; then
  needs_update=1
elif [ "$XLSX" -nt "$JSON" ]; then
  needs_update=1
fi

if [ "$needs_update" = "1" ]; then
  echo "[pre-commit] graph.json is stale — running xlsx2json.py..."
  python3 xlsx2json.py
  if [ $? -ne 0 ]; then
    echo "[pre-commit] ✗ xlsx2json.py failed. Commit aborted."
    exit 1
  fi
  git add "$JSON"
  echo "[pre-commit] ✓ graph.json updated and staged."
fi

exit 0
"""


def main():
    if not os.path.isdir(".git"):
        print("✗ No .git directory found. Run this script from the repo root.")
        sys.exit(1)

    os.makedirs(HOOKS_DIR, exist_ok=True)

    # Warn if a hook already exists and is not ours
    if os.path.exists(PRE_COMMIT_PATH):
        with open(PRE_COMMIT_PATH) as f:
            existing = f.read()
        if "ARC21 pre-commit hook" not in existing:
            print(f"⚠ A pre-commit hook already exists and was not written by ARC21.")
            print(f"  Inspect {PRE_COMMIT_PATH} and merge manually if needed.")
            answer = input("  Overwrite? [y/N] ").strip().lower()
            if answer != "y":
                print("Aborted.")
                sys.exit(0)

    with open(PRE_COMMIT_PATH, "w") as f:
        f.write(PRE_COMMIT_SCRIPT)

    # Make executable
    current = stat.S_IMODE(os.stat(PRE_COMMIT_PATH).st_mode)
    os.chmod(PRE_COMMIT_PATH, current | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    print(f"✓ pre-commit hook installed at {PRE_COMMIT_PATH}")
    print("  It will auto-convert data/conceptual_graph.xlsx → data/graph.json before each commit.")


if __name__ == "__main__":
    main()
