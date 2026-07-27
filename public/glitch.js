/* Subliminal overlay, shared by the dashboard and the login page.
 *
 * The message flashes as large as the screen allows: no transforms, no tilt, no
 * movement. It is sized to fill the width edge-to-edge (a short word fills the
 * height instead). On narrow / portrait screens a multi-word phrase breaks into
 * one word per line so it can still be huge. The ten "effects" differ only in
 * flash rhythm, colour and inversion.
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
    { key: "twin", name: "Red flash" },
    { key: "pulse", name: "Pulse" },
    { key: "invert", name: "Invert stutter" },
    { key: "sway", name: "Steady flash" },
    { key: "slowburn", name: "Slow burn" },
    { key: "stutter", name: "Rapid stutter" },
    { key: "cascade", name: "Double flash" },
  ];

  var GLOW_WHITE = "0 0 10px #fff, 0 0 40px #fff, 0 0 90px rgba(255,255,255,0.8)";
  var GLOW_RED = "0 0 12px #ff2d55, 0 0 48px #ff2d55, 0 0 110px rgba(255,45,85,0.7)";
  var GLOW_CYAN = "0 0 10px #7fe6ff, 0 0 44px #22d3ff, 0 0 100px rgba(34,211,255,0.7)";

  var overlay, word, tint, styleInjected, timers = [];

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".subliminal{position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;}",
      ".subliminal .w{font-family:'Oswald','Quicksand',-apple-system,sans-serif;font-weight:700;text-transform:uppercase;",
      "letter-spacing:0.01em;line-height:0.98;text-align:center;color:#fff;opacity:0;text-shadow:" + GLOW_WHITE + ";}",
      ".subliminal .tint{position:absolute;inset:0;background:#fff;opacity:0;mix-blend-mode:difference;}",
    ].join("");
    var s = document.createElement("style"); s.id = "subliminal-style"; s.textContent = css;
    document.head.appendChild(s);
  }
  function ensure() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement("div"); overlay.className = "subliminal"; overlay.setAttribute("aria-hidden", "true");
    tint = document.createElement("div"); tint.className = "tint";
    word = document.createElement("div"); word.className = "w";
    overlay.append(tint, word);
    document.body.appendChild(overlay);
  }
  function clearFx() { timers.forEach(clearTimeout); timers = []; word.style.opacity = "0"; tint.style.opacity = "0"; }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // lay the message out as big as it can be while staying fully on-screen
  function layout(text) {
    var narrow = window.innerWidth < 640 || window.innerWidth < window.innerHeight;
    var words = text.split(" ");
    var lines = (narrow && words.length > 1) ? words : [text];
    word.innerHTML = lines.join("<br>");
    var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    var byW = window.innerWidth * 0.97 / (longest * 0.60);
    var byH = window.innerHeight * 0.94 / (lines.length * 1.02);
    word.style.fontSize = Math.max(24, Math.min(byW, byH)) + "px";
  }
  function show(color, glow) { word.style.color = color || "#fff"; word.style.textShadow = glow || GLOW_WHITE; word.style.opacity = "1"; }
  function tintOn(dur) { tint.style.opacity = "1"; at(dur || 70, function () { tint.style.opacity = "0"; }); }

  // each effect is just a rhythm of on/off flashes at full size, dead centre
  var RUN = {
    scatter: function () { var t = 0; for (var i = 0; i < 15; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(60, 140)); t += rnd(70, 190); } return t + 200; },
    afterimage: function () { var t = 0; for (var i = 0; i < 10; i++) { (function (a) { at(a, function () { word.style.transition = "opacity 380ms ease"; show("#fff", GLOW_CYAN); }); at(a + 40, function () { word.style.opacity = "0"; word.style.transition = "none"; }); })(t); t += rnd(160, 240); } return t + 500; },
    escalate: function () { var t = 0, gap = 280; for (var i = 0; i < 20; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(50, 110)); t += gap; gap = Math.max(38, gap * 0.86); } return t + 220; },
    twin: function () { var t = 0; for (var i = 0; i < 14; i++) { (function (a, dur) { at(a, function () { show("#fff", GLOW_RED); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(70, 150)); t += rnd(90, 170); } return t + 220; },
    pulse: function () { var t = 0; for (var i = 0; i < 12; i++) { (function (a) { at(a, function () { word.style.transition = "opacity 160ms ease"; show(); }); at(a + 150, function () { word.style.opacity = "0"; word.style.transition = "none"; }); })(t); t += rnd(180, 300); } return t + 320; },
    invert: function () { var t = 0; for (var i = 0; i < 15; i++) { (function (a, idx, dur) { at(a, function () { if (idx % 2) { tintOn(dur); show("#000", "0 0 8px #fff"); } else show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, i, rnd(60, 110)); t += rnd(80, 170); } return t + 220; },
    sway: function () { var t = 0; for (var i = 0; i < 12; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(110, 190)); t += rnd(160, 260); } return t + 280; },
    slowburn: function () { var t = 0; for (var i = 0; i < 6; i++) { (function (a) { at(a, function () { word.style.transition = "opacity 420ms ease"; show(); }); at(a + 60, function () { word.style.opacity = "0"; word.style.transition = "none"; }); })(t); t += rnd(420, 560); } return t + 700; },
    stutter: function () { var t = 0; for (var i = 0; i < 30; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(22, 48)); t += rnd(40, 68); } return t + 160; },
    cascade: function () { var t = 0; for (var i = 0; i < 8; i++) { (function (a, idx) { at(a, function () { show("#fff", idx % 2 ? GLOW_RED : GLOW_WHITE); if (idx % 2) tintOn(60); }); at(a + 90, function () { word.style.opacity = "0"; }); })(t, i); t += rnd(150, 240); } return t + 260; },
  };

  function flash(which, message) {
    ensure(); clearFx();
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    var text = message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    layout(text);
    var total = (RUN[fx.key] || RUN.scatter)();
    at(total || 2400, clearFx);
  }

  return { flash: flash, effects: EFFECTS.map(function (e) { return e.name; }), messages: MESSAGES };
})();
