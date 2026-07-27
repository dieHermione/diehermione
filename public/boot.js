/* boot.js — the "decrypt / bootstrap" loading screen.
 * Boot.play({ navigateTo, text, duration }) drops a full-screen terminal overlay
 * that decrypts a devotion mantra from scrambled glyphs into clear text, then
 * navigates. Terminal black / baby-blue to match the login + dashboard skins.
 * Also auto-plays as a standalone screen if the page carries data-boot markers.
 */
(function () {
  var GLYPHS = "ΞΨΩ#%&@01ᚠᚦᛉᛊ†‡§∆◊∇⌁⌂ħəɱɳʁΘλχ".split("");
  function rg() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }

  function ensureStyle() {
    if (document.getElementById("boot-style")) return;
    var s = document.createElement("style"); s.id = "boot-style";
    s.textContent =
      '#boot-overlay{position:fixed;inset:0;z-index:9999;background:#04070d;color:#aee3ff;' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity .28s ease}' +
      '#boot-overlay.on{opacity:1}' +
      '#boot-overlay .glow{position:absolute;inset:0;background:radial-gradient(60% 55% at 50% 45%,rgba(60,130,210,.12) 0,transparent 70%)}' +
      '#boot-overlay .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px)}' +
      '#boot-overlay .vig{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 30vh 10vh rgba(0,0,0,.6)}' +
      '#boot-overlay .wrap{position:relative;z-index:2;text-align:center;width:min(820px,92vw)}' +
      '#boot-overlay .lead{color:#4f7ea0;letter-spacing:.4em;text-transform:uppercase;margin-bottom:1.8rem;font-size:.9rem}' +
      '#boot-overlay .glyphs{font-size:clamp(1rem,2.4vw,1.6rem);line-height:1.8;letter-spacing:.08em;word-break:break-word}' +
      '#boot-overlay .glyphs .r{color:#eafaff;text-shadow:0 0 12px rgba(120,190,255,.35)}' +
      '#boot-overlay .glyphs .n{color:#4f7ea0}' +
      '#boot-overlay .pct{margin-top:2rem;color:#8fd0ff;letter-spacing:.3em}' +
      '#boot-overlay .cur{display:inline-block;width:.55em;height:1.02em;background:#aee3ff;transform:translateY(2px);animation:bootbl 1s steps(1) infinite}' +
      '@keyframes bootbl{0%,50%{opacity:1}50.01%,100%{opacity:0}}';
    document.head.appendChild(s);
  }

  function play(opts) {
    opts = opts || {};
    var text = opts.text || "there is nothing except Her";
    var duration = opts.duration || 2200;
    ensureStyle();
    var ov = document.createElement("div"); ov.id = "boot-overlay";
    ov.innerHTML = '<div class="glow"></div><div class="scan"></div><div class="vig"></div>' +
      '<div class="wrap"><div class="lead">decrypting devotion</div>' +
      '<div class="glyphs" id="boot-glyphs"></div>' +
      '<div class="pct" id="boot-pct">resolving &middot; 0%<span class="cur"></span></div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("on"); });

    var chars = text.split("");
    var gEl = document.getElementById("boot-glyphs");
    var pEl = document.getElementById("boot-pct");
    var start = performance.now();

    function frame(now) {
      var t = Math.min(1, (now - start) / duration);
      var revealed = Math.floor(t * chars.length);
      var html = "";
      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        if (ch === " ") { html += " "; continue; }
        if (i < revealed) html += '<span class="r">' + ch + "</span>";
        else html += '<span class="n">' + rg() + "</span>";
      }
      gEl.innerHTML = html;
      pEl.innerHTML = "resolving &middot; " + Math.floor(t * 100) + "%" + (t < 1 ? '<span class="cur"></span>' : "");
      if (t < 1) { requestAnimationFrame(frame); return; }
      // fully resolved: hold briefly, then navigate
      gEl.innerHTML = chars.map(function (c) { return c === " " ? " " : '<span class="r">' + c + "</span>"; }).join("");
      setTimeout(function () {
        if (opts.navigateTo) window.location.href = opts.navigateTo;
        else if (typeof opts.onDone === "function") opts.onDone();
      }, 420);
    }
    requestAnimationFrame(frame);
  }

  window.Boot = { play: play };

  // Standalone: a page can set <body data-boot data-boot-to="/dashboard"> to just play it.
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.body;
    if (b && b.hasAttribute("data-boot")) play({ navigateTo: b.getAttribute("data-boot-to") || null });
  });
})();
