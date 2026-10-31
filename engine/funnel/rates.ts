// Saf oran fonksiyonları: tıklama -> lead olasılığı, LP yükleme oranı, sosyal kanıt, ürün/fiyat etkileri.
import { K } from '../core/constants';
import type { ClassKey } from '../core/constants';
import { pn } from '../core/params';
import { clamp, modMult } from '../core/util';
import type { GameState, LandingPage, Offer } from '../core/types';

/** Yorum sayısına bağlı sosyal kanıt çarpanı (1 .. 1.1). */
export function socialProof(s: GameState): number {
  return 1 + 0.1 * Math.min(1, s.local.gbp.reviews / K.reviewMax);
}

/** LP'ye ulaşan tık oranı (hız/mobil uyumu). */
export function loadRate(lp: LandingPage | undefined): number {
  return K.loadRateBase + K.loadRateSpeed * (lp ? lp.speed : 0.5);
}
const LOAD_REF = K.loadRateBase + 0.5 * K.loadRateSpeed;

/** Tık -> lead olasılığı (beklenen). base: kanalın ortalama cvr_lead değeri. */
export function leadRate(s: GameState, base: number, cls: ClassKey, lp: LandingPage | undefined, offer: Offer | undefined, mult = 1): number {
  const v = base * K.classCvrMult[cls] * (lp ? lp.q : 1) * Math.pow(offer ? offer.q : 1, 0.5) * socialProof(s) * modMult(s, 'conv') * mult;
  return clamp(v, 0, 0.95);
}

/** Ziyaret -> lead olasılığı: ziyaret = tık x loadRate(lp); E[lead] = tık x leadRate x loadRate/LOAD_REF. */
export function visitToLead(leadRateClick: number): number {
  return clamp(leadRateClick / LOAD_REF, 0, 0.98);
}

/** Fiyat esnekliği etkisi (deneme -> ücretli). */
export function priceFactor(s: GameState): number {
  const base = pn(s, 'price.monthly');
  const el = pn(s, 'price.elasticity', 0.8);
  return clamp(Math.pow(s.product.price / base, -el), 0.3, 2);
}

/** Onboarding kalitesinin etkisi (0.7..1.3, onb=0.5 => 1). */
export function onbFactor(onb: number): number {
  return 0.7 + 0.6 * onb;
}
