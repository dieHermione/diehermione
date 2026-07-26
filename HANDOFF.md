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

## Admin is now on Hermione's profile (the /admin page is gone)

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

## Elysium, the tree-care game demo (`/tree`, `views/tree.html`)

**Visual/audio demo only, no mechanics.** Persistent account-bound game later:
grow and care for a tree; the tree grows from **time** (not from actions);
diseases occur randomly, more often if tree dailies (separate from site dailies)
are missed.

Current demo: real misty **forest photo** (Unsplash
`photo-1448375240586-882707db888b`), **synthesised rain** ambience (Web Audio
filtered noise, resumes on the intro click), **rain-on-glass droplets** (not
falling streaks), a **placeholder SVG sapling** (needs real art), and a
**text-only UI** (no backgrounds): a merged top-left menu (stats + today's care),
underlined text control buttons (Water / Trim / Mist / Fertilize / Inspect), and
a text music player streaming **Satie's Gymnopédie No. 1** (Kevin MacLeod,
CC-BY - needs a credit line in the finished version). Music + Ambience mute
toggles default ON and strike through when muted. Intro overlay ("Elysium")
doubles as the page-load animation and the audio gesture. Fonts: Cormorant
Garamond (display) + Jost (UI).

**Open on the game:** real tree artwork; optionally a real forest-ambience loop
alongside the synth rain; the user asked for one animation each with alternatives
listed (they have not picked yet).

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

## Guestbook now has replies
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

## Pending / roadmap

The user gave an ordered roadmap (D -> A -> B -> G -> K -> C -> L) then diverted
into the dashboard/login/tree work. Still open:

- **D. Chess redesign** - 10 full-window mockups were sent; **user has not
  picked one yet**. Chess is wired but not in the nav and not redesigned. (There
  is also a range-of-styles reference from a friend's games.) Build only after
  they pick.
- **A. Profile directory** page: all registered profiles as cards on the card
  navigator.
- **B. Games** dropdown -> a dedicated page using the card navigator.
- **G. Card navigator touch controls** for mobile (swipe).
- **K. Notifications auto-clear** when their associated page is visited.
- **C. Login -> card-navigator format** (login dash is the first card; FAQ card;
  a wide "preview" card; two placeholder cards to its left; lorem ipsum for now).
- **L. Card navigator polish:** stronger tilt / cylinder illusion, regular
  spacing for the farthest cards, **wide card counts as two normal cards** for
  spacing.
- **Tree game:** real tree artwork; pick the animations (alternatives were
  offered); optional real forest-ambience loop; the real game mechanics.
- **Docs pass:** README.md + `/tech` are stale (see top). Also the tree-game
  music needs a CC-BY credit line before it ships for real.

Dashboard design = Cirrus (done). Login design = Cirrus (done).

## Older open items still unverified
- Windows tofu fix on the login bows (the login header no longer uses the bows,
  so this may be moot there, but check other pages).
- `lestbrump`, an unexplained account that was once in local data.
