import { loadBoard, createPoller, SORTS, fmtMoney, fmtPrice, fmtChange, dirOf, CFG } from './market-core.js';
import { countTo, initTabs, reduced } from './motion.js';
import { copyText, say } from './copy.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function logo(item, size) {
  const d = el('div', 'logo');
  const letter = (item.symbol || '?').trim().charAt(0).toUpperCase() || '?';
  const fallback = () => { d.textContent = letter; };
  if (item.image) {
    const img = el('img', '', '', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); fallback(); });
    img.src = item.image;
    d.appendChild(img);
  } else fallback();
  if (size) { d.style.width = d.style.height = size + 'px'; }
  return d;
}

const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function delta(n) {
  const d = el('span', 'delta', '', { 'data-dir': dirOf(n) });
  d.textContent = (n > 0 ? '▲ ' : n < 0 ? '▼ ' : '') + fmtChange(n);
  return d;
}

export function initMarket(record) {
  const state = { items: [], tracked: 0, sort: 'volume', had: false, status: 'sync' };
  const rowsHost = $('[data-rows]');
  const note = $('[data-board-note]');
  const rows = new Map();
  let filledOnce = false;

  /* ---------- status ---------- */
  const pills = $$('.pill[data-status]');
  const setStatus = (s) => {
    state.status = s;
    const shown = s === 'sync' && state.had ? 'live' : s;
    const text = { live: 'Live', sync: 'Syncing', error: 'Source error', paused: 'Paused' }[shown];
    pills.forEach((p) => {
      p.setAttribute('data-state', shown);
      const t = $('[data-status-text]', p);
      if (t) t.textContent = text;
      p.setAttribute('aria-label', 'Market feed: ' + text);
    });
  };

  /* ---------- rows ---------- */
  function buildRow(item) {
    const r = el('div', 'row', '', { 'data-addr': item.address, 'data-spot': '' });
    r.append(
      el('div', 'rank', ''),
      (() => { const a = el('div', 'cell-a'); a.append(logo(item)); const t = el('div', 't'); t.append(el('b', '', item.symbol), el('span', 'n', item.name)); a.append(t); return a; })(),
      el('div', 'c-price num', '', { 'data-label': 'Price' }),
      el('div', 'c-chg', '', { 'data-label': '24h' }),
      el('div', 'c-vol num', '', { 'data-label': 'Volume' }),
      el('div', 'c-liq num', '', { 'data-label': 'Liquidity' }),
      (() => {
        const c = el('div', 'c-copy');
        const b = el('button', 'copy-btn', '', { type: 'button', 'aria-label': 'Copy address for ' + item.symbol });
        b.innerHTML = COPY_ICON;
        b.addEventListener('click', async () => {
          const ok = await copyText(item.address);
          b.setAttribute('data-copied', String(ok));
          b.innerHTML = ok ? CHECK_ICON : COPY_ICON;
          say(ok ? 'Address copied for ' + item.symbol : 'Copy failed');
          setTimeout(() => { b.removeAttribute('data-copied'); b.innerHTML = COPY_ICON; }, 1500);
        });
        c.append(b);
        return c;
      })(),
    );
    return r;
  }

  function paintRow(r, item, i, first) {
    r.style.order = String(i);
    $('.rank', r).textContent = String(i + 1);
    countTo($('.c-price', r), item.price ?? 0, (v) => (item.price === null ? '—' : fmtPrice(v)), { duration: 500 });
    countTo($('.c-vol', r), item.volume ?? 0, (v) => (item.volume === null ? '—' : fmtMoney(v)));
    countTo($('.c-liq', r), item.liquidity ?? 0, (v) => (item.liquidity === null ? '—' : fmtMoney(v)));
    const chg = $('.c-chg', r);
    const old = chg.getAttribute('data-v');
    if (old === null || Number(old) !== (item.change ?? NaN)) {
      chg.textContent = '';
      chg.append(delta(item.change));
      if (old !== null) { chg.classList.remove('is-flash-up', 'is-flash-down'); void chg.offsetWidth; chg.classList.add(item.change > Number(old) ? 'is-flash-up' : 'is-flash-down'); }
      chg.setAttribute('data-v', String(item.change ?? ''));
    }
    if (first) {
      r.style.setProperty('--d', i * 45 + 'ms');
      $$('.cell-a, .c-price, .c-chg, .c-vol, .c-liq, .c-copy, .rank', r).forEach((c) => { c.setAttribute('data-fill', ''); c.style.setProperty('--d', i * 45 + 'ms'); c.classList.add('in'); });
    }
  }

  function renderRows() {
    const sorted = [...state.items].sort(SORTS[state.sort]);
    if (!filledOnce) { $$('.row.skeleton', rowsHost).forEach((n) => n.remove()); filledOnce = true; }
    const live = new Set(sorted.map((s) => s.address));
    for (const [a, r] of rows) if (!live.has(a)) { r.remove(); rows.delete(a); }
    sorted.forEach((item, i) => {
      let r = rows.get(item.address);
      const first = !r;
      if (!r) { r = buildRow(item); rows.set(item.address, r); rowsHost.append(r); }
      paintRow(r, item, i, first);
    });
  }

  function dashRows() {
    $$('.row.skeleton .skel', rowsHost).forEach((s) => { s.classList.remove('skel'); s.textContent = '—'; s.style.minWidth = '0'; });
  }

  /* ---------- ticker ---------- */
  function renderTicker() {
    const track = $('[data-ticker-track]');
    if (!track) return;
    track.textContent = '';
    const build = () => state.items.map((it) => {
      const t = el('span', 'tk');
      t.append(logo(it), el('b', '', it.symbol), el('span', 'mono', fmtPrice(it.price)), delta(it.change));
      return t;
    });
    const a = build(), b = build();
    track.append(...a, ...b);
    b.forEach((n) => n.setAttribute('aria-hidden', 'true'));
    track.style.setProperty('--marquee', Math.max(30, state.items.length * 6) + 's');
  }

  /* ---------- hero, tiles, lists ---------- */
  function setText(sel, v) { $$(sel).forEach((n) => { n.classList.remove('skel'); n.textContent = v; }); }
  function renderHero() {
    const top = state.items;
    if (!top.length) return;
    const lead = [...top].sort(SORTS.volume)[0];
    const total = top.reduce((s, i) => s + (i.volume || 0), 0);
    const climber = [...top].sort(SORTS.momentum)[0];
    const deep = [...top].sort(SORTS.depth)[0];
    const host = $('[data-lead-logo]');
    if (host) { host.textContent = ''; host.append(logo(lead)); }
    setText('[data-lead-sym]', lead.symbol);
    setText('[data-lead-name]', lead.name || lead.symbol);
    setText('[data-lead-price]', fmtPrice(lead.price));
    const dh = $('[data-lead-delta]');
    if (dh) { dh.textContent = ''; dh.append(delta(lead.change)); }
    const share = total ? (lead.volume || 0) / total : 0;
    const cover = lead.volume ? Math.min(1, (lead.liquidity || 0) / lead.volume) : 0;
    const m1 = $('[data-meter="share"]'); const m2 = $('[data-meter="cover"]');
    if (m1) m1.style.setProperty('--v', share.toFixed(3));
    if (m2) m2.style.setProperty('--v', cover.toFixed(3));
    setText('[data-meter-v="share"]', Math.round(share * 100) + '%');
    setText('[data-meter-v="cover"]', Math.round(cover * 100) + '%');
    setText('[data-chip="climber"]', climber.symbol + ' ' + fmtChange(climber.change));
    setText('[data-chip="deep"]', deep.symbol + ' ' + fmtMoney(deep.liquidity));
    setText('[data-chip="total"]', fmtMoney(total));
  }
  function renderTiles() {
    const total = state.items.reduce((s, i) => s + (i.volume || 0), 0);
    const t1 = $('[data-tile-v="tracked"]'), t2 = $('[data-tile-v="volume"]');
    if (t1) { t1.classList.remove('skel'); countTo(t1, state.tracked, (v) => String(Math.round(v))); }
    if (t2) { t2.classList.remove('skel'); countTo(t2, total, (v) => fmtMoney(v)); }
  }
  function renderLists() {
    const spec = { climbers: SORTS.momentum, sliders: (a, b) => SORTS.momentum(b, a), deep: SORTS.depth };
    $$('[data-list]').forEach((host) => {
      const k = host.getAttribute('data-list');
      const pick = [...state.items].sort(spec[k]).slice(0, 3);
      host.textContent = '';
      pick.forEach((it, i) => {
        const li = el('div', 'li in', '', { 'data-fill': '', style: '--d:' + i * 60 + 'ms' });
        li.append(logo(it, 32), el('span', 'grow', it.symbol));
        if (k === 'deep') li.append(el('span', 'num mono', fmtMoney(it.liquidity)));
        else li.append(delta(it.change));
        host.append(li);
      });
    });
    const live = $('[data-step-live]');
    if (live) {
      live.textContent = '';
      [...state.items].sort(SORTS.volume).slice(0, 3).forEach((it) => {
        const m = el('div', 'mini');
        m.append(el('b', '', it.symbol), el('span', 'mono', fmtMoney(it.volume)));
        live.append(m);
      });
    }
  }

  function renderAll() {
    renderRows(); renderTicker(); renderHero(); renderTiles(); renderLists();
  }

  /* ---------- feed ---------- */
  const poller = createPoller({
    load: () => loadBoard(record),
    onData: ({ top, tracked }) => {
      state.items = top; state.tracked = tracked; state.had = true;
      if (note) note.hidden = true;
      renderAll();
    },
    onError: () => {
      if (!state.had) {
        dashRows();
        $$('[data-tile-v]').forEach((n) => { n.classList.remove('skel'); n.textContent = '—'; });
        const track = $('[data-ticker-track]');
        if (track) { track.textContent = ''; track.append(el('span', 'tk', 'Feed unreachable —')); track.style.setProperty('--marquee', '0s'); track.style.animation = 'none'; }
      }
      if (note) {
        note.hidden = false;
        note.textContent = state.had ? 'The feed did not answer. Showing the last good reading while retrying.' : 'The feed did not answer. Retrying with a longer pause each time.';
      }
    },
    onState: setStatus,
    isHidden: () => document.hidden,
    cfg: CFG,
  });

  const tabs = $('[data-board-tabs]');
  if (tabs) initTabs(tabs, (key) => { state.sort = key; if (state.items.length) renderRows(); });
  document.addEventListener('visibilitychange', () => poller.visibility());
  setStatus('sync');
  poller.start();
  return poller;
}
