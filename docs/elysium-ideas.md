# Elysium: where it could go

Brainstorm, 2026-07-30. Nothing here is decided or built. Grouped by what each
idea is *for*, with a rough sense of cost, because the cheap ones and the
expensive ones read the same on a list.

## What the game already is

Worth stating, because it constrains everything below. Elysium is
**server-authoritative and time-based**: state carries a `lastTick` and
`simulate(state, now)` walks it forward in one-hour ticks. The tree lives while
you are away. It has health, resilience, soil moisture, humidity, airflow,
nutrients, leaf wetness and wound load; five zones with adjacency spread; three
diseases that move through Latent, Symptomatic, Active and Critical and recede a
stage at a time when the cause is corrected; six growth stages gated on health;
seasons from the real month; and inspection that only names a disease once you
have looked enough.

The actions are Water, Mist, Trim, Fertilize and Inspect, and each has a real
cost as well as a use.

**Its central quality is patience.** It is the one thing on the site that cannot
be rushed, and the ideas worth doing are the ones that lean into that rather
than the ones that add things to click.

## The honest problem first

The known gap is not "too few features", it is that **natural disease onset is
so slow that most visits are uneventful**. Someone who checks in daily can go a
fortnight without a decision to make. Everything below is more fun if that is
fixed first, and fixing it may not need new systems at all: it may just be
numbers.

Three ways, cheapest first:

1. **Raise baseline disease pressure** so something is usually brewing. Pure
   tuning, no new code.
2. **Weather.** A daily condition drawn per season that pushes the environment
   around: a wet week raises leaf wetness and humidity, a dry spell drains soil
   moisture, wind raises airflow and wound risk. This makes the environment move
   on its own, so the correct action changes week to week instead of settling.
   Moderate: one new state field, one table, and hooks into the existing tick.
3. **Let neglect actually bite.** Missing a week should be recoverable but
   visible in the journal and in the bark for a long time afterwards.

## Making the tree feel like a specific tree

- **Species.** Pick one at planting: something that wants wet feet, something
  that hates being pruned, something fast-growing and fragile. Each is a
  different weighting of the same stats, so it is a data table rather than new
  mechanics, and it makes two players' advice to each other actually differ.
- **Naming it**, and having the journal use the name. Nearly free, and it does
  more for attachment than most mechanics would.
- **A scar record.** Wounds already exist as load; keeping *where* they were and
  drawing them permanently gives the tree a history you can read off it.
- **Age.** It already knows how long it has lived. Say so somewhere, in days,
  the way the profile says how long you have.

## Giving patience a shape

- **Seasons that matter more than flavour.** Growth mostly in spring and summer,
  dormancy in winter where almost nothing you do helps and the correct play is
  to leave it alone. A game that sometimes tells you to go away is unusual and
  fits this one.
- **An annual event.** One flowering, or one fruiting, gated on the tree having
  been healthy through the preceding season. Something that can be missed for a
  year is a strong reason to care in month three.
- **Rings.** At each year, freeze a summary of how that year went, and let the
  trunk be inspected to read them back. This is the single idea most in keeping
  with what the game already is.

## Connecting it to the rest of the site

Currently deliberate that Elysium pays nothing. Worth revisiting carefully,
because paying out would change what it is for.

- **Cuttings, not currency.** A healthy tree can be cut back to produce
  something that is not points: a keepsake on your profile, a line in the
  leaderboard, an entry in a hall of trees. Reward without turning it into a
  farm.
- **A tree-specific daily** that is about attention rather than output:
  "inspect", or "the tree needs nothing today, confirm that". Cheap, and it
  gets people looking.
- **Hermione's view.** She can see everyone's tree, its condition and how long
  since it was last touched. She does not need a mechanic to make that matter.

## Things she could do to it

In keeping with how chess went. All of these want the same treatment: real
server checks, and no trace in the other player's copy of the page.

- **Blight.** Seed a disease directly, at whatever stage she likes.
- **Drought or downpour.** Override the weather for one account.
- **Prune.** Take a branch off, with the wound load that implies.
- **Bless.** Push health up, or unlock a stage early.
- **Withhold the journal**, so the tree stops explaining itself and has to be
  read from the bark instead.

The last is the most interesting: it takes something away rather than adding
damage, and the game already has the inspection system to make that legible.

## Presentation

- **The art is procedural and the note in the handoff says so.** A hand-drawn
  set per stage, per season, with overlays for disease, would carry more than
  any new mechanic on this list. Expensive, and worth costing properly before
  committing.
- **A slower clock on screen.** The page currently reads as a dashboard. If it
  is really a thing that moves in days, the interface could stop showing
  seconds at all.
- **Sound.** It has rain already. Wind tied to airflow, and near-silence in
  dormancy, would do a lot for the patience it is asking for.

## What to do first, if asked

1. Tune disease pressure up, or add weather. The game is not slow because it
   lacks features.
2. Rings. Cheap, and it is the idea that most rewards having stayed.
3. Hermione's controls. The pattern is established now and this is the game
   where "something happened while you were gone" is already the premise.
