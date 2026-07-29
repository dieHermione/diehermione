/* "A new version is live" notice.
 *
 * The server stamps a build id when it boots, so a Railway redeploy changes it.
 * Every page records the id it loaded with and re-checks periodically; when the
 * two differ, a small in-theme bar offers a reload. It styles itself from the
 * page's own colours (currentColor, no hard-coded palette) so it looks right on
 * the blue dashboard and the red game pages alike.
 *
 * Self-injecting: including the script is all that is needed.
 */
(function () {
  "use strict";

  var CHECK_MS = 90 * 1000;
  var mine = null, timer = null, shown = false;

  function css() {
    if (document.getElementById("updatecheck-style")) return;
    var s = document.createElement("style");
    s.id = "updatecheck-style";
    s.textContent =
      "#update-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;z-index:10000;" +
      "display:flex;align-items:center;gap:1rem;padding:0.5rem 1.1rem;" +
      "font-family:inherit;font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;" +
      "color:inherit;background:rgba(0,0,0,0.86);border:1px solid currentColor;border-bottom:none;" +
      "opacity:0;transition:opacity .35s ease,bottom .35s ease;}" +
      "#update-bar.on{opacity:1;}" +
      "#update-bar button{font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer;" +
      "background:transparent;border:1px solid currentColor;color:inherit;padding:0.18rem 0.8rem;}" +
      "#update-bar button:hover{background:currentColor;filter:invert(1);}";
    document.head.appendChild(s);
  }

  function show() {
    if (shown) return; shown = true;
    stop();
    css();
    var bar = document.createElement("div");
    bar.id = "update-bar";
    var msg = document.createElement("span");
    msg.textContent = "a new version is live";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "reload";
    btn.addEventListener("click", function () { window.location.reload(); });
    bar.append(msg, btn);
    document.body.appendChild(bar);
    // rAF gives the clean fade, but it never fires in a background tab, which
    // would leave the bar sitting at opacity 0. The timeout is the safety net.
    var reveal = function () { bar.classList.add("on"); };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 80);
  }

  function check() {
    return fetch("/api/version", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.build) return;
        if (mine === null) { mine = d.build; return; }
        if (d.build !== mine) show();
      })
      .catch(function () { /* offline or restarting; try again next tick */ });
  }

  function stop() { clearInterval(timer); timer = null; }

  function start() {
    check();
    timer = setInterval(function () { if (!document.hidden) check(); }, CHECK_MS);
    // coming back to the tab is the most likely moment to have missed a deploy
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && !shown) check();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
