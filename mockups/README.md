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
| Wheel | `wheel.html` | 5 | **CHOSEN: 5** (unrolled cylinder), and **built** |
| Game select | `select.html` | 4 | **CHOSEN: 2** (paste-up), and **built** |
| Chess | `chess.html` | 10 | **CHOSEN: 9** (ink wash), and **built** |
| T9 phone | `t9.html` | 6 | **awaiting a pick** (fifth attempt, the actual RAZR V3) |
| Slots | `slots.html` | 6 | **CHOSEN: 5** (scratch card), not built yet |
| Dummy Parse | `dummyparse.html` | 20 | **CHOSEN: 10** (big ability cards) + the 11 timeline, both **built** |
| Decrypt anim | `decrypt.html` | 5 | **CHOSEN: 1** (BIOS/POST), **built** into `boot.js` (~8s cascade) |
| Dashboard | `dashboard.html` | 15 | rejected (none picked): clean terminal-software genres |
| Dashboard v2 | `dashboard2.html` | 15 | **awaiting a pick** (maximalist occult-terminal redo) |
| Skill check | *(not kept)* | n/a | **CHOSEN: 1** (pure dial), and **built** |
| Summary | *(not kept)* | n/a | **CHOSEN: 1** (source + entry), and **built** |

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

## What the two rejections were actually about

Both rejected batches failed the same way, and it is worth writing down because
it is easy to repeat.

**T9** was rejected three times as "calculator designs". Each attempt changed
the paint and kept the shape: an upright rectangle, a screen at the top, a 3x4
grid of identical keys below. That *is* a calculator, whatever colour it is.
The fourth attempt draws every handset as one SVG so the outline can be a real
path with curves, a waist and a chin, the body can show its thickness, and no
two keypads share a geometry.

**Slots** was rejected with no reason given, and looking back the third attempt
was six paint jobs on one idea: a cabinet in the middle with three reels in a
window. The fourth varies the idea instead. Only one of the six is a cabinet;
the others drop the machine entirely, run one reel horizontally, deal cards,
look down into the drum, or print a scratch card. Each design carries a one-line
caption saying what its idea is, bottom left.

The general lesson: when a batch comes back as "the same design again", the
thing to change is the organising idea, not the palette.

## T9, fifth attempt

Four batches were rejected. The first three repainted a rectangle with a key
grid; the fourth changed the silhouettes but still invented the phones. The
fifth was drawn from a reference photo of a Motorola RAZR V3 and copies it:
the real proportions, the speaker slots and two screws above the wordmark, the
black screen surround, the chrome hinge with its raised centre catch, the flat
etched plate where keys are separated by engraved hairlines rather than gaps,
the number left with the letters small to its right, the round D-pad with a
green centre and four icon soft keys at its corners, and the slotted speaker in
the chin.

All six are that same phone, differing only in presentation: flat on, at an
angle, closed, the three colourways it shipped in, and its blue
electroluminescent backlight at night.

**Lesson for any future batch of physical objects: work from a reference.**
Three of the four rejections were spent inventing.
