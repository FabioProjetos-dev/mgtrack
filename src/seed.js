// Popula o banco com dados de demonstração realistas (executa apenas com banco vazio).
const { hashPassword, fmtDate, fmtDateTime } = require('./db');

let seed = 20261124;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const chance = p => rnd() < p;
const round2 = n => Math.round(n * 100) / 100;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const addMin = (d, n) => new Date(d.getTime() + n * 60000);

const NOMES = ['Ana','Bruno','Carla','Daniel','Eduardo','Fernanda','Gabriel','Helena','Igor','Juliana','Lucas','Mariana','Natália','Otávio','Paula','Rafael','Sabrina','Thiago','Vanessa','Wagner','Beatriz','Caio','Débora','Felipe','Larissa','Marcelo','Patrícia','Renato','Simone','Vinícius'];
const SOBRENOMES = ['Silva','Souza','Oliveira','Santos','Pereira','Costa','Rodrigues','Almeida','Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Mendes','Barbosa','Teixeira'];
const EMPRESAS = ['Transportes Serra Azul','Distribuidora Minas Forte','Logística Horizonte','Construtora Pampulha','Frigorífico Vale Verde','Mudanças Expressas BH','Entregas Rápidas Contagem','Agro Cerrado','TransBetim Cargas','Locadora Savassi'];
const CIDADES = [['Belo Horizonte',-19.92,-43.94],['Contagem',-19.93,-44.05],['Betim',-19.97,-44.20],['Nova Lima',-19.98,-43.85],['Sete Lagoas',-19.46,-44.25],['Santa Luzia',-19.77,-43.85],['Ribeirão das Neves',-19.77,-44.09],['Sabará',-19.89,-43.81]];
const LOCAIS = ['Centro - BH','Pampulha','Savassi','Barreiro','CEASA - Contagem','Distrito Industrial - Betim','Vila da Serra - Nova Lima','Aeroporto de Confins','Venda Nova','Cidade Industrial','Eldorado','Anel Rodoviário - km 12','Sete Lagoas - Centro','Shopping Del Rey'];
const MARCAS = [['Fiat','Strada','Carro'],['Volkswagen','Gol','Carro'],['Chevrolet','Onix','Carro'],['Toyota','Hilux','Utilitário'],['Fiat','Toro','Utilitário'],['Honda','CG 160','Moto'],['Yamaha','Fazer 250','Moto'],['Mercedes-Benz','Accelo 1016','Caminhão'],['Volkswagen','Delivery 11.180','Caminhão'],['Renault','Kwid','Carro'],['Hyundai','HB20','Carro'],['Ford','Ranger','Utilitário']];
const CORES = ['Branco','Prata','Preto','Cinza','Vermelho','Azul'];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const placa = () => `${pick(LETRAS)}${pick(LETRAS)}${pick(LETRAS)}${int(0, 9)}${pick(LETRAS)}${int(10, 99)}`;
const cpf = () => `${int(100, 999)}.${int(100, 999)}.${int(100, 999)}-${int(10, 99)}`;
const cnpj = () => `${int(10, 99)}.${int(100, 999)}.${int(100, 999)}/0001-${int(10, 99)}`;
const fone = () => `(31) 9${int(8000, 9999)}-${int(1000, 9999)}`;
const nomePessoa = () => `${pick(NOMES)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.');

function run(db) {
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0) return false;
  const ins = (table, data) => {
    const k = Object.keys(data);
    return Number(db.prepare(`INSERT INTO ${table} (${k.map(x => `"${x}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map(x => data[x] ?? null)).lastInsertRowid);
  };
  const many = (table, list) => list.map(x => ins(table, x));
  const now = new Date();
  const D = d => fmtDate(d), DT = d => fmtDateTime(d);

  db.exec('BEGIN');
  try {
    // ── Acesso
    const [gAdm, gAt, gFin, gTec] = many('grupos_permissao', [
      { nome: 'Administradores', descricao: 'Acesso total', permissoes: 'Todos' },
      { nome: 'Atendimento', descricao: 'Central de atendimento e monitoramento', permissoes: 'Veículos\nAtendimentos\nOrdens de serviço' },
      { nome: 'Financeiro', descricao: 'Equipe financeira', permissoes: 'Financeiro\nCobranças\nContratos\nNota Fiscal' },
      { nome: 'Técnicos', descricao: 'Técnicos de campo', permissoes: 'Ordens de serviço\nEquipamentos' }]);
    const gh = ins('grupos_horario', { nome: 'Horário comercial', dias: 'Seg a Sex', hora_inicio: '08:00', hora_fim: '18:00' });
    ins('grupos_horario', { nome: '24 horas (central)', dias: 'Todos os dias', hora_inicio: '00:00', hora_fim: '23:59' });
    const usuarios = [ins('usuarios', { nome: 'Administrador', login: 'admin', email: 'admin@mgtrack.local', senha: hashPassword('admin123'), grupo_permissao_id: gAdm, ativo: 1 })];
    for (const [n, g] of [['Juliana Atendimento', gAt], ['Rafael Monitoramento', gAt], ['Carla Financeiro', gFin], ['Marcelo Suporte', gAt]])
      usuarios.push(ins('usuarios', { nome: n, login: slug(n.split(' ')[0]), email: `${slug(n.split(' ')[0])}@mgtrack.local`, senha: hashPassword('123456'), grupo_permissao_id: g, grupo_horario_id: gh, ativo: 1 }));

    // ── Pessoas
    const cats = many('categorias_pessoa', [{ nome: 'Pessoa física' }, { nome: 'Frotista' }, { nome: 'Transportadora' }, { nome: 'Revenda' }]);
    const gps = many('grupos_pessoa', [{ nome: 'Região metropolitana' }, { nome: 'Interior' }, { nome: 'Clientes VIP' }]);
    const pessoas = [];
    for (let i = 0; i < 70; i++) {
      const pj = i < 10;
      const [cid] = pick(CIDADES);
      const nasc = new Date(int(1960, 2002), int(0, 11), int(1, 28));
      pessoas.push(ins('pessoas', {
        nome: pj ? EMPRESAS[i] + ' Ltda' : nomePessoa(), tipo_pessoa: pj ? 'Jurídica' : 'Física', cpf_cnpj: pj ? cnpj() : cpf(),
        modalidade: chance(0.6) ? 'Comodato' : 'Plataforma', email: `cliente${i + 1}@email.com`, telefone: fone(), data_nascimento: D(nasc),
        cidade: cid, uf: 'MG', endereco: `Rua ${pick(SOBRENOMES)}, ${int(10, 2000)}`, categoria_id: pj ? pick(cats.slice(1)) : cats[0], grupo_id: pick(gps),
        status: i >= 66 ? 'Pendente' : chance(0.05) ? 'Inativo' : 'Ativo' }));
    }
    const ativos = pessoas.slice(0, 66);
    for (let i = 0; i < 10; i++) ins('indicacoes', { nome: nomePessoa(), telefone: fone(), indicado_por: pick(ativos), data: D(addDays(now, -int(0, 60))), status: pick(['Nova', 'Em contato', 'Convertida', 'Perdida']) });
    for (let i = 0; i < 8; i++) { const p = pick(pessoas); ins('consultas_serasa', { pessoa_id: p, cpf_cnpj: cpf(), data: D(addDays(now, -int(0, 90))), score: int(300, 980), resultado: chance(0.8) ? 'Sem restrições' : 'Com restrições' }); }
    ins('listsystem', { nome: 'Motivos de cancelamento', descricao: 'Lista usada em rescisões', itens: 'Venda do veículo\nPreço\nInsatisfação com o serviço\nMudança de cidade' });
    const motoristas = [];
    for (let i = 0; i < 30; i++) motoristas.push(ins('motoristas', { nome: nomePessoa(), cpf: cpf(), cnh: String(int(10000000000, 99999999999)), categoria_cnh: pick(['B', 'AB', 'C', 'D', 'E']),
      validade_cnh: D(addDays(now, int(-30, 1500))), telefone: fone(), pessoa_id: pick(ativos.slice(0, 10)), ibutton: `01-${int(100000, 999999)}` }));

    // ── Comercial
    const consultores = many('consultores', ['Pedro Vendas', 'Aline Comercial', 'Rodrigo Parceiro', 'Camila Representante', 'Diego Online'].map((n, i) => ({ nome: n, email: `${slug(n.split(' ')[0])}@mgtrack.local`, telefone: fone(), comissao_pct: [10, 12, 8, 10, 6][i], ativo: 1 })));
    const servicos = many('servicos', [
      { nome: 'Rastreamento Básico', descricao: 'Localização em tempo real', valor_mensal: 59.9, valor_instalacao: 80 },
      { nome: 'Rastreamento + Bloqueio', descricao: 'Localização e bloqueio remoto', valor_mensal: 79.9, valor_instalacao: 120 },
      { nome: 'Somente Plataforma', descricao: 'Uso da plataforma com equipamento próprio', valor_mensal: 29.9, valor_instalacao: 0 },
      { nome: 'Gestão de Frota Premium', descricao: 'Telemetria, jornada e videomonitoramento', valor_mensal: 149.9, valor_instalacao: 250 }]);
    const valorServ = [59.9, 79.9, 29.9, 149.9];

    // ── Técnicos / estoques / chips / equipamentos
    const tecnicos = many('tecnicos', ['Anderson Técnico', 'Bruno Instalador', 'Cláudio Campo', 'Everton Técnico', 'Fábio Instalações'].map((n, i) => ({ nome: n, telefone: fone(), email: `${slug(n.split(' ')[0])}@mgtrack.local`, regiao: pick(CIDADES)[0], ativo: 1 })));
    const estCentral = ins('estoques', { nome: 'Estoque Central', tipo: 'Central', categoria: 'Geral', regiao: 'Belo Horizonte' });
    const estoques = [estCentral];
    tecnicos.forEach((t, i) => { for (const c of ['Carro', 'Moto']) estoques.push(ins('estoques', { nome: `${c} - ${['Anderson', 'Bruno', 'Cláudio', 'Everton', 'Fábio'][i]}`, tipo: 'Técnico', categoria: c, tecnico_id: t })); });
    for (const c of ['Simples', 'Retiradas', 'Extraviados', 'Revisão']) estoques.push(ins('estoques', { nome: `Estoque ${c}`, tipo: 'Central', categoria: c }));
    const operadoras = many('operadoras', [{ nome: 'Vivo', apn: 'zap.vivo.com.br', usuario_apn: 'vivo' }, { nome: 'Claro', apn: 'claro.com.br', usuario_apn: 'claro' }, { nome: 'TIM', apn: 'timbrasil.br', usuario_apn: 'tim' }, { nome: 'Algar', apn: 'algar.br', usuario_apn: 'algar' }]);
    const chips = [];
    for (let i = 0; i < 260; i++) chips.push(ins('chips', { iccid: `895510${int(100000000, 999999999)}${int(1000, 9999)}`, numero: fone(), operadora_id: pick(operadoras), plano_mb: pick([10, 20, 50]), status: i > 250 ? 'Suspenso' : 'Ativo', data_ativacao: D(addDays(now, -int(10, 700))) }));
    const MODELOS = [['ST310U', 'Suntech'], ['GT06', 'Concox'], ['J16', 'JIMI'], ['FMB920', 'Teltonika'], ['ST4955', 'Suntech']];
    const equipamentos = [];
    for (let i = 0; i < 240; i++) {
      const [mod, fab] = pick(MODELOS);
      equipamentos.push(ins('equipamentos', { imei: `86${int(1000000, 9999999)}${int(100000, 999999)}`, modelo: mod, fabricante: fab, numero_serie: `SN${int(100000, 999999)}`,
        chip_id: i < 235 ? chips[i] : null, estoque_id: i < 170 ? null : pick(estoques.slice(0, 11)), status: i < 170 ? 'Instalado' : i < 232 ? 'Em estoque' : pick(['Em manutenção', 'Extraviado']),
        data_compra: D(addDays(now, -int(30, 800))), valor_compra: pick([89, 120, 145, 210]) }));
    }
    for (let i = 0; i < 15; i++) ins('transferencias', { equipamento_id: equipamentos[170 + i], origem_id: estCentral, destino_id: pick(estoques.slice(1, 11)), data: D(addDays(now, -int(1, 90))), observacao: 'Reposição de estoque do técnico' });
    many('comandos_personalizados', [{ nome: 'Intervalo 60s', modelo_equipamento: 'ST310U', comando: 'ST300RPT;{IMEI};02;60;', descricao: 'Ajusta intervalo de transmissão' },
      { nome: 'Reset GT06', modelo_equipamento: 'GT06', comando: 'RESET#', descricao: 'Reinicia o equipamento' }, { nome: 'Odômetro', modelo_equipamento: 'FMB920', comando: 'setparam 11807:{KM}', descricao: 'Ajusta odômetro' }]);

    // ── Veículos
    const grupos = many('grupos_veiculo', [{ nome: 'Frota leve' }, { nome: 'Pesados' }, { nome: 'Motos' }, { nome: 'Diretoria' }]);
    const planosAss = many('planos_assistencia', [{ nome: 'Assistência Básica', valor_mensal: 14.9, km_reboque: 100, cobertura: 'Reboque\nChaveiro\nPane seca' },
      { nome: 'Assistência Plus', valor_mensal: 24.9, km_reboque: 300, cobertura: 'Reboque\nChaveiro\nPane seca\nTroca de pneu\nCarga de bateria\nTáxi' },
      { nome: 'Assistência Frota', valor_mensal: 39.9, km_reboque: 500, cobertura: 'Cobertura completa para veículos pesados' }]);
    const veiculos = [];
    for (let i = 0; i < 170; i++) {
      const [marca, modelo, tipo] = pick(MARCAS);
      const [, clat, clng] = pick(CIDADES);
      const r = rnd();
      // distribuição de conectividade: 72% online, 12% ≤24h, 5% ≤36h, 11% >36h
      const horasOff = r < 0.72 ? int(0, 10) / 60 : r < 0.84 ? int(1, 23) : r < 0.89 ? int(25, 35) : int(40, 400);
      const conexao = addMin(now, -horasOff * 60);
      const travado = r < 0.72 && i % 37 === 5;
      const posicao = travado ? addMin(now, -int(8, 30) * 60) : conexao;
      const ign = r < 0.72 && chance(0.55);
      veiculos.push(ins('veiculos', { placa: placa(), tipo, marca, modelo, ano: int(2012, 2025), cor: pick(CORES), chassi: `9BW${int(10000000, 99999999)}${int(100000, 999999)}`,
        pessoa_id: i < 60 ? ativos[i] : pick(ativos), motorista_id: chance(0.5) ? pick(motoristas) : null,
        grupo_id: tipo === 'Moto' ? grupos[2] : tipo === 'Caminhão' ? grupos[1] : grupos[0], equipamento_id: equipamentos[i],
        plano_assistencia_id: chance(0.35) ? pick(planosAss) : null, odometro: int(5000, 220000), limite_velocidade: tipo === 'Caminhão' ? 90 : 110,
        lat: clat + (rnd() - 0.5) * 0.12, lng: clng + (rnd() - 0.5) * 0.12, velocidade: ign ? int(0, 95) : 0, ignicao: ign ? 1 : 0, bloqueado: 0,
        ultima_posicao: DT(posicao), ultima_conexao: DT(conexao), status: 'Ativo', created_at: DT(addDays(now, -int(1, 500))) }));
    }
    const cercas = [['Matriz MG-TRACK', -19.9245, -43.9352, 400], ['CEASA Contagem', -19.9105, -44.0682, 800], ['Aeroporto de Confins', -19.6336, -43.9686, 1500],
      ['Distrito Industrial Betim', -19.9601, -44.1802, 1200], ['Pátio Transportadora', -19.8701, -43.9901, 500], ['Área de risco - Anel', -19.8566, -43.9213, 700]];
    cercas.forEach(([nome, lat, lng, raio], i) => ins('cercas', { nome, tipo: 'Circular', lat, lng, raio, cor: ['#36C6D3', '#3598DC', '#8E44AD', '#26C281', '#F1C40F', '#E7505A'][i], alerta_entrada: 1, alerta_saida: i % 2 }));
    const dests = many('destinatarios', [{ nome: 'Central de Monitoramento', email: 'central@mgtrack.local', telefone: fone(), canais: 'Todos' },
      { nome: 'Gestor de Frota - Serra Azul', email: 'frota@serraazul.com', telefone: fone(), canais: 'E-mail', pessoa_id: ativos[0] },
      { nome: 'Plantão Noturno', telefone: fone(), canais: 'WhatsApp' }]);
    many('alertas', [{ nome: 'Excesso de velocidade frota', tipo: 'Excesso de velocidade', grupo_id: grupos[0], valor: '110', destinatario_id: dests[0], canal: 'Push', ativo: 1 },
      { nome: 'Pânico', tipo: 'Botão de pânico', destinatario_id: dests[2], canal: 'WhatsApp', ativo: 1 },
      { nome: 'Pesados - velocidade', tipo: 'Excesso de velocidade', grupo_id: grupos[1], valor: '90', destinatario_id: dests[1], canal: 'E-mail', ativo: 1 },
      { nome: 'Violação de bateria', tipo: 'Bateria violada', destinatario_id: dests[0], canal: 'SMS', ativo: 1 }]);
    many('comandos_evento', [{ tipo_evento: 'Botão de pânico', comando: 'Bloquear', ativo: 1 }, { tipo_evento: 'Bateria violada', comando: 'Solicitar posição', ativo: 1 }]);
    for (let i = 0; i < 10; i++) ins('ios', { veiculo_id: veiculos[i], porta: pick(['Entrada 1', 'Entrada 2', 'Saída 1']), descricao: pick(['Porta do baú', 'Sensor de carga', 'Sirene', 'Trava elétrica']), texto_ligado: 'Aberta/Ligada', texto_desligado: 'Fechada/Desligada', estado: int(0, 1) });
    for (let i = 0; i < 5; i++) ins('rotas', { nome: `Rota ${pick(LOCAIS)} → ${pick(LOCAIS)}`, veiculo_id: pick(veiculos), origem: pick(LOCAIS), destino: pick(LOCAIS), distancia_km: int(8, 90), desvio_max_m: 300, status: 'Ativa' });

    // Eventos (30 dias) e viagens
    const tiposEv = [['Excesso de velocidade', 0.3], ['Ignição ligada', 0.2], ['Ignição desligada', 0.18], ['Entrada em cerca', 0.1], ['Saída de cerca', 0.1], ['Bateria violada', 0.04], ['Botão de pânico', 0.02], ['Violação de âncora', 0.03], ['Equipamento sem sinal', 0.03]];
    const tipoEv = () => { let x = rnd(); for (const [t, p] of tiposEv) { if ((x -= p) < 0) return t; } return 'Ignição ligada'; };
    for (let i = 0; i < 700; i++) {
      const t = tipoEv(); const dt = addMin(now, -int(0, 30 * 24 * 60)); const vel = t === 'Excesso de velocidade' ? int(112, 160) : t.startsWith('Ignição') ? 0 : int(0, 80);
      ins('eventos', { veiculo_id: pick(veiculos), tipo: t, data: DT(dt), velocidade: vel, descricao: t === 'Excesso de velocidade' ? `${pick(LOCAIS)} - limite 110 km/h` : pick(LOCAIS),
        tratado: dt < addDays(now, -2) ? (chance(0.9) ? 1 : 0) : chance(0.3) ? 1 : 0, tratativa: null });
    }
    db.exec("UPDATE eventos SET tratativa = 'Contato realizado com o cliente. Situação normalizada.' WHERE tratado = 1");
    for (let i = 0; i < 6; i++) { const v = veiculos[i * 3]; for (let k = 0; k < int(4, 9); k++) ins('eventos', { veiculo_id: v, tipo: 'Equipamento sem sinal', data: DT(addMin(now, -int(1, 600))), velocidade: 0, descricao: 'Reconexões excessivas', tratado: 0 }); }
    const vStmt = db.prepare('INSERT INTO viagens (veiculo_id, motorista_id, inicio, fim, origem, destino, km, vel_max, vel_media, paradas, tempo_parado_min, litros) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const v of veiculos.slice(0, 90)) {
      const mot = chance(0.6) ? pick(motoristas) : null;
      for (let d = 30; d >= 0; d--) {
        if (chance(0.25)) continue;
        let t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, int(6, 9), int(0, 59));
        for (let k = 0; k < int(1, 4); k++) {
          const dur = int(15, 150); const fim = addMin(t, dur); if (fim > now) break;
          const km = round2(dur * int(25, 60) / 60);
          vStmt.run(v, mot, DT(t), DT(fim), pick(LOCAIS), pick(LOCAIS), km, int(60, 125), round2(km / (dur / 60)), int(0, 4), int(0, 45), round2(km / int(8, 13)));
          t = addMin(fim, int(20, 180));
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const st = pick(['Confirmado', 'Confirmado', 'Confirmado', 'Enviado', 'Pendente', 'Falhou']); const dt = addMin(now, -int(10, 20000));
      ins('comandos', { veiculo_id: pick(veiculos), comando: pick(['Bloquear', 'Desbloquear', 'Solicitar posição', 'Reiniciar', 'Configurar intervalo']), status: st,
        data_envio: DT(dt), data_resposta: st === 'Confirmado' ? DT(addMin(dt, int(1, 5))) : null, usuario: 'Rafael Monitoramento' });
    }

    // ── Financeiro base
    const bancos = many('bancos', [{ nome: 'Banco do Brasil', agencia: '1234-5', conta: '45678-9', saldo_inicial: 25000 }, { nome: 'Itaú', agencia: '0987', conta: '12345-6', saldo_inicial: 12000 }, { nome: 'Caixa interno', saldo_inicial: 1500 }]);
    const ccs = many('centros_custo', [{ nome: 'Operação' }, { nome: 'Comercial' }, { nome: 'Administrativo' }, { nome: 'Técnico de campo' }]);
    const [cMens, cInst, cVendaEq, cAluguel, cChips, cSal, cServ, cComb, cCompra, cImp] = many('categorias_financeiras', [
      { nome: 'Mensalidades', tipo: 'Receita' }, { nome: 'Taxa de instalação', tipo: 'Receita' }, { nome: 'Venda de equipamentos', tipo: 'Receita' },
      { nome: 'Aluguel', tipo: 'Despesa' }, { nome: 'Chips M2M', tipo: 'Despesa' }, { nome: 'Salários', tipo: 'Despesa' }, { nome: 'Servidores e software', tipo: 'Despesa' },
      { nome: 'Combustível', tipo: 'Despesa' }, { nome: 'Compra de equipamentos', tipo: 'Despesa' }, { nome: 'Impostos', tipo: 'Despesa' }]);
    const gcs = many('grupos_contas', [{ nome: 'Recorrentes' }, { nome: 'Eventuais' }]);

    // Contratos + mensalidades
    const contratos = [];
    ativos.forEach((p, i) => {
      const s = int(0, 3);
      const ini = new Date(now.getFullYear(), now.getMonth() - int(0, 17), int(1, 28));
      const fim = new Date(ini.getFullYear() + 1, ini.getMonth(), ini.getDate());
      const qtd = i < 10 ? int(3, 12) : 1;
      const valor = round2(valorServ[s] * qtd);
      const st = chance(0.06) ? 'Rescindido' : 'Ativo';
      const c = ins('contratos', { numero: `CT-${2025 + (ini.getFullYear() > 2025 ? 1 : 0)}-${String(i + 1).padStart(4, '0')}`, pessoa_id: p, servico_id: servicos[s], consultor_id: pick(consultores),
        modalidade: s === 2 ? 'Plataforma' : 'Comodato', data_inicio: D(ini), data_fim: D(fim), valor_mensal: valor, dia_vencimento: pick([5, 10, 15, 20]), qtd_veiculos: qtd, status: st, created_at: DT(ini) });
      contratos.push(c);
      ins('comissoes', { consultor_id: pick(consultores), contrato_id: c, competencia: `${String(ini.getMonth() + 1).padStart(2, '0')}/${ini.getFullYear()}`, valor: round2(valor * 0.1), status: ini < addDays(now, -40) ? 'Paga' : 'Pendente' });
      const devedor = chance(0.12);
      for (let m = 0; ; m++) {
        const venc = new Date(ini.getFullYear(), ini.getMonth() + m, 10);
        if (venc > addDays(now, 35) || (st === 'Rescindido' && m > 6)) break;
        const vencido = venc < now;
        const pago = vencido && !(devedor && venc > addDays(now, -100)) && chance(0.97);
        const dp = pago ? addDays(venc, int(-5, 6)) : null;
        ins('contas_receber', { descricao: `Mensalidade ${String(venc.getMonth() + 1).padStart(2, '0')}/${venc.getFullYear()}`, pessoa_id: p, contrato_id: c, categoria_id: cMens, centro_custo_id: ccs[0],
          grupo_conta_id: gcs[0], banco_id: pick(bancos.slice(0, 2)), valor, vencimento: D(venc), data_pagamento: dp && dp <= now ? D(dp) : null,
          valor_pago: dp && dp <= now ? valor : null, status: dp && dp <= now ? 'Pago' : 'Aberto' });
      }
      if (s !== 2) ins('contas_receber', { descricao: 'Taxa de instalação', pessoa_id: p, contrato_id: c, categoria_id: cInst, centro_custo_id: ccs[3], banco_id: bancos[0], valor: [80, 120, 0, 250][s], vencimento: D(ini), data_pagamento: D(ini), valor_pago: [80, 120, 0, 250][s], status: 'Pago' });
    });
    // Despesas mensais (12 meses + próximo)
    const fixas = [['Aluguel sede', 4500, cAluguel, ccs[2]], ['Chips M2M - operadoras', 2400, cChips, ccs[0]], ['Folha de pagamento', 28000, cSal, ccs[2]],
      ['Servidor e plataforma', 1800, cServ, ccs[0]], ['Impostos (Simples)', 3200, cImp, ccs[2]], ['Combustível técnicos', 2100, cComb, ccs[3]]];
    for (let m = -12; m <= 1; m++) {
      for (const [desc, val, cat, cc] of fixas) {
        const venc = new Date(now.getFullYear(), now.getMonth() + m, 5); const v = round2(val * (0.92 + rnd() * 0.16)); const pago = venc < now;
        ins('contas_pagar', { descricao: `${desc} ${String(venc.getMonth() + 1).padStart(2, '0')}/${venc.getFullYear()}`, fornecedor: desc.split(' ')[0], categoria_id: cat, centro_custo_id: cc, grupo_conta_id: gcs[0],
          banco_id: bancos[0], valor: v, vencimento: D(venc), data_pagamento: pago ? D(venc) : null, valor_pago: pago ? v : null, status: pago ? 'Pago' : 'Aberto' });
      }
      if (m % 3 === 0) { const venc = new Date(now.getFullYear(), now.getMonth() + m, 18); const pago = venc < now; const v = int(30, 60) * 145;
        ins('contas_pagar', { descricao: 'Compra de rastreadores', fornecedor: 'Suntech do Brasil', categoria_id: cCompra, centro_custo_id: ccs[0], grupo_conta_id: gcs[1], banco_id: bancos[1], valor: v, vencimento: D(venc), data_pagamento: pago ? D(venc) : null, valor_pago: pago ? v : null, status: pago ? 'Pago' : 'Aberto' }); }
    }
    many('contas_recorrentes', [{ descricao: 'Aluguel sede', tipo: 'Pagar', fornecedor: 'Imobiliária Centro', valor: 4500, dia_vencimento: 5, categoria_id: cAluguel, ativo: 1 },
      { descricao: 'Licença software ERP', tipo: 'Pagar', fornecedor: 'SoftBR', valor: 390, dia_vencimento: 12, categoria_id: cServ, ativo: 1 },
      { descricao: 'Locação de equipamento', tipo: 'Receber', pessoa_id: ativos[1], valor: 350, dia_vencimento: 15, categoria_id: cVendaEq, ativo: 1 }]);
    const abertas = db.prepare("SELECT id, descricao, pessoa_id, valor, vencimento FROM contas_receber WHERE status='Aberto' ORDER BY vencimento LIMIT 40").all();
    for (const c of abertas) ins('cobrancas', { descricao: c.descricao, pessoa_id: c.pessoa_id, conta_receber_id: c.id, valor: c.valor, vencimento: c.vencimento, forma: pick(['Boleto', 'Pix', 'Cartão de crédito']),
      status: c.vencimento < D(now) ? 'Vencida' : 'Pendente', linha_digitavel: `34191.79001 ${String(c.id).padStart(5, '0')}.000000 00000.000000 1 00000000${Math.round(c.valor * 100)}` });
    for (let i = 0; i < 12; i++) ins('vendas_equipamento', { equipamento_id: equipamentos[200 + i], pessoa_id: pick(ativos), consultor_id: pick(consultores), data: D(addDays(now, -int(1, 200))), valor: pick([350, 420, 590]), forma_pagamento: pick(['À vista', 'Pix', 'Cartão']) });

    // Termos, pedidos, NF
    many('termos', [{ tipo: 'Comodato', titulo: 'Termo de comodato de rastreador', conteudo: 'O COMODANTE cede ao COMODATÁRIO, a título de empréstimo gratuito, o equipamento rastreador descrito neste termo, que deverá ser devolvido ao término do contrato...', ativo: 1 },
      { tipo: 'Rescisão', titulo: 'Termo de rescisão contratual', conteudo: 'As partes resolvem rescindir o contrato de prestação de serviços de rastreamento, ficando o CONTRATANTE obrigado à devolução do equipamento em comodato...', ativo: 1 },
      { tipo: 'Uso', titulo: 'Termo de uso da plataforma', conteudo: 'Ao acessar a plataforma MG-TRACK o usuário concorda com as condições de uso, política de privacidade e tratamento de dados (LGPD)...', ativo: 1 }]);
    for (let i = 0; i < 15; i++) { const s = int(0, 3); const q = int(1, 10); ins('pedidos', { numero: `PD-${String(i + 1).padStart(4, '0')}`, pessoa_id: pick(ativos), consultor_id: pick(consultores), servico_id: servicos[s], quantidade: q, valor_total: round2(valorServ[s] * q), data: D(addDays(now, -int(0, 90))), status: pick(['Novo', 'Aprovado', 'Faturado', 'Faturado', 'Cancelado']) }); }
    const emp = ins('empresas', { razao_social: 'MG-TRACK Rastreamento Veicular Ltda', nome_fantasia: 'MG-TRACK', cnpj: cnpj(), inscricao_municipal: String(int(1000000, 9999999)), regime: 'Simples Nacional' });
    const snfs = many('servicos_nfs', [{ codigo: '01.07', descricao: 'Suporte técnico e monitoramento', aliquota_iss: 3 }, { codigo: '14.01', descricao: 'Instalação de equipamentos', aliquota_iss: 2.5 }]);
    const pagas = db.prepare("SELECT id, pessoa_id, valor, data_pagamento, descricao FROM contas_receber WHERE status='Pago' ORDER BY data_pagamento DESC LIMIT 40").all();
    pagas.forEach((c, i) => ins('notas_fiscais', { numero: String(1500 - i), pessoa_id: c.pessoa_id, empresa_id: emp, servico_nfs_id: snfs[0], conta_receber_id: c.id, valor: c.valor, data_emissao: c.data_pagamento, status: i === 7 ? 'Cancelada' : 'Emitida', descricao: c.descricao }));

    // ── Atendimentos
    const tags = many('tags', [{ nome: 'Financeiro', cor: '#8E44AD' }, { nome: 'Suporte técnico', cor: '#3598DC' }, { nome: 'Comercial', cor: '#26C281' }, { nome: 'Reclamação', cor: '#E7505A' }, { nome: 'App', cor: '#F1C40F' }]);
    const projetos = many('projetos', [{ nome: 'Migração para nova versão', status: 'Ativo' }, { nome: 'Implantação Transportadora Serra Azul', status: 'Ativo' }, { nome: 'Pesquisa de satisfação 2026', status: 'Concluído' }]);
    const ASSUNTOS = ['Veículo não atualiza posição', 'Segunda via de boleto', 'Bloqueio do veículo', 'Dúvida no aplicativo', 'Agendar instalação', 'Cancelamento de contrato', 'Alteração de plano', 'Alerta de velocidade indevido', 'Troca de titularidade', 'Senha do app'];
    for (let i = 0; i < 140; i++) {
      const ab = addMin(now, -int(10, 75 * 24 * 60)); const recente = ab > addDays(now, -5);
      const st = recente ? pick(['Aberto', 'Em andamento', 'Aguardando cliente', 'Resolvido']) : pick(['Resolvido', 'Fechado', 'Fechado', 'Resolvido', 'Aberto']);
      const fechado = ['Resolvido', 'Fechado'].includes(st);
      ins('atendimentos', { protocolo: `${ab.getFullYear()}${String(i + 1).padStart(6, '0')}`, assunto: pick(ASSUNTOS), pessoa_id: pick(ativos), origem: chance(0.25) ? 'Plataforma' : 'Cliente',
        canal: pick(['Telefone', 'WhatsApp', 'WhatsApp', 'E-mail', 'Chat']), prioridade: pick(['Baixa', 'Média', 'Média', 'Alta', 'Urgente']), status: st, tag_id: pick(tags), projeto_id: chance(0.2) ? pick(projetos) : null,
        responsavel_id: pick(usuarios.slice(1)), data_abertura: DT(ab), data_fechamento: fechado ? DT(addMin(ab, int(15, 2880))) : null, nota_nps: fechado && chance(0.6) ? pick([10, 10, 9, 9, 8, 7, 6, 4, 10, 9]) : null,
        descricao: 'Cliente entrou em contato solicitando suporte.' });
    }
    for (let i = 0; i < 18; i++) ins('chats', { contato: nomePessoa(), canal: pick(['WhatsApp', 'Chat do site', 'Instagram']), pessoa_id: chance(0.6) ? pick(ativos) : null, mensagem: pick(['Bom dia, meu carro não aparece no mapa', 'Quero contratar o rastreamento', 'Pode me enviar o boleto?', 'Obrigado pelo atendimento!']), data: DT(addMin(now, -int(1, 4000))), status: pick(['Novo', 'Em atendimento', 'Finalizado']) });

    // ── Ordens de serviço
    const catsOS = many('categorias_os', [{ nome: 'Buscar equipamento', cor: '#8E44AD' }, { nome: 'Instalação com bloqueio', cor: '#3598DC' }, { nome: 'Instalação simples', cor: '#36C6D3' }, { nome: 'Manutenção', cor: '#F1C40F' }, { nome: 'Retirada', cor: '#E7505A' }]);
    for (let i = 0; i < 320; i++) {
      const cri = addMin(now, -int(0, 365 * 24 * 60)); const ag = addMin(cri, int(60, 6 * 24 * 60)); const futuro = ag > now;
      const st = futuro ? pick(['Aberto', 'Aberto', 'Tarefa iniciada']) : pick(['Finalizado', 'Finalizado', 'Finalizado', 'Finalizado', 'Não realizado', 'Cancelado', 'Serviço iniciado']);
      const t = int(0, 4);
      ins('ordens_servico', { numero: `OS-${String(i + 1).padStart(5, '0')}`, categoria_id: pick(catsOS), pessoa_id: pick(ativos), veiculo_id: pick(veiculos), tecnico_id: tecnicos[t], estoque_id: estoques[1 + t * 2],
        status: st, data_criacao: DT(cri), data_agendamento: DT(new Date(ag.getFullYear(), ag.getMonth(), ag.getDate(), int(8, 17), pick([0, 30]))),
        data_finalizacao: st === 'Finalizado' ? DT(addMin(ag, int(30, 240))) : null, endereco: `${pick(LOCAIS)}`, valor: pick([0, 80, 120, 150]), observacao: null });
    }

    // ── Assistência veicular
    const prest = many('prestadores', ['Guincho Rápido BH', 'Auto Socorro Contagem', 'Chaveiro 24h Savassi', 'Reboque Betim', 'SOS Pneus', 'Guincho Sete Lagoas'].map(n => ({ nome: n, cnpj: cnpj(), telefone: fone(), cidade: pick(CIDADES)[0], uf: 'MG', servicos: 'Reboque, socorro mecânico' })));
    const servAss = many('servicos_assistencia', ['Reboque', 'Chaveiro', 'Pane seca', 'Troca de pneu', 'Carga de bateria', 'Táxi'].map(nome => ({ nome })));
    const motivos = many('motivos_assistencia', ['Pane mecânica', 'Pane elétrica', 'Acidente', 'Chave perdida', 'Pneu furado', 'Falta de combustível'].map(nome => ({ nome })));
    for (let i = 0; i < 25; i++) ins('solicitacoes_assistencia', { protocolo: `AST-${String(i + 1).padStart(5, '0')}`, veiculo_id: pick(veiculos), pessoa_id: pick(ativos), servico_id: pick(servAss), motivo_id: pick(motivos), prestador_id: pick(prest), local: pick(LOCAIS), data: DT(addMin(now, -int(30, 90 * 24 * 60))), status: pick(['Concluída', 'Concluída', 'Concluída', 'Em atendimento', 'Aberta', 'Cancelada']) });

    // ── Manutenções / despesas
    const planosM = [];
    for (let i = 0; i < 20; i++) { const v = veiculos[i]; const odo = db.prepare('SELECT odometro FROM veiculos WHERE id=?').get(v).odometro;
      planosM.push(ins('planos_manutencao', { nome: `${pick(['Troca de óleo', 'Revisão', 'Pneus', 'Freios'])} - ${i + 1}`, veiculo_id: v, tipo: pick(['Troca de óleo', 'Revisão', 'Pneus', 'Freios']), intervalo_km: pick([5000, 10000, 20000]), intervalo_dias: pick([90, 180, 365]), ultimo_km: odo - int(0, 12000), ultima_data: D(addDays(now, -int(10, 300))) })); }
    for (let i = 0; i < 40; i++) ins('manutencoes', { veiculo_id: pick(veiculos.slice(0, 30)), plano_id: chance(0.5) ? pick(planosM) : null, descricao: pick(['Troca de óleo e filtros', 'Revisão 40.000 km', 'Troca de pastilhas', 'Alinhamento e balanceamento', 'Troca de pneus']), data: D(addDays(now, -int(-20, 300))), km: int(10000, 200000), valor: int(150, 2500), oficina: pick(['Oficina Central', 'Auto Center BH', 'Concessionária']), status: pick(['Realizada', 'Realizada', 'Agendada']) });
    for (let i = 0; i < 160; i++) { const l = int(20, 60); ins('despesas', { veiculo_id: pick(veiculos.slice(0, 40)), tipo: chance(0.8) ? 'Combustível' : pick(['Pedágio', 'Multa', 'Estacionamento']), descricao: 'Abastecimento', data: D(addDays(now, -int(0, 60))), valor: round2(l * 6.19), litros: l, km: null }); }

    // ── Vídeo, sinistros, vistorias
    const cams = []; for (let i = 0; i < 8; i++) cams.push(ins('cameras', { nome: `CAM ${i + 1} - ${i % 2 ? 'Cabine' : 'Frontal'}`, veiculo_id: veiculos[i], canal: (i % 2) + 1, url_stream: '', status: chance(0.75) ? 'Online' : 'Offline' }));
    for (let i = 0; i < 30; i++) { const ini = addMin(now, -int(10, 15 * 24 * 60)); ins('gravacoes', { camera_id: pick(cams), inicio: DT(ini), fim: DT(addMin(ini, int(1, 10))), evento: pick(['Excesso de velocidade', 'Frenagem brusca', 'Botão de pânico', 'Manual']) }); }
    const tiposS = many('tipos_sinistro', ['Roubo', 'Furto', 'Acidente', 'Incêndio', 'Alagamento'].map(nome => ({ nome })));
    const catsS = many('categorias_ocorrencia', ['Ocorrência policial', 'Colisão', 'Danos a terceiros', 'Perda total'].map(nome => ({ nome })));
    for (let i = 0; i < 12; i++) ins('sinistros', { protocolo: `SIN-${String(i + 1).padStart(5, '0')}`, veiculo_id: pick(veiculos), pessoa_id: pick(ativos), tipo_id: pick(tiposS), categoria_id: pick(catsS), data: DT(addMin(now, -int(60, 200 * 24 * 60))), local: pick(LOCAIS), status: pick(['Recuperado', 'Recuperado', 'Em análise', 'Indenizado', 'Encerrado', 'Aberto']), descricao: 'Registro de ocorrência com acionamento da central.' });
    const [qV] = many('questionarios', [{ nome: 'Vistoria de instalação', modulo: 'Vistoria', perguntas: 'Painel sem avarias?\nLuzes funcionando?\nBateria em bom estado?\nEquipamento oculto corretamente?', ativo: 1 },
      { nome: 'Checklist diário do motorista', modulo: 'CheckSystem', perguntas: 'Pneus calibrados?\nNível de óleo ok?\nDocumentos no veículo?\nExtintor válido?', ativo: 1 }]);
    for (let i = 0; i < 15; i++) ins('vistorias', { questionario_id: qV, veiculo_id: pick(veiculos), responsavel: pick(['Anderson Técnico', 'Bruno Instalador', 'Cláudio Campo']), data: D(addDays(now, -int(0, 60))), respostas: 'Painel sem avarias? Sim\nLuzes funcionando? Sim\nBateria em bom estado? Sim\nEquipamento oculto corretamente? Sim', resultado: pick(['Aprovado', 'Aprovado', 'Reprovado', 'Pendente']) });
    many('formularios_check', [{ nome: 'Checklist de saída de frota', descricao: 'Preenchido na saída do veículo', campos: 'Km inicial\nNível de combustível\nFotos do veículo', ativo: 1 }, { nome: 'Checklist de retorno', descricao: 'Preenchido no retorno', campos: 'Km final\nAvarias\nObservações', ativo: 1 }]);

    // ── Comunicação
    many('anuncios', [{ titulo: 'Manutenção programada', mensagem: 'A plataforma passará por manutenção no domingo das 02h às 04h.', publico: 'Todos', inicio: D(addDays(now, -2)), fim: D(addDays(now, 5)), ativo: 1 },
      { titulo: 'Novo app disponível', mensagem: 'Baixe a nova versão do aplicativo MG-TRACK para Android e iOS.', publico: 'Clientes', inicio: D(addDays(now, -10)), fim: D(addDays(now, 20)), ativo: 1 }]);
    many('config_notificacao', [{ canal: 'SMS', provedor: 'Zenvia', remetente: 'MGTRACK', ativo: 1 }, { canal: 'WhatsApp', provedor: 'API oficial Meta', remetente: '(31) 3333-0000', ativo: 1 },
      { canal: 'E-mail', provedor: 'SMTP', remetente: 'naoresponda@mgtrack.local', ativo: 1 }, { canal: 'Push', provedor: 'Firebase', remetente: 'MG-TRACK App', ativo: 1 }]);
    for (let i = 0; i < 60; i++) ins('mensagens', { canal: pick(['SMS', 'WhatsApp', 'E-mail', 'Push']), destinatario: chance(0.5) ? fone() : `cliente${int(1, 66)}@email.com`, mensagem: pick(['Alerta: excesso de velocidade no veículo', 'Sua fatura vence amanhã', 'Veículo entrou na cerca', 'Bem-vindo à MG-TRACK']), data: DT(addMin(now, -int(1, 30 * 24 * 60))), status: chance(0.93) ? 'Enviada' : 'Falhou' });
    many('novidades', [{ titulo: 'Novo módulo de Videomonitoramento', versao: '5.2', data: D(addDays(now, -5)), conteudo: 'Acompanhe as câmeras dos veículos ao vivo e acesse o histórico de gravações.' },
      { titulo: 'CheckSystem: formulários personalizados', versao: '5.1', data: D(addDays(now, -20)), conteudo: 'Crie checklists e questionários para motoristas e técnicos.' },
      { titulo: 'Comandos personalizados por modelo', versao: '5.0', data: D(addDays(now, -45)), conteudo: 'Cadastre strings de comando específicas para cada modelo de rastreador.' },
      { titulo: 'Relatório de jornada de motorista', versao: '4.9', data: D(addDays(now, -80)), conteudo: 'Controle de horas de direção conforme a Lei do Motorista.' }]);

    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}

module.exports = { run };
