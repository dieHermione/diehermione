const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const elysium = require("./elysium-engine");

const app = express();
const PORT = process.env.PORT || 3000;
// Stamped once at boot. A Railway redeploy restarts the process, so this
// changes; pages compare it against the one they loaded with and offer a
// reload. (Assumes a single instance, which is how this is deployed.)
const BUILD_ID = String(Date.now());
const USERS_FILE = path.join(process.env.DATA_DIR || __dirname, "users.json");
const GAMES_FILE = path.join(process.env.DATA_DIR || __dirname, "games.json");
const WRITING_FILE = path.join(process.env.DATA_DIR || __dirname, "writing.json");
const DEATHROLL_FILE = path.join(process.env.DATA_DIR || __dirname, "deathroll.json");
const SITE_FILE = path.join(process.env.DATA_DIR || __dirname, "site.json");
const ELYSIUM_FILE = path.join(process.env.DATA_DIR || __dirname, "elysium.json");
const DEVOTION_FILE = path.join(process.env.DATA_DIR || __dirname, "devotion.json");
const PENANCE_FILE = path.join(process.env.DATA_DIR || __dirname, "penance.json");
const DECRYPT_FILE = path.join(process.env.DATA_DIR || __dirname, "decrypt.json");
const PARSE_FILE = path.join(process.env.DATA_DIR || __dirname, "parses.json");
const SUMMARY_FILE = path.join(process.env.DATA_DIR || __dirname, "summaries.json");
const APPLICATIONS_FILE = path.join(process.env.DATA_DIR || __dirname, "applications.json");

// --- simple JSON-file user store (fine for testing; swap for a DB later) ---
function loadUsers() {
  let users;
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
  return migrateDollars(users);
}

// Dollars and points were merged into a single currency at 1:1. Folds any
// leftover balance into points and drops the key. Idempotent: once no record
// carries `dollars` it does nothing and never writes.
function migrateDollars(users) {
  let changed = false;
  for (const user of Object.values(users)) {
    if (!user || user.dollars === undefined) continue;
    user.points = (user.points || 0) + (user.dollars || 0);
    delete user.dollars;
    changed = true;
  }
  if (changed) saveUsers(users);
  return users;
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- chess games vs the hermione account, keyed by player username ---
function loadGames() {
  try {
    return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "3mb" })); // room for base64 profile pictures
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 },
  })
);
app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect("/");
  next();
}

function isAdmin(req) {
  return req.session.username && req.session.username.toLowerCase() === "hermione";
}

// A guest is a not-really-logged-in session: no account, no points, no dailies,
// and no multiplayer. It only exists to let someone try the single-player games.
function isGuest(req) {
  return Boolean(req.session.guest) && !req.session.username;
}

// Like requireLogin, but a guest session passes too. Used for the game pages a
// guest may reach; account pages keep requireLogin.
function requirePlayer(req, res, next) {
  if (req.session.username || req.session.guest) return next();
  return res.redirect("/");
}

// --- routes ---
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: "Username must be 3-30 characters." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const pronouns = canonical(req.body.pronouns, PRONOUN_OPTIONS);
  if (!pronouns) {
    return res.status(400).json({ error: "Pick your pronouns." });
  }
  const signupChoice = canonical(req.body.rank, SIGNUP_RANKS);
  if (!signupChoice) {
    return res.status(400).json({ error: "Pick an account type." });
  }
  // "Sub" is only the registration label; a sub account starts at the lowest
  // ladder rank, Servant, and Hermione promotes from there.
  const rank = signupChoice === "Sub" ? "Servant" : signupChoice;
  // Photosensitivity gates the flashing effects, so it needs a deliberate
  // answer rather than an unchecked box that quietly means "no".
  if (req.body.photosensitive !== true && req.body.photosensitive !== false) {
    return res.status(400).json({ error: "Answer the photosensitivity question." });
  }
  const photosensitive = req.body.photosensitive === true;
  const intro = String(req.body.intro || "").trim();
  if (!intro) {
    return res.status(400).json({ error: "Tell Hermione who you are." });
  }
  if (intro.length > INTRO_MAX) {
    return res.status(400).json({ error: "Keep it under " + INTRO_MAX + " characters." });
  }
  const users = loadUsers();
  const key = username.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: "That username is already taken." });
  }
  users[key] = {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
    pronouns,
    rank,
    points: 0,
    photosensitive,
    // Registration does not sign you in. The account waits here until hermione
    // approves it from the admin panel; login is refused until then.
    status: "pending",
    intro,
  };
  const hermione = users["hermione"];
  if (hermione) {
    pushNotification(
      hermione,
      "signup-" + key,
      username + " has asked to join. Approve or turn them away in the admin panel.",
      "/admin"
    );
  }
  saveUsers(users);
  // deliberately no req.session.username here
  // A "disciple" (the Sub signup) fills out the onboarding questionnaire before
  // Hermione reviews them. Grant a limited onboarding credential (not a login) so
  // the still-pending account can reach and submit the questionnaire once.
  if (signupChoice === "Sub") {
    req.session.onboarding = key;
    return res.json({ ok: true, pending: true, onboarding: true });
  }
  res.json({ ok: true, pending: true });
});

// An account is usable only once hermione has approved it. Records that predate
// approval have no status and are treated as already approved.
const INTRO_MAX = 500;
function isPending(user) {
  return Boolean(user) && user.status === "pending";
}

// --- disciple onboarding questionnaire ---
// A Sub ("disciple") signup is handed a one-shot onboarding credential at
// registration (req.session.onboarding = key) and sent to /onboarding to fill
// this out. The answers are stored on the account for Hermione to read before
// she approves. Feet and Tasks/Chores are load-bearing: if either is rated below
// 4, the pending account's approval card is flagged red.
const ONBOARDING_KINKS = ["feet", "tasks", "degradation", "humiliation",
  "masochism", "exhibitionism", "worship", "petplay"];
const ONBOARDING_PUNISHMENTS = ["lines_physical", "lines_typing", "voice_memos",
  "ignoring", "onsite_games_hard"];
const ONBOARDING_PETNAMES = ["dog", "good", "doll", "pet", "bitch", "loser", "dummy"];
const LIMITS_MAX = 1000;

function onboardingCtx(req) {
  const key = req.session.onboarding;
  if (!key) return null;
  const users = loadUsers();
  const user = users[key];
  if (!user || !isPending(user)) return null;
  return { key, user, users };
}

app.get("/onboarding", (req, res) => {
  if (!onboardingCtx(req)) return res.redirect("/");
  res.sendFile(path.join(__dirname, "views", "onboarding.html"));
});

app.get("/api/onboarding", (req, res) => {
  const ctx = onboardingCtx(req);
  if (!ctx) return res.status(401).json({ error: "No onboarding in progress." });
  const site = loadSite();
  res.json({
    username: ctx.user.username,
    about: site.onboardingAbout,
    purpose: site.onboardingPurpose,
  });
});

app.post("/api/onboarding", (req, res) => {
  const ctx = onboardingCtx(req);
  if (!ctx) return res.status(401).json({ error: "No onboarding in progress." });
  const body = req.body || {};
  const kinks = {};
  for (const k of ONBOARDING_KINKS) {
    const v = Math.round(Number((body.kinks || {})[k]));
    if (!(v >= 1 && v <= 5)) return res.status(400).json({ error: "Answer every interest question." });
    kinks[k] = v;
  }
  const punishments = {};
  for (const p of ONBOARDING_PUNISHMENTS) {
    const v = String((body.punishments || {})[p] || "");
    if (v !== "acceptable" && v !== "hate") return res.status(400).json({ error: "Answer every punishment." });
    punishments[p] = v;
  }
  const petnames = {};
  for (const p of ONBOARDING_PETNAMES) {
    const v = String((body.petnames || {})[p] || "");
    if (v !== "like" && v !== "hate") return res.status(400).json({ error: "Answer every petname." });
    petnames[p] = v;
  }
  const limits = String(body.limits || "").trim().slice(0, LIMITS_MAX);
  const petnamesOther = String(body.petnamesOther || "").trim().slice(0, 120);
  const flagged = kinks.feet < 4 || kinks.tasks < 4;
  ctx.user.onboarding = {
    kinks, limits, punishments, petnames, petnamesOther,
    submittedAt: new Date().toISOString(),
  };
  ctx.user.onboardingFlag = flagged;
  saveUsers(ctx.users);
  delete req.session.onboarding;   // one shot
  res.json({ ok: true });
});

// --- applications (the questionnaire is now an account-less application) ---
// Applicants no longer create accounts. They fill the questionnaire (with a
// Discord contact) and Hermione reviews it and creates the account by hand.
function loadApplications() {
  try { const d = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, "utf8")); return Array.isArray(d.applications) ? d.applications : []; }
  catch { return []; }
}
function saveApplications(list) {
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify({ applications: list.slice(0, 500) }, null, 2));
}

app.get("/apply", (req, res) => res.sendFile(path.join(__dirname, "views", "onboarding.html")));

app.get("/api/apply", (req, res) => {
  const site = loadSite();
  res.json({ about: site.onboardingAbout, purpose: site.onboardingPurpose });
});

app.post("/api/apply", (req, res) => {
  const body = req.body || {};
  const discord = String((body.contact || {}).discord || "").trim().slice(0, 80);
  if (!discord) return res.status(400).json({ error: "A Discord username is required so Hermione can reach you." });
  const kinks = {};
  for (const k of ONBOARDING_KINKS) {
    const v = Math.round(Number((body.kinks || {})[k]));
    if (!(v >= 1 && v <= 5)) return res.status(400).json({ error: "Answer every interest question." });
    kinks[k] = v;
  }
  const punishments = {};
  for (const p of ONBOARDING_PUNISHMENTS) {
    const v = String((body.punishments || {})[p] || "");
    if (v !== "acceptable" && v !== "hate") return res.status(400).json({ error: "Answer every punishment." });
    punishments[p] = v;
  }
  const petnames = {};
  for (const p of ONBOARDING_PETNAMES) {
    const v = String((body.petnames || {})[p] || "");
    if (v !== "like" && v !== "hate") return res.status(400).json({ error: "Answer every petname." });
    petnames[p] = v;
  }
  const limits = String(body.limits || "").trim().slice(0, LIMITS_MAX);
  const petnamesOther = String(body.petnamesOther || "").trim().slice(0, 120);
  const flagged = kinks.feet < 4 || kinks.tasks < 4;
  const application = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    contact: { discord },
    kinks, limits, punishments, petnames, petnamesOther, flag: flagged,
  };
  const list = loadApplications();
  list.unshift(application);
  saveApplications(list);
  const users = loadUsers();
  const hermione = users["hermione"];
  if (hermione) {
    pushNotification(hermione, "application-" + application.id, discord + " has applied. Review it and make their account.", "/manage");
    saveUsers(users);
  }
  res.json({ ok: true });
});

app.get("/api/admin/applications", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  res.json({ applications: loadApplications() });
});

app.delete("/api/admin/applications/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  saveApplications(loadApplications().filter((a) => a.id !== req.params.id));
  res.json({ ok: true });
});

