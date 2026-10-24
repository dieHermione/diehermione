/* ============================================================================
   admin — hers, and only hers.

   The nav entry is gated on ctx.me.isAdmin, but that is only a nicety: every
   endpoint below re-checks isAdmin server-side, so hiding the section is
   presentation and the server is the boundary. (Hiding is not access control —
   that rule is why the guest dashboard never had an admin link to find.)

   This is a landing page, not the admin panel. /admin still holds the editors
   (hover text, OT12 photos, multitap pool, the completed-run lists); what lives
   here is what she would want to see without opening anything: how much is
   waiting, and the way out.
   ========================================================================== */
(function () {
  "use strict";

  var dead = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function row(k, v, sub) {
    var r = el("div", "row");
    var val = el("span", "v", v);
    if (sub) {
      var s = document.createElement("small");
      s.textContent = " · " + sub;
      val.append(s);
    }
    r.append(el("span", "k", k), val);
    return r;
  }

  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* Who left the waiting runs, newest first, without repeating a name. */
  function fromWhom(entries) {
    var seen = [];
    entries.slice(0, 12).forEach(function (e) {
      if (e.player && seen.indexOf(e.player) < 0) seen.push(e.player);
    });
    return seen.slice(0, 3).join(", ");
  }

  function get(url) {
    return fetch(url).then(function (r) {
      return r.ok ? r.json() : { entries: [] };
    }).catch(function () { return { entries: [] }; });
  }

  window.Shell.register("admin", {
    label: "admin",
    admin: true,
    mount: function (host) {
      dead = false;
      host.append(el("div", "eyebrow", "Hers"));
      host.append(el("h1", null, "Admin"));
      host.append(el("p", "lede",
        "What guests have left behind, and the things only you can reach."));
      host.append(el("div", "rule"));

      var rows = el("div", "rows");
      rows.append(el("div", "loading", "counting"));
      host.append(rows);

      Promise.all([
        get("/api/admin/writing"),
        get("/api/admin/summaries"),
        get("/api/notifications"),
      ]).then(function (out) {
        if (dead) return;
        var writing = out[0].entries || [];
        var summaries = out[1].entries || [];
        var notes = out[2].notifications || [];

        rows.replaceChildren();
        rows.append(row("Writing runs", count(writing.length, "run", "runs"),
          writing.length ? fromWhom(writing) : "nothing waiting"));
        rows.append(row("Summaries", count(summaries.length, "handed in", "handed in")));
        rows.append(row("Notifications", count(notes.length, "unread", "unread")));
      });

      var actions = el("div", "actions");
      actions.style.marginTop = "2rem";

      var panel = el("a", "go", "Open the panel");
      panel.href = "/admin";
      panel.style.textDecoration = "none";

      var out = el("button", "go ghost", "Log out");
      out.type = "button";
      out.addEventListener("click", function () {
        out.disabled = true;
        fetch("/api/logout", { method: "POST" })
          .catch(function () {})
          // the front door starts a fresh guest session
          .then(function () { window.location.href = "/"; });
      });

      actions.append(panel, out);
      host.append(actions);
    },
    unmount: function () { dead = true; },
  });
})();
