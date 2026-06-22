/**
 * js/explore-graph.js
 * Floating history-driven exploration graph.
 * Visited nodes expand on click to reveal neighbours.
 * Click a non-current node to expand; clicking again collapses.
 */

import { conceptUrl } from "./graph/navigation.js?v=18";
import { escapeHTML, escapeAttr, isHttpUrl } from "./utils.js?v=18";
import { t } from "./i18n.js?v=18";

// ── Constants ─────────────────────────────────────────────────────────────

const NODE_W    = 178;
const NODE_H    = 62;
const LINK_DIST = 225;

// Absolute canvas angles tried in order when placing a new node.
// Right-first: fills horizontal space before resorting to vertical.
// Adjacent angles are ~40° apart (2·LINK_DIST·sin(20°) ≈ 154 px > NODE_W·0.85 ≈ 151 px).
const SPREAD = [
  0,                    // right
  -Math.PI * 0.22,      // ~40° up-right
   Math.PI * 0.22,      // ~40° down-right
  -Math.PI * 0.44,      // ~79° upper
   Math.PI * 0.44,      // ~79° lower
  -Math.PI * 0.67,      // ~121° upper-left
   Math.PI * 0.67,      // ~121° lower-left
   Math.PI,             // left
  -Math.PI * 0.89,      // ~160° far upper-left
   Math.PI * 0.89,      // ~160° far lower-left
];

// ── State ─────────────────────────────────────────────────────────────────

const state = {
  nodes:    {},   // slug → { slug, label, x, y, parentSlug, order, isNew, suggested, expanded }
  edges:    [],   // { from, to, label, isNav }
  edgeKeys: new Set(),
  current:  null,
  order:    0,
  graph:    null,
};

let _egMode = "normal";   // "normal" | "minimized" | "hidden"

// ── DOM handles ───────────────────────────────────────────────────────────

let panelEl       = null;
let svgEl         = null;
let sceneEl       = null;
let dragState     = null;
let resizeState   = null;
let nodeDragState = null;  // { slug, offsetX, offsetY, startClientX, startClientY, moved, isEdit }
let egEditMode    = false; // persistent repositioning mode (entered via long press, exited by clicking background)
let egEditTimer   = null;  // long-press timer handle

// ── Edge path helpers ─────────────────────────────────────────────────────

/** SVG <path d="..."> for a gentle quadratic bezier between two points. */
function edgePath(ax, ay, bx, by) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return "M " + ax + " " + ay + " L " + bx + " " + by;
  const curve = Math.min(len * 0.15, 30);
  const cpx = mx + (-dy / len) * curve;
  const cpy = my + (dx  / len) * curve;
  return "M " + ax.toFixed(1) + " " + ay.toFixed(1) +
         " Q " + cpx.toFixed(1) + " " + cpy.toFixed(1) +
         " " + bx.toFixed(1) + " " + by.toFixed(1);
}

/** Label position: midpoint of the quadratic bezier (t = 0.5). */
function edgeLabelPos(ax, ay, bx, by) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return { x: mx, y: my };
  const curve = Math.min(len * 0.15, 30);
  const cpx = mx + (-dy / len) * curve;
  const cpy = my + (dx  / len) * curve;
  // B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
  return { x: 0.25 * ax + 0.5 * cpx + 0.25 * bx,
           y: 0.25 * ay + 0.5 * cpy + 0.25 * by };
}

// ── Label text wrapping (≤2 lines, ≤14 chars each) ───────────────────────

function wrapEdgeLabel(text) {
  const MAX_C = 14;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let curr = "";
  words.forEach(function (w) {
    const test = curr ? curr + " " + w : w;
    if (test.length > MAX_C && curr) { lines.push(curr); curr = w; } else curr = test;
  });
  if (curr) lines.push(curr);
  if (lines.length > 2) {
    lines[1] = lines.slice(1).join(" ");
    if (lines[1].length > MAX_C) lines[1] = lines[1].slice(0, MAX_C - 1) + "…";
    lines.length = 2;
  }
  const maxLen = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  return {
    lines: lines,
    w: Math.max(34, maxLen * 6.5),
    h: lines.length > 1 ? 30 : 16,
  };
}

