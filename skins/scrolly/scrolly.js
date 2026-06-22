/**
 * skins/scrolly/scrolly.js
 * Scrollytelling skin — two-column layout with right-pane slideshow.
 *
 * Call createScrollySkin(ctx) once; returns { render }.
 * render(narrativeID) builds the full overlay content.
 *
 * ctx fields expected:
 *   appStore, nContent(), nScroller(), nEl(),
 *   openNarrativeOverlay(id, mode),
 *   updateNavContext(concept),
 *   loadHelpConfig(), applyTooltips(root),
 *   renderNotFound(slug), renderLinearStart(narrativeID),
 *   getNarrative(id),
 *   loadSkinAssets(scope, id)  — returns Promise<{slotID: url}>
 */

import { getNarrativeElement } from "../../js/graph/navigation.js?v=18";
import { splitElementPanels, parsePanelBlocks, renderPanelHtml, renderInlineMarkdown, toRoman, shortChapterLabel } from "../../js/render/content.js?v=18";
import { escapeHTML, escapeAttr } from "../../js/utils.js?v=18";

export function createScrollySkin(ctx) {
  async function render(narrativeID, skinParams) {
    skinParams = skinParams || {};
    const accentColor    = skinParams.accentColor    || ACCENT;
    const overlayOpacity = skinParams.overlayOpacity != null ? Number(skinParams.overlayOpacity) : null;

    ctx.updateNavContext(null);
    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) { ctx.renderNotFound("narrative/" + narrativeID); return; }
    ctx.appStore.currentConceptSlug = null;

    const elements = (narrative.elements || [])
      .map(function (eid) { return getNarrativeElement(eid); })
      .filter(Boolean);
    if (!elements.length) {
      ctx.renderLinearStart(narrativeID);
      return;
    }

    ensureScrollyFonts();

    // Pre-resolve probe-based slot maps (local asset files).
    const [narrativeSlots, ...elementSlotsList] = await Promise.all([
      ctx.loadSkinAssets("narrative", narrativeID),
      ...elements.map(function (el) {
        return ctx.loadSkinAssets("element", narrativeID + "/" + el.elementID);
      })
    ]);
    const narrativeBgUrl = narrativeSlots["bg"] || "";
    const moreUrl        = narrativeSlots["more"] || "";

    // Merge probe slots with Media-tab entries from the mediaStore.
    const slotMaps = {};
    elements.forEach(function (el, i) {
      const probed = elementSlotsList[i] || {};
      const merged = Object.assign({}, probed);
      if (ctx.getMediaFor) {
        const mediaItems = ctx.getMediaFor("element", el.elementID);
        mediaItems.forEach(function (item, mi) {
          const key = String(mi + 1);
          if (!merged[key]) {
            const url = ctx.mediaFilePath
              ? ctx.mediaFilePath("element", el.elementID, item)
              : (String(item.file || "").trim());
            if (url) merged[key] = url;
          }
        });
      }
      slotMaps[el.elementID] = merged;
    });

    const overlayContent = ctx.nContent();
    if (!overlayContent) return;
    overlayContent.innerHTML = buildScrollyHtml(narrative, elements, narrativeID, slotMaps, narrativeBgUrl, accentColor, overlayOpacity, moreUrl);
    const overlayScroller = ctx.nScroller();
    if (overlayScroller) overlayScroller.scrollTop = 0;
    ctx.openNarrativeOverlay(narrativeID, "scrolly");
    initScrollyBehaviors(overlayContent, overlayScroller);
    ctx.loadHelpConfig().then(function () { ctx.applyTooltips(ctx.nEl()); });

    // ── Sidebar tab for narrative scrolly ─────────────────────────
    var existingTab = document.querySelector(".scrolly-sidebar-tab");
    if (existingTab) existingTab.remove();

    var sidebarPane = null;
    var sidebarBackdrop = null;
    var sidebarTab = null;  // set after button creation

    function syncSidebarTab() {
      if (sidebarTab) sidebarTab.textContent = sidebarPane ? "‹" : "›";
    }

    function closeSidebarOverlay() {
      if (sidebarPane)     { sidebarPane.remove();     sidebarPane     = null; }
      if (sidebarBackdrop) { sidebarBackdrop.remove(); sidebarBackdrop = null; }
      syncSidebarTab();
    }

    function openSidebarOverlay() {
      if (sidebarPane) return;
      var pane = document.createElement("aside");
      pane.className = "concept-index-pane sidebar-overlay";
      pane.setAttribute("aria-label", "Índice de navegação");
      pane.innerHTML =
        '<div class="sidebar-overlay-header">' +
          '<span>Índice de conceitos</span>' +
          '<button class="sidebar-toggle-btn" type="button" aria-label="Fechar índice">‹</button>' +
        '</div>' +
        '<details class="sidebar-section concept-index-section">' +
          '<summary>Índice de conceitos</summary>' +
          '<p>Selecione qualquer conceito do grafo.</p>' +
          '<div id="conceptIndexList" class="concept-index-list"></div>' +
        '</details>' +
        '<details class="sidebar-section narrative-index-section" open>' +
          '<summary>Narrativas</summary>' +
          '<div id="narrativeList" class="narrative-list"></div>' +
        '</details>';
      if (ctx.renderConceptIndex) ctx.renderConceptIndex(pane, null);
      pane.querySelector(".sidebar-toggle-btn").addEventListener("click", closeSidebarOverlay);
      var backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      backdrop.addEventListener("click", closeSidebarOverlay);
      document.body.appendChild(backdrop);
      document.body.appendChild(pane);
      sidebarPane     = pane;
      sidebarBackdrop = backdrop;
      syncSidebarTab();
    }

    var tab = document.createElement("button");
    tab.className = "scrolly-sidebar-tab skin-sidebar-tab";
    tab.setAttribute("type", "button");
    tab.setAttribute("aria-label", "Abrir índice");
    tab.textContent = "›";
    tab.addEventListener("click", function () {
      if (sidebarPane) { closeSidebarOverlay(); } else { openSidebarOverlay(); }
    });
    document.body.appendChild(tab);
    sidebarTab = tab;

    function cleanupTab() {
      tab.remove();
      closeSidebarOverlay();
      window.removeEventListener("hashchange", cleanupTab);
    }
    window.addEventListener("hashchange", cleanupTab);

    // ── "Para saber mais" / "Sair" button wiring ──────────────────
    if (moreUrl) {
      var moreOverlay = overlayContent.querySelector(".scrolly-more-overlay");
      var moreFrame   = overlayContent.querySelector(".scrolly-more-frame");
      var moreClose   = overlayContent.querySelector(".scrolly-more-close");
      var moreBtn     = overlayContent.querySelector(".scrolly-action-more");
      var sairBtn     = overlayContent.querySelector(".scrolly-action-sair");

      function openMoreOverlay() {
        if (moreFrame && !moreFrame.getAttribute("src")) {
          moreFrame.addEventListener("load", function () {
            try {
              var iDoc = moreFrame.contentDocument ||
                (moreFrame.contentWindow && moreFrame.contentWindow.document);
              if (!iDoc || iDoc.querySelector("link[data-site-css]")) return;
              var link = iDoc.createElement("link");
              link.rel = "stylesheet";
              link.href = new URL("default.css", document.baseURI).href;
              link.setAttribute("data-site-css", "");
              (iDoc.head || iDoc.documentElement).insertBefore(link, (iDoc.head || iDoc.documentElement).firstChild);
            } catch (e) {}
          }, { once: true });
          moreFrame.src = moreUrl;
        }
        if (moreOverlay) moreOverlay.hidden = false;
      }
      function closeMoreOverlay() {
        if (moreOverlay) moreOverlay.hidden = true;
      }
      function flashScrollySidebar() {
        openSidebarOverlay();
        if (sidebarPane) {
          sidebarPane.classList.remove("scrolly-sidebar-flash");
          void sidebarPane.offsetWidth; // force reflow
          sidebarPane.classList.add("scrolly-sidebar-flash");
          sidebarPane.addEventListener("animationend", function () {
            sidebarPane.classList.remove("scrolly-sidebar-flash");
          }, { once: true });
        }
      }

      if (moreBtn)  moreBtn.addEventListener("click", openMoreOverlay);
      if (moreClose) moreClose.addEventListener("click", closeMoreOverlay);
      if (sairBtn)  sairBtn.addEventListener("click", function () {
        closeMoreOverlay();
        flashScrollySidebar();
      });
    }
  }

  return { render };
}

