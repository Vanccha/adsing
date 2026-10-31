// Vaka tanımları: cases/*.json statik içe aktarılır (Vite ve Node'da aynı); şema doğrulaması ilk erişimde yapılır.
// Yeni vaka eklemek için dosyayı cases/ içine koyup buraya import satırı eklemek yeterlidir.
import c01 from '../../cases/C01-broad-match-burn.json';
import c02 from '../../cases/C02-learning-limited-adset.json';
import c03 from '../../cases/C03-creative-fatigue.json';
import c04 from '../../cases/C04-platform-overreport.json';
import c05 from '../../cases/C05-consent-signal-loss.json';
import c06 from '../../cases/C06-policy-violation-restriction.json';
import c07 from '../../cases/C07-tracking-break.json';
import c08 from '../../cases/C08-competitor-price-cut.json';
import c09 from '../../cases/C09-seasonal-swing.json';
import c10 from '../../cases/C10-onboarding-failure-churn.json';
import c11 from '../../cases/C11-overscale-cac-blowup.json';
import c12 from '../../cases/C12-negative-review-crisis.json';
import c13 from '../../cases/C13-payment-tax-surprise.json';
import c14 from '../../cases/C14-cold-outreach-legal.json';
import c15 from '../../cases/C15-branded-cannibalization.json';
import c16 from '../../cases/C16-slow-lead-response.json';
import events from '../../cases/events.json';
import i18nTr from '../../cases/i18n/tr.json';
import i18nEn from '../../cases/i18n/en.json';

export const RAW_CASES: unknown[] = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16];
export const RAW_EVENTS: unknown = events;
export const CASE_I18N: Record<'tr' | 'en', Record<string, string>> = { tr: i18nTr as Record<string, string>, en: i18nEn as Record<string, string> };
