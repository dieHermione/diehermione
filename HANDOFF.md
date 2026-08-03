# Handoff, angeldomme

What is true now, what is left, and the habits that keep this project cheap to
work on. Rewritten 2026-07-30, refreshed 2026-08-03 after the dual-tone/boot/
admin/visitor/notifications batch; earlier versions had a decade of "latest
session" layers stacked on top of each other and most of it was superseded.

> **The site is called angeldomme.** The `.me` is part of the word, not just the
> TLD: it reads "angel domme". Never write bare `angeldom` in anything a visitor
> sees — this includes UI chrome that is easy to overlook, like window title bars
> and `name@host` handles: write `angeldomme` (or the full domain `angeldom.me`),
> never `@angeldom`. The old `ANGELDOM //` headers are gone from every page; every
> header now reads `angelOS v0.2`. Internal identifiers and the domain string are
> fine. When in doubt, say it aloud: if it reads "angel-dom" it is wrong.

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). One Express
server (`server.js`), no database, JSON files on disk, no build step. One admin
identity: `hermione`.

> ## Always push
> **Commit and push to `main` after every task — no need to ask first.** This is a
> small personal hobby site; the user has standing authorization to push, and
> pushing early never ruins anyone's experience. Don't sit on finished, verified
> work waiting for a go-ahead. (Auto-deploys on push, so a quick post-push sanity
> check against the live marker is still worth it — see Railway lag below.)

> ## Dual-tone colour rule — no dimming
> Every blue-and-white surface uses **exactly two text colours**: the vivid brand
> blue **`#00acdb`** and white **`#eafaff`**. There is **no dim/mid blue for text**
> — the old `--dim`/`--dim2` shades (`#006b88`, `#004558`, and the older `#4f7ea0`,
> `#2c4a5e`, `#aee3ff`, `#8fd0ff`) are gone from text; `--dim` and `--dim2` now just
> resolve to `#00acdb`. Labels/eyebrows are the same blue as the values and links,
> not a fainter one. Also: **no text transparency anywhere** — never set `color:`
> to an `rgba()` with alpha or put `opacity:<1` on visible text; on the black
> background use the opaque colour. (`--glow`, borders, and backgrounds may keep an
> alpha; they are not text.) This applies to every blue-white page — dashboard,
> login, boot, onboarding, summary, admin, manage, commands, guide, tech, profile —
> and to the **devotion** and **summary** game cards. Among games only devotion and
> summary follow the blue rule; the others keep their own accent. **Penance is red**
> (card and screen) — it is *not* blue; dual-tone still holds there as one red + white.

> ## Persistence — CRUCIAL, do not regress
> Every editable-text pool (`decrypt.json`, `devotion.json`, `penance.json`,
> `site.json` = about-me/site-purpose, applications, users, elysium, writing/parse
> logs, …) is a JSON file under **`DATA_DIR`**. The `load*()` functions read the
> file first and only use the built-in `*_DEFAULTS` when the file is missing — so
> **Hermione's edits always win over the code defaults.** They already do in code.
>
> **Infra is already correct (verified 2026-08-02):** Railway service
> `diehermione` has a persistent volume (`diehermione-volume`) mounted at `/data`
> and the env var **`DATA_DIR=/data`** set. That's proven by accounts surviving
> deploys — same `DATA_DIR`, same volume, so the text pools persist too. **Do not
> add a second volume, and do not point `DATA_DIR` anywhere else.** Never "fix"
> persistence by committing generated data JSON to the repo — a deploy would then
> overwrite live edits with the committed copy.
>
> So the "lines I removed came back" bug was **not** the filesystem. It was an
> admin editor seeded from a **client-side default** (the old Subliminals box read
> `window.Subliminal.messages`, the hardcoded pool, not the server), so saving
> re-persisted defaults over the edit. Subliminals were removed entirely; the
> remaining editors (decrypt / penance / devotion / about+purpose) all `fetch`
> their current value from the server before showing it.
>
> **Rule for any new editable pool:** copy `decrypt.json` exactly (file-first
> load, defaults only as fallback) AND make its admin editor fetch the server
> value before rendering. Never seed an editor from a client-side constant.

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
| `/games` | the wall every game is reached from; one bespoke card per game |
| `/profile` | the man page, `angelOS database` |
| `/guest` | redirects to `/dashboard`; guests see the dashboard in a guest state (no points, no Profile/admin) |
| `/apply` | account-less questionnaire; stores to `applications.json`. Option sub-text is Hermione-editable (`questionnaire.json`) |
| `/admin` | admin-only: the full admin panel, **tabbed** (Members / Writing / Site content / Docs & tools) |
| `/manage` | admin-only, reached **from `/admin`**: create disciple accounts + review completed questionnaires; **tabbed** (Create account / Questionnaires); standard top-left back button leads to `/admin` |
| `/commands` | admin-only: the `pray` command reference |
| `/guide`, `/tech` | the manual and the technical notes |
| `/snake` `/writing` `/wheel` `/deathroll` `/elysium` `/chess` `/dummyparse` `/skillcheck` `/summary` `/lottery` (`/slots` alias) | the games |

