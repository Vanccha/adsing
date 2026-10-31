# Vaka Kütüphanesi Taslağı (Aşama 0)

**Kaynak notu (tüm vakalar):** bileşik vaka, belirli bir şirket değil. Vakalar sektörde sık görülen hata kalıplarından türetilmiş kurgusal örneklerdir. Aşağıda dış kaynak URL'si **verilmemiştir**: Google/Meta yardım sayfalarına bu aşamada erişilip doğrulanmadı; Aşama 1'de ulaşılıp doğrulanan sayfalar `source{url,name,published,accessed}` alanıyla eklenecektir. Sayısal eşikler burada yoktur; `⟨parametre⟩` olarak data katmanından gelir. Pazar farkları nitelikseldir, sayılar `markets/` altında kaynaklanacak.

Vaka şablonu: `id`, `tetikleyici` (motor koşulu), `belirtiler` (oyuncunun göreceği metrikler), `doğru tepki`, `yanlış tepki`, `sonuçlar`, `pazar farkları`, `kaynak notu`.

---

## C01 `broad-match-burn` Geniş eşlemeyle bütçe yakma
- **Tetikleyici:** kampanyada `broad` eşleme baskın, negatif kelime listesi boş/yetersiz, `leak(alakasız+bilgi) > ⟨eşik⟩`.
- **Belirtiler:** tıklama ve harcama normal ya da yüksek, ama lead kalitesi düşük, TO düşük; arama terimleri raporunda "ücretsiz", "iş", "kurs", rakip adları; CPA gözlenen artar.
- **Doğru tepki:** arama terimleri raporunu incele (kurucu saati), negatif kelime ekle, exact/phrase'e kaydır, niyet gruplarını ayır.
- **Yanlış tepki:** bütçeyi artırmak, "Google yeterince öğrenecek" diye beklemek, tüm kampanyayı kapatmak (hedef trafik de gider).
- **Sonuçlar:** doğru: 1-2 haftada alakasız harcama düşer, hacim bir miktar azalır, CPA iyileşir. Yanlış: nakit erimesi, sahte "öğrenme" umudu.
- **Pazar farkları:** US: yüksek rekabet, sorgu çeşitliliği büyük. DE: dil/bileşik kelimeler, yasal "ücretsiz" ifadeleri. TR: sorgu hacmi küçük, hatalı yazım/yerel ifadeler, farklı CPC düzeyi.

## C02 `learning-limited-adset` Öğrenme sınırlı reklam seti
- **Tetikleyici:** çok sayıda reklam seti, her biri `optimizasyon olayı < ⟨meta.learn.events⟩ / ⟨window⟩`; sık düzenleme.
- **Belirtiler:** "öğrenme sınırlı" durumu, CPM/CPA dalgalı, teslimat düzensiz, sonuçlar günden güne tutarsız.
- **Doğru tepki:** setleri birleştir, bütçeyi tek sette topla, düzenlemeyi azalt, üst huni olayı optimize et (örn. lead) bir süre.
- **Yanlış tepki:** her gün teklif/kitle değiştirmek, daha çok set açıp bölmek.
- **Sonuçlar:** doğru: istikrarlı teslimat, daha düşük CPA zamanla. Yanlış: sürekli öğrenme sıfırlanır.
- **Pazar farkları:** TR'de kitle küçük, küçük bütçeyle sınır daha sık; US'de bütçe yeterliyse nadir; DE'de onay kaybı olay sayısını düşürür.

## C03 `creative-fatigue` Yaratıcı yorgunluğu
- **Tetikleyici:** frekans `f > f0`, kitle küçük, aynı yaratıcı uzun süredir yayında.
- **Belirtiler:** frekans yükselir, CTR düşer, CPM sabit/artar, yorumlarda olumsuzluk, CPA yavaş artış.
- **Doğru tepki:** yeni yaratıcı varyantları sıraya al, kitleyi genişlet ya da dönüşümlü kullan, yaratıcıları test et.
- **Yanlış tepki:** yalnız bütçe artırmak (frekansı yükseltir), kitleyi daraltmak.
- **Sonuçlar:** doğru: CTR toparlanır; yanlış: harcama başına sonuç daha da düşer.
- **Pazar farkları:** yerel işletme kitlesi küçük, TR'de daha hızlı yorgunluk; DE'de mesaj/yasal inceleme daha yavaş yaratıcı döngüsü.

