/**
 * js/parse/xlsx.js
 * Low-level XLSX binary reader.
 * Parses the OOXML ZIP structure into row objects.
 * Depends only on js/utils.js.
 */

import { makeSpreadsheetImportError, normalizeHeader } from "../utils.js?v=12";

// ---- ZIP / binary helpers ----

function readUint16(view, offset) { return view.getUint16(offset, true); }
function readUint32(view, offset) { return view.getUint32(offset, true); }
function decodeBytes(bytes) { return new TextDecoder("utf-8").decode(bytes); }

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw makeSpreadsheetImportError(
      "Este navegador não oferece suporte interno para descompactar arquivos XLSX.",
      "Use uma versão recente do Chrome, Edge ou Firefox. Como alternativa, abra a planilha no Excel e salve/exporte como CSV UTF-8, mantendo as colunas esperadas.",
      "O parser local de XLSX depende de DecompressionStream para ler os XMLs internos da planilha."
    );
  }
  async function tryFormat(format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  try { return await tryFormat("deflate-raw"); }
  catch (e) { return await tryFormat("deflate"); }
}

export async function unzipXlsxEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const maxBack = Math.max(0, bytes.length - 22 - 65536);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= maxBack; i--) {
    if (readUint32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    throw makeSpreadsheetImportError(
      "O arquivo selecionado não parece ser uma planilha XLSX válida.",
      "Confirme que o arquivo foi salvo como .xlsx. Arquivos .xls antigos não são suportados por este site local; salve como .xlsx ou exporte como CSV UTF-8.",
      "Não foi encontrado o marcador ZIP central usado por arquivos XLSX."
    );
  }
  const totalEntries = readUint16(view, eocd + 10);
  let centralOffset = readUint32(view, eocd + 16);
  const entries = {};
  for (let n = 0; n < totalEntries; n++) {
    if (readUint32(view, centralOffset) !== 0x02014b50) break;
    const method = readUint16(view, centralOffset + 10);
    const compressedSize = readUint32(view, centralOffset + 20);
    const uncompressedSize = readUint32(view, centralOffset + 24);
    const fileNameLength = readUint16(view, centralOffset + 28);
    const extraLength = readUint16(view, centralOffset + 30);
    const commentLength = readUint16(view, centralOffset + 32);
    const localHeaderOffset = readUint32(view, centralOffset + 42);
    const fileName = decodeBytes(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));
    if (readUint32(view, localHeaderOffset) !== 0x04034b50) {
      centralOffset += 46 + fileNameLength + extraLength + commentLength;
      continue;
    }
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed);
    else {
      throw makeSpreadsheetImportError(
        "A planilha usa um método de compactação não suportado.",
        "Salve novamente o arquivo como .xlsx no Excel/LibreOffice ou exporte como CSV UTF-8.",
        "Método ZIP encontrado para " + fileName + ": " + method + "."
      );
    }
    entries[fileName] = { bytes: content, text: null, uncompressedSize: uncompressedSize };
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

export function zipText(entries, path) {
  const entry = entries[path];
  if (!entry) return "";
  if (entry.text == null) entry.text = decodeBytes(entry.bytes);
  return entry.text;
}

// ---- XML helpers ----

export function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) {
    throw makeSpreadsheetImportError(
      "Não foi possível ler o XML interno da planilha.",
      "Salve novamente a planilha como .xlsx ou exporte como CSV UTF-8.",
      "Falha ao analisar " + label + "."
    );
  }
  return doc;
}

export function xmlLocalName(node) {
  const raw = node ? (node.localName || node.nodeName || node.tagName || "") : "";
  return String(raw).split(":").pop();
}

export function attributeByLocalName(node, wantedLocalName) {
  if (!node || !node.attributes) return "";
  const direct = node.getAttribute(wantedLocalName);
  if (direct != null) return direct;
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    const local = String(attr.localName || attr.nodeName || attr.name || "").split(":").pop();
    if (local === wantedLocalName) return attr.value || "";
  }
  return "";
}

export function childElementsByLocalName(node, localName) {
  const result = [];
  const children = node ? node.children || [] : [];
  for (let i = 0; i < children.length; i++) {
    if (xmlLocalName(children[i]) === localName) result.push(children[i]);
  }
  return result;
}

