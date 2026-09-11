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
const DEATHROLL_FILE = path.join(process.env.DATA_DIR || __dirname, "deathroll.json");
const SITE_FILE = path.join(process.env.DATA_DIR || __dirname, "site.json");
const ELYSIUM_FILE = path.join(process.env.DATA_DIR || __dirname, "elysium.json");
const DEVOTION_FILE = path.join(process.env.DATA_DIR || __dirname, "devotion.json");
const PENANCE_FILE = path.join(process.env.DATA_DIR || __dirname, "penance.json");
const DECRYPT_FILE = path.join(process.env.DATA_DIR || __dirname, "decrypt.json");
const GAMETIPS_FILE = path.join(process.env.DATA_DIR || __dirname, "gametips.json");
const MULTITAP_FILE = path.join(process.env.DATA_DIR || __dirname, "multitap.json");
const OT12_FILE = path.join(process.env.DATA_DIR || __dirname, "ot12.json");
const PARSE_FILE = path.join(process.env.DATA_DIR || __dirname, "parses.json");
const SUMMARY_FILE = path.join(process.env.DATA_DIR || __dirname, "summaries.json");
// finished writing runs (penance / devotion / multitap), for Hermione's Completed tab
const COMPLETED_FILE = path.join(process.env.DATA_DIR || __dirname, "completed.json");

// --- JSON-file user store. Only hermione's record matters now: accounts were
// dropped in favour of guests, and login accepts her alone. Old records may
// still sit in the file; nothing reads them. ---
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

// ---- persistent sessions ----
// Two things used to log everyone out on every deploy:
//   1. the secret defaulted to crypto.randomBytes() when SESSION_SECRET was unset,
//      so each restart signed cookies with a new key and invalidated all of them;
//   2. express-session's default store is in-memory, so the session records were
//      wiped on restart even when the cookie was still valid.
// Both are fixed below so a login survives restarts and redeploys. The store is a
// small file-backed one (sessions.json under DATA_DIR) — same "JSON files on disk,
// no DB" model as everything else, no new dependency. Single-instance only.
const SESSIONS_FILE = path.join(process.env.DATA_DIR || __dirname, "sessions.json");
const SECRET_FILE = path.join(process.env.DATA_DIR || __dirname, ".session-secret");

// A stable secret: the env var if set, else one persisted to DATA_DIR so it is the
// same across restarts even when the env var is absent.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch {}
  const s = crypto.randomBytes(32).toString("hex");
  try { fs.writeFileSync(SECRET_FILE, s); } catch {}
  return s;
}

class FileSessionStore extends session.Store {
  constructor() {
    super();
    this.sessions = new Map();
    this.dirty = false;
    try {
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
      for (const [sid, s] of Object.entries(raw)) this.sessions.set(sid, s);
    } catch {}
    this.prune();
    // Flush at most once a second. Losing up to a second of writes on a hard crash
    // is harmless (worst case, one re-login), and this keeps disk churn tiny.
    setInterval(() => this.flush(), 1000).unref();
  }
  isExpired(s) {
    const exp = s && s.cookie && s.cookie.expires;
    return exp ? Date.now() > new Date(exp).getTime() : false;
  }
  prune() {
    for (const [sid, s] of this.sessions) if (this.isExpired(s)) { this.sessions.delete(sid); this.dirty = true; }
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(this.sessions))); } catch {}
  }
  get(sid, cb) {
    const s = this.sessions.get(sid);
    if (!s) return cb(null, null);
    if (this.isExpired(s)) { this.sessions.delete(sid); this.dirty = true; return cb(null, null); }
    cb(null, s);
  }
  set(sid, s, cb) { this.sessions.set(sid, s); this.dirty = true; if (cb) cb(null); }
  touch(sid, s, cb) { const cur = this.sessions.get(sid); if (cur) { cur.cookie = s.cookie; this.dirty = true; } if (cb) cb(null); }
  destroy(sid, cb) { this.sessions.delete(sid); this.dirty = true; if (cb) cb(null); }
}