// --- Hermione creates accounts by hand (`pray manage` -> /manage) ---
// She hands the account out with a dummy password; it is forced to set a real
// one the first time it signs in.
app.get("/manage", (req, res) => {
  if (!isAdmin(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "manage.html"));
});

app.get("/commands", (req, res) => {
  if (!isAdmin(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "commands.html"));
});

app.post("/api/admin/accounts", async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const typeChoice = canonical(req.body.type, SIGNUP_RANKS);   // "Visitor" | "Sub"
  if (username.length < 3 || username.length > 30) return res.status(400).json({ error: "Username must be 3-30 characters." });
  if (password.length < 8) return res.status(400).json({ error: "The dummy password must be at least 8 characters." });
  if (!typeChoice) return res.status(400).json({ error: "Pick an account type (disciple or visitor)." });
  const users = loadUsers();
  const key = username.toLowerCase();
  if (users[key]) return res.status(409).json({ error: "That username is already taken." });
  users[key] = {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
    pronouns: canonical(req.body.pronouns, PRONOUN_OPTIONS) || "",
    rank: typeChoice === "Sub" ? "Servant" : "Visitor",
    points: 0,
    photosensitive: false,
    status: "approved",
    mustChangePassword: true,
  };
  saveUsers(users);
  res.json({ ok: true, username, type: typeChoice });
});

// Set (or first-time change) a password. A must-change account may set one this
// session without the old password; otherwise the current password is required.
app.post("/api/password", async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const next = String(req.body.next || "");
  if (next.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
  if (!user.mustChangePassword) {
    const current = String(req.body.current || "");
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      return res.status(403).json({ error: "Current password is incorrect." });
    }
  }
  user.passwordHash = await bcrypt.hash(next, 10);
  delete user.mustChangePassword;
  saveUsers(users);
  res.json({ ok: true });
});

// Turn on photosensitivity protection. Deliberately one-way: once an account is
// marked photosensitive the flashing effects can never be turned back on for it.
app.post("/api/photosensitive", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  user.photosensitive = true;
  saveUsers(users);
  res.json({ ok: true, photosensitive: true });
});

// --- currency ---
// Points are the only currency. They used to be admin-granted only, with a
// separate earned "dollars" balance; the two were merged 1:1, so points are now
// both granted and earned, and the leaderboard reflects both.
const DAILY_CHECKIN_POINTS = 5;
const SNAKE_FOOD_POINTS = 1;
// The Devotion daily is fulfilled by completing this many Devotion lines in a day.
// Snake pickups are reported by the browser, so they can't be trusted outright.
// These bound the damage: a daily ceiling makes farming pointless, and a token
// bucket caps the sustained rate while still allowing honest bursts (food can
// spawn right in front of the snake and be eaten on the very next 120ms tick).
const SNAKE_BURST = 8;
const SNAKE_REFILL_MS = 2000;

// The daily bonus resets at 6am Eastern. Read the Eastern wall clock (which
// already accounts for EST/EDT), then step back RESET_HOUR so the date label
// only flips at that hour rather than at midnight.
const RESET_ZONE = "America/New_York";
const RESET_HOUR = 6;
function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const shifted = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") - RESET_HOUR)
  );
  return shifted.toISOString().slice(0, 10);
}

// grants the daily points the first time an account is seen each day;
// returns null otherwise
function awardDailyCheckIn(users, key) {
  const user = users[key];
  if (!user) return null;
  if (rankFor(user, key) === "Visitor") return null;   // visitors keep no points
  const today = todayKey();
  if (user.lastCheckIn === today) return null;
  user.lastCheckIn = today;
  user.points = (user.points || 0) + DAILY_CHECKIN_POINTS;
  saveUsers(users);
  return { amount: DAILY_CHECKIN_POINTS, points: user.points };
}

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  const users = loadUsers();
  const user = users[username.toLowerCase()];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  // Checked after the password so a wrong guess can't reveal that the account
  // exists and is waiting.
  if (isPending(user)) {
    return res.status(403).json({
      error: "Hermione hasn't approved this account yet. Try again once she has.",
      pending: true,
    });
  }
  req.session.username = user.username;
  const checkIn = awardDailyCheckIn(users, user.username.toLowerCase());
  if (clearTitheLeftovers(users, user.username.toLowerCase())) saveUsers(users);
  saveUsers(users);
  res.json({ ok: true, checkIn });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --- guests ---
// A guest has no account, but multiplayer needs to tell one from another, so
// each session claims a transient name (guest1, guest2, ...) from an in-memory
// registry. Nothing is written to users.json. Names are reclaimed once a guest
// has been quiet for a while, and their game state goes with them, so an
// abandoned session cannot squat a name or leave orphaned games behind.
const activeGuests = new Map();          // name -> last seen (ms)
const GUEST_TTL = 3 * 60 * 60 * 1000;    // 3 hours of silence and the name is free

function reclaimGuests() {
  const cutoff = Date.now() - GUEST_TTL;
  for (const [name, seen] of activeGuests) {
    if (seen >= cutoff) continue;
    activeGuests.delete(name);
    dropPlayerGames(name);
  }
}
// a guest leaves nothing behind: their chess and deathroll games go too
function dropPlayerGames(name) {
  try {
    const games = loadGames();
    if (games[name]) { delete games[name]; saveGames(games); }
  } catch {}
  try {
    const rolls = loadRolls();
    if (rolls[name]) { delete rolls[name]; saveRolls(rolls); }
  } catch {}
}
function claimGuestName() {
  reclaimGuests();
  for (let i = 1; ; i++) {
    const name = "guest" + i;
    if (!activeGuests.has(name)) { activeGuests.set(name, Date.now()); return name; }
  }
}
function touchGuest(req) {
  if (req.session.guest && req.session.guestName) activeGuests.set(req.session.guestName, Date.now());
}

// The identity a game is filed under: a real account's username, or the
// transient name held by a guest session.
function playerId(req) {
  if (req.session.username) return req.session.username.toLowerCase();
  if (req.session.guest && req.session.guestName) return req.session.guestName;
  return null;
}
function listActiveGuests() {
  reclaimGuests();
  return [...activeGuests.keys()].sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

// Start a guest session: no account is created, just a name to play under.
app.post("/api/guest", (req, res) => {
  req.session.username = undefined;
  req.session.guest = true;
  if (!req.session.guestName || !activeGuests.has(req.session.guestName)) {
    req.session.guestName = claimGuestName();
  }
  res.json({ ok: true, username: req.session.guestName });
});

app.get("/api/me", (req, res) => {
  if (!req.session.username) {
    if (req.session.guest) {
      // a guest is signed in only enough to play; no account behind it. The
      // name is claimed lazily so a session that predates the registry, or one
      // whose name has since been reclaimed, still gets a usable identity.
      if (!req.session.guestName || !activeGuests.has(req.session.guestName)) {
        req.session.guestName = claimGuestName();
      }
      touchGuest(req);
      return res.json({
        guest: true, username: req.session.guestName, isAdmin: false, rank: "Guest",
        points: null, noEconomy: true, checkIn: null,
      });
    }
    return res.status(401).json({ error: "Not logged in." });
  }
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  if (!users[key]) return res.status(401).json({ error: "Not logged in." });
  // an account put back to pending loses its existing session on the next view
  if (isPending(users[key])) {
    return req.session.destroy(() => res.status(401).json({ error: "Not logged in." }));
  }
  // sessions outlive a day, so check in on the first page view of each day too
  const checkIn = awardDailyCheckIn(users, key);
  if (clearTitheLeftovers(users, key)) saveUsers(users);
  const rank = rankFor(users[key], key);
  // Hermione and Visitors sit outside the points/dailies economy
  const noEconomy = key === "hermione" || rank === "Visitor";
  res.json({
    username: req.session.username,
    isAdmin: isAdmin(req),
    rank,
    noEconomy,
    points: noEconomy ? null : users[key].points || 0,
    angelcoins: users[key].angelcoins || 0,
    createdAt: users[key].createdAt || null,
    // accounts predating the question have no flag; treat that as not flagged
    photosensitive: users[key].photosensitive === true,
    // a hand-made account must set a real password on first sign-in
    mustChangePassword: users[key].mustChangePassword === true,
    checkIn,
  });
});

// A guest's landing page: the games they can actually reach, nothing else.
// The guest landing is now just the full dashboard in a guest-flavoured state.
app.get("/guest", requirePlayer, (req, res) => {
  if (req.session.guest) touchGuest(req);
  res.redirect("/dashboard");
});

app.get("/dashboard", requirePlayer, (req, res) => {
  if (req.session.guest) touchGuest(req);
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// --- profiles: viewable by any logged-in user, editable by the owner or hermione ---
const PRONOUN_OPTIONS = ["She/Her", "He/Him", "They/Them"];
// Rank replaces the old domme/sub role and the old Princess/User badge. One
// value covers both. Princess is hermione's alone and isn't offered at signup.
// The ladder, highest first. Rank 2 is deliberately unnamed for now.
const RANK_LADDER = [
  { name: "Angel", note: "" },
  { name: "??", note: "", unassignable: true },
  { name: "Disciple", note: "" },
  { name: "Worshipper", note: "" },
  { name: "Devoted", note: "" },
  { name: "Follower", note: "" },
  { name: "Servant", note: "" },
];
const RANK_ASIDE = { name: "Visitor", note: "Not a sub." };
const RANK_OPTIONS = [...RANK_LADDER.map((r) => r.name), RANK_ASIDE.name];
const SIGNUP_RANKS = ["Visitor", "Sub"];
// "Citizen" was the old name for the "Sub" signup rank; keep mapping it so
// accounts created before the rename still resolve to a real rank.
const LEGACY_RANKS = { domme: "Visitor", sub: "Servant", citizen: "Servant" };

// what hermione may hand out: everything except Princess and the unnamed rank
const ASSIGNABLE_RANKS = [
  ...RANK_LADDER.filter((r) => r.name !== "Angel" && !r.unassignable).map((r) => r.name),
  RANK_ASIDE.name,
];

app.get("/api/ranks", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  res.json({
    ladder: RANK_LADDER.map((r, i) => ({ position: i + 1, name: r.name, note: r.note })),
    aside: RANK_ASIDE,
    assignable: ASSIGNABLE_RANKS,
  });
});

// tolerate legacy free-text values like "she/her" from before these were dropdowns
function canonical(value, options) {
  const v = String(value || "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) || "";
}

function rankFor(user, key) {
  if (key === "hermione") return "Angel";
  const raw = String((user && (user.rank || user.role)) || "").trim();
  return canonical(raw, RANK_OPTIONS) || LEGACY_RANKS[raw.toLowerCase()] || "";
}

function canEditProfile(req, key) {
  return isAdmin(req) || req.session.username.toLowerCase() === key;
}

// Lifetime writing counters. They were added after the fact, so an account that
// predates them is seeded once from its (capped) writingLog: partial history,
// but better than starting a long-standing account back at zero. Seeding is
// idempotent, so calling this on a read-only path costs nothing.
function writingCounters(user) {
  if (user.linesCompleted === undefined) {
    const log = Array.isArray(user.writingLog) ? user.writingLog : [];
    user.linesCompleted = log.reduce((n, e) => n + (e.passages || 0), 0);
    user.penanceSeries = log.filter((e) => e.category === "penance").length;
    user.devotionSeries = log.filter((e) => e.category === "devotion").length;
  }
  return {
    linesCompleted: user.linesCompleted || 0,
    penanceSeries: user.penanceSeries || 0,
    devotionSeries: user.devotionSeries || 0,
  };
}

app.get("/api/profile/:username", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  res.json({
    profile: {
      username: user.username,
      rank: rankFor(user, key),
      icon: user.icon || "",
      bio: user.bio || "",
      pronouns: canonical(user.pronouns, PRONOUN_OPTIONS),
      points: key === "hermione" ? null : user.points || 0,   // hermione doesn't keep points
      angelcoins: key === "hermione" ? null : user.angelcoins || 0,
      stats: {
        foodEaten: user.foodEaten || 0,
        lettersTyped: user.lettersTyped || 0,
        writingTasksCompleted: user.writingTasksCompleted || 0,
        customTasksCompleted: user.customTasksCompleted || 0,
        ...writingCounters(user),
      },
      createdAt: user.createdAt,
      canEdit: canEditProfile(req, key),
      // the disciple's onboarding answers, only ever sent to Hermione
      onboarding: isAdmin(req) ? (user.onboarding || null) : undefined,
      onboardingFlag: isAdmin(req) ? !!user.onboardingFlag : undefined,
    },
  });
});

app.put("/api/profile/:username", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  if (!canEditProfile(req, key)) {
    return res.status(403).json({ error: "You can only edit your own profile." });
  }
  const fields = [["bio", 500]];
  for (const [name, max] of fields) {
    if (req.body[name] === undefined) continue;
    const value = String(req.body[name]).trim();
    if (value.length > max) {
      return res.status(400).json({ error: name + " must be " + max + " characters or fewer." });
    }
    user[name] = value;
  }
  if (req.body.pronouns !== undefined) {
    const raw = String(req.body.pronouns).trim();
    const value = canonical(raw, PRONOUN_OPTIONS);
    if (raw !== "" && !value) {
      return res.status(400).json({ error: "Pick one of the listed pronoun options." });
    }
    user.pronouns = value;
  }
  // rank is picked at registration; only hermione can change it afterwards
  if (req.body.rank !== undefined) {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Only Hermione can change that." });
    }
    const raw = String(req.body.rank).trim();
    const value = canonical(raw, RANK_OPTIONS);
    if (raw !== "" && !value) {
      return res.status(400).json({ error: "Rank must be visitor, citizen or princess." });
    }
    user.rank = value;
    delete user.role; // retire the old field as accounts are touched
  }
  if (req.body.icon !== undefined) {
    const icon = String(req.body.icon);
    if (icon !== "" && !/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(icon)) {
      return res.status(400).json({ error: "The picture must be an image file." });
    }
    if (icon.length > 2500000) {
      return res.status(400).json({ error: "That image is too large." });
    }
    user.icon = icon;
  }
  saveUsers(users);
  res.json({ ok: true });
});


