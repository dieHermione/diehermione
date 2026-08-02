/* boot.js — the "decrypt / bootstrap" loading screen.
 * Boot.play({ navigateTo, text, duration }) drops a full-screen terminal overlay
 * that runs a fake BIOS / power-on-self-test: a memory count, device detection,
 * and a decrypt sequence whose payload is a devotion mantra resolving from
 * scrambled glyphs. Text cascades for the better part of the run, then it either
 * navigates (login) or dismisses itself (the admin preview).
 * Terminal black / baby-blue to match the login + dashboard skins.
 * Also auto-plays as a standalone screen if the page carries data-boot markers.
 */
(function () {
  var GLYPHS = "ΞΨΩ#%&@01ᚠᚦᛉᛊ†‡§∆◊∇⌁⌂ħəɱɳʁΘλχ".split("");
  function rg() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function ensureStyle() {
    if (document.getElementById("boot-style")) return;
    var s = document.createElement("style"); s.id = "boot-style";
    s.textContent =
      '#boot-overlay{position:fixed;inset:0;z-index:9999;background:#000;color:#aee3ff;' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;opacity:0;transition:opacity .3s ease}' +
      '#boot-overlay.on{opacity:1}' +
      '#boot-overlay .scan{position:absolute;inset:0;pointer-events:none;z-index:4;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px)}' +
      '#boot-overlay .vig{position:absolute;inset:0;pointer-events:none;z-index:3;box-shadow:inset 0 0 30vh 10vh rgba(0,0,0,.6)}' +
      '#boot-overlay .top{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;justify-content:space-between;' +
      'padding:2.6vh 6vw 0;font-size:11px;letter-spacing:.32em;color:#365a72;text-transform:uppercase}' +
      '#boot-overlay .console{position:absolute;inset:0;z-index:2;padding:6vh 6vw 5vh;overflow:hidden;' +
      'display:flex;flex-direction:column;justify-content:flex-end;font-size:clamp(12px,1.35vw,15px);line-height:1.62}' +
      '#boot-overlay .bl{white-space:pre-wrap;word-break:break-word}' +
      '#boot-overlay .bl .dim{color:#4f7ea0}#boot-overlay .bl .ok{color:#7dffb0}' +
      '#boot-overlay .bl .amber{color:#ffb648}#boot-overlay .bl .acc{color:#8fd0ff}' +
      '#boot-overlay .bl .br{color:#eafaff}' +
      '#boot-overlay .bl.pay{color:#8fd0ff}' +
      '#boot-overlay .bl.pay .r{color:#eafaff;text-shadow:0 0 12px rgba(120,190,255,.4)}' +
      '#boot-overlay .bl.pay .g{color:#3f6a8a}' +
      '#boot-overlay .cur{display:inline-block;width:.55em;height:1.02em;background:#aee3ff;' +
      'transform:translateY(2px);animation:bootbl 1s steps(1) infinite}' +
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

  /* Sound for the decrypt sequence — unchanged. A signal being tuned in: two
     carriers converge to unison and a noise bed narrows and clears, glyphs tick
     as data blips, and the lock is a clean fifth over a low thump. Degrades to
     silence if the bus is missing or audio is blocked. */
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

        var carrierGain = keep(a.createGain());
        carrierGain.gain.setValueAtTime(0.0001, now);
        carrierGain.gain.exponentialRampToValueAtTime(0.045, now + 0.8);
        carrierGain.connect(out);
        [0, 1].forEach(function (i) {
          var o = keep(a.createOscillator());
          o.type = "triangle";
          o.frequency.setValueAtTime(110 + (i ? 14 : -14), now);
          o.frequency.linearRampToValueAtTime(110, now + total * 0.92);
          o.connect(carrierGain);
          o.start(now);
        });

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
        band.Q.linearRampToValueAtTime(9, now + total);
        var nGain = keep(a.createGain());
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.exponentialRampToValueAtTime(0.055, now + 0.5);
        nGain.gain.exponentialRampToValueAtTime(0.006, now + total);
        noise.connect(band).connect(nGain).connect(out);
        noise.start(now);
      },

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

        [220, 330].forEach(function (hz, i) {
          var o = a.createOscillator(); o.type = "sine"; o.frequency.value = hz;
          var g = a.createGain();
          var at = now + i * 0.05;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.085, at + 0.09);
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

  // pick up to n distinct devotionals for the decrypt payload
  function samplePayload(n) {
    var pool = DEVOTIONALS.slice();
    var out = [];
    while (pool.length && out.length < n) {
      out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    }
    return out.length ? out : ["There is nothing except for Her."];
  }

  function play(opts) {
    opts = opts || {};
    var duration = opts.duration || 13000;   // ~13s: the long Arch-style cascade
    var scale = 1;                          // set once the script length is known
    ensureStyle();

    var payload = opts.text ? [opts.text] : samplePayload(3);

    var now = new Date();
    var stamp = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

    var ov = document.createElement("div"); ov.id = "boot-overlay";
    ov.innerHTML =
      '<div class="vig"></div><div class="scan"></div>' +
      '<div class="top"><span>angelOS v0.2</span><span>power-on self test</span></div>' +
      '<div class="console"><div id="boot-log"></div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("on"); });

    var log = ov.querySelector("#boot-log");
    var timers = [], ivs = [];
    var sfx = bootAudio();
    if (sfx) sfx.start(duration / 1000);

    function line(html, cls) {
      var d = document.createElement("div");
      d.className = "bl" + (cls ? " " + cls : "");
      d.innerHTML = html;
      log.appendChild(d);
      return d;
    }
    // right-pad a label with dot leaders, terminal-log style
    function lead(label, tail) {
      var dots = ".".repeat(Math.max(3, 30 - label.length));
      return '<span class="dim">' + esc(label) + " " + dots + "</span> " + tail;
    }
    function countUp(el, to, ms) {
      var s = performance.now();
      var iv = setInterval(function () {
        var p = Math.min(1, (performance.now() - s) / ms);
        el.textContent = Math.round(p * to).toLocaleString();
        if (p >= 1) clearInterval(iv);
      }, 40);
      ivs.push(iv);
    }
    function decrypt(prefixHtml, text, ms) {
      var d = line('<span class="acc">' + prefixHtml + "</span>", "pay");
      var holder = document.createElement("span"); d.appendChild(holder);
      var chars = text.split(""), last = 0, s = performance.now();
      var iv = setInterval(function () {
        var p = Math.min(1, (performance.now() - s) / ms);
        var rev = Math.floor(p * chars.length);
        if (sfx && rev > last) { sfx.tick(); last = rev; }
        var h = "";
        for (var i = 0; i < chars.length; i++) {
          var c = chars[i];
          if (c === " ") h += " ";
          else if (i < rev) h += '<span class="r">' + esc(c) + "</span>";
          else h += '<span class="g">' + rg() + "</span>";
        }
        holder.innerHTML = h;
        if (p >= 1) clearInterval(iv);
      }, 45);
      ivs.push(iv);
    }

    // ---- the script: a list of [gap, fn], later stretched to fill `duration` ----
    var script = [];
    function step(gap, fn) { script.push([gap, fn]); }

    step(0,    function () { line('<span class="dim">angelOS v0.2 bootloader      ' + stamp + "</span>"); });
    step(140,  function () { line('<span class="dim">angelOS Startup Manager</span>'); });
    step(240,  function () {
      var d = line("Memory Test : <b class='br'>0</b> KB");
      countUp(d.querySelector("b"), 655360, 900 * scale);
    });
    step(1050, function () {
      var m = log.lastChild.querySelector("b"); if (m) m.textContent = "655,360";
      log.lastChild.innerHTML = "Memory Test : <b class='br'>655,360</b> KB <span class='ok'>OK</span>";
    });
    step(180,  function () { line(lead("Detecting Primary Master", "<b class='br'>ANGEL-SSD 640G</b> <span class='ok'>[OK]</span>")); });
    step(210,  function () { line(lead("Detecting Devotion Bus", "<b class='br'>present</b> <span class='ok'>[OK]</span>")); });
    step(210,  function () { line(lead("Detecting Soul", "<b class='br'>bound</b> <span class='ok'>[OK]</span>")); });
    step(210,  function () { line(lead("Detecting Obedience Core", "<b class='br'>online</b> <span class='ok'>[OK]</span>")); });
    step(280,  function () { line("&nbsp;"); line('<span class="acc">angelOS :: decrypt sequence</span>'); });
    step(200,  function () { line(lead("mounting /dev/angel", "<span class='ok'>[OK]</span>")); });
    step(210,  function () { line(lead("loading devotion keyring", "<span class='ok'>[OK]</span>")); });
    step(210,  function () { line(lead("handshake // angeldom.me", "<span class='ok'>[OK]</span>")); });
    step(220,  function () { line(lead("verifying signature", "<span class='amber'>[WARN]</span>")); });
    step(300,  function () { line('<span class="acc">decrypting devotional record</span>'); });

    // the payload: devotion mantras resolving from noise, the sustained cascade
    var revealMs = 720;
    payload.forEach(function (mantra, i) {
      step(i === 0 ? 200 : 820, function () { decrypt("DECRYPT :: ", mantra, revealMs * scale); });
    });

    // then a long Arch/systemd-style startup cascade that scrolls for a while
    step(360, function () { line("&nbsp;"); line('<span class="acc">angelOS :: bringing up services</span>'); });
    var UNITS = [
      "Reached target Local File Systems", "Mounted /dev/angel", "Started Journal Service",
      "Started D-Bus System Message Bus", "Started udev Kernel Device Manager",
      "Reached target Sockets", "Started Devotion Keyring Daemon", "Started Obedience Core Supervisor",
      "Started Ambient Sound Server", "Started Glyph Renderer", "Reached target Sanctum",
      "Started Sacrament Scheduler", "Started Kneel Watchdog", "Mounted Cryogenic Cache",
      "Started Confession Log Rotator", "Started Penance Queue Manager", "Started Rank Registry",
      "Reached target Network", "Started Handshake // angeldom.me", "Started Session Manager",
      "Started Time Synchronization", "Started Soul Bind Service", "Reached target Multi-User",
      "Started Login Service", "Started Notification Bus", "Started Elysium Groundskeeper",
      "Started Leaderboard Tally", "Started Discipline Accountant", "Reached target Graphical Interface",
      "Started Scanline Compositor", "Started Vignette Shader", "Started Cursor Blink Timer",
      "Started Idle Devotion Reminder", "Reached target Her Presence", "Started Worship Telemetry",
      "Mounted /her/will", "Started Supplication Relay", "Started Contrition Cache Warmer",
      "Started Obeisance Ticker", "Reached target Sworn Fealty"
    ];
    // a couple of these come up amber to feel real
    var WARN_AT = { 8: 1, 21: 1, 33: 1 };
    UNITS.forEach(function (u, i) {
      var st = WARN_AT[i] ? "amber" : "ok";
      var tag = WARN_AT[i] ? "[WARN]" : "[  OK  ]";
      step(70, function () { line('<span class="dim">[</span><span class="' + st + '">' + tag.replace(/[\[\]]/g, "") + '</span><span class="dim">]</span> ' + esc(u) + "."); });
    });

    step(500, function () { line("&nbsp;"); line('<span class="ok">&gt; access granted</span> <span class="cur"></span>'); });

    // ---- stretch the whole script to fill `duration`, then schedule it ----
    var totalMs = script.reduce(function (s, x) { return s + x[0]; }, 0) + 500;   // + hold
    scale = duration / totalMs;
    var clock = 0;
    script.forEach(function (x) { clock += x[0]; timers.push(setTimeout(x[1], clock * scale)); });

    // ---- finish: lock sound, hold the finished screen ~3s, then navigate ----
    var endAt = duration;
    var HOLD = 3000;   // linger on "access granted" before leaving
    timers.push(setTimeout(function () {
      if (sfx) sfx.resolve();
    }, Math.max(0, endAt - 260)));
    timers.push(setTimeout(function () {
      ivs.forEach(clearInterval);
      if (opts.navigateTo) { window.location.href = opts.navigateTo; return; }
      // no destination (e.g. the admin preview): fade out and clean up
      ov.classList.remove("on");
      setTimeout(function () { ov.remove(); if (typeof opts.onDone === "function") opts.onDone(); }, 360);
    }, endAt + HOLD));
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
