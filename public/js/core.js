// Núcleo: API, utilitários de formatação, modal, toast e ciclo de vida das páginas.
const App = { meta: null, user: null, reports: null, cleanup: [] };

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const res = await fetch('/api' + path, o);
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (res.status === 401 && path !== '/login') { App.user = null; renderLogin(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}
const qs = obj => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmt = {
  money: v => v == null || v === '' ? '' : 'R$ ' + nf2.format(v),
  number: v => v == null || v === '' ? '' : nf.format(v),
  km: v => v == null || v === '' ? '' : nf.format(v) + ' km',
  date: v => { if (!v) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : v; },
  datetime: v => v ? `${fmt.date(v)} ${String(v).slice(11, 16)}` : '',
  bool: v => v ? '<span class="label success">Sim</span>' : '<span class="label">Não</span>',
  monthLabel: ym => { const [y, m] = ym.split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m - 1]}/${y.slice(2)}`; },
};
function ago(v) {
  if (!v) return 'nunca';
  const m = Math.round((Date.now() - new Date(String(v).replace(' ', 'T')).getTime()) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

const STATUS_CLASS = [
  ['success', ['Ativo','Pago','Paga','Finalizado','Confirmado','Concluída','Emitida','Aprovado','Resolvido','Instalado','Online','Enviada','Recuperado','Convertida','Realizada','Faturado','Sem restrições','Regular','Em dia','Promotor','Concluído','Fechado']],
  ['info', ['Aberto','Aberta','Pendente','Novo','Nova','Agendada','Em estoque','Rascunho','Baixa','Média']],
  ['warning', ['Em andamento','Tarefa iniciada','Serviço iniciado','Enviado','Em análise','Aguardando cliente','Em contato','Prestador acionado','Em atendimento','Suspenso','Em manutenção','Alta','Próximo','Neutro','Pausado','Revisão']],
  ['danger', ['Cancelado','Cancelada','Inativo','Falhou','Vencida','Vencido','Rescindido','Não realizado','Reprovado','Extraviado','Offline','Urgente','Perdida','Com restrições','Excedeu 10h','Detrator','Retirado','Indenizado']],
];
function statusLabel(v) {
  if (v == null || v === '') return '';
  const c = STATUS_CLASS.find(([, list]) => list.includes(v));
  return `<span class="label ${c ? c[0] : ''}">${esc(v)}</span>`;
}

function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), err ? 6000 : 3500);
}

function modal({ title, body, foot = '', size = '' }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}"><div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close><i class="fa fa-xmark"></i></button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  return { el: bg, close };
}
function confirmDialog(msg, { okText = 'Confirmar', danger = false } = {}) {
  return new Promise(resolve => {
    const m = modal({ title: 'Confirmação', size: 'sm', body: `<p>${esc(msg)}</p>`,
      foot: `<button class="btn btn-outline" data-close>Cancelar</button><button class="btn ${danger ? 'btn-red' : 'btn-primary'}" data-ok>${esc(okText)}</button>` });
    let done = false;
    $('[data-ok]', m.el).onclick = () => { done = true; m.close(); resolve(true); };
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}
function promptDialog(title, label) {
  return new Promise(resolve => {
    const m = modal({ title, size: 'sm', body: `<label class="lb">${esc(label)}</label><textarea class="input" data-in></textarea>`,
      foot: `<button class="btn btn-outline" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Confirmar</button>` });
    let done = false;
    $('[data-in]', m.el).focus();
    $('[data-ok]', m.el).onclick = () => { done = true; const v = $('[data-in]', m.el).value; m.close(); resolve(v); };
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe(document.body, { childList: true });
  });
}

// Cache de opções para campos de referência
const optCache = {};
async function options(entity, fresh = false) {
  if (!optCache[entity] || fresh) optCache[entity] = api('/options/' + entity);
  return optCache[entity];
}
const invalidateOptions = entity => { delete optCache[entity]; };

// Multi-seleção com checkboxes
function multiSelect(el, { label, items, selected = [], onChange, extraLink }) {
  const sel = new Set(selected.map(String));
  const txt = () => sel.size ? `${label}: ${sel.size}` : `${label}: todos`;
  el.className = 'ms';
  el.innerHTML = `<button type="button" class="btn btn-outline ms-btn"><span>${esc(txt())}</span><i class="fa fa-angle-down"></i></button>
    <div class="ms-panel">${items.map(i => `<label><input type="checkbox" value="${esc(i.id)}" ${sel.has(String(i.id)) ? 'checked' : ''}>${esc(i.label)}</label>`).join('')}
    ${extraLink ? `<a class="ms-link" href="${extraLink.href}"><i class="fa fa-plus"></i> ${esc(extraLink.label)}</a>` : ''}</div>`;
  $('.ms-btn', el).onclick = e => { e.stopPropagation(); $$('.ms.open').forEach(x => x !== el && x.classList.remove('open')); el.classList.toggle('open'); };
  $('.ms-panel', el).addEventListener('click', e => e.stopPropagation());
  $('.ms-panel', el).addEventListener('change', e => {
    e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value);
    $('.ms-btn span', el).textContent = txt();
    onChange([...sel]);
  });
}
document.addEventListener('click', () => $$('.ms.open').forEach(x => x.classList.remove('open')));

function onLeave(fn) { App.cleanup.push(fn); }
function runCleanup() { while (App.cleanup.length) { try { App.cleanup.pop()(); } catch (e) { console.error(e); } } }

function downloadCSV(name, cols, rows) {
  const cell = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map(c => cell(c.label)).join(';'), ...rows.map(r => cols.map(c => cell(c.text(r))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function portlet({ title, icon = 'fa-circle', tools = '', body = '', id = '', cls = '', collapsible = false }) {
  return `<div class="portlet ${cls}" ${id ? `id="${id}"` : ''}><div class="portlet-title"><div class="caption"><i class="fa ${icon}"></i>${esc(title)}</div>
    <div class="tools">${tools}${collapsible ? `<button class="icon-btn" data-collapse title="Recolher"><i class="fa fa-chevron-up"></i></button>
    <button class="icon-btn" data-full title="Expandir"><i class="fa fa-expand"></i></button>` : ''}</div></div><div class="portlet-body">${body}</div></div>`;
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-collapse]');
  if (c) { const p = c.closest('.portlet'); p.classList.toggle('collapsed'); c.innerHTML = `<i class="fa fa-chevron-${p.classList.contains('collapsed') ? 'down' : 'up'}"></i>`; }
  const f = e.target.closest('[data-full]');
  if (f) { const p = f.closest('.portlet'); p.classList.toggle('fullscreen'); f.innerHTML = `<i class="fa fa-${p.classList.contains('fullscreen') ? 'compress' : 'expand'}"></i>`; window.dispatchEvent(new Event('resize')); }
});
