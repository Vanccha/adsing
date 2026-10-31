# Aşama 1 Sözleşmesi (tüm alt ajanlar uyar)

Kaynak dokümanlar: docs/plan/00-brief.md, model-draft.md, architecture-draft.md, cases-draft.md, market-*.md.

## Teknik
- Tek paket, kök: ~/Desktop/ADSING. TypeScript (strict), Vite, React 18+, vitest, fast-check, zod, i18next/react-i18next. Node 26, npm.
- Bağımlılık yönü: ui → engine → (data, markets, scenarios, cases). engine/ DOM/React/Math.random/Date.now kullanmaz.
- Kod yorumları Türkçe.
- Path alias: `@engine/*` → engine/*, `@data/*` → data/*.

## Dosya sahipliği (bir ajan başkasının klasörüne yazmaz; gerekiyorsa yöneticiye bildirir)
- Temel/motor ajanı: package.json, tsconfig, vite config, eslint, engine/**, tests (engine/**/*.test.ts), scripts/.
- Veri ajanı: data/**, markets/**, scenarios/** (yalnızca JSON + README notları).
- Sonraki dalgalarda: cases/**, ui/** ayrı ajanlara verilecek.

## Param şeması (data/ ve markets/ JSON'larında her sayı)
```jsonc
{
  "id": "gads.search.cpc",           // nokta ayrımlı, benzersiz (pazar içinde)
  "value": 5.4,                      // value veya range zorunlu (ikisi birden olabilir: value = merkez)
  "range": { "min": 3, "max": 8 },
  "unit": "USD",                     // USD | EUR | TRY | ratio | percent | count | days | hours | ...
  "market": "us",                    // global | us | de | tr
  "layer": "sourced",                // sourced | derived | assumption
  "source": { "url": "...", "name": "...", "published": "YYYY-MM-DD|null", "accessed": "YYYY-MM-DD" },
  "confidence": "medium",            // low | medium | high
  "note": "Türkçe açıklama",
  "formula": null, "inputs": []      // derived ise zorunlu
}
```
- Oranlar `ratio` olarak 0–1 arasında saklanır (yüzde değil).
- Dosya biçimi: `{ "schemaVersion": 1, "market": "us", "params": [Param, ...], "meta": {...} }`.
- markets/{us,de,tr}.json: pazar parametreleri + `meta` (currency, locale, fxToUSD, holidays[], channels{}, legal{}, competitors[]).
- competitors: `{ id, name, pricing: [{plan, price, unit, period}], positioning, source{...}, verified: bool }`.
- data/global.json: pazardan bağımsız parametreler (öğrenme eşikleri, yorgunluk, lead decay vb.).
- scenarios/salon-saas.json: ürün (fiyat pazara göre, marj, churn tabanı, deneme süresi, hedefler).

## Gerekli parametre kimlikleri (motor bunları okur; veri ajanı her pazar için doldurur, yoksa global)
gads.search.cpc, gads.search.ctr, gads.search.cvr_lead, gads.search.competition (0-1), gads.match.broad.leak, gads.match.phrase.leak, gads.match.exact.leak,
gads.smart.min_conversions, gads.smart.window_days,
meta.cpm, meta.ctr, meta.cvr_lead, meta.learn.events, meta.learn.window_days, meta.fatigue.f0, meta.fatigue.lambda,
measure.consent_rate, measure.platform_overreport, measure.ios_att_optin,
funnel.lp_to_lead, funnel.lead_qualified, funnel.trial_start, funnel.trial_to_paid, funnel.lead_decay_tau_hours,
churn.monthly_base, price.monthly (pazar para biriminde), pay.fee_pct, pay.fee_fixed, tax.vat_rate (veya sales tax), fx.to_usd,
legal.cold_email (allowed|restricted|banned), legal.cold_call, legal.sms, events.legal_rate_mult, events.macro_rate_mult,
local.gbp_effect, local.referral_rate, local.field_sales_close, market.salon_count, founder.hours_per_week (global).
