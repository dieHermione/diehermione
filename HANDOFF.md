# Handoff, angeldom.me

This is the running handoff: what is true now, what is left, and the habits that
keep this project cheap to work on.

> **Read order for the next session:** this file first, then skim `README.md`
> and `/tech` (`views/tech.html`) for architecture. **Caveat: README and /tech
> are now STALE.** They still describe the pre-redesign site (pink theme, a
> shared top nav bar on every page, a separate `/admin` page, a "Citizen" signup
> rank, "Spinning" wheel text, etc). Trust this file and the code for anything
> UI-related. A full docs pass is owed once the redesign settles.

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). Single Express
server (`server.js`), no DB, JSON files on disk, no build step. One admin
identity: `hermione`. Push after each task; the user likes frequent pushes.

---

## Where things stand now (latest big session — read this first)

A large batch of reworks landed. Current truth, superseding stale sections below:

**Login + dashboard (Cirrus, but evolved).** Background is now **blue all the
way down** (`linear-gradient(180deg,#8fd8f2,#63bde3 62%,#52aed8)`, no white at
the bottom) with the small drifting clouds; dashboard cards are translucent
white `rgba(255,255,255,0.82)`; the **login card is opaque white**. Buttons are
**flat** (solid `#35b6e6`, no gloss/shadow) to match the flat heading text; text
is the site blue `#24c5ed` (the old near-black navy is gone). Both pages
**scale/shrink to fit the viewport** rather than scrolling (dashboard uses a
`ResizeObserver` scale-to-fit leaving top/bottom margin; login uses max-height
media queries).

**Login is a card navigator** (`cardnav.js`): just two cards now, the **opaque
sign-in card** (interactive) and a **Penance game card** skinned like the game
(black/red terminal) that starts a guest session at `/writing`. Guest play moved
off the register form onto that card. On sign-in a **transition** plays then
navigates to `/dashboard` (`transitions.js`, 10 effects; default = coverflow
slide; the temporary test bar was removed).

