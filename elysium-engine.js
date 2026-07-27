/* Elysium: the tree-care game engine (server-authoritative).
 *
 * Design principle (from the mechanics brief): time advances the tree's age and
 * produces growth; player actions do not directly grow the tree, they protect
 * the conditions that let growth continue. The tree can never be destroyed; a
 * damaged tree is always recoverable with enough time and upkeep.
 *
 * The state is a plain object persisted per account (see server.js). All
 * time-based progression runs here in `simulate()`, which walks the tree from
 * its last tick up to "now" in fixed steps, so a player who leaves for a day
 * comes back to a tree that lived that day. Because the server owns the clock,
 * two browsers looking at the same account always agree.
 *
 * No em dashes anywhere (user preference); numbers are tuned for a patient loop.
 */

"use strict";

const TICK_MS = 60 * 60 * 1000;       // one tick == one real hour
const MAX_CATCHUP_TICKS = 24 * 45;    // never simulate more than ~45 days at once

const STAGES = ["Seedling", "Sapling", "Young", "Growing", "Mature", "Ancient"];
// cumulative growth needed to *reach* each stage index
const STAGE_GROWTH = [0, 34, 90, 180, 320, 520];
const GROWTH_HEALTH = 55;             // health floor for growth to continue
const GROWTH_RATE = 3;                // growth per eligible tick (+200% vs the original 1)

const ZONES = ["roots", "trunk", "leftBranch", "rightBranch", "crown", "leaves"];
const ADJACENT = {
  roots: ["trunk"],
  trunk: ["roots", "leftBranch", "rightBranch", "crown"],
  leftBranch: ["trunk", "crown"],
  rightBranch: ["trunk", "crown"],
  crown: ["trunk", "leftBranch", "rightBranch", "leaves"],
  leaves: ["crown"],
};

const DISEASES = {
  root_rot: {
    name: "root rot", family: "root", homeZones: ["roots", "trunk"],
    // fertilizer is useless-to-harmful against rot (per brief)
    fertilizeHelps: false,
  },
  powdery_mildew: {
    name: "powdery mildew", family: "fungal", homeZones: ["leaves", "crown"],
    fertilizeHelps: false,
  },
  canker: {
    name: "canker", family: "wound", homeZones: ["leftBranch", "rightBranch", "trunk"],
    fertilizeHelps: false,
  },
};
const STAGE_NAMES = ["Latent", "Symptomatic", "Active", "Critical"];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---------- season (Northern hemisphere, from the real month) ---------- */
function seasonFor(date = new Date()) {
  const m = date.getMonth(); // 0..11
  if (m <= 1 || m === 11) return "Winter";
  if (m <= 4) return "Spring";
  if (m <= 7) return "Summer";
  return "Autumn";
}
const SEASON_HUMIDITY = { Spring: 58, Summer: 46, Autumn: 62, Winter: 52 };

/* ---------- a fresh tree ----------
 * A new tree begins *ailing*: waterlogged, starved of airflow, and already
 * carrying two diseases. The opening objective is to read the symptoms and
 * nurse it back to health before growth can resume. */
function newTree(now = Date.now()) {
  const tree = {
    version: 1,
    plantedAt: now,
    lastTick: now,
    ageTicks: 0,
    growth: STAGE_GROWTH[1],  // a Sapling, but a sickly one
    stageIndex: 1,
    health: 22,
    resilience: 18,
    soilMoisture: 88,         // waterlogged -> feeds the rot
    humidity: 78,
    airflow: 36,              // stagnant -> feeds the mildew
    nutrients: 24,
    leafWetness: 42,
    woundLoad: 34,
    // hidden per-family incubators that build toward spawning a disease
    risk: { root: 72, fungal: 58, wound: 30 },
    diseases: [
      { type: "root_rot", zone: "roots", stage: 2, progress: 0.4, identified: false, confidence: 0, born: now },
      { type: "powdery_mildew", zone: "leaves", stage: 1, progress: 0.3, identified: false, confidence: 0, born: now },
    ],
    zones: Object.fromEntries(ZONES.map((z) => [z, { health: 100 }])),
    actions: {},             // last-used tick timestamps for cooldowns
    inspect: { lastTick: -999, confidence: 0, clues: [] },
    journal: [{ at: now, event: "Planted", type: null, disease: null, text: "A sickly sapling, in need of care." }],
    recentTreatment: 0,      // ticks since a corrective action, for "Recovering"
    condition: "Critical",
  };
  // the ailing zones the player must nurse back
  tree.zones.roots.health = 28;
  tree.zones.trunk.health = 56;
  tree.zones.leaves.health = 44;
  tree.zones.crown.health = 64;
  tree.zones.leftBranch.health = 72;
  tree.zones.rightBranch.health = 74;
  return tree;
}

