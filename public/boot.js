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

  /* The pool is server-stored and Hermione-editable; these are the fallback if
     the fetch has not landed yet or fails. Fetched once, on load. */
  var DEVOTIONALS = [
    "Her will is Divine. I will obey.",
    "My soul is damaged. Only obedience will bring salvation.",
    "There is nothing except for Her.",
    "Her happiness is all that matters.",
    "Hermione knows best.",
  ];

  /* Sound for the decrypt sequence, on the AudioBus "typing" channel with the
     rest of the interface noise.

     Second pass. The first was a sawtooth drone that just climbed, which read
     as a generic riser. This one is a signal being tuned in: two carriers start
     badly detuned and converge to unison, so the audible beating slows and
     stops exactly as the text resolves, and a noise bed narrows from wide hiss
     to a thin band and fades as the static clears. Glyphs tick as quiet data
     blips that step up in pitch with progress. The lock is a clean fifth over
     a low thump, with a soft attack rather than a click.

     All of it degrades to silence if the bus is missing or audio is blocked. */
  function bootAudio() {
    var bus = window.AudioBus;
    if (!bus) return null;
    var a = bus.ctx();
    var out = bus.channel("typing");
    if (!a || !out) return null;

    var nodes = [];
    var total = 5, t0 = 0;
    function keep(n) { nodes.push(n); return n; }

    return {
      start: function (seconds) {
        var now = a.currentTime;
        total = Math.max(0.5, seconds || 5);
        t0 = now;

        // --- the two carriers, converging from a wide beat into unison ---
        var carrierGain = keep(a.createGain());
        carrierGain.gain.setValueAtTime(0.0001, now);
        carrierGain.gain.exponentialRampToValueAtTime(0.045, now + 0.8);
        carrierGain.connect(out);
        [0, 1].forEach(function (i) {
          var o = keep(a.createOscillator());
          o.type = "triangle";
          // 14Hz apart at the start, dead in tune by the end
          o.frequency.setValueAtTime(110 + (i ? 14 : -14), now);
          o.frequency.linearRampToValueAtTime(110, now + total * 0.92);
          o.connect(carrierGain);
          o.start(now);
        });

        // --- the static bed, narrowing and clearing ---
        var len = Math.floor(a.sampleRate * 2);
        var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        var noise = keep(a.createBufferSource());
        noise.buffer = buf; noise.loop = true;
        var band = keep(a.createBiquadFilter());
        band.type = "bandpass";
        band.frequency.setValueAtTime(900, now);
        band.frequency.linearRampToValueAtTime(2100, now + total);
        band.Q.setValueAtTime(0.7, now);
        band.Q.linearRampToValueAtTime(9, now + total);       // wide hiss to a thin whistle
        var nGain = keep(a.createGain());
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.exponentialRampToValueAtTime(0.055, now + 0.5);
        nGain.gain.exponentialRampToValueAtTime(0.006, now + total);
        noise.connect(band).connect(nGain).connect(out);
        noise.start(now);
      },

      // one quiet data blip per settled glyph, stepping up as the text resolves
      tick: function () {
        var now = a.currentTime;
        var p = total ? Math.min(1, (now - t0) / total) : 0;
        var o = a.createOscillator();
        o.type = "square";
        o.frequency.value = 620 + p * 900 + Math.random() * 90;
        var g = a.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.022, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        o.connect(g).connect(out);
        o.start(now); o.stop(now + 0.06);
      },

      resolve: function () {
        var now = a.currentTime;
        // everything running stops together: the static does not trail the lock
        nodes.forEach(function (n) {
          try {
            if (n.gain) {
              n.gain.cancelScheduledValues(now);
              n.gain.setValueAtTime(Math.max(0.0001, n.gain.value), now);
              n.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
            }
            if (n.stop) n.stop(now + 0.3);
          } catch (e) {}
        });
        nodes = [];

        // the lock: a fifth with a soft attack, over a low thump
        [220, 330].forEach(function (hz, i) {
          var o = a.createOscillator(); o.type = "sine"; o.frequency.value = hz;
          var g = a.createGain();
          var at = now + i * 0.05;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.085, at + 0.09);   // soft, not a click
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
          o.connect(g).connect(out); o.start(at); o.stop(at + 1.25);
        });
        var thump = a.createOscillator();
        thump.type = "sine";
        thump.frequency.setValueAtTime(150, now);
        thump.frequency.exponentialRampToValueAtTime(46, now + 0.28);
        var tg = a.createGain();
        tg.gain.setValueAtTime(0.0001, now);
        tg.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
        tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        thump.connect(tg).connect(out);
        thump.start(now); thump.stop(now + 0.55);
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

  // pull the editable pool; a failure just leaves the built-in lines in place
  try {
    fetch("/api/decrypt")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.lines && d.lines.length) DEVOTIONALS = d.lines; })
      .catch(function () {});
  } catch (e) {}

  window.Boot = { play: play, setLines: function (l) { if (l && l.length) DEVOTIONALS = l; } };

  // Standalone: a page can set <body data-boot data-boot-to="/dashboard"> to just play it.
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.body;
    if (b && b.hasAttribute("data-boot")) play({ navigateTo: b.getAttribute("data-boot-to") || null });
  });
})();
