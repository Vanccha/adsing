# Mimari ve Veri Şeması Taslağı (Aşama 0)

## 1. Klasör yapısı

```
ADSING/
  engine/        # saf TS: state, step, kanallar, huni, finans, RNG, bot arayüzü (React/DOM yok)
    core/        # state tipleri, step orkestrasyonu, olay sistemi
    channels/    # googleAds, meta, geo, organik/yerel
    funnel/      # huni, satış, deneme, churn, finans
    measurement/ # gözlenen metrik katmanı, artımsallık, holdout
    rng/         # tohumlu RNG, alt akışlar
    bots/        # kötü/orta/iyi bot politikaları
    selectors/   # türetilmiş okuma fonksiyonları
  data/          # ortak veri: parametreler, kaynak kayıtları (JSON + şema)
  markets/       # us.json, de.json, tr.json (pazar katmanı parametreleri)
  scenarios/     # ürün/sektör senaryoları (varsayılan: berber/kuaför SaaS)
  cases/         # vaka tanımları (JSON) + metin (i18n)
  ui/            # React + Vite uygulaması, engine'e yalnızca API ile bağlı
  docs/          # plan/, veri sözlüğü, tasarım notları
  tests/         # (veya engine/ içinde *.test.ts) property ve Monte Carlo
```

Bağımlılık yönü: `ui → engine → (data, markets, scenarios, cases)`. engine, ui'yi asla import etmez (lint kuralı: eslint `no-restricted-imports`).

## 2. Monorepo mu tek paket mi

