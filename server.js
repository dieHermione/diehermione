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
app.use(express.json());
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
  const users = loadUsers();
  const key = username.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: "That username is already taken." });
  }
  users[key] = {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  req.session.username = username;
  res.json({ ok: true });
});

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
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  res.json({ username: req.session.username });
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
