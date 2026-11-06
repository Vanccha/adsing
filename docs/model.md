# Simülasyon Modeli (Aşama 1 gerçeklemesi)

Bu belge `docs/plan/model-draft.md` taslağının **kodla gerçeklenmiş** halidir; formüller `engine/` kaynağıyla birebir tutarlıdır.
Motor sayı uydurmaz: pazara/ürüne ait her sayı `data/`, `markets/`, `scenarios/` parametrelerinden gelir. Aşağıda "motor sabiti" denen
değerler (`engine/core/constants.ts`, nesne `K`) modelin YAPISAL ince ayar katsayılarıdır; pazar verisi değildir, düşük güvenli varsayımdır
ve Monte Carlo dengelemesinde (Aşama sonrası) değişebilir. İlgili bir parametre kimliği verilmişse o kimlik sabiti ezer.

## 0. Mimari

```
engine/
  rng/          sfc32, string tohum, fork(), Binomial/Poisson/Beta/Gamma/Normal/NegBin, Beta CDF/kuantil/P(A>B)
  data/         zod şeması, ifade değerlendirici, tazelik, çözümleyici (senaryo > pazar > global, range çekimi, derived)
  core/         types (düz JSON GameState), init, step (11 aşama), run (runDays/ActionLog), actions (kayıt+doğrulama),
                events, outcome, env (takvim/mevsim/tatil), params, constants
  funnel/       leads (LP->lead, satış, deneme), customers (faturalama, churn, MRR), finance (nakit, LTV/CAC), rates
  channels/     google (+actions), meta (+actions), local (GBP/yorum/referans/saha/soğuk/içerik), geo, common
  measurement/  tracking (izlenen oran), observe (platform/analitik/CRM), holdout, actions (takip düzeltme, holdout)
  quality/      assets (gizli latent), bayes (Beta-Binomial), saturation (Hill), actions (varlık, A/B)
  selectors/    observed/true metrikler, funnel+darboğaz, cac(+marjinal), mrr, runway, founderHours, freshness, availableActions
  cases/        vaka/olay motoru (tetikleyici, etki, tepki izleme), metrik eşlemesi, case.respond aksiyonları
  analysis/     sonuç analizi: karşı-olgusal koşular, beceri vs şans, aynı tohumda iyi bot kıyası
  bots/         kötü/orta/iyi referans politikalar (yalnız oyuncunun görebildiği bilgiyi kullanır), kabul testleri
  test-fixtures sahte (TEST FIXTURE) pazar/senaryo + test yardımcıları
```
Bağımlılık yönü ui → engine → veri. `engine/` React/DOM/`Math.random`/`Date.now` kullanmaz (ESLint kuralı). Motor metin üretmez:
olay/ipucu/hata için i18n anahtarı (`event.*`, `hint.*`, `err.*`, `outcome.*`) + parametre döner.

API: `initState(bundle, seed, opts)` -> `GameState`; `step(state, actions)` -> `{state, events, report, actionResults}` (saf);
`runDays(state, policy | ActionLog, n)`; `extractLog(state)`; `validateAction(state, action)`; `selectors`.
`bundle = { global, market, scenario }` (zod ile doğrulanmış JSON dosyaları). `opts`: `difficulty` (easy|normal|hard), `mode`
(`full` 365 gün | `quick` 90 gün), `learningMode`, `startingCash`, `refDate` (tazelik için "bugün"; varsayılan 2026-10-31),
`startDate` (oyun takvimi), `drawRanges`.

## 1. Determinizm ve RNG

- Her gün için kök akış: `Rng("seed:<tohum>").fork("d<gün>")`. Her modül `root.fork("<etiket>")` ile bağımsız alt akış alır
  (`ads.google.<kampanya>`, `funnel.leads`, `event.<id>`, `billing`, `churn`, ...). Akışlar **etiket yoluyla** türer, ebeveynin
  tükettiği sayıyla değil: aksiyon/kanal eklemek diğer rastgeleliği kaydırmaz (ilişki 14).
- Gizli kaliteler (`q`) kimliğe göre `asset.<id>` akışından çekilir. Parametre `range`'leri `params/<id>` akışından.
- `GameState` düz JSON; `step` girdiyi klonlar, `runDays` bir kez klonlar. Aynı tohum + aynı ActionLog = derin eşit durum.
- sfc32 (32-bit tamsayı), cyrb128 benzeri hash. Büyük n için Binomial/Poisson normal yaklaşımı (sabit çekiliş sayısı).

## 2. Veri katmanı

