# angeldomme

> The site is called **angeldomme** — the `.me` is part of the word ("angel
> domme"), not just the TLD. In anything a visitor sees, write `angeldomme` or
> the full domain `angeldom.me`, never bare `angeldom`. Every page header reads
> `angelOS v0.2`.

A small invite-only Express site: accounts, profiles, a rank ladder, points, and
a handful of games. One admin identity (`hermione`); everyone else is a disciple.
Deployed at [angeldom.me](https://angeldom.me) via Railway (auto-deploys on push
to `main`). One `server.js`, no database, JSON files on disk, **no build step.**

The deeper references, and the ones kept current, are **`HANDOFF.md`** (start
here), then the in-app **`/guide`** and **`/tech`** pages. This file is the
orientation.

## Run

```bash
npm install
npm start        # http://localhost:3000
```

Node 18+ (the start script uses `--env-file-if-exists`). Dependencies: `express`,
`express-session`, `bcryptjs`, `chess.js`.

| Env var | Why |
|---|---|
| `PORT` | Defaults to 3000 |
| `SESSION_SECRET` | The cookie signing key. Optional now — if unset, a key is generated once and persisted to `DATA_DIR/.session-secret` so it survives restarts. Set it explicitly in production if you prefer. |
| `DATA_DIR` | Where the JSON data files live. Must point at the mounted volume in production (`/data` on Railway), or data is lost on redeploy. |

## Sessions persist across restarts

Sessions used to be in-memory with a random-per-boot secret, so every deploy
logged everyone out. Now:

- the secret is stable (env var, else a key persisted to `DATA_DIR`), and
- session records live in a small **file-backed store** (`DATA_DIR/sessions.json`,
  `FileSessionStore` in `server.js`) instead of memory.

So a login survives restarts and redeploys. Cookies last 30 days and roll forward
on activity. Single-instance only (the store is one process's map flushed to one
file); that matches how this is deployed.

## Layout

| Path | What it is |
|---|---|
| `server.js` | Everything server-side: routes, storage helpers, game rules, the session store |
| `public/index.html` | The login page — login only. The only page without the shared shell |
| `public/dashboard.html` | Welcome copy, clock, control list, balance, leaderboard |
| `public/me.js` | Shared: single-flight `/api/me` (`window.siteMe()`) |
| `public/nav.js` | Shared: injects the back-to-dashboard/games chevron (the old pill nav and theme toggle are gone) |
| `public/notifications.js` | Shared: injects the notification bell (Hermione-only) |
| `public/adminpanel.js` | Builds the tabbed `/admin` panel |
| `public/audio.js` · `ambience.js` | The audio graph and ambient sound |
| `public/dashglitch.js` · `glitchboot.js` · `boot.js` | Screen distortion effects and the boot/decrypt animation |
| `public/pieces/` | Chess piece SVGs |
| `views/*.html` | Every page behind a route: games, profile, admin, manage, guide, tech, apply, onboarding |

`public/` is served statically, so nothing sensitive belongs there. `views/` is
not static; those pages are sent by routes guarded with `requireLogin` /
`requirePlayer`. Files matching `public/_*.html` are gitignored throwaway test
harnesses and never deploy.

### The shared shell

Pages that carry `has-top-nav` on their `<body>` get the shared back button and
the signed-out redirect gate. That gate is what keeps the login page chrome-free.

```html
<script src="/me.js"></script>          <!-- no defer: page scripts use it -->
...
<script src="/nav.js" defer></script>   <!-- must precede notifications.js -->
<script src="/notifications.js" defer></script>
```

Many pages are otherwise self-contained (their own inline `<style>` and palette),
by design — there is no site-wide `site.css` dependency for most of them.

## Storage

No database. Each JSON file is read and written whole, resolved against
`DATA_DIR` (falling back to the repo directory). All are gitignored, so local
testing can't touch production data and a deploy can't overwrite it.

| File | Shape |
|---|---|
| `users.json` | `{ [lowercaseUsername]: user }`, the key is the identity |
| `games.json` · `deathroll.json` | Chess / deathroll games, keyed by the non-hermione player |
| `writing.json` | Finished writing-series logs |
| `parses.json` · `summaries.json` | Dummy-parse runs / handed-in summaries |
| `applications.json` | `/apply` questionnaire submissions |
| `elysium.json` | The Elysium tree state |
| `site.json` | Admin-editable dashboard copy (about / purpose) |
| `decrypt.json` · `devotion.json` · `penance.json` · `questionnaire.json` | Editable text pools (boot lines, writing presets, `/apply` option sub-text) |
| `sessions.json` · `.session-secret` | The persistent session store and its signing key |

**Editable pools are file-first:** `load*()` reads the file and only falls back to
the built-in `*_DEFAULTS` when the file is missing, so Hermione's edits always win
over code defaults. Any new editable pool must copy this shape **and** have its
`/admin` editor fetch the server value before rendering — never seed an editor
from a client-side constant. (That was the "removed lines came back" bug.)

## Auth and permissions

Passwords are bcrypt-hashed (cost 10). There is one permission check:
`isAdmin(req)`, true when the session username lowercases to `"hermione"`. **Admin
is an identity, not a flag on the record**, so it can't be granted by editing
data. The client hides admin controls too, but that's cosmetic — the server is
the boundary. Two-player games are keyed by the non-hermione player, so the key
*is* the authorisation.

**No self-serve registration.** Applicants fill the account-less questionnaire at
`/apply` (Discord handle + questions) → `applications.json`. Hermione reviews them
in `/manage` and creates disciple accounts by hand with a dummy password and
`mustChangePassword`; first login forces a password change.

Chess is the worked example of hiding vs. access control: the admin-only extras
live behind a route that **404s** (not 403s) for everyone else, so the opponent's
page has no markup to find — but the real boundary is the `isAdmin` check on every
endpoint.

## Ranks and currency

One admin rank, **Princess** (hermione's alone), then a disciple ladder. The
**Visitor** account type was retired and folded into disciple; guests cover that
role. Only hermione changes a rank.

**Points** are the only currency (angelcoins were removed from UI and payouts).
They drive the leaderboard, which lists only accounts flagged for it, hermione
excluded. Points come from hermione granting them directly and from play — e.g.
Snake pickups (client-refereed, so daily-capped and token-bucketed) and one wheel
spin a day. **Everything daily resets at noon America/New_York**; use `todayKey()`
for day labels, never a plain `toISOString().slice(0,10)`.

## Games

Reached from `/games`, the wall with one bespoke card per game (the dashboard no
longer lists them individually).

| Game | Route | Where the logic lives |
|---|---|---|
| Snake | `/snake` | Client; free-swimming, no grid. Only payouts touch the server. Shift/2nd-finger to boost |
| Penance / Devotion | `/writing`, `?mode=devotion` | Split. Presets from the server, typing checked locally. Penance is red; devotion is blue and needs an account |
| Wheel | `/wheel` | Server picks the weighted wedge; client animates to it |
| Lottery | `/lottery` (`/slots` alias) | Instant scratch card |
| Deathroll | `/deathroll` | Server: RNG, turn order, the losing roll. Needs an account |
| Chess | `/chess` | Server via `chess.js`. Hermione has STRIKE and REWIND |
| Dummy Parse | `/dummyparse` | Client priest-damage sim; versioned (`GAME_VERSION`) |
| Skill check | `/skillcheck` | The dial, with a settings screen |
| Summary | `/summary` | A real Wikipedia article and a word limit; hand-ins are reviewable in `/admin` |
| Elysium | `/elysium` | A tended tree (`elysium-engine.js`) |

## Pages

`/` · `/dashboard` · `/games` · `/profile` · `/guest` · `/apply` ·
`/admin` (hermione) · `/manage` (hermione) · `/commands` (hermione) · `/guide` ·
`/tech` · plus the game routes above.

## API

Everything under `/api` returns JSON and answers `401`/`403` when signed out or
unauthorised. Admin-only routes (accounts, points/flag, writing history, the
editable pools, handed-in summaries) all re-check `isAdmin` server-side. See
`server.js` for the full list — key ones: `/api/login` · `/api/logout` ·
`/api/me` · `/api/leaderboard` · `/api/site` · `/api/{decrypt,devotion,penance,questionnaire}` ·
`/api/admin/{applications,summaries}` · the per-game endpoints.

## Known limits

- JSON files have no transactions and don't scale — fine for a handful of
  accounts; swap for a database before it's more.
- Avatars are base64 inside `users.json`, shrunk to 256px.
- Snake, Writing and Dummy Parse are client-refereed.
- No rate limiting on login.
- The session store is single-instance (one process, one file).

## Credits

Chess piece images are the "Cburnett" set by Colin M.L. Burnett, from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
(CC BY-SA 3.0), in `public/pieces/`.
