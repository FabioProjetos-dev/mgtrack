// Telas de cadastro genéricas geradas a partir do esquema (/api/meta).
function fieldOf(ent, name) { return ent.fields.find(f => f.name === name); }

function cellHTML(f, row) {
  const v = row[f.name];
  switch (f.type) {
    case 'ref': return esc(row[f.name + '__label'] ?? '');
    case 'money': return fmt.money(v);
    case 'number': return fmt.number(v);
    case 'date': return fmt.date(v);
    case 'datetime': return fmt.datetime(v);
    case 'bool': return fmt.bool(v);
    case 'color': return v ? `<span class="swatch" style="background:${esc(v)}"></span> <span class="mono">${esc(v)}</span>` : '';
    case 'select': return f.name === 'status' || f.name === 'resultado' || f.name === 'prioridade' ? statusLabel(v) : esc(v);
    case 'textarea': { const s = String(v ?? ''); return esc(s.length > 80 ? s.slice(0, 80) + '…' : s); }
    default: return esc(v);
  }
}
function cellText(f, row) {
  const v = row[f.name];
  if (f.type === 'ref') return row[f.name + '__label'] ?? '';
  if (f.type === 'bool') return v ? 'Sim' : 'Não';
  if (f.type === 'date') return fmt.date(v);
  if (f.type === 'datetime') return fmt.datetime(v);
  if (f.type === 'money' || f.type === 'number') return v == null ? '' : String(v).replace('.', ',');
  return v ?? '';
}
const isNum = f => ['money', 'number'].includes(f.type);

