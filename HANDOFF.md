# Handoff, angeldomme

What is true now, what is left, and the habits that keep this project cheap to
work on. Rewritten 2026-07-30; earlier versions had a decade of "latest session"
layers stacked on top of each other and most of it was superseded.

> **The site is called angeldomme.** The `.me` is part of the word, not just the
> TLD: it reads "angel domme". Never write bare `angeldom` in anything a visitor
> sees — this includes UI chrome that is easy to overlook, like window title bars
> and `name@host` handles: write `angeldomme` (or the full domain `angeldom.me`),
> never `@angeldom`. The old `ANGELDOM //` headers are gone from every page; every
> header now reads `angelOS v0.2`. Internal identifiers and the domain string are
> fine. When in doubt, say it aloud: if it reads "angel-dom" it is wrong.

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). One Express
server (`server.js`), no database, JSON files on disk, no build step. One admin
identity: `hermione`. Push after each task; the user likes frequent pushes.

**Read order:** this file, then **`/guide`** and **`/tech`**, which were rewritten
on 2026-07-30 and are accurate. `README.md` is still stale and owes a pass.
`mockups/README.md` is the authority on which designs are chosen.

---

## What exists

### Pages
Login (`public/index.html`), dashboard (`public/dashboard.html`), and everything
else in `views/` behind a route. `/games` is the wall every game is reached from;
the dashboard no longer lists them individually.

| Route | What |
|---|---|
| `/games` | the paste-up wall, one drawn poster per game |
| `/profile` | the man page, `angelOS database` |
| `/guest` | redirects to `/dashboard`; guests see the full dashboard in a guest state (points/coins N/A, no Profile/admin, "Sign in or apply") |
| `/apply` | account-less application questionnaire (was onboarding); stores to `applications.json` |
| `/manage` | admin-only: create visitor/disciple accounts, review applications |
| `/commands` | admin-only: the `pray` command reference |
| `/guide`, `/tech` | the manual and the technical notes, both current |
| `/snake` `/writing` `/wheel` `/deathroll` `/elysium` `/chess` `/dummyparse` `/skillcheck` `/summary` `/lottery` (`/slots` alias) | the games |

### Games
- **Snake** free-swimming, no grid. Dies on its own tail (only reachable once
  long enough). Food drifts at half speed and flees on approach.
- **Penance / Devotion** (`/writing`, `?mode=devotion`). Both take editable
  preset line-sets; Penance also keeps its own-lines box. Penance corrupts, but
  the text stays legible: the scrambled-glyph effect was removed.
- **Wheel** the unrolled cylinder. Accounts get one turn a day and the spent
  button becomes **return**; guests get unlimited spins (they keep no currency).
- **Lottery** (was Slots, `/lottery`, `/slots` alias) the ANGELCOIN INSTANT
  scratch card; the scratch is deliberately fiddly (small brush, ~80% reveal).
- **Deathroll**, **Chess**, **Elysium** need an account.
- **Chess** is ink wash. Hermione has STRIKE and REWIND (see below).
- **Dummy Parse** priest damage sim; **versioned** (`GAME_VERSION` in
  dummyparse.html, leaderboard defaults to the current version). Divine Charges
  (from Smite) feed **Discipline**; ability cards show damage/cast/cooldown inline.
- **Skill check** the pure dial, with a settings screen. Finish = N checks **in a
  row**; a miss resets the streak.
- **Summary** a real Wikipedia article and a word limit (hand-picked topic list).

### Systems
- **`audio.js`** one context, a gain node per channel (music/ambience/typing) and
  a **master** over them. One localStorage key, cross-tab via `storage`, and a
  BroadcastChannel lock so two visible tabs do not both play continuous sound.
- **`console.js`** backtick opens it. Commands are prefixed **`pray`** (this
  replaced `wing`): `points <user> <+n|-n>` (signed add), `set_points`, `manage`
  (account admin), `open <user>` (their profile), `launch <game|page>`, `reload`,
  `quit`. Bare `pray` flashes a subliminal. Up/down walk history. The `/commands`
  page (admin-only, linked from the admin Documentation section) documents them
  and must be kept in sync when a command is added.
- **`glitch.js`** subliminal flashes. **`dashglitch.js`** screen distortion; tear
  bands also run on their own 3-11s clock, and contrast crush swaps palette
  variables rather than drawing an overlay, so it never touches the background.
- **`boot.js`** the decrypt animation and its sound. Its lines are server-stored
  and editable in the admin panel.
