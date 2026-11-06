import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const load = (l: string) => JSON.parse(readFileSync(join(ROOT, 'locales/ui', `${l}.json`), 'utf8')) as Record<string, string>;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

describe('i18n', () => {
  const tr = load('tr');
  const en = load('en');
  it('TR ve EN aynı anahtar kümesine sahip', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });
  it('boş çeviri yok (act.* hariç değil, hepsi dolu)', () => {
    for (const [k, v] of Object.entries(tr)) expect(v.length, `tr ${k}`).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(en)) expect(v.length, `en ${k}`).toBeGreaterThan(0);
  });
  it('kaynakta kullanılan statik anahtarların hepsi tanımlı', () => {
    const used = new Set<string>();
    for (const f of walk(join(ROOT, 'ui'))) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
      for (const m of s.matchAll(/\b(?:k|label|title)="([a-z]+\.[a-zA-Z0-9_.]+)"/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => !(k in tr));
    expect(missing).toEqual([]);
  });
  it('oyuncunun her motor aksiyonuna arayüzden erişimi var', async () => {
    const { ACTION_TYPES } = await import('@engine/core');
    const src = walk(join(ROOT, 'ui')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(ACTION_TYPES.filter((a) => !src.includes(`'${a}'`))).toEqual([]);
  });
  it('motor aksiyon tipleri için etiket var', async () => {
    const { ACTION_TYPES } = await import('@engine/core');
    const missing = ACTION_TYPES.filter((t) => !(`act.${t}` in tr));
    expect(missing).toEqual([]);
  });
});
