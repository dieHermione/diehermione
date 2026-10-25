/* ============================================================================
   home — her two lines of copy, and the games.

   Home IS the games list; there is no separate "games" section in the nav. The
   wall at /games is still linked from here, because it has the card art this
   list deliberately does not.

   The copy comes from /api/site, which has already filled in {name} and already
   chosen between the version she sees and the version everyone else sees. Only
   she gets the pencils, and only because /api/site hands her `raw`.
   ========================================================================== */
(function () {
  "use strict";

  /* Her ordering, from the wall. Dummy Parse is NOT here: it was taken off both
     lists on 2026-10-24 rather than ported, the same treatment Wheel and Lottery
     already have. The route still works for anyone holding the link — hiding is
     not access control, and was never meant to be. */
  /* Her ordering, from the wall. A game opens in the panel once its module is
     loaded and falls back to its own page until then, so **porting a game is
     adding its <script> to dashboard.html and nothing else** — this list does
     not change, and neither does anything else here. The ones that still leave
     carry an arrow, so it is never a surprise. */
  var GAMES = [
    { n: "Devotion",    id: "devotion",   href: "/writing" },
    { n: "Multitap",    id: "multitap",   href: "/multitap" },
    { n: "Summary",     id: "summary",    href: "/summary" },
    { n: "Skill Check", id: "skillcheck", href: "/skillcheck" },
    { n: "OT12",        id: "ot12",       href: "/ot12" },
    { n: "Snake",       id: "snake",      href: "/snake" },
    { n: "Deathroll",   id: "deathroll",  href: "/deathroll" },
    { n: "Elysium",     id: "elysium",    href: "/elysium" },
    { n: "Chess",       id: "chess",      href: "/chess" },
  ];

  var ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
    "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth",
    "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second",
    "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh",
    "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first"];

  /* Eastern time, spelled out, because the letter format wants words not digits.
     Everything on this site has always run on her clock, not the viewer's. */
  function easternDate() {
    var now = new Date();
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "long", day: "numeric",
    }).formatToParts(now);
    var get = function (t) { var p = parts.find(function (x) { return x.type === t; }); return p ? p.value : ""; };
    var day = parseInt(get("day"), 10);
    return get("weekday") + " · the " + (ORDINALS[day] || day);
  }

  var ARROW = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.6 7.4L7.4 2.6M7.4 2.6H3.9M7.4 2.6v3.5"/></svg>';

  var PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11.2 2.4l2.4 2.4-8 8H3.2v-2.4z"/></svg>';

  /* "Welcome, guest4!" -> Welcome, <em>guest4</em>!  Built from text nodes, so a
     guest name (or her own copy) can never inject markup. */
  function setGreeting(h1, text, name) {
    h1.replaceChildren();
    var at = name ? text.indexOf(name) : -1;
    if (at < 0) { h1.textContent = text; return; }
    var em = document.createElement("em");
    em.textContent = name;
    h1.append(document.createTextNode(text.slice(0, at)), em,
      document.createTextNode(text.slice(at + name.length)));
  }

  function editor(which, raw, onSaved) {
    var adminKey = which === "welcome" ? "welcomeAdmin" : "messageAdmin";
    var userKey = which === "welcome" ? "welcomeUser" : "messageUser";

    var box = document.createElement("div");
    box.className = "editor";

    var mkField = function (labelText, value) {
      var l = document.createElement("label");
      l.textContent = labelText;
      var i = document.createElement("input");
      i.type = "text"; i.maxLength = 200; i.value = value;
      box.append(l, i);
      return i;
    };
    var mine = mkField("What you see", raw[adminKey]);
    var theirs = mkField("What everyone else sees", raw[userKey]);

    var hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "{name} becomes the guest's name.";

    var warn = document.createElement("div");
    warn.className = "warn";

    var row = document.createElement("div");
    row.className = "actions";
    var save = document.createElement("button");
    save.type = "button"; save.className = "go"; save.textContent = "Save";
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "go ghost"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", function () { box.remove(); });
    save.addEventListener("click", function () {
      save.disabled = true;
      warn.textContent = "";
      var body = {};
      body[adminKey] = mine.value;
      body[userKey] = theirs.value;
      fetch("/api/site", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (out) {
        if (!out.ok) { warn.textContent = out.d.error || "That didn't save."; save.disabled = false; return; }
        onSaved();
      }).catch(function () {
        warn.textContent = "That didn't save."; save.disabled = false;
      });
    });
    row.append(save, cancel);
    box.append(hint, warn, row);
    return box;
  }

  window.Shell.register("home", {
    label: "home",
    mount: function (host, ctx) {
      var site = ctx.site || {};
      var isHers = Boolean(ctx.me && ctx.me.isAdmin);
      var raw = site.raw || null;

      var eyebrow = document.createElement("div");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = easternDate();

      var h1 = document.createElement("h1");
      setGreeting(h1, site.welcome || "Welcome.", ctx.me && ctx.me.username);

      var lede = document.createElement("p");
      lede.className = "lede";
      lede.textContent = site.message || "";

      host.append(eyebrow, h1, lede);

      // Her copy is editable in place. The pencil sits on the line it edits.
      if (isHers && raw) {
        [["welcome", h1], ["message", lede]].forEach(function (pair) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "pencil"; b.title = "Edit this text";
          b.setAttribute("aria-label", "Edit this text");
          b.innerHTML = PENCIL;
          b.addEventListener("click", function () {
            var open = host.querySelector(".editor");
            if (open) open.remove();
            host.insertBefore(editor(pair[0], raw, function () { window.Shell.reloadSite(); }),
              pair[1].nextSibling);
          });
          pair[1].append(b);
        });
      }

      var rule = document.createElement("div");
      rule.className = "rule";
      host.append(rule);

      var grid = document.createElement("div");
      grid.className = "grid";
      GAMES.forEach(function (g) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        var b = document.createElement("b");
        b.textContent = g.n;
        cell.append(b);
        if (window.Shell.has(g.id)) {
          cell.addEventListener("click", function () { window.Shell.open(g.id); });
        } else {
          var away = document.createElement("span");
          away.className = "away";
          away.innerHTML = ARROW;
          cell.append(away);
          cell.addEventListener("click", function () { window.location.href = g.href; });
        }
        grid.append(cell);
      });
      host.append(grid);

      var wall = document.createElement("p");
      wall.className = "small";
      wall.style.marginTop = "1.6rem";
      var a = document.createElement("a");
      a.href = "/games";
      a.textContent = "the wall";
      a.style.color = "var(--ink)";
      a.style.textDecoration = "underline";
      a.style.textUnderlineOffset = "3px";
      wall.append(document.createTextNode("Or see them as cards on "), a,
        document.createTextNode("."));
      host.append(wall);
    },
  });
})();
