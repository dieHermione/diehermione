# angeldomme — the one document

This is the **only** documentation for the project. There is no README, no
NEXT_SESSION, no per-folder notes, no in-site guide or tech page — everything
lives here, in plain markdown, and **it is updated in the same commit as any
change that would warrant it** (a new route, pool, command, rule, or a claim
below that stops being true). Rewritten from the code on 2026-09-11; the
previous five files trailed the code by twenty commits.

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). One Express
server (`server.js`, ~3.4k lines), no database, JSON files on disk under
`DATA_DIR`, **no build step**. One admin identity: `hermione`. Repo:
`dieHermione/diehermione` — it is also edited through Replit sometimes, so
**pull/rebase before pushing**.

---

## Standing rules

### Naming
The site is called **angeldomme** — the `.me` is part of the word ("angel
domme"). Never write bare `angeldom` anywhere a visitor sees, including window
titles and `name@host` handles: write `angeldomme` or the full domain
`angeldom.me`. Every page header reads **`angelOS v0.2`**, with exactly that
casing — never `ANGELOS`. An uppercased header must wrap the word in a
`text-transform: none` span (as `admin.html` and `commands.html` do). Internal
identifiers and the domain string are fine.

### Always push
Commit and push to `main` after every task without asking. Small personal
hobby site, standing authorization. Auto-deploys on push, so sanity-check the
live site against a real marker afterwards; Railway has lagged ~14 minutes
before, so don't conclude a build failed too early.

### One document
This file. Plain markdown, not styled to the site. Update it with the change,
not afterwards.

### Image generation is available
GPT image 2 is available. **Suggest it wherever pure CSS/SVG isn't enough** —
placeholder game cards, poster art, textures, materials — with a concrete brief
(subject, style, palette, aspect, background) rather than hand-drawing a weak
approximation. The user runs the generation.

### Dual-tone colour — no dimming
Every blue-and-white surface uses exactly two text colours: the accent
(default **`#00acdb`**) and white **`#eafaff`**. No dim/mid blue for text;
`--dim` and `--dim2` resolve to the accent. **No text transparency anywhere** —
never `rgba()` with alpha or `opacity<1` on visible text (`--glow`, borders and
backgrounds may keep alpha). Applies to dashboard, login, boot, onboarding,
summary, admin, manage, commands, profile, and to the devotion and summary
cards. **Penance is red** (card and screen), dual-tone as one red + white.
The accent is themeable per account (see `theme.js`) — the rule is "two
colours", not "blue".

### UI rules for games
- **Never `<input type="number">`.** Use `<input type="text" inputmode="numeric" maxlength="N">` and strip non-digits.
- **Settings, play and results are three distinct screens.** Results never render beneath the options.
- A results screen that reports to the admin panel sends **all** the data it shows.
- New pages get the shared back chevron by putting `has-top-nav` on `<body>` and including `/nav.js` — never hand-roll a back link. A page opened from somewhere other than the wall names it with `data-back="/admin"` (etc.) on `<body>`.

### Persistence — crucial
Every editable pool is a JSON file under **`DATA_DIR`**. The `load*()`
functions read the file first and fall back to the in-code `*_DEFAULTS` only
when the file is missing — **Hermione's edits always win**. Infra is correct
and verified: Railway service `diehermione`, volume `diehermione-volume` at
`/data`, env `DATA_DIR=/data`. Do not add a second volume, do not move
`DATA_DIR`, and **never commit generated data JSON** (a deploy would overwrite
live edits). For any new pool: copy `decrypt.json`'s shape exactly, and make
its admin editor **fetch the server value before rendering** — never seed an
editor from a client-side constant (that bug re-persisted defaults over edits
once already).

### Hiding versus access control
Chess is the pattern. Hermione-only UI lives in `views/chess-extra.js` behind
a route that **404s** (not 403s) for everyone else, so the opponent's page has
no markup, strings or endpoints to find — that is about not spoiling the game.
**The endpoints check `isAdmin` on every call; that is the real boundary.** The
console's `admin: true` flag is cosmetic for the same reason.

### Mockups
Parameterised single-file pages in `mockups/` (`?d=N`), rendered with headless
Chrome, sent, and the throwaway `public/_*.html` copies deleted (gitignored
anyway). Rules learned the hard way: when a batch comes back as "the same
design again", change the **organising idea**, not the palette (T9 was
rejected four times as a calculator; slots once as six cabinets); for a
**physical object, ask for a reference photo on the first rejection** (the
accepted T9 copies a Motorola RAZR V3). Never let several minigames share one
page in a real implementation. Picking a mockup is a decision to *try* it —
show it running before calling it settled. And now: where a card wants a
photo, illustration or material, propose image generation instead of CSS.