export function firstChildByLocalName(node, localName) {
  const list = childElementsByLocalName(node, localName);
  return list.length ? list[0] : null;
}

export function allDescendantsByLocalName(node, localName) {
  const all = node ? node.getElementsByTagName("*") : [];
  const result = [];
  for (let i = 0; i < all.length; i++) {
    if (xmlLocalName(all[i]) === localName) result.push(all[i]);
  }
  return result;
}

export function columnIndexFromCellRef(ref) {
  const letters = String(ref || "").match(/^[A-Z]+/i);
  if (!letters) return 0;
  let n = 0;
  const s = letters[0].toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

// ---- Shared-strings + sheet parsers ----

export function readSharedStrings(entries) {
  const text = zipText(entries, "xl/sharedStrings.xml");
  if (!text) return [];
  const doc = parseXml(text, "xl/sharedStrings.xml");
  const strings = [];
  const sis = allDescendantsByLocalName(doc, "si");
  for (let i = 0; i < sis.length; i++) {
    strings.push(allDescendantsByLocalName(sis[i], "t").map(function (t) { return t.textContent || ""; }).join(""));
  }
  return strings;
}

export function normalizeXlsxTargetPath(target, baseDir) {
  let clean = String(target || "").replace(/\\/g, "/").trim();
  if (!clean) return "";
  clean = clean.replace(/^\/+/, "");
  if (!clean) return "";
  if (clean.indexOf("xl/") === 0) return clean;
  const base = String(baseDir || "xl").replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = (base + "/" + clean).split("/");
  const normalized = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

export function readWorkbookSheets(entries) {
  const workbookPath = "xl/workbook.xml";
  const relsPath = "xl/_rels/workbook.xml.rels";
  const workbookXml = zipText(entries, workbookPath);
  const relsXml = zipText(entries, relsPath);
  if (!workbookXml || !relsXml) {
    throw makeSpreadsheetImportError(
      "A planilha XLSX não contém a estrutura esperada de workbook.",
      "Salve novamente como .xlsx no Excel/LibreOffice ou exporte como CSV UTF-8.",
      "Arquivos xl/workbook.xml ou xl/_rels/workbook.xml.rels não foram encontrados."
    );
  }
  const workbookDoc = parseXml(workbookXml, workbookPath);
  const relsDoc = parseXml(relsXml, relsPath);
  const relMap = {};
  const relationships = allDescendantsByLocalName(relsDoc, "Relationship");
  for (let i = 0; i < relationships.length; i++) {
    const id = relationships[i].getAttribute("Id") || attributeByLocalName(relationships[i], "Id");
    const target = relationships[i].getAttribute("Target") || attributeByLocalName(relationships[i], "Target") || "";
    if (id) relMap[id] = normalizeXlsxTargetPath(target, "xl");
  }
  // Regex fallback: some browsers fail to read namespaced r:id via DOM when
  // xmlns:r is re-declared on each <sheet> element. Parse the raw XML directly.
  const ridByName = {};
  const _rxSheet = /<sheet\b[^>]*>/g;
  let _sm;
  while ((_sm = _rxSheet.exec(workbookXml)) !== null) {
    const tag = _sm[0];
    const nm  = (tag.match(/\bname="([^"]*)"/) || [])[1];
    const rid = (tag.match(/\br:id="([^"]*)"/) || tag.match(/\brid="([^"]*)"/i) || [])[1];
    if (nm && rid) ridByName[nm] = rid;
  }

  const sheets = [];
  const sheetNodes = allDescendantsByLocalName(workbookDoc, "sheet");
  for (let i = 0; i < sheetNodes.length; i++) {
    const node = sheetNodes[i];
    const name = node.getAttribute("name") || attributeByLocalName(node, "name") || "Sheet" + (i + 1);
    const rid = node.getAttribute("r:id") ||
      node.getAttribute("id") ||
      node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
      attributeByLocalName(node, "id") ||
      ridByName[name] || "";
    sheets.push({ name: name, relationshipId: rid || "", path: rid && relMap[rid] ? relMap[rid] : "" });
  }
  return sheets;
}

export function readCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t") || "";
  if (type === "inlineStr") {
    const inline = firstChildByLocalName(cell, "is");
    return allDescendantsByLocalName(inline, "t").map(function (t) { return t.textContent || ""; }).join("");
  }
  const vNode = firstChildByLocalName(cell, "v");
  const raw = vNode ? (vNode.textContent || "") : "";
  if (type === "s") return sharedStrings[parseInt(raw, 10)] || "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

export function worksheetToMatrix(xmlText, sharedStrings, label) {
  const doc = parseXml(xmlText, label);
  const rows = allDescendantsByLocalName(doc, "row");
  const matrix = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = childElementsByLocalName(row, "c");
    const values = [];
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      const ref = cell.getAttribute("r") || "";
      const colIndex = columnIndexFromCellRef(ref) || j;
      values[colIndex] = readCellValue(cell, sharedStrings);
    }
    matrix.push(values.map(function (v) { return v == null ? "" : String(v); }));
  }
  return matrix;
}

