'use strict';
/* ============ Metas Financeiras — PWA ============
   Valores sempre em centavos (inteiros). Dados salvos no localStorage. */

const KEY = 'metas-financeiras-v1';
const COLORS = ['#F04A00', '#C98A12', '#2E8B57', '#2A62B0', '#8E44AD', '#C0392B', '#16A0A0', '#7F6A5B'];
/* Cores por prioridade (P1 = mais urgente). Cada meta usa o tom da sua posição na lista. */
const PRIO = [
  { c: '#D93636', bg: '#FCE7E4', bd: '#F2BDB6' },
  { c: '#E8590C', bg: '#FDEBDC', bd: '#F6C8A4' },
  { c: '#C98A12', bg: '#FBF1D3', bd: '#ECD594' },
  { c: '#2E8B57', bg: '#DFF2E7', bd: '#ADDABD' },
  { c: '#2A62B0', bg: '#E0EAF8', bd: '#B3CAEB' },
  { c: '#7B4FB0', bg: '#ECE3F7', bd: '#D0BBE8' }
];
const prio = k => PRIO[k % PRIO.length];
const pstyle = k => { const p = prio(k); return `--pc:${p.c};--pbg:${p.bg};--pbd:${p.bd}`; };
const EMPRESA = 'caixa-empresa'; // caixinha automática: recebe o custo da mercadoria
const SUGESTOES = ['Lazer', 'Investimentos', 'Transporte', 'Saúde', 'Reserva de Emergência'];

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = c => (c < 0 ? '-' : '') + 'R$ ' + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inp = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';
const parseMoney = v => {
  v = String(v || '').trim().replace(/[R$\s]/g, '');
  if (!v) return 0;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return isFinite(n) ? Math.round(n * 100) : 0;
};
const parseNum = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; };
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ds(new Date());
const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diff = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
const fmtDate = s => s.split('-').reverse().join('/');
const fmtLong = s => toD(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMes = m => toD(m + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const fmtN = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = c => (c / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/* ---------- estado ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.entries)) return s;
  } catch (e) {}
  return {
    metas: [],
    caixinhas: [{ id: uid(), nome: 'Alimentação', pct: 20, cor: COLORS[0] }],
    entries: [],
    cfg: { custo: 0, usar: false }
  };
}
function migrate(s) {
  s.cfg = s.cfg || { custo: 0, usar: false };
  if (!Array.isArray(s.cfg.semana)) s.cfg.semana = [1, 2, 3, 4, 5, 6]; // padrão: seg a sáb
  s.work = s.work || {};
  s.caixinhas = s.caixinhas || [];
  if (!s.caixinhas.some(c => c.fixa === 'empresa'))
    s.caixinhas.unshift({ id: 'caixa-empresa', nome: 'Caixa da Empresa', pct: 0, cor: '#4E2E20', fixa: 'empresa' });                                               // exceções: { 'AAAA-MM-DD': true|false }
  return s;
}
let S = migrate(load());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Não foi possível salvar os dados'); } };

let tab = 'inicio';
let mes = today().slice(0, 7);
function newDraft() {
  return {
    date: today(), custo: S.cfg.usar ? inp(S.cfg.custo) : '', qtd: '', receita: '',
    despesas: '', obs: '', adiantar: false, usar: !!S.cfg.usar
  };
}
let draft = newDraft();

/* ---------- saldos e metas ---------- */
const sumM = (id, pred = () => true) => S.entries.filter(pred).reduce((a, e) => a + ((e.aloc.m || {})[id] || 0), 0);
const sumC = id => S.entries.reduce((a, e) => a + ((e.aloc.c || {})[id] || 0), 0);
function balances() {
  let metas = 0, cx = 0, livre = 0;
  S.entries.forEach(e => {
    Object.values(e.aloc.m || {}).forEach(v => metas += v);
    Object.values(e.aloc.c || {}).forEach(v => cx += v);
    livre += e.aloc.l || 0;
  });
  return { metas, cx, livre };
}

/* ---------- dias de trabalho ----------
   Um dia é de trabalho se: (1) há exceção marcada pelo usuário (extra/folga), ou
   (2) já existe entrada registrada nele, ou (3) o dia da semana está no padrão. */
const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return ds(d); };
const diaDates = () => new Set(S.entries.filter(e => e.type === 'dia').map(e => e.date));
const baseWork = (date, dd) => (dd || diaDates()).has(date) || S.cfg.semana.includes(toD(date).getDay());
const isWork = (date, dd) => { const o = S.work[date]; return o !== undefined ? o : baseWork(date, dd); };
function workDays(a, b) {
  if (a > b) return 0;
  const dd = diaDates(); let n = 0;
  for (let d = a, k = 0; d <= b && k < 3660; d = addDays(d, 1), k++) if (isWork(d, dd)) n++;
  return n;
}

/* Quanto precisa guardar na data D para a meta.
   valor por dia = (total - guardado antes de D) / dias de TRABALHO restantes (D até o prazo).
   Antecipar, atrasar, marcar folga ou dia extra mudam essa conta e tudo é recalculado. */
function metaInfo(m, D) {
  const saved = sumM(m.id);
  const before = sumM(m.id, e => e.date < D);
  const given = sumM(m.id, e => e.date === D);
  const rem = Math.max(0, m.valor - saved);
  const dwork = isWork(D);
  const wd = workDays(D, m.prazo);
  const overdue = rem > 0 && (m.prazo < D || wd === 0);
  const need = overdue ? Math.max(0, m.valor - before)
    : (dwork ? Math.max(0, Math.ceil((m.valor - before) / wd)) : 0);
  const hoje = Math.min(rem, Math.max(0, need - given));
  const wdNext = wd - (dwork ? 1 : 0);
  const perDay = rem === 0 ? 0 : overdue ? rem : (hoje > 0 ? need : (wdNext > 0 ? Math.ceil(rem / wdNext) : rem));
  const totalW = Math.max(1, workDays(m.inicio, m.prazo));
  const elapsedW = D > m.inicio ? workDays(m.inicio, addDays(D, -1)) : 0;
  const expected = Math.round(m.valor * Math.min(totalW, elapsedW) / totalW);
  let status = 'ok';
  if (rem === 0) status = 'done';
  else if (overdue) status = 'late';
  else if (before < expected - 1) status = 'behind';
  else if (saved > expected + Math.ceil(m.valor / totalW)) status = 'ahead';
  return { saved, rem, dl: wd, overdue, need, hoje, perDay, status, dwork, pct: Math.min(100, Math.round(saved / m.valor * 100)) };
}

/* Distribuição de uma entrada: metas por prioridade, depois caixinhas (%), resto = saldo livre */
function compute(d) {
  const custoTotal = Math.round(d.custo * d.qtd);
  const lucro = d.receita - custoTotal;
  const disp = Math.max(0, lucro - d.despesas);
  let left = disp;
  const m = {}, infos = [];
  S.metas.forEach(mt => {
    const i = metaInfo(mt, d.date);
    infos.push(i);
    const g = Math.min(i.hoje, left);
    m[mt.id] = g; left -= g;
  });
  if (d.adiantar) {
    S.metas.forEach((mt, k) => {
      const room = infos[k].rem - m[mt.id];
      const g = Math.min(room, left);
      if (g > 0) { m[mt.id] += g; left -= g; }
    });
  }
  const restante = left;
  const c = {}; let used = 0;
  S.caixinhas.filter(x => !x.fixa).forEach(x => { const v = Math.floor(restante * x.pct / 100); c[x.id] = v; used += v; });
  // o custo da mercadoria é separado primeiro, automaticamente, na Caixa da Empresa
  const empresa = Math.min(Math.max(0, custoTotal), Math.max(0, d.receita));
  c[EMPRESA] = empresa;
  return { custoTotal, lucro, disp, m, infos, restante, c, empresa, livre: restante - used };
}
function draftNums() {
  return {
    date: draft.date || today(), custo: parseMoney(draft.custo), qtd: parseNum(draft.qtd),
    receita: parseMoney(draft.receita), despesas: parseMoney(draft.despesas), adiantar: !!draft.adiantar
  };
}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (undo ? ' <button type="button" data-undo>Desfazer</button>' : '');
  t._undo = undo || null;
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 2600);
}
$('#toast').addEventListener('click', e => {
  const t = $('#toast');
  if (e.target.hasAttribute('data-undo') && t._undo) { t._undo(); t._undo = null; t.classList.remove('show'); }
});
function modal(title, body, onSubmit, opts = {}) {
  const o = document.createElement('div');
  o.className = 'ov';
  o.innerHTML = `<form class="sheet"><div class="grab"></div><h3>${title}</h3>${body}<div class="btns">${opts.extra || ''}<button type="button" class="ghost" data-close>${opts.nosave ? 'Fechar' : 'Cancelar'}</button>${opts.nosave ? '' : '<button class="pri">Salvar</button>'}</div></form>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', e => { if (e.target === o || e.target.hasAttribute('data-close')) close(); });
  o.querySelector('form').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    if (onSubmit && onSubmit(f) === false) return;
    close();
  });
  return { o, close };
}
const closeModals = () => document.querySelectorAll('.ov').forEach(o => o.remove());

const ICON = {
  trend: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
  inicio: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  metas: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  mensal: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h8M8 17.5h5"/></svg>',
  cal: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01"/></svg>',
  box: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
  hash: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>',
  cash: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/></svg>'
};

/* ---------- views ---------- */
function dateLabel(d) {
  const T = today();
  if (d === T) return 'Hoje';
  if (d === addDays(T, -1)) return 'Ontem';
  if (d === addDays(T, 1)) return 'Amanhã';
  return fmtDate(d).slice(0, 5);
}

function vInicio() {
  const b = balances();
  return `
  <header class="top"><h1>Metas Financeiras</h1><div class="sub">${fmtLong(today())}</div></header>
  <div class="stats">
    <div class="t1"><span>Saldo livre</span><b>${fmt(b.livre)}</b></div>
    <div class="t2"><span>Em metas</span><b>${fmt(b.metas)}</b></div>
    <div class="t3"><span>Caixinhas</span><b>${fmt(b.cx)}</b></div>
  </div>
  ${vEntrada()}
  ${vMetasHoje()}
  ${vCaixinhas()}
  <details class="acc"><summary>Resumo financeiro de hoje</summary><div id="resumo"></div></details>`;
}

function vEntrada() {
  return `
  <div class="card entry">
    <div class="row"><h2>Entrada do Dia</h2>
      <div class="datepick"><button type="button" data-a="dprev" aria-label="Dia anterior">‹</button><label class="dl">${dateLabel(draft.date)}<input type="date" data-f="date" value="${esc(draft.date)}"></label><button type="button" data-a="dnext" aria-label="Próximo dia">›</button></div>
    </div>
    <div class="two-in">
      <div><label>Custo unitário</label><div class="field">${ICON.box}<span>R$</span><input inputmode="decimal" enterkeyhint="next" data-f="custo" placeholder="0,00" value="${esc(draft.custo)}"></div></div>
      <div><label>Qtd. vendida</label><div class="field">${ICON.hash}<input inputmode="decimal" enterkeyhint="next" data-f="qtd" placeholder="0" value="${esc(draft.qtd)}"></div></div>
    </div>
    <label>Dinheiro do dia (total recebido)</label>
    <div class="field lg">${ICON.cash}<span>R$</span><input inputmode="decimal" enterkeyhint="done" data-f="receita" placeholder="0,00" value="${esc(draft.receita)}"></div>
    <div id="calc1"></div>
    <details class="acc"><summary>Detalhes do lucro</summary><div id="det" class="brk"></div></details>
    <label class="chk"><input type="checkbox" data-f="usar" ${draft.usar ? 'checked' : ''}> Usar este custo unitário nos próximos dias</label>
    <details class="acc"><summary>Despesas e observações</summary>
      <label>Despesas do dia</label>
      <div class="field"><span>R$</span><input inputmode="decimal" data-f="despesas" placeholder="0,00" value="${esc(draft.despesas)}"></div>
      <label>Observações</label>
      <div class="field"><input data-f="obs" placeholder="Opcional" value="${esc(draft.obs)}"></div>
    </details>
    <label class="chk"><input type="checkbox" data-f="adiantar" ${draft.adiantar ? 'checked' : ''}> Adiantar metas com o excedente</label>
    <details class="acc" open><summary>Para onde vai o dinheiro</summary><div id="calc2" class="brk"></div></details>
    <button class="pri" data-a="registrar" id="btnReg">Registrar</button>
  </div>`;
}

function vMetasHoje() {
  if (!S.metas.length) return '';
  const D = today();
  return `<details class="acc" open><summary>Metas de hoje</summary>
  ${isWork(D) ? '' : '<div class="mut note">Hoje é folga — as metas não recebem cota.</div>'}
  <div class="plist">${S.metas.map((m, k) => {
    const i = metaInfo(m, D);
    return `<div class="prow" style="${pstyle(k)}"><i class="pd">P${k + 1}</i><span class="pn">${esc(m.nome)}<small>${i.status === 'done' ? 'Concluída' : 'até ' + fmtDate(m.prazo).slice(0, 5)}</small></span><b>${i.status === 'done' ? '✓' : fmt(i.hoje)}</b></div>`;
  }).join('')}</div>
  <button class="link" data-a="tab" data-id="metas">Ver todas as metas ›</button></details>`;
}

function vCaixinhas() {
  const b = balances();
  const tot = S.caixinhas.reduce((a, c) => a + c.pct, 0);
  const D = today();
  const has = new Set(S.caixinhas.map(c => c.nome.toLowerCase()));
  const sug = SUGESTOES.filter(x => !has.has(x.toLowerCase()));
  const seg = S.caixinhas.filter(c => !c.fixa && c.pct > 0);
  return `<section>
    <div class="row"><h3>Minhas Caixinhas</h3><button class="pri sm" data-a="novaCx">+ Nova</button></div>
    <div class="distbar">${seg.map(c => `<i style="width:${c.pct}%;background:${c.cor}"></i>`).join('')}</div>
    <div class="row dline"><span>Distribuição automática: <b>${tot}%</b></span><button class="ghost sm" data-a="dist100">Distribuir 100%</button></div>
    <div class="${tot > 100 ? 'neg' : 'gold'} note">${tot > 100 ? 'Passou de 100%! Ajuste as caixinhas.' : (100 - tot) + '% continuará no saldo livre.'}</div>
    <div class="clist">${S.caixinhas.map(c => {
      const hoje = S.entries.filter(e => e.date === D).reduce((a, e) => a + ((e.aloc.c || {})[c.id] || 0), 0);
      return `<div class="crow"><span class="dot" style="background:${c.cor}"></span>
        <div class="cn"><b>${esc(c.nome)}</b><small>${c.fixa ? 'automática · custo da mercadoria' : c.pct + '%'} · hoje ${fmt(hoje)}</small></div>
        <div class="cv">${fmt(sumC(c.id))}</div>
        ${c.fixa ? '' : `<button class="ib" data-a="editCx" data-id="${c.id}" aria-label="Editar">✎</button>`}<button class="ib" data-a="opcCx" data-id="${c.id}" aria-label="Opções">⋯</button></div>`;
    }).join('') || '<div class="empty">Nenhuma caixinha ainda.</div>'}</div>
    <div class="row mini2"><span>Saldo livre</span><b class="${b.livre < 0 ? 'neg' : ''}">${fmt(b.livre)}</b></div>
    ${sug.length ? `<details class="acc" open><summary>Sugestões</summary><div class="chips">${sug.map(x => `<button class="chip" data-a="sugestao" data-id="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div></details>` : ''}
  </section>`;
}

function vMetas() {
  const D = today();
  const infos = S.metas.map(m => ({ m, i: metaInfo(m, D) }));
  const totHoje = infos.reduce((a, x) => a + x.i.hoje, 0);
  return `<header class="top row"><div><h1>Metas</h1><div class="sub">Por ordem de prioridade</div></div><button class="pri sm" data-a="novaMeta">+ Nova meta</button></header>
  <div class="stats two"><div class="t2"><span>Guardar hoje</span><b>${fmt(totHoje)}</b></div><div class="t1"><span>Saldo livre</span><b>${fmt(balances().livre)}</b></div></div>
  ${infos.map(({ m, i }, k) => {
    const badge = { done: '<span class="badge ok">Concluída</span>', late: '<span class="badge late">Vencida</span>', behind: '<span class="badge late">Atrasada</span>', ahead: '<span class="badge ahead">Adiantada</span>', ok: '' }[i.status];
    const dias = m.prazo < D ? 'vencida' : i.dl === 0 ? 'sem dias de trabalho' : i.dl + (i.dl > 1 ? ' dias' : ' dia');
    return `<div class="mcard" style="${pstyle(k)}">
      <div class="mh"><span class="pb">P${k + 1}</span><b class="mn">${esc(m.nome)}</b>${badge}<span class="mdate">${fmtDate(m.prazo).slice(0, 5)} · ${dias}</span></div>
      <div class="bar"><i style="width:${i.pct}%"></i></div>
      <div class="mrow"><span>${fmt(i.saved)} de ${fmt(m.valor)}</span><b>${i.pct}%</b></div>
      ${i.status === 'done' ? '' : `<div class="mgrid"><div><small>Hoje</small><b>${fmt(i.hoje)}</b></div><div><small>Por dia</small><b>${fmt(i.perDay)}</b></div><div><small>Falta</small><b>${fmt(i.rem)}</b></div></div>`}
      <div class="macts">
        <button class="ib" data-a="up" data-id="${m.id}" ${k === 0 ? 'disabled' : ''} aria-label="Subir prioridade">↑</button>
        <button class="ib" data-a="down" data-id="${m.id}" ${k === S.metas.length - 1 ? 'disabled' : ''} aria-label="Descer prioridade">↓</button>
        <span class="sp"></span>
        <button class="ghost sm" data-a="editMeta" data-id="${m.id}">Editar</button>
        ${i.status === 'done' ? '' : `<button class="ghost sm" data-a="depMeta" data-id="${m.id}">Adiantar</button>`}
      </div></div>`;
  }).join('') || '<div class="empty" style="margin-top:12px">Crie sua primeira meta: informe o valor total e até quando precisa guardar. O app calcula quanto guardar por dia.<br><button class="pri sm" style="margin-top:10px" data-a="novaMeta">+ Criar meta</button></div>'}`;
}

function monthEntries() { return S.entries.filter(e => e.date.startsWith(mes)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); }
function entDesc(e) {
  if (e.type === 'dia') return { t: 'Entrada do dia', s: `Receita ${fmt(e.receita)} · Lucro ${fmt(e.lucro)}${e.despesas ? ' · Desp. ' + fmt(e.despesas) : ''}${e.obs ? ' · ' + esc(e.obs) : ''}` };
  return { t: esc(e.desc || e.type), s: '' };
}
function monthNav(title) {
  return `<header class="top"><h1>${title}</h1></header><div class="monthnav"><button data-a="mesPrev">‹</button><b>${fmtMes(mes)}</b><button data-a="mesNext">›</button></div>`;
}
/* ---------- projeção do mês ----------
   Média diária = últimos 14 dias trabalhados com entrada registrada.
   Dias restantes = dias de trabalho do calendário (padrão + folgas/extras) que ainda faltam no mês.
   As metas são simuladas dia a dia com a mesma regra do app (cota = falta ÷ dias de trabalho até o prazo),
   limitadas pelo que sobra do lucro líquido de cada dia. */
function mediasDiarias() {
  const T = today(), por = {};
  S.entries.filter(e => e.type === 'dia' && e.date <= T).forEach(e => {
    const o = por[e.date] || (por[e.date] = { r: 0, c: 0, d: 0 });
    o.r += e.receita; o.c += e.custoTotal; o.d += e.despesas;
  });
  const dias = Object.keys(por).sort().slice(-14), n = dias.length;
  const avg = k => n ? Math.round(dias.reduce((a, d) => a + por[d][k], 0) / n) : 0;
  return { n, r: avg('r'), c: avg('c'), d: avg('d') };
}

function projecao(mesStr) {
  const T = today(), [y, mo] = mesStr.split('-').map(Number);
  const first = `${mesStr}-01`, last = ds(new Date(y, mo, 0));
  const med = mediasDiarias(), dd = diaDates();

  // realizado no mês
  const real = { r: 0, c: 0, d: 0, m: {}, cx: {}, emp: 0, livre: 0, dias: 0 };
  const diasSet = new Set();
  S.entries.filter(e => e.type === 'dia' && e.date >= first && e.date <= last).forEach(e => {
    real.r += e.receita; real.c += e.custoTotal; real.d += e.despesas; real.livre += e.aloc.l || 0; diasSet.add(e.date);
    Object.entries(e.aloc.m || {}).forEach(([k, v]) => real.m[k] = (real.m[k] || 0) + v);
    Object.entries(e.aloc.c || {}).forEach(([k, v]) => { if (k === EMPRESA) real.emp += v; else real.cx[k] = (real.cx[k] || 0) + v; });
  });
  real.dias = diasSet.size;

  // simulação dos dias restantes
  const simStart = dd.has(T) ? addDays(T, 1) : T;
  let restam = 0;
  for (let d = simStart; d <= last; d = addDays(d, 1)) if (isWork(d, dd)) restam++;
  const simula = restam > 0 && med.n > 0;
  const rem = {}, dep = {}, fim = {}, falta = {};
  S.metas.forEach(m => { rem[m.id] = Math.max(0, m.valor - sumM(m.id)); dep[m.id] = 0; falta[m.id] = rem[m.id]; });
  const sim = { r: 0, c: 0, d: 0, cx: {}, livre: 0, dias: 0 };
  S.caixinhas.forEach(c => { if (!c.fixa) sim.cx[c.id] = 0; });
  if (simula) {
    const maxP = S.metas.filter(m => rem[m.id] > 0).reduce((a, m) => m.prazo > a ? m.prazo : a, last);
    const lim = addDays(T, 800), hor = maxP > lim ? lim : maxP;
    const dias = [], work = [];
    for (let d = simStart; d <= hor; d = addDays(d, 1)) { dias.push(d); work.push(isWork(d, dd)); }
    const pre = [0]; work.forEach(w => pre.push(pre[pre.length - 1] + (w ? 1 : 0)));
    const disp = Math.max(0, med.r - med.c - med.d);
    dias.forEach((dt, i) => {
      if (!work[i]) return;
      const inMes = dt >= first && dt <= last;
      let av = disp;
      S.metas.forEach(m => {
        if (rem[m.id] <= 0) return;
        const pi = Math.min(dias.length - 1, diff(simStart, m.prazo));
        const wd = pi >= i ? pre[pi + 1] - pre[i] : 0;
        const need = (m.prazo < dt || wd === 0) ? rem[m.id] : Math.ceil(rem[m.id] / wd);
        const give = Math.min(need, av, rem[m.id]);
        rem[m.id] -= give; av -= give;
        if (inMes) dep[m.id] += give;
        if (rem[m.id] <= 0 && !fim[m.id]) fim[m.id] = dt;
        if (dt <= m.prazo) falta[m.id] = rem[m.id];
      });
      if (inMes) {
        sim.dias++; sim.r += med.r; sim.c += med.c; sim.d += med.d;
        let used = 0;
        S.caixinhas.filter(c => !c.fixa).forEach(c => { const v = Math.floor(av * c.pct / 100); sim.cx[c.id] += v; used += v; });
        sim.livre += av - used;
      }
    });
  }
  const noMes = first <= T && T <= last;
  return { med, real, sim, dep, fim, falta, first, last, fut: restam,
    livreMes: real.livre + sim.livre, livreTotal: noMes ? balances().livre + sim.livre : null };
}

function vProj() {
  const P = projecao(mes), { med, real, sim } = P;
  const cols = P.fut > 0;
  if (cols && med.n === 0) return `<section><h3>Projeção do mês</h3><div class="empty" style="margin-top:8px">Registre algumas entradas diárias para ver a previsão de faturamento, lucro e saldo do mês.</div></section>`;
  if (!cols && real.dias === 0) return '';
  const metas = S.metas, cxs = S.caixinhas.filter(c => !c.fixa);
  const sumR = o => metas.reduce((a, m) => a + (o[m.id] || 0), 0);
  const tot = { r: real.r + sim.r, c: real.c + sim.c, d: real.d + sim.d };
  const mReal = sumR(real.m), mProj = mReal + sumR(P.dep);
  const xReal = cxs.reduce((a, c) => a + (real.cx[c.id] || 0), 0), xProj = xReal + cxs.reduce((a, c) => a + (sim.cx[c.id] || 0), 0);
  const empProj = real.emp + (cols ? sim.c : 0);
  const lucB = [real.r - real.c, tot.r - tot.c], lucL = [lucB[0] - real.d, lucB[1] - tot.d];
  const row = (lbl, a, b, cls = '', st = '') => `<tr class="${cls}" ${st ? `style="${st}"` : ''}><td>${lbl}</td><td>${fmtN(a)}</td>${cols ? `<td>${fmtN(b)}</td>` : ''}</tr>`;
  const T = cols ? 'Projeção do mês' : 'Fechamento do mês';
  const colorBar = [['#4E2E20', 'Custo da mercadoria', tot.c], ['#C93A2B', 'Despesas', tot.d], ['#F04A00', 'Metas', mProj], ['#C98A12', 'Caixinhas', xProj], ['#2E8B57', 'Saldo livre', P.livreMes]];
  const fat = tot.r;
  const bar = fat > 0 ? `<div class="distbar tall">${colorBar.map(([c, , v]) => v > 0 ? `<i style="width:${(v / fat * 100).toFixed(2)}%;background:${c}"></i>` : '').join('')}</div>
    <div class="legend">${colorBar.map(([c, n, v]) => `<span><i class="dot" style="background:${c}"></i>${n} <b>${fat > 0 ? Math.round(v / fat * 100) : 0}%</b></span>`).join('')}</div>` : '';
  const metaRows = metas.map((m, k) => row(`<i class="dot" style="background:${prio(k).c}"></i>${esc(m.nome)}`, real.m[m.id] || 0, (real.m[m.id] || 0) + (P.dep[m.id] || 0), 'subr')).join('');
  const cxRows = cxs.map(c => row(`<i class="dot" style="background:${c.cor}"></i>${esc(c.nome)} · ${c.pct}%`, real.cx[c.id] || 0, (real.cx[c.id] || 0) + (sim.cx[c.id] || 0), 'subr')).join('');
  const outlook = cols && metas.length ? `<details class="acc" open><summary>Metas: previsão até o prazo</summary><div class="plist">${metas.map((m, k) => {
    const i = metaInfo(m, today());
    let st;
    if (i.status === 'done') st = '<b class="pos">Concluída</b>';
    else if (P.fim[m.id]) st = `<b class="pos">Conclui em ${fmtDate(P.fim[m.id]).slice(0, 5)}</b>`;
    else st = `<b class="neg">Faltam ${fmt(P.falta[m.id])}</b>`;
    return `<div class="prow" style="${pstyle(k)}"><i class="pd">P${k + 1}</i><span class="pn">${esc(m.nome)}<small>prazo ${fmtDate(m.prazo).slice(0, 5)} · no mês ${fmt(P.dep[m.id] || 0)}</small></span>${st}</div>`;
  }).join('')}</div><div class="mut note">Considera guardar a cota diária com o lucro líquido médio de cada dia, seguindo a ordem de prioridade.</div></details>` : '';
  return `<section class="proj">
    <h3>${T}</h3>
    <div class="card hero">
      <div class="hl">${cols ? 'Saldo livre previsto no fim do mês' : 'Saldo livre gerado no mês'}</div>
      <div class="hv ${P.livreMes < 0 ? 'neg' : ''}">${fmt(P.livreMes)}</div>
      ${P.livreTotal !== null ? `<div class="hs">Saldo livre total no fim do mês: <b>${fmt(P.livreTotal)}</b></div>` : ''}
      <div class="hgrid"><div><small>Faturamento</small><b>${fmt(tot.r)}</b></div><div><small>Lucro bruto</small><b>${fmt(lucB[1])}</b></div><div><small>Lucro líquido</small><b>${fmt(lucL[1])}</b></div></div>
      ${cols ? `<small class="hbase">Base: média de ${med.n} dia${med.n > 1 ? 's' : ''} trabalhado${med.n > 1 ? 's' : ''} (faturamento ${fmt(med.r)}/dia · custo ${fmt(med.c)}/dia · despesas ${fmt(med.d)}/dia) × ${sim.dias} dia${sim.dias === 1 ? '' : 's'} de trabalho restante${sim.dias === 1 ? '' : 's'}.${med.n < 3 ? ' Poucos dias registrados: a previsão melhora com mais lançamentos.' : ''}</small>` : ''}
    </div>
    ${bar}
    <details class="acc" open><summary>Detalhamento (R$)</summary>
      <table class="ptab"><thead><tr><th></th><th>Realizado</th>${cols ? '<th>Projeção</th>' : ''}</tr></thead><tbody>
        ${row('Faturamento', real.r, tot.r, 'top')}
        ${row('(−) Custo da mercadoria<small>vai para a Caixa da Empresa</small>', real.c, tot.c)}
        ${row('(=) Lucro bruto', lucB[0], lucB[1], 'tot')}
        ${row('(−) Despesas', real.d, tot.d)}
        ${row('(=) Lucro líquido', lucL[0], lucL[1], 'tot')}
        ${row('(−) Metas guardadas', mReal, mProj)}${metaRows}
        ${row('(−) Caixinhas', xReal, xProj)}${cxRows}
        ${row('(=) Saldo livre do mês', real.livre, P.livreMes, 'tot fin')}
      </tbody></table>
      <div class="mut note">Caixa da Empresa no mês: ${fmt(real.emp)}${cols ? ` → ${fmt(empProj)} projetado` : ''}.${lucL[1] < 0 ? ' Lucro líquido negativo: nada sobra para metas e caixinhas.' : ''}</div>
    </details>
    ${outlook}
  </section>`;
}

function vMensal() {
  const es = monthEntries(), dias = es.filter(e => e.type === 'dia');
  const sum = f => dias.reduce((a, e) => a + f(e), 0);
  const rec = sum(e => e.receita), custo = sum(e => e.custoTotal), desp = sum(e => e.despesas), lucro = sum(e => e.lucro);
  const toMetas = sum(e => Object.values(e.aloc.m || {}).reduce((a, v) => a + v, 0));
  const toCx = sum(e => Object.entries(e.aloc.c || {}).reduce((a, [k, v]) => k === EMPRESA ? a : a + v, 0));
  const toEmp = sum(e => (e.aloc.c || {})[EMPRESA] || 0);
  const nd = new Set(dias.map(e => e.date)).size;
  return `${monthNav('Mensal')}
  ${vProj()}
  <section><h3>Realizado no mês</h3><div class="grid" style="margin-top:8px">
    <div class="k"><span>Faturamento</span><b>${fmt(rec)}</b></div>
    <div class="k"><span>Custo da mercadoria</span><b>${fmt(custo)}</b></div>
    <div class="k"><span>Despesas</span><b>${fmt(desp)}</b></div>
    <div class="k"><span>Lucro líquido</span><b class="${lucro - desp < 0 ? 'neg' : 'pos'}">${fmt(lucro - desp)}</b></div>
    <div class="k"><span>Foi para metas</span><b>${fmt(toMetas)}</b></div>
    <div class="k"><span>Foi para caixinhas</span><b>${fmt(toCx)}</b></div>
    <div class="k"><span>Caixa da Empresa</span><b>${fmt(toEmp)}</b></div>
    <div class="k"><span>Dias trabalhados</span><b>${nd}</b></div>
    <div class="k"><span>Média de lucro/dia</span><b>${fmt(nd ? Math.round((lucro - desp) / nd) : 0)}</b></div>
    <div class="k"><span>Lançamentos</span><b>${dias.length}</b></div>
  </div></section>
  <section><h3>Lançamentos</h3>
  ${es.map(e => { const d = entDesc(e); return `<div class="mini"><div>${fmtDate(e.date)} · ${d.t}<small>${d.s}</small></div><button class="ghost sm danger" data-a="delEntry" data-id="${e.id}">Excluir</button></div>`; }).join('') || '<div class="empty">Sem lançamentos neste mês.</div>'}
  </section>
  <section><h3>Backup</h3><div class="actions"><button class="ghost" data-a="export">Exportar dados</button><button class="ghost" data-a="import">Importar dados</button></div>
  <input type="file" id="file" accept="application/json" hidden></section>`;
}

let calEdit = false;

/* Meta do dia = soma das cotas das metas naquele dia (o que precisava guardar);
   guardado = quanto de fato foi para metas nas entradas daquele dia. */
function dayStats(date) {
  const goal = S.metas.reduce((a, m) => {
    if (date < m.inicio || date > m.prazo) return a;
    const rem = m.valor - sumM(m.id, e => e.date < date);
    if (rem <= 0) return a;
    const wd = Math.max(1, workDays(date, m.prazo));
    return a + Math.min(rem, Math.ceil(rem / wd));
  }, 0);
  const got = S.entries.filter(e => e.date === date).reduce((a, e) => a + Object.values(e.aloc.m || {}).reduce((x, v) => x + v, 0), 0);
  const hasEntry = S.entries.some(e => e.date === date && e.type === 'dia');
  const T = today();
  let res = '';                                   // '' = cinza (futuro / em andamento)
  if (date <= T) {
    if (goal === 0) res = hasEntry ? 'ok' : '';
    else if (got >= goal) res = 'ok';             // bateu ou superou
    else if (date < T) res = 'miss';              // não atingiu (hoje só fica vermelho depois de virar o dia)
  }
  return { goal, got, res };
}
const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const quotaTotal = () => { const T = today(); return S.metas.reduce((a, m) => a + metaInfo(m, T).perDay, 0); };

function vCal() {
  const [y, m] = mes.split('-').map(Number);
  const first = new Date(y, m - 1, 1), n = new Date(y, m, 0).getDate();
  const T = today(), dd = diaDates();
  let h = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="h">${x}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) h += '<button class="void"></button>';
  let nw = 0;
  for (let d = 1; d <= n; d++) {
    const date = `${mes}-${pad(d)}`;
    const w = isWork(date, dd); if (w) nw++;
    const ov = S.work[date], pat = S.cfg.semana.includes(toD(date).getDay());
    const tag = w ? (ov === true && !pat ? 'extra' : '') : (ov === false && pat ? 'folga' : '');
    const dias = S.entries.filter(e => e.date === date && e.type === 'dia');
    const luc = dias.reduce((a, e) => a + e.lucro - e.despesas, 0);
    const due = S.metas.some(mt => mt.prazo === date);
    const st = w ? dayStats(date).res : '';
    h += `<button class="${date === T ? 'today' : ''} ${dias.length ? 'has' : ''} ${w ? 'wk ' + st : 'off'} ${tag === 'extra' ? 'extra' : ''}" data-a="day" data-id="${date}">${d}${tag ? `<em>${tag}</em>` : ''}${dias.length ? `<small class="${luc < 0 ? 'neg' : ''}">${short(luc)}</small>` : ''}${due ? '<i></i>' : ''}</button>`;
  }
  return `${monthNav('Calendário')}
  <div class="grid" style="margin-bottom:14px"><div class="k"><span>Dias de trabalho no mês</span><b>${nw}</b></div><div class="k"><span>Cota diária das metas</span><b>${fmt(quotaTotal())}</b></div></div>
  <div class="mut" style="font-size:14px">Dias de trabalho padrão</div>
  <div class="chips" style="margin:8px 0 14px">${NOMES_DIA.map((nm, k) => `<button class="chip wd ${S.cfg.semana.includes(k) ? 'on' : ''}" data-a="semana" data-id="${k}">${nm}</button>`).join('')}</div>
  <div class="actions" style="margin:0 0 12px"><button class="${calEdit ? 'pri sm' : 'ghost'}" data-a="calEdit">${calEdit ? '✓ Editando dias' : 'Escolher dias'}</button><button class="ghost" data-a="resetMes">Restaurar padrão do mês</button></div>
  ${calEdit ? '<div class="gold" style="margin-bottom:10px;font-size:14px">Toque nos dias para alternar entre trabalho e folga. As metas são recalculadas a cada toque.</div>' : ''}
  <div class="cal">${h}</div>
  <p class="mut" style="margin-top:14px;font-size:13px">Cinza = dia de trabalho · verde = meta do dia batida · vermelho = meta do dia não atingida · listrado = folga · “extra” = dia fora do padrão · número = lucro líquido · ● = prazo de meta. ${calEdit ? '' : 'Toque num dia para ver detalhes, marcar folga/extra ou lançar.'}</p>`;
}

function render() {
  $('#app').innerHTML = ({ inicio: vInicio, metas: vMetas, mensal: vMensal, cal: vCal }[tab])();
  $('#nav').innerHTML = [['inicio', 'Início'], ['metas', 'Metas'], ['mensal', 'Mensal'], ['cal', 'Calendário']]
    .map(([k, l]) => `<button data-a="tab" data-id="${k}" class="${tab === k ? 'on' : ''}">${ICON[k === 'cal' ? 'cal' : k]}${l}</button>`).join('');
  if (tab === 'inicio') renderPreview();
}

function renderPreview() {
  const c1 = $('#calc1'); if (!c1) return;
  const d = draftNums(), r = compute(d);
  c1.innerHTML = `<div class="two"><div><span>Custo total</span><b>${fmt(r.custoTotal)}</b></div><div><span>Receita</span><b>${fmt(d.receita)}</b></div></div>
  <div class="profit"><span>${ICON.trend} Lucro do dia</span><b class="${r.lucro < 0 ? 'neg' : ''}">${fmt(r.lucro)}</b></div>`;
  $('#det').innerHTML = `<div class="r"><span>Receita</span><span>${fmt(d.receita)}</span></div><div class="r"><span>− Custo (${fmt(d.custo)} × ${d.qtd || 0})</span><span>${fmt(r.custoTotal)}</span></div><div class="r b"><span>Lucro</span><span>${fmt(r.lucro)}</span></div>`;
  const emp = S.caixinhas.find(c => c.fixa);
  $('#calc2').innerHTML = `${isWork(d.date) ? '' : '<div class="mut note">Dia de folga: as metas não recebem cota. Marque “Adiantar metas” para guardar mesmo assim.</div>'}
    <div class="r"><span><i class="dot" style="background:${emp ? emp.cor : '#4E2E20'}"></i>Caixa da Empresa<small>custo da mercadoria</small></span><span>${fmt(r.empresa)}</span></div>
    <div class="r"><span>Lucro recebido</span><span>${fmt(r.lucro)}</span></div>
    <div class="r"><span>Despesas</span><span>− ${fmt(d.despesas)}</span></div>
    <div class="r b"><span>Disponível para metas</span><span>${fmt(r.disp)}</span></div>
    ${S.metas.map((m, k) => { const i = r.infos[k]; const g = r.m[m.id] || 0;
      return `<div class="r" style="${pstyle(k)}"><span><i class="dot" style="background:var(--pc)"></i>${esc(m.nome)}${g < i.hoje ? `<small>faltou ${fmt(i.hoje - g)} da cota de hoje</small>` : ''}</span><span>${i.status === 'done' ? '✓' : fmt(g)}</span></div>`; }).join('')}
    <div class="r b"><span>Restante após metas</span><span>${fmt(r.restante)}</span></div>
    ${S.caixinhas.filter(c => !c.fixa).map(c => `<div class="r"><span><i class="dot" style="background:${c.cor}"></i>${esc(c.nome)} · ${c.pct}%</span><span>${fmt(r.c[c.id] || 0)}</span></div>`).join('')}
    <div class="r b"><span>Saldo livre desta entrada</span><span>${fmt(r.livre)}</span></div>`;
  $('#btnReg').disabled = d.receita <= 0;
  const rs = $('#resumo');
  if (rs) {
    const T = today(), es = S.entries.filter(e => e.date === T && e.type === 'dia');
    const sm = f => es.reduce((a, e) => a + f(e), 0);
    rs.innerHTML = es.length ? `<div class="brk"><div class="r"><span>Lançamentos</span><span>${es.length}</span></div><div class="r"><span>Receita</span><span>${fmt(sm(e => e.receita))}</span></div><div class="r"><span>Custo</span><span>${fmt(sm(e => e.custoTotal))}</span></div><div class="r"><span>Despesas</span><span>${fmt(sm(e => e.despesas))}</span></div><div class="r b"><span>Lucro líquido</span><span>${fmt(sm(e => e.lucro - e.despesas))}</span></div></div>` : '<div class="mut note">Nada registrado hoje.</div>';
  }
}

/* ---------- ações ---------- */
function registrar() {
  const d = draftNums();
  if (d.receita <= 0) return toast('Informe o dinheiro do dia');
  const r = compute(d);
  const eid = uid();
  S.entries.push({
    id: eid, type: 'dia', date: d.date, custo: d.custo, qtd: d.qtd, receita: d.receita,
    custoTotal: r.custoTotal, lucro: r.lucro, despesas: d.despesas, obs: draft.obs.trim(),
    aloc: { m: r.m, c: r.c, l: r.livre }
  });
  S.cfg.usar = !!draft.usar; S.cfg.custo = draft.usar ? d.custo : 0;
  save();
  const keep = draft.usar;
  draft = newDraft(); if (keep) draft.custo = inp(S.cfg.custo);
  render();
  if (navigator.vibrate) navigator.vibrate(15);
  toast('Entrada registrada ✓', () => { S.entries = S.entries.filter(e => e.id !== eid); save(); render(); });
}

function metaModal(id) {
  const m = S.metas.find(x => x.id === id);
  const mo = modal(id ? 'Editar meta' : 'Nova meta', `
    <label>Nome<input name="nome" required value="${esc(m ? m.nome : '')}" placeholder="Ex.: Aluguel"></label>
    <label>Valor total (R$)<input name="valor" required inputmode="decimal" value="${m ? inp(m.valor) : ''}" placeholder="0,00"></label>
    <label>Guardar até<input type="date" name="prazo" required value="${m ? m.prazo : ''}" ${m ? '' : `min="${today()}"`}></label>`,
    f => {
      const valor = parseMoney(f.valor);
      if (valor <= 0) { toast('Informe um valor maior que zero'); return false; }
      if (m) { m.nome = f.nome.trim(); m.valor = valor; m.prazo = f.prazo; }
      else S.metas.push({ id: uid(), nome: f.nome.trim(), valor, prazo: f.prazo, inicio: today() });
      save(); render();
    }, { extra: m ? '<button type="button" class="ghost danger" data-del>Excluir</button>' : '' });
  const del = mo.o.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm('Excluir esta meta? O valor guardado volta para o saldo livre.')) return;
    const saved = sumM(m.id);
    if (saved) S.entries.push({ id: uid(), type: 'ajuste', date: today(), desc: `Meta "${m.nome}" excluída — valor devolvido ao saldo livre`, aloc: { m: { [m.id]: -saved }, c: {}, l: saved } });
    S.metas = S.metas.filter(x => x.id !== m.id);
    save(); mo.close(); render();
  };
}

function depMeta(id) {
  const m = S.metas.find(x => x.id === id), i = metaInfo(m, today()), livre = balances().livre;
  modal(`Adiantar "${esc(m.nome)}"`, `<p class="mut">Move dinheiro do saldo livre (${fmt(livre)}) para a meta. Falta ${fmt(i.rem)}. Os próximos dias serão recalculados.</p>
    <label>Valor (R$)<input name="valor" required inputmode="decimal" placeholder="0,00" value="${inp(Math.min(livre, i.rem))}"></label>`,
    f => {
      const v = parseMoney(f.valor);
      if (v <= 0) { toast('Informe um valor'); return false; }
      if (v > livre) { toast('Valor maior que o saldo livre'); return false; }
      if (v > i.rem) { toast('Valor maior que o que falta na meta'); return false; }
      S.entries.push({ id: uid(), type: 'deposito', date: today(), desc: `Adiantamento na meta "${m.nome}": ${fmt(v)}`, aloc: { m: { [m.id]: v }, c: {}, l: -v } });
      save(); render(); toast('Meta adiantada ✓');
    });
}

function moveMeta(id, dir) {
  const k = S.metas.findIndex(m => m.id === id), j = k + dir;
  if (j < 0 || j >= S.metas.length) return;
  [S.metas[k], S.metas[j]] = [S.metas[j], S.metas[k]];
  save(); render();
}

function cxModal(id, nomeInicial) {
  const c = S.caixinhas.find(x => x.id === id);
  const outros = S.caixinhas.filter(x => x.id !== id).reduce((a, x) => a + x.pct, 0);
  modal(id ? 'Editar caixinha' : 'Nova caixinha', `
    <label>Nome<input name="nome" required value="${esc(c ? c.nome : nomeInicial || '')}" placeholder="Ex.: Lazer"></label>
    <label>Porcentagem do restante (%) <small>— disponível: ${100 - outros}%</small><input name="pct" required inputmode="decimal" value="${c ? c.pct : ''}" placeholder="0"></label>`,
    f => {
      const pct = Math.round(parseNum(f.pct));
      if (pct < 0 || outros + pct > 100) { toast(`A soma das caixinhas não pode passar de 100% (máx. ${100 - outros}%)`); return false; }
      if (c) { c.nome = f.nome.trim(); c.pct = pct; }
      else S.caixinhas.push({ id: uid(), nome: f.nome.trim(), pct, cor: COLORS[S.caixinhas.length % COLORS.length] });
      save(); render();
    });
}

function opcCx(id) {
  const c = S.caixinhas.find(x => x.id === id), bal = sumC(id);
  const mo = modal(esc(c.nome), `<div class="list"><button type="button" class="opt" data-o="ret">Retirar / gastar valor</button><button type="button" class="opt" data-o="liv">Devolver tudo ao saldo livre</button>${c.fixa ? '' : '<button type="button" class="opt danger" data-o="del">Excluir caixinha</button>'}</div>`, null, { nosave: true });
  mo.o.addEventListener('click', e => {
    const o = e.target.dataset.o; if (!o) return;
    if (o === 'ret') {
      mo.close();
      modal(`Retirar de "${esc(c.nome)}"`, `<p class="mut">Saldo: ${fmt(bal)}</p><label>Valor (R$)<input name="v" required inputmode="decimal" placeholder="0,00"></label><label>Motivo<input name="d" placeholder="Opcional"></label>`, f => {
        const v = parseMoney(f.v);
        if (v <= 0 || v > bal) { toast('Valor inválido para o saldo da caixinha'); return false; }
        S.entries.push({ id: uid(), type: 'retirada', date: today(), desc: `Retirada de "${c.nome}": ${fmt(v)}${f.d ? ' — ' + esc(f.d) : ''}`, aloc: { m: {}, c: { [id]: -v }, l: 0 } });
        save(); render();
      });
    } else if (o === 'liv') {
      if (bal <= 0) return toast('Caixinha sem saldo');
      S.entries.push({ id: uid(), type: 'ajuste', date: today(), desc: `"${c.nome}" devolvida ao saldo livre: ${fmt(bal)}`, aloc: { m: {}, c: { [id]: -bal }, l: bal } });
      save(); mo.close(); render();
    } else if (o === 'del') {
      if (!confirm('Excluir esta caixinha? O saldo volta para o saldo livre.')) return;
      if (bal) S.entries.push({ id: uid(), type: 'ajuste', date: today(), desc: `Caixinha "${c.nome}" excluída`, aloc: { m: {}, c: { [id]: -bal }, l: bal } });
      S.caixinhas = S.caixinhas.filter(x => x.id !== id);
      save(); mo.close(); render();
    }
  });
}

function dist100() {
  const lista = S.caixinhas.filter(c => !c.fixa);
  if (!lista.length) return toast('Crie uma caixinha primeiro');
  const tot = lista.reduce((a, c) => a + c.pct, 0);
  let acc = 0;
  lista.forEach((c, k) => {
    if (k === lista.length - 1) c.pct = 100 - acc;
    else { c.pct = tot > 0 ? Math.round(c.pct * 100 / tot) : Math.floor(100 / lista.length); acc += c.pct; }
  });
  save(); render(); toast('Caixinhas somam 100%');
}

function dayModal(date) {
  const es = S.entries.filter(e => e.date === date);
  const dueMetas = S.metas.filter(m => m.prazo === date);
  const w = isWork(date), ov = S.work[date], pat = S.cfg.semana.includes(toD(date).getDay());
  const T = today();
  let quota = 0;
  if (w && date >= T) quota = S.metas.filter(m => m.prazo >= date).reduce((a, m) => a + metaInfo(m, T).perDay, 0);
  const label = w ? (ov === true && !pat ? 'Dia de trabalho extra' : 'Dia de trabalho') : (ov === false ? 'Folga extra' : 'Folga');
  const mo = modal(fmtLong(date), `
    <div class="mini"><div>${w ? '🟢' : '⚪'} ${label}<small>${(() => { if (!w || !S.metas.length) return ''; if (date <= T) { const k = dayStats(date); return k.goal ? 'Meta do dia: ' + fmt(k.got) + ' de ' + fmt(k.goal) : ''; } return 'Cota prevista das metas: ' + fmt(quota); })()}</small></div>
      <button type="button" class="ghost sm" data-a="toggleDay" data-id="${date}">${w ? 'Marcar folga' : 'Trabalhar neste dia'}</button></div>
    ${ov !== undefined ? `<div class="mini"><div class="mut">Este dia foi alterado manualmente</div><button type="button" class="ghost sm" data-a="resetDay" data-id="${date}">Voltar ao padrão</button></div>` : ''}
    ${dueMetas.map(m => `<div class="mini"><div>🎯 Prazo da meta: ${esc(m.nome)}<small>${fmt(m.valor)}</small></div></div>`).join('')}
    ${es.map(e => { const d = entDesc(e); return `<div class="mini"><div>${d.t}<small>${d.s}</small></div><button type="button" class="ghost sm danger" data-del="${e.id}">Excluir</button></div>`; }).join('') || '<div class="empty" style="margin-top:8px">Sem lançamentos.</div>'}
    <div class="btns"><button type="button" class="pri" data-a="lancar" data-id="${date}">Lançar neste dia</button></div>`, null, { nosave: true });
  mo.o.addEventListener('click', e => {
    const id = e.target.dataset.del; if (!id) return;
    if (!confirm('Excluir este lançamento?')) return;
    S.entries = S.entries.filter(x => x.id !== id);
    save(); mo.close(); render();
  });
}

/* alterações de calendário: salvam, redesenham e mostram o efeito nas metas */
function calChanged(antes, date, msg) {
  save();
  const had = !!$('.ov'); closeModals(); render();
  if (had && date) dayModal(date);
  const depois = quotaTotal();
  toast(S.metas.length && antes !== depois ? `${msg} · cota diária: ${fmt(antes)} → ${fmt(depois)}` : msg);
}
function toggleDay(date) {
  const antes = quotaTotal(), w = !isWork(date);
  if (w === baseWork(date)) delete S.work[date]; else S.work[date] = w;
  calChanged(antes, date, w ? 'Dia de trabalho' : 'Folga');
}
function resetDay(date) { const a = quotaTotal(); delete S.work[date]; calChanged(a, date, 'Dia voltou ao padrão'); }
function toggleSemana(k) {
  const a = quotaTotal(), sm = S.cfg.semana;
  S.cfg.semana = sm.includes(k) ? sm.filter(x => x !== k) : [...sm, k].sort();
  calChanged(a, null, 'Dias padrão atualizados');
}
function resetMes() {
  const a = quotaTotal();
  Object.keys(S.work).forEach(d => { if (d.startsWith(mes)) delete S.work[d]; });
  calChanged(a, null, 'Mês restaurado ao padrão');
}

function shiftMes(n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  mes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  render();
}

function exportar() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `metas-financeiras-${today()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- eventos ---------- */
const actions = {
  tab: id => { tab = id; render(); window.scrollTo(0, 0); },
  registrar,
  dprev: () => { draft.date = addDays(draft.date, -1); render(); },
  dnext: () => { draft.date = addDays(draft.date, 1); render(); },
  novaMeta: () => metaModal(),
  editMeta: id => metaModal(id),
  depMeta,
  up: id => moveMeta(id, -1),
  down: id => moveMeta(id, 1),
  novaCx: () => cxModal(),
  editCx: id => cxModal(id),
  opcCx,
  sugestao: nome => cxModal(null, nome),
  dist100,
  delEntry: id => { if (confirm('Excluir este lançamento?')) { S.entries = S.entries.filter(e => e.id !== id); save(); render(); } },
  day: id => calEdit ? toggleDay(id) : dayModal(id),
  toggleDay, resetDay,
  semana: id => toggleSemana(Number(id)),
  calEdit: () => { calEdit = !calEdit; render(); },
  resetMes,
  lancar: date => { closeModals(); draft.date = date; tab = 'inicio'; render(); window.scrollTo(0, 0); },
  mesPrev: () => shiftMes(-1),
  mesNext: () => shiftMes(1),
  export: exportar,
  import: () => $('#file').click()
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.a];
  if (fn) fn(b.dataset.id);
});

function onField(e) {
  const t = e.target, f = t.dataset && t.dataset.f;
  if (!f) return;
  draft[f] = t.type === 'checkbox' ? t.checked : t.value;
  if (f === 'date') { if (draft.date) render(); return; }
  renderPreview();
}
document.addEventListener('focusin', e => { if (e.target.matches('.field input:not([type=date])')) setTimeout(() => { try { e.target.select(); } catch (_) {} }, 0); });
document.addEventListener('input', onField);
document.addEventListener('change', e => {
  onField(e);
  if (e.target.id === 'file') {
    const fl = e.target.files[0]; if (!fl) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        if (!s || !Array.isArray(s.entries) || !Array.isArray(s.metas) || !Array.isArray(s.caixinhas)) throw 0;
        if (!confirm('Importar vai substituir os dados atuais. Continuar?')) return;
        S = migrate(s);
        save(); draft = newDraft(); render(); toast('Dados importados ✓');
      } catch (err) { toast('Arquivo inválido'); }
    };
    rd.readAsText(fl);
  }
});

render();