app.get("/api/users", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  res.json({
    users: Object.values(users).map((u) => ({
      username: u.username,
      createdAt: u.createdAt,
      points: u.username.toLowerCase() === "hermione" ? null : u.points || 0,
      flagged: !!u.flagged,
      pending: isPending(u),
      pronouns: canonical(u.pronouns, PRONOUN_OPTIONS),
      intro: u.intro || "",
      // the disciple onboarding answers, for Hermione's review before approval
      onboarding: u.onboarding || null,
      onboardingFlag: !!u.onboardingFlag,
    })),
  });
});

// --- approving new accounts ---
app.post("/api/users/:username/approve", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  if (!isPending(user)) {
    return res.status(400).json({ error: "That account is already approved." });
  }
  delete user.status;
  const hermione = users["hermione"];
  if (hermione) dropNotification(hermione, "signup-" + key);
  saveUsers(users);
  res.json({ ok: true, username: user.username });
});

app.get("/api/leaderboard", (req, res) => {
  if (!req.session.username && !req.session.guest) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const board = Object.values(users)
    .filter((u) => u.flagged && u.username.toLowerCase() !== "hermione")
    .map((u) => ({ username: u.username, points: u.points || 0 }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));
  res.json({ users: board });
});

// Set a balance outright, rather than nudging it. Used by `pray set_points`.
app.put("/api/users/:username/points", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const value = Number(req.body.value);
  if (!Number.isInteger(value) || value < 0) {
    return res.status(400).json({ error: "Value must be a whole number, zero or more." });
  }
  const key = req.params.username.toLowerCase();
  if (key === "hermione") return res.status(400).json({ error: "Hermione doesn't collect points." });
  const users = loadUsers();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  users[key].points = value;
  saveUsers(users);
  res.json({ ok: true, points: value });
});

app.post("/api/users/:username/points", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount)) {
    return res.status(400).json({ error: "Amount must be a whole number." });
  }
  if (req.params.username.toLowerCase() === "hermione") {
    return res.status(400).json({ error: "Hermione doesn't collect points." });
  }
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  users[key].points = (users[key].points || 0) + amount;
  pushNotification(
    users[key],
    "points-" + Date.now(),
    (amount > 0 ? "Hermione gave you " + amount : "Hermione took " + Math.abs(amount)) +
      (Math.abs(amount) === 1 ? " point" : " points") +
      ". You now have " + users[key].points + ".",
    "/profile"
  );
  saveUsers(users);
  res.json({ ok: true, points: users[key].points });
});

app.post("/api/users/:username/flag", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  users[key].flagged = !!req.body.flagged;
  saveUsers(users);
  res.json({ ok: true, flagged: users[key].flagged });
});

app.delete("/api/users/:username", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const key = req.params.username.toLowerCase();
  if (key === "hermione") {
    return res.status(400).json({ error: "The admin account can't be deleted." });
  }
  const users = loadUsers();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  delete users[key];
  // also clears the signup request if this is how a pending account was refused
  if (users["hermione"]) dropNotification(users["hermione"], "signup-" + key);
  saveUsers(users);
  const games = loadGames();
  if (games[key]) {
    delete games[key];
    saveGames(games);
  }
  res.json({ ok: true });
});

// --- chess: every game is player (white) vs the hermione account (pink) ---

// Rewind needs somewhere to rewind to. Replaying `history` is not enough,
// because a strike changes the position without adding a move, so every
// mutation snapshots the whole state first. Games that predate this simply
// start with an empty stack.
const CHESS_PAST_CAP = 200;
function pushSnapshot(entry) {
  if (!Array.isArray(entry.past)) entry.past = [];
  entry.past.push({ fen: entry.fen, history: [...entry.history] });
  if (entry.past.length > CHESS_PAST_CAP) entry.past.shift();
}

function gameState(entry, key) {
  const chess = new Chess(entry.fen);
  return {
    opponent: key,
    fen: entry.fen,
    turn: chess.turn(),
    check: chess.inCheck(),
    gameOver: chess.isGameOver(),
    checkmate: chess.isCheckmate(),
    draw: chess.isDraw(),
    winner: chess.isCheckmate() ? (chess.turn() === "w" ? "b" : "w") : null,
    history: entry.history,
    updatedAt: entry.updatedAt,
    // how far back Hermione could wind it; the opponent never reads this
    rewindable: Array.isArray(entry.past) ? entry.past.length : 0,
  };
}

function chessKeyFor(req, opponent) {
  if (isAdmin(req)) {
    const key = String(opponent || "").toLowerCase();
    return key && key !== "hermione" ? key : null;
  }
  return playerId(req);
}

app.get("/api/chess/game", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const key = chessKeyFor(req, req.query.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  // the picker lists every player now, so choosing one she has never played
  // opens the board rather than erroring
  if (!games[key]) {
    games[key] = { fen: new Chess().fen(), history: [], updatedAt: new Date().toISOString() };
    saveGames(games);
  }
  res.json({ game: gameState(games[key], key) });
});

app.post("/api/chess/move", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const key = chessKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  const entry = games[key];
  if (!entry) return res.status(404).json({ error: "No such game." });
  const chess = new Chess(entry.fen);
  if (chess.isGameOver()) return res.status(400).json({ error: "The game is over." });
  const mySide = isAdmin(req) ? "b" : "w";
  if (chess.turn() !== mySide) return res.status(400).json({ error: "Not your turn." });
  const { from, to } = req.body;
  if (!/^[a-h][1-8]$/.test(from || "") || !/^[a-h][1-8]$/.test(to || "")) {
    return res.status(400).json({ error: "Invalid square." });
  }
  let move;
  try {
    move = chess.move({ from, to, promotion: "q" });
  } catch {
    return res.status(400).json({ error: "Illegal move." });
  }
  pushSnapshot(entry);
  entry.fen = chess.fen();
  entry.history.push(move.san);
  entry.updatedAt = new Date().toISOString();
  saveGames(games);
  res.json({ game: gameState(entry, key) });
});

app.post("/api/chess/remove", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const key = chessKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  const entry = games[key];
  if (!entry) return res.status(404).json({ error: "No such game." });
  const square = req.body.square;
  if (!/^[a-h][1-8]$/.test(square || "")) {
    return res.status(400).json({ error: "Invalid square." });
  }
  const chess = new Chess(entry.fen);
  if (chess.isGameOver()) return res.status(400).json({ error: "The game is over." });
  // a strike is spent instead of a move, so it is hers to take only on her turn
  if (chess.turn() !== "b") return res.status(400).json({ error: "Only on your turn." });
  const piece = chess.get(square);
  if (!piece) return res.status(404).json({ error: "No piece on that square." });
  if (piece.color !== "w") {
    return res.status(400).json({ error: "Only the player's white pieces can be removed." });
  }
  if (piece.type === "k") {
    return res.status(400).json({ error: "The king can't be removed." });
  }
  chess.remove(square);
  let fen;
  try {
    fen = new Chess(chess.fen()).fen();
  } catch {
    return res.status(400).json({ error: "Removing that piece would break the game." });
  }
  pushSnapshot(entry);
  entry.fen = fen;
  entry.updatedAt = new Date().toISOString();
  saveGames(games);
  res.json({ game: gameState(entry, key) });
});

// Rewind: step the whole game back through the snapshot stack. Admin only, and
// deliberately not advertised anywhere the opponent's client can see it.
app.post("/api/chess/rewind", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const key = chessKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  const entry = games[key];
  if (!entry) return res.status(404).json({ error: "No such game." });
  if (!Array.isArray(entry.past) || entry.past.length === 0) {
    return res.status(400).json({ error: "Nothing to rewind to." });
  }
  const steps = Math.max(1, Math.min(entry.past.length, parseInt(req.body.steps, 10) || 1));
  let snap = null;
  for (let i = 0; i < steps; i++) snap = entry.past.pop();
  entry.fen = snap.fen;
  entry.history = snap.history;
  entry.updatedAt = new Date().toISOString();
  saveGames(games);
  res.json({ game: gameState(entry, key) });
});

