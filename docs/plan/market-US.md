# Pazar Profili Taslağı: ABD (United States)

Ürün: berber/kuaför/salon randevu + müşteri yönetimi SaaS'ı (SMB). Erişim tarihi: **2026-10-31**. Taslak, Aşama 0 (planlama).

Katman kısaltmaları: **[K]** Kaynaklı, **[T]** Türetilmiş, **[V]** Varsayım.
Güven: yüksek / orta / düşük. "Yayın tarihi" sayfada görülemediyse "belirtilmemiş" yazıldı. Bir sayı yalnızca arama sonucunda veya açılan sayfada gerçekten görüldüyse kaynak olarak listelendi. Birçok sayı arama özetinden (ikincil) geldi; bu "orta" güven olarak işaretlendi.

---

## 1. Google Ads (Arama)

| Metrik | Değer | Katman | Kaynak / tarih / erişim | Güven |
|---|---|---|---|---|
| Tüm sektör ort. CTR | %6,64 | K | WordStream "Google Ads Benchmarks 2026", https://www.wordstream.com/blog/2026-google-ads-benchmarks (13.000+ kampanya, 23 sektör, Nis 2025-Mar 2026 verisi; yayın günü belirtilmemiş). Erişim 2026-10-31 (arama özeti; sayfa doğrudan açılamadı, 403) | orta |
| Tüm sektör ort. CPC | $5,42 | K | Aynı | orta |
| Tüm sektör ort. dönüşüm oranı | %8,18 | K | Aynı | orta |
| Beauty & Personal Care: CPC / CTR / CVR | $4,62 / %6,75 / %10,35 | K | WordStream 2026 değerleri, arama sonucunda üçüncü taraf özet (https://megadigital.ai/en/blog/google-ads-benchmarks/) üzerinden görüldü; WordStream sayfasında birebir doğrulanamadı | düşük-orta |
| Personal Services: CPC / CTR / CVR | $7,17 / %7,16 / %12,34 (CPC 2025'e göre +%23,41) | K | Aynı (ikincil özet) | düşük-orta |
| En yüksek CPC sektörleri (bağlam) | Hukuk $9,87; Ev iyileştirme $8,33; Diş $8,00 | K | WordStream 2026 (arama özeti) | orta |

Notlar:
- "Dönüşüm" burada platform tanımlı (form/arama/aksiyon); SaaS deneme kaydı dönüşümü bundan çok daha düşüktür. B2B SaaS'a özgü CPC/CVR için güvenilir kaynak bulunamadı.
- **[V] SaaS-spesifik anahtar kelimeler** ("salon booking software", "barber appointment app"): CPC $3-$12, tıklama->deneme kaydı %3-%8, aralık. Gerekçe: Personal Services CPC'si + yazılım niyeti; CVR genel ortalamadan düşük çünkü kayıt zorunlu. Güven: düşük.

## 2. Meta Ads

| Metrik | Değer | Katman | Kaynak | Güven |
|---|---|---|---|---|
| ABD CPM | ~$20,48 (genel); 2025'te $20,41'den Oca 2026'da $17,12'ye; ABD ort. $22,20 vs global $19,81 | K | Arama özetleri: https://affectgroup.com/blog/meta-ads-cpm-in-the-us-2025-benchmarks-for-facebook-and-instagram/ ve https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/united-states (yayın tarihleri belirtilmemiş; 2025 verisi). Sayfalar tam açılmadı | düşük-orta |
| ABD CPC | ~$1,12; Oca $1,29, Ara $1,16, Kasım zirve $1,46 | K | Aynı grup (affectgroup / superads, arama özeti) | düşük-orta |
| CTR (tüm sektör) | ~%0,9 (aralık %0,5-%1,6); trafik kampanyası %1,71 | K | WordStream 2025 Facebook benchmarks (https://www.wordstream.com/blog/facebook-ads-benchmarks-2025) ve diğer özetler; birebir doğrulanamadı | düşük-orta |

Tazelik: Q4 CPM sıçraması (Kasım zirvesi) oyun için mevsimsel CPM çarpanı olarak kullanılabilir **[T]** (Kasım CPC / yıllık ort. = 1,46/1,12 ≈ 1,30).
**[V]** Meta'dan SaaS deneme kaydı maliyeti: lead başına $15-$60 (CPC $1,1 / tıklama->kayıt %2-%7). Güven: düşük.

## 3. SaaS Benchmark, Ödeme, Vergi

| Metrik | Değer | Katman | Kaynak | Güven |
|---|---|---|---|---|
| SMB SaaS aylık logo churn | ort. %3-%7; kaynaklarda %4,1 ve %4,7 ortalamaları; <%2,5 üst çeyrek | K | Arama özetleri (Kalungi https://kalungi.com/blog/saas-churn-rate-benchmarks vb., yayın tarihi belirtilmemiş) | düşük-orta |
| Trial->ücretli | ChartMogul Ocak 2026 analizi: serbest deneme medyanı %8 (200 ürün); geniş aralık <%2 ile >%40; kart almayan denemeler tipik %10-20 | K | Arama özeti (ChartMogul kaynak olarak anıldı, birincil sayfa açılmadı) | düşük |
| Stripe ABD kart ücreti | %2,9 + 30¢ (yurtiçi kart); elle girişli +%0,5; uluslararası +%1,5; kur +%1 | K | https://stripe.com/pricing, açıldı, 2026-10-31 | yüksek |
| Rakip işleme oranları | Booksy kart okuyucu %2,49+$0,10; mobil/keyed %2,69+$0,30 (biz.booksy.com); GlossGenius yüz yüze %2,4+$0,15, online %2,9+$0,30 | K | Bkz. bölüm 7 | orta-yüksek |
| SaaS satış vergisi | Eylül 2026 itibarıyla 22 eyalet + DC SaaS'ı kısmen/tamamen vergilendirir, 23 eyalet genelde vergilendirmez, 5 eyalette (AK, DE, MT, NH, OR) eyalet satış vergisi yok. **California SB 122 (29 Haz 2026 imza) ile dijital ürünler/SaaS 1 Ocak 2027'den itibaren vergilendirilecek**; Colorado da 1 Oca 2027 | K | https://trykintsugi.com/blog/sales-tax-on-saas.md ve https://taxcloud.com/blog/saas-sales-tax-by-state/ (arama özeti; yasa metni açılmadı) | düşük-orta |
| Ekonomik nexus | Eyalete göre eşikler; kayıt/tahsilat gereği (örn. çoğu eyalette $100k satış eşiği) | V | Genel bilgi, bu oturumda doğrulanmadı | düşük |
| CAC | $150-$600 (ücretli müşteri başı, ücretli kanal), aralık | V | Gerekçe: CPC $3-12 -> kayıt %5 -> trial->paid %10-20 => CAC ≈ CPC/(0,05*0,15) = $400-$1.600 aşırı uç; makul orta bölge $300-$900. Güven: düşük | düşük |
| ARPA | ~$30-$80/ay (solo $30, ekip $50-$110, bölüm 7) | T | Rakip fiyatlarından | orta |
| LTV | ARPA x brüt marj / churn: örn. $50 x %0,8 / %5 = **$800** | T | Formül; marj %80 varsayımı [V] | düşük |
| LTV/CAC | ~1-3 (ücretli kanallarda zorlu) | T | Yukarıdan | düşük |

## 4. Gizlilik / Onay

- **CCPA/CPRA (California)**: Eşikler 1 Oca 2025'ten itibaren: yıllık brüt gelir $26,625M, 100.000+ tüketici/hane veya gelirin %50+ veri satışından/paylaşımından. İdari ceza $2.663 / ihlal ($7.988 kasıtlı/16 yaş altı). Bir sonraki CPI ayarı 1 Oca 2027 (tek yıllarda yapılır). Kaynak: https://www.cppa.ca.gov/regulations/cpi_adjustment.html (açıldı, 2026-10-31) Güven: yüksek. GPC (Global Privacy Control) opt-out sinyali gereği: arama özeti, orta.
  - Oyun yorumu: Küçük startup tek başına eşiklere girmeyebilir; ama reklam teknolojisi ("paylaşım") ve müşteri verisi işleyici (service provider) olarak salonların sorumluluğu devredilir. **[V]**
- **Eyalet yasaları**: Birden çok eyalette kapsamlı gizlilik yasası var (Virginia, Colorado, Connecticut, Texas vb.). Bu oturumda sayı/liste doğrulanmadı; **[V]** "yama çorbası" riski olarak modellenmeli. Güven: düşük.
- **Rıza modeli**: AB'den farklı olarak çoğunlukla **opt-out** (kayıt dışı bırakma). Çerez banner'ı ABD'de zorunlu değil (CA'da "Do Not Sell/Share" bağlantısı + GPC). Opt-in/reddetme oranı için güvenilir ABD verisi bulunamadı. **[V]** Ölçülebilir kullanıcı oranı %85-%95 (Almanya'da çok daha düşük). Güven: düşük.
- **ATT (iOS)**: Mayıs 2021'de ABD'de yalnızca %4 aktif opt-in (Flurry; https://www.macrumors.com/2021/05/07/most-iphone-users-app-tracking-opt-out/). **TAZELİK UYARISI: >12 ay eski (2021).** 2025 Nisan'da Fransa ~%51, Almanya %47 (arama özeti, bkz. emarketer; sayfa 403). ABD güncel oranı doğrulanamadı. **[V]** Güncel ABD opt-in %15-%35. Güven: düşük. Etkisi: Meta uygulama içi/iOS atıf kaybı, CAPI ve modellenmiş dönüşümlerle kısmen telafi.

## 5. Soğuk İletişim

- **CAN-SPAM (e-posta)**: Opt-in şart değil (B2B soğuk e-posta yasal), ancak: gerçek gönderici bilgisi, fiziksel adres, çalışan opt-out (10 iş günü), yanıltıcı konu yasak. Maks. ceza **$53.088 / e-posta** (FTC enflasyon ayarı, Oca 2025). Kaynak: arama özeti (legalmatch.com ve tomba.io; FTC sayfası açılmadı). Güven: orta.
- **TCPA (SMS/arama)**: Pazarlama SMS'i ve otomatik arama için önceden açık yazılı onay gerekir; yasal tazminat **$500 / mesaj**, kasıtlı ihlalde **$1.500** (3 katı). Kaynak: arama özetleri (mytcrplus.com, jdsupra, mondaq; yayın tarihi değişken), orta. FCC "one-to-one consent" kuralının güncel durumu bu oturumda doğrulanmadı **[V]**.
  - Salon müşterilerine randevu hatırlatma SMS'i işlem bildirimi niteliğinde; salonun kendi iş ilişkisi var. Bizim salon sahibine soğuk SMS'imiz ise TCPA'ya tabidir. Soğuk SMS = yüksek risk. Soğuk arama: Do-Not-Call listesi (B2B muaf kısmen; bu oturumda doğrulanmadı).
- **A2P 10DLC**: 1 Şubat 2025'ten itibaren operatörler kayıtsız 10DLC trafiğini bloklar; kayıt (marka + kampanya) zorunlu. TCR ücretleri (1 Ağu 2025): marka $4,50 (tek sefer), standart vetting $41,50. İçerik ihlali cezası T-Mobile'da $10.000'a kadar. Kaynak: arama özetleri (textbolt.com, freepbx.org, mytcrplus.com), orta.

## 6. Baskın İletişim Kanalı

- **SMS** baskın: randevu hatırlatma ve müşteri iletişiminde. İddialar: SMS açılma ~%98 (tedarikçi iddiası, taraflı), e-posta %20-%37; tüketicilerin %73'ü randevu hatırlatması için SMS tercih eder; SMS hatırlatmaları no-show'u %50 azaltır (sağlayıcı pazarlama kaynakları, ör. https://trumpia.com/blog, schedulingkit.com; yayın tarihleri belirtilmemiş). Güven: **düşük** (satıcı kaynaklı).
- **E-posta**: ikincil; salon sahibi (karar verici) için soğuk e-posta + telefon.
- **WhatsApp**: Pew 2025'e göre ABD yetişkinlerinin **%32'si** kullanır (2021: %23); Hispanik %54, Asyalı %51, Siyah %31, Beyaz %20. WhatsApp ABD'de 100M+ aylık aktif kullanıcı (Meta, Orta 2024; **tazelik uyarısı: >12 ay**). Kaynak: Pew "Americans' Social Media Use 2025" (20 Kas 2025), https://alpha.pewresearch.org/pewresearch-org/internet/2025/11/20/social-media-use-2025-appendix/print (arama sonucunda görüldü; tam sayfa açılmadı). Güven: orta. Yorum: WhatsApp salon iletişiminde genel kanal DEĞİL, etnik/bölgesel niş (Miami, LA, NYC) **[V]**.

## 7. Rakipler (doğrulama durumu açık)

| Rakip | Fiyat modeli | Doğrulama |
|---|---|---|
| **Vagaro** | $23,99/ay (ilk 6 ay tanıtım) -> $30/ay; ek personel lisansı $10/ay (7'ye kadar, sonrası ücretsiz); 30 gün deneme | https://www.vagaro.com/pro/pricing , açıldı 2026-10-31. Yayın tarihi belirtilmemiş. Güven: yüksek (işleme oranı sayfada çıkmadı: doğrulanamadı) |
| **Booksy** | $29,99/ay ilk kullanıcı + $20/ay ek personel; Boost: ilk ziyaret toplamının %30'u (maks. $100); işleme: okuyucu %2,49+$0,10, mobil/keyed %2,69+$0,30, Tap to Pay %2,49+$0,20; 14 gün deneme, kart yok | https://biz.booksy.com/en-us/pricing , açıldı 2026-10-31. Güven: yüksek |
| **GlossGenius** | Beauty & Wellness: Standard $24/ay, Gold $48/ay, Platinum $148/ay (yıllık faturalama); MedSpa $148/$248; işleme yüz yüze %2,4+$0,15, online %2,9+$0,30 | https://www.glossgenius.com/pricing , açıldı 2026-10-31 (sayfada işleme oranı yer tutucu, SSS'den okundu). Güven: orta-yüksek |
| **Square Appointments** | Free / Plus / Premium üç kademe + Square Pro ($250k+/yıl işleme); Plus ve Premium deneme var. **Dolar fiyatları resmi sayfadan okunamadı** (sayfa içeriğinde yok). İkincil kaynaklarda Plus $29/ay/lokasyon, Premium $69 veya $85 (tutarsız) | https://squareup.com/us/en/appointments/pricing ; fiyat: **doğrulanamadı** (ikincil: koalendar.com, düşük) |
| **Fresha** | Fetch sonucu "$415/ay bağımsız, $275/üye" gibi değerler döndü; bunlar ABD gerçekçi aralığının çok dışında (muhtemelen farklı para birimi/bölge), **ABD fiyatı doğrulanamadı**. Fresha'nın modeli (ücretsiz çekirdek + işleme/pazaryeri ücreti) bu oturumda teyit edilmedi | https://www.fresha.com/pricing , güvenilmez; kullanılmamalı |
| Boulevard | Bu oturumda araştırılmadı | doğrulanamadı |

Önerilen oyun rakipleri: Vagaro, Booksy, Square Appointments (fiyatları Square için "tahmini" etiketle). Fiyat noktası **[T]**: solo $24-$30, 5 kişilik salon ~$50-$110/ay.
Tazelik: fiyat sayfaları canlı; yayın tarihi yok. Oyunda "2026-10-31 itibarıyla" yazılmalı.

## 8. Mevsimsellik ve Tatiller

- **Salon talep zirveleri** (nitel, ikincil kaynaklar, Skipcalls vb. "arama hacmi pik haftalarda %30-%60 artar"): Nisan-Mayıs (prom, mezuniyet), Haziran-Eylül (düğün sezonu), Kasım-Aralık (tatil partileri, hediye kartı, Black Friday; en yoğun aylar). Kaynak: https://skipcalls.com/resources/seasonal-calls/hair-salon , https://biz.booksy.com/en-gb/blog/why-black-friday-works-for-the-hair-and-amp-beauty-industry-v (yayın tarihi belirtilmemiş). Güven: düşük-orta. Not: Ocak-Şubat durgun **[V]**.
- **Önemli**: Salon yoğun olduğunda salon sahibi yazılım alıma ZAMAN ayıramaz; satın alma/denemeye geçiş Ocak-Şubat veya Ağustos sonu daha olası **[V]**, düşük güven.
- **ABD federal tatiller (2026)**: Oca 1, MLK (3. Pzt Oca), Presidents Day (3. Pzt Şub), Memorial Day (son Pzt Mayıs), Juneteenth (19 Haz), Independence Day (4 Tem), Labor Day (1. Pzt Eyl), Columbus/Indigenous Peoples (2. Pzt Eki), Veterans Day (11 Kas), Thanksgiving (4. Per Kas), Christmas (25 Ara). Genel bilgi, federal liste yaygın bilinir; bu oturumda OPM sayfası açılmadı. Güven: orta-yüksek.
- Reklam maliyeti: Q4 CPM/CPC zirvesi (Black Friday-Siber Pazartesi, Kasım CPC $1,46) -> salon sahibine ulaşmak pahalı, ama salon sahibi meşgul.

## 9. Pazar Büyüklüğü

| Segment | Sayı | Kaynak | Güven |
|---|---|---|---|
| Güzellik salonu (NAICS 812112), işveren işletme | **84.176** (2023) ve nonemployer dahil ~241.035 toplam girişim | Arama özeti: Census County Business Patterns 2023 (ikincil aktarım: startbusinessbystate.com/salon-industry-statistics/) | düşük-orta |
| Berber dükkanı (NAICS 812111) | 7.363 işletme; 8.216 firma (2024 yıllık ort.); ~36.318 toplam girişim (nonemployer dahil) | Arama özeti (smbdensity..., naicslist vb.), kaynaklar tutarsız | düşük |

Türetilmiş toplam adreslenebilir pazar **[T]**: ~91k işveren + ~270k toplam tek kişilik dahil. Oyunda SMB hedef havuzu: ~300k (nonemployer dahil), yalnızca işverenler ~90k. Güven: düşük-orta. Birincil Census/BLS tablosu doğrudan açılmadı: kullanmadan önce doğrula.

## 10. Para Birimi, Format

- Para birimi: **USD ($)**; ondalık nokta, binlik virgül: `$1,234.56`.
- Tarih: **MM/DD/YYYY** (ör. 10/31/2026), saat 12 saatlik AM/PM. Saat dilimleri: ET/CT/MT/PT (eyalete göre, randevu hatırlatmaları için önemli).
- Telefon: +1 (XXX) XXX-XXXX. Ölçü: mil, °F. Hafta Pazar başlar (takvim varsayılanı).
- Not: Fiyatlar vergi hariç gösterilir (satış vergisi ödeme anında eklenir).
 
---

## Oynanışa Etkisi (ABD vs. Almanya vs. Türkiye)

| Boyut | ABD | Karşılaştırma ve oyun mekaniği |
|---|---|---|
| **Ölçüm kaybı** | Orta. Çerez rızası çoğu yerde opt-out, yani tarayıcı tabanlı ölçüm çoğunlukla kalır; iOS ATT zayıf opt-in (2021'de %4, güncel ABD oranı doğrulanamadı) yüzünden Meta atfı kaybı yüksek. | Almanya: rıza opt-in, web ölçümü ciddi kayıp, GA/consent mode modellemesi kritik. Türkiye: ölçüm kaybı düşük ama platform raporlarına abartı. ABD'de "Meta raporu vs CRM" farkı büyük, Google güvenilir; CAPI/server-side aksiyonu ABD'de değerli. |
| **Yasal kısıt** | Yüksek *cezai* risk, düşük *ön-izin* sürtünmesi: CAN-SPAM opt-out; ama TCPA SMS/arama $500-$1.500 per mesaj; 10DLC kayıtsız SMS tamamen bloklu. | Almanya: soğuk e-posta/telefon (UWG) çok kısıtlı, ön izin gerekir. Türkiye: izin (İYS) zorunlu ticari ileti. ABD: soğuk e-posta serbest ama SMS/arama oyuncusu için "TCPA davası" olayı (nadir ama ağır, nakit şoku). 10DLC kaydı bir "altyapı aksiyonu" (zaman+nakit, onay bekleme gecikmesi). |
| **Kanal etkinliği** | Google Ads pahalı (Personal Services CPC $7,17, B&PC $4,62), Meta ucuz tıklama ($1,12) ama düşük niyet. Ücretsiz kanallar (GBP, yorum, yerel SEO) güçlü; SMS ve e-posta ile soğuk satış yasal sınırlı; WhatsApp zayıf (%32 kullanım, niş). | Almanya: Google/SEO baskın, rakip SaaS pahalı. Türkiye: WhatsApp ve telefon/saha çok güçlü, CPC düşük. ABD'de WhatsApp kanalı yerine SMS (10DLC) + telefon kullanılır; marketplace (Booksy Boost %30 komisyonu) bir alternatif kanal. |
| **Birim ekonomi** | Yüksek CAC ($300-$900 [V]), yüksek ARPA ($30-$110), SMB churn %3-%7/ay, Stripe %2,9+30¢. | Türkiye: düşük CAC, çok düşük ARPA, kur riski. Almanya: orta CAC, orta-yüksek ARPA, daha düşük churn (varsayım). ABD'de ödeme komisyonu gelir kalemi olabilir (rakipler işlemeden kazanıyor), kur riski yok, LTV/CAC dar. Vergi: CA/CO 2027 SaaS vergisi yıl-içi olay (fiyat/tazminat etkisi). |
| **Olay sıklığı** | Orta-yüksek: hukuki (TCPA, 10DLC, vergi nexus), mevsimsel (prom/düğün/Q4), rakip fiyat kampanyaları (Vagaro $23,99), CPM şoku (Q4). Rastgele ama ağır ("kuyruk riskli") olaylar. | Almanya: daha az ama yönetmelik kaynaklı sürekli sürtünme (DSGVO). Türkiye: makro şoklar (kur, enflasyon) sık. ABD: olay frekansı hukuk+Q4'e bağlı; yasal olaylar nadir ama nakdi etkisi yüksek. |

Önerilen mekanik farklar (sadece çarpan değil): (1) ABD'de "10DLC/TCPA uyum" proje aksiyonu, yapılmazsa SMS kanalı kapalı; (2) iOS atıf kaybı: Meta panel raporu şişkin/belirsiz, Google güvenilir; (3) Q4 CPM/CPC dalgası ve talep zirvelerinde salon sahibi dönüşümü düşük (yanıt gecikmesi); (4) işleme geliri (Stripe %2,9+30¢) ikinci gelir akışı mekaniği; (5) satış vergisi/nexus eyalet olayı.

---

## Özet: Kaynaklı vs. Varsayım

**Kaynaklı (en güvenilir):** Stripe %2,9+30¢ (yüksek); Vagaro, Booksy, GlossGenius fiyatları (yüksek/orta-yüksek, resmi sayfalar açıldı); CCPA eşikleri/cezaları (yüksek, cppa.ca.gov).
**Kaynaklı ama ikincil/özet (orta-düşük):** WordStream 2026 genel CTR/CPC/CVR ve Beauty/Personal Services değerleri; Meta CPM/CPC/CTR; SMB churn %3-7; trial->paid; SaaS vergi durumu (CA/CO 2027); CAN-SPAM/TCPA/10DLC rakamları; Pew WhatsApp %32; salon sayıları (Census CBP 2023 ikincil aktarım).
**Doğrulanamadı:** Square dolar fiyatları, Fresha ABD fiyatı, Boulevard, ABD güncel ATT oranı, FCC one-to-one kuralı durumu, ABD çerez reddi oranı, B2B SaaS'a özgü Google CVR.
**Varsayım (düşük güven):** SaaS kelime CPC/CVR aralıkları, Meta kayıt maliyeti, CAC $300-$900, LTV (formül), eyalet gizlilik yasası sayısı, güncel ATT opt-in %15-35, opt-out çerez kabulü %85-95, satın alma mevsimselliği, TAM toplamı.
**Tazelik uyarıları (>12 ay):** ATT %4 (2021), WhatsApp 100M MAU (Orta 2024); bu oturumda yayın tarihi görülemeyen tüm ikincil kaynaklar yayın tarihi "belirtilmemiş" diye işaretlendi.
