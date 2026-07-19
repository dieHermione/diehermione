// Notification bell for the shared top nav. Injects its own markup and styles so
// each page only needs to include this file.
(function () {
  const STYLES = `
    .notif-wrap { position: relative; display: inline-flex; }
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
      background: #ffffff;
      display: none;
    }
    .notif-wrap.has-unread .notif-dot { display: block; }
    .notif-panel {
      position: absolute;
      top: calc(100% + 0.45rem);
      right: 0;
      z-index: 20;
      width: min(19rem, 78vw);
      padding: 0.5rem;
      background: var(--panel-bg);
      border-radius: 12px;
      box-shadow: 0 10px 30px var(--shadow);
      display: none;
      flex-direction: column;
      gap: 0.4rem;
      text-align: left;
    }
    .notif-wrap.open .notif-panel { display: flex; }
    .notif-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.55rem 0.65rem;
      border-radius: 8px;
      background: rgba(255, 144, 176, 0.1);
      color: var(--text-color);
      font-size: 0.85rem;
      font-weight: 500;
      line-height: 1.35;
    }
    .notif-item .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .notif-item .dismiss {
      flex-shrink: 0;
      padding: 0 !important;
      width: 1.15rem;
      height: 1.15rem;
      border-radius: 50% !important;
      background: transparent !important;
      color: var(--muted-color) !important;
      font-size: 0.95rem !important;
      line-height: 1;
      cursor: pointer;
      border: none;
    }
    .notif-item .dismiss:hover { background: var(--button-bg) !important; color: var(--button-text) !important; }
    .notif-empty {
      padding: 0.85rem 0.65rem;
      color: var(--muted-color);
      font-size: 0.85rem;
      font-style: italic;
      text-align: center;
    }
    .notif-clear {
      width: 100%;
      font-size: 0.8rem !important;
      padding: 0.4rem !important;
      border-radius: 8px !important;
    }
  `;

  const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>`;

  function build() {
    const links = document.querySelector(".top-nav .nav-links");
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

    for (const note of notifications) {
      const item = document.createElement("div");
      item.className = "notif-item";

      const text = document.createElement("span");
      text.className = "text";
      text.textContent = note.text || "";
      item.append(text);

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

  function init() {
    const ui = build();
    if (!ui) return;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => render(ui, d.notifications || []))
      .catch(() => ui.wrap.remove());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
