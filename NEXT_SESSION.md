# Prompt for the next session

Copy the block below into a fresh session.

---

Hi Claude :3 New context window - this is the angeldom.me project (Railway
auto-deploys on push to main; single Express `server.js`, JSON files on disk, no
build step; admin identity is `hermione`).

**Read `HANDOFF.md` first.** The sections dated 2026-07-28 and 2026-07-29 are
current truth; anything above them may be stale, and `README.md` + `/tech` are
definitely stale (a docs pass is parked as *reskin the style only, do not rewrite
the text*).

**Then read `mockups/README.md`.** All design exploration lives in `mockups/` as
parameterised single-file pages (one design per `?d=N`). They render off
`file://` with no dev server: `open "mockups/chess.html?d=2"`. Regenerate every
screenshot with `./mockups/capture.sh` (writes to the gitignored `mockups/out/`).

Before coding: the test sandbox is wiped between sessions. Reseed it and run on
:57999 - write a seed script that hashes with the repo's `node_modules/bcryptjs`,
seed `hermione` (Princess, `sandboxpass123`) plus a couple of approved subs, a
Visitor and one `status:"pending"` user, all needing `passwordHash`, `status`,
`pronouns` and `createdAt`, then:

```
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

**Check for leftover servers before you trust any curl** - processes from earlier
sessions keep running and hold :57999, so a new server dies with EADDRINUSE while
curl still answers from stale data. Run
`lsof -nP -iTCP:57999 -sTCP:LISTEN` and confirm the listener's `DATA_DIR` with
`ps eww -p <pid>` first. Note that `pkill -f "PORT=57999"` kills the shell
wrapper and leaves the node process holding the port; kill the PID from `lsof`.

**Do not trust the Browser pane for layout.** It reported a 0x0 viewport for the
whole of the last session, even after `tabs_select` and `resize_window`, and even
when it was not hidden. DOM and JSON checks through `javascript_tool` still work,
but every width, height and screenshot lied. Drive headless Chrome instead: the
last session wrote a `shot.js` that talks the DevTools protocol, so it can log in,
run arbitrary JS (click a tab, drive a parse with synthetic `KeyboardEvent`s) and
*then* screenshot. Pair it with an untracked `public/_shot.html` that logs in and
redirects, since `.gitignore` already covers `public/_*.html`. Both are worth
rebuilding early; they paid for themselves several times over.

Other testing notes: `computer{type}` sends no keydown, so drive the typing games
with synthetic `KeyboardEvent`s. `/writing` (Penance) and the games need a login
or guest session, so hit `POST /api/guest` first when testing those. Only
`server.js` changes need a restart; static files under `public/` and `views/`
serve fresh. The repo may be edited via Replit, so pull/rebase before pushing.
**No em dashes anywhere.**

## What I need from you first

Pick a design per batch and I will build them. Awaiting a decision on the three
third attempts:

- **Chess** - 10 options. The terminal restriction is lifted for this batch, so
  they are ten different material worlds (marble gallery, Victorian parlour, art
  deco, brutalist concrete, the site's own Cirrus sky, stained glass, newspaper
  column, neon arcade, ink wash, porcelain boudoir). All ten keep Hermione's
  strike/rewind controls in a block that is never rendered for the opponent.
- **T9 phone** - 6 options, each a specific real handset (Razr V3, Nokia-style
  brick, Y2K gloss flip, slider, joystick candybar, rugged site phone).
- **Slots** - 6 options, terminal restriction also lifted (Vegas cabinet, antique
  fruit machine, pachislot, Cirrus, five-reel reliquary, gacha capsule).

Already chosen and **built**: **Profile 10** (man page) and **Dummy Parse 10**
(big ability cards) with the **11** rotation timeline as a tab.
Already chosen, **not built yet**: **Wheel 5** (unrolled cylinder), **Game select
2** (paste-up), **Skill check 1** (pure dial), **Summary 1** (source + entry).
The last two came from a file that bundled four minigames together; that file is
deleted and those games must stay separate.

## Also outstanding

- **Four picked designs are still unbuilt**: wheel, game select, skill check and
  summary. Skill check and summary are new games with no page yet.
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
- **Railway can lag badly.** One commit took ~90s and the next ~14 minutes. A
  restarted server on the old image looks like a failed build but may just be
  slow, so verify with a static-file marker before concluding anything.
