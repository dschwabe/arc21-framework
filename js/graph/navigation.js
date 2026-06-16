/**
 * js/graph/navigation.js
 * URL builders (pure) + runtime graph/narrative lookups (state-dependent).
 * State-dependent functions read from appStore.
 */

import { appStore, SK, getSiteConfig } from "../store.js?v=12";
import { slugify, normalizeConceptId } from "../utils.js?v=12";

// ---- URL builders ----

/**
 * Return the canonical URL for a concept.
 * Prefers ID-based form (#/concept/C051) when a conceptID is known,
 * so URLs are language-neutral and survive graph translations.
 * Falls back to slug form for concepts with no ID.
 */
export function conceptUrl(slug) {
  const g = appStore.graph;
  const concept = g && g.bySlug && g.bySlug[slug];
  const id = concept && concept.conceptID;
  return "#/concept/" + encodeURIComponent(id || slug);
}

/**
 * Resolve a URL token to a graph slug.
 * Accepts either a conceptID ("C051") or a slug ("infancia-algoritmica").
 * Returns the matching slug, or null if not found.
 * Use this in the router and anywhere that reads from location.hash.
 */
export function resolveConceptSlug(token) {
  const g = appStore.graph;
  if (!g || !token) return null;
  const t = String(token);
  // 1. Direct slug match
  if (g.bySlug && g.bySlug[t]) return t;
  // 2. ID match (case-insensitive: C051, c051)
  const slug = g.idToSlug && g.idToSlug[t.toUpperCase()];
  if (slug && g.bySlug && g.bySlug[slug]) return slug;
  return null;
}
export function narrativeUrl(narrativeID) {
  return "#/narrative/" + encodeURIComponent(narrativeID);
}
export function narrativeElementUrl(narrativeID, elementID) {
  return "#/narrative/" + encodeURIComponent(narrativeID) + "/element/" + encodeURIComponent(elementID);
}

// ---- Graph lookups (read appStore.graph) ----

// Site-configured root concept (XLSX Site sheet → siteConfig['site.rootConcept']),
// accepting either a conceptID ("C001") or a slug. Returns null if unset/unresolved.
function configuredRootSlug() {
  const g = appStore.graph;
  if (!g) return null;
  const configured = String(getSiteConfig()['site.rootConcept'] || "").trim();
  if (!configured) return null;
  return resolveConceptSlug(configured);
}

export function firstConceptSlug() {
  const g = appStore.graph;
  if (!g || !g.order || !g.order.length) return null;
  const configured = configuredRootSlug();
  if (configured) return configured;
  return g.order.indexOf("infancia-algoritmica") >= 0 ? "infancia-algoritmica" : g.order[0];
}

export function canonicalRootSlug() {
  const g = appStore.graph;
  if (!g || !g.bySlug) return null;
  const configured = configuredRootSlug();
  if (configured) return configured;
  const preferred = slugify("Infância algorítmica");
  if (g.bySlug[preferred]) return preferred;
  return firstConceptSlug();
}

export function findPathFromRoot(targetSlug) {
  const g = appStore.graph;
  if (!g || !g.bySlug || !targetSlug) return [];
  const root = canonicalRootSlug();
  if (!root || !g.bySlug[root]) return [targetSlug];
  if (root === targetSlug) return [root];

  const queue = [root];
  const visited = {};
  const previous = {};
  visited[root] = true;

  while (queue.length) {
    const slug = queue.shift();
    const concept = g.bySlug[slug];
    const relations = concept && concept.relations ? concept.relations : [];
    for (let i = 0; i < relations.length; i++) {
      const next = relations[i].targetSlug;
      if (!next || visited[next] || !g.bySlug[next]) continue;
      visited[next] = true;
      previous[next] = slug;
      if (next === targetSlug) {
        const path = [targetSlug];
        let cursor = targetSlug;
        while (previous[cursor]) { cursor = previous[cursor]; path.unshift(cursor); }
        return path;
      }
      queue.push(next);
    }
  }
  return [targetSlug];
}

/** Resolve a [[wiki-link]] target (ID or label) to { slug, label, conceptID }. */
export function resolveWikiTarget(rawName) {
  const g = appStore.graph;
  const cleanName = String(rawName || "").trim();
  if (!cleanName) return null;
  const conceptId = normalizeConceptId(cleanName);
  const slugFromId = g && g.idToSlug ? g.idToSlug[conceptId] : "";
  const slug = slugFromId || slugify(cleanName);
  const concept = g && g.bySlug ? g.bySlug[slug] : null;
  if (!concept) return null;
  return { slug, label: concept.concept || cleanName, conceptID: concept.conceptID || conceptId || "", description: concept.description || "" };
}

// ---- Narrative lookups (read appStore.narrativeStore) ----

export function getNarrative(narrativeID) {
  const ns = appStore.narrativeStore;
  return ns && ns.byId ? ns.byId[narrativeID] : null;
}
export function getNarrativeElement(elementID) {
  const ns = appStore.narrativeStore;
  return ns && ns.elementsById ? ns.elementsById[elementID] : null;
}

// ---- Navigation history (localStorage) ----

export function getHistory() {
  try { return JSON.parse(localStorage.getItem(SK.history)) || []; }
  catch (e) { return []; }
}
export function setHistory(items) {
  localStorage.setItem(SK.history, JSON.stringify(items));
}
export function addToHistory(concept) {
  if (!concept) return;
  const history = getHistory();
  const last = history[history.length - 1];
  if (!last || last.slug !== concept.slug) {
    history.push({ slug: concept.slug, concept: concept.concept, visitedAt: new Date().toISOString() });
    setHistory(history);
  }
}
export function setPreviousConcept(slug) {
  if (slug) localStorage.setItem(SK.previous, slug);
}
export function getPreviousConcept() {
  return localStorage.getItem(SK.previous);
}
