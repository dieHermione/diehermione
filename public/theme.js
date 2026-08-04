/* theme.js — the account accent colour.
 *
 * The whole site's "blue" is one accent (#00acdb) plus white; theming just swaps
 * that accent everywhere it comes from a CSS variable. Every blue/white page sets
 * --c/--dim/--dim2/--accent in its own `:root {}`; this script writes those same
 * variables as INLINE styles on <html>, which beat the stylesheet's :root rule,
 * so one small script re-tints every page.
 *
 * Load it in <head>, BEFORE the page's <style>, with no defer, so the colour is
 * applied before first paint (no blue flash). Persistence: localStorage for an
 * instant, flash-free apply, and the account record (via /api/theme) as the
 * source of truth once /api/me resolves. Guests get localStorage only. */
(function () {
  "use strict";
  var DEFAULT = "#00acdb";
  // label -> hex. "default" is the house blue.
  var PRESETS = {
    "default": DEFAULT,
    "ed0955": "#ed0955", "710087": "#710087", "0bdb00": "#0bdb00",
    "f7df00": "#f7df00", "f78400": "#f78400", "ffa6c5": "#ffa6c5",
  };
  function norm(v) {
    if (!v) return "default";
    v = String(v).replace(/^#/, "").toLowerCase();
    return PRESETS[v] ? v : "default";
  }
  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }
  function apply(label) {
    var hex = PRESETS[norm(label)] || DEFAULT;
    var el = document.documentElement, rgb = hexToRgb(hex);
    ["--c", "--dim", "--dim2", "--accent"].forEach(function (v) { el.style.setProperty(v, hex); });
    el.style.setProperty("--glow", "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.34)");
  }
  function get() { try { return norm(localStorage.getItem("theme-color")); } catch (e) { return "default"; } }
  function cache(label) { try { localStorage.setItem("theme-color", norm(label)); } catch (e) {} }

  function set(label) {
    label = norm(label);
    cache(label); apply(label);
    // persist to the account if signed in (guests just keep the localStorage copy)
    try {
      fetch("/api/theme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: label }),
      });
    } catch (e) {}
  }
  // called after /api/me: the account's stored colour is authoritative
  function fromAccount(label) {
    label = norm(label);
    if (label !== get()) { cache(label); apply(label); }
  }

  apply(get());   // immediate, before paint
  window.Theme = { apply: apply, set: set, get: get, fromAccount: fromAccount, PRESETS: PRESETS, DEFAULT: DEFAULT };
})();