- **Editable text pools**, all following the same shape (server-stored, admin
  editor in the dashboard admin panel): `decrypt.json`, `subliminal.json`,
  `snakesubliminal.json` (snake taunts, separate from site subliminals),
  `devotion.json`, `penance.json`.
- **Auth model (changed):** there is no self-serve registration. Applicants fill
  `/apply` (Discord contact + questionnaire) -> `applications.json`. Hermione makes
  accounts by hand in `/manage` with a dummy password and `mustChangePassword`;
  first login forces a password change (dashboard gate), and accounts can change
  their password anytime from their own profile. `POST /api/photosensitive` is a
  one-way flag set from Settings.

### Removed, do not reinstate by accident
Dailies and both daily bonuses; tithe; tasks and essays; the guestbook; the light
/dark toggle; the top pill nav; guest as an account type; **self-serve
registration** (the login page is login-only; "apply here" -> `/apply`).

---

## Hiding versus access control

Chess is the worked example and the pattern to copy. The two things only Hermione
can do live in `views/chess-extra.js`, behind a route that **404s** (not 403s) for
everyone else, so the opponent's copy of the page has no markup, no styles, no
strings and no endpoints for them to find. That is about not spoiling the game.
**The endpoints check `isAdmin` on every call, and that is the real boundary.**

---

## Testing

The sandbox is a scratch `DATA_DIR` on a second port. It does not persist between
sessions; reseed it with a script that hashes using the repo's own `bcryptjs`.

```
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

Seed `hermione` (Princess, `sandboxpass123`), a couple of approved subs, a Visitor
and one `status:"pending"` user. Every account needs `passwordHash`, `status`,
`pronouns` and `createdAt`.

**Check for a leftover server before trusting any request.** One from an earlier
session holds the port, the new one dies with EADDRINUSE, and curl answers happily
from the old data. `lsof -nP -iTCP:57999 -sTCP:LISTEN` and kill the PID it prints:
`pkill` matches the shell wrapper and leaves node holding the socket.

Only `server.js` changes need a restart. Static files under `public/` and `views/`
serve fresh.

### The Browser pane cannot be trusted for layout
It reported a **0x0 viewport for two entire sessions**, fronted or not. DOM and
JSON checks through `javascript_tool` still work; every width, height and
screenshot lied. Drive headless Chrome instead.

Two throwaway tools made this cheap and are worth rebuilding immediately:

- **`scratchpad/shot.js`** talks the DevTools protocol: navigate, run arbitrary JS
  (click a tab, drive a parse with synthetic `KeyboardEvent`s, walk an animation),
  then screenshot. `node shot.js <url> <out.png> [w] [h] ["<js>"] [settleBefore] [settleAfter]`.
  `settleBefore` **must outlast the login redirect** or the eval is thrown away
  with its context.
- **`public/_shot.html`** logs in and redirects, so authenticated pages can be
  captured. `?u=seraph&p=testtest123&go=/chess`, or `?u=guest` for a guest
  session. `.gitignore` already covers `public/_*.html`, so it never deploys.

`computer{type}` sends no keydown; drive typing games with synthetic
`KeyboardEvent`s. Audio cannot be heard in headless Chrome (the context stays
suspended) so verify the graph, not the sound.

---

## Traps this codebase has already sprung

- **SVG elements have no `hidden` or `className` IDL property.** Assigning either
  silently does nothing. Put state on a wrapper div.
- **`hidden` loses to an explicit `display`.** Every self-contained page needs its
  own `[hidden]{display:none !important}`.
- **A `filter` on page content becomes the containing block for `position:fixed`
  descendants**, throwing the console and every modal across the screen.
- **An overlay cannot avoid the background**, whatever filter it carries. If an
  effect must spare the background, swap palette variables instead.
- **Anything appended to an element a render function empties disappears
  mid-animation.** Hang overlays on a parent that survives the repaint.
- **Vertical text is tall.** A folded panel's rotated heading grew the dashboard
  grid enough to trigger its scale-to-fit and shrink the whole page.
- **Frame-rate dependent probability.** Roll on the state change, not per frame.
- **A CSS animation ending in `transform: none`** wipes a positioning transform.
- **Never transform `.dash`**; the scale-to-fit lives there.

---

## Outstanding

Big batches from the recent sessions (auth overhaul, Parse rework, guest
dashboard, photosensitivity, slots->lottery, snake taunts, back-button behaviour,
commands page, bloom) all landed and are pushed. What is left:

### Requested, not yet done (pick up here)
1. **Move all admin controls to their own page, off the dashboard.** The admin
   panel is currently built into the dashboard: `buildAdminPanel()` at
   `public/dashboard.html:694-1032`, `showResult()` + the `#pmodal` handlers just
   below it, the `#pmodal` markup, and the `adm-*` CSS (~`dashboard.html:222+`).
   The block is nearly self-contained (all of `mk`, `mkChip`, `foldable`,
   `presetEditor` are local to `buildAdminPanel`); its only external deps are
   `window.Subliminal` (glitch.js) and `window.DashGlitch` (dashglitch.js) for the
   subliminal/screen-glitch editors, plus one `fitDash()` call to guard. Cleanest:
   extract into a shared `public/adminpanel.js` exposing `build(container)` +
   pmodal + injected CSS, used by a new `/admin` page. Then the dashboard's
   Hermione branch (`dashboard.html:~500`) stops calling `buildAdminPanel()`,
   hides the dailies/admin card, and the "Hermione" control becomes an **Admin**
   link to `/admin`. The `/admin` route already exists and 302s today — repoint it
   (admin-only, like `/manage` and `/commands`). Design goal: convenient and
   legible for Hermione only, terminal theme, not visually fancy.