/** SVG tspans for a wrapped edge label centred at (cx, cy). */
function svgEdgeLabelText(lines, cx, cy) {
  const LINE_H = 12;
  const y0 = cy - ((lines.length - 1) * LINE_H) / 2;
  return lines.map(function (l, i) {
    return "<tspan x=\"" + cx.toFixed(1) + "\" y=\"" + (y0 + i * LINE_H).toFixed(1) +
           "\" dominant-baseline=\"middle\">" + escapeHTML(l) + "</tspan>";
  }).join("");
}

/**
 * Point where the straight line from (cx,cy) toward (tx,ty) exits the node's
 * bounding rectangle (NODE_W × NODE_H centred on cx,cy).
 */
function rectEdge(cx, cy, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const thx = Math.abs(dx) > 0.01 ? (NODE_W / 2) / Math.abs(dx) : Infinity;
  const thy = Math.abs(dy) > 0.01 ? (NODE_H / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(thx, thy);
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * Find a label position along the segment (ax,ay)→(bx,by) — which are already
 * box-edge-clipped — that does not overlap ANY node rectangle.
 * Two rectangles overlap iff they overlap in BOTH x AND y simultaneously;
 * so a position is clear when it's separated from a node in x OR in y.
 */
function placeLabelNoOverlap(ax, ay, bx, by, allNodesList, lW, lH) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: ax, y: ay };
  const px = -dy / len, py = dx / len;  // unit perpendicular

  // Try mid-point first (no offset), then increasing perpendicular offsets
  const tVals   = [0.5, 0.42, 0.58, 0.33, 0.67];
  const offsets = [0, 22, -22, 38, -38, 54, -54, 70, -70];

  for (let ti = 0; ti < tVals.length; ti++) {
    for (let oi = 0; oi < offsets.length; oi++) {
      const x = ax + dx * tVals[ti] + px * offsets[oi];
      const y = ay + dy * tVals[ti] + py * offsets[oi];
      // Clear of a node when separated in x OR in y (AABB non-overlap)
      const ok = allNodesList.every(function (n) {
        return Math.abs(x - n.x) >= (lW / 2 + NODE_W / 2 + 5) ||
               Math.abs(y - n.y) >= (lH / 2 + NODE_H / 2 + 5);
      });
      if (ok) return { x, y };
    }
  }
  // Fallback: push far enough perp to clear node height
  const minOff = NODE_H / 2 + lH / 2 + 6;
  return { x: ax + dx * 0.5 + px * minOff, y: ay + dy * 0.5 + py * minOff };
}

// ── Module-level edge helper ──────────────────────────────────────────────

function addEdge(a, b, label, isNav, isExternal) {
  const k = [a, b].sort().join("|");
  if (state.edgeKeys.has(k)) return;
  state.edgeKeys.add(k);
  state.edges.push({ from: a, to: b, label: label || "", isNav: !!isNav, isNew: true, isExternal: !!isExternal });
}

// ── Placement ─────────────────────────────────────────────────────────────

// SPREAD angles are absolute (canvas-space), so the placement always tries
// right first regardless of which direction the parent was approached from.
// This makes the graph grow horizontally before resorting to vertical space.
function placeNode(parentSlug) {
  if (!parentSlug || !state.nodes[parentSlug]) return { x: 0, y: 0 };
  const parent  = state.nodes[parentSlug];
  const minGap  = NODE_W * 0.85;
  const nodeArr = Object.values(state.nodes);

  for (let i = 0; i < SPREAD.length; i++) {
    const x = parent.x + LINK_DIST * Math.cos(SPREAD[i]);
    const y = parent.y + LINK_DIST * Math.sin(SPREAD[i]);
    const clash = nodeArr.some(function (n) {
      return Math.hypot(n.x - x, n.y - y) < minGap;
    });
    if (!clash) return { x, y };
  }
  // Fallback: step further right
  return { x: parent.x + LINK_DIST * 2.2, y: parent.y };
}

// ── SVG text ──────────────────────────────────────────────────────────────

