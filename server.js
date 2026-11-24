const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { open, checkPassword, hashPassword, fmtDateTime, now } = require('./src/db');
const { makeCrud, HttpError } = require('./src/crud');
const { makeDashboard } = require('./src/dashboard');
const { makeReports } = require('./src/reports');
const seed = require('./src/seed');
const simulator = require('./src/simulator');

const PORT = process.env.PORT || 3000;
const SIMULAR = process.env.SIMULADOR !== '0';
const db = open({ reset: process.argv.includes('--reset') });
if (seed.run(db)) console.log('Banco populado com dados de demonstração.');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ── Sessão por cookie httpOnly
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c => {
  const i = c.indexOf('='); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
}));
const SESSION_H = 12;

app.post('/api/login', (req, res) => {
  const { login, senha } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(String(login || ''));
  if (!u || !checkPassword(String(senha || ''), u.senha)) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?,?,?)').run(token, u.id, fmtDateTime(new Date(Date.now() + SESSION_H * 3600000)));
  db.prepare('INSERT INTO logs (data, usuario, acao, entidade, registro_id) VALUES (?,?,?,?,?)').run(now(), u.nome, 'Login', 'Sistema', u.id);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_H * 3600}`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  const token = cookies(req).sid;
  const s = token && db.prepare(`SELECT u.id, u.nome, u.login, u.email FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira > ? AND u.ativo = 1`).get(token, now());
  if (!s) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  req.user = s; req.token = token;
  next();
});

app.post('/api/logout', (req, res) => {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(req.token);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json(req.user));
app.put('/api/me', (req, res) => {
  const { nome, email, senha_atual, senha_nova } = req.body || {};
  if (!String(nome || '').trim()) throw new HttpError(400, 'Informe o nome');
  if (senha_nova) {
    const u = db.prepare('SELECT senha FROM usuarios WHERE id = ?').get(req.user.id);
    if (!checkPassword(String(senha_atual || ''), u.senha)) throw new HttpError(400, 'Senha atual incorreta');
    if (String(senha_nova).length < 6) throw new HttpError(400, 'A nova senha deve ter ao menos 6 caracteres');
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hashPassword(String(senha_nova)), req.user.id);
  }
  db.prepare('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?').run(String(nome).trim(), email || null, req.user.id);
  res.json({ ok: true });
});

app.use('/api', makeCrud(db).router);
app.use('/api', makeDashboard(db));
app.use('/api', makeReports(db));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : err.message });
});

db.prepare('DELETE FROM sessoes WHERE expira < ?').run(now());
if (SIMULAR) simulator.start(db);
app.listen(PORT, () => console.log(`MG-TRACK rodando em http://localhost:${PORT}  (login: admin / admin123)`));
