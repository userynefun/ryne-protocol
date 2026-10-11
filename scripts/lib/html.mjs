/* Minimal HTML tree for gate checks. Handles the markup this project emits. */
const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'path', 'rect', 'circle']);
const RAW = new Set(['script', 'style']);

function attrsOf(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) out[m[1]] = m[2] === undefined ? '' : m[2];
  return out;
}

export function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [], start: 0, end: src.length, parent: null };
  let cur = root;
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(src))) {
    const [all, close, tag, rest, selfClose] = m;
    const t = tag.toLowerCase();
    if (!close) {
      const node = { tag: t, attrs: attrsOf(rest), children: [], start: m.index, openEnd: m.index + all.length, end: m.index + all.length, parent: cur, text: '' };
      node.text0 = src.slice(last, m.index);
      cur.children.push(node);
      last = m.index + all.length;
      if (VOID.has(t) || selfClose) continue;
      if (RAW.has(t)) {
        const endIdx = src.indexOf('</' + t, last);
        node.raw = src.slice(last, endIdx);
        const close2 = src.indexOf('>', endIdx) + 1;
        node.end = close2; re.lastIndex = close2; last = close2;
        continue;
      }
      cur = node;
    } else {
      let n = cur;
      while (n && n.tag !== t) n = n.parent;
      if (n) { n.end = m.index + all.length; n.innerEnd = m.index; cur = n.parent; }
      last = m.index + all.length;
    }
  }
  return root;
}

export const walk = (n, fn) => { fn(n); n.children.forEach((c) => walk(c, fn)); };
export function findAll(n, pred) { const out = []; walk(n, (x) => { if (x.tag !== '#root' && pred(x)) out.push(x); }); return out; }
export const outer = (src, n) => src.slice(n.start, n.end);
export function textOf(src, n) {
  const inner = src.slice(n.openEnd ?? n.start, n.innerEnd ?? n.end);
  return inner.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
export function anyDesc(n, pred) { let hit = false; walk(n, (x) => { if (x !== n && pred(x)) hit = true; }); return hit; }