/* migrate / heal a loaded state so older or partial saves never crash */
function ensure(state, now = Date.now()) {
  if (!state || typeof state !== "object") return newTree(now);
  const base = newTree(now);
  for (const k of Object.keys(base)) if (state[k] === undefined) state[k] = base[k];
  for (const z of ZONES) if (!state.zones[z]) state.zones[z] = { health: 100 };
  if (!state.risk) state.risk = { root: 0, fungal: 0, wound: 0 };
  return state;
}

function hasStage(state, min) {
  return state.diseases.some((d) => d.stage >= min);
}
function diseaseOf(state, family) {
  return state.diseases.find((d) => DISEASES[d.type].family === family);
}

/* ---------- one hour of tree life ---------- */
function step(state, now) {
  const date = new Date(now);
  const season = seasonFor(date);
  state.ageTicks += 1;

  /* environment drifts back toward its baselines */
  const evap = 2.2 + (season === "Summer" ? 1.6 : 0) + state.airflow / 90;
  state.soilMoisture = clamp(state.soilMoisture - evap, 0, 100);
  state.leafWetness = clamp(state.leafWetness - 6, 0, 100);
  const humBase = SEASON_HUMIDITY[season];
  state.humidity = clamp(state.humidity + (humBase - state.humidity) * 0.08 + (Math.random() - 0.5) * 3, 0, 100);
  state.airflow = clamp(state.airflow + (60 - state.airflow) * 0.05, 0, 100);
  state.nutrients = clamp(state.nutrients - 0.35, 0, 100);
  state.woundLoad = clamp(state.woundLoad - 0.8, 0, 100);

  /* disease pressure per family builds from combinations of conditions */
  const wet = state.soilMoisture;
  const lowAir = state.airflow < 45;
  // root: waterlogged soil + poor drainage/airflow
  let root = 0;
  if (wet > 82) root += 7; else if (wet > 68) root += 3.5; else root -= 4;
  if (lowAir) root += 2; if (state.health < 40) root += 2;
  // fungal: wet leaves + high humidity + still air
  let fungal = 0;
  if (state.humidity > 72) fungal += 4; if (state.leafWetness > 45) fungal += 4.5;
  if (lowAir) fungal += 3; if (season === "Spring" || season === "Autumn") fungal += 1;
  if (state.humidity < 55 && state.leafWetness < 25) fungal -= 5;
  // wound: open wounds meeting damp weather
  let wound = 0;
  if (state.woundLoad > 45 && (state.humidity > 62 || wet > 70)) wound += 6;
  else if (state.woundLoad > 25) wound += 2; else wound -= 3;
  if (season === "Winter") wound += 1;

  state.risk.root = clamp(state.risk.root + root, 0, 130);
  state.risk.fungal = clamp(state.risk.fungal + fungal, 0, 130);
  state.risk.wound = clamp(state.risk.wound + wound, 0, 130);

  maybeSpawn(state, "root", "root_rot", now);
  maybeSpawn(state, "fungal", "powdery_mildew", now);
  maybeSpawn(state, "wound", "canker", now);

  /* diseases progress or recede depending on whether care fixed the cause */
  for (const d of state.diseases) advanceDisease(state, d, season);
  // spread from any active disease to an adjacent, still-clean zone
  for (const d of state.diseases) {
    if (d.stage >= 2 && Math.random() < 0.08) spread(state, d);
  }
  // resolve cured diseases (walked back below latent)
  const cured = state.diseases.filter((d) => d.cleared);
  for (const d of cured) logJournal(state, d.type, "Recovered", `${DISEASES[d.type].name} cleared after care.`, now);
  state.diseases = state.diseases.filter((d) => !d.cleared);

  /* zone + overall health */
  let damage = 0;
  for (const d of state.diseases) {
    const sev = [0, 0.35, 1.1, 2.8][d.stage];
    damage += sev;
    const z = state.zones[d.zone];
    if (z) z.health = clamp(z.health - sev * 1.4, 5, 100);
  }
  damage *= 1 - state.resilience / 260;   // resilience softens the blow
  // zones slowly knit back together when not actively diseased
  const diseasedZones = new Set(state.diseases.map((d) => d.zone));
  for (const z of ZONES) {
    if (!diseasedZones.has(z)) state.zones[z].health = clamp(state.zones[z].health + 0.6, 5, 100);
  }

  const conditionsOk = wet > 24 && wet < 84 && state.nutrients > 22;
  let recover = 0;
  if (damage < 0.05 && conditionsOk) recover = 1.4 + state.resilience / 90;
  state.health = clamp(state.health + recover - damage, 3, 100);

  // over/under extremes bleed a little health even without disease
  if (wet < 14 || wet > 92) state.health = clamp(state.health - 0.8, 3, 100);
  if (state.nutrients < 12) state.health = clamp(state.health - 0.4, 3, 100);

  /* resilience rewards long stretches of good keeping */
  if (state.health > 80 && damage < 0.05) state.resilience = clamp(state.resilience + 0.15, 0, 100);
  else if (damage > 0.5) state.resilience = clamp(state.resilience - 0.1, 0, 100);

  /* growth: only time plus health, never a button */
  const eligible = state.health >= GROWTH_HEALTH && !hasStage(state, 3) && !(season === "Winter" && state.health < 70);
  if (eligible) {
    state.growth += GROWTH_RATE * (season === "Winter" ? 0.4 : 1);
    while (state.stageIndex < STAGES.length - 1 && state.growth >= STAGE_GROWTH[state.stageIndex + 1]) {
      state.stageIndex += 1;
      logJournal(state, null, "Grew", `The tree became a ${STAGES[state.stageIndex]}.`, now);
    }
  }

  if (state.recentTreatment > 0) state.recentTreatment -= 1;
  state.condition = conditionLabel(state, season);
}