2. **Game-selection cards: 10 fresh mockups** — do this LAST. Locked direction for
   the eventual build: the **poster-wall** layout, but each poster styled like the
   **login offline-mode game cards** (not the flat colour + name of the earlier
   poster mockup). Render as parameterised `?d=N` files + headless Chrome, send the
   images, delete after (see Testing + the mockup lesson below).
3. **Onboarding contact step** (`views/onboarding.html`, `contactStep()`):
   - Remove the "There are no accounts to make here..." paragraph.
   - The Discord input is being treated as a login field (the browser offers saved
     account names when it is focused). Stop that: `autocomplete="off"`, a
     non-username `name`, `autocapitalize="off" autocorrect="off" spellcheck="false"`.
   - Add a **back button on the contact step**. It is step 0, where `#back` is
     disabled; let back on step 0 leave to `/` (login) instead.
4. **Profile back button should go to the dashboard, not the games wall.** `nav.js`
   sends every non-`/games` page's back button to `/games`. Give the profile page
   a `window.__navBack` that navigates to `/dashboard` (same hook the skillcheck /
   writing back buttons already use).
5. **Confirm subliminals are OFF for photosensitive accounts** (the toggle being
   "locked on" must mean the flashing/subliminals are disabled, not enabled).
   Believed already correct — `applyEffects()` gates on `!photosensitive`, and
   `applyPhotoLock()` also forces `AudioBus.setSubliminals(false)` and greys the
   Subliminals box — but verify a flagged account never flashes on any page.

### Older open items
- `README.md` is stale.
- Photosensitivity first-visit gap: the login page reads a localStorage flag
  because it runs before anyone is identified, so a flagged account is unprotected
  on its very first visit from a new browser. (There is now a one-way
  Photosensitivity toggle in dashboard Settings, and account creation defaults the
  flag to false; registration no longer asks the question.)
- Hover sounds ride the *typing* channel; the settings panel only has three.
- `nav.js` still carries dead `buildNav()` and `applyGuestNav()`.
- Handed-in summaries are stored in `summaries.json` with no admin view.
- Applications (`applications.json`) and Hermione-created accounts: the admin
  reviews applications and makes accounts by hand in `/manage`; there is no
  automated Discord check (by design).
- Elysium: `docs/elysium-ideas.md` holds a brainstorm. Its headline point is that
  the game is short of *events*, not features.
- Railway can lag badly (once ~14 minutes). Verify a deploy against a real marker
  before concluding a build failed.

---

## The mockup lesson, twice learned

**T9 was rejected four times.** Three attempts repainted the same shape (an
upright rectangle, screen on top, 3x4 key grid, which is a calculator whatever
colour it is); the fourth changed the silhouettes but still *invented* the phones.
The fifth was drawn from a reference photo of a Motorola RAZR V3 and copies it.

**Slots was rejected once** for being six paint jobs on one idea (a cabinet with
three reels in a window).

Two rules from that:
- When a batch comes back as "the same design again", change the **organising
  idea**, not the palette.
- For a physical object, **ask for a reference photo on the first rejection**
  rather than guessing again.