// ---- Private helpers ----

const ACCENT = "#C9A961";

function ensureScrollyFonts() {
  if (document.querySelector("link[data-scrolly-fonts]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap";
  l.setAttribute("data-scrolly-fonts", "");
  document.head.appendChild(l);
}

function buildScrollyHtml(narrative, elements, narrativeID, slotMaps, narrativeBgUrl, accentColor, overlayOpacity, moreUrl) {
  const accent = accentColor || ACCENT;
  let html = '<div class="scrolly-stage" style="--scrolly-accent: ' + escapeAttr(accent) + ';">';

  html += '<div class="scrolly-bar"><div class="scrolly-bar-fill"></div></div>';

  // Single fixed background that persists across all chapters
  if (narrativeBgUrl) {
    html += '<div class="scrolly-fixed-bg" style="background-image: url(' + escapeAttr(narrativeBgUrl) + ')"></div>';
  }

  html += '<div class="scrolly-top">';
  html += '<a class="scrolly-back" href="#/" aria-label="Voltar à home">← Voltar</a>';
  html += '</div>';

  if (elements.length > 1) {
    html += '<nav class="scrolly-nav" aria-label="Capítulos">';
    elements.forEach(function (el, i) {
      html += '<a href="#scrolly-' + escapeAttr(el.elementID) + '">' +
        escapeHTML(toRoman(i + 1)) + ' · ' + escapeHTML(shortChapterLabel(el.elementTitle, 14)) +
        '</a>';
    });
    html += '</nav>';
  }

  html += '<section class="scrolly-hero">';
  html += '<div class="scrolly-hero-body scrolly-fu">';
  if (narrative.eyebrow) html += '<p class="scrolly-eyebrow">' + escapeHTML(narrative.eyebrow) + '</p>';
  html += '<h1 class="scrolly-title">' + escapeHTML(narrative.narrativeTitle || narrativeID) + '</h1>';
  const sub = narrative.subtitle || narrative.narrativeSummary;
  if (sub) html += '<p class="scrolly-sub">' + renderInlineMarkdown(sub) + '</p>';
  if (narrative.year) html += '<p class="scrolly-year">— ' + escapeHTML(narrative.year) + ' —</p>';
  html += '<p class="scrolly-cue">Role para começar</p>';
  html += '</div>';
  html += '</section>';

  elements.forEach(function (el, i) {
    html += renderScrollyChapter(el, i, slotMaps[el.elementID] || {}, narrativeBgUrl, overlayOpacity);
  });

  if (narrative.outroQuote) {
    html += '<section class="scrolly-outro">';
    html += '<p class="scrolly-outro-q">' + renderInlineMarkdown(narrative.outroQuote) + '</p>';
    html += '<div class="scrolly-rule"></div>';
    if (narrative.outroMeta) html += '<p class="scrolly-outro-meta">' + escapeHTML(narrative.outroMeta) + '</p>';
    html += '</section>';
  }

  // ── End-of-narrative actions (only when a "more" HTML file is declared) ──
  if (moreUrl) {
    html += '<section class="scrolly-actions scrolly-fu">';
    html += '<button class="scrolly-action-btn scrolly-action-more" type="button">Para saber mais…</button>';
    html += '<button class="scrolly-action-btn scrolly-action-sair" type="button">Sair</button>';
    html += '</section>';
    html += '<div class="scrolly-more-overlay" hidden>';
    html += '<div class="scrolly-more-bar">';
    html += '<button class="scrolly-more-close" type="button" aria-label="Fechar">×</button>';
    html += '</div>';
    html += '<iframe class="scrolly-more-frame" src="" scrolling="yes" frameborder="0"></iframe>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderScrollyChapter(el, idx, slots, narrativeBgUrl, overlayOpacity) {
  const panels = splitElementPanels(el.elementContent).map(parsePanelBlocks);
  const sectionID = "scrolly-" + el.elementID;

  // Only render a per-chapter bg if it's element-specific (differs from narrative bg)
  const chapterBg = slots["bg"] && slots["bg"] !== narrativeBgUrl ? slots["bg"] : "";

  // Collect numbered slide images (slots "1"–"4")
  const slideUrls = [];
  for (let i = 1; i <= 4; i++) {
    if (slots[String(i)]) slideUrls.push(slots[String(i)]);
  }

  let html = '<section class="scrolly-chapter" id="' + escapeAttr(sectionID) + '">';

  // Per-chapter bg override (only when element has its own image distinct from narrative bg)
  if (chapterBg) {
    html += '<div class="scrolly-bg" style="background-image: url(' + escapeAttr(chapterBg) + ')"></div>';
  }
  // Gradient overlay for text legibility (render whenever there is any background)
  if (chapterBg || narrativeBgUrl) {
    const ovlStyle = (overlayOpacity != null && !isNaN(overlayOpacity))
      ? ' style="opacity:' + escapeAttr(String(overlayOpacity)) + '"'
      : '';
    html += '<div class="scrolly-ovl"' + ovlStyle + '></div>';
  }

  // Two-column layout
  html += '<div class="scrolly-columns">';

  // Left: transparent text pane (65%)
  html += '<div class="scrolly-text-pane">';
  html += '<div class="scrolly-text-inner scrolly-fu">';
  html += '<p class="scrolly-chlbl">Capítulo ' + escapeHTML(toRoman(idx + 1)) + '</p>';
  html += '<h2 class="scrolly-h2">' + renderInlineMarkdown(el.elementTitle || "") + '</h2>';
  panels.forEach(function (blocks) {
    html += renderPanelHtml(blocks);
  });
  html += '</div>';
  html += '</div>';

  // Right: image slideshow pane (35%)
  html += '<div class="scrolly-image-pane scrolly-fu">';
  slideUrls.forEach(function (url, i) {
    html += '<div class="scrolly-slide' + (i === 0 ? ' active' : '') +
      '" style="background-image: url(' + escapeAttr(url) + ')"></div>';
  });
  html += '</div>';

  html += '</div>'; // .scrolly-columns
  html += '</section>';
  return html;
}

// ---- Behaviour helpers ----

function fitTextPane(pane) {
  const inner = pane.querySelector(".scrolly-text-inner");
  if (!inner) return;
  const targetH = pane.clientHeight * 0.80;
  if (targetH <= 0) return;
  inner.style.fontSize = ""; // reset to CSS default
  const defaultSize = parseFloat(getComputedStyle(inner).fontSize) || 16;
  const naturalH = inner.scrollHeight;
  if (naturalH === 0) return;
  // Binary search: find the largest font-size that keeps scrollHeight ≤ targetH
  // Range: 10px → 3× the default (allows upscaling short text as well as downscaling)
  let lo = 10, hi = Math.min(defaultSize * 3, 72);
  for (let n = 0; n < 16; n++) {
    const mid = (lo + hi) / 2;
    inner.style.fontSize = mid + "px";
    if (inner.scrollHeight <= targetH) lo = mid; else hi = mid;
  }
  inner.style.fontSize = lo + "px";
}

function initSlideshows(host) {
  // Build a deferred list — each pane's interval starts only once the user
  // has scrolled it into view (prevents auto-flipping on page open).
  var pending = [];
  Array.from(host.querySelectorAll(".scrolly-image-pane")).forEach(function (pane) {
    var slides = Array.from(pane.querySelectorAll(".scrolly-slide"));
    if (slides.length > 1) pending.push({ pane: pane, slides: slides, cur: 0 });
  });

  // Returns a checker to call on each scroll event.
  return function checkVisible() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    for (var i = pending.length - 1; i >= 0; i--) {
      var item = pending[i];
      var r = item.pane.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        pending.splice(i, 1);
        (function (it) {
          setInterval(function () {
            it.slides[it.cur].classList.remove("active");
            it.cur = (it.cur + 1) % it.slides.length;
            it.slides[it.cur].classList.add("active");
          }, 4000);
        })(item);
      }
    }
  };
}

function initScrollyBehaviors(host, scrollRoot) {
  const bar = host.querySelector(".scrolly-bar-fill");
  const fus = Array.from(host.querySelectorAll(".scrolly-fu"));
  const navLinks = Array.from(host.querySelectorAll(".scrolly-nav a"));
  const chapters = Array.from(host.querySelectorAll(".scrolly-chapter[id]"));
  const navMap = {};
  navLinks.forEach(function (a) {
    const href = a.getAttribute("href") || "";
    const id = href.indexOf("#") === 0 ? href.slice(1) : "";
    if (id) navMap[id] = a;
  });

  const scrollEl = scrollRoot || null;
  let raf = 0;

  function tick() {
    raf = 0;
    const vh  = scrollEl ? scrollEl.clientHeight  : document.documentElement.clientHeight;
    const max = scrollEl ? (scrollEl.scrollHeight - scrollEl.clientHeight) : (document.documentElement.scrollHeight - vh);
    const scrollTop = scrollEl ? scrollEl.scrollTop : document.documentElement.scrollTop;

    if (bar) bar.style.width = (max > 0 ? (scrollTop / max * 100) : 0) + "%";

    for (let i = fus.length - 1; i >= 0; i--) {
      const el = fus[i];
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh - 40) {
        el.classList.add("scrolly-in");
        fus.splice(i, 1);
      }
    }

    if (chapters.length && navLinks.length) {
      let bestIdx = -1, bestDist = Infinity;
      const vmid = vh / 2;
      chapters.forEach(function (c, i) {
        const r = c.getBoundingClientRect();
        const mid = (r.top + r.bottom) / 2;
        const dist = Math.abs(mid - vmid);
        if (r.top < vh && r.bottom > 0 && dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      navLinks.forEach(function (a) { a.classList.remove("on"); });
      if (bestIdx >= 0) {
        const id = chapters[bestIdx].id;
        if (navMap[id]) navMap[id].classList.add("on");
      }
    }
  }

  // Image slideshows — checker is called on scroll, not on init, so the
  // first element's carousel doesn't start flipping before the user scrolls.
  var checkSlideshows = initSlideshows(host);

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      tick();
      checkSlideshows();
    });
  }

  if (scrollEl) {
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
  } else {
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  window.addEventListener("resize", onScroll, { passive: true });

  // Font fitting — run once on load, then on resize
  const textPanes = Array.from(host.querySelectorAll(".scrolly-text-pane"));
  function refitAll() { textPanes.forEach(fitTextPane); }
  refitAll();
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(refitAll);
    ro.observe(host);
  }

  tick();
  setTimeout(tick, 50);
  setTimeout(tick, 300);
  // Re-fit after fonts have loaded
  setTimeout(refitAll, 800);
}
