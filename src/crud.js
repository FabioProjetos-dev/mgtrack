const express = require('express');
const { E } = require('./schema');
const { hashPassword, now, today, fmtDate } = require('./db');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function entity(key) {
  const e = E[key];
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
      cols.push(`${a}."${r.title}" AS "${f.name}__label"`);
    }
  });
  return `SELECT ${cols.join(', ')} FROM ${ent.key} t ${joins.join(' ')}`;
}

// Normaliza e valida o corpo enviado pelo formulário
function coerce(ent, body, isNew) {
  const out = {};
  for (const f of ent.fields) {
    if (!(f.name in body)) { if (isNew && f.def !== undefined) out[f.name] = f.def; continue; }
    let v = body[f.name];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      switch (f.type) {
        case 'number': case 'money': v = Number(String(v).replace(',', '.')); if (Number.isNaN(v)) throw new HttpError(400, `${f.label}: número inválido`); break;
        case 'ref': v = parseInt(v, 10) || null; break;
        case 'bool': v = v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0; break;
        case 'datetime': v = String(v).replace('T', ' '); if (v.length === 16) v += ':00'; break;
        case 'password': v = hashPassword(String(v)); break;
        case 'select': if (f.options && !f.options.includes(v)) throw new HttpError(400, `${f.label}: opção inválida`); break;
        default: v = String(v).trim();
      }
    }
    if (f.type === 'password' && v === null) continue; // senha vazia não altera
    out[f.name] = v;
  }
  if (isNew) for (const f of ent.fields) if (f.req && (out[f.name] === null || out[f.name] === undefined))
    throw new HttpError(400, `Campo obrigatório: ${f.label}`);
  if (!isNew) for (const f of ent.fields) if (f.req && f.name in out && out[f.name] === null)
    throw new HttpError(400, `Campo obrigatório: ${f.label}`);
  return out;
}

