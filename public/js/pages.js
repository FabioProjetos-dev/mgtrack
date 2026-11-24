// Páginas especiais (dashboards, monitoramento, agenda, relatórios...)
if (window.Chart) {
  Chart.defaults.font.family = '"Open Sans", sans-serif';
  Chart.defaults.color = '#666';
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
}
function chart(canvas, cfg) {
  if (!window.Chart) { canvas.parentElement.innerHTML = '<p class="text-muted">Biblioteca de gráficos indisponível (sem internet?).</p>'; return null; }
  const c = new Chart(canvas, cfg);
  onLeave(() => c.destroy());
  return c;
}
const CONN = {
  online: { label: 'Veículos Online', color: '#26C281', route: '/relatorio/rel-online/' },
  off24: { label: 'Offline até 24h', color: '#F1C40F', route: '/relatorio/rel-offline/1/' },
  off36: { label: 'Offline até 36h', color: '#E7505A', route: '/relatorio/rel-offline/2/' },
  off36p: { label: 'Offline +36h', color: '#E7505A', route: '/relatorio/rel-offline/3/' },
};
const go = r => { location.hash = '#' + r; };
const monthOptions = (n, sel) => { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); const v = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; out.push(`<option value="${v}" ${v === sel ? 'selected' : ''}>${pad(x.getMonth() + 1)}/${x.getFullYear()}</option>`); } return out.join(''); };
const statCard = (cls, icon, num, desc, route) => `<a class="stat ${cls}" href="#${route}"><i class="fa ${icon} bg-icon"></i><div class="num">${num}</div><div class="desc">${esc(desc)}</div><div class="more"><span>Ver mais</span><i class="fa fa-arrow-circle-right"></i></div></a>`;

const Pages = {};