Param: `{id, value|range, unit, market, layer, source, confidence, note, formula, inputs}`. Kurallar (zod): sourced => `source`
(+`accessed`) ve `confidence`; derived => `formula` (+`inputs`, boş olabilir); assumption => `note`; `value` veya `range` zorunlu.
Çözümleme: senaryo > pazar > global; aynı dosyada oynayan pazar `global`'e baskın. `range` -> tohumdan çekim
(`value` varsa üçgen dağılım modu=value, yoksa düzgün; `dist` ile ezilir). `derived` -> formül girdilerden değerlendirilir
(`+ - * / ^`, `min max mean median round(x[,adım]) abs sqrt ln exp`; kimlikler veya `a,b,c` = girdi sırası); güven = girdilerin en düşüğü,
tarih = en eski girdi. `unit:"percent"` -> orana çevrilir. Zorunlu kimlikler eksikse `initState` `MissingParamError` fırlatır.
Tazelik: referans tarih = `published ?? accessed`; `bugün > ref + 12 ay` ise bayat; varsayım = "kaynaksız".
`npm run data:audit`: şema, derived çözülebilirliği/döngü, accessed eksikliği (hata), bayat/kaynaksız/düşük güven (rapor).

### Motorun okuduğu kimlikler
Sözleşme listesi (zorunlu): `gads.search.{cpc,ctr,cvr_lead,competition}`, `gads.match.{broad,phrase,exact}.leak`, `gads.smart.{min_conversions,window_days}`,
`meta.{cpm,ctr,cvr_lead}`, `meta.learn.{events,window_days}`, `meta.fatigue.{f0,lambda}`, `measure.{consent_rate,platform_overreport,ios_att_optin}`,
`funnel.{lp_to_lead,lead_qualified,trial_start,trial_to_paid,lead_decay_tau_hours}`, `churn.monthly_base`, `price.monthly`, `pay.fee_{pct,fixed}`,
`tax.vat_rate`, `legal.{cold_email,cold_call,sms}`, `events.{legal,macro}_rate_mult`, `local.{gbp_effect,referral_rate,field_sales_close}`,
`market.salon_count`, `founder.hours_per_week`.
Veri ajanının eklediği ve motorun kullandığı (isteğe bağlı, yoksa varsayılan): `gads.smart.{learning_days,learn_reset_frac}`, `meta.learn.reset_frac`,
`gads.rank.alpha`, `consent.recovery`, `pmax.brand_cannibalization`, `prior.strength`, `ci.level`, `stats.min_n_clicks`, `geo.lag_days`,
`founder.overtime_efficiency_loss`, `measure.offline_share`, `measure.small_account_model_threshold_clicks`, `measure.small_account_visibility`,
`tax.dhv_rate`, `tax.meta_location_fee`, `tax.saas_taxable_share`, `tax.saas_avg_rate`, `churn.price_hike_shock`,
`market.abmahnung_prob_per_cold_email_batch`, `fx.to_usd`, senaryo: `scn.trial_days`, `scn.gross_margin`, `scn.fixed_costs_monthly`,
`scn.start_cash.<zorluk>`, `scn.churn_early_mult`, `scn.churn_decay_months`, `scn.goal.{12m|90d}.{target_mrr,ltv_cac_min,payback_months_max}`.
Pazar `meta`: `currency`, `holidays[]` (`date,endDate,closed,effects.{salonDemand,saasBuying}`), `seasonality.{adCost,salonDemand,saasBuying}`
(ay -> çarpan), `channels.<ad>.{access,relative}`.
Motorun kendi varsayılanlarıyla çalıştığı (veri ajanından gerçek değer beklenen) isteğe bağlı kimlikler: `price.elasticity` (0,8), `pay.fail_rate` (0,03),
`mrr.expansion_monthly` (0,008), `mrr.contraction_monthly` (0,004), `tax.corporate_rate` (0), `cost.rep_monthly`, `cost.auto_reply_monthly`,
`founder.hour_value`, `meta.msg.mult`, `measure.ios_share` (0,5), `measure.consent_recovery` (yoksa `consent.recovery`), `scn.lose.reputation` (0,1).
Para tutarı varsayılanları (senaryoda yoksa) aylık fiyatın katıdır (`K.*PriceMult`): sabit gider 15x, satış elemanı 30x/ay, otomatik yanıt 0,6x/ay,
sunucu tarafı takip 4x, CRM geri bildirimi 2x, yaratıcı 1x, LP 3x, kurucu saat değeri 0,4x, başlangıç nakdi 400x.

## 3. Günlük adım (`core/step.ts`): 11 sabit aşama

1. **Olaylar** (`events.ts`): her olay `event.<id>` alt akışından Bernoulli(oran). Oranlar günlük, motor varsayımı (`K.ev`): takip bozulması 0,004,
   teklif sıçraması 0,006, rakip fiyat kırma 0,003, platform politika incelemesi 0,003 x `events.legal_rate_mult`, makro durgunluk 0,002 x
   `events.macro_rate_mult`, talep artışı 0,004, ödeme/vergi sürprizi 0,003 x legal, GEO model güncellemesi 0,004, viral anma 0,002, ürün hatası 0,002.
   Kötü olay oranı zorluk çarpanıyla (0,6/1/1,4). Etki = `Modifier{target,kind,value,from,until}` (cpc, cpm, demand, churn, churn_add, conv_paid, organic).
   Hesap sağlığı +0,002/gün toparlanır; <0,2 => 10 gün askı, 3. ihlal => kalıcı.
