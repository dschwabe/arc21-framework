/**
 * js/skin/loader.js
 * Skin lifecycle management and asset discovery.
 *
 * Exports:
 *   loadSkinIndex()               → Promise<index>
 *   ensureSkinCSS(skinID)         → void
 *   activateSkin(skinID)          → void
 *   getSkinInstance(skinID, ctx)  → Promise<skinInstance>
 *   loadSkinAssets(scope, id)     → Promise<{slotID: url}>
 */

const _skinIndexCache  = { value: null, promise: null };
const _skinCSSLoaded   = {};
const _skinInstances   = {};

const PROBE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "svg"];

// ---- Skin index ----

export async function loadSkinIndex() {
  if (_skinIndexCache.value) return _skinIndexCache.value;
  if (_skinIndexCache.promise) return _skinIndexCache.promise;
  _skinIndexCache.promise = fetch("skins/index.json")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      _skinIndexCache.value = data || { defaultSkin: "linear", skins: [] };
      return _skinIndexCache.value;
    })
    .catch(function () {
      _skinIndexCache.value = { defaultSkin: "linear", skins: [] };
      return _skinIndexCache.value;
    });
  return _skinIndexCache.promise;
}

export function getSkinMeta(index, skinID) {
  if (!index || !index.skins) return null;
  return index.skins.find(function (s) { return s.id === skinID; }) || null;
}

// ---- CSS loading ----

export function ensureSkinCSS(skinID) {
  if (_skinCSSLoaded[skinID]) return;
  _skinCSSLoaded[skinID] = true;
  var cssId = "skin-css-" + skinID;
  if (document.getElementById(cssId)) return;
  var link = document.createElement("link");
  link.id   = cssId;
  link.rel  = "stylesheet";
  link.href = "skins/" + skinID + "/" + skinID + ".css?v=4";
  document.head.appendChild(link);
}

// ---- Body class activation ----

export function activateSkin(skinID) {
  ensureSkinCSS(skinID);
  var classes = Array.from(document.body.classList);
  classes.forEach(function (c) {
    if (c.startsWith("skin-")) document.body.classList.remove(c);
  });
  if (skinID) document.body.classList.add("skin-" + skinID);
}

// ---- JS module lazy-loading ----

export async function getSkinInstance(skinID, ctx) {
  if (_skinInstances[skinID]) return _skinInstances[skinID];
  ensureSkinCSS(skinID);
  // Dynamic import path is relative to this module: ../../skins/<id>/<id>.js
  const mod = await import("../../skins/" + skinID + "/" + skinID + ".js?v=4");
  // Convert hyphenated IDs to PascalCase: "concept-default" → "ConceptDefault"
  const pascal = skinID.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
  const factoryName = "create" + pascal.charAt(0).toUpperCase() + pascal.slice(1) + "Skin";
  if (typeof mod[factoryName] !== "function") {
    throw new Error("Skin module skins/" + skinID + "/" + skinID + ".js does not export " + factoryName + "()");
  }
  _skinInstances[skinID] = mod[factoryName](ctx);
  return _skinInstances[skinID];
}

// ---- Asset discovery ----

/**
 * loadSkinAssets(scope, id)
 *
 * scope — "narrative" | "element" | "concept"
 * id    — for elements, pass "<narrativeID>/<elementID>" (e.g. "N002/E007")
 *         for narratives/concepts, pass the ID directly (e.g. "N002", "C024")
 *
 * Returns a plain object mapping slotID → resolved URL string.
 * Slots:
 *   "bg"  — matches bg.<ext> file  (reserved)
 *   "1","2","3","4" — numbered files, probed until first 404
 * Plus any named entries from urls.txt.
 *
 * For elements: if no "bg" is found in the element folder, the narrative folder
 * (assets/skins/<narrativeID>/) is checked as a fallback.
 */
