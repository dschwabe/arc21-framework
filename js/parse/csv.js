/**
 * js/parse/csv.js
 * CSV delimiter detection and parsing.
 * Depends only on js/utils.js.
 */

import { normalizeHeader, get, makeCsvImportError } from "../utils.js?v=6";

export function countDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') i++;
      else if (char === '"') inQuotes = false;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === delimiter) count++;
    }
  }
  return count;
}

export function firstPhysicalLine(text) {
  const lines = String(text || "").replace(/^\ufeff/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) return lines[i];
  }
  return "";
}

export function detectDelimiter(text) {
  const line = firstPhysicalLine(text);
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  candidates.forEach(function (d) {
    const c = countDelimiter(line, d);
    if (c > bestCount) { best = d; bestCount = c; }
  });
  return { delimiter: best, count: bestCount, firstLine: line };
}

export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  let line = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') { value += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { if (char === "\n") line++; value += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === delimiter) { row.push(value); value = ""; }
      else if (char === "\n") { row.push(value); rows.push(row); row = []; value = ""; line++; }
      else if (char !== "\r") { value += char; }
    }
  }

  if (inQuotes) {
    throw makeCsvImportError(
      "Há aspas abertas no CSV.",
      "Verifique a linha próxima ao erro, feche aspas não terminadas ou exporte a planilha novamente como CSV. Campos com separadores ou quebras de linha precisam estar entre aspas.",
      "O analisador chegou ao fim do arquivo ainda dentro de um campo entre aspas, após a linha " + line + "."
    );
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

export function parseCSV(text) {
  if (!text || !String(text).trim()) {
    throw makeCsvImportError(
      "O arquivo CSV está vazio.",
      "Exporte novamente a tabela como CSV UTF-8 e confirme que a primeira linha contém os nomes das colunas."
    );
  }

  const detection = detectDelimiter(text);
  const rows = parseDelimited(String(text).replace(/^\ufeff/, ""), detection.delimiter);
  const headerRow = rows.shift() || [];
  const headers = headerRow.map(function (h) { return String(h).trim().replace(/^\ufeff/, ""); });
  const normalizedHeaders = headers.map(normalizeHeader);

  if (!headers.length || headers.every(function (h) { return !h; })) {
    throw makeCsvImportError(
      "O CSV não tem cabeçalho.",
      "A primeira linha deve conter os nomes das colunas. Use, por exemplo: concept;description;relatedConcept;relationName;explanation;sourceUrl;imagePath;sourceTitle."
    );
  }
  if (headers.length === 1 && detection.count <= 0) {
    throw makeCsvImportError(
      "O arquivo parece ter apenas uma coluna.",
      "Confirme que o arquivo foi salvo como CSV, TSV ou CSV separado por ponto e vírgula. A primeira linha precisa conter colunas como concept, relatedConcept e relationName.",
      "Cabeçalho lido: " + headers[0]
    );
  }

  const conceptAliases = ["concept", "conceito", "sourceconcept", "conceptextractedfromtext", "conceitoextraidodotexto"];
  const hasConceptColumn = conceptAliases.some(function (h) { return normalizedHeaders.indexOf(h) >= 0; });
  if (!hasConceptColumn) {
    throw makeCsvImportError(
      "Não encontrei uma coluna de conceito.",
      "Renomeie a coluna principal para concept, conceito, sourceConcept ou Concept extracted from text. Sem essa coluna, o site não sabe quais páginas criar.",
      "Colunas encontradas: " + headers.join(" | ")
    );
  }

  const parsedRows = rows
    .filter(function (r) { return r.some(function (cell) { return String(cell).trim() !== ""; }); })
    .map(function (r, rowIndex) {
      if (r.length > headers.length) {
        console.warn("Linha " + (rowIndex + 2) + ": há mais campos (" + r.length + ") do que colunas no cabeçalho (" + headers.length + "). Verifique separadores não escapados.");
      }
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = r[i] == null ? "" : r[i]; });
      return obj;
    });

  if (!parsedRows.length) {
    throw makeCsvImportError(
      "O CSV tem cabeçalho, mas não tem linhas de dados.",
      "Adicione ao menos uma linha com um valor na coluna concept. Cada linha deve representar uma relação do tipo concept → relatedConcept."
    );
  }

  parsedRows._delimiter = detection.delimiter;
  return parsedRows;
}
