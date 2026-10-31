// Yerel JSON veri paketleri (çevrimdışı): global + pazar + senaryo. Doğrulama motorun zod şemasıyla yapılır.
import { parseParamFile, parseScenarioFile } from '@engine/data/schema';
import type { DataBundle, MarketId, Param, ParamFile, ScenarioFile } from '@engine/data/schema';
import globalRaw from '../../data/global.json';
import usRaw from '../../markets/us.json';
import deRaw from '../../markets/de.json';
import trRaw from '../../markets/tr.json';
import salonRaw from '../../scenarios/salon-saas.json';
import accRaw from '../../scenarios/b2b-accounting-saas.json';
import boxRaw from '../../scenarios/subscription-box.json';

export const MARKETS: readonly MarketId[] = ['us', 'de', 'tr'];
export const SCENARIOS = ['salon-saas', 'b2b-accounting-saas', 'subscription-box'] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

let globalFile: ParamFile | null = null;
const marketFiles: Partial<Record<MarketId, ParamFile>> = {};
const scenarioFiles: Partial<Record<string, ScenarioFile>> = {};

const marketRaw: Record<MarketId, unknown> = { us: usRaw, de: deRaw, tr: trRaw };
const scenarioRaw: Record<string, unknown> = { 'salon-saas': salonRaw, 'b2b-accounting-saas': accRaw, 'subscription-box': boxRaw };

export function getBundle(market: MarketId, scenario: string): DataBundle {
  globalFile ??= parseParamFile(globalRaw);
  const m = (marketFiles[market] ??= parseParamFile(marketRaw[market]));
  const sc = (scenarioFiles[scenario] ??= parseScenarioFile(scenarioRaw[scenario] ?? salonRaw));
  return { global: globalFile, market: m, scenario: sc };
}

export interface MarketInfo {
  locale: string;
  currency: string;
  legal: Record<string, unknown>;
  competitors: Array<{ id: string; name: string; verified?: boolean; positioning?: string; pricing?: Array<{ plan: string; price: number; unit: string; period: string }>; source?: { url?: string | null; name?: string; accessed?: string } }>;
  channels: Record<string, { access?: string; relative?: number; note?: string; layer?: string }>;
}

export function marketInfo(market: MarketId): MarketInfo {
  const meta = (getBundle(market, 'salon-saas').market.meta ?? {}) as Record<string, unknown>;
  return {
    locale: typeof meta.locale === 'string' ? meta.locale : 'en-US',
    currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
    legal: (meta.legal ?? {}) as Record<string, unknown>,
    competitors: (meta.competitors ?? []) as MarketInfo['competitors'],
    channels: (meta.channels ?? {}) as MarketInfo['channels'],
  };
}

export function scenarioTitle(id: string, lang: string): string {
  const raw = getBundle('us', id).scenario as unknown as { name?: Record<string, string> | string };
  const n = raw.name;
  if (typeof n === 'string') return n;
  return n?.[lang] ?? n?.en ?? id;
}

export function scenarioStatus(id: string): string {
  return ((getBundle('us', id).scenario as unknown as { status?: string }).status ?? 'default');
}

export interface CatalogEntry {
  param: Param;
  origin: 'scenario' | 'market' | 'global';
}

/** Öncelik: senaryo > pazar > global; aynı dosyada pazara özel kayıt global kaydı ezer (motorun çözümleyicisiyle aynı). */
export function catalog(market: MarketId, scenario: string): CatalogEntry[] {
  const b = getBundle(market, scenario);
  const out = new Map<string, CatalogEntry>();
  const add = (params: Param[], origin: CatalogEntry['origin']) => {
    const local = new Map<string, CatalogEntry>();
    for (const p of params) {
      if (p.market !== market && p.market !== 'global') continue;
      const prev = local.get(p.id);
      if (!prev || (p.market === market && prev.param.market !== market)) local.set(p.id, { param: p, origin });
    }
    for (const [id, e] of local) out.set(id, e);
  };
  add(b.global.params, 'global');
  add(b.market.params, 'market');
  add(b.scenario.params, 'scenario');
  return [...out.values()].sort((a, b2) => a.param.id.localeCompare(b2.param.id));
}
