'use strict';
/* ============ Metas Financeiras — PWA ============
   Valores sempre em centavos (inteiros). Dados salvos no localStorage. */

const KEY = 'metas-financeiras-v1';
const COLORS = ['#E0246F', '#C98A12', '#2E8B57', '#2A62B0', '#8E44AD', '#C0392B', '#16A0A0', '#7F6A5B'];
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
const pstyle = k => `--pc:${prio(k).c}`;
/* tema claro/escuro */
const THEME_KEY = 'metas-theme';
const curTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'dark' ? '#000000' : '#E0246F');
}
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
  s.recorrentes = s.recorrentes || [];
  s.extrato = s.extrato || { itens: [], arquivos: [] };
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
  const futuro = D < m.inicio;                       // meta ainda não começou
  const dwork = isWork(D);
  const wd = workDays(futuro ? m.inicio : D, m.prazo);
  const overdue = !futuro && rem > 0 && (m.prazo < D || wd === 0);
  const need = futuro ? 0 : overdue ? Math.max(0, m.valor - before)
    : (dwork ? Math.max(0, Math.ceil((m.valor - before) / wd)) : 0);
  const hoje = Math.min(rem, Math.max(0, need - given));
  const wdNext = wd - (dwork && !futuro ? 1 : 0);
  const perDay = rem === 0 ? 0 : futuro ? Math.ceil(rem / Math.max(1, wd))
    : overdue ? rem : (hoje > 0 ? need : (wdNext > 0 ? Math.ceil(rem / wdNext) : rem));
  const totalW = Math.max(1, workDays(m.inicio, m.prazo));
  const elapsedW = D > m.inicio ? workDays(m.inicio, addDays(D, -1)) : 0;
  const expected = Math.round(m.valor * Math.min(totalW, elapsedW) / totalW);
  let status = 'ok';
  if (rem === 0) status = 'done';
  else if (futuro) status = 'future';
  else if (overdue) status = 'late';
  else if (before < expected - 1) status = 'behind';
  else if (saved > expected + Math.ceil(m.valor / totalW)) status = 'ahead';
  return { saved, rem, dl: wd, overdue, futuro, need, hoje, perDay, status, dwork, pct: Math.min(100, Math.round(saved / m.valor * 100)) };
}

/* ---------- metas recorrentes ----------
   Modelo (S.recorrentes): { id, nome, valor, diaInicio, diaPrazo, antes, desde, skip[], rank }
   - antes = true quando o início cai no mês anterior ao do prazo (ex.: guardar do dia 20 até o dia 5).
   - Cada mês vira uma meta normal (instância) com serie = id do modelo e mref = 'AAAA-MM' do prazo.
   - A instância do mês é criada automaticamente quando chega a data de início. */
function clampDia(y, m, d) { const last = new Date(y, m, 0).getDate(); return `${y}-${pad(m)}-${pad(Math.min(d, last))}`; }
function datesFor(t, mref) {
  const [y, m] = mref.split('-').map(Number);
  const prazo = clampDia(y, m, t.diaPrazo);
  const pm = new Date(y, m - 2, 1);
  const inicio = t.antes ? clampDia(pm.getFullYear(), pm.getMonth() + 1, t.diaInicio) : clampDia(y, m, t.diaInicio);
  return { inicio, prazo };
}
/* Tipos de série: 'mes' (padrão) = todo mês; 'dias' = a cada N dias a partir de uma âncora.
   mref identifica cada ciclo: 'AAAA-MM' (mês do prazo) ou a data de início do ciclo (tipo 'dias'). */
function datasSerie(t, mref) { return t.tipo === 'dias' ? { inicio: mref, prazo: addDays(mref, t.dur) } : datesFor(t, mref); }
function periodosParaGerar(t, T) {
  if (t.tipo === 'dias') { if (T < t.ancora) return []; return [addDays(t.ancora, Math.floor(diff(t.ancora, T) / t.cada) * t.cada)]; }
  const cur = mesDe(T); return [cur, mesSeg(cur)];
}
function mrefAtual(t) {
  const T = today();
  if (t.tipo === 'dias') return T < t.ancora ? t.ancora : addDays(t.ancora, Math.floor(diff(t.ancora, T) / t.cada) * t.cada);
  return mesDe(T);
}
const rotuloCurto = id => { const t = S.recorrentes.find(x => x.id === id); return t && t.tipo === 'dias' ? `A cada ${t.cada} dias` : 'Mensal'; };
const descSerie = t => t.tipo === 'dias'
  ? `a cada ${t.cada} dias · ${t.dur + 1} dia${t.dur ? 's' : ''} para guardar`
  : `todo mês · início dia ${t.diaInicio}${t.antes ? ' (mês anterior)' : ''} → prazo dia ${t.diaPrazo}`;
