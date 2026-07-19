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

// --- simple JSON-file user store (fine for testing; swap for a DB later) ---
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
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
    dollars: 0,
  };
  saveUsers(users);
  req.session.username = username;
  res.json({ ok: true });
});

// --- currency ---
const DAILY_CHECKIN_DOLLARS = 5;
const SNAKE_FOOD_DOLLARS = 1;
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

// grants $5 the first time an account is seen each day; returns null otherwise
function awardDailyCheckIn(users, key) {
  const user = users[key];
  if (!user) return null;
  const today = todayKey();
  if (user.lastCheckIn === today) return null;
  user.lastCheckIn = today;
  user.dollars = (user.dollars || 0) + DAILY_CHECKIN_DOLLARS;
  saveUsers(users);
  return { amount: DAILY_CHECKIN_DOLLARS, dollars: user.dollars };
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
  // sessions outlive a day, so check in on the first page view of each day too
  const checkIn = awardDailyCheckIn(users, key);
  res.json({
    username: req.session.username,
    isAdmin: isAdmin(req),
    dollars: users[key].dollars || 0,
    checkIn,
  });
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// --- profiles: viewable by any logged-in user, editable by the owner or hermione ---
const PRONOUN_OPTIONS = ["She/Her", "He/Him", "They/Them"];
// Rank replaces the old domme/sub role and the old Princess/User badge — one
// value covers both. Princess is hermione's alone and isn't offered at signup.
const RANK_OPTIONS = ["Visitor", "Citizen", "Princess"];
const SIGNUP_RANKS = ["Visitor", "Citizen"];
const LEGACY_RANKS = { domme: "Visitor", sub: "Citizen" };

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
      points: user.points || 0,
      dollars: user.dollars || 0,
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
      points: u.points || 0,
      flagged: !!u.flagged,
    })),
  });
});

app.get("/api/leaderboard", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const board = Object.values(users)
    .filter((u) => u.flagged)
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
  const users = loadUsers();
  const key = req.params.username.toLowerCase();
  if (!users[key]) return res.status(404).json({ error: "No such account." });
  users[key].points = (users[key].points || 0) + amount;
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
      dollars: user.dollars || 0,
    });
  }

  user.snakeToday += SNAKE_FOOD_DOLLARS;
  user.dollars = (user.dollars || 0) + SNAKE_FOOD_DOLLARS;
  saveUsers(users);
  res.json({
    ok: true,
    earned: SNAKE_FOOD_DOLLARS,
    dollars: user.dollars,
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
  res.json({ game: deathrollState(game, admin), rolled: result });
});

// --- wheel: one spin a day for everyone except hermione ---
// The server picks the winning wedge; the page only animates to it.
const WHEEL_SEGMENTS = [
  { label: "$1", dollars: 1, weight: 10 },
  { label: "$2", dollars: 2, weight: 9 },
  { label: "$3", dollars: 3, weight: 8 },
  { label: "$5", dollars: 5, weight: 7 },
  { label: "$8", dollars: 8, weight: 5 },
  { label: "$10", dollars: 10, weight: 4 },
  { label: "$15", dollars: 15, weight: 2 },
  { label: "$25", dollars: 25, weight: 1 },
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
    segments: WHEEL_SEGMENTS.map((s) => ({ label: s.label, dollars: s.dollars })),
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
  if (!unlimited) user.wheelDay = todayKey();
  user.dollars = (user.dollars || 0) + prize.dollars;
  saveUsers(users);
  res.json({
    ok: true,
    index,
    label: prize.label,
    won: prize.dollars,
    dollars: user.dollars,
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
        reward: "$" + DAILY_CHECKIN_DOLLARS,
        done: user.lastCheckIn === today,
      },
      {
        id: "wheel",
        label: "Spin the wheel",
        detail: "One spin a day.",
        reward: "up to $" + Math.max(...WHEEL_SEGMENTS.map((s) => s.dollars)),
        done: key !== "hermione" && user.wheelDay === today,
      },
      {
        id: "snake",
        label: "Snake earnings",
        detail: "$" + SNAKE_FOOD_DOLLARS + " for every heart eaten.",
        reward: "$" + SNAKE_DAILY_CAP,
        done: snakeToday >= SNAKE_DAILY_CAP,
        progress: { current: snakeToday, max: SNAKE_DAILY_CAP },
      },
    ],
  });
});

