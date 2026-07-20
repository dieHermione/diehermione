const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(process.env.DATA_DIR || __dirname, "users.json");
const GAMES_FILE = path.join(process.env.DATA_DIR || __dirname, "games.json");
const WRITING_FILE = path.join(process.env.DATA_DIR || __dirname, "writing.json");
const DEATHROLL_FILE = path.join(process.env.DATA_DIR || __dirname, "deathroll.json");
const SITE_FILE = path.join(process.env.DATA_DIR || __dirname, "site.json");

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
  const rank = canonical(req.body.rank, SIGNUP_RANKS);
  if (!rank) {
    return res.status(400).json({ error: "Pick visitor or citizen." });
  }
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
  res.json({ ok: true, pending: true });
});

// An account is usable only once hermione has approved it. Records that predate
// approval have no status and are treated as already approved.
const INTRO_MAX = 500;
function isPending(user) {
  return Boolean(user) && user.status === "pending";
}

// --- currency ---
// Points are the only currency. They used to be admin-granted only, with a
// separate earned "dollars" balance; the two were merged 1:1, so points are now
// both granted and earned, and the leaderboard reflects both.
const DAILY_CHECKIN_POINTS = 5;
const SNAKE_FOOD_POINTS = 1;
// Snake pickups are reported by the browser, so they can't be trusted outright.
// These bound the damage: a daily ceiling makes farming pointless, and a token
// bucket caps the sustained rate while still allowing honest bursts (food can
// spawn right in front of the snake and be eaten on the very next 120ms tick).
const SNAKE_DAILY_CAP = 20;
const SNAKE_BURST = 8;
const SNAKE_REFILL_MS = 2000;

// The daily bonus resets at noon Eastern. Read the Eastern wall clock, then
// step back 12h so the date label only flips at midday rather than midnight.
const RESET_ZONE = "America/New_York";
const RESET_HOUR = 12;
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
  seedNotifications(user);
  saveUsers(users);
  res.json({ ok: true, checkIn });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  if (!users[key]) return res.status(401).json({ error: "Not logged in." });
  // an account put back to pending loses its existing session on the next view
  if (isPending(users[key])) {
    return req.session.destroy(() => res.status(401).json({ error: "Not logged in." }));
  }
  // sessions outlive a day, so check in on the first page view of each day too
  const checkIn = awardDailyCheckIn(users, key);
  res.json({
    username: req.session.username,
    isAdmin: isAdmin(req),
    points: users[key].points || 0,
    checkIn,
  });
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// --- profiles: viewable by any logged-in user, editable by the owner or hermione ---
const PRONOUN_OPTIONS = ["She/Her", "He/Him", "They/Them"];
// Rank replaces the old domme/sub role and the old Princess/User badge. One
// value covers both. Princess is hermione's alone and isn't offered at signup.
// The ladder, highest first. Rank 2 is deliberately unnamed for now.
const RANK_LADDER = [
  { name: "Princess", note: "Hers alone." },
  { name: "??", note: "Not yet spoken of.", unassignable: true },
  { name: "Disciple", note: "" },
  { name: "Worshipper", note: "" },
  { name: "Devoted", note: "" },
  { name: "Follower", note: "" },
  { name: "Servant", note: "" },
];
const RANK_ASIDE = { name: "Visitor", note: "Just passing through." };
const RANK_OPTIONS = [...RANK_LADDER.map((r) => r.name), RANK_ASIDE.name, "Citizen"];
const SIGNUP_RANKS = ["Visitor", "Citizen"];
const LEGACY_RANKS = { domme: "Visitor", sub: "Citizen" };

// what hermione may hand out: everything except Princess and the unnamed rank
const ASSIGNABLE_RANKS = [
  ...RANK_LADDER.filter((r) => r.name !== "Princess" && !r.unassignable).map((r) => r.name),
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
  if (key === "hermione") return "Princess";
  const raw = String((user && (user.rank || user.role)) || "").trim();
  return canonical(raw, RANK_OPTIONS) || LEGACY_RANKS[raw.toLowerCase()] || "";
}

function canEditProfile(req, key) {
  return isAdmin(req) || req.session.username.toLowerCase() === key;
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
      createdAt: user.createdAt,
      canEdit: canEditProfile(req, key),
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
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const board = Object.values(users)
    .filter((u) => u.flagged && u.username.toLowerCase() !== "hermione")
    .map((u) => ({ username: u.username, points: u.points || 0 }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));
  res.json({ users: board });
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
  };
}