**Dashboard specifics:** control card holds Profile + a Games dropdown
(Snake/Writing→Penance/Wheel/Deathroll/Elysium + Devotion) + Hermione links;
**no tithe for Hermione**. A **clock card** shows US Eastern time (24-hour,
EST/EDT via `Intl`) with a countdown to the **6am** daily reset. Balance card
shows **points and angelcoins** (both blue). **Account age** ("Member for N
days", from `createdAt` now in `/api/me`). The dailies card doubles as a generic
scrolling panel; on Hermione it is the **admin panel** (approvals, per-account
points + leaderboard listing, **Lines completed** list that opens a Penance-style
result modal, and a Documentation section).

**Subliminals (`glitch.js`)**: shared overlay, dashboard has a test dropdown +
Flash. Message flashes **full-screen, no transforms/tilt/movement**, sized to
the edges; on narrow/portrait screens a phrase breaks one-word-per-line. Ten
flash rhythms. No random trigger yet.

**Top pill nav is gone site-wide.** `nav.js` now injects only an Elysium-style
**back-to-dashboard button** (top-left chevron) on `has-top-nav` pages, and the
dark/light toggle is fully removed.

**Penance (was "Writing"), `views/writing.html`, route `/writing`.** Terminal
game: boot (`angelOS`) → selection (repetitions / difficulty / your own lines)
→ typing that **corrupts** (black/red, in-game glitch hooked into the game, hex
noise, chromatic split) with difficulty and mistakes; **merciless** sends you to
the line start on a slip. Synthesised **old-keyboard typing clicks** and a
**harshening ambience**. Results log via `/api/writing/complete`. **Devotion** is
the gentle sibling (`/writing?mode=devotion`, own Games entry): same code, "penance"
→ "devotion" everywhere, **preset line-sets** (defaults in-file, Hermione-editable
still TODO), no difficulty, feeds the dailies. No more Restart/Abandon; no
category box (top-left just shows the mode).

**Elysium (`views/elysium.html`)**: the **drawn tree was removed** — text-only
now (canopy state moved into inspect text); stats are all **white/lowercase**;
the event toast floats **down from above**; a **back button** + `Version 0.01`.
Trees **start damaged** (nurse them back) and growth is **tripled**.

**Profiles (`views/profile.html`)**: admin panel **removed** (admin is
dashboard-only now), **guestbook removed** (server routes + UI), lightmode
toggle gone, and it uses the login/dashboard blue background, top-aligned.

**Deprecated / removed:** task assignment, guestbook, the light/dark toggle, the
top pill nav, the site-preview login card.

---

## The redesign in progress (most important context)

The site is being **re-skinned page by page** into new, self-contained looks.
The user's words: "we will be replacing all pages with new designs, and the
aesthetic does not need to match between them." So the codebase is currently a
**mix of old and new**:

- **Old shared shell** still drives most pages (profile, tasks, task, snake,
  wheel, writing, deathroll, chess, guide, tech, cardnav). These use
  `public/site.css` + `nav.js` (the top pill nav + dark toggle) +
  `notifications.js`, and the theme colour is now **sky cyan `#24c5ed`** (a
  global find/replace swapped the old pink `#FBC3D3` / `#f7b8c8` /
  `rgba(251,195,211,*)`). Dark mode (greyscale) still exists on these pages.
- **New per-page designs** (no shared shell conventions): the **dashboard** and
  **login** are now the "Cirrus" sky theme; the **tree game** ("Elysium") is a
  realism look. See below.

### Design decisions locked in
- **Dashboard + login = "Cirrus"** (soft sky gradient `linear-gradient(180deg,
  #8fd8f2, #e8f6fd)`, glassy translucent cards, Quicksand font, drifting looping
  clouds, buttons a light sky-blue gradient). Both share the cloud background so
  they read as one family.
- The login header is the bubbly **Quicksand** wordmark with a **white neon
  glow + white halo** (inner and outer glow). Keep it as-is if you touch login.
- **Tree game = realism** (real forest photo, no relation to Cirrus).

### Dashboard specifics (`public/dashboard.html`, rewritten this session)
- **No top nav bar, no dark toggle** on the dashboard. Navigation, the tithe/
  Hermione actions, and the **notifications bell** were folded into the page.
- Layout is a hero grid: full-width welcome hero (`grid-area hero`), then Balance
  + an actions/"control" panel, then Dailies (wide) + Leaderboard.
- The **bell** lives in the hero's top-right. `notifications.js` was taught to
  mount its bell into an element with `id="notif-slot"` when there is no
  `.top-nav .nav-links` (that is the hook; the dashboard puts `#notif-slot` in
  the hero).
- The **control panel** (formerly labelled "Devotions", label removed) holds the
  nav links (Profile / Tasks / Games dropdown), the tithe + Hermione's-profile
  buttons, restyled as light pills.
- **Tithe is one button now.** First press of the day reads **"Tithe"**; after
  tithing it reads **"Tithed today"** (still clickable, not greyed) and reveals
  **"Tithe again"** on hover. Only the in-the-red state disables it. The tithe/
  check-in message auto-hides after ~4s.
- **Points panel** shows just the number + "points · <rank>" (no "Balance"
  label, no "rank" prefix). **Hermione gets fake placeholders** on her dashboard
  (points "∞" and a decorative "Tithed today") so it does not look half-empty;
  to be replaced later.
- **Fluid width:** `.dash { width: min(2400px, 94vw) }` so cards reach near the
  screen edges at any size (the user is on a wide monitor).
- All the dashboard blues (buttons, daily payout pills, checkmark, mini-bar,
  section labels) share a lighter `--button-bg: #6fd5f0` overridden on the body.

---

## The card navigator (`public/cardnav.js`) - the reusable nav primitive

A self-injecting, reusable horizontal "coverflow" strip. The plan is to use it
widely (games nav, a login carousel, maybe admin). Demo page at **`/cardnav`**
(`views/cardnav.html`), reachable from the profile Admin tab's Documentation card.

- `CardNav.mount(el, { type:"normal"|"wide", start, cards:[{label, sub, href|onSelect, type}] })`.
- Focused card centred with a sky glow; neighbours fan out. Shows **7 cards**
  (3 each side). Tilt faces **outward** (convex). **Wraps around endlessly** (last
  card links to first; a card crossing the seam teleports without a transition).
- Spacing is **responsive** (`~0.15 * container width`) so the outermost cards
  reach near the strip edges at any width. **Wide cards** can be mixed into a
  normal strip; spacing widens around them.
- Input when hovered or focused: Left/A, Right/D to move, Space/Enter to open,
  trackpad horizontal wheel to scroll (suppresses browser back/forward). With two
  strips on a page, the **hovered** one takes the keyboard.
- **NOT done:** mobile **touch** swipe controls, and a later refinement the user
  asked for (tilt even more for a "cylinder rotating around a point behind the
  cards"; make farthest-card spacing perfectly regular; a **wide card should
  count as two normal cards** for spacing).

---

## Accounts: Sub / Visitor / Guest (new this session)

Registration offers three choices (`public/index.html` role toggle):
- **Sub**: a normal account. "Sub" is only the **registration label**; the stored
  rank defaults to **"Servant"** (lowest ladder rank). Gains/loses points, has
  dailies + tithe.
- **Visitor**: a persistent account **outside the economy**. No check-in points,
  no dailies, no tithe, games award no points, but stats/progress still accrue.
  `/api/me` reports `noEconomy:true`; `rankFor` = "Visitor".
- **Guest**: selecting it **greys out the account fields** and starts an
  **ephemeral session** ("Continue as guest") via `POST /api/guest`, no account
  stored. Guests can open the single-player game pages (snake/wheel/writing via
  `requirePlayer`) but are redirected from the dashboard/profile/tasks and
  multiplayer (chess/deathroll), and earn nothing. `nav.js` hides account links,
  locks multiplayer, and adds a "Sign in" link for a guest (`d.guest`).

Rank system (`server.js`): `RANK_LADDER` = Princess, ??, Disciple, Worshipper,
Devoted, Follower, Servant. `SIGNUP_RANKS = ["Visitor","Sub"]` (label only).
Registration maps Sub -> "Servant". `RANK_OPTIONS` no longer contains "Sub".
`LEGACY_RANKS` maps `sub`/`citizen` -> "Servant". Profile rank picker lists the
ladder + Visitor.

---

## Admin (SUPERSEDED — admin is now the dashboard panel, not the profile)

The whole admin panel moved into an **"Admin" tab** on `/profile`, shown only
when Hermione views her own profile. `views/admin.html` was deleted; `/admin`
now redirects (Hermione -> `/profile`, others -> `/dashboard`); the Admin nav
link is removed. The admin CSS is scoped under `#admin-view` (native nesting) and
the admin JS runs lazily in `initAdmin()` on first tab open, so it never runs for
non-admins. The old iframe embed is gone (that also fixed the embed-background
mismatch). Admin tweaks that landed: Listed pill is itself the toggle, custom
points open in a styled popover, the Assigned list collapses, "Writing results"
-> "Lines Completed", review button -> "Accept".

---

## Elysium, the tree-care game (`/elysium`, `views/elysium.html`)

**Now a real, playable, account-bound game** (was a visual demo). Renamed from
"Tree" to **Elysium** everywhere: route is `/elysium` (`/tree` 302-redirects for
back-compat), file is `views/elysium.html`, and it is in the Games dropdown
(`nav.js` GAMES + the dashboard control-card menu).

### Engine (`elysium-engine.js`, server-side, CommonJS)
Pure module, unit-testable with plain `node -e`. **Server-authoritative and
time-based:** state carries a `lastTick` and `simulate(state, now)` walks the
tree forward in **1-hour ticks** (capped at ~45 days of catch-up), so a tree
lives while you are away and **every browser on the account agrees** (this is
also why the old cross-window issues do not apply to game state). Implements the
MVP from the mechanics brief: health, resilience, soil moisture, humidity,
airflow, nutrients, leaf wetness, wound load, hidden per-family **disease
pressure incubators**, growth-by-time (6 stages, `STAGE_GROWTH` checkpoints,
gated on health >= 55 and no critical disease), 3 diseases (**root rot, powdery
mildew, canker**) each moving through **Latent -> Symptomatic -> Active ->
Critical** and **receding a stage at a time when the cause is corrected** (never
destroyed), zone model (roots/trunk/branches/crown/leaves) with adjacency
spread, a **journal**, seasons from the real month, and gradual **inspection**
(names a disease only after enough looking). Actions have real tradeoffs (Water
can waterlog, Mist feeds fungus, Trim wounds + raises airflow, Fertilize has a
cooldown and hurts rot, Inspect reveals clues). `publicView` hides raw numbers
(coarse bands + concern + "next attention"); `debugView` exposes everything.

### Server routes (in `server.js`)
`/elysium` (page, requireLogin), `/tree` -> redirect. `GET /api/elysium`
(simulate + publicView + `isAdmin`), `POST /api/elysium/action {action}`,
and **admin-only** `GET|POST /api/elysium/debug` (full state + `cmd`/`args`
ops: advance, grow, setStage, set, damageZone, spawn, cure, heal, reset). State
persists in **`elysium.json`** keyed by username (gitignored, like games.json).

### Frontend (`views/elysium.html`, full rewrite)
- **Background** is the new misty-clearing photo, served **responsively**: JS
  picks the smallest of `tree-bg-{1366,1920,2560,3840}.jpg` that covers the
  display's true pixel width (falls back to full `tree-background.jpg`). Those
  scaled variants live in `public/` and were made with `sips -Z`.
- **Rain** is now a fast diagonal-streak **canvas** (replaced the slow droplets).
  Synth-rain **audio** is unchanged.
- **Audio controls, top-right:** a **music-note** and a **speaker** icon (SVG).
  Muted = struck through; hover lifts them (like the care buttons) and reveals a
  **vertical volume slider**. State (both mutes + both volumes) is the single
  source of truth in **localStorage**, re-applied on `focus`/`visibilitychange`/
  `storage` so multiple windows sharing an audio pool stay consistent.
- **Realistic tree:** procedural recursive branch skeleton (bent limbs, root
  flare, stable per stage via a seeded RNG) with muted, textured foliage clumps
  that sit inside the misty scene. Reacts to stage (size), zone health (bare
  patches, browning), and disease (canker patch on bark, pale mildew film).
- **Minimalist title:** lowercase wide-tracked sans "elysium" (was serif Cormorant).
- **Slide panels:** a left **Guide** (loop + actions, diseases hinted not spoiled)
  and a right **admin-only Debug** console (time/growth, stat sliders, damage a
  zone, spawn/cure disease, heal, reset). Glassy translucent styling, edge tabs.
- Top-left status readout (condition/soil/humidity/airflow/nutrients/concern/
  next), a growth bar, and a **Journal** modal. Care buttons POST actions and
  float a feedback toast.
- Music credit line ("Gymnopédie No. 1 by Kevin MacLeod, CC BY 3.0") is in the
  Guide panel.

**Still open on Elysium:** natural disease onset is deliberately slow (patient
by design; use the debug console to force states); tree art is procedural, not
hand-drawn; no tree-specific dailies yet; no site-points hookup (intentional).

---

## Currency & dailies (unchanged mechanics, some copy/number changes)

- Points are the only currency. Earned: 5 check-in; Snake 1/food (no cap) + 10
  bonus at 20/day; wheel 1-10; **"Write for Princess" now pays 50** on the first
  writing series of the day (`WRITING_DAILY_POINTS = 50`).
- **Tithe repeats are allowed** now (the once-a-day server lockout was removed;
  being in the red still blocks it). `settleTithe()` still docks 25 for a missed
  day.
- Everything daily resets at **noon America/New_York** via `todayKey()`. Compute
  day keys no other way.

## Guestbook (SUPERSEDED — guestbook was removed entirely)
One reply per comment, by the profile owner or Hermione (no chains). Server
routes `POST|DELETE /api/profile/:name/guestbook/:id/reply`; GET returns
`reply` + `canReply` per entry.

## Other copy/behaviour changes that landed this session
Wheel: "Spinning" text removed, spin+payout run 10s longer (14.2s). Registration
copy (Visitor/Sub tooltips, trimmed intro, "invite only" line). Snake daily reads
"0/20 until complete". task.html: removed "Start this line again"; hand-in note
is "Submitted to Hermione." **Notice/error boxes are outline-only now** (no fill)
site-wide (login error, check-in notice, form errors, task done/sent-back,
writing error).

---

## How to test (sandbox is EPHEMERAL, reseed each session)

The sandbox does **not** persist between sessions (it lives in the session
scratchpad). Recreate it: write a seed script that hashes with the repo's
`node_modules/bcryptjs` and writes `users.json` into a fresh `<scratch>/sandbox`,
then run:

```
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

Seed `hermione` (Princess, `sandboxpass123`), a couple of approved subs +
a Visitor (`testtest123`), and one `status:"pending"` user. Sessions are
in-memory, so a server restart signs everyone out and you re-login. **Static
files (public/, views sent via sendFile) serve fresh with no restart; only
`server.js` changes need a restart.**

Prefer curl / `javascript_tool` DOM+JSON checks over screenshots (screenshots are
the biggest token cost). The browser pane sometimes crops wide viewports in the
screenshot; trust `getBoundingClientRect()` metrics over the image for widths.
`computer{type}` sends no keydown; drive the typing games with synthetic
`KeyboardEvent`s. External images/audio load fine in the pane; audio does not
audibly play there, so verify audio via `music.paused`/`currentTime` and console,
not by ear.

**Rendering mockups:** the "10 header ideas / 10 chess / 20 dashboard / 20 login"
mockup batches were built as a parameterised `?d=N` HTML in `public/` and captured
with **headless Chrome** (`/Applications/Google Chrome.app/... --headless=new
--screenshot --window-size=1280,760 "http://localhost:57999/_x.html?d=N"`), then
deleted from the repo. Reuse that pattern for design options.

---

## Recurring traps

- **`hidden` loses to `display`.** Fixed globally with `[hidden]{display:none
  !important}` in site.css.
- **CSS animation `transform` clobbers a positioning `transform`.** A `fade-up`
  keyframe ending in `transform: none` wiped a `translateX(-50%)` centering and
  shoved an element off-centre. Centre with `left:0;right:0;justify-content` or a
  wrapper, not a transform, if the element also animates.
- **`crossorigin="anonymous"` on `<audio>`** makes playback require CORS headers
  the host may not send; drop it for plain streaming.
- **Hover-revealed controls need a transparent `::after`/`::before` bridge** or
  `:hover` drops mid-travel.
- **One `/api/me` per page** via `siteMe()`; independent callers race the daily
  check-in.
- **Bulk edits:** Python with explicit string replacement, report unrecognised
  matches, grep-count afterwards.
- **No em dashes anywhere** (user preference).
- **Verify deploys.** Push can land on GitHub while Railway lags. Confirm a live
  static asset (e.g. curl `angeldom.me/dashboard.html` for a new marker).

---

## Pending / roadmap (current)

**Next up — mockups (explicitly deferred to last, do these once fixes settle):**
- **Snake / Deathroll / Wheel: 10 maximalist mockups each** to match the newer
  (Penance/Elysium/terminal) look before implementing. Snake should stretch the
  **full window** (not the tiny box it lives in now); Deathroll keeps
  player/enemy cards. Go maximalist, not the calm Cirrus theme.
- **Re-output the not-yet-implemented mockups for selection** — the maximalist
  game-selection screens (the last batch of 5 concepts: film projector, tarot
  fan, turntable, poster wall, corridor of doors — the user wanted "more
  creative/maximalist"; earlier 20-uniform and 5-concept batches were rejected/
  parked). No game-selection screen is implemented yet; it is still mockups only.

**Smaller follow-ups noted during the big session:**
- **Devotion presets should be Hermione-editable** (currently default line-sets
  hardcoded in `views/writing.html`); needs server storage + an admin editor.
- **Devotion "must complete 50" daily nuance** — right now finishing any series
  counts toward the writing daily; the 50-line requirement isn't enforced.
- **Chess** is still wired but unlinked and not redesigned (mockups never picked).
- **Docs pass:** README.md + `/tech` are still stale (see top).
- Sandbox seed users lack `createdAt`, so profiles/dashboard show "Invalid
  Date / NaN days" locally; real accounts have it. Harmless, sandbox-only.

## Older open items still unverified
- Windows tofu fix on the login bows (the login header no longer uses the bows,
  so this may be moot there, but check other pages).
- `lestbrump`, an unexplained account that was once in local data.
