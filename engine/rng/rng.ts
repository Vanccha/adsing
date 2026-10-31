// Tohumlu rastgele sayı üretici (sfc32) ve dağılımlar.
// - Math.random yok; tüm rastgelelik string tohumdan türer.
// - fork(etiket): ebeveynin tüketimine bağlı OLMAYAN bağımsız alt akış (anahtar yolu hash'lenir).
// - Durum serileştirilebilir: { key, s: [a,b,c,d] }.

export interface RngState {
  key: string;
  s: [number, number, number, number];
}

/** cyrb128 benzeri: string -> 4 x 32-bit tohum. */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly key: string;

  constructor(keyOrState: string | RngState) {
    if (typeof keyOrState === 'string') {
      this.key = keyOrState;
      const [a, b, c, d] = hashString(keyOrState);
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      for (let i = 0; i < 12; i++) this.u32(); // ısınma
    } else {
      this.key = keyOrState.key;
      [this.a, this.b, this.c, this.d] = keyOrState.s;
    }
  }

  getState(): RngState {
    return { key: this.key, s: [this.a, this.b, this.c, this.d] };
  }

  /** 32-bit işaretsiz tamsayı. */
  u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0,1) aralığında düzgün. */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** (0,1) açık aralık (log için güvenli). */
  open(): number {
    return (this.u32() + 0.5) / 4294967296;
  }

  /** [0,n) tamsayı. */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  bernoulli(p: number): boolean {
    return this.float() < p;
  }

  /** Bağımsız alt akış: ebeveynin tükettiği sayıdan etkilenmez. */
  fork(label: string): Rng {
    return new Rng(`${this.key}/${label}`);
  }

  // ---- Dağılımlar ----

  /** Standart normal (Box-Muller; çağrı başına her zaman 2 çekiliş). */
  normal(mean = 0, sd = 1): number {
    const u1 = this.open();
    const u2 = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Gamma(shape, scale) — Marsaglia-Tsang. */
  gamma(shape: number, scale = 1): number {
    if (shape <= 0) return 0;
    if (shape < 1) {
      const u = this.open();
      return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.open();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }

  beta(a: number, b: number): number {
    const x = this.gamma(a);
    const y = this.gamma(b);
    const s = x + y;
    return s > 0 ? x / s : 0.5;
  }

  /** Poisson(lambda): küçük λ için Knuth, büyük için normal yaklaşım. */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.float();
      } while (p > L);
      return k - 1;
    }
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }

  /** Binomial(n, p): n küçükse doğrudan, ortalama küçükse ters-dönüşüm, aksi halde normal. */
  binomial(n: number, p: number): number {
    n = Math.floor(n);
    if (n <= 0 || !(p > 0)) return 0;
    if (p >= 1) return n;
    if (p > 0.5) return n - this.binomial(n, 1 - p);
    if (n <= 25) {
      let k = 0;
      for (let i = 0; i < n; i++) if (this.float() < p) k++;
      return k;
    }
    const mean = n * p;
    if (mean < 12) {
      // Ters dönüşüm (CDF yürüyüşü)
      const q = 1 - p;
      const s = p / q;
      const a = (n + 1) * s;
      let r = Math.pow(q, n);
      let u = this.float();
      let k = 0;
      while (u > r && k < n) {
        u -= r;
        k++;
        r *= a / k - s;
      }
      return Math.min(k, n);
    }
    const sd = Math.sqrt(mean * (1 - p));
    return Math.min(n, Math.max(0, Math.round(this.normal(mean, sd))));
  }

  /** Negatif binom (ortalama mu, dağılım parametresi r): Gamma-Poisson karışımı. r büyüdükçe Poisson'a yaklaşır. */
  negBin(mu: number, r: number): number {
    if (!(mu > 0)) return 0;
    if (!(r > 0) || r > 1e6) return this.poisson(mu);
    const lam = this.gamma(r, mu / r);
    return this.poisson(lam);
  }

  /** Ağırlıklara göre indeks seç. */
  pick(weights: number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let u = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      u -= weights[i] ?? 0;
      if (u <= 0) return i;
    }
    return weights.length - 1;
  }
}

export function createRng(seed: string): Rng {
  return new Rng(`seed:${seed}`);
}
