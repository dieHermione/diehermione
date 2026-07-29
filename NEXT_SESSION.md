# Prompt for the next session

Copy the block below into a fresh session.

---

Hi Claude :3 New context window — this is the angeldom.me project (Railway
auto-deploys on push to main; single Express `server.js`, JSON files on disk, no
build step; admin identity is `hermione`).

**Read `HANDOFF.md` first.** The sections dated 2026-07-28 and 2026-07-29 are
current truth; anything above them may be stale, and `README.md` + `/tech` are
definitely stale (a docs pass is parked as *reskin the style only, do not rewrite
the text*).

**Then read `mockups/README.md`.** All design exploration now lives in `mockups/`
as seven parameterised single-file pages (one design per `?d=N`). They render off
`file://` with no dev server: `open "mockups/chess.html?d=2"`. Regenerate every
screenshot with `./mockups/capture.sh` (writes to the gitignored `mockups/out/`).

Before coding: the test sandbox is wiped between sessions. Reseed it and run on
:57999 — write a seed script that hashes with the repo's `node_modules/bcryptjs`,
seed `hermione` (Princess, `sandboxpass123`) plus a couple of approved subs, a
Visitor and one `status:"pending"` user, all needing `passwordHash`, `status`,
`pronouns` and `createdAt`, then:

```
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

**Check for leftover servers before you trust any curl** — processes from earlier
sessions keep running and hold :57999, so a new server dies with EADDRINUSE while
curl still answers from stale data. Run
`lsof -nP -iTCP:57999 -sTCP:LISTEN` and confirm the listener's `DATA_DIR` with
`ps eww -p <pid>` first.

Two more testing notes that cost real time before: the Browser pane usually runs
as a **hidden tab**, where `requestAnimationFrame` never fires and `setTimeout`
is clamped to ~1s — canvas games look broken and every timing measurement lies.
Call `tabs_select` to front it, check `document.hidden` inside the test, and do
the whole measurement in one `javascript_tool` call. Prefer curl / DOM+JSON
checks over screenshots; render mockups with headless Chrome. `/writing`
(Penance) and the games need a login or guest session, so hit `POST /api/guest`
first when testing those. The repo may be edited via Replit, so pull/rebase
before pushing. **No em dashes anywhere.**

## What I need from you first

Pick a design per batch and I will build them. Awaiting a decision:

- **Profile** — 10 options (second attempt)
- **Chess** — 10 options (second attempt), all keeping Hermione's strike/rewind
  controls hidden from the opponent
- **T9 phone** — 6 real-world phone forms (second attempt)
- **Slots** — 6 options (second attempt)
- **Dummy Parse** — 20 options

Already chosen: **Wheel 5** (unrolled cylinder), **Game select 2** (paste-up),
**Skill check 1** (pure dial), **Summary 1** (source + entry). The last two came
from a file that bundled four minigames together; that file is deleted and those
games must stay separate.

## Also outstanding

- **Dummy Parse is built and live** (`/dummyparse`) but was written in one pass
  with no mockup, so it wants the redesign once a direction is picked.
- The **secret console codes** are placeholders (`her eyes`, `static`, `bleed`,
  `collapse`, `quiet`, `listen`). The real codes still need inventing. `wing
  add_points <user> <n>` works and is admin-gated; more `wing` commands were
  planned.
- **Photosensitivity has a first-visit gap**: the login page runs before we know
  who the visitor is, so it trusts a flag cached in localStorage from the last
  signed-in visit. A flagged account is unprotected on the very first visit from
  a new browser. There is also no way to change the answer after registering.
- **Elysium audio is per-visit**: a local unmute lasts the visit but does not
  survive a reload, because the site-wide setting reseeds on open. That matches
  the brief but is worth confirming.
- **Hover sounds ride the Typing channel**, since the settings panel only has
  three audio categories. Easy to split out.
- `nav.js` still carries dead `buildNav()` and `applyGuestNav()` from the removed
  pill nav; neither is called.
- **Railway can lag badly.** Last session one commit took ~90s and the next ~14
  minutes. A restarted server on the old image looks like a failed build but may
  just be slow, so verify with a static-file marker before concluding anything.
