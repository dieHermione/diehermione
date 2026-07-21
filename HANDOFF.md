# Handoff, angeldom.me

Start the next session by reading `/tech` (`views/tech.html`) and `README.md`.
They are the architecture + orientation. This file is the running handoff:
what's true now, what's left, and the habits that keep this project cheap to
work on.

---

## Original handoff (kept verbatim, for continuity)

> Working tree is clean and everything's deployed.
>
> **Point at the docs.** Open with "Read `/tech` and README.md, then …". The
> Traps section is six bugs that already cost real debugging time; a session
> that reads it won't re-spring them.
>
> **The one thing to fix before features:** the nav and theme block were copied
> into 11–12 files. That was the dominant cost of every change. Use the
> `notifications.js` self-injecting pattern for the nav itself and move the CSS
> variables into one `public/site.css`. *(DONE, see below.)*
>
> **Second:** `server.js` is large. Splitting it by domain (auth, currency,
> games, mail) would make future sessions cheaper to orient in. *(NOT done.)*
>
> **Change how testing works.** Don't swap hermione's password hash to test as
> her, that's how her local avatar got destroyed. Use a permanent test account
> or a sandbox. *(DONE, sandbox approach, see below.)*
>
> **Still open (from that session):** mail page *(built then removed, see
> below)*; local avatar re-upload; the `lestbrump` account in local data; the
> Windows tofu fix; whether the meow survives autoplay rules. The 15-second
> delete timer fires if you walk away, consider requiring a final click.
>
> **What worked well:** pushing after each milestone; server-authoritative games.

---

## Where the project is now

Live at **angeldom.me** (Railway, auto-deploys on push to `main`). Single
Express server, no DB, JSON files on disk, no build step. One admin identity:
`hermione`.

### Shared shell (the duplication fix landed)
Nav, theme, and CSS variables now live in shared files, injected/linked:
- `public/site.css`, theme variables (`:root` + `body[data-theme="dark"]`),
  base layout, the nav bar, the theme toggle, the `[hidden]{display:none
  !important}` guard, and the `.card.princess-glow` halo.
- `public/me.js`, single-flight `/api/me` as `window.siteMe()`. **Never call
  `/api/me` directly**; racing callers eat the once-a-day check-in.
- `public/nav.js`, injects the nav + theme toggle; nav only on pages with
  `<body class="has-top-nav">`. **Adding a nav item is one line** in its
  `NAV_LINKS` / `GAMES` arrays.
- `public/notifications.js`, injects the bell; polls every 15s. Must load
  *after* nav.js (both `defer`, document order is the mechanism).
- `public/ranks.js`, the rank legend modal.

Load order in every logged-in page: `site.css`, then `me.js` (no defer), then
`nav.js` + `notifications.js` (defer).

### Currency & dailies
- **Points are the only currency** (dollars were merged 1:1; `migrateDollars()`
  runs in `loadUsers()`). Both admin-granted and earned.
- Earned: 5 daily check-in; **Snake pays 1/food with no cap** and a **+10
  completion bonus** for eating 20 in a day; wheel 1–10 (low-weighted); the
  daily "Write for Princess" pays on the first Lines/Writing series of the day.
- **Tithe is a daily obligation.** `settleTithe()` docks 25 if you miss a day
  (unless already negative, then suspended and the button disables until you're
  back to ≥0). Tithing itself burns 5 and is once/day. *(Note: the pending list
  wants this relaxed so users can tithe repeatedly and the "tithed today" lock
  removed, see Pending.)*
- **Everything daily resets at noon America/New_York.** `todayKey()`. Compute
  day keys no other way.

### Tasks (Hermione-assigned) vs the Writing/"Lines" minigame
- **Assigned tasks** live on the user record. Two types: **essay** (min word
  count; hand-in → review queue; she accepts→pays or sends back with a note) and
  **repetition/"write it out"** (a line typed N times; auto-completes). Rewards
  set explicitly at assignment (no default). `/task?id=` is the doing surface.
