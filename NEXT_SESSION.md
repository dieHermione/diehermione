# Next session

Written 2026-08-05, at the end of a long session. Everything described as done is
committed and pushed to `main`. Read `HANDOFF.md` first — it holds the durable
rules; this file is only "where we stopped".

---

## Unfinished: the rest of the current batch

Four items from the last request were **not started**. They are the whole of
what's left.

### 1. Guide + Tech back button → `/admin` for Hermione
`/guide` and `/tech` currently send everyone back the same way. For Hermione they
should return to the **admin panel** (she reaches them from Docs & tools), while
everyone else keeps the normal destination. `nav.js` injects the shared back
chevron and already calls `siteMe()`, so the `isAdmin` branch belongs there or in
a per-page `window.__navBack` hook (the writing game is the worked example of the
hook).

### 2. `/commands` back button is hand-rolled
`views/commands.html` builds its own back link instead of using the site-wide
chevron that `nav.js` injects. **Reformat it in the style of `/guide`** — i.e.
delete the bespoke markup, give `<body>` the `has-top-nav` class and let `nav.js`
provide the button. This is the "we do not create them like this" fix.

### 3. `pray launch list` + full launch coverage
In `public/console.js`, `PRAY.launch` has a `GAMES` map of name → href.
- Add a `list` argument that prints **every** page on the site.
- Add launch entries for pages currently missing them (`/ot12`, `/t9`, `/manage`,
  `/commands`, `/apply`, `/guide`, `/tech`, …).
- **`admin` must only launch for Hermione.** The console's `admin: true` flag
  gates a whole command, so a per-target check is needed inside `launch` — and
  note `/admin` already redirects non-admins server-side, which is the real
  boundary; the console check is only cosmetic.
- `/commands` is hand-maintained: add anything new there too.

### 4. OT12 photo pool has no bulk/edit affordances
Not requested, just noticed: photos can only be added and deleted, not re-tagged.
If Hermione mis-tags one she has to delete and re-upload.

---

## Watch out for these (learned the hard way this session)

- **Scripted string replacements fail silently.** I broke the OT12 photo aspect
  ratio exactly this way: the replacement targeted a string an earlier commit had
  already changed, so it no-opped, and the commit message claimed a fix that
  wasn't there. When editing with a node script, **assert the replacement landed**
  (`if (s === before) throw`) or grep for the result afterwards.
- **`theme.js` writes `--c` inline on `<html>`.** Nothing may set `--c` on
  `<body>` — that out-specifies it and breaks theming for the whole page. The old
  skill-check `applyMode()` did this.
- **CSS `zoom` does not rescale `vh`/`vw`.** Measured: a 94vw/100vh layout
  overflowed to 2026px on a 1512px screen. The dashboard scales via root
  font-size instead; don't "simplify" it back to `zoom`.
- **`shot.js` eval return values don't print**, and it stalls on rAF/canvas pages.
  Verify via side effects + screenshot. Async work in an eval may not finish
  before the capture — the settle argument has to cover it.

---

## State of the games

| Game | Run validation | Theme | Card |
|---|---|---|---|
| Penance / Devotion | **server-owned** (session/line/skip/complete) | untouched by request | real |
| Multitap | **server-owned** (same endpoints, `mode: multitap`) | themed | real |
| Snake | run bounded (time limit + live-run check), not simulated | themed | real |
| Dummy Parse | run bounded (build locked, clock + consistency checks) | themed | real |
| OT12 | server-owned (session/answer/complete) | themed | **placeholder** |
| Skill check | n/a | themed (both difficulties) | real |
| Elysium | n/a | not themed | **placeholder** |

Snake and Dummy Parse are **bounded, not validated** — a client can still claim
some unearned progress, just not unboundedly. Say it that way; don't call them
validated.

---

## OT12 specifically

- Photos are **Hermione-uploaded only** — deliberately no automated image source
  (they're other people's copyrighted photos). Don't add scraping.
- `OT12_MEMBER_DATA` in `server.js` holds the per-member table for future trivia.
  Complete for name/hangul/location/reveal month/animal/colour/plant.
  **superpower, birthdate and height are 1 of 12** — a height-range question
  cannot be generated yet.
- Field values are **not unique** (reveal month, eye colour, shape, location each
  cover several members), so a multiple-choice generator must not assume one right
  answer. Missing fields are `undefined`; a generator must skip, never invent.
- The current game is one mode ("who is in this photo"); it was built expecting
  more modes later.
