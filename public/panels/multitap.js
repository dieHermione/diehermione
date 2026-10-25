/* ============================================================================
   multitap — typing on an old-phone keypad, deliberately unguided.

   Ported from views/multitap.html. The run is the writing games' server-owned
   one (`mode: "multitap"`), so the sequence, the per-line check and the count
   are unchanged. The pool is `multitap.json`, editable in Admin; the hard-coded
   line here is only a fallback if the fetch fails.

   **Mouse only, by design** — the physical keyboard is ignored, so there is no
   keydown listener to register or tear down. A pending letter commits when any
   other key is pressed; `#` confirms, `*` deletes, `0` confirms-then-spaces.

   Changed in the port: the page called `window.playType()` inside a try/catch
   and **nothing has ever defined it**, so the keypad was silent. It now makes
   the same key click devotion does, on AudioBus's typing channel.
   ========================================================================== */
(function () {
  "use strict";

  // key -> the letters it cycles through. 0 is space; * deletes; # confirms.
  var MAP = {
    "1": [".", ",", "?", "!", "'", "-", "(", ")"],
    "2": ["a", "b", "c"], "3": ["d", "e", "f"], "4": ["g", "h", "i"],
    "5": ["j", "k", "l"], "6": ["m", "n", "o"], "7": ["p", "q", "r", "s"],
    "8": ["t", "u", "v"], "9": ["w", "x", "y", "z"],
    // 0 is NOT listed: space is handled in press() so it can never be *pending*
  };
  // what a real keypad has printed on it; * and # are labelled so they are findable
  var LABELS = {
    "1": ".,-()", "2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno",
    "7": "pqrs", "8": "tuv", "9": "wxyz", "*": "del", "0": "space", "#": "ok",
  };
  var ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  var POOL = ["an angel is a spiritual, heavenly, or supernatural entity, usually humanoid with bird-like wings, often depicted as a messenger or intermediary between god and humanity."];

  var host = null, dead = false;
  var lines = [], idx = 0, target = "", typed = "", pending = null;
  var mistakes = 0, lineMistakesAt = 0, startedAt = 0, playing = false;
  var reps = 5, source = "preset", customLines = [];
  var runId = null, lineFailed = false;
  var els = {}, keyEls = {}, flashes = [];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function click() {
    var bus = window.AudioBus;
    var a = bus && bus.ctx();
    var out = bus && bus.channel("typing");
    if (!a || !out) return;
    var now = a.currentTime, len = Math.floor(a.sampleRate * 0.03);
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var n = a.createBufferSource(); n.buffer = buf;
    var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2100; f.Q.value = 0.8;
    var g = a.createGain(); g.gain.value = 0.09;
    n.connect(f).connect(g).connect(out); n.start(now); n.stop(now + 0.03);
  }

  /* ---------- settings ---------- */
  function activePool() { return source === "custom" ? customLines : POOL; }

  function drawStart() {
    if (dead) return;
    playing = false;
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Typing"), el("h1", null, "Multitap"));
    host.append(el("p", "lede", "One key, several letters. Press it again to cycle, any other key to commit."));
    host.append(el("div", "rule"));

    var srcField = el("div", "field");
    srcField.append(el("div", "flabel", "lines"));
    var srcChips = el("div", "chips");
    var ownField = el("div", "field");
    ownField.append(el("div", "flabel", "your lines · one per row"));
    var own = document.createElement("textarea");
    own.spellcheck = false;
    own.placeholder = "i belong to her";
    own.setAttribute("aria-label", "your lines");
    ownField.append(own);
    ownField.hidden = source !== "custom";

    [["preset", "preset"], ["custom", "custom"]].forEach(function (pair) {
      var c = el("button", "chip" + (pair[0] === source ? " on" : ""), pair[1]);
      c.type = "button";
      c.addEventListener("click", function () {
        source = pair[0];
        srcChips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === c); });
        ownField.hidden = source !== "custom";
        refreshBegin();
      });
      srcChips.append(c);
    });
    srcField.append(srcChips);

    // the keypad can only produce these characters, so the lines are held to them
    own.addEventListener("input", function () {
      customLines = own.value.split("\n")
        .map(function (l) { return l.toLowerCase().replace(/[^a-z0-9 .,?!'()-]/g, "").trim(); })
        .filter(Boolean);
      refreshBegin();
    });

    var repField = el("div", "field");
    repField.append(el("div", "flabel", "repetitions"));
    var repChips = el("div", "chips");
    var repCustom = document.createElement("input");
    repCustom.type = "text";
    repCustom.inputMode = "numeric";
    repCustom.maxLength = 3;
    repCustom.placeholder = "or a number";
    repCustom.style.maxWidth = "9rem";
    repCustom.setAttribute("aria-label", "a number of repetitions");
    [5, 10, 20].forEach(function (n) {
      var c = el("button", "chip" + (n === reps ? " on" : ""), String(n));
      c.type = "button";
      c.addEventListener("click", function () {
        reps = n; repCustom.value = "";
        repChips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === c); });
      });
      repChips.append(c);
    });
    repCustom.addEventListener("input", function () {
      repCustom.value = repCustom.value.replace(/\D/g, "").slice(0, 3);   // digits only, no spinner
      var n = Math.max(1, Math.min(999, parseInt(repCustom.value, 10) || 0));
      if (n) { reps = n; repChips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); }); }
    });
    repChips.append(repCustom);
    repField.append(repChips);

    els.begin = el("button", "go", "Begin");
    els.begin.type = "button";
    els.begin.addEventListener("click", start);
    els.warn = el("div", "warn");

    host.append(srcField, ownField, repField, els.begin, els.warn);

    // the live, editable pool; the fallback above stands if this fails
    fetch("/api/multitap").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (dead) return;
      if (d && Array.isArray(d.lines) && d.lines.length) POOL = d.lines;
      refreshBegin();
    }).catch(function () {});
    refreshBegin();
  }
  function refreshBegin() { if (els.begin) els.begin.disabled = activePool().length === 0; }

  function start() {
    if (!activePool().length) return;
    els.begin.disabled = true;
    els.warn.textContent = "";
    fetch("/api/writing/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "multitap", reps: reps, ownLines: source === "custom" ? customLines : undefined }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Could not start.");
        return d;
      });
    }).then(function (d) {
      if (dead) return;
      runId = d.id; lineFailed = false;
      lines = d.lines;                 // the server's sequence, not ours
      idx = 0; target = lines[0]; typed = ""; pending = null;
      mistakes = 0; lineMistakesAt = 0; startedAt = Date.now(); playing = true;
      drawPlay();
    }).catch(function (e) {
      if (dead) return;
      els.begin.disabled = false;
      els.warn.textContent = e.message || "Could not start.";
    });
  }

  /* ---------- play ---------- */
  function drawPlay() {
    host.replaceChildren();
    var head = el("div", "mt-head");
    els.ln = document.createElement("b");
    els.lt = document.createElement("b");
    head.append(document.createTextNode("line "), els.ln, document.createTextNode(" of "), els.lt);
    els.ln.textContent = "1";
    els.lt.textContent = String(lines.length);

    els.example = el("div", "mt-example");
    els.entry = el("div", "mt-entry");
    els.pad = el("div", "mt-pad");

    keyEls = {};
    ORDER.forEach(function (k) {
      var b = el("button", "mt-key");
      b.type = "button";
      b.append(el("span", "kn", k), el("span", "kl", LABELS[k]));
      b.addEventListener("click", function () { press(k); });
      keyEls[k] = b;
      els.pad.append(b);
    });

    var give = el("button", "go ghost", "Give up");
    give.type = "button";
    give.addEventListener("click", drawStart);
    var acts = el("div", "actions");
    acts.append(give);

    host.append(head, els.example, els.entry, els.pad, acts);
    render();
  }

  function pendingChar() {
    if (!pending) return "";
    var set = MAP[pending.key];
    return set[pending.count % set.length];
  }

  function render() {
    if (!els.entry) return;
    els.example.textContent = target;
    els.entry.replaceChildren();
    // A space is appended as a bare text node, NOT wrapped in a span: it has no
    // glyph to colour, and a plain space between inline elements is the one
    // wrapping technique every engine is guaranteed to break a line at.
    for (var i = 0; i < typed.length; i++) {
      if (typed[i] === " ") { els.entry.append(document.createTextNode(" ")); continue; }
      els.entry.append(el("span", typed[i] === target[i] ? "done" : "bad", typed[i]));
    }
    if (pending) {
      var pc = pendingChar();
      els.entry.append(el("span", "cur", pc === " " ? " " : pc));
    } else {
      els.entry.append(el("span", "caret", " "));
    }
    // keep the caret (always the last node) in view on a long custom line
    els.entry.scrollTop = els.entry.scrollHeight;
  }

  function flash(k) {
    var e = keyEls[k];
    if (!e) return;
    e.classList.add("hit");
    var t = setTimeout(function () { e.classList.remove("hit"); }, 90);
    flashes.push(t);
  }

  /* Append one finalised character. Returns true only if the line is still
     running: a wrong character restarts the phrase, a full line completes it. */
  function commitChar(ch) {
    var pos = typed.length;
    if (pos >= target.length) return false;
    if (ch !== target[pos]) { mistakes++; typed += ch; resetPhrase(); return false; }
    typed += ch;
    if (typed.length >= target.length) { lineComplete(); return false; }
    return true;
  }
  function confirmCurrent() {
    if (!pending) return true;
    var ch = pendingChar();
    pending = null;
    return commitChar(ch);
  }
  function resetPhrase() {
    typed = ""; pending = null;                    // one wrong letter = start over
    render();
    els.entry.classList.add("wrong");
    flashes.push(setTimeout(function () { if (els.entry) els.entry.classList.remove("wrong"); }, 350));
  }
  function deleteOne() {
    if (pending) pending = null;                   // drop the uncommitted letter
    else if (typed.length) typed = typed.slice(0, -1);
    els.entry.classList.remove("wrong");
    render();
  }
  function lineComplete() {
    els.entry.classList.remove("wrong");
    render();
    // report BEFORE moving on, so the server's count is current by the last line
    reportLine(idx, target, mistakes - lineMistakesAt).then(function () {
      flashes.push(setTimeout(nextLine, 240));
    });
  }
  function reportLine(index, text, errs) {
    if (!runId) return Promise.resolve();
    return fetch("/api/writing/line", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: runId, index: index, text: text, mistakes: errs }),
    }).then(function (r) { if (!r.ok) lineFailed = true; })
      .catch(function () { lineFailed = true; });
  }
  function nextLine() {
    if (dead) return;
    idx++;
    if (idx >= lines.length) { finish(); return; }
    target = lines[idx]; typed = ""; pending = null;
    lineMistakesAt = mistakes;
    els.entry.classList.remove("wrong");
    els.ln.textContent = String(idx + 1);
    render();
  }

  function press(k) {
    if (!playing) return;
    flash(k);
    click();
    if (k === "*") { deleteOne(); return; }
    if (k === "#") { confirmCurrent(); render(); return; }
    if (k === "0") {
      // the FIRST press only confirms a pending letter; only a press with
      // nothing pending enters an actual space
      if (pending) { confirmCurrent(); render(); return; }
      commitChar(" ");
      render();
      return;
    }
    if (!MAP[k]) return;
    if (pending && pending.key === k) { pending.count++; render(); return; }   // same key cycles
    if (!confirmCurrent()) return;                 // reset or completed — swallow this key
    pending = { key: k, count: 0 };
    render();
  }

  /* ---------- done ---------- */
  function finish() {
    playing = false;
    var secs = Math.round((Date.now() - startedAt) / 1000);
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Finished"), el("h1", null, "Typed."));
    host.append(el("div", "rule"));
    var rows = el("div", "rows");
    [["Lines", String(lines.length)], ["Mistakes", String(mistakes)],
     ["Time", Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")]].forEach(function (p) {
      var r = el("div", "row");
      r.append(el("span", "k", p[0]), el("span", "v", p[1]));
      rows.append(r);
    });
    host.append(rows);
    var note = el("div", "note");
    var again = el("button", "go", "Again");
    again.type = "button";
    again.addEventListener("click", drawStart);
    var acts = el("div", "actions");
    acts.style.marginTop = "1.4rem";
    acts.append(again);
    host.append(note, acts);

    fetch("/api/writing/complete", { method: "POST" }).then(function (r) {
      if (dead) return;
      note.textContent = r.ok ? "Logged to her record."
        : (lineFailed ? "Not logged: the run could not be verified." : "Not logged.");
    }).catch(function () { if (!dead) note.textContent = "Not logged."; });
  }

  window.Shell.register("multitap", {
    label: "multitap",
    wide: true,
    mount: function (h) {
      host = h; dead = false; playing = false; flashes = [];
      window.__skipStage = function () {
        if (!playing) return Promise.resolve(false);
        return fetch("/api/writing/skip", { method: "POST" }).then(function (r) {
          if (!r.ok) { lineFailed = true; return false; }
          nextLine();
          return true;
        }).catch(function () { lineFailed = true; return false; });
      };
      drawStart();
    },
    unmount: function () {
      dead = true; playing = false;
      flashes.forEach(clearTimeout);
      flashes = [];
      delete window.__skipStage;
      host = null; els = {}; keyEls = {};
    },
  });
})();
