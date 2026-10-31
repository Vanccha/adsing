// Takip sağlığı ve izlenebilir dönüşüm oranları.
// tracked = etiket sağlığı x (onay + consent mode kısmi telafi) x (iOS ATT, yalnız Meta) x (1 - çevrimdışı pay).
// Sunucu tarafı takip, onay/ATT kaybının bir kısmını geri kazanır. CRM geri bildirimi sinyal kalitesini artırır.
import { K } from '../core/constants';
import { pn } from '../core/params';
import { clamp01 } from '../core/util';
import type { GameState } from '../core/types';

export type TrackChannel = 'google' | 'meta' | 'analytics';

/** Onaylı/modellenmiş izlenebilir ziyaretçi oranı (consent mode ile kısmi telafi). */
export function consentEff(s: GameState): number {
  const c = clamp01(pn(s, 'measure.consent_rate'));
  const rec = clamp01(pn(s, 'consent.recovery', K.consentRecoveryDefault));
  return c + (1 - c) * (s.tracking.consentMode ? rec : 0);
}

export function attFactor(s: GameState): number {
  const share = clamp01(pn(s, 'measure.ios_share', K.iosShareDefault));
  const att = clamp01(pn(s, 'measure.ios_att_optin'));
  return 1 - share * (1 - att);
}

/** Etiketle izlenen dönüşüm oranı (0-1). */
export function trackedFraction(s: GameState, ch: TrackChannel): number {
  let loss = consentEff(s) * (ch === 'meta' ? attFactor(s) : 1);
  if (s.tracking.serverSide) loss = 1 - (1 - loss) * (1 - K.serverSideRecovery);
  const offline = clamp01(pn(s, 'measure.offline_share', 0));
  return clamp01(s.tracking.health * loss * (1 - offline));
}

/** Akıllı teklif/öğrenme algoritmasının gördüğü sinyal kalitesi. */
export function signalQuality(s: GameState, ch: TrackChannel): number {
  const t = trackedFraction(s, ch);
  return clamp01(s.tracking.crmFeedback ? Math.max(t, Math.min(1, t + 0.15 * s.tracking.health)) : t);
}

/** Platform raporu çarpanı: küçük hesapta (günlük tık < eşik) platform gerçeğin yalnız bir kısmını görür. */
export function smallAccountVisibility(s: GameState, dailyClicks: number): number {
  const thr = pn(s, 'measure.small_account_model_threshold_clicks', 0);
  return dailyClicks < thr ? clamp01(pn(s, 'measure.small_account_visibility', 1)) : 1;
}

/** Platformun şişirilmiş raporu: izlenen x aşırı raporlama (>=1). */
export function platformOverreport(s: GameState): number {
  return Math.max(1, pn(s, 'measure.platform_overreport', 1));
}
