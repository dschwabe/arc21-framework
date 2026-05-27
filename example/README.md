# ARC21 Example Site

Minimal demo site showing how to wire up the ARC21 framework.

## How to run

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

## Structure

- `index.html` — site shell (title, meta, loads default.css + site.css)
- `site.css` — palette token overrides (copy the neutral defaults; edit to taste)
- `skins/index.json` — which skins are active on this site
- `data/conceptual_graph.xlsx` — minimal demo graph (5–10 concepts)
- `sync.py` — pull framework updates from arc21-framework

## Syncing framework updates

```bash
python sync.py [path/to/arc21-framework]
python sync.py --check   # check without syncing
```
