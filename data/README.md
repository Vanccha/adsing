# Veri Katmanı (data/, markets/, scenarios/)

Bugün: 2026-10-31. Şema: `docs/plan/stage1-contract.md`. Bu klasörlerde yalnızca JSON ve bu not var; kod yok.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `data/global.json` | Pazardan bağımsız parametreler (akıllı teklif, Meta öğrenme, yorgunluk, sızıntı, TCMB kurları, kurucu saati vb.) |
| `data/benchmarks.json` | Makul aralık testleri için yayımlanmış/varsayım aralıkları (`plausible`, `published`) ve ilişki kuralları (`rules`) |
| `markets/{us,de,tr}.json` | Pazar parametreleri + `meta` (currency, locale, fxToUSD, holidays, seasonality, dominantChannels, channels, legal, competitors, notes) |
| `scenarios/salon-saas.json` | Varsayılan ürün: fiyat bağı, brüt marj, deneme, sabit gider, başlangıç nakdi (kolay/normal/zor), kazanma hedefleri (12 ay ve 90 gün) |
| `scenarios/b2b-accounting-saas.json`, `subscription-box.json` | İSKELET senaryolar (tüm değerler varsayım, düşük güven) |

## Katmanlar

Her sayı üç katmandan birindedir (`layer`):

- **sourced**: `source{url,name,published,accessed}` zorunlu. Güven kaynağa göre: birincil ve bu turda okunduysa `high`; ikincil ya da doğrulanamadıysa `low`/`medium`.
- **derived**: `formula` ve `inputs[]` zorunlu (ör. `meta.cpc = meta.cpm / (1000 × meta.ctr)`, `price.monthly = round(price.anchor.3seat.mean × 0.9)`).
- **assumption**: kaynaksız varsayım; `range` ile birlikte, `confidence: low`, `note` gerekçeli.

Kurallar: oranlar `ratio` biriminde 0–1; çarpanlar `multiplier`; kategorik hukuki değerler (`legal.cold_email|cold_call|sms`) `unit: "enum"` ve `value` **string** (`allowed|restricted|banned`). Çözüm önceliği: senaryo > pazar > global. 12 aydan eski kaynaklar not satırında "TAZELİK UYARISI" taşır (ör. iOS ATT %4 / 2021).

## Yeni pazar nasıl eklenir

1. `markets/xx.json` oluştur: `{ "schemaVersion": 1, "market": "xx", "params": [...], "meta": {...} }`. Param şeması yukarıdaki katmanlarla aynı; `market` alanı `xx`.
2. Sözleşmedeki tüm gerekli kimlikleri doldur (ya da bilinçli olarak `data/global.json`'a bırak ve `meta.notes`'a yaz).
3. `meta`: currency, locale, `fxToUSD` (TCMB benzeri birincil kurdan türet; `fx.to_usd` derived olsun), holidays (2026-11 → 2027-12; dini bayramlar için kaynak), seasonality (varsayımı etiketle), dominantChannels, channels, legal (rıza rejimi, soğuk e-posta/arama/SMS, ceza), competitors (resmî fiyat sayfası okunmadıysa `verified:false` ve `pricing: []`).
4. Fiyat çıpalarını sourced param olarak ekle, `price.monthly`'i derived formülle türet.
5. `data/benchmarks.json`'a pazar satırları ekle, `market` tipine (`global|us|de|tr`) yeni değeri motor/şema tarafında ekletmek için yöneticiye bildir (motor `market` enum'ı).
6. `node` ile JSON parse ve şema denetimini çalıştır.

## Doğrulama turu (2026-10-31)

Yöntem: birincil kaynak sayfaları WebFetch ile açıldı; açılamayanlar için arama özetleri kullanıldı ve güven düşük bırakıldı. Ulaşılamayan kaynak sourced ve yüksek güvenle yazılmadı.