function renderCrud(el, route) {
  const ent = App.meta[route.e];
  const fixed = route.f || {};
  const st = { q: '', page: 1, limit: 25, sort: '', dir: 'desc', de: '', ate: '', status: '' };
  const cols = ent.list.map(n => fieldOf(ent, n)).filter(Boolean);
  const statusField = fieldOf(ent, 'status');
  const showStatusFilter = statusField && statusField.type === 'select' && !('status' in fixed);
  const actions = ent.actions || [];

  el.innerHTML = portlet({
    title: route.t, icon: 'fa-table-list',
    body: `<div class="toolbar">
      ${ent.readonly ? '' : `<button class="btn btn-primary" data-new><i class="fa fa-plus"></i> Novo</button>`}
      <div class="search-box"><i class="fa fa-search"></i><input class="input input-sm" data-q placeholder="Pesquisar..."></div>
      ${showStatusFilter ? `<select class="input input-sm" data-status><option value="">Status: todos</option>${statusField.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>` : ''}
      ${ent.dateField ? `<input type="date" class="input input-sm" data-de title="De"> <input type="date" class="input input-sm" data-ate title="Até">` : ''}
      <span class="grow"></span>
      <button class="btn btn-outline btn-sm" data-reload title="Atualizar"><i class="fa fa-rotate"></i></button>
      <button class="btn btn-outline btn-sm" data-csv><i class="fa fa-file-csv"></i> Exportar</button>
      <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fa fa-print"></i></button>
    </div>
    <div class="table-wrap"><table class="tbl"><thead><tr>
      ${cols.map(f => `<th class="sortable ${isNum(f) ? 'num' : ''}" data-sort="${f.name}">${esc(f.label)} <i class="fa fa-sort text-muted" style="font-size:10px"></i></th>`).join('')}
      <th></th></tr></thead><tbody data-body><tr><td colspan="${cols.length + 1}" class="loading">Carregando...</td></tr></tbody></table></div>
    <div class="pager" data-pager></div>`,
  });

  const params = (extra = {}) => ({ ...fixed, q: st.q, page: st.page, limit: st.limit, sort: st.sort, dir: st.dir, de: st.de, ate: st.ate, status: fixed.status ?? st.status, ...extra });

  async function load() {
    try {
      const data = await api(`/e/${ent.key}${qs(params())}`);
      const body = $('[data-body]', el);
      if (!body) return;
      body.innerHTML = data.rows.length ? data.rows.map(r => `<tr data-id="${r.id}">
          ${cols.map(f => `<td class="${isNum(f) ? 'num' : ''}">${cellHTML(f, r)}</td>`).join('')}
          <td class="actions">
            ${actions.map(a => `<button class="btn btn-sm btn-outline" data-act="${a.key}" title="${esc(a.label)}"><i class="fa ${a.icon}"></i></button>`).join(' ')}
            ${ent.readonly ? `<button class="btn btn-sm btn-outline" data-view title="Ver"><i class="fa fa-eye"></i></button>` :
              `<button class="btn btn-sm btn-blue" data-edit title="Editar"><i class="fa fa-pen"></i></button>
               <button class="btn btn-sm btn-red" data-del title="Excluir"><i class="fa fa-trash"></i></button>`}
          </td></tr>`).join('')
        : `<tr><td colspan="${cols.length + 1}" class="empty"><i class="fa fa-inbox"></i> Nenhum registro encontrado</td></tr>`;
      const pages = Math.max(1, Math.ceil(data.total / st.limit));
      const from = data.total ? (st.page - 1) * st.limit + 1 : 0;
      let btns = '';
      const lo = Math.max(1, st.page - 2), hi = Math.min(pages, lo + 4);
      for (let p = lo; p <= hi; p++) btns += `<button data-pg="${p}" class="${p === st.page ? 'on' : ''}">${p}</button>`;
      $('[data-pager]', el).innerHTML = `<span>Mostrando ${from} a ${Math.min(st.page * st.limit, data.total)} de ${data.total} registros
        <select class="input input-sm" data-limit style="margin-left:8px">${[10, 25, 50, 100].map(n => `<option ${n === st.limit ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
        <span class="pages"><button data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>‹</button>${btns}<button data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>›</button></span>`;
    } catch (e) { toast(e.message, true); }
  }

  let timer;
  $('[data-q]', el).addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { st.q = e.target.value; st.page = 1; load(); }, 300); });
  $('[data-status]', el)?.addEventListener('change', e => { st.status = e.target.value; st.page = 1; load(); });
  $('[data-de]', el)?.addEventListener('change', e => { st.de = e.target.value; st.page = 1; load(); });
  $('[data-ate]', el)?.addEventListener('change', e => { st.ate = e.target.value; st.page = 1; load(); });
  $('[data-reload]', el).onclick = load;
  $('[data-new]', el)?.addEventListener('click', () => openForm(ent.key, null, fixed, load));
  $('[data-csv]', el).onclick = async () => {
    const data = await api(`/e/${ent.key}${qs(params({ limit: 'all', page: 1 }))}`);
    const all = ent.fields.filter(f => f.type !== 'password');
    downloadCSV(route.t, all.map(f => ({ label: f.label, text: r => cellText(f, r) })), data.rows);
  };
  el.addEventListener('click', async e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { st.dir = st.sort === th.dataset.sort && st.dir === 'asc' ? 'desc' : 'asc'; st.sort = th.dataset.sort; load(); return; }
    const pg = e.target.closest('[data-pg]');
    if (pg && !pg.disabled) { st.page = +pg.dataset.pg; load(); return; }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = +tr.dataset.id;
    if (e.target.closest('[data-edit]') || e.target.closest('[data-view]')) openForm(ent.key, id, fixed, load);
    else if (e.target.closest('[data-del]')) {
      if (!await confirmDialog('Deseja realmente excluir este registro?', { okText: 'Excluir', danger: true })) return;
      try { await api(`/e/${ent.key}/${id}`, { method: 'DELETE' }); invalidateOptions(ent.key); toast('Registro excluído.'); load(); } catch (err) { toast(err.message, true); }
    } else {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const def = actions.find(x => x.key === a.dataset.act);
      let input;
      if (def.prompt) { input = await promptDialog(def.label, def.prompt); if (input === null) return; }
      try { const r = await api(`/action/${ent.key}/${id}/${def.key}`, { method: 'POST', body: { input } }); toast(r.message); load(); } catch (err) { toast(err.message, true); }
    }
  });
  el.addEventListener('change', e => { if (e.target.matches('[data-limit]')) { st.limit = +e.target.value; st.page = 1; load(); } });
  el.addEventListener('dblclick', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openForm(ent.key, +tr.dataset.id, fixed, load); });
  if (route.refresh) { const iv = setInterval(load, route.refresh); onLeave(() => clearInterval(iv)); }
  load();
}

function inputHTML(f, v, readonly) {
  const dis = readonly ? 'disabled' : '';
  const name = `name="${f.name}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}`;
  switch (f.type) {
    case 'textarea': return `<textarea class="input" ${name} ${dis}>${esc(v)}</textarea>`;
    case 'select': return `<select class="input" ${name} ${dis}><option value=""></option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    case 'ref': return `<select class="input" ${name} ${dis} data-ref="${f.ref}" data-val="${esc(v ?? '')}"><option value="">Carregando...</option></select>`;
    case 'bool': return `<label class="check"><input type="checkbox" ${name} ${v ? 'checked' : ''} ${dis}> ${esc(f.label)}</label>`;
    case 'money': case 'number': return `<input class="input" type="number" step="any" ${name} value="${esc(v ?? '')}" ${dis}>`;
    case 'date': return `<input class="input" type="date" ${name} value="${esc(v ? String(v).slice(0, 10) : '')}" ${dis}>`;
    case 'datetime': return `<input class="input" type="datetime-local" ${name} value="${esc(v ? String(v).slice(0, 16).replace(' ', 'T') : '')}" ${dis}>`;
    case 'time': return `<input class="input" type="time" ${name} value="${esc(v ?? '')}" ${dis}>`;
    case 'color': return `<input class="input" type="color" ${name} value="${esc(v || '#36C6D3')}" style="padding:2px;height:34px" ${dis}>`;
    case 'password': return `<input class="input" type="password" ${name} autocomplete="new-password" placeholder="${v === undefined ? '' : 'Deixe em branco para manter'}" ${dis}>`;
    case 'email': return `<input class="input" type="email" ${name} value="${esc(v ?? '')}" ${dis}>`;
    case 'tel': return `<input class="input" type="tel" ${name} value="${esc(v ?? '')}" ${dis}>`;
    default: return `<input class="input" type="text" ${name} value="${esc(v ?? '')}" ${dis}>`;
  }
}

async function openForm(entKey, id, defaults = {}, onSaved) {
  const ent = App.meta[entKey];
  let row = {};
  try { if (id) row = await api(`/e/${entKey}/${id}`); } catch (e) { return toast(e.message, true); }
  if (!id) for (const f of ent.fields) row[f.name] = defaults[f.name] ?? f.def ?? null;
  const ro = !!ent.readonly;
  const fields = ent.fields.filter(f => !f.hidden);
  const body = `<form class="form-grid" autocomplete="off">${fields.map(f => `${f.section ? `
      <div class="full form-section">${esc(f.section)}</div>` : ''}
      <div class="${f.type === 'textarea' || f.full ? 'full' : ''}">
        ${f.type === 'bool' ? '' : `<label class="lb">${esc(f.label)} ${f.req ? '<span class="req">*</span>' : ''}</label>`}
        ${inputHTML(f, f.type === 'password' ? (id ? '' : undefined) : row[f.name], ro)}
      </div>`).join('')}</form>
      ${id ? `<p class="text-muted" style="font-size:12px;margin:14px 0 0">#${id} · criado em ${fmt.datetime(row.created_at)} · atualizado em ${fmt.datetime(row.updated_at)}</p>` : ''}`;
  const m = modal({ title: `${id ? (ro ? 'Visualizar' : 'Editar') : 'Novo(a)'} ${ent.label}`, body,
    foot: `<button class="btn btn-outline" data-close>${ro ? 'Fechar' : 'Cancelar'}</button>${ro ? '' : `<button class="btn btn-primary" data-save><i class="fa fa-check"></i> Salvar</button>`}` });

  for (const sel of $$('select[data-ref]', m.el)) {
    options(sel.dataset.ref).then(list => {
      const cur = sel.dataset.val;
      sel.innerHTML = `<option value=""></option>` + list.map(o => `<option value="${o.id}" ${String(o.id) === cur ? 'selected' : ''}>${esc(o.label ?? '#' + o.id)}</option>`).join('');
    }).catch(e => toast(e.message, true));
  }
  const form = $('form', m.el);
  form.addEventListener('submit', e => { e.preventDefault(); $('[data-save]', m.el)?.click(); });
  $('[data-save]', m.el)?.addEventListener('click', async ev => {
    const data = {};
    for (const f of fields) {
      const inp = form.elements[f.name];
      if (!inp) continue;
      data[f.name] = f.type === 'bool' ? (inp.checked ? 1 : 0) : inp.value;
      if (f.type === 'password' && !inp.value) delete data[f.name];
    }
    const missing = fields.find(f => f.req && (data[f.name] === '' || data[f.name] == null));
    if (missing) return toast(`Preencha o campo obrigatório: ${missing.label}`, true);
    ev.target.disabled = true;
    try {
      await api(`/e/${entKey}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', body: data });
      invalidateOptions(entKey);
      toast(id ? 'Registro atualizado.' : 'Registro criado.');
      m.close();
      onSaved?.();
    } catch (e) { toast(e.message, true); ev.target.disabled = false; }
  });
  $('input:not([type=checkbox]), select, textarea', form)?.focus();
}
