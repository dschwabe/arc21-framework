/**
 * js/i18n.js
 * Locale state management, per-language XLSX path resolution,
 * and UI string catalog (t / applyI18n).
 *
 * To add a new language to a site:
 *   1. Declare it in skins/index.json (site-owned) under a top-level
 *      "locales" array: [{ "code": "en", "label": "English" }, ...].
 *      Do NOT edit SUPPORTED_LOCALES below — this file is framework-owned
 *      and gets overwritten by sync.py.
 *   2. Place data/conceptual_graph.<code>.xlsx in the project.
 *   3. Place i18n/<code>.json with translated UI strings.
 *   4. The switcher, loader, and applyI18n pick it up automatically.
 */

const LOCALE_SK = "conceptGraph.locale.v1";
const DEFAULT_LOCALE = "pt-BR";

/**
 * Framework default locale(s).
 * code   — BCP-47 tag; must match the filename suffix and be unique.
 * label  — shown in the language switcher.
 *
 * Sites add to this list at runtime via registerLocales() — see the
 * header comment above. The switcher is hidden when fewer than 2
 * locales are registered.
 */
export const SUPPORTED_LOCALES = [
  { code: "pt-BR", label: "Português (BR)" }
];

/**
 * Add site-declared locales (e.g. from skins/index.json's "locales" array)
 * to SUPPORTED_LOCALES. Entries with a code that is already registered,
 * or missing a code, are skipped.
 */
export function registerLocales(locales) {
  if (!Array.isArray(locales)) return;
  locales.forEach(function (loc) {
    const code = loc && loc.code;
    if (!code) return;
    if (SUPPORTED_LOCALES.find(function (l) { return l.code === code; })) return;
    SUPPORTED_LOCALES.push({ code: code, label: loc.label || code });
  });
}

let _locale = DEFAULT_LOCALE;

/**
 * Load the persisted locale (or default) and validate it against
 * SUPPORTED_LOCALES. Call once at app startup before accessing the graph.
 */
export function initLocale() {
  let stored = DEFAULT_LOCALE;
  try { stored = localStorage.getItem(LOCALE_SK) || DEFAULT_LOCALE; } catch (e) {}
  _locale = SUPPORTED_LOCALES.find(function (l) { return l.code === stored; })
    ? stored
    : DEFAULT_LOCALE;
  return _locale;
}

/** Return the active locale code. */
export function getLocale() { return _locale; }

/** True if the user has explicitly chosen a locale (stored in localStorage). */
export function hasExplicitLocale() {
  try { return localStorage.getItem(LOCALE_SK) !== null; } catch (e) { return false; }
}

/**
 * Switch locale. Returns true if the locale actually changed.
 * Caller is responsible for re-loading data and re-rendering.
 */
export function setLocale(code) {
  if (code === _locale) return false;
  if (!SUPPORTED_LOCALES.find(function (l) { return l.code === code; })) return false;
  _locale = code;
  try { localStorage.setItem(LOCALE_SK, code); } catch (e) {}
  return true;
}

/**
 * Returns the XLSX paths to try for a given locale, in priority order:
 *   ["data/conceptual_graph.pt-BR.xlsx", "data/conceptual_graph.xlsx"]
 * Caller fetches each in turn, using the first that resolves to a real file.
 */
export function graphPaths(locale) {
  const paths = [];
  if (locale && locale !== "default") {
    paths.push("data/conceptual_graph." + locale + ".xlsx");
  }
  paths.push("data/conceptual_graph.xlsx");
  return paths;
}

// ---- UI string catalog ----

let _uiStrings = null;
let _uiStringsLocale = null;

/**
 * Fetch and cache the UI string catalog for `locale`.
 * Tries i18n/<locale>.json first; falls back to i18n/<DEFAULT_LOCALE>.json.
 * Returns the strings object (may be {} if both fetches fail).
 */
export async function loadUiStrings(locale) {
  const l = locale || DEFAULT_LOCALE;
  if (_uiStrings && _uiStringsLocale === l) return _uiStrings;
  const paths = l !== DEFAULT_LOCALE
    ? ["i18n/" + l + ".json", "i18n/" + DEFAULT_LOCALE + ".json"]
    : ["i18n/" + DEFAULT_LOCALE + ".json"];
  for (let i = 0; i < paths.length; i++) {
    try {
      const res = await fetch(paths[i], { cache: "no-store" });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.startsWith("text/html")) continue; // SPA rewrite guard
      _uiStrings = await res.json();
      _uiStringsLocale = l;
      return _uiStrings;
    } catch (_) {}
  }
  _uiStrings = {};
  _uiStringsLocale = l;
  return _uiStrings;
}

/**
 * Look up a UI string by key.
 * Returns `fallback` (or `key` when fallback is omitted) if strings are not
 * loaded yet or the key is absent — so it is always safe to call synchronously.
 */
export function t(key, fallback) {
  return (_uiStrings && Object.prototype.hasOwnProperty.call(_uiStrings, key))
    ? _uiStrings[key]
    : (fallback !== undefined ? fallback : key);
}

/**
 * Apply translations to all elements marked with data-i18n attributes.
 * Call after loadUiStrings() resolves, and again after cloning templates.
 *
 *   data-i18n="key"           → el.textContent
 *   data-i18n-title="key"     → el.title
 *   data-i18n-aria="key"      → el.aria-label
 *   data-i18n-placeholder="key" → el.placeholder
 *
 * @param {Element|Document} [root] — scope; defaults to document
 */
export function applyI18n(root) {
  const scope = root || document;
  const $$ = scope.querySelectorAll
    ? scope.querySelectorAll.bind(scope)
    : function () { return []; };
  $$("[data-i18n]").forEach(function (el) {
    const val = t(el.getAttribute("data-i18n"), null);
    if (val !== null) el.textContent = val;
  });
  $$("[data-i18n-title]").forEach(function (el) {
    const val = t(el.getAttribute("data-i18n-title"), null);
    if (val !== null) el.setAttribute("title", val);
  });
  $$("[data-i18n-aria]").forEach(function (el) {
    const val = t(el.getAttribute("data-i18n-aria"), null);
    if (val !== null) el.setAttribute("aria-label", val);
  });
  $$("[data-i18n-placeholder]").forEach(function (el) {
    const val = t(el.getAttribute("data-i18n-placeholder"), null);
    if (val !== null) el.setAttribute("placeholder", val);
  });
}

// ---- Locale-scoped storage keys ----

/**
 * Return localStorage key suffixes scoped to a locale.
 * All graph-content keys (graph, narratives, media, …) are locale-scoped
 * so switching languages never serves stale cached data.
 * Non-content keys (history, previousConcept) are NOT scoped — they use
 * stable conceptIDs and are language-neutral.
 */
export function localeSK(locale) {
  const l = locale || DEFAULT_LOCALE;
  return {
    data:         "conceptGraph.graph.v1."           + l,
    narratives:   "conceptGraph.narratives.v1."      + l,
    media:        "conceptGraph.media.v1."           + l,
    templates:    "conceptGraph.templates.v1."       + l,
    skins:        "conceptGraph.narrativeSkins.v1."  + l,
    conceptSkins: "conceptGraph.conceptSkins.v1."    + l,
    conceptTexts: "conceptGraph.conceptTexts.v1."    + l,
    skinData:     "conceptGraph.skinData.v1."        + l
  };
}
