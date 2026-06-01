/**
 * skins/scrolly-staged/scrolly-staged.js
 *
 * Sticky-stage scrollytelling skin.
 *
 * A full-viewport stage holds up to 11 PNG/SVG layers composited with
 * mix-blend-mode. As the user scrolls through scenes (one per narrative
 * element), layer opacities and transforms interpolate between per-scene
 * keyframe states. A canvas overlay adds ambient particles and effects.
 * Text pane-cards scroll over the stage, one per scene.
 *
 * Usage — narrative skin:
 *   render(narrativeID, skinParams)
 *
 * Usage — concept skin (via Concept Skins sheet):
 *   render(conceptSlug, { dataSourceID: "N004", ... })
 *
 * Asset slots  (loadSkinAssets "narrative" scope, folder assets/skins/<NID>/):
 *   1 – 11   Layer images in LAYER_NAMES order.
 *            Accepted formats: jpg, jpeg, png, webp, gif, svg.
 *            Alternatively list named paths in urls.txt inside that folder.
 *
 * Default scene choreography is the N004 / C051 arrangement (3 elements).
 * For narratives with a different element count a simple linear interpolation
 * is used instead of the staged per-layer sequencing.
 */

import { slugify }                         from "../../js/utils.js?v=6";
import { conceptUrl, resolveConceptSlug }  from "../../js/graph/navigation.js?v=6";
import { loadSkinAssets }                  from "../../js/skin/loader.js?v=6";

