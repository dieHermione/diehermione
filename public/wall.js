/* ============================================================================
   wall.js — the games wall: one ink drawing per game.

   Each drawing says what the game IS, rather than showing a picture of it:
   repeated lines for devotion, a keypad for multitap, a long article beside a
   short one for summary. They use three greys — ink, dim, faint — and nothing
   else, so nine bespoke objects still read as one sheet.

   The strip scrolls sideways rather than wrapping (below 820px it becomes an
   ordinary list), arrow keys step through it, and her hover text comes from
   /api/gametips.
   ========================================================================== */
(function () {
  "use strict";

  var GAMES = [
    { n: "devotion",    k: "writing",     href: "/dashboard#devotion",   art: "devotion" },
    { n: "multitap",    k: "typing",      href: "/dashboard#multitap",   art: "multitap" },
    { n: "summary",     k: "reading",     href: "/dashboard#summary",    art: "summary" },
    { n: "skill check", k: "timing",      href: "/dashboard#skillcheck", art: "skillcheck" },
    { n: "ot12",        k: "trivia",      href: "/dashboard#ot12",       art: "ot12", wip: true },
    { n: "snake",       k: "arcade",      href: "/dashboard#snake",      art: "snake" },
    { n: "deathroll",   k: "two players", href: "/dashboard#deathroll",  art: "deathroll", tab: "extra" },
    { n: "elysium",     k: "patience",    href: "/dashboard#elysium",    art: "elysium",   tab: "extra" },
    { n: "chess",       k: "two players", href: "/dashboard#chess",      art: "chess",     tab: "extra" },
  ];

  var V = 'viewBox="0 0 150 200" preserveAspectRatio="xMidYMid meet"';

  /* A ruled line of "handwriting": a wobble, not real letters. */
  function scribble(y, w, seed) {
    var d = "M 24 " + y, x = 24;
    while (x < 24 + w) {
      var up = y - 3 - ((seed = (seed * 37 + 11) % 7));
      x += 5 + (seed % 4);
      d += " Q " + (x - 2) + " " + up + " " + x + " " + y;
    }
    return '<path class="ink-2" d="' + d + '" />';
  }

  var ART = {
    /* the same line, written again and again, fading as it goes down the page */
    devotion: function () {
      var s = '<rect x="22" y="22" width="106" height="156" rx="3" class="ink-3" />';
      for (var i = 0; i < 9; i++) {
        s += '<line class="ink-3" x1="30" y1="' + (44 + i * 15) + '" x2="120" y2="' + (44 + i * 15) + '" opacity=".5" />';
        s += '<g opacity="' + (1 - i * 0.1).toFixed(2) + '">' + scribble(42 + i * 15, 78 - i * 2, i + 3) + "</g>";
      }
      return s;
    },

    /* the keypad: three columns, four rows, the letter clusters printed small */
    multitap: function () {
      var labels = [["1", ".,-"], ["2", "abc"], ["3", "def"], ["4", "ghi"], ["5", "jkl"], ["6", "mno"],
                    ["7", "pqrs"], ["8", "tuv"], ["9", "wxyz"], ["*", "del"], ["0", "sp"], ["#", "ok"]];
      var s = "";
      labels.forEach(function (pair, i) {
        var col = i % 3, row = (i / 3) | 0;
        var x = 24 + col * 36, y = 30 + row * 38;
        s += '<rect x="' + x + '" y="' + y + '" width="30" height="31" rx="5" class="ink-3" />';
        s += '<text x="' + (x + 15) + '" y="' + (y + 16) + '" text-anchor="middle" class="fill-2" ' +
             'font-family="Bodoni Moda, serif" font-size="13">' + pair[0] + "</text>";
        s += '<text x="' + (x + 15) + '" y="' + (y + 25) + '" text-anchor="middle" class="fill-3" ' +
             'font-family="Inter, sans-serif" font-size="5.5" letter-spacing="1">' + pair[1] + "</text>";
      });
      return s;
    },

    /* a long column of rules, and the short one you make from it */
    summary: function () {
      var s = "";
      for (var i = 0; i < 16; i++) {
        s += '<line class="ink-3" x1="20" y1="' + (24 + i * 7) + '" x2="' + (20 + (i % 4 === 3 ? 38 : 50)) + '" y2="' + (24 + i * 7) + '" />';
      }
      s += '<path class="ink-2" d="M 78 72 l 10 6 l -10 6" />';
      s += '<line class="ink-3" x1="78" y1="78" x2="70" y2="78" opacity=".6" />';
      for (var j = 0; j < 5; j++) {
        s += '<line class="ink" x1="96" y1="' + (62 + j * 9) + '" x2="' + (96 + (j === 4 ? 20 : 34)) + '" y2="' + (62 + j * 9) + '" stroke-width="1.6" />';
      }
      return s;
    },

    /* the dial: the ring, the good arc, the needle a moment before it */
    skillcheck: function () {
      return '<circle cx="75" cy="92" r="48" class="ink-3" />' +
        '<path class="ink" d="M 101 51 A 48 48 0 0 1 122 78" stroke-width="9" opacity=".9" />' +
        '<line class="ink" x1="75" y1="92" x2="48" y2="52" stroke-width="1.8" />' +
        '<circle cx="75" cy="92" r="3.4" class="fill" />' +
        '<text x="75" y="166" text-anchor="middle" class="fill-3" font-family="Inter, sans-serif" ' +
        'font-size="7" letter-spacing="3">IN THE ARC</text>';
    },

    /* twelve, and you must say which */
    ot12: function () {
      var s = "";
      for (var i = 0; i < 12; i++) {
        var col = i % 4, row = (i / 4) | 0;
        var cx = 32 + col * 29, cy = 48 + row * 42;
        var known = i === 5;
        s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="11" ry="13" class="' + (known ? "ink" : "ink-3") + '" />';
        s += '<circle cx="' + cx + '" cy="' + (cy - 3) + '" r="4.2" class="' + (known ? "fill-2" : "fill-3") + '" opacity="' + (known ? 1 : .5) + '" />';
        s += '<path class="' + (known ? "ink-2" : "ink-3") + '" d="M ' + (cx - 7) + ' ' + (cy + 10) + ' q 7 -7 14 0" opacity="' + (known ? 1 : .5) + '" />';
      }
      s += '<text x="75" y="178" text-anchor="middle" class="fill-3" font-family="Inter, sans-serif" ' +
        'font-size="7" letter-spacing="3">WHICH ONE</text>';
      return s;
    },

    /* the serpent, and the heart it is chasing */
    snake: function () {
      return '<path class="ink" d="M 18 150 C 54 150 44 110 76 108 C 112 106 100 64 132 58" stroke-width="9" opacity=".22" />' +
        '<path class="ink" d="M 18 150 C 54 150 44 110 76 108 C 112 106 100 64 132 58" stroke-width="3" />' +
        '<circle cx="132" cy="58" r="5" class="fill" />' +
        '<path class="fill-2" d="M 44 56 c 0 -7 11 -9 11 -1 c 0 -8 11 -6 11 1 c 0 8 -11 15 -11 15 c 0 0 -11 -7 -11 -15 z" />';
    },

    /* the number falling, and the one that ends it */
    deathroll: function () {
      var seq = ["500", "317", "142", "88", "21", "6"];
      var s = "";
      seq.forEach(function (n, i) {
        s += '<text x="75" y="' + (30 + i * 21) + '" text-anchor="middle" class="fill-' + (i < 3 ? "3" : "2") +
          '" font-family="Bodoni Moda, serif" font-size="' + (15 + i * 1.5) + '">' + n + "</text>";
      });
      s += '<text x="75" y="178" text-anchor="middle" class="fill" font-family="Bodoni Moda, serif" font-size="28">1</text>';
      return s;
    },

    /* a tree: a tapering trunk, branches that fork, and a crown drawn as a run
       of arcs rather than one blob with two lumps in it */
    elysium: function () {
      var crown = "M 36 86 " +
        "a 15 15 0 0 1 7 -20 a 16 16 0 0 1 12 -14 a 17 17 0 0 1 20 -6 " +
        "a 17 17 0 0 1 20 6 a 16 16 0 0 1 12 14 a 15 15 0 0 1 7 20 " +
        "a 16 16 0 0 1 -14 14 l -51 0 a 16 16 0 0 1 -13 -14 z";
      return '<path class="ink" d="' + crown + '" stroke-width="1.6" />' +
        /* foliage, deliberately off-centre: two symmetrical arcs near the top of
           a round crown read as a pair of eyes */
        '<path class="ink-3" d="M 48 80 a 14 14 0 0 1 13 -11 M 70 94 a 16 16 0 0 1 18 -7 M 92 72 a 11 11 0 0 1 11 8 M 58 62 a 10 10 0 0 1 11 -5" />' +
        '<path class="ink" d="M 71 170 C 71 150 72 130 74 100 M 79 170 C 79 150 78 130 76 100" stroke-width="1.6" />' +
        '<path class="ink-2" d="M 74 126 C 65 122 58 114 55 104 M 76 116 C 86 112 93 104 96 96 M 74 146 C 67 143 62 137 60 130" />' +
        '<line class="ink-3" x1="34" y1="170" x2="116" y2="170" />' +
        '<text x="75" y="186" text-anchor="middle" class="fill-3" font-family="Inter, sans-serif" ' +
        'font-size="7" letter-spacing="2"><tspan class="ew-num fill-2">—</tspan> DAYS TENDED</text>';
    },

    /* her side of the board, and yours */
    chess: function () {
      var s = "";
      for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
        if ((r + c) % 2) s += '<rect x="' + (27 + c * 24) + '" y="' + (64 + r * 24) + '" width="24" height="24" class="fill-3" opacity=".3" />';
      }
      s += '<rect x="27" y="64" width="96" height="96" class="ink-3" />';
      // a queen on paper, a king in ink
      s += '<text x="51" y="108" text-anchor="middle" class="fill-3" font-size="20">♛</text>';
      s += '<text x="99" y="156" text-anchor="middle" class="fill" font-size="20">♚</text>';
      return s;
    },
  };

  /* ---------- build ---------- */
  var board = document.getElementById("board");
  var countEl = document.getElementById("count");
  var curTab = "main", shown = [], cards = [], sel = 0, tips = {};

  function build() {
    board.replaceChildren();
    var track = document.createElement("div");
    track.className = "track";
    board.append(track);

    shown = GAMES.filter(function (g) { return (g.tab || "main") === curTab; });
    cards = shown.map(function (g, i) {
      var a = document.createElement("a");
      a.className = "p";
      a.href = g.href;
      a.tabIndex = 0;
      a.innerHTML =
        '<div class="art"><svg ' + V + ' xmlns="http://www.w3.org/2000/svg">' + ART[g.art]() + "</svg>" +
          (g.wip ? '<div class="wip">unfinished</div>' : "") +
          '<div class="tip"></div></div>' +
        '<div class="foot">' +
          '<div class="n">' + g.n + '<span class="num">' + String(i + 1).padStart(2, "0") + "</span></div>" +
          '<div class="k">' + g.k + "</div>" +
        "</div>";
      a.addEventListener("mouseenter", function () { setSel(i); });
      a.addEventListener("focus", function () { setSel(i); });
      track.append(a);
      return a;
    });

    countEl.textContent = String(shown.length);
    board.scrollLeft = 0;
    setSel(0);
    paintTips();
    hydrate();
  }

  /* Her hover line, from Admin → Games → General. The editor has existed all
     along; the wall had stopped reading it. */
  function paintTips() {
    cards.forEach(function (a, i) {
      var t = tips[shown[i].n];
      var box = a.querySelector(".tip");
      if (t) box.textContent = t; else box.remove();
    });
  }

  /* The elysium card shows the tree's real age, not invented copy. */
  function hydrate() {
    if (!shown.some(function (g) { return g.art === "elysium"; })) return;
    fetch("/api/elysium").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var num = board.querySelector(".ew-num");
      var days = d && d.tree && typeof d.tree.ageDays === "number" ? d.tree.ageDays : null;
      if (num && days != null) num.textContent = String(days);
    }).catch(function () {});
  }

  function setSel(i) {
    if (!shown.length) return;
    sel = (i + shown.length) % shown.length;
    cards.forEach(function (el, n) { el.classList.toggle("sel", n === sel); });
  }

  document.getElementById("tabs").addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (!b || b.dataset.tab === curTab) return;
    curTab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("on", t === b); });
    build();
  });

  document.addEventListener("keydown", function (e) {
    var tag = ((e.target && e.target.tagName) || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setSel(sel + 1); cards[sel].focus(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setSel(sel - 1); cards[sel].focus(); }
    else if (e.key === "Enter" && shown[sel]) { window.location.href = shown[sel].href; }
  });

  /* A vertical wheel scrolls the strip sideways — but only when it overflows,
     so the narrow fallback keeps its normal page scroll, and only for a
     vertical-only wheel, so a trackpad's own horizontal swipe is left alone. */
  board.addEventListener("wheel", function (e) {
    if (board.scrollWidth <= board.clientWidth) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    board.scrollLeft += e.deltaY;
  }, { passive: false });

  /* Drag to pan. A card is an <a>, so a real click must still navigate — only
     a drag past a few pixels suppresses it. */
  var dragging = false, dragged = false, dragX = 0, dragScroll = 0;
  board.addEventListener("mousedown", function (e) {
    if (board.scrollWidth <= board.clientWidth) return;
    dragging = true; dragged = false;
    dragX = e.pageX; dragScroll = board.scrollLeft;
    board.classList.add("dragging");
  });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    if (Math.abs(e.pageX - dragX) > 4) dragged = true;
    board.scrollLeft = dragScroll - (e.pageX - dragX);
  });
  window.addEventListener("mouseup", function () {
    dragging = false;
    board.classList.remove("dragging");
  });
  board.addEventListener("click", function (e) {
    if (!dragged) return;
    e.preventDefault(); e.stopPropagation(); dragged = false;
  }, true);

  fetch("/api/gametips").then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.tips) tips = d.tips; })
    .catch(function () {})
    .then(build);
})();
