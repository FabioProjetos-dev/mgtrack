// API de integração para o servidor de comunicação dos rastreadores (GT06, Suntech, Teltonika...).
// Autenticação: header "Authorization: Bearer <INTEGRATION_TOKEN>".
const express = require('express');
const crypto = require('crypto');
const { query, one, now, toBrt } = require('./db');
const traccar = require('./traccar');
const { HttpError, update } = require('./crud');
const { TIPOS_EVENTO } = require('./schema');

const DT_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const num = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Alarmes do Traccar (position.attributes.alarm) → tipo de evento do MG-TRACK e descrição
const ALARMES = {
  sos: ['Botão de pânico'],
  powerCut: ['Bateria violada', 'Alimentação cortada'],
  powerOff: ['Bateria violada', 'Rastreador desligado'],
  removing: ['Bateria violada', 'Rastreador removido'],
  tampering: ['Bateria violada', 'Violação do rastreador'],
  overspeed: ['Excesso de velocidade', 'Alarme de velocidade do rastreador'],
  geofenceEnter: ['Entrada em cerca'],
  geofenceExit: ['Saída de cerca'],
  lowBattery: ['Alarme do rastreador', 'Bateria interna baixa'],
  lowPower: ['Alarme do rastreador', 'Tensão da bateria do veículo baixa'],
  powerRestored: ['Alarme do rastreador', 'Alimentação restaurada'],
  vibration: ['Alarme do rastreador', 'Vibração'],
  movement: ['Alarme do rastreador', 'Movimento'],
  jamming: ['Alarme do rastreador', 'Sinal bloqueado (jammer)'],
  gpsAntennaCut: ['Alarme do rastreador', 'Antena GPS cortada'],
  tow: ['Alarme do rastreador', 'Reboque'],
  accident: ['Alarme do rastreador', 'Acidente'],
  door: ['Alarme do rastreador', 'Porta aberta'],
  hardBraking: ['Alarme do rastreador', 'Frenagem brusca'],
  hardAcceleration: ['Alarme do rastreador', 'Aceleração brusca'],
  hardCornering: ['Alarme do rastreador', 'Curva brusca'],
  fatigueDriving: ['Alarme do rastreador', 'Direção por tempo excessivo'],
  general: ['Alarme do rastreador', 'Alarme'],
};

// Marca o comando como confirmado/falhou; bloqueio/desbloqueio confirmados atualizam o veículo e geram evento
async function confirmCommand(c, status, resposta) {
  await update('comandos', c.id, { status, data_resposta: now(), ...(resposta ? { resposta } : {}) });
  if (status === 'Confirmado' && ['Bloquear', 'Desbloquear'].includes(c.comando)) {
    const b = c.comando === 'Bloquear' ? 1 : 0;
    await update('veiculos', c.veiculo_id, b ? { bloqueado: 1, velocidade: 0 } : { bloqueado: 0 });
    await query('INSERT INTO eventos (veiculo_id, tipo, data, descricao, tratado) VALUES (?,?,?,?,0)', [c.veiculo_id, b ? 'Bloqueio' : 'Desbloqueio', now(), `Comando #${c.id} confirmado`]);
  }
}

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
    const c = id && await one('SELECT * FROM comandos WHERE id = ?', [id]);
    if (!c) throw new HttpError(404, 'Comando não encontrado');
    await confirmCommand(c, req.body?.status === 'Falhou' ? 'Falhou' : 'Confirmado');
    res.json({ ok: true });
  });

  // Eventos encaminhados pelo Traccar (traccar.xml: event.forward.url + event.forward.header)
  // Corpo: { event: { type, eventTime, attributes }, position, device: { uniqueId }, geofence }
  r.post('/traccar/eventos', async (req, res) => {
    const { event, position: pos, device, geofence } = req.body || {};
    const imei = String(device?.uniqueId || '').trim();
    const v = imei && await one('SELECT v.* FROM veiculos v JOIN equipamentos e ON e.id = v.equipamento_id WHERE e.imei = ?', [imei]);
    if (!v || !event?.type) return res.json({ ok: true, ignorado: !v ? 'IMEI não vinculado a veículo' : 'sem evento' });

    // Atualiza a posição do veículo com a posição do evento (se for mais recente)
    if (pos?.latitude != null) await traccar.applyRecords([traccar.toRecord({ uniqueId: imei, lastUpdate: pos.serverTime }, pos)]);

    const data = toBrt(event.eventTime) || now();
    const vel = pos?.speed != null ? Math.round(pos.speed * traccar.KNOT * 10) / 10 : null;
    const evento = (tipo, descricao) => query('INSERT INTO eventos (veiculo_id, tipo, data, velocidade, lat, lng, descricao, tratado) VALUES (?,?,?,?,?,?,?,0)',
      [v.id, tipo, data, vel, pos?.latitude ?? null, pos?.longitude ?? null, descricao ?? null]);

    switch (event.type) {
      case 'ignitionOn': await evento('Ignição ligada'); break;
      case 'ignitionOff': await evento('Ignição desligada'); break;
      case 'deviceOverspeed': await evento('Excesso de velocidade', `Velocidade ${vel ?? '?'} km/h - limite ${v.limite_velocidade ?? '?'} km/h`); break;
      case 'geofenceEnter': await evento('Entrada em cerca', geofence?.name); break;
      case 'geofenceExit': await evento('Saída de cerca', geofence?.name); break;
      case 'alarm': {
        const a = event.attributes?.alarm || pos?.attributes?.alarm || 'general';
        for (const code of String(a).split(',')) {
          const [tipo, desc] = Object.hasOwn(ALARMES, code) ? ALARMES[code] : ['Alarme do rastreador', code.slice(0, 60)];
          await evento(tipo, desc);
        }
        break;
      }
      case 'commandResult': {
        // Resposta do aparelho: confirma o último comando enviado a este veículo nas últimas 2 horas
        const c = await one(`SELECT * FROM comandos WHERE veiculo_id = ? AND status IN ('Enviado','Pendente') AND data_envio >= ?
          ORDER BY id DESC LIMIT 1`, [v.id, toBrt(Date.now() - 2 * 3600000)]);
        const result = String(pos?.attributes?.result ?? event.attributes?.result ?? '').slice(0, 500);
        if (c) await confirmCommand(c, 'Confirmado', result);
        break;
      }
      default: break; // deviceOnline, deviceOffline, deviceMoving, deviceStopped... não geram evento no MG-TRACK
    }
    res.json({ ok: true });
  });

  return r;
}

module.exports = { makeIntegration };
