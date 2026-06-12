/**
 * js/store.js
 * Shared application state and persistence helpers.
 *
 * `appStore` is a plain mutable object. All modules that need runtime state
 * import it and read/write through it. app.js initialises the fields on boot.
 *
 * All save/load functions accept an optional `key` parameter.
 * Pass a locale-scoped key (from localeSK() in js/i18n.js) when the data
 * is language-specific. Omit it to use the default SK.* key (language-neutral
 * data such as manually imported files, history, etc.).
 */

// ---- Storage keys (language-neutral defaults) ----
export const SK = {
  data:           "conceptGraph.data.v5",
  history:        "conceptGraph.history.v1",
  previous:       "conceptGraph.previousConcept.v1",
  narratives:     "conceptGraph.narratives.v1",
  media:          "conceptGraph.media.v1",
  templates:      "conceptGraph.templates.v1",
  skins:          "conceptGraph.narrativeSkins.v1",
  conceptSkins:   "conceptGraph.conceptSkins.v1",
  conceptTexts:   "conceptGraph.conceptTexts.v1",
  skinData:       "conceptGraph.skinData.v1",
  sourceLabel:    "conceptGraph.sourceLabel.v1"
};

// ---- Live state object ----
export const appStore = {
  graph:               null,
  narrativeStore:      { byId: {}, order: [], elementsById: {}, loadedAt: "" },
  mediaStore:          {},
  templatesStore:      {},
  narrativeSkinsStore: {},
  conceptSkinsStore:   {},
  conceptTextsStore:   {},
  skinDataStore:       {},
  currentConceptSlug:  null,
  helpConfig:          null,   // set by help.js
  helpConfigPromise:   null
};

