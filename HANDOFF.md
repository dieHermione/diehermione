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

## Where things stand now (latest big session - read this first)

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

**Elysium (`views/elysium.html`)**: the **drawn tree was removed** - text-only
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

## Admin (SUPERSEDED - admin is now the dashboard panel, not the profile)

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

## Guestbook (SUPERSEDED - guestbook was removed entirely)
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

### The big pass (user's list, 2026-07-28). Ordering note
The user handed over a ~40 item list in one go. Item 1 below is done and pushed
(`f495de5`); everything under "Still queued" is untouched. The list mixes small
copy fixes, eight separate mockup batches, and several substantial features, so
it is split by size rather than by the order it was dictated in.

**Standing instruction for every mockup from here on:** the terminal aesthetic
stays, but do **not** read it as minimalism. Maximalist and overdesigned is
wanted. (Locked-in choices recorded further down predate this instruction and
should be re-read in that light.)

### Landed 2026-07-28 (commit f495de5)
Dashboard: tithe button removed (deprecating the idea; `/api/tithe` still exists
server-side, unused), "vessel" balance heading removed, "Hermione's profile" ->
"Hermione", log-out button added, per-game hover text added, "Resets at noon
Eastern." line removed (clock card covers it, and it is 6am now), card-nav demo
dropped from Documentation, admin panel heading collapses the panel.
Dailies: "Snake earnings" -> "Snake"; Devotion daily reads "Complete 50 lines in
Devotion" with no trailing x/y. A daily carrying its own `detail` now keeps it;
the x/y readout is only the fallback for dailies with no wording (Snake still
shows "0/20 until complete").
Snake: pure black, more saturated/darker red, bolder text, ~2.9x arena (cell
36px -> 21px at 1280x720), smaller snake/food, tick 120ms -> 80ms, "Serpent"
title and "feed the serpent" gone.
Penance: red `#cf3730` -> `#c11208` (more vibrant, darker), chromatic-split
glitch lost its blue ghost (now deep red `#8a0f07`), corruption static roughly
halved (base 0.045 -> 0.022, ramp 0.11 -> 0.05). Devotion still pinned blue.
Elysium: fertilize button shows hours left on cooldown.
Also: deathroll pure black; back button lost its white plate and now inherits
the page colour (`nav.js`; Elysium has its own `.backbtn`, untouched);
notification sound is a synthesised low bell, not a meow; login decrypt
animation 2200ms -> 5200ms (hold 420 -> 750); subliminals use IBM Plex Mono
(dashboard now loads weight 700); registration says "virtual angel".

**Bug fixed in passing:** `elysium-engine.js` read the fertilize cooldown stamp
as `state.actions.fertilize || -999`, so tick `0` counted as "never fed" and a
fresh tree could be fertilized every tick. Now `??` via a shared
`fertilizeLeft(state)` helper used by the action and both view fields.

### Landed 2026-07-28, second pass (all ten features)
Every feature from the big pass is now in. Commits `86b6747`, `ae906f6`,
`e58d3d1`, `e26bd0a`, `641008e`, `b44a4bb`.

- **Subliminals.** Cut to the four rhythms that were 1/3/5/7, picked at random.
  All timing runs through `at()`, which multiplies by `SPEED = 0.5`, so the
  system is halved in one place. `startRandom()` reschedules itself one gap at
  a time (5 to 30 min) and skips hidden tabs. Messages are server-stored in
  `subliminal.json` (gitignored): `GET /api/subliminal` for any player, `POST`
  admin only. The test dropdown moved from the control card, where every user
  could see it, into the admin panel.
- **Photosensitivity.** Registration demands an explicit yes/no, stored on the
  account, reported by `/api/me`. A flagged account gets `setEnabled(false)` on
  both the subliminal and glitch systems. The login page runs before we know
  who the visitor is, so it trusts a flag cached in `localStorage` on the last
  signed-in visit. **Gap: a flagged account is unprotected on the first visit
  from a new browser.** Guests are not asked, so they default to effects on.
  There is also no way to change the answer after registering.
