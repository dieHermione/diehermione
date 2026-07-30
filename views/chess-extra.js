/* Hermione's side of the chess board.
 *
 * This file is served by an admin-gated route that 404s for everyone else, so
 * the other player's copy of /chess contains no trace of these two powers: no
 * markup, no styles, no strings, no endpoints. The server checks again on every
 * call, so this is presentation only, not the security boundary.
 *
 *   STRIKE  take one of their pieces off the board, on her turn, spent instead
 *           of a move. The piece bleeds into the paper.
 *   REWIND  wind the whole game back one state, move or strike alike. A wash
 *           runs back across the board and the position changes behind it.
 */
(function () {
  "use strict";
  const { G, boardEl, statusEl, render, post, sleep, loadGame, pieceSide } = window.ChessCore;

  const STYLE = `
    .privy {
      margin-top: 1.4rem; padding: 1rem 1.1rem; max-width: 26rem;
      border: 1px dashed var(--vermilion); background: rgba(164, 50, 42, .07);
    }
    .privy .t {
      font-family: Inter, sans-serif; font-size: 8px; letter-spacing: .3em;
      color: var(--vermilion); text-transform: uppercase;
    }
    .privy .b { display: flex; gap: .7rem; margin-top: .7rem; }
    .privy .b .brush { flex: 1; }
    .privy .b .brush.take {
      background: var(--vermilion); border-color: var(--vermilion); color: #f4efe6;
    }
    .privy .b .brush.take:hover:not(:disabled) { background: #8c2a23; }
    .privy .b .brush.take.armed { background: #6f1f19; border-color: #6f1f19; }
    .privy .pick { margin-top: .7rem; display: flex; align-items: baseline; gap: .5rem; }
    .privy .pick label {
      font-family: Inter, sans-serif; font-size: 8px; letter-spacing: .3em;
      color: var(--ink-faint); text-transform: uppercase;
    }
    .privy select {
      flex: 1; font-family: "Cormorant Garamond", serif; font-size: 1.05rem;
      color: var(--ink); background: transparent; border: none;
      border-bottom: 1px solid var(--ink-faint); padding: .1rem 0; cursor: pointer;
    }
    .privy select:focus { outline: none; border-bottom-color: var(--vermilion); }

    /* the piece bleeds into the paper and is gone */
    .square.struck .pc { animation: bleed .62s ease-in forwards; }
    @keyframes bleed {
      0%   { opacity: 1; filter: blur(0); transform: scale(1); }
      35%  { opacity: .9; filter: blur(1px); transform: scale(1.06); color: var(--vermilion);
             text-shadow: 0 0 10px rgba(164,50,42,.7); }
      100% { opacity: 0; filter: blur(7px); transform: scale(.72); color: var(--vermilion);
             text-shadow: none; }
    }
    .blot {
      position: absolute; inset: 12%; z-index: 1; pointer-events: none;
      border-radius: 46% 54% 52% 48% / 54% 46% 54% 46%;
      background: radial-gradient(closest-side, rgba(164,50,42,.85), rgba(164,50,42,.25) 62%, transparent 78%);
      animation: soak .62s ease-out forwards;
    }
    @keyframes soak {
      0%   { transform: scale(.15) rotate(0deg); opacity: 0; }
      30%  { transform: scale(1.15) rotate(8deg); opacity: 1; }
      100% { transform: scale(2.1) rotate(16deg); opacity: 0; }
    }

    /* a wash runs back across the paper. It hangs on the frame, not the board:
       the board is emptied halfway through when the position is swapped. */
    .brd { position: relative; overflow: hidden; }
    .wash {
      position: absolute; inset: 0; z-index: 6; pointer-events: none;
      background: linear-gradient(90deg, transparent 0%, rgba(239,233,221,.05) 18%,
        rgba(239,233,221,.92) 44%, rgba(164,50,42,.22) 52%, rgba(239,233,221,.92) 60%,
        rgba(239,233,221,.05) 84%, transparent 100%);
      animation: unpaint .78s ease-in-out forwards;
    }
    @keyframes unpaint {
      from { transform: translateX(112%); }
      to   { transform: translateX(-112%); }
    }
    #board.rewinding .pc { animation: unink .78s ease-in-out; }
    @keyframes unink {
      0% { opacity: 1; } 45% { opacity: .1; filter: blur(3px); } 100% { opacity: 1; }
    }
  `;

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const box = document.createElement("div");
  box.className = "privy";
  box.innerHTML =
    '<div class="t">Hers alone</div>' +
    '<div class="b">' +
      '<button class="brush take" id="x-take" type="button">Strike</button>' +
      '<button class="brush" id="x-back" type="button">Rewind</button>' +
    '</div>' +
    '<div class="pick"><label for="x-who">Game</label><select id="x-who"></select></div>';
  document.getElementById("extra-slot").append(box);

  const takeBtn = document.getElementById("x-take");
  const backBtn = document.getElementById("x-back");
  const whoSel = document.getElementById("x-who");

  // the core calls this at the end of every paint
  G.onPaint = function () {
    const canTake = Boolean(G.game) && !G.game.gameOver && G.game.turn === "b";
    takeBtn.disabled = !canTake && G.mode !== "strike";
    takeBtn.textContent = G.mode === "strike" ? "Cancel" : "Strike";
    takeBtn.classList.toggle("armed", G.mode === "strike");
    backBtn.disabled = !G.game || !G.game.rewindable || G.animating;
  };

  // and this instead of a normal move while a mode is armed
  G.onClick = async function (sq, piece) {
    if (G.mode !== "strike") return;
    if (piece && pieceSide(piece) === "w") await strike(sq);
  };

  function setMode(on) {
    G.mode = on ? "strike" : null;
    G.modeText = on ? "choose one of their pieces to take off the board." : null;
    G.selected = null;
    render();
  }

  takeBtn.addEventListener("click", () => {
    if (G.mode === "strike") { setMode(false); return; }
    if (!G.game || G.game.gameOver || G.game.turn !== "b") return;
    setMode(true);
  });

  backBtn.addEventListener("click", rewind);

  whoSel.addEventListener("change", (e) => {
    G.opponent = e.target.value;
    G.game = null;
    G.selected = null;
    setMode(false);
    loadGame();
  });

  async function strike(square) {
    G.busy = true; G.animating = true;
    // run the bleed on the square that was clicked, then take the new position
    const cell = boardEl.querySelector('[data-square="' + square + '"]');
    if (cell) {
      cell.classList.add("struck");
      const blot = document.createElement("i");
      blot.className = "blot";
      cell.append(blot);
    }
    const { ok, data } = await post("/api/chess/remove", { opponent: G.opponent, square });
    await sleep(620);
    G.busy = false; G.animating = false;
    G.mode = null; G.modeText = null;
    if (ok) G.game = data.game;
    render();
    if (!ok && data.error) statusEl.textContent = data.error;
  }

  async function rewind() {
    if (!G.game || !G.game.rewindable || G.animating) return;
    G.busy = true; G.animating = true;
    const frame = boardEl.parentElement;
    const wash = document.createElement("div");
    wash.className = "wash";
    frame.append(wash);
    boardEl.classList.add("rewinding");
    const { ok, data } = await post("/api/chess/rewind", { opponent: G.opponent, steps: 1 });
    await sleep(390);                    // swap the position behind the wipe
    if (ok) { G.game = data.game; G.selected = null; G.mode = null; G.modeText = null; render(); }
    await sleep(400);
    boardEl.classList.remove("rewinding");
    const stray = frame.querySelector(".wash");
    if (stray) stray.remove();
    G.busy = false; G.animating = false;
    if (!ok && data.error) statusEl.textContent = data.error;
    else render();
  }

  async function loadGames() {
    if (G.animating) return;
    const res = await fetch("/api/chess/games");
    if (!res.ok) return;
    const data = await res.json();
    const current = G.opponent;
    whoSel.replaceChildren();
    for (const g of data.games) {
      const opt = document.createElement("option");
      opt.value = g.key;
      opt.textContent = g.opponent +
        (!g.started ? " (no game yet)"
          : g.gameOver ? " (finished)"
          : g.turn === "b" ? " (your move)" : "");
      whoSel.append(opt);
    }
    if (data.games.length === 0) {
      statusEl.textContent = "no games yet. players start them from their own boards.";
      boardEl.replaceChildren();
      G.game = null;
      return;
    }
    G.opponent = data.games.some((g) => g.key === current) ? current : data.games[0].key;
    whoSel.value = G.opponent;
    await loadGame();
  }

  loadGames();
  setInterval(loadGames, 4000);
})();
