// Teklif / yaratıcı / açılış sayfası nesneleri ve gizli kalite (latent) değerleri.
// Latent q: Beta(a,a)'den çekilen θ'nın 2 katı (ortalama 1 = pazar ortalaması). Oyuncu q'yu doğrudan göremez.
import { Rng } from '../rng';
import { K } from '../core/constants';
import type { Creative, GameState, LandingPage, Offer, PaidChannel } from '../core/types';

export function drawLatent(rng: Rng): number {
  return 2 * rng.beta(K.latentBetaA, K.latentBetaA);
}

function assetRng(s: Pick<GameState, 'seed'>, id: string): Rng {
  return new Rng(`seed:${s.seed}`).fork(`asset.${id}`);
}

const zero = () => ({ n: 0, k: 0, kObs: 0 });

export function makeOffer(s: Pick<GameState, 'seed' | 'assets' | 'day'>, kind: Offer['kind'], name: string, delay = 0): Offer {
  const id = `of${s.assets.nextId++}`;
  const r = assetRng(s, id);
  return { id, name, kind, q: drawLatent(r), stats: { trial: zero() }, availableDay: s.day + delay };
}

export function makeCreative(s: Pick<GameState, 'seed' | 'assets' | 'day'>, channel: PaidChannel, angle: string, bold: boolean, delay = 0): Creative {
  const id = `cr${s.assets.nextId++}`;
  const r = assetRng(s, id);
  const q = drawLatent(r) * (bold ? K.boldQMult : 1);
  return { id, channel, angle, bold, q, stats: { ctr: zero() }, availableDay: s.day + delay };
}

export function makeLp(s: Pick<GameState, 'seed' | 'assets' | 'day'>, style: string, delay = 0): LandingPage {
  const id = `lp${s.assets.nextId++}`;
  const r = assetRng(s, id);
  return { id, style, q: drawLatent(r), speed: r.beta(5, 3), stats: { cvr: zero() }, availableDay: s.day + delay };
}

export const findOffer = (s: Pick<GameState, 'assets'>, id: string): Offer | undefined => s.assets.offers.find((o) => o.id === id);
export const findCreative = (s: Pick<GameState, 'assets'>, id: string): Creative | undefined => s.assets.creatives.find((o) => o.id === id);
export const findLp = (s: Pick<GameState, 'assets'>, id: string): LandingPage | undefined => s.assets.lps.find((o) => o.id === id);
