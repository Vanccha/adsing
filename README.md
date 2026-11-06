# Büyüme Yönetimi Simülasyonu

Küçük bir SaaS girişiminin pazarlama ve büyüme kararlarını yöneten, karar odaklı strateji/simülasyon oyunu. Pazarlar: ABD, Almanya, Türkiye. Çevrimdışı çalışır, arayüz TR/EN.

Bu bir tahmin motoru değildir: tüm müşteri ve gelir verisi sentetiktir; her parametre kaynaklı, türetilmiş veya varsayım olarak işaretlidir.

## Çalıştırma

```sh
npm install
npm run dev        # geliştirme sunucusu
npm run build      # tip kontrolü + üretim paketi (dist/)
npm run preview    # üretim paketini sun
```

## Doğrulama

```sh
npm test                          # birim, özellik, kabul testleri
npm run typecheck && npm run lint
npm run data:audit                # veri şeması, tazelik, kaynaksız parametre raporu
npm run mc -- --runs=50           # bot Monte Carlo (--days=90 --difficulty=hard --markets=tr --scenario=...)
```

## Arayüz

Sol menülü reklam paneli düzeni; açık, koyu veya sistem teması. Google ekranı genel bakış, kampanya, reklam grubu, anahtar kelime ve arama terimi görünümleri ile adım adım kampanya sihirbazı sunar. Meta ekranı kampanya, reklam seti ve reklam düzeyleri ile Pixel ve olaylar sekmesini içerir. Platform logoları kullanılmaz; kullanım akışı yaklaştırılmıştır. Grafik renkleri açık ve koyu temada renk körlüğü denetiminden geçirilmiştir.

## Yapı

`engine/` saf deterministik motor (React/DOM/`Math.random`/`Date.now` yok) · `ui/` React arayüzü · `data/`, `markets/`, `scenarios/`, `cases/` veri · `locales/` çeviriler · `docs/` belgeler.
Bağımlılık yönü: `ui → engine → veri` (ESLint ile zorlanır). Kod yorumları Türkçedir.

Belgeler: [model](docs/model.md), [motor API ve vaka eşlemeleri](docs/engine-api.md), [plan](docs/plan/README.md).
