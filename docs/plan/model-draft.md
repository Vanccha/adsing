# Simülasyon Modeli Taslağı (Aşama 0)

Durum: taslak. Bu dokümanda **pazar sayısı yoktur**; yalnızca parametre adları, yapı ve formüller tanımlanır. `⟨param⟩` ile yazılanlar `data/` altında 3 katmanlı (sourced/derived/assumption) değerlerle doldurulur. Köşeli örnek eşikler (ör. 30 dönüşüm / 30 gün, 50 olay / 7 gün) bile **varsayım katmanında** ve düşük güvenle başlar; kaynak doğrulanınca sourced'a taşınır.

## 1. Günlük adım döngüsü

`step(state, actions)` bir oyun gününü ilerletir. Sıra sabittir (determinizm için):

1. **Olaylar**: tohumlu olay çekilişi (mevsim, politika değişikliği, kriz, vergi tarihi). Olaylar durum üzerinde geçici "modifier" kaydı bırakır.
2. **Oyuncu aksiyonları uygulanır** (kurucu saati harcanır, bütçe/teklif/yaratıcı değişir, değişiklik bayrakları öğrenme sıfırlamayı tetikler).
3. **Rakipler**: rakip bütçe/teklif/mesaj güncellemesi (kural tabanlı ajanlar), fiyat kırma olayı varsa uygulanır.
4. **Kanal açık artırması / teslimat**: her kanal için gösterim, tıklama, harcama üretilir (bkz. 2, 3).
5. **Huni**: tıklama > açılış sayfası > form/lead (bkz. 8).
6. **Satış süreci**: lead kuyruğu, yanıt süresi, görüşme, kapanış (lead decay).
7. **Deneme / aktivasyon**: deneme başlangıçları, aktivasyon olasılığı, onboarding kalitesi.
8. **Faturalama**: abonelik tahsilatı, ödeme hataları (dunning), komisyonlar (bayi, ödeme sağlayıcı, uygulama mağazası varsa).
9. **Churn**: kohort bazlı hazard uygulanır.
10. **Nakit**: gelir, harcama, maaş/araç giderleri, vergi karşılıkları, KDV/sales tax, ödeme gecikmesi.
11. **Ölçüm / raporlama**: gerçek (motor-içi "doğru") ve gözlenen (platform, analitik, CRM) metriklerin ayrı üretilmesi. UI yalnızca gözlenen katmanı oyuncuya gösterir (gerçek katman sonuç analizinde açılır).

Her adımda RNG alt akışları ayrıdır (`rng.fork("ads.google.d123")`) ki bir aksiyonun eklenmesi tüm sonraki rastgeleliği kaydırmasın.

## 2. Google Ads (Arama)

**Açık artırma.** Her sorgu için: `AdRank_i = bid_i × QS_i^α × ctxBoost_i` (`⟨gads.rank.alpha⟩`; bağlam = cihaz, konum, saat, uzantı etkisi). Pozisyon rank sırasıyla; ödenen CPC ≈ `AdRank_{i+1} / QS_i + ε` (ikinci fiyat benzeri). QS gösterilen 1-10 ölçeğe yuvarlanmış, gerçek değer sürekli.

**QS bileşenleri** (hepsi gizli latent):
- `expectedCTR` (anahtar kelime+reklam metni latent `q_ad`),
- `adRelevance` (anahtar kelime ↔ reklam metni ↔ arama niyeti uyumu),
- `lpExperience` (LP latent `q_lp`, hız, mobil, mesaj uyumu).
`QS = f(w1·eCTR + w2·rel + w3·lp)`; ağırlıklar parametre. Oyuncuya yalnızca "Ortalama / Ortalamanın üstü / altı" bantları gösterilir (gerçek değerler gizli).

**Eşleme türleri ve arama terimi sızıntısı.** Eşleme: `exact | phrase | broad`. Her eşleme için kapsama dağılımı `P(sorgu sınıfı | eşleme)`; sorgu sınıfları: `hedef` (niyetli), `komşu`, `alakasız`, `bilgi` (iş arayan, ücretsiz arayan, rakip-marka). Broad'da alakasız/bilgi payı yüksek (`⟨gads.match.broad.leak⟩`), exact'ta düşük ama hacim de düşük. Alakasız sorgu TO'su ≈ 0 ama tıklaması paradır > "bütçe yakma".