export function matrixToObjects(matrix) {
  const headerIndex = matrix.findIndex(function (row) {
    return row && row.some(function (cell) { return String(cell || "").trim() !== ""; });
  });
  if (headerIndex < 0) {
    const empty = [];
    empty._headers = [];
    return empty;
  }
  const headers = matrix[headerIndex].map(function (h) { return String(h || "").trim().replace(/^\ufeff/, ""); });
  const objects = matrix.slice(headerIndex + 1)
    .filter(function (row) { return row && row.some(function (cell) { return String(cell || "").trim() !== ""; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (header, index) { if (header) obj[header] = row[index] || ""; });
      return obj;
    });
  objects._headers = headers.filter(function (h) { return String(h || "").trim() !== ""; });
  return objects;
}

export function sheetColumns(rows) {
  if (rows && rows._headers) return rows._headers.slice();
  const seen = {};
  const cols = [];
  (rows || []).forEach(function (row) {
    Object.keys(row || {}).forEach(function (key) {
      if (!seen[key]) { seen[key] = true; cols.push(key); }
    });
  });
  return cols;
}

export function hasColumns(rows, expectedColumns) {
  const cols = sheetColumns(rows).map(normalizeHeader);
  return expectedColumns.every(function (col) { return cols.indexOf(normalizeHeader(col)) >= 0; });
}

export function formatSheetDiagnostics(sheetInfo) {
  const keys = Object.keys(sheetInfo || {});
  const found = keys.length ? keys.join(" | ") : "nenhuma aba reconhecida";
  const expected = [
    "Concepts: conceptID, ConceptLabel, description",
    "Relations legacy: ConceptId, relationName, relatedConcept, explanation",
    "Relations normalized: ConceptId, relationTypeID, relatedConcept, explanation",
    "Relation Types (when relationTypeID is used): relationID, relationType, category, description"
  ].join("; ");
  const actual = keys.length ? keys.map(function (name) {
    const cols = sheetColumns(sheetInfo[name].rows);
    const path = sheetInfo[name].path ? " [" + sheetInfo[name].path + "]" : "";
    return name + path + ": " + (cols.length ? cols.join(", ") : "sem cabeçalho detectado");
  }).join("; ") : "nenhuma coluna detectada";
  return "Abas encontradas: " + found + ". Colunas esperadas: " + expected + ". Colunas encontradas por aba: " + actual + ".";
}

export function getSheetInfoByName(sheetInfo, wantedName) {
  const normalizedWanted = normalizeHeader(wantedName);
  const keys = Object.keys(sheetInfo || {});
  for (let i = 0; i < keys.length; i++) {
    if (normalizeHeader(keys[i]) === normalizedWanted) return sheetInfo[keys[i]];
  }
  return null;
}

export function getSheetRowsByName(sheetsByName, wantedName) {
  const normalizedWanted = normalizeHeader(wantedName);
  const keys = Object.keys(sheetsByName);
  for (let i = 0; i < keys.length; i++) {
    if (normalizeHeader(keys[i]) === normalizedWanted) return sheetsByName[keys[i]];
  }
  return null;
}
