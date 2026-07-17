# Simple Auth Test Site

Minimal Express site with registration, login, and a placeholder dashboard.

## Run

```bash
npm install
npm start        # http://localhost:3000
```

Set `PORT` and `SESSION_SECRET` env vars in production-ish deployments.

## How it works

- `server.js` — Express server. Passwords hashed with bcrypt; sessions via
  `express-session` (in-memory store, so a restart logs everyone out).
- `users.json` — flat-file user store, created on first registration.
  Fine for testing; swap for a real database before anything serious.
- `public/index.html` — combined login/register screen.
- `public/dashboard.html` — placeholder page shown after login; `/dashboard`
  redirects to `/` if you're not signed in.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Create account (username 3–30 chars, password ≥ 8) |
| `/api/login` | POST | Sign in |
| `/api/logout` | POST | Sign out |
| `/api/me` | GET | Current session user |
