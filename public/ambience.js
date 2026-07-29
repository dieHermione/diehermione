/* Room tone and key clicks for the dashboard and login page.
 *
 * Two parts:
 *   - a fluorescent-tube hum: mains buzz at 120Hz with its harmonics, a little
 *     filtered noise for the ballast, and a slow wander so it never sits
 *     perfectly still. Occasionally it flickers, dipping and buzzing harder.
 *   - the old-keyboard click ported from Penance, fired on keystrokes in any
 *     text field (and by the dashboard console).
 *
 * Browsers refuse to start audio before a gesture, so the hum arms itself and
 * begins on the first click or keypress. A mute toggle is injected bottom-right
 * and remembered in localStorage, because ambient sound you cannot switch off
 * is a bad neighbour.
 *
 *   Ambience.click(bad)   one key click
 *   Ambience.arm()        start on the next user gesture (called automatically)
 *   Ambience.setMuted(b) / Ambience.isMuted()
 */
window.Ambience = (function () {
  "use strict";

  var KEY = "ambience-muted";
  var HUM = 0.05;            // ceiling for the hum bus
  var actx = null, humBus = null, started = false, armed = false;
  var muted = false;
  try { muted = localStorage.getItem(KEY) === "1"; } catch (e) {}

  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }

  /* ---- fluorescent hum ---- */
  function startHum() {
    var a = ctx(); if (!a || started) return; started = true;

    humBus = a.createGain();
    humBus.gain.value = muted ? 0 : HUM;
    humBus.connect(a.destination);

    // mains buzz: 120Hz fundamental plus the odd harmonics a tube actually sings
    [[120, 1], [240, 0.5], [360, 0.28], [600, 0.12]].forEach(function (pair) {
      var o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = pair[0];
      var g = a.createGain();
      g.gain.value = 0.16 * pair[1];
      o.connect(g).connect(humBus);
      o.start();
    });

    // ballast hiss, band-limited so it sits under the buzz rather than over it
    var len = 2 * a.sampleRate;
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var noise = a.createBufferSource(); noise.buffer = buf; noise.loop = true;
    var nf = a.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.7;
    var ng = a.createGain(); ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(humBus);
    noise.start();

    // slow wander, so the tone is never perfectly static
    var lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
    var lfoGain = a.createGain(); lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(humBus.gain);
    lfo.start();

    scheduleFlicker();
  }

  // every so often the tube stutters: a quick dip and a harder buzz
  function scheduleFlicker() {
    setTimeout(function () {
      if (humBus && actx && !muted) {
        var now = actx.currentTime;
        var n = 2 + Math.floor(Math.random() * 3);
        for (var i = 0; i < n; i++) {
          var t = now + i * 0.09;
          humBus.gain.setValueAtTime(HUM * 0.2, t);
          humBus.gain.setValueAtTime(HUM * 1.5, t + 0.045);
        }
        humBus.gain.setValueAtTime(HUM, now + n * 0.09 + 0.05);
      }
      scheduleFlicker();
    }, 12000 + Math.random() * 40000);
  }

  /* ---- key click, ported from Penance ---- */
  function click(bad) {
    if (muted) return;
    var a = ctx(); if (!a) return;
    var now = a.currentTime;
    var len = Math.floor(a.sampleRate * 0.03);
    var b = a.createBuffer(1, len, a.sampleRate), dd = b.getChannelData(0);
    for (var i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var n = a.createBufferSource(); n.buffer = b;
    var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = bad ? 1300 : 2100; f.Q.value = 0.8;
    var g = a.createGain(); g.gain.value = bad ? 0.12 : 0.07;
    n.connect(f).connect(g).connect(a.destination); n.start(now); n.stop(now + 0.03);
    var o = a.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(bad ? 88 : 150, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.04);
    var og = a.createGain();
    og.gain.setValueAtTime(bad ? 0.09 : 0.05, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(og).connect(a.destination); o.start(now); o.stop(now + 0.06);
  }

  /* ---- mute toggle ---- */
  function setMuted(v) {
    muted = Boolean(v);
    try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch (e) {}
    if (humBus && actx) humBus.gain.setTargetAtTime(muted ? 0 : HUM, actx.currentTime, 0.2);
    var btn = document.getElementById("amb-toggle");
    if (btn) { btn.textContent = muted ? "♪ off" : "♪ on"; btn.classList.toggle("off", muted); }
  }
  function injectToggle() {
    if (document.getElementById("amb-toggle")) return;
    var s = document.createElement("style");
    s.textContent =
      "#amb-toggle{position:fixed;right:0.9rem;bottom:0.7rem;z-index:9000;font:inherit;font-size:0.68rem;" +
      "letter-spacing:0.14em;text-transform:uppercase;background:transparent;border:none;color:inherit;" +
      "opacity:0.32;cursor:pointer;padding:0.2rem 0.3rem;}" +
      "#amb-toggle:hover{opacity:0.85;}#amb-toggle.off{text-decoration:line-through;}";
    document.head.appendChild(s);
    var btn = document.createElement("button");
    btn.id = "amb-toggle"; btn.type = "button";
    btn.textContent = muted ? "♪ off" : "♪ on";
    if (muted) btn.classList.add("off");
    btn.title = "Room tone";
    btn.addEventListener("click", function () { setMuted(!muted); if (!muted) startHum(); });
    document.body.appendChild(btn);
  }

  /* ---- wiring ---- */
  function arm() {
    if (armed) return; armed = true;
    var go = function () { if (!muted) startHum(); };
    document.addEventListener("pointerdown", go, { once: true });
    document.addEventListener("keydown", go, { once: true });
  }

  function wireTyping() {
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (!t) return;
      var tag = (t.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || t.isContentEditable;
      if (!typing) return;
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      click(e.key === "Backspace");
    }, true);
  }

  function init() { injectToggle(); wireTyping(); arm(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { click: click, arm: arm, setMuted: setMuted, isMuted: function () { return muted; } };
})();