function maybeSpawn(state, family, type, now) {
  if (state.risk[family] < 100) return;
  if (diseaseOf(state, family)) { state.risk[family] = 88; return; }
  if (Math.random() < 0.55) {
    const zone = pick(DISEASES[type].homeZones);
    state.diseases.push({
      type, zone, stage: 0, progress: 0.1,
      identified: false, confidence: 0, born: now,
    });
    logJournal(state, type, "Appeared", `Something is wrong near the ${zoneLabel(zone)}.`, now);
  }
  state.risk[family] = 40;
}

// is the cause of this disease still present? if so it worsens, if not it heals
function diseaseFavoured(state, d) {
  const f = DISEASES[d.type].family;
  if (f === "root") return state.soilMoisture > 66 || state.airflow < 42;
  if (f === "fungal") return state.humidity > 66 || state.leafWetness > 40 || state.airflow < 48;
  if (f === "wound") return state.woundLoad > 30 || state.humidity > 68;
  return false;
}

function advanceDisease(state, d, season) {
  const favoured = diseaseFavoured(state, d);
  const speed = favoured ? 0.09 + (season === "Spring" && DISEASES[d.type].family === "fungal" ? 0.05 : 0)
                         : -0.11;
  d.progress += speed;
  if (d.progress >= 1) {
    if (d.stage < 3) { d.stage += 1; d.progress = 0.3; }
    else d.progress = 1;
  } else if (d.progress <= 0) {
    if (d.stage > 0) { d.stage -= 1; d.progress = 0.65; }
    else d.cleared = true;
  }
}

