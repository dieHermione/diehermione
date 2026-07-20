# angeldom.me

A small invite-only Express site: accounts, profiles, a rank ladder, a play
currency, and a handful of games. One admin account (`hermione`); everyone else
is a regular user. Deployed at [angeldom.me](https://angeldom.me) via Railway.

For architecture, storage shapes, and the bugs this codebase has already sprung,
see the `/tech` page (`views/tech.html`) — it's the deeper reference. This file
is the orientation.

## Run

```bash
npm install
npm start        # http://localhost:3000
```

Node 18+ required (the start script uses `--env-file-if-exists`). Dependencies:
`express`, `express-session`, `bcryptjs`, `chess.js`.

| Env var | Why |
|---|---|
| `PORT` | Defaults to 3000 |
| `SESSION_SECRET` | Must be set in production, or sessions reset on every deploy |
| `DATA_DIR` | Where the JSON data files live. Must point at the mounted volume in production, or data is lost on redeploy |

## Layout

| Path | What it is |
|---|---|
| `server.js` | Everything server-side: routes, storage helpers, game rules |
| `public/index.html` | Sign-in and registration. The only page without the nav |
| `public/dashboard.html` | Dailies, welcome copy, leaderboard, profile card |
| `public/site.css` | Shared: theme variables, base layout, nav and theme-toggle styles |
| `public/me.js` | Shared: single-flight `/api/me` (`window.siteMe()`) |
| `public/nav.js` | Shared: injects the nav bar and the theme toggle |
| `public/notifications.js` | Shared: injects the bell and the mail button into the nav |
| `public/ranks.js` | Shared: the rank legend modal |
| `public/pieces/` | Chess piece SVGs |
| `views/*.html` | Every logged-in page: profile, admin, tasks, guide, tech, games |

`public/` is served statically, so anything in it is reachable without a
session — nothing sensitive belongs there. `views/` is not static; those pages
are sent by routes guarded with `requireLogin`.

### The shared shell

The nav, the theme block and the CSS variables used to be copied into all
twelve pages, which made "add a nav item" a scripted sweep across every file
and was the main source of drift. They now live in three shared files, so a
page only carries what is unique to it:

```html
<link rel="stylesheet" href="/site.css" />
<script src="/me.js"></script>          <!-- no defer: page scripts use it -->
...
<script src="/nav.js" defer></script>   <!-- must precede notifications.js -->
<script src="/notifications.js" defer></script>
```

`nav.js` injects the nav only on pages whose `<body>` has `has-top-nav`, which
is what keeps the login page nav-free. Adding a nav item is now a one-line edit
to the `NAV_LINKS` or `GAMES` array in `public/nav.js`.

Page-specific variables (`--board-*`, `--wedge-*`, `--picker-*`, …) still live
on their own page, and because `site.css` loads before a page's inline
`<style>`, any page can still override the shared rules.

## Storage

No database. Six JSON files, each read and written whole, resolved against
`DATA_DIR` (falling back to the repo directory). All six are gitignored, so
local testing can't touch production data and a deploy can't overwrite it.

| File | Shape |
|---|---|
| `users.json` | `{ [lowercaseUsername]: user }` — the key is the identity |
| `games.json` | Chess games, keyed by the non-hermione player |
| `deathroll.json` | Deathroll games, keyed the same way |
| `mail.json` | Threads, keyed the same way |
| `writing.json` | Array of categories, each holding passages |
| `site.json` | The admin-editable dashboard copy |

Tasks and all per-day bookkeeping (`lastCheckIn`, `wheelDay`, `snakeDay`,
`snakeToday`) live on the user record, not in separate files.

Fields are read defensively (`user.points || 0`) because records predate most
of them. Adding a field needs no migration; removing one means tolerating stale
keys — `rankFor()` still maps the retired `role` values onto ranks.

## Auth and permissions

Passwords are bcrypt-hashed (cost 10). Sessions use `express-session` with an
in-memory store, so a restart signs everyone out.

There is exactly one permission check in the codebase: `isAdmin(req)`, true when
the session username lowercases to `"hermione"`. **Admin is an identity, not a
flag on the record**, so it can't be granted by editing data. The client hides
admin controls too, but that's cosmetic — the server is the boundary.

Two-player games are keyed by the non-hermione player, which means the key *is*
the authorisation: a regular user can only ever address their own row.

## Ranks and currency

Ranks, highest first: **Princess** (hermione's alone), an unnamed rank, then
Disciple, Worshipper, Devoted, Follower, Servant. **Visitor** and **Citizen** sit
aside as the two options at signup. Only hermione can change a rank afterwards,
including on her own profile.

**Points** are the only currency. They drive the leaderboard, and come from two
places: hermione grants them directly, and playing earns them — 5 for the daily
check-in, 1 per Snake pickup up to 20 a day, and 1–25 from one wheel spin a day.
`/api/tithe` burns 5. Hermione keeps no points of her own.

Points and an earned "dollars" balance used to be separate; they were merged
1:1, so the leaderboard now reflects earned points as well as granted ones.
`migrateDollars()` folds any leftover balance in on load.

Two of the three earned sources are browser-reported, so Snake is bounded by a
daily cap plus a token bucket rather than trusted. The wheel and deathroll pick
their outcomes server-side.

**Everything daily resets at noon America/New_York, not midnight.** `todayKey()`
returns the `YYYY-MM-DD` label; compute day keys no other way, since a plain
`toISOString().slice(0,10)` disagrees with it for twelve hours out of every day.

## Games

| Game | Where the logic lives |
|---|---|
| Chess | Server, via `chess.js` — legality, checkmate and FEN validated server-side |
| Deathroll | Server — RNG, turn order, the losing roll |
| Wheel | Server picks the weighted wedge; the client animates to the returned index |
| Snake | Client — the loop is local; only payouts touch the server |
| Writing | Split — passages from the server, typing checked locally |

Chess is currently hidden from the nav but still fully wired up.

## Pages

`/` · `/dashboard` · `/profile` · `/tasks` · `/snake` · `/wheel` · `/deathroll` ·
`/writing` · `/chess` · `/guide` · `/tech` · `/admin` (hermione only)

## API

Everything under `/api` returns JSON and answers `401` when signed out.

| Route | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Create account (username 3–30, password ≥ 8, pronouns, signup rank) |
| `/api/login` · `/api/logout` | POST | Sign in / out. Login also runs check-in and seeds notifications |
| `/api/me` | GET | Identity, points, and the once-per-day check-in result |
| `/api/ranks` | GET | The ladder, plus which ranks are assignable |
| `/api/profile/:username` | GET · PUT | PUT is owner-or-admin; rank is admin-only |
| `/api/users` | GET | All accounts — admin only |
| `/api/users/:username/points` · `/flag` | POST | Grant points, toggle leaderboard flag — admin only |
| `/api/users/:username` | DELETE | Remove an account — admin only |
| `/api/leaderboard` | GET | Flagged users ranked by points, hermione excluded |
| `/api/dailies` | GET | Daily objectives with done state and progress |
| `/api/tithe` | POST | Burns 5 points; refuses below 5 |
| `/api/wheel` · `/api/wheel/spin` | GET · POST | Server picks the wedge and awards it |
| `/api/snake/food` | POST | Rate-limited and daily-capped payout |
| `/api/writing[/:id]` | GET · PUT | List hides passages; PUT is admin only |
| `/api/chess/{game,games,move,remove,reset}` | GET · POST | Moves validated server-side |
| `/api/deathroll/{game,games,start,roll}` | GET · POST | Turn order enforced server-side |
| `/api/mail` | GET · POST | Reading a thread marks its messages seen |
| `/api/notifications` | GET · DELETE · POST | GET also carries `mailUnread` |
| `/api/site` | GET · PUT | Dashboard copy; PUT admin only |
| `/api/tasks` | GET | The signed-in user's task list |

## Known limits

- Sessions are in-memory — every restart signs everyone out.
- JSON files have no transactions and don't scale. Fine for a handful of
  accounts; swap for a database before it's more.
- Avatars are base64 inside `users.json`, so they're shrunk to 256px.
- Snake and Writing are client-refereed.
- No rate limiting on login.

## Credits

Chess piece images are the "Cburnett" set by Colin M.L. Burnett, from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
(CC BY-SA 3.0), in `public/pieces/`.
</content>
</invoke>