app.use(
  session({
    store: new FileSessionStore(),
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true,   // refresh the cookie's expiry on activity, so active users stay in
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);
// The front door. There is no login screen any more: a fresh visitor becomes a
// guest and boots straight into the dashboard (index.html does that), and
// anyone who already has a session skips the boot. Registered before the static
// middleware so it wins over public/index.html. Hermione signs in at /login.
app.get("/", (req, res) => {
  if (req.session.username || req.session.guest) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.username) return res.redirect("/");
  next();
}

function isAdmin(req) {
  return req.session.username && req.session.username.toLowerCase() === "hermione";
}


// Like requireLogin, but a guest session passes too. Used for the game pages a
// guest may reach; account pages keep requireLogin.
function requirePlayer(req, res, next) {
  if (req.session.username || req.session.guest) return next();
  return res.redirect("/");
}

// --- routes ---

// --- Hermione's pages. /login is where `pray login` sends her; nothing on the
// site links to it. Anyone already signed in is sent on to the dashboard. ---
app.get("/login", (req, res) => {
  if (req.session.username) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/commands", (req, res) => {
  if (!isAdmin(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "views", "commands.html"));
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


// The account's chosen accent colour (Settings). Guests keep it in localStorage
// only (this 401s for them, which the client ignores). "" / "default" = blue.
const THEME_COLORS = ["", "default", "ed0955", "710087", "0bdb00", "f7df00", "f78400", "ffa6c5"];
app.post("/api/theme", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  const color = String(req.body.color || "").replace(/^#/, "").toLowerCase();
  if (!THEME_COLORS.includes(color)) return res.status(400).json({ error: "Unknown colour." });
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  const user = users[key];
  if (!user) return res.status(401).json({ error: "Not logged in." });
  user.themeColor = color === "default" ? "" : color;
  saveUsers(users);
  res.json({ ok: true, themeColor: user.themeColor });
});


app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  // Hermione's is the only account that signs in. Other records may still be
  // in users.json; they are not accepted, and get the same error as a wrong
  // password so nothing is revealed about them.
  const users = loadUsers();
  const key = String(username).toLowerCase();
  const user = key === "hermione" ? users[key] : null;
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  req.session.username = user.username;
  req.session.guest = false;
  res.json({ ok: true });
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
  try {
    const trees = loadTrees();
    if (trees[name]) { delete trees[name]; saveTrees(trees); }
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
      return res.json({ guest: true, username: req.session.guestName, isAdmin: false });
    }
    return res.status(401).json({ error: "Not logged in." });
  }
  const users = loadUsers();
  const key = req.session.username.toLowerCase();
  // a session left over from a retired account is signed out on its next view
  if (key !== "hermione" || !users[key]) {
    return req.session.destroy(() => res.status(401).json({ error: "Not logged in." }));
  }
  res.json({
    username: req.session.username,
    isAdmin: true,
    createdAt: users[key].createdAt || null,
    // accounts predating the question have no flag; treat that as not flagged
    photosensitive: users[key].photosensitive === true,
    // the accent colour this account chose (Settings); "" / absent = default blue
    themeColor: users[key].themeColor || "",
    // a hand-made account must set a real password on first sign-in
    mustChangePassword: users[key].mustChangePassword === true,
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
  // Every live guest belongs in the list, not just the ones who have opened
  // /chess already: a game is only created lazily on that first visit. Games
  // left by a reclaimed guest are dropped with the name, so nothing lingers.
  const keys = new Set(Object.keys(games));
  for (const g of listActiveGuests()) keys.add(g);
  const describe = (key) => {
    const entry = games[key];
    const name = key;
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


// --- Elysium: the tree-care game (server-simulated) ---
// State lives in one JSON file keyed by player: hermione, or a guest's transient
// name. A guest's tree lives exactly as long as the guest name does (it is
// dropped with the name after three quiet hours), so it is a short game for
// them by construction. The engine owns the clock so every device agrees.
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

app.get("/elysium", requirePlayer, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "elysium.html"));
});
// old path kept alive; the game was renamed Tree -> Elysium
app.get("/tree", requirePlayer, (req, res) => res.redirect("/elysium"));

app.get("/api/elysium", requirePlayer, (req, res) => {
  touchGuest(req);
  const key = playerId(req);
  const { trees, state } = getTree(key);
  elysium.simulate(state, Date.now());
  trees[key] = state;
  saveTrees(trees);
  res.json({ tree: elysium.publicView(state), isAdmin: isAdmin(req) });
});

const ELYSIUM_ACTIONS = ["water", "mist", "trim", "fertilize", "inspect"];
app.post("/api/elysium/action", requirePlayer, (req, res) => {
  const action = String(req.body.action || "");
  if (!ELYSIUM_ACTIONS.includes(action)) {
    return res.status(400).json({ error: "Unknown action." });
  }
  touchGuest(req);
  const key = playerId(req);
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
  ["scripture", "Biblical criticism"], ["scripture", "Historical criticism"], ["scripture", "Documentary hypothesis"],
  ["scripture", "Synoptic problem"], ["scripture", "Q source"], ["scripture", "Historical Jesus"],
  ["scripture", "Form criticism"], ["scripture", "Redaction criticism"], ["scripture", "Markan priority"],
  ["scripture", "Julius Wellhausen"], ["scripture", "Authorship of the Bible"], ["scripture", "Dating the Bible"],
];
const KIND_LABEL = { angels: "angels", feminism: "feminism", myth: "Greek mythology", history: "pre-18th century history", scripture: "critical biblical scholarship" };

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

// Admin-only: read the handed-in summaries (newest first). The admin panel's
// Writing tab lists these and opens each one's full text.
app.get("/api/admin/summaries", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  res.json({ entries: loadSummaries() });
});

// Admin-only: dismiss one handed-in summary.
app.delete("/api/admin/summaries/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const list = loadSummaries().filter((e) => e.id !== req.params.id);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ entries: list }, null, 2));
  res.json({ ok: true });
});

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
/* ---- server-owned parse runs ---------------------------------------------
   Like Snake, Dummy Parse cannot be fully validated without the server running
   the whole damage simulation. What it CAN own is the run: the build is locked
   when the pull starts, the clock is the server's, and a parse can only be filed
   once, against a run that actually happened. The damage total is still reported
   by the client — see HANDOFF. */
const PARSE_STAT_POOL = 300;
const PARSE_STATS = ["crit", "critDmg", "haste", "focus", "intellect", "fracture", "dot"];
const PARSE_GRACE_S = 3;          // pre-pull + network slop

function cleanParseBuild(raw) {
  const build = {};
  let spent = 0;
  for (const k of PARSE_STATS) {
    const v = Math.max(0, Math.min(PARSE_STAT_POOL, parseInt((raw || {})[k], 10) || 0));
    build[k] = v;
    spent += v;
  }
  return spent > PARSE_STAT_POOL ? null : build;
}

app.post("/api/parse/session", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const b = req.body || {};
  const mode = ["30", "60"].includes(String(b.mode)) ? String(b.mode) : "free";
  const build = cleanParseBuild(b.build);
  if (!build) return res.status(400).json({ error: "That build spends more than the pool." });
  req.session.parseRun = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    mode, build, startedAt: Date.now(),
  };
  res.json({ id: req.session.parseRun.id, mode });
});

