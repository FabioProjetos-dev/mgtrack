const express = require('express');
const { E } = require('./schema');
const { query, one, hashPassword, now, today, nowDate, fmtDate, NOW } = require('./db');
const traccar = require('./traccar');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function entity(key) {
  const e = Object.hasOwn(E, key) ? E[key] : null;
  if (!e) throw new HttpError(404, 'Módulo não encontrado');
  return e;
}

function selectSql(ent) {
  const cols = ['t.id', 't.created_at', 't.updated_at'], joins = [];
  ent.fields.forEach((f, i) => {
    if (f.type === 'password') return;
    cols.push(`t."${f.name}"`);
    if (f.type === 'ref') {
      const r = E[f.ref], a = `j${i}`;
      joins.push(`LEFT JOIN ${f.ref} ${a} ON ${a}.id = t."${f.name}"`);
      cols.push(`${a}."${r.title}"::text AS "${f.name}__label"`);
    }
  });
  return `SELECT ${cols.join(', ')} FROM ${ent.key} t ${joins.join(' ')}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// Normaliza e valida o corpo enviado pelo formulário
function coerce(ent, body, isNew) {
  const out = {};
  for (const f of ent.fields) {
    if (!(f.name in body)) { if (isNew && f.def !== undefined) out[f.name] = f.def; continue; }
    let v = body[f.name];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      switch (f.type) {
        case 'number': case 'money': v = Number(String(v).replace(',', '.')); if (!Number.isFinite(v)) throw new HttpError(400, `${f.label}: número inválido`); break;
        case 'ref': v = parseInt(v, 10) || null; break;
        case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0; break;
        case 'date': v = String(v).slice(0, 10); if (!DATE_RE.test(v)) throw new HttpError(400, `${f.label}: data inválida`); break;
        case 'datetime': v = String(v).replace('T', ' '); if (v.length === 16) v += ':00'; if (!DT_RE.test(v)) throw new HttpError(400, `${f.label}: data/hora inválida`); break;
        case 'password': v = hashPassword(String(v)); break;
        case 'select': if (f.options && !f.options.includes(v)) throw new HttpError(400, `${f.label}: opção inválida`); break;
        default: v = String(v).trim();
      }
    }
    if (f.type === 'password' && v === null) continue; // senha vazia não altera
    out[f.name] = v;
  }
  for (const f of ent.fields) if (f.req && (isNew || f.name in out) && (out[f.name] === null || out[f.name] === undefined))
    throw new HttpError(400, `Campo obrigatório: ${f.label}`);
  return out;
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const r = await one(`INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`, keys.map(k => data[k]));
  return r.id;
}
async function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  await query(`UPDATE ${table} SET ${keys.map(k => `"${k}" = ?`).join(', ')}, updated_at = ${NOW} WHERE id = ?`, [...keys.map(k => data[k]), id]);
}
const raw = (table, id) => one(`SELECT * FROM ${table} WHERE id = ?`, [id]);

async function log(user, acao, entidade, id, detalhes) {
  await query('INSERT INTO logs (data, usuario, acao, entidade, registro_id, detalhes) VALUES (?,?,?,?,?,?)',
    [now(), user?.nome || 'sistema', acao, entidade, id ?? null, detalhes == null ? null : String(detalhes).slice(0, 200)]);
}

// Falha no Traccar não impede salvar o cadastro (o aparelho pode ser ajustado depois no próprio Traccar)
async function traccarSafe(what, fn) {
  if (!traccar.enabled()) return;
  try { await fn(); } catch (e) { console.error(`[traccar ${what}]`, e.message); }
}

// Regras de negócio executadas após gravar (this = req)
const hooks = {
  async ordens_servico(row, isNew) {
    if (isNew && !row.numero) await update('ordens_servico', row.id, { numero: `OS-${String(row.id).padStart(5, '0')}` });
    if (isNew && !row.data_criacao) await update('ordens_servico', row.id, { data_criacao: now() });
    if (row.status !== 'Finalizado') return;
    if (!row.data_finalizacao) await update('ordens_servico', row.id, { data_finalizacao: now() });
    const cat = row.categoria_id && await raw('categorias_os', row.categoria_id);
    const nome = (cat?.nome || '').toLowerCase();
    if (row.equipamento_id && nome.startsWith('instala')) {
      await update('equipamentos', row.equipamento_id, { status: 'Instalado' });
      if (row.veiculo_id) {
        await update('veiculos', row.veiculo_id, { equipamento_id: row.equipamento_id });
        await traccarSafe('veículo', () => traccar.syncVehicle(row.veiculo_id));
      }
    } else if (row.equipamento_id && nome.startsWith('retirada')) {
      await update('equipamentos', row.equipamento_id, { status: 'Retirado', estoque_id: row.estoque_id || null });
      if (row.veiculo_id) await query('UPDATE veiculos SET equipamento_id = NULL WHERE id = ? AND equipamento_id = ?', [row.veiculo_id, row.equipamento_id]);
    }
  },
  async transferencias(row, isNew) {
    if (!isNew) return;
    if (!row.data) await update('transferencias', row.id, { data: today() });
    if (!row.origem_id) await update('transferencias', row.id, { origem_id: (await raw('equipamentos', row.equipamento_id))?.estoque_id ?? null });
    await update('equipamentos', row.equipamento_id, { estoque_id: row.destino_id, status: 'Em estoque' });
  },
  async comandos(row, isNew) {
    if (!isNew) return;
    const upd = { data_envio: row.data_envio || now(), usuario: row.usuario || this.user?.nome };
    // Com o Traccar configurado o comando vai na hora; sem ele, fica "Pendente" para o gateway buscar em /api/integracao/posicoes
    if (traccar.enabled() && row.status === 'Pendente') Object.assign(upd, await traccar.sendCommand(row));
    await update('comandos', row.id, upd);
  },
  async equipamentos(row) { await traccarSafe('equipamento', () => traccar.ensureDevice(row.imei)); },
  async veiculos(row) { if (row.equipamento_id) await traccarSafe('veículo', () => traccar.syncVehicle(row.id)); },
  async atendimentos(row, isNew) {
    if (isNew && !row.protocolo) await update('atendimentos', row.id, { protocolo: `${today().slice(0, 4)}${String(row.id).padStart(6, '0')}` });
    if (isNew && !row.data_abertura) await update('atendimentos', row.id, { data_abertura: now() });
    if (['Resolvido', 'Fechado'].includes(row.status) && !row.data_fechamento) await update('atendimentos', row.id, { data_fechamento: now() });
  },
  async sinistros(row, isNew) { if (isNew && !row.protocolo) await update('sinistros', row.id, { protocolo: `SIN-${String(row.id).padStart(5, '0')}` }); },
  async solicitacoes_assistencia(row, isNew) {
    if (isNew && !row.protocolo) await update('solicitacoes_assistencia', row.id, { protocolo: `AST-${String(row.id).padStart(5, '0')}` });
    if (isNew && !row.data) await update('solicitacoes_assistencia', row.id, { data: now() });
  },
  async contas_receber(row) { if (row.status === 'Pago' && !row.data_pagamento) await update('contas_receber', row.id, { data_pagamento: today(), valor_pago: row.valor_pago ?? row.valor }); },
  async contas_pagar(row) { if (row.status === 'Pago' && !row.data_pagamento) await update('contas_pagar', row.id, { data_pagamento: today(), valor_pago: row.valor_pago ?? row.valor }); },
  async manutencoes(row) {
    if (row.status === 'Realizada' && row.plano_id) await update('planos_manutencao', row.plano_id, { ultima_data: row.data || today(), ultimo_km: row.km ?? null });
  },
  async chats(row, isNew) { if (isNew && !row.data) await update('chats', row.id, { data: now() }); },
  async mensagens(row, isNew) { if (isNew && !row.data) await update('mensagens', row.id, { data: now() }); },
};

const ym = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// Ações específicas por módulo (botões nas linhas da tabela)
const actions = {
  eventos: { async tratar(row, body) { await update('eventos', row.id, { tratado: 1, tratativa: body.input || 'Tratado' }); return 'Evento tratado.'; } },
  contas_receber: {
    async baixar(row) { if (row.status === 'Pago') return 'Conta já está paga.'; await update('contas_receber', row.id, { status: 'Pago', data_pagamento: today(), valor_pago: row.valor }); return 'Baixa registrada.'; },
    async cobranca(row) {
      const id = await insert('cobrancas', { descricao: row.descricao, pessoa_id: row.pessoa_id, conta_receber_id: row.id, valor: row.valor, vencimento: row.vencimento, forma: 'Boleto', status: 'Pendente' });
      return `Cobrança #${id} gerada. Integre um gateway (boleto/Pix) para emitir o documento.`;
    },
    async nota(row) {
      const empresa = await one('SELECT id FROM empresas ORDER BY id LIMIT 1');
      const srv = await one('SELECT id FROM servicos_nfs ORDER BY id LIMIT 1');
      const id = await insert('notas_fiscais', { pessoa_id: row.pessoa_id, empresa_id: empresa?.id ?? null, servico_nfs_id: srv?.id ?? null, conta_receber_id: row.id,
        valor: row.valor, data_emissao: today(), status: 'Rascunho', descricao: row.descricao });
      return `Nota fiscal #${id} criada como rascunho.`;
    },
  },
  contas_pagar: { async baixar(row) { if (row.status === 'Pago') return 'Conta já está paga.'; await update('contas_pagar', row.id, { status: 'Pago', data_pagamento: today(), valor_pago: row.valor }); return 'Pagamento registrado.'; } },
  contas_recorrentes: {
    async gerar(row) {
      const d = nowDate(); const dia = Math.min(Math.max(row.dia_vencimento || 10, 1), 28);
      const vd = new Date(d.getFullYear(), d.getMonth(), dia), venc = fmtDate(vd);
      const table = row.tipo === 'Pagar' ? 'contas_pagar' : 'contas_receber';
      const data = { descricao: `${row.descricao} (${ym(vd)})`, valor: row.valor, vencimento: venc, status: 'Aberto', categoria_id: row.categoria_id };
      if (table === 'contas_receber') data.pessoa_id = row.pessoa_id; else data.fornecedor = row.fornecedor;
      await insert(table, data);
      return `Conta gerada em ${table === 'contas_pagar' ? 'Contas a pagar' : 'Contas a receber'} com vencimento ${venc.split('-').reverse().join('/')}.`;
    },
  },
  contratos: {
    async mensalidades(row) {
      const d = nowDate(); const dia = Math.min(Math.max(row.dia_vencimento || 10, 1), 28);
      let n = 0;
      for (let i = 1; i <= 12; i++) {
        const vd = new Date(d.getFullYear(), d.getMonth() + i, dia), venc = fmtDate(vd);
        if (await one('SELECT 1 x FROM contas_receber WHERE contrato_id = ? AND vencimento = ?', [row.id, venc])) continue;
        await insert('contas_receber', { descricao: `Mensalidade contrato ${row.numero} (${ym(vd)})`, pessoa_id: row.pessoa_id,
          contrato_id: row.id, valor: row.valor_mensal || 0, vencimento: venc, status: 'Aberto' });
        n++;
      }
      return n ? `${n} mensalidade(s) gerada(s) em Contas a receber.` : 'As mensalidades dos próximos 12 meses já existem.';
    },
  },
  notas_fiscais: {
    async emitir(row) {
      if (row.status === 'Emitida') return 'Nota já emitida.';
      const max = (await one(`SELECT MAX(CASE WHEN numero ~ '^[0-9]+$' THEN numero::bigint END) m FROM notas_fiscais`)).m || 0;
      await update('notas_fiscais', row.id, { status: 'Emitida', numero: row.numero || String(max + 1), data_emissao: row.data_emissao || today() });
      return 'Nota marcada como emitida. Integre o webservice NFS-e da prefeitura para transmissão oficial.';
    },
  },
  config_notificacao: {
    async testar(row, body) {
      await insert('mensagens', { canal: row.canal, destinatario: body.input || 'teste', mensagem: 'Mensagem de teste MG-TRACK', data: now(), status: 'Pendente' });
      return 'Teste registrado no histórico (envio real depende da integração com o provedor).';
    },
  },
};

