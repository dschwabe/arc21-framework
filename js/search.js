// js/search.js — full-text search over concepts and narratives.
//
// Pure data module (no DOM). Builds a flat, normalized index from the in-memory
// graph + narrative + concept-text stores, then answers queries grouped by the
// kind of element a match occurs in (concept vs narrative). Everything is already
// in memory after load, so this works identically on the live site and in the
// offline bundle (no fetch).
//
// Matching is accent- and case-insensitive (pt-BR content), so "territorio"
// finds "Território". Each result carries an HTML snippet with the matched terms
// wrapped in <mark>.

import { conceptUrl, narrativeUrl, narrativeElementUrl, resolveWikiTarget } from "./graph/navigation.js?v=12";
import { getConceptTexts } from "./store.js?v=12";
import { escapeHTML } from "./utils.js?v=12";

// ── Text normalization ──────────────────────────────────────────────────────

// Lowercase + strip diacritics (NFD) + collapse whitespace. Used for the
// searchable haystack and for query terms.
export function normalizeText(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Single-token fold (no whitespace collapse needed); for Latin text this is
// length-preserving, which lets makeSnippet map a match back to the original.
function foldWord(w) {
  return String(w == null ? "" : w)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip narrative grammar markup and wiki-link syntax so indexed/snippet text is
// clean prose: ##giv key=val ...## frontmatter, ##title2##…## / ##inline-title##…##
// markers, and [[target|label]] → label · [[target]] → resolveTarget(target) (the
// referenced concept's title, matching what the renderer displays) or the raw
// target if it doesn't resolve. (Wiki-link regex mirrors js/render/content.js.)
export function stripMarkup(s, resolveTarget) {
  return String(s == null ? "" : s)
    .replace(/##giv\s+[^#]*?##/gi, " ")            // giv frontmatter (has spaces)
    .replace(/##[a-z0-9_-]+##/gi, " ")             // single-token markers
    .replace(/##/g, " ")                            // stray delimiters
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, a, b) {
      if (b) return b;
      const resolved = resolveTarget && resolveTarget(a.trim());
      return resolved || a;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// ── Index construction ──────────────────────────────────────────────────────

function pushField(fields, text, weight, resolveTarget) {
  const clean = stripMarkup(text, resolveTarget);
  if (clean) fields.push({ text: clean, weight: weight });
}

function makeRecord(kind, title, context, url, fields) {
  //  separator keeps words from adjacent fields from forming accidental
  // cross-field substrings in the haystack.
  const haystack = normalizeText(
    fields.map(function (f) { return f.text; }).join("  ")
  );
  return { kind: kind, title: title, context: context, url: url, fields: fields, haystack: haystack };
}

function firstWords(s, n) {
  const w = String(s || "").split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return w.length <= n ? w.join(" ") : w.slice(0, n).join(" ") + "…";
}

// ── Fuzzy "did you mean" suggestions ────────────────────────────────────────

const MIN_SUGGEST_LEN = 3;

// Word frequency table over all indexed text, used to suggest corrections for
// queries that match nothing. Short/common tokens are excluded.
function buildVocabulary(records) {
  const counts = new Map();
  records.forEach(function (rec) {
    rec.fields.forEach(function (f) {
      normalizeText(f.text).split(/[^a-z0-9]+/).forEach(function (w) {
        if (w.length < MIN_SUGGEST_LEN) return;
        counts.set(w, (counts.get(w) || 0) + 1);
      });
    });
  });
  return Array.from(counts, function (e) { return { word: e[0], count: e[1] }; });
}

// Classic Levenshtein edit distance (insert/delete/substitute), iterative DP.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

// Nearest vocabulary words to `term` by edit distance (tolerance grows with
// length), ranked by distance then frequency. Empty for short/unknown terms.
function suggestWords(term, vocab, limit) {
  if (term.length < MIN_SUGGEST_LEN) return [];
  const maxDist = term.length <= 4 ? 1 : term.length <= 8 ? 2 : 3;
  const out = [];
  vocab.forEach(function (entry) {
    if (Math.abs(entry.word.length - term.length) > maxDist) return;
    const d = levenshtein(term, entry.word);
    if (d > 0 && d <= maxDist) out.push({ word: entry.word, dist: d, count: entry.count });
  });
  out.sort(function (a, b) {
    return a.dist - b.dist || b.count - a.count || a.word.localeCompare(b.word);
  });
  return out.slice(0, limit || 3).map(function (e) { return e.word; });
}

// Build (and cache on appStore.searchIndex) the flat record list. Call again to
// rebuild after the underlying data changes.
export function buildSearchIndex(appStore) {
  const records = [];

  // Resolve a bare [[target]] wiki-link to the referenced concept's title, matching
  // what the renderer displays (resolveWikiTarget reads appStore.graph internally).
  function resolveTarget(target) {
    const wt = resolveWikiTarget(target);
    return wt && wt.label;
  }

  // ── Concepts: one record per concept, aggregating all its text ──
  const g = appStore.graph;
  if (g && g.order && g.bySlug) {
    g.order.forEach(function (slug) {
      const c = g.bySlug[slug];
      if (!c) return;
      const fields = [];
      pushField(fields, c.concept, 10, resolveTarget);            // title
      pushField(fields, c.description, 5, resolveTarget);
      (c.relations || []).forEach(function (r) {
        pushField(fields, r.relationName, 2, resolveTarget);
        pushField(fields, r.explanation, 3, resolveTarget);
        pushField(fields, r.relationTypeDescription, 1, resolveTarget);
      });
      // POV concept texts — the richest prose, keyed by conceptID.
      if (c.conceptID) {
        getConceptTexts(c.conceptID).forEach(function (t) {
          pushField(fields, t.text, 4, resolveTarget);
          pushField(fields, t.pov, 1, resolveTarget);
          pushField(fields, t.author, 1, resolveTarget);
        });
      }
      if (fields.length) {
        records.push(makeRecord("concept", c.concept, "", conceptUrl(slug), fields));
      }
    });
  }

  // ── Narratives: narrative-level + per-element records ──
  const ns = appStore.narrativeStore;
  if (ns && ns.order && ns.byId) {
    // element → parent narrative id
    const elemParent = {};
    ns.order.forEach(function (nid) {
      const n = ns.byId[nid];
      if (!n) return;
      (n.elements || []).forEach(function (eid) {
        if (!(eid in elemParent)) elemParent[eid] = nid;
      });
    });

    // narrative-level records (title/subtitle/summary/…)
    ns.order.forEach(function (nid) {
      const n = ns.byId[nid];
      if (!n || n.hidden) return;
      const fields = [];
      pushField(fields, n.narrativeTitle, 10, resolveTarget);
      pushField(fields, n.subtitle, 5, resolveTarget);
      pushField(fields, n.eyebrow, 3, resolveTarget);
      pushField(fields, n.narrativeSummary, 4, resolveTarget);
      pushField(fields, n.outroQuote, 2, resolveTarget);
      pushField(fields, n.outroMeta, 1, resolveTarget);
      if (fields.length) {
        records.push(makeRecord("narrative", n.narrativeTitle || nid, "", narrativeUrl(nid), fields));
      }
    });

    // element-level records (title + cleaned content), linking to the element
    if (ns.elementsById) {
      Object.keys(ns.elementsById).forEach(function (eid) {
        const el = ns.elementsById[eid];
        if (!el) return;
        const nid = elemParent[eid];
        if (!nid) return;                          // orphan element — can't link
        const parent = ns.byId[nid];
        if (parent && parent.hidden) return;
        const fields = [];
        pushField(fields, el.elementTitle, 6, resolveTarget);
        pushField(fields, el.elementContent, 4, resolveTarget);
        if (!fields.length) return;
        const title = stripMarkup(el.elementTitle, resolveTarget) ||
                      firstWords(stripMarkup(el.elementContent, resolveTarget), 6) || eid;
        const context = parent ? parent.narrativeTitle : "";
        records.push(makeRecord("narrative", title, context, narrativeElementUrl(nid, eid), fields));
      });
    }
  }

  appStore.searchIndex = records;
  appStore.searchVocab = buildVocabulary(records);
  return records;
}

// ── Query ───────────────────────────────────────────────────────────────────

// Score a record and pick the best field to snippet from.
function scoreRecord(rec, terms) {
  let score = 0;
  let bestField = null;
  let bestRank = -1;

  rec.fields.forEach(function (f) {
    const norm = normalizeText(f.text);
    let fieldScore = 0;
    let matchedAll = true;
    terms.forEach(function (t) {
      let idx = norm.indexOf(t);
      if (idx === -1) { matchedAll = false; return; }
      let count = 0;
      while (idx !== -1) { count++; idx = norm.indexOf(t, idx + t.length); }
      fieldScore += count * f.weight;
      // whole-word bonus
      const wordRe = new RegExp("(^|[^a-z0-9])" + escapeRegex(t) + "([^a-z0-9]|$)");
      if (wordRe.test(norm)) fieldScore += f.weight;
    });
    score += fieldScore;
    // Snippet from the field that matches the most terms, then by score.
    const rank = (matchedAll ? 100000 : 0) + fieldScore;
    if (rank > bestRank) { bestRank = rank; bestField = f; }
  });

  return { score: score, snippet: bestField ? makeSnippet(bestField.text, terms) : "" };
}

// Build a word-windowed HTML snippet around the first matching term, with the
// matched substrings wrapped in <mark>. Works on word boundaries to avoid
// fragile char-index alignment across diacritic folding.
export function makeSnippet(cleanText, terms, windowWords) {
  const text = String(cleanText || "").trim();
  if (!text) return "";
  const win = windowWords || 16;
  const words = text.split(/\s+/);
  const folded = words.map(foldWord);

  let hit = -1;
  for (let i = 0; i < folded.length && hit === -1; i++) {
    for (let j = 0; j < terms.length; j++) {
      if (terms[j] && folded[i].indexOf(terms[j]) !== -1) { hit = i; break; }
    }
  }
  if (hit === -1) hit = 0;

  let start = Math.max(0, hit - Math.floor(win / 2));
  let end = Math.min(words.length, start + win);
  start = Math.max(0, end - win);

  const html = words.slice(start, end).map(function (w) {
    return markWord(w, terms);
  }).join(" ");

  return (start > 0 ? "… " : "") + html + (end < words.length ? " …" : "");
}

// Highlight the matched substring within a single word (precise when the fold is
// length-preserving, which holds for Latin text; otherwise highlights the whole
// word). Always returns HTML-escaped output.
function markWord(word, terms) {
  const folded = foldWord(word);
  let best = null;
  for (let j = 0; j < terms.length; j++) {
    const t = terms[j];
    if (!t) continue;
    const idx = folded.indexOf(t);
    if (idx !== -1 && (best === null || idx < best.idx || (idx === best.idx && t.length > best.len))) {
      best = { idx: idx, len: t.length };
    }
  }
  if (best === null) return escapeHTML(word);
  if (folded.length === word.length) {
    return escapeHTML(word.slice(0, best.idx)) +
           "<mark>" + escapeHTML(word.slice(best.idx, best.idx + best.len)) + "</mark>" +
           escapeHTML(word.slice(best.idx + best.len));
  }
  return "<mark>" + escapeHTML(word) + "</mark>";
}

// Run a query. Returns results grouped by kind, each list ranked by score.
// Lazily (re)builds the index if it has been invalidated.
export function searchAll(query, appStore) {
  const empty = { concepts: [], narratives: [], total: 0, suggestions: [] };
  const q = normalizeText(query);
  if (!q) return empty;
  const terms = q.split(" ").filter(Boolean);
  if (!terms.length) return empty;

  const index = appStore.searchIndex || buildSearchIndex(appStore);
  const concepts = [];
  const narratives = [];

  index.forEach(function (rec) {
    for (let i = 0; i < terms.length; i++) {
      if (rec.haystack.indexOf(terms[i]) === -1) return;   // AND across terms
    }
    const scored = scoreRecord(rec, terms);
    const out = {
      kind: rec.kind,
      title: rec.title,
      context: rec.context,
      url: rec.url,
      score: scored.score,
      snippet: scored.snippet
    };
    (rec.kind === "concept" ? concepts : narratives).push(out);
  });

  const byScore = function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.title).localeCompare(String(b.title), "pt-BR", { sensitivity: "base" });
  };
  concepts.sort(byScore);
  narratives.sort(byScore);

  const total = concepts.length + narratives.length;
  let suggestions = [];
  if (!total) {
    const vocab = appStore.searchVocab || [];
    const queryWords = String(query).trim().split(/\s+/);
    terms.forEach(function (term, i) {
      const hasHit = index.some(function (rec) { return rec.haystack.indexOf(term) !== -1; });
      if (hasHit) return;
      suggestWords(term, vocab, 3).forEach(function (word) {
        const words = queryWords.slice();
        words[i] = word;
        suggestions.push({ word: word, query: words.join(" ") });
      });
    });
    suggestions = suggestions.slice(0, 5);
  }

  return { concepts: concepts, narratives: narratives, total: total, suggestions: suggestions };
}