2. **Aksiyonlar**: zamanlanmış takip düzeltmeleri uygulanır; kuyruk (FIFO) + yeni aksiyonlar. Kapasite: hafta içi `hpw/6`, hafta sonu `hpw/12` (haftalık
   toplam = `hpw`); sabit tahsisler (satış, onboarding) önce düşer. Saat yetmezse **kuyruğa** (en çok 7 gün; kapasite+%25 fazla mesai içinde olanlar anında). Kuyruk katı FIFO'dur: önünde iş bekleyen aksiyon sırası gelmeden
   doğrulanmaz (bekleyen işe bağlı zincirler reddedilmez). Hiç sığmayan/yetersiz nakitli/geçersiz olan **reddedilir** (`actionResults`). Karar günlüğü `decisions`.
3. **Rakipler**: `compIdx <- clamp(compIdx + 0,05(1-compIdx) + 0,02 N(0,1), 0,7, 1,6)`. CPC/CPM çarpanı.
4. **Kanal teslimatı**: yerel/GEO doğrudan lead'ler, Google, Meta (bölüm 5-7), harcama nakitten (reklam vergisiyle) düşer. Günlük reklam nakit sınırı:
   `nakit - sabit_gider/30` (hiçbir gün reklam harcaması önceki nakdi aşmaz).
5. **Huni**: tık -> LP ziyareti -> lead (+A/B bölme), organik taban (bölüm 8).
6. **Satış süreci**: kapasite, yanıt süresine bağlı lead çürümesi, nitelendirme, deneme başlangıcı.
7. **Deneme/aktivasyon**: biten denemeler -> aktivasyon -> ücretli kohort.
8. **Faturalama**: 30 günde bir kohort faturası, ödeme hatası/dunning, KDV, komisyon, değişken maliyet.
9. **Churn**: kohort hazard, genişleme/daralma, MRR.
10. **Nakit**: sabit gider, satış elemanı, araç; ayda bir KDV iadesi ve gelir vergisi; onboarding dinamiği.
11. **Ölçüm/rapor**: platform/analitik/CRM; öğrenme durumları; holdout; kümülatifler; itibar/tükenme; `DayRecord`; sonuç denetimi.

## 4. Gerçek ve gözlenen (`measurement/`)

- `trackedFraction(ch) = tag_sağlığı x (onay + (1-onay) x consent_mode x consent.recovery) x ATT(yalnız Meta) x (1 - offline_share)`; ATT çarpanı
  `1 - ios_share (1 - ios_att_optin)`. Sunucu tarafı takip kalan kaybın `K.serverSideRecovery`=%50'sini geri getirir. Küçük hesapta (günlük tık < eşik)
  platform raporu `measure.small_account_visibility` ile çarpılır.
- Platform raporu = `Binomial(gerçek_lead_kanal, tracked) x platform_overreport` (atıf şişmesi, view-through); platform yalnız google/meta'yı görür.
  Analitik = `Binomial(tüm_lead, tracked_analytics)`. CRM = `Binomial(tüm_lead, 0,95)` ve oyuncuya 2 gün gecikmeli gösterilir (müşteri: 0,975).
- Akıllı teklif/öğrenme sinyali = `tracked` (CRM geri bildirimi +0,15 x sağlık).
- **Artımsallık**: her tıklama partisinin `nonIncr` payı (arama 0,10; marka 0,80; Meta kitleye göre 0,10-0,30; PMax marka yakalama) "zaten gelecekti"dir:
  organik taban (Poisson(μ_org)) bu kadar azaltılır (`organik = max(0, Poisson(μ) - yer_değiştiren)`), böylece toplam gerçek lead değişmez ama platform raporu şişer.
  `trueMetrics.byChannel[].incrLeads/leads` artımsal payı verir.
- **Holdout/geo testi**: kanal bölgelerin `σ` kadarında kapatılır (teslimat `(1-σ)` ile çarpılır). Kontrol beklenen = `(1-σ)·O + I_c`, holdout = `σ·O·(1+ε)`
  (O organik taban, I_c artımsal reklam leadi, ε bölge benzerliği ~N(0;0,1)); günlük Poisson sayımlar toplanır. Tahmin `Î = L_c/((1-σ)T) - L_h/(σT)`, %90 GA
  (normal yaklaşım); GA genişliği > 1,2|Î| ise `conclusive=false`.

## 5. Google Ads (`channels/google.ts`)

Kampanya > reklam grubu > anahtar kelime (`core|adjacent|brand`, eşleme `exact|phrase|broad`). Sorgu sınıfları: hedef, komşu, alakasız, bilgi, marka.
- Hacim (kişi/gün): `core = salon_count x 0,004`, `adjacent = x 0,02`, `brand = x 0,0005 x (1 + 20·bilinirlik)` (motor sabitleri) x `talep` (haftanın günü x mevsim x tatil x modifier).
  Eşleme kapsaması: exact 0,35, phrase 0,65, broad 1,0.
