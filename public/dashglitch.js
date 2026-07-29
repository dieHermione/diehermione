/* Ambient screen glitch for the dashboard and the login page.
 *
 * Two effects, both short and deliberately low-key:
 *   burst()     bright horizontal tear bands plus a faint red wash
 *   redShift()  stutters the page's blue CSS vars over to red and back
 *
 * Both pages declare the same variable names (--c, --dim, --dim2, --bright,
 * --accent, --glow), so redShift only has to touch :root.
 *
 * Nothing here transforms .dash: the dashboard keeps a scale-to-fit transform
 * on that element and an animation ending in `transform: none` would wipe it.
 *
 *   DashGlitch.burst() / DashGlitch.redShift() / DashGlitch.glitch()
 *   DashGlitch.startRandom() / DashGlitch.stopRandom()
 *   DashGlitch.setEnabled(bool)     // false for photosensitive accounts
 */
window.DashGlitch = (function () {
  "use strict";

  // the red the blue vars stutter across to
  var RED = {
    "--c": "#ff6a58", "--dim": "#a33a30", "--dim2": "#70271f",
    "--bright": "#ffe4df", "--accent": "#ff7361", "--glow": "rgba(255,90,74,0.32)",
  };
  // occasional, not constant
  var MIN_GAP = 40 * 1000, MAX_GAP = 180 * 1000;

  var layer, tint, styleInjected, timers = [];
  var enabled = true, randomTimer = null;

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var css = [
      ".dg-layer{position:fixed;inset:0;z-index:95;pointer-events:none;overflow:hidden;}",
      ".dg-band{position:absolute;left:0;right:0;opacity:0;",
      "backdrop-filter:brightness(2.1) saturate(0.25);-webkit-backdrop-filter:brightness(2.1) saturate(0.25);}",
      ".dg-tint{position:absolute;inset:0;background:#ff2a1a;opacity:0;mix-blend-mode:screen;}",
    ].join("");
    var s = document.createElement("style"); s.id = "dashglitch-style"; s.textContent = css;
    document.head.appendChild(s);
  }
  function ensure() {
    if (layer) return;
    injectStyle();
    layer = document.createElement("div"); layer.className = "dg-layer"; layer.setAttribute("aria-hidden", "true");
    tint = document.createElement("div"); tint.className = "dg-tint";
    layer.appendChild(tint);
    document.body.appendChild(layer);
  }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clearFx() {
    timers.forEach(clearTimeout); timers = [];
    if (layer) { [].slice.call(layer.querySelectorAll(".dg-band")).forEach(function (b) { b.remove(); }); tint.style.opacity = "0"; }
    restoreVars();
  }

  /* ---- tear bands ---- */
  function burst() {
    if (!enabled) return;
    ensure();
    var count = Math.round(rnd(3, 6)), t = 0;
    for (var i = 0; i < count; i++) {
      var band = document.createElement("div");
      band.className = "dg-band";
      band.style.top = rnd(4, 92) + "%";
      band.style.height = rnd(2, 14) + "px";
      layer.appendChild(band);
      (function (el, a, dur) {
        at(a, function () { el.style.opacity = "1"; });
        at(a + dur, function () { el.style.opacity = "0"; });
        at(a + dur + 260, function () { el.remove(); });
      })(band, t, rnd(40, 110));
      t += rnd(50, 130);
    }
    // one faint red wash partway through
    at(rnd(40, t), function () { tint.style.opacity = "0.06"; });
    at(t + 90, function () { tint.style.opacity = "0"; });
    return t + 420;
  }

  /* ---- blue -> red stutter ---- */
  var saved = null;
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
  function redShift() {
    if (!enabled) return;
    ensure();
    var t = 0, hits = Math.round(rnd(2, 5));
    for (var i = 0; i < hits; i++) {
      (function (a, dur) {
        at(a, function () { applyVars(RED); });
        at(a + dur, restoreVars);
      })(t, rnd(50, 140));
      t += rnd(110, 320);
    }
    // a tear or two over the top, so the colour shift is not the only tell
    at(rnd(0, t * 0.5), burst);
    return t + 400;
  }

  function glitch() { (Math.random() < 0.55 ? burst : redShift)(); }

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
    burst: burst, redShift: redShift, glitch: glitch,
    startRandom: startRandom, stopRandom: stopRandom, setEnabled: setEnabled,
  };
})();
