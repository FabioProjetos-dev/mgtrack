const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { E } = require('./schema');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'mgtrack.db');

function open({ reset = false } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (reset) for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

const sqlType = t => (['number', 'money'].includes(t) ? 'REAL' : ['bool', 'ref'].includes(t) ? 'INTEGER' : 'TEXT');

function migrate(db) {
  for (const [table, ent] of Object.entries(E)) {
    const cols = ent.fields.map(f => `"${f.name}" ${sqlType(f.type)}`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols.join(', ')},
      created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const f of ent.fields) if (!existing.has(f.name)) db.exec(`ALTER TABLE ${table} ADD COLUMN "${f.name}" ${sqlType(f.type)}`);
    for (const f of ent.fields) if (f.type === 'ref') db.exec(`CREATE INDEX IF NOT EXISTS ix_${table}_${f.name} ON ${table}(${f.name})`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, usuario_id INTEGER, expira TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS viagens (id INTEGER PRIMARY KEY AUTOINCREMENT, veiculo_id INTEGER, motorista_id INTEGER,
    inicio TEXT, fim TEXT, origem TEXT, destino TEXT, km REAL, vel_max REAL, vel_media REAL, paradas INTEGER, tempo_parado_min INTEGER,
    litros REAL)`);
}

// Senhas: scrypt com salt
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Datas em horário local, formato "YYYY-MM-DD HH:MM:SS"
const pad = n => String(n).padStart(2, '0');
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDateTime(d) { return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
const now = () => fmtDateTime(new Date());
const today = () => fmtDate(new Date());

module.exports = { open, hashPassword, checkPassword, fmtDate, fmtDateTime, now, today, DB_FILE };