- Sınıf karışımı: sızıntı `L = gads.match.<tür>.leak`; alakasız `0,6L`, bilgi `0,4L`; kalan `(1-L)` hedef/komşu (komşu payı 0,10/0,20/0,30).
- Negatif kelime: sınıf payı `x(1 - e)`, `e` = dar 0,60 / geniş 0,95; arama terimleri raporu incelenmediyse `e x 0,7`; negatif hedef dışı bir sınıfa ise hedef payı
  `x(1 - fp)` (dar 0, geniş 0,25: aşırı negatif hedef trafiği keser).
- QS (1-10, sürekli): `1 + 9(0,4 eCTR + 0,35 alaka + 0,25 LP)`; eCTR = `clamp(yaratıcı_q/2)`, LP = `clamp(lp_q/2)`, alaka anahtar kelime latent'i. Oyuncuya yalnız bant (<4, <7, ≥7).
- Ad Rank: `AR = teklif x (QS/5,5)^α` (`α = gads.rank.alpha`). Rakip rank'i log-normal: medyan `CPC_ref x 1,25`, `σ = 0,3 + 0,3·gads.search.competition`;
  `CPC_ref = gads.search.cpc x compIdx x modifier(cpc) x mevsim(adCost)` (marka sınıfı x0,35).
  `P(kazan) = Φ(ln(AR/medyan)/σ)`; ödenen CPC = `min(teklif, E[R | R<AR] / (QS/5,5)^α + 0,005 CPC_ref)` (ikinci fiyat benzeri).
- Gösterim = `uygun_arama x P(kazan)`; CTR = `gads.search.ctr x yaratıcı_q x sınıf_çarpanı x (0,8 + 0,4 alaka)`; tık = gösterim x CTR; maliyet = tık x CPC.
  Sınıf CTR çarpanları hedef 1, komşu 0,8, alakasız 0,5, bilgi 0,7, marka 3; dönüşüm çarpanları 1/0,35/0,02/0,1/2; nitelik çarpanları 1/0,7/0,3/0,3/1,1.
- Bütçe: toplam maliyet bütçeyi aşarsa satır oranı `f = (1-ι_a)·bütçe/toplam + ι_a·en_verimli_önce`, `ι_a` yalnız maxConversions/tCPA'da; gösterim payı
  `IS = Σ gösterim/Σ uygun`, `kayıp_rank = Σ uygun(1-P)/Σ uygun`, `kayıp_bütçe = Σ uygun·P(1-f)/Σ uygun`; `IS + kayıp_bütçe + kayıp_rank = 1`.
  Gerçekleşme: gösterim ~ NegBin(μ, 40), tık ~ Binomial(gösterim, CTR), tık sayısı kalan bütçe ve nakitle sınırlanır (günlük harcama ≤ bütçe).
- Teklif stratejileri: manuel (`kw.bid ?? kampanya_teklifi`); maxClicks (`1,35 x CPC_ref`); maxConversions
  (`taban x clamp(1 - ι + ι·lr/lr_ort, 0,2, 2,5)`); tCPA (`clamp(tCPA x (ι·lr + (1-ι)·lr_ort) x sinyal, 0,3-3 x CPC_ref)`). `ι = K.smartIota[durum] x sinyal`
  (kararlı 0,85, öğrenme 0,3, sınırlı 0,45). Öğrenmede teklif gürültüsü `exp(σ N)` (σ: 0,25/0,15/0,05).
  **Takip bozulunca** sinyal düşer => tCPA teklifleri düşer (hacim↓), gözlenen dönüşüm↓, maxConversions ayrımı bozulur (ilişki 4).
- Öğrenme: son `window_days` günün *izlenen* dönüşümleri. Kararlı: toplam ≥ `min_conversions` ve yaş ≥ `learning_days`; kararlıdan toplam < %50 eşik => sınırlı;
  öğrenmede `max(window, learning_days)` gün geçip eşik sağlanmazsa sınırlı. Önemli düzenleme (bütçe değişimi > %20, strateji değişimi, tCPA hedefi > %15, duraklatıp açma)
  => pencere `x(1 - gads.smart.learn_reset_frac)`, durum öğrenme, `sinceReset=bugün` (ilişki 10). Manuel kampanya öğrenmeye girmez.
- PMax: anahtar kelime/eşleme yok; hacim `(core+adjacent) x 1,2` karışım (hedef .35, komşu .20, alakasız .25, bilgi .20) + marka havuzunun `pmax.brand_cannibalization` kadarını yakalar
  (marka dönüşümü yüksek, artımsal değil, `nonIncr=0,8`). Yalnız maxConversions/tCPA. Arama terimi raporu/negatif kontrol kolları yok.
- Arama terimleri raporu (`gads.review_search_terms`, 1 saat): sınıf kırılımı oyuncuya görünür hale gelir ve negatiflerin etkinliğini artırır.

## 6. Meta Ads (`channels/meta.ts`)