function svgTextLines(text, cx, cy, maxW) {
  const EST = 8.4, LINE_H = 19;
  const maxC = Math.max(8, Math.floor(maxW / EST));
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let curr = "";
  words.forEach(function (w) {
    const test = curr ? curr + " " + w : w;
    if (test.length > maxC && curr) { lines.push(curr); curr = w; }
    else curr = test;
  });
  if (curr) lines.push(curr);
  if (lines.length > 2) {
    lines[1] = lines.slice(1).join(" ").slice(0, maxC) + "…";
    lines.length = 2;
  }
  const totalH = (lines.length - 1) * LINE_H;
  const y0 = cy - totalH / 2;
  return lines.map(function (l, i) {
    return "<tspan x=\"" + cx.toFixed(1) + "\" y=\"" + (y0 + i * LINE_H).toFixed(1) +
           "\" dominant-baseline=\"middle\">" + escapeHTML(l) + "</tspan>";
  }).join("");
}

// ── Expand / collapse ─────────────────────────────────────────────────────

function removeSuggestedBranch(slug) {
  Object.keys(state.nodes).forEach(function (s) {
    const n = state.nodes[s];
    if (n.suggested && n.parentSlug === slug) {
      removeSuggestedBranch(s);
      delete state.nodes[s];
      state.edges = state.edges.filter(function (e) { return e.from !== s && e.to !== s; });
      const toDelete = [];
      state.edgeKeys.forEach(function (k) {
        if (k.split("|").indexOf(s) >= 0) toDelete.push(k);
      });
      toDelete.forEach(function (k) { state.edgeKeys.delete(k); });
    }
  });
}