app.post("/api/parse", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const b = req.body || {};
  const duration = Number(b.duration), total = Number(b.total), dps = Number(b.dps);
  if (!Number.isFinite(duration) || duration <= 0) return res.status(400).json({ error: "Bad duration." });
  if (!Number.isFinite(total) || total < 0) return res.status(400).json({ error: "Bad total." });

  // The run must exist, and the parse must be consistent with it.
  const run = req.session.parseRun;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  if (String(b.id || "") !== run.id) return res.status(409).json({ error: "Not this run." });
  // you cannot report more combat time than has actually elapsed
  const wallS = (Date.now() - run.startedAt) / 1000;
  if (duration > wallS + PARSE_GRACE_S) {
    return res.status(400).json({ error: "Duration is longer than the run." });
  }
  // a timed mode ends on its own clock, so the duration has to be that length
  if (run.mode !== "free" && Math.abs(duration - Number(run.mode)) > 1.5) {
    return res.status(400).json({ error: "Duration does not match the mode." });
  }
  // and the headline number has to agree with the total it came from
  const derived = total / duration;
  if (Number.isFinite(dps) && Math.abs(dps - derived) > Math.max(2, derived * 0.02)) {
    return res.status(400).json({ error: "DPS does not match the total." });
  }
  delete req.session.parseRun;      // one shot: a run files exactly one parse
  const events = Array.isArray(b.events) ? b.events.slice(0, 4000) : [];
  const entry = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    player: who,
    guest: Boolean(req.session.guest),
    cls: String(b.cls || "priest").slice(0, 20),
    // "free", "30" or "60"; only the timed ones are ever ranked. Both this and
    // the build come from the run the server locked at the pull, not the body.
    mode: run.mode,
    version: String(b.version || "0").slice(0, 10),
    at: new Date().toISOString(),
    duration: +duration.toFixed(2),
    total: Math.round(total),
    dps: Math.round(Number.isFinite(dps) ? dps : total / duration),
    build: run.build,
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

// Multitap — a typing game on an old-phone multi-tap keypad. Deliberately
// unguided: no on-screen hints about which key or how many taps. Self-refereed
// client-side like the other typing games; no payout wired yet.
// /t9 is kept as an alias — same route the wall used to link before the rename.
app.get(["/multitap", "/t9"], requirePlayer, (req, res) => {
  touchGuest(req);
  res.sendFile(path.join(__dirname, "views", "multitap.html"));
});

// OT12 — match the photo to the LOONA member
app.get("/ot12", requirePlayer, (req, res) => {
  touchGuest(req);
  res.sendFile(path.join(__dirname, "views", "ot12.html"));
});

/* ---- server-owned snake runs ---------------------------------------------
   Snake cannot be validated the way the typing games are — the server would have
   to simulate a 60fps action game to know a pickup was real, and the latency
   would change how the game feels. What the server CAN own is the run itself:
   how long it lasts and how many pickups it is allowed to contain. A pickup now
   needs a live run and is refused once the run's own clock has expired, so the
   total is bounded by the time limit instead of only by the rate limiter. */
const SNAKE_MAX_MINUTES = 999;
const SNAKE_GRACE_MS = 2000;      // allow for the last frame + network lag

app.post("/api/snake/session", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  const minutes = Math.max(1, Math.min(SNAKE_MAX_MINUTES, parseInt((req.body || {}).minutes, 10) || 0));
  if (!minutes) return res.status(400).json({ error: "How long?" });
  req.session.snakeRun = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    limitMs: minutes * 60 * 1000,
    startedAt: Date.now(),
    eaten: 0,
  };
  res.json({ id: req.session.snakeRun.id, minutes });
});

// Ends the run and reports the SERVER's count, which is what the results screen
// shows — so the score on screen is the one the server actually recorded.
app.post("/api/snake/complete", (req, res) => {
  const run = req.session.snakeRun;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  const eaten = run.eaten;
  const elapsedMs = Math.max(0, Date.now() - run.startedAt);
  delete req.session.snakeRun;
  res.json({ ok: true, eaten, elapsedMs });
});

// $1 per snake food. The client reports each pickup, so a light floor on how
// fast awards can arrive keeps a stuck key or a rapid script from printing money.
// Snake pickups are reported by the browser, so they can't be trusted outright.
// A token bucket caps the sustained rate while still allowing honest bursts
// (food can spawn right in front of the snake and be eaten on the next tick).
const SNAKE_BURST = 8;
const SNAKE_REFILL_MS = 2000;
app.post("/api/snake/food", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  // a pickup only counts inside a live run, and never past its time limit
  const run = req.session.snakeRun;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  if (Date.now() - run.startedAt > run.limitMs + SNAKE_GRACE_MS) {
    return res.status(409).json({ error: "Run is over." });
  }
  // rate limit: refill one token every SNAKE_REFILL_MS, up to SNAKE_BURST
  const now = Date.now();
  const bucket = req.session.snakeBucket || { tokens: SNAKE_BURST, at: now };
  const refilled = Math.min(SNAKE_BURST, bucket.tokens + (now - bucket.at) / SNAKE_REFILL_MS);
  if (refilled < 1) {
    req.session.snakeBucket = { tokens: refilled, at: now };
    return res.status(429).json({ error: "Too fast." });
  }
  req.session.snakeBucket = { tokens: refilled - 1, at: now };

  run.eaten += 1;                               // this run (the server's own count)
  req.session.snakeRun = run;
  // nothing is paid out: points went with accounts. The count is the score.
  res.json({ ok: true, eaten: run.eaten });
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
  const row = (key, label, guest) => ({
    username: label,
    guest: Boolean(guest),
    hasGame: Boolean(games[key]),
    yourTurn: Boolean(games[key] && !games[key].over && games[key].turn === "hermione"),
    over: Boolean(games[key] && games[key].over),
  });
  res.json({
    // every live guest is a playable opponent, for as long as their name lasts
    players: listActiveGuests().map((g) => row(g, g, true)),
  });
});