Hedef (lead|mesaj) > reklam seti > reklam. Kitle havuzu `N = salon_count x {interest 0,20; lookalike 0,12; advantage 0,60; broad 0,50}`.
- `CPM = meta.cpm x compIdx x modifier x mevsim x kitle(1,1/1,15/0,95/0,85) x öğrenme(1,1/1/1,25) x 1/(0,85+0,15 q̄) x (1 + 0,15 max(0, f-1))`.
  Harcama = bütçe x teslimat (öğrenme 0,95; sınırlı 0,85 ± gürültü); gösterim = harcama/CPM·1000.
- Frekans `f = x/(1-e^{-x})`, `x = impr7/N` (üstel ağırlıklı 7 günlük gösterim, reklam başına). Yorgunluk: `CTR_eff = meta.ctr x yaratıcı_q x exp(-λ max(0, f-f0))` (ilişki 13).
  Çok reklam => reklam başına frekans düşer.
- Dönüşüm: `lr = meta.cvr_lead x lp_q x teklif_q^0,5 x sosyal_kanıt x kitle_çarpanı x öğrenme(0,9/1/0,85) x (advantage: 0,85+0,35 d) x mesaj`.
  `d = clamp(olay_toplamı/(2·eşik)) x tracked_meta`. CPC ≈ CPM/(1000·CTR) yapısal olarak sağlanır (ilişki 2).
- Öğrenme: son `meta.learn.window_days` günün izlenen olayları >= `meta.learn.events` => active; yaş ≥ pencere ve eşik altı => learning_limited. Önemli düzenleme
  (bütçe > %20, kitle, reklam ekleme/çıkarma, duraklatıp açma) => olaylar `x(1 - meta.learn.reset_frac)`, learning (ilişki 10). Küçük bütçe x çok set => hepsi sınırlı.
- Mesaj reklamı: tık -> sohbet, `cvr x meta.msg.mult` (yoksa `1 + 0,5 x channels.whatsapp.relative`), lead çürüme sabiti `x0,5`, nitelik `x0,85`.
- Advantage+ kitle: atıf şişmesi/artımsal olmayan pay daha yüksek (0,30).

## 7. Ücretsiz / yerel kanallar, GEO (`channels/local.ts`, `geo.ts`)

Aşama 1 düzeyi: basit ama yasal rejim ve pazar etkinliğine (`channels.<k>.relative`) bağlı.
- **Organik taban** `μ = salon_count x 1,5e-6 x (1 + 3·bilinirlik) x (0,6 + 0,8 itibar) x modifier x (0,5 + 0,5 talep)`; bilinirlik = `1 - exp(-(Σgösterim + 50 müşteri + 20 yorum)/(salon_count x 20))`.
- **GBP**: yerel keşif potansiyeli `μ_yerel = salon_count x 1e-5 x` aynı çarpanlar (organikten ayrı); `μ_gbp = μ_yerel x local.gbp_effect x skor x relative(gbp) x (1 + 0,2 yorum/60)`; `optimize_gbp(saat)`: skor `+= 0,08·saat·(1-skor)`, günlük çürüme %0,1. Yorum isteme: `Binomial(n, 0,45)` yorum, 1-10 gün içinde; sosyal kanıt `1 + 0,1 min(1, yorum/60)` dönüşümü artırır.
- **Referans**: `μ = müşteri x local.referral_rate x relative(referral) x (program ? 1 : 0,4) x (0,6 + 0,8 itibar) / 30`; program açıkken ücretli referansta ödül nakdi.
- **Saha satışı**: `Poisson(saat x 0,5 x relative(field_sales))` ziyaret, nitelendirme atlanır, deneme olasılığı `local.field_sales_close`, destekli (aktivasyon x1,2).
- **Soğuk temas** (e-posta/arama/SMS): hukuki durum `legal.*`: verim `{allowed 0,02; restricted 0,008; banned 0,003} x relative x alan sağlığı`; itibar kaybı `hacim x {0; 0,01; 0,04}/100`;
  ihtar/ceza olasılığı `{0; 0,003; 0,02}` (e-postada `market.abmahnung_prob_per_cold_email_batch`), tutar `50 x fiyat`.
- **İçerik**: sosyal ve SEO stokları (SEO gecikmeli, 0,97 yumuşatma), `lead = 0,07 x (sosyal x relative + seoEff)/gün`; stok artışı konu uyumu ve tekrar cezasıyla çarpılır (bölüm 9), günlük çürüme.
- **GEO (çekirdek)**: `v(t+1) = v + 0,01·(gecikmeli_yatırım) - 0,004·v`, gamma(2, lag/2) çekirdeği (`geo.lag_days`), günlük Bernoulli(v) bahsedilme => Poisson(1,2) lead.
  Gözlenen skor gürültülü (`v + N(0;0,05)`).

## 8. Huni, satış, deneme (`funnel/`)

