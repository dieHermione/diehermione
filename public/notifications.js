// Notification bell for the shared top nav. Injects its own markup and styles so
// each page only needs to include this file.
(function () {
  // Dark terminal skin (baby-blue on black) to match the new site theme.
  const STYLES = `
    .notif-wrap { position: relative; display: inline-flex; font-family: "IBM Plex Mono", ui-monospace, monospace; }
    .notif-btn {
      position: relative;
      padding: 0.45rem 0.7rem !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .notif-btn svg { width: 1.05rem; height: 1.05rem; display: block; }
    .notif-dot {
      position: absolute;
      top: 0.32rem;
      right: 0.42rem;
      width: 0.38rem;
      height: 0.38rem;
      border-radius: 50%;
      background: #eafaff;
      box-shadow: 0 0 8px rgba(0,172,219,0.7);
      display: none;
    }
    .notif-wrap.has-unread .notif-dot { display: block; }
    .notif-panel {
      position: absolute;
      top: calc(100% + 0.45rem);
      right: 0;
      z-index: 200;
      width: min(20rem, 80vw);
      padding: 0.5rem;
      background: #05080f;
      border: 1px solid rgba(0,172,219,0.3);
      box-shadow: 0 12px 34px rgba(0,0,0,0.7), 0 0 24px rgba(0,172,219,0.12);
      display: none;
      flex-direction: column;
      gap: 0.4rem;
      text-align: left;
      max-height: 70vh;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,172,219,0.45) transparent;
    }
    .notif-panel::-webkit-scrollbar { width: 7px; }
    .notif-panel::-webkit-scrollbar-track { background: transparent; }
    .notif-panel::-webkit-scrollbar-thumb { background: rgba(0,172,219,0.35); border-radius: 999px; }
    .notif-wrap.open .notif-panel { display: flex; }
    .notif-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid rgba(0,172,219,0.16);
      background: rgba(0,172,219,0.05);
      color: #aee3ff;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .notif-item .body { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0.4rem; }
    .notif-item .text { overflow-wrap: anywhere; }
    .notif-go {
      display: inline-block;
      padding: 0.2rem 0.7rem;
      border: 1px solid #8fd0ff;
      background: transparent;
      color: #aee3ff;
      font-family: inherit;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .notif-go:hover { background: #8fd0ff; color: #04070d; }
    .notif-item .dismiss {
      flex-shrink: 0;
      padding: 0 !important;
      width: 1.15rem;
      height: 1.15rem;
      background: transparent !important;
      color: #4f7ea0 !important;
      font-size: 0.95rem !important;
      line-height: 1;
      cursor: pointer;
      border: none;
    }
    .notif-item .dismiss:hover { color: #eafaff !important; }
    .notif-empty {
      padding: 0.85rem 0.65rem;
      color: #4f7ea0;
      font-size: 0.85rem;
      text-align: center;
    }
    .notif-clear {
      width: 100%;
      font-size: 0.72rem !important;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.45rem !important;
      background: transparent !important;
      color: #aee3ff !important;
      border: 1px solid rgba(0,172,219,0.3) !important;
    }
    .notif-clear:hover { background: rgba(0,172,219,0.1) !important; }
  `;

  // Wording per destination, so the button says where it goes rather than a
  // generic "Go". Anything not listed falls back to "Go there".
  const GO_LABELS = {
    "/admin": "Review",
    "/manage": "Review",
    "/deathroll": "Play",
    "/dashboard": "Open dailies",
    "/profile": "View profile",
    "/tasks": "Open tasks",
  };

  const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>`;

  function build() {
    // Normally the bell lives in the top nav; a page can also opt to host it
    // elsewhere by providing an element with id="notif-slot".
    const links = document.querySelector(".top-nav .nav-links") || document.getElementById("notif-slot");
    if (!links || document.querySelector(".notif-wrap")) return null;

    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.append(style);

    const wrap = document.createElement("div");
    wrap.className = "notif-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notif-btn";
    btn.setAttribute("aria-label", "Notifications");
    btn.innerHTML = BELL + '<span class="notif-dot"></span>';

    const panel = document.createElement("div");
    panel.className = "notif-panel";

    wrap.append(btn, panel);

    // sit just before the log out button when there is one
    const logout = links.querySelector("#nav-logout");
    if (logout) links.insertBefore(wrap, logout);
    else links.append(wrap);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) wrap.classList.remove("open");
    });

    return { wrap, panel };
  }

  function render(ui, notifications) {
    const { wrap, panel } = ui;
    wrap.classList.toggle("has-unread", notifications.length > 0);
    panel.replaceChildren();

    if (!notifications.length) {
      const empty = document.createElement("div");
      empty.className = "notif-empty";
      empty.textContent = "No notifications.";
      panel.append(empty);
      return;
    }

    const here = window.location.pathname.replace(/\/+$/, "") || "/";

    for (const note of notifications) {
      const item = document.createElement("div");
      item.className = "notif-item";

      const body = document.createElement("div");
      body.className = "body";

      const text = document.createElement("span");
      text.className = "text";
      text.textContent = note.text || "";
      body.append(text);

      // Notifications about something you can act on carry the page to act on
      // it. No point offering to send you where you already are.
      if (note.href && note.href !== here) {
        const go = document.createElement("a");
        go.className = "notif-go";
        go.href = note.href;
        go.textContent = GO_LABELS[note.href] || "Go there";
        body.append(go);
      }

      item.append(body);

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "dismiss";
      dismiss.textContent = "×";
      dismiss.setAttribute("aria-label", "Dismiss notification");
      dismiss.addEventListener("click", async (e) => {
        e.stopPropagation();
        const res = await fetch("/api/notifications/" + encodeURIComponent(note.id), {
          method: "DELETE",
        });
        if (res.ok) {
          const data = await res.json();
          render(ui, data.notifications || []);
        }
      });
      item.append(dismiss);
      panel.append(item);
    }

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "notif-clear";
    clear.textContent = "Clear all";
    clear.addEventListener("click", async (e) => {
      e.stopPropagation();
      const res = await fetch("/api/notifications/clear", { method: "POST" });
      if (res.ok) render(ui, []);
    });
    panel.append(clear);
  }

  // A synthesised low bell: a struck fundamental plus inharmonic partials, each
  // ringing out on its own decay. No asset to ship, and it fails quietly if the
  // browser hasn't allowed audio yet.
  let audioCtx = null;
  function playMeow() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;

      const out = audioCtx.createGain();
      out.gain.value = 0.5;
      out.connect(audioCtx.destination);

      // ratios are deliberately inharmonic; that is what reads as "bell"
      // rather than "organ". Higher partials fade faster, as on a real one.
      const FUND = 174;
      const PARTIALS = [
        { ratio: 1.00, gain: 0.20, decay: 2.6 },
        { ratio: 2.01, gain: 0.11, decay: 1.9 },
        { ratio: 2.97, gain: 0.07, decay: 1.3 },
        { ratio: 4.23, gain: 0.04, decay: 0.8 },
        { ratio: 5.43, gain: 0.02, decay: 0.5 },
      ];
      PARTIALS.forEach((p) => {
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = FUND * p.ratio;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(p.gain, now + 0.008);   // hard strike
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
        osc.connect(g).connect(out);
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch {}
  }

  // remembers what the bell has already shown, so only genuinely new lines meow
  let seen = null;

  function signature(notifications) {
    return notifications.map((n) => n.id + ":" + n.text).join("|");
  }

  function refresh(ui, { silent } = {}) {
    return fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        let list = d.notifications || [];
        // you're already watching the rolls land, so don't nag about them here
        if (window.location.pathname === "/deathroll") {
          const stale = list.filter((n) => String(n.id).startsWith("deathroll-"));
          if (stale.length) {
            list = list.filter((n) => !String(n.id).startsWith("deathroll-"));
            stale.forEach((n) =>
              fetch("/api/notifications/" + encodeURIComponent(n.id), { method: "DELETE" })
            );
          }
        }
        const sig = signature(list);
        const isNew = seen !== null && sig !== seen && list.length > 0;
        seen = sig;
        render(ui, list);
        if (isNew && !silent) playMeow();
      })
      .catch(() => {});
  }

  function init() {
    // Notifications are Hermione-only now, so the bell only appears for the admin.
    const start = () => {
      const ui = build();
      if (!ui) return;
      refresh(ui, { silent: true }).then(() => {
        setInterval(() => refresh(ui), 15000);
      });
    };
    if (window.siteMe) {
      window.siteMe().then((d) => { if (d && d.isAdmin) start(); }).catch(() => {});
    }
    // no siteMe (or non-admin) -> no bell
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