// hermione alone sets the opening number
app.post("/api/deathroll/start", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Only Hermione starts a deathroll." });
  const key = deathrollKeyFor(req, req.body.opponent);
  if (!key) return res.status(400).json({ error: "Pick an opponent." });
  if (!activeGuests.has(key)) return res.status(404).json({ error: "No such player." });
  const opponentName = key;
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
  // notifications are Hermione-only now: only push when she is the recipient
  if (other && otherKey === "hermione") {
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

// --- wheel: unlimited spins, pays nothing (angelcoins went, then accounts) ---
// The server picks the winning wedge; the page only animates to it. Thirty
// outcomes from 1 to 200, heavily biased low: weights sum to 1000, so 1 lands
// 20% of the time and 200 lands 0.1%. Not linked from the wall.
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

app.get("/api/wheel", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  res.json({ segments: wheelSegmentsPayload(), unlimited: true, spunToday: false, canSpin: true });
});

app.post("/api/wheel/spin", (req, res) => {
  if (!playerId(req)) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const index = pickSegment();
  const prize = WHEEL_SEGMENTS[index];
  res.json({ ok: true, index, label: prize.label, won: prize.coins, canSpin: true });
});

// --- slots (the Lottery): the INSTANT scratch card, free ---
// One card, three panels, match three. The outcome is rolled here (never on the
// client) so the panels the player scratches off only reveal a result that is
// already decided. It used to stake angelcoins; with no currency left it is a
// free card and the "payout" is just the number on it. Not linked from the wall.
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

app.get("/api/slots", requirePlayer, (req, res) => {
  touchGuest(req);
  res.json({ stake: 0, paytable: SLOTS_PAYTABLE, balance: null, unlimited: true, canPlay: true });
});

app.post("/api/slots/buy", requirePlayer, (req, res) => {
  touchGuest(req);
  const outcome = pickSlotsOutcome();
  const panels = slotsPanels(outcome);
  res.json({ ok: true, panels, won: outcome.pays, stake: 0, net: outcome.pays, balance: null, canPlay: true });
});


/* ---- server-owned writing runs -------------------------------------------
   The typing games used to be fully client-refereed: the browser picked the
   lines, counted its own progress and posted a finished total, which the server
   took on trust. Progress is now owned here instead.

     POST /api/writing/session  -> the server builds the line sequence from its
                                   OWN pools and stores it on the login session
     POST /api/writing/line     -> one completed line, validated against the
                                   expected text; the server increments the count
     POST /api/writing/skip     -> admin-only (`pray skip_stage`): advance without
                                   submitting text
     POST /api/writing/complete -> now refuses unless the server's own count says
                                   the run is actually finished

   The run lives in req.session (file-backed, so it survives a restart), which
   also means one run at a time per login and no bloat in users.json. */
const WRITING_MAX_REPS = 1000;
// Multitap runs through the same machinery: same session, same per-line
// validation, same one-shot completion. Only the line source differs.
const WRITING_MODES = ["penance", "devotion", "multitap"];

function buildWritingSequence(lines, reps) {
  const first = lines[0];
  const pool = lines.slice(1);
  const seq = [first];
  let last = first;
  while (seq.length < reps) {
    if (!pool.length) { seq.push(first); last = first; continue; }
    const sh = pool.slice();
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    if (sh.length > 1 && sh[0] === last) { [sh[0], sh[1]] = [sh[1], sh[0]]; }
    for (const l of sh) { if (seq.length >= reps) break; seq.push(l); last = l; }
  }
  return seq.slice(0, reps);
}

app.post("/api/writing/session", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  const body = req.body || {};
  const mode = WRITING_MODES.includes(body.mode) ? body.mode : "penance";
  if (mode === "devotion" && !req.session.username) {
    return res.status(403).json({ error: "Devotion needs an account." });
  }
  const reps = Math.max(1, Math.min(WRITING_MAX_REPS, parseInt(body.reps, 10) || 0));
  if (!reps) return res.status(400).json({ error: "How many repetitions?" });

  // Where the lines come from. A preset is resolved from the server's own pool,
  // so the client cannot invent one. Penance and Multitap also allow the player's
  // own lines; that text is theirs, but the server still owns the sequence and
  // the count.
  let lines = [], presetName = "";
  if (mode === "multitap") {
    // multitap's pool is a flat list, not named presets
    if (Array.isArray(body.ownLines) && body.ownLines.length) {
      lines = body.ownLines
        .map((l) => String(l).toLowerCase().replace(/[^a-z0-9 .,?!'()-]/g, "").trim().slice(0, 600))
        .filter(Boolean).slice(0, 100);
      presetName = "custom";
      if (!lines.length) return res.status(400).json({ error: "Add at least one line." });
    } else {
      lines = loadMultitap().lines.slice();
      presetName = "preset";
    }
  } else if (body.presetId) {
    const pool = mode === "devotion" ? loadDevotion() : loadPenance();
    const preset = (pool.presets || []).find((p) => p.id === String(body.presetId));
    if (!preset || !preset.lines || !preset.lines.length) {
      return res.status(400).json({ error: "No such preset." });
    }
    lines = preset.lines.slice();
    presetName = preset.name || preset.id;
  } else if (mode === "penance" && Array.isArray(body.ownLines)) {
    lines = body.ownLines.map((l) => String(l).trim().slice(0, 240)).filter(Boolean).slice(0, 100);
    presetName = "custom";
    if (!lines.length) return res.status(400).json({ error: "Add at least one line." });
  } else {
    return res.status(400).json({ error: "Nothing to type." });
  }

  const run = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    mode, presetName,
    difficulty: String(body.difficulty || "").slice(0, 40),
    reps,
    lines: buildWritingSequence(lines, reps),
    idx: 0,           // lines the SERVER has seen completed
    mistakes: 0,
    skipped: 0,
    startedAt: Date.now(),
  };
  req.session.writing = run;
  res.json({ id: run.id, reps: run.reps, lines: run.lines, preset: run.presetName });
});

// One finished line. The submitted text must match the line the server expects.
app.post("/api/writing/line", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  const run = req.session.writing;
  const body = req.body || {};
  if (!run || run.id !== String(body.id || "")) return res.status(409).json({ error: "No run in progress." });
  if (run.idx >= run.reps) return res.status(409).json({ error: "Run already finished." });
  if (parseInt(body.index, 10) !== run.idx) {
    return res.status(409).json({ error: "Out of step.", idx: run.idx });
  }
  if (String(body.text || "") !== run.lines[run.idx]) {
    return res.status(400).json({ error: "That is not the line.", idx: run.idx });
  }
  run.idx += 1;
  run.mistakes += Math.max(0, Math.min(10000, parseInt(body.mistakes, 10) || 0));
  req.session.writing = run;
  res.json({ ok: true, idx: run.idx, done: run.idx >= run.reps });
});

// Admin-only skip (`pray skip_stage`): counts the line without typing it. The
// console gates this client-side too, but THIS is the real boundary.
app.post("/api/writing/skip", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const run = req.session.writing;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  if (run.idx >= run.reps) return res.status(409).json({ error: "Run already finished." });
  run.idx += 1;
  run.skipped += 1;
  req.session.writing = run;
  res.json({ ok: true, idx: run.idx, done: run.idx >= run.reps });
});