export async function loadSkinAssets(scope, id) {
  const isConcept = String(scope || "").toLowerCase() === "concept";
  const folder = isConcept
    ? "assets/concepts/" + String(id || "").toUpperCase() + "/"
    : "assets/skins/"   + String(id || "").toUpperCase() + "/";
  const result = {};

  // 1. bg slot — not used for concepts
  if (!isConcept) {
    const bgUrl = await probeFile(folder, "bg");
    if (bgUrl) result["bg"] = bgUrl;
  }

  // 2. Numbered slots — probe 1, 2, 3 … until first gap (hard cap: 30)
  for (let n = 1; n <= 30; n++) {
    const url = await probeFile(folder, String(n));
    if (!url) break;
    result[String(n)] = url;
  }

  // 3. urls.txt — named and positional entries
  // Skipped in bundle/file:// mode (fetch unavailable; external URLs need internet).
  if (typeof __ARC21_ASSET_MANIFEST__ === "undefined") {
    try {
      const res = await fetch(folder + "urls.txt", { cache: "no-store" });
      if (res.ok) {
        var urlsCt = (res.headers.get("content-type") || "").toLowerCase();
        if (!urlsCt.startsWith("text/html")) {
          const text = await res.text();
          await applyUrlFile(text, result, folder);
        }
      }
    } catch (_) {}
  }

  // 4. Narrative-level bg fallback for elements
  if (!result["bg"] && scope === "element") {
    const narrativeID = String(id || "").toUpperCase().split("/")[0];
    if (narrativeID) {
      const narrativeFolder = "assets/skins/" + narrativeID + "/";
      const fallbackBg = await probeFile(narrativeFolder, "bg");
      if (fallbackBg) {
        result["bg"] = fallbackBg;
      } else if (typeof __ARC21_ASSET_MANIFEST__ === "undefined") {
        try {
          const res = await fetch(narrativeFolder + "urls.txt", { cache: "no-store" });
          if (res.ok) {
            var fallbackCt = (res.headers.get("content-type") || "").toLowerCase();
            if (!fallbackCt.startsWith("text/html")) {
              const text = await res.text();
              const temp = {};
              await applyUrlFile(text, temp, narrativeFolder);
              if (temp["bg"]) result["bg"] = temp["bg"];
            }
          }
        } catch (_) {}
      }
    }
  }

  return result;
}

// ---- Internal helpers ----

async function probeFile(folder, name) {
  // Bundle / file:// mode: fetch() is unavailable. Use the asset manifest
  // injected by build.py — a Set of every relative asset path that existed
  // at build time.
  /* global __ARC21_ASSET_MANIFEST__ */
  if (typeof __ARC21_ASSET_MANIFEST__ !== "undefined") {
    for (var i = 0; i < PROBE_EXTS.length; i++) {
      var url = folder + name + "." + PROBE_EXTS[i];
      if (__ARC21_ASSET_MANIFEST__.has(url)) return url;
    }
    return null;
  }
  // HTTP mode: probe via HEAD request.
  // SPA hosts (Firebase, Netlify, etc.) rewrite missing paths to index.html
  // and return 200 with Content-Type: text/html — reject those.
  for (var i = 0; i < PROBE_EXTS.length; i++) {
    var url = folder + name + "." + PROBE_EXTS[i];
    try {
      var res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        var ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.startsWith("text/html")) continue;
        return url;
      }
    } catch (_) {}
  }
  return null;
}

async function applyUrlFile(text, result, folder) {
  // Positional index tracks next unfilled numbered slot
  var nextPositional = 1;
  while (result[String(nextPositional)]) nextPositional++;

  const lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    // Named entry: "slotID: <url-or-relative-path>"
    // Key is [a-z][a-z0-9_-]*, no spaces; value is an absolute URL or a
    // relative path resolved against the folder passed by the caller.
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      if (/^[a-z][a-z0-9_-]*$/i.test(key) && rest.length > 0) {
        const isAbsolute = /^https?:\/\//i.test(rest) || rest.startsWith("//") || rest.startsWith("/");
        const resolved = isAbsolute ? rest : (folder ? folder + rest : rest);
        if (!result[key]) result[key] = resolved;  // local files win
        continue;
      }
    }

    // Positional entry: plain absolute URL
    if (/^https?:\/\//i.test(line)) {
      while (result[String(nextPositional)]) nextPositional++;
      result[String(nextPositional)] = line;
      nextPositional++;
    }
  }
}