**Negatif kelime.** Oyuncu negatif kelime ekleyince ilgili sorgu sınıfı tıklaması elenir; ancak oyuncu "arama terimleri raporu"nu inceleyerek (kurucu saati harcar) bunları keşfeder. Fazla negatif = hedef trafiği de keser (yanlış pozitif parametresi).

**Gösterim payı.** `IS = IS_kazanılan / uygun`; kayıp iki nedenle ayrılır: `IS_lost_budget` (günlük bütçe erken tükenir, bütçe/hacim oranından) ve `IS_lost_rank` (rank yetersiz). Rapor bunları ayrı gösterir; doğru tepki nedene bağlıdır.

**Akıllı teklif öğrenme dönemi.** Durum: `learning | stable | limited`. Öğrenmeden çıkış koşulu: son `⟨gads.smart.window_days⟩` günde ≥ `⟨gads.smart.min_conversions⟩` *takip edilen* dönüşüm (varsayım örneği 30/30). Öğrenmede teklif varyansı yüksek (`σ_learn`), sabit durumda düşük. Büyük teklif/bütçe/hedef değişikliği → `learning`'e dönüş (kısmi veya tam; parametre). **Takip bozulursa** algoritma yanlış sinyalle optimize eder: gözlenen dönüşüm azalır, teklif düşer, hacim çöker ("takip bozulunca akıllı teklif bozulur").

**PMax kontrol kaybı.** Kampanya türü `pmax`: kanal karışımı ve sorgu eşlemesi oyuncuya kapalı; daha fazla ham hacim, daha az şeffaflık: marka sorgusu yamama (marka trafiğine atıf), gözlenen CPA iyi ama artımsallık düşük (`⟨pmax.brand_cannibalization⟩`). Oyuncunun kontrol kolları: varlık grubu, kitle sinyali, marka dışlama (varsa), dönüşüm hedefi. Rapor ayrıntısı sınırlı.

## 3. Meta Ads

**Açık artırma.** Toplam değer: `TotalValue = bid × estimatedActionRate + userValue(kalite)`. Teslimat fiyatı CPM olarak çıkar; CPM = f(rekabet yoğunluğu, hedef kitle boyutu, mevsim, yaratıcı kalitesi). Tıklama ve sonuç: `CTR` yaratıcı ve kitleye bağlı, `CVR` LP'ye bağlı.

**Öğrenme aşaması.** Reklam seti `learning` ↔ `active` ↔ `learning_limited`. Çıkış: `⟨meta.learn.events⟩` optimizasyon olayı / `⟨meta.learn.window_days⟩` gün (örnek 50/7, varsayım). Koşulu sağlamayan set `learning_limited`: yüksek maliyet ve dalgalı teslimat. **Önemli düzenleme** (bütçe sıçraması eşiği, hedef/kitle/yaratıcı değişikliği) öğrenmeyi sıfırlar. Küçük bütçeyle çok sayıda reklam seti = hepsi sınırlı (bölünmüş veri).

**Yaratıcı yorgunluğu.** Frekans `f` (kişi başına gösterim). `CTR_eff = CTR0 × exp(−λ·max(0, f − f0))` ve `CVR` / alaka puanı da düşer; kitle küçükse f hızlı artar. Yeni yaratıcı → taze, ama öğrenmeyi etkiler. Kitle büyüklüğü ve bütçe oranı yorgunluk hızını belirler.

**Advantage+.** Otomasyon modu: daha geniş kitle, otomatik yaratıcı kombinasyonu, daha az kontrol. Verim = latent yaratıcı kalitesi iyi ve veri bol ise yüksek; veri azsa ve takip kötüyse zayıf. Marka/mevcut müşteri payı atıf şişmesi riski.

## 4. Gizli kalite değerleri ve keşif

Her teklif (offer), yaratıcı (creative), LP için latent `θ ∈ (0,1)`-tipi dönüşüm/etkileşim olasılığı, senaryo tohumundan çekilir. Oyuncu doğrudan göremez.

