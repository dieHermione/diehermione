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
| Profile | `profile.html` | 10 | **CHOSEN: 10** (man page), and **built** |
| Wheel | `wheel.html` | 5 | **CHOSEN: 5** (unrolled cylinder) |
| Game select | `select.html` | 4 | **CHOSEN: 2** (paste-up) |
| Chess | `chess.html` | 10 | **awaiting a pick** (third attempt, no theme restriction) |
| T9 phone | `t9.html` | 6 | **awaiting a pick** (third attempt, real handset forms) |
| Slots | `slots.html` | 6 | **awaiting a pick** (third attempt, no theme restriction) |
| Dummy Parse | `dummyparse.html` | 20 | **CHOSEN: 10** (big ability cards) + the 11 timeline, both **built** |
| Skill check | *(not kept)* | n/a | **CHOSEN: 1** (pure dial) |
| Summary | *(not kept)* | n/a | **CHOSEN: 1** (source + entry) |

Skill check and Summary were picked from a batch that also held T9 and Slots in
one file. That file is deleted: **the four minigames must not share a page in
any real implementation.** Rebuild the two chosen ones from the descriptions
below if the visuals are needed again.

- **Skill check 1, "pure dial"** - one large ring centred on black, red good-zone
  arc, white needle, required key drawn in the middle of the dial, four corner
  readouts (repetition, streak, failed, next-in), a row of hit/miss pips.
- **Summary 1, "source + entry"** - two columns: source text panel left with
  topic and kind, your answer box right with a live word counter, limit meter
  and rules beneath.

## What the design brief actually asks for

The standing instruction is **explicitly not minimalism**: "as overdesigned and
maximalist as possible". The terminal aesthetic was the default, but it is
**lifted for chess and slots** (2026-07-29): those two batches were rejected as
ten and six versions of the same dark panel, so the third attempts each give
every design its own material world. T9 was rejected separately for reading as
a calculator; the third attempt builds specific real handsets instead.

## Known gaps in the mockups

Several designs show data the server does not produce yet. Whichever is picked,
these need adding or dropping at build time:

- **Chess**: the ply scrubber in the earlier batch implied a stored move history
  with rewind points. The current batch shows a plain move list, but REWIND
  still needs that history behind it.
- **Dummy Parse**: the gauge cluster (design 9) implies live stat readouts the
  engine does not expose. Designs 3, 12 and 18 lean on a large arena and will
  squeeze the stat panel, so those want stats behind a toggle.
- **Slots**: symbols are placeholder glyphs; custom art is expected later.

Resolved at build time:

- **Profile** design 10 needed lifetime writing counters, so the profile API now
  reports angelcoins plus lines completed and penance/devotion series.
- **Dummy Parse** design 11 implied a rotation *planner*. There is no planner, so
  the built timeline draws the rotation actually cast instead.
