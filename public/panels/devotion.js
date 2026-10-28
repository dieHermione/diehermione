/* ============================================================================
   devotion — the writing game, in the panel.

   Ported from views/writing.html. The run loop is unchanged and still
   server-owned: POST /api/writing/session hands back the sequence IT built,
   every finished line is checked by POST /api/writing/line, and
   POST /api/writing/complete refuses unless the server's own count says the run
   is finished. Nothing here is trusted with a number.

   What is gone from the page version: the boot sequence (the shell has
   no terminal to boot) and the raw AudioContext. The key clicks now run through
   AudioBus's `typing` channel, so the Typing slider in Settings — two clicks
   away in this same shell — actually governs them.

   Three screens live inside one mount; `screen` says which, and the document
   keydown listener is a no-op unless it is "play".
   ========================================================================== */
(function () {
  "use strict";

  var REPS_PRESETS = [25, 50, 100];
  var MAX_REPS = 9999;

  var host = null, screen = "setup";
  var reps = 50, ownText = "";
  var run = { id: null, lines: [], reps: 0, idx: 0, typed: 0, mistakes: 0, correct: 0, startedAt: 0, lineMistakesAt: 0 };
  var lineFailed = false;

  /* ---------- key clicks, on the typing channel ---------- */
  function click(bad) {
    var bus = window.AudioBus;
    if (!bus) return;
    var a = bus.ctx();
    if (!a) return;
    var out = bus.channel("typing");
    if (!out) return;
    var now = a.currentTime;
    var len = Math.floor(a.sampleRate * 0.03);
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var n = a.createBufferSource(); n.buffer = buf;
    var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = bad ? 1300 : 2100; f.Q.value = 0.8;
    var g = a.createGain(); g.gain.value = bad ? 0.16 : 0.09;
    n.connect(f).connect(g).connect(out); n.start(now); n.stop(now + 0.03);
    var o = a.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(bad ? 88 : 150, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.04);
    var og = a.createGain();
    og.gain.setValueAtTime(bad ? 0.12 : 0.06, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(og).connect(out); o.start(now); o.stop(now + 0.06);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function parseLines(text) {
    return text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  /* ---------- setup ---------- */
  function drawSetup() {
    screen = "setup";
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Writing"), el("h1", null, "Devotion"));
    host.append(el("p", "lede", "Write the lines you are given, over and over, until they are yours."));
    host.append(el("div", "rule"));

    var repsField = el("div", "field");
    repsField.append(el("div", "flabel", "repetitions"));
    var chips = el("div", "chips");
    var custom = document.createElement("input");
    custom.type = "text";
    custom.inputMode = "numeric";
    custom.placeholder = "or a number";
    custom.style.maxWidth = "9rem";
    custom.setAttribute("aria-label", "a number of repetitions");

    var paintChips = function () {
      chips.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("on", Number(c.dataset.reps) === reps);
      });
    };
    REPS_PRESETS.forEach(function (n) {
      var c = el("button", "chip", String(n));
      c.type = "button";
      c.dataset.reps = String(n);
      c.addEventListener("click", function () { reps = n; custom.value = ""; paintChips(); });
      chips.append(c);
    });
    custom.addEventListener("input", function () {
      custom.value = custom.value.replace(/\D/g, "");
      var n = parseInt(custom.value, 10);
      if (Number.isInteger(n) && n > 0) { reps = Math.min(MAX_REPS, n); paintChips(); }
    });
    chips.append(custom);
    paintChips();
    repsField.append(chips);

    var linesField = el("div", "field");
    linesField.append(el("div", "flabel", "your lines · one per row"));
    var ta = document.createElement("textarea");
    ta.value = ownText;
    ta.setAttribute("aria-label", "the lines to write");
    linesField.append(ta);

    var warn = el("div", "warn");
    var begin = el("button", "go", "Begin");
    begin.type = "button";

    var refresh = function () { begin.disabled = parseLines(ta.value).length === 0; };
    ta.addEventListener("input", function () { ownText = ta.value; refresh(); });
    refresh();

    begin.addEventListener("click", function () { start(parseLines(ta.value), begin, warn); });

    host.append(repsField, linesField, begin, warn);
    ta.focus();
  }

  function start(own, begin, warn) {
    if (!own.length) return;
    begin.disabled = true;
    warn.textContent = "";
    fetch("/api/writing/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "devotion", reps: reps, ownLines: own }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (out) {
      begin.disabled = false;
      if (!out.ok) { warn.textContent = out.d.error || "Could not start."; return; }
      run = {
        id: out.d.id,
        lines: out.d.lines,          // the server's sequence, not ours
        reps: out.d.reps,
        idx: 0, typed: 0, mistakes: 0, correct: 0,
        startedAt: Date.now(), lineMistakesAt: 0,
      };
      lineFailed = false;
      drawPlay();
    }).catch(function () {
      begin.disabled = false;
      warn.textContent = "Could not start.";
    });
  }

  /* ---------- play ---------- */
  var targetEl = null, barEl = null, repEl = null, errEl = null;

  function drawPlay() {
    screen = "play";
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Devotion"));

    var meter = el("div", "meter");
    var mk = function (label) {
      var d = el("div", null, label);
      var b = document.createElement("b");
      d.append(b);
      meter.append(d);
      return b;
    };
    repEl = mk("line");
    errEl = mk("slips");
    host.append(meter);

    var bar = el("div", "bar");
    barEl = document.createElement("i");
    bar.append(barEl);

    targetEl = el("div", "target");
    host.append(targetEl, bar);

    var give = el("button", "go ghost", "Give up");
    give.type = "button";
    give.addEventListener("click", drawSetup);
    var actions = el("div", "actions");
    actions.append(give);
    host.append(actions);

    startLine();
  }

  function current() { return run.lines[run.idx % run.lines.length]; }

  function startLine() {
    run.typed = 0;
    run.lineMistakesAt = run.mistakes;
    repEl.textContent = pad(run.idx + 1) + " / " + pad(run.reps);
    errEl.textContent = pad(run.mistakes);
    paintTarget();
  }

  function paintTarget() {
    var text = current();
    targetEl.replaceChildren();
    var done = el("span", "done", text.slice(0, run.typed));
    var cur = el("span", "cur", text.slice(run.typed, run.typed + 1) || " ");
    targetEl.append(done, cur, document.createTextNode(text.slice(run.typed + 1)));
    barEl.style.width = (run.typed / text.length * 100).toFixed(2) + "%";
  }

  function onKey(e) {
    if (screen !== "play") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Backspace") { e.preventDefault(); return; }   // no going back
    var key = e.key === "Enter" ? "\n" : e.key;
    if (key.length !== 1 && key !== "\n") return;
    e.preventDefault();
    var text = current();
    if (key === text[run.typed]) {
      run.typed++; run.correct++; click(false);
      if (run.typed >= text.length) { finishLine(); return; }
      paintTarget();
    } else {
      // a slip restarts the current line
      run.mistakes++; click(true);
      errEl.textContent = pad(run.mistakes);
      run.typed = 0;
      paintTarget();
    }
  }

  /* Report the line BEFORE moving on, so the server's count is up to date by the
     time the last line triggers /complete. */
  function finishLine() {
    var index = run.idx, text = current(), slips = run.mistakes - run.lineMistakesAt;
    fetch("/api/writing/line", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: run.id, index: index, text: text, mistakes: slips }),
    }).then(function (r) { if (!r.ok) lineFailed = true; })
      .catch(function () { lineFailed = true; })
      .then(advance);
  }

  function advance() {
    run.idx++;
    if (run.idx >= run.reps) { drawDone(); return; }
    startLine();
  }

  /* ---------- done ---------- */
  function drawDone() {
    screen = "done";
    var secs = Math.round((Date.now() - run.startedAt) / 1000);
    var time = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");

    host.replaceChildren();
    host.append(el("div", "eyebrow", "Finished"), el("h1", null, "Written."));
    host.append(el("div", "rule"));

    // Accuracy is left blank until /complete answers with the figure it RECORDED.
    // Showing a locally-computed one first would mean the screen disagrees with
    // her record by a point: the client counts keystrokes, the server letters.
    var accCell = null;
    var rows = el("div", "rows");
    [["Lines", String(run.reps)], ["Slips", String(run.mistakes)],
     ["Accuracy", "—"], ["Time", time]].forEach(function (pair) {
      var r = el("div", "row");
      var v = el("span", "v", pair[1]);
      if (pair[0] === "Accuracy") accCell = v;
      r.append(el("span", "k", pair[0]), v);
      rows.append(r);
    });
    host.append(rows);

    // each unique line once, with how many times it was typed
    var counts = new Map();
    for (var i = 0; i < run.reps; i++) {
      var l = run.lines[i % run.lines.length];
      counts.set(l, (counts.get(l) || 0) + 1);
    }
    var tr = el("div", "transcript");
    tr.style.marginTop = "1.6rem";
    counts.forEach(function (c, l) {
      var d = document.createElement("div");
      d.append(document.createTextNode("“" + l + "”  "), el("span", null, "× " + c));
      tr.append(d);
    });
    host.append(tr);

    var note = el("div", "note");
    host.append(note);

    var actions = el("div", "actions");
    actions.style.marginTop = "1.4rem";
    var again = el("button", "go", "Again");
    again.type = "button";
    again.addEventListener("click", drawSetup);
    actions.append(again);
    host.append(actions);

    // The server derives every number from the run it owns, so there is nothing
    // to send and nothing to forge; it refuses an unfinished run.
    fetch("/api/writing/complete", { method: "POST" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (out) {
      note.textContent = out.ok ? "Logged to her record."
        : (lineFailed ? "Not logged: the run could not be verified." : "Not logged.");
      if (out.ok && typeof out.d.accuracy === "number") accCell.textContent = out.d.accuracy + "%";
    }).catch(function () { note.textContent = "Not logged."; });
  }

  function noPaste(e) { if (screen === "play") e.preventDefault(); }

  window.Shell.register("devotion", {
    label: "devotion",
    mount: function (h) {
      host = h;
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("paste", noPaste);
      document.addEventListener("drop", noPaste);
      // console hook (`pray skip_stage`): the SERVER re-checks isAdmin and does
      // the counting, so a skipped line is real progress, not a client fiction.
      window.__skipStage = function () {
        if (screen !== "play") return Promise.resolve(false);
        return fetch("/api/writing/skip", { method: "POST" }).then(function (r) {
          if (!r.ok) { lineFailed = true; return false; }
          advance();
          return true;
        }).catch(function () { lineFailed = true; return false; });
      };
      drawSetup();
    },
    unmount: function () {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("paste", noPaste);
      document.removeEventListener("drop", noPaste);
      delete window.__skipStage;
      screen = "setup";
      host = null;
    },
  });
})();
