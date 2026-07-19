# angeldom.me

Express site with registration, login, user profiles, and a couple of games.
Deployed at [angeldom.me](https://angeldom.me) via Railway.

## Run

```bash
npm install
npm start        # http://localhost:3000
```

Set `PORT` and `SESSION_SECRET` env vars in production-ish deployments.
Set `DATA_DIR` to keep `users.json` and `games.json` on a persistent volume.

## How it works

- `server.js` — Express server. Passwords hashed with bcrypt; sessions via
  `express-session` (in-memory store, so a restart logs everyone out).
- `users.json` — flat-file user store, created on first registration.
  Fine for testing; swap for a real database before anything serious.
- `public/index.html` — combined login/register screen. Registration collects
  pronouns and a domme/sub role.
- `public/dashboard.html` — dashboard with leaderboard and profile summary.
- `views/profile.html` — user profiles; editable by the owner or by hermione.
- `views/admin.html` — account management, hermione only.
- `views/chess.html`, `views/snake.html` — games.

The `hermione` account is the admin: it grants points, manages accounts, plays
black in chess, and can edit any profile.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Create account (username 3–30 chars, password ≥ 8, pronouns, role) |
| `/api/login` | POST | Sign in |
| `/api/logout` | POST | Sign out |
| `/api/me` | GET | Current session user |
| `/api/profile/:username` | GET | View a profile |
| `/api/profile/:username` | PUT | Edit a profile (owner or hermione) |
| `/api/leaderboard` | GET | Flagged users ranked by points |
| `/api/users` | GET | All accounts (hermione only) |

## Credits

Chess piece images are the "Cburnett" set by Colin M.L. Burnett, from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
(CC BY-SA 3.0), in `public/pieces/`.
