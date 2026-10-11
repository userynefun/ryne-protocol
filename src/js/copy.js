export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/* announce through the shared polite region */
export function say(msg) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = msg; });
}

/* contract address slot: inert unless the register states it */
export function initCa() {
  const slot = document.querySelector('[data-record="ca"]');
  if (!slot || slot.getAttribute('data-state') !== 'stated') return;
  const btns = [...slot.querySelectorAll('[data-copy]')];
  let t = 0;
  const run = async (b) => {
    const ok = await copyText(b.getAttribute('data-copy'));
    slot.setAttribute('data-copied', String(ok));
    const label = slot.querySelector('[data-copy-label]');
    if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
    say(ok ? 'Contract address copied' : 'Copy failed');
    clearTimeout(t);
    t = setTimeout(() => { slot.removeAttribute('data-copied'); if (label) label.textContent = 'Copy'; }, 1800);
  };
  btns.forEach((b) => b.addEventListener('click', () => run(b)));
}
