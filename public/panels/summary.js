/* ============================================================================
   summary — read a real article, say it back.

   Ported from views/summary.html. The logic is unchanged: GET
   /api/summary/topic returns a trimmed Wikipedia extract, POST
   /api/summary/complete hands it in for her to read. There is no word limit
   and no marking; the count is a neutral tally.

   The page version was two terminal panes side by side. Here it is two columns
   that stack below 820px, and the source column owns its own scrollbar so the
   panel itself never grows past the frame.
   ========================================================================== */
(function () {
  "use strict";

  var dead = false, round = null, handedIn = false;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function countWords(s) { return s.trim().split(/\s+/).filter(Boolean).length; }

  function paintCount() {
    if (!round) return;
    var n = countWords(els.entry.value);
    els.wc.textContent = String(n);
    els.hand.disabled = handedIn || n === 0;
  }

  function load() {
    if (dead) return;
    handedIn = false;
    round = null;
    els.verdict.textContent = "";
    els.verdict.style.color = "";
    els.entry.value = "";
    els.entry.disabled = true;
    els.hand.disabled = true;
    els.another.textContent = "another topic";
    els.title.textContent = "…";
    els.kind.textContent = "";
    els.words.textContent = "";
    els.source.replaceChildren(el("div", "loading", "reaching the archive"));
    els.cite.replaceChildren();

    fetch("/api/summary/topic").then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Could not reach the archive.");
        return d;
      });
    }).then(function (d) {
      if (dead) return;
      round = d;
      els.title.textContent = d.title;
      els.kind.textContent = d.kindLabel || "";
      els.words.textContent = d.sourceWords + " words";
      els.source.replaceChildren(document.createTextNode(d.text));
      if (d.url) {
        var a = document.createElement("a");
        a.href = d.url; a.target = "_blank"; a.rel = "noreferrer noopener";
        a.textContent = d.url.replace(/^https?:\/\//, "");
        els.cite.replaceChildren(document.createTextNode("source: "), a);
      }
      els.entry.disabled = false;
      paintCount();
      els.entry.focus();
    }).catch(function (e) {
      if (dead) return;
      els.source.replaceChildren(document.createTextNode(e.message || "Could not reach the archive."));
    });
  }

  function handIn() {
    if (!round || handedIn) return;
    var words = countWords(els.entry.value);
    if (words === 0) return;
    handedIn = true;
    els.hand.disabled = true;
    els.entry.disabled = true;
    fetch("/api/summary/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: round.title, kind: round.kind, words: words, text: els.entry.value }),
    }).then(function () {
      if (dead) return;
      els.verdict.style.color = "var(--ok)";
      els.verdict.textContent = "Handed in: " + words + (words === 1 ? " word" : " words") + ". She will read it.";
      els.another.textContent = "next topic";
    }).catch(function () {
      if (dead) return;
      els.verdict.style.color = "var(--err)";
      els.verdict.textContent = "Written, but it could not be handed in.";
    });
  }

  function onKey(e) {
    // the games swallow plain keys, so hand-in needs a modifier
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handIn(); }
  }

  window.Shell.register("summary", {
    label: "summary",
    wide: true,
    mount: function (host) {
      dead = false;
      host.append(el("div", "eyebrow", "Reading"), el("h1", null, "Summary"));

      var cols = el("div", "cols");

      var left = el("section", "col");
      els.title = el("div", "src-title", "…");
      els.kind = el("div", "flabel");
      els.words = el("div", "src-words");
      var head = el("div", "col-head");
      head.append(els.title, els.kind, els.words);
      els.source = el("div", "src-body");
      els.cite = el("div", "src-cite");
      left.append(head, els.source, els.cite);

      var right = el("section", "col");
      var rhead = el("div", "col-head");
      rhead.append(el("div", "flabel", "your summary"));
      els.entry = document.createElement("textarea");
      els.entry.placeholder = "say it back in your own words";
      els.entry.spellcheck = false;
      els.entry.disabled = true;
      els.entry.setAttribute("aria-label", "your summary");
      els.entry.addEventListener("input", paintCount);
      els.entry.addEventListener("keydown", onKey);

      var tally = el("div", "tally");
      els.wc = document.createElement("b");
      els.wc.textContent = "0";
      tally.append(els.wc, document.createTextNode(" words"));
      var rules = el("span", "rules", "AI use is an automatic failure.");
      tally.append(rules);

      els.hand = el("button", "go", "Hand in");
      els.hand.type = "button";
      els.hand.disabled = true;
      els.hand.addEventListener("click", handIn);
      els.another = el("button", "go ghost", "another topic");
      els.another.type = "button";
      els.another.addEventListener("click", load);
      var acts = el("div", "actions");
      acts.append(els.hand, els.another);

      els.verdict = el("div", "note");
      right.append(rhead, els.entry, tally, acts, els.verdict);

      cols.append(left, right);
      host.append(cols);
      load();
    },
    unmount: function () { dead = true; round = null; els = {}; },
  });
})();
