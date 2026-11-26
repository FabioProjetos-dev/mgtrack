// Integração com o servidor Traccar (https://www.traccar.org) — servidor próprio de comunicação dos rastreadores.
//  - Posições: o MG-TRACK BUSCA a última posição de todos os aparelhos na API do Traccar (no máximo a cada 15 s,
//    enquanto alguém usa o sistema). Assim a Vercel não recebe uma chamada por posição.
//  - Eventos: o Traccar ENVIA cada evento (ignição, alarme, cerca, excesso de velocidade, resposta de comando)
//    para /api/integracao/traccar/eventos (ver integration.js).
//  - Comandos: enviados na hora pela API do Traccar (POST /api/commands/send).
// Variáveis: TRACCAR_URL (ex.: http://IP:8082) e TRACCAR_TOKEN (gerado em Traccar → Configurações → Preferências → Token).
const { query, one, now, toBrt } = require('./db');

const KNOT = 1.852;
const enabled = () => !!(process.env.TRACCAR_URL && process.env.TRACCAR_TOKEN);
const base = () => String(process.env.TRACCAR_URL || '').replace(/\/+$/, '');

async function api(path, { method = 'GET', body, timeout = 8000 } = {}) {
  const r = await fetch(base() + '/api' + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.TRACCAR_TOKEN}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await r.text();
  if (!r.ok) {
    const msg = r.status === 401 ? 'token do Traccar inválido ou expirado' : (text.split('\n')[0] || r.statusText).slice(0, 200);
    const err = new Error(`Traccar respondeu ${r.status}: ${msg}`); err.httpStatus = r.status; throw err;
  }
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ── Posições (pull)
const state = { last: 0, running: null, ok: null, erro: null, quando: null, dispositivos: 0, atualizados: 0 };
const SYNC_MS = 15000;

function toRecord(dev, pos) {
  const ign = pos.attributes?.ignition;
  return {
    imei: dev.uniqueId,
    lat: pos.latitude, lng: pos.longitude,
    vel: Math.round((pos.speed || 0) * KNOT * 10) / 10,
    ign: ign === undefined ? null : ign ? 1 : 0,
    odo: pos.attributes?.odometer > 0 ? Math.round(pos.attributes.odometer / 100) / 10 : null, // odômetro informado pelo aparelho (m → km)
    posicao: toBrt(pos.fixTime),
    conexao: toBrt(dev.lastUpdate || pos.serverTime),
  };
}

async function applyRecords(recs) {
  if (!recs.length) return 0;
  const rows = await query(`UPDATE veiculos v SET lat = x.lat, lng = x.lng, velocidade = x.vel, ignicao = COALESCE(x.ign, v.ignicao),
      odometro = COALESCE(x.odo, v.odometro), ultima_posicao = x.posicao, ultima_conexao = GREATEST(x.conexao, v.ultima_conexao)
    FROM equipamentos e, jsonb_to_recordset(?::jsonb) AS x(imei TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, vel DOUBLE PRECISION,
      ign INTEGER, odo DOUBLE PRECISION, posicao TIMESTAMP, conexao TIMESTAMP)
    WHERE e.id = v.equipamento_id AND e.imei = x.imei AND (v.ultima_posicao IS NULL OR x.posicao >= v.ultima_posicao)
    RETURNING v.id`, [JSON.stringify(recs)]);
  return rows.length;
}

async function doSync() {
  try {
    const [devs, poss] = await Promise.all([api('/devices'), api('/positions')]);
    const byId = new Map(devs.data.map(d => [d.id, d]));
    const recs = poss.data.filter(p => byId.has(p.deviceId) && p.latitude != null).map(p => toRecord(byId.get(p.deviceId), p));
    Object.assign(state, { ok: true, erro: null, dispositivos: devs.data.length, atualizados: await applyRecords(recs) });
  } catch (e) {
    Object.assign(state, { ok: false, erro: e.name === 'TimeoutError' ? 'Traccar não respondeu (tempo esgotado)' : e.message });
    console.error('[traccar sync]', state.erro);
  } finally { state.quando = now(); state.last = Date.now(); }
}

// Sincroniza se a última sincronização tiver mais de 15 s (nunca lança erro; falhas ficam em state.erro)
function syncIfStale() {
  if (!enabled() || Date.now() - state.last < SYNC_MS) return Promise.resolve();
  return (state.running ||= doSync().finally(() => { state.running = null; }));
}

// ── Aparelhos: cria/atualiza o dispositivo no Traccar a partir do cadastro do MG-TRACK
async function findDevice(imei) {
  const r = await api('/devices?uniqueId=' + encodeURIComponent(imei));
  return r.data[0] || null;
}
async function ensureDevice(imei, { name, speedLimitKmh } = {}) {
  if (!enabled() || !imei) return null;
  let d = await findDevice(imei);
  if (!d) return (await api('/devices', { method: 'POST', body: { name: name || imei, uniqueId: imei, attributes: speedLimitKmh ? { speedLimit: speedLimitKmh / KNOT } : {} } })).data;
  const attrs = { ...(d.attributes || {}) };
  if (speedLimitKmh) attrs.speedLimit = Math.round(speedLimitKmh / KNOT * 100) / 100;
  const changed = (name && d.name !== name) || attrs.speedLimit !== d.attributes?.speedLimit;
  if (changed) d = (await api('/devices/' + d.id, { method: 'PUT', body: { ...d, name: name || d.name, attributes: attrs } })).data;
  return d;
}
// Mantém nome (placa) e limite de velocidade do dispositivo iguais aos do veículo
async function syncVehicle(veiculoId) {
  const v = await one('SELECT v.placa, v.limite_velocidade, e.imei FROM veiculos v JOIN equipamentos e ON e.id = v.equipamento_id WHERE v.id = ?', [veiculoId]);
  if (v?.imei) await ensureDevice(v.imei, { name: v.placa, speedLimitKmh: v.limite_velocidade });
}

// ── Comandos
const CMD_TYPE = { 'Bloquear': 'engineStop', 'Desbloquear': 'engineResume', 'Solicitar posição': 'positionSingle', 'Reiniciar': 'rebootDevice', 'Configurar intervalo': 'positionPeriodic', 'Personalizado': 'custom' };
// Textos equivalentes enviados como comando "custom" quando o protocolo não tem o tipo (ex.: GT06/J16 não tem positionSingle)
const CUSTOM_FALLBACK = {
  positionSingle: () => 'WHERE#',
  rebootDevice: () => 'RESET#',
  positionPeriodic: s => `TIMER,${s},${s}#`,
};

// Envia um comando registrado no MG-TRACK. Retorna { status, resposta } para gravar no comando.
async function sendCommand(cmd) {
  const v = await one('SELECT e.imei FROM veiculos v JOIN equipamentos e ON e.id = v.equipamento_id WHERE v.id = ?', [cmd.veiculo_id]);
  if (!v?.imei) return { status: 'Falhou', resposta: 'Veículo sem equipamento (IMEI) vinculado' };
  try {
    const dev = await findDevice(v.imei);
    if (!dev) return { status: 'Falhou', resposta: `Rastreador ${v.imei} não cadastrado no Traccar` };
    let type = CMD_TYPE[cmd.comando];
    if (!type) return { status: 'Falhou', resposta: 'Comando desconhecido' };
    const param = String(cmd.parametros ?? '').trim();
    const supported = new Set((await api('/commands/types?deviceId=' + dev.id)).data.map(t => t.type));
    let attributes = {};
    if (type === 'custom') {
      if (!param) return { status: 'Falhou', resposta: 'Informe o texto do comando em "Parâmetros"' };
      attributes = { data: param };
    } else if (type === 'positionPeriodic') {
      const s = parseInt(param, 10);
      if (!(s > 0)) return { status: 'Falhou', resposta: 'Informe o intervalo em segundos em "Parâmetros"' };
      attributes = { frequency: s };
    }
    if (!supported.has(type)) {
      if (CUSTOM_FALLBACK[type] && supported.has('custom')) { attributes = { data: CUSTOM_FALLBACK[type](attributes.frequency) }; type = 'custom'; }
      else return { status: 'Falhou', resposta: `Este rastreador não aceita o comando "${cmd.comando}"` };
    }
    const r = await api('/commands/send', { method: 'POST', body: { deviceId: dev.id, type, attributes } });
    // 200 = entregue ao aparelho; 202 = aparelho desconectado, o Traccar envia quando ele reconectar
    return r.status === 202
      ? { status: 'Pendente', resposta: 'Rastreador desconectado: o Traccar envia quando ele reconectar' }
      : { status: 'Enviado', resposta: type === 'custom' ? `Enviado: ${attributes.data}` : null };
  } catch (e) {
    return { status: 'Falhou', resposta: e.name === 'TimeoutError' ? 'Traccar não respondeu (tempo esgotado)' : e.message };
  }
}

async function status() {
  if (!enabled()) return { configurado: false, mensagem: 'Defina TRACCAR_URL e TRACCAR_TOKEN nas variáveis de ambiente.' };
  state.last = 0; await syncIfStale();
  return { configurado: true, url: base(), ok: state.ok, erro: state.erro, dispositivos: state.dispositivos, veiculos_atualizados: state.atualizados, quando: state.quando };
}

module.exports = { enabled, syncIfStale, ensureDevice, syncVehicle, sendCommand, status, toRecord, applyRecords, KNOT };
