/* Shared shell script: the theme toggle and the top nav.
 *
 * Follows the notifications.js pattern — the page includes this file and gets
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

  var NAV_LINKS = [
    { id: "nav-dashboard", href: "/dashboard", label: "Dashboard" },
    { id: "nav-admin", href: "/admin", label: "Admin", adminOnly: true },
    { id: "nav-profile", href: "/profile", label: "Profile" },
    { id: "nav-tasks", href: "/tasks", label: "Tasks" },
    { id: "nav-mail", href: "/mail", label: "Mail" },
  ];

  // Chess is deliberately absent — the page and its API are still live, it is
  // just not linked for now.
  var GAMES = [
    { id: "nav-snake", href: "/snake", label: "Snake" },
    { id: "nav-writing", href: "/writing", label: "Writing" },
    { id: "nav-wheel", href: "/wheel", label: "Wheel" },
    { id: "nav-deathroll", href: "/deathroll", label: "Deathroll" },
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

  function init() {
    setUpTheme();
    if (!document.body.classList.contains("has-top-nav")) return;

    var nav = buildNav();
    markActive(nav);

    // via /me.js, so this shares the page's single /api/me request rather than
    // racing the page and the bell for the once-a-day check-in result
    window.siteMe()
      .then(function (d) {
        nav.hidden = false;
        var admin = document.getElementById("nav-admin");
        if (admin) admin.hidden = !d.isAdmin;
      })
      .catch(function () { window.location.href = "/"; });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
