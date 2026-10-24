/* ============================================================================
   shell.js — the single-page shell behind /dashboard.

   One panel, many sections: the nav swaps what is inside it and no page ever
   loads. A section is a panel module that registers itself:

     Shell.register("home", {
       label: "home",             // what the nav says
       admin: false,              // true = only hermione sees it
       mount(host, ctx) { ... },  // fill `host`; ctx.me and ctx.site are ready
       unmount() { ... },         // optional: tear down timers/listeners
     });

   Panels are plain scripts loaded with `defer`, so they are all registered
   before boot() runs. A panel owns its host element and may rewrite it freely
   between mounts (devotion swaps three screens inside one mount).

   Routing is the hash, so reload and the back button both work. An unknown or
   unpermitted hash falls back to home rather than erroring.
   ========================================================================== */
window.Shell = (function () {
  const panels = new Map();
  const order = [];
  let current = null;          // the id of the mounted panel
  let navEl = null, panelEl = null, hostEl = null;
  const ctx = { me: null, site: null };

  function register(id, def) {
    if (panels.has(id)) { order.splice(order.indexOf(id), 1); }
    panels.set(id, def);
    order.push(id);
  }

  function visible(id) {
    const def = panels.get(id);
    if (!def) return false;
    return !def.admin || Boolean(ctx.me && ctx.me.isAdmin);
  }

  /* Unmount the old panel before the new one draws, so a panel's timers never
     outlive the markup they were written against. */
  function open(id, opts) {
    if (!visible(id)) id = "home";
    if (current && panels.get(current) && panels.get(current).unmount) {
      try { panels.get(current).unmount(); } catch (e) { console.error(e); }
    }
    current = id;
    hostEl.replaceChildren();
    panelEl.scrollTop = 0;
    navEl.querySelectorAll("button[data-s]").forEach((b) => b.classList.toggle("on", b.dataset.s === id));
    try { panels.get(id).mount(hostEl, ctx); }
    catch (e) {
      console.error(e);
      hostEl.innerHTML = '<div class="eyebrow">Something went wrong</div>' +
        '<h1>Not this time.</h1><p class="lede">That section would not open. Try another.</p>';
    }
    const hash = "#" + id;
    if (location.hash !== hash) {
      if (opts && opts.replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
    document.title = titleFor(id);
  }

  function titleFor(id) {
    const def = panels.get(id);
    const label = def && def.label ? def.label : id;
    return (id === "home" ? "angeldomme" : label.charAt(0).toUpperCase() + label.slice(1) + " · angeldomme");
  }

  function buildNav() {
    navEl.replaceChildren();
    let sepPending = false;
    order.forEach((id) => {
      if (id === "settings") sepPending = true;      // settings/admin are housekeeping
      if (!visible(id)) return;
      if (sepPending && navEl.children.length) {
        const li = document.createElement("li");
        const sep = document.createElement("div");
        sep.className = "sep";
        li.append(sep);
        navEl.append(li);
        sepPending = false;
      }
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.s = id;
      b.textContent = panels.get(id).label || id;
      b.addEventListener("click", () => open(id));
      li.append(b);
      navEl.append(li);
    });
  }

  function fromHash() {
    const id = (location.hash || "").replace(/^#/, "");
    return panels.has(id) && visible(id) ? id : "home";
  }

  /* Re-read the editable copy after hermione saves it, then redraw whatever is
     on screen so the new words appear without a reload. */
  async function reloadSite() {
    const res = await fetch("/api/site").catch(() => null);
    if (res && res.ok) ctx.site = await res.json().catch(() => ctx.site);
    if (current) open(current, { replace: true });
  }

  async function boot() {
    navEl = document.getElementById("nav");
    panelEl = document.querySelector(".panel");
    hostEl = document.getElementById("panel");

    // Identity first: a guest gets a name claimed lazily by /api/me, and the
    // front door has already made them one. No session at all means start over.
    let me;
    try {
      me = await window.siteMe();
    } catch (e) {
      window.location.href = "/";
      return;
    }
    if (!me) { window.location.href = "/"; return; }
    ctx.me = me;

    // The flashing effects are hidden site-wide, but the front door still reads
    // this cache to decide whether to run its ambient glitch, and it runs BEFORE
    // anyone is identified. Keep writing it, so the flag still works the day the
    // effects come back.
    try { localStorage.setItem("photosensitive", me.photosensitive ? "1" : "0"); } catch (e) {}

    const siteRes = await fetch("/api/site").catch(() => null);
    ctx.site = siteRes && siteRes.ok ? await siteRes.json().catch(() => null) : null;

    document.getElementById("who").textContent = me.username || "";
    buildNav();
    // A hand-made account must set its own password before anything else. The
    // old dashboard blocked the page with a modal; here the section that can do
    // it simply opens instead, and says why.
    open(me.mustChangePassword ? "settings" : fromHash(), { replace: true });

    window.addEventListener("hashchange", () => {
      const id = fromHash();
      if (id !== current) { open(id, { replace: true }); return; }
      // The section did not change, but the hash may still be lying: asking for
      // #admin as a guest resolves to home, and the URL should say so rather
      // than name a section that is not on screen.
      if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);

  return { register, open, reloadSite, ctx, get current() { return current; } };
})();
