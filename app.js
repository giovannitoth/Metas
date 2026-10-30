'use strict';
/* ============ Metas Financeiras — PWA ============
   Valores sempre em centavos (inteiros). Dados salvos no localStorage. */

const KEY = 'metas-financeiras-v1';
const COLORS = ['#F04A00', '#C98A12', '#2E8B57', '#2A62B0', '#8E44AD', '#C0392B', '#16A0A0', '#7F6A5B'];
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
let S = load();
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

/* Quanto precisa guardar na data D para a meta.
   - "antes"  = guardado em dias anteriores a D
   - o valor por dia = (total - antes) / dias restantes (D até o prazo, inclusive)
   Antecipar (guardar mais) reduz o valor dos dias seguintes; atrasar aumenta. */
function metaInfo(m, D) {
  const saved = sumM(m.id);
  const before = sumM(m.id, e => e.date < D);
  const given = sumM(m.id, e => e.date === D);
  const rem = Math.max(0, m.valor - saved);
  const dl = Math.max(1, diff(D, m.prazo) + 1);
  const overdue = m.prazo < D && rem > 0;
  const need = Math.max(0, Math.ceil((m.valor - before) / dl));
  const hoje = Math.min(rem, Math.max(0, need - given));
  const perDay = hoje > 0 ? need : (rem > 0 && dl > 1 ? Math.ceil(rem / (dl - 1)) : 0);
  const total = Math.max(1, diff(m.inicio, m.prazo) + 1);
  const elapsed = Math.min(total, Math.max(0, diff(m.inicio, D)));
  const expected = Math.round(m.valor * elapsed / total);
  let status = 'ok';
  if (rem === 0) status = 'done';
  else if (overdue) status = 'late';
  else if (before < expected - 1) status = 'behind';
  else if (saved > expected + Math.ceil(m.valor / total)) status = 'ahead';
  return { saved, rem, dl, overdue, need, hoje, perDay, status, pct: Math.min(100, Math.round(saved / m.valor * 100)) };
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
  S.caixinhas.forEach(x => { const v = Math.floor(restante * x.pct / 100); c[x.id] = v; used += v; });
  return { custoTotal, lucro, disp, m, infos, restante, c, livre: restante - used };
}
function draftNums() {
  return {
    date: draft.date || today(), custo: parseMoney(draft.custo), qtd: parseNum(draft.qtd),
    receita: parseMoney(draft.receita), despesas: parseMoney(draft.despesas), adiantar: !!draft.adiantar
  };
}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
function modal(title, body, onSubmit, opts = {}) {
  const o = document.createElement('div');
  o.className = 'ov';
  o.innerHTML = `<form class="sheet"><h3>${title}</h3>${body}<div class="btns">${opts.extra || ''}<button type="button" class="ghost" data-close>${opts.nosave ? 'Fechar' : 'Cancelar'}</button>${opts.nosave ? '' : '<button class="pri">Salvar</button>'}</div></form>`;
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
  inicio: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  metas: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  mensal: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h8M8 17.5h5"/></svg>',
  cal: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01"/></svg>',
  box: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
  hash: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>',
  cash: '<svg class="ico" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/></svg>'
};

/* ---------- views ---------- */
function vInicio() {
  const b = balances();
  return `
  <header class="top"><h1>Metas Financeiras</h1><div class="sub">${fmtLong(today())}</div></header>
  <section class="stats">
    <div><span>Saldo livre</span><b>${fmt(b.livre)}</b></div>
    <div><span>Em metas</span><b>${fmt(b.metas)}</b></div>
    <div><span>Em caixinhas</span><b>${fmt(b.cx)}</b></div>
  </section>
  ${vEntrada()}
  ${vMetasHoje()}
  ${vCaixinhas()}
  <details class="big"><summary>Resumo financeiro de hoje</summary><div id="resumo"></div></details>`;
}