function chessKeyFor(req, opponent) {
  if (isAdmin(req)) {
    const key = String(opponent || "").toLowerCase();
    return key && key !== "hermione" ? key : null;
  }
  return req.session.username.toLowerCase();
}

app.get("/api/chess/game", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const key = chessKeyFor(req, req.query.opponent);
  if (!key) return res.status(400).json({ error: "A valid opponent is required." });
  const games = loadGames();
  if (!games[key]) {
    if (isAdmin(req)) return res.status(404).json({ error: "No game with that player yet." });
    games[key] = { fen: new Chess().fen(), history: [], updatedAt: new Date().toISOString() };
    saveGames(games);
  }
  res.json({ game: gameState(games[key], key) });
});

app.post("/api/chess/move", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
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
  entry.fen = fen;
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
  res.json({
    games: Object.entries(games).map(([key, entry]) => {
      const chess = new Chess(entry.fen);
      return {
        opponent: users[key] ? users[key].username : key,
        key,
        turn: chess.turn(),
        gameOver: chess.isGameOver(),
        updatedAt: entry.updatedAt,
      };
    }),
  });
});

// kept out of public/ so the static middleware can't serve it unauthenticated
app.get("/admin", requireLogin, (req, res) => {
  if (!isAdmin(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

app.get("/chess", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "chess.html"));
});

app.get("/snake", requireLogin, (req, res) => {
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
  // rate limit: refill one token every SNAKE_REFILL_MS, up to SNAKE_BURST
  const now = Date.now();
  const bucket = req.session.snakeBucket || { tokens: SNAKE_BURST, at: now };
  const refilled = Math.min(SNAKE_BURST, bucket.tokens + (now - bucket.at) / SNAKE_REFILL_MS);
  if (refilled < 1) {
    req.session.snakeBucket = { tokens: refilled, at: now };
    return res.status(429).json({ error: "Too fast." });
  }
  req.session.snakeBucket = { tokens: refilled - 1, at: now };

  // daily ceiling, on the same noon-Eastern day as the check-in bonus
  const today = todayKey();
  if (user.snakeDay !== today) {
    user.snakeDay = today;
    user.snakeToday = 0;
  }
  if (user.snakeToday >= SNAKE_DAILY_CAP) {
    saveUsers(users);
    return res.json({
      ok: true,
      earned: 0,
      capped: true,
      cap: SNAKE_DAILY_CAP,
      points: user.points || 0,
    });
  }

  user.snakeToday += SNAKE_FOOD_POINTS;
  user.points = (user.points || 0) + SNAKE_FOOD_POINTS;
  saveUsers(users);
  res.json({
    ok: true,
    earned: SNAKE_FOOD_POINTS,
    points: user.points,
    remaining: SNAKE_DAILY_CAP - user.snakeToday,
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
  return req.session.username.toLowerCase();
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
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
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
  res.json({
    players: Object.keys(users)
      .filter((k) => k !== "hermione")
      .map((k) => ({
        username: users[k].username,
        hasGame: Boolean(games[k]),
        yourTurn: Boolean(games[k] && !games[k].over && games[k].turn === "hermione"),
        over: Boolean(games[k] && games[k].over),
      })),
  });
});

// hermione alone sets the opening number
app.post("/api/deathroll/start", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Only Hermione starts a deathroll." });
  const key = deathrollKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "Pick an opponent." });
  const users = loadUsers();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  const sides = Number(req.body.sides);
  if (!Number.isInteger(sides) || sides < DEATHROLL_MIN_SIDES || sides > DEATHROLL_MAX_SIDES) {
    return res.status(400).json({
      error: "Pick a whole number between " + DEATHROLL_MIN_SIDES + " and " + DEATHROLL_MAX_SIDES + ".",
    });
  }
  const games = loadRolls();
  games[key] = {
    opponent: users[key].username,
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
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
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
const WHEEL_SEGMENTS = [
  { label: "1", points: 1, weight: 10 },
  { label: "2", points: 2, weight: 9 },
  { label: "3", points: 3, weight: 8 },
  { label: "5", points: 5, weight: 7 },
  { label: "8", points: 8, weight: 5 },
  { label: "10", points: 10, weight: 4 },
  { label: "15", points: 15, weight: 2 },
  { label: "25", points: 25, weight: 1 },
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
    segments: WHEEL_SEGMENTS.map((s) => ({ label: s.label, points: s.points })),
    unlimited,
    spunToday: user.wheelDay === todayKey(),
    canSpin: unlimited || user.wheelDay !== todayKey(),
  };
}

app.get("/api/wheel", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json(wheelState(user, key));
});

app.post("/api/wheel/spin", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
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
  user.points = (user.points || 0) + prize.points;
  saveUsers(users);
  res.json({
    ok: true,
    index,
    label: prize.label,
    won: prize.points,
    points: user.points,
    canSpin: unlimited,
  });
});

