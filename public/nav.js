/* Shared shell script: the theme toggle and the top nav.
 *
 * Follows the notifications.js pattern. The page includes this file and gets
 * the markup injected, rather than every page carrying its own copy. Styles for
 * both live in /site.css.
 *
 * Load order matters: this must come BEFORE /notifications.js, which appends
 * the bell and envelope into `.top-nav .nav-links`. Both are `defer`, and defer
 * scripts run in document order, so listing this one first is enough.
 *
 * The nav is only injected on pages whose <body> carries `has-top-nav`. That
 * gate is what keeps the login page (public/index.html) nav-free and, just as
 * importantly, stops it running the signed-in redirect below. */
(function () {
  "use strict";

  // Tasks (assigned essays / write-it-out) was deprecated; the page still
  // exists but is no longer linked, like chess.
  var NAV_LINKS = [
    { id: "nav-dashboard", href: "/dashboard", label: "Dashboard" },
    { id: "nav-profile", href: "/profile", label: "Profile" },
  ];

  // Chess is deliberately absent. The page and its API are still live, it is
  // just not linked for now.
  var GAMES = [
    { id: "nav-snake", href: "/snake", label: "Snake" },
    { id: "nav-writing", href: "/writing", label: "Writing" },
    { id: "nav-wheel", href: "/wheel", label: "Wheel" },
    { id: "nav-deathroll", href: "/deathroll", label: "Deathroll" },
    { id: "nav-elysium", href: "/elysium", label: "Elysium" },
  ];

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

  function link(item) {
    var a = el("a", { id: item.id, href: item.href, text: item.label });
    if (item.adminOnly) a.hidden = true;
    return a;
  }

  /* --- theme ---------------------------------------------------------- */
  // Three states, not two: with nothing stored we follow the system and keep
  // following it. Only a click stores a preference, and from then on it wins.
  // applyTheme must never persist on page load, or the site stops tracking.
  function setUpTheme() {
    var body = document.body;
    var toggle = document.getElementById("theme-toggle");

    if (!toggle) {
      toggle = el("button", {
        id: "theme-toggle",
        className: "theme-toggle",
        type: "button",
        "aria-pressed": "false",
        "aria-label": "Toggle dark mode",
      }, [el("span", { className: "thumb" })]);
      body.insertBefore(toggle, body.firstChild);
    }

    var systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    var stored = localStorage.getItem("site-theme");

    function applyTheme(theme, persist) {
      body.dataset.theme = theme;
      toggle.classList.toggle("is-dark", theme === "dark");
      toggle.setAttribute("aria-pressed", String(theme === "dark"));
      if (persist) localStorage.setItem("site-theme", theme);
    }

    applyTheme(stored || (systemDark && systemDark.matches ? "dark" : "light"));

    if (systemDark && systemDark.addEventListener) {
      systemDark.addEventListener("change", function (e) {
        if (!localStorage.getItem("site-theme")) applyTheme(e.matches ? "dark" : "light");
      });
    }

    toggle.addEventListener("click", function () {
      applyTheme(body.dataset.theme === "dark" ? "light" : "dark", true);
    });
  }

  /* --- nav ------------------------------------------------------------ */
  function buildNav() {
    var links = el("div", { className: "nav-links" });
    NAV_LINKS.forEach(function (item) { links.appendChild(link(item)); });

    var menu = el("div", { className: "dropdown-menu" });
    GAMES.forEach(function (item) { menu.appendChild(link(item)); });

    links.appendChild(el("div", { className: "dropdown", id: "games-dropdown" }, [
      el("button", { className: "dropdown-toggle", type: "button", text: "Games ▾" }),
      menu,
    ]));

    // Hidden until /api/me confirms a session, so a signed-out visitor never
    // sees the nav flash before being bounced to the login page.
    var nav = el("nav", { id: "top-nav", className: "top-nav", hidden: true }, [links]);
    document.body.insertBefore(nav, document.body.firstChild);
    return nav;
  }

  function markActive(nav) {
    var here = window.location.pathname.replace(/\/+$/, "") || "/";
    Array.prototype.forEach.call(nav.querySelectorAll("a[href]"), function (a) {
      if (a.getAttribute("href") === here) a.classList.add("active");
    });
  }

  // A guest only gets the games. Hide the account pages, lock the multiplayer
  // games behind sign-in, and offer a way to sign in.
  function applyGuestNav() {
    ["nav-dashboard", "nav-profile", "nav-tasks"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.hidden = true;
    });
    ["nav-deathroll", "nav-chess"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) {
        node.classList.add("nav-locked");
        node.removeAttribute("href");
        node.setAttribute("title", "Sign in to play");
      }
    });
    var links = document.querySelector(".top-nav .nav-links");
    if (links && !document.getElementById("nav-signin")) {
      var signin = el("a", { id: "nav-signin", href: "/", text: "Sign in" });
      var dd = document.getElementById("games-dropdown");
      if (dd) links.insertBefore(signin, dd); else links.appendChild(signin);
    }
  }

  // The old pill nav and the dark/light toggle are both deprecated. Shared-shell
  // pages now just get a back-to-dashboard button in the Elysium style.
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
    var back = el("a", { className: "dash-back", href: "/dashboard", "aria-label": "Back to dashboard", title: "Back to dashboard" });
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    back.hidden = true;
    document.body.insertBefore(back, document.body.firstChild);
    // gate: bounce signed-out visitors, and point a guest's back button at sign-in
    window.siteMe()
      .then(function (d) { back.hidden = false; if (d && d.guest) back.setAttribute("href", "/"); })
      .catch(function () { window.location.href = "/"; });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
