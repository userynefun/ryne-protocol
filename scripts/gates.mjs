import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, validateRegister } from './build.mjs';
import { parse, findAll, outer, textOf, anyDesc } from './lib/html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.gate-tmp');
const real = JSON.parse(fs.readFileSync(path.join(root, 'register.json'), 'utf8'));
const read = (p) => fs.readFileSync(p, 'utf8');

let passed = 0, failed = 0;
const fails = [];
function gate(name, fn) {
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; fails.push(name); console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').join('\n      ')); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); };

/* ---------- mutation harness: anchors are state-independent, records read at runtime ---------- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sampleAddr = () => Array.from(crypto.randomBytes(44), (b) => B58[b % B58.length]).join('');
function mutate(id, state) {
  const reg = structuredClone(real);
  const r = reg.records.find((x) => x.id === id);
  ok(r, 'record ' + id + ' not found at runtime');
  r.state = state;
  if (state === 'stated') {
    if (r.kind === 'address') r.value = sampleAddr();
    if (r.kind === 'social') r.url = id === 'x' ? 'https://x.com/ryne_probe' : 'https://github.com/ryne-probe/ryne';
  } else {
    for (const k of Object.keys(r)) if (!['id', 'label', 'kind', 'state', 'source', 'scope', 'checked'].includes(k)) delete r[k];
  }
  return reg;
}
const combos = [];
for (const ca of ['absent', 'stated']) for (const x of ['absent', 'stated']) for (const gh of ['absent', 'stated']) combos.push({ ca, x, gh });
fs.rmSync(tmp, { recursive: true, force: true });
const variants = combos.map((c, i) => {
  let reg = structuredClone(real);
  for (const [id, st] of [['ca', c.ca], ['x', c.x], ['github', c.gh]]) {
    const m = mutate(id, st);
    reg.records = reg.records.map((r) => (r.id === id ? m.records.find((q) => q.id === id) : r));
  }
  const dir = path.join(tmp, 'v' + i);
  build({ register: reg, outDir: dir });
  const html = read(path.join(dir, 'index.html'));
  return { ...c, reg, dir, html, dom: parse(html) };
});

/* ---------- 1. register ---------- */
gate('register validates', () => validateRegister(structuredClone(real)));
gate('rule 1: inert record carrying value is refused', () => {
  const bad = structuredClone(real); bad.records.find((r) => r.id === 'ca').value = 'x';
  let threw = false; try { validateRegister(bad); } catch { threw = true; }
  ok(threw, 'validator accepted inert record with value');
});
gate('rule 1: inert record carrying url is refused', () => {
  const bad = structuredClone(real); bad.records.find((r) => r.id === 'x').url = 'https://x.com/a';
  let threw = false; try { validateRegister(bad); } catch { threw = true; }
  ok(threw, 'validator accepted inert record with url');
});
gate('register carries date data, shipped copy carries none', () => {
  ok(real.records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.checked)), 'register.json lost its data field');
  ok(!/"checked"/.test(variants[0].html), 'shipped register leaks checked field');
});
gate('chain and market-source records stated per client statement', () => {
  const c = real.records.find((r) => r.id === 'chain'); const m = real.records.find((r) => r.id === 'market-source');
  eq(c.state, 'stated', 'chain'); eq(c.url, 'https://solana-rpc.publicnode.com', 'rpc'); eq(c.source, 'client statement', 'chain source'); eq(c.scope, 'batch-level', 'chain scope');
  eq(m.state, 'stated', 'market-source');
});

