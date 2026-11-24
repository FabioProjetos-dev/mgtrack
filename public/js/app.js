// Inicialização, login, layout (header + sidebar) e roteamento por hash.
const DEFAULT_ROUTE = '/dashboard-gestao/';

async function boot() {
  try { App.user = await api('/me'); } catch { return renderLogin(); }
  [App.meta, App.reports] = await Promise.all([api('/meta'), api('/reports')]);
  renderLayout();
  await refreshHeader();
  route();
}

// Dropdowns do header (listener global único)
document.addEventListener('click', e => {
  const dd = e.target.closest('[data-dd]');
  const inside = e.target.closest('.dropdown');
  $$('.dropdown.open').forEach(m => { if (!dd || m.dataset.menu !== dd.dataset.dd) m.classList.remove('open'); });
  if (dd && !inside) $(`[data-menu="${dd.dataset.dd}"]`)?.classList.toggle('open');
});
let headerTimer = null;

function renderLogin() {
  runCleanup();
  document.body.className = '';
  $('#root').innerHTML = `<div class="login-wrap"><form class="login-box" data-login>
    <div class="brand"><div class="logo-mark" style="color:#2B3643;justify-content:center"><i class="fa fa-location-crosshairs"></i> MG-TRACK</div>
    <small class="text-muted">Rastreamento Veicular</small></div>
    <h3>Acesse sua conta</h3>
    <div class="form-group"><label class="lb">Usuário</label><input class="input" name="login" autocomplete="username" required autofocus></div>
    <div class="form-group"><label class="lb">Senha</label><input class="input" type="password" name="senha" autocomplete="current-password" required></div>
    <button class="btn btn-primary btn-block"><i class="fa fa-right-to-bracket"></i> Entrar</button>
    <p class="hint">Demonstração: <b>admin</b> / <b>admin123</b></p></form></div>`;
  $('[data-login]').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button', f);
    btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { login: f.login.value, senha: f.senha.value } }); await boot(); }
    catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}

function menuHTML() {
  const badge = m => m.isNew ? '<span class="new-badge">novo</span>' : '';
  return MENU.map((m, i) => m.c
    ? `<li data-group="${i}"><a href="javascript:void 0" data-toggle><i class="fa ${m.i} ic"></i><span class="lbl">${esc(m.t)}</span>${badge(m)}<i class="fa fa-angle-right arrow"></i></a>
        <ul>${m.c.map(c => `<li><a href="#${c.r}" data-r="${esc(c.r)}">${esc(c.t)}${c.isNew ? ' <span class="new-badge" style="margin-left:4px">novo</span>' : ''}</a></li>`).join('')}</ul></li>`
    : `<li data-single="${esc(m.r)}"><a href="#${m.r}" data-r="${esc(m.r)}"><i class="fa ${m.i} ic"></i><span class="lbl">${esc(m.t)}</span>${badge(m)}</a></li>`).join('');
}