function makeCrud(db) {
  const r = express.Router();
  const getRow = (ent, id) => db.prepare(`${selectSql(ent)} WHERE t.id = ?`).get(id);
  const raw = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

  function log(req, acao, ent, id, detalhes) {
    db.prepare('INSERT INTO logs (data, usuario, acao, entidade, registro_id, detalhes) VALUES (?,?,?,?,?,?)')
      .run(now(), req.user?.nome || 'sistema', acao, ent.plural, id ?? null, detalhes == null ? null : String(detalhes).slice(0, 200));
  }

  function insert(table, data) {
    const keys = Object.keys(data);
    const res = db.prepare(`INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map(k => data[k]));
    return Number(res.lastInsertRowid);
  }
  function update(table, id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return;
    db.prepare(`UPDATE ${table} SET ${keys.map(k => `"${k}" = ?`).join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(...keys.map(k => data[k]), id);
  }

  // Regras de negócio executadas após gravar
  const hooks = {
    ordens_servico(row, isNew) {
      if (isNew && !row.numero) update('ordens_servico', row.id, { numero: `OS-${String(row.id).padStart(5, '0')}` });
      if (isNew && !row.data_criacao) update('ordens_servico', row.id, { data_criacao: now() });
      if (row.status === 'Finalizado') {
        if (!row.data_finalizacao) update('ordens_servico', row.id, { data_finalizacao: now() });
        const cat = row.categoria_id && raw('categorias_os', row.categoria_id);
        const nome = (cat?.nome || '').toLowerCase();
        if (row.equipamento_id && nome.startsWith('instala')) {
          update('equipamentos', row.equipamento_id, { status: 'Instalado' });
          if (row.veiculo_id) update('veiculos', row.veiculo_id, { equipamento_id: row.equipamento_id });
        } else if (row.equipamento_id && nome.startsWith('retirada')) {
          update('equipamentos', row.equipamento_id, { status: 'Retirado', estoque_id: row.estoque_id || null });
          if (row.veiculo_id) db.prepare('UPDATE veiculos SET equipamento_id = NULL WHERE id = ? AND equipamento_id = ?').run(row.veiculo_id, row.equipamento_id);
        }
      }
    },
    transferencias(row, isNew) {
      if (!isNew) return;
      if (!row.data) update('transferencias', row.id, { data: today() });
      if (!row.origem_id) update('transferencias', row.id, { origem_id: raw('equipamentos', row.equipamento_id)?.estoque_id ?? null });
      update('equipamentos', row.equipamento_id, { estoque_id: row.destino_id, status: 'Em estoque' });
    },
    comandos(row, isNew) {
      if (isNew) update('comandos', row.id, { data_envio: row.data_envio || now(), usuario: row.usuario || this.user?.nome });
    },
    atendimentos(row, isNew) {
      if (isNew && !row.protocolo) update('atendimentos', row.id, { protocolo: `${new Date().getFullYear()}${String(row.id).padStart(6, '0')}` });
      if (isNew && !row.data_abertura) update('atendimentos', row.id, { data_abertura: now() });
      if (['Resolvido', 'Fechado'].includes(row.status) && !row.data_fechamento) update('atendimentos', row.id, { data_fechamento: now() });
    },
    sinistros(row, isNew) { if (isNew && !row.protocolo) update('sinistros', row.id, { protocolo: `SIN-${String(row.id).padStart(5, '0')}` }); },
    solicitacoes_assistencia(row, isNew) {
      if (isNew && !row.protocolo) update('solicitacoes_assistencia', row.id, { protocolo: `AST-${String(row.id).padStart(5, '0')}` });
      if (isNew && !row.data) update('solicitacoes_assistencia', row.id, { data: now() });
    },
    contas_receber(row) { if (row.status === 'Pago' && !row.data_pagamento) update('contas_receber', row.id, { data_pagamento: today(), valor_pago: row.valor_pago ?? row.valor }); },
    contas_pagar(row) { if (row.status === 'Pago' && !row.data_pagamento) update('contas_pagar', row.id, { data_pagamento: today(), valor_pago: row.valor_pago ?? row.valor }); },
    manutencoes(row) {
      if (row.status === 'Realizada' && row.plano_id) update('planos_manutencao', row.plano_id, { ultima_data: row.data || today(), ultimo_km: row.km ?? null });
    },
  };

  // Ações específicas por módulo (botões nas linhas da tabela)
  const actions = {
    eventos: { tratar(row, body) { update('eventos', row.id, { tratado: 1, tratativa: body.input || 'Tratado' }); return 'Evento tratado.'; } },
    contas_receber: {
      baixar(row) { if (row.status === 'Pago') return 'Conta já está paga.'; update('contas_receber', row.id, { status: 'Pago', data_pagamento: today(), valor_pago: row.valor }); return 'Baixa registrada.'; },
      cobranca(row) {
        const id = insert('cobrancas', { descricao: row.descricao, pessoa_id: row.pessoa_id, conta_receber_id: row.id, valor: row.valor, vencimento: row.vencimento,
          forma: 'Boleto', status: 'Pendente', linha_digitavel: fakeBarcode(row.id, row.valor) });
        return `Cobrança #${id} gerada.`;
      },
      nota(row) {
        const empresa = db.prepare('SELECT id FROM empresas ORDER BY id LIMIT 1').get();
        const srv = db.prepare('SELECT id FROM servicos_nfs ORDER BY id LIMIT 1').get();
        const id = insert('notas_fiscais', { pessoa_id: row.pessoa_id, empresa_id: empresa?.id ?? null, servico_nfs_id: srv?.id ?? null, conta_receber_id: row.id,
          valor: row.valor, data_emissao: today(), status: 'Rascunho', descricao: row.descricao });
        return `Nota fiscal #${id} criada como rascunho.`;
      },
    },
    contas_pagar: { baixar(row) { if (row.status === 'Pago') return 'Conta já está paga.'; update('contas_pagar', row.id, { status: 'Pago', data_pagamento: today(), valor_pago: row.valor }); return 'Pagamento registrado.'; } },
    contas_recorrentes: {
      gerar(row) {
        const d = new Date(); const dia = Math.min(Math.max(row.dia_vencimento || 10, 1), 28);
        const venc = fmtDate(new Date(d.getFullYear(), d.getMonth(), dia));
        const table = row.tipo === 'Pagar' ? 'contas_pagar' : 'contas_receber';
        const data = { descricao: `${row.descricao} (${venc.slice(5, 7)}/${venc.slice(0, 4)})`, valor: row.valor, vencimento: venc, status: 'Aberto', categoria_id: row.categoria_id };
        if (table === 'contas_receber') data.pessoa_id = row.pessoa_id; else data.fornecedor = row.fornecedor;
        insert(table, data);
        return `Conta gerada em ${table === 'contas_pagar' ? 'Contas a pagar' : 'Contas a receber'} com vencimento ${venc.split('-').reverse().join('/')}.`;
      },
    },
    contratos: {
      mensalidades(row) {
        const d = new Date(); const dia = Math.min(Math.max(row.dia_vencimento || 10, 1), 28);
        let n = 0;
        for (let i = 1; i <= 12; i++) {
          const venc = fmtDate(new Date(d.getFullYear(), d.getMonth() + i, dia));
          const exists = db.prepare('SELECT 1 FROM contas_receber WHERE contrato_id = ? AND vencimento = ?').get(row.id, venc);
          if (exists) continue;
          insert('contas_receber', { descricao: `Mensalidade contrato ${row.numero} (${venc.slice(5, 7)}/${venc.slice(0, 4)})`, pessoa_id: row.pessoa_id,
            contrato_id: row.id, valor: row.valor_mensal || 0, vencimento: venc, status: 'Aberto' });
          n++;
        }
        return n ? `${n} mensalidade(s) gerada(s) em Contas a receber.` : 'As mensalidades dos próximos 12 meses já existem.';
      },
    },
    notas_fiscais: {
      emitir(row) {
        if (row.status === 'Emitida') return 'Nota já emitida.';
        const max = db.prepare("SELECT MAX(CAST(numero AS INTEGER)) m FROM notas_fiscais").get().m || 1000;
        update('notas_fiscais', row.id, { status: 'Emitida', numero: row.numero || String(max + 1), data_emissao: row.data_emissao || today() });
        return 'Nota fiscal emitida (ambiente de homologação).';
      },
    },
    config_notificacao: {
      testar(row, body) {
        insert('mensagens', { canal: row.canal, destinatario: body.input || 'teste', mensagem: 'Mensagem de teste MG-TRACK', data: now(), status: row.ativo ? 'Enviada' : 'Falhou' });
        return row.ativo ? 'Mensagem de teste registrada no histórico.' : 'Canal inativo: envio registrado como falha.';
      },
    },
  };

  r.get('/meta', (req, res) => res.json(E));

  r.get('/e/:ent', (req, res) => {
    const ent = entity(req.params.ent);
    const where = [], params = [];
    const q = String(req.query.q || '').trim();
    if (q) { where.push('(' + ent.search.map(c => `t."${c}" LIKE ?`).join(' OR ') + ')'); ent.search.forEach(() => params.push(`%${q}%`)); }
    for (const f of ent.fields) {
      if (req.query[f.name] === undefined || req.query[f.name] === '' || f.type === 'password') continue;
      where.push(`t."${f.name}" = ?`);
      params.push(f.type === 'bool' ? (['1', 'true'].includes(String(req.query[f.name])) ? 1 : 0) : req.query[f.name]);
    }
    if (ent.dateField && req.query.de) { where.push(`substr(t."${ent.dateField}",1,10) >= ?`); params.push(req.query.de); }
    if (ent.dateField && req.query.ate) { where.push(`substr(t."${ent.dateField}",1,10) <= ?`); params.push(req.query.ate); }
    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM ${ent.key} t${w}`).get(...params).n;
    let order = ent.order || 't.id DESC';
    const sf = ent.fields.find(f => f.name === req.query.sort);
    if (sf || req.query.sort === 'id') order = `t."${sf ? sf.name : 'id'}" ${req.query.dir === 'asc' ? 'ASC' : 'DESC'}`;
    const limit = req.query.limit === 'all' ? 20000 : Math.min(parseInt(req.query.limit, 10) || 25, 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const rows = db.prepare(`${selectSql(ent)}${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
    res.json({ rows, total, page, limit });
  });

  r.get('/e/:ent/:id', (req, res) => {
    const row = getRow(entity(req.params.ent), req.params.id);
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    res.json(row);
  });

  r.post('/e/:ent', (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const data = coerce(ent, req.body || {}, true);
    const id = insert(ent.key, data);
    hooks[ent.key]?.call(req, raw(ent.key, id), true);
    log(req, 'Inclusão', ent, id, data[ent.title]);
    res.status(201).json(getRow(ent, id));
  });

  r.put('/e/:ent/:id', (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const id = parseInt(req.params.id, 10);
    if (!raw(ent.key, id)) throw new HttpError(404, 'Registro não encontrado');
    update(ent.key, id, coerce(ent, req.body || {}, false));
    const after = raw(ent.key, id);
    hooks[ent.key]?.call(req, after, false);
    log(req, 'Alteração', ent, id, after[ent.title]);
    res.json(getRow(ent, id));
  });

  r.delete('/e/:ent/:id', (req, res) => {
    const ent = entity(req.params.ent);
    if (ent.readonly) throw new HttpError(403, 'Módulo somente leitura');
    const id = parseInt(req.params.id, 10);
    if (ent.key === 'usuarios' && id === req.user.id) throw new HttpError(400, 'Você não pode excluir o próprio usuário');
    const before = raw(ent.key, id);
    if (!before) throw new HttpError(404, 'Registro não encontrado');
    db.prepare(`DELETE FROM ${ent.key} WHERE id = ?`).run(id);
    log(req, 'Exclusão', ent, id, before[ent.title]);
    res.json({ ok: true });
  });

  r.get('/options/:ent', (req, res) => {
    const ent = entity(req.params.ent);
    res.json(db.prepare(`SELECT id, "${ent.title}" AS label FROM ${ent.key} ORDER BY "${ent.title}" LIMIT 5000`).all());
  });

  r.post('/action/:ent/:id/:action', (req, res) => {
    const ent = entity(req.params.ent);
    const fn = actions[ent.key]?.[req.params.action];
    if (!fn) throw new HttpError(404, 'Ação não encontrada');
    const row = raw(ent.key, parseInt(req.params.id, 10));
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    const message = fn.call(req, row, req.body || {});
    log(req, `Ação: ${req.params.action}`, ent, row.id, row[ent.title]);
    res.json({ ok: true, message });
  });

  return { router: r, insert, update };
}

function fakeBarcode(id, valor) {
  const v = String(Math.round((valor || 0) * 100)).padStart(10, '0');
  return `34191.79001 ${String(id).padStart(5, '0')}.000000 00000.000000 1 0000${v}`;
}

module.exports = { makeCrud, HttpError, selectSql };
