const Database = require('better-sqlite3');
const path = require('path');
const config = require('../../config');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = path.resolve(config.storage.dbPath);
  _db = new Database(dbPath);

  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS seen_jobs (
      id            TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL
    )
  `);

  console.log(`[DB] Opened database at ${dbPath}`);
  return _db;
}

function isNew(id) {
  const row = getDb()
    .prepare('SELECT 1 FROM seen_jobs WHERE id = ?')
    .get(id);
  return row === undefined;
}

function markSeenBatch(ids) {
  if (ids.length === 0) return;
  const insert = getDb().prepare(
    'INSERT OR IGNORE INTO seen_jobs (id, first_seen_at) VALUES (?, ?)'
  );
  const now = new Date().toISOString();
  const insertAll = getDb().transaction((list) => {
    for (const id of list) insert.run(id, now);
  });
  insertAll(ids);
}

function countSeen() {
  return getDb().prepare('SELECT COUNT(*) as n FROM seen_jobs').get().n;
}

module.exports = { isNew, markSeenBatch, countSeen };
