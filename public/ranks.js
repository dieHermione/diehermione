// Rank legend. Clicking a rank badge opens the ladder in place; when hermione
// views someone else's badge, the ranks in the list become assignable.
(function () {
  const STYLES = `
    .rank-badge { cursor: pointer; }
    .rank-scrim {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(2px);
    }
    .rank-scrim.open { display: flex; }
    .rank-modal {
      width: min(24rem, 92vw);
      max-height: 88vh;
      overflow-y: auto;
      padding: 1.5rem 1.35rem 1.25rem;
      border-radius: 14px;
      background: var(--panel-bg);
      box-shadow: 0 16px 50px var(--shadow);
      color: var(--text-color);
      text-align: center;
    }
    .rank-modal h3 {
      font-family: "Cause", sans-serif;
      font-size: 1.15rem;
      color: var(--heading-color);
      margin-bottom: 1rem;
    }
    .rank-list { display: flex; flex-direction: column; gap: 0.4rem; text-align: left; }
    .rank-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--table-border);
      border-radius: 10px;
      font-size: 0.9rem;
    }
    .rank-row .pos {
      flex-shrink: 0;
      width: 1.4rem;
      color: var(--muted-color);
      font-size: 0.78rem;
      font-weight: 700;
      text-align: right;
    }
    .rank-row .name { flex: 1; font-weight: 700; }
    .rank-row .note { color: var(--muted-color); font-size: 0.76rem; font-weight: 500; }
    .rank-row.current { border-color: var(--button-bg); background: var(--notif-item-bg, rgba(251, 195, 211, 0.1)); }
    .rank-row.assignable { cursor: pointer; }
    .rank-row.assignable:hover { border-color: var(--button-bg); }
    /* the top rank, with a crown drawn rather than typed */
    .rank-row.princess { position: relative; }
    .rank-row.princess .name { color: #FBC3D3; }
    body[data-theme="dark"] .rank-row.princess .name { color: #e6e6e6; }
    .rank-crown {
      flex-shrink: 0;
      width: 1.15rem;
      height: 0.85rem;
      display: block;
    }
    .rank-divider {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0.75rem 0 0.5rem;
      color: var(--muted-color);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .rank-divider::before, .rank-divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--table-border);
    }
    .rank-hint { color: var(--muted-color); font-size: 0.76rem; margin-top: 0.9rem; }
    .rank-close {
      margin-top: 1rem;
      padding: 0.5rem 1.4rem;
      border: none;
      border-radius: 8px;
      background: var(--button-bg);
      color: var(--button-text);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
    }
    .rank-close:hover { background: var(--button-hover-bg); }
  `;

  const CROWN = `<svg class="rank-crown" viewBox="0 0 24 18" fill="currentColor" aria-hidden="true">
      <path d="M2 16h20l1.6-12-6.2 4.3L12 1 6.6 8.3.4 4z" />
    </svg>`;

  let scrim = null;
  let ranks = null;

  function ensureShell() {
    if (scrim) return scrim;
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.append(style);

    scrim = document.createElement("div");
    scrim.className = "rank-scrim";
    scrim.innerHTML = '<div class="rank-modal"></div>';
    document.body.append(scrim);
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    return scrim;
  }

  function close() {
    if (scrim) scrim.classList.remove("open");
  }

  async function loadRanks() {
    if (ranks) return ranks;
    const res = await fetch("/api/ranks");
    if (!res.ok) return null;
    ranks = await res.json();
    return ranks;
  }

  function rowFor(entry, { position, current, canAssign, onPick, princess }) {
    const row = document.createElement("div");
    row.className = "rank-row" +
      (princess ? " princess" : "") +
      (current ? " current" : "") +
      (canAssign ? " assignable" : "");

    const pos = document.createElement("span");
    pos.className = "pos";
    pos.textContent = position ? position + "." : "";
    row.append(pos);

    if (princess) {
      const crown = document.createElement("span");
      crown.innerHTML = CROWN;
      row.append(crown.firstElementChild);
    }

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.name;
    row.append(name);

    if (entry.note) {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = entry.note;
      row.append(note);
    }

    if (canAssign) row.addEventListener("click", () => onPick(entry.name));
    return row;
  }

  async function open({ rank, username, canEdit, onChange }) {
    const data = await loadRanks();
    if (!data) return;
    const shell = ensureShell();
    const modal = shell.querySelector(".rank-modal");
    modal.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = "Ranks";
    modal.append(title);

    const list = document.createElement("div");
    list.className = "rank-list";

    const pick = async (name) => {
      const res = await fetch("/api/profile/" + encodeURIComponent(username), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: name }),
      });
      if (res.ok) {
        close();
        if (onChange) onChange(name);
      }
    };

    data.ladder.forEach((entry) => {
      const canAssign = canEdit && data.assignable.includes(entry.name);
      list.append(rowFor(entry, {
        position: entry.position,
        current: entry.name === rank,
        canAssign,
        onPick: pick,
        princess: entry.name === "Princess",
      }));
    });
    modal.append(list);

    const divider = document.createElement("div");
    divider.className = "rank-divider";
    divider.textContent = "separately";
    modal.append(divider);

    const aside = document.createElement("div");
    aside.className = "rank-list";
    aside.append(rowFor(data.aside, {
      position: null,
      current: data.aside.name === rank,
      canAssign: canEdit && data.assignable.includes(data.aside.name),
      onPick: pick,
    }));
    modal.append(aside);

    if (canEdit) {
      const hint = document.createElement("p");
      hint.className = "rank-hint";
      hint.textContent = "Pick a rank to give it to " + username + ".";
      modal.append(hint);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "rank-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", close);
    modal.append(closeBtn);

    shell.classList.add("open");
  }

  // el: the badge. canEdit: hermione looking at someone who isn't her.
  window.RankLegend = {
    attach(el, opts) {
      if (!el) return;
      el.classList.add("rank-badge");
      el.setAttribute("title", "See the ranks");
      el.onclick = (e) => {
        e.stopPropagation();
        open(opts());
      };
    },
  };
})();
