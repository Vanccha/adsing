// Veri denetimi: şema, türetilmiş formüller, tazelik (12 ay), kaynaksız ve düşük güvenli sayılar.
// Kullanım: npm run data:audit [-- --today=2026-10-31] [--fixtures] [--strict]
// Çıkış kodu 1: şema/accessed hatası, çözümlenemeyen/döngüsel türetilmiş parametre. Bayat/kaynaksız/düşük güven yalnız raporlanır
// (--strict ile bayat da hataya sayılır).
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ParamFileSchema, ScenarioFileSchema } from '../engine/data/schema';
import type { Param } from '../engine/data/schema';
import { ageMonths, isStale, olderOf, sourceRefDate } from '../engine/data/freshness';
import { evalFormula, formulaIdentifiers } from '../engine/data/expr';
import { listJson, readJson, ROOT } from './lib/bundle';

const args = process.argv.slice(2);
const argVal = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
// Betik sistem saatini okuyabilir (motor okuyamaz); --today ile sabitlenebilir.
const today = argVal('today') ?? new Date().toISOString().slice(0, 10);
const strict = args.includes('--strict');

interface Item {
  file: string;
  param: Param;
}

const errors: string[] = [];
const items: Item[] = [];

function load(dir: string, kind: 'param' | 'scenario') {
  for (const f of listJson(join(ROOT, dir))) {
    const rel = f.slice(ROOT.length + 1);
    if (rel.endsWith('benchmarks.json')) continue; // aralık testi dosyası (param listesi değil)
    const raw = readJson(f);
    const r = kind === 'scenario' ? ScenarioFileSchema.safeParse(raw) : ParamFileSchema.safeParse(raw);
    if (!r.success) {
      for (const i of r.error.issues.slice(0, 8)) errors.push(`${rel}: şema hatası ${i.path.join('.')}: ${i.message}`);
      continue;
    }
    const params = (r.data as { params: Param[] }).params;
    for (const p of params) items.push({ file: rel, param: p });
    // accessed eksikliği şema tarafından da yakalanır; ham veriden ayrıca açık hata:
    const rawParams = (raw as { params?: Array<{ id?: string; source?: { accessed?: string } | null; layer?: string }> }).params ?? [];
    for (const p of rawParams) if (p.layer === 'sourced' && !p.source?.accessed) errors.push(`${rel}: ${p.id}: source.accessed eksik`);
  }
}

if (args.includes('--fixtures')) {
  console.log('Not: --fixtures yalnızca test fixture sürümünü denetler.');
}
load('data', 'param');
load('markets', 'param');
load('scenarios', 'scenario');

if (items.length === 0 && !existsSync(join(ROOT, 'markets'))) {
  console.log('Denetlenecek veri dosyası yok (data/, markets/, scenarios/).');
  process.exit(0);
}

// Türetilmiş parametreler: (dosya, pazar) bağlamında çözülebilir ve döngüsüz mü?
const byKey = new Map<string, Param[]>();
for (const it of items) {
  const arr = byKey.get(it.param.id) ?? [];
  arr.push(it.param);
  byKey.set(it.param.id, arr);
}
function checkDerived(p: Param, file: string, stack: string[]): { ref: string | null } {
  let ref = sourceRefDate(p.source);
  if (stack.includes(p.id)) {
    errors.push(`${file}: ${p.id}: türetilmiş parametrelerde döngü (${[...stack, p.id].join(' > ')})`);
    return { ref };
  }
  if (p.layer !== 'derived') return { ref };
  const vals: Record<string, number> = {};
  for (const inp of p.inputs ?? []) {
    const cands = (byKey.get(inp) ?? []).filter((c) => c.market === p.market || c.market === 'global');
    const c = cands.find((x) => x.market === p.market) ?? cands[0];
    if (!c) {
      errors.push(`${file}: ${p.id}: girdi çözülemiyor: ${inp}`);
      continue;
    }
    const r = checkDerived(c, file, [...stack, p.id]);
    ref = olderOf(ref, r.ref);
    if (typeof c.value === 'number') vals[inp] = c.value;
  }
  if (p.formula && typeof p.value === 'number') {
    try {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      const v = evalFormula(p.formula, (id) => {
        const key = id in vals ? id : (p.inputs ?? [])[letters.indexOf(id)];
        const x = key !== undefined ? vals[key] : undefined;
        if (x === undefined) throw new Error(`formül kimliği çözülemedi: ${id}`);
        return x;
      });
      for (const id of formulaIdentifiers(p.formula)) void id;
      const tol = Math.max(0.02 * Math.abs(p.value), 0.02);
      if (Math.abs(v - p.value) > tol && !(p.range && v >= p.range.min && v <= p.range.max)) {
        console.log(`UYARI ${file}: ${p.id}: formül sonucu ${v.toFixed(4)} ≠ saklanan değer ${p.value}`);
      }
    } catch (e) {
      errors.push(`${file}: ${p.id}: formül hatası: ${(e as Error).message}`);
    }
  }
  return { ref };
}

const stale: string[] = [];
const unsourced: string[] = [];
const lowConf: string[] = [];
const noRange: string[] = [];
let sourced = 0;
let derived = 0;
let assumption = 0;
for (const { file, param: p } of items) {
  const { ref } = checkDerived(p, file, []);
  if (p.layer === 'sourced') sourced++;
  else if (p.layer === 'derived') derived++;
  else assumption++;
  if (ref && isStale(ref, today)) stale.push(`${file}: ${p.id} (${ref}, ${ageMonths(ref, today)} ay)`);
  if (p.layer === 'assumption') {
    unsourced.push(`${file}: ${p.id}`);
    if (!p.range && typeof p.value === 'number') noRange.push(`${file}: ${p.id}`);
  }
  if ((p.confidence ?? (p.layer === 'assumption' ? 'low' : 'medium')) === 'low') lowConf.push(`${file}: ${p.id}`);
}

const show = (title: string, xs: string[], max = 15) => {
  console.log(`\n${title}: ${xs.length}`);
  for (const x of xs.slice(0, max)) console.log(`  - ${x}`);
  if (xs.length > max) console.log(`  ... (+${xs.length - max})`);
};
console.log(`Veri denetimi (bugün=${today}): ${items.length} parametre | kaynaklı ${sourced}, türetilmiş ${derived}, varsayım ${assumption}`);
show('BAYAT (>12 ay)', stale);
show('KAYNAKSIZ (varsayım)', unsourced, 8);
show('Aralıksız varsayım', noRange, 8);
show('DÜŞÜK GÜVEN', lowConf, 8);
show('HATA', errors, 50);
if (errors.length > 0 || (strict && stale.length > 0)) {
  console.error('\ndata:audit BAŞARISIZ');
  process.exit(1);
}
console.log('\ndata:audit tamam');
