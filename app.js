/* arc21-framework v2 */
import { slugify, escapeHTML, escapeAttr, isHttpUrl, csvEscape, graphToCsv, downloadTextFile, normalizeHeader, get, makeCsvImportError, makeSpreadsheetImportError, isSpreadsheetName, normalizeConceptId } from "./js/utils.js?v=6";
import { parseCSV } from "./js/parse/csv.js?v=6";
import { unzipXlsxEntries, zipText, parseXml, xmlLocalName, attributeByLocalName, childElementsByLocalName, firstChildByLocalName, allDescendantsByLocalName, columnIndexFromCellRef, readSharedStrings, normalizeXlsxTargetPath, readWorkbookSheets, readCellValue, worksheetToMatrix, matrixToObjects, sheetColumns, hasColumns, formatSheetDiagnostics, getSheetInfoByName, getSheetRowsByName } from "./js/parse/xlsx.js?v=6";
import { parseSpreadsheetWorkbook, parseCombinedWorkbook, parseNarrativesWorkbook } from "./js/parse/workbook.js?v=8";
import { buildGraph, countRelations } from "./js/graph/builder.js?v=7";
import { appStore, SK, saveStoredGraph, loadStoredGraph, saveStoredNarratives, loadStoredNarratives, hasNarratives, saveStoredMedia, loadStoredMedia, mediaKey, getMediaFor, mediaFilePath, saveStoredTemplates, loadStoredTemplates, getTemplate, saveStoredNarrativeSkins, loadStoredNarrativeSkins, getNarrativeSkins, getDefaultNarrativeSkin, resolveNarrativeSkin, isScrollyTemplate, loadStoredConceptSkins, saveStoredConceptSkins, getConceptSkins, getDefaultConceptSkin, resolveConceptSkin, loadStoredConceptTexts, saveStoredConceptTexts, getConceptTexts, getDefaultConceptText, loadStoredSkinData, saveStoredSkinData } from "./js/store.js?v=6";
import { loadSkinIndex, getSkinMeta, activateSkin, ensureSkinCSS, getSkinInstance, loadSkinAssets } from "./js/skin/loader.js?v=8";
import { conceptUrl, resolveConceptSlug, narrativeUrl, narrativeElementUrl, getNarrative, firstConceptSlug, canonicalRootSlug, findPathFromRoot, getHistory, setHistory, addToHistory, setPreviousConcept, getPreviousConcept } from "./js/graph/navigation.js?v=6";
import { linkifyDescription, extractShortDesc, wrapText, toRoman } from "./js/render/content.js?v=6";
import { initLocale, getLocale, setLocale, SUPPORTED_LOCALES, graphPaths, localeSK, loadUiStrings, t, applyI18n } from "./js/i18n.js?v=6";
import { setMode as egSetMode, visit as egVisit } from "./js/explore-graph.js?v=6";

/* Infância Algorítmica — local conceptual appStore.graph browser
   CSV columns accepted:
   concept,description,relatedConcept,relationName,explanation,sourceUrl,imagePath,sourceTitle

   Spreadsheet formats accepted (.xlsx):
   - Legacy sheets:
     Concepts: conceptID, ConceptLabel, description, sourceUrl, imagePath, sourceTitle
     Relations: ConceptId, relationName, relatedConcept, explanation
   - Relation-type normalized sheets:
     Concepts: conceptID, ConceptLabel, description, sourceUrl, imagePath, sourceTitle
     Relations: ConceptId, relationTypeID, relatedConcept, explanation
     Relation Types: relationID, relationType, category, description

   Notes:
   - Comma, semicolon, and tab-separated CSV files are supported.
   - XLSX files are parsed locally in the browser; no server is required.
   - Each relation row is converted to: concept -> relatedConcept.
   - Repeated concept rows are merged into one concept page.
   - description may contain [[Concept Name]] or [[ConceptID]] wiki-style links.
   - imagePath should point to a local screenshot image, e.g. assets/ausencia-tedio.png.
*/

