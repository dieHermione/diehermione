# Handoff, angeldomme

What is true now, what is left, and the habits that keep this project cheap to
work on. Rewritten 2026-07-30; earlier versions had a decade of "latest session"
layers stacked on top of each other and most of it was superseded.

> **The site is called angeldomme.** The `.me` is part of the word, not just the
> TLD: it reads "angel domme". Never write it as "angeldom" in anything a visitor
> sees. The old `ANGELDOM //` headers are gone from every page; every header now
> reads `angelOS v0.2`. Internal identifiers and the domain string are fine.

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
| `/guest` | guest landing: points at the wall, names what needs an account |
| `/guide`, `/tech` | the manual and the technical notes, both current |
| `/snake` `/writing` `/wheel` `/deathroll` `/elysium` `/chess` `/dummyparse` `/skillcheck` `/summary` | the games |

### Games
- **Snake** free-swimming, no grid. Dies on its own tail (only reachable once
  long enough). Food drifts at half speed and flees on approach.
- **Penance / Devotion** (`/writing`, `?mode=devotion`). Both take editable
  preset line-sets; Penance also keeps its own-lines box. Penance corrupts, but
  the text stays legible: the scrambled-glyph effect was removed.
- **Wheel** the unrolled cylinder. One turn a day; the spent button becomes Leave.
- **Deathroll**, **Chess**, **Elysium** need an account.
- **Chess** is ink wash. Hermione has STRIKE and REWIND (see below).
- **Dummy Parse** priest damage sim, three tabs, timed 30/60s modes ranked on a
  leaderboard.
- **Skill check** the pure dial, with a settings screen.
- **Summary** a real Wikipedia article and a word limit.

### Systems
- **`audio.js`** one context, a gain node per channel (music/ambience/typing) and
  a **master** over them. One localStorage key, cross-tab via `storage`, and a
  BroadcastChannel lock so two visible tabs do not both play continuous sound.
- **`console.js`** backtick opens it. Commands are prefixed **`pray`** (this
  replaced `wing`): `add_points`, `set_points`, `launch <game|dashboard|profile|games>`,
  `reload`, `quit`. Bare `pray` flashes a subliminal. Up/down walk history.
- **`glitch.js`** subliminal flashes. **`dashglitch.js`** screen distortion; tear
  bands also run on their own 3-11s clock, and contrast crush swaps palette
  variables rather than drawing an overlay, so it never touches the background.
- **`boot.js`** the decrypt animation and its sound. Its lines are server-stored
  and editable in the admin panel.
- **Editable text pools**, all following the same shape: `decrypt.json`,
  `subliminal.json`, `devotion.json`, `penance.json`.

### Removed, do not reinstate by accident
Dailies and both daily bonuses; tithe; tasks and essays; the guestbook; the light
/dark toggle; the top pill nav; guest as an account type.

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

### The Parse batch, requested and not started
Largest single piece of work outstanding.
- Timer starts on the **first damage**, not on Pull, so buffs can be pre-cast.
- Leaderboard needs full detail rather than dps and total.
- **Melody is replaced by Whitefire**: a channelled damaging ability, cancellable
  with Escape. New loop: casting **Smite** has a 20% chance to grant *Embracing
  Divinity*, which boosts Whitefire by 300%. Fully channelling Whitefire under it
  applies *Holy Precision*, boosting the next two Smites by 200%.
- Abilities become **visual icons** with the keybind on them and the description
  on mouseover.
- Whitefire's button glows under Embracing Divinity; Smite's under Holy Precision.
- The rotation tab wants a visual rework.

### Also requested, not started
- **Slots implementation.** Design **5** is chosen: the printed scratch card.
- **Mockups: 5 decrypt animations** on a command-line-PC-startup theme.
- **Mockups: 15 dashboards**, same terminal theme.

### Older open items
- `README.md` is stale.
- Photosensitivity has a first-visit gap: the login page reads a localStorage flag
  because it runs before anyone is identified, so a flagged account is unprotected
  on its first visit from a new browser. There is also no way to change the answer.
- Hover sounds ride the *typing* channel; the settings panel only has three.
- `nav.js` still carries dead `buildNav()` and `applyGuestNav()`.
- Handed-in summaries are stored in `summaries.json` with no admin view.
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
