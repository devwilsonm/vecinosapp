const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { dataDir } = require("./config");

const logDatabasePath = process.env.LOG_DATABASE_PATH || path.join(dataDir, "instance", "vecinosapp_logs.sqlite");

let logDatabase = null;

function saveLogDb() {
  if (!logDatabase) return;
  fs.mkdirSync(path.dirname(logDatabasePath), { recursive: true });
  const tempPath = `${logDatabasePath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(logDatabase.export()));
  fs.renameSync(tempPath, logDatabasePath);
}

async function initLogDb() {
  if (logDatabase) return;
  const SQL = await initSqlJs();
  fs.mkdirSync(path.dirname(logDatabasePath), { recursive: true });
  if (fs.existsSync(logDatabasePath) && fs.statSync(logDatabasePath).size > 0) {
    logDatabase = new SQL.Database(fs.readFileSync(logDatabasePath));
  } else {
    logDatabase = new SQL.Database();
  }
  logDatabase.exec(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_api_logs_user ON api_logs(user_id, created_at);
  `);
  saveLogDb();
}

function writeApiLog(entry) {
  if (!logDatabase) return;
  logDatabase.run(
    `
      INSERT INTO api_logs (user_id, user_email, method, path, status_code, duration_ms, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entry.userId || null,
      entry.userEmail || null,
      entry.method,
      entry.path,
      entry.statusCode,
      entry.durationMs,
      entry.ip || null,
      entry.userAgent || null
    ]
  );
  saveLogDb();
}

function listApiLogs(filters = {}) {
  if (!logDatabase) return [];
  const where = [];
  const params = [];

  if (filters.email) {
    where.push("user_email LIKE ?");
    params.push(`%${filters.email}%`);
  }
  if (filters.method) {
    where.push("method = ?");
    params.push(filters.method);
  }
  if (filters.statusCode) {
    where.push("status_code = ?");
    params.push(filters.statusCode);
  }
  if (filters.path) {
    where.push("path LIKE ?");
    params.push(`%${filters.path}%`);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 10), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const sql = `
    SELECT id, user_id, user_email, method, path, status_code, duration_ms, ip, user_agent, created_at
    FROM api_logs
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const stmt = logDatabase.prepare(sql);
  const rows = [];
  try {
    stmt.bind([...params, limit, offset]);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function countApiLogs(filters = {}) {
  if (!logDatabase) return 0;
  const where = [];
  const params = [];

  if (filters.email) {
    where.push("user_email LIKE ?");
    params.push(`%${filters.email}%`);
  }
  if (filters.method) {
    where.push("method = ?");
    params.push(filters.method);
  }
  if (filters.statusCode) {
    where.push("status_code = ?");
    params.push(filters.statusCode);
  }
  if (filters.path) {
    where.push("path LIKE ?");
    params.push(`%${filters.path}%`);
  }

  const stmt = logDatabase.prepare(`
    SELECT COUNT(*) AS total
    FROM api_logs
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  `);
  try {
    if (params.length) stmt.bind(params);
    if (!stmt.step()) return 0;
    return stmt.getAsObject().total || 0;
  } finally {
    stmt.free();
  }
}

function apiLogSummary() {
  if (!logDatabase) return { total: 0, withUser: 0, loginEvents: 0 };
  const result = logDatabase.exec(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS with_user,
      SUM(CASE WHEN path = '/login' AND method = 'POST' THEN 1 ELSE 0 END) AS login_events
    FROM api_logs
  `);
  const values = result[0]?.values[0] || [0, 0, 0];
  return { total: values[0] || 0, withUser: values[1] || 0, loginEvents: values[2] || 0 };
}

function clearApiLogs() {
  if (!logDatabase) return;
  logDatabase.run("DELETE FROM api_logs");
  try {
    logDatabase.run("DELETE FROM sqlite_sequence WHERE name = 'api_logs'");
  } catch {
    // sqlite_sequence may not exist until an AUTOINCREMENT table has rows.
  }
  saveLogDb();
}

module.exports = { apiLogSummary, clearApiLogs, countApiLogs, initLogDb, listApiLogs, writeApiLog };
