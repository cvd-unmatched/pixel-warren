// Static file + save-game server for Pixel Warren, plus optional
// MariaDB-backed accounts and a leaderboard. Guest play (no login) keeps
// working exactly as before, backed by a single JSON file -- accounts are
// additive, not a requirement to run the game.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Load .env into process.env without adding a dotenv dependency -- a
// value already set in the real environment always wins.
function loadEnvFile(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch (e) { return; }
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  });
}
loadEnvFile(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'save.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 256 * 1024;
const SESSION_COOKIE = 'pw_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

fs.mkdirSync(DATA_DIR, { recursive: true });

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* ---------------- MariaDB (accounts + leaderboard) ----------------
   Entirely optional: with no DB_HOST set (or if the connection fails at
   boot), the server just runs in guest-only, file-backed mode like
   before. Nothing about local/Artifact play depends on this. */
let pool = null;
let dbReady = false;

async function initDb() {
  if (!process.env.DB_HOST) {
    console.log('DB_HOST not set -- running in guest-only (file save) mode.');
    return;
  }
  let mariadb;
  try {
    mariadb = require('mariadb');
  } catch (e) {
    console.warn('mariadb package not installed -- running in guest-only mode.');
    return;
  }
  pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || undefined,
    database: process.env.DB_NAME,
    connectionLimit: 5
  });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(24) NOT NULL UNIQUE,
        password_hash VARCHAR(200) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await conn.query(`CREATE TABLE IF NOT EXISTS sessions (
        token CHAR(64) PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
      await conn.query(`CREATE TABLE IF NOT EXISTS saves (
        user_id INT UNSIGNED PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
      await conn.query(`CREATE TABLE IF NOT EXISTS leaderboard (
        user_id INT UNSIGNED PRIMARY KEY,
        username VARCHAR(24) NOT NULL,
        blessings INT UNSIGNED NOT NULL DEFAULT 0,
        dragon_kills INT UNSIGNED NOT NULL DEFAULT 0,
        total_kills INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
      dbReady = true;
      console.log('Connected to MariaDB at ' + process.env.DB_HOST + ' -- accounts enabled.');
    } finally {
      conn.release();
    }
  } catch (e) {
    console.warn('MariaDB connection failed (' + e.message + ') -- running in guest-only mode.');
    pool = null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const parts = String(stored).split(':');
  if (parts.length !== 2) return false;
  const hashBuf = Buffer.from(parts[1], 'hex');
  const testBuf = crypto.scryptSync(password, parts[0], 64);
  return hashBuf.length === testBuf.length && crypto.timingSafeEqual(hashBuf, testBuf);
}
function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key) out[key] = decodeURIComponent(val);
    }
  });
  return out;
}
function setSessionCookie(res, token, maxAgeMs) {
  const parts = [
    SESSION_COOKIE + '=' + token,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    'Max-Age=' + Math.round(maxAgeMs / 1000)
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

async function getSessionUser(req) {
  if (!dbReady) return null;
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const rows = await pool.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()`, [token]
  );
  return rows[0] || null;
}

/* ---------------- JSON request helpers ---------------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf8') ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* ---------------- Guest (file-backed) save, unchanged behavior ---------------- */
function readFileSave() {
  try {
    return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}
function writeFileSaveAtomic(data) {
  const tmpFile = SAVE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data));
  fs.renameSync(tmpFile, SAVE_FILE);
}