// Finished runs are kept in one global log (completed.json) for the Completed
// tab: guests have no record to hang them on. Newest first, capped.
const COMPLETED_CAP = 200;
function loadCompleted() {
  try { const d = JSON.parse(fs.readFileSync(COMPLETED_FILE, "utf8")); return Array.isArray(d.entries) ? d.entries : []; }
  catch { return []; }
}
function saveCompleted(list) {
  fs.writeFileSync(COMPLETED_FILE, JSON.stringify({ entries: list.slice(0, COMPLETED_CAP) }, null, 2));
}

app.post("/api/writing/complete", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);

  // The run must exist here and the SERVER's own count must say it is finished.
  // Nothing below is taken from the request body any more.
  const run = req.session.writing;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  if (run.idx < run.reps) {
    return res.status(409).json({ error: "Run is not finished.", idx: run.idx, reps: run.reps });
  }

  const letters = run.lines.reduce((a, l) => a + l.length, 0);
  const accuracy = letters > 0
    ? Math.max(0, Math.min(100, Math.round(((letters - run.mistakes) / letters) * 100)))
    : 100;
  const entry = {
    id: "wl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    player: who,
    guest: Boolean(req.session.guest && !req.session.username),
    category: run.mode,
    preset: run.presetName,
    difficulty: run.difficulty,
    passages: run.reps,
    mistakes: run.mistakes,
    accuracy,
    skipped: run.skipped,
    elapsedMs: Math.max(0, Math.min(1000 * 60 * 60 * 24, Date.now() - run.startedAt)),
    at: new Date().toISOString(),
  };
  entry.letters = letters;         // from the server's own sequence
  delete req.session.writing;      // one shot: the run cannot be logged twice
  const list = loadCompleted();
  list.unshift(entry);
  saveCompleted(list);

  // tell Hermione, but never about her own practice runs
  if (who !== "hermione") {
    const users = loadUsers();
    const hermione = users["hermione"];
    if (hermione) {
      pushNotification(
        hermione,
        "writing-" + who,
        who + " finished a writing series" + (entry.category ? " (" + entry.category + ")" : "") + ".",
        "/admin"
      );
      saveUsers(users);
    }
  }
  res.json({ ok: true });
});

// Admin-only: the finished runs, newest first, and dismissing one.
app.get("/api/admin/writing", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  res.json({ entries: loadCompleted() });
});
app.delete("/api/admin/writing/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  saveCompleted(loadCompleted().filter((e) => e.id !== req.params.id));
  res.json({ ok: true });
});