// ───────────────────────────── Dashboard de Gestão
Pages.dashGestao = async el => {
  const os = { tecnicos: [], categorias: [], status: [], estoque: '', periodo: 'criacao' };
  let mes = '';
  el.innerHTML = '<div class="loading">Carregando dashboard...</div>';
  const [tecs, cats, ests] = await Promise.all([options('tecnicos'), options('categorias_os'), options('estoques')]);
  let charts = {};

  async function load(first) {
    const d = await api('/dashboard/gestao' + qs({ mes, periodo: os.periodo, tecnicos: os.tecnicos.join(','), categorias: os.categorias.join(','), status: os.status.join(','), estoque: os.estoque }));
    mes = d.mes;
    if (first) renderAll(d); else renderOS(d);
  }

  function renderAll(d) {
    const c = d.cards;
    el.innerHTML = `
      <div class="stats">
        ${statCard('blue', 'fa-car', c.veiculos, 'Total de Veículos', '/veiculo/list/')}
        ${statCard('red', 'fa-handshake', c.comodato, 'Clientes Comodato', '/pessoa/')}
        ${statCard('cyan', 'fa-desktop', c.plataforma, 'Clientes Plataforma', '/pessoa/')}
        ${statCard('purple', 'fa-boxes-stacked', c.estoque, 'Rastreadores em Estoque', '/equipamento/estoque/')}
      </div>
      ${portlet({ title: 'Status de conectividade da frota', icon: 'fa-signal', body: `<div class="gauges">${Object.entries(CONN).map(([k, g]) => `
        <div class="gauge" data-go="${g.route}"><div class="ring"><canvas data-gauge="${k}"></canvas><div class="pct">${d.conn.total ? Math.round(d.conn[k] / d.conn.total * 100) : 0}%<small>${d.conn[k]} veíc.</small></div></div>
        <div class="g-title">${g.label}</div></div>`).join('')}</div>` })}
      <div class="grid-2 row-gap">
        ${portlet({ title: 'Vendas', icon: 'fa-chart-column', collapsible: true, tools: `<select class="input input-sm" data-mes>${monthOptions(13, d.mes)}</select>`, body: '<div class="chart-box"><canvas data-vendas></canvas></div>' })}
        ${portlet({ title: 'Aniversariantes', icon: 'fa-cake-candles', body: `<div class="tabs"><button data-tab="passado">Mês passado</button><button data-tab="atual" class="on">Este mês</button><button data-tab="proximo">Próximo mês</button></div><div data-aniv></div>` })}
      </div>
      ${portlet({ title: 'Ordens de serviço', icon: 'fa-screwdriver-wrench', collapsible: true, body: `
        <div class="toolbar">
          <div data-ms-tec></div>
          <select class="input input-sm" data-estoque><option value="">Estoque: todos</option>${ests.map(e => `<option value="${e.id}">${esc(e.label)}</option>`).join('')}</select>
          <div data-ms-cat></div>
          <select class="input input-sm" data-periodo><option value="criacao">Período: Criação</option><option value="agendamento">Período: Agendamento</option><option value="finalizado">Período: Finalizado</option></select>
          <div data-ms-st></div>
        </div>
        <div class="chart-box"><canvas data-os></canvas></div>` })}
      <div class="grid-3 row-gap">
        ${healthWidget('Veículos com excesso de posições', 'fa-tower-broadcast', d.saude.excesso, r => `<td>${esc(r.placa)}</td><td class="num">${r.posicoes}</td>`, ['Veículo', 'Posições'])}
        ${healthWidget('Prováveis equipamentos travados', 'fa-triangle-exclamation', d.saude.travados, r => `<td>${esc(r.placa)}</td><td>${ago(r.ultima_posicao)}</td><td>${ago(r.ultima_conexao)}</td>`, ['Veículo', 'Últ. posição', 'Últ. conexão'])}
        ${healthWidget('Veículos com posição antiga', 'fa-clock-rotate-left', d.saude.antiga, r => `<td>${esc(r.placa)}</td><td>${fmt.datetime(r.ultima_posicao)}</td><td>${fmt.datetime(r.ultima_conexao)}</td>`, ['Veículo', 'Última posição', 'Última conexão'])}
      </div>`;

    for (const k of Object.keys(CONN)) {
      const v = d.conn[k], t = d.conn.total || 1;
      chart($(`[data-gauge="${k}"]`, el), { type: 'doughnut', data: { datasets: [{ data: [v, t - v], backgroundColor: [CONN[k].color, '#EEF1F5'], borderWidth: 0 }] },
        options: { cutout: '80%', responsive: true, maintainAspectRatio: true, events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 700 } } });
    }
    $$('[data-go]', el).forEach(g => g.onclick = () => go(g.dataset.go));

    charts.vendas = chart($('[data-vendas]', el), { type: 'bar', data: vendasData(d.vendas),
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: ctx => 'Mensalidades: ' + fmt.money(d.vendas[ctx.dataIndex]?.valor) } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    $('[data-mes]', el).onchange = async e => {
      mes = e.target.value;
      const nd = await api('/dashboard/gestao' + qs({ mes }));
      charts.vendas.data = vendasData(nd.vendas); charts.vendas.options.plugins.tooltip.callbacks.afterLabel = ctx => 'Mensalidades: ' + fmt.money(nd.vendas[ctx.dataIndex]?.valor); charts.vendas.update();
    };

    const aniv = which => {
      const list = d.aniversariantes[which];
      const box = $('[data-aniv]', el);
      const row = p => `<div class="person"><div class="avatar">${esc((p.nome || '?')[0])}</div><div class="grow"><div>${esc(p.nome)}</div><small class="text-muted">${esc(p.telefone || '')}</small></div><div class="dt">${fmt.date(p.data_nascimento).slice(0, 5)}</div></div>`;
      box.innerHTML = list.length ? `<div class="widget-list">${list.slice(0, 6).map(row).join('')}<div data-rest style="display:none">${list.slice(6).map(row).join('')}</div></div>
        ${list.length > 6 ? `<p style="text-align:center;margin:10px 0 0"><a href="javascript:void 0" data-more>Mostrar mais (${list.length - 6})</a></p>` : ''}` : '<p class="text-muted placeholder">Nenhum aniversariante.</p>';
      $('[data-more]', box)?.addEventListener('click', e => { $('[data-rest]', box).style.display = ''; e.target.remove(); });
    };
    $$('[data-tab]', el).forEach(b => b.onclick = () => { $$('[data-tab]', el).forEach(x => x.classList.toggle('on', x === b)); aniv(b.dataset.tab); });
    aniv('atual');

    multiSelect($('[data-ms-tec]', el), { label: 'Técnicos', items: tecs, onChange: v => { os.tecnicos = v; load(); }, extraLink: { href: '#/ordem_servico/tecnico/list/', label: 'Cadastrar' } });
    multiSelect($('[data-ms-cat]', el), { label: 'Categorias', items: cats, onChange: v => { os.categorias = v; load(); } });
    multiSelect($('[data-ms-st]', el), { label: 'Status', items: ['Aberto', 'Tarefa iniciada', 'Serviço iniciado', 'Não realizado', 'Finalizado', 'Cancelado'].map(s => ({ id: s, label: s })), onChange: v => { os.status = v; load(); } });
    $('[data-estoque]', el).onchange = e => { os.estoque = e.target.value; load(); };
    $('[data-periodo]', el).onchange = e => { os.periodo = e.target.value; load(); };
    charts.os = chart($('[data-os]', el), { type: 'bar', data: osData(d.os),
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  function renderOS(d) { if (charts.os) { charts.os.data = osData(d.os); charts.os.update(); } }
  const vendasData = v => ({ labels: v.length ? v.map(x => x.consultor) : ['Sem vendas no mês'], datasets: [{ label: 'Vendas', data: v.length ? v.map(x => x.qtd) : [0], backgroundColor: '#67B7DC', borderRadius: 3, maxBarThickness: 60 }] });
  const osData = o => ({ labels: o.months.map(fmt.monthLabel), datasets: o.series.map(s => ({ label: s.nome, data: s.data, backgroundColor: s.cor || '#67B7DC', maxBarThickness: 46 })) });
  function healthWidget(title, icon, rows, tr, heads) {
    return portlet({ title, icon, tools: '<span class="label info">Hoje</span>', body: `<div class="widget-list"><table class="tbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>${tr(r)}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty"><i class="fa fa-circle-check" style="color:#26C281"></i> Nenhum veículo</td></tr>`}</tbody></table></div>` });
  }
  await load(true);
};

// ───────────────────────────── Dashboard Financeiro
Pages.dashFinanceiro = async el => {
  let mes = '';
  async function load() {
    const d = await api('/dashboard/financeiro' + qs({ mes }));
    mes = d.mes;
    runCleanup();
    const c = d.cards;
    el.innerHTML = `
      <div class="toolbar"><label class="lb" style="margin:0">Competência</label><select class="input input-sm" data-mes>${monthOptions(13, d.mes)}</select></div>
      <div class="stats">
        ${statCard('cyan', 'fa-arrow-trend-up', fmt.money(c.receber.s), `A receber no mês (${c.receber.n})`, '/financeiro/contas-receber/')}
        ${statCard('green', 'fa-hand-holding-dollar', fmt.money(c.recebido.s), `Recebido no mês (${c.recebido.n})`, '/financeiro/contas-receber/')}
        ${statCard('red', 'fa-arrow-trend-down', fmt.money(c.pagar.s), `A pagar no mês (${c.pagar.n})`, '/financeiro/contas-pagar/')}
        ${statCard('dark', 'fa-user-clock', fmt.money(c.inadimplencia.s), `Inadimplência (${c.inadimplencia.n} títulos)`, '/financeiro/rel-inadimplentes')}
      </div>
      <div class="grid-2 row-gap">
        ${portlet({ title: 'Receitas x Despesas (realizado)', icon: 'fa-chart-column', collapsible: true, body: '<div class="chart-box"><canvas data-serie></canvas></div>' })}
        ${portlet({ title: 'Despesas por categoria', icon: 'fa-chart-pie', body: '<div class="chart-box"><canvas data-cat></canvas></div>' })}
      </div>
      <div class="grid-2 row-gap">
        ${portlet({ title: 'Maiores inadimplentes', icon: 'fa-user-clock', body: `<div class="widget-list"><table class="tbl"><thead><tr><th>Cliente</th><th class="num">Títulos</th><th class="num">Valor</th><th>Desde</th></tr></thead><tbody>
          ${d.inadimplentes.map(r => `<tr><td>${esc(r.nome)}</td><td class="num">${r.qtd}</td><td class="num">${fmt.money(r.total)}</td><td>${fmt.date(r.desde)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum</td></tr>'}</tbody></table></div>` })}
        ${portlet({ title: 'Próximos vencimentos', icon: 'fa-calendar-day', body: `<div class="widget-list"><table class="tbl"><thead><tr><th>Vencimento</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
          ${d.proximas.map(r => `<tr><td>${fmt.date(r.vencimento)}</td><td><span class="label ${r.tipo === 'Receber' ? 'success' : 'danger'}">${r.tipo}</span></td><td>${esc(r.descricao)}</td><td class="num">${fmt.money(r.valor)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum</td></tr>'}</tbody></table></div>` })}
      </div>`;
    $('[data-mes]', el).onchange = e => { mes = e.target.value; load(); };
    chart($('[data-serie]', el), { type: 'bar', data: { labels: d.serie.months.map(fmt.monthLabel), datasets: [
      { label: 'Receitas', data: d.serie.receitas, backgroundColor: '#26C281', borderRadius: 3 }, { label: 'Despesas', data: d.serie.despesas, backgroundColor: '#E7505A', borderRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt.money(c.raw)}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => 'R$ ' + nf.format(v / 1000) + 'k' } } } } });
    chart($('[data-cat]', el), { type: 'doughnut', data: { labels: d.porCategoria.map(x => x.nome), datasets: [{ data: d.porCategoria.map(x => x.s), backgroundColor: ['#3598DC', '#E7505A', '#32C5D2', '#8E44AD', '#F1C40F', '#26C281', '#67B7DC', '#5C6D7E'], borderWidth: 1 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${fmt.money(c.raw)}` } } } } });
  }
  await load();
};

// ───────────────────────────── Dashboard de Atendimentos
Pages.dashAtendimentos = async el => {
  const d = await api('/dashboard/atendimentos');
  const by = (arr, k) => arr.find(x => x.k === k)?.n || 0;
  const abertos = by(d.status, 'Aberto'), andamento = by(d.status, 'Em andamento') + by(d.status, 'Aguardando cliente'), resolvidos = by(d.status, 'Resolvido') + by(d.status, 'Fechado');
  const nps = d.nps.n ? Math.round((d.nps.prom - d.nps.detr) / d.nps.n * 100) : 0;
  el.innerHTML = `
    <div class="stats">
      ${statCard('blue', 'fa-inbox', abertos, 'Abertos', '/atendimentos/')}
      ${statCard('yellow', 'fa-spinner', andamento, 'Em andamento / aguardando', '/atendimentos/')}
      ${statCard('green', 'fa-circle-check', resolvidos, 'Resolvidos / fechados', '/atendimentos/')}
      ${statCard('purple', 'fa-star', nps, `NPS (${d.nps.n} respostas)`, '/atendimentos/rel-services-nps/')}
    </div>
    <div class="grid-3 row-gap">
      ${portlet({ title: 'Por canal', icon: 'fa-comments', body: '<div class="chart-box"><canvas data-canal></canvas></div>' })}
      ${portlet({ title: 'Pendentes por prioridade', icon: 'fa-flag', body: '<div class="chart-box"><canvas data-prio></canvas></div>' })}
      ${portlet({ title: 'Por responsável', icon: 'fa-headset', body: `<p class="text-muted">Tempo médio de resolução: <b>${d.tempoMedioH ? nf.format(d.tempoMedioH) + ' h' : '-'}</b></p>
        <table class="tbl"><thead><tr><th>Responsável</th><th class="num">Total</th><th class="num">Resolvidos</th></tr></thead><tbody>
        ${d.responsaveis.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${r.n}</td><td class="num">${r.resolvidos}</td></tr>`).join('')}</tbody></table>` })}
    </div>`;
  chart($('[data-canal]', el), { type: 'doughnut', data: { labels: d.canal.map(x => x.k), datasets: [{ data: d.canal.map(x => x.n), backgroundColor: ['#3598DC', '#26C281', '#8E44AD', '#32C5D2', '#F1C40F'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
  const prios = ['Baixa', 'Média', 'Alta', 'Urgente'];
  chart($('[data-prio]', el), { type: 'bar', data: { labels: prios, datasets: [{ data: prios.map(p => by(d.prioridade, p)), backgroundColor: ['#659BE0', '#32C5D2', '#F1C40F', '#E7505A'], borderRadius: 3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
};

// ───────────────────────────── Painel de Monitoramento (mapa)
function vColor(v) { if (v.conexao === 'online') return v.bloqueado ? '#8E44AD' : v.ignicao ? '#26C281' : '#3598DC'; return v.conexao === 'off24' ? '#F1C40F' : '#E7505A'; }
const CONN_TXT = { online: 'Online', off24: 'Offline ≤24h', off36: 'Offline ≤36h', off36p: 'Offline +36h' };
const vIcon = t => ({ Moto: 'fa-motorcycle', 'Caminhão': 'fa-truck', 'Utilitário': 'fa-truck-pickup' }[t] || 'fa-car');
const MONITOR_FILTERS = { todos: ['Todos', () => true], online: ['Online', v => v.conexao === 'online'], mov: ['Em movimento', v => v.conexao === 'online' && v.velocidade > 0],
  off24: ['≤24h', v => v.conexao === 'off24'], off36: ['≤36h', v => v.conexao === 'off36'], off36p: ['+36h', v => v.conexao === 'off36p'], bloq: ['Bloqueados', v => v.bloqueado] };

async function sendCommand(veiculo_id, comando, parametros) {
  try { await api('/e/comandos', { method: 'POST', body: { veiculo_id, comando, parametros } }); toast(`Comando "${comando}" enfileirado.`); }
  catch (e) { toast(e.message, true); }
}
function popupHTML(v) {
  return `<div class="popup"><b><i class="fa ${vIcon(v.tipo)}"></i> ${esc(v.placa)}</b> <span class="label" style="background:${vColor(v)}">${CONN_TXT[v.conexao]}</span>
    <table><tr><td>Veículo</td><td>${esc(v.marca)} ${esc(v.modelo || '')}</td></tr><tr><td>Cliente</td><td>${esc(v.cliente || '-')}</td></tr>
    <tr><td>Motorista</td><td>${esc(v.motorista || '-')}</td></tr><tr><td>Velocidade</td><td>${v.velocidade || 0} km/h</td></tr>
    <tr><td>Ignição</td><td>${v.ignicao ? 'Ligada' : 'Desligada'}${v.bloqueado ? ' · <b style="color:#8E44AD">BLOQUEADO</b>' : ''}</td></tr>
    <tr><td>Odômetro</td><td>${fmt.km(v.odometro)}</td></tr><tr><td>Posição</td><td>${fmt.datetime(v.ultima_posicao)}</td></tr><tr><td>Conexão</td><td>${fmt.datetime(v.ultima_conexao)}</td></tr></table>
    <div class="btns"><button class="btn btn-sm btn-red" data-cmd="Bloquear" data-v="${v.id}"><i class="fa fa-lock"></i> Bloquear</button>
    <button class="btn btn-sm btn-green" data-cmd="Desbloquear" data-v="${v.id}"><i class="fa fa-lock-open"></i> Desbloquear</button>
    <button class="btn btn-sm btn-outline" data-cmd="Solicitar posição" data-v="${v.id}"><i class="fa fa-location-crosshairs"></i></button>
    <a class="btn btn-sm btn-outline" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${v.lat},${v.lng}"><i class="fa fa-map-location-dot"></i></a></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]');
  if (b) sendCommand(+b.dataset.v, b.dataset.cmd);
});

Pages.monitor = async el => {
  let filter = 'todos', q = '', data = { veiculos: [], cercas: [], eventos: [] }, sel = null, fitted = false;
  el.innerHTML = `<div class="monitor"><div class="side"><div class="side-head">
      <div class="search-box" style="width:100%"><i class="fa fa-search"></i><input class="input input-sm" style="width:100%" data-q placeholder="Placa, cliente ou motorista"></div>
      <div class="chips">${Object.entries(MONITOR_FILTERS).map(([k, [l]]) => `<button class="chip-f ${k === filter ? 'on' : ''}" data-f="${k}">${l} <b data-cnt="${k}"></b></button>`).join('')}</div>
    </div><div class="vlist" data-list></div></div><div id="map"></div></div>
    <div style="height:20px"></div>
    ${portlet({ title: 'Eventos não tratados', icon: 'fa-bell', tools: '<a href="#/veiculo/monitoramento-eventos/" class="btn btn-sm btn-outline">Ver todos</a>', body: '<div class="ev-feed" data-ev></div>' })}`;
  if (!window.L) { $('#map').innerHTML = '<p class="placeholder">Biblioteca de mapas indisponível (sem internet?).</p>'; }
  const map = window.L ? L.map('map', { zoomControl: true }).setView([-19.92, -43.94], 11) : null;
  if (map) {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    onLeave(() => map.remove());
  }
  const markers = new Map(); let cercaLayer = null;

  function renderList() {
    const fn = MONITOR_FILTERS[filter][1];
    const qq = q.toLowerCase();
    const list = data.veiculos.filter(v => fn(v) && (!qq || [v.placa, v.cliente, v.motorista].some(x => (x || '').toLowerCase().includes(qq))));
    for (const [k, [, f]] of Object.entries(MONITOR_FILTERS)) { const c = $(`[data-cnt="${k}"]`, el); if (c) c.textContent = data.veiculos.filter(f).length; }
    $('[data-list]', el).innerHTML = list.map(v => `<div class="vitem ${sel === v.id ? 'sel' : ''}" data-vid="${v.id}"><span class="dot" style="background:${vColor(v)}"></span>
      <div class="grow"><div class="pl">${esc(v.placa)} <small class="text-muted">${esc(v.marca)} ${esc(v.modelo || '')}</small></div><div class="sub">${esc(v.cliente || '')}</div></div>
      <div class="spd">${v.conexao === 'online' ? `${v.velocidade || 0} km/h` : ''}<div class="sub">${ago(v.ultima_conexao)}</div></div></div>`).join('') || '<p class="placeholder">Nenhum veículo</p>';
    if (map) for (const [id, m] of markers) { const v = data.veiculos.find(x => x.id === id); const show = v && list.includes(v); if (show && !map.hasLayer(m)) m.addTo(map); if (!show && map.hasLayer(m)) m.remove(); }
  }
  function renderMap() {
    if (!map) return;
    for (const v of data.veiculos) {
      if (v.lat == null) continue;
      const icon = L.divIcon({ className: '', html: `<div class="mk" style="background:${vColor(v)}"><i class="fa ${vIcon(v.tipo)}"></i></div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      let m = markers.get(v.id);
      if (!m) { m = L.marker([v.lat, v.lng], { icon, title: v.placa }).bindPopup('', { minWidth: 250 }); m.on('click', () => { sel = v.id; renderList(); }); markers.set(v.id, m); }
      else { m.setLatLng([v.lat, v.lng]); m.setIcon(icon); }
      m.setPopupContent(popupHTML(v));
    }
    if (!cercaLayer) { cercaLayer = L.layerGroup(data.cercas.map(c => L.circle([c.lat, c.lng], { radius: c.raio || 300, color: c.cor || '#36C6D3', weight: 2, fillOpacity: .08 }).bindTooltip(c.nome))).addTo(map); }
    if (!fitted && data.veiculos.length) { fitted = true; const pts = data.veiculos.filter(v => v.lat != null).map(v => [v.lat, v.lng]); if (pts.length) map.fitBounds(pts, { padding: [30, 30] }); }
  }
  function renderEvents() {
    $('[data-ev]', el).innerHTML = data.eventos.length ? `<table class="tbl"><tbody>${data.eventos.map(e => `<tr><td>${fmt.datetime(e.data)}</td><td><b>${esc(e.placa || '')}</b></td>
      <td><span class="label ${['Botão de pânico', 'Bateria violada', 'Violação de âncora'].includes(e.tipo) ? 'danger' : e.tipo === 'Excesso de velocidade' ? 'warning' : 'info'}">${esc(e.tipo)}</span></td><td>${esc(e.descricao || '')}</td>
      <td class="actions"><button class="btn btn-sm btn-outline" data-loc="${e.veiculo_id}"><i class="fa fa-location-dot"></i></button> <button class="btn btn-sm btn-primary" data-tratar="${e.id}"><i class="fa fa-check"></i> Tratar</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="placeholder">Nenhum evento pendente.</p>';
  }
  async function load() {
    try { data = await api('/monitor'); renderMap(); renderList(); renderEvents(); } catch (e) { console.error(e); }
  }
  function focus(id) {
    const v = data.veiculos.find(x => x.id === id); sel = id; renderList();
    const m = markers.get(id);
    if (map && m && v) { if (!map.hasLayer(m)) m.addTo(map); map.setView([v.lat, v.lng], 15); m.openPopup(); }
  }
  el.addEventListener('click', async e => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === f)); renderList(); }
    const it = e.target.closest('[data-vid]'); if (it) focus(+it.dataset.vid);
    const lo = e.target.closest('[data-loc]'); if (lo) { focus(+lo.dataset.loc); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    const tr = e.target.closest('[data-tratar]');
    if (tr) { const t = await promptDialog('Tratar evento', 'Descreva a tratativa'); if (t === null) return; await api(`/action/eventos/${tr.dataset.tratar}/tratar`, { method: 'POST', body: { input: t } }); toast('Evento tratado.'); load(); }
  });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; renderList(); });
  await load();
  const iv = setInterval(load, 15000); onLeave(() => clearInterval(iv));
};

// ───────────────────────────── Painel de Monitoramento 2 (grade)
Pages.monitor2 = async el => {
  let filter = 'todos', q = '', data = { veiculos: [] };
  el.innerHTML = portlet({ title: 'Painel de monitoramento — grade', icon: 'fa-table-cells', tools: '<span class="text-muted" data-upd style="font-size:12px"></span>', body: `
    <div class="toolbar"><div class="search-box"><i class="fa fa-search"></i><input class="input input-sm" data-q placeholder="Pesquisar..."></div>
    <div class="chips" style="display:flex;gap:4px;flex-wrap:wrap">${Object.entries(MONITOR_FILTERS).map(([k, [l]]) => `<button class="chip-f ${k === filter ? 'on' : ''}" data-f="${k}">${l} <b data-cnt="${k}"></b></button>`).join('')}</div></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>Placa</th><th>Veículo</th><th>Cliente</th><th>Motorista</th><th>Grupo</th><th class="num">Velocidade</th><th>Ignição</th><th>Bloqueio</th><th>Última posição</th><th>Conexão</th><th></th></tr></thead><tbody data-body></tbody></table></div>` });
  function render() {
    const fn = MONITOR_FILTERS[filter][1]; const qq = q.toLowerCase();
    for (const [k, [, f]] of Object.entries(MONITOR_FILTERS)) $(`[data-cnt="${k}"]`, el).textContent = data.veiculos.filter(f).length;
    const list = data.veiculos.filter(v => fn(v) && (!qq || [v.placa, v.cliente, v.motorista, v.imei].some(x => (x || '').toLowerCase().includes(qq))));
    $('[data-body]', el).innerHTML = list.map(v => `<tr><td><span class="vitem" style="padding:0;border:0;display:inline"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${vColor(v)}"></span></span></td>
      <td><b>${esc(v.placa)}</b></td><td>${esc(v.marca)} ${esc(v.modelo || '')}</td><td>${esc(v.cliente || '')}</td><td>${esc(v.motorista || '')}</td><td>${esc(v.grupo || '')}</td>
      <td class="num">${v.conexao === 'online' ? (v.velocidade || 0) + ' km/h' : '-'}</td><td>${v.ignicao ? '<span class="label success">Ligada</span>' : '<span class="label">Desligada</span>'}</td>
      <td>${v.bloqueado ? '<span class="label purple">Bloqueado</span>' : ''}</td><td>${ago(v.ultima_posicao)}</td><td><span class="label" style="background:${vColor(v)}">${CONN_TXT[v.conexao]}</span></td>
      <td class="actions"><button class="btn btn-sm btn-outline" data-mapa="${v.id}" title="Ver no mapa"><i class="fa fa-map-location-dot"></i></button></td></tr>`).join('') || '<tr><td colspan="12" class="empty">Nenhum veículo</td></tr>';
    $('[data-upd]', el).textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
  }
  async function load() { try { data = await api('/monitor'); render(); } catch (e) { console.error(e); } }
  el.addEventListener('click', e => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === f)); render(); }
    const mp = e.target.closest('[data-mapa]');
    if (mp && window.L) {
      const v = data.veiculos.find(x => x.id === +mp.dataset.mapa);
      const m = modal({ title: `${v.placa} — ${v.marca} ${v.modelo || ''}`, body: '<div id="mini-map" style="height:380px"></div>' });
      const mm = L.map('mini-map').setView([v.lat, v.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mm);
      L.marker([v.lat, v.lng], { icon: L.divIcon({ className: '', html: `<div class="mk" style="background:${vColor(v)}"><i class="fa ${vIcon(v.tipo)}"></i></div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(mm).bindPopup(popupHTML(v), { minWidth: 250 }).openPopup();
      new MutationObserver((_, o) => { if (!document.body.contains(m.el)) { mm.remove(); o.disconnect(); } }).observe(document.body, { childList: true });
    }
  });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; render(); });
  await load();
  const iv = setInterval(load, 15000); onLeave(() => clearInterval(iv));
};

// ───────────────────────────── Envio de comandos (massa / offline)
function commandPage(onlyOffline) {
  return async el => {
    const [mon, grupos] = await Promise.all([api('/monitor'), options('grupos_veiculo')]);
    let grupo = '', q = '';
    const base = onlyOffline ? mon.veiculos.filter(v => v.conexao !== 'online') : mon.veiculos;
    const chosen = new Set();
    el.innerHTML = `${onlyOffline ? `<div class="alert alert-info"><i class="fa fa-circle-info"></i><div class="grow">Os comandos enviados a equipamentos offline ficam <b>pendentes</b> e são entregues automaticamente quando o equipamento reconectar.</div></div>` : ''}
      ${portlet({ title: onlyOffline ? 'Comandos para equipamentos offline' : 'Envio de comandos em massa', icon: 'fa-satellite-dish', body: `
      <div class="toolbar">
        <select class="input input-sm" data-grupo><option value="">Grupo: todos</option>${grupos.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select>
        <div class="search-box"><i class="fa fa-search"></i><input class="input input-sm" data-q placeholder="Placa ou cliente"></div>
        <span class="grow"></span>
        <select class="input input-sm" data-cmd-sel>${['Bloquear', 'Desbloquear', 'Solicitar posição', 'Reiniciar', 'Configurar intervalo', 'Personalizado'].map(c => `<option>${c}</option>`).join('')}</select>
        <input class="input input-sm" data-param placeholder="Parâmetros (opcional)">
        <button class="btn btn-primary" data-send><i class="fa fa-paper-plane"></i> Enviar para <span data-n>0</span> veículo(s)</button>
      </div>
      <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th><input type="checkbox" data-all></th><th>Placa</th><th>Veículo</th><th>Cliente</th><th>Grupo</th><th>IMEI</th><th>Conexão</th></tr></thead><tbody data-body></tbody></table></div>` })}
      ${portlet({ title: onlyOffline ? 'Comandos pendentes' : 'Últimos comandos', icon: 'fa-clock-rotate-left', body: '<div data-hist></div>' })}`;
    const visible = () => base.filter(v => (!grupo || String(v.grupo_id) === grupo) && (!q || [v.placa, v.cliente].some(x => (x || '').toLowerCase().includes(q.toLowerCase()))));
    function render() {
      $('[data-body]', el).innerHTML = visible().map(v => `<tr><td><input type="checkbox" data-ck="${v.id}" ${chosen.has(v.id) ? 'checked' : ''}></td><td><b>${esc(v.placa)}</b></td><td>${esc(v.marca)} ${esc(v.modelo || '')}</td>
        <td>${esc(v.cliente || '')}</td><td>${esc(v.grupo || '')}</td><td class="mono">${esc(v.imei || '')}</td><td><span class="label" style="background:${vColor(v)}">${CONN_TXT[v.conexao]}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhum veículo</td></tr>';
      $('[data-n]', el).textContent = chosen.size;
    }
    async function hist() {
      const d = await api('/e/comandos' + qs({ limit: 20, status: onlyOffline ? 'Pendente' : '' }));
      $('[data-hist]', el).innerHTML = `<table class="tbl"><thead><tr><th>Envio</th><th>Veículo</th><th>Comando</th><th>Status</th><th>Resposta</th><th>Usuário</th></tr></thead><tbody>
        ${d.rows.map(c => `<tr><td>${fmt.datetime(c.data_envio)}</td><td>${esc(c.veiculo_id__label)}</td><td>${esc(c.comando)}</td><td>${statusLabel(c.status)}</td><td>${fmt.datetime(c.data_resposta)}</td><td>${esc(c.usuario || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum</td></tr>'}</tbody></table>`;
    }
    $('[data-grupo]', el).onchange = e => { grupo = e.target.value; render(); };
    $('[data-q]', el).oninput = e => { q = e.target.value; render(); };
    $('[data-all]', el).onchange = e => { for (const v of visible()) e.target.checked ? chosen.add(v.id) : chosen.delete(v.id); render(); };
    el.addEventListener('change', e => { if (e.target.dataset.ck) { const id = +e.target.dataset.ck; e.target.checked ? chosen.add(id) : chosen.delete(id); $('[data-n]', el).textContent = chosen.size; } });
    $('[data-send]', el).onclick = async () => {
      if (!chosen.size) return toast('Selecione ao menos um veículo.', true);
      const comando = $('[data-cmd-sel]', el).value, parametros = $('[data-param]', el).value;
      if (!await confirmDialog(`Enviar "${comando}" para ${chosen.size} veículo(s)?`)) return;
      let ok = 0;
      for (const id of chosen) { try { await api('/e/comandos', { method: 'POST', body: { veiculo_id: id, comando, parametros } }); ok++; } catch (e) { toast(e.message, true); } }
      toast(`${ok} comando(s) enfileirado(s).`); chosen.clear(); render(); hist();
    };
    render(); hist();
    const iv = setInterval(hist, 15000); onLeave(() => clearInterval(iv));
  };
}
Pages.comandosMassa = commandPage(false);
Pages.comandosOffline = commandPage(true);

// ───────────────────────────── Estoque
Pages.estoque = async el => {
  const [est, eq] = await Promise.all([api('/e/estoques?limit=all&sort=nome&dir=asc'), api('/e/equipamentos?limit=all')]);
  const STS = ['Em estoque', 'Em manutenção', 'Extraviado', 'Retirado'];
  const count = (id, s) => eq.rows.filter(e => e.estoque_id === id && e.status === s).length;
  const tot = s => eq.rows.filter(e => e.status === s).length;
  el.innerHTML = `
    <div class="stats">
      ${statCard('purple', 'fa-boxes-stacked', tot('Em estoque'), 'Em estoque', '/equipamento/')}
      ${statCard('blue', 'fa-car', tot('Instalado'), 'Instalados', '/equipamento/')}
      ${statCard('yellow', 'fa-wrench', tot('Em manutenção'), 'Em manutenção', '/equipamento/')}
      ${statCard('red', 'fa-circle-question', tot('Extraviado'), 'Extraviados', '/equipamento/')}
    </div>
    ${portlet({ title: 'Estoques', icon: 'fa-warehouse', tools: `<button class="btn btn-sm btn-primary" data-transf><i class="fa fa-right-left"></i> Transferir equipamento</button>
      <button class="btn btn-sm btn-outline" data-novo><i class="fa fa-plus"></i> Novo estoque</button>`, body: `<div class="table-wrap"><table class="tbl"><thead><tr><th>Estoque</th><th>Tipo</th><th>Categoria</th><th>Técnico</th>
      ${STS.map(s => `<th class="num">${s}</th>`).join('')}<th class="num">Total</th><th></th></tr></thead><tbody>
      ${est.rows.map(s => { const n = STS.map(x => count(s.id, x)); return `<tr><td><b>${esc(s.nome)}</b></td><td>${esc(s.tipo || '')}</td><td>${esc(s.categoria || '')}</td><td>${esc(s.tecnico_id__label || '')}</td>
        ${n.map(x => `<td class="num">${x || ''}</td>`).join('')}<td class="num"><b>${n.reduce((a, b) => a + b, 0)}</b></td>
        <td class="actions"><button class="btn btn-sm btn-outline" data-ver="${s.id}"><i class="fa fa-list"></i></button> <button class="btn btn-sm btn-blue" data-ed="${s.id}"><i class="fa fa-pen"></i></button></td></tr>`; }).join('')}
      </tbody></table></div>` })}`;
  const reload = () => Pages.estoque(el);
  $('[data-transf]', el).onclick = () => openForm('transferencias', null, {}, reload);
  $('[data-novo]', el).onclick = () => openForm('estoques', null, {}, reload);
  el.onclick = e => {
    const ed = e.target.closest('[data-ed]'); if (ed) openForm('estoques', +ed.dataset.ed, {}, reload);
    const v = e.target.closest('[data-ver]');
    if (v) {
      const s = est.rows.find(x => x.id === +v.dataset.ver);
      const list = eq.rows.filter(x => x.estoque_id === s.id && x.status !== 'Instalado');
      modal({ title: `Equipamentos — ${s.nome}`, body: `<table class="tbl"><thead><tr><th>IMEI</th><th>Modelo</th><th>Chip</th><th>Status</th></tr></thead><tbody>
        ${list.map(x => `<tr><td class="mono">${esc(x.imei)}</td><td>${esc(x.fabricante || '')} ${esc(x.modelo || '')}</td><td>${esc(x.chip_id__label || '')}</td><td>${statusLabel(x.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Vazio</td></tr>'}</tbody></table>` });
    }
  };
};

// ───────────────────────────── Agenda de OS
Pages.agenda = async el => {
  let cur = new Date(); cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  let tecnico = '';
  const [tecs, cats] = await Promise.all([options('tecnicos'), api('/e/categorias_os?limit=all')]);
  const color = id => cats.rows.find(c => c.id === id)?.cor || '#67B7DC';
  async function render() {
    const start = addDays(cur, -cur.getDay()), end = addDays(start, 41);
    const d = await api('/e/ordens_servico' + qs({ limit: 'all', de: isoDate(start), ate: isoDate(end), tecnico_id: tecnico, sort: 'data_agendamento', dir: 'asc' }));
    const byDay = {};
    for (const o of d.rows) { const k = String(o.data_agendamento || '').slice(0, 10); (byDay[k] = byDay[k] || []).push(o); }
    const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i), k = isoDate(day), list = byDay[k] || [];
      cells += `<div class="day ${day.getMonth() !== cur.getMonth() ? 'out' : ''} ${k === todayISO() ? 'today' : ''}"><div class="d">${day.getDate()}</div>
        ${list.slice(0, 4).map(o => `<span class="ev" data-os="${o.id}" style="background:${color(o.categoria_id)};${['Cancelado', 'Não realizado'].includes(o.status) ? 'opacity:.45;text-decoration:line-through' : ''}" title="${esc(`${o.numero} · ${o.categoria_id__label} · ${o.pessoa_id__label || ''} · ${o.status}`)}">${String(o.data_agendamento).slice(11, 16)} ${esc(o.categoria_id__label || '')}</span>`).join('')}
        ${list.length > 4 ? `<span class="more-ev" data-day="${k}">+${list.length - 4} mais</span>` : ''}</div>`;
    }
    el.innerHTML = portlet({ title: `Agenda — ${MES[cur.getMonth()]} ${cur.getFullYear()}`, icon: 'fa-calendar-days', tools: `
      <select class="input input-sm" data-tec><option value="">Técnico: todos</option>${tecs.map(t => `<option value="${t.id}" ${String(t.id) === tecnico ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      <button class="btn btn-sm btn-outline" data-nav="-1"><i class="fa fa-chevron-left"></i></button><button class="btn btn-sm btn-outline" data-nav="0">Hoje</button>
      <button class="btn btn-sm btn-outline" data-nav="1"><i class="fa fa-chevron-right"></i></button><button class="btn btn-sm btn-primary" data-nova><i class="fa fa-plus"></i> Nova OS</button>`,
      body: `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:12px">${cats.rows.map(c => `<span><span class="swatch" style="background:${c.cor}"></span> ${esc(c.nome)}</span>`).join('')}</div>
        <div class="table-wrap"><div class="cal" style="min-width:700px">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div></div>` });
    $('[data-tec]', el).onchange = e => { tecnico = e.target.value; render(); };
    $$('[data-nav]', el).forEach(b => b.onclick = () => { const n = +b.dataset.nav; cur = n === 0 ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(cur.getFullYear(), cur.getMonth() + n, 1); render(); });
    $('[data-nova]', el).onclick = () => openForm('ordens_servico', null, { tecnico_id: tecnico || null }, render);
    $$('[data-os]', el).forEach(x => x.onclick = () => openForm('ordens_servico', +x.dataset.os, {}, render));
    $$('[data-day]', el).forEach(x => x.onclick = () => {
      const list = byDay[x.dataset.day];
      const m = modal({ title: `Ordens de serviço — ${fmt.date(x.dataset.day)}`, body: `<table class="tbl"><tbody>${list.map(o => `<tr><td>${String(o.data_agendamento).slice(11, 16)}</td><td>${esc(o.numero)}</td><td>${esc(o.categoria_id__label)}</td><td>${esc(o.tecnico_id__label || '')}</td><td>${statusLabel(o.status)}</td><td class="actions"><button class="btn btn-sm btn-blue" data-o="${o.id}"><i class="fa fa-pen"></i></button></td></tr>`).join('')}</tbody></table>` });
      $$('[data-o]', m.el).forEach(b => b.onclick = () => { m.close(); openForm('ordens_servico', +b.dataset.o, {}, render); });
    });
  }
  await render();
};

// ───────────────────────────── Câmeras ao vivo
Pages.cameras = async el => {
  const d = await api('/e/cameras?limit=all&sort=nome&dir=asc');
  el.innerHTML = portlet({ title: 'Câmeras ao vivo', icon: 'fa-video', tools: '<button class="btn btn-sm btn-primary" data-nova><i class="fa fa-plus"></i> Nova câmera</button>', body: `<div class="cams">
    ${d.rows.map(c => `<div class="cam"><div class="screen">${c.url_stream ? `<video src="${esc(c.url_stream)}" autoplay muted playsinline controls></video>` :
      `<i class="fa fa-video-slash" style="font-size:32px"></i><span>${c.status === 'Online' ? 'Aguardando stream (configure a URL)' : 'Sem sinal'}</span>`}
      ${c.status === 'Online' ? '<span class="live">AO VIVO</span>' : ''}</div>
      <div class="meta"><span><b>${esc(c.nome)}</b> · ${esc(c.veiculo_id__label || '')}</span><span>${statusLabel(c.status)} <button class="icon-btn" data-ed="${c.id}"><i class="fa fa-gear"></i></button></span></div></div>`).join('') || '<p class="placeholder">Nenhuma câmera cadastrada.</p>'}</div>` });
  const reload = () => Pages.cameras(el);
  $('[data-nova]', el).onclick = () => openForm('cameras', null, {}, reload);
  $$('[data-ed]', el).forEach(b => b.onclick = () => openForm('cameras', +b.dataset.ed, {}, reload));
};

// ───────────────────────────── Novidades
Pages.novidades = async el => {
  const d = await api('/e/novidades?limit=50');
  el.innerHTML = portlet({ title: 'Novidades do sistema', icon: 'fa-newspaper', tools: '<a class="btn btn-sm btn-outline" href="#/home/novidades/admin/"><i class="fa fa-pen"></i> Gerenciar</a>', body:
    d.rows.map(n => `<div class="news"><h3>${esc(n.titulo)}</h3><div class="when">${fmt.date(n.data)}${n.versao ? ` · versão ${esc(n.versao)}` : ''}</div><div>${esc(n.conteudo || '').replace(/\n/g, '<br>')}</div></div>`).join('') || '<p class="placeholder">Sem novidades.</p>' });
};

// ───────────────────────────── Minha conta
Pages.minhaConta = async el => {
  const me = await api('/me');
  el.innerHTML = portlet({ title: 'Minha conta', icon: 'fa-user', body: `<form style="max-width:560px" data-form>
    <div class="form-group"><label class="lb">Nome</label><input class="input" name="nome" value="${esc(me.nome)}" required></div>
    <div class="form-group"><label class="lb">Login</label><input class="input" value="${esc(me.login)}" disabled></div>
    <div class="form-group"><label class="lb">E-mail</label><input class="input" type="email" name="email" value="${esc(me.email || '')}"></div>
    <hr style="border:0;border-top:1px solid #EEF1F5;margin:20px 0"><p class="text-muted">Alterar senha (opcional)</p>
    <div class="form-grid"><div><label class="lb">Senha atual</label><input class="input" type="password" name="senha_atual" autocomplete="current-password"></div>
    <div><label class="lb">Nova senha</label><input class="input" type="password" name="senha_nova" autocomplete="new-password"></div></div>
    <p style="margin-top:20px"><button class="btn btn-primary"><i class="fa fa-check"></i> Salvar</button></p></form>` });
  $('[data-form]', el).onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    try { await api('/me', { method: 'PUT', body: { nome: f.nome.value, email: f.email.value, senha_atual: f.senha_atual.value, senha_nova: f.senha_nova.value } });
      toast('Dados atualizados.'); App.user = await api('/me'); renderHeaderUser(); f.senha_atual.value = f.senha_nova.value = ''; } catch (err) { toast(err.message, true); }
  };
};

// ───────────────────────────── Relatórios
function renderReport(el, route) {
  const meta = App.reports[route.rep];
  const st = { de: isoDate(addDays(new Date(), -30)), ate: todayISO(), q: '' };
  let last = null;
  const CELL = { money: fmt.money, number: fmt.number, km: fmt.km, date: fmt.date, datetime: fmt.datetime, bool: fmt.bool };
  const SUM = ['money', 'km'];
  el.innerHTML = portlet({ title: meta.title, icon: 'fa-chart-column', body: `
    <div class="toolbar">
      ${meta.periodo ? `<label class="lb" style="margin:0">De</label><input type="date" class="input input-sm" data-de value="${st.de}"><label class="lb" style="margin:0">até</label><input type="date" class="input input-sm" data-ate value="${st.ate}">
      <button class="btn btn-sm btn-outline" data-per="0">Hoje</button><button class="btn btn-sm btn-outline" data-per="7">7 dias</button><button class="btn btn-sm btn-outline" data-per="30">30 dias</button><button class="btn btn-sm btn-outline" data-per="mes">Mês atual</button>` : ''}
      <div class="search-box"><i class="fa fa-search"></i><input class="input input-sm" data-q placeholder="Filtrar..."></div>
      <button class="btn btn-primary btn-sm" data-gen><i class="fa fa-play"></i> Gerar</button>
      <span class="grow"></span>
      <button class="btn btn-outline btn-sm" data-csv><i class="fa fa-file-csv"></i> Exportar</button>
      <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fa fa-print"></i> Imprimir</button>
    </div><div data-out><div class="loading">Gerando relatório...</div></div>` });
  async function run() {
    $('[data-out]', el).innerHTML = '<div class="loading">Gerando relatório...</div>';
    try {
      last = await api(`/reports/${route.rep}` + qs(meta.periodo ? st : { q: st.q }));
      const cols = last.cols;
      const totals = cols.map(([k, , t]) => SUM.includes(t) ? last.rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) : null);
      $('[data-out]', el).innerHTML = `<p class="text-muted" style="font-size:12px">${last.rows.length} registro(s)${meta.periodo ? ` · período ${fmt.date(last.de)} a ${fmt.date(last.ate)}` : ''}</p>
        <div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(([, l, t]) => `<th class="${['money', 'number', 'km'].includes(t) ? 'num' : ''}">${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${last.rows.slice(0, 2000).map(r => `<tr>${cols.map(([k, , t]) => `<td class="${['money', 'number', 'km'].includes(t) ? 'num' : ''}">${CELL[t] ? CELL[t](r[k]) : (['status', 'situacao', 'alerta', 'classificacao'].includes(k) ? statusLabel(r[k]) : esc(r[k]))}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${cols.length}" class="empty"><i class="fa fa-inbox"></i> Nenhum dado para os filtros informados</td></tr>`}</tbody>
        ${totals.some(x => x !== null) && last.rows.length ? `<tfoot><tr>${totals.map((t, i) => `<td class="num">${t === null ? (i === 0 ? 'Total' : '') : (cols[i][2] === 'km' ? fmt.km(t) : fmt.money(t))}</td>`).join('')}</tr></tfoot>` : ''}
        </table></div>${last.rows.length > 2000 ? '<p class="text-muted">Exibindo os primeiros 2000 registros. Exporte para ver todos.</p>' : ''}`;
    } catch (e) { $('[data-out]', el).innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }
  $('[data-gen]', el).onclick = run;
  $('[data-q]', el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('[data-q]', el).addEventListener('input', e => { st.q = e.target.value; });
  $('[data-de]', el)?.addEventListener('change', e => { st.de = e.target.value; run(); });
  $('[data-ate]', el)?.addEventListener('change', e => { st.ate = e.target.value; run(); });
  $$('[data-per]', el).forEach(b => b.onclick = () => {
    const now = new Date(); const p = b.dataset.per;
    st.de = p === 'mes' ? isoDate(new Date(now.getFullYear(), now.getMonth(), 1)) : isoDate(addDays(now, -Number(p)));
    st.ate = todayISO(); $('[data-de]', el).value = st.de; $('[data-ate]', el).value = st.ate; run();
  });
  $('[data-csv]', el).onclick = () => {
    if (!last) return;
    downloadCSV(meta.title, last.cols.map(([k, l, t]) => ({ label: l, text: r => t === 'bool' ? (r[k] ? 'Sim' : 'Não') : t === 'date' ? fmt.date(r[k]) : t === 'datetime' ? fmt.datetime(r[k]) : (typeof r[k] === 'number' ? String(r[k]).replace('.', ',') : r[k] ?? '') })), last.rows);
  };
  run();
}