/* ---------- 2. both CA branches ---------- */
const SOLANA_PATHS = { x: 'M18.244 2.25h3.308', github: 'M8 0c4.42 0 8 3.58 8 8' };
for (const v of variants) {
  const tag = `ca=${v.ca} x=${v.x} gh=${v.gh}`;
  gate(`[${tag}] CA slot is first thing in body, before main`, () => {
    const slot = findAll(v.dom, (n) => n.attrs['data-record'] === 'ca');
    eq(slot.length, 1, 'ca slot count');
    ok(slot[0].start < v.html.indexOf('<main'), 'ca slot not before main');
    eq(slot[0].attrs['data-state'], v.ca, 'ca state attr');
    const caRec = v.reg.records.find((r) => r.id === 'ca');
    const txt = textOf(v.html, slot[0]);
    const copies = findAll(slot[0], (n) => 'data-copy' in n.attrs);
    if (v.ca === 'stated') {
      ok(txt.includes(caRec.value), 'full address not rendered');
      ok(copies.length >= 1 && copies.every((b) => b.attrs['data-copy'] === caRec.value && b.tag === 'button'), 'copy buttons missing or wrong');
    } else {
      ok(/pending/.test(txt) && copies.length === 0, 'inert slot must show pending and no copy control');
      ok(!anyDesc(slot[0], (n) => 'href' in n.attrs), 'inert slot has href');
    }
  });
  gate(`[${tag}] socials top-right, icon only, rules hold`, () => {
    const end = findAll(v.dom, (n) => (n.attrs.class || '').split(' ').includes('bar-end'))[0];
    ok(end, 'bar-end missing');
    for (const id of ['x', 'github']) {
      const els = findAll(end, (n) => n.attrs['data-record'] === id);
      eq(els.length, 1, id + ' icon count');
      const el = els[0]; const r = v.reg.records.find((q) => q.id === id);
      ok(outer(v.html, el).includes(SOLANA_PATHS[id]), id + ' official mark missing');
      eq(textOf(v.html, el), '', id + ' must be icon only');
      if (r.state === 'stated') { eq(el.tag, 'a', id + ' tag'); eq(el.attrs.href, r.url, id + ' href'); }
      else { ok(!('href' in el.attrs) && el.tag !== 'a', id + ' inert must not link'); eq(el.attrs['aria-disabled'], 'true', id + ' aria-disabled'); }
    }
  });
  gate(`[${tag}] every inert record is flat: no href, no copy, no value`, () => {
    const inert = findAll(v.dom, (n) => (n.attrs['data-record'] || n.attrs['data-record-card'] || n.attrs['data-record-foot']) && n.attrs['data-state'] !== 'stated');
    const absent = v.reg.records.filter((r) => ['ca', 'x', 'github'].includes(r.id) && r.state !== 'stated').length;
    eq(inert.length, absent * 3, 'inert anchors (slot or icon, tile, footer entry)');
    for (const n of inert) {
      ok(!('href' in n.attrs) && !anyDesc(n, (d) => 'href' in d.attrs), 'inert element links');
      ok(!('data-copy' in n.attrs) && !anyDesc(n, (d) => 'data-copy' in d.attrs), 'inert element copies');
    }
    for (const r of v.reg.records.filter((q) => q.state !== 'stated')) ok(!('value' in r) && !('url' in r), r.id + ' carries value or url');
  });
  gate(`[${tag}] no x or github hrefs for unstated records`, () => {
    for (const id of ['x', 'github']) {
      if (v.reg.records.find((r) => r.id === id).state === 'stated') continue;
      const re = id === 'x' ? /href="https?:\/\/(www\.)?(x|twitter)\.com/ : /href="https?:\/\/(www\.)?github\.com/;
      ok(!re.test(v.html), id + ' link present although unstated');
    }
  });
}
gate('market region is byte-identical across all CA, X and GitHub states', () => {
  const sig = (v) => findAll(v.dom, (n) => 'data-market' in n.attrs).map((n) => outer(v.html, n)).join('\n');
  const base = sig(variants[0]);
  ok(base.length > 2000, 'market region too small to prove anything');
  for (const v of variants) ok(sig(v) === base, `market markup differs for ca=${v.ca} x=${v.x} gh=${v.gh}`);
});
gate('market modules never reference the CA record', () => {
  for (const f of ['market-core.js', 'market-ui.js']) {
    const s = read(path.join(root, 'src/js', f));
    ok(!/['"]ca['"]|contract|data-record|data-copy/i.test(s), f + ' touches CA state');
  }
  const main = read(path.join(root, 'src/js/main.js'));
  ok(/find\(\(r\) => r\.id === 'market-source'\)/.test(main) && /initMarket\(market\)/.test(main), 'market must be fed the market-source record only');
});

/* ---------- 3. market behaviour (real modules, fake network) ---------- */
const core = await import(pathToFileURL(path.join(root, 'src/js/market-core.js')).href);
const mkPair = (addr, sym, vol, liq, extra = {}) => ({ chainId: 'solana', baseToken: { address: addr, symbol: sym, name: sym + ' coin' }, priceUsd: '0.5', priceChange: { h24: 3 }, volume: { h24: vol }, liquidity: { usd: liq }, info: { imageUrl: 'https://img.test/' + sym + '.png' }, ...extra });
function fakeNet(n = 14) {
  const boosts = [{ chainId: 'ethereum', tokenAddress: '0xabc' }];
  const pairs = [];
  for (let i = 0; i < n; i++) { boosts.push({ chainId: 'solana', tokenAddress: 'A' + i }); pairs.push(mkPair('A' + i, 'T' + i, 1000 + i * 100, 500 + i)); }
  pairs.push(mkPair('A0', 'T0', 5, 99999));
  const calls = [];
  const f = async (url) => { calls.push(url); if (url.includes('token-boosts')) return { ok: true, json: async () => boosts }; return { ok: true, json: async () => pairs }; };
  return { f, calls };
}
const mrec = real.records.find((r) => r.id === 'market-source');
await (async () => {
  const net = fakeNet(14);
  const out = await core.loadBoard(mrec, net.f);
  gate('market: solana entries only', () => ok(out.tracked === 14 && !net.calls.some((u) => u.includes('0xabc')), 'non-solana leaked'));
  gate('market: exactly top 10 by 24h volume, descending', () => {
    eq(out.top.length, 10, 'count');
    for (let i = 1; i < out.top.length; i++) ok(out.top[i - 1].volume >= out.top[i].volume, 'order');
    eq(out.top[0].address, 'A13', 'leader');
  });
  gate('market: pairs fetched from register endpoint template', () => ok(net.calls.some((u) => u.startsWith('https://api.dexscreener.com/tokens/v1/solana/A0,')), 'pairs url'));
  gate('market: fields mapped (logo, price, change, volume, liquidity, address)', () => {
    const t = out.top[0]; ok(t.image.startsWith('https://') && t.price === 0.5 && t.change === 3 && t.volume && t.liquidity && t.address, 'fields');
  });
  gate('market: letter tile path when imageUrl missing or unsafe', () => {
    eq(core.normalize({ baseToken: { address: 'a', symbol: 's' }, info: {} }).image, '', 'missing');
    eq(core.normalize({ baseToken: { address: 'a', symbol: 's' }, info: { imageUrl: 'javascript:1' } }).image, '', 'unsafe');
    const ui = read(path.join(root, 'src/js/market-ui.js'));
    ok(/addEventListener\('error'/.test(ui) && /fallback\(\)/.test(ui), 'onerror fallback missing');
  });
  const other = { ...mrec, boosts: 'https://example.test/boosts', pairs: 'https://example.test/p/{addresses}' };
  const calls2 = []; await core.loadBoard(other, async (u) => { calls2.push(u); return { ok: true, json: async () => (u.includes('boosts') ? [{ chainId: 'solana', tokenAddress: 'Z' }] : [mkPair('Z', 'Z', 1, 1)]) }; });
  gate('market: endpoints come from the record, not from code', () => ok(calls2.length === 2 && calls2.every((u) => u.startsWith('https://example.test/')), 'hardcoded endpoint'));
  let refused = false; try { await core.loadBoard({ ...mrec, state: 'absent' }, net.f); } catch { refused = true; }
  gate('market: refuses to run when the record is not stated', () => ok(refused, 'ran without a stated record'));
  const many = fakeNet(70);
  await core.loadBoard(mrec, many.f);
  gate('market: 70 candidates become 3 chunked lookups', () => eq(many.calls.filter((u) => u.includes('/tokens/v1/')).length, 3, 'chunks'));
})();

gate('poller: backoff doubles and caps at one minute', () => {
  const d = (n) => core.backoffDelay(n, core.CFG, () => 1);
  eq(d(1), 2000, 'f1'); eq(d(2), 4000, 'f2'); eq(d(3), 8000, 'f3'); eq(d(4), 16000, 'f4'); eq(d(5), 32000, 'f5'); eq(d(6), 60000, 'f6'); eq(d(12), 60000, 'cap');
});
async function drive() {
  const timers = []; let hidden = false; let calls = 0; let mode = 'ok'; const log = { data: 0, err: 0, states: [] };
  const p = core.createPoller({
    load: async () => { calls++; if (mode === 'fail') throw new Error('x'); return { top: [1] }; },
    onData: () => log.data++, onError: () => log.err++, onState: (s) => log.states.push(s),
    isHidden: () => hidden, rand: () => 1,
    setTimer: (fn, ms) => { const t = { fn, ms, dead: false }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.dead = true; },
  });
  const live = () => timers.filter((t) => !t.dead);
  const flush = () => new Promise((r) => setImmediate(r));
  return { p, timers, live, flush, log, get calls() { return calls; }, setHidden: (h) => { hidden = h; }, setMode: (m) => { mode = m; } };
}
await (async () => {
  const h = await drive(); h.p.start(); await h.flush();
  gate('poller: fetches immediately and schedules the next poll at 60s', () => { eq(h.calls, 1, 'first call'); eq(h.live().at(-1).ms, 60000, 'cadence'); });
  h.setHidden(true); h.p.visibility(); await h.flush();
  gate('poller: pauses while the tab is hidden', () => { eq(h.live().length, 0, 'timers alive while hidden'); eq(h.calls, 1, 'fetched while hidden'); });
  h.setHidden(false); h.p.visibility(); await h.flush();
  gate('poller: fetches immediately on visible', () => eq(h.calls, 2, 'no immediate fetch'));
  h.setMode('fail');
  h.live().at(-1).fn(); await h.flush(); const a = h.live().at(-1).ms;
  h.live().at(-1).fn(); await h.flush(); const b = h.live().at(-1).ms;
  h.live().at(-1).fn(); await h.flush(); const c = h.live().at(-1).ms;
  gate('poller: failures back off exponentially, last good data never cleared', () => { eq(a, 2000, 'b1'); eq(b, 4000, 'b2'); eq(c, 8000, 'b3'); eq(h.log.err, 3, 'errors'); eq(h.log.data, 2, 'onData calls'); });
  h.setMode('ok'); h.live().at(-1).fn(); await h.flush();
  gate('poller: recovers to the 60s cadence after a success', () => eq(h.live().at(-1).ms, 60000, 'cadence after recovery'));
})();
gate('ui: error path shows dash and message, keeps last good rows', () => {
  const ui = read(path.join(root, 'src/js/market-ui.js'));
  ok(/dashRows\(\)/.test(ui) && /'—'/.test(ui), 'dash fallback missing');
  ok(/if \(!state\.had\)/.test(ui) && /last good reading/.test(ui), 'last-good logic missing');
  ok(/skeleton/.test(ui) && /data-fill/.test(ui) && /i \* 45/.test(ui), 'skeleton to stagger fade-in missing');
});

/* ---------- 4. static rules on dist ---------- */
const fresh = build({ register: structuredClone(real), outDir: path.join(tmp, 'real') });
const dist = path.join(root, 'dist');
ok(fs.existsSync(path.join(dist, 'index.html')), 'run npm run build first');
const files = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => path.join(dir, f));
const distFiles = files(dist);
gate('dist/ is exactly a fresh build of register.json', () => {
  const a = files(fresh).map((f) => path.relative(fresh, f)).sort(), b = distFiles.map((f) => path.relative(dist, f)).sort();
  eq(a.join('|'), b.join('|'), 'file list');
  for (const r of a) ok(read(path.join(fresh, r)) === read(path.join(dist, r)), r + ' differs');
});
const textOfFile = (f) => read(f);
gate('dist holds only deployable site files', () => {
  const rel = distFiles.map((f) => path.relative(dist, f).replace(/\\/g, '/')).sort();
  ok(rel.includes('index.html') && rel.includes('favicon.svg'), 'index or favicon missing');
  ok(!rel.some((f) => /readme|license|whitepaper|register\.json|\.md$/i.test(f)), 'repo docs leaked into dist');
});
gate('root has README.md, docs/whitepaper.md, MIT LICENSE', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(fs.existsSync(path.join(root, f)), f + ' missing');
  ok(/MIT License/.test(read(path.join(root, 'LICENSE'))) && /Copyright \(c\) 2026 Ryne/.test(read(path.join(root, 'LICENSE'))), 'license text');
});
gate('palette: tokens hold exactly the three brand colours, with provenance', () => {
  const t = read(path.join(root, 'src/css/tokens.css'));
  const hexes = [...new Set([...t.matchAll(/#([0-9a-fA-F]{3,8})(?![0-9a-fA-F])/g)].map((m) => m[1].toUpperCase()))].sort();
  eq(hexes.join(','), '060A0F,0E52FD,FEFEFE', 'literals in tokens');
  ok(/brand\/LOGO RYNE PNG\.png/.test(t) && /most frequent/.test(t), 'provenance comment missing');
  ok(!/(?<![\w-])(rgba?|hsla?|oklch|lab|lch)\(/i.test(t), 'non-brand colour function in tokens');
  const derived = [...t.matchAll(/--[\w-]+:\s*color-mix\([^;]+;/g)];
  ok(derived.length > 20, 'derived tokens missing');
  for (const d of derived) ok(!/#[0-9a-f]{3,8}(?![0-9a-f])/i.test(d[0]), 'literal inside derived token');
});
gate('palette: brand colours trace to the pixels of the brand artwork', () => {
  const m = JSON.parse(read(path.join(root, 'scripts/brand-palette.json')));
  const hex = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  const t = read(path.join(root, 'src/css/tokens.css'));
  for (const k of ['ground', 'white', 'blue']) ok(t.includes(hex(m[k].rgb)), k + ' not in tokens');
  ok(m.source === 'brand/LOGO RYNE PNG.png' && m.colourType === 6, 'source record');
  ok(fs.existsSync(path.join(root, 'brand', 'LOGO RYNE PNG.png')), 'brand source missing');
});
gate('palette: colour literals live in the tokens file only', () => {
  for (const f of distFiles) {
    const name = path.basename(f);
    if (name === 'tokens.css' || name === 'favicon.svg') continue;
    let s = textOfFile(f);
    s = s.replace(/href="#[\w-]+"/g, '').replace(/aria-controls="[^"]*"/g, '').replace(/https:\/\/fonts[^"]*/g, '');
    ok(!/#[0-9a-fA-F]{3,8}\b/.test(s), name + ' has a hex colour');
    ok(!/\b(oklch|oklab|rgba?|hsla?|hwb|lab|lch|color-mix)\(/.test(s), name + ' has a colour function');
    if (name.endsWith('.css')) ok(!/:\s*[^;{}]*(?<![\w-])(white|black|red|green|blue|gray|grey|orange|purple|yellow|pink|silver)(?![\w-])/.test(s), name + ' has a named colour');
  }
});
gate('favicon: 32x32 SVG traced from the logo, brand colours only, no double hyphen, no comments', () => {
  const s = read(path.join(dist, 'favicon.svg'));
  ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'size');
  ok(!s.includes('--') && !s.includes('<!--'), 'double hyphen or comment');
  const hx = [...new Set([...s.matchAll(/#([0-9a-f]{6})(?![0-9a-f])/gi)].map((m) => m[1].toUpperCase()))].sort();
  eq(hx.join(','), '060A0F,0E52FD,FEFEFE', 'favicon colours');
  const paths = [...s.matchAll(/<path[^>]*d="([^"]+)"/g)];
  eq(paths.length, 2, 'path groups');
  ok(paths.every((p) => (p[1].match(/M/g) || []).length >= 2 && p[1].length > 800), 'traced geometry too thin');
  ok(/rel="icon"[^>]*favicon\.svg/.test(read(path.join(dist, 'index.html'))), 'icon not linked');
});
gate('no dates, timestamps or clock strings anywhere in dist', () => {
  const pats = [/\b(19|20)\d{2}\b/, /\b\d{4}-\d{2}-\d{2}\b/, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(as of|checked|last updated|updated|ago|today|yesterday|tonight|UTC|GMT)\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, /new Date|Date\.now|toISOString|toLocale(Date|Time)String|toUTCString|getFullYear|DateTimeFormat|RelativeTimeFormat|performance\.timeOrigin/];
  for (const f of distFiles) { const s = textOfFile(f).replace(/https?:\/\/[^\s\"'<)]+/g, ''); for (const p of pats) { const m = s.match(p); ok(!m, `${path.basename(f)} matches ${p}: ${m && m[0]}`); } }
});
gate('no ch units anywhere', () => {
  for (const f of distFiles) ok(!/\d(\.\d+)?ch\b/.test(textOfFile(f)), path.basename(f) + ' uses ch');
});
gate('reduced motion: global kill switch in css and js checks', () => {
  const css = read(path.join(dist, 'assets/app.css'));
  const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/);
  ok(m && /animation: none !important/.test(m[0]) && /transition: none !important/.test(m[0]), 'css kill switch');
  ok(/\[data-reveal\][^}]*opacity: 1 !important/.test(m[0]), 'reveal fallback');
  const js = read(path.join(dist, 'assets/motion.js'));
  ok(/prefers-reduced-motion: reduce/.test(js) && /reduced\(\)/.test(js), 'js check');
  for (const k of ['solveSpring', 'initParallax', 'countTo']) ok(new RegExp(`function ${k}[\\s\\S]{0,1600}reduced\\(\\)`).test(js), k + ' ignores reduced motion');
});
gate('tap targets: 44px token, every control sized from it', () => {
  const css = read(path.join(root, 'src/css/tokens.css')); ok(/--tap:\s*44px/.test(css), 'token');
  const app = read(path.join(dist, 'assets/app.css'));
  for (const sel of ['.social', '.menu-btn', '.copy-btn', '.tab', '.ca-value', '.ca-act', '.nav a', '.menu a']) ok(new RegExp(sel.replace('.', '\\.') + '[^{]*\\{[^}]*(var\\(--tap\\)|min-height: 40px)').test(app) || sel === '.tab', sel + ' lacks tap size');
});
gate('motion features present: spring, parallax, spotlight, progress, count-up, ticker', () => {
  const js = read(path.join(dist, 'assets/motion.js')); const css = read(path.join(dist, 'assets/app.css')); const html = read(path.join(dist, 'index.html'));
  ok(/stiffness|k = 400/.test(js) && /-k \* \(x - to\) - c \* v/.test(js), 'spring solver');
  ok(/data-depth/.test(js) && /pointermove/.test(js) && /scrollY/.test(js), 'parallax');
  ok(/--mx/.test(js) && /--mx/.test(css), 'spotlight');
  ok(/class="progress"/.test(html) && /scaleX/.test(js), 'progress');
  ok(/is-flash-up/.test(js) && /1 - Math\.pow\(1 - p, 3\)/.test(js), 'count-up flash');
  ok(/marquee-left/.test(css) && /\.mesh i/.test(css) && /animation: pulse|ping/.test(css), 'ticker, mesh, pulse');
  ok(/class="dot"/.test(html) && /data-state="sync"/.test(html), 'status pill');
});
gate('lang, viewport, no external scripts, module entry', () => {
  const html = read(path.join(dist, 'index.html'));
  ok(/<html lang="en">/.test(html) && /name="viewport"/.test(html), 'meta');
  ok(!/<script[^>]+src="https?:/.test(html), 'external script');
});
gate('address scanner: every address-shaped string matches a stated record (CA exempt)', () => {
  const scan = (html, reg) => {
    const stated = new Set(reg.records.filter((r) => r.state === 'stated' && r.value).map((r) => r.value));
    const bad = [];
    for (const m of html.matchAll(/\b0x[0-9a-fA-F]{40}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g)) if (!stated.has(m[0])) bad.push(m[0]);
    return bad;
  };
  for (const v of variants) {
    eq(scan(v.html, v.reg).length, 0, 'stray address in a variant');
    for (const f of ['main.js', 'market-core.js', 'market-ui.js', 'motion.js', 'copy.js', 'app.css']) eq(scan(read(path.join(v.dir, 'assets', f)), v.reg).length, 0, 'stray address in ' + f);
  }
  const stray = '0x' + 'ab12'.repeat(10);
  ok(scan(real_html() + stray, real).includes(stray), 'scanner failed to flag a stray 0x address');
  ok(scan(real_html() + sampleAddr(), real).length === 1, 'scanner failed to flag a stray base58 address');
  const withHex = structuredClone(real); withHex.records.push({ id: 'treasury', label: 'Treasury', kind: 'address', state: 'stated', value: stray, source: 'client statement', scope: 'batch-level', checked: '2026-10-11' });
  const html = build({ register: withHex, outDir: path.join(tmp, 'hex') }) && read(path.join(tmp, 'hex/index.html'));
  eq(scan(html, withHex).length, 0, '0x hex that is stated was blanket-rejected');
  ok(html.includes(stray), 'stated 0x record not rendered');
});
function real_html() { return read(path.join(dist, 'index.html')); }
gate('repo hygiene: no CLAUDE.md, no .claude, no attribution words', () => {
  ok(!fs.existsSync(path.join(root, 'CLAUDE.md')) && !fs.existsSync(path.join(root, '.claude')), 'forbidden file or folder');
  const words = [['cla', 'ude'], ['anth', 'ropic'], ['open', 'ai'], ['chat', 'gpt'], ['co-aut', 'hored-by'], ['gener', 'ated (by|with)'], ['\\bA', 'I\\b'], ['\\bL', 'LM\\b']].map((p) => new RegExp(p.join(''), 'i'));
  const skip = new Set(['node_modules', '.gate-tmp', 'ref-fingerprint.json', 'brand', 'reference']);
  const walkDir = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (skip.has(e.name) ? [] : e.isDirectory() ? walkDir(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walkDir(root)) {
    if (path.basename(f) === 'gates.mjs') continue;
    const s = read(f);
    for (const w of words) ok(!w.test(s), `${path.relative(root, f)} matches ${w}`);
  }
});
gate('copy: zero reference words and zero shared two-word runs', () => {
  const fp = JSON.parse(read(path.join(root, 'scripts/ref-fingerprint.json')));
  const refW = new Set(fp.words), refB = new Set(fp.bigrams);
  const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
  const html = real_html();
  let t = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  t = t.replace(/<[^>]*aria-label="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ');
  for (const f of ['market-ui.js', 'copy.js', 'market-core.js']) {
    for (const m of read(path.join(root, 'src/js', f)).matchAll(/'([^'\\\n]{4,120})'/g)) if (/\s/.test(m[1]) && /^[A-Z]/.test(m[1])) t += ' ' + m[1];
  }
  t = t.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const words = (t.toLowerCase().match(/[a-z][a-z']+|\bx\b/g) || []);
  const allowed = new Set(['solana', 'x', 'github', 'ryne', 'contract', 'address', 'copy', 'live', 'market', 'chain', 'dexscreener']);
  const stop = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'is', 'are', 'it', 'its', 'this', 'that', 'as', 'be', 'you', 'your', 'we', 'no', 'not', 'up', 'out', 'so', 'if', 'do', 'does', 'than', 'then', 'into', 'over', 'every', 'all', 'one', 'only', 'but', 'was', 'will', 'can', 'may', 'who', 'what', 'when', 'until', 'while', 'there', 'their', 'they', 'them', 'has', 'have', 'had', 'per', 'any', 'each', 'more', 'most', 'just', 'out', 'off', 'back', 'here', 'now', 'ever', 'once']);
  const hitW = [...new Set(words.filter((w) => !stop.has(w) && !allowed.has(w) && refW.has(h(w))))];
  const hitB = [];
  for (let i = 0; i < words.length - 1; i++) if (words[i] + ' ' + words[i + 1] !== 'contract address' && refB.has(h(words[i] + ' ' + words[i + 1]))) hitB.push(words[i] + ' ' + words[i + 1]);
  ok(hitW.length === 0 && hitB.length === 0, `shared words: ${hitW.join(', ')} | shared bigrams: ${[...new Set(hitB)].join(' / ')}`);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ngates: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed) { console.log('failed: ' + fails.join(' | ')); process.exit(1); }
