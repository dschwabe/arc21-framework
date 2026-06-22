/**
 * js/graph/builder.js
 * Builds the in-memory concept graph from a flat list of row objects
 * (produced by parseCombinedWorkbook / parseCSV).
 * Pure function — no state access, no DOM.
 * Depends on js/utils.js.
 */

import { slugify, normalizeConceptId, get, extraFrom, makeCsvImportError } from "../utils.js?v=18";

// All column aliases consumed by this module — used to compute .extra for flat
// CSV rows (XLSX rows arrive with .extra already set by js/parse/workbook.js).
const BUILDER_KNOWN_ALIASES = [
  "concept", "conceito", "sourceConcept", "Concept extracted from text",
  "ConceptLabel", "conceptLabel",
  "conceptID", "ConceptID", "ConceptId", "id",
  "relatedConcept", "related concept", "Related concept", "conceito relacionado",
  "relatedConceptID", "RelatedConceptID", "targetConceptID", "targetConceptId",
  "relationTypeID", "RelationTypeID", "relationTypeId", "RelationTypeId", "relationID", "RelationID",
  "relationCategory", "category", "Category", "categoria",
  "relationTypeDescription", "relationDescription", "descriptionOfRelationType",
  "relationName", "relationType", "Relation type", "Relation name", "relação", "relacao",
  "description", "descrição", "descricao",
  "conceptDescription", "briefDescription",
  "explanation", "explanation/justification of why the concepts are related", "justification",
  "explicação", "explicacao",
  "sourceUrl", "source URL", "source", "url", "postUrl", "post URL", "souceUrl", "souce URL",
  "imagePath", "image", "snapshot", "snapshotPath", "screenshot", "screenshotPath",
  "sourceTitle", "postTitle", "source title",
  "level", "Level", "camada", "Camada",
  "externalRef", "ExternalRef", "external_ref", "externalURL", "externalUrl"
];

/**
 * Build a graph from an array of row objects.
 * @param  {Array}  rows  Flat row objects from the parser.
 * @returns {{ bySlug, order, idToSlug, loadedAt, delimiter, sourceFormat }}
 */
