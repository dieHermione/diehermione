/* Card navigator: a horizontal, Niri-inspired scrolling strip of cards.
 *
 * One card is always focused and sits dead centre; its neighbours fan out to
 * each side, tilted and pushed back so the strip reads as a shallow cylinder
 * rotating around a central point. Two cards are visible to each side of the
 * focus; anything further is faded out.
 *
 * Reusable on purpose. Include this file, then:
 *
 *   CardNav.mount(containerEl, {
 *     type: "normal" | "wide",          // default card shape for the strip
 *     start: 0,                          // initially focused index
 *     cards: [
 *       { label, sub, href },            // href -> Space / click navigates there
 *       { label, sub, onSelect },        // or a callback
 *       { label, type: "wide" },         // per-card shape override
 *     ],
 *   });
 *
 * Cards of either shape can be mixed in one strip; spacing widens around wide
 * cards so they never collide with their neighbours.
 *
 * Input, when the strip is under the pointer (or keyboard-focused):
 *   - Left / A and Right / D move the focus, Space or Enter opens it.
 *   - Two-finger / horizontal wheel (trackpad) scrolls the focus, and the
 *     browser's back/forward swipe is suppressed while doing so.
 *   - Clicking a side card focuses it; clicking the focused card opens it.
 * With two strips on a page, the one under the mouse is the one that moves.
 *
 * No background of its own: the strip is transparent and inherits the page. */