- **Tık -> ziyaret**: `Binomial(tık, 0,8 + 0,15·lp_hız)`; **ziyaret -> lead**: `Binomial(ziyaret, lr / ref_yükleme)` (lr = bölüm 5-6; yavaş LP daha az ziyaret üretir).
  Lead olasılığı `lr = clamp(baz_cvr x sınıf x lp_q x teklif_q^0,5 x sosyal_kanıt x modifier(conv) x çarpan x satın_alma_eğilimi(mevsim x tatil), 0, 0,95)`.
- **A/B (LP)**: çalışan test için `a` LP'sine giden tıklar `split` oranında `b`'ye yönlendirilir; her kol için ayrı sayaç; süre bitince `done`.
- **Satış kapasitesi** (lead/gün) = `min(tahsis_saat, kapasite) x (1 - 0,4·tükenme) x (dünkü fazla mesai ? 1 - overtime_loss : 1) / 0,4 saat + 12 x satış_elemanı`.
  Kuyruk FIFO; 10 günden eski lead düşer. Yanıt süresi `Δt = 24·yaş_gün + h0` (h0: 6 saat, otomatik yanıt 1 saat).
  **Lead çürümesi**: `p_iletişim = 0,92·exp(-Δt/(τ·τ_çarpan))`, `τ = funnel.lead_decay_tau_hours` (ilişki 11). Nitelikli = `Binomial(iletişim, lead_qualified x kanal/sınıf nitelik)`
  (kanal nitelik: google 1, meta 0,85, referans 1,3, saha 1,4, soğuk 0,7, ...). Deneme = `Binomial(nitelikli, trial_start x teklif_q^0,5 x satın_alma_eğilimi)`.
- **Deneme -> ücretli**: süre `scn.trial_days`; aktivasyon `min(0,95, 0,7 x onboarding_etkisi)`, ücretli|aktif `trial_to_paid x fiyat_etkisi / 0,7`
  (toplam `≈ trial_to_paid x onb x fiyat`); `onb_etkisi = 0,7 + 0,6·onboarding`; `fiyat_etkisi = (fiyat/baz)^(-esneklik)`.
- **Onboarding** (0-1): hedef `0,25 + 0,6(1 - exp(-tahsis_saat)) + dokümantasyon_stoku`, günlük %5 yaklaşır (başlangıç 0,5).
- **Churn**: aylık hazard `h = churn.monthly_base x (1,45 - 0,9·onb) x (1 + (scn.churn_early_mult - 1)·exp(-yaş_ay/scn.churn_decay_months)) x modifier(churn) + modifier(churn_add)`;
  günlük `1 - (1-h)^(1/30)`; kohort `Binomial(yaşayan, p)`. Ödeme hatası 30 günde bir: `%3` başarısız, %60 dunning ile kurtulur, kalanı istem dışı churn.
- **MRR**: `Σ yaşayan x ARPA`; kimlik: `MRR_son = MRR_önceki + yeni + genişleme - daralma - churn` (her gün; fiyat değişikliği genişleme/daralma olarak yazılır) (ilişki 9).
- **Finans**: faturada `net = yaşayan x ARPA`, `KDV = net x oran` (US: oran 0 ise `taxable_share x avg_rate`), `komisyon = pay.fee_pct x brüt + pay.fee_fixed x işlem`, `değişken maliyet = net x (1 - scn.gross_margin)`.
  KDV 30 günde bir iade; gelir vergisi (`tax.corporate_rate`) kümülatif kâr üzerinden. Sabit gider `scn.fixed_costs_monthly/30` günlük.
  Nakit kimliği: `nakit = başlangıç + gelir + KDV_tahsil - (KDV_ödenen + değişken maliyet + komisyon + reklam + reklam_vergisi + sabit + satış + araç + aksiyon + referans_ödülü + gelir_vergisi + ceza)` (test edilir).