function spread(state, d) {
  const options = ADJACENT[d.zone].filter(
    (z) => !state.diseases.some((o) => o.zone === z && DISEASES[o.type].family === DISEASES[d.type].family)
  );
  if (!options.length) return;
  const zone = pick(options);
  state.diseases.push({
    type: d.type, zone, stage: 0, progress: 0.2,
    identified: false, confidence: 0, born: Date.now(),
  });
}

function conditionLabel(state, season) {
  if (hasStage(state, 3)) return "Critical";
  if (state.health < 35) return "Vulnerable";
  if (season === "Winter" && state.health < 72 && !hasStage(state, 2)) return "Dormant";
  if (state.recentTreatment > 0 && hasStage(state, 1)) return "Recovering";
  if (hasStage(state, 2)) return "Ailing";
  if (state.health >= 85 && !hasStage(state, 1)) return "Thriving";
  return "Stable";
}

/* ---------- journal ---------- */
function logJournal(state, type, event, text, now) {
  state.journal.unshift({
    at: now, event, type,
    disease: type ? DISEASES[type].name : null,
    text,
  });
  if (state.journal.length > 60) state.journal.length = 60;
}

/* ---------- the public walk-forward ---------- */
function simulate(state, now = Date.now()) {
  state = ensure(state, now);
  let ticks = Math.floor((now - state.lastTick) / TICK_MS);
  if (ticks <= 0) return state;
  if (ticks > MAX_CATCHUP_TICKS) {
    // fast-forward the clock but only live out the last window in detail
    state.lastTick += (ticks - MAX_CATCHUP_TICKS) * TICK_MS;
    state.ageTicks += ticks - MAX_CATCHUP_TICKS;
    ticks = MAX_CATCHUP_TICKS;
  }
  for (let i = 0; i < ticks; i++) {
    state.lastTick += TICK_MS;
    step(state, state.lastTick);
  }
  return state;
}

/* ---------- player actions ---------- */
const ACTIONS = {
  water(state, now) {
    const before = state.soilMoisture;
    state.soilMoisture = clamp(state.soilMoisture + 30, 0, 100);
    state.recentTreatment = 4;
    if (before > 74) {
      state.risk.root = clamp(state.risk.root + 22, 0, 130);
      return { say: "The soil was already soaked. Water pools at the surface.", tone: "warn" };
    }
    if (before < 30) return { say: "The dry soil drinks deep.", tone: "good" };
    return { say: "You water the tree. The soil darkens.", tone: "calm" };
  },
  mist(state, now) {
    state.leafWetness = clamp(state.leafWetness + 34, 0, 100);
    state.humidity = clamp(state.humidity + 12, 0, 100);
    const fungal = diseaseOf(state, "fungal");
    if (fungal) {
      state.risk.fungal = clamp(state.risk.fungal + 20, 0, 130);
      fungal.progress += 0.12;
      return { say: "Mist settles on already-troubled leaves. This may feed the spread.", tone: "warn" };
    }
    if (state.humidity > 78) return { say: "A fine mist, though the air is already heavy.", tone: "warn" };
    return { say: "A fine mist beads on the leaves.", tone: "calm" };
  },
  trim(state, now) {
    // trim is the disease-control action: it removes the worst diseased zone,
    // thins the canopy (airflow up) but opens a wound (health cost, canker risk)
    state.airflow = clamp(state.airflow + 14, 0, 100);
    state.woundLoad = clamp(state.woundLoad + 26, 0, 100);
    state.health = clamp(state.health - 3, 3, 100);
    state.recentTreatment = 6;
    const target = worstDisease(state, ["fungal", "wound"]);
    if (target) {
      // cutting back knocks a symptomatic/active disease down a stage or clears latent
      if (target.stage <= 1) target.cleared = true;
      else { target.stage -= 1; target.progress = 0.2; }
      const z = state.zones[target.zone];
      if (z) z.health = clamp(z.health + 18, 5, 100);
      logJournal(state, target.type, "Pruned", `Cut back the ${zoneLabel(target.zone)} to slow the ${DISEASES[target.type].name}.`, now);
      return { say: `You cut away the affected ${zoneLabel(target.zone)}. A fresh wound remains.`, tone: "calm" };
    }
    return { say: "You thin the canopy. Airflow improves, but every cut is a wound.", tone: "calm" };
  },
  fertilize(state, now) {
    const last = state.actions.fertilize || -999;
    const since = state.ageTicks - last;
    if (since < 18) return { say: "The soil is still rich from the last feeding. Wait a while.", tone: "warn", noStamp: true };
    const rot = diseaseOf(state, "root");
    if (rot) {
      state.risk.root = clamp(state.risk.root + 14, 0, 130);
      state.health = clamp(state.health - 2, 3, 100);
      return { say: "Feeding a rotting root only stresses it further.", tone: "warn" };
    }
    if (state.nutrients > 82) {
      state.health = clamp(state.health - 3, 3, 100);
      state.risk.root = clamp(state.risk.root + 8, 0, 130);
      return { say: "Over-fed. The excess burns the roots.", tone: "warn" };
    }
    state.nutrients = clamp(state.nutrients + 26, 0, 100);
    state.recentTreatment = 5;
    return { say: "Nutrients work into the soil. Recovery will come slowly.", tone: "good" };
  },
  inspect(state, now) {
    state.inspect.lastTick = state.ageTicks;
    state.inspect.confidence = clamp(state.inspect.confidence + 34, 0, 100);
    const clues = readClues(state);
    state.inspect.clues = clues.lines;
    // inspection gradually names what ails the tree
    for (const d of state.diseases) {
      d.confidence = clamp((d.confidence || 0) + 40, 0, 100);
      if (d.confidence >= 70) d.identified = true;
    }
    return { say: clues.headline, tone: "inspect", inspect: clues };
  },
};