/* ---------------- Save endpoints: per-account when logged in, else file ---------------- */
async function handleGetSave(req, res) {
  const user = await getSessionUser(req).catch(() => null);
  if (user) {
    const rows = await pool.query('SELECT data FROM saves WHERE user_id = ?', [user.id]);
    return sendJson(res, 200, rows[0] ? JSON.parse(rows[0].data) : {});
  }
  sendJson(res, 200, readFileSave());
}
async function handlePostSave(req, res) {
  let data;
  try {
    data = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, e.status || 400, { ok: false, error: e.message });
  }
  const user = await getSessionUser(req).catch(() => null);
  if (user) {
    await pool.query(
      `INSERT INTO saves (user_id, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [user.id, JSON.stringify(data)]
    );
    await pool.query(
      `INSERT INTO leaderboard (user_id, username, blessings, dragon_kills, total_kills)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE blessings = VALUES(blessings), dragon_kills = VALUES(dragon_kills), total_kills = VALUES(total_kills)`,
      [user.id, user.username, Math.max(0, Math.round(data.blessings || 0)), Math.max(0, Math.round(data.dragonKills || 0)), Math.max(0, Math.round(data.totalKills || 0))]
    );
    return sendJson(res, 200, { ok: true, loggedIn: true, username: user.username });
  }
  writeFileSaveAtomic(data);
  sendJson(res, 200, { ok: true, loggedIn: false });
}

/* ---------------- Auth endpoints ---------------- */
async function handleSignup(req, res) {
  if (!dbReady) return sendJson(res, 503, { ok: false, error: 'accounts are not available right now' });
  let body;
  try { body = await readJsonBody(req); } catch (e) { return sendJson(res, e.status || 400, { ok: false, error: e.message }); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!USERNAME_RE.test(username)) {
    return sendJson(res, 400, { ok: false, error: 'username must be 3-24 characters: letters, numbers, underscore' });
  }
  if (password.length < 8 || password.length > 200) {
    return sendJson(res, 400, { ok: false, error: 'password must be at least 8 characters' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hashPassword(password)]
    );
    const userId = result.insertId;
    const token = makeToken();
    await pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      [token, userId, new Date(Date.now() + SESSION_TTL_MS)]
    );
    setSessionCookie(res, token, SESSION_TTL_MS);
    sendJson(res, 200, { ok: true, username });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return sendJson(res, 409, { ok: false, error: 'that username is taken' });
    console.error('signup error:', e.message);
    sendJson(res, 500, { ok: false, error: 'signup failed' });
  }
}
async function handleLogin(req, res) {
  if (!dbReady) return sendJson(res, 503, { ok: false, error: 'accounts are not available right now' });
  let body;
  try { body = await readJsonBody(req); } catch (e) { return sendJson(res, e.status || 400, { ok: false, error: e.message }); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const rows = await pool.query('SELECT id, password_hash FROM users WHERE username = ?', [username]);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    return sendJson(res, 401, { ok: false, error: 'wrong username or password' });
  }
  // Only one active session per account -- logging in somewhere else
  // (another tab, another device) invalidates any prior session, so two
  // copies of the game can never both be autosaving the same account and
  // silently clobbering each other's progress.
  await pool.query('DELETE FROM sessions WHERE user_id = ?', [row.id]);
  const token = makeToken();
  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    [token, row.id, new Date(Date.now() + SESSION_TTL_MS)]
  );
  setSessionCookie(res, token, SESSION_TTL_MS);
  sendJson(res, 200, { ok: true, username });
}
async function handleLogout(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (dbReady && token) {
    await pool.query('DELETE FROM sessions WHERE token = ?', [token]).catch(() => {});
  }
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}
async function handleMe(req, res) {
  const user = await getSessionUser(req).catch(() => null);
  sendJson(res, 200, { loggedIn: !!user, username: user ? user.username : null });
}
async function handleLeaderboard(req, res) {
  if (!dbReady) return sendJson(res, 200, { rows: [] });
  const rows = await pool.query(
    'SELECT username, blessings, dragon_kills, total_kills FROM leaderboard ORDER BY blessings DESC, dragon_kills DESC LIMIT 20'
  );
  sendJson(res, 200, { rows });
}
// Server-side feature flags the client can't see on its own (it's a
// static file with no access to process.env). BESTIARY=show is a design
// review switch -- reveals every monster's lore/power in the Bestiary
// regardless of what that player has actually defeated.
async function handleConfig(req, res) {
  sendJson(res, 200, {
    bestiaryShowAll: process.env.BESTIARY === 'true',
    toolsEnabled: TOOLS_ENABLED,
    godMode: process.env.GOD === 'true',
    clickLogging: process.env.LOGGING === 'true',
    autoUpgradeUser: process.env.AUTOUPGRADE || null
  });
}

/* ---------------- Dev-only monster sprite editor (/tool) ----------------
   Gated behind TOOLS=true since it writes straight into a source file. */
const TOOLS_ENABLED = process.env.TOOLS === 'true';
const MONSTERS_SIM_ENABLED = process.env.MONSTERS === 'true';
const SPRITES_FILE = path.join(PUBLIC_DIR, 'js', 'sprites.js');
const MONSTERS_MARKER = 'var MONSTERS = {';

// Scans MONSTERS' object body (string/brace aware) for a top-level
// `key:{...}` entry and returns its [start,end) span in `text`, or null.
function findMonsterEntrySpan(text, key) {
  const objStart = text.indexOf(MONSTERS_MARKER);
  if (objStart === -1) return { bodyStart: -1, span: null };
  const bodyStart = objStart + MONSTERS_MARKER.length;
  let depth = 1;
  let i = bodyStart;
  const n = text.length;
  while (i < n && depth > 0) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const quote = c; i++;
      while (i < n && text[i] !== quote) { if (text[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (depth === 1) {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
      if (m) {
        const afterIdent = i + m[0].length;
        const afterWs = /^\s*:\s*\{/.exec(text.slice(afterIdent));
        if (afterWs) {
          if (m[0] === key) {
            const braceOpenIdx = afterIdent + afterWs[0].length - 1;
            let d2 = 1, j = braceOpenIdx + 1;
            while (j < n && d2 > 0) {
              const cj = text[j];
              if (cj === "'" || cj === '"') { const q = cj; j++; while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; } j++; continue; }
              if (cj === '{') d2++;
              else if (cj === '}') d2--;
              j++;
            }
            return { bodyStart, span: { start: i, end: j } };
          }
          i = afterIdent; continue;
        }
        i = afterIdent; continue;
      }
    }
    i++;
  }
  return { bodyStart, span: null };
}

async function handleToolSaveSprite(req, res) {
  if (!TOOLS_ENABLED) return sendJson(res, 404, { ok: false, error: 'not found' });
  let body;
  try { body = await readJsonBody(req); } catch (e) { return sendJson(res, e.status || 400, { ok: false, error: e.message }); }
  const key = String(body.key || '');
  const code = String(body.code || '');
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return sendJson(res, 400, { ok: false, error: 'invalid monster key' });
  if (!code.trim().startsWith(key)) return sendJson(res, 400, { ok: false, error: 'code must define that key' });
  let text;
  try { text = fs.readFileSync(SPRITES_FILE, 'utf8'); } catch (e) { return sendJson(res, 500, { ok: false, error: 'could not read sprites.js' }); }
  const { bodyStart, span } = findMonsterEntrySpan(text, key);
  if (bodyStart === -1) return sendJson(res, 500, { ok: false, error: 'MONSTERS object not found in sprites.js' });
  fs.writeFileSync(SPRITES_FILE + '.bak', text);
  let out, mode;
  if (span) {
    out = text.slice(0, span.start) + code + text.slice(span.end);
    mode = 'updated';
  } else {
    out = text.slice(0, bodyStart) + '\n' + code + ',' + text.slice(bodyStart);
    mode = 'inserted';
  }
  fs.writeFileSync(SPRITES_FILE, out);
  sendJson(res, 200, { ok: true, mode });
}

/* ---------------- Static files ---------------- */
function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function withErrorHandling(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => {
      console.error('request error:', e);
      if (!res.writableEnded) sendJson(res, 500, { ok: false, error: 'internal error' });
    });
  };
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/save' && req.method === 'GET') return withErrorHandling(handleGetSave)(req, res);
  if (url === '/api/save' && req.method === 'POST') return withErrorHandling(handlePostSave)(req, res);
  if (url === '/api/signup' && req.method === 'POST') return withErrorHandling(handleSignup)(req, res);
  if (url === '/api/login' && req.method === 'POST') return withErrorHandling(handleLogin)(req, res);
  if (url === '/api/logout' && req.method === 'POST') return withErrorHandling(handleLogout)(req, res);
  if (url === '/api/me' && req.method === 'GET') return withErrorHandling(handleMe)(req, res);
  if (url === '/api/leaderboard' && req.method === 'GET') return withErrorHandling(handleLeaderboard)(req, res);
  if (url === '/api/config' && req.method === 'GET') return withErrorHandling(handleConfig)(req, res);
  if (url === '/api/tool/save-sprite' && req.method === 'POST') return withErrorHandling(handleToolSaveSprite)(req, res);
  if (url === '/tool' && req.method === 'GET') {
    if (!TOOLS_ENABLED) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    req.url = '/tool.html';
    return serveStatic(req, res);
  }
  if (url === '/monsters' && req.method === 'GET') {
    if (!MONSTERS_SIM_ENABLED) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    req.url = '/monsters.html';
    return serveStatic(req, res);
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end('Method not allowed');
});

initDb().finally(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Pixel Warren running at http://localhost:${PORT}`);
    console.log(`Save file (guest mode): ${SAVE_FILE}`);
  });
});
