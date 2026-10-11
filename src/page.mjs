import { LOGO } from './logo.mjs';

/* Static page renderer. State-driven pieces read the register at render time. */

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="logo-bg" width="32" height="32" rx="7"/>${LOGO.white.map((d) => `<path class="logo-w" d="${d}"/>`).join('')}${LOGO.blue.map((d) => `<path class="logo-b" d="${d}"/>`).join('')}</svg>`;

const rec = (reg, id) => reg.records.find((r) => r.id === id);
const isStated = (r) => !!r && r.state === 'stated';
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
function handleOf(r) {
  try {
    const parts = new URL(r.url).pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    return r.id === 'x' ? '@' + parts[0] : parts.slice(0, 2).join('/');
  } catch { return ''; }
}

function caSlot(reg) {
  const r = rec(reg, 'ca');
  const label = esc(r.label);
  if (isStated(r)) {
    const v = esc(r.value);
    return `<section class="ca" data-record="ca" data-state="stated" aria-label="${label}">
  <span class="ca-label">${label}</span>
  <button type="button" class="ca-value" data-copy="${v}" aria-label="Copy contract address">${v}</button>
  <button type="button" class="ca-act" data-copy="${v}" aria-label="Copy contract address">${ICON.copy.replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')}<span data-copy-label>Copy</span></button>
</section>`;
  }
  return `<section class="ca" data-record="ca" data-state="${esc(r.state)}" aria-label="${label}">
  <span class="ca-label">${label}</span>
  <div class="ca-value" aria-disabled="true">pending</div>
</section>`;
}

function social(reg, id, icon) {
  const r = rec(reg, id);
  if (isStated(r)) {
    return `<a class="social" data-record="${id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(r.label)} ${esc(handleOf(r))}">${icon}</a>`;
  }
  return `<span class="social" data-record="${id}" data-state="${esc(r.state)}" role="img" aria-disabled="true" aria-label="${esc(r.label)}, pending" title="pending">${icon}</span>`;
}

function recordCard(r, i) {
  const state = esc(r.state);
  let val = '';
  if (isStated(r)) {
    if (r.kind === 'social') val = `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(handleOf(r))}</a>`;
    else if (r.kind === 'chain') val = `${esc(r.value)}<br><span class="dim">${esc(hostOf(r.url))}</span>`;
    else if (r.kind === 'feed') val = `${esc(r.value)}<br><span class="dim">${esc(hostOf(r.url))}</span>`;
    else val = esc(r.value);
  } else val = 'pending';
  const note = isStated(r) ? `Basis: ${esc(r.source)}` : 'Silent until stated.';
  return `<li class="rec" data-record-card="${esc(r.id)}" data-state="${state}" data-spot data-reveal data-step="${i}">
  <div class="rec-top"><span class="rec-name">${esc(r.label)}</span><span class="rec-state">${isStated(r) ? 'stated' : 'pending'}</span></div>
  <div class="rec-val">${val}</div>
  <div class="rec-note">${note}</div>
</li>`;
}

function skelRows(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<div class="row skeleton" aria-hidden="true"><div class="rank"><span class="skel" style="width:16px"></span></div><div class="cell-a"><span class="skel round"></span><div class="t"><span class="skel" style="width:72px;display:block"></span><span class="skel" style="width:112px;display:block;margin-top:6px"></span></div></div><div class="c-price" data-label="Price"><span class="skel" style="width:72px"></span></div><div class="c-chg" data-label="24h"><span class="skel" style="width:64px"></span></div><div class="c-vol" data-label="Volume"><span class="skel" style="width:64px"></span></div><div class="c-liq" data-label="Liquidity"><span class="skel" style="width:64px"></span></div><div class="c-copy"><span class="skel round" style="width:44px;height:44px"></span></div></div>`;
  }
  return out;
}

function skelTicker() {
  let one = '';
  for (let i = 0; i < 8; i++) one += '<span class="tk"><span class="skel round" style="width:24px;height:24px"></span><span class="skel"></span></span>';
  return one + one;
}

const miniSkel = '<div class="mini"><span class="skel" style="width:56px"></span><span class="skel" style="width:48px"></span></div>'.repeat(3);
const listSkel = '<div class="li"><span class="skel round" style="width:32px;height:32px"></span><span class="skel" style="width:96px"></span></div>'.repeat(3);

