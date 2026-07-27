/* Subliminal glitch overlay, shared by the dashboard and the login page.
 *
 * Ten flash-family effects. Constraints: the whole line always stays on-screen
 * at full size (font auto-fit to the viewport, never scaled or clipped);
 * position drifts only a small amount from centre; tilt is capped at 20deg.
 * The word glows. (Photosensitivity intentionally not a concern here.)
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
    { key: "pulse", name: "Pulse" },
    { key: "invert", name: "Invert stutter" },
    { key: "sway", name: "Sway" },
    { key: "slowburn", name: "Slow burn" },
    { key: "stutter", name: "Rapid stutter" },
    { key: "cascade", name: "Cascade" },
  ];

  var GLOW_WHITE = "0 0 8px #fff, 0 0 26px #fff, 0 0 60px rgba(255,255,255,0.85)";
  var GLOW_RED = "0 0 10px #ff2d55, 0 0 34px #ff2d55, 0 0 70px rgba(255,45,85,0.7)";
  var GLOW_CYAN = "0 0 8px #7fe6ff, 0 0 30px #22d3ff, 0 0 64px rgba(34,211,255,0.7)";

  var MAXROT = 20;   // hard cap on tilt (degrees)
  var MOVE = 5;      // max drift from centre, in vw / vh

  var overlay, styleInjected, timers = [], pool = [], POOL = 8, curFont = 48;

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".subliminal{position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;}",
      ".subliminal .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);",
      "font-family:'Oswald','Quicksand',-apple-system,sans-serif;font-weight:700;text-transform:uppercase;",
      "letter-spacing:0.03em;white-space:nowrap;color:#fff;opacity:0;text-shadow:" + GLOW_WHITE + ";will-change:transform,opacity;}",
      ".subliminal .tint{position:absolute;inset:0;background:#fff;opacity:0;mix-blend-mode:difference;}",
    ].join("");
    var s = document.createElement("style"); s.id = "subliminal-style"; s.textContent = css;
    document.head.appendChild(s);
  }
  function ensure() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement("div"); overlay.className = "subliminal";
    overlay.setAttribute("aria-hidden", "true");
    var tint = document.createElement("div"); tint.className = "tint"; overlay.appendChild(tint);
    for (var i = 0; i < POOL; i++) { var w = document.createElement("div"); w.className = "w"; overlay.appendChild(w); pool.push(w); }
    overlay._tint = tint;
    document.body.appendChild(overlay);
  }
  function clearFx() {
    timers.forEach(clearTimeout); timers = [];
    pool.forEach(function (w) { w.style.opacity = "0"; w.style.transition = "none"; });
    if (overlay._tint) { overlay._tint.style.opacity = "0"; }
  }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // pick the largest font that keeps the whole line comfortably in view
  function fitFont(text) {
    var byWidth = window.innerWidth * 0.9 / (text.length * 0.62);
    return clamp(Math.min(byWidth, window.innerHeight * 0.17, 130), 26, 130);
  }

  // one blip: the full line, full size, small offset from centre, gentle tilt
  function blip(el, text, cfg) {
    cfg = cfg || {};
    el.textContent = text;
    el.style.fontSize = curFont + "px";
    el.style.transition = cfg.fade ? "opacity " + cfg.fade + "ms ease" : "none";
    var dx = clamp(cfg.dx != null ? cfg.dx : rnd(-MOVE, MOVE), -MOVE, MOVE);
    var dy = clamp(cfg.dy != null ? cfg.dy : rnd(-MOVE, MOVE), -MOVE, MOVE);
    var rot = clamp(cfg.rot != null ? cfg.rot : rnd(-MAXROT, MAXROT), -MAXROT, MAXROT);
    el.style.color = cfg.color || "#fff";
    el.style.textShadow = cfg.glow || GLOW_WHITE;
    el.style.transform = "translate(-50%,-50%) translate(" + dx.toFixed(2) + "vw," + dy.toFixed(2) + "vh) rotate(" + rot.toFixed(1) + "deg)";
    el.style.opacity = "1";
    at(cfg.dur || 90, function () { el.style.opacity = "0"; });
  }
  function tintFlash(dur) { var t = overlay._tint; t.style.opacity = "1"; at(dur || 70, function () { t.style.opacity = "0"; }); }

  var RUN = {
    scatter: function (text) { var t = 0; for (var i = 0; i < 15; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { dur: rnd(60, 140) }); }); })(t); t += rnd(70, 190); } return t + 200; },
    afterimage: function (text) { var t = 0; for (var i = 0; i < 11; i++) { (function (tt, idx) { at(tt, function () { blip(pool[idx % POOL], text, { dx: rnd(-3, 3), dy: rnd(-3, 3), dur: 420, fade: 380, glow: GLOW_CYAN }); }); })(t, i); t += rnd(150, 240); } return t + 500; },
    escalate: function (text) { var t = 0, gap = 280; for (var i = 0; i < 20; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { dur: rnd(50, 110) }); }); })(t); t += gap; gap = Math.max(38, gap * 0.86); } return t + 220; },
    twin: function (text) { var t = 0; for (var i = 0; i < 16; i++) { (function (tt, idx) { at(tt, function () { blip(pool[idx % 2], text, { dx: (idx % 2 ? 1 : -1) * rnd(2, 4.5), dy: rnd(-3, 3), rot: (idx % 2 ? 1 : -1) * rnd(6, 18), dur: rnd(80, 150), glow: GLOW_RED }); }); })(t, i); t += rnd(90, 170); } return t + 220; },
    pulse: function (text) { var t = 0; for (var i = 0; i < 13; i++) { (function (tt) { at(tt, function () { blip(pool[0], text, { dx: rnd(-2.5, 2.5), dy: rnd(-2.5, 2.5), rot: rnd(-10, 10), dur: rnd(90, 180) }); }); })(t); t += rnd(120, 240); } return t + 260; },
    invert: function (text) { var t = 0; for (var i = 0; i < 15; i++) { (function (tt, idx) { at(tt, function () { if (idx % 2) { tintFlash(rnd(60, 110)); blip(pool[0], text, { color: "#000", glow: "0 0 6px #fff", dur: rnd(60, 110) }); } else blip(pool[0], text, { dur: rnd(60, 110) }); }); })(t, i); t += rnd(80, 170); } return t + 220; },
    sway: function (text) { var t = 0; for (var i = 0; i < 16; i++) { (function (tt, idx) { at(tt, function () { blip(pool[0], text, { dx: (idx % 2 ? 1 : -1) * rnd(3, MOVE), dy: rnd(-2, 2), rot: (idx % 2 ? 1 : -1) * rnd(10, MAXROT), dur: rnd(90, 160) }); }); })(t, i); t += rnd(100, 180); } return t + 220; },
    slowburn: function (text) { var t = 0; for (var i = 0; i < 6; i++) { (function (tt, idx) { at(tt, function () { blip(pool[idx % POOL], text, { dx: rnd(-3, 3), dy: rnd(-3, 3), rot: rnd(-12, 12), dur: rnd(420, 620), fade: 420 }); }); })(t, i); t += rnd(360, 460); } return t + 700; },
    stutter: function (text) { var t = 0, cx = rnd(-2, 2), cy = rnd(-2, 2); for (var i = 0; i < 30; i++) { (function (tt) { at(tt, function () { cx = clamp(cx + rnd(-1, 1), -3, 3); cy = clamp(cy + rnd(-1, 1), -3, 3); blip(pool[0], text, { dx: cx, dy: cy, rot: rnd(-MAXROT, MAXROT), dur: rnd(22, 48) }); }); })(t); t += rnd(38, 66); } return t + 160; },
    cascade: function (text) { var t = 0; for (var b = 0; b < 4; b++) { (function (tt) { at(tt, function () { for (var k = 0; k < 4; k++) blip(pool[k], text, { dx: rnd(-MOVE, MOVE), dy: rnd(-MOVE, MOVE), rot: rnd(-16, 16), dur: rnd(150, 240), glow: k % 2 ? GLOW_RED : GLOW_WHITE }); }); })(t); t += rnd(420, 560); } return t + 280; },
  };

  function flash(which, message) {
    ensure(); clearFx();
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    var text = message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    curFont = fitFont(text);
    var total = (RUN[fx.key] || RUN.scatter)(text);
    at(total || 2400, clearFx);
  }

  return { flash: flash, effects: EFFECTS.map(function (e) { return e.name; }), messages: MESSAGES };
})();
