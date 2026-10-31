// Parametre çözümleme: senaryo > pazar > global. range -> tohumdan çekim; derived -> formül.
// Sonuç: düz JSON (values + info). Eksik kimlikte açık hata (MissingParamError) veya çağıranın varsayılanı.
import { Rng } from '../rng';
import { evalFormula, formulaIdentifiers } from './expr';
import { olderOf, sourceRefDate } from './freshness';
import type { DataBundle, MarketId, Param, ParamValue } from './schema';

export interface ParamInfo {
  layer: Param['layer'];
  confidence: 'low' | 'medium' | 'high';
  origin: 'scenario' | 'market' | 'global';
  unit: string;
  sourceName: string | null;
  sourceUrl: string | null;
  refDate: string | null; // published ?? accessed (türetilmişte en eski girdi)
  hasSource: boolean;
  drawn: boolean; // range'den çekildi mi
}

export interface ResolvedParams {
  values: Record<string, ParamValue>;
  info: Record<string, ParamInfo>;
}

export class MissingParamError extends Error {
  constructor(public ids: string[]) {
    super(`Eksik parametre kimlikleri: ${ids.join(', ')}`);
    this.name = 'MissingParamError';
  }
}

const CONF_ORDER = { low: 0, medium: 1, high: 2 } as const;
const minConf = (a: 'low' | 'medium' | 'high', b: 'low' | 'medium' | 'high') => (CONF_ORDER[a] <= CONF_ORDER[b] ? a : b);

interface Candidate {
  param: Param;
  origin: 'scenario' | 'market' | 'global';
}

/** Aynı dosyada pazar eşleşmesi önce, 'global' sonra. */
function indexFile(params: Param[], market: MarketId, origin: Candidate['origin'], into: Map<string, Candidate>) {
  const byId = new Map<string, Candidate>();
  for (const p of params) {
    if (p.market !== market && p.market !== 'global') continue;
    const prev = byId.get(p.id);
    if (!prev || (p.market === market && prev.param.market !== market)) byId.set(p.id, { param: p, origin });
  }
  for (const [id, c] of byId) into.set(id, c);
}

export function resolveParams(bundle: DataBundle, marketId: MarketId, seed: string, opts: { drawRanges?: boolean } = {}): ResolvedParams {
  const drawRanges = opts.drawRanges ?? true;
  // Öncelik: senaryo > pazar > global (düşük öncelik önce yazılır, üzerine yazılır).
  const cands = new Map<string, Candidate>();
  indexFile(bundle.global.params, marketId, 'global', cands);
  indexFile(bundle.market.params, marketId, 'market', cands);
  indexFile(bundle.scenario.params, marketId, 'scenario', cands);

  const rootRng = new Rng(`seed:${seed}`).fork('params');
  const values: Record<string, ParamValue> = {};
  const info: Record<string, ParamInfo> = {};
  const visiting = new Set<string>();

  function resolve(id: string): void {
    if (id in values) return;
    const c = cands.get(id);
    if (!c) throw new MissingParamError([id]);
    if (visiting.has(id)) throw new Error(`Türetilmiş parametrelerde döngü: ${id}`);
    visiting.add(id);
    const p = c.param;
    let drawn = false;
    let value: ParamValue | undefined;
    let refDate = sourceRefDate(p.source);
    let confidence: 'low' | 'medium' | 'high' = p.confidence ?? (p.layer === 'assumption' ? 'low' : 'medium');

    if (p.layer === 'derived' && p.formula && p.inputs) {
      try {
        const inputIds = p.inputs;
        for (const inp of inputIds) resolve(inp);
        const ids = formulaIdentifiers(p.formula);
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const num = (x: string): number => {
          const key = inputIds.includes(x) ? x : inputIds[letters.indexOf(x)];
          if (key === undefined) throw new Error(`Formül kimliği çözülemedi: ${x}`);
          const v = values[key];
          if (typeof v !== 'number') throw new Error(`Formül girdisi sayı değil: ${key}`);
          return v;
        };
        for (const x of ids) num(x);
        value = evalFormula(p.formula, num);
        for (const inp of inputIds) {
          const ii = info[inp] as ParamInfo;
          refDate = olderOf(refDate, ii.refDate);
          confidence = minConf(confidence, ii.confidence);
        }
        if (!Number.isFinite(value)) value = p.value;
      } catch (e) {
        if (p.value === undefined) throw e;
        value = p.value;
      }
    }
    if (value === undefined) {
      if (p.range && drawRanges) {
        const { min, max } = p.range;
        const r = rootRng.fork(id);
        const dist = p.range.dist ?? (typeof p.value === 'number' ? 'triangular' : 'uniform');
        const u = r.float();
        if (dist === 'triangular') {
          const mode = typeof p.value === 'number' ? Math.min(max, Math.max(min, p.value)) : (min + max) / 2;
          const f = max > min ? (mode - min) / (max - min) : 0.5;
          value = u < f ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        } else {
          value = min + u * (max - min);
        }
        drawn = true;
      } else if (p.value !== undefined) {
        value = p.value;
      } else if (p.range) {
        value = (p.range.min + p.range.max) / 2;
      }
    }
    if (value === undefined) throw new Error(`Parametre değeri yok: ${id}`);
    // Yüzde birimi -> oran
    if (p.unit === 'percent' && typeof value === 'number') value = value / 100;
    values[id] = value;
    info[id] = {
      layer: p.layer,
      confidence,
      origin: c.origin,
      unit: p.unit === 'percent' ? 'ratio' : p.unit,
      sourceName: p.source?.name ?? null,
      sourceUrl: p.source?.url ?? null,
      refDate,
      hasSource: p.layer === 'sourced' ? !!p.source : p.layer === 'derived',
      drawn,
    };
    visiting.delete(id);
  }

  for (const id of [...cands.keys()].sort()) resolve(id);
  return { values, info };
}

/** Eksik zorunlu kimlikleri listeler (initState bunu hataya çevirir). */
export function missingIds(resolved: ResolvedParams, required: readonly string[]): string[] {
  return required.filter((id) => !(id in resolved.values));
}
