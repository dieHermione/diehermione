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
      background: var(--notif-item-bg, rgba(251, 195, 211, 0.1));
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
    .mail-panel {
      position: absolute;
      top: calc(100% + 0.45rem);
      right: 0;
      z-index: 20;
      width: min(23rem, 82vw);
      padding: 0.6rem;
      background: var(--panel-bg);
      border-radius: 12px;
      box-shadow: 0 10px 30px var(--shadow);
      display: none;
      flex-direction: column;
      gap: 0.5rem;
      text-align: left;
    }
    .notif-wrap.open .mail-panel { display: flex; }
    .mail-thread {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      max-height: 15rem;
      overflow-y: auto;
      padding-right: 0.15rem;
    }
    .mail-msg {
      max-width: 85%;
      padding: 0.45rem 0.65rem;
      border-radius: 10px;
      font-size: 0.82rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .mail-msg.mine { align-self: flex-end; background: var(--button-bg); color: var(--button-text); }
    .mail-msg.theirs { align-self: flex-start; background: var(--notif-item-bg, rgba(251, 195, 211, 0.12)); color: var(--text-color); }
    .mail-empty { color: var(--muted-color); font-size: 0.82rem; font-style: italic; text-align: center; padding: 0.75rem; }
    .mail-compose { display: flex; gap: 0.4rem; align-items: flex-end; }
    .mail-compose textarea {
      flex: 1;
      min-height: 2.3rem;
      max-height: 6rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--input-border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--input-text);
      font-family: inherit;
      font-size: 0.82rem;
      resize: vertical;
    }
    .mail-compose textarea:focus { outline: none; border-color: var(--button-hover-bg); }
    .mail-send { padding: 0.45rem 0.8rem !important; border-radius: 8px !important; font-size: 0.8rem !important; }
    .mail-picker {
      width: 100%;
      padding: 0.4rem 0.5rem;
      border: 1px solid var(--input-border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--input-text);
      font-family: inherit;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .notif-clear {
      width: 100%;
      font-size: 0.8rem !important;
      padding: 0.4rem !important;
      border-radius: 8px !important;
    }
  `;

  const ENVELOPE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>`;

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

    // --- mail, sitting right beside the bell and built the same way ---
    const mailWrap = document.createElement("div");
    mailWrap.className = "notif-wrap";
    const mailBtn = document.createElement("button");
    mailBtn.type = "button";
    mailBtn.className = "notif-btn";
    mailBtn.setAttribute("aria-label", "Messages");
    mailBtn.innerHTML = ENVELOPE + '<span class="notif-dot"></span>';
    const mailPanel = document.createElement("div");
    mailPanel.className = "mail-panel";
    mailWrap.append(mailBtn, mailPanel);
    wrap.after(mailWrap);

    mailBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = !mailWrap.classList.contains("open");
      mailWrap.classList.toggle("open");
      wrap.classList.remove("open");
      if (opening) loadMail();
    });
    document.addEventListener("click", (e) => {
      if (!mailWrap.contains(e.target)) mailWrap.classList.remove("open");
    });

    return { wrap, panel, mailWrap, mailPanel };
  }

  // --- mail ---
  let mailUi = null;
  let mailWith = null;      // hermione only: whose thread is open
  let mailIsAdmin = false;

  function renderMail(data) {
    const panel = mailUi.mailPanel;
    panel.replaceChildren();

    // hermione picks a correspondent first
    if (mailIsAdmin) {
      const picker = document.createElement("select");
      picker.className = "mail-picker";
      (mailThreads || []).forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.username;
        opt.textContent = t.username + (t.unread ? " (" + t.unread + " new)" : "");
        picker.append(opt);
      });
      if (mailWith) picker.value = mailWith;
      picker.addEventListener("click", (e) => e.stopPropagation());
      picker.addEventListener("change", (e) => { mailWith = e.target.value; loadMail(); });
      panel.append(picker);
    }

    const thread = document.createElement("div");
    thread.className = "mail-thread";
    const messages = (data && data.messages) || [];
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "mail-empty";
      empty.textContent = "No messages yet.";
      thread.append(empty);
    } else {
      messages.forEach((m) => {
        const bubble = document.createElement("div");
        const mine = mailIsAdmin ? m.from === "hermione" : m.from === "player";
        bubble.className = "mail-msg " + (mine ? "mine" : "theirs");
        bubble.textContent = m.text;
        thread.append(bubble);
      });
    }
    panel.append(thread);

    const compose = document.createElement("div");
    compose.className = "mail-compose";
    const box = document.createElement("textarea");
    box.placeholder = "Write a message…";
    box.addEventListener("click", (e) => e.stopPropagation());
    const send = document.createElement("button");
    send.type = "button";
    send.className = "mail-send";
    send.textContent = "Send";
    const submit = async (e) => {
      e.stopPropagation();
      const text = box.value.trim();
      if (!text) return;
      const body = { text };
      if (mailIsAdmin) body.with = mailWith;
      const res = await fetch("/api/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { box.value = ""; loadMail(); }
    };
    send.addEventListener("click", submit);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); }
    });
    compose.append(box, send);
    panel.append(compose);

    thread.scrollTop = thread.scrollHeight;
  }

  let mailThreads = null;

  async function loadMail() {
    if (!mailUi) return;
    const url = "/api/mail" + (mailIsAdmin && mailWith ? "?with=" + encodeURIComponent(mailWith) : "");
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data.threads) {
      mailThreads = data.threads;
      if (!mailWith && mailThreads.length) {
        mailWith = mailThreads[0].username;
        return loadMail();            // now that we have someone, fetch the thread
      }
    }
    renderMail(data);
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

  // A synthesised meow — a swept tone through a moving formant filter. No asset
  // to ship, and it fails quietly if the browser hasn't allowed audio yet.
  let audioCtx = null;
  function playMeow() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.13);
      osc.frequency.linearRampToValueAtTime(500, now + 0.42);

      // wobble, so it sounds animal rather than electronic
      const vib = audioCtx.createOscillator();
      const vibGain = audioCtx.createGain();
      vib.frequency.value = 15;
      vibGain.gain.value = 22;
      vib.connect(vibGain).connect(osc.frequency);

      // the vowel: "ee" opening to "ow"
      const formant = audioCtx.createBiquadFilter();
      formant.type = "bandpass";
      formant.Q.value = 5;
      formant.frequency.setValueAtTime(1100, now);
      formant.frequency.linearRampToValueAtTime(1750, now + 0.12);
      formant.frequency.linearRampToValueAtTime(750, now + 0.45);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
      gain.gain.setValueAtTime(0.16, now + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      osc.connect(formant).connect(gain).connect(audioCtx.destination);
      osc.start(now); vib.start(now);
      osc.stop(now + 0.52); vib.stop(now + 0.52);
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
        const sig = signature(list) + "|mail:" + (d.mailUnread || 0);
        const isNew = seen !== null && sig !== seen && (list.length > 0 || d.mailUnread > 0);
        seen = sig;
        render(ui, list);
        if (ui.mailWrap) ui.mailWrap.classList.toggle("has-unread", (d.mailUnread || 0) > 0);
        if (isNew && !silent) playMeow();
      })
      .catch(() => {});
  }

  function init() {
    const ui = build();
    if (!ui) return;
    mailUi = ui;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { mailIsAdmin = Boolean(d.isAdmin); })
      .catch(() => {});
    refresh(ui, { silent: true }).then(() => {
      setInterval(() => refresh(ui), 15000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