- **Screen glitch** (`public/dashglitch.js`): eight effects (tear bands, red
  shift, scan roll, chroma bleed, vertical hold, block corruption, static
  burst, signal loss), dropdown in the admin panel, one at random every 40 to
  180 seconds. **Two rules are load-bearing and documented in the file: never
  put a `filter` on page content** (a filtered ancestor becomes the containing
  block for `position:fixed` descendants and throws the console/scanlines/
  modals around) **and never transform `.dash`** (scale-to-fit lives there).
  Effects use `backdrop-filter` overlays, palette vars and a body offset.
- **Snake subliminals**: `Subliminal.blip()`, one short flash, fired when the
  food escapes, rate limited to one per 2.5s, own taunt pool.
- **Wheel**: points to angelcoins, 10 to 30 outcomes, 1 to 200 biased low
  (weights sum to 1000, so 1 is 20%, 200 is 0.1%, 61% pay 5 or less, mean 9.5).
  Segment field is `coins`, not `points`. Wheel UI otherwise untouched pending
  its reskin.
- **Update notice** (`public/updatecheck.js`): `BUILD_ID` stamped at boot,
  `GET /api/version` unauthenticated, pages poll every 90s and on regaining
  visibility, then offer a reload. Assumes a single instance.
- **Console** (`public/console.js`): `` ` ``/`~` slides it down, Esc closes.
  On all fourteen signed-in pages, **not** on login. Themes itself from the
  page's own custom properties. Swallows keystrokes in the capture phase so
  the typing games do not also receive them. `CODES` maps a string to a
  function; six placeholders exist and **the real secret codes still need
  inventing.**
- **Ambience** (`public/ambience.js`): fluorescent hum (120Hz mains buzz,
  harmonics, ballast hiss, slow LFO, periodic flicker) plus the Penance key
  click on any text field. Starts on first gesture; mute toggle bottom right,
  remembered in localStorage.
- **Guests**: transient names (`guest1`, `guest2`, ...) from an in-memory
  registry, reclaimed after 3h of silence along with their games. `playerId()`
  gives chess and deathroll one identity to file games under. Both games now
  accept guests, and Hermione's opponent list includes live guests. New
  `/guest` landing page.
- **Snake**: free circular movement, no grid, no self-collision, one tapered
  body drawn from the trail. **There is now no way to lose** (walls wrap,
  nothing else kills), so `gameOver()` is gone. Ask the user whether walls
  should become lethal. Geometry covered by 13 Node checks.

**Testing note worth keeping:** the Browser pane usually runs as a *hidden*
tab, where `requestAnimationFrame` never fires and `setTimeout` is clamped to
~1s. That makes canvas games look broken and makes any timing measurement
meaningless. Call `tabs_select` to front the tab first, and do the whole
measurement inside a single `javascript_tool` call, because it can go hidden
again between calls. For durations, wrap `setTimeout` and record the delays
asked for rather than timing them.

### Landed 2026-07-29 (audio, settings, console, mockups)

**Audio is now one bus** (`public/audio.js`). One AudioContext, one gain node per
channel (`music` / `ambience` / `typing`), settings in a single localStorage key
(`angeldom-audio`) so every page and tab agrees, kept in sync by a `storage`
event. **All channels default to 0.5**, half the old level; per-sound gains were
left alone and the channel gain scales them. Mute writes `gain.value` directly
with **no ramp**.

**Duplicate audio across tabs** (Zen split view): continuous sound takes a lock
over `BroadcastChannel("angeldom-audio-lock")`; only the holder plays it.
Verified with two tabs both reporting visible: exactly one held the lock.

**Ambience** rebuilt on the bus. Hum runs only in the lock-holding tab. Key
clicks now fire on **every** keystroke, not only in text fields. A hover blip
plays when the pointer first enters an interactive element (rides the *typing*
channel, since the settings panel only has three audio categories).

**Settings panel** on the dashboard between the games and Log out: subliminals
toggle + volume/mute for music, ambience, typing. Flashing needs **both** a
non-photosensitive account **and** the toggle on.

**Elysium honours it without being owned by it.** `seedFromSite()` copies the
bus state into Elysium's own state on load **and calls `save()`** - that write
is load-bearing, because the `focus`/`visibilitychange`/`storage` re-sync
reloads `elysium.audio` and would otherwise put the old local values straight
back over the seed. Elysium's own controls change that visit only and never
write back to the bus. Verified: site music muted -> Elysium opens muted ->
local unmute works -> bus still muted.

**Boot/decrypt SFX** (`boot.js`): a drone climbing under the sequence, a tick
per resolved glyph, two low tones on resolve. On the *typing* channel.

**Collapse**: admin panel and leaderboard fold to the **right** (card shrinks to
a spine, its grid column gives the space back); admin sub-sections fold upwards
independently.

**Console**: header is `angelOS // console`. `wing add_points <user> <n>` works,
admin-gated. **"Rejected." is reserved for a real command the caller may not
run**; anything unknown is "Command not recognized."