| Sayı | Önceki durum | Sonuç | Yeni katman / güven |
|---|---|---|---|
| Google Ads: 30 dönüşüm / ay / reklam grubu; ilk öğrenme en az 2 hafta | varsayım | Google Ads Help (support.google.com/google-ads/answer/10285843) okundu, doğrulandı. Alt sınır 15 / 50+ ikincil, aralık olarak | **yükseltildi**: sourced / high (`gads.smart.*`; `learning_days` yeni) |
| Meta: ~50 olay / 7 gün | varsayım | Resmî sayfa gövdesi çekilemedi (yalnızca başlık); facebook.com/business/help "About learning limited" ve "Last Significant Edit" ifadesi arama çıktısından teyit edildi ("~50 optimizasyon olayı, son önemli düzenlemeden sonraki hafta") | **yükseltildi**: sourced / medium |
| Stripe ABD | %2,9 + 30¢ | Resmî sayfa okundu, doğrulandı (uluslararası +%1,5, kur +%1) | sourced / high |
| Stripe DE | %1,5 + 0,25 € (AWR) | Okundu, doğrulandı; premium %2,8, SEPA 0,35 €, uyuşmazlık 20 € | sourced / high |
| iyzico | %2,79 + 0,25 TL | Resmî sayfa komisyon vermiyor; doğrulanamadı | assumption / low (ikincil not) |
| PayTR | %2,19'dan | Resmî sayfada "yeni üye iş yeri %2,19" görüldü; genel oran teklif bazlı | `pay.fee_pct` TR: assumption (0,0279, aralık 0,0219-0,035) |
| KDV DE %19 | orta | IHK Stuttgart okundu | **yükseltildi**: sourced / high |
| KDV TR %20 | orta | Kintsugi rehberi (Temmuz 2026 güncel) okundu; GİB birincil sayfası açılamadı | sourced / medium (değişmedi) |
| ABD SaaS satış vergisi | 22 eyalet + DC | TaxCloud (Ekim 2026): **24 eyalet + DC**; CA ve CO 1 Oca 2027 | **güncellendi** (22 → 24), sourced / medium |
| TÜFE (TÜİK) | Eylül %29,73 / aylık %1,84 | TÜİK sitesi veriyi vermedi; haber aktarımı (Gazete Oksijen) tutarlı. Ekim verisi 3 Kasım'da | sourced / medium |
| Kur (TCMB) | serbest piyasa 49,785 | TCMB today.xml okundu: USD 49,7747/49,8644, EUR 55,7149/55,8153 (30.10.2026) | **yükseltildi**: sourced / high; EURUSD derived 1,1193 |
| Treatwell | 39/49 € + %35 komisyon | Yeniden okundu, doğrulandı (tekrar rezervasyon %0, ön ödeme %2 + KDV) | sourced / high |
| Vagaro, Booksy, GlossGenius | doğrulanmış | Yeniden okundu, aynı | sourced / high |
| Salon Randevu | KDV belirsiz | Yeniden okundu: **fiyatlar KDV dahil**, ek personel 225 TL | güncellendi (price.monthly KDV hariç türetildi) |
| Fresha TR, Salonist | doğrulanmış | Yeniden okundu: Fresha 415/275 TRY (7 gün deneme), Salonist $59/109/179 (7 gün deneme, %15 komisyon) | sourced / high |
| Salonized plan fiyatları | ikincil 52,50 € | Plan fiyatları yine alınamadı; deneme 14 gün, SMS 0,11-0,15 €, TSE 12 €/ay okundu | verified:false, fiyatsız |
| Square Appointments, Fresha ABD/DE, Boulevard, Booksy TR | doğrulanamadı | Yine doğrulanamadı | verified:false, fiyatsız |
| WordStream 2026 (CPC $5,42, TO %6,64, CVR %8,18) | orta (ikincil) | WordStream sayfası 403; birden çok arama özeti tutarlı | sourced / medium (değişmedi); Beauty/Personal Services satırları low |
| Meta ABD CPM | ~$20,48 (düşük-orta) | Affect Group 1Q 2026 sayfası okundu: lead gen $26-40 | **yükseltildi**: sourced / medium (`meta.cpm` US) |
| Meta CTR/CPC benchmark | düşük | Arama özetleri (lead CPC $1,92, lead TO %2,59, CPC ABD&Kanada $0,97); sayfalar açılmadı | düşük kaldı |
| CCPA eşik/ceza | yüksek | CPPA sayfası okundu: $2.663 / $7.988, $26,625M | sourced / high |
| Bayram tarihleri 2027 | yüksek | Dünya Gazetesi okundu: Ramazan 9-11 Mart (arefe 8), Kurban 16-19 Mayıs (arefe 15) | sourced / high; uzatma kararı yok |
| DE tatil 2027 | orta | Kalenderpedia okundu, tarihler Gauss Paskalya hesabıyla çapraz kontrol (özetteki 1 Mayıs eksikliği hesapla tamamlandı) | derived |
| Consent oranı DE %36, ATT DE %47, churn %3-7, ChartMogul %8, Census/ZV/Scrap.io sayıları | ikincil | Bu turda yeniden doğrulanamadı | sourced / **low** (ikincil kaynak tutuldu) |

### Hâlâ zayıf noktalar

- Reklam benchmark'larının çoğu ikincil; B2B salon yazılımı anahtar kelime CPC/CTR/CVR'ı için hiç yayımlanmış kaynak yok (assumption).
- Meta resmî sayfası gövdesi çekilemedi; 50/7 değeri orta güven.
- Pazar büyüklüğü sayıları (ZV, Scrap.io, Census) ikincil ya da satıcı verisi.
- Mevsimsellik çarpanları (salonDemand, saasBuying) tamamen varsayım; adCost yalnızca ABD Kasım/Ocak türetilmiş.
- Hukuki değerler (soğuk e-posta/arama/SMS) güvenli yorumdur, hukuki danışmanlık değildir; DE ve TR'de kaynaklar çelişkili.
- LTV:CAC: yalnızca ücretli Google funnel ile ABD ≈ 1,0, DE ≈ 1,0, TR ≈ 1,9; hedef ≥ 3 ücretsiz kanallar ve iyi oyunla ulaşılacak şekilde bilinçli sıkı bırakıldı, bot Monte Carlo ile ayarlanmalı.
