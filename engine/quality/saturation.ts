// Doygunluk eğrisi (Hill) ve marjinal CAC yardımcıları.
// Conv(s) = Cmax * s^h / (s^h + K^h). Marjinal maliyet = 1 / Conv'(s).

export function hill(s: number, cmax: number, kHalf: number, h = 1): number {
  if (s <= 0) return 0;
  const sh = Math.pow(s, h);
  return (cmax * sh) / (sh + Math.pow(kHalf, h));
}

/** Conv'(s) sayısal/kapalı türev. */
export function hillSlope(s: number, cmax: number, kHalf: number, h = 1): number {
  if (s <= 0) return h >= 1 ? (h === 1 ? cmax / kHalf : 0) : Infinity;
  const kh = Math.pow(kHalf, h);
  const sh = Math.pow(s, h);
  return (cmax * h * Math.pow(s, h - 1) * kh) / ((sh + kh) * (sh + kh));
}

/** Marjinal CAC: bir sonraki para biriminin artımsal dönüşüm maliyeti. */
export function marginalCacHill(s: number, cmax: number, kHalf: number, h = 1): number {
  const slope = hillSlope(s, cmax, kHalf, h);
  return slope > 0 ? 1 / slope : Infinity;
}

export function averageCacHill(s: number, cmax: number, kHalf: number, h = 1): number {
  const c = hill(s, cmax, kHalf, h);
  return c > 0 ? s / c : Infinity;
}

/** Ölçülmüş (harcama, dönüşüm) noktalarından kesikli marjinal maliyet. */
export function marginalFromPoints(points: Array<{ spend: number; conv: number }>): Array<{ spend: number; marginal: number }> {
  const sorted = [...points].sort((a, b) => a.spend - b.spend);
  const out: Array<{ spend: number; marginal: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const dc = b.conv - a.conv;
    out.push({ spend: b.spend, marginal: dc > 1e-12 ? (b.spend - a.spend) / dc : Infinity });
  }
  return out;
}
