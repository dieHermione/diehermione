/* Login -> dashboard transitions. Each plays a full-screen cover animation on
 * the login page; at the "cover" moment the real login navigates to /dashboard
 * (the cover masks the page load). A login-page test control previews them.
 *
 *   Transitions.list                       // ordered names, for the dropdown
 *   Transitions.play(i, { navigateTo })     // real: cover, then go to the URL
 *   Transitions.play(i)                      // preview: cover, then reveal again
 */
window.Transitions = (function () {
  "use strict";
  var SKY = "linear-gradient(180deg,#8fd8f2,#e8f6fd)";
  var WHITE = "#f2fbff";
  var ACCENT = "#6fd5f0";

  var EFFECTS = [
    { key: "ascend", name: "Ascension pan" },
    { key: "cloudwipe", name: "Cloud wipe" },
    { key: "cardmorph", name: "Card-to-hero morph" },
    { key: "halobloom", name: "Halo bloom" },
    { key: "slide", name: "Coverflow slide" },
    { key: "skyzoom", name: "Sky push-in" },
    { key: "shatter", name: "Glass shatter" },
    { key: "subliminal", name: "Flash cut" },
    { key: "coins", name: "Coin cascade" },
    { key: "iris", name: "Iris" },
  ];

  var overlay, styleInjected, timers = [];

  function injectStyle() {
    if (styleInjected) return; styleInjected = true;
    var s = document.createElement("style"); s.id = "xtrans-style";
    s.textContent = ".xover{position:fixed;inset:0;z-index:100000;pointer-events:none;overflow:hidden;opacity:0;}" +
      ".xover .xl{position:absolute;}" +
      ".xover .xword{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:'Quicksand','Oswald',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;font-size:clamp(2.4rem,8vw,6rem);color:#fff;text-shadow:0 0 10px #fff,0 0 30px #fff;opacity:0;}";
    document.head.appendChild(s);
  }
  function ensure() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement("div"); overlay.className = "xover";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
  }
  function reset() { timers.forEach(clearTimeout); timers = []; overlay.innerHTML = ""; overlay.style.transition = "none"; overlay.style.opacity = "0"; }
  function at(t, fn) { timers.push(setTimeout(fn, t)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // a full-cover layer
  function block(bg) {
    var d = document.createElement("div"); d.className = "xl";
    d.style.cssText = "inset:0;background:" + bg + ";will-change:transform,opacity,clip-path;";
    overlay.appendChild(d); return d;
  }
  function raf(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

  var RUN = {
    ascend: function () {
      var f = block(SKY); f.style.transform = "translateY(100%)"; f.style.transition = "transform 0.72s cubic-bezier(0.4,0,0.2,1)";
      for (var i = 0; i < 5; i++) {
        var c = document.createElement("div"); c.className = "xl";
        var w = rnd(160, 340);
        c.style.cssText = "border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,0.95),transparent 72%);filter:blur(4px);width:" + w + "px;height:" + w * 0.4 + "px;left:" + rnd(0, 85) + "%;top:" + rnd(70, 120) + "%;transition:top 0.8s ease,opacity 0.8s ease;opacity:0.9;";
        overlay.appendChild(c); (function (cc) { raf(function () { cc.style.top = rnd(-20, 40) + "%"; }); })(c);
      }
      raf(function () { f.style.transform = "translateY(0)"; });
      return 730;
    },
    cloudwipe: function () {
      var f = block(WHITE); f.style.transform = "translateX(-100%)"; f.style.transition = "transform 0.66s cubic-bezier(0.5,0,0.2,1)";
      raf(function () { f.style.transform = "translateX(0)"; });
      return 660;
    },
    cardmorph: function () {
      var f = block(WHITE);
      f.style.cssText = "left:50%;top:50%;width:380px;height:520px;background:" + WHITE + ";border-radius:22px;transform:translate(-50%,-50%) scale(1);transition:transform 0.66s cubic-bezier(0.5,0,0.2,1),border-radius 0.66s ease;box-shadow:0 24px 60px rgba(80,150,190,0.4);";
      var sc = Math.max(window.innerWidth / 380, window.innerHeight / 520) * 1.3;
      raf(function () { f.style.transform = "translate(-50%,-50%) scale(" + sc + ")"; f.style.borderRadius = "0"; });
      return 660;
    },
    halobloom: function () {
      var f = block(WHITE); f.style.opacity = "0"; f.style.transition = "opacity 0.4s ease 0.24s";
      var ring = document.createElement("div"); ring.className = "xl";
      ring.style.cssText = "left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:5px solid " + ACCENT + ";box-shadow:0 0 24px " + ACCENT + ",0 0 60px #fff;transform:scale(0.2);opacity:1;transition:transform 0.6s ease,opacity 0.6s ease;";
      overlay.appendChild(ring);
      raf(function () { ring.style.transform = "scale(46)"; ring.style.opacity = "0.2"; f.style.opacity = "1"; });
      return 700;
    },
    slide: function () {
      var f = block(SKY); f.style.transform = "translateX(100%)"; f.style.transition = "transform 0.6s cubic-bezier(0.5,0,0.2,1)";
      raf(function () { f.style.transform = "translateX(0)"; });
      return 600;
    },
    skyzoom: function () {
      var f = block(SKY); f.style.transformOrigin = "center"; f.style.transform = "scale(0.15)"; f.style.opacity = "0.4"; f.style.transition = "transform 0.66s cubic-bezier(0.4,0,0.2,1),opacity 0.4s ease";
      raf(function () { f.style.transform = "scale(1)"; f.style.opacity = "1"; });
      return 660;
    },
    shatter: function () {
      var cols = 6, rows = 4, tw = 100 / cols, th = 100 / rows;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var t = document.createElement("div"); t.className = "xl";
        t.style.cssText = "width:" + tw + "%;height:" + th + "%;left:" + c * tw + "%;top:" + r * th + "%;background:" + WHITE + ";transition:transform 0.6s cubic-bezier(0.3,0.7,0.3,1),opacity 0.6s ease;opacity:0;transform:translate(" + rnd(-60, 60) + "vw," + rnd(-60, 60) + "vh) rotate(" + rnd(-120, 120) + "deg) scale(0.2);";
        overlay.appendChild(t);
        (function (tt, d) { at(d, function () { tt.style.opacity = "1"; tt.style.transform = "translate(0,0) rotate(0) scale(1.02)"; }); })(t, (r + c) * 22);
      }
      return 760;
    },
    subliminal: function () {
      var f = block("#04060a"); f.style.opacity = "0"; f.style.transition = "opacity 0.06s steps(1,end)";
      var w = document.createElement("div"); w.className = "xword"; w.textContent = "WELCOME"; overlay.appendChild(w);
      [0, 120, 250].forEach(function (t0) {
        at(t0, function () { f.style.opacity = "1"; w.style.opacity = "1"; });
        at(t0 + 55, function () { f.style.opacity = "0"; w.style.opacity = "0"; });
      });
      at(360, function () { var wf = block(WHITE); wf.style.opacity = "0"; wf.style.transition = "opacity 0.16s ease"; raf(function () { wf.style.opacity = "1"; }); });
      return 540;
    },
    coins: function () {
      var f = block(WHITE); f.style.transform = "translateY(100%)"; f.style.transition = "transform 0.8s cubic-bezier(0.4,0,0.2,1)";
      for (var i = 0; i < 16; i++) {
        var co = document.createElement("div"); co.className = "xl";
        var sz = rnd(16, 34);
        co.style.cssText = "width:" + sz + "px;height:" + sz + "px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#eafaff,#6fd5f0);box-shadow:0 0 10px rgba(110,210,240,0.6);left:" + rnd(4, 94) + "%;top:-8%;transition:top 0.7s cubic-bezier(0.5,0,0.7,0.4),opacity 0.3s ease;";
        overlay.appendChild(co);
        (function (cc, d) { at(d, function () { cc.style.top = rnd(70, 110) + "%"; }); })(co, rnd(0, 260));
      }
      raf(function () { f.style.transform = "translateY(0)"; });
      return 820;
    },
    iris: function () {
      var f = block(WHITE); f.style.clipPath = "circle(0% at 50% 50%)"; f.style.webkitClipPath = "circle(0% at 50% 50%)"; f.style.transition = "clip-path 0.66s ease,-webkit-clip-path 0.66s ease";
      raf(function () { f.style.clipPath = "circle(150% at 50% 50%)"; f.style.webkitClipPath = "circle(150% at 50% 50%)"; });
      return 660;
    },
  };

  function play(which, opts) {
    ensure(); reset();
    opts = opts || {};
    var idx = typeof which === "number" ? which : 0;
    var fx = EFFECTS[idx] || EFFECTS[0];
    overlay.style.opacity = "1";
    var coverT = (RUN[fx.key] || RUN.iris)();
    at(coverT, function () {
      if (opts.navigateTo) { window.location.href = opts.navigateTo; return; }
      // preview: reveal the page again
      overlay.style.transition = "opacity 0.4s ease"; overlay.style.opacity = "0";
      at(430, reset);
    });
  }

  return { list: EFFECTS.map(function (e) { return e.name; }), play: play, keys: EFFECTS.map(function (e) { return e.key; }) };
})();
