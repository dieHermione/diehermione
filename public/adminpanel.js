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
      '<div class="prow"><span class="pk">preset</span><span id="pt-preset"></span></div>' +
      '<div class="prow"><span class="pk">difficulty</span><span id="pt-diff"></span></div>' +
      '<div class="prow"><span class="pk">lines</span><span id="pt-lines"></span></div>' +
      '<div class="prow"><span class="pk">errors</span><span id="pt-err"></span></div>' +
      '<div class="prow"><span class="pk">skipped</span><span id="pt-skip"></span></div>' +
      '<div class="prow"><span class="pk">accuracy</span><span id="pt-acc"></span></div>' +
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
    modal.querySelector("#pt-preset").textContent = e.preset || "—";
    modal.querySelector("#pt-diff").textContent = e.difficulty || "—";
    modal.querySelector("#pt-lines").textContent = e.passages + " / " + e.passages;
    modal.querySelector("#pt-err").textContent = e.mistakes;
    modal.querySelector("#pt-skip").textContent = e.skipped != null ? e.skipped : "—";
    modal.querySelector("#pt-acc").textContent = (e.accuracy != null ? e.accuracy : "—") + "%";
    modal.querySelector("#pt-time").textContent = fmt(e.elapsedMs);
    modal.querySelector("#pt-when").textContent = e.at ? new Date(e.at).toLocaleString() : "";
    modal.classList.add("open");
  }

  /* --- the handed-in-summary modal, created on first use -------------- */
  function ensureSmodal() {
    let modal = document.getElementById("smodal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "smodal";
    modal.innerHTML =
      '<div class="term">' +
      '<div class="pt-title" id="sm-title">:: summary handed in ::</div>' +
      '<hr />' +
      '<div class="prow"><span class="pk">servant</span><span id="sm-who"></span></div>' +
      '<div class="prow"><span class="pk">topic</span><span id="sm-topic"></span></div>' +
      '<div class="prow"><span class="pk">words</span><span id="sm-words"></span></div>' +
      '<div class="prow"><span class="pk">when</span><span class="pdim" id="sm-when"></span></div>' +
      '<hr />' +
      '<div class="sm-text" id="sm-text"></div>' +
      '<button class="pclose" id="sm-close">close</button>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector("#sm-close").addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (ev) => { if (ev.target.id === "smodal") modal.classList.remove("open"); });
    return modal;
  }

  function showSummary(entry) {
    const modal = ensureSmodal();
    modal.querySelector("#sm-who").textContent = entry.player + (entry.guest ? " (guest)" : "");
    modal.querySelector("#sm-topic").textContent = (entry.topic || "—") + (entry.kind ? " · " + entry.kind : "");
    modal.querySelector("#sm-words").textContent = entry.words + (entry.limit ? " / " + entry.limit : "");
    modal.querySelector("#sm-when").textContent = entry.at ? new Date(entry.at).toLocaleString() : "";
    modal.querySelector("#sm-text").textContent = entry.text || "";
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
      /* full-width, categorised: sections flow into as many columns as fit */
      /* min(340px,100%) instead of a flat 340px so a phone narrower than the
         column does not get a horizontal scrollbar — it drops to one column. */
      ".adm { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 0.4rem 2.2rem; align-items: start; }",
      /* tabs across the top-left: only one panel is shown at a time */
      ".adm-tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0 0 1.6rem; border-bottom: 1px solid var(--dim2); }",
      ".adm-tab { border: 1px solid var(--dim2); border-bottom: none; background: transparent; color: var(--dim); font-family: inherit; font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.5rem 1.15rem; cursor: pointer; position: relative; top: 1px; }",
      ".adm-tab:hover { color: var(--c); }",
      ".adm-tab.active { color: var(--bright); border-color: var(--accent); background: rgba(0,172,219,0.09); }",
      ".adm-tab .badge { color: var(--err); margin-left: 0.4rem; }",
      ".adm-panel { display: none; }",
      ".adm-subpanel { display: none; }",
      ".adm-subpanel.active { display: grid; }",
      ".adm-subtabs { margin: 0 0 1.2rem; }",
      ".adm-panel.active { display: block; }",
      ".adm-panel.active.adm { display: grid; }",
      ".adm h3 { color: var(--dim); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 400; margin: 0.4rem 0 0.6rem; }",
      ".adm-sec { margin-bottom: 1.1rem; }",
      ".adm-empty { color: var(--dim2); font-size: 0.85rem; }",
      ".adm-lbl { display: block; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin: 0.55rem 0 0.2rem; }",
      ".adm-area { width: 100%; background: rgba(0,172,219,0.05); border: 1px solid var(--dim2); color: var(--bright); font-family: inherit; font-size: 0.8rem; line-height: 1.5; padding: 0.45rem 0.55rem; resize: vertical; }",
      ".adm-area:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 12px var(--glow); }",
      ".adm-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; border: 1px solid var(--dim2); margin-bottom: 0.45rem; }",
      ".adm-row.pending { border-color: var(--accent); flex-wrap: wrap; background: rgba(0,172,219,0.05); }",
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
      /* a selected chip is FILLED, not just a dimmer border — --dim/--dim2 equal
         --c site-wide now (dual-tone), so a border-colour-only toggle is invisible */
      ".adm-chip.sel { background: var(--c); color: var(--bg); }",
      /* OT12 photo tagger: spans the full row and runs larger than the rest of
         the panel — there is a photo plus twelve names to see at once */
      ".ot-wide { grid-column: 1 / -1; }",
      ".adm-chip.ot-big { font-size: 0.95rem; padding: 0.45rem 1.05rem; }",
      ".ot-stage { margin: 0.7rem 0; }",
      ".ot-preview { display: block; max-width: 100%; max-height: 46vh; border: 1px solid var(--c); background: #000; }",
      ".ot-who { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.6rem 0; }",
      ".ot-list { display: flex; flex-wrap: wrap; gap: 0.9rem; margin-top: 0.8rem; }",
      ".ot-thumb { position: relative; width: 128px; text-align: center; }",
      ".ot-thumb img { width: 128px; height: 128px; object-fit: contain; background: #000; border: 1px solid var(--dim2); display: block; cursor: pointer; }",
      ".ot-thumb.ot-current img { outline: 2px solid var(--accent); outline-offset: 2px; }",
      ".ot-thumb-nm { font-size: 0.68rem; color: var(--dim); margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".ot-thumb-x { position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.7); }",
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
      ".adm-preset input, .adm-preset textarea { width: 100%; background: rgba(0,172,219,0.06); border: 1px solid var(--dim2); color: var(--bright); font-family: inherit; font-size: 0.85rem; padding: 0.4rem 0.5rem; }",
      ".adm-preset input { flex: 1; } .adm-preset textarea { resize: vertical; line-height: 1.55; }",
      ".adm-preset-bar { display: flex; gap: 0.5rem; margin-top: 0.6rem; }",
      ".adm-select { background: rgba(0,172,219,0.06); border: 1px solid var(--dim2); color: var(--c); font-family: inherit; font-size: 0.76rem; padding: 0.24rem 0.4rem; }",
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
      /* handed-in-summary modal (smodal): same chrome as pmodal, plus a scrollable body */
      "#smodal { position: fixed; inset: 0; z-index: 200; background: rgba(2,4,8,0.8); display: none; align-items: center; justify-content: center; }",
      "#smodal.open { display: flex; }",
      "#smodal .term { width: min(620px, 92vw); background: #06101a; border: 1px solid var(--accent); box-shadow: 0 0 40px var(--glow); padding: 1.6rem 1.8rem; font-family: 'IBM Plex Mono', monospace; color: var(--c); }",
      "#smodal .pt-title { color: var(--bright); letter-spacing: 0.1em; margin-bottom: 0.6rem; }",
      "#smodal hr { border: none; border-top: 1px solid var(--dim2); margin: 0.7rem 0; }",
      "#smodal .prow { display: flex; justify-content: space-between; gap: 1rem; padding: 0.15rem 0; }",
      "#smodal .pk { color: var(--dim); } #smodal .pdim { color: var(--dim2); }",
      "#smodal .sm-text { max-height: 48vh; overflow-y: auto; white-space: pre-wrap; line-height: 1.6; color: var(--bright); font-size: 0.9rem; }",
      "#smodal .pclose { margin-top: 1.2rem; border: 1px solid var(--c); background: transparent; color: var(--c); font-family: inherit; padding: 0.3rem 1.2rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.1em; }",
      "#smodal .pclose:hover { background: var(--c); color: var(--bg); }",
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
    wrap.className = "adm-wrap";

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

    // Approvals and Applications were removed from here: accounts are made by hand
    // (no approval step), and completed questionnaires now live in Account
    // management (/manage), not the admin panel.

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

    // questionnaire option descriptions: the sub-text under each /apply kink option
    const qSec = document.createElement("div"); qSec.className = "adm-sec";
    qSec.append(mk("h3", "Questionnaire descriptions"));
    const qHint = mk("p", "The sub-text shown under each option on the application questionnaire. Leave blank for none.");
    qHint.className = "adm-empty"; qSec.append(qHint);
    const QLABELS = { feet: "Feet", tasks: "Tasks / Chores", degradation: "Degradation",
      masochism: "Masochism", chastity: "Chastity", worship: "Worship", petplay: "Petplay" };
    const qInputs = {};
    Object.keys(QLABELS).forEach((id) => {
      const lab = mk("label", QLABELS[id]); lab.className = "adm-lbl";
      const inp = document.createElement("input"); inp.type = "text"; inp.className = "adm-area"; inp.value = "";
      inp.placeholder = "no description"; qInputs[id] = inp;
      qSec.append(lab, inp);
    });
    const qSave = mkChip("Save descriptions", "", async () => {
      const subs = {}; Object.keys(qInputs).forEach((id) => { subs[id] = qInputs[id].value; });
      qSave.textContent = "Saving...";
      const r = await fetch("/api/questionnaire", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subs }),
      });
      qSave.textContent = r.ok ? "Saved" : "Error";
      setTimeout(() => { qSave.textContent = "Save descriptions"; }, 1500);
    });
    const qRow = document.createElement("div"); qRow.style.marginTop = ".5rem"; qRow.append(qSave);
    qSec.append(qRow);
    // fetch current values from the server before showing them (never seed from a client default)
    fetch("/api/questionnaire").then((r) => r.json()).then((d) => {
      const s = (d && d.subs) || {};
      Object.keys(qInputs).forEach((id) => { qInputs[id].value = s[id] || ""; });
    }).catch(() => {});
    wrap.append(foldable(qSec));

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
      const del = mkChip("Delete", "ghost", async () => {
        if (!confirm("Delete " + u.username + "'s account for good? This cannot be undone.")) return;
        const r = await fetch("/api/users/" + encodeURIComponent(u.username), { method: "DELETE" });
        if (r.ok) row.remove();
        else { const e = await r.json().catch(() => ({})); alert(e.error || "Could not delete."); }
      });
      row.append(nm, grow,
        mkMini("−", () => adjust(-1)),
        mkMini("+", () => adjust(1)),
        mkChip("±", "ghost", () => { const n = parseInt(prompt("Adjust " + u.username + "'s points by:", "10")); if (Number.isInteger(n)) adjust(n); }),
        listed, del);
      accSec.append(row);
    }
    wrap.append(foldable(accSec));

    // lines completed (Penance / Devotion series), clickable to view
    const logSec = document.createElement("div"); logSec.className = "adm-sec";
    logSec.append(mk("h3", "Lines completed"));
    const logList = document.createElement("div");
    const logEmpty = document.createElement("p"); logEmpty.className = "adm-empty"; logEmpty.textContent = "No series finished yet.";
    logSec.append(logList, logEmpty); wrap.append(foldable(logSec));

    // Summaries handed in: the summary game stores each hand-in; list them here
    // and open the full text on click. Populated after the panel is assembled.
    const sumSec = document.createElement("div"); sumSec.className = "adm-sec";
    sumSec.append(mk("h3", "Summaries handed in"));
    const sumList = document.createElement("div");
    const sumEmpty = document.createElement("p"); sumEmpty.className = "adm-empty"; sumEmpty.textContent = "No summaries handed in yet.";
    sumSec.append(sumList, sumEmpty); wrap.append(foldable(sumSec));

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

    // multitap sentences: the example lines the multitap game asks you to type.
    // One per row; lowercase, letters/spaces/basic punctuation only.
    const mtSec = document.createElement("div"); mtSec.className = "adm-sec";
    mtSec.append(mk("h3", "Multitap lines"));
    const mtHint = mk("p", "The example sentences the multitap game shows, one per row. Lowercase; letters, spaces and simple punctuation only.");
    mtHint.className = "adm-empty"; mtSec.append(mtHint);
    const mtTa = document.createElement("textarea"); mtTa.rows = 6; mtTa.value = "loading..."; mtTa.disabled = true;
    fetch("/api/multitap").then((r) => (r.ok ? r.json() : null)).then((d) => {
      mtTa.value = d && d.lines ? d.lines.join("\n") : "";
      mtTa.disabled = false;
    }).catch(() => { mtTa.value = ""; mtTa.disabled = false; });
    const mtBox = document.createElement("div"); mtBox.className = "adm-preset"; mtBox.append(mtTa); mtSec.append(mtBox);
    const mtBar = document.createElement("div"); mtBar.className = "adm-preset-bar";
    const mtSave = mkChip("Save lines", "", async () => {
      const lines = mtTa.value.split("\n").map((x) => x.trim()).filter(Boolean);
      mtSave.textContent = "Saving...";
      const r = await fetch("/api/multitap", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }),
      });
      mtSave.textContent = r.ok ? "Saved" : "Error";
      if (!r.ok) mtHint.textContent = ((await r.json().catch(() => ({}))).error) || "Error";
      setTimeout(() => { mtSave.textContent = "Save lines"; }, 1500);
    });
    mtBar.append(mtSave); mtSec.append(mtBar); wrap.append(foldable(mtSec));

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

    // game-selection hover text: the "// ..." panel over each card on /games.
    // Persistence rule: the editor fetches the live server values before rendering
    // (never seeded from a client constant), so a save can't re-persist a default.
    const tipsSec = document.createElement("div"); tipsSec.className = "adm-sec";
    tipsSec.append(mk("h3", "Game hover text"));
    const tipsHint = mk("p", "The “// …” panel shown over each game's card on the selection wall. One line each; keep it short.");
    tipsHint.className = "adm-empty"; tipsSec.append(tipsHint);
    const tipsBox = document.createElement("div"); tipsBox.className = "adm-preset";
    tipsSec.append(tipsBox);
    const tipInputs = {};
    fetch("/api/gametips").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const tips = (d && d.tips) || {};
      Object.keys(tips).forEach((name) => {
        const lbl = mk("label", name); lbl.className = "adm-lbl";
        const ta = document.createElement("textarea"); ta.rows = 2; ta.value = tips[name];
        tipInputs[name] = ta;
        tipsBox.append(lbl, ta);
      });
    }).catch(() => { tipsHint.textContent = "Could not load hover text."; });
    const tipsBar = document.createElement("div"); tipsBar.className = "adm-preset-bar";
    const tipsSave = mkChip("Save hover text", "", async () => {
      const out = {};
      Object.keys(tipInputs).forEach((n) => { out[n] = tipInputs[n].value.trim(); });
      tipsSave.textContent = "Saving...";
      const r = await fetch("/api/gametips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tips: out }),
      });
      tipsSave.textContent = r.ok ? "Saved" : "Error";
      if (!r.ok) tipsHint.textContent = ((await r.json().catch(() => ({}))).error) || "Error";
      setTimeout(() => { tipsSave.textContent = "Save hover text"; }, 1500);
    });
    tipsBar.append(tipsSave); tipsSec.append(tipsBar); wrap.append(foldable(tipsSec));

    // OT12 photos: the matching game's pool. There is no automated image source
    // on purpose — these are other people's copyrighted photos, so they are
    // uploaded and tagged by hand here. Shrunk client-side before upload.
    // Runs larger than the rest of the panel (see .ot-wide) — there is a photo
    // plus twelve names to see at once, and the panel's default column is too
    // narrow for that. Tags are picked AFTER the photo is chosen, using the
    // same tagger UI a re-tag uses, so adding and re-tagging are one flow.
    const otSec = document.createElement("div"); otSec.className = "adm-sec ot-wide";
    otSec.append(mk("h3", "OT12 photos"));
    const OT_ADD_HINT = "Choose a photo, then tick everyone who appears in it (a photo may show several) — it is shrunk to 512px on its longest side, keeping its aspect ratio.";
    const otHint = mk("p", OT_ADD_HINT);
    otHint.className = "adm-empty"; otSec.append(otHint);

    const otStage = document.createElement("div"); otStage.className = "ot-stage";
    const otPreview = document.createElement("img");
    otPreview.className = "ot-preview"; otPreview.style.display = "none";
    otStage.append(otPreview); otSec.append(otStage);

    const otWho = document.createElement("div"); otWho.className = "ot-who";
    otSec.append(otWho);

    const otBar = document.createElement("div"); otBar.className = "adm-preset-bar";
    const otFile = document.createElement("input"); otFile.type = "file"; otFile.accept = "image/*"; otFile.style.display = "none";
    const otSelected = new Set();
    const otChips = {};              // member -> its toggle, so tags can be loaded in
    let otEditing = null;            // existing photo id being re-tagged, or null
    let otPendingImg = null;         // dataURL staged for a brand-new photo, held until Save

    function otSetChips(members) {
      otSelected.clear();
      (members || []).forEach((m) => otSelected.add(m));
      Object.keys(otChips).forEach((m) => otChips[m].classList.toggle("sel", otSelected.has(m)));
    }
    function otOutline(photoId) {
      otList.querySelectorAll("[data-pid]").forEach((el) => {
        el.classList.toggle("ot-current", Boolean(photoId) && el.dataset.pid === photoId);
      });
    }
    // Exactly one of three states at a time: idle (the add button showing),
    // staging a brand-new upload, or re-tagging an existing photo.
    function otReset() {
      otEditing = null; otPendingImg = null;
      otSetChips([]);
      otPreview.style.display = "none"; otPreview.src = "";
      otPick.hidden = false; otSave.hidden = true; otCancel.hidden = true;
      otHint.textContent = OT_ADD_HINT;
      otOutline(null);
    }
    function otStageEdit(photo) {
      otEditing = photo.id; otPendingImg = null;
      otSetChips(photo.members);
      otPreview.src = photo.img; otPreview.style.display = "block";
      otPick.hidden = true; otSave.hidden = false; otCancel.hidden = false;
      otHint.textContent = "Re-tagging this photo — tick everyone in it, then save.";
      otOutline(photo.id);
    }
    function otStageAdd(dataUrl) {
      otEditing = null; otPendingImg = dataUrl;
      otSetChips([]);
      otPreview.src = dataUrl; otPreview.style.display = "block";
      otPick.hidden = true; otSave.hidden = false; otCancel.hidden = false;
      otHint.textContent = "Tick everyone in this photo, then save.";
      otOutline(null);
    }
    const otPick = mkChip("+ Add photo", "ghost ot-big", () => otFile.click());
    const otSave = mkChip("Save tags", "ot-big", async () => {
      if (!otSelected.size) { otHint.textContent = "Tick at least one member."; return; }
      const adding = !otEditing;
      const url = adding ? "/api/ot12/photos" : "/api/ot12/photos/" + encodeURIComponent(otEditing);
      const body = adding ? { members: [...otSelected], img: otPendingImg } : { members: [...otSelected] };
      otHint.textContent = adding ? "Uploading…" : "Saving…";
      const r = await fetch(url, {
        method: adding ? "POST" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { otHint.textContent = d.error || "Could not save."; return; }
      otFile.value = "";
      otReset();
      otHint.textContent = adding ? "Added." : "Tags saved.";
      otLoad();
    });
    const otCancel = mkChip("Cancel", "ghost ot-big", () => { otFile.value = ""; otReset(); });
    otSave.hidden = true; otCancel.hidden = true;
    otBar.append(otPick, otSave, otCancel); otSec.append(otBar);
    const otList = document.createElement("div"); otList.className = "ot-list";
    otSec.append(otList, otFile);

    function otThumb(p) {
      const box = document.createElement("div");
      box.className = "ot-thumb"; box.dataset.pid = p.id;
      const im = document.createElement("img");
      im.src = p.img; im.alt = (p.members || []).join(", ");
      im.title = "Click to re-tag";
      im.addEventListener("click", () => otStageEdit(p));
      const nm = document.createElement("div");
      nm.className = "ot-thumb-nm"; nm.textContent = (p.members || []).join(", ");
      const x = document.createElement("button");
      x.className = "adm-log-x ot-thumb-x"; x.textContent = "×"; x.title = "Remove";
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        const r = await fetch("/api/ot12/photos/" + encodeURIComponent(p.id), { method: "DELETE" });
        if (!r.ok) return;
        if (otEditing === p.id) otReset();
        box.remove();
      });
      box.append(im, nm, x);
      return box;
    }
    function otLoad() {
      fetch("/api/ot12/photos").then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!d) return;
        if (!otWho.children.length) {
          (d.members || []).forEach((m) => {
            const b = mkChip(m, "ot-big", () => {
              if (otSelected.has(m)) otSelected.delete(m); else otSelected.add(m);
              b.classList.toggle("sel", otSelected.has(m));
            });
            otChips[m] = b;
            otWho.append(b);
          });
        }
        otList.replaceChildren();
        (d.photos || []).forEach((p) => otList.append(otThumb(p)));
        if (!d.photos || !d.photos.length) {
          const e = mk("p", "No photos yet."); e.className = "adm-empty"; otList.append(e);
        }
      }).catch(() => {});
    }
    otFile.addEventListener("change", () => {
      const file = otFile.files && otFile.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        // fit the longest side to 512 and KEEP the aspect ratio (no square crop)
        const max = 512;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        otStageAdd(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = URL.createObjectURL(file);
    });
    otReset();
    otLoad();
    wrap.append(foldable(otSec));

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
    docSec.append(mk("h3", "Documentation & tools"));
    [["Account management", "/manage"], ["Guide", "/guide"], ["Technical notes", "/tech"], ["Commands", "/commands"]].forEach(([t, h]) => {
      const a = document.createElement("a"); a.className = "adm-doc"; a.href = h; a.textContent = t; docSec.append(a);
    });
    wrap.append(foldable(docSec));

    // Group the sections into a few top-left tabs so the panel shows one area at
    // a time instead of everything at once.
    // Top-level tabs. A tab may declare `subs`, in which case its panel gets its
    // own second row of tabs — Games does, one per game that has settings, with
    // the shared hover-text editor sitting in the first (default) subtab.
    const TABS = [
      { id: "members", label: "Members", match: ["Approvals", "Applications", "Accounts"] },
      { id: "games", label: "Games", subs: [
        { id: "general",  label: "General",  match: ["Game hover text"] },
        { id: "penance",  label: "Penance",  match: ["Penance presets"] },
        { id: "devotion", label: "Devotion", match: ["Devotion presets"] },
        { id: "multitap", label: "Multitap", match: ["Multitap lines"] },
        { id: "ot12",     label: "OT12",     match: ["OT12 photos"] },
      ] },
      { id: "completed", label: "Completed", match: ["Lines completed", "Summaries handed in"] },
      { id: "content", label: "Site content", match: ["Onboarding intro", "Questionnaire descriptions", "Decrypt lines", "Screen glitch"] },
      { id: "docs", label: "Docs & tools", match: ["Documentation"] },
    ];
    const secLabel = (sec) => {
      const h = sec.querySelector("h3");
      // strip the leading fold chevron (span.sc) so matching sees the real label
      return (h ? h.textContent : "").replace(/^[^A-Za-z]+/, "").trim();
    };
    // where a section belongs: [tabId, subId|null]
    const homeFor = (sec) => {
      const t = secLabel(sec);
      for (const tab of TABS) {
        if (tab.subs) {
          const sub = tab.subs.find((sb) => sb.match.some((m) => t.startsWith(m)));
          if (sub) return [tab.id, sub.id];
        } else if ((tab.match || []).some((m) => t.startsWith(m))) {
          return [tab.id, null];
        }
      }
      return [TABS[0].id, null];
    };

    const secs = [...wrap.querySelectorAll(":scope > .adm-sec")];
    const panels = {}, subPanels = {}, subBars = {};
    TABS.forEach((tab) => {
      const p = document.createElement("div");
      p.className = tab.subs ? "adm-panel" : "adm adm-panel";
      p.dataset.tab = tab.id;
      panels[tab.id] = p;
      if (tab.subs) {
        const sbar = document.createElement("div"); sbar.className = "adm-tabs adm-subtabs";
        p.append(sbar); subBars[tab.id] = sbar;
        tab.subs.forEach((sb) => {
          const sp = document.createElement("div");
          sp.className = "adm adm-subpanel"; sp.dataset.sub = sb.id;
          subPanels[tab.id + "/" + sb.id] = sp;
          p.append(sp);
        });
      }
    });
    secs.forEach((sec) => {
      const [tabId, subId] = homeFor(sec);
      (subId ? subPanels[tabId + "/" + subId] : panels[tabId]).append(sec);
    });

    // a tab with subs counts as populated if any of its subpanels has content
    const tabHasContent = (tab) => tab.subs
      ? tab.subs.some((sb) => subPanels[tab.id + "/" + sb.id].children.length)
      : panels[tab.id].children.length;

    const bar = document.createElement("div"); bar.className = "adm-tabs";
    const activate = (id) => {
      TABS.forEach((tab) => {
        panels[tab.id].classList.toggle("active", tab.id === id);
        const btn = bar.querySelector('[data-tab="' + tab.id + '"]');
        if (btn) btn.classList.toggle("active", tab.id === id);
      });
    };
    const activateSub = (tab, subId) => {
      tab.subs.forEach((sb) => {
        const sp = subPanels[tab.id + "/" + sb.id];
        sp.classList.toggle("active", sb.id === subId);
        const b = subBars[tab.id].querySelector('[data-sub="' + sb.id + '"]');
        if (b) b.classList.toggle("active", sb.id === subId);
      });
    };

    wrap.replaceChildren(bar);
    TABS.forEach((tab) => {
      const panel = panels[tab.id];
      if (!tabHasContent(tab)) return;                  // hide tabs with nothing in them
      const btn = document.createElement("button");
      btn.className = "adm-tab"; btn.dataset.tab = tab.id; btn.textContent = tab.label;
      const waiting = panel.querySelectorAll(".adm-row.pending").length;
      if (waiting) { const b = document.createElement("span"); b.className = "badge"; b.textContent = waiting; btn.append(b); }
      btn.addEventListener("click", () => activate(tab.id));
      bar.append(btn);
      wrap.append(panel);

      if (tab.subs) {
        tab.subs.forEach((sb) => {
          if (!subPanels[tab.id + "/" + sb.id].children.length) return;
          const sbtn = document.createElement("button");
          sbtn.className = "adm-tab"; sbtn.dataset.sub = sb.id; sbtn.textContent = sb.label;
          sbtn.addEventListener("click", () => activateSub(tab, sb.id));
          subBars[tab.id].append(sbtn);
        });
        // the first subtab (General / hover text) is the default
        const firstSub = subBars[tab.id].querySelector("[data-sub]");
        if (firstSub) activateSub(tab, firstSub.dataset.sub);
      }
    });
    const firstBtn = bar.querySelector(".adm-tab");
    if (firstBtn) activate(firstBtn.dataset.tab);

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
      meta.textContent = (e.category || "series") + (e.preset ? " / " + e.preset : "") + " · " + e.passages + " lines · " + e.mistakes + " err";
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

    // handed-in summaries: one admin fetch, newest first (server already sorts)
    const sres = await fetch("/api/admin/summaries").catch(() => null);
    if (sres && sres.ok) {
      const { entries = [] } = await sres.json();
      sumEmpty.hidden = entries.length > 0;
      entries.slice(0, 60).forEach((entry) => {
        const row = document.createElement("div"); row.className = "adm-log";
        const who = document.createElement("span"); who.className = "who2";
        who.textContent = entry.player + (entry.guest ? " (guest)" : "");
        const meta = document.createElement("span"); meta.className = "meta2";
        const topic = entry.topic ? entry.topic.slice(0, 40) : "summary";
        meta.textContent = topic + " · " + entry.words + " words" + (entry.limit ? " / " + entry.limit : "");
        who.addEventListener("click", () => showSummary(entry));
        meta.addEventListener("click", () => showSummary(entry));
        const dismiss = document.createElement("button"); dismiss.className = "adm-log-x"; dismiss.textContent = "×"; dismiss.title = "Dismiss";
        dismiss.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const r = await fetch("/api/admin/summaries/" + encodeURIComponent(entry.id), { method: "DELETE" });
          if (r.ok) row.remove();
        });
        row.append(who, meta, dismiss);
        sumList.append(row);
      });
    }
  }

  return { build: build, showResult: showResult };
})();
