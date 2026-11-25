// Camada de banco: PostgreSQL (Neon / Supabase via DATABASE_URL) ou PGlite local (desenvolvimento).
const crypto = require('crypto');
const path = require('path');
const { E } = require('./schema');

const TZ = 'America/Sao_Paulo';
// Expressões SQL de "agora" no fuso de Brasília (o servidor da Vercel roda em UTC)
const NOW = `(now() AT TIME ZONE '${TZ}')::timestamp(0)`;
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

// Datas sempre como texto "YYYY-MM-DD" / "YYYY-MM-DD HH:MM:SS"; números como number.
const asText = v => v;
const asInt = v => (v === null ? null : parseInt(v, 10));
const asFloat = v => (v === null ? null : parseFloat(v));
const PARSERS = { 1082: asText, 1114: asText, 1184: asText, 1083: asText, 20: asInt, 1700: asFloat };

let driver = null;
function getDriver() {
  if (driver) return driver;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { Pool, types } = require('pg');
    for (const [oid, fn] of Object.entries(PARSERS)) types.setTypeParser(+oid, fn);
    const local = /localhost|127\.0\.0\.1/.test(url);
    // Os parâmetros ssl* da URL (ex.: sslmode=require do Neon/Supabase) sobrescrevem a opção "ssl" do driver
    // e fazem ele exigir validação completa do certificado — o que falha no pooler do Supabase.
    // Removemos e definimos o SSL explicitamente (conexão continua criptografada).
    let connectionString = url;
    try {
      const u = new URL(url);
      for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k);
      connectionString = u.toString();
    } catch { /* mantém a URL original */ }
    const pool = new Pool({ connectionString, max: process.env.VERCEL ? 3 : 10, ssl: local ? false : { rejectUnauthorized: false } });
    pool.on('error', e => console.error('[pg pool]', e.message));
    driver = { kind: 'postgres', query: (sql, p) => pool.query(sql, p) };
  } else if (process.env.VERCEL) {
    const err = new Error('Banco de dados não configurado: conecte o Neon/Supabase ao projeto na Vercel (variável DATABASE_URL) e faça um novo deploy.');
    err.status = 503;
    throw err;
  } else {
    // Sem DATABASE_URL: Postgres embutido (PGlite) gravando em ./data/pg — apenas para desenvolvimento local.
    const dir = process.env.PGLITE_DIR || path.join(__dirname, '..', 'data', 'pg');
    let dbp;
    const get = () => (dbp ||= import('@electric-sql/pglite').then(({ PGlite }) => new PGlite(dir === 'memory' ? undefined : dir, { parsers: PARSERS })));
    driver = { kind: 'pglite', query: async (sql, p) => (await get()).query(sql, p) };
  }
  return driver;
}

// Converte placeholders "?" em "$1, $2..." (nenhuma SQL do sistema usa "?" literal)
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
async function query(sql, params = []) { return (await getDriver().query(toPg(sql), params)).rows; }
const one = async (sql, params) => (await query(sql, params))[0];

// ── Migração automática a partir do esquema
const sqlType = t => ({ number: 'DOUBLE PRECISION', money: 'DOUBLE PRECISION', bool: 'INTEGER', ref: 'INTEGER', date: 'DATE', datetime: 'TIMESTAMP(0)' }[t] || 'TEXT');
const EXTRA_TABLES = {
  sessoes: 'token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, expira TIMESTAMP(0) NOT NULL',
  viagens: `id SERIAL PRIMARY KEY, veiculo_id INTEGER, motorista_id INTEGER, inicio TIMESTAMP(0), fim TIMESTAMP(0), origem TEXT, destino TEXT,
    km DOUBLE PRECISION, vel_max DOUBLE PRECISION, vel_media DOUBLE PRECISION, paradas INTEGER, tempo_parado_min INTEGER, litros DOUBLE PRECISION`,
};

async function migrate() {
  const cols = await query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`);
  const have = {};
  for (const c of cols) (have[c.table_name] ||= new Set()).add(c.column_name);
  for (const [table, ent] of Object.entries(E)) {
    if (!have[table]) {
      await query(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, ${ent.fields.map(f => `"${f.name}" ${sqlType(f.type)}`).join(', ')},
        created_at TIMESTAMP(0) DEFAULT ${NOW}, updated_at TIMESTAMP(0) DEFAULT ${NOW})`);
      for (const f of ent.fields) if (f.type === 'ref') await query(`CREATE INDEX IF NOT EXISTS ix_${table}_${f.name} ON ${table}("${f.name}")`);
    } else {
      for (const f of ent.fields) if (!have[table].has(f.name)) await query(`ALTER TABLE ${table} ADD COLUMN "${f.name}" ${sqlType(f.type)}`);
    }
  }
  for (const [t, def] of Object.entries(EXTRA_TABLES)) if (!have[t]) await query(`CREATE TABLE IF NOT EXISTS ${t} (${def})`);
  if (!have.equipamentos) await query('CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_imei ON equipamentos(imei)');
}

// Dados iniciais mínimos: somente o administrador (o banco começa zerado).
async function bootstrap() {
  if ((await one('SELECT COUNT(*) n FROM usuarios')).n > 0) return;
  const grupo = await one(`INSERT INTO grupos_permissao (nome, descricao, permissoes) VALUES ('Administradores', 'Acesso total', 'Todos') RETURNING id`);
  await query(`INSERT INTO usuarios (nome, login, email, senha, grupo_permissao_id, ativo) VALUES ('Administrador', ?, NULL, ?, ?, 1)`,
    [process.env.ADMIN_LOGIN || 'admin', hashPassword(process.env.ADMIN_PASSWORD || 'admin123'), grupo.id]);
  // Categorias de OS conforme o sistema atual (mg-track-sistema.md §4)
  for (const [nome, cor] of [['Buscar equipamento', '#8E44AD'], ['Instalação com bloqueio', '#3598DC'], ['Instalação simples', '#36C6D3'], ['Manutenção', '#F1C40F'], ['Retirada', '#E7505A']])
    await query('INSERT INTO categorias_os (nome, cor) VALUES (?, ?)', [nome, cor]);
  console.log('Banco inicializado. Usuário administrador criado.');
}

let readyP = null;
const ready = () => (readyP ||= migrate().then(bootstrap).catch(e => { readyP = null; throw e; }));

async function reset() {
  const tables = [...Object.keys(E), ...Object.keys(EXTRA_TABLES)];
  await query(`DROP TABLE IF EXISTS ${tables.join(', ')} CASCADE`);
  readyP = null;
  await ready();
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

// Datas no fuso de Brasília
const pad = n => String(n).padStart(2, '0');
function now() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
const today = () => now().slice(0, 10);
// Date "local" representando o horário de Brasília (para aritmética de calendário)
function nowDate() { const s = now(); return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDateTime(d) { return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

module.exports = { query, one, ready, reset, getDriver, hashPassword, checkPassword, now, today, nowDate, fmtDate, fmtDateTime, NOW, TODAY, TZ };
