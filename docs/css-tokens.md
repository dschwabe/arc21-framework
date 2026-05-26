# CSS Tokens

ARC21 sites use CSS custom properties (variables) defined on `:root` in
`default.css`. Skins and site-specific stylesheets reference these tokens rather
than hardcoded values, making global rebranding a one-file change.

---

## Token categories

### Colour palette

| Token | Purpose |
|-------|---------|
| `--color-bg` | Page background |
| `--color-surface` | Card / panel background |
| `--color-surface-alt` | Secondary surface (hover state, alternating rows) |
| `--color-border` | Default border colour |
| `--color-text` | Primary body text |
| `--color-text-muted` | Secondary / placeholder text |
| `--color-text-on-accent` | Text placed on an accent-coloured background |
| `--color-accent` | Primary accent (links, buttons, highlights) |
| `--color-accent-hover` | Accent hover / focus state |
| `--color-accent-2` | Secondary accent (tags, badges) |

### Typography

| Token | Purpose |
|-------|---------|
| `--font-body` | Body copy font stack |
| `--font-heading` | Heading font stack |
| `--font-mono` | Code / monospace font stack |
| `--font-size-base` | Base font size (typically `1rem` / 16 px) |
| `--line-height-body` | Body line height |
| `--line-height-heading` | Heading line height |

### Spacing

| Token | Purpose |
|-------|---------|
| `--space-xs` | 0.25 rem |
| `--space-sm` | 0.5 rem |
| `--space-md` | 1 rem |
| `--space-lg` | 2 rem |
| `--space-xl` | 4 rem |

### Layout

| Token | Purpose |
|-------|---------|
| `--content-max-width` | Maximum width of the main content column |
| `--sidebar-width` | Fixed sidebar width (concept index, narrative TOC) |
| `--nav-height` | Top navigation bar height |
| `--card-radius` | Border radius for cards and panels |
| `--gallery-gap` | Gap between gallery thumbnails |

### Elevation / shadow

| Token | Purpose |
|-------|---------|
| `--shadow-sm` | Subtle card lift |
| `--shadow-md` | Modal / dropdown elevation |

---

## Using tokens in skin CSS

Always reference tokens rather than hardcoded values:

```css
/* Good */
.relation-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--card-radius);
  padding: var(--space-md);
}

/* Avoid */
.relation-card {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 1rem;
}
```

---

## Site-level overrides

Each site can override framework tokens in its own CSS file (loaded after
`default.css`) without modifying `default.css` itself:

```css
/* site-specific.css */
:root {
  --color-accent:       #00b8a9;   /* teal-mint */
  --color-accent-hover: #009e91;
  --color-bg:           #0f1117;
  --color-text:         #e8eaf0;
  --font-heading:       "Space Grotesk", sans-serif;
}
```

---

## Skin-scoped overrides

A skin can override tokens only within its own scope using the body class
`skin-{id}` (set automatically when the skin is activated):

```css
/* skins/my-skin/my-skin.css */
.skin-my-skin {
  --color-surface: #1a1d2e;
  --color-accent:  #ff6b6b;
}
```

This means a single page load can switch palettes mid-session just by swapping
the skin — no JavaScript token manipulation needed.

---

## Dark mode

Sites that support dark mode typically define a `[data-theme="dark"]` variant:

```css
:root {
  --color-bg:   #ffffff;
  --color-text: #111111;
}

[data-theme="dark"] {
  --color-bg:   #0f1117;
  --color-text: #e8eaf0;
}
```

The `data-theme` attribute is toggled on `<html>` or `<body>` by the theme
switcher in `app.js`.

---

## Adding a new token

1. Declare it with a default value in the `:root` block of `default.css`.
2. Reference `var(--your-token)` in skin CSS files.
3. Override it at the site level or in a skin's CSS as needed.

Keep token names lowercase, hyphenated, and prefixed by category
(`--color-`, `--font-`, `--space-`, `--shadow-`, etc.).