---

## What exists

### Pages

`public/index.html` is login (login-only; "apply here" → `/apply`; a guest
button → `POST /api/guest`). `public/dashboard.html` is the dashboard;
everything else is a view in `views/` behind a route.

| Route | Who | What |
|---|---|---|
| `/` | anyone | login, boot into the dashboard |
| `/dashboard` | player | the dashboard; guests see it in a guest state (no points, no Profile/admin). `/guest` redirects here |
| `/games` | player | the wall every game is reached from; two tabs, *games* and *extra* |
| `/profile` | login | the man page (`angelOS database`); `?user=` views another |
| `/apply` | anyone | account-less questionnaire → `applications.json`; carries a short code the applicant DMs Hermione |
| `/admin` | admin | the tabbed admin panel (`public/adminpanel.js`) |
| `/manage` | admin | create accounts + review questionnaires (Create account / Questionnaires tabs); back → `/admin` |
| `/commands` | admin | the `pray` reference, hand-maintained |
| `/snake` `/writing` (`?mode=devotion`) `/multitap` (`/t9` alias) `/summary` `/skillcheck` `/ot12` `/deathroll` `/dummyparse` `/elysium` (`/tree` alias) `/chess` | player | the games on the wall |
| `/wheel` `/lottery` (`/slots` alias) | player | still routed, **not linked from the wall** (see Drift) |
| `/coc2-engine/` | anyone (static) | a hosted writeup, unrelated to the site's own docs |
| `/chess-extra.js` | admin, 404 otherwise | Hermione's chess controls |

"player" = `requirePlayer` (account or guest); "login" = `requireLogin`
(account only); "admin" redirects non-admins to `/dashboard`. `/writing?mode=devotion`
additionally redirects guests to `/games`.

### The games wall (`views/games.html`)

Locked layout; one bespoke poster per game, all sharing one macOS-window
frame; cards hydrate real data (pool lines, elysium age). Order and tabs:

| Tab | Game | Card | Accent | Notes |
|---|---|---|---|---|
| games | penance | real | red | |
| games | multitap | real (flat keypad) | green | |
| games | summary | real | blue | |
| games | skill check | real (dial) | red | |
| games | ot12 | real (group photo) | pink | flagged `wip` — "unfinished" label, still playable |
| games | snake | real | red | |
| extra | devotion | real | blue | `account` — locked for guests |
| extra | deathroll | real | red | `multi` — locked for guests on the wall (server would still let Hermione open a game against a guest) |
| extra | dummy parse | real | orange-red | |
| extra | elysium | **placeholder** | green | `account` |
| extra | chess | **placeholder** | red-brown | not locked for guests |

Elysium and chess are the two remaining placeholder cards — candidates for
image generation. Hover text over each card comes from `gametips.json`.

### The games