### Games
- **Snake** free-swimming, no grid. Dies on its own tail. Food drifts at half
  speed and flees on approach. **Boost:** hold **Shift** to go faster off a
  storable meter (full bar ~5s at 1.9x, refills ~16s); **Space** pauses.
- **Penance / Devotion** (`/writing`, `?mode=devotion`). Both take editable
  preset line-sets; Penance also keeps its own-lines box. Penance corrupts but
  stays legible (the glyph-scramble and the harsh corruption static are both
  gone). **Penance is red; Devotion is blue.** **Devotion needs an account** —
  guests are turned away (card lock + a server redirect), same as deathroll.
- **Wheel** the unrolled cylinder. Accounts get one turn a day; guests unlimited.
- **Lottery** (was Slots, `/lottery`, `/slots` alias) the INSTANT scratch card.
- **Deathroll**, **Chess**, **Elysium**, **Devotion** need an account.
- **Chess** is ink wash. Hermione has STRIKE and REWIND (see below).
- **Dummy Parse** priest damage sim; **versioned** (`GAME_VERSION`).
- **Skill check** the pure dial, with a settings screen.
- **Summary** a real Wikipedia article and a word limit. Topic pools: angels,
  feminism, Greek mythology, pre-18th-century history, **critical biblical
  scholarship** (`SUMMARY_TOPICS` / `KIND_LABEL` in `server.js`).

### Systems
- **`audio.js`** one context, a gain node per channel (music/ambience/typing) and
  a **master** over them. One localStorage key, cross-tab via `storage`, and a
  BroadcastChannel lock so two visible tabs do not both play continuous sound.
- **`console.js`** backtick opens it. Commands are prefixed **`pray`** (this
  replaced `wing`): `points <user> <+n|-n>` (signed add), `set_points`, `manage`,
  `open <user>`, `launch <game|page>`, `reload`, `quit`. **Bare `pray` just
  acknowledges ("she hears you") — it does NOT flash a subliminal any more;
  subliminals were removed entirely.** The `/commands` page documents them.
- **`glitch.js` is deleted** (it drove the removed subliminal word-flash).
  **`dashglitch.js`** is the screen distortion (six effects; tear/dropout/bloom/
  contrast-crush/comb/edge-burn on a weighted 2.5–8s scheduler). Contrast crush
  swaps palette variables (never touches the background) and now **inverts
  blue↔white** instead of slamming to red; edge burn glows blue. Every terminal
  page runs it via `dashglitch.js` + `glitchboot.js` — **except Elysium**, which
  has it removed on purpose. Photosensitive accounts and the effects-off toggle
  gate it off.
- **`boot.js`** the decrypt/POST animation, driven by a **virtual clock**: hold
  **Space** to run it (and the tail) at **8x**, press **M** to skip straight to
  the dashboard. ~30s cascade of tripled service lines; no [WARN] lines, no
  vignette (so all text is uniform bright blue), and no lingering delay before the
  dashboard. Lines are server-stored (`decrypt.json`) and editable in `/admin`.
- **Editable text pools**, all the same shape (server-stored; the `/admin` editor
  fetches the server value before rendering): `decrypt.json`, `devotion.json` +
  `penance.json` (writing presets), `site.json` (about/purpose), and
  **`questionnaire.json`** (the `/apply` option sub-text). *(subliminal.json and
  snakesubliminal.json were removed with subliminals.)*
