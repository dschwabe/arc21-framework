/**
 * js/render/content.js
 * Markdown-lite content renderers, panel parsers, and scrollytelling text utilities.
 * Depends on js/utils.js and js/graph/navigation.js.
 */

import { escapeHTML } from "../utils.js?v=11";
import { resolveWikiTarget, conceptUrl } from "../graph/navigation.js?v=11";

// ================================================================
//  Panel parsing (shared by linear and scrollytelling skins)
// ================================================================

/**
 * Split element content into panels divided by `---` lines.
 * Returns an array of raw panel strings (in order).
 */
export function splitElementPanels(text) {
  const s = String(text || "").replace(/\r\n/g, "\n");
  return s.split(/\n[ \t]*---[ \t]*\n/);
}

/**
 * Parse one panel's text into structured blocks.
 * @returns {{ type: "paragraph"|"pullquote", text: string }[]}
 */
export function parsePanelBlocks(panelText) {
  const blocks = String(panelText || "").trim().split(/\n{2,}/);
  return blocks.map(function (raw) {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const lines = trimmed.split("\n");
    if (lines.every(function (l) { return /^>\s?/.test(l); })) {
      return { type: "pullquote", text: lines.map(function (l) { return l.replace(/^>\s?/, ""); }).join(" ") };
    }
    return { type: "paragraph", text: trimmed };
  }).filter(Boolean);
}

/** Render a single panel's blocks as HTML. */
export function renderPanelHtml(blocks) {
  return blocks.map(function (b) {
    if (b.type === "pullquote") return '<blockquote class="pull">' + renderInlineMarkdown(b.text) + '</blockquote>';
    return "<p>" + renderInlineMarkdown(b.text) + "</p>";
  }).join("");
}

/**
 * Render full element content for the linear skin.
 * Panel breaks become `<hr class="panel-rule">`.
 */
export function renderElementContentLinear(text) {
  const panels = splitElementPanels(text);
  return panels.map(function (panel) {
    return renderPanelHtml(parsePanelBlocks(panel));
  }).join('<hr class="panel-rule" />');
}

// ================================================================
//  Inline markdown-lite renderer
// ================================================================

/**
 * Convert `**bold**`, `*italic*`, `[[wiki-links]]` and `<br>` within a
 * single block of inline text to safe HTML.
 */
export function renderInlineMarkdown(text) {
  let html = escapeHTML(String(text || ""));
  html = html.replace(/\n/g, "<br>");
  // **bold** (greedy-min)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *italic* (avoid matching **)
  html = html.replace(/(^|[\s(\[])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // [[ID]] or [[ID|label]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, function (_, raw) {
    const pipeIdx = String(raw || "").indexOf("|");
    const target = (pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw).trim();
    const explicitLabel = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : "";
    const wt = resolveWikiTarget(target);
    const display = explicitLabel || (wt && wt.label) || target;
    const snippet = wt ? _descSnippet(wt.description) : "";
    return wt
      ? '<a href="' + conceptUrl(wt.slug) + '"' + (snippet ? ' title="' + escapeHTML(snippet) + '"' : '') + '>' + escapeHTML(display) + '</a>'
      : escapeHTML(display);
  });
  return html;
}

// ================================================================
//  Full-document linkifiers (used by narrative and concept pages)
// ================================================================

/** Linkify narrative body text (supports paragraph breaks + wiki-links). */
export function linkifyNarrativeText(text) {
  let html = escapeHTML(text || "").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";
  html = html.replace(/\[\[([^\]]+)\]\]/g, _wikiReplace);
  return html;
}

/** Linkify a single inline string (no paragraph breaks). */
export function linkifyNarrativeInline(text) {
  let html = escapeHTML(text || "");
  html = html.replace(/\[\[([^\]]+)\]\]/g, _wikiReplace);
  return html;
}

/** Linkify a concept description (supports paragraphs + wiki-links). */
export function linkifyDescription(text) {
  let html = escapeHTML(text).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";
  html = html.replace(/\[\[([^\]]+)\]\]/g, _wikiReplace);
  return html;
}

function _descSnippet(text) {
  const clean = String(text || "").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").trim();
  const words = clean.split(/\s+/).filter(function (w) { return w && !/^[A-Za-z]\d{2,}$/.test(w); });
  if (!words.length) return "";
  return (words.length <= 10 ? words.join(" ") : words.slice(0, 10).join(" ") + "…");
}

/** Shared [[wiki-link]] replacer used by all linkify functions. */
function _wikiReplace(_, raw) {
  const pipeIdx = String(raw || "").indexOf("|");
  const targetName = (pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw).trim();
  const explicitLabel = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : "";
  const target = resolveWikiTarget(targetName);
  const display = explicitLabel || (target && target.label) || targetName;
  const snippet = target ? _descSnippet(target.description) : "";
  return target
    ? '<a href="' + conceptUrl(target.slug) + '"' + (snippet ? ' title="' + escapeHTML(snippet) + '"' : '') + '>' + escapeHTML(display) + '</a>'
    : escapeHTML(display);
}

// ================================================================
//  Scrollytelling text helpers
// ================================================================

/**
 * Extract a short description from a relation explanation or concept description.
 * Prefers the segment after the first colon.
 */
export function extractShortDesc(text, maxChars) {
  const max = maxChars || 110;
  let s = String(text || "").trim();
  if (!s) return "";
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, a, b) { return b || a; });
  const colon = s.indexOf(":");
  if (colon > 0 && colon < 60) s = s.slice(colon + 1).trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "\u2026";
  }
  return s;
}

/** Wrap text into lines of approximately `maxChars`. */
export function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const next = current ? current + " " + words[i] : words[i];
    if (next.length > maxChars && current) {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last) + "\u2026";
  }
  return lines;
}

/** Convert a small positive integer to a Roman numeral string. */
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
export function toRoman(n) { return ROMAN[n] || String(n); }

/** Derive a short chapter label from an element title for the scrolly side-nav. */
export function shortChapterLabel(text, maxChars) {
  const s = String(text || "").trim();
  if (!s) return "";
  const head = s.split(/[:—–-]/)[0].trim();
  const words = head.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^\p{L}\p{N}]/gu, "");
    if (w.length >= 4) return w.toUpperCase().slice(0, maxChars);
  }
  return head.toUpperCase().slice(0, maxChars);
}
