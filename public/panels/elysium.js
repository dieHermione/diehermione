/* ============================================================================
   elysium — the tending console.

   The game at /elysium is a whole environment: a full-bleed scene with weather,
   music and a journal. That does not fit a 36rem centred note, and squeezing it
   in would cost the thing that makes it work. So this panel is the part that
   DOES fit — read the tree, tend it — and the scene stays one click away.

   Every number comes from GET /api/elysium, which simulates forward to now
   before answering, so the readout is never stale. The engine owns the clock.
   ========================================================================== */
(function () {
  "use strict";

  var ACTIONS = [
    { a: "water", label: "water" },
    { a: "mist", label: "mist" },
    { a: "trim", label: "trim" },
    { a: "fertilize", label: "fertilize" },
    { a: "inspect", label: "inspect" },
  ];

  var host = null, dead = false;

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

  /* the engine's zone keys are camelCase; "leftBranch" is not a thing to read */
  function zoneName(zone) {
    return String(zone).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }

  function age(tree) {
    if (tree.ageDays > 0) return tree.ageDays + (tree.ageDays === 1 ? " day" : " days");
    return tree.ageHours + (tree.ageHours === 1 ? " hour" : " hours");
  }

  function draw(tree, ctx, say) {
    if (dead) return;
    host.replaceChildren();

    host.append(el("div", "eyebrow", "Season of " + tree.season));
    host.append(el("h1", null, "Elysium"));

    // A guest's tree lives exactly as long as the guest name does, which the
    // server drops after three quiet hours. Say so rather than imply a record.
    host.append(el("p", "lede", ctx.me && ctx.me.isAdmin
      ? "Yours, and it keeps growing whether or not you watch it."
      : "It is yours while you are here. Leave it three hours and the name goes, and the tree goes with it."));

    host.append(el("div", "rule"));

    var rows = el("div", "rows");
    rows.append(row("Stage", tree.stage, (tree.stageIndex + 1) + " of " + (tree.stageMax + 1)));
    rows.append(row("Age", age(tree)));
    rows.append(row("Condition", tree.condition));
    rows.append(row("Health", tree.healthBand));
    rows.append(row("Soil", tree.soil));
    rows.append(row("Humidity", tree.humidityLabel));
    rows.append(row("Airflow", tree.airflowLabel));
    rows.append(row("Nutrients", tree.nutrientLabel));
    if (tree.concern) rows.append(row("Concern", tree.concern));
    if (tree.nextAttention) rows.append(row("Next", tree.nextAttention));
    host.append(rows);

    if (tree.diseases && tree.diseases.length) {
      var dl = el("div", "rows");
      dl.style.marginTop = "1.4rem";
      tree.diseases.forEach(function (d) {
        // Until it has been inspected the engine withholds the real name and
        // gives only the family, so say what is actually known rather than
        // printing a bare "root" next to a zone also called "roots".
        dl.append(row(zoneName(d.zone),
          d.identified && d.name ? d.name : "an unidentified " + d.family + " problem",
          d.stageName));
      });
      host.append(el("div", "flabel", "what you can see"), dl);
    }

    var field = el("div", "field");
    field.style.marginTop = "2rem";
    field.append(el("div", "flabel", "tend"));
    var chips = el("div", "chips");
    ACTIONS.forEach(function (spec) {
      var c = el("button", "chip", spec.label);
      c.type = "button";
      if (spec.a === "fertilize" && !tree.fertilizeReady) {
        c.disabled = true;
        c.title = "not for another " + tree.fertilizeIn + (tree.fertilizeIn === 1 ? " hour" : " hours");
      }
      c.addEventListener("click", function () { act(spec.a, chips, ctx); });
      chips.append(c);
    });
    field.append(chips);
    host.append(field);

    var note = el("div", "note", say || "");
    host.append(note);

    var actions = el("div", "actions");
    actions.style.marginTop = "1.2rem";
    var open = el("a", "go ghost", "Open the scene");
    open.href = "/elysium";
    open.style.textDecoration = "none";
    actions.append(open);
    host.append(actions);
  }

  function act(action, chips, ctx) {
    chips.querySelectorAll(".chip").forEach(function (c) { c.disabled = true; });
    fetch("/api/elysium/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (out) {
      if (dead) return;
      if (!out.ok || !out.d.tree) {
        chips.querySelectorAll(".chip").forEach(function (c) { c.disabled = false; });
        return;
      }
      draw(out.d.tree, ctx, out.d.result && out.d.result.say);
    }).catch(function () {
      if (!dead) chips.querySelectorAll(".chip").forEach(function (c) { c.disabled = false; });
    });
  }

  window.Shell.register("elysium", {
    label: "elysium",
    mount: function (h, ctx) {
      host = h;
      dead = false;
      host.append(el("div", "loading", "reading the tree"));
      fetch("/api/elysium").then(function (r) {
        return r.ok ? r.json() : Promise.reject(new Error("no tree"));
      }).then(function (d) { draw(d.tree, ctx, ""); })
        .catch(function () {
          if (dead) return;
          host.replaceChildren();
          host.append(el("div", "eyebrow", "Elysium"), el("h1", null, "Not now."),
            el("p", "lede", "The tree could not be read. Try again in a moment."));
        });
    },
    unmount: function () { dead = true; host = null; },
  });
})();
