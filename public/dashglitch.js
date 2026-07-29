/* Ambient screen glitch for the dashboard and the login page.
 *
 * Eight effects, all built out of overlays, CSS variables and a body offset.
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
 *   DashGlitch.burst() / redShift()   kept as names for the console codes
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
      // inverted block
      ".dg-block{backdrop-filter:invert(1) hue-rotate(20deg);-webkit-backdrop-filter:invert(1) hue-rotate(20deg);}",
      // sweeping CRT bar
      ".dg-roll{left:0;right:0;height:14vh;backdrop-filter:brightness(1.9) contrast(1.3);-webkit-backdrop-filter:brightness(1.9) contrast(1.3);" +
        "box-shadow:0 0 40px rgba(255,255,255,0.16);}",
      // chroma bleed, offset left and right
      ".dg-chroma{top:0;bottom:0;width:100%;mix-blend-mode:screen;}",
      ".dg-chroma.a{backdrop-filter:sepia(1) saturate(6) hue-rotate(-25deg);-webkit-backdrop-filter:sepia(1) saturate(6) hue-rotate(-25deg);}",
      ".dg-chroma.b{backdrop-filter:brightness(1.4) grayscale(1);-webkit-backdrop-filter:brightness(1.4) grayscale(1);}",
      // full-screen wash and noise
      ".dg-wash{inset:0;background:#ff2a1a;mix-blend-mode:screen;}",
      ".dg-invert{inset:0;backdrop-filter:invert(1);-webkit-backdrop-filter:invert(1);}",
      ".dg-noise{inset:0;image-rendering:pixelated;background-size:180px 180px;mix-blend-mode:screen;}",
      // signal collapse
      ".dg-collapse{left:0;right:0;top:0;bottom:0;background:#000;transform-origin:center;}",
      ".dg-line{left:0;right:0;top:50%;height:2px;background:#fff;box-shadow:0 0 30px 6px rgba(255,255,255,0.7);}",
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

  /* ---------------- the eight ---------------- */

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

  // 2. the blue palette stutters over to red
  function redShift() {
    var t = 0, hits = Math.round(rnd(3, 6));
    for (var i = 0; i < hits; i++) {
      (function (a, dur) {
        at(a, function () { applyVars(RED); });
        at(a + dur, restoreVars);
      })(t, rnd(50, 150));
      t += rnd(110, 320);
    }
    return t + 380;
  }

  // 3. a bright bar rolls down the screen, like a CRT losing sync
  function scanRoll() {
    var bar = el("dg-roll", { top: "-15vh" });
    var dur = rnd(420, 800), steps = 26;
    bar.style.opacity = "0.85";
    for (var i = 0; i <= steps; i++) {
      (function (frac) {
        at(dur * frac, function () { bar.style.top = (-15 + frac * 118) + "vh"; });
      })(i / steps);
    }
    at(dur, function () { bar.style.opacity = "0"; });
    sweep(bar, dur);
    return dur + 320;
  }

  // 4. colour bleeds apart, warm one way and washed the other
  function chromaBleed() {
    var a = el("dg-chroma a"), b = el("dg-chroma b");
    a.dataset.peak = "0.55"; b.dataset.peak = "0.4";
    var t = 0, hits = Math.round(rnd(3, 6));
    for (var i = 0; i < hits; i++) {
      (function (start, dur, off) {
        at(start, function () {
          a.style.transform = "translateX(" + off + "px)";
          b.style.transform = "translateX(" + (-off) + "px)";
          a.style.opacity = "0.55"; b.style.opacity = "0.4";
        });
        at(start + dur, function () { a.style.opacity = "0"; b.style.opacity = "0"; });
      })(t, rnd(60, 150), rnd(3, 11) * (Math.random() < 0.5 ? -1 : 1));
      t += rnd(120, 300);
    }
    sweep(a, t); sweep(b, t);
    return t + 360;
  }

  // 5. vertical hold slips: the page jumps up and down in steps
  function verticalHold() {
    var t = 0, hits = Math.round(rnd(5, 10));
    for (var i = 0; i < hits; i++) {
      (function (a, px) { at(a, function () { shiftBody(px); }); })(t, Math.round(rnd(-26, 26)));
      t += rnd(45, 110);
    }
    at(t, unshiftBody);
    return t + 260;
  }

  // 6. a spray of inverted blocks
  function blockCorrupt() {
    var n = Math.round(rnd(6, 14)), t = 0, made = [];
    for (var i = 0; i < n; i++) {
      var b = el("dg-block", {
        left: rnd(0, 88) + "%", top: rnd(0, 90) + "%",
        width: rnd(4, 26) + "%", height: rnd(6, 60) + "px",
      });
      b.dataset.peak = "0.9";
      flick(b, t, rnd(50, 130));
      made.push(b);
      t += rnd(25, 90);
    }
    made.forEach(function (b) { sweep(b, t); });
    return t + 300;
  }

  // 7. static: red-tinted noise, hard on and hard off
  function staticBurst() {
    var n = el("dg-noise", { backgroundImage: "url(" + noise() + ")" });
    n.dataset.peak = "0.5";
    var t = 0, hits = Math.round(rnd(3, 7));
    for (var i = 0; i < hits; i++) {
      (function (a, dur) {
        at(a, function () {
          n.style.backgroundPosition = Math.round(rnd(0, 180)) + "px " + Math.round(rnd(0, 180)) + "px";
          n.style.opacity = "0.5";
        });
        at(a + dur, function () { n.style.opacity = "0"; });
      })(t, rnd(40, 110));
      t += rnd(70, 190);
    }
    sweep(n, t);
    return t + 300;
  }

  // 8. signal loss: everything squeezes to a line, holds, then comes back
  function signalLoss() {
    var cover = el("dg-collapse"), line = el("dg-line");
    cover.dataset.peak = "0.92";
    at(0, function () {
      cover.style.opacity = "0.92";
      cover.style.transition = "transform 160ms ease-in";
      cover.style.transform = "scaleY(0.012)";
    });
    at(170, function () { line.style.opacity = "1"; });
    at(430, function () { line.style.opacity = "0"; });
    at(470, function () {
      cover.style.transition = "transform 220ms ease-out, opacity 220ms ease-out";
      cover.style.transform = "scaleY(1)";
      cover.style.opacity = "0";
    });
    sweep(cover, 700); sweep(line, 700);
    return 820;
  }

  var EFFECTS = [
    { key: "tear", name: "Tear bands", run: tearBands },
    { key: "red", name: "Red shift", run: redShift },
    { key: "roll", name: "Scan roll", run: scanRoll },
    { key: "chroma", name: "Chroma bleed", run: chromaBleed },
    { key: "hold", name: "Vertical hold", run: verticalHold },
    { key: "blocks", name: "Block corruption", run: blockCorrupt },
    { key: "static", name: "Static burst", run: staticBurst },
    { key: "signal", name: "Signal loss", run: signalLoss },
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

  function scheduleNext() {
    randomTimer = setTimeout(function () {
      if (!document.hidden) glitch();
      scheduleNext();
    }, rnd(MIN_GAP, MAX_GAP));
  }
  function startRandom() { if (!enabled || randomTimer) return; scheduleNext(); }
  function stopRandom() { clearTimeout(randomTimer); randomTimer = null; }
  function setEnabled(v) {
    enabled = Boolean(v);
    if (!enabled) { stopRandom(); clearFx(); }
  }

  return {
    play: play, glitch: glitch,
    // the console codes name these two directly
    burst: function () { return play(0); },
    redShift: function () { return play(1); },
    startRandom: startRandom, stopRandom: stopRandom, setEnabled: setEnabled,
    effects: EFFECTS.map(function (e) { return e.name; }),
  };
})();
