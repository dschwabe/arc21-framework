/**
 * skins/scrolly-grammar-iv/scrolly-grammar-iv.js
 * Grammar IV — Fantasmagoria Palimpsesto
 *
 * Data-driven scrollytelling skin for the ARC21 Manifesto.
 * Narrative content lives in conceptual_graph.xlsx (Narratives + Elements tabs).
 * Each element's content starts with a ##giv ...## frontmatter line carrying
 * Grammar IV rendering metadata (spectral image, opacity, blend, transition,
 * specialType, dual).
 * Spectral image assets are resolved via ctx.loadSkinAssets("narrative", id).
 *
 * Call createScrollyGrammarIvSkin(ctx) once; returns { render }.
 *
 * ctx fields used:
 *   getNarrative(id), nContent(), nScroller(), nEl(),
 *   openNarrativeOverlay(id, mode), updateNavContext(concept),
 *   renderNotFound(slug), loadHelpConfig(), applyTooltips(root),
 *   loadSkinAssets(scope, id) → Promise<{slotID: url}>
 */

import { getNarrativeElement } from "../../js/graph/navigation.js?v=10";

export function createScrollyGrammarIvSkin(ctx) {

  async function render(narrativeID /* skinParams */) {
    ctx.updateNavContext(null);

    const narrative = ctx.getNarrative(narrativeID);
    if (!narrative) { ctx.renderNotFound('narrative/' + narrativeID); return; }

    // ── 1. Resolve elements ─────────────────────────────────────────
    const elements = (narrative.elements || [])
      .map(eid => getNarrativeElement(eid))
      .filter(Boolean)
      .map(el => ({ ...el, ...parseGIVFrontmatter(el.elementContent) }));

    if (!elements.length) { ctx.renderNotFound('narrative/' + narrativeID); return; }

    // ── 2. Resolve image asset URLs ─────────────────────────────────
    const slots = await ctx.loadSkinAssets('narrative', narrativeID);
    const imgUrl = id => slots[id] || '';

    // ── 3. Fonts ────────────────────────────────────────────────────
    ensureGIVFonts();

    // ── 4. Build and inject HTML ────────────────────────────────────
    const container = ctx.nContent();
    if (!container) return;
    container.innerHTML = buildManifestoHtml(narrative, elements);

    const scroller = ctx.nScroller();
    if (scroller) scroller.scrollTop = 0;

    ctx.openNarrativeOverlay(narrativeID, 'scrolly-grammar-iv');

    // ── 5. Fixed overlay layers (appended to body) ──────────────────
    const fixed = buildFixedLayers(imgUrl);
    ctx.nEl().appendChild(fixed);

    // ── 6. SVG infrastructure ───────────────────────────────────────
    buildVignette(fixed);
    buildProgressTrack(fixed, scroller);
    buildCursor(fixed);

    // ── 7. Spectral driver ──────────────────────────────────────────
    const sections = Array.from(container.querySelectorAll('.giv-section'));
    const driver   = new SpectralDriver(fixed, imgUrl, scroller);
    driver.start(sections);

    // ── 8. Callout SVGs + pulse line ────────────────────────────────
    const benjWrap  = container.querySelector('.giv-callout-benjamin .giv-callout-wrap');
    if (benjWrap)  benjWrap.innerHTML  = buildBenjaminCallout(imgUrl('halo-benjamin'));

    const didiWrap  = container.querySelector('.giv-callout-didi .giv-callout-wrap');
    if (didiWrap)  didiWrap.innerHTML  = buildDidiCallout(imgUrl('halo-didi'));

    const pulseWrap = container.querySelector('.giv-has-pulse .giv-pulse-wrap');
    if (pulseWrap) pulseWrap.innerHTML = buildPulseLine();

    // ── 9. Typewriter ───────────────────────────────────────────────
    const openingEl = elements.find(el => el.giv_specialType === 'opening');
    if (openingEl) startTypewriter(container, openingEl.giv_body);

    // ── 10. Tooltips ────────────────────────────────────────────────
    ctx.loadHelpConfig().then(() => ctx.applyTooltips(ctx.nEl()));

    // ── 11. Cleanup ─────────────────────────────────────────────────
    function cleanup() {
      fixed.remove();
      driver.stop();
      window.removeEventListener('hashchange', cleanup);
    }
    window.addEventListener('hashchange', cleanup);
  }

  return { render };
}

