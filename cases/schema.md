# Vaka biçimi (cases/)

Her vaka `Cxx-slug.json` dosyasıdır. Metinler `i18n/{tr,en}.json` içindedir (anahtarlar `case.Cxx.*`). Metrik, hedef ve aksiyon kimlikleri `metrics-and-actions.md` içinde listelidir. Bu bir hukuki danışmanlık değildir; vakalar bileşik ve kurgusaldır.

## Alanlar
- `id`, `slug`, `stage`: click|attention|lp|lead|trial|paid|retention|measurement|account|finance|legal.
- `markets`: geçerli pazarlar (us|de|tr).
- `trigger`: `{ all: [Koşul...], chance, cooldownDays }`. Koşul = `{ metric, op, value }`; `op` ∈ `> >= < <= == !=`. `value` sayı ya da `{ param: "parametre.kimliği" }` (data/markets parametresi veya `derived.*`). Tüm koşullar sağlanınca her gün `chance` olasılığıyla tetiklenir; sonra `cooldownDays` boyunca tekrar etmez. Eşik sayıları varsayım katmanıdır (düşük güven), kaynaklı değildir.
- `marketOverrides`: `{ pazar: { trigger?, effects? } }`. Verilen alan temel değerin yerine geçer (birleştirme yok, tam değişim).
- `effects`: `[{ target, op: mul|add|set, value, durationDays }]`. Vaka tetiklenince uygulanan dış etki. `durationDays: 0` tek seferlik. `value` dize ise parametre başvurusudur (başında `-` işareti çevirir).
- `symptoms`: oyuncuya gösterilecek metrik kimlikleri.
- `correctResponses` / `wrongResponses`: `[{ action, outcome }]`; `outcome` i18n anahtarıdır. Aynı vakadaki tüm doğru (veya yanlış) aksiyonlar aynı sonuç metnini paylaşır. Etkisini motor ayrıca modeller.
- `learningHint`: i18n anahtarı.
- `i18n`: `title`, `summary`, `symptoms` anahtarları.
- `source`: `{ type: "composite", note, refs: [] }`. refs boştur; hiçbir dış kaynak doğrulanmadı.

## events.json
Rastgele olay havuzu: `{ schemaVersion, events: [...] }`. Olay: `id, slug, markets, baseDailyProbability{value,layer:"assumption"}, rateScale, conditions, effects, i18n{title,text}`. `rateScale` olasılığı pazar çarpanıyla ölçekler (`events.legal_rate_mult` veya `events.macro_rate_mult`). `calendar` alanlı olaylar (E-arşiv/E-Rechnung, tatil yoğunluğu) olasılıkla değil `markets/*.json meta.holidays` tarihleriyle tetiklenir; `holiday.effects.*` değerleri o kayıttan okunur (tarihler doğrulanmamış olabilir).

## i18n
Metinler iki dilde aynı anahtar kümesine sahiptir: `case.Cxx.{title,summary,symptoms,hint,correct.outcome,wrong.outcome}` ve `events.<slug>.{title,text}`.
