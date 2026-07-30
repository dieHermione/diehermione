/* Shared glitch bootstrap for the terminal-themed pages. The dashboard and the
 * login page wire DashGlitch into their own settings; every other terminal page
 * includes this small script instead. Glitches are gated off for photosensitive
 * accounts and while the site-wide subliminals switch is off.
 *
 * Load order (both defer, so they run in order): dashglitch.js, then this. */
(function () {
  "use strict";
  if (!window.DashGlitch) return;

  var photosensitive = false;

  function wanted() {
    // when AudioBus is present its subliminals switch also gates the glitch
    return !window.AudioBus || window.AudioBus.subliminals !== false;
  }
  function apply() {
    var ok = !photosensitive && wanted();
    window.DashGlitch.setEnabled(ok);
    if (ok) window.DashGlitch.startRandom(); else window.DashGlitch.stopRandom();
  }
  function fromCache() {
    try { return localStorage.getItem("photosensitive") === "1"; } catch (e) { return false; }
  }

  if (window.siteMe) {
    window.siteMe().then(function (d) {
      photosensitive = Boolean(d && d.photosensitive);
      try { localStorage.setItem("photosensitive", photosensitive ? "1" : "0"); } catch (e) {}
      apply();
    }).catch(function () { photosensitive = fromCache(); apply(); });
  } else {
    photosensitive = fromCache();
    apply();
  }

  // AudioBus may finish loading after this script; keep trying to subscribe so a
  // later flip of the subliminals switch re-gates the glitch.
  var tries = 0;
  (function hookBus() {
    if (window.AudioBus && window.AudioBus.onChange) { window.AudioBus.onChange(apply); return; }
    if (tries++ < 12) setTimeout(hookBus, 500);
  })();
})();
