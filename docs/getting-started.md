# Getting started

This tutorial walks you through running the framework locally, loading data, and navigating the graph for the first time.

## Prerequisites

- A modern browser (Chrome, Firefox, Edge, or Safari 16+)
- Python 3 **or** Node.js for a local HTTP server
- An `.xlsx` spreadsheet in the format described in [spreadsheet-format.md](spreadsheet-format.md)

> **Why a local server?** The app uses native ES modules and `fetch()` to load the XLSX file. Both are blocked when a page is opened directly from the filesystem (`file://`). A local HTTP server takes one command.

---

## 1. Serve locally

From the project root:

```bash
# Python (built-in on macOS and most Linux distros)
python3 -m http.server 8000

# Node.js
npx serve .
```

Open [http://localhost:8000](http://localhost:8000).

---

## 2. Load data

When served over HTTP the app automatically fetches `data/conceptual_graph.xlsx` on startup. If the file exists and parses successfully you will see a concept count and a **Start** link on the home screen.

**To load a different file:**

- **Path input** — type a relative path (e.g. `data/my-graph.xlsx`) into the path field on the home screen and click **Load**. HTTP only.
- **File picker** — click **Select local file** (or **Trocar arquivo** in the top bar from any page) to open a system file dialog. Works everywhere, including `file://`.

---

## 3. Navigate the graph

After loading:

- Click **Start** (or the root concept link) to enter the graph.
- Click **related concept** links inside descriptions to navigate the graph.
- Use the **sidebar index** to jump to any concept by name.
- The **breadcrumb trail** at the top shows the path from the root concept to the current one.
- **Back** (←) returns to the previously visited concept.
- **History** shows all concepts visited this session and lets you save a JSON log.

---

## 4. Open a narrative

If the spreadsheet includes a `Narratives` tab, the sidebar shows a **Narratives** section. Click any title to open it.

The overlay has three states:

| State | How to reach it |
|---|---|
| Full-screen | Click a narrative in the sidebar |
| Picture-in-Picture (PiP) | Click ⊟ Minimise in the overlay bar |
| Closed | Click × in the overlay bar |

The PiP card is draggable. Click it to expand back to full-screen.

In a **scrollytelling** narrative, scroll down to advance panels. In a **linear** narrative, use Previous / Next buttons.

---

## 5. Switch skins

A skin selector appears in the top bar when more than one skin is available. You can also force a skin via URL:

```
http://localhost:8000/#/narrative/N001?skin=scrolly
http://localhost:8000/#/concept/infancia-algoritmica?skin=concept-scrolly
```

---

## 6. The `bundle.html` workflow

`bundle.html` is a self-contained single file — all CSS, JS, and skin registry inlined. No server needed.

```bash
python3 build.py
# Writes bundle.html to the project root
```

Open `bundle.html` directly in a browser. On first open use the file picker to select your XLSX; data is saved to `localStorage` and persists across sessions.

**Limitation:** `bundle.html` cannot probe the filesystem for assets, so concept images auto-discovered from `assets/concepts/` will not appear. Images referenced by absolute URL (in `urls.txt` or the Media tab) continue to work.