// --- dailies: objectives that reset with the noon-Eastern day ---
app.get("/api/dailies", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const today = todayKey();
  const snakeToday = user.snakeDay === today ? user.snakeToday || 0 : 0;
  res.json({
    resets: "noon Eastern",
    dailies: [
      {
        id: "checkin",
        label: "Daily check-in",
        detail: "Open the site once a day.",
        reward: DAILY_CHECKIN_POINTS + " points",
        done: user.lastCheckIn === today,
      },
      {
        id: "wheel",
        label: "Spin the wheel",
        detail: "One spin a day.",
        reward: "up to " + Math.max(...WHEEL_SEGMENTS.map((s) => s.points)) + " points",
        done: user.wheelDay === today,
      },
      {
        id: "snake",
        label: "Snake earnings",
        detail: SNAKE_FOOD_POINTS + " point for every heart eaten.",
        reward: SNAKE_DAILY_CAP + " points",
        done: snakeToday >= SNAKE_DAILY_CAP,
        progress: { current: snakeToday, max: SNAKE_DAILY_CAP },
      },
    ],
  });
});

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

function loadCategories() {
  try {
    const stored = JSON.parse(fs.readFileSync(WRITING_FILE, "utf8"));
    if (Array.isArray(stored) && stored.length && stored[0].passages) return stored;
  } catch {}
  return DEFAULT_CATEGORIES;
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
    if (title.length > 80) return res.status(400).json({ error: "Title must be 80 characters or fewer." });
    category.title = title;
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
  res.json({ ok: true, category: { id: category.id, title: category.title, count: category.passages.length } });
});

// --- tithe: give up points ---
// The points are burned, not transferred. Hermione doesn't keep points: they
// read as null on her profile and she can't be granted them, so crediting her
// would contradict that. A tithe is a cost, not a transfer.
const TITHE_POINTS = 5;

app.post("/api/tithe", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const key = req.session.username.toLowerCase();
  if (key === "hermione") {
    return res.status(400).json({ error: "Hermione has no one to tithe to." });
  }
  const users = loadUsers();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  const balance = user.points || 0;
  if (balance < TITHE_POINTS) {
    return res.status(400).json({ error: "You need " + TITHE_POINTS + " points to tithe." });
  }
  user.points = balance - TITHE_POINTS;
  saveUsers(users);
  res.json({ ok: true, amount: TITHE_POINTS, points: user.points });
});

// --- editable site copy ---
// Two audiences, so hermione can word her own dashboard differently from
// everyone else's. {name} stands in for the viewer's username.
const SITE_DEFAULTS = {
  welcomeAdmin: "Welcome, Princess!",
  welcomeUser: "Welcome, {name}!",
  messageAdmin: "mirror mirror on the wall.",
  messageUser: "There is no text here yet.",
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
    if (value.length > 200) return res.status(400).json({ error: "Keep it under 200 characters." });
    site[key] = value;
  }
  saveSite(site);
  res.json({ ok: true, raw: site });
});

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
function seedNotifications(user) {
  const today = todayKey();
  if (user.dailiesNotifiedOn === today) return;
  user.dailiesNotifiedOn = today;
  pushNotification(
    user,
    "dailies-" + today,
    "You have new daily objectives to complete. :3",
    "/dashboard"
  );
}

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

app.get("/deathroll", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "deathroll.html"));
});

app.get("/wheel", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "wheel.html"));
});

app.get("/writing", requireLogin, (req, res) => {
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
