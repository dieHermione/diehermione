# Mockups

Design exploration for the angeldom.me reskin. **Nothing in here is wired to
anything.** These are parameterised single-file pages: one file per surface, one
design per `?d=N`.

They live here rather than in `public/` on purpose. `.gitignore` has
`public/_*.html`, so anything in `public/` is untracked and would have been lost
between sessions. Files here are tracked, and because they are outside `public/`
they are never served and cannot deploy.

## Viewing

They are self-contained and render off `file://`, so no dev server is needed:

```bash
open "mockups/chess.html?d=2"
```

To regenerate every PNG (they are not committed, being large and regenerable):

```bash
./mockups/capture.sh
```

That writes `mockups/out/<batch>-<NN>.png` at 1500x900. One batch only:
`./mockups/capture.sh out dummyparse`.

## Status

| Batch | File | Designs | Status |
|---|---|---|---|
| Profile | `profile.html` | 10 | **awaiting a pick** (second attempt; first 5 rejected) |
| Wheel | `wheel.html` | 5 | **CHOSEN: 5** (unrolled cylinder) |
| Game select | `select.html` | 4 | **CHOSEN: 2** (paste-up) |
| Chess | `chess.html` | 10 | **awaiting a pick** (second attempt; first 4 rejected) |
| T9 phone | `t9.html` | 6 | **awaiting a pick** (second attempt) |
| Slots | `slots.html` | 6 | **awaiting a pick** (second attempt) |
| Dummy Parse | `dummyparse.html` | 20 | **awaiting a pick** |
| Skill check | *(not kept)* | — | **CHOSEN: 1** (pure dial) |
| Summary | *(not kept)* | — | **CHOSEN: 1** (source + entry) |

Skill check and Summary were picked from a batch that also held T9 and Slots in
one file. That file is deleted: **the four minigames must not share a page in
any real implementation.** Rebuild the two chosen ones from the descriptions
below if the visuals are needed again.

- **Skill check 1, "pure dial"** — one large ring centred on black, red good-zone
  arc, white needle, required key drawn in the middle of the dial, four corner
  readouts (repetition, streak, failed, next-in), a row of hit/miss pips.
- **Summary 1, "source + entry"** — two columns: source text panel left with
  topic and kind, your answer box right with a live word counter, limit meter
  and rules beneath.

## What the design brief actually asks for

Terminal aesthetic throughout, but **explicitly not minimalism** — the standing
instruction is "as overdesigned and maximalist as possible". The first profile
and chess attempts were rejected for being too samey, not too busy: the profile
five were all "an institutional record about you", and the chess four were all
"board in the middle, panels either side". The second attempts deliberately
spread across different organising ideas.

## Known gaps in the mockups

Several designs show data the server does not produce yet. Whichever is picked,
these need adding or dropping at build time:

- **Profile**: the 24h activity log, and the invented fields (clearance,
  handler, flags, carry-forward).
- **Chess**: the ply scrubber implies a stored move history with rewind points.
- **Dummy Parse**: the rotation timeline (design 11) implies a planner, and the
  gauge cluster (design 9) implies live stat readouts the engine does not expose.
  Designs 3, 12 and 18 lean on a large arena and will squeeze the stat panel,
  so those want stats behind a toggle.
- **Slots**: symbols are placeholder glyphs; custom art is expected later.