const mesDe = d => d.slice(0, 7);
const mesSeg = mref => { const [y, m] = mref.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const isDone = x => sumM(x.id) >= x.valor;

function ensureRecorrentes() {
  const T = today(), cur = mesDe(T);
  let changed = false;
  S.recorrentes.forEach(t => {
    periodosParaGerar(t, T).forEach(mref => {
      if (mref < t.desde || (t.skip || []).includes(mref)) return;
      if (S.metas.some(x => x.serie === t.id && x.mref === mref)) return;
      const dt = datasSerie(t, mref);
      if (dt.inicio > T) return;                                  // ainda não chegou o início
      const nova = { id: uid(), nome: t.nome, valor: t.valor, inicio: dt.inicio, prazo: dt.prazo, serie: t.id, mref };
      const nAtivas = S.metas.filter(x => !isDone(x)).length;
      const pos = t.rank != null ? Math.min(t.rank, nAtivas) : nAtivas;   // mantém a prioridade do mês anterior
      S.metas.splice(pos, 0, nova);
      changed = true;
    });
  });
  return changed;
}
/* concluídas vão para o fim da lista; guarda a posição (prioridade) de cada série */
function normalizeMetas() {
  const a = S.metas.filter(x => !isDone(x)), b = S.metas.filter(isDone);
  const novo = a.concat(b);
  let changed = novo.some((x, i) => x !== S.metas[i]);
  if (changed) S.metas = novo;
  const vistas = new Set();
  a.forEach((x, i) => {                       // vale a posição da parcela aberta mais antiga da série
    const t = x.serie && !vistas.has(x.serie) && S.recorrentes.find(r => r.id === x.serie);
    if (!t) return;
    vistas.add(x.serie);
    if (t.rank !== i) { t.rank = i; changed = true; }
  });
  return changed;
}
function applyTemplateToOpen(t, exceptId) {
  S.metas.forEach(x => {
    if (x.serie !== t.id || x.id === exceptId || isDone(x) || x.mref < mrefAtual(t)) return;
    const dt = datasSerie(t, x.mref);
    x.nome = t.nome; x.valor = t.valor; x.inicio = dt.inicio; x.prazo = dt.prazo;
  });
}
function endSeries(tid) {
  S.recorrentes = S.recorrentes.filter(r => r.id !== tid);
  S.metas.forEach(x => { if (x.serie === tid) { delete x.serie; delete x.mref; } });
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
      const room = infos[k].futuro ? 0 : infos[k].rem - m[mt.id];
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
  o.innerHTML = `<form class="sheet"><div class="grab"></div><h3>${title}</h3>${body}<div class="btns">${opts.extra || ''}<button type="button" class="ghost" data-close>${opts.nosave ? 'Fechar' : 'Cancelar'}</button>${opts.nosave ? '' : `<button class="pri">${opts.ok || 'Salvar'}</button>`}</div></form>`;
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
  moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
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
  <header class="top row"><div><h1>Metas Financeiras</h1><div class="sub">${fmtLong(today())}</div><div class="totmini">Total ${fmt(b.livre + b.metas + b.cx)}</div></div>
    <button class="themebtn" data-a="tema" aria-label="Alternar modo escuro">${curTheme() === 'dark' ? ICON.sun : ICON.moon}</button></header>
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

function recomendadoHtml(D) {
  const ls = S.metas.map(m => metaInfo(m, D)).filter(i => i.status !== 'done' && !i.futuro);
  const tot = isWork(D) ? ls.reduce((a, i) => a + (i.hoje || 0), 0) : 0;
  if (!ls.length) return '';
  return `<div class="reco"><span>Valor recomendado para o dia<small>${isWork(D) ? 'soma das metas do dia' : 'dia de folga'}</small></span><b>${fmt(tot)}</b></div>`;
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
    ${recomendadoHtml(draft.date)}
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
  const D = today();
  const lista = S.metas.map((m, k) => ({ m, k, i: metaInfo(m, D) })).filter(x => x.i.status !== 'done');
  if (!lista.length) return '';
  return `<details class="acc" open><summary>Metas de hoje</summary>
  ${isWork(D) ? '' : '<div class="mut note">Hoje é folga — as metas não recebem cota.</div>'}
  <div class="plist">${lista.map(({ m, k, i }) => `<div class="prow" style="${pstyle(k)}"><i class="pd">P${k + 1}</i><span class="pn">${m.serie ? '↻ ' : ''}${esc(m.nome)}<small>${i.futuro ? 'inicia em ' + fmtDate(m.inicio).slice(0, 5) + ' · até ' + fmtDate(m.prazo).slice(0, 5) : 'até ' + fmtDate(m.prazo).slice(0, 5)}</small></span><b>${i.futuro ? '—' : fmt(i.hoje)}</b></div>`).join('')}</div>
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
    <div class="actions" style="margin:2px 0 4px">${b.livre > 0 && S.caixinhas.some(c => !c.fixa && c.pct > 0) ? '<button class="ghost sm" data-a="distLivre">Preencher com o saldo livre</button>' : ''}${S.caixinhas.length > 1 ? '<button class="ghost sm" data-a="transfCx">⇄ Transferir entre caixinhas</button>' : ''}</div>
    ${sug.length ? `<details class="acc" open><summary>Sugestões</summary><div class="chips">${sug.map(x => `<button class="chip" data-a="sugestao" data-id="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div></details>` : ''}
  </section>`;
}

function metaCard({ m, i, k }) {
  const D = today();
  const badge = {
    done: '<span class="badge ok">Concluída</span>', late: '<span class="badge late">Vencida</span>', behind: '<span class="badge late">Atrasada</span>',
    ahead: '<span class="badge ahead">Adiantada</span>', future: `<span class="badge fut">Inicia ${fmtDate(m.inicio).slice(0, 5)}</span>`, ok: ''
  }[i.status];
  const dias = i.futuro ? 'ainda não começou' : m.prazo < D ? 'vencida' : i.dl === 0 ? 'sem dias de trabalho' : i.dl + (i.dl > 1 ? ' dias' : ' dia');
  const done = i.status === 'done';
  return `<div class="mcard" style="${pstyle(k)}">
      <div class="mh"><span class="pb">${done ? '✓' : 'P' + (k + 1)}</span><b class="mn">${esc(m.nome)}</b>${m.serie ? `<span class="badge rec">↻ ${esc(rotuloCurto(m.serie))}</span>` : ''}${badge}<span class="mdate">${fmtDate(m.inicio).slice(0, 5)} → ${fmtDate(m.prazo).slice(0, 5)} · ${dias}</span></div>
      <div class="bar"><i style="width:${i.pct}%"></i></div>
      <div class="mrow"><span>${fmt(i.saved)} de ${fmt(m.valor)}</span><b>${i.pct}%</b></div>
      ${done ? '' : `<div class="mgrid"><div><small>Hoje</small><b>${fmt(i.hoje)}</b></div><div><small>Por dia</small><b>${fmt(i.perDay)}</b></div><div><small>Falta</small><b>${fmt(i.rem)}</b></div></div>`}
      <div class="macts">
        ${done ? '' : `<button class="ib" data-a="up" data-id="${m.id}" ${k === 0 ? 'disabled' : ''} aria-label="Subir prioridade">↑</button>
        <button class="ib" data-a="down" data-id="${m.id}" ${S.metas[k + 1] && !isDone(S.metas[k + 1]) ? '' : 'disabled'} aria-label="Descer prioridade">↓</button>`}
        <span class="sp"></span>
        <button class="ghost sm" data-a="editMeta" data-id="${m.id}">Editar</button>
        ${done ? '' : `<button class="ghost sm" data-a="depMeta" data-id="${m.id}">Adiantar</button>`}
      </div></div>`;
}

function vMetas() {
  const D = today();
  const infos = S.metas.map((m, k) => ({ m, k, i: metaInfo(m, D) }));
  const ativas = infos.filter(x => x.i.status !== 'done'), feitas = infos.filter(x => x.i.status === 'done');
  const totHoje = ativas.reduce((a, x) => a + x.i.hoje, 0);
  return `<header class="top row"><div><h1>Metas</h1><div class="sub">Por ordem de prioridade</div></div><button class="pri sm" data-a="novaMeta">+ Nova meta</button></header>
  <div class="stats two"><div class="t2"><span>Guardar hoje</span><b>${fmt(totHoje)}</b></div><div class="t1"><span>Saldo livre</span><b>${fmt(balances().livre)}</b></div></div>
  ${ativas.map(metaCard).join('') || '<div class="empty" style="margin-top:12px">' + (feitas.length ? 'Todas as metas estão concluídas 🎉' : 'Crie sua primeira meta: informe o valor total, o início e até quando precisa guardar. O app calcula quanto guardar por dia.') + '<br><button class="pri sm" style="margin-top:10px" data-a="novaMeta">+ Criar meta</button></div>'}
  ${S.recorrentes.length ? `<details class="acc" open><summary>Metas recorrentes (${S.recorrentes.length})</summary>
    ${S.recorrentes.map(t => `<div class="mini"><div>↻ ${esc(t.nome)}<small>${fmt(t.valor)} · ${descSerie(t)}</small></div>
      <div class="actions"><button class="ghost sm" data-a="editTmpl" data-id="${t.id}">Editar</button><button class="ghost sm danger" data-a="endTmpl" data-id="${t.id}">Encerrar</button></div></div>`).join('')}
    <div class="mut note">A cada ciclo (mês ou intervalo de dias) a meta é criada sozinha quando chega a data de início, mantendo a mesma prioridade.</div></details>` : ''}
  ${feitas.length ? `<details class="acc"><summary>Concluídas (${feitas.length})</summary>${feitas.map(metaCard).join('')}</details>` : ''}`;
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
        if (rem[m.id] <= 0 || dt < m.inicio) return;
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
  const colorBar = [['#4E2E20', 'Custo da mercadoria', tot.c], ['#C93A2B', 'Despesas', tot.d], ['#E0246F', 'Metas', mProj], ['#C98A12', 'Caixinhas', xProj], ['#2E8B57', 'Saldo livre', P.livreMes]];
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

/* ---------- extrato bancário ----------
   Itens: { id, date:'AAAA-MM-DD', v:centavos (+ entrada / − saída), cat, d:descrição curta, arq }
   Movimentações entre as suas próprias reservas (aplicação/resgate RDB) não contam como entrada nem saída,
   a menos que você ative essa opção. Estornos abatem as saídas. */
const CAT = {
  pix_in: { n: 'Pix recebidos', k: 'ent' }, transf_in: { n: 'Transferências recebidas', k: 'ent' },
  reembolso: { n: 'Reembolsos recebidos', k: 'ent' }, outras_in: { n: 'Outras entradas', k: 'ent' },
  estorno: { n: 'Estornos', k: 'est' },
  debito: { n: 'Compras no débito', k: 'sai' }, nupay: { n: 'Compras via NuPay', k: 'sai' }, pix_out: { n: 'Pix enviados', k: 'sai' },
  transf_out: { n: 'Transferências enviadas', k: 'sai' }, tarifa: { n: 'Débitos em conta e tarifas', k: 'sai' }, outras_out: { n: 'Outras saídas', k: 'sai' },
  rdb_apl: { n: 'Aplicações (RDB)', k: 'int' }, rdb_res: { n: 'Resgates (RDB)', k: 'int' }
};
const CAT_COR = { ent: '#2E8B57', sai: '#E0246F', est: '#C98A12', int: '#8E44AD' };
const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const kfmt = c => { const a = Math.abs(c) / 100; const t = a >= 1000 ? (a / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(a)); return (c < 0 ? '-' : '+') + t; };

function classifica(desc, v) {
  const t = semAcento(desc);
  if (/aplicacao/.test(t) && /(rdb|cdb|investiment|reserva)/.test(t)) return 'rdb_apl';
  if (/resgate/.test(t)) return 'rdb_res';
  if (/estorno/.test(t)) return 'estorno';
  if (/reembolso/.test(t)) return 'reembolso';
  if (/nupay/.test(t)) return 'nupay';
  if (/pix/.test(t)) return v > 0 ? 'pix_in' : 'pix_out';
  if (/compra/.test(t)) return 'debito';
  if (/(debito em conta|tarifa|iof|juros|anuidade)/.test(t)) return 'tarifa';
  if (/transferencia recebida|deposito|ted recebid|doc recebid/.test(t)) return 'transf_in';
  if (/transferencia enviada|ted enviad|doc enviad/.test(t)) return 'transf_out';
  return v > 0 ? 'outras_in' : 'outras_out';
}

function agrega(itens) {
  const r = { n: itens.length, ent: 0, sai: 0, est: 0, apl: 0, res: 0, cat: {}, qtd: {} };
  itens.forEach(i => {
    const c = CAT[i.cat] || CAT[i.v > 0 ? 'outras_in' : 'outras_out'];
    r.cat[i.cat] = (r.cat[i.cat] || 0) + i.v; r.qtd[i.cat] = (r.qtd[i.cat] || 0) + 1;
    if (c.k === 'ent') r.ent += i.v; else if (c.k === 'sai') r.sai += -i.v; else if (c.k === 'est') r.est += i.v;
    else if (i.cat === 'rdb_apl') r.apl += -i.v; else r.res += i.v;
  });
  const rdb = !!S.cfg.rdb;
  r.entT = r.ent + (rdb ? r.res : 0);
  r.saiT = r.sai - r.est + (rdb ? r.apl : 0);
  r.res_ = r.entT - r.saiT;
  return r;
}
function extratoDias() {
  const m = {};
  S.extrato.itens.forEach(i => { (m[i.date] || (m[i.date] = [])).push(i); });
  const out = {}; Object.keys(m).forEach(d => out[d] = agrega(m[d]));
  return out;
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  const fim = () => { row.push(cur); cur = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; fim(); }
    else cur += ch;
  }
  if (cur !== '' || row.length) fim();
  return rows;
}
function parseDataExtrato(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/), y, mo, d;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
function parseValorExtrato(v) {
  v = String(v || '').trim().replace(/[R$\s ]/g, '');
  if (!v) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
  if (v.endsWith('-')) { neg = true; v = v.slice(0, -1); }
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return isFinite(n) ? Math.round((neg ? -Math.abs(n) : n) * 100) : NaN;
}
function parseExtrato(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { itens: [], erro: 'O arquivo está vazio' };
  const h = rows[0].map(semAcento);
  const find = re => h.findIndex(x => re.test(x));
  const iD = find(/^(data|date)/), iV = find(/^(valor|amount|quantia)/), iI = find(/(identificador|^id$|codigo|transaction)/), iT = find(/(descri|historico|lancamento|memo|detalhe|nome)/);
  if (iD < 0 || iV < 0 || iT < 0) return { itens: [], erro: 'Não reconheci as colunas (preciso de Data, Valor e Descrição)' };
  const itens = [], vistos = {}; let ignoradas = 0;
  rows.slice(1).forEach(r => {
    const date = parseDataExtrato(r[iD]), v = parseValorExtrato(r[iV]);
    if (!date || isNaN(v) || v === 0) { ignoradas++; return; }
    const bruta = String(r[iT] || '').trim();
    const partes = bruta.split(' - ');
    const d = partes.slice(0, 2).join(' · ').slice(0, 90);          // guarda só o tipo e o nome; documentos e contas ficam de fora
    let id = iI >= 0 ? String(r[iI] || '').trim() : '';
    if (!id) { const k = `${date}|${v}|${bruta}`; vistos[k] = (vistos[k] || 0) + 1; id = `h:${k}|${vistos[k]}`; }
    itens.push({ id, date, v, cat: classifica(bruta, v), d });
  });
  itens.sort((a, b) => a.date.localeCompare(b.date));
  return { itens, ignoradas };
}

async function importaExtrato(file) {
  try {
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    const r = parseExtrato(txt);
    if (!r.itens.length) return toast(r.erro || 'Nenhum lançamento encontrado no arquivo');
    const tem = new Set(S.extrato.itens.map(i => i.id));
    const novos = r.itens.filter(i => !tem.has(i.id)), dup = r.itens.length - novos.length;
    if (!novos.length) return toast('Todos os lançamentos deste arquivo já foram importados');
    const a = agrega(novos), de = novos[0].date, ate = novos[novos.length - 1].date;
    modal('Extrato encontrado', `
      <div class="mut" style="margin-bottom:8px">${esc(file.name)}<br>${fmtDate(de)} a ${fmtDate(ate)} · ${novos.length} lançamento${novos.length > 1 ? 's' : ''} novo${novos.length > 1 ? 's' : ''}${dup ? ` · ${dup} já importado${dup > 1 ? 's' : ''}` : ''}${r.ignoradas ? ` · ${r.ignoradas} linha(s) ignorada(s)` : ''}</div>
      <div class="grid g3"><div class="k"><span>Entradas</span><b class="pos">${fmt(a.entT)}</b></div><div class="k"><span>Saídas</span><b class="neg">${fmt(a.saiT)}</b></div><div class="k"><span>Resultado</span><b class="${a.res_ < 0 ? 'neg' : 'pos'}">${fmt(a.res_)}</b></div></div>
      ${a.apl || a.res ? `<div class="mut note">Aplicações ${fmt(a.apl)} e resgates ${fmt(a.res)} (RDB) são movimentações entre suas reservas e ${S.cfg.rdb ? 'estão' : 'não estão'} nos totais.</div>` : ''}
      <div class="mut note">Os dados ficam só neste aparelho. Documentos e números de conta não são guardados.</div>`,
      () => {
        const aid = uid();
        novos.forEach(i => { i.arq = aid; S.extrato.itens.push(i); });
        S.extrato.arquivos.push({ id: aid, nome: file.name, em: today(), n: novos.length, de, ate });
        mes = mesDe(ate); tab = 'mensal';
        save(); render(); toast(`${novos.length} lançamentos importados ✓`);
      }, { ok: 'Importar' });
  } catch (e) { toast('Não consegui ler o arquivo'); }
}

function vExtrato() {
  const ex = S.extrato;
  const topo = `<div class="row"><h3>Extrato bancário</h3><button class="pri sm" data-a="impExtrato">Importar CSV</button></div>
    <input type="file" id="fileExtrato" accept=".csv,text/csv,text/plain" hidden>`;
  if (!ex.itens.length) return `<section>${topo}<div class="empty" style="margin-top:10px">Importe o extrato da sua conta (CSV com Data, Valor e Descrição, como o do Nubank). O app soma as entradas e saídas de cada dia no calendário e usa a média na projeção do mês.</div></section>`;
  const doMes = ex.itens.filter(i => i.date.startsWith(mes)), a = agrega(doMes);
  const cats = Object.keys(a.cat).filter(k => a.cat[k]).sort((x, y) => Math.abs(a.cat[y]) - Math.abs(a.cat[x]));
  const mx = Math.max(1, ...cats.map(k => Math.abs(a.cat[k])));
  return `<section>${topo}
    ${doMes.length ? `<div class="grid g3" style="margin-top:10px"><div class="k"><span>Entradas</span><b class="pos">${fmt(a.entT)}</b></div><div class="k"><span>Saídas</span><b class="neg">${fmt(a.saiT)}</b></div><div class="k"><span>Resultado</span><b class="${a.res_ < 0 ? 'neg' : 'pos'}">${fmt(a.res_)}</b></div></div>
    <details class="acc" open><summary>Por tipo de movimentação</summary>
      ${cats.map(k => { const c = CAT[k]; return `<div class="catrow"><div class="cl"><span>${c.n} <small>${a.qtd[k]}×</small></span><b class="${a.cat[k] < 0 ? 'neg' : 'pos'}">${fmt(a.cat[k])}</b></div><div class="cbar"><i style="width:${Math.abs(a.cat[k]) / mx * 100}%;background:${CAT_COR[c.k]}"></i></div></div>`; }).join('')}
      <div class="mut note">Estornos abatem as saídas${S.cfg.rdb ? '' : '. Aplicações e resgates (RDB) ficam fora dos totais'}.</div>
    </details>` : `<div class="empty" style="margin-top:10px">Nenhum lançamento do extrato neste mês.</div>`}
    <label class="chk"><input type="checkbox" data-a="rdbToggle" ${S.cfg.rdb ? 'checked' : ''}> Contar aplicações e resgates (RDB) como saídas e entradas</label>
    <details class="acc"><summary>Arquivos importados (${ex.arquivos.length})</summary>
      ${ex.arquivos.map(f => `<div class="mini"><div>${esc(f.nome)}<small>${fmtDate(f.de)} a ${fmtDate(f.ate)} · ${f.n} lançamentos</small></div><button class="ghost sm danger" data-a="rmExtrato" data-id="${f.id}">Remover</button></div>`).join('')}
    </details></section>`;
}

/* fluxo bancário projetado: entradas por dia de trabalho × dias de trabalho restantes;
   saídas por dia corrido × dias restantes. Base = últimos 30 dias do extrato. */
function projFluxo(mesStr) {
  const itens = S.extrato.itens; if (!itens.length) return null;
  const [y, mo] = mesStr.split('-').map(Number), first = `${mesStr}-01`, last = ds(new Date(y, mo, 0));
  let ultima = '0000-00-00', primeira = '9999-99-99';
  itens.forEach(i => { if (i.date > ultima) ultima = i.date; if (i.date < primeira) primeira = i.date; });
  const real = agrega(itens.filter(i => i.date >= first && i.date <= last));
  const ini = addDays(ultima, -29), wIni = ini > primeira ? ini : primeira;
  const base = agrega(itens.filter(i => i.date >= wIni && i.date <= ultima));
  const dd = diaDates(); let wdB = 0, calB = 0;
  for (let d = wIni; d <= ultima; d = addDays(d, 1)) { calB++; if (isWork(d, dd)) wdB++; }
  const mEnt = wdB ? base.entT / wdB : 0, mSai = calB ? base.saiT / calB : 0;
  const ps = ultima >= first ? addDays(ultima, 1) : first;
  let wdR = 0, calR = 0;
  for (let d = ps; d <= last; d = addDays(d, 1)) { calR++; if (isWork(d, dd)) wdR++; }
  const entP = real.entT + Math.round(mEnt * wdR), saiP = real.saiT + Math.round(mSai * calR);
  return { real, base, wIni, ultima, mEnt: Math.round(mEnt), mSai: Math.round(mSai), wdR, calR, entP, saiP, proj: calR > 0, ps };
}
function vFluxoProj() {
  const P = projFluxo(mes); if (!P) return '';
  if (!P.real.n && !P.proj) return '';
  const c = P.proj, r = P.real;
  const row = (l, a, b, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${fmtN(a)}</td>${c ? `<td>${fmtN(b)}</td>` : ''}</tr>`;
  const resP = P.entP - P.saiP;
  return `<section class="proj"><h3>${c ? 'Projeção do fluxo bancário' : 'Fluxo bancário do mês'}</h3>
    <div class="grid g3" style="margin-top:8px">
      <div class="k"><span>Entradas${c ? ' (proj.)' : ''}</span><b class="pos">${fmt(c ? P.entP : r.entT)}</b></div>
      <div class="k"><span>Saídas${c ? ' (proj.)' : ''}</span><b class="neg">${fmt(c ? P.saiP : r.saiT)}</b></div>
      <div class="k"><span>Resultado${c ? ' (proj.)' : ''}</span><b class="${(c ? resP : r.res_) < 0 ? 'neg' : 'pos'}">${fmt(c ? resP : r.res_)}</b></div>
    </div>
    <details class="acc" open><summary>Detalhamento (R$)</summary>
      <table class="ptab"><thead><tr><th></th><th>Extrato</th>${c ? '<th>Projeção</th>' : ''}</tr></thead><tbody>
        ${row('Entradas', r.entT, P.entP, 'top')}
        ${row('(−) Saídas', r.saiT, P.saiP)}
        ${row('(=) Resultado', r.res_, resP, 'tot fin')}
      </tbody></table>
      ${c ? `<div class="mut note">Base: ${fmtDate(P.wIni)} a ${fmtDate(P.ultima)} do extrato — ${fmt(P.mEnt)} de entradas por dia de trabalho e ${fmt(P.mSai)} de saídas por dia. Estimado para ${P.wdR} dia${P.wdR === 1 ? '' : 's'} de trabalho e ${P.calR} dia${P.calR === 1 ? '' : 's'} sem extrato (de ${fmtDate(P.ps)} até o fim do mês).</div>` : ''}
    </details></section>`;
}

function exTilesHtml() {
  if (!S.extrato.itens.length) return '';
  const a = agrega(S.extrato.itens.filter(i => i.date.startsWith(mes)));
  if (!a.n) return '';
  return `<div class="k"><span>Entradas (extrato)</span><b class="pos">${fmt(a.entT)}</b></div><div class="k"><span>Saídas (extrato)</span><b class="neg">${fmt(a.saiT)}</b></div>`;
}
function extratoDiaHtml(date) {
  const itens = S.extrato.itens.filter(i => i.date === date);
  if (!itens.length) return '';
  const a = agrega(itens);
  return `<div class="sep"></div><h3 style="font-size:15px">Extrato bancário</h3>
    <div class="grid g3" style="margin:8px 0"><div class="k"><span>Entradas</span><b class="pos">${fmt(a.entT)}</b></div><div class="k"><span>Saídas</span><b class="neg">${fmt(a.saiT)}</b></div><div class="k"><span>Resultado</span><b class="${a.res_ < 0 ? 'neg' : 'pos'}">${fmt(a.res_)}</b></div></div>
    ${itens.slice(0, 80).map(i => `<div class="mini"><div>${esc(i.d)}<small>${(CAT[i.cat] || {}).n || ''}</small></div><b class="${i.v < 0 ? 'neg' : 'pos'}">${fmt(i.v)}</b></div>`).join('')}
    ${itens.length > 80 ? `<div class="mut note">+ ${itens.length - 80} lançamentos</div>` : ''}`;
}

function vSaldo() {
  const b = balances();
  return `<div class="card saldo"><div class="row"><div><small>Saldo livre atual</small><div class="bigv ${b.livre < 0 ? 'neg' : ''}">${fmt(b.livre)}</div></div>
    <button class="pri sm" data-a="saldo">+ Registrar saldo</button></div>
    <div class="mut note" style="margin:8px 0 0">Informe quanto você já tem na conta para começar com o saldo disponível correto. Metas e caixinhas guardadas somam ${fmt(b.metas + b.cx)}.</div></div>`;
}

function saldoModal() {
  const livre = balances().livre;
  modal('Saldo já disponível', `
    <p class="mut" style="margin:0 0 4px">Saldo livre atual: <b>${fmt(livre)}</b></p>
    <label>Quanto você tem na conta (R$)<input name="v" required inputmode="decimal" placeholder="0,00" autofocus></label>
    <label class="chk"><input type="checkbox" name="ajustar"> Ajustar o saldo livre para exatamente este valor (em vez de somar)</label>
    <div class="mut note">Por padrão o valor é somado ao saldo livre. Valores já separados em metas ou caixinhas não entram aqui.</div>`,
    f => {
      const v = parseMoney(f.v);
      const delta = f.ajustar ? v - livre : v;
      if (!f.ajustar && v <= 0) { toast('Informe um valor maior que zero'); return false; }
      if (f.ajustar && delta === 0) { toast('O saldo livre já é esse valor'); return false; }
      S.entries.push({ id: uid(), type: 'saldo', date: today(), desc: f.ajustar ? `Saldo livre ajustado para ${fmt(v)} (${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))})` : `Saldo disponível registrado: ${fmt(v)}`, aloc: { m: {}, c: {}, l: delta } });
      save(); render(); toast('Saldo registrado ✓');
    });
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
  ${vSaldo()}
  ${vExtrato()}
  ${vProj()}
  ${vFluxoProj()}
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
  const T = today(), dd = diaDates(), exDias = extratoDias();
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
    h += `<button class="${date === T ? 'today' : ''} ${dias.length ? 'has' : ''} ${w ? 'wk ' + st : 'off'} ${tag === 'extra' ? 'extra' : ''}" data-a="day" data-id="${date}">${d}${tag ? `<em>${tag}</em>` : ''}${dias.length ? `<small class="${luc < 0 ? 'neg' : ''}">${short(luc)}</small>` : ''}${exDias[date] ? `<small class="ex ${exDias[date].res_ < 0 ? 'neg' : ''}">${kfmt(exDias[date].res_)}</small>` : ''}${due ? '<i></i>' : ''}</button>`;
  }
  return `${monthNav('Calendário')}
  <div class="grid" style="margin-bottom:14px"><div class="k"><span>Dias de trabalho no mês</span><b>${nw}</b></div><div class="k"><span>Cota diária das metas</span><b>${fmt(quotaTotal())}</b></div>${exTilesHtml()}</div>
  <div class="mut" style="font-size:14px">Dias de trabalho padrão</div>
  <div class="chips week" style="margin:8px 0 14px">${NOMES_DIA.map((nm, k) => `<button class="chip wd ${S.cfg.semana.includes(k) ? 'on' : ''}" data-a="semana" data-id="${k}">${nm}</button>`).join('')}</div>
  <div class="actions" style="margin:0 0 12px"><button class="${calEdit ? 'pri sm' : 'ghost'}" data-a="calEdit">${calEdit ? '✓ Editando dias' : 'Escolher dias'}</button><button class="ghost" data-a="resetMes">Restaurar padrão do mês</button></div>
  ${calEdit ? '<div class="gold" style="margin-bottom:10px;font-size:14px">Toque nos dias para alternar entre trabalho e folga. As metas são recalculadas a cada toque.</div>' : ''}
  <div class="cal">${h}</div>
  <p class="mut" style="margin-top:14px;font-size:13px">Cinza = dia de trabalho · verde = meta do dia batida · vermelho = meta do dia não atingida · listrado = folga · “extra” = dia fora do padrão · número = lucro líquido · itálico = saldo do extrato (entradas − saídas) · ● = prazo de meta. ${calEdit ? '' : 'Toque num dia para ver detalhes, marcar folga/extra ou lançar.'}</p>`;
}

function render() {
  if (ensureRecorrentes() | normalizeMetas()) save();
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
    ${S.metas.map((m, k) => { const i = r.infos[k]; const g = r.m[m.id] || 0; if (i.status === 'done' && !g) return '';
      return `<div class="r" style="${pstyle(k)}"><span><i class="dot" style="background:var(--pc)"></i>${esc(m.nome)}${g < i.hoje ? `<small>faltou ${fmt(i.hoje - g)} da cota de hoje</small>` : ''}</span><span>${i.status === 'done' ? '✓' : i.futuro ? 'inicia ' + fmtDate(m.inicio).slice(0, 5) : fmt(g)}</span></div>`; }).join('')}
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
  let m = S.metas.find(x => x.id === id);
  const t = m && m.serie ? S.recorrentes.find(x => x.id === m.serie) : null;
  const fSel = !t ? 'nao' : t.tipo === 'dias' ? (t.cada === 7 ? '7' : t.cada === 14 ? '14' : 'custom') : 'mes';
  const fCada = t && t.tipo === 'dias' ? t.cada : 14;
  const mo = modal(id ? 'Editar meta' : 'Nova meta', `
    <label>Nome<input name="nome" required value="${esc(m ? m.nome : '')}" placeholder="Ex.: Aluguel"></label>
    <label>Valor total (R$)<input name="valor" required inputmode="decimal" value="${m ? inp(m.valor) : ''}" placeholder="0,00"></label>
    ${m ? '' : `<label>Quanto já tem guardado (R$)<input name="guardado" inputmode="decimal" placeholder="0,00"></label>
    <div class="mut note">O que você já separou entra como saldo desta meta e reduz a cota diária. Em metas recorrentes, vale só para o primeiro período.</div>`}
    <div class="two-in"><div><label>Início<input type="date" name="inicio" required value="${m ? m.inicio : today()}"></label></div>
    <div><label>Prazo (guardar até)<input type="date" name="prazo" required value="${m ? m.prazo : ''}"></label></div></div>
    <label>↻ Repetir<select name="freq">
      <option value="nao" ${fSel === 'nao' ? 'selected' : ''}>Não repetir</option>
      <option value="mes" ${fSel === 'mes' ? 'selected' : ''}>Todo mês (mesmo valor e datas)</option>
      <option value="7" ${fSel === '7' ? 'selected' : ''}>A cada 7 dias</option>
      <option value="14" ${fSel === '14' ? 'selected' : ''}>A cada 14 dias</option>
      <option value="custom" ${fSel === 'custom' ? 'selected' : ''}>A cada … dias (personalizado)</option>
    </select></label>
    <div id="cadaBox"><label>Repetir a cada quantos dias?<input type="number" name="cada" min="2" max="365" inputmode="numeric" value="${fCada}"></label></div>
    <div class="mut note" id="freqNota"></div>`,
    f => {
      const valor = parseMoney(f.valor), nome = f.nome.trim();
      if (valor <= 0) { toast('Informe um valor maior que zero'); return false; }
      const novo = !m, guardado = novo ? parseMoney(f.guardado) : 0;
      if (guardado > valor) { toast('O valor já guardado não pode passar do valor da meta'); return false; }
      if (f.inicio > f.prazo) { toast('O início não pode ser depois do prazo'); return false; }
      const freq = f.freq || 'nao', rec = freq !== 'nao';
      let dados = null;
      if (rec && freq === 'mes') {
        const mi = mesDe(f.inicio), mp = mesDe(f.prazo), ant = mesSeg(mi) === mp;
        if (mi !== mp && !ant) { toast('Metas mensais: início no mesmo mês do prazo ou no mês anterior'); return false; }
        dados = { tipo: 'mes', nome, valor, diaInicio: Number(f.inicio.slice(8)), diaPrazo: Number(f.prazo.slice(8)), antes: ant };
      } else if (rec) {
        const cada = Math.round(freq === 'custom' ? Number(f.cada) : Number(freq));
        if (!(cada >= 2 && cada <= 365)) { toast('Informe um intervalo entre 2 e 365 dias'); return false; }
        const dur = diff(f.inicio, f.prazo);
        if (dur >= cada) { toast(`O prazo precisa ser menos de ${cada} dias depois do início`); return false; }
        dados = { tipo: 'dias', nome, valor, cada, dur, ancora: f.inicio };
      }
      if (m) { m.nome = nome; m.valor = valor; m.inicio = f.inicio; m.prazo = f.prazo; }
      else {
        m = { id: uid(), nome, valor, prazo: f.prazo, inicio: f.inicio }; S.metas.push(m);
        if (guardado > 0) {                         // saldo inicial da meta: datado antes do início para não contar como cota do dia
          const d0 = [today(), addDays(f.inicio, -1)].sort()[0];
          S.entries.push({ id: uid(), type: 'inicial', date: d0, desc: `Já guardado na meta "${nome}": ${fmt(guardado)}`, aloc: { m: { [m.id]: guardado }, c: {}, l: 0 } });
        }
      }
      if (rec) {
        const chave = dados.tipo === 'dias' ? f.inicio : mesDe(f.prazo);
        let tp = t;
        if (tp) {
          const mudouTipo = (tp.tipo || 'mes') !== dados.tipo;
          ['diaInicio', 'diaPrazo', 'antes', 'cada', 'dur', 'ancora'].forEach(k => delete tp[k]);
          Object.assign(tp, dados);
          if (mudouTipo) { tp.desde = chave; tp.skip = []; }
        } else { tp = { id: uid(), desde: chave, skip: [], ...dados }; S.recorrentes.push(tp); m.serie = tp.id; }
        m.mref = chave;
        applyTemplateToOpen(tp, m.id);
      } else if (t) endSeries(t.id);
      save(); render();
      if (rec && !t) toast('Meta recorrente criada ↻');
    }, { extra: m ? '<button type="button" class="ghost danger" data-del>Excluir</button>' : '' });
  // mostra/oculta o intervalo personalizado e explica a regra escolhida
  const sel = mo.o.querySelector('[name=freq]'), box = mo.o.querySelector('#cadaBox'), nota = mo.o.querySelector('#freqNota');
  const cadaIn = mo.o.querySelector('[name=cada]');
  const atualiza = () => {
    const v = sel.value; box.style.display = v === 'custom' ? '' : 'none';
    nota.textContent = v === 'nao' ? 'Antes do início a meta não recebe nada.'
      : v === 'mes' ? 'Todo mês a meta é criada de novo com o mesmo valor e as mesmas datas. O início deve estar no mesmo mês do prazo ou no mês anterior.'
      : `A meta se repete a cada ${v === 'custom' ? (cadaIn.value || '…') : v} dias, contados a partir do início. O prazo precisa vir antes do próximo ciclo, ou seja, a menos dias do início do que o intervalo (ex.: início hoje, prazo em 13 dias, repete a cada 14).`;
  };
  sel.addEventListener('change', atualiza); cadaIn.addEventListener('input', atualiza); atualiza();
  const del = mo.o.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm('Excluir esta meta? O valor guardado volta para o saldo livre.')) return;
    const saved = sumM(m.id);
    if (saved) S.entries.push({ id: uid(), type: 'ajuste', date: today(), desc: `Meta "${m.nome}" excluída — valor devolvido ao saldo livre`, aloc: { m: { [m.id]: -saved }, c: {}, l: saved } });
    if (t) {
      if (confirm('Esta meta é recorrente.\n\nOK = encerrar a recorrência (não criar nos próximos ciclos)\nCancelar = excluir só este ciclo e continuar nos próximos')) endSeries(t.id);
      else { t.skip = t.skip || []; t.skip.push(m.mref); }
    }
    S.metas = S.metas.filter(x => x.id !== m.id);
    save(); mo.close(); render();
  };
}

