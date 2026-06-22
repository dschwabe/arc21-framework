/**
 * skins/concept-scrolly/concept-scrolly.js
 * Scrollytelling concept skin — adapted from scrollytelling-v2.js.
 *
 * Exported factory: createConceptScrollySkin(ctx)
 * ctx fields expected: appStore
 *
 * skinParams fields expected:
 *   dataSourceType — "narrative"
 *   dataSourceID   — narrativeID to use as panels source
 */

import { slugify, escapeHTML, escapeAttr } from "../../js/utils.js?v=18";
import { conceptUrl, resolveConceptSlug } from "../../js/graph/navigation.js?v=18";
import { loadSkinAssets } from "../../js/skin/loader.js?v=18";

export function createConceptScrollySkin(ctx) {

  // ── Engine constants ──────────────────────────────────────────────────────
  const TRANS_WIDTH = 0.72;
  const FLIP_START  = 0.50;
  const STACK_POS   = [
    { tx: 0,  ty: 0,  r: 0,   s: 1.00 },
    { tx: 11, ty: 9,  r: 1.8, s: 0.97 },
    { tx: 22, ty: 18, r: 3.5, s: 0.94 },
  ];

  // ── Easing ────────────────────────────────────────────────────────────────
  function ease(t) {
    t = Math.min(1, Math.max(0, t));
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }
  function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

  // ── Placeholder SVG ───────────────────────────────────────────────────────
  function placeholderSrc(caption, hue) {
    const words  = String(caption || "").split(" ");
    const lines  = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 18 && line) { lines.push(line); line = w; }
      else line = (line ? line + " " : "") + w;
    }
    if (line) lines.push(line);
    const lh = 22, startY = 267 - (lines.length * lh) / 2;
    const tspans = lines.map(function (l, i) { return '<tspan x="200" y="' + (startY + i * lh) + '">' + l + '</tspan>'; }).join("");
    const h2 = (hue + 35) % 360;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 533">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' + hue + ',22%,13%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + h2 + ',16%,8%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="400" height="533" fill="url(#g)"/>' +
      '<text font-family="Georgia,serif" font-size="13" fill="rgba(255,255,255,0.3)" text-anchor="middle" letter-spacing="0.06em">' + tspans + '</text>' +
      '</svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function bgGradient() {
    return "radial-gradient(ellipse at 35% 55%,hsl(225,28%,12%) 0%,hsl(230,22%,7%) 50%,hsl(235,18%,4%) 100%)";
  }

  // ── Text builder — wikilinks use real concept URLs ────────────────────────
  function buildTextHTML(rawText) {
    const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let html = "", last = 0, idx = 0, m;
    while ((m = re.exec(rawText)) !== null) {
      if (m.index > last) {
        const before = rawText.slice(last, m.index);
        for (const part of before.split(/(\s+)/)) {
          if (/^\s+$/.test(part)) { html += part; }
          else if (part.length > 0) { html += '<span class="scs-word-token" data-idx="' + idx + '">' + escapeHTML(part) + "</span>"; idx++; }
        }
      }
      const target = m[1].trim();
      const anchor = (m[2] || m[1]).trim();
      // resolveWikiTarget handles both label and ID lookups; fall back to slugify
      const slug   = resolveConceptSlug(slugify(target)) || slugify(target);
      const href   = conceptUrl(slug);
      html += '<span class="scs-word-token" data-idx="' + idx + '"><a class="wikilink" href="' + href + '" title="' + escapeAttr(target) + '">' + escapeHTML(anchor) + "</a></span>";
      idx++;
      last = m.index + m[0].length;
    }
    const tail = rawText.slice(last);
    for (const part of tail.split(/(\s+)/)) {
      if (/^\s+$/.test(part)) { html += part; }
      else if (part.length > 0) { html += '<span class="scs-word-token" data-idx="' + idx + '">' + escapeHTML(part) + "</span>"; idx++; }
    }
    return html;
  }

  // ── Font sizing ───────────────────────────────────────────────────────────
  function fitTextToPane(root) {
    const pane    = root.querySelector("#scs-text-pane");
    const content = root.querySelector("#scs-text-content");
    if (!pane || !content || !content.textContent.trim()) return;
    const targetH = pane.clientHeight * 0.65;
    let lo = 0.8, hi = 3.5;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      content.style.fontSize = mid + "rem";
      if (content.scrollHeight < targetH) lo = mid;
      else hi = mid;
    }
    content.style.fontSize = ((lo + hi) / 2) + "rem";
  }

  // ── Build initial HTML skeleton ───────────────────────────────────────────
  function buildSkeletonHTML(title, panelCount) {
    let dots = "";
    for (let i = 0; i < panelCount; i++) {
      dots += '<div class="scs-panel-dot' + (i === 0 ? " active" : "") + '"></div>';
    }
    return [
      '<div id="scs-progress-bar"></div>',
      '<div id="scs-scroll-container">',
      '  <div id="scs-sticky-viewport">',
      '    <div id="scs-bg-image"></div>',
      '    <header id="scs-top-bar">',
      '      <div id="scs-piece-title-small">' + title + '</div>',
      '      <div id="scs-top-bar-right">',
      '        <div id="scs-panel-counter">01 / ' + String(panelCount).padStart(2, "0") + '</div>',
      '      </div>',
      '    </header>',
      '    <div id="scs-accent-rule"></div>',
      '    <div id="scs-main-area">',
      '      <div id="scs-text-pane">',
      '        <div id="scs-piece-title-large">' + title + '</div>',
      '        <div id="scs-text-content"></div>',
      '        <div id="scs-panel-indicator">' + dots + '</div>',
      '      </div>',
      '      <div id="scs-vertical-rule"></div>',
      '      <div id="scs-carousel-pane" class="active">',
      '        <div id="scs-image-box-outer">',
      '          <div id="scs-carousel-frame"></div>',
      '          <div class="frame-overlay">',
      '            <div class="scs-corner tl"></div>',
      '            <div class="scs-corner tr"></div>',
      '            <div class="scs-corner bl"></div>',
      '            <div class="scs-corner br"></div>',
      '          </div>',
      '        </div>',
      '        <div id="scs-carousel-meta">',
      '          <div id="scs-carousel-label-row">',
      '            <span id="scs-carousel-label"></span>',
      '            <div id="scs-carousel-dots"></div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <footer id="scs-bottom-bar">',
      '      <div id="scs-scroll-hint"><span class="scs-bounce">↓</span>&nbsp;scroll</div>',
      '      <div id="scs-action-buttons"></div>',
      '    </footer>',
      '  </div>',
      '  <div id="scs-scroll-spacer"></div>',
      '</div>',
    ].join("\n");
  }

  // ── Card stack transforms ─────────────────────────────────────────────────
  function computeCardTransforms(panels, panelIdx, textProgress) {
    const panel = panels[panelIdx];
    const n = panel.images.length;
    if (!n) return [];
    const tp = textProgress < FLIP_START ? 0 : (textProgress - FLIP_START) / (1 - FLIP_START);
    const segSize = 1 / n;
    return panel.images.map(function (_, i) {
      const isLast    = i === n - 1;
      const exitEnd   = isLast ? Infinity : (i + 1) * segSize;
      const exitStart = isLast ? Infinity : exitEnd - TRANS_WIDTH * segSize;
      let exitedBefore = 0;
      for (let j = 0; j < i; j++) { if (j !== n - 1 && tp >= (j + 1) * segSize) exitedBefore++; }
      if (!isLast && tp >= exitEnd) {
        return { transform: "translateX(-85%) translateY(-18%) rotate(-14deg) scale(0.76)", opacity: 0, zIndex: 0 };
      }
      if (!isLast && tp >= exitStart && i === exitedBefore) {
        const p = (tp - exitStart) / (exitEnd - exitStart);
        const ep = ease(p);
        return {
          transform: "translateX(" + lerp(0, -85, ep) + "%) translateY(" + lerp(0, -18, ep) + "%) rotate(" + lerp(0, -14, ep) + "deg) scale(" + lerp(1, 0.76, ep) + ")",
          opacity: Math.max(0, 1 - p * 1.25),
          zIndex: n + 2,
        };
      }
      const naturalPos = i - exitedBefore;
      const prev       = exitedBefore;
      const prevEnd    = isLast ? Infinity : prev * segSize + segSize;
      const prevStart  = isLast ? Infinity : prevEnd - TRANS_WIDTH * segSize;
      const aboveExiting = (prev < i) && tp >= prevStart && tp < prevEnd;
      let tx, ty, r, s;
      if (aboveExiting) {
        const p  = (textProgress - prevStart) / (prevEnd - prevStart);
        const ep = ease(p);
        const from = STACK_POS[Math.min(naturalPos + 1, STACK_POS.length - 1)];
        const to   = STACK_POS[Math.min(naturalPos,     STACK_POS.length - 1)];
        tx = lerp(from.tx, to.tx, ep); ty = lerp(from.ty, to.ty, ep);
        r  = lerp(from.r,  to.r,  ep); s  = lerp(from.s,  to.s,  ep);
      } else {
        const sp = STACK_POS[Math.min(naturalPos, STACK_POS.length - 1)];
        tx = sp.tx; ty = sp.ty; r = sp.r; s = sp.s;
      }
      return { transform: "translateX(" + tx + "px) translateY(" + ty + "px) rotate(" + r + "deg) scale(" + s + ")", opacity: 1, zIndex: n - naturalPos };
    });
  }

  function activeCardIndex(panels, panelIdx, textProgress) {
    const n = panels[panelIdx].images.length;
    if (!n) return 0;
    const tp = textProgress < FLIP_START ? 0 : (textProgress - FLIP_START) / (1 - FLIP_START);
    const segSize = 1 / n;
    let top = 0;
    for (let i = 0; i < n - 1; i++) { if (tp >= (i + 1) * segSize) top = i + 1; }
    return Math.min(top, n - 1);
  }

  // ── Last-card descent ─────────────────────────────────────────────────────
  function computeLastCardTarget(root, cardRect) {
    const pane    = root.querySelector("#scs-text-pane");
    const content = root.querySelector("#scs-text-content");
    const paneRect    = pane.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const scale  = 0.78;
    const cardH  = cardRect.height * scale;
    const gap    = 28;
    const textBottom = contentRect.top + contentRect.height;
    const spaceBelow = paneRect.bottom - textBottom;
    const needed = cardH + gap;
    const delta  = Math.max(needed - spaceBelow, 0) + gap;
    const cardW  = cardRect.width * scale;
    const finalCardLeft = contentRect.left + (contentRect.width - cardW) / 2;
    const finalCardTop  = textBottom - delta + gap;
    return { x: finalCardLeft, y: finalCardTop, delta, scale };
  }

  // ── Scroll geometry ───────────────────────────────────────────────────────
  function makeCFG() {
    const vh = window.innerHeight;
    return {
      scrollPerText: vh * 2.0,
      scrollDescend: vh * 2.2,
      scrollPause:   vh * 0.7,
      scrollFade:    vh * 0.8,
      scrollAfter:   vh * 0.15,
    };
  }

  function panelHeight(cfg) {
    return cfg.scrollPerText + cfg.scrollDescend + cfg.scrollPause + cfg.scrollFade + cfg.scrollAfter;
  }
  function totalHeight(cfg, panelCount) { return panelCount * panelHeight(cfg); }

  function getState(cfg, panels, localY) {
    let offset = 0;
    const ph = panelHeight(cfg);
    for (let i = 0; i < panels.length; i++) {
      const isLast = i === panels.length - 1;
      if (localY < offset + ph || isLast) {
        const local    = Math.max(0, localY - offset);
        const textProg = Math.min(1, local / cfg.scrollPerText);
        const p1       = Math.max(0, local - cfg.scrollPerText);
        const descProg = Math.min(1, p1 / cfg.scrollDescend);
        const p2       = Math.max(0, p1 - cfg.scrollDescend);
        const pauseProg = Math.min(1, p2 / cfg.scrollPause);
        const p3       = Math.max(0, p2 - cfg.scrollPause);
        const fadeProg = Math.min(1, p3 / cfg.scrollFade);
        return { panelIndex: i, textProgress: textProg, descProg, pauseProg, fadeProg };
      }
      offset += ph;
    }
  }

  // ── Engine instance factory — called once per render ─────────────────────
  function createEngine(root, panels) {
    let cfg = makeCFG();
    let currentPanelIdx = -1;
    let wordTokens      = [];
    let lastProgress    = -1;
    let lastLabelIdx    = -1;
    let lastCardEl      = null;
    let lastCardFixed   = false;
    let lastCardRect    = null;
    let lastCardTarget  = null;

    function resetLastCard() {
      if (lastCardFixed && lastCardEl) {
        lastCardEl.style.cssText = "";
        lastCardFixed  = false;
        lastCardRect   = null;
        lastCardTarget = null;
      }
      const textEl = root.querySelector("#scs-text-content");
      if (textEl) textEl.style.transform = "";
    }

    function updateLastCard(panelIdx, descProg, pauseProg, fadeProg) {
      const n = panels[panelIdx].images.length;
      if (!n) return;
      const cards = root.querySelectorAll("#scs-carousel-frame .scs-stack-card");
      const card  = cards[n - 1];
      if (!card) { lastCardEl = null; return; }
      lastCardEl = card;
      const textEl = root.querySelector("#scs-text-content");
      if (descProg <= 0) {
        if (lastCardFixed) resetLastCard();
        else if (textEl) textEl.style.transform = "";
        return;
      }
      if (!lastCardFixed) {
        const rect = card.getBoundingClientRect();
        lastCardRect   = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        lastCardTarget = computeLastCardTarget(root, lastCardRect);
        card.style.position      = "fixed";
        card.style.left          = lastCardRect.left + "px";
        card.style.top           = lastCardRect.top  + "px";
        card.style.width         = lastCardRect.width  + "px";
        card.style.height        = lastCardRect.height + "px";
        card.style.margin        = "0";
        card.style.inset         = "auto";
        card.style.zIndex        = "100";
        card.style.transform     = "none";
        card.style.transformOrigin = "top left";
        lastCardFixed = true;
      }
      const t = lastCardTarget;
      const downCurve = ease(Math.min(1, descProg / 0.55));
      const leftCurve = ease(Math.max(0, (descProg - 0.35) / 0.65));
      let currentX  = lerp(lastCardRect.left, t.x, leftCurve);
      let currentY  = lerp(lastCardRect.top,  t.y, downCurve);
      let currentS  = lerp(1, t.scale, ease(descProg));
      let textShift = t.delta * ease(descProg);
      if (pauseProg > 0) {
        currentX  = t.x; currentY = t.y; currentS = t.scale; textShift = t.delta;
      }
      let opacity = 1;
      if (fadeProg > 0) {
        opacity   = Math.max(0, 1 - ease(fadeProg));
        textShift = t.delta * (1 - ease(fadeProg));
      }
      card.style.left      = currentX + "px";
      card.style.top       = currentY + "px";
      card.style.transform = "scale(" + currentS + ")";
      card.style.opacity   = String(opacity);
      if (textEl) textEl.style.transform = "translateY(-" + textShift + "px)";
    }

    function buildPanel(index) {
      resetLastCard();
      lastCardEl = null;
      const panel   = panels[index];
      const content = root.querySelector("#scs-text-content");
      if (!content) return;
      content.style.transform = "";
      content.style.opacity   = "0";
      content.innerHTML = buildTextHTML(panel.text);
      wordTokens   = Array.from(content.querySelectorAll(".scs-word-token"));
      lastProgress = -1;
      lastLabelIdx = -1;
      fitTextToPane(root);
      requestAnimationFrame(function () { content.style.opacity = "1"; });

      const frame = root.querySelector("#scs-carousel-frame");
      const hue   = 215 + index * 25;
      frame.innerHTML = "";
      panel.images.forEach(function (imgData, i) {
        const card = document.createElement("div");
        card.className = "scs-stack-card";
        const img = document.createElement("img");
        img.alt = imgData.caption || "";
        img.onerror = function () {
          img.onerror = null;
          const failedSrc = img.src;
          if (/^https?:\/\//.test(failedSrc)) {
            const fr = document.createElement("iframe");
            fr.src = failedSrc;
            fr.style.cssText = "width:100%;height:100%;border:none;display:block;";
            fr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
            img.replaceWith(fr);
          } else {
            img.src = placeholderSrc(imgData.caption || "Imagem " + (i + 1), hue + i * 22);
          }
        };
        img.src = imgData.src;
        card.appendChild(img);
        frame.appendChild(card);
      });

      const dotsEl = root.querySelector("#scs-carousel-dots");
      if (dotsEl) {
        dotsEl.innerHTML = "";
        panel.images.forEach(function (_, i) {
          const d = document.createElement("div");
          d.className = "scs-carousel-dot";
          dotsEl.appendChild(d);
        });
      }

      const counter = root.querySelector("#scs-panel-counter");
      if (counter) {
        counter.textContent = String(index + 1).padStart(2, "0") + " / " + String(panels.length).padStart(2, "0");
      }
      root.querySelectorAll("#scs-panel-indicator .scs-panel-dot").forEach(function (d, i) {
        d.classList.toggle("active", i === index);
      });

      currentPanelIdx = index;
      const cards = frame.querySelectorAll(".scs-stack-card");
      computeCardTransforms(panels, index, 0).forEach(function (t, i) {
        if (cards[i]) {
          cards[i].style.transform = t.transform;
          cards[i].style.opacity   = String(t.opacity);
          cards[i].style.zIndex    = String(t.zIndex);
        }
      });
    }

    function updateTextReveal(progress) {
      if (progress === lastProgress) return;
      lastProgress = progress;
      const reveal = Math.round(progress * wordTokens.length);
      wordTokens.forEach(function (tok, i) { tok.classList.toggle("revealed", i < reveal); });
    }

    function updateCardStack(panelIdx, textProgress) {
      const n     = panels[panelIdx].images.length;
      const cards = root.querySelectorAll("#scs-carousel-frame .scs-stack-card");
      computeCardTransforms(panels, panelIdx, textProgress).forEach(function (t, i) {
        if (!cards[i]) return;
        if (lastCardFixed && i === n - 1) return;
        cards[i].style.transform = t.transform;
        cards[i].style.opacity   = String(Math.max(0, Math.min(1, t.opacity)));
        cards[i].style.zIndex    = String(t.zIndex);
      });
      const activeIdx = activeCardIndex(panels, panelIdx, textProgress);
      if (activeIdx !== lastLabelIdx) {
        lastLabelIdx = activeIdx;
        root.querySelectorAll("#scs-carousel-dots .scs-carousel-dot").forEach(function (d, i) {
          d.classList.toggle("active", i === activeIdx);
        });
        const imgData = panels[panelIdx].images[activeIdx];
        const lbl = root.querySelector("#scs-carousel-label");
        if (lbl) lbl.textContent = imgData ? (imgData.caption || "") : "";
      }
    }

    function updateProgressBar(localY) {
      const th = totalHeight(cfg, panels.length);
      const pct = th > 0 ? Math.min(100, (localY / th) * 100) : 0;
      const pb = root.querySelector("#scs-progress-bar");
      if (pb) pb.style.width = pct + "%";
      const ar = root.querySelector("#scs-accent-rule");
      if (ar) ar.style.background =
        "linear-gradient(to right,var(--scs-accent) " + pct + "%,var(--scs-border) " + pct + "%)";
    }

    function onScroll(containerOffset) {
      const localY = Math.max(0, window.scrollY - containerOffset);
      const state  = getState(cfg, panels, localY);
      if (!state) return;
      if (state.panelIndex !== currentPanelIdx) buildPanel(state.panelIndex);
      updateTextReveal(state.textProgress);
      updateCardStack(state.panelIndex, state.textProgress);
      updateLastCard(state.panelIndex, state.descProg, state.pauseProg, state.fadeProg);
      updateProgressBar(localY);
      root.classList.toggle("scs-at-end",
        state.panelIndex === panels.length - 1 && state.fadeProg >= 0.5);
      const started = state.textProgress > 0;
      const titleLarge = root.querySelector("#scs-piece-title-large");
      const titleSmall = root.querySelector("#scs-piece-title-small");
      if (titleLarge) titleLarge.classList.toggle("hidden", started);
      if (titleSmall) titleSmall.classList.toggle("visible", started);
    }

    function init() {
      // Compute container offset (absolute document position of root)
      const containerOffset = root.getBoundingClientRect().top + window.scrollY;

      const spacer = root.querySelector("#scs-scroll-spacer");
      if (spacer) spacer.style.height = totalHeight(cfg, panels.length) + "px";

      const bgEl = root.querySelector("#scs-bg-image");
      if (bgEl) bgEl.style.background = bgGradient();

      buildPanel(0);
      onScroll(containerOffset);

      const scrollHandler = function () { onScroll(containerOffset); };
      window.addEventListener("scroll", scrollHandler, { passive: true });

      const hintHandler = function () {
        const h = root.querySelector("#scs-scroll-hint");
        if (h) h.style.opacity = "0";
        window.removeEventListener("scroll", hintHandler);
      };
      window.addEventListener("scroll", hintHandler);

      const resizeHandler = function () {
        cfg = makeCFG();
        const spacer2 = root.querySelector("#scs-scroll-spacer");
        if (spacer2) spacer2.style.height = totalHeight(cfg, panels.length) + "px";
        fitTextToPane(root);
      };
      window.addEventListener("resize", resizeHandler);

      // Return cleanup
      return function () {
        window.removeEventListener("scroll", scrollHandler);
        window.removeEventListener("scroll", hintHandler);
        window.removeEventListener("resize", resizeHandler);
      };
    }

    return { init };
  }

  // ── Cleanup across renders ────────────────────────────────────────────────
  let _cleanupFns = [];
  function cleanup() {
    _cleanupFns.forEach(function (fn) { fn(); });
    _cleanupFns = [];
  }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render(slug, skinParams) {
    cleanup();

    const app = document.getElementById("app");
    if (!app) return;

    const narrativeID = skinParams.dataSourceID || "";
    const ns          = ctx.appStore.narrativeStore;
    const narrative   = narrativeID ? (ns && ns.byId && ns.byId[narrativeID]) : null;

    if (!narrative) {
      app.innerHTML = '<section class="hero"><div class="hero-card"><p class="eyebrow">Skin não configurada</p>' +
        '<p>O skin <strong>concept-scrolly</strong> requer um narrativeID configurado na coluna <code>dataSourceID</code> da aba Concept Skins.</p></div></section>';
      return;
    }

    const elementIDs = narrative.elements || [];
    const title      = narrative.narrativeTitle || slug;

    // Build panels with placeholder images first
    const hues = elementIDs.map(function (_, i) { return 215 + i * 25; });
    const panels = elementIDs.map(function (eid, i) {
      const el = ns.elementsById && ns.elementsById[eid];
      return {
        text: (el && el.elementContent) || "",
        images: [
          { src: placeholderSrc("Imagem 1", hues[i]),       caption: "" },
          { src: placeholderSrc("Imagem 2", hues[i] + 22),  caption: "" },
          { src: placeholderSrc("Imagem 3", hues[i] + 44),  caption: "" },
        ],
      };
    });

    // Neutralise .app container constraints (padding, max-width, centering)
    // so the skin can occupy the full viewport width.
    // CSS :has() does this declaratively; the JS below is a fallback.
    const _origPad = app.style.padding;
    const _origMxW = app.style.maxWidth;
    const _origW   = app.style.width;
    const _origMar = app.style.margin;
    app.style.padding   = "0";
    app.style.maxWidth  = "100%";
    app.style.width     = "100%";
    app.style.margin    = "0";
    _cleanupFns.push(function () {
      app.style.padding   = _origPad;
      app.style.maxWidth  = _origMxW;
      app.style.width     = _origW;
      app.style.margin    = _origMar;
    });

    // Build DOM
    const topbarEl = document.querySelector(".topbar");
    const topH     = topbarEl ? topbarEl.offsetHeight : 0;
    const root     = document.createElement("div");
    root.className = "concept-scrolly-root";
    root.style.setProperty("--scs-top", topH + "px");
    root.innerHTML = buildSkeletonHTML(title, panels.length);
    app.innerHTML  = "";
    app.appendChild(root);

    // Scroll to top before measuring containerOffset
    window.scrollTo(0, 0);

    // Init engine with placeholder images
    const engine  = createEngine(root, panels);
    const cleanFn = engine.init();
    _cleanupFns.push(cleanFn);

    // Sidebar overlay
    let _sidebarPane = null;
    let _sidebarBackdrop = null;
    let _sidebarTab = null;  // set after button creation

    function _syncSidebarTab() {
      if (_sidebarTab) _sidebarTab.textContent = _sidebarPane ? "‹" : "›";
    }

    function _closeSidebar() {
      if (_sidebarPane)     { _sidebarPane.remove();     _sidebarPane     = null; }
      if (_sidebarBackdrop) { _sidebarBackdrop.remove(); _sidebarBackdrop = null; }
      _syncSidebarTab();
    }

    function _openSidebar() {
      if (_sidebarPane) return;
      const pane = document.createElement("aside");
      pane.className = "concept-index-pane sidebar-overlay";
      const _t = ctx.t || function (k, fb) { return fb !== undefined ? fb : k; };
      pane.setAttribute("aria-label", _t("sidebar.ariaLabel", "Índice de navegação"));
      pane.innerHTML =
        '<div class="sidebar-overlay-header">' +
          '<span>' + _t("sidebar.conceptIndex", "Índice de conceitos") + '</span>' +
          '<button class="sidebar-toggle-btn" type="button" aria-label="' + _t("sidebar.collapse.ariaLabel", "Recolher navegação") + '">‹</button>' +
        '</div>' +
        '<details class="sidebar-section concept-index-section">' +
          '<summary>' + _t("sidebar.conceptIndex", "Índice de conceitos") + '</summary>' +
          '<p>' + _t("sidebar.conceptIndexHint", "Selecione qualquer conceito do grafo.") + '</p>' +
          '<div id="conceptIndexList" class="concept-index-list"></div>' +
        '</details>' +
        '<details class="sidebar-section narrative-index-section" open>' +
          '<summary>' + _t("sidebar.narratives", "Narrativas") + '</summary>' +
          '<div id="narrativeList" class="narrative-list"></div>' +
        '</details>';
      ctx.renderConceptIndex(pane, slug);
      pane.querySelector(".sidebar-toggle-btn").addEventListener("click", _closeSidebar);
      const backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      backdrop.addEventListener("click", _closeSidebar);
      document.body.appendChild(backdrop);
      document.body.appendChild(pane);
      _sidebarPane     = pane;
      _sidebarBackdrop = backdrop;
      _syncSidebarTab();
    }

    const sidebarTab = document.createElement("button");
    sidebarTab.className = "skin-sidebar-tab";
    sidebarTab.setAttribute("type", "button");
    sidebarTab.setAttribute("aria-label", (ctx.t || function(k,fb){return fb||k;})("sidebar.expand.ariaLabel", "Abrir índice"));
    sidebarTab.textContent = "›";
    sidebarTab.addEventListener("click", function () {
      if (_sidebarPane) { _closeSidebar(); } else { _openSidebar(); }
    });
    root.appendChild(sidebarTab);
    _sidebarTab = sidebarTab;
    _cleanupFns.push(_closeSidebar);

    // Load real assets in background and update images in DOM.
    // `root` may be detached if the user navigates away — all queries
    // return null and are guarded, so this is harmless.
    (async function () {
      // Narrative background + "Para saber mais" button wiring
      try {
        const narAssets = await loadSkinAssets("narrative", narrativeID);
        const bgEl = root.querySelector("#scs-bg-image");
        if (bgEl && narAssets.bg) {
          const probe = new Image();
          probe.onload = function () {
            bgEl.style.backgroundImage    = "url('" + narAssets.bg + "')";
            bgEl.style.backgroundSize     = "cover";
            bgEl.style.backgroundPosition = "center 30%";
          };
          probe.src = narAssets.bg;
        }

        const moreUrl = narAssets["more"] || "";
        if (moreUrl) {
          const actionsEl = root.querySelector("#scs-action-buttons");
          if (actionsEl) {
            actionsEl.innerHTML =
              '<button class="scs-action-btn scs-action-more" type="button">Para saber mais…</button>' +
              '<button class="scs-action-btn scs-action-sair" type="button">Sair</button>';

            const moreOverlay = document.createElement("div");
            moreOverlay.id = "scs-more-overlay";
            moreOverlay.hidden = true;
            moreOverlay.innerHTML =
              '<div class="scs-more-bar">' +
                '<button class="scs-more-close" type="button" aria-label="Fechar">×</button>' +
              '</div>' +
              '<iframe class="scs-more-frame" src="" scrolling="yes" frameborder="0"></iframe>';
            root.appendChild(moreOverlay);

            const moreFrame = moreOverlay.querySelector(".scs-more-frame");
            const moreClose = moreOverlay.querySelector(".scs-more-close");

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
              moreOverlay.hidden = false;
            }
            function closeMoreOverlay() { moreOverlay.hidden = true; }
            function flashScs() {
              _openSidebar();
              if (_sidebarPane) {
                _sidebarPane.classList.remove("scrolly-sidebar-flash");
                void _sidebarPane.offsetWidth;
                _sidebarPane.classList.add("scrolly-sidebar-flash");
                _sidebarPane.addEventListener("animationend", function () {
                  _sidebarPane.classList.remove("scrolly-sidebar-flash");
                }, { once: true });
              }
            }

            actionsEl.querySelector(".scs-action-more").addEventListener("click", openMoreOverlay);
            moreClose.addEventListener("click", closeMoreOverlay);
            actionsEl.querySelector(".scs-action-sair").addEventListener("click", function () {
              closeMoreOverlay();
              flashScs();
            });
            _cleanupFns.push(closeMoreOverlay);
          }
        }
      } catch (_) {}

      // Per-element images
      for (let i = 0; i < elementIDs.length; i++) {
        try {
          const eid    = elementIDs[i];
          const assets = await loadSkinAssets("element", narrativeID + "/" + eid);
          const imgs   = [];
          const elData = ns.elementsById && ns.elementsById[eid];
          const title2 = (elData && elData.elementTitle) || "";
          for (let n = 1; ; n++) {
            const url = assets[String(n)];
            if (!url) break;
            imgs.push({ src: url, caption: n === 1 ? title2 : "" });
          }
          if (imgs.length) {
            panels[i].images = imgs;
            // Update img.src of any already-rendered cards for this panel
            const frame = root.querySelector("#scs-carousel-frame");
            if (frame) {
              const cards = frame.querySelectorAll(".scs-stack-card");
              imgs.forEach(function (imgData, ci) {
                const card = cards[ci];
                if (!card) return;
                const img = card.querySelector("img");
                if (img) {
                  img.onerror = function () {
                    img.onerror = null;
                    const failedSrc = img.src;
                    if (/^https?:\/\//.test(failedSrc)) {
                      const fr = document.createElement("iframe");
                      fr.src = failedSrc;
                      fr.style.cssText = "width:100%;height:100%;border:none;display:block;";
                      fr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
                      img.replaceWith(fr);
                    }
                  };
                  img.src = imgData.src;
                  img.alt = imgData.caption || "";
                }
              });
              const lbl = root.querySelector("#scs-carousel-label");
              if (lbl && imgs[0]) lbl.textContent = imgs[0].caption || "";
            }
          }
        } catch (_) {}
      }
    })();
  }

  return { render };
}