- **Keşif**: Beta-Binomial. Önsel `Beta(a0,b0)` (oyuncunun bildiği sektör ortalaması; `⟨prior.strength⟩`). `n` deneme, `k` başarı sonrası `Beta(a0+k, b0+n−k)`.
- **Gösterim**: posterior ortalama + %⟨ci.level⟩ güvenilir aralık; iki varyant karşılaştırmada `P(A>B)` (Monte Carlo veya kapalı form).
- **"Yeterli veri yok"**: aralık genişliği > `⟨min_ci_width⟩` veya `n < ⟨min_n⟩` ise UI etiketi. Oyuncu yine de karar verebilir ama gürültü cezasını yaşar (bkz. 5).
- **Çoklu test uyarısı**: çok sayıda varyantı aynı veriyle karşılaştırmak yanlış kazanan olasılığını artırır (motor bunu doğal olarak üretir, ayrı kural yok).

## 5. İstatistiksel gürültü

Gösterimler `Poisson(μ)` / Binomial'e yakın, tıklamalar `Binomial(imp, CTR)`, dönüşümler `Binomial(clicks, CVR)`. Aşırı yayılma için `NegBin` seçeneği (günlük etki, haftalık gün etkisi çarpanı). Küçük örnekte gözlenen metrikler latent'ten çok sapar. **Az veriyle karar cezası** zorunlu bir kural değil, doğal sonuçtur: oyuncu 8 tıklamalı bir varyantı "kazanan" ilan ederse, çoğu seferde gerçek en iyiyi kaçırır; Monte Carlo ile ortalama regret ölçülür (bkz. 12).

## 6. Ölçüm katmanı

Her metrik için **gerçek** (`true`) ve **gözlenen** (`observed_platform`, `observed_analytics`, `observed_crm`) ayrı üretilir.

- **Onay (consent) kaybı**: `observed = true × (1 − consentLoss_market)`, ardından modelleme (consent mode) kısmi telafi `⟨consent.recovery⟩`. Pazar farkı büyük (DE/AB sıkı, TR daha farklı rejim, US eyalet düzeyi).
- **Atıf şişmesi**: platform birden çok kanalın aynı dönüşümü talep etmesi: `Σ platform_reported_c ≥ true_total`. Pencere (tıklama/görüntüleme) ve view-through parametreleri.
- **View-through**: görüntüleme sonrası dönüşümü kanala yazma, artımsal katkısı `ϕ_vt` ≪ raporlanan.
- **Takip bozulması**: etiket bozuluyor (site güncellemesi olayı, çerez/iOS kısıtları) → `trackingHealth ∈ [0,1]`; gözlenen = true × trackingHealth. Düzeltme aksiyonu (kurucu saati + maliyet; sunucu tarafı takip, CRM geri bildirim/offline conversion import).
- **Platform ≠ CRM**: CRM gerçeğe daha yakın ama gecikmeli ve kısmi (manuel kayıt hatası).
- **Artımsallık**: `Conv_total = Base_organic(t) + Σ_c Incr_c(spend_c)`; `Base_organic` mevsim ve marka bilinirliğinden. Kanalın artımsal payı `incr_c = Incr_c / reported_c` (marka araması ve retargeting düşük).
- **Geo / holdout testi**: oyuncu bölgeleri ayırıp bir süre harcama keser/artırır; sonuç `Incr` tahmini + CI (gürültü, süre, bölge benzerliği). Test maliyeti: kaçırılan lead + kurucu saati. Yetersiz güç → belirsiz sonuç.

## 7. Marjinal CAC ve doygunluk

Kanal `c` için günlük harcama `s`, artımsal dönüşüm: Hill/üstel doygunluk
`Conv_c(s) = Cmax_c · s^h / (s^h + K_c^h)` (alternatif: `Cmax(1 − e^{−s/K})`),
`h ≤ 1` çoğu kanalda (`⟨sat.hill_h⟩`, `⟨sat.K⟩`, `⟨sat.Cmax⟩` kanal/pazar başına).
- Ortalama CAC: `CAC_avg(s) = s / Conv(s)`
- **Marjinal CAC**: `CAC_m(s) = ds / dConv = 1 / Conv'(s)`, `s` arttıkça artar (Conv içbükey olduğu sürece).
Rekabet: `K_c` rakip harcamasıyla büyür (aynı sonuç için daha çok para). UI "bir sonraki 100 birim" kaç artımsal müşteri getirir tahmini (belirsizlikle) gösterir.

