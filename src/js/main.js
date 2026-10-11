import { initProgress, initReveal, initParallax, initSpotlight, initMenu, initTabs, bars } from './motion.js';
import { initCa } from './copy.js';
import { initMarket } from './market-ui.js';

function boot() {
  let reg = { records: [] };
  try { reg = JSON.parse(document.getElementById('register').textContent); } catch { /* keep empty */ }
  const market = reg.records.find((r) => r.id === 'market-source');

  initProgress();
  initReveal();
  initParallax();
  initSpotlight();
  initMenu();
  bars();
  initCa();
  const ledger = document.querySelector('[data-ledger-tabs]');
  if (ledger) initTabs(ledger);
  initMarket(market);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