function worstDisease(state, families) {
  const set = state.diseases.filter((d) => families.includes(DISEASES[d.type].family));
  set.sort((a, b) => b.stage - a.stage || b.progress - a.progress);
  return set[0] || null;
}

function applyAction(state, action, now = Date.now()) {
  state = simulate(state, now);
  const fn = ACTIONS[action];
  if (!fn) return { state, result: { say: "Nothing happens.", tone: "calm" } };
  const result = fn(state, now) || { say: "", tone: "calm" };
  if (!result.noStamp) state.actions[action] = state.ageTicks;
  state.condition = conditionLabel(state, seasonFor(new Date(now)));
  return { state, result };
}

/* ---------- observation text ---------- */
function readClues(state) {
  const lines = [];
  // the tree is no longer drawn, so its silhouette is described here instead
  const h = state.health;
  if (h < 30) lines.push("The canopy is sparse and grey; bare twigs show through.");
  else if (h < 55) lines.push("The foliage looks thin and dull.");
  else if (h >= 85) lines.push("The canopy is full and richly leaved.");
  else lines.push("The canopy is holding, if not thriving.");
  const wet = state.soilMoisture;
  if (wet > 82) lines.push("The soil is waterlogged and slow to drain.");
  else if (wet > 66) lines.push("The soil is quite wet.");
  else if (wet < 24) lines.push("The soil is dry and pale.");
  else lines.push("Soil moisture looks about right.");

  if (state.humidity > 74) lines.push("The air is heavy and humid.");
  if (state.leafWetness > 45) lines.push("Moisture clings to the leaves.");
  if (state.airflow < 45) lines.push("The air around the canopy is still.");
  if (state.nutrients < 30) lines.push("New growth looks pale and underfed.");
  if (state.woundLoad > 45) lines.push("Recent cuts have not yet sealed.");

  // disease-specific observations, vaguer until inspection builds confidence
  let headline = "The tree looks settled for now.";
  const worst = [...state.diseases].sort((a, b) => b.stage - a.stage)[0];
  if (worst && worst.stage >= 1) {
    const d = DISEASES[worst.type];
    const z = zoneLabel(worst.zone);
    if (worst.identified) {
      headline = `Likely ${d.name} at the ${z}.`;
      lines.push(diseaseHint(worst.type));
    } else if (worst.confidence >= 35) {
      headline = `A ${d.family} problem is taking hold near the ${z}.`;
      lines.push("Inspect again to be sure.");
    } else {
      headline = `Something is wrong near the ${z}.`;
    }
  } else if (worst) {
    headline = "A faint trace of trouble. Nothing certain yet.";
  }
  return { headline, lines };
}
function diseaseHint(type) {
  return {
    root_rot: "Leaves droop though the soil is wet. Stop watering and let it drain.",
    powdery_mildew: "A pale, powdery film on the leaves. Improve airflow and stop misting.",
    canker: "A dark, sunken patch on the bark. Cut back below the wound.",
  }[type] || "";
}
function zoneLabel(z) {
  return {
    roots: "roots", trunk: "trunk", leftBranch: "left branch",
    rightBranch: "right branch", crown: "crown", leaves: "leaves",
  }[z] || z;
}

