/* ============================================================================
   settings — audio, and nothing else.

   What used to be here and is now gone, deliberately:
     * the accent swatches. The whole site's "blue" was one accent that theme.js
       re-tinted; this shell has a fixed palette, so a picker here would change
       nothing you can see. theme.js still applies whatever she last chose on the
       pages that are still terminal-styled, so no choice was thrown away.
     * the flashing-effects box. The effects are hidden site-wide behind one
       switch in dashglitch.js; a toggle for something already off is a lie.

   The sliders drive AudioBus, which every page on the site reads, so a level set
   here is the level in Elysium and in a game that opens as its own page.
   ========================================================================== */
(function () {
  "use strict";

  var unsubscribe = [];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  var LABELS = { master: "Master", music: "Music", ambience: "Ambience", typing: "Typing" };

  function audioRows(host) {
    var bus = window.AudioBus;
    if (!bus) {
      host.append(el("p", "small", "Audio is unavailable in this browser."));
      return;
    }
    var box = el("div", "rows");
    var painters = [];

    ["master"].concat(bus.channels).forEach(function (name) {
      var r = el("div", "slider-row");
      r.append(el("span", "k", LABELS[name] || name));

      var slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0"; slider.max = "100";
      slider.setAttribute("aria-label", (LABELS[name] || name) + " volume");

      var mute = el("button", "mute");
      mute.type = "button";

      var paint = function () {
        var s = bus.get(name);
        slider.value = String(Math.round(s.volume * 100));
        mute.textContent = s.muted ? "off" : "on";
        mute.classList.toggle("off", s.muted);
      };
      painters.push(paint);

      // Dragging a muted slider means "I want to hear this", so it unmutes.
      slider.addEventListener("input", function () {
        bus.set(name, { volume: Number(slider.value) / 100, muted: false });
      });
      mute.addEventListener("click", function () { bus.set(name, { muted: !bus.get(name).muted }); });

      r.append(slider, mute);
      box.append(r);
      paint();
    });

    // AudioBus has no off-switch for listeners, so the panel guards instead: a
    // painter whose markup has been replaced simply has nothing to paint.
    var alive = true;
    unsubscribe.push(function () { alive = false; });
    bus.onChange(function () { if (alive) painters.forEach(function (p) { p(); }); });

    host.append(box);
  }

  function passwordBlock(host, mustChange) {
    var field = el("div", "field");
    field.style.marginBottom = "2.4rem";
    field.append(el("div", "flabel", "your password"));

    var current = document.createElement("input");
    current.type = "password";
    current.placeholder = "current password";
    current.autocomplete = "current-password";
    current.style.marginBottom = ".5rem";
    // The server skips the current-password check while mustChangePassword is
    // set, which is the whole point: a temporary password nobody was told.
    if (mustChange) current.hidden = true;

    var next = document.createElement("input");
    next.type = "password";
    next.placeholder = "new password · at least 8";
    next.autocomplete = "new-password";

    var note = el("div", "note");
    var go = el("button", "go", "Change it");
    go.type = "button";
    go.style.marginTop = ".8rem";

    go.addEventListener("click", function () {
      note.textContent = "";
      note.style.color = "";
      if (next.value.length < 8) { note.textContent = "At least 8 characters."; note.style.color = "var(--err)"; return; }
      var wasForced = mustChange;
      go.disabled = true;
      fetch("/api/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: current.value, next: next.value }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (out) {
        go.disabled = false;
        if (!out.ok) { note.textContent = out.d.error || "That didn't work."; note.style.color = "var(--err)"; return; }
        current.value = ""; next.value = "";
        note.textContent = "Changed.";
        note.style.color = "var(--ok)";
        // the gate is cleared server-side; reload so /api/me says so too
        if (wasForced) setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function () {
        go.disabled = false;
        note.textContent = "That didn't work.";
        note.style.color = "var(--err)";
      });
    });

    field.append(current, next, go, note);
    host.append(field);
  }

  window.Shell.register("settings", {
    label: "settings",
    mount: function (host, ctx) {
      unsubscribe = [];
      var mustChange = Boolean(ctx.me && ctx.me.mustChangePassword);
      host.append(el("div", "eyebrow", mustChange ? "Before anything else" : "This browser only"));
      host.append(el("h1", null, "Settings"));
      host.append(el("p", "lede", mustChange
        ? "This account was made for you with a temporary password. Choose your own below."
        : "Levels are kept in this browser and shared by every page and tab."));
      host.append(el("div", "rule"));
      if (ctx.me && ctx.me.isAdmin) passwordBlock(host, mustChange);
      audioRows(host);
    },
    unmount: function () {
      unsubscribe.forEach(function (fn) { fn(); });
      unsubscribe = [];
    },
  });
})();
