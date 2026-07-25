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
 * Keyboard (when the strip has focus): Left / A and Right / D move the focus,
 * Space activates the focused card. Clicking a side card focuses it; clicking
 * the focused card activates it.
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
      "  box-shadow: 0 0 0 3px var(--button-bg), 0 18px 55px var(--shadow),",
      "              0 0 46px 6px rgba(36, 197, 237, 0.5);",
      "}",
      "body[data-theme='dark'] .cardnav-card.focused {",
      "  box-shadow: 0 0 0 3px var(--button-bg), 0 18px 55px var(--shadow),",
      "              0 0 40px 5px rgba(255, 255, 255, 0.3);",
      "}",
      "@media (max-width: 640px) {",
      "  .cardnav-card { --card-w: 230px; --card-w-wide: min(88vw, 420px); --card-h: 300px; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function mount(container, opts) {
    opts = opts || {};
    var cards = opts.cards || [];
    var defaultWide = opts.type === "wide";
    var angle = opts.angle == null ? 20 : opts.angle;
    var step = opts.step == null ? (defaultWide ? 250 : 180) : opts.step;
    var depth = opts.depth == null ? 160 : opts.depth;
    var focus = Math.max(0, Math.min(cards.length - 1, opts.start || 0));

    container.classList.add("cardnav");
    container.tabIndex = 0;
    container.setAttribute("role", "listbox");
    container.setAttribute("aria-label", opts.ariaLabel || "Card navigation");

    var stage = document.createElement("div");
    stage.className = "cardnav-stage";
    container.appendChild(stage);

    var els = cards.map(function (c, i) {
      var isWide = c.type === "wide" || (c.type == null && defaultWide);
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
        var x = o * step;
        var z = -abs * depth;
        var scale = 1 - Math.min(abs, 3) * 0.07;
        var visible = abs <= 2;
        el.style.transform =
          "translateX(" + x + "px) translateZ(" + z + "px) rotateY(" + rot + "deg) scale(" + scale + ")";
        el.style.opacity = visible ? (abs <= 1 ? 1 : 0.55) : 0;
        el.style.pointerEvents = visible ? "auto" : "none";
        el.style.zIndex = String(50 - abs);
        el.setAttribute("aria-selected", i === focus ? "true" : "false");
        el.classList.toggle("focused", i === focus);
      });
    }

    container.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); setFocus(focus - 1); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); setFocus(focus + 1); }
      else if (k === " " || k === "Spacebar" || k === "Enter") { e.preventDefault(); activate(focus); }
    });

    // pointer focus so a click anywhere in the strip lets the keys drive it
    container.addEventListener("pointerdown", function () { container.focus(); });

    render();
    return { setFocus: setFocus, getFocus: function () { return focus; }, el: container };
  }

  window.CardNav = { mount: mount };
})();
