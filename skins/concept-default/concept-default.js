/**
 * skins/concept-default/concept-default.js
 * Default concept page skin.
 *
 * Exported factory: createConceptDefaultSkin(ctx)
 * ctx fields expected:
 *   appStore
 *   renderConceptIndex(fragment, activeSlug)
 *   buildGalleryHtml(scope, scopeID, label)  → HTML string
 *   wireUpGallery(el)
 *   loadHelpConfig()  → Promise
 *   applyTooltips(root)
 */

import { escapeHTML, escapeAttr } from "../../js/utils.js?v=6";
import { linkifyDescription } from "../../js/render/content.js?v=6";
import { conceptUrl, narrativeElementUrl } from "../../js/graph/navigation.js?v=6";

// ── HTML-file content helpers ──────────────────────────────────────────────
// If the content field is a filename ending in .htm/.html, render it in a
// seamless iframe instead of as inline text.  The HTML file may link to
// ../../default.css to inherit the site's base styles and add its own <style>
// to override them.  The iframe auto-sizes to its content height.

function isHtmlFileRef(value) {
  return typeof value === "string" && /\.html?$/i.test(value.trim());
}

function mountHtmlFrame(container, src) {
  container.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.src = src;
  frame.className = "concept-html-frame";
  frame.setAttribute("scrolling", "no");
  frame.style.cssText = "width:100%; border:none; display:block; min-height:4rem;";
  frame.addEventListener("load", function () {
    try {
      const doc = frame.contentDocument ||
                  (frame.contentWindow && frame.contentWindow.document);
      if (!doc) return;
      function fit() {
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (h > 0) frame.style.height = h + "px";
      }
      fit();
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(fit).observe(doc.body);
      }
    } catch (e) { /* cross-origin guard — should not happen on same host */ }
  });
  container.appendChild(frame);
}

