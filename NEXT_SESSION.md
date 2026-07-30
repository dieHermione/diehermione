# Prompt for the next session

Copy the block below into a fresh session.

---

Hi Claude :3 New context window. This is the **angeldomme** project (the `.me` is
part of the word, it reads "angel domme"). Railway auto-deploys on push to `main`;
one Express `server.js`, JSON files on disk, no build step; the admin identity is
`hermione`.

**Read `HANDOFF.md` first** - it was rewritten on 2026-07-30 and is current, not a
pile of layered session notes. Then `mockups/README.md` for which designs are
chosen. `/guide` and `/tech` were also rewritten and are accurate; only
`README.md` is still stale.

## Before you touch anything

Reseed the sandbox (it does not persist) and run it on :57999:

```
DATA_DIR=<scratch>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

Write a seed script that hashes with the repo's own `node_modules/bcryptjs` and
seeds `hermione` (Princess, `sandboxpass123`), two approved subs, a Visitor and one
`status:"pending"` user, each with `passwordHash`, `status`, `pronouns` and
`createdAt`.

**Check for a leftover server first.** One from an earlier session holds the port,
your new one dies with EADDRINUSE, and curl answers from the stale data.
`lsof -nP -iTCP:57999 -sTCP:LISTEN` and kill that PID; `pkill` only gets the shell
wrapper and leaves node holding the socket.

**Do not trust the Browser pane for layout.** It reported a 0x0 viewport for two
entire sessions. DOM and JSON checks through `javascript_tool` are fine; every
width, height and screenshot lied. Rebuild these two straight away, they pay for
themselves within the hour:

- `scratchpad/shot.js` - drives headless Chrome over the DevTools protocol:
  navigate, run arbitrary JS (click a tab, drive a game with synthetic
  `KeyboardEvent`s, catch an animation mid-frame), then screenshot. Signature
  `node shot.js <url> <out.png> [w] [h] ["<js>"] [settleBefore] [settleAfter]`.
  `settleBefore` must outlast the login redirect or the eval is discarded with its
  context.
- `public/_shot.html` - logs in and redirects so authenticated pages can be shot.
  `?u=seraph&p=testtest123&go=/chess`, or `?u=guest`. `.gitignore` already covers
  `public/_*.html`.

Only `server.js` changes need a restart. **No em dashes anywhere.** Push after each
chunk of work rather than batching, and pull/rebase first: the repo may be edited
via Replit.

## What I want, in this order

**1. Dummy Parse.** The biggest piece, all of it outstanding:
- The timer starts on the **first damage**, not on Pull, so buffs can be pre-cast.
- The leaderboard needs full detail, not just dps and total.
- **Melody is replaced by Whitefire**: a channelled damaging ability, cancellable
  with Escape. Casting **Smite** has a 20% chance to grant *Embracing Divinity*,
  which boosts Whitefire's damage by 300%. Fully channelling Whitefire while it is
  up applies *Holy Precision*, boosting the next two Smites by 200%.
- Turn the abilities into **visual icons** carrying the keybind, with the
  description on mouseover.
- Whitefire's button glows while Embracing Divinity is up; Smite's glows while
  Holy Precision is up.
- Rework the rotation tab visually.

**2. Slots.** Build it. Design **5** is chosen: the printed scratch card
(`mockups/slots.html?d=5`). Uses angelcoins. Symbols are still placeholder glyphs.

**3. Mockups: 5 decrypt animations**, themed as a command-line PC startup.

**4. Mockups: 15 dashboards**, same terminal theme as now.

## Things worth knowing before you start

- Dailies, both daily bonuses, the tithe, tasks and the guestbook are all **gone**.
  Do not reinstate them by accident.
- Every game is reached from `/games`; the dashboard only links to the wall.
- Console commands are prefixed **`pray`**, not `wing`.
- Every page header reads `angelOS v0.2`. `ANGELDOM` is gone and should stay gone.
- Chess is the pattern for anything only Hermione can do: the code lives in a file
  behind a route that **404s** for everyone else so the other player's page has no
  trace of it, *and* the endpoints check `isAdmin` on every call. The split is
  about not spoiling the game; the server check is the actual boundary.
- If I reject a mockup batch as "the same design again", change the organising
  idea rather than the palette. If it is a physical object, **ask me for a
  reference photo** instead of guessing: T9 took five attempts and the first four
  were spent inventing a phone.