(function () {
  "use strict";

  const STORAGE_SOURCE_LABEL_KEY = "conceptGraph.sourceLabel.v1";
  const DEFAULT_SNAPSHOT_TEMPLATE = "https://api.microlink.io/?url={url}&screenshot=true&embed=screenshot.url";
  const HELP_CONFIG_PATH = "help-config.json";
  const DEFAULT_DATA_PATH = "data/conceptual_graph.xlsx";

  const DEFAULT_HELP_CONFIG = {
    "instructions": {
      "title": "Como navegar neste site",
      "intro": "Este site apresenta um grafo conceitual navegável. Cada conceito tem uma página própria, links para conceitos relacionados, uma imagem ilustrativa quando disponível e um histórico de navegação.",
      "sections": [
        {
          "heading": "Carregar dados",
          "items": [
            "Na página inicial, selecione uma planilha .xlsx no formato Concepts/Relations ou um CSV compatível.",
            "Ao abrir o site como arquivo local, prefira o botão de seleção de arquivo em vez de carregar por caminho."
          ]
        },
        {
          "heading": "Navegar pelo grafo",
          "items": [
            "Clique nos links dentro da descrição ou nos conceitos relacionados para avançar pelo grafo.",
            "Use o índice lateral para saltar diretamente para qualquer conceito.",
            "A trilha no topo mostra o caminho calculado a partir de Infância algorítmica até o conceito atual."
          ]
        },
        {
          "heading": "Histórico e imagens",
          "items": [
            "O botão Histórico mostra os conceitos visitados e permite salvar esse percurso.",
            "As ferramentas de imagem ficam recolhidas e podem ser abertas somente quando você quiser atualizar a fonte ou a imagem do post."
          ]
        }
      ]
    },
    "tooltips": {
      ".brand-logo": "Identidade visual ARQ21 Teia Ciborgue.",
      ".nav-link": "Abrir a página inicial.",
      "#backBtn": "Voltar ao conceito visitado anteriormente ou à página anterior do navegador.",
      "#historyBtn": "Abrir o histórico dos conceitos visitados nesta sessão.",
      "#helpBtn": "Mostrar instruções de navegação e uso do site.",
      "#loadCsvPathBtn": "Carregar o arquivo informado no campo de caminho relativo. Funciona melhor quando o site é servido por HTTP local.",
      "#browseCsvBtn": "Selecionar manualmente uma planilha XLSX ou arquivo CSV no seu computador.",
      "#csvFileInput": "Arquivo local com os conceitos e relações do grafo.",
      "#csvPathInput": "Caminho relativo do arquivo de dados quando o site é servido localmente.",
      "#startLink": "Iniciar a navegação pelo conceito raiz do grafo.",
      "#historyFileInput": "Carregar um arquivo JSON de histórico salvo anteriormente.",
      "#clearHistoryBtn": "Apagar o histórico de navegação salvo no navegador.",
      "#saveHistoryBtn": "Salvar o histórico de conceitos visitados como arquivo JSON.",
      "#sourceUrl": "Abrir a URL pública usada como fonte da imagem do conceito.",
      "#snapshotToolsBox > summary": "Abrir ferramentas opcionais para atualizar a URL do post ou gerar uma prévia visual.",
      "#postUrlInput": "Informe aqui a URL pública do post relacionado ao conceito.",
      "#snapshotServiceInput": "Template do serviço externo usado para gerar uma imagem de snapshot.",
      "#generateSnapshotBtn": "Gerar uma prévia visual da URL usando o serviço configurado.",
      "#savePostUrlBtn": "Salvar a URL informada no grafo carregado no navegador.",
      "#exportCsvBtn": "Exportar o grafo atualizado como CSV.",
      "#manualSearchLink": "Abrir uma busca na web por posts públicos relacionados ao conceito."
}
  };

  // Initialise locale before loading any cached data so we read the right keys.
  initLocale();
  const _LSK = localeSK(getLocale()); // locale-scoped storage keys

  appStore.graph               = loadStoredGraph(_LSK.data);
  appStore.narrativeStore      = loadStoredNarratives(_LSK.narratives);
  appStore.mediaStore          = loadStoredMedia(_LSK.media);
  appStore.templatesStore      = loadStoredTemplates(_LSK.templates);
  appStore.narrativeSkinsStore = loadStoredNarrativeSkins(_LSK.skins);
  appStore.conceptSkinsStore   = loadStoredConceptSkins(_LSK.conceptSkins);
  appStore.conceptTextsStore   = loadStoredConceptTexts(_LSK.conceptTexts);
  appStore.skinDataStore       = loadStoredSkinData(_LSK.skinData);
  appStore.helpConfig          = DEFAULT_HELP_CONFIG;
  // appStore.currentConceptSlug and appStore.helpConfigPromise are initialised in appStore defaults (js/store.js)

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }




  function formatCsvImportError(err, context) {
    context = context || {};
    const fileLabel = context.fileLabel ? "Arquivo: <code>" + escapeHTML(context.fileLabel) + "</code>" : "";
    const message = escapeHTML(err && err.message ? err.message : "Erro desconhecido ao importar o CSV.");
    const fix = escapeHTML(err && err.fix ? err.fix : "Verifique se o arquivo é um CSV válido, salvo em UTF-8, com cabeçalho e separado por vírgulas, ponto e vírgula ou tabulação.");
    const details = err && err.details ? "<li><strong>Detalhes:</strong> " + escapeHTML(err.details) + "</li>" : "";
    return '<div class="error-box"><strong>Não foi possível importar os dados do grafo.</strong><ul>' +
      (fileLabel ? "<li>" + fileLabel + "</li>" : "") +
      '<li><strong>Problema:</strong> ' + message + '</li>' +
      '<li><strong>Como corrigir:</strong> ' + fix + '</li>' + details +
      '</ul><p>CSV esperado:<br><code>concept;description;relatedConcept;relationName;explanation;sourceUrl;imagePath;sourceTitle</code></p>' +
      '<p>Planilha XLSX esperada:<br><code>Concepts</code>: conceptID, ConceptLabel, description, sourceUrl, imagePath, sourceTitle<br>' +
      '<code>Relations</code> legado: ConceptId, relationName, relatedConcept, explanation<br>' +
      '<code>Relations</code> normalizado: ConceptId, relationTypeID, relatedConcept, explanation<br>' +
      '<code>Relation Types</code>: relationID, relationType, category, description</p></div>';
  }

  function formatCsvLoadError(err, path) {
    const raw = String((err && err.message) || err || "Erro desconhecido.");
    const isFileProtocol = location.protocol === "file:";
    const likelyFix = isFileProtocol
      ? "Você abriu o site com file://. Use o botão de seleção de arquivo CSV local, ou rode um servidor local nesta pasta com: python3 -m http.server 8000 e abra http://localhost:8000."
      : "Confirme que o CSV existe no mesmo diretório do index.html, que o nome foi digitado corretamente e que o servidor local está rodando nessa pasta.";
    return '<div class="error-box"><strong>Não foi possível carregar o CSV por caminho.</strong><ul>' +
      '<li><strong>Caminho informado:</strong> <code>' + escapeHTML(path) + '</code></li>' +
      '<li><strong>Problema:</strong> ' + escapeHTML(raw) + '</li>' +
      '<li><strong>Como corrigir:</strong> ' + escapeHTML(likelyFix) + '</li>' +
      '</ul></div>';
  }

  function setStatus(element, html, isError) {
    if (!element) return;
    element.innerHTML = html;
    element.classList.toggle("error", !!isError);
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function buildSidebarHtml() {
    return '' +
      '<aside class="concept-index-pane" aria-label="Índice de navegação">' +
        '<details class="sidebar-section concept-index-section">' +
          '<summary>Índice de conceitos</summary>' +
          '<p>Selecione qualquer conceito do grafo.</p>' +
          '<div id="conceptIndexList" class="concept-index-list"></div>' +
        '</details>' +
        '<details class="sidebar-section narrative-index-section" open>' +
          '<summary>Narrativas</summary>' +
          '<div id="narrativeList" class="narrative-list"></div>' +
        '</details>' +
      '</aside>';
  }

  function renderNarrativeList(root, activeNarrativeID) {
    const list = $("#narrativeList", root);
    if (!list) return;

    if (!hasNarratives()) {
      list.innerHTML = '<p class="empty-list-note">' + t("sidebar.narrativesEmpty", "Nenhuma narrativa importada.") + '</p>';
      return;
    }

    list.innerHTML = "";
    appStore.narrativeStore.order.forEach(function (narrativeID) {
      const n = appStore.narrativeStore.byId[narrativeID];
      if (!n || n.hidden) return;
      const a = document.createElement("a");
      a.href = narrativeUrl(narrativeID);
      a.textContent = n.narrativeTitle || narrativeID;
      a.className = "narrative-index-link";
      if (narrativeID === activeNarrativeID) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
      list.appendChild(a);
    });
  }


  async function loadCsvFromPath(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.text();
  }

  function loadFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(reader.error || new Error("Erro ao ler arquivo.")); };
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.readAsText(file, "UTF-8");
    });
  }

  function loadFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(reader.error || new Error("Erro ao ler arquivo.")); };
      reader.onload = function () { resolve(reader.result); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function loadArrayBufferFromPath(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.arrayBuffer();
  }

  function installHeroHandlers() {
    const csvPathInput = $("#csvPathInput");
    const loadCsvPathBtn = $("#loadCsvPathBtn");
    const browseCsvBtn = $("#browseCsvBtn");
    const csvFileInput = $("#csvFileInput");
    const selectedCsvFile = $("#selectedCsvFile");
    const historyFileInput = $("#historyFileInput");
    const startLink = $("#startLink");
    const dataStatus = $("#dataStatus");

    function updateStartLink() {
      if (!startLink) return;
      const first = firstConceptSlug();
      if (first) {
        startLink.href = conceptUrl(first);
        startLink.textContent = 'Come\u00e7ar por \u201c' + appStore.graph.bySlug[first].concept + '\u201d';
        startLink.classList.remove("disabled");
        startLink.setAttribute("aria-disabled", "false");
      } else {
        startLink.href = "#";
        startLink.textContent = "Carregue um CSV para come\u00e7ar";
        startLink.classList.add("disabled");
        startLink.setAttribute("aria-disabled", "true");
      }
    }

    function updateLoadedState() {
      const heroCard = $(".hero-card");
      if (!heroCard) return;
      const isLoaded = !!(appStore.graph && appStore.graph.order && appStore.graph.order.length);
      heroCard.classList.toggle("is-loaded", isLoaded);
      heroCard.classList.toggle("is-empty", !isLoaded);
      // Apply site-specific lede text from siteConfig (set by XLSX Site sheet).
      var _sc = {};
      try { var _r = localStorage.getItem('conceptGraph.siteConfig.v1'); if (_r) _sc = JSON.parse(_r); } catch(e) {}
      var ledeEl = $("#heroLede");
      if (ledeEl && _sc['hero.lede']) ledeEl.textContent = _sc['hero.lede'];
      var eyebrowEl = $("#heroEyebrow");
      if (eyebrowEl && _sc['hero.eyebrow']) eyebrowEl.textContent = _sc['hero.eyebrow'];
      const summary = $("#datasetSummary");
      if (summary) {
        if (isLoaded) {
          const isMgmt = document.documentElement.hasAttribute('data-mgmt');
          if (isMgmt) {
            const label = (function(){ try { return localStorage.getItem(STORAGE_SOURCE_LABEL_KEY) || ""; } catch(e) { return ""; } })();
            const narrativeCount = (appStore.narrativeStore && appStore.narrativeStore.order) ? appStore.narrativeStore.order.length : 0;
            summary.innerHTML =
              '<div class="dataset-summary-row"><span class="dataset-pill dataset-pill-ok">\u2713 Carregado</span>' +
                (label ? ' <code>' + escapeHTML(label) + '</code>' : '') +
              '</div>' +
              '<div class="dataset-summary-stats">' +
                '<span><strong>' + appStore.graph.order.length + '</strong> conceitos</span>' +
                '<span><strong>' + countRelations(appStore.graph) + '</strong> rela\u00e7\u00f5es</span>' +
                (narrativeCount ? '<span><strong>' + narrativeCount + '</strong> narrativa' + (narrativeCount === 1 ? '' : 's') + '</span>' : '') +
              '</div>';
          } else {
            summary.innerHTML =
              '<p class="dataset-summary-public">' +
              '<strong>' + appStore.graph.order.length + '</strong> constela\u00e7\u00f5es (grupos de conceitos) e ' +
              '<strong>' + countRelations(appStore.graph) + '</strong> rela\u00e7\u00f5es</p>';
          }
        } else {
          summary.innerHTML = '<div class="dataset-summary-row"><span class="dataset-pill dataset-pill-empty">Nenhum grafo carregado</span></div>';
        }
      }
    }

    async function ingestRows(rows, label, sourceKind, narrativesPayload, mediaPayload, extras) {
      try {
        const _ilsk = localeSK(getLocale());
        appStore.graph = buildGraph(rows);
        saveStoredGraph(appStore.graph, _ilsk.data);
        try { localStorage.setItem(STORAGE_SOURCE_LABEL_KEY, String(label || "")); } catch (e) {}
        saveStoredMedia(mediaPayload || {}, _ilsk.media);
        saveStoredTemplates((extras && extras.templates) || {}, _ilsk.templates);
        saveStoredNarrativeSkins((extras && extras.narrativeSkins) || {}, _ilsk.skins);
        saveStoredConceptSkins((extras && extras.conceptSkins) || {}, _ilsk.conceptSkins);
        saveStoredConceptTexts((extras && extras.conceptTexts) || {}, _ilsk.conceptTexts);
        saveStoredSkinData((extras && extras.skinData) || {}, _ilsk.skinData);
        let narrativeMsg = "";
        if (narrativesPayload && narrativesPayload.order && narrativesPayload.order.length) {
          saveStoredNarratives(narrativesPayload, _ilsk.narratives);
          narrativeMsg = " e " + narrativesPayload.order.length + " narrativa" + (narrativesPayload.order.length === 1 ? "" : "s");
        }
        if (appStore.graph.sourceFormat === "xlsx" || appStore.graph.sourceFormat === "xlsx-relation-types" || sourceKind === "xlsx") {
          setStatus(dataStatus, '<strong>Dados carregados com sucesso.</strong> Arquivo: <code>' + escapeHTML(label) + '</code> &middot; ' + appStore.graph.order.length + ' conceitos' + narrativeMsg + '.', false);
        } else {
          const delimiterLabel = appStore.graph.delimiter === "\t" ? "tabula\u00e7\u00e3o" : appStore.graph.delimiter === ";" ? "ponto e v\u00edrgula (;)" : "v\u00edrgula (,)";
          setStatus(dataStatus, '<strong>Dados carregados com sucesso.</strong> CSV: <code>' + escapeHTML(label) + '</code> &middot; ' + appStore.graph.order.length + ' conceitos. Separador: ' + delimiterLabel + '.', false);
        }
        updateStartLink();
        updateLoadedState();
      } catch (err) {
        console.error(err);
        setStatus(dataStatus, formatCsvImportError(err, { fileLabel: label }), true);
      }
    }

    async function ingestCsv(csvText, label) {
      const rows = parseCSV(csvText);
      await ingestRows(rows, label, "csv", null, {});
    }

    async function ingestSpreadsheet(arrayBuffer, label) {
      const index = await loadSkinIndex();
      const skinContracts = (index && index.skins || []).map(function (s) { return s.dataContract; }).filter(Boolean);
      const result = await parseCombinedWorkbook(arrayBuffer, { skinContracts: skinContracts });
      if (result.siteConfig && Object.keys(result.siteConfig).length) {
        try { localStorage.setItem('conceptGraph.siteConfig.v1', JSON.stringify(result.siteConfig)); } catch (e) {}
      }
      await ingestRows(result.rows, label, "xlsx", result.narratives, result.media || {}, { templates: result.templates || {}, narrativeSkins: result.narrativeSkins || {}, conceptSkins: result.conceptSkins || {}, conceptTexts: result.conceptTexts || {}, skinData: result.skinData || {} });
    }

    if (loadCsvPathBtn) {
      loadCsvPathBtn.addEventListener("click", async function () {
        const path = (csvPathInput && csvPathInput.value.trim()) || "concepts.csv";
        try {
          if (isSpreadsheetName(path)) {
            setStatus(dataStatus, "Carregando planilha XLSX...", false);
            const buffer = await loadArrayBufferFromPath(path);
            await ingestSpreadsheet(buffer, path);
          } else {
            setStatus(dataStatus, "Carregando CSV...", false);
            const text = await loadCsvFromPath(path);
            await ingestCsv(text, path);
          }
        } catch (err) {
          console.error(err);
          setStatus(dataStatus, formatCsvLoadError(err, path), true);
        }
      });
    }

    if (browseCsvBtn && csvFileInput) {
      browseCsvBtn.addEventListener("click", function () {
        if (selectedCsvFile) selectedCsvFile.textContent = "Aguardando seleção do arquivo concepts.xlxs ou outro arquivo compatível...";
        setStatus(dataStatus, "Abrindo seletor de arquivo CSV ou XLSX...", false);
        csvFileInput.value = "";
        csvFileInput.click();
      });
    }

    if (csvFileInput) {
      csvFileInput.addEventListener("change", async function () {
        const file = csvFileInput.files && csvFileInput.files[0];
        if (!file) {
          if (selectedCsvFile) selectedCsvFile.innerHTML = 'Arquivo padrão esperado: <code>concepts.xlxs</code>. Nenhum arquivo foi selecionado.';
          setStatus(dataStatus, "Nenhum arquivo foi selecionado. Clique novamente em “Selecionar arquivo local” e escolha um arquivo .xlsx, .xlxs ou .csv.", true);
          return;
        }
        try {
          if (selectedCsvFile) selectedCsvFile.textContent = "Selecionado: " + file.name;
          if (isSpreadsheetName(file.name)) {
            setStatus(dataStatus, "Lendo planilha XLSX local...", false);
            const buffer = await loadFileAsArrayBuffer(file);
            await ingestSpreadsheet(buffer, file.name);
          } else {
            setStatus(dataStatus, "Lendo arquivo CSV local...", false);
            const text = await loadFileAsText(file);
            await ingestCsv(text, file.name);
          }
        } catch (err) {
          console.error(err);
          setStatus(dataStatus, formatCsvImportError(err, { fileLabel: file.name }), true);
        }
      });
    }

    if (historyFileInput) {
      historyFileInput.addEventListener("change", async function () {
        const file = historyFileInput.files && historyFileInput.files[0];
        if (!file) return;
        try {
          const loaded = JSON.parse(await loadFileAsText(file));
          if (!Array.isArray(loaded)) throw new Error("O arquivo de histórico deve conter uma lista JSON.");
          setHistory(loaded);
          setStatus(dataStatus, "Histórico carregado: " + loaded.length + " visitas.", false);
        } catch (err) {
          setStatus(dataStatus, "Erro ao carregar histórico: " + escapeHTML(err.message) + ". Selecione um arquivo JSON de histórico salvo pelo botão “Salvar histórico”.", true);
        }
      });
    }

    updateStartLink();
    updateLoadedState();
  }


  function updateNavContext(concept) {
    const navContext = $("#navContext");
    const navConceptName = $("#navConceptName");
    const pathTrail = $("#pathTrail");
    if (!navContext || !navConceptName || !pathTrail) return;

    if (!concept || !appStore.graph || !appStore.graph.bySlug) {
      navContext.classList.add("hidden");
      navConceptName.textContent = "";
      pathTrail.innerHTML = "";
      return;
    }

    navContext.classList.remove("hidden");
    navConceptName.textContent = "";
    pathTrail.innerHTML = "";

    const path = findPathFromRoot(concept.slug);
    path.forEach(function (slug, index) {
      const item = appStore.graph.bySlug[slug];
      if (!item) return;

      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = "path-separator";
        sep.textContent = ">";
        pathTrail.appendChild(sep);
      }

      const a = document.createElement("a");
      a.href = conceptUrl(slug);
      a.textContent = item.concept;
      a.className = "path-link";
      if (slug === concept.slug) a.setAttribute("aria-current", "page");
      pathTrail.appendChild(a);
    });

    requestAnimationFrame(function () {
      pathTrail.scrollLeft = pathTrail.scrollWidth;
    });
  }

  function renderConceptIndex(fragment, activeSlug) {
    const list = $("#conceptIndexList", fragment);
    if (!list || !appStore.graph || !appStore.graph.bySlug || !appStore.graph.order) return;

    list.innerHTML = "";
    const concepts = appStore.graph.order
      .map(function (slug) { return appStore.graph.bySlug[slug]; })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.concept.localeCompare(b.concept, "pt-BR", { sensitivity: "base" });
      });

    concepts.forEach(function (concept) {
      const a = document.createElement("a");
      a.href = conceptUrl(concept.slug);
      a.textContent = concept.concept;
      a.className = "concept-index-link";
      if (concept.slug === activeSlug) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
      list.appendChild(a);
    });

    const active = $(".concept-index-link.active", list);
    if (active) {
      requestAnimationFrame(function () {
        active.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }

    renderNarrativeList(fragment, null);

    // Wire sidebar collapse (only applies when fragment contains .concept-shell)
    const _shell = $(".concept-shell", fragment);
    const _toggleBtn = $(".sidebar-toggle-btn", fragment);
    const _expandTab = $(".sidebar-expand-tab", fragment);
    if (_shell && _toggleBtn && _expandTab) {
      const _SK_SIDEBAR = "conceptGraph.sidebarCollapsed.v1";
      const _syncTab = function () {
        _expandTab.textContent = _shell.classList.contains("sidebar-collapsed") ? "›" : "‹";
      };
      try { if (localStorage.getItem(_SK_SIDEBAR) === "1") _shell.classList.add("sidebar-collapsed"); } catch (e) {}
      _syncTab();
      _toggleBtn.addEventListener("click", function () {
        _shell.classList.add("sidebar-collapsed");
        _syncTab();
        try { localStorage.setItem(_SK_SIDEBAR, "1"); } catch (e) {}
      });
      _expandTab.addEventListener("click", function () {
        const wasCollapsed = _shell.classList.contains("sidebar-collapsed");
        _shell.classList.toggle("sidebar-collapsed", !wasCollapsed);
        _syncTab();
        try { localStorage.setItem(_SK_SIDEBAR, wasCollapsed ? "0" : "1"); } catch (e) {}
      });
    }
  }



  function mergeHelpConfig(base, override) {
    const merged = JSON.parse(JSON.stringify(base || {}));
    override = override || {};
    if (override.instructions) merged.instructions = override.instructions;
    merged.tooltips = Object.assign({}, (base && base.tooltips) || {}, override.tooltips || {});
    Object.keys(override).forEach(function (k) {
      if (k !== 'instructions' && k !== 'tooltips') merged[k] = override[k];
    });
    return merged;
  }

  function loadHelpConfig() {
    applyTooltips(document);
    if (appStore.helpConfigPromise) return appStore.helpConfigPromise;
    appStore.helpConfigPromise = fetch(HELP_CONFIG_PATH, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status + " " + res.statusText);
        var ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.startsWith("text/html")) throw new Error("SPA rewrite — help-config.json not found");
        return res.json();
      })
      .then(function (config) {
        appStore.helpConfig = mergeHelpConfig(DEFAULT_HELP_CONFIG, config);
        applyTooltips();
        return appStore.helpConfig;
      })
      .catch(function (err) {
        console.warn("Não foi possível carregar help-config.json. Usando textos internos de fallback.", err);
        appStore.helpConfig = DEFAULT_HELP_CONFIG;
        applyTooltips();
        return appStore.helpConfig;
      });
    return appStore.helpConfigPromise;
  }

  function applyTooltips(root) {
    const scope = root || document;
    const tooltips = appStore.helpConfig && appStore.helpConfig.tooltips ? appStore.helpConfig.tooltips : {};
    Object.keys(tooltips).forEach(function (selector) {
      let nodes = [];
      try {
        nodes = scope.querySelectorAll(selector);
      } catch (e) {
        console.warn("Seletor inválido em help-config.json:", selector, e);
        return;
      }

      nodes.forEach(function (node) {
        const text = String(tooltips[selector] || "").trim();
        if (!text) return;
        node.setAttribute("title", text);
        node.setAttribute("data-tooltip", text);
        if ((node.tagName === "BUTTON" || node.tagName === "A") && !node.getAttribute("aria-label")) {
          node.setAttribute("aria-label", text);
        }
      });
    });
  }

  function renderHelpContent() {
    const title = $("#helpDialogTitle");
    const content = $("#helpDialogContent");
    const cfg = appStore.helpConfig && appStore.helpConfig.instructions ? appStore.helpConfig.instructions : DEFAULT_HELP_CONFIG.instructions;
    if (title) title.textContent = cfg.title || "Ajuda";
    if (!content) return;

    let html = "";
    if (cfg.intro) html += "<p>" + escapeHTML(cfg.intro) + "</p>";
    (cfg.sections || []).forEach(function (section) {
      html += '<section class="help-section">';
      if (section.heading) html += "<h3>" + escapeHTML(section.heading) + "</h3>";
      if (section.body) html += "<p>" + escapeHTML(section.body) + "</p>";
      if (section.items && section.items.length) {
        html += "<ul>";
        section.items.forEach(function (item) {
          html += "<li>" + escapeHTML(item) + "</li>";
        });
        html += "</ul>";
      }
      html += "</section>";
    });
    content.innerHTML = html || "<p>Nenhuma instrução foi configurada.</p>";
  }


  function renderHero() {
    egSetMode("hidden");
    updateNavContext(null);
    const app = $("#app");
    const heroTemplate = $("#heroTemplate");
    if (!app || !heroTemplate) return;
    app.innerHTML = "";
    app.appendChild(heroTemplate.content.cloneNode(true));
    installHeroHandlers();
    loadHelpConfig().then(function () { renderHeroDiagram(); applyTooltips(app); });
  }

  function renderHeroDiagram() {
    const container = $("#heroDiagram");
    if (!container) return;

    if (!appStore.graph || !appStore.graph.bySlug || !appStore.graph.order || !appStore.graph.order.length) {
      container.innerHTML = '<p class="hero-diagram-empty">Carregue o grafo para ver o diagrama de alto nível.</p>';
      return;
    }

    // Read siteConfig from localStorage (site-specific; empty object for sites that don't use it).
    var siteConfig = {};
    try {
      var _raw = localStorage.getItem('conceptGraph.siteConfig.v1');
      if (_raw) siteConfig = JSON.parse(_raw);
    } catch (e) {}

    // Dispatch to a named renderer: ./js/diagram/<name>.js
    // The framework ships nebulosa and infra; sites can add their own alongside.
    // If hero.diagram is not configured, or the named file is absent, use the
    // built-in generic renderer as fallback.
    var style = String((siteConfig && siteConfig['hero.diagram']) || '').trim();
    if (!style) { _renderBuiltinHeroDiagram(container); return; }
    import('./js/diagram/' + style + '.js').then(function (mod) {
      if (typeof mod.render === 'function') {
        mod.render(container, appStore.graph, siteConfig);
      } else {
        _renderBuiltinHeroDiagram(container);
      }
    }).catch(function () {
      _renderBuiltinHeroDiagram(container);
    });
  }

  function _renderBuiltinHeroDiagram(container) {
    const rootSlug = canonicalRootSlug();
    if (!rootSlug || !appStore.graph.bySlug[rootSlug]) {
      container.innerHTML = '<p class="hero-diagram-empty">Não encontrei o conceito raiz para o diagrama.</p>';
      return;
    }
    const root = appStore.graph.bySlug[rootSlug];

    // Collect hero diagram relations from the root concept.
    // If help-config.json defines "hero.diagram.relationTypeID", filter by that ID.
    // Otherwise fall back to matching "aspecto" in the relation name (default for V6).
    const heroDiagramTypeID = appStore.helpConfig && appStore.helpConfig['hero.diagram.relationTypeID']
      ? String(appStore.helpConfig['hero.diagram.relationTypeID']).trim()
      : null;
    const seen = {};
    const items = (root.relations || []).filter(function (rel) {
      const pass = heroDiagramTypeID
        ? rel.relationTypeID === heroDiagramTypeID
        : /aspe[ct]/i.test(String(rel.relationName || ""));
      if (!pass) return false;
      if (seen[rel.targetSlug]) return false;
      seen[rel.targetSlug] = true;
      return true;
    }).map(function (rel) {
      const target = appStore.graph.bySlug[rel.targetSlug] || null;
      return {
        slug: rel.targetSlug,
        label: (target && target.concept) || rel.target,
        description: extractShortDesc(rel.explanation || (target && target.description) || "", 130)
      };
    });

    if (!items.length) {
      const typeLabel = heroDiagramTypeID || 'aspecto';
      container.innerHTML = '<p class="hero-diagram-empty">Nenhuma relação do tipo “' + escapeHTML(typeLabel) + '” encontrada a partir de <strong>' + escapeHTML(root.concept) + '</strong>.</p>';
      return;
    }

    // Layout: radial — center node + items distributed evenly around a circle.
    // Even-indexed items sit on an inner ring (r=490), odd on an outer ring (r=670).
    const W = 1700, H = 1600;
    const cx = W / 2, cy = H / 2;
    const R_INNER = 490, R_OUTER = 670;
    const childW = 330, childH = 210;
    const N = items.length;

    function pointAt(i) {
      const ang = (-90 + (360 / N) * i) * Math.PI / 180;
      const r   = i % 2 === 0 ? R_INNER : R_OUTER;
      return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, ang: ang, r: r };
    }

    // Build SVG — uses CSS custom properties so site.css palettes apply to accent colours.
    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="hero-diagram-svg" preserveAspectRatio="xMidYMid meet">');
    parts.push('<defs>');
    parts.push('<filter id="hd-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
    parts.push('<radialGradient id="hd-bg" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#0e1422"/><stop offset="1" stop-color="#070b14"/></radialGradient>');
    parts.push('<pattern id="hd-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2230" stroke-width="0.6"/></pattern>');
    parts.push('</defs>');
    parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#hd-bg)"/>');
    parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#hd-grid)" opacity="0.5"/>');

    // Decorative concentric guides
    parts.push('<g fill="none" stroke="var(--line-strong)" stroke-dasharray="2 4" opacity="0.6">');
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (R_INNER - 20) + '"/>');
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (R_OUTER + 20) + '"/>');
    parts.push('</g>');

    // Connection lines (drawn first, behind nodes)
    const edgeLabel = heroDiagramTypeID || 'aspecto';
    items.forEach(function (_, i) {
      const p = pointAt(i);
      const dx = Math.cos(p.ang), dy = Math.sin(p.ang);
      const cOff = 155;
      const tOff = 120;
      const x1 = cx + dx * cOff;
      const y1 = cy + dy * cOff;
      const x2 = p.x - dx * tOff;
      const y2 = p.y - dy * tOff;
      parts.push('<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="var(--accent)" stroke-width="1.5" opacity="0.75"/>');
      // Arrow tip
      const ax = x2 - dx * 10, ay = y2 - dy * 10;
      const px = -dy * 5, py = dx * 5;
      parts.push('<path d="M ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' L ' + (ax + px).toFixed(1) + ' ' + (ay + py).toFixed(1) + ' L ' + (ax - px).toFixed(1) + ' ' + (ay - py).toFixed(1) + ' Z" fill="var(--accent)"/>');

      // Edge label
      const lx = cx + dx * ((cOff + p.r - tOff) / 2 + cOff);
      const ly = cy + dy * ((cOff + p.r - tOff) / 2 + cOff);
      parts.push('<g transform="translate(' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')">');
      parts.push('<rect x="-57" y="-17" width="114" height="34" rx="3" fill="var(--paper)" stroke="var(--accent)" stroke-width="1"/>');
      parts.push('<text x="0" y="7" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" fill="var(--accent)">' + escapeHTML(edgeLabel) + '</text>');
      parts.push('</g>');
    });

    // Center node
    parts.push('<g class="hero-diagram-center" transform="translate(' + cx + ' ' + cy + ')">');
    parts.push('<rect x="-240" y="-100" width="480" height="200" rx="4" fill="var(--paper)" stroke="var(--accent)" stroke-width="2.5" filter="url(#hd-glow)"/>');
    const centerLines = wrapText(root.concept || "Ciberespaço", 14, 2);
    const centerStartY = -17 - (centerLines.length - 1) * 28;
    centerLines.forEach(function (line, i) {
      parts.push('<text x="0" y="' + (centerStartY + i * 56) + '" text-anchor="middle" font-family="IBM Plex Sans, Inter, sans-serif" font-weight="800" font-size="52" fill="var(--accent)" letter-spacing="-0.02em">' + escapeHTML(line) + '</text>');
    });
    parts.push('<text x="0" y="76" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21" fill="var(--muted)" letter-spacing="0.18em">CONCEITO RAIZ</text>');
    parts.push('</g>');

    // Child nodes
    items.forEach(function (it, i) {
      const p = pointAt(i);
      const titleLines = wrapText(it.label, 16, 2);
      const descLines  = wrapText(it.description, 16, 3);
      parts.push('<g class="hero-diagram-node" data-slug="' + escapeHTML(it.slug) + '" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">');
      parts.push('<rect x="' + (-childW / 2) + '" y="' + (-childH / 2) + '" width="' + childW + '" height="' + childH + '" rx="3" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.5"/>');
      // Title strip
      const titleY = -childH / 2 + 38;
      titleLines.forEach(function (line, j) {
        parts.push('<text x="0" y="' + (titleY + j * 32) + '" text-anchor="middle" font-family="IBM Plex Sans, Inter, sans-serif" font-weight="700" font-size="28" fill="var(--accent)">' + escapeHTML(line) + '</text>');
      });
      // Separator
      const sepY = titleY + titleLines.length * 32 - 4;
      parts.push('<line x1="' + (-childW / 2 + 18) + '" y1="' + sepY + '" x2="' + (childW / 2 - 18) + '" y2="' + sepY + '" stroke="var(--line-strong)" stroke-width="1"/>');
      // Description
      const descStartY = sepY + 22;
      descLines.forEach(function (line, j) {
        parts.push('<text x="' + (-childW / 2 + 16) + '" y="' + (descStartY + j * 30) + '" text-anchor="start" font-family="Inter, sans-serif" font-size="26" fill="var(--link)">' + escapeHTML(line) + '</text>');
      });
      parts.push('</g>');
    });

    parts.push('</svg>');
    container.innerHTML = parts.join("");

    // Click handlers on child nodes
    const nodes = container.querySelectorAll(".hero-diagram-node");
    nodes.forEach(function (node) {
      node.style.cursor = "pointer";
      node.addEventListener("click", function () {
        const slug = node.getAttribute("data-slug");
        if (slug) location.hash = conceptUrl(slug);
      });
    });
    // Center node also clickable
    const center = container.querySelector(".hero-diagram-center");
    if (center) {
      center.style.cursor = "pointer";
      center.addEventListener("click", function () {
        location.hash = conceptUrl(rootSlug);
      });
    }
  }


  // =========================================================
  //  Media gallery (concept + narrative element)
  // =========================================================

  // ── URL helpers for video type ───────────────────────────────
  const _YT_RE   = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const _VIM_RE  = /vimeo\.com\/(\d+)/;
  const _VID_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

  const _IG_RE  = /instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/;
  const _TT_RE  = /tiktok\.com\/@[^/]+\/video\/(\d+)/;

  function _ytId(url)    { const m = _YT_RE.exec(url);  return m ? m[1] : null; }
  function _vimeoId(url) { const m = _VIM_RE.exec(url); return m ? m[1] : null; }
  function _igId(url)    { const m = _IG_RE.exec(url);  return m ? { type: m[1], id: m[2] } : null; }
  function _ttId(url)    { const m = _TT_RE.exec(url);  return m ? m[1] : null; }

  // Detect media type from URL/path syntax.
  // Returns "video" for all video sources (platform or local file); "image" otherwise.
  function _autoMediaType(url) {
    if (!url) return "image";
    if (_YT_RE.test(url) || _VIM_RE.test(url)) return "video";
    if (_IG_RE.test(url) || _TT_RE.test(url))  return "video";
    if (_VID_EXT.test(url)) return "video";
    return "image";
  }

  function _platformEmbedUrl(url) {
    const yt = _ytId(url);
    if (yt)  return "https://www.youtube-nocookie.com/embed/" + yt + "?rel=0";
    const vi = _vimeoId(url);
    if (vi)  return "https://player.vimeo.com/video/" + vi;
    const ig = _igId(url);
    if (ig)  return "https://www.instagram.com/" + ig.type + "/" + ig.id + "/embed/";
    const tt = _ttId(url);
    if (tt)  return "https://www.tiktok.com/embed/v2/" + tt;
    return null;
  }

  function _videoThumbUrl(url, poster) {
    if (poster) return poster;
    const yt = _ytId(url);
    if (yt) return "https://img.youtube.com/vi/" + yt + "/hqdefault.jpg";
    return null;
  }

  function _cssAspectRatio(ar, def) {
    const s = String(ar || def || "16:9").replace(":", "/");
    return /^\d+\/\d+$/.test(s) ? s : "16/9";
  }

  // ── Build HTML src for an html-type embed ────────────────────
  function _htmlEmbedSrc(file) {
    if (!file) return "";
    if (/^https?:\/\//i.test(file)) return file;
    // Folder convention: append /index.html unless already an .html file
    return /\.html?$/i.test(file) ? file : file.replace(/\/?$/, "/index.html");
  }

  // ── Whitelist sandbox tokens for html-embed iframes ───────────
  // Spreadsheet-supplied values are filtered to this set; allow-same-origin
  // and allow-top-navigation are never permitted (would neutralize the sandbox).
  const _SANDBOX_ALLOWED = new Set([
    "allow-scripts", "allow-popups", "allow-forms", "allow-pointer-lock"
  ]);
  function _sanitizeSandbox(value) {
    const tokens = String(value || "allow-scripts")
      .split(/\s+/)
      .filter(function (t) { return _SANDBOX_ALLOWED.has(t); });
    return tokens.length ? tokens.join(" ") : "allow-scripts";
  }

  // ── Build a single gallery slot ──────────────────────────────
  function _buildSlot(it, i, scope, scopeID, ownerLabel) {
    const type    = String(it.type || "image").toLowerCase();
    const hidden  = i === 0 ? "" : " hidden";
    const alt     = escapeAttr(it.alt || it.caption || (ownerLabel ? ("Mídia de " + ownerLabel) : ""));
    const title   = it.alt || it.caption || "";
    const ar      = _cssAspectRatio(it.aspectRatio, type === "image" ? "" : "16:9");
    const arStyle = ar ? ' style="aspect-ratio:' + ar + '"' : "";

    if (type === "video") {
      const rawSrc = mediaFilePath(scope, scopeID, it);

      // Instagram: Meta blocks all third-party iframe embedding.
      // Always render as a link card.
      const ig = _igId(rawSrc);
      if (ig) {
        const igUrl   = "https://www.instagram.com/" + ig.type + "/" + ig.id + "/";
        const igLabel = escapeHTML(it.caption || it.alt || "Ver no Instagram");
        return '<div class="gallery-slot gallery-slot--platform-card gallery-slot--ig"'
          + ' data-index="' + i + '"' + arStyle + hidden + '>'
          + '<a href="' + escapeAttr(igUrl) + '" target="_blank" rel="noopener" class="platform-card-link">'
          + '<svg class="platform-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'
          + '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>'
          + '<circle cx="12" cy="12" r="4"/>'
          + '<circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'
          + '</svg>'
          + '<span class="platform-card-label">' + igLabel + '</span>'
          + '</a></div>';
      }

      const embedUrl = _platformEmbedUrl(rawSrc);
      if (embedUrl) {
        // YouTube: click-to-play poster (avoids localhost/privacy-browser blocks).
        // Clicking swaps the poster for the live iframe with autoplay.
        const yt = _ytId(rawSrc);
        if (yt) {
          const thumb = "https://img.youtube.com/vi/" + yt + "/mqdefault.jpg";
          return '<div class="gallery-slot gallery-slot--video gallery-slot--yt-poster"'
            + ' data-index="' + i + '" data-embed="' + escapeAttr(embedUrl + "&autoplay=1") + '"' + arStyle + hidden + '>'
            + '<img src="' + escapeAttr(thumb) + '" alt="' + alt + '" class="yt-poster-img" onerror="this.style.display=\'none\'">'
            + '<button class="yt-play-btn" aria-label="Reproduzir vídeo" type="button">&#9654;</button>'
            + '</div>';
        }
        // Vimeo / TikTok: direct iframe embed
        return '<div class="gallery-slot gallery-slot--video gallery-slot--embed"'
          + ' data-index="' + i + '"' + arStyle + hidden + '>'
          + '<iframe src="' + escapeAttr(embedUrl) + '"'
          + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'
          + ' allowfullscreen loading="lazy" frameborder="0" title="' + alt + '"></iframe>'
          + '</div>';
      } else {
        // Local or direct mp4/webm
        const poster  = it.poster ? mediaFilePath(scope, scopeID, { file: it.poster }) : "";
        const mimeRaw = (_VID_EXT.exec(rawSrc) || [])[1] || "mp4";
        const mime    = "video/" + (mimeRaw === "mov" ? "mp4" : mimeRaw);
        return '<div class="gallery-slot gallery-slot--video"'
          + ' data-index="' + i + '"' + arStyle + hidden + '>'
          + '<video controls playsinline preload="metadata"'
          + (poster ? ' poster="' + escapeAttr(poster) + '"' : "") + '>'
          + '<source src="' + escapeAttr(rawSrc) + '" type="' + mime + '">'
          + '</video>'
          + '</div>';
      }
    }

    if (type === "html") {
      const src      = _htmlEmbedSrc(String(it.file || "").trim());
      const sandbox  = _sanitizeSandbox(it.sandbox);
      return '<div class="gallery-slot gallery-slot--html"'
        + ' data-index="' + i + '"' + arStyle + hidden + '>'
        + '<iframe src="' + escapeAttr(src) + '"'
        + ' sandbox="' + escapeAttr(sandbox) + '"'
        + ' loading="lazy" frameborder="0" title="' + escapeAttr(title) + '"></iframe>'
        + '</div>';
    }

    // Default: image
    const src = mediaFilePath(scope, scopeID, it);
    return '<img class="gallery-slot gallery-slot--image gallery-image"'
      + ' data-index="' + i + '" src="' + escapeAttr(src) + '" alt="' + alt + '"'
      + hidden + ' />';
  }

  // ── Build thumbnail for the thumb strip ──────────────────────
  function _buildThumb(it, i, total, scope, scopeID) {
    const type   = String(it.type || "image").toLowerCase();
    const label  = escapeAttr("Item " + (i + 1) + " de " + total);
    const active = i === 0 ? " is-active" : "";
    let inner;
    if (type === "video") {
      const rawSrc  = mediaFilePath(scope, scopeID, it);
      const thumb   = _videoThumbUrl(rawSrc, it.poster ? mediaFilePath(scope, scopeID, { file: it.poster }) : "");
      inner = thumb
        ? '<img src="' + escapeAttr(thumb) + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'gallery-thumb-placeholder\',textContent:\'▶\'}))" />'
        : '<div class="gallery-thumb-placeholder">▶</div>';
    } else if (type === "html") {
      inner = '<div class="gallery-thumb-placeholder">&lt;/&gt;</div>';
    } else {
      const src = mediaFilePath(scope, scopeID, it);
      inner = '<img src="' + escapeAttr(src) + '" alt="" onerror="this.classList.add(\'gallery-image-broken\')" />';
    }
    return '<button class="gallery-thumb' + active + '" type="button"'
      + ' data-index="' + i + '" aria-label="' + label + '">'
      + inner + '</button>';
  }

  // ── Build the HTML for a gallery. Returns empty string if no media. ──
  function buildGalleryHtml(scope, scopeID, ownerLabel, overrideItems) {
    if (!scopeID) return '<div class="gallery-empty" aria-hidden="true"></div>';
    const items = overrideItems || getMediaFor(scope, scopeID);
    if (!items.length) return '<div class="gallery-empty" aria-hidden="true"></div>';

    const parts = [];
    parts.push('<div class="gallery-main">');
    parts.push('<figure class="gallery-figure" data-active="0">');
    items.forEach(function (it, i) {
      parts.push(_buildSlot(it, i, scope, scopeID, ownerLabel));
    });
    parts.push('<figcaption class="gallery-caption">');
    parts.push('<span class="gallery-counter"></span>');
    parts.push('<strong class="gallery-source-title"></strong>');
    parts.push('<span class="gallery-caption-text"></span>');
    parts.push('<a class="gallery-source-link" href="#" target="_blank" rel="noopener noreferrer">Abrir post original</a>');
    parts.push('</figcaption>');
    parts.push('</figure>');
    parts.push('</div>');

    if (items.length > 1) {
      parts.push('<nav class="gallery-thumbs" aria-label="Itens disponíveis">');
      items.forEach(function (it, i) {
        parts.push(_buildThumb(it, i, items.length, scope, scopeID));
      });
      parts.push('</nav>');
    }

    // Stash metadata for wireUpGallery.
    const meta = items.map(function (it) {
      return {
        type:        it.type || "image",
        caption:     it.caption     || "",
        sourceUrl:   it.sourceUrl   || "",
        sourceTitle: it.sourceTitle || ""
      };
    });
    return '<div class="gallery-inner" data-items="' + escapeAttr(JSON.stringify(meta))
      + '" data-total="' + items.length + '">' + parts.join("") + '</div>';
  }

  // Wire interactivity for a gallery DOM node produced by buildGalleryHtml.
  function wireUpGallery(host) {
    if (!host) return;
    const inner = host.querySelector(".gallery-inner");
    if (!inner) return;
    let items = [];
    try { items = JSON.parse(inner.getAttribute("data-items") || "[]"); } catch (e) { items = []; }
    const total = items.length;
    if (!total) return;
    const figure        = inner.querySelector(".gallery-figure");
    let slotEls         = Array.from(inner.querySelectorAll(".gallery-slot"));
    const thumbs        = inner.querySelectorAll(".gallery-thumb");
    const counter       = inner.querySelector(".gallery-counter");
    const sourceTitleEl = inner.querySelector(".gallery-source-title");
    const captionEl     = inner.querySelector(".gallery-caption-text");
    const link          = inner.querySelector(".gallery-source-link");

    // YouTube click-to-play: swap poster div for live iframe on click.
    slotEls.forEach(function (el) {
      if (!el.classList.contains("gallery-slot--yt-poster")) return;
      el.addEventListener("click", function () {
        const embedUrl = el.getAttribute("data-embed");
        if (!embedUrl) return;
        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        iframe.frameBorder = "0";
        iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:none;display:block;";
        el.innerHTML = "";
        el.appendChild(iframe);
        el.classList.remove("gallery-slot--yt-poster");
        el.classList.add("gallery-slot--embed");
      });
    });

    // Broken-image fallback: replace with iframe for HTTP image URLs only.
    slotEls.forEach(function (el, idx) {
      if (!el.classList.contains("gallery-slot--image")) return;
      el.onerror = function () {
        el.onerror = null;
        const src = el.src;
        if (/^https?:\/\//.test(src)) {
          const fr = document.createElement("iframe");
          fr.className = el.className;
          fr.setAttribute("data-index", String(idx));
          if (el.hasAttribute("hidden")) fr.setAttribute("hidden", "");
          fr.src = src;
          fr.style.cssText = "width:100%;height:100%;border:none;display:block;";
          fr.setAttribute("sandbox", "allow-scripts allow-popups");
          el.replaceWith(fr);
          slotEls[idx] = fr;
        } else {
          el.classList.add("gallery-image-broken");
        }
      };
    });

    function show(i) {
      if (i < 0 || i >= total) return;
      figure.setAttribute("data-active", String(i));
      slotEls.forEach(function (el, idx) {
        if (idx === i) {
          el.removeAttribute("hidden");
        } else {
          el.setAttribute("hidden", "");
          // Pause native video when switching away.
          const vid = el.tagName === "VIDEO" ? el : el.querySelector("video");
          if (vid) vid.pause();
        }
      });
      thumbs.forEach(function (b, idx) { b.classList.toggle("is-active", idx === i); });
      const it = items[i] || {};
      if (counter)       counter.textContent = total > 1 ? (i + 1) + " / " + total : "";
      if (sourceTitleEl) sourceTitleEl.textContent = it.sourceTitle || "";
      if (captionEl)     captionEl.textContent = it.caption || "";
      if (link) {
        if (it.sourceUrl && isHttpUrl(it.sourceUrl)) { link.href = it.sourceUrl; link.removeAttribute("hidden"); }
        else              { link.setAttribute("hidden", ""); }
      }
    }

    thumbs.forEach(function (b, idx) {
      b.addEventListener("click", function () { show(idx); });
    });

    if (figure) {
      figure.setAttribute("tabindex", "0");
      figure.addEventListener("keydown", function (event) {
        const active = parseInt(figure.getAttribute("data-active"), 10) || 0;
        if (event.key === "ArrowRight") { show(Math.min(active + 1, total - 1)); event.preventDefault(); }
        if (event.key === "ArrowLeft")  { show(Math.max(active - 1, 0));         event.preventDefault(); }
      });
    }

    show(0);
  }


  function _conceptSkinCtx() {
    return {
      appStore:            appStore,
      renderConceptIndex:  renderConceptIndex,
      buildGalleryHtml:    buildGalleryHtml,
      wireUpGallery:       wireUpGallery,
      loadHelpConfig:      loadHelpConfig,
      applyTooltips:       applyTooltips,
      loadSkinAssets:      loadSkinAssets,
      autoMediaType:       _autoMediaType,
      mediaFilePath:       mediaFilePath,
      getMediaFor:         getMediaFor,
      t:                   t,
      applyI18n:           applyI18n,
    };
  }

  // Resolve which concept skin impl ID to use. Priority:
  //   1. URL ?skin= param
  //   2. conceptSkinsStore default for this conceptID
  //   3. skins/index.json defaultConceptSkin
  //   4. "concept-default" fallback
  async function _resolveConceptSkin(conceptID, querySkin) {
    if (querySkin) {
      // Check global index first so direct impl IDs (e.g. "concept-default",
      // "scrolly-staged") are honoured before falling back to stored skins.
      const idx = await loadSkinIndex();
      const globalSkin = (idx && idx.skins || []).find(function (s) { return s.id === querySkin; });
      if (globalSkin) return querySkin;
      const skin = resolveConceptSkin(conceptID, querySkin);
      if (skin) return skin.skinImplID || "concept-default";
    }
    const def = getDefaultConceptSkin(conceptID);
    if (def) return def.skinImplID || "concept-default";
    const index = await loadSkinIndex();
    return (index && index.defaultConceptSkin) || "concept-default";
  }

  // Build skin-switcher chip HTML for a concept page.
  // globalSkins: array of {id, name} from skins/index.json, used as fallback
  // when the concept has no per-concept entries in conceptSkinsStore.
  function buildConceptSkinSwitcherHtml(conceptID, slug, activeSkinID, globalSkins) {
    const perConcept = getConceptSkins(conceptID);
    let options;
    if (perConcept.length >= 2) {
      options = perConcept.map(function (s) {
        return { id: s.skinID, name: s.skinName || s.skinID,
                 isActive: s.skinID === activeSkinID || (s.skinImplID || "concept-default") === activeSkinID };
      });
    } else if (globalSkins && globalSkins.length >= 1) {
      // Only include skins that need no external config, or that are already
      // configured for this specific concept in the Concept Skins sheet.
      const filtered = globalSkins.filter(function (s) {
        if (!s.dataContract || !s.dataContract.type) return true;
        return perConcept.some(function (pc) {
          return pc.skinImplID === s.id || pc.skinID === s.id;
        });
      });
      if (filtered.length < 2) return "";
      options = filtered.map(function (s) {
        return { id: s.id, name: s.name || s.id, isActive: s.id === activeSkinID };
      });
    } else {
      return "";
    }
    let html = '<div class="skin-switcher">';
    options.forEach(function (opt) {
      const url = conceptUrl(slug) + "?skin=" + encodeURIComponent(opt.id);
      html += '<a href="' + escapeAttr(url) + '" class="skin-chip' + (opt.isActive ? ' active' : '') + '">' +
        escapeHTML(opt.name) + '</a>';
    });
    html += '</div>';
    return html;
  }

  // Populate topSkinSelect with concept skins for the current concept page.
  // Uses per-concept entries from conceptSkinsStore, or falls back to the
  // global list of concept-scoped skins from skins/index.json.
  async function _updateConceptSkinSelect(conceptID, implID) {
    const topSel = document.getElementById("topSkinSelect");
    if (!topSel) return;
    topSel.innerHTML = "";
    const perConcept = getConceptSkins(conceptID);
    if (perConcept.length >= 2) {
      topSel.style.display = "";
      perConcept.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.skinID;
        opt.textContent = s.skinName || s.skinID;
        topSel.appendChild(opt);
      });
      const active = resolveConceptSkin(conceptID, implID);
      topSel.value = active ? active.skinID : (perConcept[0] && perConcept[0].skinID) || "";
    } else {
      const index = await loadSkinIndex();
      const perConcept2 = getConceptSkins(conceptID);
      const globalConceptSkins = (index && index.skins || []).filter(function (s) {
        if (!s.scope || s.scope.indexOf("concept") < 0) return false;
        if (!s.dataContract || !s.dataContract.type) return true;
        return perConcept2.some(function (pc) {
          return pc.skinImplID === s.id || pc.skinID === s.id;
        });
      });
      // Only show the selector when there are genuine alternatives.
      if (globalConceptSkins.length <= 1) {
        topSel.innerHTML = "";
        topSel.style.display = "none";
        return;
      }
      topSel.style.display = "";
      globalConceptSkins.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name || s.id;
        topSel.appendChild(opt);
      });
      topSel.value = implID || "concept-default";
    }
  }

  async function renderConcept(slugOrID, querySkin) {
    // Accept both conceptID ("C051") and slug ("infancia-algoritmica")
    const slug = resolveConceptSlug(slugOrID) || slugOrID;
    if (!appStore.graph || !appStore.graph.bySlug || !appStore.graph.bySlug[slug]) { renderNotFound(slugOrID); return; }
    if (appStore.currentConceptSlug && appStore.currentConceptSlug !== slug) setPreviousConcept(appStore.currentConceptSlug);
    appStore.currentConceptSlug = slug;
    const concept = appStore.graph.bySlug[slug];
    addToHistory(concept);
    updateNavContext(concept);
    egVisit(slug, concept, appStore.graph, getPreviousConcept());

    const conceptID = (concept.conceptID || "").toUpperCase();
    const implID = await _resolveConceptSkin(conceptID, querySkin || "");
    ensureSkinCSS(implID);

    const index = await loadSkinIndex();
    const globalConceptSkins = (index && index.skins || []).filter(function (s) {
      return s.scope && s.scope.indexOf("concept") >= 0;
    });

    _updateConceptSkinSelect(conceptID, implID);

    const skinEntry = resolveConceptSkin(conceptID, querySkin || "");
    const skinParams = {
      activeSkinID:     implID,
      globalConceptSkins: globalConceptSkins,
      dataSourceType:   (skinEntry && skinEntry.dataSourceType) || "",
      dataSourceID:     (skinEntry && skinEntry.dataSourceID)   || "",
      parameters:       (skinEntry && skinEntry.parameters)     || {}
    };
    // Scrolly concept skins hide the EG; explicit egMode on the skin entry overrides.
    const conceptEgMode = (skinEntry && skinEntry.egMode) ||
                          (implID.indexOf("scrolly") >= 0 ? "hidden" : "normal");
    egSetMode(conceptEgMode);
    try {
      const s = await getSkinInstance(implID, _conceptSkinCtx());
      s.render(slug, skinParams);
    } catch (e) {
      console.error("[concept skin] render error for skin=" + implID, e);
      const s = await getSkinInstance("concept-default", _conceptSkinCtx());
      s.render(slug, skinParams);
    }
  }


  // =========================================================
  //  Narrative PiP Overlay — state management
  // =========================================================
  var _nState  = "hidden";   // "hidden" | "pip" | "full"
  var _nMode   = "scrolly";  // "scrolly" | "linear"
  var _nID     = null;
  var _egRevealedAtScrollEnd = false;
  var _nPipDragging = false;
  var _nPipDragX0, _nPipDragY0, _nPipBaseX, _nPipBaseY;
  var N_PIP_W = 334, N_PIP_H = 210, N_PIP_MARGIN = 22;

  function _nEl()       { return document.getElementById("narrativeOverlay"); }
  function _nScroller() { return document.getElementById("nOverlayScroller"); }
  function _nContent()  { return document.getElementById("nOverlayContent"); }

  function openNarrativeOverlay(narrativeID, mode) {
    _nID   = narrativeID;
    _nMode = mode || "scrolly";
    _nState = "full";
    var el = _nEl(); if (!el) return;
    el.style.transform = "";
    el.className = "n-overlay is-full";
    el.setAttribute("data-mode", _nMode);
    _nUpdateBar();
    _updateSkinSelect(_nID, _nMode);
    _nUpdatePipCard();
  }

  function minimizeNarrativeOverlay() {
    _nUpdatePipCard();
    var el = _nEl(); if (!el) return;
    el.style.transform = "";
    el.className = "n-overlay is-pip";
    _nState = "pip";
  }

  function maximizeNarrativeOverlay() {
    var el = _nEl(); if (!el) return;
    el.style.transform = "";
    el.className = "n-overlay is-full";
    _nState = "full";
  }

  function closeNarrativeOverlay() {
    var el = _nEl(); if (!el) return;
    el.style.transform = "";
    el.className = "n-overlay";
    _nState = "hidden";
    _nID = null;
    // Remove any narrative skin class so the rest of the UI is not
    // affected by skin-specific body styles after the overlay closes.
    activateSkin("linear");
  }

  function _nUpdateBar() {
    var narrative = _nID ? getNarrative(_nID) : null;
    var titleEl = document.getElementById("nBarTitle");
    if (titleEl && narrative) titleEl.textContent = narrative.narrativeTitle || _nID;
    var counterEl = document.getElementById("nBarCounter");
    if (counterEl) counterEl.textContent = "\u2014";
  }

  // Populate skin <select> options from narrativeSkinsStore (or fallback hardcoded list)
  // and set the active selection to the skin that matches querySkinOrImpl.
  function _updateSkinSelect(narrativeID, querySkinOrImpl) {
    var skins = getNarrativeSkins(narrativeID || "");
    ["nSkinSelect", "topSkinSelect"].forEach(function (selId) {
      var el = document.getElementById(selId);
      if (!el) return;
      el.innerHTML = "";
      if (skins.length) {
        skins.forEach(function (s) {
          var opt = document.createElement("option");
          opt.value = s.skinID;
          opt.textContent = s.skinName || s.skinID;
          el.appendChild(opt);
        });
        var active = resolveNarrativeSkin(narrativeID, querySkinOrImpl);
        // When querySkinOrImpl is an impl ID ("scrolly"/"linear"), no stored skin has
        // that literal skinID, so resolveNarrativeSkin falls back to the default.
        // Override by finding the skin whose template maps to the requested impl.
        if (querySkinOrImpl === "scrolly" || querySkinOrImpl === "linear") {
          var wantScrolly = querySkinOrImpl === "scrolly";
          var implMatch = skins.find(function(s) {
            var tpl = getTemplate(s.templateID);
            return tpl && isScrollyTemplate(tpl) === wantScrolly;
          });
          if (implMatch) active = implMatch;
        }
        el.value = active ? active.skinID : (skins[0] && skins[0].skinID) || "";
      } else {
        [["scrolly", t("narrative.skin.scrolly", "Scrollytelling")], ["linear", t("narrative.skin.linear", "Leitura linear")]].forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p[0]; opt.textContent = p[1];
          el.appendChild(opt);
        });
        if (querySkinOrImpl === "scrolly" || querySkinOrImpl === "linear") el.value = querySkinOrImpl;
      }
    });
  }

  function _nUpdatePipCard() {
    var narrative = _nID ? getNarrative(_nID) : null;
    var titleEl  = document.getElementById("nPipTitle");
    var chapEl   = document.getElementById("nPipChap");
    var progEl   = document.getElementById("nPipProgFill");
    var modeEl   = document.getElementById("nPipModeTag");
    var resumeEl = document.getElementById("nPipResume");
    if (titleEl && narrative) titleEl.textContent = narrative.narrativeTitle || _nID || "";
    if (modeEl)   modeEl.textContent  = _nMode === "linear" ? "LINEAR" : "SCROLLY";
    if (resumeEl) resumeEl.textContent = _nMode === "linear"
      ? t("pip.resume.linear", "\u2191 Retomar leitura") : t("pip.resume.scrolly", "\u2191 Continuar narrativa");

    var scroller = _nScroller();
    if (!scroller) return;
    if (_nMode === "scrolly") {
      var maxS = scroller.scrollHeight - scroller.clientHeight;
      var pctS = maxS > 0 ? Math.round(scroller.scrollTop / maxS * 100) : 2;
      if (progEl) progEl.style.width = Math.max(3, pctS) + "%";
      // Active chapter
      var elems = narrative && narrative.elements ? narrative.elements : [];
      var activeIdx = 0;
      elems.forEach(function(eid, i) {
        var sec = document.getElementById("scrolly-" + eid);
        if (sec && sec.getBoundingClientRect().top < scroller.clientHeight * 0.55) activeIdx = i + 1;
      });
      if (chapEl) chapEl.textContent = activeIdx > 0
        ? ("Cap. " + toRoman(activeIdx) + " / " + toRoman(elems.length))
        : "Introdu\u00e7\u00e3o";
    } else {
      // Linear: read active dot from content
      var content = _nContent();
      var dots    = content ? content.querySelectorAll(".l-nav-dot") : [];
      var activeDot = content ? content.querySelector(".l-nav-dot.active") : null;
      var dotIdx  = activeDot ? Array.from(dots).indexOf(activeDot) + 1 : 0;
      var dotTotal = dots.length || 1;
      if (progEl) progEl.style.width = (dotIdx > 0 ? Math.round(dotIdx / dotTotal * 100) : 3) + "%";
      var chapLbl = content ? content.querySelector(".l-chapter-label") : null;
      if (chapEl) chapEl.textContent = chapLbl ? chapLbl.textContent : "Leitura";
    }
  }

  function _nSwitchToSkin(skinID) {
    if (!_nID || !skinID) return;
    _renderWithSkin(_nID, skinID);
  }

  function _nSwitchToLinear() {
    if (!_nID) return;
    var narrative = getNarrative(_nID);
    if (!narrative) return;
    // Find the chapter currently visible in scrolly and jump to that element
    var elems = narrative.elements || [];
    var activeIdx = 0;
    var scroller = _nScroller();
    if (scroller) {
      elems.forEach(function(eid, i) {
        var sec = document.getElementById("scrolly-" + eid);
        if (sec && sec.getBoundingClientRect().top < scroller.clientHeight * 0.55) activeIdx = i;
      });
    }
    var targetID = elems[activeIdx] || narrative.narrativeStart || elems[0];
    if (targetID) {
      location.hash = narrativeElementUrl(_nID, targetID);
    } else {
      location.hash = narrativeUrl(_nID);
    }
  }

  function installNarrativeOverlay() {
    var overlay  = _nEl();
    var scroller = _nScroller();
    if (!overlay) return;

    // PiP card click → maximize
    var pipCard = document.getElementById("nPipCard");
    if (pipCard) {
      pipCard.addEventListener("click", function() {
        if (_nState === "pip") maximizeNarrativeOverlay();
      });
    }
    var pipClose = document.getElementById("nPipClose");
    if (pipClose) {
      pipClose.addEventListener("click", function(e) {
        e.stopPropagation();
        closeNarrativeOverlay();
      });
    }
    var pipResume = document.getElementById("nPipResume");
    if (pipResume) {
      pipResume.addEventListener("click", function(e) {
        e.stopPropagation();
        maximizeNarrativeOverlay();
      });
    }

    // Topbar controls
    var nBarBack  = document.getElementById("nBarBack");
    var nBarClose = document.getElementById("nBarClose");
    var nBarMin   = document.getElementById("nBarMinimize");
    if (nBarBack)  nBarBack.addEventListener("click",  closeNarrativeOverlay);
    if (nBarClose) nBarClose.addEventListener("click", closeNarrativeOverlay);
    if (nBarMin)   nBarMin.addEventListener("click",   minimizeNarrativeOverlay);

    // Skin switcher selects — both overlay and main topbar
    function _installSkinSelect(selectEl) {
      if (!selectEl) return;
      selectEl.addEventListener("change", function () {
        var newSkinID = selectEl.value;
        if (!newSkinID) return;
        var parsed = splitHashAndQuery(location.hash || "#/");
        parsed.query.skin = newSkinID;
        var params = Object.keys(parsed.query).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(parsed.query[k]);
        }).join("&");
        location.hash = parsed.path + (params ? "?" + params : "");
      });
    }
    _installSkinSelect(document.getElementById("nSkinSelect"));
    _installSkinSelect(document.getElementById("topSkinSelect"));

    // Concept link interception inside overlay → PiP + graph navigate
    if (scroller) {
      scroller.addEventListener("click", function(e) {
        var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!link) return;
        var href = link.getAttribute("href") || "";
        if (href.indexOf("#/concept/") === 0) {
          e.preventDefault();
          e.stopPropagation();
          _nUpdatePipCard();
          var token = decodeURIComponent(href.slice("#/concept/".length));
          var slug  = resolveConceptSlug(token) || token;
          history.pushState(null, "", href);
          renderConcept(slug, "");
          minimizeNarrativeOverlay();
        }
      });

      // Scroll → progress bar + EG reveal at end of scrolly narrative
      scroller.addEventListener("scroll", function() {
        var fill = document.getElementById("nBarProgFill");
        if (fill) {
          var max = scroller.scrollHeight - scroller.clientHeight;
          fill.style.width = (max > 0 ? (scroller.scrollTop / max * 100).toFixed(1) : 0) + "%";
        }
        if ((_nMode === "scrolly" || _nMode === "scrolly-grammar-iv") && !_egRevealedAtScrollEnd) {
          var narrative = _nID && getNarrative(_nID);
          var elems = narrative && narrative.elements ? narrative.elements : [];
          if (elems.length > 0) {
            var lastElemID = elems[elems.length - 1];
            var lastSec = document.getElementById("scrolly-" + lastElemID)
                       || document.getElementById("giv-e-" + lastElemID);
            var triggered = false;
            if (_nMode === "scrolly-grammar-iv") {
              // Dual check for reliability across desktop and mobile:
              // (a) scroll position: generous 300px tolerance covers mobile
              //     address-bar height changes and iOS momentum scroll quirks;
              // (b) last section visible: getBoundingClientRect works correctly
              //     on mobile even when scrollTop is not fully accurate.
              var maxScroll = scroller.scrollHeight - scroller.clientHeight;
              var scrollCheck = maxScroll > 0 && scroller.scrollTop >= maxScroll - 300;
              var visCheck = lastSec && lastSec.getBoundingClientRect().top < window.innerHeight * 0.85;
              triggered = scrollCheck || visCheck;
            } else if (lastSec) {
              triggered = lastSec.getBoundingClientRect().top < scroller.clientHeight * 0.55;
            }
            if (triggered) {
              _egRevealedAtScrollEnd = true;
              egSetMode("normal");
            }
          }
        }
      }, { passive: true });
    }

    // Draggable PiP
    var drag = document.getElementById("nOverlayDrag");
    if (drag) {
      drag.addEventListener("mousedown", function(e) {
        if (_nState !== "pip") return;
        _nPipDragging = true;
        _nPipDragX0 = e.clientX; _nPipDragY0 = e.clientY;
        var mat = new DOMMatrix(getComputedStyle(overlay).transform);
        _nPipBaseX = mat.m41; _nPipBaseY = mat.m42;
        e.preventDefault();
      });
      drag.addEventListener("touchstart", function(e) {
        if (_nState !== "pip") return;
        _nPipDragging = true;
        _nPipDragX0 = e.touches[0].clientX; _nPipDragY0 = e.touches[0].clientY;
        var mat = new DOMMatrix(getComputedStyle(overlay).transform);
        _nPipBaseX = mat.m41; _nPipBaseY = mat.m42;
      }, { passive: true });
    }
    document.addEventListener("mousemove", function(e) {
      if (!_nPipDragging) return;
      var nx = Math.min(Math.max(0, _nPipBaseX + e.clientX - _nPipDragX0), window.innerWidth  - N_PIP_W - N_PIP_MARGIN);
      var ny = Math.min(Math.max(0, _nPipBaseY + e.clientY - _nPipDragY0), window.innerHeight - N_PIP_H - N_PIP_MARGIN);
      overlay.style.transform = "translate(" + nx + "px," + ny + "px)";
    });
    document.addEventListener("touchmove", function(e) {
      if (!_nPipDragging) return;
      var nx = Math.min(Math.max(0, _nPipBaseX + e.touches[0].clientX - _nPipDragX0), window.innerWidth  - N_PIP_W - N_PIP_MARGIN);
      var ny = Math.min(Math.max(0, _nPipBaseY + e.touches[0].clientY - _nPipDragY0), window.innerHeight - N_PIP_H - N_PIP_MARGIN);
      overlay.style.transform = "translate(" + nx + "px," + ny + "px)";
    }, { passive: true });
    document.addEventListener("mouseup",  function() { _nPipDragging = false; });
    document.addEventListener("touchend", function() { _nPipDragging = false; });
  }

  // =========================================================
  //  Skin loading — loader.js manages CSS injection,
  //  body class, JS module lazy-loading, asset discovery.
  // =========================================================

  function _skinCtx() {
    return {
      appStore:             appStore,
      nContent:             _nContent,
      nScroller:            _nScroller,
      nEl:                  _nEl,
      openNarrativeOverlay: openNarrativeOverlay,
      updateNavContext:     updateNavContext,
      loadHelpConfig:       loadHelpConfig,
      applyTooltips:        applyTooltips,
      wireUpGallery:        wireUpGallery,
      buildGalleryHtml:     buildGalleryHtml,
      renderNotFound:       renderNotFound,
      getNarrative:         getNarrative,
      renderConceptIndex:   renderConceptIndex,
      renderLinearStart:    async function(narrativeID) {
        activateSkin("linear"); _updateSkinSelect(narrativeID, "linear");
        const ls = await getSkinInstance("linear", _skinCtx());
        ls.renderStart(narrativeID);
      },
      loadSkinAssets:             loadSkinAssets,
      autoMediaType:              _autoMediaType,
      getMediaFor:                getMediaFor,
      mediaFilePath:              mediaFilePath,
      minimizeNarrativeOverlay:   minimizeNarrativeOverlay,
      expandAppSidebar: function () {
        var shell     = document.querySelector(".concept-shell");
        var expandTab = document.querySelector(".sidebar-expand-tab");
        if (shell && shell.classList.contains("sidebar-collapsed")) {
          shell.classList.remove("sidebar-collapsed");
          if (expandTab) expandTab.textContent = "‹";
          try { localStorage.setItem("conceptGraph.sidebarCollapsed.v1", "0"); } catch (e) {}
        }
      },
      flashAppSidebar: function () {
        var pane = document.querySelector(".concept-index-pane:not(.sidebar-overlay)");
        if (!pane) return;
        pane.classList.remove("app-sidebar-flash");
        void pane.offsetWidth; // force reflow
        pane.classList.add("app-sidebar-flash");
        pane.addEventListener("animationend", function () {
          pane.classList.remove("app-sidebar-flash");
        }, { once: true });
      },
    };
  }

  // Map a skinID (e.g. "S002") or an impl ID ("scrolly"/"linear") to an impl ID.
  // Looks up the skin in narrativeSkinsStore and resolves via templateID → isScrollyTemplate.
  function _skinImplId(narrativeID, skinIDorImpl) {
    if (!skinIDorImpl) return null;
    if (skinIDorImpl === "scrolly" || skinIDorImpl === "linear") return skinIDorImpl;
    const skin = resolveNarrativeSkin(narrativeID, skinIDorImpl);
    if (skin) {
      const tpl = getTemplate(skin.templateID);
      return isScrollyTemplate(tpl) ? "scrolly" : "linear";
    }
    return skinIDorImpl;
  }

  // Resolve which implementation skin to use for a narrative. Priority order:
  //   1. URL ?skin= param (skinID or impl ID)
  //   2. narrativeSkinsStore default skin
  //   3. narrative.skin column (legacy)
  //   4. skins/index.json defaultSkin
  async function _resolveSkinForNarrative(narrativeID, querySkin) {
    if (querySkin) {
      // Check global skins index first — allows custom impl IDs (e.g. "scrolly-staged")
      // to be used directly before _skinImplId falls back to the narrative's stored default.
      const _idx = await loadSkinIndex();
      const _entry = (_idx && _idx.skins || []).find(function (s) {
        return s.id === querySkin && Array.isArray(s.scope) && s.scope.indexOf("narrative") >= 0;
      });
      if (_entry) return querySkin;
      const impl = _skinImplId(narrativeID, querySkin);
      if (impl === "scrolly" || impl === "linear") return impl;
    }
    const def = getDefaultNarrativeSkin(narrativeID);
    if (def) {
      const tpl = getTemplate(def.templateID);
      return isScrollyTemplate(tpl) ? "scrolly" : "linear";
    }
    const narrative = getNarrative(narrativeID);
    if (narrative && narrative.skin) return narrative.skin;
    const index = await loadSkinIndex();
    return (index && index.defaultSkin) || "linear";
  }

  async function _renderWithSkin(narrativeID, skinID) {
    const implID = await _resolveSkinForNarrative(narrativeID, skinID);
    activateSkin(implID);
    _updateSkinSelect(narrativeID, skinID);
    const activeSkin = resolveNarrativeSkin(narrativeID, skinID) || getDefaultNarrativeSkin(narrativeID);
    const skinParams = (activeSkin && activeSkin.parameters) || {};
    // Apply EG visibility. Explicit egMode on the skin entry wins;
    // otherwise scrolly defaults to hidden, linear to normal.
    const egMode = (activeSkin && activeSkin.egMode) ||
                   ((implID === "scrolly" || implID === "scrolly-grammar-iv") ? "hidden" : "normal");
    _egRevealedAtScrollEnd = false;
    egSetMode(egMode);
    try {
      const s = await getSkinInstance(implID, _skinCtx());
      if (typeof s.render === "function") {
        s.render(narrativeID, skinParams);
      } else if (typeof s.renderStart === "function") {
        s.renderStart(narrativeID);
      }
    } catch(e) {
      console.error("[skin] render error for skin=" + implID, e);
      const ls = await getSkinInstance("linear", _skinCtx());
      activateSkin("linear");
      ls.renderStart(narrativeID);
    }
  }

  async function renderNarrativeStart(narrativeID) {
    await _renderWithSkin(narrativeID, "");
  }

  async function renderNarrativeScrolly(narrativeID) {
    await _renderWithSkin(narrativeID, "scrolly");
  }

  function _highlightConceptInOverlay(conceptID) {
    const slug = appStore.graph && appStore.graph.idToSlug && appStore.graph.idToSlug[conceptID.toUpperCase()];
    if (!slug) return;
    const scroller = _nScroller();
    const content  = _nContent();
    if (!content || !scroller) return;
    const target = content.querySelector('a[href="' + conceptUrl(slug) + '"]');
    if (!target) return;
    target.classList.add("concept-highlight");
    // scroll the link into view within the overlay scroller
    const linkTop    = target.getBoundingClientRect().top;
    const scrollerTop = scroller.getBoundingClientRect().top;
    scroller.scrollTop += linkTop - scrollerTop - scroller.clientHeight / 3;
  }

  async function renderNarrativeElement(narrativeID, elementID, highlightConceptID) {
    activateSkin("linear");
    _updateSkinSelect(narrativeID, "linear");
    const s = await getSkinInstance("linear", _skinCtx());
    s.renderElement(narrativeID, elementID);
    if (highlightConceptID) _highlightConceptInOverlay(highlightConceptID);
  }


  function renderNotFound(slug) {
    updateNavContext(null);
    const app = $("#app");
    app.innerHTML = '<section class="hero"><div class="hero-card"><p class="eyebrow">Conceito não encontrado</p><h1>Não encontrei este conceito</h1><div class="error-box">O slug <code>' + escapeHTML(slug) + '</code> não está no grafo carregado.</div><p><a class="start-link" href="#/">Voltar à home</a></p></div></section>';
  }

  function splitHashAndQuery(hash) {
    const raw = String(hash || "#/");
    const qIdx = raw.indexOf("?");
    if (qIdx < 0) return { path: raw, query: {} };
    const path = raw.slice(0, qIdx);
    const queryStr = raw.slice(qIdx + 1);
    const query = {};
    queryStr.split("&").forEach(function (pair) {
      if (!pair) return;
      const eq = pair.indexOf("=");
      const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      const v = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1));
      if (k) query[k] = v;
    });
    return { path: path, query: query };
  }

  async function router() {
    const parsed = splitHashAndQuery(location.hash || "#/");
    const path = parsed.path;
    const query = parsed.query;

    const elementMatch = path.match(/^#\/narrative\/([^/]+)\/element\/([^/]+)$/);
    if (elementMatch) {
      const narrativeID = decodeURIComponent(elementMatch[1]);
      if (query.skin) {
        // Skin override on an element URL — resolve skin at narrative level
        const skinID = await _resolveSkinForNarrative(narrativeID, query.skin);
        await _renderWithSkin(narrativeID, skinID);
      } else {
        renderNarrativeElement(narrativeID, decodeURIComponent(elementMatch[2]), query.highlight || "");
      }
      return;
    }
    const narrativeMatch = path.match(/^#\/narrative\/([^/]+)$/);
    if (narrativeMatch) {
      const narrativeID = decodeURIComponent(narrativeMatch[1]);
      const skinID = await _resolveSkinForNarrative(narrativeID, query.skin || "");
      await _renderWithSkin(narrativeID, skinID);
      return;
    }
    const match = path.match(/^#\/concept\/([^/]+)$/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      const slug  = resolveConceptSlug(token) || token; // accepts C051 or infancia-algoritmica
      renderConcept(slug, query.skin || "");
      return;
    }
    appStore.currentConceptSlug = null; renderHero();
  }

  // ── Sobre dialog ────────────────────────────────────────────────────
  function openSobre() {
    var sobreDialog = document.getElementById("sobreDialog");
    if (!sobreDialog || typeof sobreDialog.showModal !== "function") return;
    // Apply theme colours as inline styles so they win over the browser's
    // UA default (which forces Canvas / white on <dialog> elements).
    var rs = getComputedStyle(document.documentElement);
    sobreDialog.style.background = rs.getPropertyValue("--paper").trim() || "#080b0e";
    sobreDialog.style.color      = rs.getPropertyValue("--ink").trim()   || "#e8e4e0";
    var bodyEl = document.getElementById("sobreBody");
    if (bodyEl) {
      var html = t("sobre.body", "");
      bodyEl.innerHTML = html;
    }
    var titleEl = document.getElementById("sobreDialogTitle");
    if (titleEl) {
      var title = t("sobre.title", null);
      if (title !== null) titleEl.textContent = title;
    }
    sobreDialog.showModal();
  }

  function installGlobalHandlers() {
    const historyBtn = $("#historyBtn");
    const backBtn = $("#backBtn");
    const saveHistoryBtn = $("#saveHistoryBtn");
    const clearHistoryBtn = $("#clearHistoryBtn");
    const historyDialog = $("#historyDialog");
    const historyList = $("#historyList");
    const helpBtn = $("#helpBtn");
    const helpDialog = $("#helpDialog");
    const sobreDialog = $("#sobreDialog");
    const sobreBtn = $("#sobreBtn");
    const sobreCloseBtn = $("#sobreCloseBtn");
    const brandLogoBtn = $("#brandLogoBtn");
    const narrativeImportDialog = $("#narrativeImportDialog");

    // Sobre button + logo → open panel
    if (sobreBtn) sobreBtn.addEventListener("click", openSobre);
    if (brandLogoBtn) brandLogoBtn.addEventListener("click", openSobre);
    if (sobreCloseBtn) sobreCloseBtn.addEventListener("click", function() {
      if (sobreDialog) sobreDialog.close();
    });
    if (sobreDialog) {
      sobreDialog.addEventListener("click", function(e) {
        if (e.target === sobreDialog) sobreDialog.close();
      });
    }
    const browseNarrativesBtn = $("#browseNarrativesBtn");
    const narrativesFileInput = $("#narrativesFileInput");
    const selectedNarrativesFile = $("#selectedNarrativesFile");
    const narrativeImportStatus = $("#narrativeImportStatus");
    const clearNarrativesBtn = $("#clearNarrativesBtn");



    function openNarrativeImportDialog() {
      if (narrativeImportDialog && typeof narrativeImportDialog.showModal === "function") narrativeImportDialog.showModal();
      else alert("Importe uma planilha XLSX com as abas Narratives e Elements.");
    }

    document.addEventListener("click", function (event) {
      const button = event.target && event.target.closest ? event.target.closest(".open-narrative-import") : null;
      if (button) {
        event.preventDefault();
        openNarrativeImportDialog();
      }
    });

    if (browseNarrativesBtn && narrativesFileInput) {
      browseNarrativesBtn.addEventListener("click", function () {
        if (selectedNarrativesFile) selectedNarrativesFile.textContent = "Aguardando seleção do arquivo de narrativas...";
        setStatus(narrativeImportStatus, "Abrindo seletor de arquivo de narrativas...", false);
        narrativesFileInput.value = "";
        narrativesFileInput.click();
      });
    }

    if (narrativesFileInput) {
      narrativesFileInput.addEventListener("change", async function () {
        const file = narrativesFileInput.files && narrativesFileInput.files[0];
        if (!file) {
          setStatus(narrativeImportStatus, "Nenhum arquivo de narrativas foi selecionado.", true);
          if (selectedNarrativesFile) selectedNarrativesFile.textContent = "Nenhum arquivo de narrativas selecionado.";
          return;
        }
        try {
          if (selectedNarrativesFile) selectedNarrativesFile.textContent = "Selecionado: " + file.name;
          setStatus(narrativeImportStatus, "Lendo narrativas...", false);
          const buffer = await loadFileAsArrayBuffer(file);
          const imported = await parseNarrativesWorkbook(buffer);
          saveStoredNarratives(imported);
          if (imported.templates && Object.keys(imported.templates).length) saveStoredTemplates(imported.templates);
          if (imported.narrativeSkins && Object.keys(imported.narrativeSkins).length) saveStoredNarrativeSkins(imported.narrativeSkins);
          setStatus(narrativeImportStatus, "Narrativas importadas: " + imported.order.length + ".", false);
          router();
        } catch (err) {
          console.error(err);
          setStatus(narrativeImportStatus, formatCsvImportError(err, { filename: file.name }), true);
        }
      });
    }

    if (clearNarrativesBtn) {
      clearNarrativesBtn.addEventListener("click", function () {
        saveStoredNarratives({ byId: {}, order: [], elementsById: {}, loadedAt: "" });
        setStatus(narrativeImportStatus, "Narrativas removidas do navegador.", false);
        router();
      });
    }

    if (helpBtn) {
      helpBtn.addEventListener("click", function () {
        loadHelpConfig().then(function () {
          renderHelpContent();
          applyTooltips(document);
          if (helpDialog && typeof helpDialog.showModal === "function") helpDialog.showModal();
          else alert((appStore.helpConfig.instructions && appStore.helpConfig.instructions.title ? appStore.helpConfig.instructions.title + "\n\n" : "") + (appStore.helpConfig.instructions && appStore.helpConfig.instructions.intro ? appStore.helpConfig.instructions.intro : "Ajuda não disponível."));
        });
      });
    }

    if (historyBtn) {
      historyBtn.addEventListener("click", function () {
        const history = getHistory();
        if (!history.length) historyList.innerHTML = "<p>Nenhum conceito visitado ainda.</p>";
        else {
          historyList.innerHTML = "";
          history.slice().reverse().forEach(function (item) {
            const row = document.createElement("div");
            row.className = "history-item";
            const date = new Date(item.visitedAt);
            row.innerHTML = '<a href="' + conceptUrl(item.slug) + '">' + escapeHTML(item.concept) + '</a><span>' + date.toLocaleString() + '</span>';
            historyList.appendChild(row);
          });
        }
        if (historyDialog && typeof historyDialog.showModal === "function") historyDialog.showModal();
        else alert(history.map(function (h) { return h.concept; }).join("\n") || "Nenhum conceito visitado ainda.");
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        const previous = getPreviousConcept();
        if (previous && appStore.graph && appStore.graph.bySlug && appStore.graph.bySlug[previous]) location.hash = conceptUrl(previous);
        else history.back();
      });
    }

    if (saveHistoryBtn) {
      saveHistoryBtn.addEventListener("click", function () {
        const blob = new Blob([JSON.stringify(getHistory(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: "concept-history-" + new Date().toISOString().slice(0, 10) + ".json" });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener("click", function () {
        setHistory([]);
        historyList.innerHTML = "<p>Histórico limpo.</p>";
      });
    }
  }

  function showFatalError(message, error) {
    const app = $("#app");
    if (!app) return;
    app.innerHTML = '<section class="hero"><div class="hero-card"><p class="eyebrow">Erro de inicialização</p><h1>O site não conseguiu iniciar</h1><div class="error-box"><strong>Problema:</strong> ' + escapeHTML(message) + '<br><strong>Como corrigir:</strong> Recarregue a página. Se continuar, abra o Console do navegador, copie o erro e verifique se os arquivos index.html, app.js e default.css estão na mesma pasta.<br><br><code>' + escapeHTML(error && (error.stack || error.message || error)) + '</code></div></div></section>';
  }

  // Apply a parsed result object (from JSON or XLSX) to the app stores.
  function applyParsedResult(result, usedPath) {
    const lsk = localeSK(getLocale());
    appStore.graph = buildGraph(result.rows);
    saveStoredGraph(appStore.graph, lsk.data);
    try { localStorage.setItem(STORAGE_SOURCE_LABEL_KEY, usedPath); } catch (e) {}
    if (result.siteConfig && Object.keys(result.siteConfig).length) {
      try { localStorage.setItem('conceptGraph.siteConfig.v1', JSON.stringify(result.siteConfig)); } catch (e) {}
    }
    saveStoredMedia(result.media || {}, lsk.media);
    saveStoredTemplates(result.templates || {}, lsk.templates);
    saveStoredNarrativeSkins(result.narrativeSkins || {}, lsk.skins);
    saveStoredConceptSkins(result.conceptSkins || {}, lsk.conceptSkins);
    saveStoredConceptTexts(result.conceptTexts || {}, lsk.conceptTexts);
    saveStoredSkinData(result.skinData || {}, lsk.skinData);
    if (result.narratives && result.narratives.order && result.narratives.order.length) {
      saveStoredNarratives(result.narratives, lsk.narratives);
    }
  }

  // Try to load data/graph.json (fast path — no SheetJS parsing needed).
  // In local dev (python http.server) also checks XLSX Last-Modified header;
  // if XLSX is newer the JSON is stale and we fall back to XLSX.
  // Returns true on success, false if JSON is absent or stale.
  async function tryLoadFromJson() {
    const jsonPath = "data/graph.json";
    try {
      const res = await fetch(jsonPath, { cache: "no-store" });
      if (!res.ok) return false;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.startsWith("text/html")) return false; // SPA rewrite
      const result = await res.json();
      if (!result || !Array.isArray(result.rows) || !result.rows.length) return false;

      // Dev-mode staleness check: compare _xlsxMtime in JSON vs XLSX Last-Modified header.
      // Only runs when XLSX is also served locally (python http.server returns Last-Modified).
      if (result._xlsxMtime) {
        try {
          const xlsxRes = await fetch("data/conceptual_graph.xlsx", { method: "HEAD", cache: "no-store" });
          const xlsxCt = (xlsxRes.headers.get("content-type") || "").toLowerCase();
          if (xlsxRes.ok && !xlsxCt.startsWith("text/html")) { // ignore SPA rewrites
            const xlsxLastMod = xlsxRes.headers.get("Last-Modified");
            if (xlsxLastMod) {
              const xlsxDate = new Date(xlsxLastMod);
              const jsonDate = new Date(result._xlsxMtime);
              if (xlsxDate > jsonDate) {
                console.warn("[arc21] graph.json is stale (XLSX newer by " +
                  Math.round((xlsxDate - jsonDate) / 1000) + "s) — falling back to XLSX parse.");
                return false;
              }
            }
          }
        } catch (_) { /* HEAD failed — treat JSON as current */ }
      }

      applyParsedResult(result, jsonPath);
      console.info("[arc21] Loaded from graph.json (_generated: " + (result._generated || "?") + ")");
      return true;
    } catch (err) {
      console.warn("[arc21] graph.json load failed:", err);
      return false;
    }
  }

  // Try to load the bundled conceptual_graph.xlsx at startup.
  // Silent on failure (e.g. file:// protocol, missing file).
  async function tryAutoloadDefaultData() {
    if (location.protocol === "file:") return false;
    // Fast path: pre-converted JSON (no SheetJS overhead, smaller download).
    if (await tryLoadFromJson()) return true;
    // Fallback: parse XLSX directly. Also fires when JSON is stale (dev mode).
    const paths = graphPaths(getLocale());
    let buffer = null;
    let usedPath = null;
    for (let i = 0; i < paths.length; i++) {
      try {
        const res = await fetch(paths[i], { cache: "no-store" });
        if (!res.ok) continue;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.startsWith("text/html")) continue; // SPA rewrite — not a real file
        buffer = await res.arrayBuffer();
        usedPath = paths[i];
        break;
      } catch (_) {}
    }
    if (!buffer) return false;
    try {
      const _idx = await loadSkinIndex();
      const _sc = (_idx && _idx.skins || []).map(function (s) { return s.dataContract; }).filter(Boolean);
      const result = await parseCombinedWorkbook(buffer, { skinContracts: _sc });
      applyParsedResult(result, usedPath);
      return true;
    } catch (err) {
      console.warn("Autoload de " + usedPath + " falhou:", err);
      return false;
    }
  }

  // =========================================================
  //  Locale switcher
  // =========================================================
  function installLocaleSelect() {
    const sel = document.getElementById("topLocaleSelect");
    if (!sel) return;
    // Switcher is hidden when there is only one supported locale.
    if (SUPPORTED_LOCALES.length <= 1) {
      sel.style.display = "none";
      return;
    }
    sel.style.display = "";
    SUPPORTED_LOCALES.forEach(function (loc) {
      const opt = document.createElement("option");
      opt.value = loc.code;
      opt.textContent = loc.label;
      sel.appendChild(opt);
    });
    sel.value = getLocale();
    sel.addEventListener("change", async function () {
      const newCode = sel.value;
      if (!setLocale(newCode)) return; // unchanged or unsupported
      // Swap in-memory state to locale-scoped cached data (may be null).
      const lsk = localeSK(newCode);
      appStore.graph               = loadStoredGraph(lsk.data);
      appStore.narrativeStore      = loadStoredNarratives(lsk.narratives);
      appStore.mediaStore          = loadStoredMedia(lsk.media);
      appStore.templatesStore      = loadStoredTemplates(lsk.templates);
      appStore.narrativeSkinsStore = loadStoredNarrativeSkins(lsk.skins);
      appStore.conceptSkinsStore   = loadStoredConceptSkins(lsk.conceptSkins);
      appStore.conceptTextsStore   = loadStoredConceptTexts(lsk.conceptTexts);
      appStore.skinDataStore       = loadStoredSkinData(lsk.skinData);
      // Load UI strings and graph data for the new locale in parallel.
      await Promise.all([
        loadUiStrings(newCode),
        (appStore.graph && appStore.graph.order && appStore.graph.order.length)
          ? Promise.resolve()
          : tryAutoloadDefaultData()
      ]);
      applyI18n(document);
      router();
    });
  }

  function installChangeSourceButton() {
    const btn = $("#changeSourceBtn");
    const inp = $("#changeSourceFileInput");
    if (!btn || !inp) return;
    btn.addEventListener("click", function () { inp.value = ""; inp.click(); });
    // Delegated: any element with .open-change-source class triggers the same flow.
    document.addEventListener("click", function (event) {
      const target = event.target && event.target.closest ? event.target.closest(".open-change-source") : null;
      if (!target) return;
      event.preventDefault();
      inp.value = "";
      inp.click();
    });
    inp.addEventListener("change", async function () {
      const file = inp.files && inp.files[0];
      if (!file) return;
      try {
        const _clsk = localeSK(getLocale());
        if (isSpreadsheetName(file.name)) {
          const buffer = await new Promise(function (resolve, reject) {
            const r = new FileReader();
            r.onerror = function () { reject(r.error); };
            r.onload = function () { resolve(r.result); };
            r.readAsArrayBuffer(file);
          });
          const _idx2 = await loadSkinIndex();
          const _sc2 = (_idx2 && _idx2.skins || []).map(function (s) { return s.dataContract; }).filter(Boolean);
          const result = await parseCombinedWorkbook(buffer, { skinContracts: _sc2 });
          appStore.graph = buildGraph(result.rows);
          saveStoredGraph(appStore.graph, _clsk.data);
          try { localStorage.setItem(STORAGE_SOURCE_LABEL_KEY, file.name); } catch (e) {}
          saveStoredMedia(result.media || {}, _clsk.media);
          saveStoredTemplates(result.templates || {}, _clsk.templates);
          saveStoredNarrativeSkins(result.narrativeSkins || {}, _clsk.skins);
          saveStoredConceptSkins(result.conceptSkins || {}, _clsk.conceptSkins);
          saveStoredConceptTexts(result.conceptTexts || {}, _clsk.conceptTexts);
          saveStoredSkinData(result.skinData || {}, _clsk.skinData);
          if (result.narratives && result.narratives.order && result.narratives.order.length) {
            saveStoredNarratives(result.narratives, _clsk.narratives);
          }
        } else {
          const text = await new Promise(function (resolve, reject) {
            const r = new FileReader();
            r.onerror = function () { reject(r.error); };
            r.onload = function () { resolve(String(r.result || "")); };
            r.readAsText(file, "UTF-8");
          });
          const rows = parseCSV(text);
          appStore.graph = buildGraph(rows);
          saveStoredGraph(appStore.graph, _clsk.data);
          try { localStorage.setItem(STORAGE_SOURCE_LABEL_KEY, file.name); } catch (e) {}
        }
        location.hash = "#/";
        router();
      } catch (err) {
        console.error(err);
        alert("N\u00e3o foi poss\u00edvel carregar o arquivo: " + (err && err.message ? err.message : err));
      }
    });
  }

  // When the site is opened as a local file (file://), the bundled XLSX
  // cannot be fetched. Nudge the user into picking the file straight away.
  function promptForDataFile() {
    // Open the loader card so the file picker is visible.
    const loaderCard = $("#heroLoaderCard");
    if (loaderCard) loaderCard.open = true;

    const dataStatus = $("#dataStatus");
    if (dataStatus) {
      setStatus(dataStatus,
        'Voc\u00ea abriu o site como arquivo local. Selecione <code>conceptual_graph.xlsx</code> para come\u00e7ar. Para evitar este passo, sirva a pasta com um servidor local, por exemplo: <code>python3 -m http.server</code>.',
        false);
    }

    // Try to pop the file dialog directly. Most browsers allow this
    // when the page hasn't received any user interaction yet, but if
    // it gets blocked the visible buttons still work.
    const inp = $("#changeSourceFileInput");
    if (inp) {
      try { inp.value = ""; inp.click(); } catch (e) { /* blocked: ignore */ }
    }
  }

  window.addEventListener("error", function (event) {
    console.error(event.error || event.message);
    showFatalError(event.message || "Erro não identificado.", event.error);
  });

  window.addEventListener("unhandledrejection", function (event) {
    console.error(event.reason);
    showFatalError("Promessa rejeitada sem tratamento.", event.reason);
  });

  function _populateSkinSelects(index) {
    if (!index || !index.skins) return;
    var narrativeSkins = index.skins.filter(function (s) { return s.scope && s.scope.indexOf("narrative") >= 0; });
    var optionsHtml = narrativeSkins.map(function (s) {
      return '<option value="' + escapeAttr(s.id) + '">' + escapeHTML(s.name) + '</option>';
    }).join("");
    ["nSkinSelect", "topSkinSelect"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = optionsHtml;
    });
  }

  try {
    loadHelpConfig();
    installNarrativeOverlay();
    installGlobalHandlers();
    installLocaleSelect();
    installChangeSourceButton();
    loadSkinIndex().then(_populateSkinSelects);
    window.addEventListener("hashchange", router);
    Promise.all([loadUiStrings(getLocale()), tryAutoloadDefaultData()]).then(function () {
      applyI18n(document);
      router();
    });
  } catch (err) {
    console.error(err);
    showFatalError("Erro ao inicializar a aplicação.", err);
  }
})();
