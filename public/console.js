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

  // Each value is a function, so a code can do anything. The real secret codes
  // still need inventing; these are the placeholders.
  var CODES = {
    "her eyes": function () {
      if (window.Subliminal) window.Subliminal.flashRandom("SHE SEES ALL");
      return "she is looking.";
    },
    "static": function () { if (window.DashGlitch) window.DashGlitch.play(6); return "signal disturbed."; },
    "bleed": function () { if (window.DashGlitch) window.DashGlitch.play(1); return "it runs red."; },
    "collapse": function () { if (window.DashGlitch) window.DashGlitch.play(7); return "signal lost."; },
    "quiet": function () { if (window.Ambience) window.Ambience.setMuted(true); return "the room falls silent."; },
    "listen": function () { if (window.Ambience) window.Ambience.setMuted(false); return "the lights start humming."; },
  };

  function submit(raw) {
    var code = String(raw || "").trim().toLowerCase();
    if (!code) return;
    say("> " + code, "in");
    var fn = CODES[code];
    if (!fn) { say("rejected.", "no"); return; }
    var out;
    try { out = fn(); } catch (e) { out = "something broke."; }
    say(out || "accepted.", "ok");
  }

  function show() {
    open = true;
    box.classList.add("open");
    box.setAttribute("aria-hidden", "false");
    if (!log.childElementCount) say("angelOS // restricted input", "ok");
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
        if (e.key === "Enter") { e.preventDefault(); submit(input.value); input.value = ""; }
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