- **Snake** — free-swimming, no grid; dies on its own tail; food drifts at half speed and flees. **Shift** boosts (~5s per full meter at 1.9x, refills ~16s), **Space** pauses. Time limit chosen on the settings screen (up to 999 min). Food pays points.
- **Penance / Devotion** (`/writing`) — typed lines from Hermione-editable presets (`penance.json`, `devotion.json`; `lines[0]` always first, the rest shuffled). Penance is red, keeps its own-lines box, and corrupts the text but stays legible. Devotion is blue and needs an account.
- **Multitap** (`/multitap`, renamed from T9) — typing on an old-phone multi-tap keypad, green/white, deliberately unguided. Any other key commits the pending letter; `#` confirms; `*` deletes; one press of `0` confirms, a second enters a space. Settings screen picks preset or custom lines and a repetition count. Pool is `multitap.json`. Logs as `category: "multitap"`.
- **Summary** — a real Wikipedia article (action API plain-text extract, trimmed) and a word limit that scales with the source. Pools in `SUMMARY_TOPICS`/`KIND_LABEL`: angels, feminism, Greek mythology, pre-18th-century history, critical biblical scholarship. Handed-in summaries → `summaries.json`, read in Admin → Completed.
- **Skill check** — the pure dial, settings screen, presets 10/20/35/50, two difficulties, themed.
- **OT12** (`/ot12`) — LOONA trivia. A round is either a Hermione-tagged **photo** (several members allowed; every member always offered; the answer set must match exactly) or a **trait question** generated from `OT12_MEMBER_DATA` (kinds: animal, shape, hangul, color, plant, height — only kinds with real values are offered; the pool is built at startup). Photos and "any trivia" split the odds evenly. Rounds chosen on the settings screen (default 10, max 100). Correct/wrong sounds. A **song framework** (`/api/ot12/songs`, hand-tagged) exists for future "who sings in X" questions — not built. **No automated image source, by design** (copyrighted photos); Hermione uploads (shrunk to 512px client-side) and re-tags in Admin → Games → OT12. No payout yet. Data-table caveats: values are not unique (location Earth 8 / Eden 4 — the yyxy four are Eden, real data; November/December/January each cover two members; eye colour Black covers four; shape Circle covers three), so a generator must never assume one right answer; missing fields are `undefined` and must be **skipped**, never invented. Thin fields: superpower, birthdate, height (1 of 12 each) — a height-range question cannot be generated yet.
- **Deathroll** — Hermione sets the opening number; players alternate `1d(previous)`; a 1 loses. Games keyed by the non-Hermione player. Wall-locked for guests.
- **Chess** — ink wash; every game is player (white) vs Hermione. Hermione has **STRIKE** (remove a piece, spent instead of a move, only on her turn) and **REWIND** (whole-state snapshot stack) via `chess-extra.js`. The picker lists every approved account.
- **Elysium** — the tree-care game, server-authoritative and time-based (`elysium-engine.js`: hourly ticks, health/resilience/moisture/humidity/airflow/nutrients/leaf wetness/wound load, five zones, three diseases with stages, six growth stages, real-month seasons; actions Water/Mist/Trim/Fertilize/Inspect). Pays nothing, by design. Only page **without** the screen glitch. Admin debug panel at `/api/elysium/debug`.
- **Dummy Parse** — priest damage sim; `GAME_VERSION` `"0.01"`; leaderboard shows best timed run per player on the current version only.
- **Wheel** — the unrolled cylinder; one spin a day for accounts, unlimited for guests; **credits nothing** since angelcoins went. Not on the wall.
- **Lottery** (was Slots) — the INSTANT scratch card; **still stakes angelcoins**, which nothing awards any more, so only Hermione (unlimited) can actually play. Not on the wall.

### Runs are server-owned (or bounded)