function makeCrud() {
  const r = express.Router();
  const getRow = (ent, id) => one(`${selectSql(ent)} WHERE t.id = ?`, [id]);
  const idParam = v => { const n = parseInt(v, 10); if (!n) throw new HttpError(400, 'ID inválido'); return n; };

  r.get('/meta', (req, res) => res.json(E));

  r.get('/e/:ent', async (req, res) => {
    const ent = entity(req.params.ent);
    const where = [], params = [];
    const q = String(req.query.q || '').trim();
    if (q) { where.push('(' + ent.search.map(c => `t."${c}"::text ILIKE ?`).join(' OR ') + ')'); ent.search.forEach(() => params.push(`%${q}%`)); }
    for (const f of ent.fields) {
      const v = req.query[f.name];
      if (v === undefined || v === '' || f.type === 'password' || typeof v !== 'string') continue;
      if (f.type === 'bool') { where.push(`COALESCE(t."${f.name}",0) = ?`); params.push(['1', 'true'].includes(v) ? 1 : 0); }
      else if (['ref', 'number', 'money'].includes(f.type)) { if (!Number.isFinite(Number(v))) continue; where.push(`t."${f.name}" = ?`); params.push(Number(v)); }
      else { where.push(`t."${f.name}"::text = ?`); params.push(v); }
    }
    if (ent.dateField && DATE_RE.test(req.query.de || '')) { where.push(`t."${ent.dateField}"::date >= ?`); params.push(req.query.de); }
    if (ent.dateField && DATE_RE.test(req.query.ate || '')) { where.push(`t."${ent.dateField}"::date <= ?`); params.push(req.query.ate); }
    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = (await one(`SELECT COUNT(*) n FROM ${ent.key} t${w}`, params)).n;
    let order = (ent.order || 't.id DESC') + ' NULLS LAST, t.id DESC';
    const sf = ent.fields.find(f => f.name === req.query.sort);
    if (sf || req.query.sort === 'id') order = `t."${sf ? sf.name : 'id'}" ${req.query.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, t.id DESC`;
    const limit = req.query.limit === 'all' ? 20000 : Math.min(parseInt(req.query.limit, 10) || 25, 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const rows = await query(`${selectSql(ent)}${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    res.json({ rows, total, page, limit });
  });

  r.get('/e/:ent/:id', async (req, res) => {
    const row = await getRow(entity(req.params.ent), idParam(req.params.id));
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    res.json(row);
  });

  r.post('/e/:ent', async (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const data = coerce(ent, req.body || {}, true);
    const id = await insert(ent.key, data);
    await hooks[ent.key]?.call(req, await raw(ent.key, id), true);
    await log(req.user, 'Inclusão', ent.plural, id, data[ent.title]);
    res.status(201).json(await getRow(ent, id));
  });

  r.put('/e/:ent/:id', async (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const id = idParam(req.params.id);
    if (!await raw(ent.key, id)) throw new HttpError(404, 'Registro não encontrado');
    await update(ent.key, id, coerce(ent, req.body || {}, false));
    const after = await raw(ent.key, id);
    await hooks[ent.key]?.call(req, after, false);
    await log(req.user, 'Alteração', ent.plural, id, after[ent.title]);
    res.json(await getRow(ent, id));
  });

  r.delete('/e/:ent/:id', async (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const id = idParam(req.params.id);
    if (ent.key === 'usuarios' && id === req.user.id) throw new HttpError(400, 'Você não pode excluir o próprio usuário');
    const before = await raw(ent.key, id);
    if (!before) throw new HttpError(404, 'Registro não encontrado');
    await query(`DELETE FROM ${ent.key} WHERE id = ?`, [id]);
    if (ent.key === 'usuarios') await query('DELETE FROM sessoes WHERE usuario_id = ?', [id]);
    await log(req.user, 'Exclusão', ent.plural, id, before[ent.title]);
    res.json({ ok: true });
  });

  r.get('/options/:ent', async (req, res) => {
    const ent = entity(req.params.ent);
    res.json(await query(`SELECT id, "${ent.title}"::text AS label FROM ${ent.key} ORDER BY "${ent.title}" LIMIT 5000`));
  });

  r.post('/action/:ent/:id/:action', async (req, res) => {
    const ent = entity(req.params.ent);
    const fn = Object.hasOwn(actions, ent.key) && Object.hasOwn(actions[ent.key], req.params.action) ? actions[ent.key][req.params.action] : null;
    if (!fn) throw new HttpError(404, 'Ação não encontrada');
    const row = await raw(ent.key, idParam(req.params.id));
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    const message = await fn.call(req, row, req.body || {});
    await log(req.user, `Ação: ${req.params.action}`, ent.plural, row.id, row[ent.title]);
    res.json({ ok: true, message });
  });

  return r;
}

module.exports = { makeCrud, HttpError, selectSql, insert, update, log };
