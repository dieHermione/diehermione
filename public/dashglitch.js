/* Ambient screen glitch for the dashboard and the login page.
 *
 * Six effects, all built out of overlays. The first is the original tear
 * bands; the rest are a second attempt after the earlier set was scrapped.
 * Nothing here puts a `filter` on the page content, and nothing transforms
 * .dash. Both rules matter:
 *   - `filter` on an ancestor makes position:fixed descendants position against
 *     that ancestor instead of the viewport, which would throw the console, the
 *     scanlines and the modals around every time an effect fired.
 *   - .dash carries the dashboard's scale-to-fit transform, and an animation
 *     ending in `transform: none` would wipe it.
 * The real page is disturbed with backdrop-filter on overlay elements instead,
 * which reaches the content underneath without touching its own styles.
 *
 * Both pages declare the same variable names (--c, --dim, --dim2, --bright,
 * --accent, --glow), so the palette effects only have to touch :root.
 *
 *   DashGlitch.effects            names, in order, for the admin dropdown
 *   DashGlitch.play(i)            run one effect by index
 *   DashGlitch.glitch()           run a random one
 *   DashGlitch.startRandom() / stopRandom()
 *   DashGlitch.setEnabled(bool)   false for photosensitive accounts
 *   DashGlitch.burst()              kept as a name for the console codes
 */
