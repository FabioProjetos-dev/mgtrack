// API de integração para o servidor de comunicação dos rastreadores (GT06, Suntech, Teltonika...).
// Autenticação: header "Authorization: Bearer <INTEGRATION_TOKEN>".
const express = require('express');
const crypto = require('crypto');
const { query, one, now } = require('./db');
const { HttpError, update } = require('./crud');
const { TIPOS_EVENTO } = require('./schema');

const DT_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const num = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function makeIntegration() {
  const r = express.Router();

  r.use((req, res, next) => {
    const expected = process.env.INTEGRATION_TOKEN;
    if (!expected) throw new HttpError(503, 'Integração desativada: defina a variável INTEGRATION_TOKEN.');
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(got), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Token de integração inválido');
    next();
  });

  // Recebe uma posição ou uma lista de posições.
  // { imei, lat, lng, velocidade, ignicao, odometro, data: "YYYY-MM-DD HH:MM:SS" (horário de Brasília), evento, descricao }
  // Resposta: comandos pendentes de cada equipamento (marcados como "Enviado").
  r.post('/posicoes', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [req.body];
    if (list.length > 500) throw new HttpError(400, 'Máximo de 500 posições por requisição');
    const result = [];
    for (const p of list) {
      const imei = String(p?.imei || '').trim();
      const v = imei && await one(`SELECT v.* FROM veiculos v JOIN equipamentos e ON e.id = v.equipamento_id WHERE e.imei = ?`, [imei]);
      if (!v) { result.push({ imei, ok: false, erro: 'IMEI não vinculado a veículo' }); continue; }
      const data = DT_RE.test(p.data || '') ? String(p.data).replace('T', ' ').padEnd(19, ':00').slice(0, 19) : now();
      const lat = num(p.lat), lng = num(p.lng), vel = num(p.velocidade);
      const upd = { ultima_conexao: data };
      if (lat !== null && lng !== null) Object.assign(upd, { lat, lng, ultima_posicao: data });
      if (vel !== null) upd.velocidade = vel;
      if (p.ignicao !== undefined) upd.ignicao = p.ignicao ? 1 : 0;
      if (num(p.odometro) !== null) upd.odometro = num(p.odometro);
      await update('veiculos', v.id, upd);

      const evento = (tipo, descricao) => query('INSERT INTO eventos (veiculo_id, tipo, data, velocidade, lat, lng, descricao, tratado) VALUES (?,?,?,?,?,?,?,0)',
        [v.id, tipo, data, vel, lat, lng, descricao ?? null]);
      if (p.evento && TIPOS_EVENTO.includes(p.evento)) await evento(p.evento, p.descricao);
      if (p.ignicao !== undefined && (p.ignicao ? 1 : 0) !== (v.ignicao ? 1 : 0)) await evento(p.ignicao ? 'Ignição ligada' : 'Ignição desligada');
      if (vel !== null && v.limite_velocidade && vel > v.limite_velocidade) await evento('Excesso de velocidade', `Velocidade ${vel} km/h - limite ${v.limite_velocidade} km/h`);

      const cmds = await query(`UPDATE comandos SET status = 'Enviado' WHERE veiculo_id = ? AND status = 'Pendente' RETURNING id, comando, parametros`, [v.id]);
      result.push({ imei, ok: true, comandos: cmds });
    }
    res.json({ ok: true, result });
  });

  // Confirma a execução de um comando: { status: "Confirmado" | "Falhou" }
  r.post('/comandos/:id/resposta', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const status = req.body?.status === 'Falhou' ? 'Falhou' : 'Confirmado';
    const c = id && await one('SELECT * FROM comandos WHERE id = ?', [id]);
    if (!c) throw new HttpError(404, 'Comando não encontrado');
    await update('comandos', id, { status, data_resposta: now() });
    if (status === 'Confirmado' && ['Bloquear', 'Desbloquear'].includes(c.comando)) {
      const b = c.comando === 'Bloquear' ? 1 : 0;
      await update('veiculos', c.veiculo_id, b ? { bloqueado: 1, velocidade: 0 } : { bloqueado: 0 });
      await query('INSERT INTO eventos (veiculo_id, tipo, data, descricao, tratado) VALUES (?,?,?,?,0)', [c.veiculo_id, b ? 'Bloqueio' : 'Desbloqueio', now(), `Comando #${id} confirmado`]);
    }
    res.json({ ok: true });
  });

  return r;
}

module.exports = { makeIntegration };