app.post("/api/chess/reset", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const key = chessKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  games[key] = { fen: new Chess().fen(), history: [], updatedAt: new Date().toISOString() };
  saveGames(games);
  res.json({ game: gameState(games[key], key) });
});

app.get("/api/chess/games", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const games = loadGames();
  const users = loadUsers();
  // Every approved account belongs in the list, not just the ones that happen
  // to have opened /chess already: a game is only created lazily on that first
  // visit, so listing games alone hid everyone who had never been.
  const keys = new Set(Object.keys(games));
  for (const [key, u] of Object.entries(users)) {
    if (key === "hermione" || isPending(u)) continue;
    keys.add(key);
  }
  const describe = (key) => {
    const entry = games[key];
    const name = users[key] ? users[key].username : key;
    if (!entry) return { opponent: name, key, turn: null, gameOver: false, started: false };
    const chess = new Chess(entry.fen);
    return {
      opponent: name,
      key,
      turn: chess.turn(),
      gameOver: chess.isGameOver(),
      updatedAt: entry.updatedAt,
      started: true,
    };
  };
  const list = [...keys].map(describe);
  // waiting on her first, then the rest alphabetically
  list.sort((a, b) => {
    const aWait = a.started && !a.gameOver && a.turn === "b" ? 0 : 1;
    const bWait = b.started && !b.gameOver && b.turn === "b" ? 0 : 1;
    return aWait - bWait || a.opponent.localeCompare(b.opponent);
  });
  res.json({ games: list });
});

// kept out of public/ so the static middleware can't serve it unauthenticated
// The admin controls live on their own page now (extracted off the dashboard).
// Admin-only, like /manage and /commands.
app.get("/admin", requireLogin, (req, res) => {
  if (!isAdmin(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

// Demo surface for the reusable card navigator (see public/cardnav.js).
app.get("/cardnav", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "cardnav.html"));
});

// --- Elysium: the tree-care game (account-bound state, server-simulated) ---
// State lives in one JSON file keyed by username; the engine owns the clock so
// every device viewing an account agrees on the tree.
function loadTrees() {
  try {
    return JSON.parse(fs.readFileSync(ELYSIUM_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveTrees(trees) {
  fs.writeFileSync(ELYSIUM_FILE, JSON.stringify(trees, null, 2));
}
// fetch a user's tree, creating and persisting one on first visit
function getTree(key) {
  const trees = loadTrees();
  if (!trees[key]) { trees[key] = elysium.newTree(); saveTrees(trees); }
  return { trees, state: trees[key] };
}

app.get("/elysium", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "elysium.html"));
});
// old path kept alive; the game was renamed Tree -> Elysium
app.get("/tree", requireLogin, (req, res) => res.redirect("/elysium"));

app.get("/api/elysium", requireLogin, (req, res) => {
  const key = req.session.username.toLowerCase();
  const { trees, state } = getTree(key);
  elysium.simulate(state, Date.now());
  trees[key] = state;
  saveTrees(trees);
  res.json({ tree: elysium.publicView(state), isAdmin: isAdmin(req) });
});

const ELYSIUM_ACTIONS = ["water", "mist", "trim", "fertilize", "inspect"];
app.post("/api/elysium/action", requireLogin, (req, res) => {
  const action = String(req.body.action || "");
  if (!ELYSIUM_ACTIONS.includes(action)) {
    return res.status(400).json({ error: "Unknown action." });
  }
  const key = req.session.username.toLowerCase();
  const { trees, state } = getTree(key);
  const { state: next, result } = elysium.applyAction(state, action, Date.now());
  trees[key] = next;
  saveTrees(trees);
  res.json({ tree: elysium.publicView(next), result });
});

// full state + write access to it, admin only, for the in-game debug panel
app.get("/api/elysium/debug", requireLogin, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const key = req.session.username.toLowerCase();
  const { trees, state } = getTree(key);
  elysium.simulate(state, Date.now());
  trees[key] = state;
  saveTrees(trees);
  res.json({ tree: elysium.publicView(state), debug: elysium.debugView(state) });
});
app.post("/api/elysium/debug", requireLogin, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const key = req.session.username.toLowerCase();
  const { trees, state } = getTree(key);
  const next = elysium.debug(state, String(req.body.cmd || ""), req.body.args || {}, Date.now());
  trees[key] = next;
  saveTrees(trees);
  res.json({ tree: elysium.publicView(next), debug: elysium.debugView(next) });
});

app.get("/chess", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "chess.html"));
});

// Hermione's half of the chess page. It lives in views/ rather than public/ so
// the static middleware cannot hand it out, and this route 404s rather than
// 403s for anyone else: a refusal would confirm there is something to refuse.
app.get("/chess-extra.js", (req, res) => {
  if (!req.session.username || !isAdmin(req)) return res.status(404).end();
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "views", "chess-extra.js"));
});

/* --- Summary: read a real article, say it back in a set number of words ---
   The source text comes from Wikipedia's public REST summary endpoint, proxied
   here so the browser makes no third-party request and so a failure has one
   place to fall back from. Titles are a fixed hand-picked list; nothing the
   player types ever reaches Wikipedia. */
// Topics are drawn from four categories only: angels, feminism, Greek
// mythology, and pre-18th-century history.
const SUMMARY_TOPICS = [
  ["angels", "Angel"], ["angels", "Archangel"], ["angels", "Gabriel"], ["angels", "Michael (archangel)"],
  ["angels", "Seraph"], ["angels", "Cherub"], ["angels", "Guardian angel"], ["angels", "Fallen angel"],
  ["angels", "Hierarchy of angels"], ["angels", "Ophanim"],
  ["feminism", "Feminism"], ["feminism", "Mary Wollstonecraft"], ["feminism", "Simone de Beauvoir"],
  ["feminism", "Women's suffrage"], ["feminism", "Suffragette"], ["feminism", "Second-wave feminism"],
  ["feminism", "Emmeline Pankhurst"], ["feminism", "Sojourner Truth"], ["feminism", "The Second Sex"],
  ["myth", "Greek mythology"], ["myth", "Athena"], ["myth", "Medusa"], ["myth", "Persephone"],
  ["myth", "Aphrodite"], ["myth", "Artemis"], ["myth", "Prometheus"], ["myth", "Pandora"], ["myth", "Hecate"],
  ["history", "Roman Empire"], ["history", "Byzantine Empire"], ["history", "Black Death"],
  ["history", "Fall of Constantinople"], ["history", "Norman Conquest"], ["history", "Charlemagne"],
  ["history", "Hundred Years' War"], ["history", "Crusades"], ["history", "Magna Carta"], ["history", "Vikings"],
];
const KIND_LABEL = { angels: "angels", feminism: "feminism", myth: "Greek mythology", history: "pre-18th century history" };

// one page is fetched per round; a small cache keeps repeat rounds polite
const summaryCache = new Map();
const SUMMARY_TTL = 6 * 60 * 60 * 1000;

// The REST summary endpoint returns one paragraph, which is already a summary
// and leaves nothing to do. This pulls the article body instead, through the
// action API's plain-text extract, and trims it to something a person will
// actually read in one sitting.
const SUMMARY_MAX_CHARS = 7200;

function trimToParagraph(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // prefer a paragraph break, then a sentence, then wherever we are
  const para = cut.lastIndexOf("\n\n");
  if (para > max * 0.5) return cut.slice(0, para).trim();
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut).trim();
}

async function fetchTopic(title) {
  const hit = summaryCache.get(title);
  if (hit && Date.now() - hit.at < SUMMARY_TTL) return hit.data;
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", prop: "extracts", explaintext: "1", redirects: "1",
    format: "json", formatversion: "2", titles: title,
  });
  const res = await fetch(url, {
    headers: { "accept": "application/json", "user-agent": "angeldomme/0.2 (summary game)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("wikipedia " + res.status);
  const j = await res.json();
  const page = j && j.query && j.query.pages && j.query.pages[0];
  if (!page || page.missing) throw new Error("no page");
  // drop the section headings, then make every paragraph break a consistent
  // blank line so paragraphs never touch (the extract mixes single and double
  // newlines).
  const body = String(page.extract || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^=+ .* =+$/.test(line))
    .join("\n\n");
  const data = {
    title: page.title || title,
    text: trimToParagraph(body, SUMMARY_MAX_CHARS),
    url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(page.title || title).replace(/ /g, "_")),
  };
  if (data.text.split(/\s+/).length < 60) throw new Error("too short to summarise");
  summaryCache.set(title, { at: Date.now(), data });
  return data;
}

app.get("/summary", requirePlayer, (req, res) => {
  touchGuest(req);
  res.sendFile(path.join(__dirname, "views", "summary.html"));
});

app.get("/api/summary/topic", async (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  // try a few, so one dead title does not end the round
  const pool = SUMMARY_TOPICS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  for (const [kind, title] of pool) {
    try {
      const data = await fetchTopic(title);
      const words = data.text.split(/\s+/).filter(Boolean).length;
      // the limit scales with the source, rounded to something readable
      const limit = 3 * Math.max(35, Math.min(90, Math.round(words / 12 / 5) * 5));
      return res.json({ kind, kindLabel: KIND_LABEL[kind], ...data, sourceWords: words, limit });
    } catch (e) { /* try the next one */ }
  }
  res.status(503).json({ error: "Could not reach the archive. Try again in a moment." });
});

function loadSummaries() {
  try { const d = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8")); return Array.isArray(d.entries) ? d.entries : []; }
  catch { return []; }
}

// Kept so Hermione can read them later; there is no admin view for these yet.
app.post("/api/summary/complete", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const text = String(req.body.text || "").trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: "Nothing written." });
  const entry = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    player: who,
    guest: Boolean(req.session.guest),
    at: new Date().toISOString(),
    topic: String(req.body.topic || "").slice(0, 200),
    kind: String(req.body.kind || "").slice(0, 20),
    limit: Math.max(0, Math.min(500, parseInt(req.body.limit, 10) || 0)),
    words: Math.max(0, Math.min(5000, parseInt(req.body.words, 10) || 0)),
    text,
  };
  const list = loadSummaries();
  list.unshift(entry);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ entries: list.slice(0, 300) }, null, 2));
  res.json({ ok: true });
});

// --- Dummy Parse: a damage sim against a target that does not fight back ---
app.get("/dummyparse", requirePlayer, (req, res) => {
  touchGuest(req);
  res.sendFile(path.join(__dirname, "views", "dummyparse.html"));
});

function loadParses() {
  try { const d = JSON.parse(fs.readFileSync(PARSE_FILE, "utf8")); return Array.isArray(d.parses) ? d.parses : []; }
  catch { return []; }
}
function saveParses(list) {
  fs.writeFileSync(PARSE_FILE, JSON.stringify({ parses: list }, null, 2));
}

