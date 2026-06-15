# Site-owned skin naming convention (Change 3)

Stage 2 verified that site-owned skins already work by construction: the
framework's additive-merge sync never touches a path it doesn't ship, and
`js/skin/loader.js` resolves skin files relative to the site root regardless
of whether the framework placed them there. No loader or sync code change is
needed.

## Naming rule

**Site skin IDs must use a project-specific prefix that the framework will
never claim.** Use the site's short project name as the prefix:

- `concept-hypertorah` ✓ (project: HyperTorah)
- `concept-infancia` ✓ (project: Infância Algorítmica)
- `concept-custom` ✗ (generic — a future framework skin might use this)
- `linear-extra` ✗ (prefixed with a framework skin name — collides if the
  framework later ships a variant)

**Framework skins** use either a rendering-mode word (`linear`, `scrolly`,
`concept-default`) or a compound that stays generic. Reserve any prefix
that names a specific project or corpus for site use.

## Rationale

Skin IDs are used both in `skins/index.json` (site-owned, never synced) and
as the folder name under `skins/<id>/`. Since sync is additive, a
site-created `skins/concept-hypertorah/` will never be overwritten — but if
the framework later ships a skin with the same ID, `copy_dir`'s
`shutil.copy2` would silently overwrite the site's file. Change 5's
collision detection will report this case, but a project-scoped name avoids
it entirely.

## Change 5 interaction

The collision detector added in Change 5 (`example/sync.py`) catches the
violation *after the fact* — it reports before overwriting. The naming rule
is the proactive layer: follow it and the detector will never fire on skin
files.
