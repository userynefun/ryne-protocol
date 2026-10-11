/* Pure market logic. Reads only the market-source register record. No DOM, no CA state. */

const SEC = 1000;
export const CFG = { pollMs: 60 * SEC, baseDelay: 2 * SEC, maxDelay: 60 * SEC, chunk: 30, top: 10, timeoutMs: 12 * SEC };

export function backoffDelay(failures, cfg = CFG, rand = Math.random) {
  const exp = Math.min(cfg.maxDelay, cfg.baseDelay * 2 ** Math.max(0, failures - 1));
  return Math.round(exp * (0.85 + rand() * 0.15));
}

export function solanaAddresses(boosts) {
  if (!Array.isArray(boosts)) throw new Error('boosts shape');
  const seen = new Set();
  for (const b of boosts) {
    if (b && b.chainId === 'solana' && typeof b.tokenAddress === 'string' && b.tokenAddress) seen.add(b.tokenAddress);
  }
  return [...seen];
}

export function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function normalize(pair) {
  const base = pair && pair.baseToken;
  if (!base || typeof base.address !== 'string') return null;
  const img = pair.info && typeof pair.info.imageUrl === 'string' && /^https:\/\//i.test(pair.info.imageUrl) ? pair.info.imageUrl : '';
  return {
    address: base.address,
    symbol: String(base.symbol || '?'),
    name: String(base.name || ''),
    image: img,
    price: num(pair.priceUsd),
    change: num(pair.priceChange && pair.priceChange.h24),
    volume: num(pair.volume && pair.volume.h24),
    liquidity: num(pair.liquidity && pair.liquidity.usd),
  };
}

/* one pair per token: the deepest pool wins */
export function bestPerToken(pairs, wanted) {
  const best = new Map();
  for (const p of pairs) {
    if (!p || p.chainId !== 'solana') continue;
    const n = normalize(p);
    if (!n || (wanted && !wanted.has(n.address))) continue;
    const cur = best.get(n.address);
    if (!cur || (n.liquidity || 0) > (cur.liquidity || 0)) best.set(n.address, n);
  }
  return [...best.values()];
}

export function rankTop(items, n = CFG.top) {
  return items.filter((i) => i.volume !== null).sort((a, b) => b.volume - a.volume).slice(0, n);
}

export const SORTS = {
  volume: (a, b) => (b.volume ?? -Infinity) - (a.volume ?? -Infinity),
  momentum: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity),
  depth: (a, b) => (b.liquidity ?? -Infinity) - (a.liquidity ?? -Infinity),
};

async function getJson(fetchImpl, url, timeoutMs) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, ctl ? { signal: ctl.signal, headers: { accept: 'application/json' } } : undefined);
    if (!res.ok) throw new Error('status ' + res.status);
    return await res.json();
  } finally { if (timer) clearTimeout(timer); }
}

export function endpoints(record) {
  if (!record || record.state !== 'stated' || !record.boosts || !record.pairs) throw new Error('market-source not stated');
  return { boosts: record.boosts, pairs: record.pairs };
}

export async function loadBoard(record, fetchImpl = fetch, cfg = CFG) {
  const ep = endpoints(record);
  const boosts = await getJson(fetchImpl, ep.boosts, cfg.timeoutMs);
  const addrs = solanaAddresses(boosts);
  if (!addrs.length) throw new Error('no solana entries');
  const groups = chunk(addrs, cfg.chunk);
  const results = await Promise.all(groups.map((g) => getJson(fetchImpl, ep.pairs.replace('{addresses}', g.join(',')), cfg.timeoutMs)));
  const pairs = results.flat();
  if (!Array.isArray(pairs)) throw new Error('pairs shape');
  const items = bestPerToken(pairs, new Set(addrs));
  const top = rankTop(items, cfg.top);
  if (!top.length) throw new Error('empty board');
  return { top, tracked: items.length };
}

/* poller: 60s cadence, exponential backoff on failure, paused while hidden, immediate on visible */
export function createPoller({ load, onData, onError, onState, isHidden, setTimer = setTimeout, clearTimer = clearTimeout, cfg = CFG, rand = Math.random }) {
  let timer = null, failures = 0, inflight = false, started = false, paused = false;
  const state = (s) => onState && onState(s);
  async function tick() {
    timer = null;
    if (isHidden()) { paused = true; state('paused'); return; }
    if (inflight) return;
    inflight = true; state('sync');
    try {
      const data = await load();
      failures = 0;
      onData(data);
      state('live');
      schedule(cfg.pollMs);
    } catch (err) {
      failures += 1;
      onError(err, failures);
      state('error');
      schedule(backoffDelay(failures, cfg, rand));
    } finally { inflight = false; }
  }
  function schedule(ms) {
    if (!started) return;
    if (timer) clearTimer(timer);
    timer = setTimer(tick, ms);
  }
  return {
    start() { started = true; paused = false; tick(); },
    stop() { started = false; if (timer) clearTimer(timer); timer = null; },
    visibility() {
      if (!started) return;
      if (isHidden()) { if (timer) clearTimer(timer); timer = null; paused = true; state('paused'); }
      else if (paused || !timer) { paused = false; if (timer) clearTimer(timer); timer = null; tick(); }
    },
    get failures() { return failures; },
  };
}

/* formatting */
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
export const fmtMoney = (n) => (n === null || n === undefined ? '—' : '$' + compact.format(n));
export function fmtPrice(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  if (n === 0) return '$0';
  const lead = Math.max(0, -Math.floor(Math.log10(n)));
  return '$' + n.toFixed(Math.min(12, lead + 3));
}
export function fmtChange(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  const s = a >= 1000 ? compact.format(a) : a.toFixed(a >= 100 ? 0 : 1);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s + '%';
}
export const dirOf = (n) => (n === null || n === undefined || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');