## 8. Huni, satış süreci, yanıt süresi

Aşamalar: `impression → click → LP visit → form (lead) → qualified lead → (demo / deneme başlangıcı) → aktivasyon → ücretli → retained`.
- Her geçiş `p_stage` (latent teklif/yaratıcı/LP etkili); **huni her adımda daralır** (p ≤ 1 doğrulanır).
- **Yanıt süresi (lead decay)**: iletişim olasılığı `p_contact(Δt) = p0 · exp(−Δt/τ)` veya parçalı (ilk saat/ilk gün); `τ` kanal ve pazara göre. Kurucu saati ve otomasyon (otomatik yanıt, çevirici) ile `Δt` kısalır.
- **Satış kapasitesi**: görüşme/demo kuyruğu kurucu saati ya da satış elemanıyla sınırlı; kuyruk taşması = bekleyen lead bozulur.
- **Deneme → ücretli**: `p_pay = f(aktivasyon, ürün-pazar uyumu, fiyat, onboarding kalitesi)`.
- Nitelikli lead filtresi: ICP uyumu (salon tipi, boyutu) kanala göre değişir; kalitesiz lead hacmi yüksek ama dönüşümü düşük.

## 9. Churn, MRR, LTV, CAC, payback, nakit

- **Kohort churn**: her başlangıç kohortu için hazard `h(a) = h_base(market, segment) × g(onboardingQuality) × m(ürün_hatası, olay) × decay(a)`; ilk aylar yüksek (erken churn). Onboarding kalitesi = kurucu saati/otomasyon/dokümantasyon yatırımı fonksiyonu.
- **MRR**: `Σ aktif abone × ARPA` + genişleme − daralma − churn; hareket tablosu (new, expansion, contraction, churn).
- **LTV**: `ARPA × brüt marj / churn` (basit) ve kohort gözlenen LTV (oyun sonu tahmini); ikisi arasındaki fark UI'da gösterilir.
- **CAC**: tam yüklü (reklam + araç + satış zamanı değeri + komisyon) ve yalnızca reklam; blended vs kanal.
- **Payback**: `CAC / (ARPA × marj)` ay; kohort bazlı kümülatif nakit.
- **Nakit akışı**: gelir − değişken maliyet − sabit gider − reklam − vergi/komisyon; fatura-tahsilat gecikmesi; yıllık plan peşin nakit etkisi.
- **Vergi ve komisyon**: KDV/VAT/sales tax modelleri pazara göre (ayrı vergi tablosu, sourced); ödeme sağlayıcı komisyonu; bayi komisyonu; ödeme ve vergi sürprizi olay tipi. Oranlar ayrı data dosyasında, bu dokümanda sayı yok.

## 10. GEO (üretken arama / yanıt motoru görünürlüğü)

Gecikmeli, belirsiz, aralıklı etki:
- Görünürlük durumu `v(t)` (marka ve içerik varlıkları: yapılandırılmış veri, atıf alan içerik, yorum, forum varlığı).
- Yatırım `I(t)` etkisi gecikmeli: `v(t+1) = v(t) + gain·conv(I, kernel_lag) − decay`, kernel gecikme dağılımı (gamma), `⟨geo.lag_days⟩`.
- Etki **aralıklı**: günlük "bahsedilme" Bernoulli(`v`), model güncellemesi olayı `v`'yi sıçratabilir/düşürebilir.
- Ölçüm belirsiz: gözlenen "görünürlük skoru" gürültülü, örneklem küçük; trafik atfı zayıf (doğrudan/ana sayfa trafiğine karışır). Oyuncu nedenselliği zor kanıtlar (holdout imkânı çok sınırlı).
- Maliyet: kurucu saati ağırlıklı içerik üretimi; küçük nakit. Getiri: gecikmiş, yüksek varyanslı.

## 11. Kurucu saati bütçesi ve aksiyon maliyetleri

Günlük `⟨founder.hours_per_day⟩` (hafta sonu ayrı, tükenme/yorgunluk parametresi: ardışık fazla mesai → verimlilik kaybı). Her aksiyon tipinin tanımı:
`{ id, hours, cash, delayDays, risk, prerequisites, effects }`.
Örnek ailesi: kampanya kurma, arama terimi incelemesi, negatif kelime, A/B kurulumu, takip düzeltme, LP düzenleme, yaratıcı üretimi, lead'e yanıt, demo, onboarding çağrısı, yorum isteme, GBP optimizasyonu, içerik (GEO), geo testi, danışman/ajans tutma. Saat yetmeyen işlem kuyruğa girer (yarım yapılamaz). Ajans/araç saat satın alır ama kalite ve kontrol maliyeti ekler.

