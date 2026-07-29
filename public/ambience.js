/* Room tone and interface sounds, running on the shared AudioBus.
 *
 *   - a fluorescent tube hum on the "ambience" channel: 120Hz mains buzz with
 *     odd harmonics, band-limited ballast hiss, a slow wander, and an
 *     occasional flicker.
 *   - the old-keyboard click from Penance on the "typing" channel, fired on
 *     every keystroke, not only inside text fields.
 *   - a short blip when the pointer first enters an interactive element, also
 *     on the "typing" channel.
 *
 * The hum only runs in the tab holding the continuous-audio lock, so a split
 * view showing two angeldom tabs does not play it twice.
 *
 * Volume and mute live in the dashboard settings panel via AudioBus; there is
 * no local toggle here any more.
 *
 *   Ambience.click(bad)   one key click
 *   Ambience.hover()      one hover blip
 */
window.Ambience = (function () {
  "use strict";

  var HUM = 0.12;                 // pre-channel level; AudioBus scales it
  var started = false, humGain = null, nodes = [], hasLock = false;

  function bus() { return window.AudioBus || null; }
  function ctx() { var b = bus(); return b ? b.ctx() : null; }

  /* ---- fluorescent hum ---- */
  function startHum() {
    var b = bus(); if (!b) return;
    var a = ctx(); if (!a || started) return;
    started = true;

    humGain = a.createGain();
    humGain.gain.value = HUM;
    humGain.connect(b.channel("ambience"));

    [[120, 1], [240, 0.5], [360, 0.28], [600, 0.12]].forEach(function (pair) {
      var o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = pair[0];
      var g = a.createGain();
      g.gain.value = 0.16 * pair[1];
      o.connect(g).connect(humGain);
      o.start(); nodes.push(o);
    });

    var len = 2 * a.sampleRate;
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var noise = a.createBufferSource(); noise.buffer = buf; noise.loop = true;
    var nf = a.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.7;
    var ng = a.createGain(); ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(humGain);
    noise.start(); nodes.push(noise);

    var lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
    var lg = a.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg).connect(humGain.gain);
    lfo.start(); nodes.push(lfo);

    scheduleFlicker();
  }
  function stopHum() {
    if (!started) return;
    started = false;
    nodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
    nodes = [];
    if (humGain) { try { humGain.disconnect(); } catch (e) {} humGain = null; }
  }
  function scheduleFlicker() {
    setTimeout(function () {
      if (started && humGain && ctx()) {
        var now = ctx().currentTime;
        var n = 2 + Math.floor(Math.random() * 3);
        for (var i = 0; i < n; i++) {
          var t = now + i * 0.09;
          humGain.gain.setValueAtTime(HUM * 0.2, t);
          humGain.gain.setValueAtTime(HUM * 1.5, t + 0.045);
        }
        humGain.gain.setValueAtTime(HUM, now + n * 0.09 + 0.05);
      }
      if (started) scheduleFlicker();
    }, 12000 + Math.random() * 40000);
  }

  /* ---- key click, ported from Penance ---- */
  function click(bad) {
    var b = bus(); if (!b) return;
    var a = ctx(); if (!a) return;
    var out = b.channel("typing"); if (!out) return;
    var now = a.currentTime;
    var len = Math.floor(a.sampleRate * 0.03);
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var n = a.createBufferSource(); n.buffer = buf;
    var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = bad ? 1300 : 2100; f.Q.value = 0.8;
    var g = a.createGain(); g.gain.value = bad ? 0.24 : 0.14;
    n.connect(f).connect(g).connect(out); n.start(now); n.stop(now + 0.03);
    var o = a.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(bad ? 88 : 150, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.04);
    var og = a.createGain();
    og.gain.setValueAtTime(bad ? 0.18 : 0.10, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(og).connect(out); o.start(now); o.stop(now + 0.06);
  }

  /* ---- hover blip: short, soft, high ---- */
  function hover() {
    var b = bus(); if (!b) return;
    var a = ctx(); if (!a) return;
    var out = b.channel("typing"); if (!out) return;
    var now = a.currentTime;
    var o = a.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(1750, now);
    o.frequency.exponentialRampToValueAtTime(2400, now + 0.03);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    o.connect(g).connect(out); o.start(now); o.stop(now + 0.09);
  }

  /* ---- wiring ---- */
  var HOVERABLE = "a,button,select,summary,[role='button'],input[type='range']," +
    "input[type='checkbox'],.adm-chip,.adm-mini,.adm-toggle,.adm-doc,.ctl-btn,.role,.ctl";
  var lastHover = null, lastHoverAt = 0;

  function wire() {
    // every keystroke clicks, wherever focus happens to be
    document.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      click(e.key === "Backspace" || e.key === "Delete");
    }, true);

    document.addEventListener("pointerover", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(HOVERABLE) : null;
      if (!t || t === lastHover) return;
      var now = Date.now();
      if (now - lastHoverAt < 45) { lastHover = t; return; }   // sweeping across a row
      lastHover = t; lastHoverAt = now;
      hover();
    }, true);
    document.addEventListener("pointerout", function (e) {
      if (e.target === lastHover) lastHover = null;
    }, true);
  }

  function init() {
    wire();
    var b = bus();
    if (!b) return;
    // only the lock holder runs the room tone
    b.claimContinuous(function (mine) {
      hasLock = mine;
      if (mine) startHum(); else stopHum();
    });
    // a gesture is still required before anything is audible
    var go = function () { if (hasLock) startHum(); };
    document.addEventListener("pointerdown", go);
    document.addEventListener("keydown", go);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { click: click, hover: hover };
})();
