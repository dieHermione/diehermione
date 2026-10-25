/* ============================================================================
   chess — every game is a player (white) against hermione (black).

   Ported from views/chess.html. The move loop and the FEN handling are
   unchanged. Two things had to be designed around rather than copied:

   1. **`chess-extra.js` must keep working untouched.** It is served by an
      admin-gated route that 404s for everyone else, so the other player's copy
      of the game contains no trace of STRIKE or REWIND. It destructures
      `window.ChessCore`, appends to `#extra-slot`, and sets `G.onPaint` /
      `G.onClick`. So the board, the status line and the extra slot are built
      ONCE in module scope and re-attached to the host on every mount — if they
      were rebuilt per mount, the extra script would be holding nodes that are
      no longer on the page. It is loaded once; `G.paused` idles its poll while
      the section is not on screen.
   2. **The board is sized from the panel**, not the window: a square driven by
      the available height, so it never pushes past the frame.

   `confirm()` is gone — a native dialog over this design is a different
   website. New game is a two-press confirmation in the panel instead.
   ========================================================================== */
(function () {
  "use strict";

  var GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  var FULL_SET = "qrrbbnnpppppppp";   // one side's pieces, king excluded

  var G = {
    mySide: "w", isAdmin: false, opponent: null, game: null,
    selected: null, busy: false, animating: false,
    mode: null, onPaint: null, onClick: null, paused: true,
  };

  // Built once and re-attached on each mount, because chess-extra.js keeps
  // references to them. Rebuilding would orphan its listeners and its slot.
  var boardEl = null, statusEl = null, extraSlot = null, movesEl = null, metaEl = {}, titleEl = {};
  var host = null, poll = null, built = false, extraLoaded = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pieceSide(ch) { return ch === ch.toUpperCase() ? "w" : "b"; }

  function squares() {
    var files = "abcdefgh".split("");
    var ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    var list = [];
    ranks.forEach(function (r) { files.forEach(function (f) { list.push(f + r); }); });
    return G.mySide === "b" ? list.reverse() : list;
  }

  function fenBoard(fen) {
    var map = {};
    fen.split(" ")[0].split("/").forEach(function (row, i) {
      var file = 0;
      for (var k = 0; k < row.length; k++) {
        var ch = row[k];
        if (/\d/.test(ch)) file += Number(ch);
        else { map["abcdefgh"[file] + (8 - i)] = ch; file++; }
      }
    });
    return map;
  }

  /* what is missing from each side's starting set, drawn as glyphs */
  function capturedGlyphs(pieces) {
    var left = { w: [], b: [] };
    Object.keys(pieces).forEach(function (sq) {
      var ch = pieces[sq];
      var side = ch === ch.toUpperCase() ? "w" : "b";
      if (ch.toLowerCase() !== "k") left[side].push(ch.toLowerCase());
    });
    var missing = [];
    ["w", "b"].forEach(function (side) {
      var pool = left[side].slice();
      for (var i = 0; i < FULL_SET.length; i++) {
        var at = pool.indexOf(FULL_SET[i]);
        if (at === -1) missing.push(GLYPH[FULL_SET[i]]);
        else pool.splice(at, 1);
      }
    });
    return missing.join("");
  }

  function lastMoveSquares() {
    // chess.js reports SAN, not squares; the destination alone reads the board
    var h = (G.game && G.game.history) || [];
    if (!h.length) return [];
    var m = /([a-h][1-8])(?:=[QRBN])?[+#]?$/.exec(h[h.length - 1]);
    return m ? [m[1]] : [];
  }

  function render() {
    boardEl.replaceChildren();
    if (!G.game) return;
    var pieces = fenBoard(G.game.fen);
    var last = lastMoveSquares();
    var dark = false;
    squares().forEach(function (sq, i) {
      if (i % 8 !== 0) dark = !dark;
      var div = el("div", "square" + (dark ? " dark" : ""));
      div.dataset.square = sq;
      if (sq === G.selected) div.classList.add("selected");
      if (last.indexOf(sq) >= 0) div.classList.add("last");
      var piece = pieces[sq];
      if (piece) div.append(el("span", "pc " + pieceSide(piece), GLYPH[piece.toLowerCase()]));
      // coordinates go on the edges AS DRAWN: flipped for black, "a" and "1"
      // are no longer the left and bottom edges
      if (i % 8 === 0) div.append(el("i", "rk", sq[1]));
      if (i >= 56) div.append(el("i", "fl", sq[0]));
      var clickable = G.mode ? Boolean(piece) : (G.game.turn === G.mySide && !G.game.gameOver);
      if (clickable) div.classList.add("playable");
      div.addEventListener("click", function () { onSquareClick(sq, piece); });
      boardEl.append(div);
    });
    paint();
  }

  function paint() {
    var them = G.isAdmin ? ((G.game && G.game.opponent) || "nobody") : "hermione";
    var me = window.__me || "you";
    titleEl.white.textContent = G.isAdmin ? them : me;
    titleEl.black.textContent = G.isAdmin ? me : "hermione";
    metaEl.white.textContent = G.isAdmin ? them : me;
    metaEl.black.textContent = "hermione";
    metaEl.taken.textContent = (G.game ? capturedGlyphs(fenBoard(G.game.fen)) : "") || "—";

    movesEl.replaceChildren();
    var h = (G.game && G.game.history) || [];
    if (!h.length) movesEl.append(el("div", "empty", "no moves yet"));
    for (var i = 0; i < h.length; i += 2) {
      var row = document.createElement("div");
      var w = document.createElement("b");
      w.textContent = h[i];
      row.append(document.createTextNode((i / 2 + 1) + ". "), w);
      if (h[i + 1]) row.append(document.createTextNode(" " + h[i + 1]));
      movesEl.append(row);
    }

    statusEl.textContent = statusText();
    statusEl.classList.toggle("alert", Boolean(G.game && (G.game.check || G.game.gameOver)));
    if (G.onPaint) G.onPaint();
  }

  function statusText() {
    if (!G.game) return "";
    if (G.modeText) return G.modeText;
    if (G.game.checkmate) return "checkmate. " + (G.game.winner === "w" ? "white" : "black") + " wins.";
    if (G.game.draw || G.game.gameOver) return "a draw.";
    var text = G.game.turn === G.mySide
      ? "your move."
      : "waiting for " + (G.isAdmin ? G.game.opponent : "hermione") + ".";
    if (G.game.check) text += " check.";
    return text;
  }

  function onSquareClick(sq, piece) {
    if (!G.game || G.game.gameOver || G.busy || G.animating) return;
    if (G.mode) { if (G.onClick) G.onClick(sq, piece); return; }
    if (G.game.turn !== G.mySide) return;
    if (G.selected && sq !== G.selected) {
      if (piece && pieceSide(piece) === G.mySide) { G.selected = sq; render(); return; }
      sendMove(G.selected, sq);
      return;
    }
    if (piece && pieceSide(piece) === G.mySide) {
      G.selected = G.selected === sq ? null : sq;
      render();
    }
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; })
        .then(function (data) { return { ok: res.ok, data: data }; });
    });
  }

  function sendMove(from, to) {
    G.busy = true;
    var body = { from: from, to: to };
    if (G.opponent) body.opponent = G.opponent;
    return post("/api/chess/move", body).then(function (out) {
      G.busy = false;
      if (out.ok) { G.game = out.data.game; G.selected = null; render(); }
      else if (out.data.error && out.data.error !== "Illegal move.") statusEl.textContent = out.data.error;
      else { G.selected = null; render(); }
    });
  }

  function loadGame() {
    if (G.paused || G.busy || G.animating) return Promise.resolve();
    var url = G.isAdmin
      ? "/api/chess/game?opponent=" + encodeURIComponent(G.opponent || "")
      : "/api/chess/game";
    return fetch(url).then(function (res) {
      if (!res.ok) { if (res.status === 401) window.location.href = "/"; return null; }
      return res.json();
    }).then(function (data) {
      if (!data || G.paused) return;
      if (!G.game || data.game.fen !== G.game.fen || data.game.opponent !== G.game.opponent) {
        G.game = data.game;
        G.selected = null;
        render();
      }
    }).catch(function () {});
  }

  /* ---------- the markup, built once ---------- */
  function build() {
    if (built) return;
    built = true;

    titleEl.white = el("span", null, "…");
    titleEl.black = el("span", null, "…");
    metaEl.white = document.createElement("b");
    metaEl.black = document.createElement("b");
    metaEl.taken = el("span", "taken", "—");
    statusEl = el("p", "ch-status", "Loading…");
    movesEl = el("div", "ch-moves");
    extraSlot = el("div");
    extraSlot.id = "extra-slot";
    boardEl = el("div", "ch-board");
  }

  window.Shell.register("chess", {
    label: "chess",
    wide: true,
    mount: function (h, ctx) {
      host = h;
      build();
      G.paused = false;
      G.isAdmin = Boolean(ctx.me && ctx.me.isAdmin);
      G.mySide = G.isAdmin ? "b" : "w";
      window.__me = ctx.me && ctx.me.username;

      var cols = el("div", "cols");

      var left = el("section", "col");
      var title = el("h1", "ch-title");
      title.append(titleEl.white, document.createElement("br"),
        el("em", null, "and "), titleEl.black);
      var meta = el("div", "ch-meta");
      var line = function (k, node) {
        var d = el("div");
        d.append(el("span", "k", k), node);
        return d;
      };
      meta.append(line("white", metaEl.white), line("black", metaEl.black), line("taken", metaEl.taken));

      var newGame = el("button", "go ghost", "New game");
      newGame.type = "button";
      var armed = false;
      newGame.addEventListener("click", function () {
        if (G.isAdmin && !G.opponent) return;
        // two presses instead of a native confirm(), which would be a different
        // website appearing on top of this one
        if (!armed) {
          armed = true;
          newGame.textContent = "Clear the board?";
          newGame.classList.add("armed");
          setTimeout(function () {
            if (!armed) return;
            armed = false; newGame.textContent = "New game"; newGame.classList.remove("armed");
          }, 4000);
          return;
        }
        armed = false; newGame.textContent = "New game"; newGame.classList.remove("armed");
        post("/api/chess/reset", G.opponent ? { opponent: G.opponent } : {}).then(function (out) {
          if (out.ok) { G.game = out.data.game; G.selected = null; render(); }
        });
      });
      var acts = el("div", "actions");
      acts.append(newGame);

      left.append(title, el("div", "rule"), meta, statusEl, movesEl, acts, extraSlot);

      var right = el("section", "col ch-boardwrap");
      right.append(boardEl);

      cols.append(left, right);
      host.append(el("div", "eyebrow", "Two players"), cols);

      // handed to chess-extra.js so it does not have to reach into globals
      window.ChessCore = { G: G, boardEl: boardEl, statusEl: statusEl, render: render,
        paint: paint, post: post, sleep: sleep, loadGame: loadGame, pieceSide: pieceSide };

      if (G.isAdmin && !extraLoaded) {
        // 404s for everyone else, so the rest of the game is not in their copy
        extraLoaded = true;
        var s = document.createElement("script");
        s.src = "/chess-extra.js";
        document.body.append(s);
      } else if (!G.isAdmin) {
        loadGame();
      } else {
        loadGame();
      }
      poll = setInterval(loadGame, 3000);
    },
    unmount: function () {
      G.paused = true;                 // idles chess-extra.js's own poll too
      if (poll) { clearInterval(poll); poll = null; }
      G.selected = null; G.mode = null; G.modeText = null;
      host = null;
    },
  });
})();