function vEntrada() {
  return `
  <div class="card entry">
    <div class="row"><h2>Entrada do Dia</h2><input type="date" data-f="date" value="${esc(draft.date)}" style="border:0;background:transparent;color:var(--mut);font:inherit;text-align:right"></div>
    <label>Custo da Mercadoria (unitário)</label>${ICON.box}
    <div class="field"><span>R$</span><input inputmode="decimal" data-f="custo" placeholder="0,00" value="${esc(draft.custo)}"></div>
    <label>Quantidade Vendida</label>${ICON.hash}
    <div class="field"><input inputmode="decimal" data-f="qtd" placeholder="0" value="${esc(draft.qtd)}"></div>
    <label>Dinheiro do Dia (total recebido)</label>${ICON.cash}
    <div class="field"><span>R$</span><input inputmode="decimal" data-f="receita" placeholder="0,00" value="${esc(draft.receita)}"></div>
    <div id="calc1"></div>
    <details><summary>Detalhes do lucro</summary><div id="det" class="brk"></div></details>
    <label class="chk"><input type="checkbox" data-f="usar" ${draft.usar ? 'checked' : ''}> Usar este custo unitário nos próximos dias</label>
    <div class="sep"></div>
    <details class="big"><summary>Despesas e observações</summary>
      <label>Despesas do dia (R$)</label>
      <div class="field"><span>R$</span><input inputmode="decimal" data-f="despesas" placeholder="0,00" value="${esc(draft.despesas)}"></div>
      <label>Observações</label>
      <div class="field" style="height:auto;padding:10px 16px"><input data-f="obs" placeholder="Opcional" value="${esc(draft.obs)}"></div>
    </details>
    <div class="sep"></div>
    <label class="chk"><input type="checkbox" data-f="adiantar" ${draft.adiantar ? 'checked' : ''}> Adiantar metas com o excedente</label>
    <div id="calc2" class="brk"></div>
    <button class="pri" data-a="registrar" id="btnReg">Registrar</button>
  </div>`;
}

function vMetasHoje() {
  if (!S.metas.length) return '';
  const D = today();
  return `<section><div class="row"><h3 style="margin:0">Metas de hoje</h3><button class="ghost sm" data-a="tab" data-id="metas">Ver metas</button></div>
  ${S.metas.map(m => {
    const i = metaInfo(m, D);
    return `<div class="mini"><div>${esc(m.nome)}<small>${i.status === 'done' ? 'Concluída' : 'até ' + fmtDate(m.prazo)}</small></div>
    <div style="text-align:right"><b>${i.status === 'done' ? '✓' : fmt(i.hoje)}</b><small>${i.status === 'done' ? '' : 'guardar hoje'}</small></div></div>`;
  }).join('')}</section>`;
}

