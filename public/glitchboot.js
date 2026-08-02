/* Shared glitch bootstrap for the terminal-themed pages. The dashboard and the
 * login page wire DashGlitch into their own settings; every other terminal page
 * includes this small script instead. Glitches are gated off for accounts
 * flagged photosensitive, and for anyone who switched flashing effects off.
 *
 * Load order (both defer, so they run in order): dashglitch.js, then this. */
(function () {
  "use strict";
  if (!window.DashGlitch) return;

  var photosensitive = false;

  function effectsOff() {
    try { return localStorage.getItem("glitch-effects") === "0"; } catch (e) { return false; }
  }
  function apply() {
    var ok = !photosensitive && !effectsOff();
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
})();