/* what "next attention" nudge to show the player */
function nextAttention(state) {
  if (hasStage(state, 2)) return "Inspect and treat the affected area.";
  if (state.soilMoisture > 84) return "Let the soil dry before watering again.";
  if (state.soilMoisture < 22) return "The soil is dry. Water soon.";
  if (state.diseases.length && state.inspect.confidence < 60) return "Inspect the tree to learn more.";
  if (state.nutrients < 25) return "Nutrients are low. Consider feeding.";
  if (state.humidity > 76 && state.airflow < 50) return "Improve airflow to head off mildew.";
  return "Nothing urgent. Let time do its work.";
}

/* ---------- coarse descriptors for the UI ---------- */
function band(v, cuts, labels) {
  for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return labels[i];
  return labels[labels.length - 1];
}

/* what the player is allowed to see */
function publicView(state, now = Date.now()) {
  state = ensure(state, now);
  const season = seasonFor(new Date(now));
  const observed = state.diseases.map((d) => ({
    zone: d.zone,
    stage: d.stage,
    stageName: STAGE_NAMES[d.stage],
    family: DISEASES[d.type].family,
    // only reveal the true name once inspection has identified it
    name: d.identified ? DISEASES[d.type].name : null,
    identified: !!d.identified,
  }));
  return {
    stage: STAGES[state.stageIndex],
    stageIndex: state.stageIndex,
    stageMax: STAGES.length - 1,
    ageDays: Math.floor(state.ageTicks / 24),
    ageHours: state.ageTicks % 24,
    condition: state.condition,
    season,
    growthProgress: stageProgress(state),
    soil: band(state.soilMoisture, [22, 45, 66, 84], ["dry", "drying", "damp", "wet", "waterlogged"]),
    humidityLabel: band(state.humidity, [45, 62, 76], ["low", "comfortable", "high", "humid"]),
    airflowLabel: band(state.airflow, [42, 62], ["still", "gentle", "airy"]),
    nutrientLabel: band(state.nutrients, [28, 55], ["low", "adequate", "rich"]),
    healthBand: band(state.health, [35, 60, 85], ["failing", "weak", "fair", "strong"]),
    concern: topConcern(state),
    nextAttention: nextAttention(state),
    diseases: observed,
    zones: state.zones,
    inspectConfidence: state.inspect.confidence,
    inspectClues: state.inspect.clues,
    journal: state.journal.slice(0, 24),
    fertilizeReady: (state.ageTicks - (state.actions.fertilize || -999)) >= 18,
  };
}
function stageProgress(state) {
  const cur = STAGE_GROWTH[state.stageIndex] || 0;
  const next = STAGE_GROWTH[state.stageIndex + 1];
  if (next === undefined) return 1;
  return clamp((state.growth - cur) / (next - cur), 0, 1);
}
function topConcern(state) {
  const worst = [...state.diseases].sort((a, b) => b.stage - a.stage)[0];
  if (worst && worst.stage >= 1) {
    if (worst.identified) return `${DISEASES[worst.type].name} at the ${zoneLabel(worst.zone)}`;
    if ((worst.confidence || 0) >= 35) return `a ${DISEASES[worst.type].family} problem near the ${zoneLabel(worst.zone)}`;
    return `something amiss near the ${zoneLabel(worst.zone)}`;
  }
  if (state.soilMoisture > 84) return "the soil is waterlogged";
  if (state.soilMoisture < 22) return "the soil is dry";
  if (state.nutrients < 25) return "nutrients are running low";
  return null;
}

