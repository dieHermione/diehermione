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
      "  overflow: hidden;",
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

  function keyboardTarget() {
    if (hovered) return hovered;
    for (var i = 0; i < instances.length; i++) {
      if (document.activeElement === instances[i].el) return instances[i];
    }
    return null;
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
      el.className = "cardnav-card" + (isWide ? " wide" : "");
      el.setAttribute("role", "option");
      if (c.href) el.href = c.href;

      var title = document.createElement("div");
      title.className = "cardnav-title";
      title.textContent = c.label || ("Card " + (i + 1));
      el.appendChild(title);
      if (c.sub) {
        var sub = document.createElement("div");
        sub.className = "cardnav-sub";
        sub.textContent = c.sub;
        el.appendChild(sub);
      }

      el.addEventListener("click", function (e) {
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
    function positionOf(i) {
      var x = 0, k;
      if (i > focus) for (k = focus; k < i; k++) x += gap(k, k + 1);
      else if (i < focus) for (k = focus; k > i; k--) x -= gap(k - 1, k);
      return x;
    }

    function activate(i) {
      var c = cards[i];
      if (!c) return;
      if (typeof c.onSelect === "function") c.onSelect();
      else if (c.href) window.location.href = c.href;
    }

    function setFocus(i) {
      focus = Math.max(0, Math.min(cards.length - 1, i));
      render();
    }

    function render() {
      els.forEach(function (el, i) {
        var o = i - focus;
        var abs = Math.abs(o);
        var rot = Math.max(-60, Math.min(60, -o * angle));
        var x = positionOf(i);
        var z = -abs * depth;
        var scale = 1 - Math.min(abs, 4) * 0.06;
        var visible = abs <= 3;               // focus + three each side = seven cards
        el.style.transform =
          "translateX(" + x + "px) translateZ(" + z + "px) rotateY(" + rot + "deg) scale(" + scale + ")";
        el.style.opacity = !visible ? 0 : abs <= 1 ? 1 : abs === 2 ? 0.55 : 0.3;
        el.style.pointerEvents = visible ? "auto" : "none";
        el.style.zIndex = String(50 - abs);
        el.setAttribute("aria-selected", i === focus ? "true" : "false");
        el.classList.toggle("focused", i === focus);
      });
    }

    function onKey(e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); setFocus(focus - 1); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); setFocus(focus + 1); }
      else if (k === " " || k === "Spacebar" || k === "Enter") { e.preventDefault(); activate(focus); }
    }

    // Trackpad / horizontal wheel. Accumulate until a step's worth, then move
    // one card; always preventDefault on a horizontal gesture so the browser
    // never turns it into a back/forward swipe.
    var wheelAcc = 0;
    var wheelLock = false;
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: leave the page alone
      e.preventDefault();
      if (wheelLock) return;
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) >= 42) {
        setFocus(focus + (wheelAcc > 0 ? 1 : -1));
        wheelAcc = 0;
        wheelLock = true;
        setTimeout(function () { wheelLock = false; }, 200);
      }
    }

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerenter", function () { hovered = api; });
    container.addEventListener("pointerleave", function () { if (hovered === api) hovered = null; });
    container.addEventListener("pointerdown", function () { container.focus(); });
    window.addEventListener("resize", function () { computeSteps(); render(); });

    var api = { setFocus: setFocus, getFocus: function () { return focus; }, el: container, onKey: onKey };
    instances.push(api);
    render();
    return api;
  }

  window.CardNav = { mount: mount };
})();