// A finished parse. Stored whole, including the event list, because the point
// of a parse is the detail: a leaderboard can be built off dps later, but the
// log is what makes a run auditable.
app.post("/api/parse", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const b = req.body || {};
  const duration = Number(b.duration), total = Number(b.total), dps = Number(b.dps);
  if (!Number.isFinite(duration) || duration <= 0) return res.status(400).json({ error: "Bad duration." });
  if (!Number.isFinite(total) || total < 0) return res.status(400).json({ error: "Bad total." });
  const events = Array.isArray(b.events) ? b.events.slice(0, 4000) : [];
  const entry = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    player: who,
    guest: Boolean(req.session.guest),
    cls: String(b.cls || "priest").slice(0, 20),
    // "free", "30" or "60"; only the timed ones are ever ranked
    mode: ["30", "60"].includes(String(b.mode)) ? String(b.mode) : "free",
    version: String(b.version || "0").slice(0, 10),
    at: new Date().toISOString(),
    duration: +duration.toFixed(2),
    total: Math.round(total),
    dps: Math.round(Number.isFinite(dps) ? dps : total / duration),
    build: b.build && typeof b.build === "object" ? b.build : {},
    byAbility: b.byAbility && typeof b.byAbility === "object" ? b.byAbility : {},
    events,
  };
  const list = loadParses();
  list.unshift(entry);
  saveParses(list.slice(0, 400));
  res.json({ ok: true, id: entry.id, dps: entry.dps });
});

// Summaries only. The event list is large and nothing needs it yet.
// Best timed run per player. A free run stops whenever the player likes, so
// its dps is not comparable and never appears here.
app.get("/api/parses/leaderboard", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  const mode = ["30", "60"].includes(String(req.query.mode)) ? String(req.query.mode) : "30";
  // by default a leaderboard only shows runs made on the current game version, so
  // balance changes do not make old runs sit alongside new ones
  const version = req.query.version ? String(req.query.version) : null;
  const allVersions = String(req.query.all || "") === "1";
  const best = new Map();
  for (const p of loadParses()) {
    if (p.mode !== mode) continue;
    if (!allVersions && version && String(p.version || "0") !== version) continue;
    const prev = best.get(p.player);
    if (!prev || p.dps > prev.dps) {
      best.set(p.player, {
        player: p.player, guest: p.guest, dps: p.dps, total: p.total, at: p.at,
        duration: p.duration, version: p.version || "0", build: p.build || {}, byAbility: p.byAbility || {},
      });
    }
  }
  const parses = [...best.values()].sort((a, b) => b.dps - a.dps).slice(0, 50);
  res.json({ mode, version, allVersions, parses });
});

app.get("/api/parses", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  const mine = String(req.query.mine || "") === "1";
  const who = playerId(req);
  let list = loadParses();
  if (mine) list = list.filter((p) => p.player === who);
  res.json({
    parses: list.slice(0, 60).map(({ events, ...rest }) => ({ ...rest, eventCount: events ? events.length : 0 })),
  });
});

app.get("/snake", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "snake.html"));
});

// $1 per snake food. The client reports each pickup, so a light floor on how
// fast awards can arrive keeps a stuck key or a rapid script from printing money.
app.post("/api/snake/food", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  const visitor = rankFor(user, key) === "Visitor";   // plays and keeps stats, earns no points
  // rate limit: refill one token every SNAKE_REFILL_MS, up to SNAKE_BURST
  const now = Date.now();
  const bucket = req.session.snakeBucket || { tokens: SNAKE_BURST, at: now };
  const refilled = Math.min(SNAKE_BURST, bucket.tokens + (now - bucket.at) / SNAKE_REFILL_MS);
  if (refilled < 1) {
    req.session.snakeBucket = { tokens: refilled, at: now };
    return res.status(429).json({ error: "Too fast." });
  }
  req.session.snakeBucket = { tokens: refilled - 1, at: now };

  user.foodEaten = (user.foodEaten || 0) + 1;   // lifetime

  // Every pickup pays. The completion bonus that went with the old daily
  // objective is gone along with the dailies themselves.
  const today = todayKey();
  if (user.snakeDay !== today) {
    user.snakeDay = today;
    user.snakeToday = 0;
  }
  user.snakeToday += 1;
  // angelcoins were removed; snake food now pays points (what the HUD shows)
  if (!visitor) user.points = (user.points || 0) + SNAKE_FOOD_POINTS;
  saveUsers(users);
  res.json({
    ok: true,
    earned: SNAKE_FOOD_POINTS,
    bonus: 0,
    points: user.points,
    angelcoins: user.angelcoins || 0,
    eaten: user.snakeToday,
  });
});

// --- deathroll: hermione picks a number, then the two players alternate
// rolling 1d(previous roll). Whoever rolls a 1 loses. ---
const DEATHROLL_MIN_SIDES = 2;
const DEATHROLL_MAX_SIDES = 1000000;

function loadRolls() {
  try {
    return JSON.parse(fs.readFileSync(DEATHROLL_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveRolls(games) {
  fs.writeFileSync(DEATHROLL_FILE, JSON.stringify(games, null, 2));
}

// games are keyed by the non-hermione player, same as chess
function deathrollKeyFor(req, opponent) {
  if (isAdmin(req)) {
    const key = String(opponent || "").toLowerCase();
    return key && key !== "hermione" ? key : null;
  }
  return playerId(req);
}

function deathrollState(game, viewerIsAdmin) {
  const yourTurn = viewerIsAdmin ? game.turn === "hermione" : game.turn === "player";
  return {
    opponent: game.opponent,
    sides: game.sides,       // what the next roll is against
    turn: game.turn,
    yourTurn: !game.over && yourTurn,
    over: game.over,
    loser: game.loser || null,
    history: game.history,
    startedWith: game.startedWith,
  };
}

app.get("/api/deathroll/game", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const key = deathrollKeyFor(req, req.query.opponent);
  if (!key) return res.status(400).json({ error: "Pick an opponent." });
  const games = loadRolls();
  const game = games[key];
  if (!game) return res.json({ game: null });
  res.json({ game: deathrollState(game, isAdmin(req)) });
});

app.get("/api/deathroll/games", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const games = loadRolls();
  const users = loadUsers();
  const row = (key, label, guest) => ({
    username: label,
    guest: Boolean(guest),
    hasGame: Boolean(games[key]),
    yourTurn: Boolean(games[key] && !games[key].over && games[key].turn === "hermione"),
    over: Boolean(games[key] && games[key].over),
  });
  res.json({
    players: [
      ...Object.keys(users).filter((k) => k !== "hermione").map((k) => row(k, users[k].username, false)),
      // guests are playable opponents too, for as long as their session lasts
      ...listActiveGuests().map((g) => row(g, g, true)),
    ],
  });
});

// hermione alone sets the opening number
app.post("/api/deathroll/start", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Only Hermione starts a deathroll." });
  const key = deathrollKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "Pick an opponent." });
  const users = loadUsers();
  const isGuest = !users[key] && activeGuests.has(key);
  if (!users[key] && !isGuest) return res.status(404).json({ error: "No such player." });
  const opponentName = users[key] ? users[key].username : key;
  const sides = Number(req.body.sides);
  if (!Number.isInteger(sides) || sides < DEATHROLL_MIN_SIDES || sides > DEATHROLL_MAX_SIDES) {
    return res.status(400).json({
      error: "Pick a whole number between " + DEATHROLL_MIN_SIDES + " and " + DEATHROLL_MAX_SIDES + ".",
    });
  }
  const games = loadRolls();
  games[key] = {
    opponent: opponentName,
    startedWith: sides,
    sides,
    turn: "hermione",       // she picked the number, so she rolls it
    over: false,
    loser: null,
    history: [],
    updatedAt: new Date().toISOString(),
  };
  saveRolls(games);
  res.json({ game: deathrollState(games[key], true) });
});

app.post("/api/deathroll/roll", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const key = deathrollKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "Pick an opponent." });
  const games = loadRolls();
  const game = games[key];
  if (!game) return res.status(404).json({ error: "No game yet." });
  if (game.over) return res.status(400).json({ error: "That game is finished." });

  const admin = isAdmin(req);
  const side = admin ? "hermione" : "player";
  if (game.turn !== side) return res.status(400).json({ error: "It isn't your roll." });

  const result = Math.floor(Math.random() * game.sides) + 1;
  game.history.push({ by: side, sides: game.sides, result });
  if (result === 1) {
    game.over = true;
    game.loser = side;
  } else {
    game.sides = result;                                  // the next roll is against this
    game.turn = side === "hermione" ? "player" : "hermione";
  }
  game.updatedAt = new Date().toISOString();
  saveRolls(games);

  // tell the other player, so they hear about it wherever they are on the site
  const users = loadUsers();
  const otherKey = side === "hermione" ? key : "hermione";
  const other = users[otherKey];
  if (other) {
    const roller = side === "hermione" ? "Hermione" : game.opponent;
    pushNotification(
      other,
      "deathroll-" + key,
      result === 1
        ? roller + " rolled a 1, you win the deathroll!"
        : roller + " rolled " + result + ". Your roll is 1d" + result + ".",
      "/deathroll"
    );
    saveUsers(users);
  }

  res.json({ game: deathrollState(game, admin), rolled: result });
});

// --- wheel: one spin a day for everyone except hermione ---
// The server picks the winning wedge; the page only animates to it.
// The wheel pays angelcoins, not points. Thirty outcomes from 1 to 200, heavily
// biased low: weights sum to 1000, so 1 lands 20% of the time and 200 lands
// 0.1%. The tail is long enough to be worth chasing and rare enough to matter.
const WHEEL_SEGMENTS = [
  { label: "1", coins: 1, weight: 200 },
  { label: "2", coins: 2, weight: 140 },
  { label: "3", coins: 3, weight: 110 },
  { label: "4", coins: 4, weight: 85 },
  { label: "5", coins: 5, weight: 72 },
  { label: "6", coins: 6, weight: 60 },
  { label: "7", coins: 7, weight: 50 },
  { label: "8", coins: 8, weight: 42 },
  { label: "9", coins: 9, weight: 36 },
  { label: "10", coins: 10, weight: 30 },
  { label: "12", coins: 12, weight: 26 },
  { label: "14", coins: 14, weight: 22 },
  { label: "16", coins: 16, weight: 19 },
  { label: "18", coins: 18, weight: 16 },
  { label: "20", coins: 20, weight: 14 },
  { label: "25", coins: 25, weight: 12 },
  { label: "30", coins: 30, weight: 10 },
  { label: "35", coins: 35, weight: 9 },
  { label: "40", coins: 40, weight: 8 },
  { label: "50", coins: 50, weight: 7 },
  { label: "60", coins: 60, weight: 6 },
  { label: "70", coins: 70, weight: 5 },
  { label: "80", coins: 80, weight: 4 },
  { label: "90", coins: 90, weight: 4 },
  { label: "100", coins: 100, weight: 3 },
  { label: "120", coins: 120, weight: 3 },
  { label: "140", coins: 140, weight: 2 },
  { label: "160", coins: 160, weight: 2 },
  { label: "180", coins: 180, weight: 2 },
  { label: "200", coins: 200, weight: 1 },
];

