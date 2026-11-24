// Aplicação Express (usada pelo servidor local e pela função serverless da Vercel)
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { query, one, ready, checkPassword, hashPassword, now, fmtDateTime, nowDate } = require('./db');
const { makeCrud, HttpError, log } = require('./crud');
const { makeDashboard } = require('./dashboard');
const { makeReports } = require('./reports');
const { makeIntegration } = require('./integration');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// Garante esquema e usuário inicial antes de qualquer chamada à API
app.use('/api', async (req, res, next) => { try { await ready(); next(); } catch (e) { next(e); } });

const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(c => c.includes('=')).map(c => {
  const i = c.indexOf('='); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
}));
const SESSION_H = 12;
const cookie = (req, value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;

// Limite simples de tentativas de login por IP (por instância)
const attempts = new Map();
app.post('/api/login', async (req, res) => {
  const ip = req.ip || 'x', t = Date.now();
  const a = attempts.get(ip) || { n: 0, t };
  if (t - a.t > 15 * 60000) { a.n = 0; a.t = t; }
  if (a.n >= 10) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const { login, senha } = req.body || {};
  const u = await one('SELECT * FROM usuarios WHERE login = ? AND ativo = 1', [String(login || '')]);
  if (!u || !checkPassword(String(senha || ''), u.senha)) { a.n++; attempts.set(ip, a); throw new HttpError(401, 'Usuário ou senha inválidos'); }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  await query('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?,?,?)', [token, u.id, fmtDateTime(new Date(nowDate().getTime() + SESSION_H * 3600000))]);
  await query('DELETE FROM sessoes WHERE expira < ?', [now()]);
  await log(u, 'Login', 'Sistema', u.id, null);
  res.setHeader('Set-Cookie', cookie(req, token, SESSION_H * 3600));
  res.json({ ok: true });
});

// Integração com rastreadores (autenticada por token próprio, não por sessão)
app.use('/api/integracao', makeIntegration());

app.use('/api', async (req, res, next) => {
  try {
    const token = cookies(req).sid;
    const s = token && await one(`SELECT u.id, u.nome, u.login, u.email FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ? AND s.expira > ? AND u.ativo = 1`, [token, now()]);
    if (!s) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    req.user = s; req.token = token;
    next();
  } catch (e) { next(e); }
});

app.post('/api/logout', async (req, res) => {
  await query('DELETE FROM sessoes WHERE token = ?', [req.token]);
  res.setHeader('Set-Cookie', cookie(req, '', 0));
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json(req.user));
app.put('/api/me', async (req, res) => {
  const { nome, email, senha_atual, senha_nova } = req.body || {};
  if (!String(nome || '').trim()) throw new HttpError(400, 'Informe o nome');
  if (senha_nova) {
    const u = await one('SELECT senha FROM usuarios WHERE id = ?', [req.user.id]);
    if (!checkPassword(String(senha_atual || ''), u.senha)) throw new HttpError(400, 'Senha atual incorreta');
    if (String(senha_nova).length < 6) throw new HttpError(400, 'A nova senha deve ter ao menos 6 caracteres');
    await query('UPDATE usuarios SET senha = ? WHERE id = ?', [hashPassword(String(senha_nova)), req.user.id]);
  }
  await query('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?', [String(nome).trim(), email || null, req.user.id]);
  res.json({ ok: true });
});

app.use('/api', makeCrud());
app.use('/api', makeDashboard());
app.use('/api', makeReports());
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Em produção na Vercel os estáticos de public/ são servidos pela CDN; localmente, pelo Express.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : err.message });
});

module.exports = app;