(function () {
  "use strict";

  if (!document.getElementById("cardnav-styles")) {
    var style = document.createElement("style");
    style.id = "cardnav-styles";
    style.textContent = [
      ".cardnav {",
      "  position: relative;",
      "  width: 100%;",
      "  height: var(--cardnav-h, 420px);",
      "  perspective: 1500px;",
      /* clip (not hidden) with a margin so card shadows aren't cut off top/bottom */
      "  overflow: clip; overflow-clip-margin: 80px;",
      "  outline: none;",
      "  touch-action: pan-y;",           /* let vertical page scroll through, we own horizontal */
      "}",
      ".cardnav-stage { position: absolute; inset: 0; transform-style: preserve-3d; }",
      ".cardnav-card {",
      "  position: absolute;",
      "  top: 50%;",
      "  left: 50%;",
      "  width: var(--card-w, 300px);",
      "  height: var(--card-h, 360px);",
      "  margin-left: calc(var(--card-w, 300px) / -2);",
      "  margin-top: calc(var(--card-h, 360px) / -2);",
      "  border-radius: 18px;",
      "  background: var(--panel-bg);",
      "  box-shadow: 0 12px 40px var(--shadow);",
      "  color: var(--text-color);",
      "  text-decoration: none;",
      "  display: flex;",
      "  flex-direction: column;",
      "  align-items: center;",
      "  justify-content: center;",
      "  gap: 0.4rem;",
      "  padding: 1.6rem;",
      "  text-align: center;",
      "  cursor: pointer;",
      "  user-select: none;",
      "  will-change: transform, opacity;",
      "  transition: transform 0.42s cubic-bezier(0.22, 0.61, 0.36, 1),",
      "              opacity 0.42s ease, box-shadow 0.3s ease;",
      "}",
      ".cardnav-card.cardnav-interactive {",
      "  cursor: default; user-select: auto; align-items: stretch;",
      "  justify-content: flex-start; overflow-y: auto; padding: 1.8rem;",
      "  scrollbar-width: none;",           /* no visible scrollbar on mobile */
      "}",
      ".cardnav-card.cardnav-interactive::-webkit-scrollbar { width: 0; height: 0; }",
      ".cardnav-card.cardnav-interactive > * { width: 100%; }",
      ".cardnav-card.wide {",
      "  width: var(--card-w-wide, 640px);",
      "  margin-left: calc(var(--card-w-wide, 640px) / -2);",
      "}",
      ".cardnav-card .cardnav-title {",
      "  font-family: 'Cause', sans-serif;",
      "  font-size: 1.35rem;",
      "  font-weight: 700;",
      "  color: var(--heading-color);",
      "}",
      ".cardnav-card .cardnav-sub { color: var(--muted-color); font-size: 0.9rem; line-height: 1.4; }",
      ".cardnav-card.focused {",
      "  box-shadow: 0 0 0 3px var(--button-bg), 0 12px 34px var(--shadow),",
      "              0 0 26px 2px rgba(36, 197, 237, 0.5);",
      "}",
      "body[data-theme='dark'] .cardnav-card.focused {",
      "  box-shadow: 0 0 0 3px var(--button-bg), 0 12px 34px var(--shadow),",
      "              0 0 24px 2px rgba(255, 255, 255, 0.3);",
      "}",
      "@media (max-width: 640px) {",
      "  .cardnav-card { --card-w: 230px; --card-w-wide: min(88vw, 420px); --card-h: 300px; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  // Which strip currently owns the keyboard: the one under the pointer, else the
  // keyboard-focused one. Set up once, shared by every strip on the page.
  var instances = [];
  var hovered = null;
  // the strip last interacted with (wheel / touch / click) keeps the keyboard
  // even after the pointer leaves, so arrow keys work without a click first
  var lastActive = null;

  function keyboardTarget() {
    if (hovered) return hovered;
    for (var i = 0; i < instances.length; i++) {
      if (document.activeElement === instances[i].el) return instances[i];
    }
    return lastActive;
  }

  document.addEventListener("keydown", function (e) {
    var t = keyboardTarget();
    if (t) t.onKey(e);
  });

  function mount(container, opts) {
    opts = opts || {};
    var cards = opts.cards || [];
    var defaultWide = opts.type === "wide";
    var angle = opts.angle == null ? 20 : opts.angle;
    var depth = opts.depth == null ? 160 : opts.depth;
    var focus = Math.max(0, Math.min(cards.length - 1, opts.start || 0));

    // Spacing is responsive so the outermost visible cards (two out from the
    // focus) land near the strip's edges at any width, while still overlapping
    // enough to stack. Explicit opts.step / opts.wideStep override this.
    var normalStep, wideStep;
    function computeSteps() {
      var w = container.clientWidth || window.innerWidth || 1000;
      normalStep = opts.step != null ? opts.step : Math.max(130, Math.round(w * 0.15));
      wideStep = opts.wideStep != null ? opts.wideStep : Math.round(normalStep * 1.7);
    }
    computeSteps();

    container.classList.add("cardnav");
    container.tabIndex = 0;
    container.setAttribute("role", "listbox");
    container.setAttribute("aria-label", opts.ariaLabel || "Card navigation");

    var stage = document.createElement("div");
    stage.className = "cardnav-stage";
    container.appendChild(stage);

    var wideFlags = [];
    var els = cards.map(function (c, i) {
      var isWide = c.type === "wide" || (c.type == null && defaultWide);
      wideFlags[i] = isWide;
      var el = document.createElement(c.href ? "a" : "div");
      el.className = "cardnav-card" + (isWide ? " wide" : "") + (c.cardClass ? " " + c.cardClass : "");
      el.setAttribute("role", "option");
      if (c.href) el.href = c.href;

      if (c.label) {
        var title = document.createElement("div");
        title.className = "cardnav-title";
        title.textContent = c.label;
        el.appendChild(title);
      }
      if (c.sub) {
        var sub = document.createElement("div");
        sub.className = "cardnav-sub";
        sub.textContent = c.sub;
        el.appendChild(sub);
      }
      // rich cards may carry an arbitrary element (e.g. the login form)
      if (c.content instanceof HTMLElement) {
        if (c.interactive) el.classList.add("cardnav-interactive");
        el.appendChild(c.content);
      }

      el.addEventListener("click", function (e) {
        // an interactive card lets its own form controls receive the click
        // instead of stealing focus to the strip or "activating" the card
        if (c.interactive && e.target.closest("input,textarea,select,button,a,label,option")) return;
        e.preventDefault();
        container.focus();
        if (i === focus) activate(i);
        else setFocus(i);
      });
      stage.appendChild(el);
      return el;
    });

    // Horizontal spacing walks card to card, so a wide card widens the gap on
    // each of its sides and neighbours never overlap it.
    function unit(i) { return wideFlags[i] ? wideStep : normalStep; }
    function gap(a, b) { return (unit(a) + unit(b)) / 2; }
    // Signed circular distance from the focus, in (-n/2, n/2], so the strip is a
    // ring: the far cards wrap around to the other side.
    function circOffset(i) {
      var n = cards.length;
      var o = ((i - focus) % n + n) % n;   // 0..n-1
      if (o > n / 2) o -= n;
      return o;
    }
    function positionOf(i) {
      var n = cards.length, o = circOffset(i), x = 0, s, a, b;
      for (s = 0; s < o; s++) { a = (focus + s) % n; b = (focus + s + 1) % n; x += gap(a, b); }
      for (s = 0; s > o; s--) { a = ((focus + s - 1) % n + n) % n; b = ((focus + s) % n + n) % n; x -= gap(a, b); }
      return x;
    }
    // remembers each card's last offset so a card that wraps across the seam can
    // teleport instead of animating all the way across the strip
    var prevO = els.map(function () { return null; });

    function activate(i) {
      var c = cards[i];
      if (!c) return;
      if (typeof c.onSelect === "function") c.onSelect();
      else if (c.href) window.location.href = c.href;
    }

    function setFocus(i) {
      var n = cards.length;
      focus = n ? ((i % n) + n) % n : 0;   // wraps: past the last card is the first
      render();
    }

    function render() {
      els.forEach(function (el, i) {
        var o = circOffset(i);
        var abs = Math.abs(o);
        var rot = Math.max(-60, Math.min(60, o * angle));   // side cards face outward
        var x = positionOf(i);
        var z = -abs * depth;
        var scale = 1 - Math.min(abs, 4) * 0.06;
        var visible = abs <= 3;               // focus + three each side = seven cards
        // a card that jumped across the seam moves without a transition
        var wrapped = prevO[i] !== null && Math.abs(o - prevO[i]) > 1;
        if (wrapped) el.style.transition = "none";
        el.style.transform =
          "translateX(" + x + "px) translateZ(" + z + "px) rotateY(" + rot + "deg) scale(" + scale + ")";
        el.style.opacity = !visible ? 0 : abs <= 1 ? 1 : abs === 2 ? 0.55 : 0.3;
        el.style.pointerEvents = visible ? "auto" : "none";
        el.style.zIndex = String(50 - abs);
        el.setAttribute("aria-selected", i === focus ? "true" : "false");
        el.classList.toggle("focused", i === focus);
        if (wrapped) { void el.offsetWidth; el.style.transition = ""; }
        prevO[i] = o;
      });
    }

    function onKey(e) {
      // never hijack typing inside a form control living in an interactive card
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); setFocus(focus - 1); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); setFocus(focus + 1); }
      else if (k === " " || k === "Spacebar" || k === "Enter") { e.preventDefault(); activate(focus); }
    }

    // Trackpad / horizontal wheel. One card per continuous gesture: after a
    // move, ignore further wheel deltas until the gesture pauses (~150ms of no
    // wheel events), so a momentum flick can't run past a single card.
    var wheelAcc = 0, gestureUsed = false, gestureEnd = null;
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: leave the page alone
      e.preventDefault();
      lastActive = api;
      clearTimeout(gestureEnd);
      gestureEnd = setTimeout(function () { gestureUsed = false; wheelAcc = 0; }, 150);
      if (gestureUsed) return;
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) >= 40) {
        setFocus(focus + (wheelAcc > 0 ? 1 : -1));
        gestureUsed = true; wheelAcc = 0;
      }
    }

    // Touch swipe (mobile): one card per swipe.
    var tx = 0, ty = 0, tActive = false;
    container.addEventListener("touchstart", function (e) { var t = e.touches[0]; tx = t.clientX; ty = t.clientY; tActive = true; lastActive = api; }, { passive: true });
    container.addEventListener("touchmove", function (e) {
      if (!tActive) return;
      var t = e.touches[0], dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) {
        setFocus(focus + (dx < 0 ? 1 : -1)); tActive = false;
      }
    }, { passive: true });
    container.addEventListener("touchend", function () { tActive = false; });

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerenter", function () { hovered = api; });
    container.addEventListener("pointerleave", function () { if (hovered === api) hovered = null; });
    container.addEventListener("pointerdown", function () { container.focus(); lastActive = api; });
    window.addEventListener("resize", function () { computeSteps(); render(); });

    var api = { setFocus: setFocus, getFocus: function () { return focus; }, el: container, onKey: onKey };
    instances.push(api);
    render();
    return api;
  }

  window.CardNav = { mount: mount };
})();
