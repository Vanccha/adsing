// Beta dağılımı için özel fonksiyonlar (log-gamma, düzenlenmiş eksik beta, kuantil).
// Bayes keşfi (quality/) ve testler kullanır; RNG gerektirmez.

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += (LANCZOS[i] as number) / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

/** Düzenlenmiş eksik beta I_x(a,b) = Beta(a,b) CDF. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

export function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  return Math.exp(lbeta + (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x));
}

/** Beta kuantili (ikiye bölme). */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** P(X>Y), X~Beta(a1,b1), Y~Beta(a2,b2): X'in taşıyıcısı üzerinde sayısal integral (orta nokta kuralı). */
export function probBetaGreater(a1: number, b1: number, a2: number, b2: number, steps = 1500): number {
  const lo = betaQuantile(1e-8, a1, b1);
  const hi = betaQuantile(1 - 1e-8, a1, b1);
  // x = lo + (hi-lo) * u^2 değişkeni: sıfıra yakın tekilliklerde hassasiyeti artırır
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    const x = lo + (hi - lo) * u * u;
    const dx = (hi - lo) * 2 * u;
    sum += betaPdf(x, a1, b1) * betaCdf(x, a2, b2) * dx;
  }
  return Math.min(1, Math.max(0, sum / steps));
}
