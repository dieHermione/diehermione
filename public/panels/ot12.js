/* ============================================================================
   ot12 — LOONA trivia, in the panel.

   Ported from views/ot12.html. The run is server-owned and unchanged:
   /api/ot12/session → /answer → /skip (admin) → /complete, and the correct set
   is never sent until after the answer. A round is either a photo Hermione
   tagged (several members may be right, so the options toggle) or a trait
   question generated server-side.

   Its sounds already rode AudioBus's typing channel, so they came across as
   they were. Three screens live inside one mount.
   ========================================================================== */
(function () {
  "use strict";

  var host = null, dead = false;
  var runId = null, rounds = 10, index = 0, answering = false, picked = null, timer = null;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* a bright triangle chirp on correct, a low sawtooth thud on wrong — the same
     vocabulary as skill check's hit/miss */
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
  function sndCorrect() { beep(1320, 90, "triangle", .16); setTimeout(function () { beep(1760, 110, "triangle", .14); }, 80); }
  function sndWrong() { beep(110, 260, "sawtooth", .12); }

  /* ---------- start ---------- */
  function drawStart() {
    if (dead) return;
    host.replaceChildren();
    host.append(el("div", "eyebrow", "Trivia"), el("h1", null, "OT12"));
    host.append(el("p", "lede", "Name who is in the photograph, or answer what is asked."));
    host.append(el("div", "rule"));

    var field = el("div", "field");
    field.append(el("div", "flabel", "rounds"));
    var chips = el("div", "chips");
    [10, 20, 40].forEach(function (n) {
      var c = el("button", "chip" + (n === rounds ? " on" : ""), String(n));
      c.type = "button";
      c.addEventListener("click", function () {
        rounds = n;
        chips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === c); });
      });
      chips.append(c);
    });
    field.append(chips);

    els.status = el("div", "note");
    els.begin = el("button", "go", "Begin");
    els.begin.type = "button";
    els.begin.disabled = true;
    els.begin.addEventListener("click", begin);

    host.append(field, els.begin, els.status);
    refreshStatus();
  }

  /* Trivia is baked into the server and always available; only photo rounds
     depend on what she has tagged. */
  function refreshStatus() {
    fetch("/api/ot12/status").then(function (r) { return r.json(); }).then(function (d) {
      if (dead || !els.status) return;
      if (!d.photos && !d.traitKinds) {
        els.status.textContent = "Nothing to play yet.";
        els.begin.disabled = true;
      } else if (!d.photos) {
        els.status.textContent = "Trivia only for now — no photos yet.";
        els.begin.disabled = false;
      } else if (d.membersCovered < 2) {
        els.status.textContent = "Trivia only for now — at least two members need photos to unlock photo rounds.";
        els.begin.disabled = false;
      } else {
        els.status.textContent = d.photos + " photo" + (d.photos === 1 ? "" : "s") +
          " · " + d.membersCovered + " member" + (d.membersCovered === 1 ? "" : "s") + " tagged · trivia included";
        els.begin.disabled = false;
      }
    }).catch(function () {
      if (dead || !els.status) return;
      els.status.textContent = "Could not reach the archive.";
      els.begin.disabled = true;
    });
  }

  function begin() {
    els.begin.disabled = true;
    fetch("/api/ot12/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rounds: rounds }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Could not start.");
        return d;
      });
    }).then(function (d) {
      if (dead) return;
      runId = d.id;
      drawPlay();
      showRound(d.round, 0);
    }).catch(function (e) {
      if (dead) return;
      els.status.textContent = e.message || "Could not start.";
      els.begin.disabled = false;
    });
  }

  /* ---------- play ---------- */
  function drawPlay() {
    host.replaceChildren();
    var head = el("div", "ot-head");
    els.rn = document.createElement("b");
    els.rt = document.createElement("b");
    els.sc = document.createElement("b");
    var left = el("span"); left.append(document.createTextNode("round "), els.rn, document.createTextNode(" of "), els.rt);
    var right = el("span"); right.append(els.sc, document.createTextNode(" correct"));
    head.append(left, right);

    els.photo = document.createElement("img");
    els.photo.className = "ot-photo";
    els.photo.alt = "";
    els.photo.hidden = true;
    els.prompt = el("div", "ot-prompt");
    els.prompt.hidden = true;
    els.opts = el("div", "chips ot-opts");
    els.submit = el("button", "go", "Submit");
    els.submit.type = "button";
    els.submit.disabled = true;
    els.submit.addEventListener("click", answer);
    els.verdict = el("div", "note");
    var acts = el("div", "actions");
    acts.append(els.submit);

    host.append(head, els.photo, els.prompt, els.opts, acts, els.verdict);
  }

  function showRound(round, score) {
    if (dead) return;
    index = round.index;
    var isPhoto = round.kind === "photo";
    els.photo.hidden = !isPhoto;
    els.prompt.hidden = isPhoto;
    if (isPhoto) els.photo.src = round.img;
    else els.prompt.textContent = round.prompt;
    els.rn.textContent = String(round.index + 1);
    els.rt.textContent = String(round.total);
    if (score !== undefined) els.sc.textContent = String(score);
    els.verdict.textContent = "";
    els.verdict.style.color = "";
    picked = new Set();
    els.submit.disabled = true;
    els.opts.replaceChildren();
    round.options.forEach(function (name) {
      var b = el("button", "chip", name);
      b.type = "button";
      // a photo can show several members, so these toggle rather than commit
      b.addEventListener("click", function () {
        if (answering) return;
        if (picked.has(name)) picked.delete(name); else picked.add(name);
        b.classList.toggle("on", picked.has(name));
        els.submit.disabled = picked.size === 0;
      });
      els.opts.append(b);
    });
    answering = false;
  }

  function answer() {
    if (answering || !picked.size) return;
    answering = true;
    els.submit.disabled = true;
    // Array.from, NOT [].slice.call — a Set is not array-like, so slice returns
    // [] and the answer posts an empty selection that the server rejects.
    var names = Array.from(picked);
    fetch("/api/ot12/answer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: runId, index: index, names: names }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "no");
        return d;
      });
    }).then(function (d) {
      if (dead) return;
      var answers = Array.isArray(d.answer) ? d.answer : [d.answer];
      els.opts.querySelectorAll(".chip").forEach(function (o) {
        o.disabled = true;
        o.classList.remove("on");
        if (answers.indexOf(o.textContent) >= 0) o.classList.add("right");
        else if (names.indexOf(o.textContent) >= 0) o.classList.add("wrong");
      });
      els.verdict.textContent = d.correct ? "correct" : "it was " + answers.join(", ");
      els.verdict.style.color = d.correct ? "var(--ok)" : "var(--err)";
      els.sc.textContent = String(d.score);
      if (d.correct) sndCorrect(); else sndWrong();
      timer = setTimeout(function () {
        if (dead) return;
        if (d.done) finish(); else showRound(d.round);
      }, d.correct ? 700 : 1400);
    }).catch(function () {
      if (dead) return;
      answering = false;
      els.submit.disabled = false;
    });
  }

  /* ---------- done ---------- */
  function finish() {
    fetch("/api/ot12/complete", { method: "POST" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) {
        if (dead) return;
        var score = d ? d.score : els.sc.textContent;
        var total = d ? d.total : rounds;
        host.replaceChildren();
        host.append(el("div", "eyebrow", "Finished"), el("h1", null, "Done."));
        host.append(el("div", "rule"));
        var rows = el("div", "rows");
        var r = el("div", "row");
        r.append(el("span", "k", "Correct"), el("span", "v", score + " of " + total));
        rows.append(r);
        host.append(rows);
        var again = el("button", "go", "Again");
        again.type = "button";
        again.addEventListener("click", drawStart);
        var acts = el("div", "actions");
        acts.style.marginTop = "1.4rem";
        acts.append(again);
        host.append(acts);
      });
  }

  window.Shell.register("ot12", {
    label: "ot12",
    wide: true,
    mount: function (h) {
      host = h; dead = false; runId = null; answering = false;
      // console hook (`pray skip_stage`); the server counts it and re-checks isAdmin
      window.__skipStage = function () {
        if (!runId || answering) return Promise.resolve(false);
        return fetch("/api/ot12/skip", { method: "POST" }).then(function (r) {
          if (!r.ok) return false;
          return r.json().then(function (d) {
            if (d.done) finish(); else showRound(d.round);
            return true;
          });
        }).catch(function () { return false; });
      };
      drawStart();
    },
    unmount: function () {
      dead = true;
      if (timer) { clearTimeout(timer); timer = null; }
      delete window.__skipStage;
      host = null; els = {}; runId = null;
    },
  });
})();