// ════════════════════════════════════════════════════════════════════
// Frontmatter parser
// Reads the ##giv key=value ...## prefix from elementContent.
// Returns an object with giv_* properties plus giv_body (remaining text).
// ════════════════════════════════════════════════════════════════════

function parseGIVFrontmatter(raw) {
  raw = String(raw || '');
  const fmMatch = raw.match(/^##giv\s+([^#]+)##\n?/);
  const meta = {};
  if (fmMatch) {
    fmMatch[1].trim().split(/\s+/).forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq < 0) return;
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      meta['giv_' + k] = v;
    });
  }
  meta.giv_body = fmMatch ? raw.slice(fmMatch[0].length).trimStart() : raw;
  return meta;
}

// ════════════════════════════════════════════════════════════════════
// HTML builder — data-driven
// ════════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildManifestoHtml(narrative, elements) {
  let html = '<main class="giv-manifesto">';
  elements.forEach((el, i) => { html += buildSection(el, i); });
  html += '</main>';
  return html;
}

function buildSection(el, idx) {
  const st        = el.giv_specialType || '';
  const spectral  = el.giv_spectral || 'bg1';
  const opacity   = el.giv_spectralOpacity || el.giv_opacity || '0.15';
  const blend     = el.giv_blend || 'screen';
  const transition= el.giv_transition || 'crossfade';
  const dual      = el.giv_dual || '';
  const id        = `giv-e-${esc(el.elementID)}`;

  const classes = [
    'giv-section',
    st === 'opening'          ? 'giv-void giv-opening'           : '',
    st === 'breathe'          ? 'giv-void'                       : '',
    st === 'arc21-birth'      ? 'giv-void'                       : '',
    st === 'archive-question' ? 'giv-archive-question'           : '',
    st === 'close'            ? 'giv-void giv-close-section'     : '',
    st === 'fullvh-center-xl' ? 'giv-fullvh'                     : '',
    st === 'callout-benjamin' ? 'giv-fullvh giv-callout-benjamin': '',
    st === 'callout-didi'     ? 'giv-fullvh giv-callout-didi'   : '',
    st === 'cyborg'           ? 'giv-cyborg'                     : '',
    st === 'pulse'            ? 'giv-has-pulse'                  : '',
  ].filter(Boolean).join(' ');

  const dualAttr = dual ? ` data-dual-spectral="${esc(dual)}"` : '';

  return `<section id="${id}" class="${classes}"
    data-spectral="${esc(spectral)}" data-spectral-opacity="${esc(opacity)}"
    data-blend="${esc(blend)}" data-transition="${esc(transition)}"${dualAttr}>
  ${buildSectionInner(el, st)}
</section>`;
}