function tmplModal(id) {
  const t = S.recorrentes.find(x => x.id === id); if (!t) return;
  if (t.tipo === 'dias') {
    modal('Meta recorrente', `
      <label>Nome<input name="nome" required value="${esc(t.nome)}"></label>
      <label>Valor de cada ciclo (R$)<input name="valor" required inputmode="decimal" value="${inp(t.valor)}"></label>
      <div class="two-in"><div><label>Repetir a cada (dias)<input name="cada" type="number" min="2" max="365" required value="${t.cada}"></label></div>
      <div><label>Dias para guardar<input name="dias" type="number" min="1" max="365" required value="${t.dur + 1}"></label></div></div>
      <div class="mut note">“Dias para guardar” vai do início ao prazo e precisa caber no intervalo. As alterações valem para as metas abertas e para os próximos ciclos. Metas já concluídas não mudam.</div>`,
      f => {
        const valor = parseMoney(f.valor), cada = Math.round(Number(f.cada)), dias = Math.round(Number(f.dias));
        if (valor <= 0 || !(cada >= 2 && cada <= 365) || !(dias >= 1)) { toast('Confira valor, intervalo e dias para guardar'); return false; }
        if (dias > cada) { toast('Os dias para guardar não podem passar do intervalo'); return false; }
        Object.assign(t, { nome: f.nome.trim(), valor, cada, dur: dias - 1 });
        applyTemplateToOpen(t); save(); render(); toast('Meta recorrente atualizada');
      });
    return;
  }
  modal('Meta recorrente', `
    <label>Nome<input name="nome" required value="${esc(t.nome)}"></label>
    <label>Valor mensal (R$)<input name="valor" required inputmode="decimal" value="${inp(t.valor)}"></label>
    <div class="two-in"><div><label>Dia do início<input name="di" type="number" min="1" max="31" required value="${t.diaInicio}"></label></div>
    <div><label>Dia do prazo<input name="dp" type="number" min="1" max="31" required value="${t.diaPrazo}"></label></div></div>
    <label class="chk"><input type="checkbox" name="antes" ${t.antes ? 'checked' : ''}> O início é no mês anterior ao prazo</label>
    <div class="mut note">As alterações valem para as metas abertas e para os próximos meses. Metas já concluídas não mudam.</div>`,
    f => {
      const valor = parseMoney(f.valor), di = Math.round(Number(f.di)), dp = Math.round(Number(f.dp));
      if (valor <= 0 || !(di >= 1 && di <= 31) || !(dp >= 1 && dp <= 31)) { toast('Confira valor e dias (1 a 31)'); return false; }
      const antes = !!f.antes;
      if (!antes && di > dp) { toast('O dia de início não pode ser depois do prazo no mesmo mês'); return false; }
      Object.assign(t, { nome: f.nome.trim(), valor, diaInicio: di, diaPrazo: dp, antes });
      applyTemplateToOpen(t); save(); render(); toast('Meta recorrente atualizada');
    });
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

const idsCx = () => S.caixinhas.map(c => c.id);

/* saldo livre -> uma caixinha */
function addCxModal(id) {
  const c = S.caixinhas.find(x => x.id === id), livre = balances().livre;
  if (!c) return;
  if (livre <= 0) return toast('Você não tem saldo livre para usar');
  const mo = modal(`Adicionar a "${esc(c.nome)}"`, `
    <p class="mut" style="margin:0 0 4px">Saldo livre: <b>${fmt(livre)}</b> · nesta caixinha: ${fmt(sumC(id))}</p>
    <label>Valor (R$)<input name="v" required inputmode="decimal" placeholder="0,00"></label>
    <button type="button" class="link" data-tudo>Usar todo o saldo livre (${fmt(livre)})</button>`,
    f => {
      const v = parseMoney(f.v);
      if (v <= 0) { toast('Informe um valor maior que zero'); return false; }
      if (v > livre) { toast('Valor maior que o saldo livre'); return false; }
      S.entries.push({ id: uid(), type: 'depCx', date: today(), desc: `Saldo livre → "${c.nome}": ${fmt(v)}`, aloc: { m: {}, c: { [id]: v }, l: -v } });
      save(); render(); toast('Valor adicionado à caixinha ✓');
    }, { ok: 'Adicionar' });
  mo.o.querySelector('[data-tudo]').onclick = () => { mo.o.querySelector('[name=v]').value = inp(livre); };
}

/* caixinha -> outra caixinha */
function transfCxModal(fromId) {
  const lista = S.caixinhas;
  if (lista.length < 2) return toast('Crie outra caixinha para transferir');
  const de0 = lista.find(x => x.id === fromId) || lista.find(x => sumC(x.id) > 0) || lista[0];
  const para0 = lista.find(x => x.id !== de0.id);
  const opts = sel => lista.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)} — ${fmt(sumC(x.id))}</option>`).join('');
  const mo = modal('Transferir entre caixinhas', `
    <label>De<select name="de">${opts(de0.id)}</select></label>
    <label>Para<select name="para">${opts(para0.id)}</select></label>
    <label>Valor (R$)<input name="v" required inputmode="decimal" placeholder="0,00"></label>
    <button type="button" class="link" data-tudo>Transferir tudo da caixinha de origem</button>`,
    f => {
      const v = parseMoney(f.v), a = S.caixinhas.find(x => x.id === f.de), b = S.caixinhas.find(x => x.id === f.para);
      if (!a || !b || a.id === b.id) { toast('Escolha caixinhas diferentes'); return false; }
      if (v <= 0) { toast('Informe um valor maior que zero'); return false; }
      if (v > sumC(a.id)) { toast(`Saldo insuficiente em "${a.nome}"`); return false; }
      S.entries.push({ id: uid(), type: 'transfCx', date: today(), desc: `Transferência de "${a.nome}" para "${b.nome}": ${fmt(v)}`, aloc: { m: {}, c: { [a.id]: -v, [b.id]: v }, l: 0 } });
      save(); render(); toast('Transferência feita ✓');
    }, { ok: 'Transferir' });
  mo.o.querySelector('[data-tudo]').onclick = () => { mo.o.querySelector('[name=v]').value = inp(sumC(mo.o.querySelector('[name=de]').value)); };
}

/* saldo livre -> todas as caixinhas, proporcional às porcentagens */
function partilhaCx(v) {
  const lista = S.caixinhas.filter(c => !c.fixa && c.pct > 0), tot = lista.reduce((a, c) => a + c.pct, 0);
  const out = {}; let usado = 0;
  lista.forEach(c => { out[c.id] = Math.floor(v * c.pct / tot); usado += out[c.id]; });
  if (lista.length) out[lista[0].id] += v - usado;                       // centavos que sobram vão para a primeira
  return { lista, out };
}
function distLivreModal() {
  const livre = balances().livre;
  if (livre <= 0) return toast('Você não tem saldo livre para distribuir');
  if (!partilhaCx(1).lista.length) return toast('Defina a porcentagem de alguma caixinha primeiro');
  const mo = modal('Preencher caixinhas', `
    <p class="mut" style="margin:0 0 4px">Saldo livre: <b>${fmt(livre)}</b></p>
    <label>Quanto distribuir (R$)<input name="v" required inputmode="decimal" value="${inp(livre)}"></label>
    <div class="brk" id="prevDist" style="margin-top:8px"></div>
    <div class="mut note">O valor é dividido entre as caixinhas na proporção das porcentagens de cada uma.</div>`,
    f => {
      const v = parseMoney(f.v);
      if (v <= 0) { toast('Informe um valor maior que zero'); return false; }
      if (v > livre) { toast('Valor maior que o saldo livre'); return false; }
      const { out } = partilhaCx(v);
      S.entries.push({ id: uid(), type: 'depCx', date: today(), desc: `Saldo livre distribuído nas caixinhas: ${fmt(v)}`, aloc: { m: {}, c: out, l: -v } });
      save(); render(); toast('Caixinhas preenchidas ✓');
    }, { ok: 'Preencher' });
  const inpV = mo.o.querySelector('[name=v]'), prev = mo.o.querySelector('#prevDist');
  const mostra = () => {
    const v = Math.min(Math.max(0, parseMoney(inpV.value)), 9e11), { lista, out } = partilhaCx(v);
    prev.innerHTML = lista.map(c => `<div class="r"><span><i class="dot" style="background:${c.cor}"></i>${esc(c.nome)} · ${c.pct}%</span><span>${fmt(out[c.id] || 0)}</span></div>`).join('');
  };
  inpV.addEventListener('input', mostra); mostra();
}

function opcCx(id) {
  const c = S.caixinhas.find(x => x.id === id), bal = sumC(id);
  const mo = modal(esc(c.nome), `<div class="list"><button type="button" class="opt" data-o="add">Adicionar do saldo livre</button><button type="button" class="opt" data-o="tr">Transferir para outra caixinha</button><button type="button" class="opt" data-o="ret">Retirar / gastar valor</button><button type="button" class="opt" data-o="liv">Devolver tudo ao saldo livre</button>${c.fixa ? '' : '<button type="button" class="opt danger" data-o="del">Excluir caixinha</button>'}</div>`, null, { nosave: true });
  mo.o.addEventListener('click', e => {
    const o = e.target.dataset.o; if (!o) return;
    if (o === 'add') { mo.close(); addCxModal(id); }
    else if (o === 'tr') { mo.close(); transfCxModal(id); }
    else if (o === 'ret') {
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
    ${extratoDiaHtml(date)}
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
  tema: () => { setTheme(curTheme() === 'dark' ? 'light' : 'dark'); render(); },
  dprev: () => { draft.date = addDays(draft.date, -1); render(); },
  dnext: () => { draft.date = addDays(draft.date, 1); render(); },
  novaMeta: () => metaModal(),
  saldo: () => saldoModal(),
  impExtrato: () => $('#fileExtrato').click(),
  rdbToggle: () => { S.cfg.rdb = !S.cfg.rdb; save(); render(); },
  rmExtrato: id => {
    const f = S.extrato.arquivos.find(x => x.id === id);
    if (f && confirm(`Remover o extrato "${f.nome}" (${f.n} lançamentos)? Seus lançamentos manuais não mudam.`)) {
      S.extrato.itens = S.extrato.itens.filter(i => i.arq !== id);
      S.extrato.arquivos = S.extrato.arquivos.filter(x => x.id !== id);
      save(); render(); toast('Extrato removido');
    }
  },
  editTmpl: id => tmplModal(id),
  endTmpl: id => { const t = S.recorrentes.find(x => x.id === id); if (t && confirm(`Encerrar a recorrência de "${t.nome}"? As metas já criadas continuam, mas não serão criadas novas.`)) { endSeries(id); save(); render(); toast('Recorrência encerrada'); } },
  editMeta: id => metaModal(id),
  depMeta,
  up: id => moveMeta(id, -1),
  down: id => moveMeta(id, 1),
  novaCx: () => cxModal(),
  editCx: id => cxModal(id),
  opcCx,
  transfCx: id => transfCxModal(id),
  distLivre: () => distLivreModal(),
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
  if (e.target.id === 'fileExtrato') { const fl = e.target.files[0]; e.target.value = ''; if (fl) importaExtrato(fl); return; }
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
