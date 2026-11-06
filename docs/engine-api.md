# Motor API ve vaka eşlemeleri

Motor metin üretmez; i18n anahtarı + parametre döner. Genel API `engine/index.ts`, ayrıntılı model `docs/model.md`.

```ts
initState(bundle, seed, opts)            // bundle = { global, market, scenario }
step(state, actions)                     // saf: { state, events, report, actionResults }
stepInPlace(state, actions)              // yerinde (toplu koşular için)
runDays(state, policy | actionLog, n)    // girdi değişmez; sonuç belirlenince durur
extractLog(state)                        // ActionLog: tohumla birlikte yeniden oynatma kaynağı
validateAction(state, action)            // { ok, hours, cash, reason? }
selectors.*                              // observed/true metrikler, huni, cac, mrr, runway, ...
analyzeRun(init, finalState, opts)       // @engine/analysis: karşı-olgusal sonuç analizi
```

## Vaka metrikleri (`engine/cases/metrics.ts`)

Tetikleyiciler gerçek durumdan okur; oyuncuya gösterilen sürümler seçicilerdedir. Eşlenemeyen kimlik `null` döner ve koşul sağlanmaz: `engine/cases/cases.test.ts` bunun tanım dosyalarında olmadığını doğrular. Tasarım kararı içeren eşlemeler:

| Metrik | Tanım | Neden |
|---|---|---|
| `account.health` | Google ve Meta sağlığının en düşüğü | Riskli iddia sayısı iki kanalı da kapsar |
| `gads.brand_query_share` | Google dönüşümlerinde marka payı (`classCvrMult` ağırlıklı, 7 gün) | PMax'in CPA'sını marka dönüşümleri güzel gösterir |
| `gads.budget_jump_ratio_7d` | Son 7 gün / önceki 7 gün bütçe; önceki hafta tam değilse tanımsız | Yeni kampanyanın başlangıcı sıçrama değildir |
| `derived.max_marginal_cac` | LTV / 2 (`K.maxMarginalLtvRatio`) | Oyuncunun hedefinden bağımsız kanal güvenlik eşiği |
| `cash.marginal_cac` | Bir sonraki %25 bütçe; bütçe bağlayıcı değilse son harcanan dilim | Doymuş pazarda tanımsız kalırsa aşırı ölçekleme gizlenir |
| `measure.platform_vs_crm_ratio` | Platform dönüşümü / CRM nitelikli ücretli-kanal lead'i (kümülatif) | Organik lead paydayı şişirip oranı yapısal olarak düşürüyordu |
| `gads.negative_keywords_count` | Negatif sınıf sayısı × `K.negativesPerClass` | Motor sınıf düzeyinde negatif tutar |
| `event.tax_due_soon` | KDV gününe ≤ 8 gün ve borç > nakdin %12'si | "Sürpriz" = kasaya göre ağır ödeme |

## Vaka etki hedefleri (`applyEffect`)

`account.health`, `cash.balance`, `cost.usdDenominatedMult`, `event.negative_review_active`, `finance.invoiceComplianceWork`, `funnel.{emailDeliverability,organicLeads,saasBuying,trialStart,trialToPaid}Mult`, `fx.tryPerUsdMult`, `gads.cpcMult`, `meta.cpmMult`, `gads.delivery`, `gads.smart_learning_reset`, `market.seasonal_index`, `measure.consentLoss`, `measure.trackingHealth`, `reputation`. Bilinmeyen hedef atlanır; tanımlarda bulunmadığı test edilir.

## Vaka tepkileri

- `actionmap.ts#caseTags`: motor aksiyonu, karşıladığı vaka aksiyonlarına etiketlenir (`DecisionEntry.tags`).
- `RESPOND_ONLY` / `actions.ts#RESPONSES`: motorda karşılığı olmayan tepkiler `case.respond` ile seçilir.
- Pencere sonunda değerlendirilenler: `meta.reduceEdits` (düzenleme yapılmadıysa doğru), `ABSTAIN_ACTIONS` (hareketsizlik).