// ---- Graph ----
export function saveStoredGraph(data, key) {
  try { localStorage.setItem(key || SK.data, JSON.stringify(data)); } catch (e) {}
}
export function loadStoredGraph(key) {
  try { const raw = localStorage.getItem(key || SK.data); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

// ---- Narratives ----
export function loadStoredNarratives(key) {
  try {
    const raw = localStorage.getItem(key || SK.narratives);
    return raw ? JSON.parse(raw) : { byId: {}, order: [], elementsById: {}, loadedAt: "" };
  } catch (e) {
    return { byId: {}, order: [], elementsById: {}, loadedAt: "" };
  }
}
export function saveStoredNarratives(data, key) {
  appStore.narrativeStore = data || { byId: {}, order: [], elementsById: {}, loadedAt: "" };
  try { localStorage.setItem(key || SK.narratives, JSON.stringify(appStore.narrativeStore)); } catch (e) {}
}
export function hasNarratives() {
  return !!(appStore.narrativeStore && appStore.narrativeStore.order && appStore.narrativeStore.order.length);
}

// ---- Media ----
export function loadStoredMedia(key) {
  try { const raw = localStorage.getItem(key || SK.media); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredMedia(data, key) {
  appStore.mediaStore = data || {};
  try { localStorage.setItem(key || SK.media, JSON.stringify(appStore.mediaStore)); } catch (e) {}
}

export function mediaKey(scope, scopeID) {
  return String(scope || "").trim().toLowerCase() + ":" + String(scopeID || "").trim().toUpperCase();
}
export function getMediaFor(scope, scopeID) {
  const list = appStore.mediaStore[mediaKey(scope, scopeID)] || [];
  return list.slice().sort(function (a, b) {
    const oa = Number(a.order) || 0;
    const ob = Number(b.order) || 0;
    if (oa !== ob) return oa - ob;
    return list.indexOf(a) - list.indexOf(b);
  });
}
export function mediaFilePath(scope, scopeID, mediaItem) {
  if (mediaItem && mediaItem.src) return mediaItem.src;
  const file = String(mediaItem && mediaItem.file || "").trim();
  if (/^https?:\/\//i.test(file)) return file;
  const scopeName = String(scope || "concept").trim().toLowerCase();
  const folder = "assets/" + scopeName + "s/" + String(scopeID || "").trim().toUpperCase();
  if (file) return folder + "/" + file;
  const ord = (Number(mediaItem && mediaItem.order) || 1).toString().padStart(2, "0");
  return folder + "/" + ord + ".png";
}

// Returns the canonical asset folder for a given skin asset ID.
// For narratives/concepts pass the ID; for elements pass "narrativeID/elementID".
export function skinAssetFolder(id) {
  return "assets/skins/" + String(id || "").trim().toUpperCase() + "/";
}

// ---- Templates ----
export function loadStoredTemplates(key) {
  try { const raw = localStorage.getItem(key || SK.templates); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredTemplates(data, key) {
  appStore.templatesStore = data || {};
  try { localStorage.setItem(key || SK.templates, JSON.stringify(appStore.templatesStore)); } catch (e) {}
}
export function getTemplate(templateID) {
  return appStore.templatesStore && appStore.templatesStore[String(templateID || "").trim()] || null;
}

// ---- Narrative skins ----
export function loadStoredNarrativeSkins(key) {
  try { const raw = localStorage.getItem(key || SK.skins); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredNarrativeSkins(data, key) {
  appStore.narrativeSkinsStore = data || {};
  try { localStorage.setItem(key || SK.skins, JSON.stringify(appStore.narrativeSkinsStore)); } catch (e) {}
}
export function getNarrativeSkins(narrativeID) {
  return (appStore.narrativeSkinsStore && appStore.narrativeSkinsStore[String(narrativeID || "").trim()]) || [];
}
export function getDefaultNarrativeSkin(narrativeID) {
  const skins = getNarrativeSkins(narrativeID);
  if (!skins.length) return null;
  return skins.find(function (s) { return s.isDefault; }) || skins[0];
}
export function resolveNarrativeSkin(narrativeID, requestedSkinID) {
  const skins = getNarrativeSkins(narrativeID);
  if (!skins.length) return null;
  if (requestedSkinID) {
    const found = skins.find(function (s) { return s.skinID === requestedSkinID; });
    if (found) return found;
  }
  return getDefaultNarrativeSkin(narrativeID);
}
export function isScrollyTemplate(template) {
  if (!template) return false;
  const n = String(template.templateName || "").toLowerCase();
  return n.indexOf("scrolly") >= 0 || n.indexOf("rolagem") >= 0;
}

// ---- Concept skins ----
export function loadStoredConceptSkins(key) {
  try { const raw = localStorage.getItem(key || SK.conceptSkins); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredConceptSkins(data, key) {
  appStore.conceptSkinsStore = data || {};
  try { localStorage.setItem(key || SK.conceptSkins, JSON.stringify(appStore.conceptSkinsStore)); } catch (e) {}
}
export function getConceptSkins(conceptID) {
  return (appStore.conceptSkinsStore && appStore.conceptSkinsStore[String(conceptID || "").trim().toUpperCase()]) || [];
}
export function getDefaultConceptSkin(conceptID) {
  const skins = getConceptSkins(conceptID);
  if (!skins.length) return null;
  return skins.find(function (s) { return s.isDefault; }) || skins[0];
}
export function resolveConceptSkin(conceptID, requestedSkinID) {
  const skins = getConceptSkins(conceptID);
  if (!skins.length) return null;
  if (requestedSkinID) {
    const found = skins.find(function (s) { return s.skinID === requestedSkinID; });
    if (found) return found;
  }
  return getDefaultConceptSkin(conceptID);
}

// ---- Concept texts (POV texts) ----
export function loadStoredConceptTexts(key) {
  try { const raw = localStorage.getItem(key || SK.conceptTexts); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredConceptTexts(data, key) {
  appStore.conceptTextsStore = data || {};
  try { localStorage.setItem(key || SK.conceptTexts, JSON.stringify(appStore.conceptTextsStore)); } catch (e) {}
}
export function getConceptTexts(conceptID) {
  return (appStore.conceptTextsStore && appStore.conceptTextsStore[String(conceptID || "").trim().toUpperCase()]) || [];
}
export function getDefaultConceptText(conceptID) {
  const texts = getConceptTexts(conceptID);
  if (!texts.length) return null;
  return texts.find(function (t) { return t.isDefault; }) || texts[0];
}

// ---- Skin data (generic contract-driven data) ----
export function loadStoredSkinData(key) {
  try { const raw = localStorage.getItem(key || SK.skinData); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}
export function saveStoredSkinData(data, key) {
  appStore.skinDataStore = data || {};
  try { localStorage.setItem(key || SK.skinData, JSON.stringify(appStore.skinDataStore)); } catch (e) {}
}