- **LTV** `= ARPA x brüt_marj / aylık_churn` (gözlenen kohort churn'ü; yeterli veri yoksa `churn.monthly_base`). **CAC** tam yüklü = `(reklam + reklam_vergisi + satış_elemanı + araç + kurucu_saati x saat_değeri)/yeni_müşteri`
  (son 90 gün); yalnız reklam = reklam/yeni müşteri. **Payback** `= CAC_tam / (ARPA x marj)` ay.

## 9. Gizli kalite ve keşif (`quality/`)

- Teklif / yaratıcı / LP için gizli `q = 2θ`, `θ ~ Beta(5,5)` (ortalama 1; "abartılı" yaratıcı x1,12 ama günlük %0,4 politika ihlali riski). LP ayrıca gizli hız (Beta(5,3)).
- Oyuncunun gördüğü sayaçlar: yaratıcı `gösterim -> tık`; LP `ziyaret -> lead` (gözlenen lead = Binomial(lead, tracked_analytics): takip kaybı oranı **aşağı** yanlılaştırır); teklif `nitelikli -> deneme`.
- Posterior: önsel ortalama sektör ortalaması (`gads.search.ctr`/`meta.ctr`, `funnel.lp_to_lead`, `funnel.trial_start`), gücü `prior.strength`: `Beta(a0 + k, b0 + n - k)`;
  %`ci.level` güvenilir aralık (Beta kuantili), `P(A>B)` sayısal integral. **"Yeterli veri yok"**: `n < stats.min_n_clicks` veya `(hi-lo)/ortalama > 0,8`.
- **İçerik kararları**: yaratıcı ve LP için ana mesaj (`time|revenue|price|trust`): gizli `q` çarpanı `K.messageFit[pazar][mesaj] x exp(0,08 N)` (tohuma bağlı; yön pazar ipucundan, kesin cevap testten).
  Reklam ve sayfa aynı mesajı veriyorsa lead oranı x1,15. İçerik konusu (`howto|comparison|local|story`): `K.topicFit` x `1/(1 + 0,15 x son dönem saat)`; konu hafızası günlük x0,97.
  Tek reklam grubunda birden çok tema: alaka x0,7 (QS ve CTR düşer). Hepsi motor varsayımı.
- **Doygunluk**: `quality/saturation.ts` Hill `C(s) = Cmax s^h/(s^h + K^h)` ve `marjinal = 1/C'(s)`; kanal teslimat modeli kendiliğinden içbükey (bütçe sınırı verimli satırları önce doldurur; Meta frekans/yorgunluk).
  `selectors.cac(state,{marginal:true})` ve `responseAt` motorun beklenen-değer teslimat fonksiyonunu farklı bütçelerde çağırır (ilişki 3).

## 10. Kurucu saati, tükenme, itibar

- Aksiyon tanımı: `{saat, nakit, doğrulama, uygulama}` (`ActionDef`); `hours` alanı yalnız artırabilir. Tükenme `b`: kullanım `(aksiyon_saati + 0,5·tahsis)/kapasite > 0,9` iken `+0,02(1 + 5(u-0,9))`, `< 0,6` iken `-0,03`; `b ≥ 1` => kayıp; satış verimi `x(1 - 0,4 b)`.
- İtibar: `+0,001 (onboarding - 0,45)` günlük; soğuk temas ve aşırı iddialar düşürür; `< 0,1` => kayıp.

## 11. Kazanma / kaybetme

- Kayıp (her gün): nakit < 0; iki reklam hesabı da kalıcı askıda; itibar < eşik; tükenme ≥ 1.
- Süre sonu (365 veya 90 gün) hedefleri senaryodan (`scn.goal.12m|90d`): **won** = MRR ≥ hedef ve LTV:CAC ≥ eşik ve payback ≤ eşik;
  **healthy** = MRR ≥ %50 hedef ve (LTV:CAC veya payback tutuyor veya runway ≥ 6 ay); **stagnant** = hayatta ama MRR 90 günde ≥ %5 büyümedi (MRR 0 dahil); **survived** = diğer.
  `won` ayrıca `scn.goal.*.target_customers`, `min_runway_months`, `min_cash_ratio` hedeflerini de ister. 90 günlük hedefler ilk çeyreğin kurulum yükü nedeniyle 12 aylıktan gevşektir (LTV:CAC ≥ 1,2; payback ≤ 15 ay).

## 12. Seçiciler

`observedMetrics` (harcama, platform/analitik/CRM dönüşümleri, kampanya raporları, QS bandı, IS kayıpları, posterior'lar; latent yok), `trueMetrics` (gerçek, latent, artımsallık),
`funnel` (pencereli aşama sayıları, oranlar, darboğaz: `oran/kıyas` en düşük aşama; **ipucu anahtarları yalnızca `learningMode`'da**), `cac` (+marjinal), `mrr` (hareket tablosu), `runway`
(son 30 gün net yakım), `founderHours`, `freshnessWarnings` (bayat/kaynaksız/düşük güven), `availableActions`, `assetEstimates`, `abResult`.

## 13. Testler

`npm test` (vitest + fast-check): RNG/dağılımlar, Beta fonksiyonları, veri şeması/çözümleme/tazelik, 15 yapısal ilişki (`engine/core/structural.test.ts`, başlıklar numaralı),
determinizm/yeniden oynatma/saflık, kurucu saati-kuyruk-nakit, kazanma/kaybetme, kanal özellikleri, kalite/A-B, seçiciler, **gerçek veri** (tüm JSON şemadan geçer,
3 pazar x 3 politika x 90 gün + 365 gün koşuları çökmeden, nakit kimliği tutar). Özellik testi: rastgele aksiyon dizileri => sonlu sayılar, olasılıklar/sağlıklar [0,1], stoklar ≥ 0,
günlük harcama ≤ bütçe ve ≤ önceki nakit.

## 14. Vaka motoru, finansman, pivot

- **Vakalar** (`cases/C01-C16`, `engine/cases/`): tetikleyici koşullar `metrics.ts` üzerinden GERÇEK durumdan okunur; etki `Modifier` olarak uygulanır. Tepki penceresi 14 gün: doğru tepki kalan etki süresini ×0,5,
  yanlış tepki ×1,25 yapar; pencere biterse `ignored`. Tepki iki yoldan gelir: motor aksiyonunun etiketi (`actionmap.ts`) ya da `case.respond` (motorda karşılığı olmayanlar). Eşlemeler `docs/engine-api.md`.
- **Olaylar**: `cases/events.json` havuzu (E01-E12) + takvim olayları; günlük Bernoulli, `events.{legal,macro}_rate_mult` ile pazara ölçeklenir.
- **Finansman** (`funnel/financing.ts`): koşullu kredi/melek teklifleri, anüite geri ödeme, hisse maliyeti (`K.fin`, `fin.*` parametreleri ezer). **Pivot** (`ops.pivot`): segment değişimi, fiyat çarpanı, geçiş döneminde dönüşüm düşüşü, bekleme süresi.

## 15. Botlar ve denge

Politikalar: `naivePolicy` (geniş eşleme + akıllı teklif, takip yok, sık bütçe değişimi), `balancedPolicy` (iyi botun beceri anahtarları kısılmış hali), `carefulPolicy` (takip önce, exact/phrase, negatif, A/B + kazanan seçimi,
marjinal CAC'ye göre bütçe, vaka tepkileri). Kapsam dışı: botlar Meta/GEO/holdout kullanmaz; oyuncu için daha geniş strateji alanı vardır. Pazar ipucu olarak oyuncunun gördüğü mesaj eğilimini kullanırlar.

Hedef **dengeli kanal karışımı**: iyi oyuncunun müşterilerinin yaklaşık yarısı ücretli reklamdan, kalanı içerik ve yerel kanallardan gelir; pazarlama yapmayan oyuncu büyüyemez.

Nihai Monte Carlo (`npm run mc -- --runs=50`, 365 gün, normal, salon-saas):

| Pazar | Pazarlamasız: kazanılan müşteri | Orta MRR | İyi MRR | İyi: reklam payı | İyi: reklam CAC | İyi: kazandı / sağlıklı / battı | P(orta > iyi) |
|---|---|---|---|---|---|---|---|
| US | 5 | 1.626 USD | 2.237 USD | %50 | 502 USD | 9 / 20 / 1 | 0,12 |
| DE | 3 | 855 EUR | 1.345 EUR | %47 | 456 EUR | 6 / 15 / 4 | 0,06 |
| TR | 3 | 14.193 TRY | 26.360 TRY | %39 | 2.608 TRY | 2 / 22 / 0 | 0,06 |

Denge kararları:
- Organik ve içerik hacmi düşürüldü; GBP organikten ayrıldı. Önceki ekonomide hiçbir şey yapmayan oyuncu yılda ~54 müşteri kazanıyor, reklam müşterilerin ~%5'ini getiriyordu.
- Reklam hunisi beyan edilen veri aralıkları içinde iyileştirildi (`gads.search.cpc`, `gads.search.cvr_lead`, `funnel.lead_qualified`, `funnel.trial_to_paid`); önceki değerlerle reklam CAC'ı LTV'nin üstündeydi.
- İlk yıl hedefleri: 70 müşteri, tam yüklü LTV:CAC ≥ 1,5, payback ≤ 18 ay. 90 gün: 14 müşteri, ≥ 0,8, ≤ 24 ay. Olgun SaaS'ın 3 kuralı burada uygulanmaz: CAC kurucu saatini de taşır, ilk yıl ölçek yoktur.
- TR başlangıç nakdi USD eşitliği yerine 200/400/800 bin TRY.
- İyi bot bütçeyi gözlenen kanal CAC'ı ve 15 aylık geri ödeme kuralıyla yönetir. Erken churn LTV'yi düşük gösterdiği için kanal kararında LTV kullanılmaz.
- Hızlı kipte iyi-orta farkı dardır: 90 gün, becerinin ve deneme sonuçlarının birikmesi için kısadır.

Kabul testleri: `engine/bots/acceptance.test.ts` (sıralama, batış, kazanma tavanı, yayılım, zorluk, hızlı kip, karar isabeti, yeniden oynatma, pazarlamasız taban, reklam payı, içerik kararlarının CAC etkisi), `engine/cases/cases.test.ts` (tanım tutarlılığı, her vaka üç pazarda gerçek aksiyonlarla tetiklenir,
doğru tepki yanlıştan iyi), `ui/game/plan.test.ts` (başlangıç kuyruğu eksiksiz kurulur), `engine/quality/content.test.ts` (mesaj, konu, reklam grubu odağı).

## 16. Bilinen varsayımlar / sınırlamalar

GEO, yerel kanallar ve holdout bilinçli olarak basit tutuldu; bayi/ajans kanalı yok; rakip ajanları tek bir `compIdx` rassal yürüyüşü. 153 parametre kaynaksız varsayımdır (`npm run data:audit`); reklam benchmark'ları çoğunlukla ikincil kaynaktır.
İskelet senaryolar (`b2b-accounting-saas`, `subscription-box`) çalışır ama dengeleri ayarlanmamıştır.