| Game | Model |
|---|---|
| Penance / Devotion / Multitap | **server-owned.** `POST /api/writing/session` builds the line sequence from the server's own pools (`mode` = `penance` / `devotion` / `multitap`; penance and multitap also accept the player's own lines) and stores it on the login session; `POST /api/writing/line` must match the expected line in order; `POST /api/writing/skip` is admin-only (`pray skip_stage`) and is the real boundary; `POST /api/writing/complete` takes **nothing** from the body and refuses unless the server's count says finished — one-shot. The run lives in `req.session.writing` (file-backed, survives restarts). |
| OT12 | **server-owned.** `/api/ot12/session` → `/answer` → `/skip` (admin) → `/complete`; the correct set is never sent until after the answer. |
| Dummy Parse | **bounded.** `/api/parse/session` locks the build (300-point pool) and starts the clock; `/api/parse` refuses more combat time than has elapsed, a wrong duration for a timed mode, or a DPS that disagrees with the total; mode and build come from the run. **Damage total is still client-reported.** |
| Snake | **bounded.** `/api/snake/session` records the limit; `/api/snake/food` refuses outside a live run (2s grace) and rate-limits (burst 8, refill 2s); `/api/snake/complete` returns the server's count, which the results screen shows. A client can still claim pickups it didn't earn, just not unboundedly. |
| Skill check, Chess, Deathroll, Elysium, Wheel, Lottery | n/a — either no score, or fully server-refereed already. |

Say "bounded, not validated" for Snake and Dummy Parse.

### Systems (shared scripts in `public/`)

