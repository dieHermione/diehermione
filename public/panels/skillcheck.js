/* ============================================================================
   skill check — a needle runs the dial; press the key while it is in the arc.

   Ported from views/skillcheck.html. Timings, zone sizing and the judging rule
   are unchanged, including the one that matters: **the needle is judged where
   it is DRAWN, not at a freshly recomputed live angle**, so a frame of jank
   cannot grade a press the player never saw.

   What the port had to change: the page spawned dials anywhere in the viewport
   with `position: fixed`. Here they spawn inside a stage that fills the panel,
   measured through `Shell.room()`, so a dial can never land under the leopard
   frame or behind the nav. The corner HUD became a row above the stage, and
   the dial takes its colour from `--ink` rather than the retired accent `--c`.

   Three things must die on unmount: the rAF, the gap timer, and the document
   keydown listener.
   ========================================================================== */
(function () {
  "use strict";

  var SVG = "http://www.w3.org/2000/svg";
  var KEYS = [{ code: "Space", label: "SPACE", match: function (e) { return e.code === "Space"; } }]
    .concat(["1", "2", "3", "4", "5", "q", "e", "r", "g", "f"].map(function (k) {
      return { code: k, label: k.toUpperCase(), match: function (e) { return (e.key || "").toLowerCase() === k; } };
    }));

  var GAP_MIN = 900, GAP_MAX = 5000;
  var SWEEP_MIN = 850, SWEEP_MAX = 1450;
  var MIN_LEAD_MS = 520;        // travel before the zone opens, so it can be reacted to
  var NEEDLE_EASE = 1.05;       // demanding asks you to find a key: a little grace

  var host = null, dead = false;
  var reps = 10, mode = "simple", keyMode = "space";
  var run = null, check = null, raf = null, gapTimer = null, resolveTimer = null;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function ink() {
    return getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#171318";
  }

  /* ---------- sound: a chirp on spawn, a chime on a hit, a thud on a miss ---------- */
  function beep(freq, ms, type, gainTo) {
    var bus = window.AudioBus;
    var ctx = bus && bus.ctx();
    var out = bus && bus.channel("typing");
    if (!ctx || !out) return;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gainTo || 0.14, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    osc.connect(g); g.connect(out);
    osc.start(); osc.stop(ctx.currentTime + ms / 1000 + 0.02);
  }
  function sndSpawn() { beep(880, 90, "square", .10); setTimeout(function () { beep(1320, 70, "square", .08); }, 70); }
  function sndHit() { beep(1760, 120, "triangle", .16); }
  function sndMiss() { beep(110, 260, "sawtooth", .12); }

  /* ---------- the dial ---------- */
  function polar(cx, cy, r, deg) {
    var a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(cx, cy, r, from, to) {
    var p1 = polar(cx, cy, r, from), p2 = polar(cx, cy, r, to);
    return "M " + p1[0] + " " + p1[1] + " A " + r + " " + r + " 0 " +
      ((to - from) % 360 > 180 ? 1 : 0) + " 1 " + p2[0] + " " + p2[1];
  }

  function drawDial(c) {
    var S = c.size, cx = S / 2, cy = S / 2, r = S / 2 - 14;
    els.dial.setAttribute("viewBox", "0 0 " + S + " " + S);
    els.dial.setAttribute("width", S);
    els.dial.setAttribute("height", S);
    els.wrap.style.left = c.x + "px";
    els.wrap.style.top = c.y + "px";
    els.wrap.style.width = S + "px";
    els.wrap.style.height = S + "px";
    els.dial.replaceChildren();

    var ring = document.createElementNS(SVG, "circle");
    ring.setAttribute("cx", cx); ring.setAttribute("cy", cy); ring.setAttribute("r", r);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "rgba(23,19,24,.2)");
    ring.setAttribute("stroke-width", "3");
    els.dial.append(ring);

    var zone = document.createElementNS(SVG, "path");
    zone.setAttribute("d", arcPath(cx, cy, r, c.zoneFrom, c.zoneFrom + c.zoneSize));
    zone.setAttribute("fill", "none");
    zone.setAttribute("stroke", ink());
    zone.setAttribute("stroke-width", "11");
    zone.setAttribute("stroke-linecap", "butt");
    els.dial.append(zone);

    var needle = document.createElementNS(SVG, "line");
    needle.setAttribute("x1", cx); needle.setAttribute("y1", cy);
    needle.setAttribute("stroke", ink());
    needle.setAttribute("stroke-width", "2");
    els.dial.append(needle);
    c.needleEl = needle;
    c.geom = { cx: cx, cy: cy, r: r };

    els.key.replaceChildren();
    var inner = el("div", null, c.key.label);
    inner.append(el("small", null, "press in the arc"));
    els.key.append(inner);
  }

  function moveNeedle(c, deg) {
    var p = polar(c.geom.cx, c.geom.cy, c.geom.r + 4, deg);
    c.needleEl.setAttribute("x2", p[0]);
    c.needleEl.setAttribute("y2", p[1]);
    c.deg = deg;   // where the needle is actually DRAWN, for judging
  }

  /* ---------- a single check ---------- */
  function spawn() {
    if (dead || !els.stage) return;
    // the stage, not the viewport: a dial must never land under the frame
    var box = els.stage.getBoundingClientRect();
    var vw = box.width, vh = box.height;
    if (vw < 40 || vh < 40) { schedule(); return; }
    var size = Math.round(Math.min(vw, vh) * (0.42 + Math.random() * 0.26));
    var x = Math.round((vw - size) / 2 + (Math.random() - 0.5) * (vw - size) * 0.9);
    var y = Math.round((vh - size) / 2 + (Math.random() - 0.5) * (vh - size) * 0.9);
    x = Math.max(0, Math.min(vw - size, x));
    y = Math.max(0, Math.min(vh - size, y));

    var zoneSize = 18 + Math.random() * 12;
    var sweep = (SWEEP_MIN + Math.random() * (SWEEP_MAX - SWEEP_MIN)) * 0.85 * NEEDLE_EASE;
    // never on or just in front of the needle, and the whole arc stays on the dial
    var minFrom = (MIN_LEAD_MS / sweep) * 360;
    var maxFrom = 350 - zoneSize;
    var zoneFrom = minFrom + Math.random() * Math.max(0, maxFrom - minFrom);

    var pool = keyMode === "space" ? [KEYS[0]] : KEYS;
    check = {
      size: size, x: x, y: y, zoneFrom: zoneFrom, zoneSize: zoneSize, sweep: sweep,
      key: pool[Math.floor(Math.random() * pool.length)],
      start: performance.now(), done: false,
      shake: Math.random() < 0.32,
      drift: Math.random() < 0.45,
      dx: (Math.random() - 0.5) * 70,
      dy: (Math.random() - 0.5) * 50,
    };
    els.wrap.hidden = false;
    els.wrap.className = "sc-wrap" + (check.shake ? " shake" : "");
    drawDial(check);
    moveNeedle(check, 0);
    sndSpawn();
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (dead || !check || check.done) return;
    var t = (now - check.start) / check.sweep;
    if (t >= 1) { resolve(false); return; }
    moveNeedle(check, t * 360);
    if (check.drift) {
      els.wrap.style.left = (check.x + check.dx * t) + "px";
      els.wrap.style.top = (check.y + check.dy * t) + "px";
    }
    raf = requestAnimationFrame(tick);
  }

  function resolve(hit) {
    if (!check || check.done) return;
    check.done = true;
    cancelAnimationFrame(raf);
    els.wrap.className = "sc-wrap " + (hit ? "good" : "bad");
    // finishing means landing `reps` IN A ROW; any miss clears the streak
    if (hit) { run.streak++; run.best = Math.max(run.best, run.streak); sndHit(); }
    else { run.failed++; run.streak = 0; sndMiss(); }
    paint();
    resolveTimer = setTimeout(function () {
      if (dead) return;
      els.wrap.hidden = true;
      check = null;
      if (hit && run.streak >= reps) return finish();
      paint();
      schedule();
    }, 420);
  }

  function schedule() {
    clearTimeout(gapTimer);
    gapTimer = setTimeout(spawn, GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN));
  }

  function paint() {
    els.rep.textContent = Math.min(run.streak, reps) + " / " + reps;
    els.best.textContent = String(run.best);
    els.failed.textContent = String(run.failed);
    els.pips.replaceChildren();
    for (var i = 0; i < reps; i++) els.pips.append(el("i", "pip" + (i < run.streak ? " hit" : "")));
  }

  function onKey(e) {
    if (e.repeat) return;
    var tag = ((e.target && e.target.tagName) || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (!run || !check || check.done) return;
    var pool = keyMode === "space" ? [KEYS[0]] : KEYS;
    if (!pool.some(function (k) { return k.match(e); })) return;   // only a key that could be asked
    e.preventDefault();
    if (!check.key.match(e)) { resolve(false); return; }
    var deg = (check.deg != null) ? check.deg : ((performance.now() - check.start) / check.sweep) * 360;
    resolve(deg >= check.zoneFrom && deg <= check.zoneFrom + check.zoneSize);
  }

  /* ---------- screens ---------- */
  function drawSetup() {
    if (dead) return;
    stopRun();
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Timing"), el("h1", null, "Skill Check"));
    host.append(el("p", "lede", "A needle runs around the dial. Press the key drawn in the middle while the needle is inside the arc. Land your number of checks in a row to finish."));
    host.append(el("div", "rule"));

    var modeField = el("div", "field");
    modeField.append(el("div", "flabel", "mode"));
    var modeChips = el("div", "chips");
    var hint = el("div", "note");
    [["simple", "the space bar only"], ["demanding", "any of ten keys"]].forEach(function (pair) {
      var c = el("button", "chip" + (pair[0] === mode ? " on" : ""), pair[0]);
      c.type = "button";
      c.addEventListener("click", function () {
        mode = pair[0];
        keyMode = mode === "demanding" ? "all" : "space";
        modeChips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === c); });
        hint.textContent = pair[0] + ": " + pair[1] + ".";
      });
      modeChips.append(c);
    });
    hint.textContent = mode + ": " + (mode === "simple" ? "the space bar only" : "any of ten keys") + ".";
    modeField.append(modeChips);

    var repField = el("div", "field");
    repField.append(el("div", "flabel", "in a row"));
    var repChips = el("div", "chips");
    var repCustom = document.createElement("input");
    repCustom.type = "text"; repCustom.inputMode = "numeric"; repCustom.maxLength = 3;
    repCustom.placeholder = "or a number";
    repCustom.style.maxWidth = "9rem";
    repCustom.setAttribute("aria-label", "a number of checks");
    [10, 20, 35, 50].forEach(function (n) {
      var c = el("button", "chip" + (n === reps ? " on" : ""), String(n));
      c.type = "button";
      c.addEventListener("click", function () {
        reps = n; repCustom.value = "";
        repChips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === c); });
      });
      repChips.append(c);
    });
    repCustom.addEventListener("input", function () {
      repCustom.value = repCustom.value.replace(/\D/g, "").slice(0, 3);
      var n = Math.max(1, Math.min(999, parseInt(repCustom.value, 10) || 0));
      if (n) { reps = n; repChips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); }); }
    });
    repChips.append(repCustom);
    repField.append(repChips);

    var begin = el("button", "go", "Begin");
    begin.type = "button";
    begin.addEventListener("click", function () {
      if (window.AudioBus) window.AudioBus.ctx();   // the gesture that starts audio
      drawPlay();
    });
    host.append(modeField, repField, hint, begin);
  }

  function drawPlay() {
    run = { streak: 0, best: 0, failed: 0 };
    host.replaceChildren();

    var hud = el("div", "sc-hud");
    var mk = function (label) {
      var d = el("div", null, label);
      var b = document.createElement("b");
      d.append(b);
      hud.append(d);
      return b;
    };
    els.rep = mk("in a row");
    els.best = mk("best");
    els.failed = mk("missed");
    els.mode = mk("mode");
    els.mode.textContent = mode;

    els.pips = el("div", "sc-pips");

    els.stage = el("div", "sc-stage");
    els.wrap = el("div", "sc-wrap");
    els.wrap.hidden = true;
    els.dial = document.createElementNS(SVG, "svg");
    els.key = el("div", "sc-key");
    els.wrap.append(els.dial, els.key);
    els.stage.append(els.wrap);

    var give = el("button", "go ghost", "Give up");
    give.type = "button";
    give.addEventListener("click", drawSetup);
    var acts = el("div", "actions");
    acts.append(give);

    host.append(hud, els.pips, els.stage, acts);
    paint();
    schedule();
  }

  function finish() {
    clearTimeout(gapTimer);
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Finished"), el("h1", null, "Held."));
    host.append(el("div", "rule"));
    var rows = el("div", "rows");
    [["In a row", String(reps)], ["Missed along the way", String(run.failed)], ["Mode", mode]].forEach(function (p) {
      var r = el("div", "row");
      r.append(el("span", "k", p[0]), el("span", "v", p[1]));
      rows.append(r);
    });
    host.append(rows);
    var again = el("button", "go", "Again");
    again.type = "button";
    again.addEventListener("click", function () {
      if (window.AudioBus) window.AudioBus.ctx();
      drawPlay();
    });
    var back = el("button", "go ghost", "Settings");
    back.type = "button";
    back.addEventListener("click", drawSetup);
    var acts = el("div", "actions");
    acts.style.marginTop = "1.4rem";
    acts.append(again, back);
    host.append(acts);
  }

  function stopRun() {
    clearTimeout(gapTimer); gapTimer = null;
    clearTimeout(resolveTimer); resolveTimer = null;
    cancelAnimationFrame(raf); raf = null;
    if (check) check.done = true;
    check = null; run = null;
  }

  window.Shell.register("skillcheck", {
    label: "skill check",
    wide: true,
    mount: function (h) {
      host = h; dead = false;
      document.addEventListener("keydown", onKey, true);
      drawSetup();
    },
    unmount: function () {
      dead = true;
      stopRun();
      document.removeEventListener("keydown", onKey, true);
      host = null; els = {};
    },
  });
})();
