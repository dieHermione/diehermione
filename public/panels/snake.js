/* ============================================================================
   snake — free-swimming, no grid; dies on its own tail.

   Ported from views/snake.html. **The physics, the drawing and the food rules
   are the page's own code, moved across unedited.** Retyping 400 lines of
   steering and tapered-outline drawing would only introduce transcription
   bugs, so the port is a surgical diff:

     * the playfield was `window.innerWidth × innerHeight`; it is now the stage
       inside the panel, so the snake cannot swim under the leopard frame
     * touch steering split the WINDOW in half; it now splits the canvas
     * the keydown/keyup handlers became named functions, so unmount can take
       them off again
     * a `stopped` flag guards the rAF re-schedule, so ending the loop does not
       depend on stop() happening to land between two frames
     * the colours came from the terminal palette (`--heart-color`,
       `--button-bg`); they are `--err` and `--ink` now
     * leaving goes to the home SECTION, not to another document
     * identity comes from the shell, which already resolved it

   The run stays bounded server-side: /api/snake/session records the limit,
   /api/snake/food refuses outside a live run and rate-limits, and
   /api/snake/complete returns the server's count, which the results show.
   ========================================================================== */
(function () {
  "use strict";

  var host = null, stage = null, offResize = null, started = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* The core below reaches for these ids, exactly as the page laid them out.
     Keeping the ids is what let the game move across unedited. */
  function build(h) {
    var hud = el("div", "sn-hud");
    var mk = function (label, id) {
      var d = el("div");
      d.append(el("div", "k", label));
      var v = el("div", "v", "0");
      v.id = id;
      d.append(v);
      hud.append(d);
      return d;
    };
    mk("score", "hud-score");
    mk("length", "hud-length");
    mk("eaten", "hud-earned");

    var boostBox = el("div");
    boostBox.append(el("div", "k", "boost · hold shift"));
    var bar = el("div", "boostbar");
    bar.id = "boostbar";
    var fill = document.createElement("span");
    fill.id = "boost-fill";
    bar.append(fill);
    boostBox.append(bar);
    hud.append(boostBox);

    var tmr = el("div", "sn-timer");
    tmr.id = "tmr";
    tmr.hidden = true;
    tmr.append(el("div", "k", "time left"));
    var tv = el("span", null, "0:00");
    tv.id = "tmr-val";
    tmr.append(tv);
    hud.append(tmr);

    stage = el("div", "sn-stage");
    var canvas = document.createElement("canvas");
    canvas.id = "game";
    var status = el("p", "sn-status");
    status.id = "status";

    // the two overlays sit over the stage, not over the page
    var settings = el("div", "sn-overlay");
    settings.id = "settings";
    settings.append(el("div", "flabel", "time limit · minutes"));
    var mins = document.createElement("input");
    mins.type = "text"; mins.inputMode = "numeric"; mins.maxLength = 3; mins.value = "2";
    mins.id = "minutes";
    mins.setAttribute("aria-label", "time limit in minutes");
    var begin = el("button", "go", "Begin");
    begin.type = "button"; begin.id = "begin";
    settings.append(mins, begin);

    var results = el("div", "sn-overlay");
    results.id = "results";
    results.hidden = true;
    var rt = el("h1", null, "time");
    rt.id = "r-title";
    var stat = el("div", "sn-stat");
    var rf = document.createElement("b");
    rf.id = "r-food";
    rf.textContent = "0";
    stat.append(rf, document.createTextNode(" eaten"));
    var again = el("button", "go", "Again");
    again.type = "button"; again.id = "again";
    var rback = el("button", "go ghost", "Home");
    rback.type = "button"; rback.id = "results-back";
    var rrow = el("div", "actions");
    rrow.append(again, rback);
    results.append(rt, stat, rrow);

    stage.append(canvas, status, settings, results);

    var pause = el("button", "go ghost", "Pause");
    pause.type = "button"; pause.id = "pause"; pause.disabled = true;
    var back = el("button", "go ghost", "Home");
    back.type = "button"; back.id = "back";
    var acts = el("div", "actions");
    acts.append(pause, back);

    h.append(el("div", "eyebrow", "Arcade"), hud, stage, acts);
  }

  function run() {

      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const statusEl = document.getElementById("status");

      /* Free-swimming snake: no grid. The head carries a heading angle and moves
         at a constant speed; steering turns that angle rather than snapping to
         one of four directions. The body is the trail the head has just walked,
         drawn as one tapered outline, so it bends and twists with the turns.
         Running into your own body ends the run: the first stretch behind the
         head is skipped so a hard turn cannot kill you on its own. */

      const SPEED = 456;          // px per second (1.2x the old default of 380)
      const TURN = 3.4;           // radians per second at full lock
      // The trail is the body, so its length in px is also how much of a turn
      // stays visible: at SPEED this is a little over a second of history.
      const START_LEN = 520;      // doubled from the old 260 so the snake starts long
      const GROW_PER_FOOD = 42;
      const HEAD_R = 9;           // head radius; the body tapers away from this
      const FOOD_R = 9;
      const FLEE_R = 46;          // the food bolts if the head gets this close
      // The food drifts at 0.6x the snake's pace — half the old snake speed times the
      // 1.2x food bump, which lands the same whether measured off the old or new SPEED.
      const FOOD_SPEED = SPEED / 2;
      const FOOD_TURN_MIN = 0.5, FOOD_TURN_MAX = 1.8;  // seconds between direction changes
      const NECK = 34;            // trail points behind the head that cannot kill
      // boost: hold space to go faster. A full bar buys ~5s at BOOST_MULT and
      // refills over BOOST_FILL_SECONDS. While held and empty it stays empty until
      // released, so you cannot feather it for free.
      const BOOST_MULT = 1.9;
      const BOOST_SECONDS = 5;        // a full bar lasts about five seconds
      const BOOST_FILL_SECONDS = 16;  // and refills from empty in about sixteen

      let W = 0, H = 0;
      // PORT: the window used to be the playfield. Now it is the stage inside the
      // panel, so the snake can never swim under the frame or behind the nav.
      function sizeCanvas() {
        const box = stage.getBoundingClientRect();
        canvas.width = W = Math.max(80, Math.round(box.width));
        canvas.height = H = Math.max(80, Math.round(box.height));
      }
      sizeCanvas();
      offResize = window.Shell.onResize(() => { sizeCanvas(); if (path.length) draw(); });

      const heartColor = () => getComputedStyle(document.body).getPropertyValue("--err").trim() || "#8a1b2c";
      function headColor() { return getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#171318"; }
      function hexToRgb(hex) { const h = hex.replace("#", ""); const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)); }
      function shade(base, t) {                       // t 0 head .. 1 tail
        const [r, g, b] = hexToRgb(base);
        const k = 1 - Math.min(0.62, t * 0.62);
        return "rgb(" + Math.round(r * k) + "," + Math.round(g * k) + "," + Math.round(b * k) + ")";
      }

      let teleportChance = 0.9;
      let path = [];              // [{x,y}], newest first; the body is this trail
      let angle = 0, turnInput = 0, targetLen = START_LEN;
      let food = null, score = 0, earned = 0, alive = false, raf = null, last = 0, paused = false;
      let stopped = false;          // set by stop(); frame() checks it before re-scheduling
      let boost = 1, boostHeld = false;   // boost: 0..1 charge, and whether space is down
      let fleeArmed = true;       // one escape roll per approach, not per frame
      let foodAngle = 0, foodTurnAt = 0, elapsed = 0;
      let timeLimit = 120, timeLeft = 0;   // seconds; the run is a race for the most food

      // wrap coordinates onto the torus the old grid used
      function wrap(p) {
        if (p.x < 0) p.x += W; else if (p.x >= W) p.x -= W;
        if (p.y < 0) p.y += H; else if (p.y >= H) p.y -= H;
        return p;
      }
      // shortest distance on a torus, so "near the food" works across the seam
      function dist(a, b) {
        let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        if (dx > W / 2) dx = W - dx;
        if (dy > H / 2) dy = H - dy;
        return Math.hypot(dx, dy);
      }
      function placeFood(minDist) {
        // a fresh piece of food sets off in a new random direction
        foodAngle = Math.random() * Math.PI * 2;
        foodTurnAt = elapsed + FOOD_TURN_MIN + Math.random() * (FOOD_TURN_MAX - FOOD_TURN_MIN);
        const head = path[0] || { x: W / 2, y: H / 2 };
        let best = null, bestD = -1;
        for (let i = 0; i < 40; i++) {                 // rejection sample, keep the furthest
          const c = { x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 80) };
          const d = dist(c, head);
          if (d >= minDist) return c;
          if (d > bestD) { bestD = d; best = c; }
        }
        return best;
      }

      // The food escaping is the game's whole tease.
      // its own: a single brief blip rather than the dashboard's full strobe.
      // Taunts were subliminal blips; subliminals were removed site-wide.
      function taunt() {}

      function reset() {
        path = [];
        const start = { x: W / 2, y: H / 2 };
        for (let i = 0; i < 24; i++) path.push({ x: start.x - i * 4, y: start.y });
        angle = 0; turnInput = 0; targetLen = START_LEN;
        score = 0; alive = true; elapsed = 0;
        food = placeFood(220);
      }

      // total length of the trail in px, used to trim it to targetLen
      function trimPath() {
        let acc = 0;
        for (let i = 1; i < path.length; i++) {
          const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
          // a wrap jump is not real distance travelled; stop measuring across it
          acc += seg > Math.min(W, H) / 2 ? 0 : seg;
          if (acc > targetLen) { path.length = i + 1; return; }
        }
      }

      // The body kills, but only past the neck: the trail immediately behind the
      // head is always within a body-width of it, so counting that would end the
      // run the instant you turned hard.
      function hitsSelf(head) {
        for (let i = NECK; i < path.length; i++) {
          if (dist(head, path[i]) < HEAD_R * 0.9) return true;
        }
        return false;
      }

      function moveFood(dt) {
        if (!food) return;
        if (elapsed >= foodTurnAt) {
          // slightly wider swing than the old +-90deg, so the food wanders more
          foodAngle += (Math.random() - 0.5) * Math.PI * 1.4;
          foodTurnAt = elapsed + FOOD_TURN_MIN + Math.random() * (FOOD_TURN_MAX - FOOD_TURN_MIN);
        }
        // The food is penned inside the window: it bounces off the walls instead of
        // wrapping through them (the snake still wraps; only the food is bounded).
        let nx = food.x + Math.cos(foodAngle) * FOOD_SPEED * dt;
        let ny = food.y + Math.sin(foodAngle) * FOOD_SPEED * dt;
        if (nx < FOOD_R)       { nx = FOOD_R;     foodAngle = Math.PI - foodAngle; }
        else if (nx > W - FOOD_R) { nx = W - FOOD_R; foodAngle = Math.PI - foodAngle; }
        if (ny < FOOD_R)       { ny = FOOD_R;     foodAngle = -foodAngle; }
        else if (ny > H - FOOD_R) { ny = H - FOOD_R; foodAngle = -foodAngle; }
        food = { x: nx, y: ny };
      }

      function step(dt) {
        elapsed += dt;
        // resolve boost: drain while held with charge left, otherwise refill
        let speedMult = 1;
        if (boostHeld && boost > 0) {
          speedMult = BOOST_MULT;
          boost = Math.max(0, boost - dt / BOOST_SECONDS);
        } else if (!boostHeld) {
          boost = Math.min(1, boost + dt / BOOST_FILL_SECONDS);
        }
        angle += turnInput * TURN * dt;
        const head = path[0];
        const spd = SPEED * speedMult;
        const next = wrap({ x: head.x + Math.cos(angle) * spd * dt, y: head.y + Math.sin(angle) * spd * dt });
        path.unshift(next);
        trimPath();
        if (hitsSelf(next)) { gameOver(); return; }
        moveFood(dt);

        if (food) {
          const d = dist(next, food);
          if (d < HEAD_R + FOOD_R) {
            score++; targetLen += GROW_PER_FOOD; awardFood(); showScore();
            food = placeFood(220); fleeArmed = true;
          } else if (d < FLEE_R) {
            // One roll per approach, taken as the head crosses into range. The
            // old per-frame roll was frame-rate and speed dependent: at the new
            // 380px/s the head covers the gap in about four frames, so the food
            // only got away a third of the time instead of teleportChance.
            if (fleeArmed) {
              fleeArmed = false;
              if (Math.random() < teleportChance) { food = placeFood(320); taunt(); }
            }
          } else {
            fleeArmed = true;                       // left the zone, re-arm
          }
        }
      }

      /* ---- drawing: one tapered outline built from the trail ---- */
      // t 0 head .. 1 tail. A linear taper reads as a dart, so hold most of the
      // width through the body and lose it late, which looks like an animal.
      function widthAt(t) { return HEAD_R * Math.pow(1 - t, 0.45) + 1.2; }

      // split the trail wherever it jumps across a screen edge, so a wrapped
      // body draws as two pieces instead of one line straight across the arena
      function runs() {
        const out = []; let cur = [path[0]];
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          if (Math.hypot(b.x - a.x, b.y - a.y) > Math.min(W, H) / 2) { out.push(cur); cur = [b]; }
          else cur.push(b);
        }
        out.push(cur);
        return out.filter((r) => r.length > 1);
      }

      function drawBody(base) {
        const total = path.length;
        let consumed = 0;
        for (const run of runs()) {
          const left = [], right = [];
          for (let i = 0; i < run.length; i++) {
            const p = run[i];
            const prev = run[Math.max(0, i - 1)], nextP = run[Math.min(run.length - 1, i + 1)];
            let tx = nextP.x - prev.x, ty = nextP.y - prev.y;
            const m = Math.hypot(tx, ty) || 1;
            tx /= m; ty /= m;
            const w = widthAt(Math.min(1, (consumed + i) / total));
            left.push({ x: p.x - ty * w, y: p.y + tx * w });
            right.push({ x: p.x + ty * w, y: p.y - tx * w });
          }
          consumed += run.length;
          ctx.beginPath();
          ctx.moveTo(left[0].x, left[0].y);
          for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
          for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
          ctx.closePath();
          const g = ctx.createLinearGradient(run[0].x, run[0].y, run[run.length - 1].x, run[run.length - 1].y);
          g.addColorStop(0, shade(base, 0)); g.addColorStop(1, shade(base, 1));
          ctx.fillStyle = g;
          ctx.fill();
        }
      }

      function drawHeart(cx, cy, size) {
        ctx.save();
        ctx.shadowColor = "rgba(255,60,48,0.9)"; ctx.shadowBlur = size * 0.7;
        ctx.fillStyle = heartColor();
        ctx.beginPath();
        const s = size / 2;
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.bezierCurveTo(cx + s, cy - s * 0.4, cx + s * 0.5, cy - s, cx, cy - s * 0.3);
        ctx.bezierCurveTo(cx - s * 0.5, cy - s, cx - s, cy - s * 0.4, cx, cy + s * 0.6);
        ctx.fill();
        ctx.restore();
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        if (food) drawHeart(food.x, food.y, FOOD_R * 2);
        if (!path.length) return;
        const base = headColor();
        drawBody(base);
        // head, with the glow the old square head carried
        const h = path[0];
        ctx.save();
        ctx.shadowColor = base; ctx.shadowBlur = HEAD_R * 1.6;
        ctx.fillStyle = base;
        ctx.beginPath(); ctx.arc(h.x, h.y, HEAD_R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      function frame(now) {
        // frame() re-schedules BEFORE it checks anything, so `raf` always holds
        // the next frame's id and stop()'s cancelAnimationFrame does end the
        // loop — measured: zero rAF calls after leaving, with or without this
        // flag. It is kept because that correctness depends on stop() landing
        // BETWEEN frames, and the flag makes it independent of timing.
        if (stopped) { raf = 0; return; }
        raf = requestAnimationFrame(frame);
        if (!alive) return;
        if (paused) { last = now; return; }                    // hold position, do not bank time (pauses the timer too)
        const dt = Math.min(0.05, (now - last) / 1000 || 0);   // clamp after a tab stall
        last = now;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; showTimer(); endRun("time"); return; }
        step(dt);
        draw();
        showScore();
        showTimer();
      }

      function showTimer() {
        const s = Math.max(0, Math.ceil(timeLeft));
        document.getElementById("tmr-val").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      }

      async function awardFood() {
        try {
          const res = await fetch("/api/snake/food", { method: "POST" });
          if (!res.ok) return;
          const data = await res.json();
          earned = data.eaten;   // the server's own count for this run
          showScore();
        } catch {}
      }
      function showScore() {
        document.getElementById("hud-score").textContent = score;
        document.getElementById("hud-length").textContent = Math.round(targetLen);
        document.getElementById("hud-earned").textContent = earned;
        const bf = document.getElementById("boost-fill");
        const bb = document.getElementById("boostbar");
        if (bf) bf.style.width = (boost * 100).toFixed(1) + "%";
        if (bb) {
          bb.classList.toggle("firing", boostHeld && boost > 0);
          bb.classList.toggle("ready", !(boostHeld && boost > 0) && boost >= 0.999);
        }
      }
      function gameOver() { endRun("dead"); }   // ran into your own tail

      function endRun(reason) {
        if (!alive) return;
        alive = false;
        const pb = document.getElementById("pause");
        pb.disabled = true;
        document.getElementById("r-title").textContent = reason === "time" ? "time" : "dead";
        document.getElementById("r-food").textContent = score;
        document.getElementById("tmr").hidden = true;
        document.getElementById("results").hidden = false;
        draw();
        // Close the run and show the SERVER's count, so the score on the results
        // screen is the one the server actually recorded rather than ours.
        fetch("/api/snake/complete", { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d && typeof d.eaten === "number") document.getElementById("r-food").textContent = d.eaten; })
          .catch(() => {});
      }

      // The server owns the run: it records the time limit and counts the pickups,
      // and refuses any that arrive after the run's own clock has expired.
      async function start() {
        const mins = Math.max(1, Math.min(999, parseInt(document.getElementById("minutes").value, 10) || 2));
        try {
          const res = await fetch("/api/snake/session", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes: mins }),
          });
          if (!res.ok) return;
        } catch (e) { return; }
        timeLimit = mins * 60; timeLeft = timeLimit;
        document.getElementById("settings").hidden = true;
        document.getElementById("results").hidden = true;
        document.getElementById("tmr").hidden = false;
        sizeCanvas(); reset(); earned = 0; showScore(); showTimer();
        statusEl.textContent = "";
        const pb = document.getElementById("pause");
        pb.disabled = false; pb.textContent = "Pause"; paused = false;
        boost = 1; boostHeld = false;
        last = performance.now();
        if (!raf && !stopped) raf = requestAnimationFrame(frame);
      }

      // steering: hold to turn. There is no reverse and no braking.
      const LEFT_KEYS = { ArrowLeft: 1, Left: 1, KeyA: 1, a: 1 };
      const RIGHT_KEYS = { ArrowRight: 1, Right: 1, KeyD: 1, d: 1 };
      function keyDir(e) {
        const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (LEFT_KEYS[k] || LEFT_KEYS[e.code]) return -1;
        if (RIGHT_KEYS[k] || RIGHT_KEYS[e.code]) return 1;
        return 0;
      }
      function onKeyDown(e) {
        const t = e.target, tag = (t && t.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        if (e.code === "Space") {                 // tap to pause / resume
          e.preventDefault();
          if (!e.repeat) togglePause();
          return;
        }
        if (e.key === "Shift") {                  // hold to boost
          if (alive && !paused) boostHeld = true;
          return;
        }
        const d = keyDir(e);
        if (!d) return;
        e.preventDefault();
        turnInput = d;
      }
      function onKeyUp(e) {
        if (e.key === "Shift") { boostHeld = false; return; }
        const d = keyDir(e);
        if (d && Math.sign(turnInput) === d) turnInput = 0;
      }
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);

      // Touch steering for phones (there is no keyboard): press the left or right
      // half of the screen to turn that way while held, release to go straight. A
      // second finger anywhere is the boost, standing in for Shift.
      function touchTurn(list) {
        const mid = canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2;
        for (const t of list) { if (t.clientX < mid) return -1; return 1; }
        return 0;
      }
      function onTouch(e) {
        e.preventDefault();
        if (!alive || paused) return;
        turnInput = touchTurn(e.touches);
        boostHeld = e.touches.length >= 2;
      }
      canvas.addEventListener("touchstart", onTouch, { passive: false });
      canvas.addEventListener("touchmove", onTouch, { passive: false });
      canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        if (!e.touches.length) { turnInput = 0; boostHeld = false; }
        else onTouch(e);
      }, { passive: false });

      function togglePause() {
        if (!alive) return;
        paused = !paused;
        const pb = document.getElementById("pause");
        pb.textContent = paused ? "Resume" : "Pause";
        statusEl.textContent = paused ? "paused" : "";
      }
      document.getElementById("pause").addEventListener("click", togglePause);
      document.getElementById("begin").addEventListener("click", start);
      document.getElementById("again").addEventListener("click", () => {
        document.getElementById("results").hidden = true;
        document.getElementById("settings").hidden = false;
      });
      document.getElementById("results-back").addEventListener("click", () => { window.Shell.open("home"); });
      // digits only in the minutes field (no number spinner)
      document.getElementById("minutes").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 3); });
      document.getElementById("back").addEventListener("click", () => { window.Shell.open("home"); });

      // the shell already resolved identity; admins get the teleporting food
      if (window.Shell.ctx.me && window.Shell.ctx.me.isAdmin) teleportChance = 0.5;

      ctx.clearRect(0, 0, W, H);
  
    // handed back so unmount can stop everything this started
    return function stop() {
      stopped = true;
      alive = false;
      paused = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (offResize) offResize();
      offResize = null;
    };
  }

  var stop = null;

  window.Shell.register("snake", {
    label: "snake",
    wide: true,
    mount: function (h) {
      host = h;
      build(h);
      // the stage must have a measured size before the canvas is sized from it
      stop = run();
    },
    unmount: function () {
      if (stop) { stop(); stop = null; }
      host = null; stage = null;
    },
  });
})();
