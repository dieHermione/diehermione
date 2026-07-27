/* Subliminal glitch overlay, shared by the dashboard and the login page.
 *
 * Ten DIFFERENT effect implementations of the same idea: a message flashes
 * subliminally over the page. The dashboard test dropdown picks which effect to
 * preview. No automatic/random trigger yet.
 *
 *   Subliminal.flash(effectIndex, message?)   // message defaults to a random one
 *   Subliminal.effects     // ordered list of effect names (for the dropdown)
 *   Subliminal.messages    // the phrase pool
 */
window.Subliminal = (function () {
  "use strict";

  var MESSAGES = [
    "OBEY", "KNEEL", "SURRENDER", "SHE IS WATCHING", "YOU BELONG TO HER",
    "GIVE IN", "GOOD SERVANT", "DO NOT RESIST", "DEVOTE YOURSELF", "SHE SEES ALL",
  ];

  // order matters: the dashboard dropdown is indexed by this list
  var EFFECTS = [
    { key: "chroma", name: "Chromatic split" },
    { key: "frame", name: "Single-frame flash" },
    { key: "static", name: "Static burst" },
    { key: "tear", name: "Datamosh tear" },
    { key: "sweep", name: "Scanline sweep" },
    { key: "invert", name: "Colour invert" },
    { key: "decode", name: "Decode / scramble" },
    { key: "rush", name: "Zoom rush" },
    { key: "echo", name: "Ghost echo" },
    { key: "crt", name: "CRT collapse" },
  ];

  var overlay, word, canvas, styleInjected;
  var timers = [];

  function css() {
    return [
      ".subliminal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;opacity:0;}",
      ".subliminal.show{opacity:1;}",
      ".subliminal .veil{position:absolute;inset:0;background:rgba(4,8,10,0.72);opacity:0;}",
      ".subliminal .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.35) 0 1px,transparent 1px 3px);mix-blend-mode:overlay;opacity:0;}",
      ".subliminal canvas{position:absolute;inset:0;width:100%;height:100%;opacity:0;}",
      ".subliminal .word{position:relative;font-family:'Oswald','Quicksand',-apple-system,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;font-size:clamp(2.4rem,9vw,7rem);color:#f4f4f2;line-height:1;text-align:center;padding:0 6vw;opacity:0;white-space:nowrap;}",

      /* 1 chroma */
      ".subliminal[data-fx=chroma].on .veil{animation:vFlick 0.5s steps(1,end) forwards;}",
      ".subliminal[data-fx=chroma].on .scan{opacity:0.7;}",
      ".subliminal[data-fx=chroma].on .word{animation:jit 0.52s steps(2,end) forwards;}",
      ".subliminal[data-fx=chroma] .word::before,.subliminal[data-fx=chroma] .word::after{content:attr(data-t);position:absolute;left:0;right:0;top:0;padding:inherit;}",
      ".subliminal[data-fx=chroma] .word::before{color:#ff2d55;transform:translate(-4px,0);clip-path:inset(0 0 52% 0);}",
      ".subliminal[data-fx=chroma] .word::after{color:#22d3ff;transform:translate(4px,0);clip-path:inset(50% 0 0 0);}",
      "@keyframes vFlick{0%{opacity:0}6%{opacity:1}16%{opacity:.2}26%{opacity:1}44%{opacity:.5}54%{opacity:1}88%{opacity:1}100%{opacity:0}}",
      "@keyframes jit{0%{opacity:0;transform:translate(0,0)}6%{opacity:1}18%{transform:translate(-7px,2px) skewX(7deg)}36%{transform:translate(6px,-2px) skewX(-6deg)}54%{transform:translate(-3px,1px)}82%{opacity:1;transform:translate(0,0)}100%{opacity:0}}",

      /* 2 single-frame: two ultra-brief inverted blips */
      ".subliminal[data-fx=frame] .word{mix-blend-mode:difference;color:#fff;}",
      ".subliminal[data-fx=frame].on .word{animation:blip 0.42s steps(1,end) forwards;}",
      "@keyframes blip{0%,100%{opacity:0}4%{opacity:1}9%{opacity:0}40%{opacity:0}45%{opacity:1}50%{opacity:0}}",

      /* 3 static: canvas noise + word bleed */
      ".subliminal[data-fx=static].on canvas{animation:stat 0.66s steps(1,end) forwards;}",
      ".subliminal[data-fx=static].on .word{animation:bleed 0.66s ease forwards;}",
      "@keyframes stat{0%{opacity:0}5%{opacity:.9}70%{opacity:.85}100%{opacity:0}}",
      "@keyframes bleed{0%{opacity:0;filter:blur(6px)}30%{opacity:0.2}55%{opacity:1;filter:blur(0)}80%{opacity:1}100%{opacity:0}}",

      /* 4 tear: horizontal displaced bands (built in JS) */
      ".subliminal[data-fx=tear].on .veil{opacity:0.6;}",
      ".subliminal[data-fx=tear] .word{white-space:nowrap;}",
      ".subliminal[data-fx=tear] .band{position:absolute;left:0;right:0;text-align:center;color:#f4f4f2;}",

      /* 5 sweep: a bright bar crosses; word revealed as it passes */
      ".subliminal[data-fx=sweep].on .veil{opacity:0.75;}",
      ".subliminal[data-fx=sweep] .bar{position:absolute;left:0;right:0;height:12vh;background:linear-gradient(180deg,transparent,rgba(190,235,255,0.5),transparent);opacity:0;}",
      ".subliminal[data-fx=sweep].on .bar{animation:sweepbar 0.7s ease-in-out forwards;}",
      ".subliminal[data-fx=sweep].on .word{animation:sweepword 0.7s ease forwards;}",
      "@keyframes sweepbar{0%{opacity:0;transform:translateY(-60vh)}10%{opacity:1}90%{opacity:1}100%{opacity:0;transform:translateY(60vh)}}",
      "@keyframes sweepword{0%{opacity:0}35%{opacity:0.15}50%{opacity:1}70%{opacity:0.4}100%{opacity:0}}",

      /* 6 invert: whole viewport inverts briefly */
      ".subliminal[data-fx=invert].on{backdrop-filter:invert(1) hue-rotate(180deg);-webkit-backdrop-filter:invert(1) hue-rotate(180deg);animation:invpulse 0.5s steps(1,end) forwards;}",
      ".subliminal[data-fx=invert].on .word{color:#000;animation:invword 0.5s ease forwards;}",
      "@keyframes invpulse{0%{opacity:0}8%{opacity:1}20%{opacity:0.2}30%{opacity:1}70%{opacity:1}100%{opacity:0}}",
      "@keyframes invword{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}",

      /* 7 decode: text scrambles (chars swapped in JS), veil behind */
      ".subliminal[data-fx=decode].on .veil{opacity:0.7;}",
      ".subliminal[data-fx=decode] .word{color:#9effa8;font-family:'IBM Plex Mono',monospace;text-shadow:0 0 10px rgba(80,220,120,0.5);}",
      ".subliminal[data-fx=decode].on .word{animation:showhold 1s ease forwards;}",
      "@keyframes showhold{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}",

      /* 8 rush: word charges forward */
      ".subliminal[data-fx=rush].on .veil{animation:vFlick 0.55s steps(1,end) forwards;}",
      ".subliminal[data-fx=rush].on .word{animation:rush 0.55s cubic-bezier(0.6,0,0.9,0.3) forwards;}",
      "@keyframes rush{0%{opacity:0;transform:scale(0.1)}20%{opacity:1}100%{opacity:0;transform:scale(6)}}",

      /* 9 echo: ghost copies fan out (built in JS) */
      ".subliminal[data-fx=echo].on .veil{opacity:0.55;}",
      ".subliminal[data-fx=echo] .ghost{position:absolute;left:0;right:0;text-align:center;color:#f4f4f2;opacity:0;}",

      /* 10 crt: word shows then screen collapses to a line */
      ".subliminal[data-fx=crt].on .veil{opacity:0.9;}",
      ".subliminal[data-fx=crt].on{animation:crtoff 0.66s ease-in forwards;transform-origin:center;}",
      ".subliminal[data-fx=crt].on .word{animation:crtword 0.66s ease forwards;}",
      "@keyframes crtoff{0%{opacity:1;transform:scaleY(1) scaleX(1)}55%{opacity:1;transform:scaleY(0.02) scaleX(1)}72%{transform:scaleY(0.02) scaleX(0.0)}100%{opacity:0;transform:scaleY(0.02) scaleX(0)}}",
      "@keyframes crtword{0%{opacity:0}20%{opacity:1}45%{opacity:1}55%{opacity:0}100%{opacity:0}}",

      "@media(prefers-reduced-motion:reduce){.subliminal *{animation-duration:0.3s !important;}}",
    ].join("");
  }

  function ensure() {
    if (overlay) return;
    if (!styleInjected) {
      styleInjected = true;
      var s = document.createElement("style");
      s.id = "subliminal-style"; s.textContent = css();
      document.head.appendChild(s);
    }
    overlay = document.createElement("div");
    overlay.className = "subliminal";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="veil"></div><canvas></canvas><div class="scan"></div>';
    word = document.createElement("div");
    word.className = "word";
    overlay.appendChild(word);
    canvas = overlay.querySelector("canvas");
    document.body.appendChild(overlay);
  }

  function clearFx() {
    timers.forEach(clearTimeout); timers = [];
    overlay.className = "subliminal";
    overlay.style.transform = "";
    // strip any JS-built extras (bands / ghosts)
    Array.prototype.slice.call(overlay.querySelectorAll(".band,.ghost,.bar")).forEach(function (n) { n.remove(); });
    word.style.cssText = "";
    word.textContent = "";
  }

  function drawStatic() {
    var w = canvas.width = Math.floor(window.innerWidth / 3);
    var h = canvas.height = Math.floor(window.innerHeight / 3);
    var ctx = canvas.getContext("2d");
    var frames = 0;
    function paint() {
      if (frames++ > 22) return;
      var img = ctx.createImageData(w, h);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      timers.push(setTimeout(paint, 28));
    }
    paint();
  }

  var GLYPHS = "!<>-_\\/[]{}=+*^?#________ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function decode(text) {
    var steps = 14, i = 0;
    function tick() {
      var out = "";
      for (var c = 0; c < text.length; c++) {
        if (text[c] === " ") { out += " "; continue; }
        out += i / steps > c / text.length ? text[c] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      word.textContent = out;
      if (i++ < steps) timers.push(setTimeout(tick, 45));
      else word.textContent = text;
    }
    tick();
  }

  function buildBands(text) {
    var n = 6;
    for (var i = 0; i < n; i++) {
      var b = document.createElement("div");
      b.className = "band"; b.textContent = text;
      b.style.font = "inherit";
      b.style.top = "50%";
      b.style.clipPath = "inset(" + (i / n * 100) + "% 0 " + ((n - i - 1) / n * 100) + "% 0)";
      b.style.transform = "translateY(-50%) translateX(" + ((i % 2 ? 1 : -1) * (8 + i * 6)) + "px)";
      b.style.font = getComputedStyle(word).font;
      b.style.textTransform = "uppercase";
      b.style.letterSpacing = "0.06em";
      overlay.appendChild(b);
      (function (band, idx) {
        band.style.opacity = "0";
        timers.push(setTimeout(function () { band.style.transition = "opacity 0.08s"; band.style.opacity = "1"; }, 40));
        timers.push(setTimeout(function () {
          band.style.transform = "translateY(-50%) translateX(" + ((idx % 2 ? 1 : -1) * 2) + "px)";
          band.style.transition = "transform 0.18s, opacity 0.2s";
        }, 120));
        timers.push(setTimeout(function () { band.style.opacity = "0"; }, 620));
      })(b, i);
    }
  }

  function buildEcho(text) {
    for (var i = 0; i < 5; i++) {
      var g = document.createElement("div");
      g.className = "ghost"; g.textContent = text;
      g.style.font = getComputedStyle(word).font;
      g.style.textTransform = "uppercase"; g.style.letterSpacing = "0.06em";
      g.style.top = "50%"; g.style.transform = "translateY(-50%)";
      overlay.appendChild(g);
      (function (gh, idx) {
        timers.push(setTimeout(function () {
          gh.style.transition = "transform 0.6s ease, opacity 0.6s ease";
          gh.style.opacity = String(0.5 - idx * 0.09);
          gh.style.transform = "translateY(-50%) translateX(" + (idx * 26) + "px) scale(" + (1 + idx * 0.08) + ")";
        }, 20 + idx * 30));
        timers.push(setTimeout(function () { gh.style.opacity = "0"; }, 520 + idx * 30));
      })(g, i);
    }
  }

  var RUN = {
    chroma: function () { done(560); },
    frame: function () { done(460); },
    static: function () { drawStatic(); done(720); },
    tear: function (t) { word.style.opacity = "0"; buildBands(t); done(700); },
    sweep: function () { var bar = document.createElement("div"); bar.className = "bar"; overlay.insertBefore(bar, word); done(760); },
    invert: function () { done(560); },
    decode: function (t) { decode(t); done(1060); },
    rush: function () { done(600); },
    echo: function (t) { word.style.opacity = "0"; buildEcho(t); done(760); },
    crt: function () { done(720); },
  };

  function done(ms) {
    overlay.classList.add("show", "on");
    timers.push(setTimeout(function () { clearFx(); }, ms));
  }

  function flash(which, message) {
    ensure(); clearFx();
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    var text = message != null ? String(message) : MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    overlay.dataset.fx = fx.key;
    word.textContent = text;
    word.setAttribute("data-t", text);
    void overlay.offsetWidth;
    (RUN[fx.key] || RUN.chroma)(text);
  }

  return { flash: flash, effects: EFFECTS.map(function (e) { return e.name; }), messages: MESSAGES };
})();