function pickSegment() {
  const total = WHEEL_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    roll -= WHEEL_SEGMENTS[i].weight;
    if (roll < 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

function wheelState(user, key) {
  const unlimited = key === "hermione";
  return {
    segments: WHEEL_SEGMENTS.map((s) => ({ label: s.label, coins: s.coins, weight: s.weight })),
    unlimited,
    spunToday: user.wheelDay === todayKey(),
    canSpin: unlimited || user.wheelDay !== todayKey(),
  };
}

// Guests get the wheel too, with unlimited spins: they keep no currency, and
// the game is only for testers, so there is nothing to gate.
const wheelSegmentsPayload = () => WHEEL_SEGMENTS.map((s) => ({ label: s.label, coins: s.coins, weight: s.weight }));

app.get("/api/wheel", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  if (req.session.guest && !req.session.username) {
    touchGuest(req);
    return res.json({ segments: wheelSegmentsPayload(), unlimited: true, spunToday: false, canSpin: true });
  }
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json(wheelState(user, key));
});

app.post("/api/wheel/spin", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  // guest: unlimited spins, no persistence, no currency kept
  if (req.session.guest && !req.session.username) {
    touchGuest(req);
    const gi = pickSegment();
    const gp = WHEEL_SEGMENTS[gi];
    return res.json({ ok: true, index: gi, label: gp.label, won: gp.coins, angelcoins: 0, canSpin: true });
  }
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const unlimited = key === "hermione";
  if (!unlimited && user.wheelDay === todayKey()) {
    return res.status(429).json({ error: "You've already spun today." });
  }
  const index = pickSegment();
  const prize = WHEEL_SEGMENTS[index];
  // hermione still records the day so the daily objective completes; it just
  // doesn't gate her next spin
  user.wheelDay = todayKey();
  // angelcoins were removed; the wheel no longer credits anything (it is also
  // unlinked from the game wall now)
  saveUsers(users);
  res.json({
    ok: true,
    index,
    label: prize.label,
    won: prize.coins,
    points: user.points,
    angelcoins: user.angelcoins || 0,
    canSpin: unlimited,
  });
});

// --- slots: the ANGELCOIN INSTANT scratch card ---
// One card, three panels, match three. A card costs SLOTS_STAKE angelcoins; the
// outcome is rolled here (never on the client) so the panels the player scratches
// off only reveal a result that is already decided. Symbols carry a three-of-a-
// kind payout; any two matching pays a small consolation. Weights are out of 1000
// and tuned to about a 76% return, so it is a gentle coin sink with wins frequent
// enough to be worth the scratch.
const SLOTS_STAKE = 10;
const SLOTS_SYMBOLS = ["✦", "☾", "✚", "❖", "♛", "♣"];
const SLOTS_TWO_PAYS = 6;
// outcome table: three-of-a-kind tiers, any-two, and lose. weights sum to 1000.
const SLOTS_OUTCOMES = [
  { kind: "three", symbol: "✦", pays: 250, weight: 2 },
  { kind: "three", symbol: "☾", pays: 120, weight: 5 },
  { kind: "three", symbol: "✚", pays: 80, weight: 10 },
  { kind: "three", symbol: "❖", pays: 60, weight: 18 },
  { kind: "three", symbol: "♛", pays: 40, weight: 30 },
  { kind: "three", symbol: "♣", pays: 25, weight: 55 },
  { kind: "two", pays: SLOTS_TWO_PAYS, weight: 340 },
  { kind: "lose", pays: 0, weight: 540 },
];
const SLOTS_PAYTABLE = SLOTS_SYMBOLS
  .map((s) => {
    const o = SLOTS_OUTCOMES.find((x) => x.kind === "three" && x.symbol === s);
    return { combo: s + " " + s + " " + s, pays: o ? o.pays : 0 };
  })
  .concat([{ combo: "any two", pays: SLOTS_TWO_PAYS }]);

function pickSlotsOutcome() {
  const total = SLOTS_OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of SLOTS_OUTCOMES) {
    roll -= o.weight;
    if (roll < 0) return o;
  }
  return SLOTS_OUTCOMES[SLOTS_OUTCOMES.length - 1];
}

// Turn a decided outcome into the three panel symbols the player will uncover.
function slotsPanels(outcome) {
  const other = (not) => {
    const pool = SLOTS_SYMBOLS.filter((s) => !not.includes(s));
    return pool[Math.floor(Math.random() * pool.length)];
  };
  if (outcome.kind === "three") return [outcome.symbol, outcome.symbol, outcome.symbol];
  if (outcome.kind === "two") {
    const pair = SLOTS_SYMBOLS[Math.floor(Math.random() * SLOTS_SYMBOLS.length)];
    const odd = other([pair]);
    // place the odd one out in a random position
    const cells = [pair, pair, odd];
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells;
  }
  // lose: three distinct symbols, so no two match
  const a = SLOTS_SYMBOLS[Math.floor(Math.random() * SLOTS_SYMBOLS.length)];
  const b = other([a]);
  const c = other([a, b]);
  return [a, b, c];
}

function slotsState(user, key) {
  const unlimited = key === "hermione";
  return {
    stake: SLOTS_STAKE,
    paytable: SLOTS_PAYTABLE,
    balance: unlimited ? null : user.angelcoins || 0,
    unlimited,
    canPlay: unlimited || (user.angelcoins || 0) >= SLOTS_STAKE,
  };
}

app.get("/api/slots", requirePlayer, (req, res) => {
  const users = loadUsers();
  const key = req.session.username && req.session.username.toLowerCase();
  const user = (key && users[key]) || {};
  res.json(slotsState(user, key));
});

app.post("/api/slots/buy", requirePlayer, (req, res) => {
  const users = loadUsers();
  const key = req.session.username && req.session.username.toLowerCase();
  const user = key && users[key];
  const unlimited = key === "hermione";
  // A guest or Visitor has no wallet to stake from, so they cannot play for keeps.
  if (!user || (!unlimited && rankFor(user, key) === "Visitor")) {
    return res.status(403).json({ error: "This game needs an account with angelcoins." });
  }
  const balance = user.angelcoins || 0;
  if (!unlimited && balance < SLOTS_STAKE) {
    return res.status(402).json({ error: "Not enough angelcoins for a card." });
  }
  const outcome = pickSlotsOutcome();
  const panels = slotsPanels(outcome);
  const won = outcome.pays;
  if (!unlimited) {
    user.angelcoins = balance - SLOTS_STAKE + won;
    saveUsers(users);
  }
  res.json({
    ok: true,
    panels,
    won,
    stake: SLOTS_STAKE,
    net: won - SLOTS_STAKE,
    balance: unlimited ? null : user.angelcoins,
    canPlay: unlimited || (user.angelcoins || 0) >= SLOTS_STAKE,
  });
});

// The dailies panel and its API were removed: the objectives were busywork.
// The payouts they used to advertise (the Snake completion bonus, the
// Devotion 50-line reward) still fire; they are just no longer presented
// as a checklist.

// --- writing: categories of passages, typed one after another ---
// The player only sees the category; what's inside is shuffled per attempt.
const DEFAULT_CATEGORIES = [
  {
    id: "main",
    title: "Main",
    passages: Array.from({ length: 9 }, (_, i) => ({
      id: "main-" + (i + 1),
      text: "This is placeholder passage number " + (i + 1) +
        ". Type it exactly as it appears, with no mistakes and no going back.",
    })),
  },
  ...[1, 2, 3].map((n) => ({
    id: "placeholder-" + n,
    title: "Placeholder " + n,
    passages: [
      {
        id: "placeholder-" + n + "-1",
        text: "Placeholder category " + n + ", first passage. Replace this with something worth writing.",
      },
    ],
  })),
];

// The stored file is authoritative once it exists. On the very first read we
// seed it from the in-code defaults and write it to disk, so from then on
// Hermione's edits are the only source and can never be shadowed or reverted by
// the defaults. Deep-cloned so the DEFAULT_CATEGORIES constant is never mutated.
function loadCategories() {
  try {
    const stored = JSON.parse(fs.readFileSync(WRITING_FILE, "utf8"));
    if (Array.isArray(stored) && stored.length && stored.every((c) => Array.isArray(c.passages))) {
      return stored;
    }
  } catch {}
  const seeded = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  try { saveCategories(seeded); } catch {}
  return seeded;
}

function saveCategories(categories) {
  fs.writeFileSync(WRITING_FILE, JSON.stringify(categories, null, 2));
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// the shelf: titles and counts only, never the passages themselves
app.get("/api/writing", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  res.json({
    categories: loadCategories().map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      count: c.passages.length,
    })),
  });
});

// starting a category hands over its passages in a fresh random order
app.get("/api/writing/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const category = loadCategories().find((c) => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: "No such category." });
  res.json({
    category: { id: category.id, title: category.title },
    passages: shuffled(category.passages),
  });
});

// hermione edits a whole category at once
app.put("/api/writing/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const categories = loadCategories();
  const category = categories.find((c) => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: "No such category." });

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: "Give it a title." });
    // count by code point so decorative/astral unicode is not double-counted
    if ([...title].length > 120) return res.status(400).json({ error: "Title must be 120 characters or fewer." });
    category.title = title;
  }
  if (req.body.description !== undefined) {
    const description = String(req.body.description).trim();
    if ([...description].length > 200) {
      return res.status(400).json({ error: "Description must be 200 characters or fewer." });
    }
    category.description = description;
  }
  if (req.body.passages !== undefined) {
    if (!Array.isArray(req.body.passages)) {
      return res.status(400).json({ error: "Passages must be a list." });
    }
    const cleaned = req.body.passages
      .map((t) => String(t).replace(/\r\n/g, "\n").trim())
      .filter(Boolean);
    if (!cleaned.length) return res.status(400).json({ error: "A category needs at least one passage." });
    if (cleaned.some((t) => t.length > 2000)) {
      return res.status(400).json({ error: "Each passage must be 2000 characters or fewer." });
    }
    category.passages = cleaned.map((text, i) => ({ id: category.id + "-" + (i + 1), text }));
  }
  saveCategories(categories);
  res.json({ ok: true, category: { id: category.id, title: category.title, description: category.description || "", count: category.passages.length } });
});

// A finished writing series, reported by the client. The Writing game is
// client-refereed already (see the trust notes), so this is the same honest
// boundary: the numbers are taken on trust and kept for Hermione to look at.
const WRITING_LOG_CAP = 25;
app.post("/api/writing/complete", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });

  const clampInt = (v, hi) => Math.max(0, Math.min(hi, parseInt(v, 10) || 0));
  const entry = {
    id: "wl-" + Date.now(),
    category: String(req.body.category || "").slice(0, 120),
    passages: clampInt(req.body.passages, 100000),
    mistakes: clampInt(req.body.mistakes, 1000000),
    elapsedMs: clampInt(req.body.elapsedMs, 1000 * 60 * 60 * 24),
    at: new Date().toISOString(),
  };
  // Seed the lifetime counters before the new entry joins the log, or the
  // backfill would count this series twice.
  writingCounters(user);
  user.linesCompleted += entry.passages;
  if (entry.category === "penance") user.penanceSeries += 1;
  if (entry.category === "devotion") user.devotionSeries += 1;

  user.writingLog = [entry, ...(Array.isArray(user.writingLog) ? user.writingLog : [])].slice(0, WRITING_LOG_CAP);
  user.writingTasksCompleted = (user.writingTasksCompleted || 0) + 1;
  user.lettersTyped = (user.lettersTyped || 0) + clampInt(req.body.letters, 100000000);

  // The day's Devotion line count is still kept, because Hermione reads it.
  // The payout that used to come with crossing 50 is gone with the dailies.
  const today = todayKey();
  if (entry.category === "devotion") {
    if (user.devotionDay !== today) { user.devotionDay = today; user.devotionCount = 0; }
    user.devotionCount = (user.devotionCount || 0) + entry.passages;
  }

  // tell Hermione, but never about her own practice runs
  const hermione = users["hermione"];
  if (hermione && key !== "hermione") {
    pushNotification(
      hermione,
      "writing-" + key,
      user.username + " finished a writing series" + (entry.category ? " (" + entry.category + ")" : "") + ".",
      "/admin"
    );
  }
  saveUsers(users);
  res.json({ ok: true });
});