- **The Writing minigame** (categories of passages, standalone) requires **50
  passages** to finish (loops/reshuffles the category); only Hermione gets an
  Exit-early button. Finishing shows a results screen (passages · mistakes ·
  time), logs to her admin "Writing results" panel, and notifies her, never for
  her own runs. Categories seed to disk once, then `writing.json` is
  authoritative (edits can't be reverted by the in-code defaults). Category
  titles accept unicode; categories have an optional description shown as a
  hover tooltip.

### Profiles
- Stats tiles: food eaten, letters typed, writing tasks, custom tasks (hidden
  for Hermione, who keeps none). Points hidden for Hermione.
- **Princess (Hermione) profile has a white glow**, `.card.princess-glow` in
  site.css, toggled on both `/profile` and the dashboard card.
- **Guestbook**: second tab on every profile. Any approved account may comment;
  owner / author / Hermione may delete. Stored on the owner's record.
- **Embed mode**: `/profile?embed=1` hides nav + toggle; the admin panel iframes
  it to show Hermione's live profile on the right (always in sync). Logout from
  it targets `window.top` so it lands on the real login screen.

### Admin panel
Two columns above 1040px: cards left, Hermione's profile embedded right.
Sections: pending approvals, accounts (with a reveal-on-click points input that
respects a +/- toggle), review queue (submitted essays), tasks (assign +
assigned list), writing results, documentation (bottom).

### Registration & approval
Invite-only. Registering does **not** sign you in, the account is `pending`
until Hermione approves from the admin panel. The pending check runs *after*
the bcrypt compare so it can't enumerate accounts. Requires a "who are you?"
intro. Ranks: Princess (hers), an unnamed rank, Disciple→Servant, plus Visitor
and Citizen (signup options).

### Data files (all gitignored, on a Railway volume in prod)
`users.json`, `games.json` (chess), `deathroll.json`, `writing.json`,
`site.json`. Mail was removed but `mail.json` is still gitignored on purpose (a
stale file could hold real messages). Chess is fully wired but hidden from the
nav.

---

## How to test (do this, don't mutate the real account)

A permanent sandbox lives at
`scratchpad/sandbox/` (its own `DATA_DIR`) with a seeded `hermione`
(password `sandboxpass123`) plus `applicant`/`gotest` (`testtest123`) and a
pending `uitest`. Run:

```
DATA_DIR=<scratchpad>/sandbox PORT=57999 SESSION_SECRET=sandbox node server.js
```

Then log in via `/api/login` and drive it. **Prefer curl / `javascript_tool`
DOM+JSON checks over browser screenshots**, screenshots are the single biggest
token cost and most things (points math, tithe branches, wheel weights, stat
accrual, guestbook auth) verify as one-line text. Screenshot only when a visual
genuinely needs eyes (glow, layout, the cloud nav).

The real `users.json` has **not** been touched this session. If you ever must,
snapshot it first, a wholesale "restore" is what destroyed the avatar.

Browser automation note: `computer{type}` dispatches **no** keydown events, so
it can't drive the document-level typing games (Writing/repetition). Use
synthetic `KeyboardEvent`s (`dispatchEvent`) instead.

---

## Recurring traps (all in `/tech`, all have bitten more than once)

- **`hidden` loses to `display`.** A component with its own `display` ignores
  the `hidden` attribute. Fixed globally with `[hidden]{display:none!important}`
  in site.css, but it has leaked the admin link, the deathroll picker, and a
  points counter before that existed.
- **Hover-revealed controls need a bridge.** A control offset from the thing
  that reveals it drops `:hover` mid-travel and can't be reached. Use a
  transparent `::after` bridge; reveal with `opacity`, not `display`.
- **One `/api/me` per page** via `siteMe()`. Independent callers race the
  once-a-day check-in.
- **CSS source order:** page inline `<style>` loads *after* `site.css`, so a
  shared `.card` rule loses to a page's `.card`. Use a compound selector
  (`.card.princess-glow`) to win.
- **Bulk edits:** Python with explicit string replacement, not `perl -pi -e`.
  Have the script *report* what it doesn't recognise. A rule's preceding comment
  is not part of its selector.
- **No em dashes anywhere** (user preference). The two in
  `.claude/settings.local.json` are allowlist entries, left alone.

---

## Lessons and mistakes from this session (read before repeating them)

- **The cloud nav is unsolved and shelved.** Two attempts failed: box-shadow
  "puffs" on `.top-nav::before/::after` either sat *on top of* the bar or left
  large uncovered stretches, and offsets in px don't scale with the
  `min(100%,720px)` width. What the user actually wants: the **entire** bar
  reads as one cloud (puffs wrapping the whole perimeter, sides included), while
  the nav stays functionally the plain pill (left buttons, right bell). Consider
  an SVG cloud background or a mask instead of scattered box-shadows, and
  verify at real desktop width. It is reverted to the plain pill for now.
- **`margin` on an inline element does nothing.** The dashboard welcome spacing
  "fix" silently failed the first time because the margin was on an inline
  `<span>`; it had to move to the block heading. Check `display` before trusting
  a margin.
- **Glow/box-shadow inside an iframe gets clipped at the frame edge.** The admin
  profile embed needed body padding in embed mode so the halo had room. Any
  outward shadow on iframed content needs interior padding.
- **Logout inside an iframe must target `window.top`.** Otherwise it navigates
  the frame to `/` and a login card appears inside the box.
- **Verify deploys, don't assume.** A push can land on GitHub while Railway lags
  or stalls (it happened this session, via a GitHub incident). Confirm what's
  live by fetching a static asset for a version marker, e.g. WebFetch
  `angeldom.me/site.css` and check whether a recently added/removed selector is
  present. WebFetch caches per-URL for 15 minutes.
- **`git push` output can be trusted, but confirm anyway.** `git rev-parse HEAD`
  vs `origin/main` after `git fetch` is the definitive check when asked "did you
  push?".
- **Read the user's exact intent on UI details.** The points input was built as
  reveal-on-click; the user wanted a *dropdown* that hides again, labelled
  "Custom". First interpretation was wrong. Same with the cloud.
- **Testing gotchas:** Snake's token bucket (8 burst, 1/2s) 429s a rapid loop,
  so stage `snakeToday` directly instead of hammering it. When testing a task by
  type, filter to the *exact* task (an older active one with different text
  fails the match silently). `computer{type}` sends no keydown, so drive the
  typing games with synthetic `KeyboardEvent`s.
- **Don't document a pending rename.** "Writing" -> "Lines" is still pending;
  the docs and code both say "writing" until that lands. Renaming docs early
  makes them lie.
- **Screenshots are the dominant token cost.** This session got far more
  efficient once verification moved to curl/JSON and DOM queries, screenshotting
  only genuinely visual things. Keep doing that.

## Pending, the batch that was in flight when this handoff was written

The user gave a large list; these are **not done** (tracked in the task list):

1. **Wheel restyle (light mode):** pink → the button pink; text white with a
   black stroke; remove the "Spinning…" text. Also make the wheel animation +
   payout take **10 seconds longer**.
2. **Custom points input:** make it a *dropdown* (not inline to the left), that
   *hides again* after use, labelled **"Custom"**, with the input + dropdown
   stylized. (A reveal-on-click version exists but isn't what was wanted.)
3. **Nav:** drop the **Profile** button for Hermione (Admin already shows her
   profile).
4. **Admin accounts:** remove the Show/Hide buttons; make the **Listed indicator
   itself** the toggle.
5. **Writing daily reward → 50 points** (`WRITING_DAILY_POINTS`, currently 5).
6. **Rename "Writing" → "Lines" everywhere.** Move it out of the Games dropdown
   into the main nav, to the right of Profile.
7. **Segment Lines categories:** first 3 = "Daily", 4th = "Devotionals".
8. **Move Deathroll** out of Games into a new **"Gamble"** dropdown next to Games.
9. **Registration:** replace "Citizen" with **"Sub"**; Visitor tooltip → "Test
   site functions or look around without obligations."; the other (Sub) tooltip
   → "Worship your Princess. :3"; remove the flavor text from the "Who are you?"
   box; change the invite line to "This site is invite only. Each account is
   manually approved."
10. **FAQ panel** beneath the registration card (passwords hashed, point system,
    etc., placeholder text is fine, user will edit).
11. **task.html:** remove "Start this line again"; change "Handed in, {n} words.
    Hermione will read it." → **"Submitted to Hermione."**
12. **Tithe:** remove the "tithed today" lockout so normal users can tithe
    repeatedly; change the review button "Accept, pay N" → **"Accept."**
13. **Admin Tasks:** make the "Assigned" list **collapsible**.
14. **Admin:** rename "Writing results" → **"Lines Completed"**.

Also still owed per the user: **a full documentation pass** (README + `/tech`)
once the above lands, and the **cloud nav** was explicitly shelved (two attempts
looked wrong, puffs sat on top of the bar / left gaps; the user wants the
*entire* bar to read as a cloud with the puffs attaching around it, nav function
unchanged). It's reverted to the plain pill for now.

## Older open items still unverified
- Windows tofu fix (needs a real Windows Chrome).
- Meow autoplay survival on a fresh load (needs a real person).
- `lestbrump`, an unexplained account that was in local data.