## 12. Kazanma/kaybetme ve sonuç analizi

- **Kaybetme**: nakit < 0 (runway tükendi) ve finansman yoksa; hesap kalıcı askıya; itibar eşik altı; kurucu tükenmesi.
- **Kazanma** (senaryoya bağlı): sürdürülebilir kârlılık, MRR hedefi + payback eşiği, runway ≥ N ay + büyüme. Çoklu sonuç kademesi (başarısız / hayatta / sağlıklı / ölçeklendi).
- **Sonuç analizi**: kararlar zaman çizelgesi, nedensel ekran: "gerçek vs gördüğün" metrikler.
- **Beceri vs şans ayrımı (karşı-olgusal koşu)**: aynı karar günlüğü `N` farklı tohumla yeniden oynatılır; oyuncunun sonucu bu dağılım içindeki yüzdelik konumu + "aynı tohumda alternatif karar" (ör. bot-iyi politika) ile karşılaştırılır. Böylece "kötü şans" ile "kötü karar" ayrılır. Karar günlüğü aksiyon listesini gün bazlı saklar, bu nedenle motorun deterministik olması kritik.

## 13. Otomatik test edilecek yapısal ilişkiler

1. Huni daralır: her aşama sayısı ≤ önceki aşama.
2. `CPC ≈ CPM / (1000 × CTR)` (tolerans, Poisson gürültüsü altında büyük n'de).
3. Marjinal CAC bütçeyle artar (monoton, doygunluk bölgesi).
4. Takip bozulunca akıllı teklif performansı bozulur (gözlenen dönüşüm↓, hacim/teklif↓).
5. Rekabet↑ ⇒ CPC/CPM↑ (veya hacim↓).
6. Platform raporu ≠ CRM (atıf şişmesi olan senaryoda platform ≥ gerçek).
7. Az veriyle karar, ortalamada daha kötüdür (Monte Carlo regret n küçükken daha büyük).
8. Aynı tohum + aynı aksiyonlar ⇒ aynı durum (deterministik).
9. Nakit muhasebesi tutarlı: `Δcash = Σ akışlar`; MRR hareket tablosu toplamı.
10. Değişiklikle öğrenme sıfırlanır.
11. Yanıt süresi↑ ⇒ lead dönüşümü↓ (monoton).
12. Negatif kelime ⇒ alakasız harcama↓ (aşırı negatiflemede hedef hacim↓).
13. Yaratıcı yorgunluğu: frekans↑ ⇒ CTR_eff↓.
14. Hiçbir rastgele çekiliş oyuncu aksiyon sırasından bağımsızdır (RNG alt akış izolasyonu).
15. Hiçbir olasılık [0,1] dışına çıkmaz, hiçbir stok negatif olmaz (invariants).

## 14. Bot stratejileri (denge/balans için)

Botlar `step` ile aynı API'den oynar; Monte Carlo ile dengeyi doğrular.
- **Kötü bot**: geniş eşleme, negatif yok, ölçüme bakmaz, sık değişiklik (öğrenmeyi sıfırlar), tek varyant "kazanan" ilanı 10 tıklamayla, lead'lere geç yanıt, onboarding'e yatırım yok.
- **Orta bot**: dengeli eşleme, aylık negatif, temel takip, yarı kural tabanlı test (minimum n), platform raporuna güvenir, bütçeyi performansa göre kaba artırır.
- **İyi bot**: takibi önce kurar, exact/phrase ile başlar, minimum veri eşiğiyle test, CRM'i referans alır, marjinal CAC'ye göre bütçe, hızlı yanıt, onboarding yatırımı, geo/holdout ile artımsallık kontrolü.
Beklenti: ortalama sonuç iyi > orta > kötü, ama dağılımlar örtüşür (şansın rolü görünür); hiçbir bot %100 kazanmaz ve her bot belirli tohumlarda kaybedebilir. Kabul ölçütleri aşamada belirlenir.