// Hermione reads a player's writing history
app.get("/api/users/:username/writing", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const u = users[req.params.username.toLowerCase()];
  if (!u) return res.status(404).json({ error: "No such account." });
  res.json({ log: Array.isArray(u.writingLog) ? u.writingLog : [] });
});

// Hermione dismisses a finished-series entry so the list doesn't pile up.
app.delete("/api/users/:username/writing/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const u = users[req.params.username.toLowerCase()];
  if (!u) return res.status(404).json({ error: "No such account." });
  const before = Array.isArray(u.writingLog) ? u.writingLog.length : 0;
  u.writingLog = (Array.isArray(u.writingLog) ? u.writingLog : []).filter((e) => e.id !== req.params.id);
  if (u.writingLog.length !== before) saveUsers(users);
  res.json({ ok: true });
});

// --- tithe: REMOVED ---
// Tithing is deprecated. The button came off the dashboard, but settleTithe()
// was still running on login and on every /api/me, so accounts were quietly
// still being docked 25 points a day and told so in their notifications. Both
// the penalty and the /api/tithe route are gone.
//
// This sweeps up what the old system already left behind: the stale
// "You did not tithe" notification, and the bookkeeping fields it kept. It
// runs once per account, the next time that account is loaded.
function clearTitheLeftovers(users, key) {
  const user = users[key];
  if (!user) return false;
  let changed = false;
  if (Array.isArray(user.notifications)) {
    const kept = user.notifications.filter((n) => n.id !== "tithe-miss");
    if (kept.length !== user.notifications.length) { user.notifications = kept; changed = true; }
  }
  for (const f of ["tithedOn", "titheCheckedOn"]) {
    if (f in user) { delete user[f]; changed = true; }
  }
  return changed;
}

// --- editable site copy ---
// Two audiences, so hermione can word her own dashboard differently from
// everyone else's. {name} stands in for the viewer's username.
const SITE_DEFAULTS = {
  welcomeAdmin: "Welcome, Angel!",
  welcomeUser: "Welcome, {name}!",
  messageAdmin: "mirror mirror on the wall.",
  messageUser: "There is no text here yet.",
  // the two intro slides a disciple reads at the top of the onboarding questionnaire
  onboardingAbout: "placeholder. This is where Hermione introduces herself: who she is, how she runs things, and what a disciple can expect. Editable from the admin panel.",
  onboardingPurpose: "placeholder. What angeldom.me is for, what the account gives you, and what this questionnaire is used for. Your answers are sent to Hermione, who reviews them before your account is approved.",
};

function loadSite() {
  try {
    return { ...SITE_DEFAULTS, ...JSON.parse(fs.readFileSync(SITE_FILE, "utf8")) };
  } catch {
    return { ...SITE_DEFAULTS };
  }
}
function saveSite(site) {
  fs.writeFileSync(SITE_FILE, JSON.stringify(site, null, 2));
}

app.get("/api/site", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const site = loadSite();
  const admin = isAdmin(req);
  res.json({
    // what this viewer should see, already filled in
    welcome: (admin ? site.welcomeAdmin : site.welcomeUser).replace(/\{name\}/g, req.session.username),
    message: admin ? site.messageAdmin : site.messageUser,
    raw: admin ? site : undefined,     // hermione also gets the templates to edit
  });
});

app.put("/api/site", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const site = loadSite();
  for (const key of Object.keys(SITE_DEFAULTS)) {
    if (req.body[key] === undefined) continue;
    const value = String(req.body[key]).trim();
    if (!value) return res.status(400).json({ error: "Text can't be empty." });
    // the onboarding intros are paragraphs; the hero copy stays a short line
    const max = key.startsWith("onboarding") ? 2000 : 200;
    if (value.length > max) return res.status(400).json({ error: "Keep it under " + max + " characters." });
    site[key] = value;
  }
  saveSite(site);
  res.json({ ok: true, raw: site });
});

// --- Devotion presets (Hermione-editable line sets for the gentle game) ---
// A preset is { id, name, lines[] }. lines[0] is ALWAYS shown first; lines[1..]
// are the shuffle pool the client draws from (randomised, no immediate repeat).
const DEVOTION_DEFAULTS = {
  presets: [
    {
      id: "devotion",
      name: "devotion",
      lines: [
        "Hermione is my guardian angel.",
        "I belong at Her feet.",
        "I am not in control.",
        "Her will is Divine. I will obey.",
        "My soul is damaged. Only obedience will bring salvation.",
        "Suffering will make me whole.",
        "She knows what is best for me. I will not stray from Her guidance.",
        "There is nothing except for Her.",
        "Her happiness is all that matters.",
        "I will not take Her mercy for granted.",
        "She is my guiding light.",
        "She will be so pleased with me.",
        "I kiss the ground upon which she steps.",
        "Hermione knows best.",
      ],
    },
  ],
};
function loadDevotion() {
  try {
    const data = JSON.parse(fs.readFileSync(DEVOTION_FILE, "utf8"));
    if (data && Array.isArray(data.presets) && data.presets.length) return data;
  } catch {}
  return JSON.parse(JSON.stringify(DEVOTION_DEFAULTS));
}
function saveDevotion(data) {
  fs.writeFileSync(DEVOTION_FILE, JSON.stringify(data, null, 2));
}

// Any player (accounts or guests) may read the presets to play Devotion.
/* Penance gets preset line-sets too, stored and edited exactly like Devotion's.
   Penance keeps its own free-text box as well: a preset is an alternative to
   writing your own lines, not a replacement for it. */
const PENANCE_DEFAULTS = {
  presets: [
    {
      id: "correction",
      name: "correction",
      lines: [
        "I will not waste Her time.",
        "I was warned, and I did it anyway.",
        "I am writing this because I earned it.",
        "My comfort is not the point.",
        "I will do better because She expects it.",
        "I am sorry, and sorry is not enough.",
      ],
    },
    {
      id: "obedience",
      name: "obedience",
      lines: [
        "I do not decide what happens to me.",
        "I asked for this and I will finish it.",
        "Her patience is not infinite.",
        "I will not argue with Her judgement.",
        "I exist to be corrected.",
      ],
    },
  ],
};
function loadPenance() {
  try {
    const data = JSON.parse(fs.readFileSync(PENANCE_FILE, "utf8"));
    if (data && Array.isArray(data.presets) && data.presets.length) return data;
  } catch {}
  return JSON.parse(JSON.stringify(PENANCE_DEFAULTS));
}

// one validator for both games' presets
function cleanPresets(incoming, fallbackName) {
  const presets = [];
  for (const p of incoming) {
    const name = String(p && p.name || "").trim().slice(0, 60) || fallbackName;
    const lines = (Array.isArray(p && p.lines) ? p.lines : [])
      .map((l) => String(l).trim()).filter(Boolean).slice(0, 100);
    if (!lines.length) continue;               // a preset needs at least one line
    const id = String(p && p.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 40) || ("preset-" + presets.length);
    presets.push({ id, name, lines });
  }
  return presets;
}

app.get("/api/penance/presets", (req, res) => {
  if (!req.session.username && !req.session.guest) return res.status(401).json({ error: "Not logged in." });
  res.json({ presets: loadPenance().presets });
});
app.post("/api/penance/presets", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const incoming = Array.isArray(req.body.presets) ? req.body.presets : null;
  if (!incoming) return res.status(400).json({ error: "presets must be an array." });
  const presets = cleanPresets(incoming, "penance");
  if (!presets.length) return res.status(400).json({ error: "Add at least one preset with a line." });
  fs.writeFileSync(PENANCE_FILE, JSON.stringify({ presets }, null, 2));
  res.json({ ok: true, presets });
});

app.get("/api/devotion/presets", (req, res) => {
  if (!req.session.username && !req.session.guest) return res.status(401).json({ error: "Not logged in." });
  res.json({ presets: loadDevotion().presets });
});

// Only Hermione may rewrite them.
app.post("/api/devotion/presets", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const incoming = Array.isArray(req.body.presets) ? req.body.presets : null;
  if (!incoming) return res.status(400).json({ error: "presets must be an array." });
  const presets = [];
  for (const p of incoming) {
    const name = String(p && p.name || "").trim().slice(0, 60) || "devotion";
    const lines = (Array.isArray(p && p.lines) ? p.lines : [])
      .map((l) => String(l).trim()).filter(Boolean).slice(0, 100);
    if (!lines.length) continue;                 // a preset needs at least one line
    const id = String(p && p.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || ("preset-" + presets.length);
    presets.push({ id, name, lines });
  }
  if (!presets.length) return res.status(400).json({ error: "Add at least one preset with a line." });
  const data = { presets };
  saveDevotion(data);
  res.json({ ok: true, presets });
});

// Cheap and unauthenticated on purpose: it leaks nothing and every page,
// signed in or not, needs to be able to poll it.
app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ build: BUILD_ID });
});

/* The lines the login decrypt animation resolves into. Stored and edited the
   same way the Devotion presets are; the login page reads them before anyone is
   signed in, so the GET is deliberately open. */
const DECRYPT_DEFAULTS = {
  lines: [
    "Her will is Divine. I will obey.",
    "My soul is damaged. Only obedience will bring salvation.",
    "There is nothing except for Her.",
    "Her happiness is all that matters.",
    "Hermione knows best.",
  ],
};
function loadDecrypt() {
  try {
    const data = JSON.parse(fs.readFileSync(DECRYPT_FILE, "utf8"));
    if (data && Array.isArray(data.lines) && data.lines.length) return data;
  } catch {}
  return JSON.parse(JSON.stringify(DECRYPT_DEFAULTS));
}
app.get("/api/decrypt", (req, res) => {
  res.json({ lines: loadDecrypt().lines });
});
app.post("/api/decrypt", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const incoming = Array.isArray(req.body.lines) ? req.body.lines : null;
  if (!incoming) return res.status(400).json({ error: "lines must be an array." });
  const lines = incoming.map((m) => String(m).trim().slice(0, 160)).filter(Boolean).slice(0, 60);
  if (!lines.length) return res.status(400).json({ error: "Add at least one line." });
  fs.writeFileSync(DECRYPT_FILE, JSON.stringify({ lines }, null, 2));
  res.json({ ok: true, lines });
});