- **Notifications are Hermione-only.** The bell is hidden for non-admins; member-
  facing alerts (points, deathroll) were dropped. She still gets new-questionnaire,
  writing-finished and her own deathroll alerts (`pushNotification` in `server.js`).
- **Dashboard** (`public/dashboard.html`): hero title font is **Share Tech Mono**;
  the clock *time* is white. The **leaderboard** was iterated to death — the final,
  requested state is: **full-width table, heading + rows left-aligned, points
  right-aligned to the window edge** (mirroring the balance display's padding on
  the left), a wide name→points gap, and columns that ellipsize so they never
  stretch. Its height is synced to the control card in JS so LEADERBOARD sits level
  with ENTER, and it scrolls internally when full. Don't "helpfully" re-center it.
- **Auth model:** no self-serve registration. Applicants fill `/apply` (Discord +
  questionnaire) -> `applications.json`. Hermione makes accounts by hand in
  `/manage` (**disciple only — visitor was retired**) with a dummy password and
  `mustChangePassword`; first login forces a password change. A boot-time
  migration folds any legacy `Visitor`-rank account into the entry disciple rank.

### Removed, do not reinstate by accident
Dailies and both daily bonuses; tithe; tasks and essays; the guestbook; the light
/dark toggle; the top pill nav; guest as an account type; **self-serve
registration** (login is login-only; "apply here" -> `/apply`); **subliminals**
entirely (`glitch.js`, `subliminal.json`, the `pray` flash — the user may recreate
the `pray` case later, from scratch); **angelcoins** (from UI and payouts; snake
food now pays points); the **Visitor** account type (all folded into disciple;
guests cover that role); **member-facing notifications** (bell is Hermione-only);
the admin panel **from the dashboard** (it lives on `/admin` now); the boot
**vignette** and **[WARN]** lines.

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

Seed `hermione` (Princess, `sandboxpass123`) and a couple of approved disciples.
Give the leaderboard accounts `flagged: true` and some `points`, or the board
renders empty (it lists only flagged accounts). Every account needs `passwordHash`,
`status`, `pronouns` and `createdAt`. (`scratchpad/seed.js` already does this.)

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

**`shot.js`'s screenshot step stalls on pages with a continuous rAF/canvas loop**
(snake, elysium, mid-boot). The `eval:` result still prints to stdout *before* the
capture, so run it backgrounded, poll the output file for the `eval:` line (return
a DOM value to assert on), then `pkill -f shot-chrome-`. Static pages capture fine.

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

The admin-to-`/admin` extraction, the dual-tone recolour, the boot rework, the
visitor removal, notifications-to-Hermione-only, the snake boost, the account-
management rebuild, the questionnaire editor, and the summary scripture pool have
all landed and are pushed. What is left:

### Open
- **`profile.html` was on the old light-blue palette** until it was recoloured;
  it now matches. But it (and a few pages) still uses the classic man-page /
  terminal layout — no redesign requested, just noting it is now on-scheme.
- **Game-selection cards** already exist as bespoke per-game cards on `/games`
  (snake and deathroll are still `placeholder card`). If a fresh mockup batch is
  ever wanted: poster-wall layout, each card styled like the login game cards —
  render as `?d=N` + headless Chrome, send, delete (see the mockup lesson below).
- `README.md` is stale.
- Photosensitivity first-visit gap: the login page reads a localStorage flag
  (it runs before anyone is identified), so a flagged account is unprotected on
  its very first visit from a new browser. (Dashboard Settings has a one-way
  Photosensitivity toggle; account creation defaults the flag to false.)
- Hover sounds ride the *typing* channel; the settings panel only has three.
- `nav.js` may still carry dead `buildNav()` / `applyGuestNav()`.
- Handed-in summaries are stored in `summaries.json` with **no admin view**.
- Completed questionnaires are viewable in `/manage`; account creation is manual
  (no automated Discord check, by design).
- Elysium: `docs/elysium-ideas.md` — the game is short of *events*, not features.
- Railway can lag badly (once ~14 minutes). Verify a deploy against a real marker
  before concluding a build failed.

### If the user recreates subliminals
They asked, later, to be able to re-add a subliminal flash to the bare `pray`
console command — but only that one case, built from scratch (the whole system was
deleted). Not done yet. If building it: follow the persistence rule for any pool,
and gate it off for photosensitive accounts.

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
