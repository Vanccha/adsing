// Test yardımcıları (fixture ve gerçek veri ile durum kurma).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initState } from '../core/init';
import type { InitOpts } from '../core/init';
import { stepInPlace } from '../core/step';
import type { Action, GameState } from '../core/types';
import { parseParamFile, parseScenarioFile } from '../data/schema';
import type { DataBundle, MarketId } from '../data/schema';
import { fixtureBundle } from './index';

export const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Varsayılan başlangıç: Pazartesi (tam kurucu kapasitesi). Cumartesi için startDate: '2026-10-31'. */
export function fx(seed = 't1', opts: InitOpts = {}, market: 'us' | 'tr' = 'us'): GameState {
  return initState(fixtureBundle(market), seed, { startDate: '2026-11-02', ...opts });
}

export const realDataExists = (): boolean => existsSync(join(REPO, 'markets', 'us.json')) && existsSync(join(REPO, 'data', 'global.json')) && existsSync(join(REPO, 'scenarios', 'salon-saas.json'));

export function realBundle(market: MarketId, scenario = 'salon-saas'): DataBundle {
  const rd = (f: string) => JSON.parse(readFileSync(join(REPO, f), 'utf8')) as unknown;
  return { global: parseParamFile(rd('data/global.json')), market: parseParamFile(rd(`markets/${market}.json`)), scenario: parseScenarioFile(rd(`scenarios/${scenario}.json`)) };
}

/** Aksiyon uygular (tek gün), sonucu döndürür. */
export function doDay(s: GameState, actions: Action[] = []) {
  return stepInPlace(s, actions);
}

export function days(s: GameState, n: number, f?: (s: GameState) => Action[]): void {
  for (let i = 0; i < n && !s.outcome; i++) stepInPlace(s, f ? f(s) : []);
}

/** İlk Google kampanyasını (manuel, phrase core+adjacent) kurar; tek gün adımı yapmadan durumu doğrudan düzenler. */
export function withGoogle(s: GameState, o: { strategy?: 'manual' | 'maxClicks' | 'maxConversions' | 'tcpa'; budget?: number; match?: 'exact' | 'phrase' | 'broad'; tcpa?: number } = {}): string {
  const id = `gc${s.google.nextId++}`;
  const agId = `ag${s.google.nextId++}`;
  const strategy = o.strategy ?? 'manual';
  const cr = s.assets.creatives.find((c) => c.channel === 'google')!;
  s.google.campaigns.push({
    id, name: id, type: 'search', status: 'active', dailyBudget: o.budget ?? 100, strategy, manualBid: (s.params['gads.search.cpc'] as number) * 1.3, tcpaTarget: o.tcpa ?? null,
    lpId: s.assets.lps[0]!.id, offerId: s.assets.offers[0]!.id,
    adGroups: [{ id: agId, name: agId, creativeId: cr.id, keywords: ['core', 'adjacent'].map((theme, i) => ({ id: `kw${s.google.nextId++}`, text: `k${i}`, theme: theme as 'core' | 'adjacent', match: o.match ?? 'phrase', bid: null, status: 'active' as const, relQ: 0.6, stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 } })) }],
    negatives: [], learning: { state: strategy === 'manual' ? 'manual' : 'learning', sinceReset: s.day, resets: 0, convWindow: [] },
    stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 }, last: null, searchTerms: null, termAcc: {}, createdDay: s.day,
  });
  return id;
}

export function withMeta(s: GameState, o: { budget?: number; audience?: 'interest' | 'lookalike' | 'advantage' | 'broad'; creatives?: number } = {}): string {
  const id = `ma${s.meta.nextId++}`;
  const cr = s.assets.creatives.find((c) => c.channel === 'meta')!;
  s.meta.adSets.push({
    id, name: id, objective: 'leads', audience: o.audience ?? 'interest', dailyBudget: o.budget ?? 60,
    ads: Array.from({ length: o.creatives ?? 1 }, () => ({ creativeId: cr.id, impr7: 0 })),
    lpId: s.assets.lps[0]!.id, offerId: s.assets.offers[0]!.id, status: 'active',
    learning: { state: 'active', sinceReset: s.day, resets: 0, events: [] }, stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 }, last: null, createdDay: s.day,
  });
  return id;
}

/** Durumdaki tüm sayıların sonlu olduğunu doğrular; ilk bozuk yolu döndürür. */
export function findBadNumber(x: unknown, path = ''): string | null {
  if (typeof x === 'number') return Number.isFinite(x) ? null : `${path}=${x}`;
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const r = findBadNumber(x[i], `${path}[${i}]`);
      if (r) return r;
    }
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      const r = findBadNumber(v, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}