**Öneri: tek paket (tek `package.json`), iç içe katı sınır, TS path alias + ESLint ile.** Gerekçe: tek geliştirici, offline uygulama, derleme ve test basitliği. Motor ayrılığı klasör+lint ile zorlanır. Daha sonra gerekirse (CLI bot koşucusu, Node'da Monte Carlo) `engine/` kolayca workspace paketine çıkarılır, çünkü motor zaten DOM'a bağımlı değil. Alternatif: pnpm workspaces ile `@adsing/engine` ve `@adsing/app`; avantaj: sınırın derleyici düzeyinde zorlanması, maliyet: ek yapılandırma. Açık soru 1'e bakınız.

## 3. JSON veri şeması

Her sayı bir `Param` nesnesidir:

```jsonc
{
  "id": "gads.smart.min_conversions",
  "value": 30,               // value VEYA range (biri zorunlu)
  "range": { "min": 15, "max": 50, "dist": "uniform" }, // belirsizlik; tohumdan çekilebilir
  "unit": "conversions",
  "market": "global",        // global | us | de | tr
  "layer": "assumption",     // sourced | derived | assumption
  "source": {                // sourced için zorunlu
    "url": "https://...", "name": "...", "published": "YYYY-MM-DD", "accessed": "YYYY-MM-DD"
  },
  "confidence": "low",       // low | medium | high
  "note": "gerekçe / neden bu aralık",
  "formula": null,           // derived için zorunlu: "a * b / c" + "inputs": ["id1","id2"]
  "inputs": []
}
```

Kurallar (JSON Schema + doğrulama testi):
- `layer=sourced` ⇒ `source` tam dolu, `confidence` zorunlu.
- `layer=derived` ⇒ `formula` ve `inputs`; girdi kimlikleri çözülebilir, döngü yok. Güven = girdilerin en düşüğü.
- `layer=assumption` ⇒ `range` (veya geniş gerekçe) + `note`; güven varsayılan `low`.
- Pazara özel değer yoksa `global`'e düşer (çözümleme sırası: senaryo > pazar > global).
- Şema hem TS tiplerine (zod veya JSON Schema → tip) hem CI doğrulamasına kaynak olur. Tercih: **zod** (tek kaynak, çalışma zamanı doğrulama + tip).

Bu dokümandaki gibi eşik örnekleri (30 dönüşüm vb.) ilk sürümde `assumption`/`low`.

## 4. Tazelik uyarısı mantığı

- `age = today − source.published` (ve `accessed`). `today` = oyunda gerçek tarih değil, uygulama yapı tarihi veya sistem saati (offline: sistem saati, kullanıcı devre dışı bırakabilir). Brief referansı: 2026-10-31.
- `age > 12 ay` ⇒ **bayat** uyarısı (veri ekranında rozet, sonuç analizinde "bu sayı eski kaynağa dayanıyor").
- Türetilmiş değer: en eski girdi kaynağına göre bayat sayılır.
- Varsayım katmanı bayat sayılmaz ama "kaynaksız" rozeti taşır.
- Yapı sırasında script `npm run data:audit`: bayat, kaynaksız, `confidence=low` sayıları raporlar; `accessed` yoksa yapıyı kırar.

## 5. Tohumlu RNG

Öneri: **PCG32 (veya sfc32/xoshiro128\*\*)**, kendi küçük uygulamamız (bağımlılıksız, taşınabilir, 32-bit tamsayı işlemleri tutarlı). `Math.random` yasak (lint). Tohum: `string → hash (xmur3/cyrb128) → durum`. Alt akışlar: `rng.fork(label)` etiket hash'iyle bağımsız akış; böylece aksiyon eklemek diğer rastgeleliği kaydırmaz. Durum serileştirilebilir (kayıt için). Dağılımlar (Binomial, Poisson, Beta, Gamma, Normal) kendi uygulaması; büyük n için normal/Poisson yaklaşımı ve alt akış başına sabit çekiliş sayısı (determinizm). Kayan nokta farkını azaltmak için aynı JS motorunda test edilir; kayıt dosyasında `engineVersion` tutulur.

## 6. Motor API'si

```ts
initState(scenario: Scenario, market: MarketId, seed: string, opts?): GameState
step(state: GameState, actions: Action[]): StepResult   // günü ilerletir; saf: yeni state döner
// StepResult = { state, events: GameEvent[], report: DayReport }
runDays(state, policy: Policy | ActionLog, days): GameState  // bot ve karşı-olgusal koşu için
selectors: {
  observedMetrics(state): ObservedMetrics,     // oyuncunun gördüğü
  trueMetrics(state): TrueMetrics,             // yalnız sonuç analizinde
  funnel(state), cac(state, {marginal:true}), mrr(state), runway(state),
  founderHours(state), freshnessWarnings(state), availableActions(state)
}
```

- `GameState` düz, JSON serileştirilebilir (sınıf/Map yok); kopyalama/immer-tabanlı yapısal paylaşım.
- `Action` ayırt edilmiş birleşim: `{type, params, hours?}`; doğrulama `validateAction(state, a)`.
- Motor hiçbir yerde zaman/IO okumaz; tüm girdi (data, senaryo, tohum) parametredir.
- `ActionLog`: gün bazlı aksiyon listesi ⇒ yeniden oynatma, karşı-olgusal koşu.

## 7. i18n (TR/EN)

- UI metni ve vaka/olay/senaryo metinleri `locales/{tr,en}/*.json` içinde, kimlik (`key`) ile; motor yalnızca kimlik ve parametre döndürür (metin üretmez).
- Kütüphane: `i18next` + `react-i18next`, ya da hafif `ICU MessageFormat` (çoğul/biçim). Sayı/para/tarih `Intl` ile pazar yerel ayarına göre.
- Veri `note`/`source.name` alanları: orijinal dilde; `note` için `note_i18n: {tr,en}` opsiyonel.
- Test: tüm anahtarlar iki dilde var (CI kontrolü), eksik anahtar derlemeyi kırar. Varsayılan dil TR, yedek EN.

## 8. Kayıt / yükleme

- Kayıt = `{ schemaVersion, engineVersion, scenarioId, market, seed, actionLog, stateSnapshot (isteğe bağlı sıkıştırılmış), rngState }`.
- Depolama: IndexedDB (idb-keyval) birincil, JSON dosya dışa/içe aktar (offline).
- `actionLog + seed` yeniden oynatma kaynağıdır; `stateSnapshot` hız içindir (her N günde bir anlık görüntü). Sürüm uyuşmazlığında migrasyon fonksiyonları veya "yeniden oynat" kipi.
- Otomatik kayıt her ay sonunda ve çıkışta.

## 9. Test stratejisi

- **vitest** birim testleri: formüller, RNG dağılımları, şema doğrulama.
- **fast-check** özellik tabanlı: model-draft §13'teki yapısal ilişkiler (huni daralır, olasılıklar [0,1], nakit tutarlılığı, determinizm: aynı tohum+log ⇒ aynı durum, RNG alt akış izolasyonu, monotonluklar).
- **Bot Monte Carlo**: `scripts/mc.ts` ile kötü/orta/iyi botlar × tohum × pazar × senaryo (ör. yüzlerce koşu); çıktı: sonuç dağılımı, kazanma/kaybetme oranları, beceri-şans örtüşmesi. CI'da küçük koşu, yerelde büyük. Kabul: iyi > orta > kötü ortalamada, dağılımlar örtüşür.
- **Veri testleri**: tüm JSON şemaya uyar, türetilmiş formüller çözülür, bayat/kaynaksız denetimi.
- **Golden senaryo testleri**: sabit tohum ve log için seçili metriklerin anlık görüntüsü (değişimde bilinçli güncelleme).
- **Vaka testleri**: her vaka tetikleyicisi motor durumunu kurarak tetiklenebiliyor ve doğru/yanlış tepki farkı beklenen yönde (Monte Carlo ile).
- **UI**: React Testing Library az sayıda; kritik akış için Playwright (opsiyonel, sonra).

## 10. Aşama 1 iş kırılımı (sıra)

1. **İskelet**: Vite+React+TS, vitest, fast-check, ESLint sınır kuralı, klasörler, CI betikleri.
2. **Veri şeması + doğrulama**: zod şeması, `data:audit` betiği, tazelik mantığı, birkaç örnek parametre. (Pazar araştırmasından gelen sayılar bu şemaya girilir.)
3. **RNG + dağılımlar**: PCG32, alt akışlar, Binomial/Poisson/Beta/Gamma, testleri.
4. **Çekirdek motor**: GameState, step iskeleti (11 aşama), olay sistemi, kurucu saati, aksiyon doğrulama.
5. **Huni + satış + deneme + churn + finans** (kanal bağımsız): MRR/LTV/CAC/payback/nakit/vergi.
6. **Ölçüm katmanı**: gerçek vs gözlenen, onay/atıf/takip, artımsallık.
7. **Kanallar**: önce ücretsiz/yerel basit, sonra Google Ads (rank, QS, eşleme, öğrenme), Meta (öğrenme, yorgunluk), GEO.
8. **Gizli kalite + Bayes keşfi** ve doygunluk/marjinal CAC.
9. **Pazarlar** (US/DE/TR) farkları: ölçüm kaybı, yasal kısıt, olay sıklığı, birim ekonomi.
10. **Olaylar + vaka motoru**: cases/ yükleyici, tetikleyici değerlendirici; 14+ vaka.
11. **Botlar + Monte Carlo + denge ayarı**.
12. **Sonuç analizi**: karar günlüğü, karşı-olgusal koşu, true-vs-observed ekranı.
13. **UI**: günlük döngü, paneller, test/rapor ekranları, i18n, kayıt/yükleme.
14. **Cilalama**: öğretici, hızlı mod (90 gün), kabul testleri.
Bağımlılık: 1 → 2,3 → 4 → 5,6 → 7,8 → 9,10 → 11,12 → 13 (UI 4. adımdan sonra paralel iskeletle başlayabilir).

## 11. Kullanıcıya sorulacak açık sorular (en fazla 4)

1. **Paket yapısı:** tek paket + lint sınırı (önerilen, basit) mı, yoksa pnpm workspaces ile ayrı `engine` paketi mi (CLI/Node Monte Carlo ve ileride yayın için)?
2. **Oyun kipi ve hedef kitle:** öğretici/eğitim odaklı (ipuçları, geri bildirim bol) mı, yoksa "acımasız gerçekçi simülasyon" mu? Bu, UI'daki gizli bilgi miktarını ve sonuç analizinin ayrıntı düzeyini belirler.
3. **Gerçek marka/rakip adları:** rakipler ve platformlar gerçek adlarıyla (doğrulanmış kaynak şartıyla) mı gösterilsin, yoksa yasal/güncellik riski için genel adlarla ("Rakip A") mı başlansın?
4. **Dağıtım ve tazelik:** uygulama yalnızca yerel/offline kalacak mı? Veri güncellemesi (yeni kaynaklar) uygulama sürümüyle mi gelecek, yoksa kullanıcı JSON paketini içe aktarabilecek mi?
