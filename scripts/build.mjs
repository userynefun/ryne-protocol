import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderPage } from '../src/page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATES = ['stated', 'absent', 'unconfirmed'];
const BASE_KEYS = ['id', 'label', 'kind', 'state', 'source', 'scope', 'checked'];

/* rule 1: an inert record carries no value and no url */
export function validateRegister(reg) {
  if (!reg || !Array.isArray(reg.records)) throw new Error('register: records missing');
  const ids = new Set();
  for (const r of reg.records) {
    if (!r.id || ids.has(r.id)) throw new Error(`register: bad or duplicate id ${r.id}`);
    ids.add(r.id);
    if (!STATES.includes(r.state)) throw new Error(`register: ${r.id} has invalid state ${r.state}`);
    if (r.state !== 'stated') {
      const extra = Object.keys(r).filter((k) => !BASE_KEYS.includes(k));
      if (extra.length) throw new Error(`register: inert record ${r.id} carries ${extra.join(', ')}`);
    } else if (r.kind === 'social' && !r.url) throw new Error(`register: stated social ${r.id} needs a url`);
    else if (r.kind === 'address' && !r.value) throw new Error(`register: stated address ${r.id} needs a value`);
  }
  for (const need of ['ca', 'x', 'github', 'chain', 'market-source']) if (!ids.has(need)) throw new Error(`register: missing ${need}`);
  return reg;
}

function inside(p) {
  const rel = path.relative(root, path.resolve(p));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function build({ register, outDir = path.join(root, 'dist') } = {}) {
  const reg = validateRegister(register || JSON.parse(fs.readFileSync(path.join(root, 'register.json'), 'utf8')));
  if (!inside(outDir)) throw new Error('refusing to write outside the project folder');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), renderPage(reg));
  fs.copyFileSync(path.join(root, 'src/css/tokens.css'), path.join(outDir, 'assets/tokens.css'));
  fs.copyFileSync(path.join(root, 'src/css/app.css'), path.join(outDir, 'assets/app.css'));
  for (const f of fs.readdirSync(path.join(root, 'src/js'))) fs.copyFileSync(path.join(root, 'src/js', f), path.join(outDir, 'assets', f));
  fs.copyFileSync(path.join(root, 'public/favicon.svg'), path.join(outDir, 'favicon.svg'));
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = build();
  console.log('built', path.relative(root, out));
}