// --- editable site copy ---
// Two audiences, so hermione can word her own dashboard differently from
// everyone else's. {name} stands in for the viewer's username.
const SITE_DEFAULTS = {
  welcomeAdmin: "Welcome, Angel!",
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
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  const site = loadSite();
  const admin = isAdmin(req);
  res.json({
    // what this viewer should see, already filled in ({name} is the guest's name)
    welcome: (admin ? site.welcomeAdmin : site.welcomeUser).replace(/\{name\}/g, who),
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
        "I am sorry, but sorry is not enough.",
        "I will not waste Her time.",
        "I was warned, and I did it anyway.",
        "I am writing this because I earned it.",
        "My comfort is not the point.",
        "I will do better because She expects it.",
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

// Game-selection hover text: the "// ..." panel shown over each card on /games.
// Keyed by game name. File-first like every other editable pool, so Hermione's
// edits in /admin win over these defaults; games.html falls back to its own
// baked-in copy only if the fetch fails entirely.
const GAMETIPS_DEFAULTS = {
  tips: {
    "snake": "Free-swimming serpent. Chase the fleeing heart and grow; die on your own tail.",
    "penance": "A typing drill of correction. Type each line exactly — falter and it corrupts.",
    "devotion": "A verse reader. Recite Her lines in turn. An account is required.",
    "multitap": "A typing drill on an old-phone keypad. No hints — remember the taps.",
    "ot12": "Match the photo to the member. Twelve girls, four names, one right answer.",
    "deathroll": "Roll against another, each cap the next roll. Hit one and you lose. Account required.",
    "dummy parse": "A priest damage recount. Parse the dummy and chase a higher DPS.",
    "skill check": "Stop the sweeping dial inside the good zone. Pure nerve.",
    "summary": "Read a real Wikipedia article, then retell it in your own words.",
    "elysium": "A tree you tend. It remembers how long you have kept it.",
    "chess": "Ink-wash chess against Her. Win and you may STRIKE; lose and brace for REWIND.",
  },
};
function loadGameTips() {
  const merged = JSON.parse(JSON.stringify(GAMETIPS_DEFAULTS.tips));
  try {
    const data = JSON.parse(fs.readFileSync(GAMETIPS_FILE, "utf8"));
    if (data && data.tips && typeof data.tips === "object") {
      for (const [k, v] of Object.entries(data.tips)) {
        if (typeof v === "string" && v.trim()) merged[k] = v;
      }
    }
  } catch {}
  return merged;
}
app.get("/api/gametips", (req, res) => {
  res.json({ tips: loadGameTips() });
});
app.post("/api/gametips", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const incoming = req.body && typeof req.body.tips === "object" ? req.body.tips : null;
  if (!incoming) return res.status(400).json({ error: "tips must be an object." });
  const tips = {};
  for (const [k, v] of Object.entries(incoming)) {
    const key = String(k).slice(0, 40);
    const val = String(v == null ? "" : v).trim().slice(0, 240);
    if (key && val) tips[key] = val;
  }
  fs.writeFileSync(GAMETIPS_FILE, JSON.stringify({ tips }, null, 2));
  res.json({ ok: true, tips: loadGameTips() });
});

// Multitap sentences: the example lines the multitap game asks you to type.
// File-first like every other pool; Hermione edits them in /admin.
const MULTITAP_DEFAULTS = {
  lines: [
    "an angel is a spiritual, heavenly, or supernatural entity, usually humanoid with bird-like wings, often depicted as a messenger or intermediary between god (the transcendent) and humanity (the profane) in various traditions like the abrahamic religions. other roles include protectors and guides for humans, such as guardian angels, and servants of god. in western belief-systems the term is often used to distinguish benevolent from malevolent intermediary beings.",
  ],
};
function loadMultitap() {
  try {
    const data = JSON.parse(fs.readFileSync(MULTITAP_FILE, "utf8"));
    if (data && Array.isArray(data.lines) && data.lines.length) return data;
  } catch {}
  return JSON.parse(JSON.stringify(MULTITAP_DEFAULTS));
}
app.get("/api/multitap", (req, res) => {
  res.json({ lines: loadMultitap().lines });
});
app.post("/api/multitap", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const incoming = Array.isArray(req.body.lines) ? req.body.lines : null;
  if (!incoming) return res.status(400).json({ error: "lines must be an array." });
  // lowercase, letters/spaces/basic punctuation — the keypad can only produce these
  const lines = incoming.map((m) => String(m).toLowerCase().replace(/[^a-z0-9 .,?!'()-]/g, "").trim().slice(0, 600)).filter(Boolean).slice(0, 100);
  if (!lines.length) return res.status(400).json({ error: "Add at least one line." });
  fs.writeFileSync(MULTITAP_FILE, JSON.stringify({ lines }, null, 2));
  res.json({ ok: true, lines });
});

/* ---- OT12: match the photo to the member ---------------------------------
   A matching game over the twelve members of LOONA. There is no automated image
   source and there deliberately isn't one: the photos are other people's
   copyrighted work, so Hermione uploads and tags them herself in /admin. The
   member list below is fixed (it is just who is in the group); the photo pool is
   a normal file-first editable pool.

   The run is server-owned like every other game: the server picks the sequence
   and the answer options, and the correct name is NEVER sent to the client until
   after it has answered — otherwise the answer would be sitting in the DOM. */
/* The member table. Stored now so later question types can be generated from it
   ("who is between 160 and 165 cm", "whose animal is the owl", …) rather than
   hand-written one at a time. Fields with no confirmed value are left
   `undefined` on purpose — a generator must skip a member for a question whose
   field it does not have, rather than inventing one or treating "" as an answer.
   `OT12_MEMBERS` stays the canonical name order (reveal order). */
const OT12_MEMBER_DATA = [
  { name: "HeeJin", fullName: "Jeon Heejin", hangul: "희진", location: "Earth",
    superpower: "Vision", revealMonth: "October", animal: "Rabbit",
    color: "Bright pink", plant: "False shamrock", birthdate: "2000-10-19",
    heightCm: 161, eyeColor: "Dark Brown", shape: "Square" },
  { name: "HyunJin", fullName: "Kim Hyun-jin", hangul: "현진", location: "Earth",
    superpower: undefined, revealMonth: "November", animal: "Cat",
    color: "Yellow", plant: "Forget-me-not", birthdate: undefined,
    heightCm: undefined, eyeColor: "Black", shape: undefined },
  { name: "HaSeul", fullName: "Jo Ha-seul", hangul: "하슬", location: "Earth",
    superpower: undefined, revealMonth: "December", animal: "White Bird",
    color: "Green", plant: "Bird of Paradise", birthdate: undefined,
    heightCm: undefined, eyeColor: "Green", shape: undefined },
  { name: "YeoJin", fullName: "Im Yeo-jin", hangul: "여진", location: "Earth",
    superpower: undefined, revealMonth: "January", animal: "Frog",
    color: "Orange", plant: "Daisy", birthdate: undefined,
    heightCm: undefined, eyeColor: undefined, shape: undefined },
  { name: "ViVi", fullName: "Wong Ka Hei", hangul: "비비", location: "Earth",
    superpower: undefined, revealMonth: "April", animal: "Deer",
    color: "Pastel Rose", plant: "Gerbera", birthdate: undefined,
    heightCm: undefined, eyeColor: "Pink", shape: undefined },
  { name: "Kim Lip", fullName: "Kim Jung-eun", hangul: "김립", location: "Earth",
    superpower: undefined, revealMonth: "May", animal: "Owl",
    color: "Red", plant: "Rose", birthdate: undefined,
    heightCm: undefined, eyeColor: "Red", shape: "Circle" },
  { name: "JinSoul", fullName: "Jeong Jin-sol", hangul: "진솔", location: "Earth",
    superpower: undefined, revealMonth: "June", animal: "Blue Betta",
    color: "Blue", plant: "Blue Erica", birthdate: undefined,
    heightCm: undefined, eyeColor: "Blue", shape: "Circle" },
  { name: "Choerry", fullName: "Choi Ye-rim", hangul: "최예림", location: "Earth",
    superpower: undefined, revealMonth: "July", animal: "Fruit Bat",
    color: "Purple", plant: "Cosmos", birthdate: undefined,
    heightCm: undefined, eyeColor: "Purple", shape: "Circle" },
  // The yyxy four. Note their location is Eden, not Earth — that split is real
  // data, not a typo, so a "who is from Eden" question can key off it.
  { name: "Yves", fullName: "Ha Soo-young", hangul: "이브", location: "Eden",
    superpower: undefined, revealMonth: "November", animal: "Swan",
    color: "Burgundy", plant: "Tuberose", birthdate: undefined,
    heightCm: undefined, eyeColor: "Dark Brown", shape: undefined },
  { name: "Chuu", fullName: "Kim Ji-woo", hangul: "츄", location: "Eden",
    superpower: undefined, revealMonth: "December", animal: "Penguin",
    color: "Peach", plant: "Tulip", birthdate: undefined,
    heightCm: undefined, eyeColor: "Black", shape: undefined },
  { name: "Go Won", fullName: "Park Chae-won", hangul: "고원", location: "Eden",
    superpower: undefined, revealMonth: "January", animal: "Butterfly",
    color: "Eden Green", plant: "Plum Blossom", birthdate: undefined,
    heightCm: undefined, eyeColor: "Black", shape: undefined },
  { name: "Olivia Hye", fullName: "Son Hye-ju", hangul: "올리비아 혜", location: "Eden",
    superpower: undefined, revealMonth: "March", animal: "Wolf",
    color: "Silver", plant: "Lobelia", birthdate: undefined,
    heightCm: undefined, eyeColor: "Black", shape: undefined },
];
const OT12_MEMBERS = OT12_MEMBER_DATA.map((m) => m.name);
const OT12_MAX_ROUNDS = 100;

// Trivia question types, generated straight from OT12_MEMBER_DATA rather than
// hand-written. Each is "whose <field> is <value>?" — the same shape as a
// photo round (options = every member, answer = whichever member(s) actually
// have that value), so the answer-checking endpoint below needs no changes
// at all to support them. A field left undefined on a member (see the table
// above) just means that member never turns up as a value to ask about; the
// pool is built once at startup since OT12_MEMBER_DATA is a static table.
// English plurals for the fixed, known set of animal values above — a real
// pluralizing function would mishandle "Butterfly" and "Wolf" (-y and -f
// endings), and this list never grows on its own, so a lookup is exact
// where a rule-based one would just be wrong sometimes.
const OT12_ANIMAL_PLURAL = {
  Rabbit: "rabbits", Cat: "cats", "White Bird": "white birds", Frog: "frogs",
  Deer: "deer", Owl: "owls", "Blue Betta": "blue bettas", "Fruit Bat": "fruit bats",
  Swan: "swans", Penguin: "penguins", Butterfly: "butterflies", Wolf: "wolves",
};
const OT12_TRAITS = [
  { kind: "animal",  field: "animal",     prompt: (v) => `Which member is associated with ${OT12_ANIMAL_PLURAL[v] || v.toLowerCase()}?` },
  { kind: "shape",   field: "shape",      prompt: (v) => `Whose shape is a ${v}?` },
  { kind: "hangul",  field: "hangul",     prompt: (v) => `Which member is ${v}?` },
  { kind: "color",   field: "color",      prompt: (v) => `Whose colour is ${v}?` },
  { kind: "plant",   field: "plant",      prompt: (v) => `Whose plant is the ${v}?` },
  { kind: "height",  field: "heightCm",   prompt: (v) => `Who is ${v} cm tall?` },
  { kind: "revealMonth", field: "revealMonth", prompt: (v) => `Who was revealed in ${v}?` },
];
function ot12TraitPool(field) {
  const byValue = new Map();
  OT12_MEMBER_DATA.forEach((m) => {
    const v = m[field];
    if (v === undefined || v === null || v === "") return;
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v).push(m.name);
  });
  return byValue;
}
const OT12_TRAIT_POOLS = Object.fromEntries(OT12_TRAITS.map((t) => [t.kind, ot12TraitPool(t.field)]));
// only traits with at least one real value to ask about are ever offered —
// a field nobody has (yet) just doesn't come up, same rule as the table above
function ot12TraitKinds() { return OT12_TRAITS.filter((t) => OT12_TRAIT_POOLS[t.kind].size > 0); }
function ot12RandomTraitRound(t) {
  const pool = OT12_TRAIT_POOLS[t.kind];
  const values = [...pool.keys()];
  const v = values[Math.floor(Math.random() * values.length)];
  return { kind: t.kind, prompt: t.prompt(v), members: pool.get(v).slice() };
}

function loadOt12() {
  try {
    const d = JSON.parse(fs.readFileSync(OT12_FILE, "utf8"));
    if (d && Array.isArray(d.photos)) {
      // a photo can show several members; records written before that are
      // migrated on read so old uploads keep working
      d.photos.forEach((p) => {
        if (!Array.isArray(p.members)) p.members = p.member ? [p.member] : [];
      });
      if (!Array.isArray(d.songs)) d.songs = [];
      return d;
    }
  } catch {}
  return { photos: [], songs: [] };
}
function saveOt12(d) { fs.writeFileSync(OT12_FILE, JSON.stringify(d, null, 2)); }

app.get("/api/ot12/members", (req, res) => res.json({ members: OT12_MEMBERS }));

// The song framework: which members appear in which song, for later trivia
// ("who sings in Star" — not built yet). There is no automated source for
// this either, same reasoning as the photos: hand-tagged by Hermione.
app.get("/api/ot12/songs", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  res.json({ songs: loadOt12().songs, members: OT12_MEMBERS });
});
app.post("/api/ot12/songs", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: "Name the song." });
  const raw = Array.isArray(b.members) ? b.members : [];
  const members = [...new Set(raw.map(String))].filter((m) => OT12_MEMBERS.includes(m));
  if (!members.length) return res.status(400).json({ error: "Tag at least one member." });
  const d = loadOt12();
  d.songs.push({ id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), name, members });
  saveOt12(d);
  res.json({ ok: true, count: d.songs.length });
});
app.put("/api/ot12/songs/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const b = req.body || {};
  const d = loadOt12();
  const song = d.songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: "No such song." });
  if (b.name !== undefined) {
    const name = String(b.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Name the song." });
    song.name = name;
  }
  if (b.members !== undefined) {
    const raw = Array.isArray(b.members) ? b.members : [];
    const members = [...new Set(raw.map(String))].filter((m) => OT12_MEMBERS.includes(m));
    if (!members.length) return res.status(400).json({ error: "Tag at least one member." });
    song.members = members;
  }
  saveOt12(d);
  res.json({ ok: true, song });
});
app.delete("/api/ot12/songs/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const d = loadOt12();
  d.songs = d.songs.filter((s) => s.id !== req.params.id);
  saveOt12(d);
  res.json({ ok: true, count: d.songs.length });
});

