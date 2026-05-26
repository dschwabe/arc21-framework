# arc21-framework

A zero-build, zero-dependency single-page application for browsing a conceptual graph loaded from an `.xlsx` spreadsheet. No bundler, no framework, no build step — open `index.html` behind a local server and go.

## Sites using this framework

| Site | Repository | Description |
|---|---|---|
| Infância Algorítmica V6 | [dschwabe/Infancia-Algoritmica-V6](https://github.com/dschwabe/Infancia-Algoritmica-V6) | Brazilian cyborg-childhood theory graph, with i18n and Firebase hosting |
| ARC21 Root | [dschwabe/ARC21-root](https://github.com/dschwabe/ARC21-root) | ARC21 conceptual framework with hero diagrams (nebulosa + infra) |

Both sites share this codebase verbatim. Site-specific content lives in `data/`, `assets/`, palette overrides in `default.css`, and site config in the `Site` tab of the XLSX.

## Key characteristics

- Pure ES modules loaded natively — no transpiler, no bundler
- Hash-based routing (`#/concept/slug`, `#/narrative/N001`, `#/narrative/N001/element/E002`)
- All data persisted to `localStorage` — works offline after first load
- Lazy-loaded skin system: each skin is a self-contained ES module + CSS file
- `build.py` produces a standalone `bundle.html` for offline distribution
- Firebase / Netlify / Vercel ready: SPA rewrite guard in the asset loader prevents false positives

## Folder structure

```
arc21-site/
├── index.html              # Entry point (HTML shell + templates)
├── app.js                  # Application bootstrap and router (~1 800 lines)
├── default.css             # Base stylesheet and CSS custom properties
├── help-config.json        # Tooltip and help-text overrides (optional)
├── build.py                # Single-file bundler → bundle.html
│
├── js/
│   ├── store.js            # Shared state (appStore) and localStorage helpers
│   ├── utils.js            # Pure utilities (slugify, escapeHTML, CSV helpers…)
│   ├── graph/
│   │   ├── builder.js      # buildGraph(): rows → in-memory graph
│   │   └── navigation.js   # URL builders + graph/narrative lookups
│   ├── parse/
│   │   ├── csv.js          # CSV parser (comma/semicolon/tab auto-detect)
│   │   ├── xlsx.js         # Low-level XLSX unzip + XML parser
│   │   └── workbook.js     # High-level spreadsheet parser (all tabs)
│   ├── render/
│   │   └── content.js      # linkifyDescription, markdown helpers, wrapText
│   └── skin/
│       └── loader.js       # Skin lifecycle: CSS injection, lazy JS import, asset probing
│
├── skins/
│   ├── index.json          # Skin registry
│   ├── linear/             # Linear narrative reader skin
│   ├── scrolly/            # Scrollytelling narrative skin
│   ├── concept-default/    # Default concept page skin
│   └── concept-scrolly/    # Scrollytelling concept skin
│
├── data/
│   └── conceptual_graph.xlsx   # Default dataset (auto-loaded on HTTP serve)
│
└── assets/
    ├── concepts/           # Concept images — assets/concepts/{ID}/1.png
    └── skins/              # Narrative and element assets — assets/skins/{ID}/
```

## Documentation

| Document | Purpose |
|---|---|
| [docs/getting-started.md](docs/getting-started.md) | Tutorial: serve locally, load data, navigate |
| [docs/spreadsheet-format.md](docs/spreadsheet-format.md) | Reference: all XLSX tabs and columns |
| [docs/asset-discovery.md](docs/asset-discovery.md) | Reference: how images are found from the filesystem |
| [docs/skin-system.md](docs/skin-system.md) | Reference + guide: skin architecture, building a new skin |
| [docs/architecture.md](docs/architecture.md) | Explanation: why the system works the way it does |
| [docs/css-tokens.md](docs/css-tokens.md) | Reference: CSS custom properties and animation classes |

## Quick start

```bash
# Serve the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

The app auto-loads `data/conceptual_graph.xlsx` on first visit. Use the file picker on the home screen to load a different spreadsheet.

See [docs/getting-started.md](docs/getting-started.md) for a full walkthrough.
