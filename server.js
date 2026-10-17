require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error("In production, set SESSION_SECRET to a random string of at least 32 characters.");
}
if (isProduction && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 14)) {
  throw new Error("In production, set ADMIN_PASSWORD to a unique password with at least 14 characters.");
}

const db = new Database(path.join(__dirname, "arcade.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player','admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    accent TEXT NOT NULL DEFAULT 'cyan',
    visible INTEGER NOT NULL DEFAULT 1
  );
`);
const initialGames = [
  ["reaction", "反应力测试", "反应", "测试你的反应速度，挑战个人最佳成绩。", "cyan"],
  ["memory", "记忆矩阵", "记忆", "记住亮起的格子，再按顺序复现。", "purple"],
  ["core", "能量核心", "街机", "在时间耗尽前点击核心，冲击更高分数。", "pink"],
  ["2048", "NEON 2048", "益智", "合并数字方块，挑战 2048。", "green"]
];
const insertGame = db.prepare("INSERT OR IGNORE INTO games (id,title,category,description,accent) VALUES (?,?,?,?,?)");
initialGames.forEach(g => insertGame.run(...g));

const adminName = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword) {
  const existingAdmin = db.prepare("SELECT id FROM users WHERE username = ?").get(adminName);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?, 'admin')").run(adminName, hash);
    console.log(`Admin account initialized for "${adminName}".`);
  }
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(session({
  name: "neon.sid",
  secret: sessionSecret || "development-only-secret-change-me",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public")));

const userView = user => user ? ({ id: user.id, username: user.username, role: user.role }) : null;
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "请先登录。" });
  req.user = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(req.session.userId);
  if (!req.user) { req.session.destroy(() => {}); return res.status(401).json({ error: "登录已失效，请重新登录。" }); }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限。" });
  next();
}
function validUsername(name) { return typeof name === "string" && /^[A-Za-z0-9_\-\u4e00-\u9fff]{3,20}$/.test(name); }
function validPassword(pass) { return typeof pass === "string" && pass.length >= 8 && pass.length <= 128; }

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.json({ user: null });
  const best = db.prepare("SELECT game_id, MAX(score) AS score FROM scores WHERE user_id = ? GROUP BY game_id").all(user.id);
  res.json({ user: userView(user), createdAt: user.created_at, bestScores: best });
});

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: "用户名需为 3–20 位，可使用中文、字母、数字、_ 或 -。" });
  if (!validPassword(password)) return res.status(400).json({ error: "密码长度需为 8–128 个字符。" });
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) return res.status(409).json({ error: "这个用户名已被使用。" });
  try {
    const info = db.prepare("INSERT INTO users (username,password_hash) VALUES (?,?)").run(username, bcrypt.hashSync(password, 12));
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "创建会话失败，请重试。" });
      req.session.userId = Number(info.lastInsertRowid);
      res.status(201).json({ user: { id: Number(info.lastInsertRowid), username, role: "player" } });
    });
  } catch {
    res.status(500).json({ error: "注册失败，请稍后重试。" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") return res.status(400).json({ error: "请输入用户名和密码。" });
  const user = db.prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "用户名或密码不正确。" });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "登录失败，请重试。" });
    req.session.userId = user.id;
    res.json({ user: userView(user) });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "退出失败，请重试。" });
    res.clearCookie("neon.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ ok: true });
  });
});

app.get("/api/games", (req, res) => {
  const games = db.prepare("SELECT id,title,category,description,accent FROM games WHERE visible = 1 ORDER BY rowid").all();
  res.json({ games });
});

app.post("/api/scores", requireAuth, (req, res) => {
  const { gameId, score } = req.body || {};
  if (typeof gameId !== "string" || !Number.isSafeInteger(score) || score < 0 || score > 100000000) {
    return res.status(400).json({ error: "成绩数据无效。" });
  }
  if (!db.prepare("SELECT id FROM games WHERE id = ? AND visible = 1").get(gameId)) return res.status(404).json({ error: "游戏不存在。" });
  db.prepare("INSERT INTO scores (user_id,game_id,score) VALUES (?,?,?)").run(req.user.id, gameId, score);
  res.status(201).json({ ok: true });
});

app.get("/api/leaderboard", (req, res) => {
  const rows = db.prepare(`
    SELECT u.username, s.game_id, MAX(s.score) AS score
    FROM scores s JOIN users u ON u.id = s.user_id
    GROUP BY u.id, s.game_id
    ORDER BY score DESC LIMIT 50
  `).all();
  res.json({ leaderboard: rows });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const scores = db.prepare("SELECT COUNT(*) AS n FROM scores").get().n;
  const games = db.prepare("SELECT COUNT(*) AS n FROM games").get().n;
  res.json({ users, scores, games });
});

app.get("/api/admin/games", requireAuth, requireAdmin, (req, res) => {
  res.json({ games: db.prepare("SELECT id,title,category,description,accent,visible FROM games ORDER BY rowid").all() });
});

app.post("/api/admin/games", requireAuth, requireAdmin, (req, res) => {
  const { id, title, category, description } = req.body || {};
  if (![id,title,category,description].every(v => typeof v === "string") ||
      !/^[a-z0-9-]{2,24}$/.test(id) || title.length < 1 || title.length > 50 ||
      category.length > 20 || description.length > 180) {
    return res.status(400).json({ error: "游戏资料格式不正确。" });
  }
  try {
    db.prepare("INSERT INTO games (id,title,category,description,accent) VALUES (?,?,?,?, 'cyan')").run(id,title,category,description);
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: "游戏 ID 已存在或无法保存。" });
  }
});

app.patch("/api/admin/games/:id", requireAuth, requireAdmin, (req, res) => {
  const visible = req.body && req.body.visible;
  if (typeof visible !== "boolean") return res.status(400).json({ error: "visible 必须是布尔值。" });
  const info = db.prepare("UPDATE games SET visible = ? WHERE id = ?").run(visible ? 1 : 0, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "游戏不存在。" });
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`NEON ARCADE PRO running at http://localhost:${PORT}`));