function renderLayout() {
  document.body.className = localStorage.getItem('mg.collapsed') === '1' ? 'collapsed' : '';
  $('#root').innerHTML = `
    <header class="header">
      <div class="logo"><a href="#${DEFAULT_ROUTE}" class="logo-mark" style="text-decoration:none"><i class="fa fa-location-crosshairs"></i> MG-TRACK <small>Rastreamento</small></a>
        <button class="btn-toggle" data-sidebar title="Recolher menu"><i class="fa fa-bars"></i></button></div>
      <div class="top-menu">
        <a class="top-icon" href="#/atendimentos/" title="Atendimentos pendentes"><i class="fa fa-phone"></i><span class="badge" data-b="atendimentos" hidden></span></a>
        <a class="top-icon hide-xs" href="#/financeiro/rel-inadimplentes" title="Contas vencidas"><i class="fa fa-dollar-sign"></i><span class="badge red" data-b="vencidas" hidden></span></a>
        <div style="position:relative;height:100%"><button class="top-icon" data-dd="notif" title="Notificações"><i class="fa fa-bell"></i><span class="badge" data-b="notificacoes" hidden></span></button>
          <div class="dropdown wide" data-menu="notif"></div></div>
        <a class="top-icon hide-xs" href="#/home/novidades/" title="Novidades"><i class="fa fa-newspaper"></i><span class="badge" data-b="novidades" hidden></span></a>
        <div class="user-menu" data-dd="user"><div class="avatar" data-avatar></div><span class="uname" data-uname></span><i class="fa fa-angle-down"></i>
          <div class="dropdown" data-menu="user">
            <a href="#/minha-conta/"><i class="fa fa-user"></i> Minha Conta</a>
            <a href="#/new/settings/notifications/sms"><i class="fa fa-gear"></i> Configurações</a>
            <a href="javascript:void 0" data-logout><i class="fa fa-right-from-bracket"></i> Sair</a>
          </div></div>
      </div>
    </header>
    <nav class="sidebar"><div class="side-search"><input data-msearch placeholder="Buscar no menu..."></div><ul class="nav" data-nav>${menuHTML()}</ul></nav>
    <main class="content"><div class="page-bar"><div><h1 class="page-title" data-title></h1></div><div class="breadcrumb" data-bc></div></div>
      <div class="page" data-page></div>
      <div class="footer">© ${new Date().getFullYear()} MG-TRACK RASTREAMENTO VEICULAR</div></main>`;
  renderHeaderUser();

  $('[data-sidebar]').onclick = () => {
    if (window.innerWidth <= 860) return document.body.classList.toggle('mobile-open');
    document.body.classList.toggle('collapsed');
    try { localStorage.setItem('mg.collapsed', document.body.classList.contains('collapsed') ? '1' : '0'); } catch { /* ignora */ }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  };
  $('[data-nav]').addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      if (document.body.classList.contains('collapsed')) { document.body.classList.remove('collapsed'); }
      const li = t.parentElement; const open = !li.classList.contains('open');
      $$('[data-nav] > li.open').forEach(x => x !== li && x.classList.remove('open'));
      li.classList.toggle('open', open);
    } else if (e.target.closest('[data-r]') && window.innerWidth <= 860) document.body.classList.remove('mobile-open');
  });
  $('[data-msearch]').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    for (const li of $$('[data-nav] > li')) {
      const subs = $$('ul li', li);
      if (!q) { li.style.display = ''; subs.forEach(s => s.style.display = ''); li.classList.remove('open'); continue; }
      const selfMatch = li.querySelector(':scope > a').textContent.toLowerCase().includes(q);
      let any = false;
      for (const s of subs) { const m = selfMatch || s.textContent.toLowerCase().includes(q); s.style.display = m ? '' : 'none'; any ||= m; }
      li.style.display = selfMatch || any ? '' : 'none';
      li.classList.toggle('open', subs.length > 0 && (selfMatch || any));
    }
  });
  $('[data-logout]').onclick = async () => { try { await api('/logout', { method: 'POST' }); } catch { /* ignora */ } App.user = null; renderLogin(); };
  clearInterval(headerTimer);
  headerTimer = setInterval(() => { if (App.user) refreshHeader(); }, 30000);
}

function renderHeaderUser() {
  const n = App.user?.nome || '';
  const el = $('[data-uname]'); if (el) el.textContent = n;
  const av = $('[data-avatar]'); if (av) av.textContent = n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
}

