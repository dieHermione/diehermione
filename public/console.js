/* The secret console, shared by every page except the login screen.
 *
 * ` or ~ slides a terminal panel down from the top; Esc or the same key closes
 * it. Codes are typed in and things happen. The code table maps a string to a
 * function, so a code can do anything; add entries to CODES as new ones are
 * invented.
 *
 * It themes itself from whatever page it lands on: every colour comes from the
 * page's own custom properties with a currentColor fallback, so it reads right
 * on the blue dashboard and on the red game pages without knowing which is
 * which.
 *
 * While it is open it swallows keystrokes in the capture phase, otherwise the
 * typing games underneath, which listen on document rather than on an input,
 * would receive everything typed into the console as well.
 *
 * Self-injecting: including the script is all that is needed.
 */
(function () {
  "use strict";

  var box, input, log, open = false;

  function css() {
    if (document.getElementById("console-style")) return;
    var s = document.createElement("style");
    s.id = "console-style";
    s.textContent =
      "#console{position:fixed;left:0;right:0;top:0;z-index:500;background:rgba(0,0,0,0.94);" +
      "border-bottom:1px solid var(--c,currentColor);box-shadow:0 0 40px var(--glow,rgba(255,255,255,0.15));" +
      "font-family:'IBM Plex Mono',ui-monospace,monospace;color:var(--c,currentColor);" +
      "transform:translateY(-100%);transition:transform .22s ease;padding:0.9rem 1.2rem 0.7rem;}" +
      "#console.open{transform:translateY(0);}" +
      "#console::after{content:'';position:absolute;inset:0;pointer-events:none;" +
      "background:repeating-linear-gradient(0deg,rgba(0,0,0,0.3) 0 1px,transparent 1px 3px);}" +
      "#console .con-log{max-height:30vh;overflow-y:auto;font-size:0.82rem;line-height:1.7;" +
      "scrollbar-width:thin;}" +
      "#console .con-log div{white-space:pre-wrap;}" +
      "#console .con-log .in{opacity:0.6;}" +
      "#console .con-log .ok{color:var(--bright,var(--br,currentColor));}" +
      "#console .con-log .no{color:var(--err,#ff5a4a);}" +
      "#console .con-line{display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;}" +
      "#console .con-line span{color:var(--accent,var(--br,currentColor));}" +
      "#console input{flex:1;background:transparent;border:none;outline:none;" +
      "color:var(--bright,var(--br,currentColor));font-family:inherit;font-size:0.92rem;letter-spacing:0.04em;}" +
      "#console .con-hint{opacity:0.4;font-size:0.64rem;letter-spacing:0.18em;text-transform:uppercase;margin-top:0.4rem;}";
    document.head.appendChild(s);
  }

  function build() {
    css();
    box = document.createElement("div");
    box.id = "console";
    box.setAttribute("aria-hidden", "true");
    log = document.createElement("div");
    log.className = "con-log";
    var line = document.createElement("div");
    line.className = "con-line";
    var caret = document.createElement("span");
    caret.textContent = ">";
    input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Console");
    line.append(caret, input);
    var hint = document.createElement("div");
    hint.className = "con-hint";
    hint.textContent = "~ to close";
    box.append(log, line, hint);
    document.body.appendChild(box);
  }

  function say(text, cls) {
    var row = document.createElement("div");
    if (cls) row.className = cls;
    row.textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  // Who is typing. Only fetched when a privileged command is actually used,
  // and cached, so the console costs nothing on pages that never run one.
  var me = null;
  function who() {
    if (me) return Promise.resolve(me);
    return fetch("/api/me")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { me = d; return d; })
      .catch(function () { return null; });
  }

  /* ---- pray commands: pray <command> [args] ----
     "pray" is the prefix for everything from here on; it replaced "wing".
     Bare `pray` with no command is itself a command: it flashes a subliminal. */
  var GAMES = {
    snake: "/snake", penance: "/writing", devotion: "/writing?mode=devotion",
    wheel: "/wheel", deathroll: "/deathroll", elysium: "/elysium",
    chess: "/chess", parse: "/dummyparse", dummyparse: "/dummyparse",
    skillcheck: "/skillcheck", summary: "/summary", lottery: "/lottery", slots: "/lottery",
    // not games, but the two places people most want to get back to
    dashboard: "/dashboard", profile: "/profile", games: "/games",
  };

  var PRAY = {
    points: {
      admin: true,
      usage: "pray points <username> <+n|-n>   e.g. pray points alice +5  /  pray points alice -1",
      run: function (args) {
        var user = args[0], n = parseInt(args[1], 10);
        if (!user || !Number.isInteger(n)) return Promise.resolve(PRAY.points.usage);
        return fetch("/api/users/" + encodeURIComponent(user) + "/points", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: n }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) return d.error || "That didn't work.";
            return (n >= 0 ? "gave " : "took ") + Math.abs(n) + " points " +
                   (n >= 0 ? "to " : "from ") + user + ". they now have " + d.points + ".";
          });
        });
      },
    },
    set_points: {
      admin: true,
      usage: "pray set_points <username> <value>",
      run: function (args) {
        var user = args[0], n = parseInt(args[1], 10);
        if (!user || !Number.isInteger(n)) return Promise.resolve(PRAY.set_points.usage);
        return fetch("/api/users/" + encodeURIComponent(user) + "/points", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: n }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) return d.error || "That didn't work.";
            return user + " now has " + d.points + " points.";
          });
        });
      },
    },
    launch: {
      usage: "pray launch <" + Object.keys(GAMES).join("|") + ">",
      run: function (args) {
        var name = String(args[0] || "").toLowerCase();
        var href = GAMES[name];
        if (!href) return Promise.resolve(PRAY.launch.usage);
        setTimeout(function () { window.location.href = href; }, 220);
        return Promise.resolve("opening " + name + ".");
      },
    },
    open: {
      usage: "pray open <username>",
      run: function (args) {
        var user = String(args[0] || "").trim();
        if (!user) return Promise.resolve(PRAY.open.usage);
        setTimeout(function () {
          window.location.href = "/profile?user=" + encodeURIComponent(user);
        }, 220);
        return Promise.resolve("opening " + user + "'s profile.");
      },
    },
    manage: {
      admin: true,
      usage: "pray manage",
      run: function () {
        setTimeout(function () { window.location.href = "/manage"; }, 220);
        return Promise.resolve("opening account management.");
      },
    },
    quit: {
      usage: "pray quit",
      run: function () {
        // only a tab this script opened can be closed outright; try anyway and
        // say so plainly when the browser refuses
        setTimeout(function () {
          window.close();
          setTimeout(function () { say("the browser would not close this tab.", "no"); }, 250);
        }, 200);
        return Promise.resolve("closing.");
      },
    },
    reload: {
      usage: "pray reload",
      run: function () {
        setTimeout(function () { window.location.reload(); }, 220);
        return Promise.resolve("reloading.");
      },
    },
  };

  function runPray(parts) {
    // bare "pray" is an invocation, not a mistake
    if (parts.length === 1) {
      if (window.Subliminal) window.Subliminal.flashRandom();
      say("she hears you.", "ok");
      return;
    }
    var name = (parts[1] || "").toLowerCase();
    var cmd = PRAY[name];
    if (!cmd) { say("Command not recognized.", "no"); return; }
    who().then(function (d) {
      // "Rejected." is reserved for a real command the caller may not run
      if (cmd.admin && !(d && d.isAdmin)) { say("Rejected.", "no"); return; }
      Promise.resolve(cmd.run(parts.slice(2))).then(function (msg) {
        say(msg || "done.", "ok");
      });
    });
  }

  // Each value is a function, so a code can do anything. The real secret codes
  // still need inventing; these are the placeholders.
  var CODES = {
    "her eyes": function () {
      if (window.Subliminal) window.Subliminal.flashRandom("SHE SEES ALL");
      return "she is looking.";
    },
    "static": function () { if (window.DashGlitch) window.DashGlitch.play(1); return "signal disturbed."; },
    "bleed": function () { if (window.DashGlitch) window.DashGlitch.play(5); return "it runs red."; },
    "collapse": function () { if (window.DashGlitch) window.DashGlitch.play(2); return "signal lost."; },
    "quiet": function () { if (window.AudioBus) window.AudioBus.set("ambience", { muted: true }); return "the room falls silent."; },
    "listen": function () { if (window.AudioBus) window.AudioBus.set("ambience", { muted: false }); return "the lights start humming."; },
  };

  var history = [];
  var histAt = -1;      // -1 means "at the live line, not browsing"

  function submit(raw) {
    var line = String(raw || "").trim();
    if (!line) return;
    if (history[0] !== line) history.unshift(line);
    history = history.slice(0, 50);
    histAt = -1;
    say("> " + line, "in");
    var parts = line.split(/\s+/);
    var head = parts[0].toLowerCase();
    if (head === "pray") { runPray(parts); return; }
    if (head === "wing") { say("wing is now pray.", "no"); return; }
    var fn = CODES[line.toLowerCase()];
    if (!fn) { say("Command not recognized.", "no"); return; }
    var out;
    try { out = fn(); } catch (e) { out = "something broke."; }
    say(out || "accepted.", "ok");
  }

  function show() {
    open = true;
    box.classList.add("open");
    box.setAttribute("aria-hidden", "false");
    if (!log.childElementCount) say("angelOS // console", "ok");
    setTimeout(function () { input.focus(); }, 60);
  }
  function hide() {
    open = false;
    box.classList.remove("open");
    box.setAttribute("aria-hidden", "true");
    input.blur();
  }
  function toggle() { open ? hide() : show(); }

  function init() {
    build();

    // Capture phase: while the console is open, the page underneath must not
    // also see what is being typed. The typing games listen on document.
    document.addEventListener("keydown", function (e) {
      if (e.key === "~" || e.key === "`") {
        var t = e.target;
        var tag = (t && t.tagName || "").toLowerCase();
        var typingElsewhere = (tag === "input" || tag === "textarea" || (t && t.isContentEditable)) && t !== input;
        if (typingElsewhere) return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); return; }
      if (e.target === input) {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); submit(input.value); input.value = ""; return; }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (histAt + 1 < history.length) { histAt++; input.value = history[histAt]; }
          setTimeout(function () { input.setSelectionRange(input.value.length, input.value.length); }, 0);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (histAt > 0) { histAt--; input.value = history[histAt]; }
          else { histAt = -1; input.value = ""; }
          return;
        }
      }
    }, true);

    // the games also listen for these; keep them off the page while open
    ["keypress", "keyup"].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (open && e.target === input) e.stopPropagation();
      }, true);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