function vCaixinhas() {
  const b = balances();
  const tot = S.caixinhas.reduce((a, c) => a + c.pct, 0);
  const D = today();
  const has = new Set(S.caixinhas.map(c => c.nome.toLowerCase()));
  const sug = SUGESTOES.filter(s => !has.has(s.toLowerCase()));
  return `<section>
    <div class="row"><h2>Minhas Caixinhas</h2><button class="pri sm" data-a="novaCx">+ Nova caixinha</button></div>
    <div class="grid" style="margin:14px 0"><div class="k"><span>Saldo em caixinhas</span><b>${fmt(b.cx)}</b></div><div class="k"><span>Saldo livre</span><b class="${b.livre < 0 ? 'neg' : ''}">${fmt(b.livre)}</b></div></div>
    <h3 style="margin-bottom:4px">Distribuição automática: ${tot}%</h3>
    <div class="${tot > 100 ? 'neg' : 'gold'}">${tot > 100 ? 'Passou de 100%! Ajuste as caixinhas.' : (100 - tot) + '% continuará no saldo livre.'}</div>
    <div class="actions"><button class="ghost" data-a="dist100">Distribuir 100%</button></div>
    ${S.caixinhas.map(c => {
      const hoje = S.entries.filter(e => e.date === D).reduce((a, e) => a + ((e.aloc.c || {})[c.id] || 0), 0);
      return `<div class="card"><div class="row"><b style="font-size:20px"><span class="dot" style="background:${c.cor}"></span>${esc(c.nome)}</b><span class="pct">${c.pct}%</span></div>
      <div class="big">${fmt(sumC(c.id))}</div><div class="mut">Recebido hoje: ${fmt(hoje)}</div>
      <div class="sep"></div><div class="actions"><button class="ghost" data-a="editCx" data-id="${c.id}">✎ Editar</button><span class="sp"></span><button class="ghost" data-a="opcCx" data-id="${c.id}">··· Opções</button></div></div>`;
    }).join('') || '<div class="empty">Nenhuma caixinha ainda.</div>'}
    ${sug.length ? `<details open><summary style="color:var(--tx);font-size:18px;font-weight:600">Sugestões de caixinhas</summary><div class="chips">${sug.map(s => `<button class="chip" data-a="sugestao" data-id="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div></details>` : ''}
  </section>`;
}

function vMetas() {
  const D = today();
  const infos = S.metas.map(m => ({ m, i: metaInfo(m, D) }));
  const totHoje = infos.reduce((a, x) => a + x.i.hoje, 0);
  return `<header class="top row"><div><h1>Metas</h1><div class="sub">Por ordem de prioridade</div></div><button class="pri sm" data-a="novaMeta">+ Nova meta</button></header>
  <div class="grid"><div class="k"><span>Guardar hoje (total)</span><b>${fmt(totHoje)}</b></div><div class="k"><span>Saldo livre</span><b>${fmt(balances().livre)}</b></div></div>
  ${infos.map(({ m, i }, k) => {
    const badge = { done: '<span class="badge ok">Concluída</span>', late: '<span class="badge late">Vencida</span>', behind: '<span class="badge late">Atrasada</span>', ahead: '<span class="badge ahead">Adiantada</span>', ok: '' }[i.status];
    return `<div class="card">
      <div class="row"><b style="font-size:19px">${k + 1}. ${esc(m.nome)}${badge}</b><span class="pct">até ${fmtDate(m.prazo)}</span></div>
      <div class="bar"><i style="width:${i.pct}%"></i></div>
      <div class="row mut"><span>${fmt(i.saved)} de ${fmt(m.valor)}</span><span>${i.pct}%</span></div>
      ${i.status === 'done' ? '' : `<div class="row" style="margin-top:10px"><span>Guardar hoje</span><b>${fmt(i.hoje)}</b></div>
      <div class="row mut"><span>Por dia (${i.overdue ? 'vencida' : i.dl + ' dia' + (i.dl > 1 ? 's' : '') + ' restante' + (i.dl > 1 ? 's' : '')})</span><span>${fmt(i.perDay)}</span></div>
      <div class="row mut"><span>Falta</span><span>${fmt(i.rem)}</span></div>`}
      <div class="actions">
        <button class="ghost sm" data-a="up" data-id="${m.id}" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button class="ghost sm" data-a="down" data-id="${m.id}" ${k === S.metas.length - 1 ? 'disabled' : ''}>↓</button>
        <span class="sp"></span>
        <button class="ghost sm" data-a="editMeta" data-id="${m.id}">Editar</button>
        ${i.status === 'done' ? '' : `<button class="ghost sm" data-a="depMeta" data-id="${m.id}">Adiantar</button>`}
      </div></div>`;
  }).join('') || '<div class="empty" style="margin-top:14px">Crie sua primeira meta: informe o valor total e até quando precisa guardar. O app calcula quanto guardar por dia.</div>'}`;
}

function monthEntries() { return S.entries.filter(e => e.date.startsWith(mes)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); }
function entDesc(e) {
  if (e.type === 'dia') return { t: 'Entrada do dia', s: `Receita ${fmt(e.receita)} · Lucro ${fmt(e.lucro)}${e.despesas ? ' · Desp. ' + fmt(e.despesas) : ''}${e.obs ? ' · ' + esc(e.obs) : ''}` };
  return { t: esc(e.desc || e.type), s: '' };
}
function monthNav(title) {
  return `<header class="top"><h1>${title}</h1></header><div class="monthnav"><button data-a="mesPrev">‹</button><b>${fmtMes(mes)}</b><button data-a="mesNext">›</button></div>`;
}
function vMensal() {
  const es = monthEntries(), dias = es.filter(e => e.type === 'dia');
  const sum = f => dias.reduce((a, e) => a + f(e), 0);
  const rec = sum(e => e.receita), custo = sum(e => e.custoTotal), desp = sum(e => e.despesas), lucro = sum(e => e.lucro);
  const toMetas = sum(e => Object.values(e.aloc.m || {}).reduce((a, v) => a + v, 0));
  const toCx = sum(e => Object.values(e.aloc.c || {}).reduce((a, v) => a + v, 0));
  const nd = new Set(dias.map(e => e.date)).size;
  return `${monthNav('Mensal')}
  <div class="grid">
    <div class="k"><span>Faturamento</span><b>${fmt(rec)}</b></div>
    <div class="k"><span>Custo da mercadoria</span><b>${fmt(custo)}</b></div>
    <div class="k"><span>Despesas</span><b>${fmt(desp)}</b></div>
    <div class="k"><span>Lucro líquido</span><b class="${lucro - desp < 0 ? 'neg' : 'pos'}">${fmt(lucro - desp)}</b></div>
    <div class="k"><span>Foi para metas</span><b>${fmt(toMetas)}</b></div>
    <div class="k"><span>Foi para caixinhas</span><b>${fmt(toCx)}</b></div>
    <div class="k"><span>Dias trabalhados</span><b>${nd}</b></div>
    <div class="k"><span>Média de lucro/dia</span><b>${fmt(nd ? Math.round((lucro - desp) / nd) : 0)}</b></div>
  </div>
  <section><h3>Lançamentos</h3>
  ${es.map(e => { const d = entDesc(e); return `<div class="mini"><div>${fmtDate(e.date)} · ${d.t}<small>${d.s}</small></div><button class="ghost sm danger" data-a="delEntry" data-id="${e.id}">Excluir</button></div>`; }).join('') || '<div class="empty">Sem lançamentos neste mês.</div>'}
  </section>
  <section><h3>Backup</h3><div class="actions"><button class="ghost" data-a="export">Exportar dados</button><button class="ghost" data-a="import">Importar dados</button></div>
  <input type="file" id="file" accept="application/json" hidden></section>`;
}

function vCal() {
  const [y, m] = mes.split('-').map(Number);
  const first = new Date(y, m - 1, 1), n = new Date(y, m, 0).getDate();
  const T = today();
  let h = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="h">${x}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) h += '<button class="void"></button>';
  for (let d = 1; d <= n; d++) {
    const date = `${mes}-${pad(d)}`;
    const dias = S.entries.filter(e => e.date === date && e.type === 'dia');
    const luc = dias.reduce((a, e) => a + e.lucro - e.despesas, 0);
    const due = S.metas.some(mt => mt.prazo === date);
    h += `<button class="${date === T ? 'today' : ''} ${dias.length ? 'has' : ''}" data-a="day" data-id="${date}">${d}${dias.length ? `<small class="${luc < 0 ? 'neg' : ''}">${short(luc)}</small>` : ''}${due ? '<i></i>' : ''}</button>`;
  }
  return `${monthNav('Calendário')}<div class="cal">${h}</div>
  <p class="mut" style="margin-top:14px;font-size:13px">Números = lucro líquido do dia · ● = prazo de uma meta. Toque num dia para ver ou lançar.</p>`;
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
  c1.innerHTML = `<div class="two"><div><span>Custo Total</span><b>${fmt(r.custoTotal)}</b></div><div><span>Receita</span><b>${fmt(d.receita)}</b></div></div>
  <div class="profit"><span>↗ Lucro do Dia</span><b class="${r.lucro < 0 ? 'neg' : ''}">${fmt(r.lucro)}</b></div>`;
  $('#det').innerHTML = `<div class="r"><span>Receita</span><span>${fmt(d.receita)}</span></div><div class="r"><span>− Custo (${fmt(d.custo)} × ${d.qtd || 0})</span><span>${fmt(r.custoTotal)}</span></div><div class="r b"><span>Lucro</span><span>${fmt(r.lucro)}</span></div>`;
  $('#calc2').innerHTML = `
    <div class="r"><span>Recebido (lucro)</span><span>${fmt(r.lucro)}</span></div>
    <div class="r"><span>Despesas</span><span>${fmt(d.despesas)}</span></div>
    <div class="r b"><span>Disponível para metas</span><span>${fmt(r.disp)}</span></div>
    ${S.metas.map((m, k) => { const i = r.infos[k]; const g = r.m[m.id] || 0;
      return `<div class="r"><span>${esc(m.nome)}${g < i.hoje ? `<small>faltou ${fmt(i.hoje - g)} da cota de hoje</small>` : ''}</span><span>${i.status === 'done' ? '✓' : fmt(g)}</span></div>`; }).join('')}
    <div class="r b"><span>Restante após metas</span><span>${fmt(r.restante)}</span></div>
    ${S.caixinhas.map(c => `<div class="r"><span>${esc(c.nome)} · ${c.pct}%</span><span>${fmt(r.c[c.id] || 0)}</span></div>`).join('')}
    <div class="r b"><span>Saldo livre desta entrada</span><span>${fmt(r.livre)}</span></div>`;
  $('#btnReg').disabled = d.receita <= 0;
  const rs = $('#resumo');
  if (rs) {
    const T = today(), es = S.entries.filter(e => e.date === T && e.type === 'dia');
    const sm = f => es.reduce((a, e) => a + f(e), 0);
    rs.innerHTML = es.length ? `<div class="brk"><div class="r"><span>Lançamentos</span><span>${es.length}</span></div><div class="r"><span>Receita</span><span>${fmt(sm(e => e.receita))}</span></div><div class="r"><span>Custo</span><span>${fmt(sm(e => e.custoTotal))}</span></div><div class="r"><span>Despesas</span><span>${fmt(sm(e => e.despesas))}</span></div><div class="r b"><span>Lucro líquido</span><span>${fmt(sm(e => e.lucro - e.despesas))}</span></div></div>` : '<div class="mut" style="padding:6px 0">Nada registrado hoje.</div>';
  }
}

/* ---------- ações ---------- */
function registrar() {
  const d = draftNums();
  if (d.receita <= 0) return toast('Informe o dinheiro do dia');
  const r = compute(d);
  S.entries.push({
    id: uid(), type: 'dia', date: d.date, custo: d.custo, qtd: d.qtd, receita: d.receita,
    custoTotal: r.custoTotal, lucro: r.lucro, despesas: d.despesas, obs: draft.obs.trim(),
    aloc: { m: r.m, c: r.c, l: r.livre }
  });
  S.cfg.usar = !!draft.usar; S.cfg.custo = draft.usar ? d.custo : 0;
  save();
  const keep = draft.usar;
  draft = newDraft(); if (keep) draft.custo = inp(S.cfg.custo);
  render();
  toast('Entrada registrada ✓');
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
  const mo = modal(esc(c.nome), `<div class="list"><button type="button" class="opt" data-o="ret">Retirar / gastar valor</button><button type="button" class="opt" data-o="liv">Devolver tudo ao saldo livre</button><button type="button" class="opt danger" data-o="del">Excluir caixinha</button></div>`, null, { nosave: true });
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
  if (!S.caixinhas.length) return toast('Crie uma caixinha primeiro');
  const tot = S.caixinhas.reduce((a, c) => a + c.pct, 0);
  let acc = 0;
  S.caixinhas.forEach((c, k) => {
    if (k === S.caixinhas.length - 1) c.pct = 100 - acc;
    else { c.pct = tot > 0 ? Math.round(c.pct * 100 / tot) : Math.floor(100 / S.caixinhas.length); acc += c.pct; }
  });
  save(); render(); toast('Caixinhas somam 100%');
}

function dayModal(date) {
  const es = S.entries.filter(e => e.date === date);
  const dueMetas = S.metas.filter(m => m.prazo === date);
  const mo = modal(fmtLong(date), `
    ${dueMetas.map(m => `<div class="mini"><div>🎯 Prazo da meta: ${esc(m.nome)}<small>${fmt(m.valor)}</small></div></div>`).join('')}
    ${es.map(e => { const d = entDesc(e); return `<div class="mini"><div>${d.t}<small>${d.s}</small></div><button type="button" class="ghost sm danger" data-del="${e.id}">Excluir</button></div>`; }).join('') || '<div class="empty">Sem lançamentos.</div>'}
    <div class="btns"><button type="button" class="pri" data-a="lancar" data-id="${date}">Lançar neste dia</button></div>`, null, { nosave: true });
  mo.o.addEventListener('click', e => {
    const id = e.target.dataset.del; if (!id) return;
    if (!confirm('Excluir este lançamento?')) return;
    S.entries = S.entries.filter(x => x.id !== id);
    save(); mo.close(); render();
  });
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
  day: dayModal,
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
  renderPreview();
}
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
        S = s; S.cfg = S.cfg || { custo: 0, usar: false };
        save(); draft = newDraft(); render(); toast('Dados importados ✓');
      } catch (err) { toast('Arquivo inválido'); }
    };
    rd.readAsText(fl);
  }
});

render();