let headerData = null;
async function refreshHeader() {
  try { headerData = await api('/header'); } catch { return; }
  for (const k of ['atendimentos', 'vencidas', 'notificacoes', 'novidades']) {
    const b = $(`[data-b="${k}"]`); if (!b) continue;
    b.hidden = !headerData[k]; b.textContent = headerData[k] > 99 ? '99+' : headerData[k];
  }
  $('[data-menu="notif"]').innerHTML = `<div class="dd-head">${headerData.notificacoes} evento(s) nas últimas 24h</div>
    ${headerData.eventos.map(e => `<a href="#/veiculo/monitoramento-eventos/"><i class="fa fa-circle-exclamation" style="color:${e.tipo === 'Excesso de velocidade' ? '#F1C40F' : '#ED6B75'}"></i>
      <span class="dd-item" style="padding:0;border:0;display:block">${esc(e.placa || '')} — ${esc(e.tipo)}<small>${fmt.datetime(e.data)}</small></span></a>`).join('')}
    <a href="#/veiculo/monitoramento-eventos/" style="justify-content:center;color:#36C6D3">Ver todos os eventos</a>`;
}

function route() {
  if (!App.user) return;
  let path = decodeURIComponent(location.hash.slice(1)) || DEFAULT_ROUTE;
  if (!ROUTES[path] && ROUTES[path + '/']) path += '/';
  const r = ROUTES[path];
  runCleanup();
  $$('[data-nav] a.active').forEach(a => a.classList.remove('active'));
  $$('[data-nav] > li.active').forEach(a => a.classList.remove('active'));
  const link = $(`[data-nav] a[data-r="${CSS.escape(path)}"]`);
  if (link) {
    link.classList.add('active');
    const li = link.closest('[data-group]') || link.closest('[data-single]');
    li.classList.add('active');
    if (li.dataset.group && !document.body.classList.contains('collapsed')) { $$('[data-nav] > li.open').forEach(x => x !== li && x.classList.remove('open')); li.classList.add('open'); }
  }
  $('[data-title]').innerHTML = r ? esc(r.t) : 'Página não encontrada';
  $('[data-bc]').innerHTML = `<a href="#${DEFAULT_ROUTE}"><i class="fa fa-house" style="font-size:12px;margin:0"></i></a>${r?.parent ? `<i class="fa fa-chevron-right"></i>${esc(r.parent)}` : ''}<i class="fa fa-chevron-right"></i>${esc(r ? r.t : '404')}`;
  document.title = `${r ? r.t + ' · ' : ''}MG-TRACK`;
  const page = $('[data-page]');
  const el = document.createElement('div');
  page.replaceChildren(el);
  window.scrollTo(0, 0);
  if (!r) { el.innerHTML = `<div class="portlet placeholder"><i class="fa fa-map-signs"></i><p>A rota <code>${esc(path)}</code> não existe.</p><a class="btn btn-primary" href="#${DEFAULT_ROUTE}">Voltar ao dashboard</a></div>`; return; }

  if (path === DEFAULT_ROUTE && headerData?.anuncios?.length) {
    let dismissed = []; try { dismissed = JSON.parse(sessionStorage.getItem('mg.anuncios') || '[]'); } catch { /* ignora */ }
    const box = document.createElement('div');
    box.innerHTML = headerData.anuncios.filter(a => !dismissed.includes(a.id)).map(a => `<div class="alert alert-info"><i class="fa fa-bullhorn"></i><div class="grow"><b>${esc(a.titulo)}</b> — ${esc(a.mensagem)}</div>
      <button class="icon-btn" data-dismiss="${a.id}"><i class="fa fa-xmark"></i></button></div>`).join('');
    box.onclick = e => { const b = e.target.closest('[data-dismiss]'); if (!b) return; dismissed.push(+b.dataset.dismiss); try { sessionStorage.setItem('mg.anuncios', JSON.stringify(dismissed)); } catch { /* ignora */ } b.closest('.alert').remove(); };
    page.prepend(box);
  }

  try {
    if (r.p) Promise.resolve(Pages[r.p](el)).catch(e => { el.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; });
    else if (r.rep) renderReport(el, r);
    else if (r.e) renderCrud(el, r);
  } catch (e) { console.error(e); el.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
}

window.addEventListener('hashchange', route);
boot();