// --- writing: passages the player has to type out exactly ---
// Seeded once, then stored on disk so hermione can rewrite them in-site.
const DEFAULT_PASSAGES = Array.from({ length: 9 }, (_, i) => ({
  id: "placeholder-" + (i + 1),
  title: "Placeholder #" + (i + 1),
  text: "This is placeholder passage number " + (i + 1) +
    ". Type it exactly as it appears, with no mistakes and no going back.",
}));

function loadPassages() {
  try {
    const stored = JSON.parse(fs.readFileSync(WRITING_FILE, "utf8"));
    if (Array.isArray(stored) && stored.length) return stored;
  } catch {}
  return DEFAULT_PASSAGES;
}

function savePassages(passages) {
  fs.writeFileSync(WRITING_FILE, JSON.stringify(passages, null, 2));
}

app.get("/api/writing", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  res.json({ passages: loadPassages() });
});

app.put("/api/writing/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const passages = loadPassages();
  const passage = passages.find((p) => p.id === req.params.id);
  if (!passage) return res.status(404).json({ error: "No such passage." });

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: "Give it a title." });
    if (title.length > 80) return res.status(400).json({ error: "Title must be 80 characters or fewer." });
    passage.title = title;
  }
  if (req.body.text !== undefined) {
    const text = String(req.body.text).replace(/\r\n/g, "\n").trim();
    if (!text) return res.status(400).json({ error: "The passage can't be empty." });
    if (text.length > 2000) return res.status(400).json({ error: "Passage must be 2000 characters or fewer." });
    passage.text = text;
  }
  savePassages(passages);
  res.json({ ok: true, passage });
});

// --- tithe: hand $5 to hermione ---
const TITHE_DOLLARS = 5;

app.post("/api/tithe", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const key = req.session.username.toLowerCase();
  if (key === "hermione") {
    return res.status(400).json({ error: "Hermione has no one to tithe to." });
  }
  const users = loadUsers();
  const user = users[key];
  const hermione = users["hermione"];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  if (!hermione) return res.status(500).json({ error: "There is no one to tithe to." });
  const balance = user.dollars || 0;
  if (balance < TITHE_DOLLARS) {
    return res.status(400).json({ error: "You need $" + TITHE_DOLLARS + " to tithe." });
  }
  user.dollars = balance - TITHE_DOLLARS;
  hermione.dollars = (hermione.dollars || 0) + TITHE_DOLLARS;
  saveUsers(users);
  res.json({ ok: true, amount: TITHE_DOLLARS, dollars: user.dollars });
});

// --- notifications ---
// Placeholder until real triggers exist: cleared notifications come back on the
// next login, so the bell always has something to show after signing in.
const PLACEHOLDER_NOTIFICATION_ID = "placeholder";

function seedNotifications(user) {
  const list = Array.isArray(user.notifications) ? user.notifications : [];
  if (!list.some((n) => n.id === PLACEHOLDER_NOTIFICATION_ID)) {
    list.unshift({
      id: PLACEHOLDER_NOTIFICATION_ID,
      text: "Welcome back! Notifications will show up here.",
      createdAt: new Date().toISOString(),
    });
  }
  user.notifications = list;
}

app.get("/api/notifications", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const user = users[req.session.username.toLowerCase()];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json({ notifications: Array.isArray(user.notifications) ? user.notifications : [] });
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
app.get("/api/tasks", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json({ tasks: Array.isArray(user.tasks) ? user.tasks : [] });
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

app.get("/profile", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "profile.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
