# Proje Brief (özet) — Küresel Büyüme Yönetimi Oyunu
Küçük bir SaaS girişiminin pazarlama/büyüme sürecini yöneten, karar odaklı, gerçekçi strateji/simülasyon oyunu.
- Varsayılan ürün: yerel işletmelere (berber, kuaför, salon) randevu & müşteri yönetimi SaaS'ı. Senaryo dosyasıyla değiştirilebilir.
- Pazarlar (v1): ABD, Almanya, Türkiye. Fark oynanışı değiştirmeli (ölçüm kaybı, yasal kısıt, kanal etkinliği, birim ekonomi, olay sıklığı) — sadece çarpan değil.
- Kanallar: Google Ads (Arama), Meta Ads, GEO (belirsiz, gecikmeli), ücretsiz/yerel kanallar (GBP, yorum, yerel SEO, organik sosyal, referans, bayi, saha/telefon satış).
- Huni: dikkat > tıklama > açılış sayfası > nitelikli lead > deneme/aktivasyon > ücretli > elde tutma.
- Gerçekçilik: teklif/yaratıcı/LP gizli kalite değerleri (test ile keşfedilir), istatistiksel gürültü & güven aralıkları, takip altyapısı aksiyonları, artımsallık (geo/holdout), platform raporu vs CRM, satış süreci, yanıt hızı.
- Kaynaklar: nakit, kurucu saati, itibar, hesap sağlığı. Kaybetme/kazanma koşulları, sonuç analizi.
- Olaylar (tohumlu), vaka kütüphanesi (cases/), gerçek rakipler (doğrulanmış kaynaklarla, uydurma yok).
- Veri: her sayı 3 katmandan biri: Kaynaklı (URL, ad, tarih, güven) / Türetilmiş (formül) / Varsayım (aralık, gerekçe, düşük güven). 12 aydan eski kaynak tazelik uyarısı. Bugün: 2026-10-31.
- Motor UI'dan ayrı, deterministik, günlük adım, 12 ay (hızlı 90 gün). TypeScript + React + Vite, offline, i18n (TR/EN).
- Klasörler: engine/, data/, markets/, scenarios/, cases/, ui/, docs/.