export function buildGraph(rows) {
  const bySlug = {};
  const order = [];
  const idToSlug = {};
  let skippedRows = 0;

  function ensureConcept(name) {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const slug = slugify(clean);
    if (!bySlug[slug]) {
      bySlug[slug] = {
        slug: slug,
        concept: clean,
        conceptID: "",
        description: "",
        sourceUrl: "",
        imagePath: "",
        sourceTitle: "",
        level: "",
        camada: "",
        externalRef: "",
        extra: {},
        relations: []
      };
      order.push(slug);
    }
    return bySlug[slug];
  }

  rows.forEach(function (row) {
    const conceptName = get(row, ["concept", "ConceptLabel", "conceptLabel", "Concept extracted from text", "conceito", "sourceConcept"]);
    const conceptID = normalizeConceptId(get(row, ["conceptID", "ConceptID", "ConceptId", "id"]));
    const relatedName = get(row, ["relatedConcept", "related concept", "Related concept", "conceito relacionado", "conceitorelacionado"]);
    const relatedConceptID = normalizeConceptId(get(row, ["relatedConceptID", "RelatedConceptID", "targetConceptID", "targetConceptId"]));
    const relationTypeID = normalizeConceptId(get(row, ["relationTypeID", "RelationTypeID", "relationTypeId", "RelationTypeId", "relationID", "RelationID"]));
    const relationCategory = get(row, ["relationCategory", "category", "Category", "categoria"]);
    const relationTypeDescription = get(row, ["relationTypeDescription", "relationDescription", "descriptionOfRelationType"]);
    const relationName = get(row, ["relationName", "relationType", "Relation type", "Relation name", "relação", "relacao"]) || relationTypeID;
    const rowDescription = get(row, ["description", "descrição", "descricao"]);
    const conceptDescription = get(row, ["conceptDescription", "briefDescription", "descrição do conceito", "descricao do conceito"]);
    const explanation = get(row, ["explanation", "explanation/justification of why the concepts are related", "justification", "explicação", "explicacao"]) || (relatedName ? rowDescription : "");
    const sourceUrl = get(row, ["sourceUrl", "source URL", "source", "url", "postUrl", "post URL", "souceUrl", "souce URL"]);
    const imagePath = get(row, ["imagePath", "image", "snapshot", "snapshotPath", "screenshot", "screenshotPath"]);
    const sourceTitle = get(row, ["sourceTitle", "postTitle", "source title"]);
    const level = get(row, ["level", "Level"]);
    const camada = get(row, ["camada", "Camada"]);
    const externalRef = get(row, ["externalRef", "ExternalRef", "external_ref", "externalURL", "externalUrl"]);

    const concept = ensureConcept(conceptName);
    if (!concept) { skippedRows++; return; }

    if (conceptID && !concept.conceptID) { concept.conceptID = conceptID; idToSlug[conceptID] = concept.slug; }
    if (conceptDescription && !concept.description) concept.description = conceptDescription;
    if (rowDescription && !concept.description) concept.description = rowDescription;
    if (sourceUrl && !concept.sourceUrl) concept.sourceUrl = sourceUrl;
    if (imagePath && !concept.imagePath) concept.imagePath = imagePath;
    if (sourceTitle && !concept.sourceTitle) concept.sourceTitle = sourceTitle;
    if (level && !concept.level) concept.level = level;
    if (camada && !concept.camada) concept.camada = camada;
    if (externalRef && !concept.externalRef) concept.externalRef = externalRef;

    // Merge extra columns — pre-computed for XLSX rows, computed here for CSV rows.
    const _extra = row.extra !== undefined ? row.extra : extraFrom(row, BUILDER_KNOWN_ALIASES);
    Object.keys(_extra).forEach(function (k) {
      if (concept.extra[k] === undefined) concept.extra[k] = _extra[k];
    });

    if (relatedName) {
      const related = ensureConcept(relatedName);
      if (relatedConceptID && !related.conceptID) { related.conceptID = relatedConceptID; idToSlug[relatedConceptID] = related.slug; }
      concept.relations.push({
        target: relatedName,
        targetSlug: related.slug,
        targetConceptID: relatedConceptID,
        relationTypeID: relationTypeID,
        relationName: relationName,
        relationCategory: relationCategory,
        relationTypeDescription: relationTypeDescription,
        explanation: explanation,
        extra: row.relationExtra || {},
        relationTypeExtra: row.relationTypeExtra || {}
      });
    }
  });

  if (!order.length) {
    throw makeCsvImportError(
      "Nenhum conceito válido foi encontrado no CSV.",
      "Preencha a coluna concept em pelo menos uma linha. Se você importou uma planilha de outro sistema, confirme que o cabeçalho da coluna de conceitos se chama concept ou conceito.",
      skippedRows + " linha(s) foram ignoradas porque a coluna de conceito estava vazia."
    );
  }

  order.forEach(function (slug) {
    const c = bySlug[slug];
    if (!c.description) {
      const samples = c.relations.slice(0, 3);
      c.description = samples.length
        ? c.concept + " relaciona-se a " + samples.map(function (r) { return "[[" + r.target + "]]"; }).join(", ") + ". Essas relações mostram como o conceito participa do grafo conceitual."
        : c.concept + " é um conceito do grafo conceitual.";
    }
  });

  return {
    bySlug: bySlug,
    order: order,
    idToSlug: idToSlug,
    loadedAt: new Date().toISOString(),
    delimiter: rows._delimiter || ",",
    sourceFormat: rows._sourceFormat || "csv"
  };
}

/**
 * Count total relation edges in a graph.
 * @param  {{ bySlug: Object }} g
 * @returns {number}
 */
export function countRelations(g) {
  if (!g || !g.bySlug) return 0;
  let n = 0;
  Object.keys(g.bySlug).forEach(function (slug) {
    const c = g.bySlug[slug];
    n += (c && c.relations) ? c.relations.length : 0;
  });
  return n;
}