/* everything, for the admin debug panel */
function debugView(state, now = Date.now()) {
  state = ensure(state, now);
  return {
    raw: {
      health: Math.round(state.health), resilience: Math.round(state.resilience),
      soilMoisture: Math.round(state.soilMoisture), humidity: Math.round(state.humidity),
      airflow: Math.round(state.airflow), nutrients: Math.round(state.nutrients),
      leafWetness: Math.round(state.leafWetness), woundLoad: Math.round(state.woundLoad),
      growth: Math.round(state.growth), ageTicks: state.ageTicks,
      risk: {
        root: Math.round(state.risk.root), fungal: Math.round(state.risk.fungal),
        wound: Math.round(state.risk.wound),
      },
    },
    diseases: state.diseases.map((d) => ({
      type: d.type, zone: d.zone, stage: d.stage, stageName: STAGE_NAMES[d.stage],
      progress: Math.round(d.progress * 100) / 100, identified: !!d.identified,
      confidence: d.confidence || 0,
    })),
    zones: state.zones,
    diseaseTypes: Object.keys(DISEASES),
    zoneList: ZONES,
  };
}

/* ---------- admin debug operations ---------- */
function debug(state, cmd, args = {}, now = Date.now()) {
  state = simulate(state, now);
  switch (cmd) {
    case "advance": {
      // live out N hours of simulation immediately
      const hours = clamp(Number(args.hours) || 24, 1, MAX_CATCHUP_TICKS);
      for (let i = 0; i < hours; i++) { state.lastTick += TICK_MS; step(state, state.lastTick); }
      break;
    }
    case "grow":
      state.growth += Number(args.amount) || 40;
      while (state.stageIndex < STAGES.length - 1 && state.growth >= STAGE_GROWTH[state.stageIndex + 1]) {
        state.stageIndex += 1;
      }
      break;
    case "setStage":
      state.stageIndex = clamp(Number(args.stage), 0, STAGES.length - 1);
      state.growth = STAGE_GROWTH[state.stageIndex];
      break;
    case "set": {
      const field = args.field;
      const allowed = ["health", "soilMoisture", "humidity", "airflow", "nutrients",
        "leafWetness", "woundLoad", "resilience"];
      if (allowed.includes(field)) state[field] = clamp(Number(args.value), 0, 100);
      break;
    }
    case "damageZone": {
      const z = state.zones[args.zone];
      if (z) z.health = clamp(Number(args.value ?? 30), 5, 100);
      break;
    }
    case "spawn": {
      const type = DISEASES[args.type] ? args.type : "root_rot";
      const zone = ZONES.includes(args.zone) ? args.zone : pick(DISEASES[type].homeZones);
      const stage = clamp(Number(args.stage ?? 1), 0, 3);
      state.diseases.push({ type, zone, stage, progress: 0.3, identified: !!args.identified, confidence: args.identified ? 100 : 0, born: now });
      logJournal(state, type, "Appeared", `[debug] ${DISEASES[type].name} spawned at the ${zoneLabel(zone)}.`, now);
      break;
    }
    case "cure":
      state.diseases = [];
      state.risk = { root: 0, fungal: 0, wound: 0 };
      break;
    case "heal":
      state.health = 100; state.diseases = []; state.woundLoad = 0;
      state.risk = { root: 0, fungal: 0, wound: 0 };
      for (const z of ZONES) state.zones[z].health = 100;
      break;
    case "reset":
      return newTree(now);
    default:
      break;
  }
  state.condition = conditionLabel(state, seasonFor(new Date(now)));
  return state;
}

module.exports = {
  newTree, ensure, simulate, applyAction, publicView, debugView, debug,
  STAGES, ZONES, DISEASES, TICK_MS,
};
