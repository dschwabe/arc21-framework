/**
 * skins/linear/linear.js
 * Linear narrative reader skin — start cover and element pages.
 *
 * Call createLinearSkin(ctx); returns { renderStart, renderElement }.
 *
 * ctx fields expected:
 *   appStore, nContent(), nScroller(), nEl(),
 *   openNarrativeOverlay(id, mode),
 *   updateNavContext(concept),
 *   loadHelpConfig(), applyTooltips(root),
 *   wireUpGallery(el), buildGalleryHtml(scope, id, label),
 *   renderNotFound(slug),
 *   getNarrative(id)
 */

import { escapeHTML } from "../../js/utils.js?v=6";
import { linkifyNarrativeText, linkifyNarrativeInline, renderElementContentLinear, toRoman } from "../../js/render/content.js?v=6";
import { narrativeElementUrl, narrativeUrl, getNarrativeElement } from "../../js/graph/navigation.js?v=6";

export function createLinearSkin(ctx) {
  function renderStart(narrativeID) {
    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) {
      ctx.renderNotFound("narrative/" + narrativeID);
      return;
    }
    ctx.appStore.currentConceptSlug = null;

    const content = ctx.nContent();
    if (content) {
      const elemCount = (narrative.elements || []).length;
      content.innerHTML =
        '<div class="l-start">' +
          '<div class="l-start-inner">' +
            '<p class="l-start-tag">Narrativa ' + escapeHTML(narrativeID) + '</p>' +
            '<h1 class="l-start-h1">' + escapeHTML(narrative.narrativeTitle || narrativeID) + '</h1>' +
            '<div class="l-start-divider"><span>' + elemCount + ' capítulo' + (elemCount === 1 ? '' : 's') + '</span></div>' +
            '<div class="description l-start-summary">' + linkifyNarrativeText(narrative.narrativeSummary || "") + '</div>' +
            '<a class="l-start-cta" href="' + narrativeElementUrl(narrativeID, narrative.narrativeStart) + '">Começar narrativa</a>' +
          '</div>' +
        '</div>';
      var scr = ctx.nScroller(); if (scr) scr.scrollTop = 0;
    }
    ctx.openNarrativeOverlay(narrativeID, "linear");
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });
  }

  function renderElement(narrativeID, elementID) {
    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    const element = getNarrativeElement(elementID);
    if (!narrative || !element) {
      ctx.renderNotFound("narrative/" + narrativeID + "/element/" + elementID);
      return;
    }

    ctx.appStore.currentConceptSlug = null;
    const sequence = narrative.elements || [];
    const idx = sequence.indexOf(elementID);
    const prevID = idx > 0 ? sequence[idx - 1] : "";
    const nextID = idx >= 0 && idx < sequence.length - 1 ? sequence[idx + 1] : "";

    const elementGalleryHtml = ctx.buildGalleryHtml("element", elementID, element.elementTitle || elementID);
    const hasElementGallery = elementGalleryHtml && elementGalleryHtml.indexOf("gallery-empty") < 0;

    var dotsHtml = "";
    for (var di = 0; di < sequence.length; di++) {
      dotsHtml += '<span class="l-nav-dot' + (di === idx ? ' active' : '') + '"></span>';
    }

    const overlayContent = ctx.nContent();
    if (!overlayContent) return;
    overlayContent.innerHTML =
      '<div class="l-element-page">' +
        '<div class="l-element-body">' +
          '<p class="l-chapter-label">Capítulo ' + escapeHTML(toRoman(idx + 1)) + '</p>' +
          '<h1 class="l-title">' + linkifyNarrativeInline(element.elementTitle || elementID) + '</h1>' +
          (hasElementGallery ? '<div id="elementGalleryN" class="gallery">' + elementGalleryHtml + '</div>' : '') +
          '<div class="l-content">' + renderElementContentLinear(element.elementContent || "") + '</div>' +
        '</div>' +
        '<nav class="l-nav" aria-label="Navegação da narrativa">' +
          (prevID
            ? '<a class="l-nav-btn" href="' + narrativeElementUrl(narrativeID, prevID) + '">← Anterior</a>'
            : '<a class="l-nav-btn" href="' + narrativeUrl(narrativeID) + '">← Início</a>') +
          '<div class="l-nav-step"><div class="l-nav-step-dots">' + dotsHtml + '</div></div>' +
          (nextID
            ? '<a class="l-nav-btn primary" href="' + narrativeElementUrl(narrativeID, nextID) + '">Próximo →</a>'
            : '<button class="l-nav-btn primary l-fim-btn" type="button">Fim</button>') +
        '</nav>' +
      '</div>';

    var scr = ctx.nScroller(); if (scr) scr.scrollTop = 0;
    if (hasElementGallery) ctx.wireUpGallery(overlayContent.querySelector("#elementGalleryN"));

    // Wire "Fim" button (last element): minimize overlay → expand sidebar → flash sidebar
    var fimBtn = overlayContent.querySelector(".l-fim-btn");
    if (fimBtn) {
      fimBtn.addEventListener("click", function () {
        if (ctx.minimizeNarrativeOverlay) ctx.minimizeNarrativeOverlay();
        if (ctx.expandAppSidebar) ctx.expandAppSidebar();
        setTimeout(function () {
          if (ctx.flashAppSidebar) ctx.flashAppSidebar();
        }, 150);
      });
    }

    ctx.openNarrativeOverlay(narrativeID, "linear");
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });
  }

  return { renderStart, renderElement };
}