**Devotion presets**: Remove now writes through immediately. The old behaviour
(drop the row, wait for a separate Save) is what made removal look broken.
Removing the last preset is refused and rolled back.

**Snake**: pause button (also P / Space), speed doubled to 380px/s, taunt on
every food escape. Pausing does not bank time, so unpausing cannot jump it.

**Screen glitch**: everything except tear bands was scrapped and retried. The
new five punch out or over-drive the page in place rather than shifting or
recolouring it: dropout, bloom, contrast crush, comb, edge burn.

### Mockups: all eight batches exist, none chosen
Untracked parameterised files in `public/` (gitignored, never deploy):
`_profile.html?d=1-5`, `_wheel.html?d=1-5`, `_select.html?d=1-4`,
`_chess.html?d=1-4`, `_games.html?g=t9|skill|summary|slots&d=1-3`.
Capture with headless Chrome at 1500x900. **Nothing is wired; no direction has
been picked.** Delete these once choices are locked.

### Landed 2026-07-29, later (tithe removal + Dummy Parse)

**Tithe was only half removed, and it was still live.** The button came off the
dashboard, but `settleTithe()` still ran on login and on every `/api/me`, so
accounts were quietly being docked 25 points a day and told so. The "You did
not tithe" notification was **not** a stale leftover. Gone now: the penalty,
`/api/tithe`, and the `tithedToday` field. `clearTitheLeftovers()` sweeps the
`tithe-miss` notification and the `tithedOn`/`titheCheckedOn` fields off each
account the next time it loads.

**Snake escape roll was frame-rate dependent.** It rolled once per frame at
`teleportChance * dt * 6`; when speed doubled to 380px/s the head crossed the
flee radius in about four frames, so the food escaped ~31% of the time instead
of 90%. Now **one roll as the head crosses into range**, re-arming on exit, so
the rate is exactly `teleportChance` regardless of speed or frame rate
(simulated: 89.9% over 20k approaches). The blip was also being halved by the
subliminal `SPEED` to ~75ms; it is now exempt and runs 190ms.

### NEW GAME: Dummy Parse (`views/dummyparse.html`, `/dummyparse`)
A real-time single-target damage sim. No player movement, no player health, no
boss mechanics, no multiplayer. **Built in one pass, no mockup: a redesign is
expected later.**

- **Stats** all use one curve: `value = max * p / (p + K)`. Strictly
  diminishing, cap is approached but never reached, so **stacking one stat is
  always worse than spreading**. 100 points, saved per browser, locked during
  combat.
- **GCD** is 1.5s scaled by Haste and **starts when a cast begins**, so a cast
  at or above the GCD hides it and only instants/short casts wait.
- Abilities are **hitscan** (land at cast end) or **projectiles** (land on
  arrival). Crits are 2x + Critical Damage. **Fracture** rolls on direct hits,
  stacks to 5, consumed whole by the next ability.
- **Priest**, 10 abilities on `1-5 q e r f g`. Divine Flame is the stacking DoT
  (cap 15, 2s ticks). Brand banks half of window damage and detonates for half
  of that. Timeturn and Temporal Mark both reduce **remaining** cooldown time,
  not cooldown length.
- Parses POST to `/api/parse` and are stored whole in `parses.json`
  (gitignored) with the event list, so a leaderboard can be built off `dps`
  later. `GET /api/parses` returns summaries only.

**Gaps filled because the brief left them open:** ability 9 had no name and is
now **Vigil**; Rewind and Timeturn had no cooldown and got 60s and 30s; mana
costs and a pool exist because Focus governs mana regen. **The brief opens with
Arcane Mage as the reference but names Priest as the first class**, and every
ability is Priest-flavoured, so Priest is what is built.

