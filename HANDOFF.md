# angeldomme — the one document

This is the **only** documentation for the project. There is no README, no
NEXT_SESSION, no per-folder notes, no in-site guide or tech page — everything
lives here, in plain markdown, and **it is updated in the same commit as any
change that would warrant it** (a new route, pool, command, rule, or a claim
below that stops being true). Rewritten from the code on 2026-09-11; the
previous five files trailed the code by twenty commits.

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). One Express
server (`server.js`, ~2.2k lines), no database, JSON files on disk under
`DATA_DIR`, **no build step**. Repo: `dieHermione/diehermione` — it is also
edited through Replit sometimes, so **pull/rebase before pushing**.

> **There are no user accounts (since 2026-09-11).** Everyone who arrives is a
> guest, automatically; the only account is **`hermione`**, who signs in through
> the console (`pray login`). No points, no leaderboard, no ranks, no profiles,
> no registration or questionnaire. Nothing on the site should encourage or
> require an account. Old disciple records may still sit in `users.json`; login
> refuses them and nothing reads them.

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

### Typography is a switch
`--display` and `--ui` drive every face in the mockup, and `?f=1..6` swaps the
pairing, so type can be judged against the real layout rather than in isolation.
Add a face by extending the Google Fonts link and adding one `body[data-f="N"]`
rule. **A swap is rarely just a swap** — each face needs its own nudge beside
it, and skipping that is what makes a pairing look worse than it is: Italiana
wants letter-spacing, the scripts want a larger size and more line-height or
their ascenders collide, Cinzel is all-caps so it needs tracking and less size,
Archivo Black carries its weight so it needs less size and a lighter italic,
Oswald is set as caps to read as a cover line. **The design is settled (6,
split); the type is not.**

### The palette
A photographic background — `mockups/bg-glitter.jpg` (pink glitter; `bg-dusk.jpg`,
the low-poly landscape, is kept as the alternative and is one line away) over
`#ed72ad` as the fallback. Every panel, card and tile is **translucent white**,
backdrop-blurred, and **generously rounded** — 22px panels, 14px cards, pills
for chips and buttons. Nothing is square unless two edges are meant to meet.

**The nav is always its own surface**, never bare on the background, and it is
deliberately *more* transparent than the panel (`--nav-plate` .50 against
`--plate` .80) so the two read apart by material rather than only by an edge.
What changes per design is the nav's shape and seat: a column, a full-height
drawer, a compact card, a tab well, a tray, an upright pill.

Text on the pink is a near-black plum `#26101b` with `#4a1930` for secondary;
panels carry the warm-grey scale. The mockup holds both as `--on-pink*` and
`--ink/--dim/--faint`, switched per design by an `on-white` class on the nav,
since some arrangements seat the nav on a surface and some on the background.

**Match the veil to the picture.** The landscape ran from a bright sky to a
dark navy floor where dark text fell to ~1.8:1, and needed a *graded* veil
(.06 to .56) to be usable. The glitter is uniform in luminance, so it needs
only a flat .10 sliver to calm the sparkle. **Measure a translucent surface at
several heights, not one** — over a photograph its backdrop differs top to
foot.

**A tint that works on white can fail on pink.** The warm-grey `--dim` used for
inactive text is 5.2:1 on a white panel but only **3.2:1** on the pink nav
surface, so the nav carries its own plum scale (`#6b2c49` at 5.6:1 inactive,
`#7a3a56` for labels) while panels keep the greys. Sample inside the surface
you mean — a point a few percent off lands on the background and flatters the
reading.

**`backdrop-filter` hangs `shot.js`.** The DevTools `Page.captureScreenshot`
never returns once several blurred surfaces are on the page: the `eval:` line
prints and no file is written. Chrome's own `--screenshot` CLI handles it —
which is what `mockups/capture.sh` already uses, so capture the batch with that
rather than `shot.js`. (Dropping `background-attachment:fixed` does not fix it;
it was removed anyway, since the page never scrolls.)

