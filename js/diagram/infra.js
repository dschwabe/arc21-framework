/**
 * js/diagram/infra.js
 * Hero diagram style: radial spokes from the root concept,
 * showing neighbours whose relationCategory === 'infraestrutura'.
 */

import { wrapText } from "../render/content.js?v=16";
import { escapeHTML } from "../utils.js?v=16";
import { conceptUrl } from "../graph/navigation.js?v=16";

export function render(container, graph, siteConfig) {
  var rootId = String((siteConfig && siteConfig["hero.root"]) || "").trim().toUpperCase();
  var rootSlug = (rootId && graph.idToSlug) ? graph.idToSlug[rootId] : null;
  rootSlug = rootSlug || (graph.order && graph.order[0]);
  if (!rootSlug || !graph.bySlug[rootSlug]) {
    container.innerHTML = '<p class="hero-diagram-empty">Não encontrei o conceito raiz para o diagrama.</p>';
    return;
  }
  var root = graph.bySlug[rootSlug];

  var children = (root.relations || [])
    .filter(function (rel) {
      var cat  = String(rel.relationCategory || "").toLowerCase();
      var name = String(rel.relationName    || "").toLowerCase();
      return cat === "infraestrutura" || name.indexOf("infraestrutura") === 0;
    })
    .map(function (rel) { return graph.bySlug[rel.targetSlug]; })
    .filter(Boolean);

  if (!children.length) {
    children = (root.relations || [])
      .slice(0, 8)
      .map(function (rel) { return graph.bySlug[rel.targetSlug]; })
      .filter(Boolean);
  }

  if (!children.length) {
    container.innerHTML = '<p class="hero-diagram-empty">Nenhuma relação de infraestrutura encontrada.</p>';
    return;
  }

  var W = 1300, H = 900, cx = W / 2, cy = H / 2, R = 300, N = children.length;
  var AMBER = '#ecb586';

  function pointAt(i) {
    var ang = (-90 + (360 / N) * i) * Math.PI / 180;
    return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
  }

  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="hero-diagram-svg" preserveAspectRatio="xMidYMid meet">');
  parts.push('<defs>');
  parts.push('<filter id="inf-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  parts.push('</defs>');

  parts.push('<rect width="' + W + '" height="' + H + '" fill="#050f0a"/>');

  children.forEach(function (_, i) {
    var p = pointAt(i);
    parts.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1)
      + '" stroke="rgba(20,166,140,0.18)" stroke-width="1"/>');
  });

  children.forEach(function (child, i) {
    var p = pointAt(i);
    var lines = wrapText(child.concept || '', 18, 2);
    parts.push('<g class="hero-diagram-node" data-slug="' + escapeHTML(child.slug) + '">');
    parts.push('<rect x="' + (p.x - 78).toFixed(1) + '" y="' + (p.y - 28).toFixed(1)
      + '" width="156" height="56" rx="6"'
      + ' fill="#060f0a" stroke="' + AMBER + '" stroke-width="1" stroke-opacity="0.45"/>');
    lines.forEach(function (line, j) {
      parts.push('<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 6 + j * 18).toFixed(1)
        + '" text-anchor="middle" font-family="Inter,\'IBM Plex Sans\',sans-serif"'
        + ' font-size="13" font-weight="700" letter-spacing="0.05em" fill="' + AMBER + '">'
        + escapeHTML(line) + '</text>');
    });
    parts.push('</g>');
  });

  var centerLines = wrapText(root.concept || '', 14, 2);
  var totalH = (centerLines.length - 1) * 22;
  parts.push('<g class="hero-diagram-center">');
  parts.push('<rect x="' + (cx - 76) + '" y="' + (cy - totalH / 2 - 20) + '" width="152" height="' + (totalH + 48) + '" rx="8"'
    + ' fill="#060f0a" stroke="' + AMBER + '" stroke-width="1.5" filter="url(#inf-glow)"/>');
  centerLines.forEach(function (line, i) {
    parts.push('<text x="' + cx + '" y="' + (cy - totalH / 2 + i * 22 + 7).toFixed(1)
      + '" text-anchor="middle" font-family="Inter,\'IBM Plex Sans\',sans-serif"'
      + ' font-size="17" font-weight="800" letter-spacing="0.06em" fill="' + AMBER + '">'
      + escapeHTML(line.toUpperCase()) + '</text>');
  });
  parts.push('<text x="' + cx + '" y="' + (cy + totalH / 2 + 24).toFixed(1)
    + '" text-anchor="middle" font-family="Inter,sans-serif"'
    + ' font-size="9" letter-spacing="0.22em" fill="rgba(20,166,140,0.50)">CONCEITO RAIZ</text>');
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