## C04 `platform-overreport` Platform raporu şişmesi
- **Tetikleyici:** birden fazla kanal aynı dönüşümü talep eder, view-through yüksek, marka/retargeting payı yüksek; `Σ platform_reported > true_total`.
- **Belirtiler:** platform raporunda CPA harika, CRM'de ücretli müşteri az; kanal raporlarının toplamı CRM'den büyük.
- **Doğru tepki:** CRM'i referans al, holdout/geo testi, atıf penceresini sorgula, marka trafiğini ayır.
- **Yanlış tepki:** platform ROAS'ına göre ölçeklemek.
- **Sonuçlar:** doğru: bütçe gerçekten artımsal kanallara kayar; yanlış: marjinal CAC patlar, nakit erir ama "iyi görünür".
- **Pazar farkları:** DE: onay kaybı farklı bozar; US: tıklama/görüntüleme atıf tartışmaları; TR: CRM kaydı eksik olabilir, WhatsApp üzerinden kapanan satışlar görünmez.

## C05 `consent-signal-loss` Onay yönetimi nedeniyle dönüşüm kaybı
- **Tetikleyici:** onay bandı yeni/yanlış yapılandırıldı veya mevzuat olayı; `consentLoss` yükselir; modelleme kurulmamış.
- **Belirtiler:** gözlenen dönüşüm aniden düşer, harcama/tıklama aynı kalır; akıllı teklif teklifi düşürür, hacim çöker.
- **Doğru tepki:** onay modu/sunucu tarafı takip kur, CRM geri bildirimi (offline conversion) içe aktar, dönüşümü CRM ile çapraz kontrol et.
- **Yanlış tepki:** kampanyayı "çalışmıyor" diye kapatmak veya onay bandını kaldırmak (yasa riski).
- **Sonuçlar:** doğru: sinyal kısmi toparlanır; yanlış: ya hacim kaybı ya ceza/itibar.
- **Pazar farkları:** DE/AB: en sıkı, kayıp yüksek; US: eyalet bazlı; TR: kişisel veri mevzuatı (KVKK) ve farklı pratik.