export function createScrollyStagedSkin(ctx) {

  // ── Layer order — matches asset slots 1–11 ────────────────────────────────
  const LAYER_NAMES = [
    "baseRoom",           // slot  1  — background scene image
    "softInterfaceDust",  // slot  2
    "recommendationHalo", // slot  3
    "gestureDataTrails",  // slot  4
    "archiveTileCloud",   // slot  5
    "cameraFrameOverlay", // slot  6
    "digitalDouble",      // slot  7
    "metadataDots",       // slot  8
    "privacyMembrane",    // slot  9
    "consentGap",         // slot 10
    "innerDrawings",      // slot 11
  ];

  // ── Keyframe opacity maps ─────────────────────────────────────────────────
  // introState: the visual state before the first scene begins.
  const INTRO_STATE = {
    baseRoom:1.00, softInterfaceDust:0, recommendationHalo:0,
    gestureDataTrails:0, archiveTileCloud:0, cameraFrameOverlay:0,
    digitalDouble:0, metadataDots:0, privacyMembrane:0,
    consentGap:0, innerDrawings:0,
  };

  // Per-scene opacity targets (N004 choreography, scenes 0–2).
  const SCENE_STATES = [
    { // scene 0 — E024: plataformização
      baseRoom:0.95, softInterfaceDust:0.60, recommendationHalo:0.90,
      gestureDataTrails:0.80, archiveTileCloud:0, cameraFrameOverlay:0,
      digitalDouble:0, metadataDots:0.12, privacyMembrane:0,
      consentGap:0, innerDrawings:0,
    },
    { // scene 1 — E025: exposição e arquivo
      baseRoom:0.75, softInterfaceDust:0.45, recommendationHalo:0,
      gestureDataTrails:0.35, archiveTileCloud:0.85, cameraFrameOverlay:1.00,
      digitalDouble:0.75, metadataDots:0.85, privacyMembrane:0.95,
      consentGap:0.20, innerDrawings:0,
    },
    { // scene 2 — E026: privacidade e construção subjetiva
      baseRoom:0.65, softInterfaceDust:0, recommendationHalo:0,
      gestureDataTrails:0, archiveTileCloud:0, cameraFrameOverlay:0,
      digitalDouble:0, metadataDots:0, privacyMembrane:0,
      consentGap:0, innerDrawings:0.50,
    },
  ];

  // ── Keyframe transform maps ───────────────────────────────────────────────
  // Each entry: { scale, x (px), y (px), blur (px), brightness, saturation }
  const INTRO_TRANSFORMS = {
    baseRoom:          { scale:1.01,  x:0,   y:0,   blur:0,   brightness:1.02, saturation:1.05 },
    softInterfaceDust: { scale:0.50,  x:0,   y:0,   blur:0,   brightness:1.1,  saturation:1.1  },
    recommendationHalo:{ scale:0.50,  x:20,  y:-6,  blur:0,   brightness:1.08, saturation:1.1  },
    gestureDataTrails: { scale:0.50,  x:0,   y:0,   blur:0,   brightness:1.1,  saturation:1.05 },
    archiveTileCloud:  { scale:0.80,  x:24,  y:-18, blur:1.5, brightness:0.9,  saturation:0.85 },
    cameraFrameOverlay:{ scale:1.02,  x:0,   y:0,   blur:0,   brightness:0.95, saturation:1    },
    digitalDouble:     { scale:0.55,  x:90,  y:18,  blur:2.5, brightness:0.85, saturation:0.8  },
    metadataDots:      { scale:1.01,  x:0,   y:0,   blur:0,   brightness:1.0,  saturation:1    },
    privacyMembrane:   { scale:0.88,  x:95,  y:8,   blur:1.5, brightness:0.8,  saturation:0.7  },
    consentGap:        { scale:0.90,  x:10,  y:12,  blur:1.2, brightness:0.85, saturation:0.8  },
    innerDrawings:     { scale:0.50,  x:0,   y:0,   blur:0.4, brightness:1.0,  saturation:0.85 },
  };

  const SCENE_TRANSFORMS = [
    { // scene 0
      baseRoom:          { scale:1.015, x:0,   y:0,   blur:0,   brightness:1.02, saturation:1.05 },
      softInterfaceDust: { scale:0.50,  x:0,   y:0,   blur:0,   brightness:1.1,  saturation:1.1  },
      recommendationHalo:{ scale:0.50,  x:20,  y:-6,  blur:0,   brightness:1.08, saturation:1.1  },
      gestureDataTrails: { scale:0.50,  x:0,   y:0,   blur:0,   brightness:1.1,  saturation:1.05 },
      archiveTileCloud:  { scale:0.80,  x:24,  y:-18, blur:1.5, brightness:0.9,  saturation:0.85 },
      cameraFrameOverlay:{ scale:1.02,  x:0,   y:0,   blur:0,   brightness:0.95, saturation:1    },
      digitalDouble:     { scale:0.55,  x:90,  y:18,  blur:2.5, brightness:0.85, saturation:0.8  },
      metadataDots:      { scale:1.01,  x:0,   y:0,   blur:0,   brightness:1.0,  saturation:1    },
      privacyMembrane:   { scale:0.88,  x:95,  y:8,   blur:1.5, brightness:0.8,  saturation:0.7  },
      consentGap:        { scale:0.90,  x:10,  y:12,  blur:1.2, brightness:0.85, saturation:0.8  },
      innerDrawings:     { scale:0.50,  x:0,   y:0,   blur:0.4, brightness:1.0,  saturation:0.85 },
    },
    { // scene 1
      baseRoom:          { scale:1.04,  x:-6,  y:0,   blur:0.4, brightness:0.82, saturation:0.88 },
      softInterfaceDust: { scale:0.50,  x:-8,  y:8,   blur:0,   brightness:1.0,  saturation:0.96 },
      recommendationHalo:{ scale:0.50,  x:30,  y:-18, blur:1.6, brightness:0.86, saturation:0.8  },
      gestureDataTrails: { scale:0.50,  x:0,   y:-2,  blur:0.4, brightness:0.9,  saturation:0.88 },
      archiveTileCloud:  { scale:0.80,  x:0,   y:-8,  blur:0,   brightness:1.08, saturation:1.05 },
      cameraFrameOverlay:{ scale:1.01,  x:0,   y:0,   blur:0,   brightness:1.8,  saturation:1.35 },
      digitalDouble:     { scale:0.55,  x:95,  y:0,   blur:0.2, brightness:1.22, saturation:1.08 },
      metadataDots:      { scale:1.00,  x:0,   y:0,   blur:0,   brightness:1.14, saturation:1.1  },
      privacyMembrane:   { scale:0.92,  x:95,  y:0,   blur:0.2, brightness:1.25, saturation:1.05 },
      consentGap:        { scale:0.96,  x:8,   y:4,   blur:0.8, brightness:0.9,  saturation:0.84 },
      innerDrawings:     { scale:0.50,  x:0,   y:0,   blur:1.6, brightness:0.75, saturation:0.6  },
    },
    { // scene 2
      baseRoom:          { scale:1.055, x:-10, y:2,   blur:0.6, brightness:0.72, saturation:0.72 },
      softInterfaceDust: { scale:0.50,  x:-12, y:12,  blur:0.6, brightness:0.75, saturation:0.75 },
      recommendationHalo:{ scale:0.50,  x:40,  y:-24, blur:3.0, brightness:0.68, saturation:0.6  },
      gestureDataTrails: { scale:0.50,  x:0,   y:4,   blur:1.2, brightness:0.7,  saturation:0.66 },
      archiveTileCloud:  { scale:0.80,  x:8,   y:-12, blur:1.0, brightness:0.72, saturation:0.7  },
      cameraFrameOverlay:{ scale:1.02,  x:0,   y:0,   blur:0.6, brightness:0.72, saturation:0.8  },
      digitalDouble:     { scale:0.55,  x:95,  y:4,   blur:1.4, brightness:0.72, saturation:0.72 },
      metadataDots:      { scale:1.02,  x:0,   y:0,   blur:0.2, brightness:0.92, saturation:0.86 },
      privacyMembrane:   { scale:1.02,  x:95,  y:4,   blur:0,   brightness:1.16, saturation:1.05 },
      consentGap:        { scale:1.00,  x:0,   y:0,   blur:0,   brightness:1.08, saturation:0.92 },
      innerDrawings:     { scale:0.50,  x:0,   y:0,   blur:0,   brightness:1.45, saturation:1.05 },
    },
  ];

  // ── Math helpers ──────────────────────────────────────────────────────────
  function clamp(v, lo, hi) {
    lo = lo === undefined ? 0 : lo;
    hi = hi === undefined ? 1 : hi;
    return Math.max(lo, Math.min(hi, v));
  }
  function lerp(a, b, t)    { return a + (b - a) * t; }
  function smoothstep(t)    { t = clamp(t); return t * t * (3 - 2 * t); }
  function ramp(t, s, e)    { return smoothstep((t - s) / Math.max(0.0001, e - s)); }
  function stagedOp(t, fi, fe, fo, foe) { return clamp(ramp(t, fi, fe) * (1 - ramp(t, fo, foe))); }
  function mixObj(a, b, t) {
    var out = {};
    var keys = Object.keys(a || {}).concat(Object.keys(b || {}));
    keys.forEach(function (k) { if (!(k in out)) out[k] = lerp((a && a[k]) || 0, (b && b[k]) || 0, t); });
    return out;
  }

  // ── Text / wikilink builder ───────────────────────────────────────────────
  function escText(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function buildPaneBodyHTML(rawText) {
    return (rawText || "").split(/\n{2,}/).filter(Boolean).map(function (para) {
      var re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      var html = "", last = 0, m;
      while ((m = re.exec(para)) !== null) {
        if (m.index > last) html += escText(para.slice(last, m.index));
        var target = m[1].trim();
        var anchor = (m[2] || m[1]).trim();
        var slug   = resolveConceptSlug(slugify(target)) || slugify(target);
        html += '<a class="sst-wikilink" href="' + conceptUrl(slug) + '">' + escText(anchor) + '</a>';
        last = m.index + m[0].length;
      }
      html += escText(para.slice(last));
      return '<p>' + html + '</p>';
    }).join('');
  }

  // ── DOM skeleton ──────────────────────────────────────────────────────────
  function buildHTML(panes) {
    var layers = LAYER_NAMES.map(function (name) {
      return '<img class="sst-layer ' + name + '" data-layer="' + name + '" alt="" />';
    }).join('\n      ');

    var paneHtml = panes.map(function (p, i) {
      return (
        '<article class="sst-pane" data-index="' + i + '">' +
          '<div class="sst-pane-card">' +
            '<h2 class="sst-heading">' + escText(p.title) + '</h2>' +
            '<div class="sst-body">' + p.bodyHtml + '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    return (
      '<div class="sst-stage" aria-hidden="true">' +
        '<div class="sst-atmosphere"></div>' +
        layers +
        '<canvas id="sst-canvas"></canvas>' +
        '<div class="sst-vignette"></div>' +
      '</div>' +
      '<img class="sst-cta" id="sst-cta" alt="" />' +
      '<div class="sst-text-track" aria-label="Narrativa">' +
        paneHtml +
      '</div>'
    );
  }

  // ── Canvas helper ─────────────────────────────────────────────────────────
  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y); c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
  }

  // ── Engine factory ────────────────────────────────────────────────────────
  function createEngine(root, paneCount, layerEls) {
    var canvas  = root.querySelector("#sst-canvas");
    var c       = canvas.getContext("2d");
    var panes   = Array.from(root.querySelectorAll(".sst-pane"));
    var prefersRM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Full N004 choreography only when the narrative has exactly 3 elements.
    var fullChoreography = (paneCount === SCENE_STATES.length);
    var maxSceneIdx      = Math.min(paneCount, SCENE_STATES.length) - 1;

    var width = 0, height = 0, dpr = 1;
    var particles = [], frame = 0;
    var currentState = {};

    function resize() {
      dpr    = Math.min(window.devicePixelRatio || 1, 2);
      width  = window.innerWidth;
      height = window.innerHeight;
      canvas.width  = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width  = width  + "px";
      canvas.style.height = height + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    }

    function seedParticles() {
      var count = Math.round(clamp(width / 8, 90, 190));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,  y: Math.random() * height,
          vx:(Math.random()-0.5)*0.22, vy:(Math.random()-0.5)*0.22,
          r: Math.random()*1.8+0.35,  phase: Math.random()*Math.PI*2,
          kind: Math.random()<0.28 ? "metadata" : Math.random()<0.55 ? "dust" : "trace",
          alpha: Math.random()*0.55+0.16,
        });
      }
    }

    function activeSceneInfo() {
      var best = { dist: Infinity, i: 0, pane: panes[0], rect: panes[0] && panes[0].getBoundingClientRect() };
      panes.forEach(function (pane, i) {
        var rect   = pane.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var dist   = Math.abs(center - height / 2);
        if (dist < best.dist) best = { dist: dist, i: i, pane: pane, rect: rect };
      });
      var idx  = Number(best.pane.dataset.index || 0);
      var prog = best.rect ? clamp((height * 0.72 - best.rect.top) / (best.rect.height * 0.82)) : 0;
      return { idx: idx, pane: best.pane, progress: smoothstep(prog) };
    }

    function paneLocalProgress(pane) {
      if (!pane) return 0;
      var start = pane.offsetTop;
      var end   = start + pane.offsetHeight;
      return smoothstep(clamp((window.scrollY - start) / Math.max(1, end - start) / 0.67, 0, 1));
    }

    function computeInterpolated() {
      var info  = activeSceneInfo();
      var idx   = info.idx;
      var t     = paneLocalProgress(info.pane);
      var fromIdx, toIdx, fromState, toState, fromTr, toTr;

      if (idx === 0) {
        fromIdx = -1; toIdx = 0;
        fromState = INTRO_STATE;          toState = SCENE_STATES[0];
        fromTr    = INTRO_TRANSFORMS;     toTr    = SCENE_TRANSFORMS[0];
      } else {
        fromIdx = Math.min(idx - 1, maxSceneIdx);
        toIdx   = Math.min(idx,     maxSceneIdx);
        fromState = SCENE_STATES[fromIdx]; toState = SCENE_STATES[toIdx];
        fromTr    = SCENE_TRANSFORMS[fromIdx]; toTr = SCENE_TRANSFORMS[toIdx];
      }
      return { fromIdx: fromIdx, toIdx: toIdx, fromState: fromState, toState: toState, fromTr: fromTr, toTr: toTr, t: t, info: info };
    }

    function applyLayers(d) {
      var fromIdx = d.fromIdx, toIdx = d.toIdx, t = d.t;
      var fromS = d.fromState, toS = d.toState, fromTr = d.fromTr, toTr = d.toTr;
      currentState = {};

      LAYER_NAMES.forEach(function (name) {
        var opacity = lerp(fromS[name] || 0, toS[name] || 0, t);

        if (fullChoreography) {
          // ── Staged N004 transitions ──────────────────────────────────
          if (fromIdx === -1 && toIdx === 0) {
            // intro → scene 0: sequential reveal
            if (name === "softInterfaceDust")
              opacity = SCENE_STATES[0].softInterfaceDust * ramp(t, 0.02, 0.18);
            if (name === "recommendationHalo")
              opacity = SCENE_STATES[0].recommendationHalo * stagedOp(t, 0.14, 0.28, 0.42, 0.52);
            if (name === "gestureDataTrails")
              opacity = ramp(t, 0.58, 0.74) > 0.001 ? SCENE_STATES[0].gestureDataTrails : 0;
            if (["archiveTileCloud","cameraFrameOverlay","digitalDouble",
                 "privacyMembrane","consentGap","innerDrawings"].indexOf(name) >= 0)
              opacity = 0;
          }

          if (fromIdx === 0 && toIdx === 1) {
            // scene 0 → scene 1: featured layer sequence, one at a time
            if (name === "softInterfaceDust")  opacity *= (1 - ramp(t, 0.04, 0.18));
            if (name === "recommendationHalo") opacity  = 0;
            if (name === "gestureDataTrails")  opacity *= (1 - ramp(t, 0.03, 0.18));
            if (["consentGap","innerDrawings"].indexOf(name) >= 0) opacity = 0;
            if (name === "archiveTileCloud")
              opacity = SCENE_STATES[1].archiveTileCloud   * stagedOp(t, 0.06, 0.16, 0.27, 0.36);
            if (name === "cameraFrameOverlay")
              opacity = SCENE_STATES[1].cameraFrameOverlay * stagedOp(t, 0.36, 0.46, 0.56, 0.64);
            if (name === "metadataDots")
              opacity = SCENE_STATES[1].metadataDots       * stagedOp(t, 0.62, 0.70, 0.76, 0.82);
            if (name === "digitalDouble")  opacity = 1.00 * ramp(t, 0.80, 0.86);
            if (name === "privacyMembrane") opacity = 0.95 * ramp(t, 0.84, 0.90);
            if (name === "innerDrawings")  opacity = 0; // CTA only appears in scene 2
          }

          if (fromIdx === 1 && toIdx === 2) {
            // scene 1 → scene 2: previous layers exit, innerDrawings persists
            if (["archiveTileCloud","cameraFrameOverlay","metadataDots",
                 "softInterfaceDust","recommendationHalo",
                 "gestureDataTrails","consentGap"].indexOf(name) >= 0)
              opacity = 0;
            if (name === "digitalDouble")    opacity = 1.00 * (1 - ramp(t, 0.00, 0.16));
            if (name === "privacyMembrane")  opacity = 0.95 * (1 - ramp(t, 0.00, 0.16));
            if (name === "innerDrawings")    opacity = 0.50 * ramp(t, 0.00, 0.25); // fade in at scene 2 start
          }
        }

        // Base room fades on first scroll regardless of scene
        if (name === "baseRoom") {
          var fadeD = Math.max(80, height * 0.16);
          opacity = lerp(1.00, 0.80, ramp(window.scrollY, 0, fadeD));
        }

        currentState[name] = opacity;
        var el = layerEls[name];
        if (!el) return;

        var ta   = fromTr && fromTr[name] ? fromTr[name] : {};
        var tb   = toTr   && toTr[name]   ? toTr[name]   : {};
        var tr   = mixObj(ta, tb, t);
        var time = frame * 0.016;
        var fa   = layerFloat(name);
        var floatX = Math.sin(time * 0.35 + name.length)       * fa       * opacity;
        var floatY = Math.cos(time * 0.28 + name.length * 0.6) * fa * 0.45 * opacity;
        var pulse  = 1 + Math.sin(time * 0.65 + name.length)   * layerPulse(name) * opacity;
        var yOff   = name === "innerDrawings"  ? -height * 0.20 : 0;
        var xOff   = name === "gestureDataTrails" ? width * 0.35 :
                     name === "innerDrawings"     ? -width * 0.07 : 0;

        // Wipe (clip-path) reveal for gestureDataTrails in intro transition
        if (name === "gestureDataTrails" && fromIdx === -1 && toIdx === 0) {
          var wipe = ramp(t, 0.58, 0.74);
          el.style.clipPath = "inset(0 " + ((1 - wipe) * 100).toFixed(2) + "% 0 0)";
        } else {
          el.style.clipPath = "inset(0 0 0 0)";
        }

        el.style.opacity = opacity.toFixed(3);
        el.style.setProperty("--sst-x",    (xOff + (tr.x || 0) + floatX).toFixed(2) + "px");
        el.style.setProperty("--sst-y",    ((tr.y || 0) + floatY + yOff).toFixed(2) + "px");
        el.style.setProperty("--sst-scale",((tr.scale || 1) * pulse).toFixed(4));
        el.style.setProperty("--sst-blur", (tr.blur || 0).toFixed(2) + "px");
        el.style.setProperty("--sst-brightness", (tr.brightness || 1).toFixed(3));
        el.style.setProperty("--sst-saturation",  (tr.saturation  || 1).toFixed(3));
      });

      // Coldness drives stage desaturation / darkening as scenes progress
      var normFrom  = fromIdx < 0 ? 0 : fromIdx;
      var normTo    = toIdx   < 0 ? 0 : toIdx;
      var cold = maxSceneIdx > 0
        ? lerp(normFrom / maxSceneIdx, normTo / maxSceneIdx, t)
        : 0;
      document.documentElement.style.setProperty("--sst-coldness",          cold.toFixed(3));
      document.documentElement.style.setProperty("--sst-stage-brightness",  lerp(1.02, 0.88, cold).toFixed(3));
      document.documentElement.style.setProperty("--sst-stage-saturation",  lerp(1.06, 0.82, cold).toFixed(3));
    }

    function layerFloat(name) {
      if (name === "softInterfaceDust" || name === "metadataDots") return 9;
      if (name === "archiveTileCloud"  || name === "recommendationHalo" || name === "gestureDataTrails") return 5;
      if (name === "privacyMembrane"   || name === "innerDrawings" || name === "consentGap") return 3;
      return 1.5;
    }
    function layerPulse(name) {
      if (name === "privacyMembrane")    return 0.006;
      if (name === "recommendationHalo") return 0.005;
      if (name === "innerDrawings")      return 0.004;
      return 0.0015;
    }

    function updatePaneClasses(activePane) {
      panes.forEach(function (pane) {
        pane.classList.remove("active", "past", "future");
        var rect   = pane.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var vis    = smoothstep(1 - clamp(Math.abs(center - height / 2) / (height * 0.58)));
        var card   = pane.querySelector(".sst-pane-card");
        if (card) {
          card.style.setProperty("--sst-panel-bg-alpha", lerp(0.24, 1.00, vis).toFixed(3));
          card.style.setProperty("--sst-panel-opacity",  lerp(0.18, 1.00, vis).toFixed(3));
        }
        if (pane === activePane)           pane.classList.add("active");
        else if (rect.bottom < height*0.5) pane.classList.add("past");
        else                               pane.classList.add("future");
      });
    }

    // ── Canvas drawing ────────────────────────────────────────────────────
    function drawCanvas() {
      c.clearRect(0, 0, width, height);
      var st   = currentState;
      var time = frame * 0.016;
      var recoI = st.recommendationHalo || 0;
      var archI = st.archiveTileCloud   || 0;
      var camI  = st.cameraFrameOverlay || 0;
      var membI = st.privacyMembrane    || 0;
      var dustI = st.softInterfaceDust  || 0;
      var metaI = st.metadataDots       || 0;

      // Fallback ambient glow (visible before image assets are loaded)
      c.save();
      c.globalAlpha = Math.max(0.18, (st.baseRoom || 1) * 0.22);
      var grd = c.createRadialGradient(width*0.64, height*0.44, 10, width*0.64, height*0.44, width*0.62);
      grd.addColorStop(0,    "rgba(90,160,220,0.34)");
      grd.addColorStop(0.45, "rgba(18,38,74,0.20)");
      grd.addColorStop(1,    "rgba(0,0,0,0)");
      c.fillStyle = grd;
      c.fillRect(0, 0, width, height);
      c.globalAlpha = (st.baseRoom || 1) * 0.16;
      c.strokeStyle = "rgba(255,207,143,0.45)";
      c.lineWidth = 1;
      c.strokeRect(width*0.63, height*0.15, width*0.18, height*0.28);
      c.beginPath(); c.moveTo(width*0.08, height*0.78); c.lineTo(width*0.92, height*0.78); c.stroke();
      c.restore();

      // Particles
      particles.forEach(function (p) {
        var bias = recoI * 0.7 + archI * 0.45;
        var tx   = width  * (0.62 + Math.sin(p.phase) * 0.10);
        var ty   = height * (0.44 + Math.cos(p.phase) * 0.16);
        p.x += p.vx + (tx - p.x) * 0.0009 * bias;
        p.y += p.vy + (ty - p.y) * 0.0009 * bias;
        p.x += Math.sin(time * 0.3  + p.phase) * 0.08;
        p.y += Math.cos(time * 0.27 + p.phase) * 0.08;
        if (p.x < -20) p.x = width + 20; if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20; if (p.y > height + 20) p.y = -20;
        var al = p.alpha * (0.20 + dustI * 0.55 + metaI * 0.32);
        c.beginPath();
        c.fillStyle = "rgba(" + (p.kind === "metadata" ? "180,226,255" : "130,205,255") + "," + al + ")";
        c.arc(p.x, p.y, p.r * (1 + metaI * 0.5), 0, Math.PI * 2);
        c.fill();
      });

      if (recoI > 0.05) drawRecoOrbit(recoI, time);
      if (archI > 0.10) drawArchiveLinks(archI);
      if (camI  > 0.05) drawCameraFrames(camI, time);
      if (membI > 0.10) drawMembraneGlow(membI, time);
    }

    function drawRecoOrbit(intensity, time) {
      var cx = width * 0.62, cy = height * 0.43;
      c.save(); c.globalAlpha = intensity * 0.42;
      for (var i = 0; i < 9; i++) {
        var a = (i / 9) * Math.PI * 2 + time * 0.12;
        var x = cx + Math.cos(a) * width * 0.19;
        var y = cy + Math.sin(a) * height * 0.18;
        var w = 92 + Math.sin(a * 2) * 16;
        roundRect(c, x - w / 2, y - 21, w, 42, 13);
        c.strokeStyle = "rgba(150,225,255,0.34)"; c.lineWidth = 1; c.stroke();
        c.fillStyle   = "rgba(90,190,255,0.055)"; c.fill();
      }
      c.restore();
    }

    function drawArchiveLinks(intensity) {
      var rel = particles.filter(function (_, i) { return i % 5 === 0; }).slice(0, 26);
      c.save(); c.globalAlpha = intensity * 0.25;
      c.strokeStyle = "rgba(190,230,255,0.36)"; c.lineWidth = 1;
      for (var i = 0; i < rel.length - 1; i++) {
        var a = rel[i], b = rel[i + 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < width * 0.22) {
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      }
      c.restore();
    }

    function drawCameraFrames(intensity, time) {
      var frames = [
        {x:0.58,y:0.34,w:0.22,h:0.20}, {x:0.70,y:0.52,w:0.18,h:0.18},
        {x:0.48,y:0.55,w:0.15,h:0.22}, {x:0.77,y:0.25,w:0.13,h:0.14},
      ];
      c.save(); c.globalAlpha = Math.min(1, intensity) * 0.72;
      c.strokeStyle = "rgba(210,244,255,0.72)"; c.lineWidth = 1.35;
      c.shadowColor = "rgba(150,220,255,0.75)"; c.shadowBlur = 10;
      frames.forEach(function (f, i) {
        var cx2 = width * f.x  + Math.sin(time * 0.5  + i) * 4;
        var cy2 = height * f.y + Math.cos(time * 0.44 + i) * 3;
        var fw  = width * f.w  * (1 + Math.sin(time * 0.7 + i) * 0.012);
        var fh  = height * f.h * (1 + Math.cos(time * 0.6 + i) * 0.012);
        var px  = cx2 - fw / 2, py = cy2 - fh / 2;
        var l   = Math.min(fw, fh) * 0.22;
        c.beginPath();
        c.moveTo(px, py+l);    c.lineTo(px, py);       c.lineTo(px+l, py);
        c.moveTo(px+fw-l, py); c.lineTo(px+fw, py);    c.lineTo(px+fw, py+l);
        c.moveTo(px+fw, py+fh-l); c.lineTo(px+fw, py+fh); c.lineTo(px+fw-l, py+fh);
        c.moveTo(px+l, py+fh); c.lineTo(px, py+fh);    c.lineTo(px, py+fh-l);
        c.stroke();
      });
      c.restore();
    }

    function drawMembraneGlow(intensity, time) {
      var cx = width * 0.56, cy = height * 0.48;
      var r  = Math.min(width, height) * (0.18 + intensity * 0.16 + Math.sin(time * 1.1) * 0.006);
      c.save(); c.globalAlpha = intensity * 0.44;
      var g2 = c.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.05);
      g2.addColorStop(0,    "rgba(190,235,255,0.00)");
      g2.addColorStop(0.72, "rgba(180,230,255,0.035)");
      g2.addColorStop(1,    "rgba(185,235,255,0.18)");
      c.fillStyle = g2; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(215,245,255,0.42)"; c.lineWidth = 1.2; c.stroke();
      c.restore();
    }

    // ── RAF loop ──────────────────────────────────────────────────────────
    var rafID = 0;
    var egRevealed = false;

    function revealEG() {
      if (egRevealed) return;
      egRevealed = true;
      var panel = document.getElementById("eg-panel");
      if (panel) {
        panel.classList.remove("eg-hidden");
        panel.classList.remove("eg-minimized");
      }
      var ctaEl = root.querySelector("#sst-cta");
      if (ctaEl) ctaEl.classList.add("sst-cta-visible"); // src may still be loading; img is invisible without src anyway
    }

    function tick() {
      frame++;
      var d = computeInterpolated();
      applyLayers(d);
      updatePaneClasses(d.info.pane);
      if (!prefersRM) drawCanvas();
      // Reveal the Explore Graph once we're deep into the last scene
      if (!egRevealed && d.toIdx === maxSceneIdx && d.t >= 0.65) revealEG();
      rafID = requestAnimationFrame(tick);
    }

    function init() {
      resize();
      window.addEventListener("resize", resize, { passive: true });
      // Hide the EG panel while the staged skin is active
      var panel = document.getElementById("eg-panel");
      if (panel) panel.classList.add("eg-hidden");
      tick();
      return function cleanup() {
        cancelAnimationFrame(rafID);
        window.removeEventListener("resize", resize);
        document.documentElement.style.removeProperty("--sst-coldness");
        document.documentElement.style.removeProperty("--sst-stage-brightness");
        document.documentElement.style.removeProperty("--sst-stage-saturation");
        // Restore EG visibility on unmount
        var p = document.getElementById("eg-panel");
        if (p) p.classList.remove("eg-hidden");
      };
    }

    return { init: init };
  }

  // ── Font loading ──────────────────────────────────────────────────────────
  function ensureFonts() {
    if (document.querySelector("link[data-sst-fonts]")) return;
    var l = document.createElement("link");
    l.rel  = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=DM+Sans:wght@400;500;600;700&display=swap";
    l.setAttribute("data-sst-fonts", "");
    document.head.appendChild(l);
  }

  // ── Cleanup management ────────────────────────────────────────────────────
  var _cleanupFns = [];
  function cleanup() { _cleanupFns.forEach(function (fn) { fn(); }); _cleanupFns = []; }

  // ── Render ────────────────────────────────────────────────────────────────
  async function render(narrativeOrConceptID, skinParams) {
    cleanup();
    skinParams = skinParams || {};

    var narrativeID = (skinParams && skinParams.dataSourceID) || narrativeOrConceptID;
    var ns        = ctx.appStore && ctx.appStore.narrativeStore;
    var narrative = (ns && ns.byId && narrativeID) ? ns.byId[narrativeID] : null;

    var app = document.getElementById("app");
    if (!app) return;

    if (!narrative) {
      app.innerHTML =
        '<section class="hero"><div class="hero-card">' +
        '<p class="eyebrow">Skin não configurada</p>' +
        '<p>O skin <strong>scrolly-staged</strong> requer um narrativeID válido ' +
        '(defina <code>dataSourceID</code> na aba Concept Skins, ou navegue directamente pela URL da narrativa).</p>' +
        '</div></section>';
      return;
    }

    var elementIDs = narrative.elements || [];
    if (!elementIDs.length) return;

    // Build pane data from narrative elements
    var panes = elementIDs.map(function (eid, i) {
      var el = ns && ns.elementsById && ns.elementsById[eid];
      return {
        eyebrow:  narrativeID + " · " + (eid || String(i + 1)),
        title:    (el && el.elementTitle)   || "",
        bodyHtml: buildPaneBodyHTML((el && el.elementContent) || ""),
      };
    });

    ensureFonts();

    // Neutralise #app container constraints
    var _origStyles = {
      padding:  app.style.padding, maxWidth: app.style.maxWidth,
      width:    app.style.width,   margin:   app.style.margin,
    };
    app.style.padding = "0"; app.style.maxWidth = "100%";
    app.style.width   = "100%"; app.style.margin = "0";
    _cleanupFns.push(function () { Object.assign(app.style, _origStyles); });

    // Build DOM
    var topbarEl = document.querySelector(".topbar");
    var topH     = topbarEl ? topbarEl.offsetHeight : 0;
    var root     = document.createElement("div");
    root.className = "scrolly-staged-root";
    root.style.setProperty("--sst-top", topH + "px");
    root.style.minHeight = "calc(" + (panes.length * 150 + 100) + "vh)";
    root.innerHTML = buildHTML(panes);
    app.innerHTML  = "";
    app.appendChild(root);
    window.scrollTo(0, 0);

    // Collect layer elements (src will be set once assets load)
    var layerEls = {};
    LAYER_NAMES.forEach(function (name) {
      layerEls[name] = root.querySelector("img[data-layer=\"" + name + "\"]");
    });

    // Start engine
    var engine  = createEngine(root, panes.length, layerEls);
    _cleanupFns.push(engine.init());

    // Sidebar
    var _sidebarPane = null, _sidebarBackdrop = null, _sidebarTab = null;
    function _syncTab() { if (_sidebarTab) _sidebarTab.textContent = _sidebarPane ? "‹" : "›"; }
    function _closeSidebar() {
      if (_sidebarPane)     { _sidebarPane.remove();     _sidebarPane     = null; }
      if (_sidebarBackdrop) { _sidebarBackdrop.remove(); _sidebarBackdrop = null; }
      _syncTab();
    }
    function _openSidebar() {
      if (_sidebarPane) return;
      var _t   = ctx.t || function (k, fb) { return fb !== undefined ? fb : k; };
      var pane = document.createElement("aside");
      pane.className = "concept-index-pane sidebar-overlay";
      pane.setAttribute("aria-label", _t("sidebar.ariaLabel", "Índice de navegação"));
      pane.innerHTML =
        '<div class="sidebar-overlay-header">' +
          '<span>' + _t("sidebar.conceptIndex", "Índice de conceitos") + '</span>' +
          '<button class="sidebar-toggle-btn" type="button" aria-label="' +
            _t("sidebar.collapse.ariaLabel", "Recolher navegação") + '">‹</button>' +
        '</div>' +
        '<details class="sidebar-section concept-index-section">' +
          '<summary>' + _t("sidebar.conceptIndex", "Índice de conceitos") + '</summary>' +
          '<p>' + _t("sidebar.conceptIndexHint", "Selecione qualquer conceito do grafo.") + '</p>' +
          '<div id="conceptIndexList" class="concept-index-list"></div>' +
        '</details>' +
        '<details class="sidebar-section narrative-index-section" open>' +
          '<summary>' + _t("sidebar.narratives", "Narrativas") + '</summary>' +
          '<div id="narrativeList" class="narrative-list"></div>' +
        '</details>';
      if (ctx.renderConceptIndex) ctx.renderConceptIndex(pane, narrativeOrConceptID);
      pane.querySelector(".sidebar-toggle-btn").addEventListener("click", _closeSidebar);
      var bd = document.createElement("div");
      bd.className = "sidebar-backdrop";
      bd.addEventListener("click", _closeSidebar);
      document.body.appendChild(bd);
      document.body.appendChild(pane);
      _sidebarPane = pane; _sidebarBackdrop = bd;
      _syncTab();
    }
    var tab = document.createElement("button");
    tab.className = "skin-sidebar-tab";
    tab.setAttribute("type", "button");
    tab.setAttribute("aria-label", (ctx.t || function (k, fb) { return fb || k; })("sidebar.expand.ariaLabel", "Abrir índice"));
    tab.textContent = "›";
    tab.addEventListener("click", function () { _sidebarPane ? _closeSidebar() : _openSidebar(); });
    root.appendChild(tab);
    _sidebarTab = tab;
    _cleanupFns.push(_closeSidebar);

    // Load layer images in the background — engine works with placeholder state until then
    (async function () {
      try {
        var assets = await loadSkinAssets("narrative", narrativeID);
        LAYER_NAMES.forEach(function (name, i) {
          var url = assets[String(i + 1)];
          var el  = layerEls[name];
          if (url && el) el.src = url;
        });

        // "Para saber mais" widget — appears at the end (scene 2), above the stage.
        // Image file (more.jpg/png/…) → full-screen image overlay on click.
        // HTML file or external URL → iframe overlay (same as standard scrolly).
        var moreUrl = assets["more"] || "";
        if (moreUrl) {
          var isImage = /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(moreUrl);
          var ctaEl   = root.querySelector("#sst-cta");

          if (ctaEl) {
            ctaEl.src = moreUrl;
          }

          var overlay = document.createElement("div");
          overlay.className = "sst-more-overlay";
          overlay.hidden = true;
          overlay.innerHTML =
            '<div class="sst-more-bar">' +
              '<button class="sst-more-close" type="button" aria-label="Fechar">×</button>' +
            '</div>' +
            (isImage
              ? '<img class="sst-more-img" src="' + moreUrl + '" alt="">'
              : '<iframe class="sst-more-frame" src="" scrolling="yes" frameborder="0"></iframe>');
          document.body.appendChild(overlay);

          function openMore() {
            if (!isImage && overlay.querySelector("iframe").getAttribute("src") !== moreUrl) {
              overlay.querySelector("iframe").src = moreUrl;
            }
            overlay.hidden = false;
          }
          function closeMore() { overlay.hidden = true; }

          overlay.querySelector(".sst-more-close").addEventListener("click", closeMore);
          if (ctaEl) ctaEl.addEventListener("click", openMore);
          _cleanupFns.push(function () { overlay.remove(); });
        }
      } catch (_) {}
    })();
  }

  return { render: render };
}
