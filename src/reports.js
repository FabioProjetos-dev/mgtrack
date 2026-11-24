const express = require('express');
const { today, fmtDate } = require('./db');
const { CONN, HORAS } = require('./dashboard');
const { HttpError } = require('./crud');

// Cada relatório: título, colunas [chave, rótulo, tipo], se usa período, e a consulta.
// tipos: text | date | datetime | money | number | bool | km
function defs(db) {
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const like = q => `%${q || ''}%`;
  const offline = (min, max) => ({ q }) => all(`SELECT v.placa, v.marca || ' ' || COALESCE(v.modelo,'') veiculo, p.nome cliente, p.telefone, q.imei,
      v.ultima_conexao, ROUND(${HORAS},1) horas FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN equipamentos q ON q.id = v.equipamento_id
      WHERE v.status='Ativo' AND ${min === null ? '1' : `${HORAS} > ${min}`} AND ${max === null ? '1' : `${HORAS} <= ${max}`}
      AND (v.placa LIKE ? OR p.nome LIKE ?) ORDER BY v.ultima_conexao DESC`, like(q), like(q));
  const offCols = [['placa','Placa'],['veiculo','Veículo'],['cliente','Cliente'],['telefone','Telefone'],['imei','IMEI'],['ultima_conexao','Última conexão','datetime'],['horas','Horas offline','number']];
  const ev = tipos => ({ de, ate, q }) => all(`SELECT e.data, v.placa, e.tipo, e.velocidade, v.limite_velocidade limite, e.descricao, e.tratado, e.tratativa
      FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id WHERE substr(e.data,1,10) BETWEEN ? AND ?
      ${tipos ? `AND e.tipo IN (${tipos.map(t => `'${t}'`).join(',')})` : ''} AND (v.placa LIKE ? OR e.tipo LIKE ?) ORDER BY e.data DESC`, de, ate, like(q), like(q));
  const evCols = [['data','Data/hora','datetime'],['placa','Veículo'],['tipo','Evento'],['velocidade','Velocidade','number'],['descricao','Descrição'],['tratado','Tratado','bool']];

  return {
    'rotas': { title: 'Rotas por ignição', periodo: true,
      cols: [['inicio','Ignição ligada','datetime'],['fim','Ignição desligada','datetime'],['placa','Veículo'],['motorista','Motorista'],['origem','Origem'],['destino','Destino'],['km','Distância','km'],['vel_max','Vel. máx.','number']],
      run: ({ de, ate, q }) => all(`SELECT t.*, v.placa, m.nome motorista FROM viagens t JOIN veiculos v ON v.id = t.veiculo_id LEFT JOIN motoristas m ON m.id = t.motorista_id
        WHERE substr(t.inicio,1,10) BETWEEN ? AND ? AND v.placa LIKE ? ORDER BY t.inicio DESC`, de, ate, like(q)) },
    'km-veiculos': { title: 'Percurso e motorista', periodo: true,
      cols: [['placa','Veículo'],['motorista','Motorista'],['viagens','Viagens','number'],['km','Distância','km'],['horas','Horas em movimento','number'],['vel_max','Vel. máx.','number']],
      run: ({ de, ate, q }) => all(`SELECT v.placa, COALESCE(m.nome,'Não identificado') motorista, COUNT(*) viagens, ROUND(SUM(t.km),1) km,
        ROUND(SUM((julianday(t.fim)-julianday(t.inicio))*24),1) horas, MAX(t.vel_max) vel_max FROM viagens t JOIN veiculos v ON v.id = t.veiculo_id
        LEFT JOIN motoristas m ON m.id = t.motorista_id WHERE substr(t.inicio,1,10) BETWEEN ? AND ? AND (v.placa LIKE ? OR m.nome LIKE ?)
        GROUP BY v.id, m.id ORDER BY km DESC`, de, ate, like(q), like(q)) },
    'km-dia': { title: 'Estatísticas por veículo', periodo: true,
      cols: [['placa','Veículo'],['cliente','Cliente'],['viagens','Viagens','number'],['km','Distância','km'],['vel_max','Vel. máx.','number'],['vel_media','Vel. média','number'],['paradas','Paradas','number'],['eventos','Eventos','number']],
      run: ({ de, ate, q }) => all(`SELECT v.placa, p.nome cliente, COUNT(t.id) viagens, ROUND(COALESCE(SUM(t.km),0),1) km, MAX(t.vel_max) vel_max, ROUND(AVG(t.vel_media),1) vel_media,
        COALESCE(SUM(t.paradas),0) paradas, (SELECT COUNT(*) FROM eventos e WHERE e.veiculo_id = v.id AND substr(e.data,1,10) BETWEEN ? AND ?) eventos
        FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN viagens t ON t.veiculo_id = v.id AND substr(t.inicio,1,10) BETWEEN ? AND ?
        WHERE v.placa LIKE ? GROUP BY v.id ORDER BY km DESC`, de, ate, de, ate, like(q)) },
    'estatistica-cliente': { title: 'Estatísticas por cliente', periodo: true,
      cols: [['cliente','Cliente'],['modalidade','Modalidade'],['veiculos','Veículos','number'],['online','Online','number'],['km','Km no período','km'],['contratos','Contratos ativos','number'],['mensal','Receita mensal','money']],
      run: ({ de, ate, q }) => all(`SELECT p.nome cliente, p.modalidade,
        (SELECT COUNT(*) FROM veiculos v WHERE v.pessoa_id = p.id) veiculos,
        (SELECT COUNT(*) FROM veiculos v WHERE v.pessoa_id = p.id AND ${CONN} = 'online') online,
        (SELECT ROUND(COALESCE(SUM(t.km),0),1) FROM viagens t JOIN veiculos v ON v.id = t.veiculo_id WHERE v.pessoa_id = p.id AND substr(t.inicio,1,10) BETWEEN ? AND ?) km,
        (SELECT COUNT(*) FROM contratos k WHERE k.pessoa_id = p.id AND k.status='Ativo') contratos,
        (SELECT COALESCE(SUM(valor_mensal),0) FROM contratos k WHERE k.pessoa_id = p.id AND k.status='Ativo') mensal
        FROM pessoas p WHERE p.nome LIKE ? ORDER BY veiculos DESC, p.nome`, de, ate, like(q)) },
    'cercas': { title: 'Relatório de cercas', periodo: true, cols: evCols, run: ev(['Entrada em cerca', 'Saída de cerca']) },
    'pontos-ref': { title: 'Relatório de pontos de interesse', periodo: true,
      cols: [['ponto','Ponto de interesse'],['visitas','Visitas','number'],['veiculos','Veículos distintos','number'],['ultima','Última visita','datetime']],
      run: ({ de, ate, q }) => all(`SELECT destino ponto, COUNT(*) visitas, COUNT(DISTINCT veiculo_id) veiculos, MAX(fim) ultima FROM viagens
        WHERE substr(inicio,1,10) BETWEEN ? AND ? AND destino LIKE ? GROUP BY destino ORDER BY visitas DESC`, de, ate, like(q)) },
    'velocidade': { title: 'Relatório de excesso de velocidade', periodo: true,
      cols: [['data','Data/hora','datetime'],['placa','Veículo'],['velocidade','Velocidade','number'],['limite','Limite','number'],['descricao','Local / descrição'],['tratado','Tratado','bool']],
      run: ev(['Excesso de velocidade']) },
    'paradas': { title: 'Relatório de paradas', periodo: true,
      cols: [['fim','Data','datetime'],['placa','Veículo'],['destino','Local'],['paradas','Paradas','number'],['tempo_parado_min','Tempo parado (min)','number']],
      run: ({ de, ate, q }) => all(`SELECT t.fim, v.placa, t.destino, t.paradas, t.tempo_parado_min FROM viagens t JOIN veiculos v ON v.id = t.veiculo_id
        WHERE t.paradas > 0 AND substr(t.inicio,1,10) BETWEEN ? AND ? AND v.placa LIKE ? ORDER BY t.fim DESC`, de, ate, like(q)) },
    'rotas-poi': { title: 'Relatório de rotas (POI)', periodo: true,
      cols: [['origem','Origem'],['destino','Destino'],['viagens','Viagens','number'],['km_medio','Km médio','km'],['tempo_medio','Tempo médio (min)','number']],
      run: ({ de, ate, q }) => all(`SELECT origem, destino, COUNT(*) viagens, ROUND(AVG(km),1) km_medio, ROUND(AVG((julianday(fim)-julianday(inicio))*1440)) tempo_medio
        FROM viagens WHERE substr(inicio,1,10) BETWEEN ? AND ? AND (origem LIKE ? OR destino LIKE ?) GROUP BY origem, destino ORDER BY viagens DESC`, de, ate, like(q), like(q)) },
    'vehicle-registration': { title: 'Relatório de cadastro e exclusão de veículos', periodo: true,
      cols: [['data','Data','datetime'],['acao','Ação'],['detalhes','Veículo'],['usuario','Usuário']],
      run: ({ de, ate, q }) => all(`SELECT data, acao, detalhes, usuario FROM logs WHERE entidade = 'Veículos' AND acao IN ('Inclusão','Exclusão')
        AND substr(data,1,10) BETWEEN ? AND ? AND COALESCE(detalhes,'') LIKE ? ORDER BY data DESC`, de, ate, like(q)) },
    'combustivel': { title: 'Consumo de combustível', periodo: true,
      cols: [['placa','Veículo'],['abastecimentos','Abastecimentos','number'],['litros','Litros','number'],['valor','Valor','money'],['km','Km rodados','km'],['km_l','Km/L','number'],['custo_km','Custo/km','money']],
      run: ({ de, ate, q }) => all(`SELECT v.placa, COUNT(d.id) abastecimentos, ROUND(SUM(d.litros),1) litros, SUM(d.valor) valor, k.km,
        ROUND(k.km / NULLIF(SUM(d.litros),0),2) km_l, ROUND(SUM(d.valor) / NULLIF(k.km,0),2) custo_km
        FROM despesas d JOIN veiculos v ON v.id = d.veiculo_id
        LEFT JOIN (SELECT veiculo_id, ROUND(SUM(km),1) km FROM viagens WHERE substr(inicio,1,10) BETWEEN ? AND ? GROUP BY veiculo_id) k ON k.veiculo_id = v.id
        WHERE d.tipo='Combustível' AND d.data BETWEEN ? AND ? AND v.placa LIKE ? GROUP BY v.id ORDER BY valor DESC`, de, ate, de, ate, like(q)) },
    'chips-nao-utilizados': { title: 'Chips não utilizados',
      cols: [['iccid','ICCID'],['numero','Linha'],['operadora','Operadora'],['status','Status'],['data_ativacao','Ativação','date']],
      run: ({ q }) => all(`SELECT c.iccid, c.numero, o.nome operadora, c.status, c.data_ativacao FROM chips c LEFT JOIN operadoras o ON o.id = c.operadora_id
        WHERE NOT EXISTS (SELECT 1 FROM equipamentos e WHERE e.chip_id = c.id) AND (c.iccid LIKE ? OR c.numero LIKE ?) ORDER BY c.id`, like(q), like(q)) },
    'usuario-sem-veiculos': { title: 'Clientes sem veículos',
      cols: [['nome','Cliente'],['cpf_cnpj','CPF/CNPJ'],['modalidade','Modalidade'],['telefone','Telefone'],['status','Status']],
      run: ({ q }) => all(`SELECT nome, cpf_cnpj, modalidade, telefone, status FROM pessoas p WHERE NOT EXISTS (SELECT 1 FROM veiculos v WHERE v.pessoa_id = p.id)
        AND nome LIKE ? ORDER BY nome`, like(q)) },
    'eventos': { title: 'Relatório de eventos', periodo: true, cols: evCols, run: ev(null) },
    'comandos': { title: 'Relatório de comandos', periodo: true,
      cols: [['data_envio','Envio','datetime'],['placa','Veículo'],['comando','Comando'],['parametros','Parâmetros'],['status','Status'],['data_resposta','Resposta','datetime'],['usuario','Usuário']],
      run: ({ de, ate, q }) => all(`SELECT c.*, v.placa FROM comandos c LEFT JOIN veiculos v ON v.id = c.veiculo_id WHERE substr(c.data_envio,1,10) BETWEEN ? AND ?
        AND (v.placa LIKE ? OR c.comando LIKE ?) ORDER BY c.data_envio DESC`, de, ate, like(q), like(q)) },
    'ancora': { title: 'Relatório de âncoras', periodo: true, cols: evCols, run: ev(['Violação de âncora']) },
    'online': { title: 'Veículos online', cols: offCols, run: offline(null, 0.5) },
    'offline-1': { title: 'Offline até 24h', cols: offCols, run: offline(0.5, 24) },
    'offline-2': { title: 'Offline até 36h', cols: offCols, run: offline(24, 36) },
    'offline-3': { title: 'Offline há mais de 36h', cols: offCols,
      run: ({ q }) => all(`SELECT v.placa, v.marca || ' ' || COALESCE(v.modelo,'') veiculo, p.nome cliente, p.telefone, q.imei, v.ultima_conexao, ROUND(${HORAS},1) horas
        FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id LEFT JOIN equipamentos q ON q.id = v.equipamento_id
        WHERE v.status='Ativo' AND (v.ultima_conexao IS NULL OR ${HORAS} > 36) AND (v.placa LIKE ? OR COALESCE(p.nome,'') LIKE ?) ORDER BY v.ultima_conexao`, like(q), like(q)) },
    'log': { title: 'Relatório de log', periodo: true,
      cols: [['data','Data','datetime'],['usuario','Usuário'],['acao','Ação'],['entidade','Módulo'],['registro_id','Registro','number'],['detalhes','Detalhes']],
      run: ({ de, ate, q }) => all(`SELECT * FROM logs WHERE substr(data,1,10) BETWEEN ? AND ? AND (usuario LIKE ? OR entidade LIKE ? OR COALESCE(detalhes,'') LIKE ?) ORDER BY id DESC LIMIT 5000`,
        de, ate, like(q), like(q), like(q)) },
    'entrada-saida': { title: 'Relatório de sensores', periodo: true, cols: evCols, run: ev(['Ignição ligada', 'Ignição desligada', 'Bateria violada', 'Botão de pânico', 'Bloqueio', 'Desbloqueio']) },
    'comissao-vendedor': { title: 'Relatório de comissão consultor', periodo: true,
      cols: [['consultor','Consultor'],['contratos','Contratos no período','number'],['mensal','Receita mensal vendida','money'],['pct','Comissão %','number'],['comissao','Comissão calculada','money'],['pendente','Comissões pendentes','money']],
      run: ({ de, ate, q }) => all(`SELECT c.nome consultor, COUNT(k.id) contratos, COALESCE(SUM(k.valor_mensal),0) mensal, c.comissao_pct pct,
        ROUND(COALESCE(SUM(k.valor_mensal),0) * COALESCE(c.comissao_pct,0) / 100, 2) comissao,
        (SELECT COALESCE(SUM(valor),0) FROM comissoes m WHERE m.consultor_id = c.id AND m.status='Pendente') pendente
        FROM consultores c LEFT JOIN contratos k ON k.consultor_id = c.id AND k.data_inicio BETWEEN ? AND ? WHERE c.nome LIKE ? GROUP BY c.id ORDER BY mensal DESC`, de, ate, like(q)) },
    'jornada-motorista': { title: 'Relatório jornada de motorista', periodo: true,
      cols: [['dia','Dia','date'],['motorista','Motorista'],['inicio','Início da jornada','datetime'],['fim','Fim da jornada','datetime'],['direcao','Horas de direção','number'],['km','Km','km'],['alerta','Situação']],
      run: ({ de, ate, q }) => all(`SELECT substr(t.inicio,1,10) dia, m.nome motorista, MIN(t.inicio) inicio, MAX(t.fim) fim,
        ROUND(SUM((julianday(t.fim)-julianday(t.inicio))*24),2) direcao, ROUND(SUM(t.km),1) km,
        CASE WHEN SUM((julianday(t.fim)-julianday(t.inicio))*24) > 10 THEN 'Excedeu 10h' ELSE 'Regular' END alerta
        FROM viagens t JOIN motoristas m ON m.id = t.motorista_id WHERE substr(t.inicio,1,10) BETWEEN ? AND ? AND m.nome LIKE ?
        GROUP BY dia, m.id ORDER BY dia DESC, motorista`, de, ate, like(q)) },
    'tratativas': { title: 'Relatório de tratativas', periodo: true,
      cols: [['data','Data/hora','datetime'],['placa','Veículo'],['tipo','Evento'],['tratativa','Tratativa'],['tratado_em','Tratado em','datetime']],
      run: ({ de, ate, q }) => all(`SELECT e.data, v.placa, e.tipo, e.tratativa, e.updated_at tratado_em FROM eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
        WHERE e.tratado = 1 AND substr(e.data,1,10) BETWEEN ? AND ? AND (v.placa LIKE ? OR COALESCE(e.tratativa,'') LIKE ?) ORDER BY e.data DESC`, de, ate, like(q), like(q)) },
    'historico-destinatarios': { title: 'Histórico de notificações a destinatários', periodo: true,
      cols: [['data','Data','datetime'],['canal','Canal'],['destinatario','Destinatário'],['mensagem','Mensagem'],['status','Status']],
      run: ({ de, ate, q }) => all(`SELECT * FROM mensagens WHERE substr(data,1,10) BETWEEN ? AND ? AND (destinatario LIKE ? OR COALESCE(mensagem,'') LIKE ?) ORDER BY data DESC`,
        de, ate, like(q), like(q)) },

    // Financeiro / contratos
    'clientes-sem-financeiro': { title: 'Clientes sem financeiro',
      cols: [['nome','Cliente'],['modalidade','Modalidade'],['veiculos','Veículos','number'],['telefone','Telefone'],['status','Status']],
      run: ({ q }) => all(`SELECT p.nome, p.modalidade, (SELECT COUNT(*) FROM veiculos v WHERE v.pessoa_id = p.id) veiculos, p.telefone, p.status FROM pessoas p
        WHERE p.status='Ativo' AND NOT EXISTS (SELECT 1 FROM contas_receber r WHERE r.pessoa_id = p.id AND r.status != 'Cancelado') AND p.nome LIKE ? ORDER BY p.nome`, like(q)) },
    'veiculos-sem-financeiro': { title: 'Veículos sem financeiro',
      cols: [['placa','Placa'],['veiculo','Veículo'],['cliente','Cliente'],['ultima_conexao','Última conexão','datetime']],
      run: ({ q }) => all(`SELECT v.placa, v.marca || ' ' || COALESCE(v.modelo,'') veiculo, p.nome cliente, v.ultima_conexao FROM veiculos v LEFT JOIN pessoas p ON p.id = v.pessoa_id
        WHERE v.status='Ativo' AND NOT EXISTS (SELECT 1 FROM contratos k WHERE k.pessoa_id = v.pessoa_id AND k.status='Ativo') AND (v.placa LIKE ? OR COALESCE(p.nome,'') LIKE ?)
        ORDER BY v.placa`, like(q), like(q)) },
    'inadimplentes': { title: 'Relatório de inadimplentes',
      cols: [['cliente','Cliente'],['telefone','Telefone'],['qtd','Títulos vencidos','number'],['total','Valor em aberto','money'],['desde','Vencido desde','date'],['dias','Dias de atraso','number']],
      run: ({ q }) => all(`SELECT p.nome cliente, p.telefone, COUNT(r.id) qtd, SUM(r.valor) total, MIN(r.vencimento) desde,
        CAST(julianday(?) - julianday(MIN(r.vencimento)) AS INTEGER) dias FROM contas_receber r JOIN pessoas p ON p.id = r.pessoa_id
        WHERE r.status='Aberto' AND r.vencimento < ? AND p.nome LIKE ? GROUP BY p.id ORDER BY total DESC`, today(), today(), like(q)) },
    'faturamento': { title: 'Relatório de faturamento', periodo: true,
      cols: [['mes','Mês'],['titulos','Títulos','number'],['faturado','Faturado','money'],['recebido','Recebido','money'],['aberto','Em aberto','money']],
      run: ({ de, ate }) => all(`SELECT substr(vencimento,1,7) mes, COUNT(*) titulos, SUM(valor) faturado,
        SUM(CASE WHEN status='Pago' THEN COALESCE(valor_pago,valor) ELSE 0 END) recebido, SUM(CASE WHEN status='Aberto' THEN valor ELSE 0 END) aberto
        FROM contas_receber WHERE status != 'Cancelado' AND vencimento BETWEEN ? AND ? GROUP BY mes ORDER BY mes`, de, ate) },
    'vendas': { title: 'Relatório de vendas', periodo: true,
      cols: [['data_inicio','Data','date'],['numero','Contrato'],['cliente','Cliente'],['servico','Serviço'],['consultor','Consultor'],['modalidade','Modalidade'],['valor_mensal','Mensalidade','money']],
      run: ({ de, ate, q }) => all(`SELECT k.data_inicio, k.numero, p.nome cliente, s.nome servico, c.nome consultor, k.modalidade, k.valor_mensal FROM contratos k
        LEFT JOIN pessoas p ON p.id = k.pessoa_id LEFT JOIN servicos s ON s.id = k.servico_id LEFT JOIN consultores c ON c.id = k.consultor_id
        WHERE k.data_inicio BETWEEN ? AND ? AND (COALESCE(p.nome,'') LIKE ? OR COALESCE(c.nome,'') LIKE ?) ORDER BY k.data_inicio DESC`, de, ate, like(q), like(q)) },
    'resumo': { title: 'Resumo financeiro', periodo: true,
      cols: [['tipo','Tipo'],['categoria','Categoria'],['previsto','Previsto','money'],['realizado','Realizado','money'],['pendente','Pendente','money']],
      run: ({ de, ate }) => all(`SELECT 'Receita' tipo, COALESCE(c.nome,'Sem categoria') categoria, SUM(r.valor) previsto,
          SUM(CASE WHEN r.status='Pago' THEN COALESCE(r.valor_pago,r.valor) ELSE 0 END) realizado, SUM(CASE WHEN r.status='Aberto' THEN r.valor ELSE 0 END) pendente
          FROM contas_receber r LEFT JOIN categorias_financeiras c ON c.id = r.categoria_id WHERE r.status!='Cancelado' AND r.vencimento BETWEEN ? AND ? GROUP BY categoria
        UNION ALL SELECT 'Despesa', COALESCE(c.nome,'Sem categoria'), SUM(r.valor), SUM(CASE WHEN r.status='Pago' THEN COALESCE(r.valor_pago,r.valor) ELSE 0 END),
          SUM(CASE WHEN r.status='Aberto' THEN r.valor ELSE 0 END)
          FROM contas_pagar r LEFT JOIN categorias_financeiras c ON c.id = r.categoria_id WHERE r.status!='Cancelado' AND r.vencimento BETWEEN ? AND ? GROUP BY 2
        ORDER BY 1 DESC, 3 DESC`, de, ate, de, ate) },
    'extrato': { title: 'Extrato bancário', periodo: true,
      cols: [['data','Data','date'],['banco','Banco'],['descricao','Descrição'],['entrada','Entrada','money'],['saida','Saída','money'],['saldo','Saldo','money']],
      run: ({ de, ate, q }) => {
        const rows = all(`SELECT r.data_pagamento data, b.nome banco, r.descricao, COALESCE(r.valor_pago,r.valor) entrada, 0 saida FROM contas_receber r LEFT JOIN bancos b ON b.id = r.banco_id
            WHERE r.status='Pago' AND r.data_pagamento BETWEEN ? AND ? AND COALESCE(b.nome,'') LIKE ?
          UNION ALL SELECT p.data_pagamento, b.nome, p.descricao, 0, COALESCE(p.valor_pago,p.valor) FROM contas_pagar p LEFT JOIN bancos b ON b.id = p.banco_id
            WHERE p.status='Pago' AND p.data_pagamento BETWEEN ? AND ? AND COALESCE(b.nome,'') LIKE ? ORDER BY 1`, de, ate, like(q), de, ate, like(q));
        let s = 0; for (const x of rows) { s += x.entrada - x.saida; x.saldo = Math.round(s * 100) / 100; }
        return rows;
      } },
    'fluxo-caixa': { title: 'Fluxo de caixa', periodo: true,
      cols: [['data','Data','date'],['entradas_prev','Entradas previstas','money'],['saidas_prev','Saídas previstas','money'],['entradas','Entradas realizadas','money'],['saidas','Saídas realizadas','money'],['saldo','Saldo acumulado','money']],
      run: ({ de, ate }) => {
        const rows = all(`SELECT data, SUM(ep) entradas_prev, SUM(sp) saidas_prev, SUM(er) entradas, SUM(sr) saidas FROM (
            SELECT vencimento data, CASE WHEN status='Aberto' THEN valor ELSE 0 END ep, 0 sp, 0 er, 0 sr FROM contas_receber WHERE status='Aberto' AND vencimento BETWEEN ? AND ?
            UNION ALL SELECT data_pagamento, 0, 0, COALESCE(valor_pago,valor), 0 FROM contas_receber WHERE status='Pago' AND data_pagamento BETWEEN ? AND ?
            UNION ALL SELECT vencimento, 0, valor, 0, 0 FROM contas_pagar WHERE status='Aberto' AND vencimento BETWEEN ? AND ?
            UNION ALL SELECT data_pagamento, 0, 0, 0, COALESCE(valor_pago,valor) FROM contas_pagar WHERE status='Pago' AND data_pagamento BETWEEN ? AND ?
          ) GROUP BY data ORDER BY data`, de, ate, de, ate, de, ate, de, ate);
        let s = 0; for (const x of rows) { s += x.entradas_prev - x.saidas_prev + x.entradas - x.saidas; x.saldo = Math.round(s * 100) / 100; }
        return rows;
      } },
    'proximos-vencer': { title: 'Contratos próximos a vencer (60 dias)',
      cols: [['numero','Contrato'],['cliente','Cliente'],['telefone','Telefone'],['data_fim','Fim','date'],['dias','Dias restantes','number'],['valor_mensal','Mensalidade','money']],
      run: ({ q }) => all(`SELECT k.numero, p.nome cliente, p.telefone, k.data_fim, CAST(julianday(k.data_fim) - julianday(?) AS INTEGER) dias, k.valor_mensal
        FROM contratos k LEFT JOIN pessoas p ON p.id = k.pessoa_id WHERE k.status='Ativo' AND k.data_fim BETWEEN ? AND date(?, '+60 day')
        AND (k.numero LIKE ? OR COALESCE(p.nome,'') LIKE ?) ORDER BY k.data_fim`, today(), today(), today(), like(q), like(q)) },
    'proximas-a-vencer': { title: 'Planilha de contas a receber (próximos 30 dias)',
      cols: [['vencimento','Vencimento','date'],['cliente','Cliente'],['telefone','Telefone'],['descricao','Descrição'],['valor','Valor','money']],
      run: ({ q }) => all(`SELECT r.vencimento, p.nome cliente, p.telefone, r.descricao, r.valor FROM contas_receber r LEFT JOIN pessoas p ON p.id = r.pessoa_id
        WHERE r.status='Aberto' AND r.vencimento BETWEEN ? AND date(?, '+30 day') AND (r.descricao LIKE ? OR COALESCE(p.nome,'') LIKE ?) ORDER BY r.vencimento`,
        today(), today(), like(q), like(q)) },
    'nota-faturada': { title: 'Relatório de notas faturadas', periodo: true,
      cols: [['numero','Número'],['data_emissao','Emissão','date'],['tomador','Tomador'],['empresa','Emissora'],['valor','Valor','money'],['iss','ISS estimado','money']],
      run: ({ de, ate, q }) => all(`SELECT n.numero, n.data_emissao, p.nome tomador, e.razao_social empresa, n.valor, ROUND(n.valor * COALESCE(s.aliquota_iss,0) / 100, 2) iss
        FROM notas_fiscais n LEFT JOIN pessoas p ON p.id = n.pessoa_id LEFT JOIN empresas e ON e.id = n.empresa_id LEFT JOIN servicos_nfs s ON s.id = n.servico_nfs_id
        WHERE n.status='Emitida' AND n.data_emissao BETWEEN ? AND ? AND COALESCE(p.nome,'') LIKE ? ORDER BY n.data_emissao DESC`, de, ate, like(q)) },

    // Atendimentos / assistência / manutenção / sinistros
    'produtividade': { title: 'Relatório de produtividade', periodo: true,
      cols: [['usuario','Usuário'],['abertos','Atendimentos','number'],['resolvidos','Resolvidos','number'],['taxa','% resolvidos','number'],['tempo_medio','Tempo médio (h)','number']],
      run: ({ de, ate }) => all(`SELECT COALESCE(u.nome,'Sem responsável') usuario, COUNT(*) abertos, SUM(a.status IN ('Resolvido','Fechado')) resolvidos,
        ROUND(100.0 * SUM(a.status IN ('Resolvido','Fechado')) / COUNT(*), 1) taxa,
        ROUND(AVG(CASE WHEN a.data_fechamento IS NOT NULL THEN (julianday(a.data_fechamento)-julianday(a.data_abertura))*24 END),1) tempo_medio
        FROM atendimentos a LEFT JOIN usuarios u ON u.id = a.responsavel_id WHERE substr(a.data_abertura,1,10) BETWEEN ? AND ? GROUP BY usuario ORDER BY abertos DESC`, de, ate) },
    'nps': { title: 'Atendimentos (NPS)', periodo: true,
      cols: [['protocolo','Protocolo'],['data_abertura','Data','datetime'],['cliente','Cliente'],['assunto','Assunto'],['nota_nps','Nota','number'],['classificacao','Classificação']],
      run: ({ de, ate, q }) => all(`SELECT a.protocolo, a.data_abertura, p.nome cliente, a.assunto, a.nota_nps,
        CASE WHEN a.nota_nps >= 9 THEN 'Promotor' WHEN a.nota_nps >= 7 THEN 'Neutro' ELSE 'Detrator' END classificacao
        FROM atendimentos a LEFT JOIN pessoas p ON p.id = a.pessoa_id WHERE a.nota_nps IS NOT NULL AND substr(a.data_abertura,1,10) BETWEEN ? AND ?
        AND (COALESCE(p.nome,'') LIKE ? OR a.assunto LIKE ?) ORDER BY a.data_abertura DESC`, de, ate, like(q), like(q)) },
    'historico-assistencias': { title: 'Histórico de inclusões em assistência', periodo: true,
      cols: [['data','Data','datetime'],['acao','Ação'],['detalhes','Veículo'],['usuario','Usuário']],
      run: ({ de, ate, q }) => all(`SELECT data, acao, detalhes, usuario FROM logs WHERE entidade = 'Veículos' AND substr(data,1,10) BETWEEN ? AND ?
        AND COALESCE(detalhes,'') LIKE ? ORDER BY data DESC`, de, ate, like(q)) },
    'veiculos-assistencia': { title: 'Veículos com assistência',
      cols: [['placa','Placa'],['veiculo','Veículo'],['cliente','Cliente'],['plano','Plano'],['valor_mensal','Mensalidade','money']],
      run: ({ q }) => all(`SELECT v.placa, v.marca || ' ' || COALESCE(v.modelo,'') veiculo, p.nome cliente, a.nome plano, a.valor_mensal FROM veiculos v
        JOIN planos_assistencia a ON a.id = v.plano_assistencia_id LEFT JOIN pessoas p ON p.id = v.pessoa_id WHERE v.placa LIKE ? OR COALESCE(p.nome,'') LIKE ? ORDER BY v.placa`, like(q), like(q)) },
    'plano-manutencao': { title: 'Relatório de plano de manutenção',
      cols: [['plano','Plano'],['placa','Veículo'],['tipo','Tipo'],['km_atual','Km atual','km'],['proximo_km','Próximo km','km'],['proxima_data','Próxima data','date'],['situacao','Situação']],
      run: ({ q }) => all(`SELECT m.nome plano, v.placa, m.tipo, v.odometro km_atual, m.ultimo_km + m.intervalo_km proximo_km,
        date(m.ultima_data, '+' || COALESCE(m.intervalo_dias,0) || ' day') proxima_data,
        CASE WHEN (m.intervalo_km IS NOT NULL AND v.odometro >= m.ultimo_km + m.intervalo_km) OR (m.intervalo_dias IS NOT NULL AND date(m.ultima_data, '+' || m.intervalo_dias || ' day') < ?) THEN 'Vencido'
             WHEN (m.intervalo_km IS NOT NULL AND v.odometro >= m.ultimo_km + m.intervalo_km * 0.9) THEN 'Próximo' ELSE 'Em dia' END situacao
        FROM planos_manutencao m LEFT JOIN veiculos v ON v.id = m.veiculo_id WHERE COALESCE(v.placa,'') LIKE ? OR m.nome LIKE ? ORDER BY situacao DESC`, today(), like(q), like(q)) },
    'sinistros-criados': { title: 'Relatório de sinistros', periodo: true,
      cols: [['protocolo','Protocolo'],['data','Data','datetime'],['placa','Veículo'],['tipo','Tipo'],['categoria','Categoria'],['local','Local'],['status','Status']],
      run: ({ de, ate, q }) => all(`SELECT s.protocolo, s.data, v.placa, t.nome tipo, c.nome categoria, s.local, s.status FROM sinistros s LEFT JOIN veiculos v ON v.id = s.veiculo_id
        LEFT JOIN tipos_sinistro t ON t.id = s.tipo_id LEFT JOIN categorias_ocorrencia c ON c.id = s.categoria_id
        WHERE substr(s.data,1,10) BETWEEN ? AND ? AND (COALESCE(v.placa,'') LIKE ? OR COALESCE(s.local,'') LIKE ?) ORDER BY s.data DESC`, de, ate, like(q), like(q)) },
  };
}

function makeReports(db) {
  const r = express.Router();
  const R = defs(db);
  r.get('/reports', (req, res) => res.json(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { title: v.title, cols: v.cols, periodo: !!v.periodo }]))));
  r.get('/reports/:key', (req, res) => {
    const rep = R[req.params.key];
    if (!rep) throw new HttpError(404, 'Relatório não encontrado');
    const d = new Date();
    const valid = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const de = valid(req.query.de) ? req.query.de : fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 30));
    const ate = valid(req.query.ate) ? req.query.ate : today();
    res.json({ title: rep.title, cols: rep.cols, periodo: !!rep.periodo, de, ate, rows: rep.run({ de, ate, q: String(req.query.q || '') }) });
  });
  return r;
}

module.exports = { makeReports };