- **`audio.js`** — one AudioContext; gain per channel (music / ambience / typing) under a master; one localStorage key, cross-tab via `storage`, BroadcastChannel lock so two visible tabs don't both play. **`ambience.js`** — room tone and interface sounds on the bus (hover sounds ride the typing channel).
- **`console.js`** — backtick/`~` opens it; commands are `pray <cmd>`; bare `pray` just acknowledges ("she hears you"). Also holds `CODES` — placeholder secret phrases (`her eyes`, `static`, `bleed`, `collapse`, `quiet`, `listen`) that trigger glitch/audio effects. Full command list in the `/commands` table below.
- **`dashglitch.js`** + **`glitchboot.js`** — the screen distortion: tear / dropout / bloom / contrast-crush / comb on a weighted 2.5–8s scheduler; contrast crush swaps palette variables (never the background) and inverts accent↔white. Every terminal page runs it except Elysium. Gated off by the photosensitive flag and the "Flashing effects" toggle.
- **`boot.js`** — the decrypt/POST cascade on a **virtual clock**: hold **Space** for 8x, **M** skips. Lines from `decrypt.json`; also plays for guests. No `[WARN]` lines, no vignette.
- **`theme.js`** — the account accent. Writes `--c/--dim/--dim2/--accent/--glow` **inline on `<html>`** (so nothing may set `--c` on `<body>`, which out-specifies it). Load in `<head>` before the page's `<style>`. Presets: default `#00acdb`, `ed0955`, `710087`, `0bdb00`, `f7df00`, `f78400`, `ffa6c5`; persisted to the account via `POST /api/theme`, localStorage for guests. Every game page follows the theme except Elysium.
- **`nav.js`** — injects the back chevron on `has-top-nav` pages (`/games` → dashboard, everything else → `/games`, or wherever `<body data-back>` says — `/commands` → `/admin`), runs the signed-out redirect, and honours a page's `window.__navBack()` hook (writing, skillcheck, profile use it: mid-run back goes to the game's settings screen first). `/admin` and `/manage` still hand-roll their own chevron — next to convert.
- **`notifications.js`** — the bell, **Hermione-only** (hidden for everyone else). Triggers: new questionnaire, a finished writing run, her own deathroll games.
- **`updatecheck.js`** + `GET /api/version` — `BUILD_ID` is stamped at boot; pages compare and offer a reload after a redeploy.
- **`transitions.js`** (login → dashboard covers), **`me.js`** (single-flight `/api/me` as `window.siteMe()`), **`ranks.js`** (rank legend; assignable when Hermione views someone else's badge), **`adminpanel.js`** (the whole `/admin` page).
- **`cardnav.js`** — a reusable Niri-style card strip; only its demo page `/cardnav` uses it.

### Dashboard (`public/dashboard.html`)
Hero title in Share Tech Mono; clock time is white; scales via root font-size
(**not** CSS `zoom` — measured: zoom doesn't rescale `vh/vw`). **Leaderboard**
final state, do not re-centre: full-width table, heading and rows
left-aligned, points right-aligned to the window edge, wide name→points gap,
ellipsizing columns, height synced to the control card, internal scroll. Lists
**only `flagged: true` accounts**. Settings panel: Accent swatches, Master /
Music / Ambience / Typing volume + mute, Flashing effects (locked off for
photosensitive accounts), password change. The dailies card markup is still
in the file but `hidden`.

### Auth model and ranks
No self-serve registration. Applicants fill `/apply` (age gate, kinks 1–5,
punishments, petnames, limits, other kinks, brat yes/no) → `applications.json`
+ a Hermione notification. Hermione creates accounts by hand in `/manage`
(disciple only; visitor was retired) with a dummy password and
`mustChangePassword`; first login forces a change. Login is refused while
`status: "pending"`. Guests: `POST /api/guest` claims `guestN` from an
in-memory registry (3h TTL; their chess/deathroll games go with them).

Rank ladder (`RANK_LADDER`, highest first): **Angel** (Hermione only, shown
for her regardless of the record), **??** (unassignable), **Disciple**,
**Worshipper**, **Devoted**, **Follower**, **Servant** (the entry rank new
accounts get). A boot-time migration folds legacy `Visitor` records into
Servant. Hermione sits outside the points economy (`noEconomy`, `points: null`).

### Admin panel (`/admin`, `public/adminpanel.js`)
Tabs: **Members** (Approvals · Applications · Accounts) · **Games** (subtabs
General = hover text · Penance presets · Devotion presets · Multitap lines ·
OT12 photos + songs) · **Completed** (Lines completed · Summaries handed in) ·
**Site content** (Onboarding intro · Questionnaire descriptions · Decrypt
lines · Screen glitch) · **Tools** (Account management `/manage` · Commands
`/commands`).

### Editable pools

| File (under `DATA_DIR`) | What | API | Editor |
|---|---|---|---|
| `decrypt.json` | boot cascade lines | `/api/decrypt` | Site content |
| `penance.json` / `devotion.json` | writing presets `{id,name,lines[]}` | `/api/penance/presets`, `/api/devotion/presets` | Games |
| `multitap.json` | flat sentence pool (lowercase, keypad-typeable) | `/api/multitap` | Games |
| `gametips.json` | wall hover text, keyed by game name | `/api/gametips` | Games → General |
| `ot12.json` | tagged photos + songs | `/api/ot12/photos`, `/api/ot12/songs` | Games → OT12 |
| `site.json` | onboarding intro paragraphs, dashboard copy | `/api/site` | Site content |
| `questionnaire.json` | `/apply` option sub-text (public read) | `/api/questionnaire` | Site content |

Non-editable data files: `users.json` (accounts, points, writing log, lifetime
counters, tasks), `games.json` (chess), `deathroll.json`, `elysium.json`,
`parses.json`, `summaries.json`, `applications.json`, `sessions.json` +
`.session-secret` (persistent sessions: file-backed `FileSessionStore`,
flushed once a second, 30-day rolling cookie).

### `pray` commands (`public/console.js`; mirror any change on `/commands`)

| Command | Who | Does |
|---|---|---|
| `pray` | anyone | acknowledges |
| `pray launch <target>` | anyone | navigates; the `LAUNCH` table in `console.js` lists every game and page, with aliases (`t9`, `slots`, `dummyparse`, `tree`, `writing`); `admin` / `manage` / `commands` are hers only, checked per target |
| `pray launch list` | anyone | prints every launch target with a word each; her three only appear for her |
| `pray open <user>` | anyone | that profile |
| `pray reload` / `pray quit` | anyone | |
| `pray points <user> <+n\|-n>` | admin | signed add |
| `pray set_points <user> <n>` | admin | |
| `pray delete_account <user>` | admin | not hermione |
| `pray skip_stage` | admin | penance / devotion / multitap / ot12 — server-side skip |
| `pray manage` | admin | `/manage` |

---

## Removed — do not reinstate by accident
Dailies and both daily bonuses; tithe; tasks and essays (UI); the guestbook;
light/dark toggle; the top pill nav; guest as an account type; **self-serve
registration**; **subliminals** entirely (`glitch.js`, `subliminal.json`, the
`pray` word-flash — a from-scratch rebuild of just the bare-`pray` flash was
floated but never asked for again); **angelcoins**; the **Visitor** account
type; member-facing notifications; the admin panel on the dashboard; the boot
vignette and `[WARN]` lines; edge-burn glitch; the in-site `/guide` and `/tech`
pages (2026-09-11 — this file replaced them).

## Drift and dead code (known, not yet cleaned)
- **`POST /api/register` is still live and unauthenticated** (creates a pending account + notification, hands out an onboarding credential). No UI calls it. Same for the account-bound `/onboarding` + `/api/onboarding` flow that `/apply` superseded. Delete when convenient.
- **Tasks** (`/task`, `/tasks`, `/api/tasks*`, `views/task.html`, `views/tasks.html`, `pushNotification` calls for them) — whole feature still in the server; nothing links to it except `/cardnav`.
- **`/cardnav`** + `cardnav.js` — a demo surface; its card list still links `/guide` and `/tasks`.
- **Writing categories shelf** (`writing.json`, `DEFAULT_CATEGORIES`, `GET/PUT /api/writing[/:id]`) — superseded by presets; no client calls it.
- **`POST /api/photosensitive`** has no caller: **there is no UI to mark an account photosensitive.** Accounts are created `photosensitive: false` and the only way to flag one is editing `users.json`. The login page reads a localStorage flag, so a flagged account is also unprotected on its very first visit from a new browser.
- **Lottery** stakes a currency that no longer exists (see above). Either wire it to points or remove it.
- **Wheel** credits nothing. Keep, re-pay in points, or remove.

## Open items
- Elysium and chess placeholder cards → **image generation** briefs.
- Elysium is short of *events*, not features (ideas below).
- OT12 payout; song-based questions; fill the thin member fields before a height question.
- A photosensitivity toggle in Settings (one-way) to give `/api/photosensitive` a caller.
- Hover sounds ride the typing channel; the settings panel has no fourth slider.
- Dead code above.

---

## Running and testing

```
npm install
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

Node 22+ (the `start` script uses `--env-file-if-exists`). Deps: `express`,
`express-session`, `bcryptjs`, `chess.js`. Env: `PORT` (3000), `DATA_DIR`
(**must** be the volume in production), `SESSION_SECRET` (optional — else a
key is generated once into `DATA_DIR/.session-secret`).

**The sandbox is wiped between sessions — reseed it.** `scratchpad/seed.js
<dir>` (gitignored, lives on disk) writes `users.json` with `hermione`
(`sandboxpass123`) and disciples `seraph` / `ranker` / `visitor1`
(`testtest123`, `flagged: true` with points so the leaderboard isn't empty)
and a pending `waiting`. Every account needs `passwordHash`, `status`,
`pronouns`, `createdAt`. Hashes use the repo's own `bcryptjs`.

- **Check for a leftover server first**: `lsof -nP -iTCP:57999 -sTCP:LISTEN`, kill the PID (`pkill` matches the shell wrapper and leaves node holding the socket). A stale server answers curl happily from old data.
- Only `server.js` changes need a restart; `public/` and `views/` serve fresh.
- `/writing`, the games and `/dashboard` need a session: log in (`POST /api/login` with a cookie jar) or `POST /api/guest` first. `/api/me` tells you who you are.
- Prefer **curl and headless Chrome** over browser-pane screenshots. `scratchpad/shot.js <url> <out.png> [w] [h] ["<js>"] [settleBefore] [settleAfter]` drives DevTools (navigate, run JS, screenshot); `public/_shot.html?u=seraph&p=testtest123&go=/chess` (or `?u=guest`) logs in first so authenticated pages can be captured. `settleBefore` must outlast the login redirect. **Its eval return value often doesn't print, and the screenshot step stalls on rAF/canvas pages** (snake, elysium, mid-boot): assert via side effects + screenshot, run it backgrounded and `pkill -f shot-chrome-`.
- The Browser pane reported a 0x0 viewport for two sessions; DOM/JSON checks through it work, layout numbers and screenshots did not. Fronting the tab matters for anything timing-based (rAF is frozen when hidden).
- `computer{type}` sends no keydown; drive typing games with synthetic `KeyboardEvent`s. Headless audio contexts stay suspended — verify the graph, not the sound.
- Mockups render off `file://`; `mockups/capture.sh [out] [batch]` regenerates `mockups/out/*.png` (not committed).

## Traps this codebase has already sprung
- **Scripted string replacements fail silently** — assert the replacement landed (`if (s === before) throw`) or grep afterwards; a "fix" commit once contained no fix.
- **`theme.js` writes `--c` inline on `<html>`**; anything setting `--c` on `<body>` breaks theming for the page.
- **CSS `zoom` does not rescale `vh`/`vw`.** The dashboard scales via root font-size.
- **SVG elements have no `hidden` or `className` IDL property** — state goes on a wrapper div.
- **`hidden` loses to an explicit `display`** — every self-contained page needs `[hidden]{display:none !important}`.
- **A `filter` on page content becomes the containing block for `position:fixed` descendants** (console and modals fly across the screen).
- **An overlay cannot avoid the background** whatever filter it carries — swap palette variables instead.
- **Anything appended inside an element a render function empties disappears mid-animation** — hang overlays on a parent that survives.
- **Vertical text is tall** — a rotated heading once grew the dashboard grid into scale-to-fit.
- **Frame-rate dependent probability** — roll on the state change, not per frame.
- **A CSS animation ending in `transform: none`** wipes a positioning transform.
- **Never transform `.dash`** — the scale-to-fit lives there.
- **nbsp in a typing box forces an unbreakable line** (horizontal scroll buried the caret); push real spaces as bare text nodes, not inside their own `<span>` (Safari).
- **An undefined CSS custom property drops the whole declaration** silently.

---

## Mockup record (`mockups/`)

| Batch | File | Status |
|---|---|---|
| Profile | `profile.html` | chosen 10 (man page), built |
| Wheel | `wheel.html` | chosen 5 (unrolled cylinder), built |
| Game select | `select.html`, `select2.html`, `gamecards.html` | wall built; per-card designs iterated in place |
| Chess | `chess.html` | chosen 9 (ink wash), built |
| T9 → Multitap | `t9.html` | fifth attempt (RAZR V3 from reference); the built game uses the flat keypad |
| Slots → Lottery | `slots.html` | chosen 5 (scratch card), built |
| Dummy Parse | `dummyparse.html` | chosen 10 (ability cards) + 11 (timeline), built |
| Decrypt | `decrypt.html` | chosen 1 (BIOS/POST), built into `boot.js` |
| Dashboard | `dashboard.html`, `dashboard2.html` | v1 rejected; v2 (occult-terminal) never picked; current dashboard is its own thing |

The brief is explicitly **not minimalism** — "as overdesigned and maximalist as
possible" — but the terminal look was lifted for chess and slots so each design
could have its own material world.

## Elysium — where it could go (brainstorm, nothing decided)
The honest problem: natural disease onset is so slow that most visits are
uneventful. Cheapest fixes first: raise baseline disease pressure (pure
tuning); **weather** drawn per season that pushes moisture/humidity/airflow
around so the right action changes week to week; let neglect leave visible
marks. Then, in rough order of value: **rings** (freeze a yearly summary,
readable from the trunk — the idea most in keeping with the game), species as
a stat-weighting table, naming the tree, a scar record, seasons that matter
(winter tells you to go away), an annual flowering gated on a healthy season,
cuttings as keepsakes rather than currency, and **Hermione's controls** in the
chess pattern (blight, drought/downpour, prune, bless, withhold the journal).
Presentation: hand-drawn art per stage/season (now a job for image
generation), a slower on-screen clock, wind tied to airflow.