### Landed 2026-07-29, later still (profile + Dummy Parse rebuilds)

**Profile is the man page** (mockup 10). `views/profile.html` was rewritten as
the account's own entry in the angeldom manual: NAME with a square portrait,
SYNOPSIS, DESCRIPTION, COUNTERS, EXIT STATUS, and a SEE ALSO row that carries
the real controls (edit, logout, hermione, dashboard). It is self-contained and
no longer loads `site.css`; the shared-shell variables (`--panel-bg`,
`--table-border`, `--button-bg` and the rest) are **remapped locally** onto the
terminal palette so the `ranks.js` ladder modal matches the page. The page
carries its own `[hidden]{display:none !important}`, since that rule used to
come from site.css.

Dropped with the old page, all already dead: the guestbook loader, the
never-called `initAdmin()` block, `?embed=1` mode, the dark-mode overrides.

**COUNTERS needed real data**, so `server.js` grew `writingCounters(user)`:
`/api/profile/:username` now reports `angelcoins` plus `linesCompleted`,
`penanceSeries` and `devotionSeries`. Accounts predating the counters are
seeded once from their capped `writingLog`, and the seeding runs **before** the
new entry joins the log in `/api/writing/complete`, or a series would count
twice.

**Dummy Parse is mockup 10** ("big ability cards") **with three tabs**. Parse:
arena with the cast bar and resources floated at its foot, a 5x2 deck of cards
with key, name, cost and description, meter down the right. Build: the stat
allocation given room, with a resulting-numbers panel; the meter keeps a
one-line copy of the build so it stays readable mid-fight. Rotation: mockup 11.

**The rotation timeline draws the real rotation, not a plan.** Design 11 said
"planned rotation" and there is no planner, so the tab shows what was actually
cast: one lane per ability, casts over their own hatched cooldown, the global
cooldown on a thin lane of its own, a now marker, and a follow-last-30s /
fit-whole-parse toggle. **Cooldown bars come from `S.cdlog`, not `S.cd`**,
because `S.cd` only remembers the current end; keeping a bar "open" until it
expires is what makes Timeturn, Temporal Mark and Rewind visibly shorten it.

**Testing note that saved real time:** `scratchpad/shot.js` drives headless
Chrome over the DevTools protocol, so an authenticated page can be screenshotted
*and* interacted with first (`node shot.js <url> <out.png> [w] [h] [js]`). Pair
it with an untracked `public/_shot.html` that logs in and redirects, since
`.gitignore` already covers `public/_*.html`. The Browser pane reported a 0x0
viewport this whole session even after `tabs_select`, so every layout check went
through headless Chrome instead.

### Mockup picks so far
**Chosen and built:** Profile **10** (man page), Dummy Parse **10** (big ability
cards) plus the **11** rotation timeline as a tab.
**Chosen, not built yet:** Wheel **5** (unrolled cylinder), Game select **2**
(paste-up), Skill check **1** (pure dial), Summary **1** (source + entry).
**Third attempts, awaiting a pick:** Chess (10), T9 (6), Slots (6).

The **terminal restriction is lifted for chess and slots** (the user's call on
2026-07-29: both earlier batches were "the same design again"), so those two are
now ten and six different material worlds. T9 was rejected for resembling a
calculator, so the third attempt builds specific real handsets: a Razr V3, a
Nokia-style brick, a Y2K gloss flip, a slider, a joystick candybar and a rugged
site phone. The four minigames were only sharing `_games.html` for capture
convenience; **that file is deleted and they must stay separate.**

### Still queued from the big pass

**Mockups only (nothing wired). Eight batches:**
1. **Profile reskin**, 5 mockups, dark terminal theme.
2. **Wheel reskin**, 5 mockups, terminal. Previous wheel mockups are discarded.
   Try a **horizontal scroll** animation instead of a wheel.
3. **Game selection**, re-mockup. Keep the poster-board idea but theme it far
   harder around the terminal aesthetic.
4. **Chess**, with Hermione-only controls designed in but not exposed to the
   other player: delete an opponent's piece (her turn only, with an animation)
   and rewind the game state (with an animation). More controls may be added.