function expandNode(slug) {
  const node = state.nodes[slug];
  if (!node || node.suggested) return;

  if (node.expanded) {
    node.expanded = false;
    removeSuggestedBranch(slug);
    render();
    return;
  }

  node.expanded = true;
  const concept = state.graph && state.graph.bySlug && state.graph.bySlug[slug];
  if (!concept || !concept.relations) { render(); return; }

  const MAX_EXPAND = 20;
  let newCount = 0;

  concept.relations.forEach(function (rel) {
    const tSlug    = rel.targetSlug;
    const relLabel = rel.relationLabel || rel.relationName || "";

    if (state.nodes[tSlug]) {
      // Already in map: add a cross-edge connecting the two nodes
      addEdge(slug, tSlug, relLabel, false);
      return;
    }

    if (newCount >= MAX_EXPAND) return;  // cap matches CRD MAX_NODES
    const tc = state.graph.bySlug[tSlug];
    if (!tc) return;
    const pos = placeNode(slug);
    state.nodes[tSlug] = {
      slug:       tSlug,
      label:      tc.concept,
      x:          pos.x,
      y:          pos.y,
      parentSlug: slug,
      order:      ++state.order,
      isNew:      true,
      suggested:  true,   // internal: collapses with parent, click → navigate
      expanded:   false,
    };
    addEdge(slug, tSlug, relLabel, false);
    newCount++;
  });

  render();
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  if (!svgEl || !sceneEl) return;
  const nodes = Object.values(state.nodes);
  if (!nodes.length) return;

  const xs  = nodes.map(function (n) { return n.x; });
  const ys  = nodes.map(function (n) { return n.y; });
  const PAD = 60;
  const vx  = Math.min.apply(null, xs) - PAD - NODE_W / 2;
  const vy  = Math.min.apply(null, ys) - PAD - NODE_H / 2;
  const vw  = Math.max.apply(null, xs) - vx + PAD + NODE_W / 2;
  const vh  = Math.max.apply(null, ys) - vy + PAD + NODE_H / 2;
  svgEl.setAttribute("viewBox", [vx, vy, vw, vh].map(function (v) { return v.toFixed(1); }).join(" "));

  let edgeHtml = "";
  let nodeHtml = "";
  const labelParts = [];
  let newEdgeIdx = 0;   // stagger counter for new edges/labels
  let newNodeIdx = 0;   // stagger counter for new nodes

  // Pass 1: edges — clip to box edges, draw bezier; animate new ones
  state.edges.forEach(function (e) {
    const a = state.nodes[e.from], b = state.nodes[e.to];
    if (!a || !b) return;
    const ea = rectEdge(a.x, a.y, b.x, b.y);
    const eb = rectEdge(b.x, b.y, a.x, a.y);
    const isNewEdge = !!e.isNew;
    let cls = "eg-edge " + (e.isExternal ? "eg-ext-edge" : e.isNav ? "eg-nav-edge" : "eg-cross-edge");
    let edgeStyle = "";
    let edgeDelay = 0;
    if (isNewEdge) {
      cls += " eg-new-edge";
      const approxLen = Math.ceil(Math.hypot(eb.x - ea.x, eb.y - ea.y) * 1.08);
      edgeDelay = newEdgeIdx * 30;
      edgeStyle = " style=\"stroke-dasharray:" + approxLen + ";stroke-dashoffset:" + approxLen +
                  ";--eg-el:" + approxLen + ";animation-delay:" + edgeDelay + "ms\"";
      newEdgeIdx++;
    }
    edgeHtml += "<path d=\"" + edgePath(ea.x, ea.y, eb.x, eb.y) +
                "\" class=\"" + cls + "\" fill=\"none\"" + edgeStyle + "/>";

    if (e.label) {
      const wrapped = wrapEdgeLabel(e.label);
      const lp = placeLabelNoOverlap(ea.x, ea.y, eb.x, eb.y, nodes, wrapped.w, wrapped.h);
      const labelCls = "eg-edge-label" + (isNewEdge ? " eg-new-label" : "");
      const labelStyle = isNewEdge
        ? " style=\"animation-delay:" + (edgeDelay + 320) + "ms\""
        : "";
      labelParts.push(
        "<text text-anchor=\"middle\" class=\"" + labelCls + "\"" + labelStyle + ">" +
        svgEdgeLabelText(wrapped.lines, lp.x, lp.y) +
        "</text>"
      );
    }
  });

  // Pass 2: node boxes — visited = blue, suggested = teal; new nodes pop in with stagger
  nodes.forEach(function (n) {
    const isCurrent = n.slug === state.current;
    let cls = "eg-node-g";
    if (isCurrent)   cls += " eg-current";
    if (n.isNew)     cls += " eg-new";
    if (n.expanded)  cls += " eg-expanded";
    if (n.suggested) cls += " eg-suggested";
    if (n.isExternal) cls += " eg-ext";

    let nodeStyle = "";
    if (n.isNew) {
      nodeStyle = " style=\"animation-delay:" + (newNodeIdx * 30) + "ms\"";
      newNodeIdx++;
    }

    const extAttr = n.isExternal ? " data-ext-url=\"" + escapeAttr(n.externalUrl) + "\"" : "";
    nodeHtml += "<g class=\"" + cls + "\"" + nodeStyle + " data-slug=\"" + escapeAttr(n.slug) + "\"" + extAttr + ">";
    nodeHtml += "<rect x=\"" + (n.x - NODE_W / 2).toFixed(1) + "\" y=\"" + (n.y - NODE_H / 2).toFixed(1) +
               "\" width=\"" + NODE_W + "\" height=\"" + NODE_H + "\" rx=\"7\" class=\"eg-box\"/>";
    nodeHtml += "<text text-anchor=\"middle\" class=\"eg-label\">" +
               svgTextLines(n.label, n.x, n.y, NODE_W - 16) + "</text>";
    nodeHtml += "</g>";
  });

  // Pass 3: edge labels on top of everything
  const labelHtml = labelParts.length
    ? "<g class=\"eg-label-layer\">" + labelParts.join("") + "</g>"
    : "";

  sceneEl.innerHTML = edgeHtml + nodeHtml + labelHtml;
  nodes.forEach(function (n) { n.isNew = false; });
  state.edges.forEach(function (e) { e.isNew = false; });

  const countEl = panelEl && panelEl.querySelector(".eg-count");
  if (countEl) {
    const visited   = nodes.filter(function (n) { return !n.suggested; }).length;
    const suggested = nodes.length - visited;
    let txt = visited + (visited === 1 ? " " + t("eg.count.concept", "concept") : " " + t("eg.count.concepts", "concepts"));
    if (suggested) txt += " +" + suggested;
    countEl.textContent = txt;
  }
}

