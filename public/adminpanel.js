/* The admin controls, extracted from the dashboard onto their own /admin page.
 *
 * Everything Hermione administers lives here: approvals, accounts + points,
 * finished writing series, the editable line/message pools, and the effect
 * test triggers. The module is self-contained — it injects its own CSS and the
 * session-result modal — so a host page only has to define the terminal palette
 * variables (--c, --dim, --dim2, --bright, --accent, --bg, --glow, --err) and
 * load the effect scripts it drives: dashglitch.js
 * (DashGlitch) and boot.js (Boot, the decrypt-line preview).
 *
 *   AdminPanel.build(container)   // render the whole panel into an element
 *
 * Extracted verbatim from public/dashboard.html; the only behavioural change is
 * that section folds no longer call the dashboard's scale-to-fit (fitDash) —
 * this page scrolls instead. */
window.AdminPanel = (function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // A pending disciple's onboarding answers, folded under their approval row.
  const ONB_KINKS = { feet: "Feet", tasks: "Tasks / Chores", degradation: "Degradation",
    humiliation: "Humiliation", masochism: "Masochism", exhibitionism: "Exhibitionism",
    worship: "Worship", petplay: "Petplay" };
  const ONB_PUN = { lines_physical: "Lines (physical)", lines_typing: "Lines (typing)",
    voice_memos: "Voice memos", ignoring: "Ignoring", onsite_games_hard: "On-site games (hard)" };
  const ONB_PET = { dog: "Dog / Doggy / Puppy", good: "Good Boy / Girl", doll: "Doll",
    pet: "Pet", bitch: "Bitch", loser: "Loser", dummy: "Dummy" };

  function onboardingBlock(o) {
    const kinks = Object.keys(ONB_KINKS).map((k) => {
      const v = (o.kinks || {})[k];
      const warn = (k === "feet" || k === "tasks") && v < 4;
      return `<span class="qline">${esc(ONB_KINKS[k])} <b class="${warn ? "warn" : ""}">${v}/5</b></span>`;
    }).join(" &nbsp;·&nbsp; ");
    const pun = Object.keys(ONB_PUN).map((k) => {
      const v = (o.punishments || {})[k];
      return `<span class="qline">${esc(ONB_PUN[k])}: <span class="${v === "acceptable" ? "yes" : "no"}">${v === "acceptable" ? "acceptable" : "hard no"}</span></span>`;
    }).join(" &nbsp;·&nbsp; ");
    const pet = Object.keys(ONB_PET).map((k) => {
      const v = (o.petnames || {})[k];
      const cls = v === "love" || v === "like" ? "yes" : v === "hate" ? "no" : "";
      return `<span class="qline">${esc(ONB_PET[k])}: <span class="${cls}">${v}</span></span>`;
    }).join(" &nbsp;·&nbsp; ");
    const wrap = document.createElement("div");
    wrap.className = "qz";
    const toggle = document.createElement("button");
    toggle.className = "qtoggle";
    toggle.textContent = "▸ questionnaire";
    const bodyEl = document.createElement("div");
    bodyEl.className = "qbody"; bodyEl.hidden = true;
    bodyEl.innerHTML =
      `<div class="qgrp"><b>interests</b><div class="qline">${kinks}</div></div>` +
      `<div class="qgrp"><b>limits</b><div class="qline">${o.limits ? esc(o.limits) : "<span style='color:var(--dim2)'>none given</span>"}</div></div>` +
      `<div class="qgrp"><b>punishments</b><div>${pun}</div></div>` +
      `<div class="qgrp"><b>petnames</b><div>${pet}${o.petnamesOther ? ` &nbsp;·&nbsp; <span class="qline">Other: <b>${esc(o.petnamesOther)}</b></span>` : ""}</div></div>`;
    toggle.addEventListener("click", () => {
      bodyEl.hidden = !bodyEl.hidden;
      toggle.textContent = (bodyEl.hidden ? "▸" : "▾") + " questionnaire";
    });
    wrap.append(toggle, bodyEl);
    return wrap;
  }

  /* --- the finished-series modal (pmodal), created on first use ------- */
  function ensurePmodal() {
    let modal = document.getElementById("pmodal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "pmodal";
    modal.innerHTML =
      '<div class="term">' +
      '<div class="pt-title" id="pt-title">:: session complete ::</div>' +
      '<hr />' +
      '<div class="prow"><span class="pk">servant</span><span id="pt-who"></span></div>' +
      '<div class="prow"><span class="pk">mode</span><span id="pt-mode"></span></div>' +
      '<div class="prow"><span class="pk">lines</span><span id="pt-lines"></span></div>' +
      '<div class="prow"><span class="pk">errors</span><span id="pt-err"></span></div>' +
      '<div class="prow"><span class="pk">time</span><span id="pt-time"></span></div>' +
      '<div class="prow"><span class="pk">when</span><span class="pdim" id="pt-when"></span></div>' +
      '<button class="pclose" id="pt-close">close</button>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector("#pt-close").addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (ev) => { if (ev.target.id === "pmodal") modal.classList.remove("open"); });
    return modal;
  }

  // Penance-style modal showing a finished series
  function showResult(name, e, fmt) {
    const modal = ensurePmodal();
    const mode = (e.category || "penance");
    modal.querySelector("#pt-title").textContent = ":: " + mode + " complete ::";
    modal.querySelector("#pt-who").textContent = name;
    modal.querySelector("#pt-mode").textContent = mode;
    modal.querySelector("#pt-lines").textContent = e.passages + " / " + e.passages;
    modal.querySelector("#pt-err").textContent = e.mistakes;
    modal.querySelector("#pt-time").textContent = fmt(e.elapsedMs);
    modal.querySelector("#pt-when").textContent = e.at ? new Date(e.at).toLocaleString() : "";
    modal.classList.add("open");
  }

  /* --- injected styles ------------------------------------------------ */
  function injectStyle() {
    if (document.getElementById("adminpanel-style")) return;
    const css = [
      /* admin sub-sections fold upwards, independently */
      ".adm-sec h3 { cursor: pointer; user-select: none; }",
      ".adm-sec h3 .sc { display: inline-block; margin-right: 0.35rem; color: var(--dim2); transition: transform 0.15s; }",
      ".adm-sec.shut h3 .sc { transform: rotate(-90deg); }",
      ".adm-sec.shut > *:not(h3) { display: none; }",
      ".adm h3 { color: var(--dim); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 400; margin: 0.4rem 0 0.6rem; }",
      ".adm-sec { margin-bottom: 1.1rem; }",
      ".adm-empty { color: var(--dim2); font-size: 0.85rem; }",
      ".adm-lbl { display: block; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin: 0.55rem 0 0.2rem; }",
      ".adm-area { width: 100%; background: rgba(120,190,255,0.05); border: 1px solid var(--dim2); color: var(--bright); font-family: inherit; font-size: 0.8rem; line-height: 1.5; padding: 0.45rem 0.55rem; resize: vertical; }",
      ".adm-area:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 12px var(--glow); }",
      ".adm-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; border: 1px solid var(--dim2); margin-bottom: 0.45rem; }",
      ".adm-row.pending { border-color: var(--accent); flex-wrap: wrap; background: rgba(120,190,255,0.05); }",
      /* a disciple who rated Feet or Tasks/Chores below 4 is flagged red for review */
      ".adm-row.pending.flagged { border-color: var(--err); background: rgba(255,122,109,0.09); }",
      ".adm-row.pending.flagged .nm::after { content: ' ⚑'; color: var(--err); }",
      ".adm-row .nm { color: var(--bright); white-space: nowrap; } .adm-row .grow { flex: 1; min-width: 0; }",
      ".adm-row .pts { color: var(--accent); font-size: 0.85rem; }",
      ".adm-row .intro { flex-basis: 100%; color: var(--dim); font-size: 0.8rem; }",
      /* the onboarding questionnaire answers, folded under a pending disciple */
      ".adm-row .qz { flex-basis: 100%; margin-top: 0.4rem; border-top: 1px solid var(--dim2); padding-top: 0.45rem; font-size: 0.76rem; color: var(--dim); }",
      ".adm-row .qz .qtoggle { background: none; border: none; color: var(--accent); font-family: inherit; font-size: 0.74rem; cursor: pointer; padding: 0; letter-spacing: 0.06em; }",
      ".adm-row .qz .qbody { margin-top: 0.5rem; display: grid; gap: 0.5rem; }",
      ".adm-row .qz .qgrp > b { display: block; color: var(--dim); font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.68rem; margin-bottom: 0.15rem; }",
      ".adm-row .qz .qline b { color: var(--bright); font-weight: 400; }",
      ".adm-row .qz .qline { color: var(--c); }",
      ".adm-row .qz .qline .warn { color: var(--err); }",
      ".adm-row .qz .qline .no { color: var(--err); } .adm-row .qz .qline .yes { color: #7dffb0; }",
      ".adm-chip { border: 1px solid var(--c); background: transparent; color: var(--c); font-family: inherit; font-size: 0.76rem; padding: 0.24rem 0.7rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; }",
      ".adm-chip:hover { background: var(--c); color: var(--bg); }",
      ".adm-chip.ghost { border-color: var(--dim2); color: var(--dim); }",
      ".adm-mini { border: 1px solid var(--dim2); background: transparent; color: var(--c); font-family: inherit; width: 1.5rem; height: 1.5rem; cursor: pointer; }",
      ".adm-mini:hover { border-color: var(--accent); color: var(--bright); }",
      ".adm-toggle { border: 1px solid var(--dim2); background: transparent; color: var(--dim); font-family: inherit; font-size: 0.74rem; padding: 0.2rem 0.6rem; cursor: pointer; text-transform: uppercase; }",
      ".adm-toggle.on { border-color: var(--accent); color: var(--bright); }",
      ".adm-doc { display: block; color: var(--accent); padding: 0.2rem 0; }",
      ".adm-doc:hover { text-decoration: underline; }",
      ".adm-log { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 0.5rem; border: 1px solid var(--dim2); margin-bottom: 0.4rem; }",
      ".adm-log:hover { border-color: var(--accent); }",
      ".adm-log .who2 { color: var(--bright); cursor: pointer; } .adm-log .meta2 { color: var(--dim); font-size: 0.8rem; text-align: right; flex: 1; cursor: pointer; }",
      ".adm-log-x { background: transparent; border: none; color: var(--dim); font-size: 1rem; line-height: 1; cursor: pointer; padding: 0 0.15rem; }",
      ".adm-log-x:hover { color: var(--err); }",
      ".adm-preset { border: 1px solid var(--dim2); padding: 0.6rem; margin-bottom: 0.6rem; }",
      ".adm-preset-head { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }",
      ".adm-preset input, .adm-preset textarea { width: 100%; background: rgba(120,190,255,0.06); border: 1px solid var(--dim2); color: var(--bright); font-family: inherit; font-size: 0.85rem; padding: 0.4rem 0.5rem; }",
      ".adm-preset input { flex: 1; } .adm-preset textarea { resize: vertical; line-height: 1.55; }",
      ".adm-preset-bar { display: flex; gap: 0.5rem; margin-top: 0.6rem; }",
      ".adm-select { background: rgba(120,190,255,0.06); border: 1px solid var(--dim2); color: var(--c); font-family: inherit; font-size: 0.76rem; padding: 0.24rem 0.4rem; }",
      ".adm-select option { background: #0a1420; }",
      /* finished-series modal (pmodal) */
      "#pmodal { position: fixed; inset: 0; z-index: 200; background: rgba(2,4,8,0.8); display: none; align-items: center; justify-content: center; }",
      "#pmodal.open { display: flex; }",
      "#pmodal .term { width: min(460px, 92vw); background: #06101a; border: 1px solid var(--accent); box-shadow: 0 0 40px var(--glow); padding: 1.6rem 1.8rem; font-family: 'IBM Plex Mono', monospace; color: var(--c); }",
      "#pmodal .pt-title { color: var(--bright); letter-spacing: 0.1em; margin-bottom: 0.6rem; }",
      "#pmodal hr { border: none; border-top: 1px solid var(--dim2); margin: 0.7rem 0; }",
      "#pmodal .prow { display: flex; justify-content: space-between; padding: 0.15rem 0; }",
      "#pmodal .pk { color: var(--dim); } #pmodal .pdim { color: var(--dim2); }",
      "#pmodal .pclose { margin-top: 1.2rem; border: 1px solid var(--c); background: transparent; color: var(--c); font-family: inherit; padding: 0.3rem 1.2rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.1em; }",
      "#pmodal .pclose:hover { background: var(--c); color: var(--bg); }",
    ].join("\n");
    const s = document.createElement("style"); s.id = "adminpanel-style"; s.textContent = css;
    document.head.appendChild(s);
  }

  /* --- the panel ------------------------------------------------------ */
  async function build(container) {
    injectStyle();
    const body = container;
    body.replaceChildren();
    const res = await fetch("/api/users");
    if (!res.ok) { body.innerHTML = '<p class="adm-empty">Could not load accounts.</p>'; return; }
    const { users } = await res.json();
    const wrap = document.createElement("div");
    wrap.className = "adm";

    const pending = users.filter((u) => u.pending);
    const approved = users.filter((u) => !u.pending && u.username.toLowerCase() !== "hermione");

    const mkChip = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = "adm-chip" + (cls ? " " + cls : "");
      b.textContent = label; b.addEventListener("click", fn); return b;
    };
    const mkMini = (label, fn) => {
      const b = document.createElement("button");
      b.className = "adm-mini"; b.textContent = label; b.addEventListener("click", fn); return b;
    };
    const mk = (tag, text) => {
      const el = document.createElement(tag); if (text != null) el.textContent = text; return el;
    };
    // Give every admin sub-heading its own upward fold, so the panel can be
    // reduced to just the section you are actually using.
    const foldable = (sec) => {
      const h = sec.querySelector("h3");
      if (!h || h.dataset.fold) return sec;
      h.dataset.fold = "1";
      const chev = document.createElement("span");
      chev.className = "sc"; chev.textContent = "▾";
      h.prepend(chev);
      h.addEventListener("click", () => { sec.classList.toggle("shut"); });
      return sec;
    };

    // approvals
    const appSec = document.createElement("div");
    appSec.className = "adm-sec";
    const appH = document.createElement("h3");
    appH.textContent = "Approvals" + (pending.length ? " · " + pending.length : "");
    appSec.append(appH);
    if (!pending.length) {
      const e = document.createElement("p"); e.className = "adm-empty"; e.textContent = "No one waiting.";
      appSec.append(e);
    } else {
      for (const u of pending) {
        const row = document.createElement("div");
        row.className = "adm-row pending" + (u.onboardingFlag ? " flagged" : "");
        const nm = document.createElement("span"); nm.className = "nm grow"; nm.textContent = u.username;
        row.append(nm);
        row.append(mkChip("Approve", "", async () => {
          const r = await fetch("/api/users/" + encodeURIComponent(u.username) + "/approve", { method: "POST" });
          if (r.ok) build(container);
        }));
        row.append(mkChip("Refuse", "ghost", async () => {
          if (!confirm("Refuse and delete " + u.username + "?")) return;
          const r = await fetch("/api/users/" + encodeURIComponent(u.username), { method: "DELETE" });
          if (r.ok) build(container);
        }));
        if (u.intro) { const i = document.createElement("div"); i.className = "intro"; i.textContent = u.intro; row.append(i); }
        if (u.onboarding) row.append(onboardingBlock(u.onboarding));
        appSec.append(row);
      }
    }
    wrap.append(foldable(appSec));

    // applications: the account-less questionnaire submissions, each with the
    // code the applicant DMs Hermione so she can match a message to the answers.
    let apps = { applications: [] };
    try { const r = await fetch("/api/admin/applications"); if (r.ok) apps = await r.json(); } catch (e) {}
    const appsSec = document.createElement("div"); appsSec.className = "adm-sec";
    const appsH = document.createElement("h3");
    appsH.textContent = "Applications" + (apps.applications && apps.applications.length ? " · " + apps.applications.length : "");
    appsSec.append(appsH);
    if (!apps.applications || !apps.applications.length) {
      const e = document.createElement("p"); e.className = "adm-empty"; e.textContent = "No applications yet.";
      appsSec.append(e);
    } else {
      for (const a of apps.applications) {
        const row = document.createElement("div");
        row.className = "adm-row pending" + (a.flag ? " flagged" : "");
        const nm = document.createElement("span"); nm.className = "nm grow";
        nm.innerHTML = 'code <b style="color:var(--bright)">' + esc(a.authCode || "—") + "</b>";
        row.append(nm);
        const when = document.createElement("span"); when.style.color = "var(--dim)"; when.style.fontSize = ".72rem";
        when.textContent = a.at ? new Date(a.at).toLocaleString() : "";
        row.append(when);
        row.append(mkChip("Dismiss", "ghost", async () => {
          if (!confirm("Dismiss application " + (a.authCode || a.id) + "?")) return;
          const r = await fetch("/api/admin/applications/" + encodeURIComponent(a.id), { method: "DELETE" });
          if (r.ok) build(container);
        }));
        row.append(onboardingBlock(a));   // reads a.kinks/limits/punishments/petnames
        appsSec.append(row);
      }
    }
    wrap.append(foldable(appsSec));

    // onboarding intro slides (About me / Site Purpose), editable copy that a
    // disciple reads at the top of the questionnaire
    const onbSec = document.createElement("div"); onbSec.className = "adm-sec";
    onbSec.append(mk("h3", "Onboarding intro"));
    const onbHint = mk("p", "The two slides a disciple reads before the questionnaire.");
    onbHint.className = "adm-empty"; onbSec.append(onbHint);
    const mkArea = (labelText) => {
      const lab = mk("label", labelText); lab.className = "adm-lbl";
      const ta = document.createElement("textarea"); ta.className = "adm-area"; ta.rows = 4;
      onbSec.append(lab, ta); return ta;
    };
    const aboutTa = mkArea("About me");
    const purposeTa = mkArea("Site Purpose");
    const onbSave = mkChip("Save intro", "", async () => {
      const r = await fetch("/api/site", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingAbout: aboutTa.value, onboardingPurpose: purposeTa.value }),
      });
      onbSave.textContent = r.ok ? "Saved" : "Error";
      setTimeout(() => { onbSave.textContent = "Save intro"; }, 1400);
    });
    const onbRow = document.createElement("div"); onbRow.style.marginTop = ".5rem"; onbRow.append(onbSave);
    onbSec.append(onbRow);
    fetch("/api/site").then((r) => r.json()).then((d) => {
      if (d && d.raw) { aboutTa.value = d.raw.onboardingAbout || ""; purposeTa.value = d.raw.onboardingPurpose || ""; }
    }).catch(() => {});
    wrap.append(foldable(onbSec));

    // accounts: points + leaderboard listing
    const accSec = document.createElement("div");
    accSec.className = "adm-sec";
    const accH = document.createElement("h3"); accH.textContent = "Accounts · " + approved.length;
    accSec.append(accH);
    for (const u of approved) {
      const row = document.createElement("div");
      row.className = "adm-row";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = u.username;
      const grow = document.createElement("span"); grow.className = "grow";
      const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = (u.points || 0) + " pts";
      grow.append(pts);
      const adjust = async (amount) => {
        const r = await fetch("/api/users/" + encodeURIComponent(u.username) + "/points", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) { u.points = data.points; pts.textContent = data.points + " pts"; }
      };
      const listed = document.createElement("button");
      listed.className = "adm-toggle" + (u.flagged ? " on" : "");
      listed.textContent = u.flagged ? "Listed" : "Unlisted";
      listed.addEventListener("click", async () => {
        const r = await fetch("/api/users/" + encodeURIComponent(u.username) + "/flag", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flagged: !u.flagged }),
        });
        if (r.ok) { u.flagged = !u.flagged; listed.classList.toggle("on", u.flagged); listed.textContent = u.flagged ? "Listed" : "Unlisted"; }
      });
      row.append(nm, grow,
        mkMini("−", () => adjust(-1)),
        mkMini("+", () => adjust(1)),
        mkChip("±", "ghost", () => { const n = parseInt(prompt("Adjust " + u.username + "'s points by:", "10")); if (Number.isInteger(n)) adjust(n); }),
        listed);
      accSec.append(row);
    }
    wrap.append(foldable(accSec));

    // lines completed (Penance / Devotion series), clickable to view
    const logSec = document.createElement("div"); logSec.className = "adm-sec";
    logSec.append(mk("h3", "Lines completed"));
    const logList = document.createElement("div");
    const logEmpty = document.createElement("p"); logEmpty.className = "adm-empty"; logEmpty.textContent = "No series finished yet.";
    logSec.append(logList, logEmpty); wrap.append(foldable(logSec));

    // devotion presets editor (Hermione-editable line sets)
    /* Both writing games take preset line-sets, stored and validated the
       same way, so one editor is built twice rather than copied. */
    const presetEditor = async (label, api, fallbackName, hint) => {
      const preSec = document.createElement("div"); preSec.className = "adm-sec";
      preSec.append(mk("h3", label));
      const PRE_HINT = hint;
      const preHint = mk("p", PRE_HINT);
      preHint.className = "adm-empty"; preSec.append(preHint);
      const preList = document.createElement("div"); preSec.append(preList);
      // one collector, so Remove and Save always send the same shape
      const collectPresets = () => [...preList.querySelectorAll(".adm-preset")].map((box) => ({
        name: box.querySelector("input").value.trim(),
        lines: box.querySelector("textarea").value.split("\n").map((x) => x.trim()).filter(Boolean),
      })).filter((x) => x.lines.length);
      const putPresets = async () => {
        const r = await fetch(api, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presets: collectPresets() }),
        });
        return r.ok ? null : ((await r.json().catch(() => ({}))).error || "Error");
      };
      const addPreset = (pr) => {
        const box = document.createElement("div"); box.className = "adm-preset";
        const nm = document.createElement("input"); nm.value = pr.name || ""; nm.placeholder = "preset name";
        // Removing writes through immediately. Dropping the row and waiting
        // for a separate Save read as a bug: it came back on next login.
        const del = mkChip("Remove", "ghost", async () => {
          box.remove();
          const err = await putPresets();
          if (err) { preList.append(box); preHint.textContent = err; }
          else preHint.textContent = "Removed.";
          setTimeout(() => { preHint.textContent = PRE_HINT; }, 1800);
        });
        const head = document.createElement("div"); head.className = "adm-preset-head"; head.append(nm, del);
        const ta = document.createElement("textarea");
        ta.rows = Math.max(4, (pr.lines || []).length + 1);
        ta.value = (pr.lines || []).join("\n");
        box.append(head, ta); preList.append(box);
      };
      let loaded = [];
      try { const r = await fetch(api); loaded = (await r.json()).presets || []; } catch (e) {}
      (loaded.length ? loaded : [{ name: fallbackName, lines: [] }]).forEach(addPreset);
      const preBar = document.createElement("div"); preBar.className = "adm-preset-bar";
      preBar.append(mkChip("+ Add preset", "ghost", () => addPreset({ name: "", lines: [] })));
      const preSave = mkChip("Save presets", "", async () => {
        preSave.textContent = "Saving...";
        const err = await putPresets();
        preSave.textContent = err ? "Error" : "Saved";
        if (err) preHint.textContent = err;
        setTimeout(() => { preSave.textContent = "Save presets"; }, 1500);
      });
      preBar.append(preSave); preSec.append(preBar); wrap.append(foldable(preSec));
    };

    await presetEditor("Devotion presets", "/api/devotion/presets", "devotion",
      "The first line is always typed first; the rest are shuffled (no immediate repeat). One line per row. Removing saves straight away.");
    await presetEditor("Penance presets", "/api/penance/presets", "penance",
      "Offered on the Penance selection screen alongside the player's own lines. Same shuffle rule as Devotion. Removing saves straight away.");

    // (subliminals and snake taunts were removed from the site entirely)

    // decrypt lines: what the login animation resolves into, one per row
    const decSec = document.createElement("div"); decSec.className = "adm-sec";
    decSec.append(mk("h3", "Decrypt lines"));
    const decHint = mk("p", "One line per row. The login animation picks one at random and decrypts it out of scrambled glyphs.");
    decHint.className = "adm-empty"; decSec.append(decHint);
    const decTa = document.createElement("textarea"); decTa.rows = 5;
    decTa.value = "loading...";
    decTa.disabled = true;
    fetch("/api/decrypt").then((r) => (r.ok ? r.json() : null)).then((d) => {
      decTa.value = d && d.lines ? d.lines.join("\n") : "";
      decTa.disabled = false;
    }).catch(() => { decTa.value = ""; decTa.disabled = false; });
    const decBox = document.createElement("div"); decBox.className = "adm-preset";
    decBox.append(decTa); decSec.append(decBox);
    const decBar = document.createElement("div"); decBar.className = "adm-preset-bar";
    decBar.append(mkChip("Preview", "ghost", () => {
      const lines = decTa.value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (window.Boot) {
        window.Boot.setLines(lines);
        window.Boot.play({ duration: 5200 });
      }
    }));
    const decSave = mkChip("Save lines", "", async () => {
      const lines = decTa.value.split("\n").map((x) => x.trim()).filter(Boolean);
      decSave.textContent = "Saving...";
      const r = await fetch("/api/decrypt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      decSave.textContent = r.ok ? "Saved" : "Error";
      if (r.ok && window.Boot) window.Boot.setLines(lines);
      setTimeout(() => { decSave.textContent = "Save lines"; }, 1500);
    });
    decBar.append(decSave); decSec.append(decBar); wrap.append(foldable(decSec));

    // screen glitch: fires on its own every 40 to 180 seconds, testable here
    const glSec = document.createElement("div"); glSec.className = "adm-sec";
    glSec.append(mk("h3", "Screen glitch"));
    const glHint = mk("p", "One is picked at random every 40 to 180 seconds.");
    glHint.className = "adm-empty"; glSec.append(glHint);
    const glBar = document.createElement("div"); glBar.className = "adm-preset-bar";
    const glSel = document.createElement("select"); glSel.className = "adm-select";
    (window.DashGlitch ? window.DashGlitch.effects : []).forEach((name, i) => {
      const o = document.createElement("option"); o.value = i; o.textContent = (i + 1) + ". " + name; glSel.append(o);
    });
    glBar.append(glSel);
    glBar.append(mkChip("Play", "ghost", () => window.DashGlitch && window.DashGlitch.play(Number(glSel.value))));
    glBar.append(mkChip("Random", "ghost", () => window.DashGlitch && window.DashGlitch.glitch()));
    glSec.append(glBar); wrap.append(foldable(glSec));

    // documentation
    const docSec = document.createElement("div"); docSec.className = "adm-sec";
    docSec.append(mk("h3", "Documentation"));
    [["Guide", "/guide"], ["Technical notes", "/tech"], ["Commands", "/commands"]].forEach(([t, h]) => {
      const a = document.createElement("a"); a.className = "adm-doc"; a.href = h; a.textContent = t; docSec.append(a);
    });
    wrap.append(foldable(docSec));
    body.append(wrap);

    // gather every account's finished series
    const rows = [];
    for (const u of users) {
      const r = await fetch("/api/users/" + encodeURIComponent(u.username) + "/writing").catch(() => null);
      if (!r || !r.ok) continue;
      const data = await r.json();
      (data.log || []).forEach((e) => rows.push({ name: u.username, e }));
    }
    rows.sort((a, b) => String(b.e.at || "").localeCompare(String(a.e.at || "")));
    logEmpty.hidden = rows.length > 0;
    const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    rows.slice(0, 40).forEach(({ name, e }) => {
      const row = document.createElement("div"); row.className = "adm-log";
      const who = document.createElement("span"); who.className = "who2"; who.textContent = name;
      const meta = document.createElement("span"); meta.className = "meta2";
      meta.textContent = (e.category || "series") + " · " + e.passages + " lines · " + e.mistakes + " err";
      who.addEventListener("click", () => showResult(name, e, fmt));
      meta.addEventListener("click", () => showResult(name, e, fmt));
      const dismiss = document.createElement("button"); dismiss.className = "adm-log-x"; dismiss.textContent = "×"; dismiss.title = "Dismiss";
      dismiss.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const r = await fetch("/api/users/" + encodeURIComponent(name) + "/writing/" + encodeURIComponent(e.id), { method: "DELETE" });
        if (r.ok) row.remove();
      });
      row.append(who, meta, dismiss);
      logList.append(row);
    });
  }

  return { build: build, showResult: showResult };
})();