// admin: the tagged photo pool (the only place the answers are listed)
app.get("/api/ot12/photos", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  res.json({ photos: loadOt12().photos, members: OT12_MEMBERS });
});
app.post("/api/ot12/photos", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const b = req.body || {};
  const raw = Array.isArray(b.members) ? b.members : (b.member ? [b.member] : []);
  const members = [...new Set(raw.map(String))].filter((m) => OT12_MEMBERS.includes(m));
  if (!members.length) return res.status(400).json({ error: "Tag at least one member." });
  const img = String(b.img || "");
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(img)) return res.status(400).json({ error: "Not an image." });
  if (img.length > 600000) return res.status(400).json({ error: "Image too large — shrink it first." });
  const d = loadOt12();
  d.photos.unshift({ id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), members, img });
  saveOt12(d);
  res.json({ ok: true, count: d.photos.length });
});
// re-tag an existing photo, so a mis-tag is a fix rather than a re-upload
app.put("/api/ot12/photos/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const raw = Array.isArray((req.body || {}).members) ? req.body.members : [];
  const members = [...new Set(raw.map(String))].filter((m) => OT12_MEMBERS.includes(m));
  if (!members.length) return res.status(400).json({ error: "Tag at least one member." });
  const d = loadOt12();
  const photo = d.photos.find((p) => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "No such photo." });
  photo.members = members;
  delete photo.member;          // drop the pre-multi-member field if it lingers
  saveOt12(d);
  res.json({ ok: true, members });
});