export function createConceptDefaultSkin(ctx) {

  function render(slug, skinParams) {
    const app    = document.getElementById("app");
    const graph  = ctx.appStore.graph;
    const concept = graph && graph.bySlug && graph.bySlug[slug];
    if (!concept || !app) return;

    const tpl = document.getElementById("conceptTemplate");
    app.innerHTML = "";
    const fragment = tpl.content.cloneNode(true);
    const _t = ctx.t || function (k, fb) { return fb !== undefined ? fb : k; };
    if (ctx.applyI18n) ctx.applyI18n(fragment);

    // ── In-page skin select (top-right of description area) ─────────────────
    const skinSelectEl = fragment.querySelector("#conceptSkinSelect");
    if (skinSelectEl) {
      const perConcept = (ctx.appStore.conceptSkinsStore &&
        ctx.appStore.conceptSkinsStore[(concept.conceptID || "").toUpperCase()]) || [];
      const globalSkins = skinParams.globalConceptSkins || [];
      const options = perConcept.length >= 2
        ? perConcept.map(function (s) { return { id: s.skinID, name: s.skinName || s.skinID }; })
        : globalSkins.length >= 2
        ? globalSkins.map(function (s) { return { id: s.id, name: s.name || s.id }; })
        : [];
      if (options.length >= 2) {
        options.forEach(function (opt) {
          const o = document.createElement("option");
          o.value = opt.id;
          o.textContent = opt.name;
          skinSelectEl.appendChild(o);
        });
        skinSelectEl.value = skinParams.activeSkinID || options[0].id;
        skinSelectEl.classList.add("has-options");
        skinSelectEl.addEventListener("change", function () {
          location.hash = conceptUrl(slug) + "?skin=" + encodeURIComponent(skinSelectEl.value);
        });
      }
    }

    // ── Sidebar ──────────────────────────────────────────────────────────────
    ctx.renderConceptIndex(fragment, slug);

    // ── Header ───────────────────────────────────────────────────────────────
    fragment.querySelector("#conceptTitle").textContent = concept.concept;

    // ── POV text switcher ────────────────────────────────────────────────────
    const descEl    = fragment.querySelector("#conceptDescription");
    const conceptID = (concept.conceptID || "").toUpperCase();
    const povTexts  = (ctx.appStore.conceptTextsStore && ctx.appStore.conceptTextsStore[conceptID]) || [];

    if (povTexts.length > 0) {
      const activePovRef = { entry: povTexts.find(function (t) { return t.isDefault; }) || povTexts[0] };

      function renderPov(entry) {
        if (isHtmlFileRef(entry.text)) {
          mountHtmlFrame(descEl, "data/content/" + entry.text.trim());
        } else {
          descEl.innerHTML = linkifyDescription(entry.text);
        }
      }

      if (povTexts.length > 1) {
        const switcher = document.createElement("div");
        switcher.className = "pov-switcher";
        povTexts.forEach(function (entry) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pov-btn" + (entry === activePovRef.entry ? " active" : "");
          btn.textContent = entry.pov || entry.style || _t("concept.pov.fallback", "Perspectiva");
          btn.addEventListener("click", function () {
            activePovRef.entry = entry;
            switcher.querySelectorAll(".pov-btn").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            renderPov(entry);
          });
          switcher.appendChild(btn);
        });
        descEl.parentNode.insertBefore(switcher, descEl);
      }

      renderPov(activePovRef.entry);
    } else {
      if (isHtmlFileRef(concept.description)) {
        mountHtmlFrame(descEl, "data/content/" + concept.description.trim());
      } else {
        descEl.innerHTML = linkifyDescription(concept.description);
      }
    }

    // ── External reference link ───────────────────────────────────────────────
    if (concept.externalRef) {
      const pipe = concept.externalRef.indexOf("|");
      const refUrl   = (pipe >= 0 ? concept.externalRef.slice(pipe + 1) : concept.externalRef).trim();
      const refLabel = (pipe >= 0 ? concept.externalRef.slice(0, pipe)  : concept.externalRef).trim();
      if (refUrl) {
        const extLink = document.createElement("p");
        extLink.className = "concept-external-ref";
        extLink.innerHTML = _t("concept.externalRef.prompt", "Aprofunde este tema em") +
          ' <a href="' + escapeAttr(refUrl) + '" target="_blank" rel="noopener">' +
          escapeHTML(refLabel || refUrl) + '</a>.';
        descEl.parentNode.insertBefore(extLink, descEl.nextSibling);
      }
    }

    // ── Relations ────────────────────────────────────────────────────────────
    const relationsList = fragment.querySelector("#relationsList");
    if (!concept.relations || !concept.relations.length) {
      relationsList.innerHTML = "<p>" + _t("concept.relatedEmpty", "Nenhuma relação informada para este conceito.") + "</p>";
    } else {
      const seen = {};
      concept.relations.forEach(function (rel) {
        const key = rel.targetSlug + "|" + rel.relationName + "|" +
                    (rel.relationCategory || "") + "|" + rel.explanation;
        if (seen[key]) return;
        seen[key] = true;

        const targetConcept = graph.bySlug && graph.bySlug[rel.targetSlug];
        const targetLabel   = targetConcept && targetConcept.concept
          ? targetConcept.concept : rel.target;

        const card = document.createElement("div");
        card.className = "relation-card";
        card.innerHTML =
          '<div class="relation-summary">' +
            '<a href="' + escapeAttr(conceptUrl(rel.targetSlug)) + '">' +
              escapeHTML(targetLabel) +
            '</a>' +
            _t("concept.relation.connector", " é ") + '<span class="relation-name">' +
              escapeHTML(rel.relationName || "Relação") +
            '</span>' +
            (rel.relationCategory
              ? ' <span class="relation-category parenthetical">(' +
                  escapeHTML(rel.relationCategory) + ')</span>'
              : '') +
          '</div>' +
          '<p>' + linkifyDescription(rel.explanation || "") + '</p>';
        relationsList.appendChild(card);
      });
    }

    // ── Narrative refs ───────────────────────────────────────────────────────
    const narrativeRefsSection = fragment.querySelector("#narrativeRefs");
    if (narrativeRefsSection && ctx.appStore.narrativeStore) {
      const conceptID = (concept.conceptID || "").toUpperCase();
      const ns        = ctx.appStore.narrativeStore;
      const hits      = [];
      (ns.order || []).forEach(function (nid) {
        const narrative = ns.byId[nid];
        if (!narrative) return;
        const firstEl = (narrative.elements || []).find(function (eid) {
          const el = ns.elementsById[eid];
          if (!el || !el.referencedConceptIDs) return false;
          return el.referencedConceptIDs
            .split(",").map(function (s) { return s.trim().toUpperCase(); })
            .indexOf(conceptID) >= 0;
        });
        if (firstEl) hits.push({ narrative: narrative, elementID: firstEl });
      });
      if (hits.length) {
        let html = '<h2>' + _t("concept.narrativeRefsTitle", "Aparece nas narrativas") + '</h2><ul class="narrative-refs-list">';
        hits.forEach(function (h) {
          html += '<li><a href="' +
            escapeAttr(narrativeElementUrl(h.narrative.narrativeID, h.elementID)) +
            '?highlight=' + encodeURIComponent(conceptID) + '">' +
            escapeHTML(h.narrative.narrativeTitle || h.narrative.narrativeID) +
            '</a></li>';
        });
        html += '</ul>';
        narrativeRefsSection.innerHTML = html;
      }
    }

    // ── Gallery ──────────────────────────────────────────────────────────────
    const galleryHost = fragment.querySelector("#conceptGallery");
    if (galleryHost) {
      galleryHost.innerHTML =
        ctx.buildGalleryHtml("concept", concept.conceptID || "", concept.concept);
    }

    app.appendChild(fragment);
    ctx.wireUpGallery(app.querySelector("#conceptGallery"));
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(app); });

    // Async: probe assets/concepts/{ID}/ for numbered image files (1.png, 1.jpg, …).
    // Populates the gallery without requiring a Media sheet in the XLSX.
    (async function () {
      var assets = await ctx.loadSkinAssets("concept", conceptID);
      var items = [];
      for (var n = 1; ; n++) {
        var url = assets[String(n)];
        if (!url) break;
        var mediaType = ctx.autoMediaType ? ctx.autoMediaType(url) : "image";
        items.push({ src: url, type: mediaType, alt: concept.concept || "", caption: "", sourceUrl: "", sourceTitle: "" });
      }
      if (!items.length) return;
      var galleryHost = app.querySelector("#conceptGallery");
      if (!galleryHost) return;
      galleryHost.innerHTML = ctx.buildGalleryHtml("concept", conceptID, concept.concept, items);
      ctx.wireUpGallery(galleryHost);
    })();
  }

  return { render };
}
