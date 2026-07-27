/* Subliminal glitch overlay, shared by the dashboard and the login page (the
 * two "Cirrus" pages read as one connected piece). For now nothing triggers it
 * automatically; a random trigger comes later. The dashboard exposes a small
 * test control that calls Subliminal.flash(i) directly.
 *
 * Usage: Subliminal.flash(indexOrText). Subliminal.messages is the list.
 */
window.Subliminal = (function () {
  "use strict";

  // on-theme subliminal commands. Edit freely; the test dropdown reads this list
  var MESSAGES = [
    "OBEY",
    "KNEEL",
    "SURRENDER",
    "SHE IS WATCHING",
    "YOU BELONG TO HER",
    "GIVE IN",
    "GOOD SERVANT",
    "DO NOT RESIST",
    "DEVOTE YOURSELF",
    "SHE SEES ALL",
  ];

  var overlay = null, wordEl = null, styleInjected = false;

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var css = [
      ".subliminal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
      "pointer-events:none;opacity:0;overflow:hidden;}",
      ".subliminal.on{animation:sublimVeil 0.52s steps(1,end) forwards;}",
      /* a brief dark wash so the flash reads against the bright sky pages */
      ".subliminal::before{content:'';position:absolute;inset:0;background:rgba(4,8,10,0.72);}",
      /* scanlines + static texture */
      ".subliminal::after{content:'';position:absolute;inset:0;pointer-events:none;",
      "background:repeating-linear-gradient(0deg,rgba(0,0,0,0.35) 0 1px,transparent 1px 3px);mix-blend-mode:overlay;opacity:0.7;}",
      ".subliminal .word{position:relative;font-family:'Oswald','Quicksand',-apple-system,sans-serif;",
      "font-weight:700;text-transform:uppercase;letter-spacing:0.06em;",
      "font-size:clamp(2.4rem,9vw,7rem);color:#f4f4f2;line-height:1;text-align:center;padding:0 6vw;",
      "text-shadow:0 0 10px rgba(255,255,255,0.25);}",
      ".subliminal.on .word{animation:sublimJit 0.52s steps(2,end) forwards;}",
      /* chromatic split */
      ".subliminal .word::before,.subliminal .word::after{content:attr(data-t);position:absolute;left:0;right:0;top:0;padding:inherit;}",
      ".subliminal .word::before{color:#ff2d55;transform:translate(-3px,0);clip-path:inset(0 0 52% 0);opacity:0.85;}",
      ".subliminal .word::after{color:#22d3ff;transform:translate(3px,0);clip-path:inset(50% 0 0 0);opacity:0.8;}",
      "@keyframes sublimVeil{0%{opacity:0}6%{opacity:1}14%{opacity:0.15}22%{opacity:1}34%{opacity:0.5}44%{opacity:1}82%{opacity:1}100%{opacity:0}}",
      "@keyframes sublimJit{0%{transform:translate(0,0) skewX(0)}18%{transform:translate(-6px,2px) skewX(6deg)}",
      "36%{transform:translate(5px,-2px) skewX(-5deg)}54%{transform:translate(-3px,1px) skewX(2deg)}",
      "72%{transform:translate(2px,0) skewX(0)}100%{transform:translate(0,0)}}",
      "@media(prefers-reduced-motion:reduce){.subliminal.on{animation-duration:0.3s}.subliminal.on .word{animation:none}}",
    ].join("");
    var s = document.createElement("style");
    s.id = "subliminal-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensure() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement("div");
    overlay.className = "subliminal";
    overlay.setAttribute("aria-hidden", "true");
    wordEl = document.createElement("div");
    wordEl.className = "word";
    overlay.appendChild(wordEl);
    document.body.appendChild(overlay);
    overlay.addEventListener("animationend", function (e) {
      if (e.target === overlay) overlay.classList.remove("on");
    });
  }

  function flash(which) {
    ensure();
    var text = typeof which === "number" ? MESSAGES[which] : String(which);
    if (text == null) return;
    wordEl.textContent = text;
    wordEl.setAttribute("data-t", text);
    overlay.classList.remove("on");
    void overlay.offsetWidth; // reflow so the animation can replay
    overlay.classList.add("on");
  }

  return { flash: flash, messages: MESSAGES };
})();
