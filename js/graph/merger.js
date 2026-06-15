/**
 * js/graph/merger.js
 * Multi-source concept merge — union of N parsed graphs.
 *
 * N = 1 (identity): returns the single graph unchanged — exactly today's
 * single-source behaviour, by construction rather than a separate branch.
 *
 * N > 1: later sources (site) override earlier sources (registry) per merge key.
 * Merge key: concept.extra.sefariaRef when present, otherwise concept.conceptID.
 * Site extra keys override registry extra keys; site-only nodes are added as new.
 * Site relations are appended to the merged concept (skins handle display dedup).
 *
 * merge_semantics_version: 1 — override precedence is last-source-wins per key.
 * If this rule changes in a future version, bump ARC21_VERSION and the
 * merge_semantics_version in framework.lock so sites can detect the change.
 */

export function mergeConceptSources(graphs) {
  if (!graphs || !graphs.length) {
    return { bySlug: {}, order: [], idToSlug: {}, loadedAt: new Date().toISOString(), sourceFormat: "merged" };
  }
  if (graphs.length === 1) return graphs[0];

  const mergedBySlug = {};
  const mergedOrder = [];
  const mergedIdToSlug = {};
  const keyToSlug = {};

  graphs.forEach(function (graph) {
    (graph.order || []).forEach(function (slug) {
      const concept = graph.bySlug[slug];
      if (!concept) return;
      const mergeKey = (concept.extra && concept.extra.sefariaRef) || concept.conceptID || slug;

      if (keyToSlug[mergeKey]) {
        const base = mergedBySlug[keyToSlug[mergeKey]];
        if (concept.conceptID)   base.conceptID   = concept.conceptID;
        if (concept.description) base.description = concept.description;
        if (concept.sourceUrl)   base.sourceUrl   = concept.sourceUrl;
        if (concept.imagePath)   base.imagePath   = concept.imagePath;
        if (concept.sourceTitle) base.sourceTitle = concept.sourceTitle;
        if (concept.level)       base.level       = concept.level;
        if (concept.camada)      base.camada      = concept.camada;
        if (concept.externalRef) base.externalRef = concept.externalRef;
        if (concept.extra)       Object.assign(base.extra, concept.extra);
        if (concept.relations && concept.relations.length) {
          base.relations = base.relations.concat(concept.relations);
        }
      } else {
        const clone = {
          slug:        concept.slug,
          concept:     concept.concept,
          conceptID:   concept.conceptID,
          description: concept.description,
          sourceUrl:   concept.sourceUrl,
          imagePath:   concept.imagePath,
          sourceTitle: concept.sourceTitle,
          level:       concept.level,
          camada:      concept.camada,
          externalRef: concept.externalRef,
          extra:       Object.assign({}, concept.extra || {}),
          relations:   (concept.relations || []).slice()
        };
        mergedBySlug[slug] = clone;
        mergedOrder.push(slug);
        keyToSlug[mergeKey] = slug;
        if (concept.conceptID) mergedIdToSlug[concept.conceptID] = slug;
      }
    });
    Object.keys(graph.idToSlug || {}).forEach(function (id) {
      if (!mergedIdToSlug[id]) mergedIdToSlug[id] = graph.idToSlug[id];
    });
  });

  return {
    bySlug:     mergedBySlug,
    order:      mergedOrder,
    idToSlug:   mergedIdToSlug,
    loadedAt:   new Date().toISOString(),
    sourceFormat: "merged"
  };
}