### Direction: off the terminal aesthetic, toward one page
Decided 2026-09-11: the site is **moving away from the terminal look** and
toward a **single-page format like ThroneLogs**. Nothing is redesigned yet;
in preparation **every screen effect is hidden** — the glitches, every
scanline overlay (`.scan`, the boot overlay's, the console panel's) — by one
switch, `HIDDEN = true` at the top of `public/dashglitch.js`, which every
terminal page loads. The dashboard's Flashing effects box and the admin Screen
glitch triggers hide themselves when `DashGlitch.hidden` is set. The code is
still there; flip the flag to get it all back, delete it when the redesign
lands. The boot cascade still plays (it is the entrance, not an effect) —
first candidate to go when the new look arrives. Game cards are being replaced
one at a time by **generated posters** (`public/img/card-<game>.jpg`, 3:4,
cover-fit into the card box with no bottom fade); Devotion is the first.

**The border is a 9-slice, not a background.** `mockups/frame-leopard.webp`
(1474x1302, WebP+alpha, 230KB) is the leopard frame, rebuilt from the supplied
sheet. Use it as `border-image: url(...) 184 round` on a `position:fixed;
inset:0; pointer-events:none` overlay, with `border-width` setting the
thickness (visible fur is about half of it). **`round` is required** — the
default `stretch` ovals the spots. One asset covers every viewport and aspect
ratio; do not make breakpoint variants and do not force 16:9.

**What the supplied sheet is, and what the rebuild does.** It arrives as a KIT
OF PARTS — four L-corners and four bars, laid out spaced on one canvas. **The
gaps are delivery spacing, not the design: the pieces are meant to butt into
one continuous band.** Every piece also tapers to nothing at its ends, so they
cannot simply be placed — each end is squared off at full thickness first, then
butted with no gap at all. Two further faults in the source: the bottom bar is
64px thick against the top bar's 72 and the corners' 85, and the bars do not
sit on the line of the corner arms. The rebuild is `scratchpad/build-frame.py`:
it squares every end, scales all bars to one thickness, places each bar on the
arm band **measured in the very column where it butts** — a computed centreline
gets contaminated by the corner's elbow and pulls every bar inward, which reads
as the frame failing to reach the edges — cleans the background-removal halo,
and uses a mirrored copy of the top bar for the bottom. Give content about a
rem of clearance inside `border-width`: the fur's inner edge is ragged.

**Two kinds of seam, two fixes.** Where the bar tile REPEATS, each bar is
mirror-doubled (`[B][mirror B]`), so the unit begins and ends on the same
column and the repeat is seamless by construction. Where a bar meets a CORNER,
the corner goes down first and a feathered stub of the bar is laid over its arm
— butting them instead leaves a pinch, because the corner's arm is thinner than
the bar right at the joint. A third rule, learned by shipping it broken: **opposite bars must come out
exactly the same length.** The canvas is sized from one of each pair, so if the
other is a few px shorter — they are trimmed independently, and the taper does
not end at the same place — it cannot fill its edge region, and every tile
leaves a transparent strip down that side. Equalise each pair before
mirror-doubling.

And a fourth: **every arm must touch its outer edge, and the corner box must be
square.** The supplied arms sit at different insets (top 5px, bottom 3, sides
0), so each edge showed a different sliver of background — the top noticeably
more than the left. Each corner is shifted until both its arms are flush, the
bars are placed at zero offset to match, and all four corners are cropped to one
square box so a single slice value renders the band equally thick on every side.