window.DashGlitch = (function () {
  "use strict";

  var RED = {
    "--c": "#ff6a58", "--dim": "#a33a30", "--dim2": "#70271f",
    "--bright": "#ffe4df", "--accent": "#ff7361", "--glow": "rgba(255,90,74,0.32)",
  };
  var MIN_GAP = 40 * 1000, MAX_GAP = 180 * 1000;

  var layer, styleInjected, noiseUrl = null, timers = [];
  var enabled = true, randomTimer = null, saved = null;

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".dg-layer{position:fixed;inset:0;z-index:95;pointer-events:none;overflow:hidden;}",
      ".dg-el{position:absolute;opacity:0;}",
      // bright horizontal tear
      ".dg-tear{left:0;right:0;backdrop-filter:brightness(2.2) saturate(0.2);-webkit-backdrop-filter:brightness(2.2) saturate(0.2);}",
      // retry set
      ".dg-drop{background:#000;}",
      ".dg-bloom{inset:0;backdrop-filter:brightness(2.6) saturate(0.4);-webkit-backdrop-filter:brightness(2.6) saturate(0.4);}",
      // crush draws nothing of its own: it swaps the palette variables, so only
      // things coloured from them (text, rules, borders, buttons) change and
      // the background is untouched. See crush() below.
      ".dg-crush{display:none}",
      ".dg-comb{inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.85) 0 2px,transparent 2px 4px);}",
      ".dg-edge{inset:0;box-shadow:inset 0 0 22vh 10vh rgba(0,0,0,0.92),inset 0 0 8vh 2vh rgba(0,172,219,0.6);}",
    ].join("");
    var s = document.createElement("style"); s.id = "dashglitch-style"; s.textContent = css;
    document.head.appendChild(s);
  }
  function ensure() {
    if (layer) return;
    injectStyle();
    layer = document.createElement("div");
    layer.className = "dg-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function el(cls, style) {
    var d = document.createElement("div");
    d.className = "dg-el " + cls;
    if (style) for (var k in style) d.style[k] = style[k];
    layer.appendChild(d);
    return d;
  }
  function flick(node, onAt, dur) {
    at(onAt, function () { node.style.opacity = node.dataset.peak || "1"; });
    at(onAt + dur, function () { node.style.opacity = "0"; });
  }
  function sweep(node, total) { at(total + 260, function () { node.remove(); }); }

  /* ---- palette ---- */
  function applyVars(map) {
    var root = document.documentElement;
    if (!saved) {
      saved = {};
      Object.keys(map).forEach(function (k) { saved[k] = root.style.getPropertyValue(k); });
    }
    Object.keys(map).forEach(function (k) { root.style.setProperty(k, map[k]); });
  }
  function restoreVars() {
    if (!saved) return;
    var root = document.documentElement;
    Object.keys(saved).forEach(function (k) {
      if (saved[k]) root.style.setProperty(k, saved[k]);
      else root.style.removeProperty(k);
    });
    saved = null;
  }

  /* ---- body offset (vertical hold). Only non-fixed content moves, which is
     exactly the page body; the overlays and scanlines stay put. ---- */
  var bodyShifted = false;
  function shiftBody(px) {
    if (!bodyShifted) { document.body.style.position = "relative"; bodyShifted = true; }
    document.body.style.top = px + "px";
  }
  function unshiftBody() {
    if (!bodyShifted) return;
    document.body.style.top = "";
    document.body.style.position = "";
    bodyShifted = false;
  }

  function noise() {
    if (noiseUrl) return noiseUrl;
    var c = document.createElement("canvas");
    c.width = c.height = 90;
    var g = c.getContext("2d");
    var img = g.createImageData(90, 90), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = Math.random() * 255;
      d[i] = v; d[i + 1] = v * 0.35; d[i + 2] = v * 0.3; d[i + 3] = Math.random() < 0.5 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    noiseUrl = c.toDataURL();
    return noiseUrl;
  }

  /* ---------------- the effects ---------------- */

  // 1. bright horizontal tears at random heights
  function tearBands() {
    var n = Math.round(rnd(4, 8)), t = 0;
    for (var i = 0; i < n; i++) {
      var b = el("dg-tear", { top: rnd(3, 93) + "%", height: rnd(2, 16) + "px" });
      flick(b, t, rnd(40, 110));
      sweep(b, t + 140);
      t += rnd(45, 120);
    }
    return t + 320;
  }

  // --- retry set. The palette/scan/chroma/hold/block/static/collapse batch was
  // scrapped; these work on a different principle: the page is punched out or
  // over-driven in place rather than shifted or recoloured. ---

  // 2. dropout: rectangles of signal simply vanish to black
  function dropout() {
    var n = Math.round(rnd(3, 7)), t = 0, made = [];
    for (var i = 0; i < n; i++) {
      var b = el("dg-drop", {
        left: rnd(0, 78) + "%", top: rnd(0, 82) + "%",
        width: rnd(8, 34) + "%", height: rnd(4, 22) + "%",
      });
      b.dataset.peak = "1";
      flick(b, t, rnd(40, 120));
      made.push(b);
      t += rnd(30, 110);
    }
    made.forEach(function (b) { sweep(b, t); });
    return t + 300;
  }

  // 3. bloom: the whole screen over-exposes for an instant
  function bloom() {
    var v = el("dg-bloom");
    v.dataset.peak = "1";
    var t = 0, hits = Math.round(rnd(2, 4));
    for (var i = 0; i < hits; i++) { flick(v, t, rnd(60, 130)); t += rnd(150, 380); }
    sweep(v, t);
    return t + 320;
  }

  /* 4. crush: the palette slams to a dark red and back, several times.
     This deliberately does NOT use an overlay. An overlay, backdrop-filter or
     otherwise, cannot avoid the background; swapping the variables the page
     draws its text, rules and buttons from leaves the background alone. */
  var CRUSH = {
    "--c": "#7a0b04", "--bright": "#b83226", "--dim": "#4a0a04",
    "--dim2": "#2c0602", "--accent": "#9c1810", "--glow": "rgba(120,10,4,0.4)",
  };
  function crush() {
    var t = 0, hits = Math.round(rnd(3, 6));
    for (var i = 0; i < hits; i++) {
      at(t, function () { applyVars(CRUSH); });
      at(t + rnd(50, 110), restoreVars);
      t += rnd(90, 260);
    }
    at(t + 40, restoreVars);
    return t + 300;
  }

  // 5. comb: a dense grille of thin dark lines drops over everything
  function comb() {
    var v = el("dg-comb");
    v.dataset.peak = "1";
    var t = 0, hits = Math.round(rnd(2, 5));
    for (var i = 0; i < hits; i++) {
      (function (a) {
        at(a, function () {
          v.style.backgroundPosition = "0 " + Math.round(rnd(0, 8)) + "px";
          v.style.opacity = "1";
        });
        at(a + rnd(70, 160), function () { v.style.opacity = "0"; });
      })(t);
      t += rnd(140, 320);
    }
    sweep(v, t);
    return t + 320;
  }

  // 6. edge burn: the vignette closes in and glows red at the rim
  function edgeBurn() {
    var v = el("dg-edge");
    v.dataset.peak = "1";
    at(0, function () { v.style.opacity = "1"; });
    at(rnd(260, 460), function () { v.style.opacity = "0"; });
    sweep(v, 700);
    return 780;
  }

  var EFFECTS = [
    { key: "tear", name: "Tear bands", run: tearBands },
    { key: "drop", name: "Dropout", run: dropout },
    { key: "bloom", name: "Bloom", run: bloom },
    { key: "crush", name: "Contrast crush", run: crush },
    { key: "comb", name: "Comb", run: comb },
    { key: "edge", name: "Edge burn", run: edgeBurn },
  ];

  function clearFx() {
    timers.forEach(clearTimeout); timers = [];
    if (layer) layer.replaceChildren();
    restoreVars();
    unshiftBody();
  }

  function play(which) {
    if (!enabled) return;
    ensure(); clearFx();
    var fx = EFFECTS[typeof which === "number" ? which : 0] || EFFECTS[0];
    var total = fx.run() || 900;
    at(total, clearFx);
    return total;
  }
  function glitch() { play(Math.floor(Math.random() * EFFECTS.length)); }

  /* One scheduler drives the automatic glitches. Rather than a rare uniform pick
     plus a separate tear clock, every effect carries a weight, so the relative
     frequency is set here: tear bands are frequent, dropout is fairly common, and
     bloom and the palette effects are rare. Bloom is held off chess and elysium. */
  var AUTO_MIN = 2500, AUTO_MAX = 8000;
  function bloomAllowed() { return !/^\/(chess|elysium)\b/.test(location.pathname); }
  var WEIGHTED = [
    { run: tearBands, w: 60 },
    { run: dropout,   w: 26 },
    { run: bloom,     w: 4, guard: bloomAllowed },
    { run: crush,     w: 4 },
    { run: comb,      w: 4 },
    { run: edgeBurn,  w: 3 },
  ];
  function playRun(runFn) {
    if (!enabled) return 0;
    ensure(); clearFx();
    var total = runFn() || 900;
    at(total, clearFx);
    return total;
  }
  // kept for the console codes and manual triggers
  function playTear() { return playRun(tearBands); }
  function pickWeighted() {
    var pool = WEIGHTED.filter(function (e) { return !e.guard || e.guard(); });
    var total = pool.reduce(function (s, e) { return s + e.w; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= pool[i].w; if (r < 0) return pool[i]; }
    return pool[0];
  }
  function scheduleNext() {
    randomTimer = setTimeout(function () {
      if (enabled && !document.hidden) playRun(pickWeighted().run);
      scheduleNext();
    }, rnd(AUTO_MIN, AUTO_MAX));
  }
  function startTears() {}   // folded into the weighted scheduler; kept for the API
  function stopTears() {}
  function startRandom() { if (!enabled || randomTimer) return; scheduleNext(); }
  function stopRandom() { clearTimeout(randomTimer); randomTimer = null; }
  function setEnabled(v) {
    enabled = Boolean(v);
    if (!enabled) { stopRandom(); clearFx(); }
  }

  return {
    play: play, glitch: glitch,
    // the console codes name this directly
    burst: function () { return play(0); },
    tear: playTear, startTears: startTears, stopTears: stopTears,
    startRandom: startRandom, stopRandom: stopRandom, setEnabled: setEnabled,
    effects: EFFECTS.map(function (e) { return e.name; }),
  };
})();
