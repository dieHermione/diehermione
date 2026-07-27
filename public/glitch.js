/* Subliminal glitch overlay, shared by the dashboard and the login page.
 *
 * Ten effects, all in the "single-frame flash" family the project settled on:
 * the message blips over the page, LARGE, GLOWING, and jumping to erratic
 * random positions and tilts. They run noticeably longer than a single frame.
 * (Photosensitivity is intentionally not a concern here per the site owner; a
 * small invite-only audience, adjustable later.)
 *
 *   Subliminal.flash(effectIndex, message?)   // message defaults to random
 *   Subliminal.effects     // ordered effect names (for the dashboard dropdown)
 *   Subliminal.messages    // the phrase pool
 */
window.Subliminal = (function () {
  "use strict";

  var MESSAGES = [
    "OBEY", "KNEEL", "SURRENDER", "SHE IS WATCHING", "YOU BELONG TO HER",
    "GIVE IN", "GOOD SERVANT", "DO NOT RESIST", "DEVOTE YOURSELF", "SHE SEES ALL",
  ];

  var EFFECTS = [
    { key: "scatter", name: "Scatter strobe" },
    { key: "afterimage", name: "Afterimage" },
    { key: "escalate", name: "Escalating burst" },
    { key: "twin", name: "Twin flash" },
    { key: "zoom", name: "Zoom blip" },
    { key: "invert", name: "Invert stutter" },
    { key: "quadrant", name: "Corner jump" },
    { key: "slowburn", name: "Slow burn" },
    { key: "stutter", name: "Rapid stutter" },
    { key: "cascade", name: "Cascade tile" },
  ];

  var GLOW_WHITE = "0 0 8px #fff, 0 0 26px #fff, 0 0 60px rgba(255,255,255,0.85)";
  var GLOW_RED = "0 0 10px #ff2d55, 0 0 34px #ff2d55, 0 0 70px rgba(255,45,85,0.7)";
  var GLOW_CYAN = "0 0 8px #7fe6ff, 0 0 30px #22d3ff, 0 0 64px rgba(34,211,255,0.7)";

  var overlay, styleInjected, timers = [], pool = [], POOL = 8;

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".subliminal{position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;}",
      ".subliminal .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);",
      "font-family:'Oswald','Quicksand',-apple-system,sans-serif;font-weight:700;text-transform:uppercase;",
      "letter-spacing:0.04em;white-space:nowrap;color:#fff;opacity:0;",
      "font-size:clamp(3.5rem,15vw,13rem);text-shadow:" + GLOW_WHITE + ";will-change:transform,opacity;}",
      ".subliminal .tint{position:absolute;inset:0;background:#fff;opacity:0;mix-blend-mode:difference;}",
    ].join("");
    var s = document.createElement("style"); s.id = "subliminal-style"; s.textContent = css;
    document.head.appendChild(s);
  }

  function ensure() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement("div");
    overlay.className = "subliminal";
    overlay.setAttribute("aria-hidden", "true");
    var tint = document.createElement("div"); tint.className = "tint"; overlay.appendChild(tint);
    for (var i = 0; i < POOL; i++) {
      var w = document.createElement("div"); w.className = "w";
      overlay.appendChild(w); pool.push(w);
    }
    overlay._tint = tint;
    document.body.appendChild(overlay);
  }

  function clearFx() {
    timers.forEach(clearTimeout); timers = [];
    pool.forEach(function (w) { w.style.opacity = "0"; w.style.transition = "none"; });
    if (overlay._tint) { overlay._tint.style.opacity = "0"; overlay._tint.style.transition = "none"; }
  }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // one blip: place a word element and show it briefly. cfg fields are all
  // optional; position/tilt/scale default to erratic random values.
  function blip(el, text, cfg) {
    cfg = cfg || {};
    el.textContent = text;
    el.style.transition = cfg.fade ? "opacity " + cfg.fade + "ms ease" : "none";
    el.style.left = (cfg.x != null ? cfg.x : rnd(18, 82)) + "%";
    el.style.top = (cfg.y != null ? cfg.y : rnd(22, 78)) + "%";
    el.style.color = cfg.color || "#fff";
    el.style.textShadow = cfg.glow || GLOW_WHITE;
    el.style.fontSize = cfg.size ? cfg.size : "";
    var rot = cfg.rot != null ? cfg.rot : rnd(-26, 26);
    var sc = cfg.scale != null ? cfg.scale : rnd(0.8, 1.6);
    el.style.transform = "translate(-50%,-50%) rotate(" + rot.toFixed(1) + "deg) scale(" + sc.toFixed(2) + ")";
    el.style.opacity = "1";
    at(cfg.dur || 90, function () { el.style.opacity = "0"; });
  }
  function tintFlash(dur) {
    var t = overlay._tint; t.style.transition = "none"; t.style.opacity = "1";
    at(dur || 80, function () { t.style.opacity = "0"; });
  }

  var RUN = {
    // rapid blips, each at a fresh random spot/tilt
    scatter: function (text) {
      var t = 0;
      for (var i = 0; i < 15; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { dur: rnd(60, 140) }); }); })(t); t += rnd(70, 190); }
      return t + 200;
    },
    // successive blips linger and overlap as glowing afterimages
    afterimage: function (text) {
      var t = 0;
      for (var i = 0; i < 11; i++) { (function (tt, idx) { at(tt, function () { blip(pool[idx % POOL], text, { dur: 420, fade: 380, glow: GLOW_CYAN }); }); })(t, i); t += rnd(150, 240); }
      return t + 500;
    },
    // sparse, then accelerating into a burst
    escalate: function (text) {
      var t = 0, gap = 280;
      for (var i = 0; i < 20; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { dur: rnd(50, 110) }); }); })(t); t += gap; gap = Math.max(38, gap * 0.86); }
      return t + 220;
    },
    // two words alternate at mirrored positions
    twin: function (text) {
      var t = 0;
      for (var i = 0; i < 16; i++) { (function (tt, idx) { at(tt, function () { var x = rnd(20, 46); blip(pool[idx % 2], text, { x: idx % 2 ? x : 100 - x, y: rnd(28, 72), dur: rnd(80, 150), glow: GLOW_RED }); }); })(t, i); t += rnd(90, 170); }
      return t + 220;
    },
    // each blip a wildly different size
    zoom: function (text) {
      var t = 0;
      for (var i = 0; i < 13; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { scale: rnd(0.4, 3.0), dur: rnd(70, 130) }); }); })(t); t += rnd(90, 200); }
      return t + 220;
    },
    // alternate normal / inverted with a difference-blend tint
    invert: function (text) {
      var t = 0;
      for (var i = 0; i < 15; i++) { (function (tt, idx) { at(tt, function () { if (idx % 2) { tintFlash(rnd(60, 120)); blip(pool[0], text, { color: "#000", glow: "0 0 6px #fff", dur: rnd(60, 120) }); } else { blip(pool[0], text, { dur: rnd(60, 120) }); } }); })(t, i); t += rnd(80, 170); }
      return t + 220;
    },
    // jump between the four corners and the centre
    quadrant: function (text) {
      var spots = [[24, 26], [76, 26], [24, 74], [76, 74], [50, 50]]; var t = 0;
      for (var i = 0; i < 17; i++) { (function (tt, idx) { at(tt, function () { var s = spots[Math.floor(Math.random() * spots.length)]; blip(pool[0], text, { x: s[0], y: s[1], dur: rnd(80, 150) }); }); })(t, i); t += rnd(90, 180); }
      return t + 220;
    },
    // fewer, longer holds that cross-fade
    slowburn: function (text) {
      var t = 0;
      for (var i = 0; i < 6; i++) { (function (tt, idx) { at(tt, function () { blip(pool[idx % POOL], text, { dur: rnd(420, 620), fade: 420, glow: GLOW_WHITE, scale: rnd(1.0, 1.5) }); }); })(t, i); t += rnd(360, 460); }
      return t + 700;
    },
    // machine-gun stutter, tiny drift, big tilt swings
    stutter: function (text) {
      var t = 0, cx = rnd(35, 65), cy = rnd(35, 65);
      for (var i = 0; i < 30; i++) { (function (tt) { at(tt, function () { cx += rnd(-4, 4); cy += rnd(-4, 4); blip(pool[0], text, { x: cx, y: cy, rot: rnd(-38, 38), scale: rnd(0.9, 1.3), dur: rnd(22, 48) }); }); })(t); t += rnd(38, 66); }
      return t + 160;
    },
    // several copies tiled at once, flickering as a group
    cascade: function (text) {
      var t = 0;
      for (var burst = 0; burst < 4; burst++) {
        (function (tt) {
          at(tt, function () {
            for (var k = 0; k < POOL; k++) blip(pool[k], text, { x: rnd(15, 85), y: rnd(18, 82), rot: rnd(-20, 20), scale: rnd(0.6, 1.4), dur: rnd(120, 220), glow: k % 2 ? GLOW_RED : GLOW_WHITE });
          tintFlash(90);
        });
        })(t);
        t += rnd(420, 560);
      }
      return t + 260;
    },
  };

  function flash(which, message) {
    ensure(); clearFx();
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    var text = message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    var total = (RUN[fx.key] || RUN.scatter)(text);
    at(total || 2400, clearFx);
  }

  return { flash: flash, effects: EFFECTS.map(function (e) { return e.name; }), messages: MESSAGES };
})();