## C06 `policy-violation-restriction` Politika ihlaliyle hesap kısıtı
- **Tetikleyici:** reklam metni/LP politika riskli iddia (örn. kanıtsız vaat, kısıtlı içerik), `accountHealth` düşer, uyarı olayı.
- **Belirtiler:** reklam reddi, hesap sağlığı uyarısı, teslimat durur; itiraz süreci gün sürer.
- **Doğru tepki:** reddi oku, içeriği düzelt, itiraz yaz, yedek kanal/organik hazırla, hesap sağlığı izle.
- **Yanlış tepki:** aynı reklamı yeniden gönderme, yeni hesapla dolanma (kalıcı askıya riski), politikaya aldırmamak.
- **Sonuçlar:** doğru: kısa kesinti; yanlış: kalıcı hesap kaybı = ana kanal kaybı.
- **Pazar farkları:** yerel reklam kuralları ve vaat/karşılaştırma yasaları pazarda farklı (DE'de karşılaştırmalı reklam, haksız rekabet hukuku daha sıkı).

## C07 `tracking-break` Takip kodu bozulması
- **Tetikleyici:** site/LP güncellemesi olayı, `trackingHealth` düşer; kampanya akıllı tekliflide.
- **Belirtiler:** gözlenen dönüşüm bir anda sıfıra yakın, tıklama normal, CRM'de lead gelmeye devam eder; teklifler birkaç gün içinde düşer.
- **Doğru tepki:** önce etiketi doğrula/düzelt, öğrenme dönemine hazır ol, CRM'den geri yükle, ölçüm uyarıları kur.
- **Yanlış tepki:** teklif/bütçe elle değiştirmek, kampanyayı durdurup yeniden kurmak.
- **Sonuçlar:** doğru: kısa dip, toparlanma; yanlış: algoritma zehirlenir, öğrenme sıfırlanır, haftalar kayıp.
- **Pazar farkları:** DE'de onay kaybıyla karışır (teşhis zor); US/TR'de daha net.

## C08 `competitor-price-cut` Rakibin fiyat kırması
- **Tetikleyici:** rakip olayı: fiyat indirimi/ücretsiz plan; rakip ajanı agresifleşir.
- **Belirtiler:** deneme → ücretli oranı düşer, "fiyat" itirazları, rakip marka aramaları artar, CPC artabilir.
- **Doğru tepki:** konumlandırma ve değer gösterimi, yerel özellikleri öne çıkar, segment seç, fiyat paketlemesi (fiyat savaşına kör girmeden), mevcut müşteri elde tutma.
- **Yanlış tepki:** hemen aynı indirim (marj/LTV çöker), reklam bütçesiyle boğmak.
- **Sonuçlar:** doğru: kayıp sınırlı; yanlış: marj düşer, payback uzar.
- **Pazar farkları:** TR'de fiyat hassasiyeti ve kur etkisi yüksek; US'de ürün/özellik rekabeti; DE'de güvenilirlik/uyum ve destek öne çıkar. Gerçek rakip adları yalnızca doğrulanmış kaynakla `data/competitors` içinde olur.

## C09 `seasonal-swing` Mevsim dalgalanması
- **Tetikleyici:** mevsim modifier'ı (tatil, düğün/bayram dönemi, yaz durgunluğu), talep eğrisi.
- **Belirtiler:** arama hacmi ve lead sayısı dalgalanır; CPC/CPM değişir; mevcut müşteri kullanımı düşer.
- **Doğru tepki:** önceki yılın verisiyle beklentiyi düzelt, bütçe zamanlaması, düşük dönemde elde tutma/ürün/ içerik, yüksek dönemde kapasite.
- **Yanlış tepki:** düşük dönemi "kampanya bozuldu" sanıp değiştirmek; yüksek dönemi kalıcı sanıp işe alım/harcama.
- **Sonuçlar:** doğru: nakit düzgün; yanlış: yanlış öğrenme ve nakit sıkışması.
- **Pazar farkları:** mevsim takvimi pazara göre ayrı (tatiller, dini/ulusal günler); ters yarıküre yok v1'de.

## C10 `onboarding-failure-churn` Onboarding başarısızlığı sonrası churn
- **Tetikleyici:** onboarding kalitesi düşük (kurucu saati yok), aktivasyon düşük; erken kohort hazard yüksek.
- **Belirtiler:** deneme → ücretli kabul edilebilir ama 2-3. ay churn yüksek, kullanım düşük, destek talepleri.
- **Doğru tepki:** aktivasyon olayını tanımla, ilk hafta çağrısı/şablon, kısa eğitim, kohort analizi.
- **Yanlış tepki:** daha çok edinim (kovaya su doldurmak), churn'ü "sezon" saymak.
- **Sonuçlar:** doğru: kohort eğrisi yükselir, LTV artar; yanlış: LTV/CAC çöker, MRR duraklar.
- **Pazar farkları:** TR'de WhatsApp tabanlı destek beklentisi; DE'de dokümantasyon ve veri koruma güvencesi; US'de self-serve beklentisi.

## C11 `overscale-cac-blowup` Aşırı ölçeklemede CAC patlaması
- **Tetikleyici:** harcama `s ≫ K_c` (doygunluk), marjinal CAC > LTV eşiği, bütçe sıçraması öğrenmeyi sıfırlar.
- **Belirtiler:** ortalama CAC yavaş artar ama son artışın marjinal maliyeti çok yüksek; frekans↑, kalite↓.
- **Doğru tepki:** marjinal CAC takip, kademeli artış, yeni kanal/kitleye dağıt, holdout.
- **Yanlış tepki:** "ROAS iyiydi" diye bütçeyi ikiye katlamak.
- **Sonuçlar:** doğru: büyüme sürdürülebilir; yanlış: runway kısalır.
- **Pazar farkları:** TR'de pazar küçük, doygunluk erken; US'de uzak; DE'de orta, onay kaybıyla bulanık.

## C12 `negative-review-crisis` Olumsuz yorum krizi
- **Tetikleyici:** itibar olayı (yorum platformu/GBP/sosyal'de olumsuz yorum, hizmet kesintisi).
- **Belirtiler:** itibar düşer, GBP puanı, marka aramasında TO↓, deneme başlangıçları↓, destek yükü↑.
- **Doğru tepki:** hızlı, açık, saygılı yanıt, sorunu çöz, yorum akışını doğal biçimde artır (sahte yorum yok), post-mortem.
- **Yanlış tepki:** tartışmaya girmek, sahte/teşvikli yorum, silme baskısı.
- **Sonuçlar:** doğru: itibar kademeli toparlanır; yanlış: platform yaptırımı, itibar çöküşü.
- **Pazar farkları:** US/DE/TR'de yorum yasası ve platform kuralları farklı (DE'de sahte yorum ve teşvik hassasiyeti yüksek).

## C13 `payment-tax-surprise` Ödeme/vergi sürprizi
- **Tetikleyici:** vergi tarihi/olayı, kayıt eşiği, ödeme sağlayıcı kesinti/komisyon farkı; karşılık ayrılmamış.
- **Belirtiler:** nakit beklenenden düşük, tahsilat ≠ MRR, vergi faturası, ödeme hataları (dunning).
- **Doğru tepki:** vergi karşılığı ayır, fiyatlandırmada KDV/tax dahil/hariç netliği, dunning kur, nakit tahmini.
- **Yanlış tepki:** vergiyi görmezden gelmek, nakit tamponu olmadan agresif harcama.
- **Sonuçlar:** doğru: sürpriz küçülür; yanlış: runway birden kısalır.
- **Pazar farkları:** US: eyalet sales tax; DE: KDV (VAT), fatura biçimi; TR: KDV, e-fatura/e-arşiv, kur dalgalanması. (Oranlar ve tarihler yalnızca kaynaklı data'dan.)

## C14 `cold-outreach-legal` Soğuk iletişim yasa ihlali
- **Tetikleyici:** oyuncu soğuk e-posta/SMS/arama kampanyası yapar, pazar kuralı (izin/opt-out) karşılanmamış.
- **Belirtiler:** kısa vadede yanıt/lead artar; ardından şikayet, spam işaretleme, alan adı itibarı↓, olası idari uyarı/ceza olayı.
- **Doğru tepki:** izinli liste, opt-out, pazara göre yasal uygunluk, B2B kuralları farkı, sıcak giriş/referans.
- **Yanlış tepki:** hacmi artırmak, satın alınmış liste.
- **Sonuçlar:** doğru: daha yavaş ama güvenli; yanlış: ceza + itibar + e-posta teslim edilebilirlik kaybı.
- **Pazar farkları:** DE: en sıkı (B2B'de bile izin); US: opt-out temelli ama kurallar var (e-posta/telefon/SMS ayrı); TR: ileti yönetim sistemi/izin rejimi. Yasal ayrıntılar kaynaklı doğrulanmadan oyuna sayı/yasa metni olarak girmez; bu bir hukuki danışmanlık değildir.

## C15 `branded-cannibalization` (ek) Marka trafiğinin şişirdiği PMax
- **Tetikleyici:** PMax açık, marka sorgusu payı yüksek, `pmax.brand_cannibalization`.
- **Belirtiler:** PMax CPA harika, toplam yeni müşteri artmaz; marka aramaları kampanyaya yazılır.
- **Doğru tepki:** marka dışlama/ayrı marka kampanyası, geo/holdout, toplam CRM'e bak.
- **Yanlış tepki:** PMax'e bütçe yığmak.
- **Sonuçlar:** doğru: artımsal gerçek ortaya çıkar; yanlış: C04 ve C11'e kayma.
- **Pazar farkları:** marka bilinirliği yüksek pazarda daha belirgin; TR'de yerel marka sorguları küçük hacim.

## C16 `slow-lead-response` (ek) Geç yanıt nedeniyle lead kaybı
- **Tetikleyici:** kurucu saati yetersiz, lead kuyruğu, `Δt` büyük.
- **Belirtiler:** lead sayısı iyi, demo/ deneme oranı düşük, "ulaşılamadı" notları.
- **Doğru tepki:** otomatik ilk yanıt, vardiya/slot, öncelik, kanal bazlı yanıt hedefi.
- **Yanlış tepki:** daha fazla lead almak.
- **Sonuçlar:** doğru: aynı reklam harcamasıyla CAC düşer; yanlış: harcama boşa.
- **Pazar farkları:** TR'de telefon/WhatsApp hızı beklentisi çok yüksek; DE'de e-posta ve randevu beklentisi; US'de anlık sohbet/SMS.

---

Kapsam kontrolü: istenen 14 konu C01-C14 ile birebir karşılanmıştır; C15-C16 ek. Vaka etkileşimi: bazı vakalar zincirlenir (C07 → C11; C04 → C11; C10 → C13 nakit baskısı).
