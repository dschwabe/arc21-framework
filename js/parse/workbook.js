/**
 * js/parse/workbook.js
 * High-level XLSX workbook parsers.
 * Depends on js/parse/xlsx.js and js/utils.js.
 */

import {
  unzipXlsxEntries, zipText, readSharedStrings, readWorkbookSheets,
  worksheetToMatrix, matrixToObjects,
  hasColumns, formatSheetDiagnostics, getSheetInfoByName
} from "./xlsx.js?v=6";

import {
  get, normalizeConceptId, makeSpreadsheetImportError
} from "../utils.js?v=6";

// Re-export for callers that only import workbook.
export { hasColumns, getSheetInfoByName };

// ---- Convenience: parse a workbook that only has Concepts/Relations ----
export async function parseSpreadsheetWorkbook(arrayBuffer) {
  const result = await parseCombinedWorkbook(arrayBuffer, { requireNarratives: false });
  return result.rows;
}

// ---- Main combined parser ----
// Returns { rows, narratives, media, templates, narrativeSkins, conceptSkins, conceptTexts, skinData, hasGraph, hasNarratives }.
export async function parseCombinedWorkbook(arrayBuffer, options) {
  options = options || {};
  const entries = await unzipXlsxEntries(arrayBuffer);
  const sharedStrings = readSharedStrings(entries);
  const sheets = readWorkbookSheets(entries);
  if (!sheets.length) {
    throw makeSpreadsheetImportError(
      "Não consegui ler a lista de abas da planilha.",
      "Salve novamente o arquivo como .xlsx no Excel ou LibreOffice e tente de novo. Esta versão do importador reconhece tags XML com namespace, como x:sheet.",
      "Nenhuma aba foi encontrada em xl/workbook.xml."
    );
  }

  const sheetInfo = {};
  sheets.forEach(function (sheet) {
    let rows = [];
    let readError = "";
    if (sheet.path) {
      const xml = zipText(entries, sheet.path);
      if (xml) rows = matrixToObjects(worksheetToMatrix(xml, sharedStrings, sheet.path));
      else readError = "Arquivo interno não encontrado: " + sheet.path;
    } else {
      readError = "A aba não tem Relationship Id resolvido para um arquivo de worksheet.";
    }
    sheetInfo[sheet.name] = { name: sheet.name, path: sheet.path || "", relationshipId: sheet.relationshipId || "", rows: rows, error: readError };
  });

  const conceptInfo = getSheetInfoByName(sheetInfo, "Concepts");
  const relationInfo = getSheetInfoByName(sheetInfo, "Relations");
  const relationTypesInfo = getSheetInfoByName(sheetInfo, "Relation Types");
  const diagnostics = formatSheetDiagnostics(sheetInfo);

  if (!conceptInfo) {
    throw makeSpreadsheetImportError("Não encontrei a aba Concepts na planilha.", "Renomeie a aba de conceitos para exatamente Concepts.", diagnostics);
  }
  if (!relationInfo) {
    throw makeSpreadsheetImportError("Não encontrei a aba Relations na planilha.", "Renomeie a aba de relações para exatamente Relations.", diagnostics);
  }
  if (!hasColumns(conceptInfo.rows, ["conceptID"])) {
    throw makeSpreadsheetImportError("A aba Concepts não tem a coluna obrigatória conceptID.", "Use o cabeçalho conceptID.", diagnostics);
  }

  // source column: ConceptId (legacy) or source (v2)
  // target column: relatedConcept (legacy) or target (v2)
  const _relHasSrc = hasColumns(relationInfo.rows, ["ConceptId"]) || hasColumns(relationInfo.rows, ["source"]);
  const _relHasTgt = hasColumns(relationInfo.rows, ["relatedConcept"]) || hasColumns(relationInfo.rows, ["target"]);
  const relationHasTypeId = _relHasSrc && _relHasTgt && hasColumns(relationInfo.rows, ["relationTypeID"]);
  const relationHasLegacyName = !relationHasTypeId && _relHasSrc && _relHasTgt && hasColumns(relationInfo.rows, ["relationName"]);
  if (!relationHasLegacyName && !relationHasTypeId) {
    throw makeSpreadsheetImportError(
      "A aba Relations não tem uma estrutura de relação reconhecida.",
      "Use o formato legado com ConceptId, relationName, relatedConcept e explanation, ou o formato normalizado com ConceptId (ou source), relationTypeID, relatedConcept (ou target) e explanation.",
      diagnostics
    );
  }

  const relationTypesById = {};
  if (relationHasTypeId) {
    if (!relationTypesInfo) {
      throw makeSpreadsheetImportError("A aba Relations usa relationTypeID, mas não encontrei a aba Relation Types.", "Adicione a aba Relation Types com relationID, relationType, category e description.", diagnostics);
    }
    const _rtHasId   = hasColumns(relationTypesInfo.rows, ["relationID"]) || hasColumns(relationTypesInfo.rows, ["relationTypeID"]);
    const _rtHasName = hasColumns(relationTypesInfo.rows, ["relationType"]) || hasColumns(relationTypesInfo.rows, ["name"]);
    if (!_rtHasId || !_rtHasName) {
      throw makeSpreadsheetImportError("A aba Relation Types não tem as colunas obrigatórias esperadas.", "Use os cabeçalhos relationID (ou relationTypeID) e relationType (ou name).", diagnostics);
    }
    relationTypesInfo.rows.forEach(function (row) {
      const relationID = normalizeConceptId(get(row, ["relationID", "relationTypeID", "RelationID", "id"]));
      const relationType = get(row, ["relationType", "relationName", "RelationType", "name", "label"]);
      if (!relationID || !relationType) return;
      relationTypesById[relationID] = {
        relationID: relationID,
        relationType: relationType,
        category: get(row, ["category", "Category", "categoria"]),
        description: get(row, ["description", "Description", "descrição", "descricao"])
      };
    });
    if (!Object.keys(relationTypesById).length) {
      throw makeSpreadsheetImportError("A aba Relation Types não contém tipos de relação válidos.", "Preencha pelo menos uma linha com relationID e relationType.", diagnostics);
    }
  }

  const conceptRows = conceptInfo.rows;
  const relationRows = relationInfo.rows;
  const conceptsById = {};
  const conceptOrder = [];
  conceptRows.forEach(function (row) {
    const id = normalizeConceptId(get(row, ["conceptID", "ConceptID", "ConceptId", "id"]));
    const label = get(row, ["ConceptLabel", "conceptLabel", "label", "Concept", "concept"]);
    if (!id || !label) return;
    conceptsById[id] = {
      id: id,
      label: label,
      description: get(row, ["description", "Description", "descrição", "descricao"]),
      sourceUrl: get(row, ["sourceUrl", "souceUrl", "url", "postUrl"]),
      imagePath: get(row, ["imagePath", "ImagePath", "snapshot", "screenshot"]),
      sourceTitle: get(row, ["sourceTitle", "SourceTitle", "postTitle", "source"]),
      level: get(row, ["level", "Level"]),
      camada: get(row, ["camada", "Camada"])
    };
    conceptOrder.push(id);
  });
  if (!conceptOrder.length) {
    throw makeSpreadsheetImportError("A aba Concepts não contém conceitos válidos.", "Preencha conceptID e ConceptLabel.", diagnostics + " Nenhuma linha válida encontrada.");
  }

  const outputRows = [];
  const conceptsWithOutgoingRelations = {};
  relationRows.forEach(function (row) {
    const sourceId = normalizeConceptId(get(row, ["ConceptId", "ConceptID", "conceptID", "conceptId", "source"]));
    const targetId = normalizeConceptId(get(row, ["relatedConcept", "RelatedConcept", "relatedConceptID", "targetConceptId", "target"]));
    const source = conceptsById[sourceId];
    const target = conceptsById[targetId];
    if (!sourceId && !targetId) return;
    if (!source) { console.warn("Relação ignorada: ConceptId sem correspondência na aba Concepts:", sourceId); return; }
    const relationTypeID = normalizeConceptId(get(row, ["relationTypeID", "RelationTypeID", "relationTypeId", "RelationTypeId", "relationID", "RelationID"]));
    const relationTypeInfo = relationTypeID ? relationTypesById[relationTypeID] : null;
    const relationName = relationHasTypeId
      ? (relationTypeInfo ? relationTypeInfo.relationType : relationTypeID)
      : get(row, ["relationName", "RelationName", "relação", "relacao"]);
    if (relationHasTypeId && (!relationTypeID || !relationTypeInfo)) console.warn("relationTypeID sem correspondência:", relationTypeID || "(vazio)");
    conceptsWithOutgoingRelations[sourceId] = true;
    outputRows.push({
      conceptID: source.id, ConceptLabel: source.label, concept: source.label,
      description: source.description, relatedConceptID: targetId,
      relatedConcept: target ? target.label : targetId, relationTypeID: relationTypeID,
      relationCategory: relationTypeInfo ? relationTypeInfo.category : "",
      relationTypeDescription: relationTypeInfo ? relationTypeInfo.description : "",
      relationName: relationName || relationTypeID,
      explanation: get(row, ["explanation", "Explanation", "explicação", "explicacao"]),
      sourceUrl: source.sourceUrl, imagePath: source.imagePath, sourceTitle: source.sourceTitle,
      level: source.level, camada: source.camada
    });
  });
  conceptOrder.forEach(function (id) {
    if (conceptsWithOutgoingRelations[id]) return;
    const c = conceptsById[id];
    outputRows.push({
      conceptID: c.id, ConceptLabel: c.label, concept: c.label, description: c.description,
      relatedConceptID: "", relatedConcept: "", relationTypeID: "", relationCategory: "",
      relationTypeDescription: "", relationName: "", explanation: "",
      sourceUrl: c.sourceUrl, imagePath: c.imagePath, sourceTitle: c.sourceTitle,
      level: c.level, camada: c.camada
    });
  });
  outputRows._sourceFormat = relationHasTypeId ? "xlsx-relation-types" : "xlsx";

  // Optional Narratives + Elements
  let narratives = null;
  const narrativeInfo = getSheetInfoByName(sheetInfo, "Narratives");
  const elementInfo = getSheetInfoByName(sheetInfo, "Elements");
  if (narrativeInfo && elementInfo &&
      hasColumns(narrativeInfo.rows, ["narrativeID"]) &&
      (hasColumns(narrativeInfo.rows, ["narrativeTitle"]) || hasColumns(narrativeInfo.rows, ["title"])) &&
      hasColumns(elementInfo.rows, ["elementID"])) {
    const elementsById = {};
    elementInfo.rows.forEach(function (row) {
      const id = get(row, ["elementID", "ElementID", "elementId", "id"]);
      if (!id) return;
      elementsById[id] = {
        elementID: id,
        elementTitle: get(row, ["elementTitle", "ElementTitle", "elementName", "title", "titulo", "título"]),
        elementContent: get(row, ["elementContent", "content", "text", "texto"]),
        referencedConceptIDs: get(row, ["referencedConceptIDs", "conceptIDs", "references", "refs", "conceitos"])
      };
    });
    const nById = {}, nOrder = [];
    narrativeInfo.rows.forEach(function (row) {
      const id = get(row, ["narrativeID", "NarrativeID", "narrativeId", "id"]);
      if (!id) return;
      const sequence = get(row, ["elements", "elementIDs", "sequence", "sequencia"])
        .split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      const skinCol2 = get(row, ["skin", "Skin", "skinID"]);
      const hiddenVal = get(row, ["hidden", "Hidden", "oculto", "Oculto"]).toLowerCase();
      nById[id] = {
        narrativeID: id,
        narrativeTitle: get(row, ["narrativeTitle", "title", "titulo", "título"]),
        narrativeStart: get(row, ["narrativeStart", "start", "startElement"]) || sequence[0] || "",
        narrativeSummary: get(row, ["narrativeSummary", "summary", "resumo"]),
        subtitle: get(row, ["subtitle", "Subtitle", "subtítulo"]),
        eyebrow: get(row, ["eyebrow", "Eyebrow", "tag"]),
        year: get(row, ["year", "Year", "ano"]),
        outroQuote: get(row, ["outroQuote", "outro", "closingQuote"]),
        outroMeta: get(row, ["outroMeta", "outroByline", "closingMeta"]),
        elements: sequence,
        skin: skinCol2 ? String(skinCol2).trim() : "",
        hidden: hiddenVal === "1" || hiddenVal === "true" || hiddenVal === "sim" || hiddenVal === "yes"
      };
      nOrder.push(id);
    });
    if (nOrder.length) {
      narratives = { byId: nById, order: nOrder, elementsById: elementsById, loadedAt: new Date().toISOString() };
    }
  }

  return {
    rows: outputRows,
    narratives: narratives,
    media: parseMediaSheet(sheetInfo),
    templates: parseTemplatesSheet(sheetInfo),
    narrativeSkins: parseNarrativeSkinsSheet(sheetInfo),
    conceptSkins: parseConceptSkinsSheet(sheetInfo),
    conceptTexts: parseConceptTextsSheet(sheetInfo),
    skinData: parseSkinDataContracts(sheetInfo, options.skinContracts || []),
    hasGraph: outputRows.length > 0,
    hasNarratives: !!narratives
  };
}

