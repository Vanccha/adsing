// Plan yardımcıları: kuyruktaki aksiyonlar için sonraki kimlikleri tahmin eder (kampanya > reklam grubu > anahtar kelime).
import type { Action, GameState } from '@engine/core/types';

/** Google için sonraki kimlik sayacı: motor tek sayaçtan gc/ag/kw üretir. */
export function nextGoogleCounter(s: GameState, queue: readonly Action[]): number {
  let n = s.google.nextId;
  for (const a of queue) {
    if (a.type === 'gads.create_campaign' || a.type === 'gads.add_adgroup') n += 1;
    else if (a.type === 'gads.add_keywords') n += a.params.keywords.length;
  }
  return n;
}

export function nextMetaCounter(s: GameState, queue: readonly Action[]): number {
  return s.meta.nextId + queue.filter((a) => a.type === 'meta.create_adset').length;
}

export interface SetupChoices {
  tracking: boolean;
  lp: boolean;
  google: boolean;
  meta: boolean;
  local: boolean;
  geo: boolean;
}

export function googleStarter(s: GameState, queue: readonly Action[], o: { budget: number; type?: 'search' | 'pmax'; name?: string; lpId?: string; offerId?: string; creativeId?: string; strategy?: 'manual' | 'maxClicks' | 'maxConversions' | 'tcpa'; tcpaTarget?: number; manualBid?: number }): Action[] {
  const n = nextGoogleCounter(s, queue);
  const campaignId = `gc${n}`;
  const adGroupId = `ag${n + 1}`;
  const lpId = o.lpId ?? s.assets.lps[0]!.id;
  const offerId = o.offerId ?? s.assets.offers[0]!.id;
  const creativeId = o.creativeId ?? s.assets.creatives.find((c) => c.channel === 'google')!.id;
  const strategy = o.strategy ?? 'manual';
  const out: Action[] = [{ type: 'gads.create_campaign', params: { ...(o.name ? { name: o.name } : {}), type: o.type ?? 'search', dailyBudget: o.budget, strategy, ...(o.manualBid && strategy === 'manual' ? { manualBid: o.manualBid } : {}), ...(o.tcpaTarget ? { tcpaTarget: o.tcpaTarget } : {}), lpId, offerId } }];
  if ((o.type ?? 'search') === 'search') {
    out.push({ type: 'gads.add_adgroup', params: { campaignId, creativeId } });
    out.push({ type: 'gads.add_keywords', params: { campaignId, adGroupId, keywords: [{ theme: 'core', match: 'phrase' }, { theme: 'core', match: 'exact' }, { theme: 'brand', match: 'exact' }] } });
  }
  return out;
}

export function metaStarter(s: GameState, o: { budget: number; audience?: 'interest' | 'lookalike' | 'advantage' | 'broad'; objective?: 'leads' | 'messages'; name?: string }): Action[] {
  const cr = s.assets.creatives.find((c) => c.channel === 'meta')!;
  return [{ type: 'meta.create_adset', params: { ...(o.name ? { name: o.name } : {}), objective: o.objective ?? 'leads', audience: o.audience ?? 'interest', dailyBudget: o.budget, creativeIds: [cr.id], lpId: s.assets.lps[0]!.id, offerId: s.assets.offers[0]!.id } }];
}

/** Başlangıç ekranında seçilen hazırlık ve kanallar -> ilk günün aksiyon kuyruğu. */
export function setupActions(s: GameState, c: SetupChoices): Action[] {
  const q: Action[] = [];
  if (c.tracking) q.push({ type: 'track.fix', params: { level: 'basic' } });
  if (c.lp) q.push({ type: 'asset.create_lp', params: {} });
  const price = s.product.price;
  if (c.local) {
    q.push({ type: 'local.optimize_gbp', params: { hours: 2 } });
  }
  if (c.google) q.push(...googleStarter(s, q, { budget: Math.round(price) }));
  if (c.meta) q.push(...metaStarter(s, { budget: Math.round(price * 0.5) }));
  if (c.geo) q.push({ type: 'geo.invest', params: { hours: 2 } });
  return q;
}