function buildSectionInner(el, st) {
  const body     = el.giv_body || '';
  const title    = el.elementTitle || '';

  // ── Special: archive-question (centred italic, wide col) ───────
  if (st === 'archive-question') {
    const bodyHtml = buildBodyHtml(body, st);
    return `<div class="giv-inner giv-center giv-wide">${bodyHtml}</div>`;
  }

  // ── Special: opening / typewriter ──────────────────────────────
  if (st === 'opening') {
    return `<div class="giv-inner giv-center">
      <h1 class="giv-opening-title" data-giv-typewriter="${esc(body)}"></h1>
    </div>`;
  }

  // ── Special: callout sections ───────────────────────────────────
  if (st === 'callout-benjamin' || st === 'callout-didi') {
    return `<div class="giv-inner giv-center"><div class="giv-callout-wrap"></div></div>`;
  }

  // ── Special: close / address ────────────────────────────────────
  if (st === 'close') {
    const addrHtml = body.replace(/\n/g, '<br>');
    return `<div class="giv-inner giv-center">
      <address class="giv-address">${addrHtml}</address>
    </div>`;
  }

  // ── Special: double title ───────────────────────────────────────
  const t2match = body.match(/^##title2##(.+?)##/);
  const bodyText = t2match ? body.slice(t2match[0].length).trimStart() : body;

  // ── Build title element ─────────────────────────────────────────
  let titleHtml = '';
  if (title) {
    const titleClasses = [
      'giv-title',
      st === 'large-normal'      ? 'giv-title--large giv-title--normal' : '',
      st === 'standalone-normal' ? 'giv-title--normal giv-standalone'   : '',
      st === 'double-title'      ? 'giv-title--xl'                      : '',
      st === 'fullvh-center-xl'  ? 'giv-title--xl giv-title--centered'  : '',
    ].filter(Boolean).join(' ');
    titleHtml = `<h2 class="${titleClasses}">${esc(title)}</h2>`;
    if (st === 'double-title' && t2match) {
      titleHtml += `<p class="giv-title giv-title--xl giv-title--second">${esc(t2match[1])}</p>`;
    }
  }

  // ── Kicker ──────────────────────────────────────────────────────
  let kickerHtml = '';
  if (st === 'kicker') {
    kickerHtml = `<p class="giv-kicker">Mas talvez</p>`;
  }

  // ── Body paragraphs ─────────────────────────────────────────────
  const bodyHtml = buildBodyHtml(bodyText, st);

  // ── Fullvh center ──────────────────────────────────────────────
  if (st === 'fullvh-center-xl') {
    return `<div class="giv-inner">${titleHtml}${bodyHtml}</div>`;
  }

  // ── Pulse appendage ─────────────────────────────────────────────
  const pulseHtml = st === 'pulse' ? '<div class="giv-callout-wrap giv-pulse-wrap"></div>' : '';

  const centreWrap = (st === 'listening') ? 'giv-center' : '';

  return `<div class="giv-inner ${centreWrap}">
    ${kickerHtml}${titleHtml}${bodyHtml}${pulseHtml}
  </div>`;
}

function buildBodyHtml(bodyText, st) {
  if (!bodyText) return '';
  const paras = bodyText.split(/\n\n+/).filter(s => s.trim());
  if (!paras.length) return '';

  const isEntre        = st === 'entre-lines';
  const isBreathe      = st === 'breathe';
  const isArc21Birth   = st === 'arc21-birth';
  const isListening    = st === 'listening';
  const isKicker       = st === 'kicker';
  const isInline       = st === 'inline-title';
  const isArchiveQ     = st === 'archive-question';

  const paraHtml = paras.map(p => {
    p = p.trim();
    // Inline title marker
    const inlineMatch = isInline && p.match(/^##inline-title##(.+?)##$/);
    if (inlineMatch) {
      return `<p class="giv-title-inline">${esc(inlineMatch[1])}</p>`;
    }
    if (isEntre)      return `<p class="giv-entre">${esc(p)}</p>`;
    if (isBreathe)    return `<p>${esc(p)}</p>`;
    if (isArc21Birth) return `<p class="giv-birth-line">${esc(p)}</p>`;
    if (isListening)  return `<p class="giv-listening">${esc(p)}</p>`;
    if (isArchiveQ)   return `<p class="giv-archive-q-p">${esc(p)}</p>`;
    if (isKicker)     return `<p class="giv-single-italic">${esc(p)}</p>`;

    // Constellations: wrap category names in hover spans
    if (st === 'constellations') return `<p>${buildConstellationPara(p)}</p>`;
    return `<p>${esc(p)}</p>`;
  }).join('\n');

  const wrapClass = isBreathe    ? 'giv-body giv-body--breathe' :
                    isArc21Birth ? 'giv-body giv-body--birth'   : 'giv-body';
  return `<div class="${wrapClass}">\n${paraHtml}\n</div>`;
}

// Wrap the 6 nebulosa names with hover-colour spans
const NEBULOSAS = [
  'Território & Infraestrutura',
  'Eu & Corpo',
  'Ciclos de vida & afeto',
  'Poder & Extração',
  'Discurso, Cultura & Estética',
  'Identidades Marcadas',
];

function buildConstellationPara(text) {
  let out = esc(text);
  NEBULOSAS.forEach((name, i) => {
    const hue = (i % 5) + 1;
    const escaped = esc(name);
    out = out.replace(escaped,
      `<span class="giv-cat" data-hue="${hue}">${escaped}</span>`);
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════
// Fixed overlay layers
// ════════════════════════════════════════════════════════════════════

function buildFixedLayers(imgUrl) {
  const wrap = document.createElement('div');
  wrap.className = 'giv-fixed';

  const grain = document.createElement('div');
  grain.className = 'giv-grain';
  const grainUrl = imgUrl('grain');
  if (grainUrl) grain.style.backgroundImage = `url(${grainUrl})`;
  wrap.appendChild(grain);

  const spectral = document.createElement('div');
  spectral.className = 'giv-spectral';
  ['giv-spectral-current','giv-spectral-next','giv-spectral-dual'].forEach(id => {
    const img = document.createElement('img');
    img.className = 'giv-spectral-img';
    img.id = id;
    img.alt = '';
    img.style.opacity = '0';
    spectral.appendChild(img);
  });
  wrap.appendChild(spectral);

  const svgLayer = document.createElement('div');
  svgLayer.className = 'giv-svg-layer';
  wrap.appendChild(svgLayer);

  const cursor = document.createElement('div');
  cursor.className = 'giv-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  wrap.appendChild(cursor);

  return wrap;
}

// ════════════════════════════════════════════════════════════════════
// SVG infrastructure
// ════════════════════════════════════════════════════════════════════

function buildVignette(fixed) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'giv-vignette');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<defs>
    <radialGradient id="giv-vg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="transparent" stop-opacity="0"/>
      <stop offset="100%" stop-color="#100a14" stop-opacity="0.50" id="giv-vg-stop"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#giv-vg)"/>`;
  fixed.querySelector('.giv-svg-layer').appendChild(svg);
}

function buildProgressTrack(fixed, scroller) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'giv-progress-track');
  svg.setAttribute('viewBox', '0 0 20 800');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <line x1="10" y1="0" x2="10" y2="800" stroke="#6b4d7a" stroke-width="1" opacity="0.45"/>
    <circle id="giv-track-dot" cx="10" cy="0" r="3.5" fill="#b8a0c8" class="giv-track-dot"/>`;
  fixed.querySelector('.giv-svg-layer').appendChild(svg);

  const dot = svg.querySelector('#giv-track-dot');
  function update() {
    const el = scroller || document.documentElement;
    const total = el.scrollHeight - el.clientHeight;
    dot.setAttribute('cy', total > 0 ? (el.scrollTop / total) * 800 : 0);
  }
  (scroller || window).addEventListener('scroll', update, { passive: true });
  update();
}

function buildCursor(fixed) {
  const el = fixed.querySelector('.giv-cursor');
  el.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
    <line x1="14" y1="2"  x2="14" y2="26" stroke="#b8a0c8" stroke-width="0.8" opacity="0.55"/>
    <line x1="2"  y1="14" x2="26" y2="14" stroke="#b8a0c8" stroke-width="0.8" opacity="0.35"/>
    <circle cx="14" cy="14" r="2" fill="#b8a0c8" opacity="0.7"/>
  </svg>`;
  document.addEventListener('mousemove', e => {
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';
  });
}

// ════════════════════════════════════════════════════════════════════
// Spectral driver
// ════════════════════════════════════════════════════════════════════

function sectionVisibility(section) {
  const rect = section.getBoundingClientRect();
  const vh   = window.innerHeight;
  const overlap = Math.max(0, Math.min(vh, rect.bottom) - Math.max(0, rect.top));
  const fraction = overlap / vh;
  const RAMP = vh * 0.30;
  let ramp = 1;
  if (rect.top > 0)         ramp = Math.min(1, (vh - rect.top)  / RAMP);
  else if (rect.bottom < vh) ramp = Math.min(1, rect.bottom      / RAMP);
  return Math.max(0, fraction * ramp);
}

function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

class SpectralDriver {
  constructor(fixed, imgUrl, scroller) {
    this.imgUrl   = imgUrl;
    this.scroller = scroller;
    this.slots    = [
      { el: document.getElementById('giv-spectral-current'), bg: null, op: 0, tgt: 0 },
      { el: document.getElementById('giv-spectral-next'),    bg: null, op: 0, tgt: 0 },
    ];
    this.dual    = document.getElementById('giv-spectral-dual');
    this.dualOp  = 0; this.dualTgt = 0;
    this.LERP    = 0.055;
    this.revealed = new Set();
    this.THRESHOLD = 0.38;
    this._timer  = null;
  }

  _slotFor(bgName) {
    const ex = this.slots.find(s => s.bg === bgName);
    if (ex) return ex;
    const slot = this.slots[0].op <= this.slots[1].op ? this.slots[0] : this.slots[1];
    const url = this.imgUrl(bgName);
    if (url && !slot.el.src.includes(bgName)) slot.el.src = url;
    slot.bg = bgName;
    slot.el.style.mixBlendMode = 'screen';
    return slot;
  }

  update(sections) {
    let bestV = 0, best = null, secV = 0, sec_ = null;
    for (const s of sections) {
      const v = smoothstep(sectionVisibility(s));
      if (v > bestV)       { sec_ = best; secV = bestV; best = s; bestV = v; }
      else if (v > secV)   { sec_ = s;   secV = v; }
    }

    const desired = new Map();
    if (best) {
      desired.set(best.dataset.spectral, parseFloat(best.dataset.spectralOpacity) * bestV);
    }
    if (sec_) {
      const secBg  = sec_.dataset.spectral;
      const secOp  = parseFloat(sec_.dataset.spectralOpacity) * secV;
      const existing = desired.get(secBg);
      // When two adjacent sections share the same bg, use the higher opacity
      // so the image never dims during the scroll between them.
      desired.set(secBg, existing !== undefined ? Math.max(existing, secOp) : secOp);
    }

    for (const slot of this.slots) slot.tgt = 0;
    for (const [bg, op] of desired) this._slotFor(bg).tgt = op;

    if (best) {
      const blend = best.dataset.blend || 'screen';
      const slot  = this._slotFor(best.dataset.spectral);
      if (slot.el.style.mixBlendMode !== blend) slot.el.style.mixBlendMode = blend;
    }

    if (best && bestV >= this.THRESHOLD && !this.revealed.has(best.id)) {
      this.revealed.add(best.id);
      revealSection(best);
    }

    const cyborg = best && best.classList.contains('giv-cyborg');
    if (cyborg) {
      const url = this.imgUrl(best.dataset.dualSpectral || 'bg8b');
      if (url && !this.dual.src.includes('bg8b')) this.dual.src = url;
      this.dualTgt = parseFloat(best.dataset.spectralOpacity) * 0.7 * bestV;
    } else { this.dualTgt = 0; }

    const stop = document.getElementById('giv-vg-stop');
    if (stop && best) {
      const deep = best.classList.contains('giv-void');
      stop.setAttribute('stop-opacity', deep ? '0.70' : '0.50');
    }
    if (best) document.body.classList.toggle('giv-in-void', best.dataset.transition === 'void');

    for (const slot of this.slots) {
      slot.op += (slot.tgt - slot.op) * this.LERP;
      slot.el.style.opacity = slot.op;
    }
    this.dualOp += (this.dualTgt - this.dualOp) * this.LERP;
    this.dual.style.opacity = this.dualOp;
  }

  start(sections) {
    const loop = () => { this.update(sections); this._timer = setTimeout(loop, 16); };
    this._timer = setTimeout(loop, 16);
  }
  stop() { clearTimeout(this._timer); }
}

// ════════════════════════════════════════════════════════════════════
// Text reveal
// ════════════════════════════════════════════════════════════════════

function revealSection(section) {
  section.querySelectorAll('.giv-title').forEach(el => el.classList.add('revealed'));
  section.querySelectorAll('.giv-kicker').forEach(el => el.classList.add('revealed'));
  const body = section.querySelector('.giv-body');
  if (body) body.classList.add('revealed');
  section.querySelectorAll('.giv-entre').forEach((el, i) =>
    setTimeout(() => el.classList.add('revealed'), i * 300));
  section.querySelectorAll('.giv-birth-line').forEach((el, i) =>
    setTimeout(() => el.classList.add('revealed'), i * 500));
  section.querySelectorAll('.giv-callout-svg, .giv-pulse-svg').forEach(el =>
    setTimeout(() => el.classList.add('revealed'), 400));
  section.querySelectorAll('.giv-cat').forEach((el, i) =>
    setTimeout(() => {
      el.classList.add('giv-cat-pulse');
      setTimeout(() => el.classList.remove('giv-cat-pulse'), 1000);
    }, 300 + i * 250));
  const addr = section.querySelector('.giv-address');
  if (addr) setTimeout(() => addr.classList.add('revealed'), 600);
}

// ════════════════════════════════════════════════════════════════════
// Typewriter
// ════════════════════════════════════════════════════════════════════

function startTypewriter(container, text) {
  const target = container.querySelector('[data-giv-typewriter]');
  if (!target) return;
  text = target.dataset.givTypewriter || text || '';
  let i = 0;
  const cursor = document.createElement('span');
  cursor.className = 'giv-cursor-blink';
  target.appendChild(cursor);
  function type() {
    if (i < text.length) { cursor.insertAdjacentText('beforebegin', text[i++]); setTimeout(type, 55); }
    else setTimeout(() => cursor.remove(), 3000);
  }
  setTimeout(type, 1800);
}

// ════════════════════════════════════════════════════════════════════
// Callout SVGs
// ════════════════════════════════════════════════════════════════════

function buildBenjaminCallout(_haloUrl) {
  return `<svg class="giv-callout-svg" viewBox="0 0 680 260" xmlns="http://www.w3.org/2000/svg">
  <polygon points="40,44 44,40 48,44 44,48"       fill="#b8a0c8" opacity="0.55"/>
  <polygon points="632,44 636,40 640,44 636,48"   fill="#b8a0c8" opacity="0.55"/>
  <polygon points="40,212 44,208 48,212 44,216"   fill="#b8a0c8" opacity="0.55"/>
  <polygon points="632,212 636,208 640,212 636,216" fill="#b8a0c8" opacity="0.55"/>
  <line x1="56" y1="44"  x2="624" y2="44"  stroke="#b8a0c8" stroke-width="0.5" opacity="0.4"/>
  <line x1="56" y1="212" x2="624" y2="212" stroke="#b8a0c8" stroke-width="0.5" opacity="0.4"/>
  <text x="340" y="108" text-anchor="middle" font-family="EB Garamond,serif" font-style="italic" font-size="42" fill="#4ecdc4" opacity="0.95">"As ideias relacionam-se com as coisas</text>
  <text x="340" y="162" text-anchor="middle" font-family="EB Garamond,serif" font-style="italic" font-size="42" fill="#4ecdc4" opacity="0.95">como as constelações com as estrelas."</text>
  <text x="340" y="196" text-anchor="middle" font-family="Space Mono,monospace" font-size="17" fill="#b8a0c8" letter-spacing="2.5" opacity="0.7">WALTER BENJAMIN</text>
</svg>`;
}

function buildDidiCallout(_haloUrl) {
  return `<svg class="giv-callout-svg giv-callout-didi-svg" viewBox="0 0 680 180" xmlns="http://www.w3.org/2000/svg">
  <circle cx="40"  cy="148" r="3" fill="#b8a0c8" opacity="0.45"/>
  <circle cx="640" cy="148" r="3" fill="#b8a0c8" opacity="0.45"/>
  <line x1="56" y1="148" x2="624" y2="148" stroke="#b8a0c8" stroke-width="0.5" opacity="0.4"/>
  <text x="340" y="96"  text-anchor="middle" font-family="EB Garamond,serif" font-style="italic" font-size="48" fill="#4ecdc4" opacity="0.95">"O atlas é uma forma visual do saber."</text>
  <text x="340" y="136" text-anchor="middle" font-family="Space Mono,monospace" font-size="17" fill="#b8a0c8" letter-spacing="2.5" opacity="0.7">DIDI-HUBERMAN</text>
</svg>`;
}

function buildPulseLine() {
  return `<svg class="giv-pulse-svg" viewBox="0 0 640 48" xmlns="http://www.w3.org/2000/svg">
  <path d="M0,24 L240,24 L255,16 L270,24 L310,24 L325,32 L340,24 L580,24 L595,18 L610,24 L640,24"
    stroke="#b8a0c8" stroke-width="0.8" opacity="0.45" fill="none"
    stroke-dasharray="700" stroke-dashoffset="700">
    <animate attributeName="stroke-dashoffset"
      values="700;0;0;700" dur="4s" repeatCount="indefinite"
      keyTimes="0;0.625;0.875;1" calcMode="spline"
      keySplines="0.25 0.46 0.45 0.94; 0 0 1 1; 0.25 0.46 0.45 0.94"/>
  </path>
</svg>`;
}

// ════════════════════════════════════════════════════════════════════
// Fonts
// ════════════════════════════════════════════════════════════════════

function ensureGIVFonts() {
  if (document.querySelector('link[data-giv-fonts]')) return;
  const l = document.createElement('link');
  l.rel  = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;1,400&family=Space+Mono:wght@400&display=swap';
  l.setAttribute('data-giv-fonts', '');
  document.head.appendChild(l);
}