// ---- Sheet-level parsers ----
export function parseTemplatesSheet(sheetInfo) {
  const info = getSheetInfoByName(sheetInfo, "Templates");
  if (!info || !hasColumns(info.rows, ["templateID"])) return {};
  const out = {};
  info.rows.forEach(function (row) {
    const id = String(get(row, ["templateID", "TemplateID", "id"]) || "").trim();
    if (!id) return;
    out[id] = {
      templateID: id,
      templateName: get(row, ["templateName", "name", "label"]),
      appliesTo: String(get(row, ["appliesTo", "AppliesTo", "applies"]) || "")
        .split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean),
      isDefaultConcept:   /^true|1$/i.test(get(row, ["isDefaultConcept", "defaultConcept"])),
      isDefaultNarrative: /^true|1$/i.test(get(row, ["isDefaultNarrative", "defaultNarrative"])),
      parameters: parseKeyValueParams(get(row, ["parameters", "params"])),
      description: get(row, ["description", "Description"])
    };
  });
  return out;
}

export function parseNarrativeSkinsSheet(sheetInfo) {
  const info = getSheetInfoByName(sheetInfo, "Narrative Skins");
  if (!info || !hasColumns(info.rows, ["skinID", "narrativeID"])) return {};
  const out = {};
  info.rows.forEach(function (row) {
    const skinID = String(get(row, ["skinID", "SkinID", "id"]) || "").trim();
    const narrativeID = String(get(row, ["narrativeID", "NarrativeID"]) || "").trim();
    if (!skinID || !narrativeID) return;
    if (!out[narrativeID]) out[narrativeID] = [];
    out[narrativeID].push({
      skinID: skinID,
      narrativeID: narrativeID,
      skinName: get(row, ["skinName", "name", "label"]),
      isDefault: /^true|1$/i.test(get(row, ["isDefault", "default"])),
      templateID: get(row, ["templateID", "TemplateID"]),
      parameters: parseKeyValueParams(get(row, ["parameters", "params"])),
      coverImage: get(row, ["coverImage", "cover"]),
      tags: String(get(row, ["tags", "Tags"]) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean)
    });
  });
  return out;
}