// ── Panel creation ────────────────────────────────────────────────────────

function createPanel() {
  panelEl = document.createElement("div");
  panelEl.id = "eg-panel";
  panelEl.className = "eg-panel";
  panelEl.innerHTML = [
    '<div class="eg-resize-nw" id="eg-resize-nw" title="' + escapeAttr(t("eg.resize", "Resize")) + '"></div>',
    '<div class="eg-bar" id="eg-drag-bar">',
    '  <span class="eg-bar-title">' + escapeHTML(t("eg.title", "Exploration map")) + '</span>',
    '  <span class="eg-count">0 ' + escapeHTML(t("eg.count.concepts", "concepts")) + '</span>',
    '  <button class="eg-btn" id="eg-btn-help"   type="button" title="' + escapeAttr(t("eg.help", "Help")) + '">?</button>',
    '  <button class="eg-btn" id="eg-btn-expand" type="button" title="' + escapeAttr(t("eg.expand", "Expand")) + '">&#x2922;</button>',
    '  <button class="eg-btn" id="eg-btn-close"  type="button" title="' + escapeAttr(t("eg.close", "Close")) + '">&#xD7;</button>',
    '</div>',
    '<div class="eg-help-overlay" id="eg-help-overlay" hidden>',
    '  <button class="eg-help-close" id="eg-help-close" type="button" aria-label="' + escapeAttr(t("eg.help.close", "Close help")) + '">&#xD7;</button>',
    '  <div class="eg-help-body">',
    '    <h3 class="eg-help-title">' + escapeHTML(t("eg.help.title", "Exploration map")) + '</h3>',
    '    <p>' + t("eg.help.p1", 'The starting point is the <strong>node</strong> you opened — shown with an orange border. From it you can follow any path to discover new concepts.') + '</p>',
    '    <p>' + t("eg.help.p2", 'Browse freely: the suggested narratives can also inspire your exploration.') + '</p>',
    '    <p>' + t("eg.help.p3", 'Every node you visit is recorded: <strong>dark background</strong> = visited; <strong>light background</strong> = available path. Click any node to navigate to it.') + '</p>',
    '    <p>' + t("eg.help.p4", 'The map can be <strong>resized</strong> — drag the corners (top-left or bottom-right).') + '</p>',
    '    <p>' + t("eg.help.p5", 'To <strong>rearrange the layout</strong>, click and hold a node until the cursor becomes a hand, then drag. Click the background to return to navigation mode.') + '</p>',
    '    <p class="eg-help-footer">' + escapeHTML(t("eg.help.footer", "Enjoy your exploration!")) + '</p>',
    '  </div>',
    '</div>',
    '<div class="eg-body">',
    '  <svg class="eg-svg" id="eg-svg" preserveAspectRatio="xMidYMid meet">',
    '    <g id="eg-scene"></g>',
    '  </svg>',
    '</div>',
    '<div class="eg-resize-handle" id="eg-resize-handle" title="' + escapeAttr(t("eg.resize", "Resize")) + '"></div>',
  ].join("\n");

  document.body.appendChild(panelEl);
  // Apply current mode immediately so the panel starts in the right state
  panelEl.classList.toggle("eg-hidden",    _egMode === "hidden");
  panelEl.classList.toggle("eg-minimized", _egMode === "minimized");
  svgEl   = document.getElementById("eg-svg");
  sceneEl = document.getElementById("eg-scene");

  // ── Draggable title bar ───────────────────────────────────────────────
  const bar = document.getElementById("eg-drag-bar");
  bar.addEventListener("mousedown", function (e) {
    if (e.target.classList.contains("eg-btn")) return;
    if (e.target.classList.contains("eg-resize-nw")) return;
    const r = panelEl.getBoundingClientRect();
    dragState = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    e.preventDefault();
  });

  // ── SE resize handle (bottom-right) ──────────────────────────────────
  document.getElementById("eg-resize-handle").addEventListener("mousedown", function (e) {
    const r = panelEl.getBoundingClientRect();
    resizeState = {
      startX: e.clientX, startY: e.clientY,
      startW: r.width,   startH: r.height,
    };
    panelEl.classList.add("eg-resizing");
    e.preventDefault();
    e.stopPropagation();
  });

  // ── NW resize handle (top-left) ───────────────────────────────────────
  var resizeStateTL = null;
  document.getElementById("eg-resize-nw").addEventListener("mousedown", function (e) {
    const r = panelEl.getBoundingClientRect();
    // Pin the right and bottom edges by switching to left/top positioning
    panelEl.style.right  = "auto";
    panelEl.style.bottom = "auto";
    panelEl.style.left   = r.left + "px";
    panelEl.style.top    = r.top  + "px";
    resizeStateTL = {
      startX: e.clientX, startY: e.clientY,
      startW: r.width,   startH: r.height,
      startL: r.left,    startT: r.top,
    };
    panelEl.classList.add("eg-resizing");
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener("mousemove", function (e) {
    if (dragState) {
      panelEl.style.right  = "auto";
      panelEl.style.bottom = "auto";
      panelEl.style.left   = Math.max(0, e.clientX - dragState.ox) + "px";
      panelEl.style.top    = Math.max(0, e.clientY - dragState.oy) + "px";
    }
    if (resizeState) {
      const newW = Math.max(280, resizeState.startW + (e.clientX - resizeState.startX));
      const newH = Math.max(160, resizeState.startH + (e.clientY - resizeState.startY));
      panelEl.style.width  = newW + "px";
      panelEl.style.height = newH + "px";
    }
    if (resizeStateTL) {
      const dx   = e.clientX - resizeStateTL.startX;
      const dy   = e.clientY - resizeStateTL.startY;
      const newW = Math.max(280, resizeStateTL.startW - dx);
      const newH = Math.max(160, resizeStateTL.startH - dy);
      // Use actual shrink (clamped) to move the left/top edges correctly
      panelEl.style.width  = newW + "px";
      panelEl.style.height = newH + "px";
      panelEl.style.left   = Math.max(0, resizeStateTL.startL + (resizeStateTL.startW - newW)) + "px";
      panelEl.style.top    = Math.max(0, resizeStateTL.startT + (resizeStateTL.startH - newH)) + "px";
    }
  });
  window.addEventListener("mouseup", function () {
    dragState = null;
    if (resizeState)   { panelEl.classList.remove("eg-resizing"); resizeState   = null; }
    if (resizeStateTL) { panelEl.classList.remove("eg-resizing"); resizeStateTL = null; }
  });

  // ── Expand / contract ─────────────────────────────────────────────────
  document.getElementById("eg-btn-expand").addEventListener("click", function () {
    const large = panelEl.classList.toggle("eg-large");
    // eg-large = 90vw × 90vh; default (no class) = 40% content-area width
    // If expanding from minimized state, remove eg-minimized so its
    // `height: auto !important` no longer overrides eg-large's height: 90vh.
    if (large && _egMode === "minimized") {
      _egMode = "normal";
      panelEl.classList.remove("eg-minimized");
    }
    this.innerHTML = large ? "&#x2921;" : "&#x2922;";
    this.title     = large ? t("eg.contract", "Contract") : t("eg.expand", "Expand");
    // Clear any inline size set by drag-resize so CSS class takes over
    panelEl.style.width  = "";
    panelEl.style.height = "";
  });

  // ── Close ─────────────────────────────────────────────────────────────
  document.getElementById("eg-btn-close").addEventListener("click", function () {
    panelEl.classList.add("eg-hidden");
  });

  // ── Help overlay ──────────────────────────────────────────────────────
  var helpOverlay = document.getElementById("eg-help-overlay");
  document.getElementById("eg-btn-help").addEventListener("click", function () {
    if (helpOverlay) helpOverlay.hidden = !helpOverlay.hidden;
  });
  document.getElementById("eg-help-close").addEventListener("click", function () {
    if (helpOverlay) helpOverlay.hidden = true;
  });

  // ── Node pointer interactions ────────────────────────────────────────────
  // Normal mode:   pointer cursor, quick tap navigates.
  // Edit mode:     entered by holding a node ≥ 400 ms; cursor → grab.
  //                Drag any node freely. Click the SVG background to exit.
  // Dragging:      cursor → grabbing.

  function clientToSVG(clientX, clientY) {
    var pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  function enterEditMode() {
    egEditMode = true;
    panelEl.classList.add("eg-edit-mode");
  }

  function exitEditMode() {
    egEditMode = false;
    egEditTimer = null;
    nodeDragState = null;
    panelEl.classList.remove("eg-edit-mode", "eg-node-dragging");
  }

  svgEl.addEventListener("pointerdown", function (e) {
    const g = e.target.closest("[data-slug]");

    if (!g) {
      // Background tap — exit edit mode if active
      if (egEditMode) exitEditMode();
      return;
    }

    const slug = g.dataset.slug;
    const node = state.nodes[slug];
    if (!node) return;
    const svgPt = clientToSVG(e.clientX, e.clientY);

    nodeDragState = {
      slug: slug,
      offsetX: svgPt.x - node.x,
      offsetY: svgPt.y - node.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      isEdit: egEditMode,
    };
    svgEl.setPointerCapture(e.pointerId);

    if (egEditMode) {
      // Already in edit mode — activate drag immediately
      panelEl.classList.add("eg-node-dragging");
    } else {
      // Normal mode — start long-press timer to enter edit mode
      egEditTimer = setTimeout(function () {
        egEditTimer = null;
        if (nodeDragState && nodeDragState.slug === slug) {
          nodeDragState.isEdit = true;
          enterEditMode();
          panelEl.classList.add("eg-node-dragging");
        }
      }, 400);
    }
  });

  svgEl.addEventListener("pointermove", function (e) {
    if (!nodeDragState) return;

    const dx = e.clientX - nodeDragState.startClientX;
    const dy = e.clientY - nodeDragState.startClientY;

    if (!nodeDragState.isEdit) {
      // Long press hasn't fired yet — cancel it if the pointer moved
      if (Math.hypot(dx, dy) > 4) {
        if (egEditTimer) { clearTimeout(egEditTimer); egEditTimer = null; }
        nodeDragState = null;
      }
      return;
    }

    if (Math.hypot(dx, dy) < 6 && !nodeDragState.moved) return;
    nodeDragState.moved = true;
    const node = state.nodes[nodeDragState.slug];
    if (!node) return;
    const svgPt = clientToSVG(e.clientX, e.clientY);
    node.x = svgPt.x - nodeDragState.offsetX;
    node.y = svgPt.y - nodeDragState.offsetY;
    render();
  });

  svgEl.addEventListener("pointerup", function () {
    if (egEditTimer) { clearTimeout(egEditTimer); egEditTimer = null; }
    if (!nodeDragState) return;
    const { slug, moved, isEdit } = nodeDragState;
    nodeDragState = null;
    panelEl.classList.remove("eg-node-dragging");

    if (isEdit) return; // edit mode — no navigation on release

    // Normal mode quick tap — navigate
    const node = state.nodes[slug];
    if (!node) return;
    if (node.isExternal && node.externalUrl && isHttpUrl(node.externalUrl)) {
      window.open(node.externalUrl, "_blank", "noopener");
    } else if (!node.isExternal) {
      window.location.hash = conceptUrl(slug);
    }
  });

  svgEl.addEventListener("pointercancel", function () {
    if (egEditTimer) { clearTimeout(egEditTimer); egEditTimer = null; }
    nodeDragState = null;
    panelEl.classList.remove("eg-node-dragging");
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Set the EG panel visibility mode.
 * mode: "normal" | "minimized" | "hidden"
 */
export function setMode(mode) {
  _egMode = mode || "normal";
  if (!panelEl) return;
  panelEl.classList.toggle("eg-hidden",    _egMode === "hidden");
  panelEl.classList.toggle("eg-minimized", _egMode === "minimized");
}

/**
 * Called each time a concept page is rendered.
 */
export function visit(slug, concept, graph, fromSlug) {
  if (!panelEl) createPanel();
  if (_egMode !== "hidden") panelEl.classList.remove("eg-hidden");

  state.graph = graph;

  const existingNode = state.nodes[slug];

  if (!existingNode) {
    const pos = placeNode(fromSlug || null);
    state.nodes[slug] = {
      slug:       slug,
      label:      concept.concept,
      x:          pos.x,
      y:          pos.y,
      parentSlug: fromSlug || null,
      order:      ++state.order,
      isNew:      true,
      suggested:  false,
      expanded:   false,
    };
  } else if (existingNode.suggested) {
    // Navigated to a previously expanded node — promote to visited
    existingNode.suggested = false;
    existingNode.isNew     = true;
    existingNode.label     = concept.concept;
    // Remove old cross-edge so it can be re-added as a nav edge
    if (fromSlug) {
      const k = [fromSlug, slug].sort().join("|");
      if (state.edgeKeys.has(k)) {
        state.edgeKeys.delete(k);
        state.edges = state.edges.filter(function (e) {
          return !((e.from === fromSlug && e.to === slug) ||
                   (e.from === slug    && e.to === fromSlug));
        });
      }
    }
  }

  state.current = slug;

  // Navigation edge
  if (fromSlug && state.nodes[fromSlug]) {
    let relName = "";
    const fc = graph.bySlug && graph.bySlug[fromSlug];
    if (fc && fc.relations) {
      const r = fc.relations.find(function (r) { return r.targetSlug === slug; });
      if (r) relName = r.relationLabel || r.relationName || "";
    }
    if (!relName && concept.relations) {
      const r = concept.relations.find(function (r) { return r.targetSlug === fromSlug; });
      if (r) relName = r.relationLabel || r.relationName || "";
    }
    addEdge(fromSlug, slug, relName, true);
  }

  // Auto-expand: every relation of the newly visited concept is shown
  //   • already in the EG → add a cross-edge
  //   • new concept       → add as a teal (unvisited) node + edge
  const MAX_NEW = 20;
  let newCount = 0;
  if (concept.relations) {
    concept.relations.forEach(function (rel) {
      const tSlug    = rel.targetSlug;
      const relLabel = rel.relationLabel || rel.relationName || "";
      if (state.nodes[tSlug]) {
        addEdge(slug, tSlug, relLabel, false);   // cross-edge to existing
        return;
      }
      if (newCount >= MAX_NEW) return;
      const tc = graph.bySlug && graph.bySlug[tSlug];
      if (!tc) return;
      const pos = placeNode(slug);
      state.nodes[tSlug] = {
        slug: tSlug, label: tc.concept,
        x: pos.x, y: pos.y,
        parentSlug: slug, order: ++state.order,
        isNew: true, suggested: true, expanded: false,
      };
      addEdge(slug, tSlug, relLabel, false);
      newCount++;
    });
  }

  // External ref node — shown once per concept, dashed edge, opens in new tab
  if (concept.externalRef) {
    const pipe = concept.externalRef.indexOf("|");
    const extUrl   = (pipe >= 0 ? concept.externalRef.slice(pipe + 1) : concept.externalRef).trim();
    const extLabel = (pipe >= 0 ? concept.externalRef.slice(0, pipe)  : concept.externalRef).trim();
    const extSlug  = "__ext__" + slug;
    if (extUrl && !state.nodes[extSlug]) {
      const pos = placeNode(slug);
      state.nodes[extSlug] = {
        slug: extSlug, label: extLabel || extUrl,
        x: pos.x, y: pos.y,
        parentSlug: slug, order: ++state.order,
        isNew: true, suggested: false, expanded: false,
        isExternal: true, externalUrl: extUrl,
      };
      addEdge(slug, extSlug, "", false, true);
    }
  }

  // Reverse scan: existing nodes whose relations include this newly visited slug
  Object.keys(state.nodes).forEach(function (eSlug) {
    if (eSlug === slug) return;
    const ec = graph.bySlug && graph.bySlug[eSlug];
    if (!ec || !ec.relations) return;
    ec.relations.forEach(function (rel) {
      if (rel.targetSlug === slug) {
        addEdge(eSlug, slug, rel.relationLabel || rel.relationName || "", false);
      }
    });
  });

  render();
}
