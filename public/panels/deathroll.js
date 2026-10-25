/* ============================================================================
   deathroll — alternate 1d(previous); a 1 loses.

   Ported from views/deathroll.html. Every roll is server-refereed already, so
   the logic came across untouched: /api/deathroll/game, /start (hers), /roll.
   Hermione's picker lists the live guests plus any game already on disk.

   **The 4s poll is the thing to get right.** The other player's roll arrives
   while you sit here, so the page polled on an interval — and an interval that
   outlives its markup is how a panel shell leaks. It is cleared on unmount, and
   a `dead` flag stops an in-flight fetch from painting a panel that is gone.
   ========================================================================== */
(function () {
  "use strict";

  var host = null, dead = false, poll = null;
  var isAdmin = false, opponent = null, game = null, rolling = false, myName = null;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderLog() {
    els.log.replaceChildren();
    if (!game || !game.history.length) {
      els.log.append(el("p", "log-empty", "No rolls yet."));
      return;
    }
    // newest at the top
    game.history.slice().reverse().forEach(function (h) {
      var row = el("div", "log-row " + h.by + (h.result === 1 ? " fatal" : ""));
      row.append(el("span", "who", h.by === "hermione" ? "Hermione" : (game.opponent || "You")),
        el("span", "roll", "d" + h.sides + " → " + h.result));
      els.log.append(row);
    });
    els.log.scrollTop = 0;
  }

  function render() {
    if (dead) return;
    if (!game) {
      els.status.textContent = isAdmin
        ? "Pick someone and a number to start."
        : "Hermione hasn't started a roll with you yet.";
      els.status.style.color = "";
      els.cap.textContent = "waiting";
      els.value.textContent = "–";
      els.die.classList.remove("dead");
      els.roll.disabled = true;
      renderLog();
      return;
    }

    els.cap.textContent = game.over ? "final roll" : "roll 1d";
    els.value.textContent = game.over
      ? (game.history.length ? game.history[game.history.length - 1].result : game.sides)
      : game.sides;
    els.die.classList.toggle("dead", game.over);

    if (game.over) {
      var iLost = (isAdmin && game.loser === "hermione") || (!isAdmin && game.loser === "player");
      var loserName = game.loser === "hermione" ? "Hermione" : game.opponent;
      els.status.textContent = iLost ? "You rolled a 1. You lose." : loserName + " rolled a 1, you win.";
      els.status.style.color = iLost ? "var(--err)" : "var(--ok)";
      els.roll.disabled = true;
    } else if (game.yourTurn) {
      els.status.textContent = "Your roll: 1d" + game.sides + ".";
      els.status.style.color = "";
      els.roll.disabled = rolling;
    } else {
      els.status.textContent = game.turn === "hermione"
        ? "Waiting on Hermione…" : "Waiting on " + game.opponent + "…";
      els.status.style.color = "";
      els.roll.disabled = true;
    }
    renderLog();
    refreshCards();
  }

  function loadGame() {
    if (isAdmin && !opponent) { game = null; render(); return Promise.resolve(); }
    var url = "/api/deathroll/game" + (isAdmin ? "?opponent=" + encodeURIComponent(opponent) : "");
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (dead || !d) return; game = d.game; render(); })
      .catch(function () {});
  }

  function roll() {
    if (rolling || !game || !game.yourTurn) return;
    rolling = true;
    els.roll.disabled = true;
    els.die.classList.add("rolling");
    fetch("/api/deathroll/roll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isAdmin ? { opponent: opponent } : {}),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (out) {
      // let the flicker run briefly so the result lands rather than blinks
      return new Promise(function (res) { setTimeout(function () { res(out); }, 550); });
    }).then(function (out) {
      if (dead) return;
      els.die.classList.remove("rolling");
      rolling = false;
      if (!out.ok) {
        els.status.textContent = out.d.error || "That didn't work.";
        return loadGame();
      }
      game = out.d.game;
      render();
    }).catch(function () {
      if (dead) return;
      els.die.classList.remove("rolling");
      rolling = false;
    });
  }

  /* A card is the role and the name: there are no profiles behind players any
     more (Hermione is the one account; everyone else is a guest). */
  function card(box, username, role) {
    if (!username) { box.hidden = true; return; }
    box.replaceChildren(el("div", "role", role),
      el("div", "initial", (username[0] || "?").toUpperCase()),
      el("div", "name", username));
    box.hidden = false;
  }
  function refreshCards() {
    card(els.me, myName, "You");
    card(els.them, isAdmin ? opponent : "hermione", "Opponent");
  }

  function initAdminPicker() {
    return fetch("/api/deathroll/games").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (dead || !d) return;
        els.select.replaceChildren.apply(els.select, d.players.map(function (p) {
          var o = document.createElement("option");
          o.value = p.username;
          o.textContent = p.username + (p.yourTurn ? " (your roll)" : "");
          return o;
        }));
        if (d.players.length) { opponent = d.players[0].username; els.select.value = opponent; }
        els.picker.hidden = false;
      }).catch(function () {});
  }

  window.Shell.register("deathroll", {
    label: "deathroll",
    wide: true,
    mount: function (h, ctx) {
      host = h; dead = false; game = null; rolling = false;
      isAdmin = Boolean(ctx.me && ctx.me.isAdmin);
      myName = ctx.me && ctx.me.username;
      opponent = null;

      host.append(el("div", "eyebrow", "Two players"), el("h1", null, "Deathroll"));

      els.picker = el("div", "dr-picker");
      els.picker.hidden = true;
      els.select = document.createElement("select");
      els.select.setAttribute("aria-label", "opponent");
      els.select.addEventListener("change", function () {
        opponent = els.select.value; loadGame(); refreshCards();
      });
      els.sides = document.createElement("input");
      els.sides.type = "text";
      els.sides.inputMode = "numeric";
      els.sides.maxLength = 7;
      els.sides.placeholder = "e.g. 500";
      els.sides.setAttribute("aria-label", "starting number");
      // digits only; number spinners are banned site-wide
      els.sides.addEventListener("input", function () {
        els.sides.value = els.sides.value.replace(/\D/g, "").slice(0, 7);
      });
      var start = el("button", "go", "New roll");
      start.type = "button";
      start.addEventListener("click", function () {
        fetch("/api/deathroll/start", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opponent: opponent, sides: parseInt(els.sides.value, 10) }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (out) {
          if (dead) return;
          if (!out.ok) { els.status.textContent = out.d.error || "Couldn't start that."; return; }
          game = out.d.game; render();
        }).catch(function () {});
      });
      els.picker.append(els.select, els.sides, start);
      host.append(els.picker);

      var grid = el("div", "dr-grid");
      els.me = el("aside", "dr-card");
      els.me.hidden = true;

      var mid = el("main", "dr-mid");
      els.status = el("p", "dr-status", "Loading…");
      els.die = el("div", "dr-die");
      els.cap = el("span", "cap", "rolling");
      els.value = el("span", "value", "–");
      els.die.append(els.cap, els.value);
      els.roll = el("button", "go", "Roll");
      els.roll.type = "button";
      els.roll.disabled = true;
      els.roll.addEventListener("click", roll);
      var acts = el("div", "actions");
      acts.append(els.roll);
      mid.append(els.status, els.die, acts);

      els.them = el("aside", "dr-card");
      els.them.hidden = true;
      grid.append(els.me, mid, els.them);

      els.log = el("div", "dr-log");
      host.append(grid, el("div", "flabel", "rolls"), els.log);

      var boot = isAdmin ? initAdminPicker() : Promise.resolve();
      boot.then(loadGame).then(function () {
        if (dead) return;
        refreshCards();
        // the other player's roll arrives while you are sitting here
        poll = setInterval(function () { if (!rolling && !dead) loadGame(); }, 4000);
      });
    },
    unmount: function () {
      dead = true;
      if (poll) { clearInterval(poll); poll = null; }
      host = null; els = {}; game = null;
    },
  });
})();