export function parseKeyValueParams(text) {
  const out = {};
  String(text || "").split(";").forEach(function (pair) {
    const eq = pair.indexOf("=");
    if (eq < 0) return;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

export function parseMediaSheet(sheetInfo) {
  const info = getSheetInfoByName(sheetInfo, "Media");
  if (!info || !hasColumns(info.rows, ["scope", "scopeID"])) return {};
  const out = {};
  info.rows.forEach(function (row) {
    const scope = String(get(row, ["scope", "Scope", "kind"]) || "").trim().toLowerCase();
    const scopeID = String(get(row, ["scopeID", "ScopeID", "scopeId", "id"]) || "").trim().toUpperCase();
    if (!scope || !scopeID) return;
    const key = scope + ":" + scopeID;
    const orderRaw = get(row, ["order", "Order", "index", "ord"]);
    const order = orderRaw ? Number(orderRaw) || 0 : 0;
    if (!out[key]) out[key] = [];
    out[key].push({
      order:       order,
      type:        String(get(row, ["type", "Type", "mediaType"]) || "image").trim().toLowerCase(),
      file:        get(row, ["file", "File", "filename", "filepath"]),
      poster:      get(row, ["poster", "Poster", "thumbnail", "thumb"]),
      aspectRatio: String(get(row, ["aspectRatio", "aspect_ratio", "aspect", "ratio"]) || "").trim(),
      sandbox:     String(get(row, ["sandbox", "Sandbox"]) || "").trim(),
      caption:     get(row, ["caption", "Caption", "legenda"]),
      sourceUrl:   get(row, ["sourceUrl", "url", "postUrl"]),
      sourceTitle: get(row, ["sourceTitle", "postTitle", "source title", "title"]),
      alt:         get(row, ["alt", "altText", "alternative"]),
      povScope:    String(get(row, ["povScope", "pov", "povs"]) || "").split(",")
        .map(function (s) { return s.trim(); }).filter(Boolean)
    });
  });
  return out;
}

export function parseConceptSkinsSheet(sheetInfo) {
  const info = getSheetInfoByName(sheetInfo, "Concept Skins");
  if (!info || !hasColumns(info.rows, ["skinID", "conceptID"])) return {};
  const out = {};
  info.rows.forEach(function (row) {
    const skinID    = String(get(row, ["skinID",    "SkinID",    "id"])    || "").trim();
    const conceptID = String(get(row, ["conceptID", "ConceptID"])          || "").trim().toUpperCase();
    if (!skinID || !conceptID) return;
    if (!out[conceptID]) out[conceptID] = [];
    out[conceptID].push({
      skinID:         skinID,
      conceptID:      conceptID,
      skinName:       get(row, ["skinName",    "name",    "label"]),
      skinImplID:     String(get(row, ["skinImplID", "implID", "impl"]) || "").trim() || null,
      isDefault:      /^true|1$/i.test(get(row, ["isDefault", "default"])),
      templateID:     get(row, ["templateID", "TemplateID"]),
      parameters:     parseKeyValueParams(get(row, ["parameters", "params"])),
      dataSourceType: String(get(row, ["dataSourceType", "sourceType"]) || "").trim(),
      dataSourceID:   String(get(row, ["dataSourceID",   "sourceID"])   || "").trim(),
      tags: String(get(row, ["tags", "Tags"]) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean)
    });
  });
  return out;
}

export function parseConceptTextsSheet(sheetInfo) {
  const info = getSheetInfoByName(sheetInfo, "ConceptTexts");
  if (!info || !hasColumns(info.rows, ["conceptID"])) return {};
  const out = {};
  info.rows.forEach(function (row) {
    const conceptID = String(get(row, ["conceptID", "ConceptID"]) || "").trim().toUpperCase();
    const text      = String(get(row, ["text", "Text", "content", "texto"]) || "").trim();
    if (!conceptID || !text) return;
    if (!out[conceptID]) out[conceptID] = [];
    out[conceptID].push({
      pov:         String(get(row, ["pov", "POV"]) || "").trim(),
      author:      String(get(row, ["author", "Author"]) || "").trim(),
      style:       String(get(row, ["style", "Style"]) || "").trim(),
      lang:        String(get(row, ["lang", "language", "Language"]) || "pt-BR").trim(),
      textVersion: String(get(row, ["textVersion", "version", "Version"]) || "1").trim(),
      isDefault:   /^true|1$/i.test(get(row, ["isDefault", "default"])),
      text:        text,
      mediaScope:  String(get(row, ["mediaScope", "media_scope", "mediascope"]) || "").trim()
    });
  });
  return out;
}

// ---- Generic skin data contract parser ----
// contracts: array of dataContract objects from skins/index.json.
// Returns { [type]: { [KEY]: [ row, ... ] } } for each non-builtin contract.
export function parseSkinDataContracts(sheetInfo, contracts) {
  const out = {};
  (contracts || []).forEach(function (contract) {
    if (!contract || contract.builtin) return;
    const sheet    = String(contract.sheet    || "").trim();
    const keyCol   = String(contract.keyColumn || "").trim();
    const rowShape = contract.rowShape || {};
    if (!sheet || !keyCol) return;
    const info = getSheetInfoByName(sheetInfo, sheet);
    if (!info || !info.rows || !info.rows.length) return;
    const groups = {};
    info.rows.forEach(function (row) {
      const key = String(get(row, [keyCol]) || "").trim();
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      const entry = {};
      Object.keys(rowShape).forEach(function (field) {
        const aliases = rowShape[field];
        entry[field] = String(get(row, Array.isArray(aliases) ? aliases : [aliases]) || "").trim();
      });
      groups[key].push(entry);
    });
    if (Object.keys(groups).length) out[contract.type] = groups;
  });
  return out;
}

// ---- Legacy standalone narrative importer (kept for backward compat) ----
export function parseNarrativesWorkbook(arrayBuffer) {
  return unzipXlsxEntries(arrayBuffer).then(function (entries) {
    const sharedStrings = readSharedStrings(entries);
    const sheets = readWorkbookSheets(entries);
    const sheetInfo = {};
    sheets.forEach(function (sheet) {
      let rows = [];
      let readError = "";
      if (sheet.path) {
        const xml = zipText(entries, sheet.path);
        if (xml) rows = matrixToObjects(worksheetToMatrix(xml, sharedStrings, sheet.path));
        else readError = "Arquivo interno não encontrado: " + sheet.path;
      } else {
        readError = "A aba não tem Relationship Id resolvido.";
      }
      sheetInfo[sheet.name] = { name: sheet.name, path: sheet.path || "", relationshipId: sheet.relationshipId || "", rows: rows, error: readError };
    });
    const narrativeInfo = getSheetInfoByName(sheetInfo, "Narratives");
    const elementInfo   = getSheetInfoByName(sheetInfo, "Elements");
    const diagnostics   = formatSheetDiagnostics(sheetInfo);
    if (!narrativeInfo) throw makeSpreadsheetImportError("Não encontrei a aba Narratives.", "Renomeie a aba para Narratives.", diagnostics);
    if (!elementInfo)   throw makeSpreadsheetImportError("Não encontrei a aba Elements.", "Renomeie a aba para Elements.", diagnostics);
    if (!hasColumns(narrativeInfo.rows, ["narrativeID","narrativeTitle","narrativeStart","narrativeSummary","elements"])) {
      throw makeSpreadsheetImportError("A aba Narratives não tem as colunas obrigatórias.", "Use: narrativeID, narrativeTitle, narrativeStart, narrativeSummary, elements.", diagnostics);
    }
    if (!hasColumns(elementInfo.rows, ["elementID","elementTitle","elementContent","referencedConceptIDs"])) {
      throw makeSpreadsheetImportError("A aba Elements não tem as colunas obrigatórias.", "Use: elementID, elementTitle, elementContent, referencedConceptIDs.", diagnostics);
    }
    const elementsById = {};
    elementInfo.rows.forEach(function (row) {
      const id = get(row, ["elementID","ElementID","elementId","id"]);
      if (!id) return;
      elementsById[id] = {
        elementID: id,
        elementTitle: get(row, ["elementTitle","ElementTitle","elementName","title","titulo","título"]),
        elementContent: get(row, ["elementContent","content","text","texto"]),
        referencedConceptIDs: get(row, ["referencedConceptIDs","conceptIDs","references","conceitos"])
      };
    });
    const byId = {}, order = [];
    narrativeInfo.rows.forEach(function (row) {
      const id = get(row, ["narrativeID","NarrativeID","narrativeId","id"]);
      if (!id) return;
      const sequence = get(row, ["elements","elementIDs","sequence","sequencia"])
        .split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      const skinCol = get(row, ["skin","Skin","skinID"]);
      byId[id] = {
        narrativeID: id,
        narrativeTitle: get(row, ["narrativeTitle","title","titulo","título"]),
        narrativeStart: get(row, ["narrativeStart","start","startElement"]) || sequence[0] || "",
        narrativeSummary: get(row, ["narrativeSummary","summary","resumo"]),
        elements: sequence,
        skin: skinCol ? String(skinCol).trim() : ""
      };
      order.push(id);
    });
    if (!order.length) throw makeSpreadsheetImportError("A aba Narratives não contém narrativas válidas.", "Preencha narrativeID e narrativeTitle.", diagnostics);
    return {
      byId: byId, order: order, elementsById: elementsById, loadedAt: new Date().toISOString(),
      templates: parseTemplatesSheet(sheetInfo),
      narrativeSkins: parseNarrativeSkinsSheet(sheetInfo)
    };
  });
}
