/* Shared shell script: the back button.
 *
 * Follows the notifications.js pattern. The page includes this file and gets the
 * back chevron injected, rather than every page carrying its own copy.
 *
 * The old pill nav, the games dropdown and the dark/light theme toggle are all
 * deprecated and were removed — this file now only injects the back button and
 * runs the signed-out redirect gate. (notifications.js still looks for
 * `.top-nav .nav-links` but falls back to `#notif-slot`, which is what every
 * page actually provides now.)
 *
 * The button is only injected on pages whose <body> carries `has-top-nav`. That
 * gate is what keeps the login page (public/index.html) chrome-free and, just as
 * importantly, stops it running the signed-in redirect below. */
(function () {
  "use strict";

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "className") node.className = props[k];
      else if (k === "text") node.textContent = props[k];
      else if (k === "hidden") node.hidden = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  /* --- back button ---------------------------------------------------- */
  // Shared-shell pages get a back-to-dashboard button in the Elysium style.
  function injectBackStyle() {
    if (document.getElementById("dashback-style")) return;
    var s = document.createElement("style");
    s.id = "dashback-style";
    // No plate behind the chevron: it inherits the page's own text colour so it
    // reads correctly on the dark terminal skins as well as the light ones.
    s.textContent = ".dash-back{position:fixed;top:1.3rem;left:1.3rem;z-index:1000;width:2.6rem;height:2.6rem;" +
      "border-radius:50%;display:flex;align-items:center;justify-content:center;background:none;" +
      "color:inherit;opacity:0.75;text-decoration:none;transition:transform .2s ease,opacity .2s ease;}" +
      ".dash-back:hover{transform:translateY(-2px);opacity:1;}" +
      ".dash-back svg{width:22px;height:22px;}";
    document.head.appendChild(s);
  }

  function init() {
    if (!document.body.classList.contains("has-top-nav")) return;
    injectBackStyle();
    // Individual games send you back to the wall they were opened from. The wall
    // itself is one level up: its back button goes to the dashboard instead.
    var onWall = location.pathname === "/games" || location.pathname === "/games/";
    var label = onWall ? "Back to dashboard" : "Back to games";
    var back = el("a", { className: "dash-back", href: onWall ? "/dashboard" : "/games", "aria-label": label, title: label });
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    back.hidden = true;
    // A game can intercept "back": while a run is going it returns you to the
    // game's own settings screen, and from that screen it sends you home. If the
    // hook returns true it handled it and the default navigation is suppressed.
    back.addEventListener("click", function (e) {
      if (typeof window.__navBack === "function" && window.__navBack()) e.preventDefault();
    });
    document.body.insertBefore(back, document.body.firstChild);
    // gate: bounce signed-out visitors, and send a guest back to the guest page
    window.siteMe()
      .then(function (d) { back.hidden = false; if (d && d.guest) back.setAttribute("href", "/dashboard"); })
      .catch(function () { window.location.href = "/"; });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