app.delete("/api/ot12/photos/:id", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const d = loadOt12();
  d.photos = d.photos.filter((p) => p.id !== req.params.id);
  saveOt12(d);
  res.json({ ok: true, count: d.photos.length });
});

// how many photos exist, and how many trivia types are available, so the
// game can say "not ready yet" honestly. Trivia is baked into the server (no
// admin pool to run dry), so in practice this only ever gates on photos.
app.get("/api/ot12/status", (req, res) => {
  const photos = loadOt12().photos;
  const tagged = new Set();
  photos.forEach((p) => (p.members || []).forEach((m) => tagged.add(m)));
  res.json({ photos: photos.length, membersCovered: tagged.size, traitKinds: ot12TraitKinds().length });
});

// One round is either a tagged photo or a trait question; `members` is always
// the correct-answer set either way, so answer-checking below never needs to
// know which kind it's looking at.
function ot12BuildQueue(rounds, photoPool) {
  const traitKinds = ot12TraitKinds();
  const bag = photoPool.slice();
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  let photoCursor = 0;
  const queue = [];
  for (let i = 0; i < rounds; i++) {
    // photos and "any trivia type" split the odds evenly, so one tagged photo
    // isn't drowned out by seven trait kinds (or vice versa with none tagged)
    const usePhoto = bag.length && (!traitKinds.length || Math.random() < 0.5);
    if (usePhoto) {
      const photo = bag[photoCursor % bag.length]; photoCursor++;
      queue.push({ kind: "photo", img: photo.img, members: photo.members.slice() });
    } else {
      const t = traitKinds[Math.floor(Math.random() * traitKinds.length)];
      queue.push(ot12RandomTraitRound(t));
    }
  }
  return queue;
}

function ot12Round(run) {
  const r = run.queue[run.idx];
  // Every member is always on offer — a photo can show any number of them, so
  // there is no decoy set to build and no count to leak.
  run.options = OT12_MEMBERS.slice();
  const round = { index: run.idx, total: run.queue.length, kind: r.kind, options: run.options };
  if (r.kind === "photo") round.img = r.img; else round.prompt = r.prompt;
  return round;
}

app.post("/api/ot12/session", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  touchGuest(req);
  const photoPool = loadOt12().photos;
  if (!photoPool.length && !ot12TraitKinds().length) return res.status(409).json({ error: "No questions have been added yet." });
  const rounds = Math.max(1, Math.min(OT12_MAX_ROUNDS, parseInt((req.body || {}).rounds, 10) || 10));
  const queue = ot12BuildQueue(rounds, photoPool);

  const run = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    queue, idx: 0, correct: 0, startedAt: Date.now(), options: [],
  };
  req.session.ot12 = run;
  const round = ot12Round(run);
  req.session.ot12 = run;
  res.json({ id: run.id, round });
});

app.post("/api/ot12/answer", (req, res) => {
  const who = playerId(req);
  if (!who) return res.status(401).json({ error: "Not logged in." });
  const run = req.session.ot12;
  const b = req.body || {};
  if (!run || run.id !== String(b.id || "")) return res.status(409).json({ error: "No round in progress." });
  if (parseInt(b.index, 10) !== run.idx) return res.status(409).json({ error: "Out of step.", index: run.idx });
  const picked = [...new Set((Array.isArray(b.names) ? b.names : [b.name]).map(String).filter(Boolean))];
  if (!picked.length) return res.status(400).json({ error: "Pick at least one." });
  if (picked.some((p) => !run.options.includes(p))) return res.status(400).json({ error: "Not one of the options." });

  const answer = (run.queue[run.idx].members || []).slice();
  // right only if the set matches exactly — no extras, none missed
  const correct = picked.length === answer.length && picked.every((p) => answer.includes(p));
  if (correct) run.correct += 1;
  run.idx += 1;
  const done = run.idx >= run.queue.length;
  const next = done ? null : ot12Round(run);
  req.session.ot12 = run;
  res.json({ correct, answer, score: run.correct, done, round: next });
});

// admin-only (`pray skip_stage`): advance the round without answering it,
// same shape as the writing games' skip — it counts as progress, not a hit
app.post("/api/ot12/skip", (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Not logged in." });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  const run = req.session.ot12;
  if (!run) return res.status(409).json({ error: "No round in progress." });
  if (run.idx >= run.queue.length) return res.status(409).json({ error: "Run already finished." });
  run.idx += 1;
  run.skipped = (run.skipped || 0) + 1;
  const done = run.idx >= run.queue.length;
  const next = done ? null : ot12Round(run);
  req.session.ot12 = run;
  res.json({ ok: true, done, round: next });
});

app.post("/api/ot12/complete", (req, res) => {
  const run = req.session.ot12;
  if (!run) return res.status(409).json({ error: "No run in progress." });
  if (run.idx < run.queue.length) return res.status(409).json({ error: "Run is not finished." });
  const out = {
    ok: true,
    score: run.correct,
    total: run.queue.length,
    elapsedMs: Math.max(0, Date.now() - run.startedAt),
  };
  delete req.session.ot12;
  res.json(out);
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



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
