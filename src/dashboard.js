const express = require('express');
const { query, one, today, nowDate, NOW, TODAY } = require('./db');

// Classificação de conectividade (doc §6): Online, Offline ≤24h, ≤36h, >36h.
// Online = comunicou nos últimos 30 minutos.
const HORAS = `(EXTRACT(EPOCH FROM (${NOW} - v.ultima_conexao)) / 3600.0)`;
const CONN = `CASE WHEN v.ultima_conexao IS NULL THEN 'off36p'
  WHEN ${HORAS} <= 0.5 THEN 'online' WHEN ${HORAS} <= 24 THEN 'off24' WHEN ${HORAS} <= 36 THEN 'off36' ELSE 'off36p' END`;
const HORAS_POS = `(EXTRACT(EPOCH FROM (${NOW} - v.ultima_posicao)) / 3600.0)`;

function lastMonths(n) {
  const end = nowDate(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const ids = s => String(s || '').split(',').map(x => parseInt(x, 10)).filter(Boolean);
const ph = arr => arr.map(() => '?').join(',');
const validMonth = m => (/^\d{4}-\d{2}$/.test(m || '') ? m : lastMonths(1)[0]);

function makeDashboard() {
  const r = express.Router();

  r.get('/dashboard/gestao', async (req, res) => {
    const [veic, comodato, plataforma, estoque] = await Promise.all([
      one("SELECT COUNT(*) n FROM veiculos WHERE status = 'Ativo'"),
      one("SELECT COUNT(*) n FROM pessoas WHERE modalidade = 'Comodato' AND status = 'Ativo'"),
      one("SELECT COUNT(*) n FROM pessoas WHERE modalidade = 'Plataforma' AND status = 'Ativo'"),
      one("SELECT COUNT(*) n FROM equipamentos WHERE status = 'Em estoque'"),
    ]);
    const cards = { veiculos: veic.n, comodato: comodato.n, plataforma: plataforma.n, estoque: estoque.n };
    const conn = { online: 0, off24: 0, off36: 0, off36p: 0 };
    for (const x of await query(`SELECT ${CONN} c, COUNT(*) n FROM veiculos v WHERE v.status = 'Ativo' GROUP BY 1`)) conn[x.c] = x.n;
    conn.total = Object.values(conn).reduce((a, b) => a + b, 0);

    // Vendas (contratos iniciados no mês) por consultor
    const mes = validMonth(req.query.mes);
    const vendas = await query(`SELECT COALESCE(c.nome,'Sem consultor') consultor, COUNT(k.id) qtd, COALESCE(SUM(k.valor_mensal),0) valor
      FROM contratos k LEFT JOIN consultores c ON c.id = k.consultor_id
      WHERE to_char(k.data_inicio,'YYYY-MM') = ? GROUP BY 1 ORDER BY 2 DESC`, [mes]);

    // Ordens de serviço por mês e categoria
    const campo = { criacao: 'data_criacao', agendamento: 'data_agendamento', finalizado: 'data_finalizacao' }[req.query.periodo] || 'data_criacao';
    const months = lastMonths(12);
    const where = [`o.${campo} >= ?::date`], p = [months[0] + '-01'];
    const tec = ids(req.query.tecnicos); if (tec.length) { where.push(`o.tecnico_id IN (${ph(tec)})`); p.push(...tec); }
    const cats = ids(req.query.categorias); if (cats.length) { where.push(`o.categoria_id IN (${ph(cats)})`); p.push(...cats); }
    const est = parseInt(req.query.estoque, 10); if (est) { where.push('o.estoque_id = ?'); p.push(est); }
    const sts = String(req.query.status || '').split(',').filter(Boolean);
    if (sts.length) { where.push(`o.status IN (${ph(sts)})`); p.push(...sts); }
    const osRows = await query(`SELECT to_char(o.${campo},'YYYY-MM') mes, o.categoria_id cid, COUNT(*) n FROM ordens_servico o
      WHERE ${where.join(' AND ')} GROUP BY 1, 2`, p);
    const series = {};
    for (const c of await query('SELECT id, nome, cor FROM categorias_os ORDER BY nome')) series[c.id] = { nome: c.nome, cor: c.cor, data: months.map(() => 0) };
    for (const x of osRows) { const i = months.indexOf(x.mes); if (i >= 0 && series[x.cid]) series[x.cid].data[i] = x.n; }

    // Saúde dos equipamentos
    const [excesso, travados, antiga] = await Promise.all([
      query(`SELECT v.id, v.placa, COUNT(e.id) posicoes FROM veiculos v JOIN eventos e ON e.veiculo_id = v.id
        WHERE e.data::date = ${TODAY} GROUP BY v.id HAVING COUNT(e.id) >= 4 ORDER BY 3 DESC LIMIT 20`),
      query(`SELECT v.id, v.placa, v.ultima_posicao, v.ultima_conexao FROM veiculos v WHERE v.status='Ativo'
        AND ${HORAS} <= 1 AND ${HORAS_POS} > 6 LIMIT 20`),
      query(`SELECT v.id, v.placa, v.ultima_posicao, v.ultima_conexao FROM veiculos v WHERE v.status='Ativo'
        AND v.equipamento_id IS NOT NULL AND (v.ultima_posicao IS NULL OR ${HORAS_POS} > 24) ORDER BY v.ultima_posicao NULLS FIRST LIMIT 50`),
    ]);

    // Aniversariantes
    const m = nowDate().getMonth();
    const aniv = k => query(`SELECT id, nome, data_nascimento, telefone FROM pessoas WHERE EXTRACT(MONTH FROM data_nascimento) = ?
      ORDER BY EXTRACT(DAY FROM data_nascimento)`, [((m + k + 12) % 12) + 1]);
    const [passado, atual, proximo] = await Promise.all([aniv(-1), aniv(0), aniv(1)]);

    res.json({ cards, conn, mes, vendas, os: { months, series: Object.values(series) },
      saude: { excesso, travados, antiga }, aniversariantes: { passado, atual, proximo } });
  });

  r.get('/dashboard/financeiro', async (req, res) => {
    const mes = validMonth(req.query.mes);
    const sum = (t, cond, p) => one(`SELECT COALESCE(SUM(valor),0) s, COUNT(*) n FROM ${t} WHERE ${cond}`, p);
    const pago = t => one(`SELECT COALESCE(SUM(COALESCE(valor_pago,valor)),0) s, COUNT(*) n FROM ${t} WHERE status='Pago' AND to_char(data_pagamento,'YYYY-MM') = ?`, [mes]);
    const [receber, recebido, pagar, pagoM, inadimplencia] = await Promise.all([
      sum('contas_receber', "status != 'Cancelado' AND to_char(vencimento,'YYYY-MM') = ?", [mes]), pago('contas_receber'),
      sum('contas_pagar', "status != 'Cancelado' AND to_char(vencimento,'YYYY-MM') = ?", [mes]), pago('contas_pagar'),
      sum('contas_receber', `status = 'Aberto' AND vencimento < ${TODAY}`, []),
    ]);
    const months = lastMonths(12);
    const serie = async t => Object.fromEntries((await query(`SELECT to_char(data_pagamento,'YYYY-MM') m, SUM(COALESCE(valor_pago,valor)) s FROM ${t}
      WHERE status='Pago' AND data_pagamento >= ?::date GROUP BY 1`, [months[0] + '-01'])).map(x => [x.m, x.s]));
    const [rec, pag, porCategoria, inadimplentes, proximas] = await Promise.all([serie('contas_receber'), serie('contas_pagar'),
      query(`SELECT COALESCE(c.nome,'Sem categoria') nome, SUM(p.valor) s FROM contas_pagar p LEFT JOIN categorias_financeiras c ON c.id = p.categoria_id
        WHERE to_char(p.vencimento,'YYYY-MM') = ? AND p.status != 'Cancelado' GROUP BY 1 ORDER BY 2 DESC`, [mes]),
      query(`SELECT p.id, p.nome, COUNT(r.id) qtd, SUM(r.valor) total, MIN(r.vencimento) desde FROM contas_receber r
        JOIN pessoas p ON p.id = r.pessoa_id WHERE r.status='Aberto' AND r.vencimento < ${TODAY} GROUP BY p.id ORDER BY total DESC LIMIT 10`),
      query(`SELECT 'Receber' tipo, descricao, valor, vencimento FROM contas_receber WHERE status='Aberto' AND vencimento >= ${TODAY}
        UNION ALL SELECT 'Pagar', descricao, valor, vencimento FROM contas_pagar WHERE status='Aberto' AND vencimento >= ${TODAY} ORDER BY vencimento LIMIT 12`),
    ]);
    res.json({ mes, cards: { receber, recebido, pagar, pago: pagoM, inadimplencia },
      serie: { months, receitas: months.map(m => rec[m] || 0), despesas: months.map(m => pag[m] || 0) }, porCategoria, inadimplentes, proximas });
  });

  r.get('/dashboard/atendimentos', async (req, res) => {
    const FECH = "a.status IN ('Resolvido','Fechado')";
    const [status, canal, prioridade, responsaveis, nps, tempo] = await Promise.all([
      query("SELECT COALESCE(status,'—') k, COUNT(*) n FROM atendimentos GROUP BY 1"),
      query("SELECT COALESCE(canal,'Não informado') k, COUNT(*) n FROM atendimentos GROUP BY 1"),
      query("SELECT prioridade k, COUNT(*) n FROM atendimentos WHERE status NOT IN ('Resolvido','Fechado') GROUP BY 1"),
      query(`SELECT COALESCE(u.nome,'Sem responsável') k, COUNT(*) n, COUNT(*) FILTER (WHERE ${FECH}) resolvidos
        FROM atendimentos a LEFT JOIN usuarios u ON u.id = a.responsavel_id GROUP BY 1 ORDER BY 2 DESC`),
      one(`SELECT COUNT(nota_nps) n, COUNT(*) FILTER (WHERE nota_nps >= 9) prom, COUNT(*) FILTER (WHERE nota_nps <= 6) detr FROM atendimentos WHERE nota_nps IS NOT NULL`),
      one(`SELECT AVG(EXTRACT(EPOCH FROM (data_fechamento - data_abertura)) / 3600.0) h FROM atendimentos WHERE data_fechamento IS NOT NULL AND data_abertura IS NOT NULL`),
    ]);
    res.json({ status, canal, prioridade, responsaveis, nps, tempoMedioH: tempo.h });
  });

  r.get('/header', async (req, res) => {
    const [at, venc, notif, eventos, nov, anuncios] = await Promise.all([
      one("SELECT COUNT(*) n FROM atendimentos WHERE status IN ('Aberto','Em andamento')"),
      one(`SELECT COUNT(*) n FROM contas_receber WHERE status='Aberto' AND vencimento < ${TODAY}`),
      one(`SELECT COUNT(*) n FROM eventos WHERE tratado IS DISTINCT FROM 1 AND data >= ${NOW} - interval '1 day'`),
      query(`SELECT e.id, e.tipo, e.data, v.placa FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
        WHERE e.tratado IS DISTINCT FROM 1 ORDER BY e.data DESC NULLS LAST LIMIT 8`),
      one(`SELECT COUNT(*) n FROM novidades WHERE data >= ${TODAY} - 30`),
      query(`SELECT id, titulo, mensagem FROM anuncios WHERE ativo = 1 AND (inicio IS NULL OR inicio <= ${TODAY}) AND (fim IS NULL OR fim >= ${TODAY}) ORDER BY id DESC LIMIT 3`),
    ]);
    res.json({ atendimentos: at.n, vencidas: venc.n, notificacoes: notif.n, eventos, novidades: nov.n, anuncios });
  });

  r.get('/monitor', async (req, res) => {
    const [veiculos, cercas, eventos] = await Promise.all([
      query(`SELECT v.id, v.placa, v.marca, v.modelo, v.tipo, v.lat, v.lng, v.velocidade, v.ignicao, v.bloqueado, v.odometro,
        v.ultima_posicao, v.ultima_conexao, v.grupo_id, ${CONN} conexao, p.nome cliente, m.nome motorista, q.imei, g.nome grupo
        FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN motoristas m ON m.id = v.motorista_id
        LEFT JOIN equipamentos q ON q.id = v.equipamento_id LEFT JOIN grupos_veiculo g ON g.id = v.grupo_id
        WHERE v.status = 'Ativo' ORDER BY v.placa`),
      query('SELECT id, nome, lat, lng, raio, cor FROM cercas WHERE lat IS NOT NULL AND lng IS NOT NULL'),
      query(`SELECT e.id, e.tipo, e.data, e.velocidade, e.descricao, v.placa, e.veiculo_id FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
        WHERE e.tratado IS DISTINCT FROM 1 ORDER BY e.data DESC NULLS LAST LIMIT 30`),
    ]);
    res.json({ veiculos, cercas, eventos });
  });

  return r;
}

module.exports = { makeDashboard, CONN, HORAS, lastMonths };
