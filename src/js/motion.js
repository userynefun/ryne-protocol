const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;

/* damped spring, fixed-step semi-implicit Euler. unit mass by default. */
export function solveSpring(from, to, { k = 400, c = 30, m = 1, v0 = 0, onUpdate, onDone, precision = 0.001 }) {
  if (reduced()) { onUpdate(to); onDone && onDone(); return () => {}; }
  let x = from, v = v0, last = 0, raf = 0, dead = false;
  const dt = 1 / 240;
  let acc = 0;
  const frame = (t) => {
    if (dead) return;
    if (!last) last = t;
    acc += Math.min(0.064, (t - last) / 1000);
    last = t;
    while (acc >= dt) {
      const a = (-k * (x - to) - c * v) / m;
      v += a * dt;
      x += v * dt;
      acc -= dt;
    }
    if (Math.abs(x - to) < precision && Math.abs(v) < precision) {
      onUpdate(to);
      onDone && onDone();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

/* scroll reveal with stagger. children of [data-stagger] inherit index delay. */
export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (!els.length) return;
  const show = (el, delay) => {
    if (el.classList.contains('shown')) return;
    const run = () => {
      el.classList.add('shown');
      if (reduced()) { el.style.opacity = ''; el.style.transform = ''; return; }
      solveSpring(0, 1, {
        k: 400, c: 32,
        onUpdate: (p) => { el.style.opacity = String(Math.max(0, Math.min(1, p))); el.style.transform = `translate3d(0, ${(1 - p) * 24}px, 0)`; },
        onDone: () => { el.style.opacity = ''; el.style.transform = ''; },
      });
    };
    if (delay > 0 && !reduced()) setTimeout(run, delay); else run();
  };
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('shown')); return; }
  const io = new IntersectionObserver((entries) => {
    const hit = entries.filter((e) => e.isIntersecting);
    hit.forEach((e, i) => {
      const step = Number(e.target.getAttribute('data-step')) || i;
      io.unobserve(e.target);
      show(e.target, 50 * step);
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
  els.forEach((e) => io.observe(e));
}

export function initProgress() {
  const bar = document.querySelector('.progress i');
  const top = document.querySelector('.top');
  if (!bar) return;
  let queued = false;
  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    bar.style.transform = `scaleX(${p})`;
    if (top) top.setAttribute('data-scrolled', String(scrollY > 8));
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener('resize', paint);
  paint();
}

/* hero parallax: pointer + scroll, smoothed by a spring follower. */
export function initParallax() {
  const stage = document.querySelector('[data-parallax]');
  if (!stage) return;
  const layers = [...stage.querySelectorAll('[data-depth]')];
  const mesh = [...document.querySelectorAll('.mesh i')];
  if (reduced()) return;
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0, vx: 0, vy: 0 };
  let sy = 0, raf = 0, running = false;
  const k = 120, c = 18, dt = 1 / 120;
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    target.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    kick();
  };
  const onScroll = () => { sy = Math.min(scrollY, 900); kick(); };
  const step = () => {
    for (let i = 0; i < 2; i++) {
      cur.vx += (-k * (cur.x - target.x) - c * cur.vx) * dt; cur.x += cur.vx * dt;
      cur.vy += (-k * (cur.y - target.y) - c * cur.vy) * dt; cur.y += cur.vy * dt;
    }
    layers.forEach((l) => {
      const d = Number(l.getAttribute('data-depth'));
      l.style.transform = `translate3d(${(cur.x * d * 28).toFixed(2)}px, ${(cur.y * d * 28 - sy * d * 0.22).toFixed(2)}px, 0)`;
    });
    mesh.forEach((m, i) => { m.style.translate = `${(cur.x * (i + 1) * -14).toFixed(1)}px ${(-sy * 0.06 * (i + 1)).toFixed(1)}px`; });
    const settled = Math.abs(cur.x - target.x) < 0.001 && Math.abs(cur.y - target.y) < 0.001 && Math.abs(cur.vx) < 0.001 && Math.abs(cur.vy) < 0.001;
    if (settled) { running = false; return; }
    raf = requestAnimationFrame(step);
  };
  function kick() { if (!running) { running = true; raf = requestAnimationFrame(step); } }
  if (window.matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') onMove(e); }, { passive: true });
    stage.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; kick(); });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

export function initSpotlight() {
  if (reduced()) return;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

/* number count-up with ease-out, flash on change */
const timers = new WeakMap();
export function countTo(el, to, format, { duration = 700, flash = true } = {}) {
  const prev = Number(el.getAttribute('data-num'));
  const has = el.hasAttribute('data-num') && Number.isFinite(prev);
  el.setAttribute('data-num', String(to));
  const stopOld = timers.get(el);
  if (stopOld) stopOld();
  if (has && flash && to !== prev) {
    const cls = to > prev ? 'is-flash-up' : 'is-flash-down';
    el.classList.remove('is-flash-up', 'is-flash-down');
    void el.offsetWidth;
    el.classList.add(cls);
  }
  const from = has ? prev : 0;
  if (reduced() || from === to) { el.textContent = format(to); return; }
  let start = 0, raf = 0, dead = false;
  const frame = (t) => {
    if (dead) return;
    if (!start) start = t;
    const p = Math.min(1, (t - start) / duration);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * e);
    if (p < 1) raf = requestAnimationFrame(frame); else el.textContent = format(to);
  };
  raf = requestAnimationFrame(frame);
  timers.set(el, () => { dead = true; cancelAnimationFrame(raf); });
}

export function initTabs(root, onChange) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (t, focus) => {
    tabs.forEach((x) => { x.setAttribute('aria-selected', String(x === t)); x.tabIndex = x === t ? 0 : -1; });
    if (focus) t.focus();
    onChange && onChange(t.getAttribute('data-key'), t);
  };
  tabs.forEach((t, i) => {
    t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length], true); }
    });
  });
}

export function initMenu() {
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('menu');
  if (!btn || !menu) return;
  const set = (open) => { menu.setAttribute('data-open', String(open)); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(menu.getAttribute('data-open') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

export function bars() {
  const els = [...document.querySelectorAll('.meter-fill, .anim-bar')];
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.setAttribute('data-on', 'true')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.setAttribute('data-on', 'true'); io.unobserve(e.target); } }), { threshold: 0.2 });
  els.forEach((e) => io.observe(e));
}