**Flush must not mean hard.** Fur is wispy — the source carries ~17 rows of soft
falloff past its solid band — and shaving that off makes every edge read as a cut
line. Two things protect it: clean the background-removal halo *gently* (keep
alpha within ~14px of solid fur, not 4px, which cost 70% of the falloff), and
crop each piece with a pad so the faint tail outside the alpha>40 bbox survives.
Then composite on a margin and crop it away at the end, so the solid band sits
flush to the edge while its soft tail hangs past and clips off-canvas: flush
outer boundary, intact fur on the inner one. **A ragged edge cannot be aligned by its average.** Fur has no straight
boundary, so shifting a piece until its *mean* outer edge sits at zero leaves
about half the rows short, which renders as thin pink slivers along the sides
and bites out of the corners. The last step of the build therefore EXTRUDES the
outer boundary: for every row and column, the outermost solid pixel is carried
out to the sheet edge. Only the outer boundary is touched, so the inner one
keeps its soft falloff. A fur edge clipped at the viewport reads as fur running
off-screen, not as a hard cut — the hardness only ever showed on the inner edge.

Check all three properties together, and check them on the FULL span, corners
included — the corners were the last place the gaps hid, and a mid-edge sample
reported clean while they were still open. Target: soft rows matching the
source, inset 0 everywhere, and zero transparent pixels along the sheet's own
four boundaries (assert on the sheet's alpha, not the render's colour — the
soft tail blends close enough to the background to fool a colour test).

Check by measuring, and **measure all four edges**: the left edge was clean
while the right was striped, and only the right was reported. Measure on a bare
page with nothing but the frame, or panel pixels get counted as frame; and
count *interior* background runs (bounded by frame on both sides) rather than
coverage per column, or a single anti-aliased pixel reads as a hole. Good
output is a consistent band span with no interior run over about 3px.
First arrangements are the `singlepage` mockup batch.

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
backgrounds may keep alpha). Applies to dashboard, login, boot, summary,
admin, commands, and to the devotion and summary cards. The red games (skill
check, deathroll, snake) are dual-tone the same way: one red `#c11208` + white.
The accent is themeable (see `theme.js`) — the rule is "two colours", not
"blue".

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
console's `admin: true` flag is cosmetic for the same reason. Likewise
`/login`: it is unlinked (only `pray login` goes there), but what protects it
is that `/api/login` accepts hermione's credentials and nobody else's.

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

`public/index.html` is the **front door**: no form — it starts a guest session
(`POST /api/guest`) and plays the boot into the dashboard. `GET /` is an
explicit route registered before the static middleware: a visitor who already
has a session is sent straight to `/dashboard`. `public/dashboard.html` is the
dashboard; everything else is a view in `views/` behind a route.

| Route | Who | What |
|---|---|---|
| `/` | anyone | become a guest, boot, land on the dashboard (or skip to it if already a player) |
| `/dashboard` | player | welcome copy, clock, ENTER (Games · Settings; Hermione also gets Admin · Log out). `/guest` redirects here |
| `/games` | player | the wall every game is reached from; two tabs, *games* and *extra*; nothing is locked |
| `/login` | anyone | Hermione's sign-in form; reached only by `pray login`; redirects an existing login to the dashboard |
| `/admin` | admin | the tabbed admin panel (`public/adminpanel.js`) |
| `/commands` | admin | the `pray` reference, hand-maintained; back → `/admin` |
| `/snake` `/writing` (devotion) `/multitap` (`/t9` alias) `/summary` `/skillcheck` `/ot12` `/deathroll` `/dummyparse` `/elysium` (`/tree` alias) `/chess` | player | the games on the wall |
| `/wheel` `/lottery` (`/slots` alias) | player | still routed, **not linked from the wall** (free play, pay nothing) |
| `/coc2-engine/` | anyone (static) | a hosted writeup, unrelated to the site's own docs |
| `/chess-extra.js` | admin, 404 otherwise | Hermione's chess controls |

"player" = `requirePlayer` (a guest or hermione); "admin" redirects non-admins
to `/dashboard`. `requireLogin` (account only) now effectively means hermione
and guards `/admin` and the elysium debug endpoints.

### The games wall (`views/games.html`)

Locked layout; one bespoke poster per game, all sharing one macOS-window
frame; cards hydrate real data (pool lines, elysium age). Order and tabs:

| Tab | Game | Card | Accent | Notes |
|---|---|---|---|---|
| games | devotion | **generated poster** (`card-devotion.jpg`) | blue | the first of the new cards |
| games | multitap | real (flat keypad) | green | |
| games | summary | real | blue | |
| games | skill check | real (dial) | red | |
| games | ot12 | real (group photo) | pink | flagged `wip` — "unfinished" label, still playable |
| games | snake | real | red | |
| extra | deathroll | real | red | Hermione vs a guest |
| extra | dummy parse | real | orange-red | |
| extra | elysium | **placeholder** | green | |
| extra | chess | **placeholder** | red-brown | |

No card is locked any more (the `account`/`multi` flags are gone with
accounts). A generated card is `ART.<name>: () => \`<div class="c-img"><img
src="/img/card-<name>.jpg"></div>\`` — full-bleed, cover-fit, the frame's bottom
fade suppressed. The other ten cards are still CSS-drawn and are next; elysium
and chess are placeholders. Hover text over each card comes from
`gametips.json`.

### The games

- **Snake** — free-swimming, no grid; dies on its own tail; food drifts at half speed and flees. **Shift** boosts (~5s per full meter at 1.9x, refills ~16s), **Space** pauses. Time limit chosen on the settings screen (up to 999 min). Food is counted, not paid.
- **Devotion** (`/writing`) — type a line, again and again: blue, calm, no difficulty; a slip restarts the current line. **The lines are written on the settings screen at game time** — one per row, ≤100 lines of ≤240 chars — and that is the only source: the preset line-sets (`devotion.json`, `/api/devotion/presets` and its admin editor) were removed on 2026-10-19. The server still builds the sequence from what it is given (`lines[0]` first, the rest shuffled with no immediate repeat) and owns the count. Settings → play → results. **Penance was folded into it on 2026-09-11** — the red corrupting sibling with a difficulty picker is gone; `penance` is now an alias of `devotion` in the console and old `completed.json` entries keep their `penance` category.
- **Multitap** (`/multitap`, renamed from T9) — typing on an old-phone multi-tap keypad, green/white, deliberately unguided. Any other key commits the pending letter; `#` confirms; `*` deletes; one press of `0` confirms, a second enters a space. Settings screen picks preset or custom lines and a repetition count. Pool is `multitap.json`. Logs as `category: "multitap"`.
- **Summary** — a real Wikipedia article (action API plain-text extract, trimmed) and a word limit that scales with the source. Pools in `SUMMARY_TOPICS`/`KIND_LABEL`: angels, feminism, Greek mythology, pre-18th-century history, critical biblical scholarship. Handed-in summaries → `summaries.json`, read in Admin → Completed.
- **Skill check** — the pure dial, settings screen, presets 10/20/35/50, two difficulties, themed.
- **OT12** (`/ot12`) — LOONA trivia. A round is either a Hermione-tagged **photo** (several members allowed; every member always offered; the answer set must match exactly) or a **trait question** generated from `OT12_MEMBER_DATA` (kinds: animal, shape, hangul, color, plant, height — only kinds with real values are offered; the pool is built at startup). Photos and "any trivia" split the odds evenly. Rounds chosen on the settings screen (default 10, max 100). Correct/wrong sounds. A **song framework** (`/api/ot12/songs`, hand-tagged) exists for future "who sings in X" questions — not built. **No automated image source, by design** (copyrighted photos); Hermione uploads (shrunk to 512px client-side) and re-tags in Admin → Games → OT12. No payout yet. Data-table caveats: values are not unique (location Earth 8 / Eden 4 — the yyxy four are Eden, real data; November/December/January each cover two members; eye colour Black covers four; shape Circle covers three), so a generator must never assume one right answer; missing fields are `undefined` and must be **skipped**, never invented. Thin fields: superpower, birthdate, height (1 of 12 each) — a height-range question cannot be generated yet.
- **Deathroll** — Hermione sets the opening number against a live guest (her picker lists the active guest names); players alternate `1d(previous)`; a 1 loses. Games keyed by the guest name and dropped with it.
- **Chess** — ink wash; every game is player (white) vs Hermione. Hermione has **STRIKE** (remove a piece, spent instead of a move, only on her turn) and **REWIND** (whole-state snapshot stack) via `chess-extra.js`. Her picker lists every live guest plus any game already on disk.
- **Elysium** — the tree-care game, one tree per player (hermione, or a guest name — a guest's tree is dropped with the name after three quiet hours, so for them it is short by construction), server-authoritative and time-based (`elysium-engine.js`: hourly ticks, health/resilience/moisture/humidity/airflow/nutrients/leaf wetness/wound load, five zones, three diseases with stages, six growth stages, real-month seasons; actions Water/Mist/Trim/Fertilize/Inspect). Pays nothing, by design. Only page **without** the screen glitch. Admin debug panel at `/api/elysium/debug`.
- **Dummy Parse** — priest damage sim; `GAME_VERSION` `"0.01"`; leaderboard shows best timed run per player on the current version only.
- **Wheel** — the unrolled cylinder; unlimited free spins, pays nothing. Not on the wall.
- **Lottery** (was Slots) — the INSTANT scratch card; free card, the "win" is just the number on it. Not on the wall.

### Runs are server-owned (or bounded)

| Game | Model |
|---|---|
| Devotion / Multitap | **server-owned.** `POST /api/writing/session` builds the line sequence (`mode` = `devotion`, always from the player's own `ownLines`; `multitap`, from `ownLines` or its own flat pool) and stores it on the login session; `POST /api/writing/line` must match the expected line in order; `POST /api/writing/skip` is admin-only (`pray skip_stage`) and is the real boundary; `POST /api/writing/complete` takes **nothing** from the body and refuses unless the server's count says finished — one-shot. The run lives in `req.session.writing` (file-backed, survives restarts). |
| OT12 | **server-owned.** `/api/ot12/session` → `/answer` → `/skip` (admin) → `/complete`; the correct set is never sent until after the answer. |
| Dummy Parse | **bounded.** `/api/parse/session` locks the build (300-point pool) and starts the clock; `/api/parse` refuses more combat time than has elapsed, a wrong duration for a timed mode, or a DPS that disagrees with the total; mode and build come from the run. **Damage total is still client-reported.** |
| Snake | **bounded.** `/api/snake/session` records the limit; `/api/snake/food` refuses outside a live run (2s grace) and rate-limits (burst 8, refill 2s); `/api/snake/complete` returns the server's count, which the results screen shows. A client can still claim pickups it didn't earn, just not unboundedly. |
| Skill check, Chess, Deathroll, Elysium, Wheel, Lottery | n/a — either no score, or fully server-refereed already. |

Finished writing runs land in **`completed.json`** (one global log, newest
first, capped at 200; each entry carries `player` and `guest: true/false`) and
notify Hermione; she reads and dismisses them in Admin → Completed
(`GET/DELETE /api/admin/writing`). Summaries work the same way in
`summaries.json` (`/api/admin/summaries`).

Say "bounded, not validated" for Snake and Dummy Parse.

### Systems (shared scripts in `public/`)

- **`audio.js`** — one AudioContext; gain per channel (music / ambience / typing) under a master; one localStorage key, cross-tab via `storage`, BroadcastChannel lock so two visible tabs don't both play. **`ambience.js`** — room tone and interface sounds on the bus (hover sounds ride the typing channel).
- **`console.js`** — backtick/`~` opens it; commands are `pray <cmd>`; bare `pray` just acknowledges ("she hears you"). **`pray login`** is the only way to Hermione's sign-in page. Also holds `CODES` — placeholder secret phrases (`her eyes`, `static`, `bleed`, `collapse`, `quiet`, `listen`) that trigger glitch/audio effects. Full command list in the `/commands` table below.
- **`dashglitch.js`** + **`glitchboot.js`** — the screen distortion: tear / dropout / bloom / contrast-crush / comb on a weighted 2.5–8s scheduler; contrast crush swaps palette variables (never the background) and inverts accent↔white. Every terminal page loads it except Elysium. **Currently `HIDDEN = true`** (see Direction above): nothing fires and the module also injects the rule that hides every scanline overlay. When live it is gated off by the photosensitive flag and the "Flashing effects" toggle.
- **`boot.js`** — the decrypt/POST cascade on a **virtual clock**: hold **Space** for 8x, **M** skips. Lines from `decrypt.json`; also plays for guests. No `[WARN]` lines, no vignette.
- **`theme.js`** — the accent colour. Writes `--c/--dim/--dim2/--accent/--glow` **inline on `<html>`** (so nothing may set `--c` on `<body>`, which out-specifies it). Load in `<head>` before the page's `<style>`. Presets: default `#00acdb`, `ed0955`, `710087`, `0bdb00`, `f7df00`, `f78400`, `ffa6c5`; guests keep it in localStorage (the `/api/theme` write 401s for them and is ignored), hermione's is saved on her record. Every game page follows the theme except Elysium.
- **`nav.js`** — injects the back chevron on `has-top-nav` pages (`/games` → dashboard, everything else → `/games`, or wherever `<body data-back>` says — `/commands` → `/admin`), runs the signed-out redirect, and honours a page's `window.__navBack()` hook (writing and skillcheck use it: mid-run back goes to the game's settings screen first). `/admin` still hand-rolls its own chevron — next to convert.
- **`notifications.js`** — the bell, **Hermione-only** (hidden for everyone else). Triggers: a finished writing run (by anyone but her), her own deathroll games.
- **`updatecheck.js`** + `GET /api/version` — `BUILD_ID` is stamped at boot; pages compare and offer a reload after a redeploy.
- **`transitions.js`** (login → dashboard covers), **`me.js`** (single-flight `/api/me` as `window.siteMe()`; a guest gets `{guest, username, isAdmin:false}`, hermione `{username, isAdmin:true, themeColor, photosensitive, createdAt, mustChangePassword}`), **`adminpanel.js`** (the whole `/admin` page).

### Dashboard (`public/dashboard.html`)
Hero title in Share Tech Mono; clock time is white; scales via root font-size
(**not** CSS `zoom` — measured: zoom doesn't rescale `vh/vw`). Grid is two
columns: `"hello clock" / "actions ."` — the balance and leaderboard columns
went with points. ENTER lists **Games · Settings** for a guest; Hermione also
sees **Admin** and **Log out** (which returns to `/`, i.e. a fresh guest
session). There is deliberately **no sign-in button**. Settings panel: Accent
swatches, Master / Music / Ambience / Typing volume + mute, Flashing effects
(hidden while effects are hidden; locked off for a photosensitive account),
password change (hers). The two
lines of copy are editable in place by Hermione (pencils) — `{name}` becomes
the guest's name.

### Identity
Everyone is a guest: `POST /api/guest` claims `guestN` from an in-memory
registry (3h idle TTL; the name's chess/deathroll games and elysium tree are
dropped with it). The front door does this automatically. **Hermione is the
only account**: `POST /api/login` compares against her record alone and
answers any other username with the same "Invalid username or password."
Her session gets `isAdmin` from `isAdmin(req)` (username === hermione). A
leftover session from a retired account is destroyed on its next `/api/me`.
`users.json` is read only for her record (password hash, theme, photosensitive
flag, notifications).

### Admin panel (`/admin`, `public/adminpanel.js`)
Tabs: **Games** (subtabs General = hover text · Multitap lines · OT12 photos
+ songs) · **Completed** (Lines
completed · Summaries handed in) · **Site content** (Decrypt lines; the Screen
glitch triggers hide while effects are hidden) · **Tools** (Commands
`/commands`). The Members tab, onboarding-intro
and questionnaire editors went with accounts.

### Editable pools

| File (under `DATA_DIR`) | What | API | Editor |
|---|---|---|---|
| `decrypt.json` | boot cascade lines | `/api/decrypt` | Site content |
| `multitap.json` | flat sentence pool (lowercase, keypad-typeable) | `/api/multitap` | Games |
| `gametips.json` | wall hover text, keyed by game name | `/api/gametips` | Games → General |
| `ot12.json` | tagged photos + songs | `/api/ot12/photos`, `/api/ot12/songs` | Games → OT12 |
| `site.json` | the dashboard's two lines, admin/guest variants | `/api/site` | pencils on the dashboard |

Non-editable data files: `users.json` (hermione's record; stale disciple
records ignored), `games.json` (chess), `deathroll.json`, `elysium.json`
(keyed by player), `parses.json`, `summaries.json`, `completed.json`
(finished writing runs), `sessions.json` + `.session-secret` (persistent
sessions: file-backed `FileSessionStore`, flushed once a second, 30-day
rolling cookie). Old `applications.json`, `questionnaire.json`, `writing.json`,
`penance.json`, `devotion.json` on the volume are orphans; nothing reads them.

### `pray` commands (`public/console.js`; mirror any change on `/commands`)

| Command | Who | Does |
|---|---|---|
| `pray` | anyone | acknowledges |
| `pray login` | anyone | opens `/login` (Hermione's sign-in); "you are already here." if she runs it |
| `pray launch <target>` | anyone | navigates; the `LAUNCH` table in `console.js` lists every game and page, with aliases (`t9`, `slots`, `dummyparse`, `tree`, `writing`, `penance`); `admin` / `commands` are hers only, checked per target |
| `pray launch list` | anyone | prints every launch target with a word each; her two only appear for her |
| `pray reload` / `pray quit` | anyone | |
| `pray skip_stage` | admin | devotion / multitap / ot12 — server-side skip |

Also in `console.js`: `CODES`, placeholder secret phrases (`her eyes`,
`static`, `bleed`, `collapse`, `quiet`, `listen`) that trigger glitch/audio
effects.

---

## Removed — do not reinstate by accident
**User accounts** (2026-09-11): registration, `/apply` + the questionnaire and
its editors, `/manage` account creation, approvals, the Members tab, disciple
logins, **points**, the **leaderboard**, **ranks** (Angel/??/Disciple/…),
**profiles** (`/profile`, `ranks.js`), the login screen (the front door
auto-guests; `/login` is reached only by `pray login`), the dashboard's
sign-in/apply button, `pray points/set_points/delete_account/manage/open`,
the tasks feature, the writing categories shelf, `/cardnav`, the
photosensitive endpoint (the flag on her record still gates effects).
**Penance** (2026-09-11): folded into Devotion — its red palette, corruption /
tear / glitch effects, difficulty picker (easy / exacting / merciless),
`penance.json` and `/api/penance/presets`. Devotion gained the custom-lines box
instead. Don't rebuild a second writing game; add to this one.
**Devotion's preset line-sets** (2026-10-19): `devotion.json`, both
`/api/devotion/presets` endpoints, the admin Devotion subtab and its editor, and
the generic `presetEditor` / `cleanPresets` helpers. The lines are typed at game
time now — don't reintroduce a stored pool for them.
Earlier: dailies and both daily bonuses; tithe; the guestbook; light/dark
toggle; the top pill nav; subliminals entirely (`glitch.js`, `subliminal.json`,
the `pray` word-flash); angelcoins; the Visitor account type; member-facing
notifications; the admin panel on the dashboard; the boot vignette and
`[WARN]` lines; edge-burn glitch; the in-site `/guide` and `/tech` pages.

## Open items
- The remaining ten CSS cards → generated posters like Devotion's (elysium and chess first; they are placeholders).
- The redesign itself: off the terminal look, single page (ThroneLogs-style). Then delete the hidden effects code and the boot. **Three arrangements are mocked up (`mockups/singlepage.html?d=1..3`) and await a pick.**
- Elysium is short of *events*, not features (ideas below).
- OT12 payout is moot now (no points); song-based questions; fill the thin member fields before a height question.
- A photosensitivity toggle in Settings for guests would have to be localStorage-only (nothing identifies them); today a fresh browser gets the effects until Flashing effects is unticked.
- `/admin` still hand-rolls its back chevron (`/commands` uses `nav.js` + `data-back`).
- Hover sounds ride the typing channel; the settings panel has no fourth slider.
- Wheel and Lottery are free-play curiosities off the wall; keep, re-card, or remove.

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
(`sandboxpass123`) plus a few legacy disciple records (`seraph` etc.,
`testtest123`) that are useful only to prove login refuses them. Hashes use
the repo's own `bcryptjs`. Only hermione's record matters.

- **Check for a leftover server first**: `lsof -nP -iTCP:57999 -sTCP:LISTEN`, kill the PID (`pkill` matches the shell wrapper and leaves node holding the socket). A stale server answers curl happily from old data.
- Only `server.js` changes need a restart; `public/` and `views/` serve fresh.
- Every page but `/` and `/login` needs a session: `POST /api/guest` (a fresh visitor to `/` does this itself) or hermione's `POST /api/login`, with a cookie jar. `/api/me` tells you who you are.
- Prefer **curl and headless Chrome** over browser-pane screenshots. `scratchpad/shot.js <url> <out.png> [w] [h] ["<js>"] [settleBefore] [settleAfter]` drives DevTools (navigate, run JS, screenshot); `public/_shot.html?u=hermione&p=sandboxpass123&go=/admin` (or `?u=guest&go=/games`) makes the session first so pages behind one can be captured; a guest boot can be skipped with a synthetic `m` keydown. `settleBefore` must outlast the login redirect. **Its eval return value often doesn't print, and the screenshot step stalls on rAF/canvas pages** (snake, elysium, mid-boot): assert via side effects + screenshot, run it backgrounded and `pkill -f shot-chrome-`.
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
| Profile | `profile.html` | chosen 10 (man page), built, then removed with accounts |
| Wheel | `wheel.html` | chosen 5 (unrolled cylinder), built |
| Game select | `select.html`, `select2.html`, `gamecards.html` | wall built; per-card designs iterated in place |
| Chess | `chess.html` | chosen 9 (ink wash), built |
| T9 → Multitap | `t9.html` | fifth attempt (RAZR V3 from reference); the built game uses the flat keypad |
| Slots → Lottery | `slots.html` | chosen 5 (scratch card), built |
| Dummy Parse | `dummyparse.html` | chosen 10 (ability cards) + 11 (timeline), built |
| Decrypt | `decrypt.html` | chosen 1 (BIOS/POST), built into `boot.js` |
| Dashboard | `dashboard.html`, `dashboard2.html` | v1 rejected; v2 (occult-terminal) never picked; current dashboard is its own thing |
| **Single page** | `singlepage.html` | **CHOSEN: 6 (split)** 2026-10-20 — the leopard frame, one main panel, a side nav that is its own surface, on glitter. The other eight stay in the file for reference: 1 column · 2 drawer · 3 plate · 4 tabs · 5 stack · 7 overlay · 8 spine · 9 dock. Each renders its own number badge so a contact sheet is readable |
| Single-page type | `singlepage.html?f=1..12` | **6 (parisienne script) KEPT as a candidate**; still awaiting a final pick. Batch one, serif+sans pairings: 1 cormorant+jost · 2 bodoni+inter · 3 fraunces+nunito · 4 italiana+montserrat · 5 playfair+karla · 6 parisienne+montserrat. Batch two, a different idea each rather than another serif: 7 pinyon (formal copperplate) · 8 cinzel (inscriptional caps) · 9 prata+dm sans (modern editorial) · 10 archivo black (heavy grotesque) · 11 quicksand only (one family, weight and size alone) · 12 oswald caps (condensed masthead). `?f=` works on any design |

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