export function renderPage(reg) {
  const market = rec(reg, 'market-source');
  const chain = rec(reg, 'chain');
  const shipped = JSON.stringify({ schema: reg.schema, records: reg.records.map(({ checked, ...rest }) => rest) }).replace(/</g, '\\u003c');

  const footRec = (id, label) => {
    const r = rec(reg, id);
    if (isStated(r)) return `<li data-record-foot="${id}" data-state="stated"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${esc(handleOf(r))}</a></li>`;
    return `<li data-record-foot="${id}" data-state="${esc(r.state)}"><span aria-disabled="true">${esc(label)} · pending</span></li>`;
  };
  const caR = rec(reg, 'ca');
  const footCa = isStated(caR)
    ? `<div class="foot-ca" data-record-foot="ca" data-state="stated"><span class="kicker">${esc(caR.label)}</span><span class="mono">${esc(caR.value)}</span></div>`
    : `<div class="foot-ca" data-record-foot="ca" data-state="${esc(caR.state)}"><span class="kicker">${esc(caR.label)}</span><span class="dim">pending</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ryne | A quiet board for Solana</title>
<meta name="description" content="Ryne ranks the noisiest Solana coins by what actually traded and keeps the numbers moving.">
<meta property="og:title" content="Ryne">
<meta property="og:description" content="A quiet board for the noisiest Solana coins.">
<meta property="og:type" content="website">
<meta name="color-scheme" content="light">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=DM+Sans:wght@400;500;700&family=Geist+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="assets/app.css">
<script>document.documentElement.classList.add('js')</script>
<script type="application/json" id="register">${shipped}</script>
<script type="module" src="assets/main.js"></script>
</head>
<body>
<div class="progress" aria-hidden="true"><i></i></div>
<div id="live" class="sr" role="status" aria-live="polite"></div>

<div class="top" data-scrolled="false">
<div class="top-in">
${caSlot(reg)}
<header class="bar">
  <button type="button" class="menu-btn" aria-label="Reveal navigation" aria-expanded="false" aria-controls="menu">${ICON.menu}</button>
  <a class="brand" href="#top" aria-label="Ryne, back to start">${MARK}<span class="brand-word">ryne</span></a>
  <nav class="nav" aria-label="Section links">
    <a href="#board">Board</a><a href="#method">Method</a><a href="#register">Register</a><a href="#supply">Supply</a>
  </nav>
  <div class="bar-end">
    <span class="pill bar-pill" data-status data-state="sync"><span class="dot"></span><span data-status-text>Syncing</span></span>
    ${social(reg, 'x', ICON.x)}
    ${social(reg, 'github', ICON.github)}
  </div>
  <nav id="menu" class="menu" data-open="false" aria-label="Section links, compact">
    <a href="#board">Board</a><a href="#method">Method</a><a href="#register">Register</a><a href="#supply">Supply</a>
  </nav>
</header>
</div>
</div>

<main id="top">
<section class="hero">
  <div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div>
  <div>
    <div class="eyebrow" data-reveal><span class="pill" data-status data-state="sync"><span class="dot"></span><span data-status-text>Syncing</span></span></div>
    <h1 class="h1" data-reveal data-step="1">Solana’s noisiest coins, sorted into <span class="accent">a single quiet board.</span></h1>
    <p class="lede" data-reveal data-step="2">Ryne tracks coins carrying a sponsored boost within Solana, then orders them by what truly traded over the last twenty-four hours. Prices, depth and swings arrive without any refresh.</p>
    <div class="hero-cta" data-reveal data-step="3">
      <a class="btn btn-ink" href="#board">Open the board ${ICON.down}</a>
      <a class="btn" href="#method">Explore the method</a>
    </div>
  </div>
  <div class="stage" data-parallax data-market data-reveal data-step="2">
    <div class="layer" data-depth="0.5">
      <div class="card deck" data-spot>
        <div class="deck-head"><span class="kicker">Front runner</span><span class="pill" data-status data-state="sync"><span class="dot"></span><span data-status-text>Syncing</span></span></div>
        <div class="lead-row">
          <div data-lead-logo><span class="skel round"></span></div>
          <div class="grow"><div class="lead-sym"><span class="skel" data-lead-sym style="width:84px;height:22px"></span></div><div class="lead-name"><span class="skel" data-lead-name style="width:132px"></span></div></div>
          <div><div class="lead-price"><span class="skel" data-lead-price style="width:88px"></span></div><div style="text-align:right;margin-top:4px" data-lead-delta></div></div>
        </div>
        <div class="meter"><div class="meter-top"><span>Slice among ten</span><b><span class="skel" data-meter-v="share" style="width:36px"></span></b></div><div class="meter-track"><div class="meter-fill" data-meter="share"></div></div></div>
        <div class="meter"><div class="meter-top"><span>Depth against turnover</span><b><span class="skel" data-meter-v="cover" style="width:36px"></span></b></div><div class="meter-track"><div class="meter-fill" data-meter="cover"></div></div></div>
      </div>
    </div>
    <div class="layer chip-float cf-1" data-depth="1.1"><span class="kicker">Climber</span><b><span class="skel" data-chip="climber" style="width:84px"></span></b></div>
    <div class="layer chip-float cf-2" data-depth="-0.8"><span class="kicker">Deepest</span><b><span class="skel" data-chip="deep" style="width:84px"></span></b></div>
    <div class="layer chip-float cf-3" data-depth="0.8"><span class="kicker">Ten-coin turnover</span><b><span class="skel" data-chip="total" style="width:64px"></span></b></div>
  </div>
</section>

<div class="ticker" data-market role="region" aria-label="Live ticker">
  <div class="ticker-track" data-ticker-track>${skelTicker()}</div>
</div>

<section class="tiles" data-market data-stagger>
  <div class="card tile" data-spot data-reveal data-step="0"><span class="kicker">Boosted, Solana only</span><span class="tile-v"><span class="skel" data-tile-v="tracked" style="width:72px;height:32px"></span></span><span class="tile-s">Entries found in the latest list.</span></div>
  <div class="card tile" data-spot data-reveal data-step="1"><span class="kicker">Ten-coin turnover</span><span class="tile-v"><span class="skel" data-tile-v="volume" style="width:120px;height:32px"></span></span><span class="tile-s">Combined volume on the board.</span></div>
  <div class="card tile" data-spot data-reveal data-step="2"><span class="kicker">Refresh rhythm</span><span class="tile-v">60 s</span><span class="tile-s">It rests whenever the tab is out of sight.</span></div>
</section>

<section class="block" id="method">
  <div class="block-head" data-reveal><span class="kicker">Method</span><h2 class="h2" style="margin-top:12px">From noisy feed to quiet board.</h2><p class="lede">The pipeline is short, and each stage stays in plain sight.</p></div>
  <div class="steps">
    <article class="card step" data-spot data-reveal data-step="0">
      <span class="step-n">01</span>
      <div class="panel" aria-hidden="true">
        <div class="mini"><b>Boost list</b><span class="dim">pulled</span></div><div class="arrow">${ICON.down}</div>
        <div class="mini"><b>Solana only</b><span class="dim">filtered</span></div><div class="arrow">${ICON.down}</div>
        <div class="mini"><b>Pair lookup</b><span class="dim">paired</span></div>
      </div>
      <div><h3 class="h3">Gather</h3><p class="muted" style="margin-top:8px">Start with the boosted list, drop whatever sits outside Solana, then look up the trading pairs for each survivor.</p></div>
    </article>
    <article class="card step" data-spot data-reveal data-step="1">
      <span class="step-n">02</span>
      <div class="panel" aria-hidden="true">
        <div class="bar-row"><span>A</span><div class="meter-track"><div class="meter-fill anim-bar" style="--v:1"></div></div></div>
        <div class="bar-row"><span>B</span><div class="meter-track"><div class="meter-fill anim-bar" style="--v:0.72"></div></div></div>
        <div class="bar-row"><span>C</span><div class="meter-track"><div class="meter-fill anim-bar" style="--v:0.46"></div></div></div>
        <div class="bar-row"><span>D</span><div class="meter-track"><div class="meter-fill anim-bar" style="--v:0.28"></div></div></div>
      </div>
      <div><h3 class="h3">Rank</h3><p class="muted" style="margin-top:8px">Keep the deepest pair per coin, then sort by turnover over twenty-four hours. Ten earn a seat.</p></div>
    </article>
    <article class="card step" data-spot data-market data-reveal data-step="2">
      <span class="step-n">03</span>
      <div class="panel" data-step-live>${miniSkel}</div>
      <div><h3 class="h3">Watch</h3><p class="muted" style="margin-top:8px">Figures tick in place and flash whenever they shift. Sixty seconds later, the board redraws itself.</p></div>
    </article>
  </div>
</section>

<section class="block" id="register">
  <div class="block-head" data-reveal><span class="kicker">Register</span><h2 class="h2" style="margin-top:12px">Facts, kept on the record.</h2><p class="lede">Each outside fact lives in one record. Until it is stated, its tile stays flat, silent and unlinked.</p></div>
  <ul class="records">
${reg.records.map(recordCard).join('\n')}
  </ul>
</section>

<section class="block" id="supply">
  <div class="ink-panel" data-reveal>
    <span class="kicker">Supply design</span>
    <h2 class="h2" style="margin-top:12px">The supply, carved up.</h2>
    <p class="lede">No cut is final so far. These slots hold their position until one is.</p>
    <div class="ink-grid ink" data-stagger>
      <div class="cell" data-spot data-reveal data-step="0"><span class="kicker">Liquidity</span><span class="cell-v">—%</span><span class="cell-s">Cut pending.</span></div>
      <div class="cell" data-spot data-reveal data-step="1"><span class="kicker">Community</span><span class="cell-v">—%</span><span class="cell-s">Cut pending.</span></div>
      <div class="cell" data-spot data-reveal data-step="2"><span class="kicker">Reserve</span><span class="cell-v">—%</span><span class="cell-s">Cut pending.</span></div>
    </div>
    <div class="ink-split ink">
      <div class="cell" data-spot data-reveal data-step="0"><span class="kicker">Incentives</span><span class="cell-v">—</span><span class="cell-s">Pending.</span></div>
      <div class="cell" data-spot data-reveal data-step="1"><span class="kicker">Retirement</span><span class="cell-v">—</span><span class="cell-s">Pending.</span></div>
    </div>
  </div>
</section>

<section class="block" id="board" data-market>
  <div class="sec-head" data-reveal>
    <div><span class="kicker">The board</span><h2 class="h2" style="margin-top:12px">Ten coins, ranked by turnover.</h2></div>
    <div class="tabs" role="tablist" aria-label="Sort the board" data-board-tabs>
      <button class="tab" role="tab" type="button" data-key="volume" aria-selected="true">Volume</button>
      <button class="tab" role="tab" type="button" data-key="momentum" aria-selected="false">Momentum</button>
      <button class="tab" role="tab" type="button" data-key="depth" aria-selected="false">Depth</button>
    </div>
  </div>
  <div class="card board" data-reveal>
    <div class="row row-h" aria-hidden="true"><div class="rank">#</div><div class="cell-a">Asset</div><div class="c-price">Price</div><div class="c-chg">24h</div><div class="c-vol">Volume</div><div class="c-liq">Liquidity</div><div class="c-copy"></div></div>
    <div class="board-body" data-rows>${skelRows(10)}</div>
    <p class="board-note" data-board-note role="status" hidden></p>
  </div>
  ${isStated(market) ? `<p class="fine" style="margin-top:16px">Figures originate in the public ${esc(market.value)} boost list, restricted to Solana entries.</p>` : ''}
</section>

<section class="block" data-market>
  <div class="trio" data-stagger>
    <div class="card list-card" data-spot data-reveal data-step="0"><h3 class="h3">Climbers</h3><div data-list="climbers">${listSkel}</div></div>
    <div class="card list-card" data-spot data-reveal data-step="1"><h3 class="h3">Sliders</h3><div data-list="sliders">${listSkel}</div></div>
    <div class="card list-card" data-spot data-reveal data-step="2"><h3 class="h3">Deep pairs</h3><div data-list="deep">${listSkel}</div></div>
  </div>
</section>

<section class="block">
  <div class="sec-head" data-reveal>
    <div><span class="kicker">Ledger</span><h2 class="h2" style="margin-top:12px">Empty so far.</h2></div>
    <div class="tabs" role="tablist" aria-label="Filter the ledger" data-ledger-tabs>
      <button class="tab" role="tab" type="button" data-key="all" aria-selected="true">All</button>
      <button class="tab" role="tab" type="button" data-key="in" aria-selected="false">In</button>
      <button class="tab" role="tab" type="button" data-key="out" aria-selected="false">Out</button>
    </div>
  </div>
  <div class="empty" data-reveal><b>Quiet here.</b><span>Entries appear whenever something is booked.</span></div>
</section>

<section class="block">
  <div class="card cta" data-spot data-reveal>
    <h2 class="h2">Keep the board open.</h2>
    <p class="lede">It tidies itself each sixty seconds, so staying put is fine.</p>
    <div class="hero-cta"><a class="btn btn-ink" href="#board">Jump to board</a><a class="btn" href="#method">Explore the method</a></div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="foot-in">
    <div style="display:grid;gap:16px;align-content:start">
      <a class="brand" href="#top" aria-label="Ryne, back to start">${MARK}<span class="brand-word" style="display:inline">ryne</span></a>
      <p class="fine">Live numbers on coins making noise within Solana, drawn from one public market feed.</p>
      ${footCa}
    </div>
    <div class="foot-cols">
      <div><h4>Navigate</h4><ul><li><a href="#board">Board</a></li><li><a href="#method">Method</a></li><li><a href="#register">Register</a></li><li><a href="#supply">Supply</a></li></ul></div>
      <div><h4>Channels</h4><ul>${footRec('x', 'X')}${footRec('github', 'GitHub')}</ul></div>
      <div><h4>Network</h4><ul>${isStated(chain) ? `<li>${esc(chain.value)}</li>` : ''}${isStated(market) ? `<li>${esc(market.value)}</li>` : ''}</ul></div>
    </div>
    <div class="foot-bot" style="grid-column:1/-1">
      <p class="fine">Ryne is an information screen, never an adviser. Numbers are relayed untouched by a public feed and may lag or be wrong. Coins this jumpy can collapse to zero, so weigh each decision yourself.</p>
      <span class="pill" data-status data-state="sync"><span class="dot"></span><span data-status-text>Syncing</span></span>
    </div>
  </div>
</footer>
</body>
</html>
`;
}
