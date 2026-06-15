/**
 * js/utils.js
 * Pure, stateless helper functions shared across the whole application.
 * No DOM access. No state imports.
 */

export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch];
  });
}

export function escapeAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isHttpUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}

export function csvEscape(value, delimiter) {
  const v = String(value == null ? "" : value);
  const mustQuote =
    v.indexOf('"') >= 0 ||
    v.indexOf("\n") >= 0 ||
    v.indexOf("\r") >= 0 ||
    v.indexOf(delimiter) >= 0;
  const escaped = v.replace(/"/g, '""');
  return mustQuote ? '"' + escaped + '"' : escaped;
}

export function graphToCsv(data, delimiter) {
  delimiter = delimiter || ";";
  const headers = ["concept", "description", "relatedConcept", "relationName", "explanation", "sourceUrl", "imagePath", "sourceTitle"];
  const lines = [headers.join(delimiter)];
  if (!data || !data.order) return lines.join("\n");
  data.order.forEach(function (slug) {
    const c = data.bySlug[slug];
    if (!c) return;
    if (c.relations && c.relations.length) {
      c.relations.forEach(function (rel) {
        lines.push([c.concept, c.description || "", rel.target || "", rel.relationName || "", rel.explanation || "", c.sourceUrl || "", c.imagePath || "", c.sourceTitle || ""]
          .map(function (v) { return csvEscape(v, delimiter); }).join(delimiter));
      });
    } else {
      lines.push([c.concept, c.description || "", "", "", "", c.sourceUrl || "", c.imagePath || "", c.sourceTitle || ""]
        .map(function (v) { return csvEscape(v, delimiter); }).join(delimiter));
    }
  });
  return lines.join("\n");
}

export function downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "");
}

export function get(row, names) {
  const normalized = {};
  Object.keys(row).forEach(function (k) {
    normalized[normalizeHeader(k)] = row[k];
  });
  for (let i = 0; i < names.length; i++) {
    const value = normalized[normalizeHeader(names[i])];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

// Returns an object of all non-empty columns in `row` whose normalised header
// is NOT covered by any alias in `knownAliases`. Used to populate .extra on
// concepts, relations, and relation types (Change 1 — preserve unknown columns).
export function extraFrom(row, knownAliases) {
  const skip = new Set(knownAliases.map(normalizeHeader));
  const result = {};
  Object.keys(row).forEach(function (k) {
    if (!skip.has(normalizeHeader(k))) {
      const v = String(row[k] == null ? "" : row[k]).trim();
      if (v !== "") result[k] = v;
    }
  });
  return result;
}

export function makeCsvImportError(message, fix, details) {
  const err = new Error(message);
  err.name = "CsvImportError";
  err.fix = fix;
  err.details = details || "";
  return err;
}

export function makeSpreadsheetImportError(message, fix, details) {
  const err = new Error(message);
  err.fix = fix;
  err.details = details || "";
  err.kind = "spreadsheet-import";
  return err;
}

export function isSpreadsheetName(name) {
  return /\.(xlsx|xlxs|xlsm)$/i.test(String(name || ""));
}

export function normalizeConceptId(value) {
  return String(value || "").trim().toUpperCase();
}

/** Shorthand for `querySelector`. */
export function $(selector, root) {
  return (root || document).querySelector(selector);
}