// (the subliminal and snake-taunt pools were removed with subliminals)

// --- notifications ---
// Placeholder until real triggers exist: cleared notifications come back on the
// next login, so the bell always has something to show after signing in.
// One id per subject, so repeat events refresh a single line instead of piling up.
// `href` is optional: when a notification is about something you can act on,
// it carries the page to act on it, and the bell renders a button. Stored on
// the record rather than derived from the id in the browser, so the server
// stays the one place that knows where a thing lives.
function pushNotification(user, id, text, href) {
  const list = Array.isArray(user.notifications) ? user.notifications : [];
  const note = { id, text, createdAt: new Date().toISOString() };
  if (href) note.href = href;
  user.notifications = [note, ...list.filter((n) => n.id !== id)].slice(0, 20);
}

// removes a notification once whatever it was asking about is dealt with
function dropNotification(user, id) {
  if (!user || !Array.isArray(user.notifications)) return;
  user.notifications = user.notifications.filter((n) => n.id !== id);
}

// Nudge about the day's objectives once per noon-Eastern day, so it lands when
// the dailies actually reset rather than on every sign-in.

app.get("/api/notifications", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });

  res.json({
    notifications: Array.isArray(user.notifications) ? user.notifications : [],
  });
});

app.delete("/api/notifications/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const user = users[req.session.username.toLowerCase()];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const list = Array.isArray(user.notifications) ? user.notifications : [];
  user.notifications = list.filter((n) => String(n.id) !== req.params.id);
  saveUsers(users);
  res.json({ ok: true, notifications: user.notifications });
});

app.post("/api/notifications/clear", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const user = users[req.session.username.toLowerCase()];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  user.notifications = [];
  saveUsers(users);
  res.json({ ok: true });
});

// --- tasks: assigned by hermione or granted automatically. Read-only for now;
// the assignment and auto-award flows come later.
// --- tasks Hermione sets ---
//
// Stored on the user record as `tasks`, so a task travels with its owner and
// there is no join to do. Two kinds so far:
//
//   essay      { topic, minWords }        -> written on /task, submission kept
//   repetition { text, reps }             -> typed on /task, reps counted
//
// Shared keys: id, type, status, points, assignedAt, completedAt. `source`
// marks them apart from the automatic dailies.
//
// status runs active -> submitted -> done for essays, because Hermione reads
// them before they count. A repetition has nothing to judge, so it goes
// straight to done once the count is met. Sending an essay back returns it to
// active with the text intact and a note explaining why.
const TASK_TOPIC_MAX = 200;
const TASK_TEXT_MAX = 2000;
const ESSAY_MAX = 50000;
const TASK_MAX_WORDS = 100000;
const TASK_MAX_REPS = 500;

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function ownTasks(user) {
  return Array.isArray(user.tasks) ? user.tasks : [];
}

// what the assignee is allowed to see: never another person's business, and
// the essay they wrote comes back so they can reread it
function taskForPlayer(t) {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    detail: t.detail || "",
    source: t.source || "hermione",
    status: t.status,
    points: t.points || 0,
    assignedAt: t.assignedAt,
    completedAt: t.completedAt || null,
    minWords: t.minWords || 0,
    text: t.text || "",
    reps: t.reps || 0,
    repsDone: t.repsDone || 0,
    submission: t.submission || "",
    reviewNote: t.reviewNote || "",
    submittedAt: t.submittedAt || null,
  };
}

app.get("/api/tasks", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json({ tasks: ownTasks(user).map(taskForPlayer) });
});

// Hermione assigns a task
app.post("/api/users/:username/tasks", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });

  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  if (key === "hermione") return res.status(400).json({ error: "Hermione sets her own agenda." });
  if (isPending(user)) return res.status(400).json({ error: "Approve that account first." });

  const type = String(req.body.type || "");
  if (type !== "essay" && type !== "repetition") {
    return res.status(400).json({ error: "Pick a task type." });
  }
  // Deliberate every time: no default, so a reward is never assigned by
  // accident just because a field was left alone.
  if (req.body.points === undefined || req.body.points === null || req.body.points === "") {
    return res.status(400).json({ error: "Set a reward, even if it is zero." });
  }
  const points = Number(req.body.points);
  if (!Number.isInteger(points) || points < 0) {
    return res.status(400).json({ error: "Reward must be a whole number, zero or more." });
  }

  const task = {
    id: "task-" + Date.now(),
    type,
    source: "hermione",
    status: "active",
    points,
    assignedAt: new Date().toISOString(),
    completedAt: null,
    detail: String(req.body.detail || "").trim().slice(0, TASK_TOPIC_MAX),
  };

  if (type === "essay") {
    const topic = String(req.body.topic || "").trim();
    if (!topic) return res.status(400).json({ error: "Give the essay a topic." });
    if (topic.length > TASK_TOPIC_MAX) {
      return res.status(400).json({ error: "Topic must be " + TASK_TOPIC_MAX + " characters or fewer." });
    }
    const minWords = Number(req.body.minWords);
    if (!Number.isInteger(minWords) || minWords < 1 || minWords > TASK_MAX_WORDS) {
      return res.status(400).json({ error: "Set a word count between 1 and " + TASK_MAX_WORDS + "." });
    }
    task.title = topic;
    task.minWords = minWords;
    task.submission = "";
  } else {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Give her something to write." });
    if (text.length > TASK_TEXT_MAX) {
      return res.status(400).json({ error: "Text must be " + TASK_TEXT_MAX + " characters or fewer." });
    }
    const reps = Number(req.body.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > TASK_MAX_REPS) {
      return res.status(400).json({ error: "Set a repetition count between 1 and " + TASK_MAX_REPS + "." });
    }
    task.title = "Write it out " + reps + (reps === 1 ? " time" : " times");
    task.text = text;
    task.reps = reps;
    task.repsDone = 0;
  }

  user.tasks = [...ownTasks(user), task];
  pushNotification(
    user,
    task.id,
    "Hermione has set you a task: " + task.title + ".",
    "/tasks"
  );
  saveUsers(users);
  res.json({ ok: true, task: taskForPlayer(task) });
});

// Hermione removes one
app.delete("/api/users/:username/tasks/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  const before = ownTasks(user).length;
  user.tasks = ownTasks(user).filter((t) => t.id !== req.params.id);
  if (user.tasks.length === before) return res.status(404).json({ error: "No such task." });
  dropNotification(user, req.params.id);
  saveUsers(users);
  res.json({ ok: true });
});

// Hermione reads someone's tasks, submissions included
app.get("/api/users/:username/tasks", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const users = loadUsers();
  const user = users[req.params.username.toLowerCase()];
  if (!user) return res.status(404).json({ error: "No such account." });
  res.json({ tasks: ownTasks(user).map(taskForPlayer) });
});

// Hermione reads a handed-in essay and either takes it or sends it back
app.post("/api/users/:username/tasks/:id/review", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });

  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(404).json({ error: "No such account." });
  const task = ownTasks(user).find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "No such task." });
  if (task.status !== "submitted") {
    return res.status(400).json({ error: "That is not waiting to be read." });
  }

  const note = String(req.body.note || "").trim().slice(0, TASK_TOPIC_MAX);

  if (req.body.approve) {
    task.reviewNote = note;
    completeTask(user, task);
    pushNotification(
      user,
      "task-reviewed-" + task.id,
      "Hermione accepted your work on " + task.title + "." +
        (task.points ? " " + task.points + " points." : ""),
      "/tasks"
    );
  } else {
    // back to the assignee, text kept so they can revise rather than restart
    task.status = "active";
    task.submittedAt = null;
    task.reviewNote = note || "Hermione has sent this back.";
    pushNotification(
      user,
      "task-reviewed-" + task.id,
      "Hermione sent back " + task.title + ". " + task.reviewNote,
      "/task?id=" + task.id
    );
  }

  const hermione = users["hermione"];
  if (hermione) dropNotification(hermione, "review-" + task.id);
  saveUsers(users);
  res.json({ ok: true, task: taskForPlayer(task) });
});

// awards the reward once, when a task first reaches done
function completeTask(user, task) {
  if (task.status === "done") return;
  task.status = "done";
  task.completedAt = new Date().toISOString();
  user.customTasksCompleted = (user.customTasksCompleted || 0) + 1;
  if (task.points) user.points = (user.points || 0) + task.points;
}

// submit an essay: the word count is checked here, not in the browser
app.post("/api/tasks/:id/essay", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const user = users[req.session.username.toLowerCase()];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const task = ownTasks(user).find((t) => t.id === req.params.id);
  if (!task || task.type !== "essay") return res.status(404).json({ error: "No such task." });

  const submission = String(req.body.submission || "");
  if (submission.length > ESSAY_MAX) {
    return res.status(400).json({ error: "That is longer than this box can hold." });
  }
  const words = countWords(submission);
  if (words < task.minWords) {
    return res.status(400).json({
      error: "You need " + task.minWords + " words. You have " + words + ".",
      words,
    });
  }
  task.submission = submission;
  task.status = "submitted";
  task.submittedAt = new Date().toISOString();
  task.reviewNote = "";        // a fresh hand-in clears the last knockback
  const hermione = users["hermione"];
  if (hermione) {
    pushNotification(
      hermione,
      "review-" + task.id,
      user.username + " has handed in " + task.title + ".",
      "/admin"
    );
  }
  saveUsers(users);
  res.json({ ok: true, words, task: taskForPlayer(task), points: user.points || 0 });
});

// record one finished repetition. The typed text is sent back and must match,
// which is a light check rather than a real one: the same honest-boundary
// posture as snake, since the client is refereeing the typing.
app.post("/api/tasks/:id/rep", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const user = users[req.session.username.toLowerCase()];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const task = ownTasks(user).find((t) => t.id === req.params.id);
  if (!task || task.type !== "repetition") return res.status(404).json({ error: "No such task." });
  if (task.status === "done") return res.json({ ok: true, task: taskForPlayer(task) });

  if (String(req.body.text || "") !== task.text) {
    return res.status(400).json({ error: "That is not what she asked for." });
  }
  task.repsDone = Math.min(task.reps, (task.repsDone || 0) + 1);
  user.lettersTyped = (user.lettersTyped || 0) + [...task.text].length;
  if (task.repsDone >= task.reps) completeTask(user, task);
  saveUsers(users);
  res.json({ ok: true, task: taskForPlayer(task), points: user.points || 0 });
});

// one page for doing a task; it branches on the task's type
app.get("/task", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "task.html"));
});

app.get("/tasks", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "tasks.html"));
});

app.get("/deathroll", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "deathroll.html"));
});

app.get("/games", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "games.html"));
});

app.get("/skillcheck", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "skillcheck.html"));
});

app.get("/wheel", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "wheel.html"));
});

app.get(["/lottery", "/slots"], requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "slots.html"));
});

app.get("/writing", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "writing.html"));
});

app.get("/guide", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "guide.html"));
});

app.get("/tech", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "tech.html"));
});

app.get("/profile", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "profile.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
