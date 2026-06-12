/**
 * js/diagram/nebulosa.js
 * Hero diagram style: glowing nebulosa circles arranged radially.
 * Renders concepts whose level === 'nebulosa' as colour-coded glow nodes.
 */

import { wrapText } from "../render/content.js?v=10";
import { escapeHTML } from "../utils.js?v=10";
import { conceptUrl } from "../graph/navigation.js?v=10";

var PALETTE = ['#ecb586', '#f472b6', '#3b82f6', '#a155f0', '#14a68c', '#2dd4bf'];

export function render(container, graph, siteConfig) {
  var rootId = String((siteConfig && siteConfig["hero.root"]) || "").trim().toUpperCase();
  var rootSlug = (rootId && graph.idToSlug) ? graph.idToSlug[rootId] : null;
  rootSlug = rootSlug || (graph.order && graph.order[0]);
  if (!rootSlug || !graph.bySlug[rootSlug]) {
    container.innerHTML = '<p class="hero-diagram-empty">Não encontrei o conceito raiz para o diagrama.</p>';
    return;
  }
  var root = graph.bySlug[rootSlug];

  var items = graph.order
    .map(function (s) { return graph.bySlug[s]; })
    .filter(function (c) { return c && String(c.level || "").toLowerCase() === "nebulosa"; })
    .map(function (c, i) {
      return { slug: c.slug, label: c.concept, camada: c.camada || "", color: PALETTE[i % PALETTE.length] };
    });

  if (!items.length) {
    container.innerHTML = '<p class="hero-diagram-empty">Nenhuma nebulosa encontrada no grafo.</p>';
    return;
  }

  var W = 1300, H = 900, cx = W / 2, cy = H / 2, R = 310, N = items.length;

  function pointAt(i) {
    var ang = (-90 + (360 / N) * i) * Math.PI / 180;
    return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, ang: ang };
  }

  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="hero-diagram-svg" preserveAspectRatio="xMidYMid meet">');
  parts.push('<defs>');

  parts.push('<radialGradient id="hd-bg" cx="50%" cy="55%" r="80%">'
    + '<stop offset="0%" stop-color="#0c1e14"/>'
    + '<stop offset="40%" stop-color="#060f0a"/>'
    + '<stop offset="100%" stop-color="#030805"/>'
    + '</radialGradient>');

  parts.push('<filter id="hd-blur-strong" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>');
  parts.push('<filter id="hd-blur-soft"   x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>');
  parts.push('<filter id="hd-glow"        x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');

  parts.push('<radialGradient id="hd-core-center">'
    + '<stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>'
    + '<stop offset="35%" stop-color="#14a68c" stop-opacity="0.85"/>'
    + '<stop offset="100%" stop-color="#14a68c" stop-opacity="0"/>'
    + '</radialGradient>');

  items.forEach(function (it, i) {
    var c = it.color, id = 'hd-n' + i, p = pointAt(i);
    parts.push('<radialGradient id="hd-grad-' + id + '">'
      + '<stop offset="0%" stop-color="' + c + '" stop-opacity="0.95"/>'
      + '<stop offset="55%" stop-color="' + c + '" stop-opacity="0.35"/>'
      + '<stop offset="100%" stop-color="' + c + '" stop-opacity="0"/>'
      + '</radialGradient>');
    parts.push('<radialGradient id="hd-core-' + id + '">'
      + '<stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>'
      + '<stop offset="35%" stop-color="' + c + '" stop-opacity="0.85"/>'
      + '<stop offset="100%" stop-color="' + c + '" stop-opacity="0"/>'
      + '</radialGradient>');
    parts.push('<linearGradient id="hd-line-' + i + '" x1="' + cx + '" y1="' + cy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" gradientUnits="userSpaceOnUse">'
      + '<stop offset="0%" stop-color="#14a68c" stop-opacity="0.45"/>'
      + '<stop offset="50%" stop-color="#ffffff" stop-opacity="0.10"/>'
      + '<stop offset="100%" stop-color="' + c + '" stop-opacity="0.45"/>'
      + '</linearGradient>');
  });
  parts.push('</defs>');

  parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#hd-bg)"/>');
  parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" stroke-dasharray="3 8"/>');

  items.forEach(function (_, i) {
    var p = pointAt(i);
    var dx = Math.cos(p.ang), dy = Math.sin(p.ang);
    parts.push('<line x1="' + (cx + dx * 48).toFixed(1) + '" y1="' + (cy + dy * 48).toFixed(1)
      + '" x2="' + (p.x - dx * 44).toFixed(1) + '" y2="' + (p.y - dy * 44).toFixed(1)
      + '" stroke="url(#hd-line-' + i + ')" stroke-width="2.5" opacity="0.85"/>');
  });

  items.forEach(function (it, i) {
    var p = pointAt(i), id = 'hd-n' + i;
    var lines = wrapText(it.label, 16, 3);
    parts.push('<g class="hero-diagram-node" data-slug="' + escapeHTML(it.slug) + '">');
    parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="70" fill="url(#hd-grad-' + id + ')" filter="url(#hd-blur-strong)" opacity="0.21"/>');
    parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="80" fill="url(#hd-core-' + id + ')" filter="url(#hd-blur-soft)" opacity="0.6"/>');
    parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="40" fill="url(#hd-core-' + id + ')"/>');
    parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="40" fill="none" stroke="' + it.color + '" stroke-width="1.5" opacity="0.85"/>');
    var labelBase = p.y + 58;
    lines.forEach(function (line, j) {
      parts.push('<text x="' + p.x.toFixed(1) + '" y="' + (labelBase + j * 20).toFixed(1)
        + '" text-anchor="middle" font-family="Inter,\'IBM Plex Sans\',sans-serif"'
        + ' font-size="17" font-weight="700" letter-spacing="0.08em" fill="#fff">'
        + escapeHTML(line.toUpperCase()) + '</text>');
    });
    if (it.camada) {
      parts.push('<text x="' + p.x.toFixed(1) + '" y="' + (labelBase + lines.length * 20 + 4).toFixed(1)
        + '" text-anchor="middle" font-family="Inter,sans-serif"'
        + ' font-size="10" font-weight="400" letter-spacing="0.18em" fill="rgba(255,255,255,0.45)">'
        + escapeHTML(it.camada) + '</text>');
    }
    parts.push('</g>');
  });

  parts.push('<g class="hero-diagram-center">');
  parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="70" fill="url(#hd-core-center)" filter="url(#hd-blur-soft)" opacity="0.24"/>');
  parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="44" fill="url(#hd-core-center)"/>');
  parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="44" fill="none" stroke="#14a68c" stroke-width="2" opacity="0.9" filter="url(#hd-glow)"/>');
  var centerLines = wrapText(root.concept || 'Ciberespaço', 12, 2);
  var totalH = (centerLines.length - 1) * 20;
  centerLines.forEach(function (line, i) {
    parts.push('<text x="' + cx + '" y="' + (cy - totalH / 2 + i * 20 + 6).toFixed(1)
      + '" text-anchor="middle" font-family="Inter,\'IBM Plex Sans\',sans-serif"'
      + ' font-size="15" font-weight="800" letter-spacing="0.08em" fill="#edb687">'
      + escapeHTML(line.toUpperCase()) + '</text>');
  });
  parts.push('<text x="' + cx + '" y="' + (cy + totalH / 2 + 24).toFixed(1)
    + '" text-anchor="middle" font-family="Inter,sans-serif"'
    + ' font-size="9" font-weight="400" letter-spacing="0.28em" fill="rgba(255,255,255,0.45)">CONCEITO RAIZ</text>');
  parts.push('</g>');

  parts.push('</svg>');
  container.innerHTML = parts.join('');

  container.querySelectorAll('.hero-diagram-node').forEach(function (node) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', function () {
      var slug = node.getAttribute('data-slug');
      if (slug) location.hash = conceptUrl(slug);
    });
  });
  var center = container.querySelector('.hero-diagram-center');
  if (center) {
    center.style.cursor = 'pointer';
    center.addEventListener('click', function () { location.hash = conceptUrl(rootSlug); });
  }
}
