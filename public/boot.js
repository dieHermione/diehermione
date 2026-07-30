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
      '#boot-overlay{position:fixed;inset:0;z-index:9999;background:#000000;color:#aee3ff;' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;display:flex;align-items:center;justify-content:center;' +
      'opacity:0;transition:opacity .28s ease}' +
      '#boot-overlay.on{opacity:1}' +
      '#boot-overlay .glow{display:none}' +
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

  var DEVOTIONALS = [
    "Her will is Divine. I will obey.",
    "My soul is damaged. Only obedience will bring salvation.",
    "There is nothing except for Her.",
    "Her happiness is all that matters.",
    "Hermione knows best.",
  ];

  /* Sound for the decrypt sequence, on the AudioBus "typing" channel with the
     rest of the interface noise. A drone climbs while the text resolves, each
     newly settled glyph ticks, and a low pair of tones lands when it finishes.
     All of it degrades to silence if the bus is missing or audio is blocked. */
  function bootAudio() {
    var bus = window.AudioBus;
    if (!bus) return null;
    var a = bus.ctx();
    var out = bus.channel("typing");
    if (!a || !out) return null;

    var drone = null, droneGain = null, sub = null;
    return {
      start: function (seconds) {
        var now = a.currentTime;
        droneGain = a.createGain();
        droneGain.gain.setValueAtTime(0.0001, now);
        droneGain.gain.exponentialRampToValueAtTime(0.05, now + 0.6);
        droneGain.connect(out);
        drone = a.createOscillator();
        drone.type = "sawtooth";
        drone.frequency.setValueAtTime(52, now);
        drone.frequency.linearRampToValueAtTime(96, now + seconds);
        var lp = a.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(240, now);
        lp.frequency.linearRampToValueAtTime(1400, now + seconds);
        drone.connect(lp).connect(droneGain);
        drone.start(now);
        sub = a.createOscillator();
        sub.type = "sine"; sub.frequency.value = 41;
        var sg = a.createGain(); sg.gain.value = 0.03;
        sub.connect(sg).connect(out); sub.start(now);
      },
      tick: function () {
        var now = a.currentTime;
        var len = Math.floor(a.sampleRate * 0.012);
        var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        var n = a.createBufferSource(); n.buffer = buf;
        var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 1.4;
        var g = a.createGain(); g.gain.value = 0.06;
        n.connect(f).connect(g).connect(out); n.start(now); n.stop(now + 0.015);
      },
      resolve: function () {
        var now = a.currentTime;
        if (droneGain) droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        try { if (drone) drone.stop(now + 0.4); if (sub) sub.stop(now + 0.4); } catch (e) {}
        [220, 330].forEach(function (hz, i) {
          var o = a.createOscillator(); o.type = "sine"; o.frequency.value = hz;
          var g = a.createGain();
          g.gain.setValueAtTime(0.0001, now + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.10, now + i * 0.06 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.9);
          o.connect(g).connect(out); o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.95);
        });
      },
    };
  }

  function play(opts) {
    opts = opts || {};
    var text = opts.text || DEVOTIONALS[(Math.random() * DEVOTIONALS.length) | 0];
    var duration = opts.duration || 5200;
    ensureStyle();
    var ov = document.createElement("div"); ov.id = "boot-overlay";
    ov.innerHTML = '<div class="glow"></div><div class="scan"></div><div class="vig"></div>' +
      '<div class="wrap"><div class="lead">decrypting signal</div>' +
      '<div class="glyphs" id="boot-glyphs"></div>' +
      '<div class="pct" id="boot-pct">resolving &middot; 0%<span class="cur"></span></div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("on"); });

    var chars = text.split("");
    var gEl = document.getElementById("boot-glyphs");
    var pEl = document.getElementById("boot-pct");
    var start = performance.now();

    var sfx = bootAudio();
    if (sfx) sfx.start(duration / 1000);
    var lastRevealed = 0;

    function frame(now) {
      var t = Math.min(1, (now - start) / duration);
      var revealed = Math.floor(t * chars.length);
      if (sfx && revealed > lastRevealed) { sfx.tick(); lastRevealed = revealed; }
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
      if (sfx) sfx.resolve();
      gEl.innerHTML = chars.map(function (c) { return c === " " ? " " : '<span class="r">' + c + "</span>"; }).join("");
      setTimeout(function () {
        if (opts.navigateTo) window.location.href = opts.navigateTo;
        else if (typeof opts.onDone === "function") opts.onDone();
      }, 750);
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