5. **T9 flip phone typing game.** Skeuomorphic flip phone. Keys 1-9 on both the
   number row and numpad; press a key one/two/three times to pick its letter,
   0 for space, Back to delete.
6. **Dead by Daylight skill check.** Indicator travels a circle, player hits the
   key while it is in the good zone; early, late, or missed all fail. N reps.
   Size and position of each check random, sound on spawn, random gap between
   checks so the player cannot relax, and the required key is random and shown
   on the rotating element (Space, 1 2 3 4 5, q e r g f).
7. **Summary game.** Pick a random topic (historical event, real-world object,
   fictional character), pull source text from somewhere public like Wikipedia,
   show it, player summarises in a set number of words.
8. **Slots.** Generic for now; custom symbol art comes later. Uses angelcoins.

### Older entries below

### Landed in an earlier session
- **Penance dark-red reskin.** Penance rests on a dark-red terminal palette and
  corrupts toward hotter red; Devotion is pinned blue (`corruption()` returns 0)
  and never leaves it. Mode set pre-paint via `data-mode` on `<html>` (no flash).
  Green `OK/READY` is now white in both modes. (`views/writing.html`)
- **Dashboard admin panel fix + size revert.** `buildAdminPanel()` called an
  undefined `mk()` helper and threw before appending, so the panel rendered
  empty; `mk()` is now defined. Panel body capped at a fixed `18rem` (was
  `min(60vh,32rem)`) so a long admin list scrolls internally instead of tripping
  the scale-to-fit shrink. "Member for N days" moved inline after the greeting.
- **Devotion 50-line daily** wired to the dailies panel with a progress bar. Only
  Devotion series count (Penance is logged but does not feed it); reward pays out
  once when the day's running total first crosses 50. `DEVOTION_DAILY_TARGET=50`;
  tracked via `user.devotionDay`/`user.devotionCount`.
- **Devotion presets are Hermione-editable.** Server-stored in `devotion.json`
  (gitignored). A preset is `{id,name,lines}`: `lines[0]` is always typed first,
  `lines[1..]` are the shuffle pool (randomised each cycle, no immediate repeat).
  `GET /api/devotion/presets` (any player), `POST` (admin only). Default seeded
  with the new line set (first line "Hermione is my guardian angel."). Editor
  lives in the dashboard admin panel; the game builds the sequence client-side.

### Mockups produced, awaiting selection (still mockups only - nothing wired)
All built as parameterised `?d=N` files in `public/` (`_snake`, `_deathroll`,
`_wheel`, `_select`, `_auth`, `_boot`, `_dash`) and captured with headless Chrome.
**These `_*.html` files are untracked (won't deploy); delete once directions are
locked.**
- **Game reskins** - 10 maximalist concepts each for Snake (full-window),
  Deathroll (player/enemy cards), Wheel; plus 5 game-selection concepts (film
  projector, tarot fan, turntable, poster wall, corridor).
- **Terminal-blue redesign** (black / baby-blue) - 6 login/registration concepts,
  3 loading/boot animations (Penance-style scroll, blue), 6 dashboard concepts.

### LOCKED-IN mockup choices (implement later, not yet built)
- **Snake → Blood Ritual** (concept 2: dark-red terminal, corrupting).
- **Deathroll → Blood Ritual** (concept 2).
- **Wheel → Blood Ritual but in BLUE** (baby-blue, to match the Devotion/login
  terminal theme - not red).
- **Game selection → Poster wall** (`_select.html?d=4`), BUT replace the flat
  single-colour + name posters with cards styled like the **current login
  offline-mode cards** (the game-preview cards on the login card-navigator, e.g.
  the black/red Penance guest card) - each poster is a mini game-styled card.

### Still open
- **Chess** is still wired but unlinked and not redesigned.
- **Docs pass:** README.md + `/tech` are still stale (see top).
- Sandbox seed users need `passwordHash` (not `password`), `status:"approved"`,
  `pronouns`, and `createdAt`; without `createdAt` profiles show "NaN days"
  locally. Reseed each session (sandbox is ephemeral).

## Older open items still unverified
- Windows tofu fix on the login bows (the login header no longer uses the bows,
  so this may be moot there, but check other pages).
- `lestbrump`, an unexplained account that was once in local data.
