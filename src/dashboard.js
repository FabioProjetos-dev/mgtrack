const express = require('express');
const { today, fmtDate } = require('./db');

// Classificação de conectividade (doc §6): Online, Offline ≤24h, ≤36h, >36h.
// Online = comunicou nos últimos 30 minutos.
const HORAS = `((julianday('now','localtime') - julianday(v.ultima_conexao)) * 24)`;
const CONN = `CASE WHEN v.ultima_conexao IS NULL THEN 'off36p'
  WHEN ${HORAS} <= 0.5 THEN 'online' WHEN ${HORAS} <= 24 THEN 'off24' WHEN ${HORAS} <= 36 THEN 'off36' ELSE 'off36p' END`;

function lastMonths(n, end = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const ids = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(Boolean);

function makeDashboard(db) {
  const r = express.Router();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);

  r.get('/dashboard/gestao', (req, res) => {
    const cards = {
      veiculos: one("SELECT COUNT(*) n FROM veiculos WHERE status = 'Ativo'").n,
      comodato: one("SELECT COUNT(*) n FROM pessoas WHERE modalidade = 'Comodato' AND status = 'Ativo'").n,
      plataforma: one("SELECT COUNT(*) n FROM pessoas WHERE modalidade = 'Plataforma' AND status = 'Ativo'").n,
      estoque: one("SELECT COUNT(*) n FROM equipamentos WHERE status = 'Em estoque'").n,
    };
    const conn = { online: 0, off24: 0, off36: 0, off36p: 0 };
    for (const x of all(`SELECT ${CONN} c, COUNT(*) n FROM veiculos v WHERE v.status = 'Ativo' GROUP BY c`)) conn[x.c] = x.n;
    conn.total = Object.values(conn).reduce((a, b) => a + b, 0);

    // Vendas (contratos iniciados no mês) por consultor
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : lastMonths(1)[0];
    const vendas = all(`SELECT COALESCE(c.nome,'Sem consultor') consultor, COUNT(k.id) qtd, COALESCE(SUM(k.valor_mensal),0) valor
      FROM contratos k LEFT JOIN consultores c ON c.id = k.consultor_id
      WHERE substr(k.data_inicio,1,7) = ? GROUP BY consultor ORDER BY qtd DESC`, mes);

    // Ordens de serviço por mês e categoria
    const campo = { criacao: 'data_criacao', agendamento: 'data_agendamento', finalizado: 'data_finalizacao' }[req.query.periodo] || 'data_criacao';
    const months = lastMonths(12);
    const where = [`substr(o.${campo},1,7) >= ?`], p = [months[0]];
    const tec = ids(req.query.tecnicos); if (tec.length) { where.push(`o.tecnico_id IN (${tec.map(() => '?').join(',')})`); p.push(...tec); }
    const cats = ids(req.query.categorias); if (cats.length) { where.push(`o.categoria_id IN (${cats.map(() => '?').join(',')})`); p.push(...cats); }
    const est = parseInt(req.query.estoque, 10); if (est) { where.push('o.estoque_id = ?'); p.push(est); }
    const sts = String(req.query.status || '').split(',').filter(Boolean);
    if (sts.length) { where.push(`o.status IN (${sts.map(() => '?').join(',')})`); p.push(...sts); }
    const osRows = all(`SELECT substr(o.${campo},1,7) mes, c.id cid, c.nome, c.cor, COUNT(*) n FROM ordens_servico o
      JOIN categorias_os c ON c.id = o.categoria_id WHERE ${where.join(' AND ')} GROUP BY mes, c.id`, ...p);
    const series = {};
    for (const c of all('SELECT id, nome, cor FROM categorias_os ORDER BY nome')) series[c.id] = { nome: c.nome, cor: c.cor, data: months.map(() => 0) };
    for (const x of osRows) { const i = months.indexOf(x.mes); if (i >= 0 && series[x.cid]) series[x.cid].data[i] = x.n; }

    // Saúde dos equipamentos
    const excesso = all(`SELECT v.id, v.placa, COUNT(e.id) posicoes FROM veiculos v JOIN eventos e ON e.veiculo_id = v.id
      WHERE substr(e.data,1,10) = ? GROUP BY v.id HAVING posicoes >= 4 ORDER BY posicoes DESC LIMIT 20`, today());
    const travados = all(`SELECT v.id, v.placa, v.ultima_posicao, v.ultima_conexao FROM veiculos v WHERE v.status='Ativo'
      AND ${HORAS} <= 1 AND (julianday('now','localtime') - julianday(v.ultima_posicao)) * 24 > 6 LIMIT 20`);
    const antiga = all(`SELECT v.id, v.placa, v.ultima_posicao, v.ultima_conexao FROM veiculos v WHERE v.status='Ativo'
      AND (v.ultima_posicao IS NULL OR (julianday('now','localtime') - julianday(v.ultima_posicao)) * 24 > 24)
      ORDER BY v.ultima_posicao LIMIT 50`);

    // Aniversariantes
    const m = new Date().getMonth();
    const mm = k => String(((m + k + 12) % 12) + 1).padStart(2, '0');
    const aniv = k => all(`SELECT id, nome, data_nascimento, telefone FROM pessoas WHERE substr(data_nascimento,6,2) = ?
      ORDER BY substr(data_nascimento,9,2)`, mm(k));

    res.json({ cards, conn, mes, vendas, os: { months, series: Object.values(series) },
      saude: { excesso, travados, antiga }, aniversariantes: { passado: aniv(-1), atual: aniv(0), proximo: aniv(1) } });
  });

  r.get('/dashboard/financeiro', (req, res) => {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : lastMonths(1)[0];
    const sum = (t, cond, ...p) => one(`SELECT COALESCE(SUM(valor),0) s, COUNT(*) n FROM ${t} WHERE ${cond}`, ...p);
    const cards = {
      receber: sum('contas_receber', "status != 'Cancelado' AND substr(vencimento,1,7) = ?", mes),
      recebido: one("SELECT COALESCE(SUM(COALESCE(valor_pago,valor)),0) s, COUNT(*) n FROM contas_receber WHERE status='Pago' AND substr(data_pagamento,1,7) = ?", mes),
      pagar: sum('contas_pagar', "status != 'Cancelado' AND substr(vencimento,1,7) = ?", mes),
      pago: one("SELECT COALESCE(SUM(COALESCE(valor_pago,valor)),0) s, COUNT(*) n FROM contas_pagar WHERE status='Pago' AND substr(data_pagamento,1,7) = ?", mes),
      inadimplencia: sum('contas_receber', "status = 'Aberto' AND vencimento < ?", today()),
    };
    const months = lastMonths(12);
    const rec = Object.fromEntries(all("SELECT substr(data_pagamento,1,7) m, SUM(COALESCE(valor_pago,valor)) s FROM contas_receber WHERE status='Pago' GROUP BY m").map(x => [x.m, x.s]));
    const pag = Object.fromEntries(all("SELECT substr(data_pagamento,1,7) m, SUM(COALESCE(valor_pago,valor)) s FROM contas_pagar WHERE status='Pago' GROUP BY m").map(x => [x.m, x.s]));
    const porCategoria = all(`SELECT COALESCE(c.nome,'Sem categoria') nome, SUM(p.valor) s FROM contas_pagar p LEFT JOIN categorias_financeiras c ON c.id = p.categoria_id
      WHERE substr(p.vencimento,1,7) = ? AND p.status != 'Cancelado' GROUP BY nome ORDER BY s DESC`, mes);
    const inadimplentes = all(`SELECT p.id, p.nome, COUNT(r.id) qtd, SUM(r.valor) total, MIN(r.vencimento) desde FROM contas_receber r
      JOIN pessoas p ON p.id = r.pessoa_id WHERE r.status='Aberto' AND r.vencimento < ? GROUP BY p.id ORDER BY total DESC LIMIT 10`, today());
    const proximas = all(`SELECT 'Receber' tipo, descricao, valor, vencimento FROM contas_receber WHERE status='Aberto' AND vencimento >= ?
      UNION ALL SELECT 'Pagar', descricao, valor, vencimento FROM contas_pagar WHERE status='Aberto' AND vencimento >= ? ORDER BY vencimento LIMIT 12`, today(), today());
    res.json({ mes, cards, serie: { months, receitas: months.map(m => rec[m] || 0), despesas: months.map(m => pag[m] || 0) }, porCategoria, inadimplentes, proximas });
  });

  r.get('/dashboard/atendimentos', (req, res) => {
    res.json({
      status: all('SELECT status k, COUNT(*) n FROM atendimentos GROUP BY status'),
      canal: all('SELECT canal k, COUNT(*) n FROM atendimentos GROUP BY canal'),
      prioridade: all("SELECT prioridade k, COUNT(*) n FROM atendimentos WHERE status NOT IN ('Resolvido','Fechado') GROUP BY prioridade"),
      responsaveis: all(`SELECT COALESCE(u.nome,'Sem responsável') k, COUNT(*) n, SUM(a.status IN ('Resolvido','Fechado')) resolvidos
        FROM atendimentos a LEFT JOIN usuarios u ON u.id = a.responsavel_id GROUP BY k ORDER BY n DESC`),
      nps: one(`SELECT COUNT(nota_nps) n, SUM(nota_nps >= 9) prom, SUM(nota_nps <= 6) detr FROM atendimentos WHERE nota_nps IS NOT NULL`),
      tempoMedioH: one(`SELECT AVG((julianday(data_fechamento) - julianday(data_abertura)) * 24) h FROM atendimentos WHERE data_fechamento IS NOT NULL`).h,
    });
  });

  r.get('/header', (req, res) => {
    res.json({
      atendimentos: one("SELECT COUNT(*) n FROM atendimentos WHERE status IN ('Aberto','Em andamento')").n,
      vencidas: one("SELECT COUNT(*) n FROM contas_receber WHERE status='Aberto' AND vencimento < ?", today()).n,
      notificacoes: one("SELECT COUNT(*) n FROM eventos WHERE tratado IS NOT 1 AND data >= datetime('now','localtime','-1 day')").n,
      eventos: all(`SELECT e.id, e.tipo, e.data, v.placa FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
        WHERE e.tratado IS NOT 1 ORDER BY e.data DESC LIMIT 8`),
      novidades: one("SELECT COUNT(*) n FROM novidades WHERE data >= date('now','localtime','-30 day')").n,
      anuncios: all("SELECT id, titulo, mensagem FROM anuncios WHERE ativo = 1 AND (inicio IS NULL OR inicio <= ?) AND (fim IS NULL OR fim >= ?) ORDER BY id DESC LIMIT 3", today(), today()),
    });
  });

  r.get('/monitor', (req, res) => {
    const veiculos = all(`SELECT v.id, v.placa, v.marca, v.modelo, v.tipo, v.lat, v.lng, v.velocidade, v.ignicao, v.bloqueado, v.odometro,
      v.ultima_posicao, v.ultima_conexao, v.grupo_id, ${CONN} conexao, p.nome cliente, m.nome motorista, q.imei, g.nome grupo
      FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN motoristas m ON m.id = v.motorista_id
      LEFT JOIN equipamentos q ON q.id = v.equipamento_id LEFT JOIN grupos_veiculo g ON g.id = v.grupo_id
      WHERE v.status = 'Ativo' ORDER BY v.placa`);
    const cercas = all('SELECT id, nome, lat, lng, raio, cor FROM cercas WHERE lat IS NOT NULL AND lng IS NOT NULL');
    const eventos = all(`SELECT e.id, e.tipo, e.data, e.velocidade, e.descricao, v.placa, e.veiculo_id FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
      WHERE e.tratado IS NOT 1 ORDER BY e.data DESC LIMIT 30`);
    res.json({ veiculos, cercas, eventos, agora: new Date().toISOString() });
  });

  return r;
}

module.exports = { makeDashboard, CONN, HORAS, lastMonths };
