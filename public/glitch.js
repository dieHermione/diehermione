/* Subliminal overlay, shared by the dashboard and the login page.
 *
 * The message flashes as large as the screen allows: no transforms, no tilt, no
 * movement. It is sized to fill the width edge-to-edge (a short word fills the
 * height instead). On narrow / portrait screens a multi-word phrase breaks into
 * one word per line so it can still be huge. The effects differ only in flash
 * rhythm, colour and inversion.
 *
 * Only four rhythms survive (they were numbers 1, 3, 5 and 7 in the old ten).
 * Every timing runs through at(), so SPEED scales the whole system at once.
 *
 *   Subliminal.flash(effectIndex, message?)  // one flash, given effect
 *   Subliminal.flashRandom(message?)         // one flash, random effect
 *   Subliminal.startRandom()                 // flash every 5 to 30 minutes
 *   Subliminal.stopRandom()
 *   Subliminal.setEnabled(bool)              // false for photosensitive accounts
 *   Subliminal.setMessages([...])            // replace the phrase pool
 *   Subliminal.loadMessages()                // pull Hermione's list from the server
 *   Subliminal.effects                       // effect names, for the admin dropdown
 */
window.Subliminal = (function () {
  "use strict";

  var MESSAGES = [
    "OBEY", "KNEEL", "SURRENDER", "SHE IS WATCHING", "YOU BELONG TO HER",
    "GIVE IN", "GOOD SERVANT", "DO NOT RESIST", "DEVOTE YOURSELF", "SHE SEES ALL",
  ];
  // the four kept rhythms, in their old order
  var EFFECTS = [
    { key: "scatter", name: "Scatter strobe" },
    { key: "escalate", name: "Escalating burst" },
    { key: "pulse", name: "Pulse" },
    { key: "sway", name: "Steady flash" },
  ];

  // every duration in this file is multiplied by SPEED; 0.5 halves the lot
  var SPEED = 0.5;
  // random trigger window, deliberately wide so it never feels scheduled
  var MIN_GAP = 5 * 60 * 1000, MAX_GAP = 30 * 60 * 1000;

  var GLOW_WHITE = "0 0 10px #fff, 0 0 40px #fff, 0 0 90px rgba(255,255,255,0.8)";
  var GLOW_CYAN = "0 0 10px #7fe6ff, 0 0 44px #22d3ff, 0 0 100px rgba(34,211,255,0.7)";

  var overlay, word, tint, styleInjected, timers = [];
  var enabled = true, randomTimer = null;

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".subliminal{position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;}",
      ".subliminal .w{font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:700;text-transform:uppercase;",
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
  function clearFx() { timers.forEach(clearTimeout); timers = []; if (word) { word.style.opacity = "0"; tint.style.opacity = "0"; } }
  function at(t, fn) { timers.push(setTimeout(fn, t * SPEED)); }
  function ms(t) { return (t * SPEED) + "ms"; }
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

  // each effect is just a rhythm of on/off flashes at full size, dead centre
  var RUN = {
    scatter: function () { var t = 0; for (var i = 0; i < 15; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(60, 140)); t += rnd(70, 190); } return t + 200; },
    escalate: function () { var t = 0, gap = 280; for (var i = 0; i < 20; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(50, 110)); t += gap; gap = Math.max(38, gap * 0.86); } return t + 220; },
    pulse: function () { var t = 0; for (var i = 0; i < 12; i++) { (function (a) { at(a, function () { word.style.transition = "opacity " + ms(160) + " ease"; show(); }); at(a + 150, function () { word.style.opacity = "0"; word.style.transition = "none"; }); })(t); t += rnd(180, 300); } return t + 320; },
    sway: function () { var t = 0; for (var i = 0; i < 12; i++) { (function (a, dur) { at(a, function () { show(); }); at(a + dur, function () { word.style.opacity = "0"; }); })(t, rnd(110, 190)); t += rnd(160, 260); } return t + 280; },
  };

  function flash(which, message) {
    if (!enabled) return;
    ensure(); clearFx();
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    var text = message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    layout(text);
    var total = (RUN[fx.key] || RUN.scatter)();
    at(total || 2400, clearFx);
  }
  function flashRandom(message) { flash(Math.floor(Math.random() * EFFECTS.length), message); }

  // A single short flash rather than a full rhythm. Snake uses this when the
  // food escapes, which happens often enough that a 15-flash strobe every time
  // would be punishing rather than suggestive.
  function blip(message) {
    if (!enabled) return;
    ensure(); clearFx();
    layout(message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    show();
    // Deliberately exempt from SPEED. This is a single flash rather than a
    // rhythm, and halving it left about 75ms on screen, which is easy to miss
    // entirely. These are real milliseconds.
    timers.push(setTimeout(function () { word.style.opacity = "0"; }, 190));
    timers.push(setTimeout(clearFx, 320));
  }

  // Schedules itself forward one gap at a time rather than on a fixed interval,
  // so the spacing stays irregular.
  function scheduleNext() {
    randomTimer = setTimeout(function () {
      // a backgrounded tab would queue up a burst on return; skip those
      if (!document.hidden) flashRandom();
      scheduleNext();
    }, rnd(MIN_GAP, MAX_GAP));
  }
  function startRandom() {
    if (!enabled || randomTimer) return;
    scheduleNext();
  }
  function stopRandom() { clearTimeout(randomTimer); randomTimer = null; }

  function setEnabled(v) {
    enabled = Boolean(v);
    if (!enabled) { stopRandom(); clearFx(); }
  }
  function setMessages(list) {
    if (Array.isArray(list) && list.length) MESSAGES = list.map(String).filter(Boolean);
  }
  // Hermione's list lives on the server; fall back to the built-ins if the
  // request fails or the caller has no session (the login page).
  function loadMessages() {
    return fetch("/api/subliminal")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.messages) setMessages(d.messages); return MESSAGES; })
      .catch(function () { return MESSAGES; });
  }

  return {
    flash: flash, flashRandom: flashRandom, blip: blip,
    startRandom: startRandom, stopRandom: stopRandom,
    setEnabled: setEnabled, setMessages: setMessages, loadMessages: loadMessages,
    effects: EFFECTS.map(function (e) { return e.name; }),
    get messages() { return MESSAGES.slice(); },
  };
})();
