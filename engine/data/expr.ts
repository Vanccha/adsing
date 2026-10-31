// Türetilmiş parametre formülleri için küçük, güvenli ifade değerlendiricisi (eval yok).
// Desteklenen: sayılar, + - * / ^, parantez, tekli -, min/max/mean/median/round/abs/sqrt/ln/exp, kimlikler (noktalı) veya a,b,c... (girdi sırası).

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_.]*)|([-+*/^(),]))/giy;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (src.slice(pos).trim() === '') break;
      throw new Error(`Formülde geçersiz karakter: "${src.slice(pos)}"`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'op', v: m[3] });
  }
  return out;
}

/** Formüldeki kimlikleri döndürür (fonksiyon adları hariç). */
export function formulaIdentifiers(src: string): string[] {
  const toks = tokenize(src);
  const ids: string[] = [];
  toks.forEach((tk, i) => {
    if (tk.t === 'id' && !(toks[i + 1]?.t === 'op' && toks[i + 1]?.v === '(')) ids.push(tk.v);
  });
  return ids;
}

function callFn(name: string, args: number[]): number {
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  switch (name) {
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    case 'mean':
    case 'avg':
      return mean(args);
    case 'median': {
      const a = [...args].sort((x, y) => x - y);
      const m = Math.floor(a.length / 2);
      return a.length % 2 ? (a[m] as number) : ((a[m - 1] as number) + (a[m] as number)) / 2;
    }
    case 'round': {
      // round(x) tam sayıya; round(x, adım) adımın katına yuvarlar (örn. round(737.1*0.95, 10) = 700).
      const step = args[1] ?? 1;
      return Math.round((args[0] as number) / step) * step;
    }
    case 'abs':
      return Math.abs(args[0] as number);
    case 'sqrt':
      return Math.sqrt(args[0] as number);
    case 'ln':
      return Math.log(args[0] as number);
    case 'exp':
      return Math.exp(args[0] as number);
    default:
      throw new Error(`Bilinmeyen fonksiyon: ${name}`);
  }
}

export function evalFormula(src: string, resolveId: (id: string) => number): number {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const eat = (v?: string) => {
    const tk = toks[i++];
    if (!tk || (v !== undefined && !(tk.t === 'op' && tk.v === v))) throw new Error(`Formül hatası: "${src}"`);
    return tk;
  };
  const isOp = (v: string) => {
    const tk = peek();
    return tk !== undefined && tk.t === 'op' && tk.v === v;
  };
  function primary(): number {
    const tk = eat();
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'id') {
      if (isOp('(')) {
        eat('(');
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            eat(',');
            args.push(expr());
          }
        }
        eat(')');
        return callFn(tk.v, args);
      }
      return resolveId(tk.v);
    }
    if (tk.v === '(') {
      const v = expr();
      eat(')');
      return v;
    }
    if (tk.v === '-') return -unary();
    if (tk.v === '+') return unary();
    throw new Error(`Formül hatası: "${src}"`);
  }
  function unary(): number {
    if (isOp('-')) {
      eat();
      return -unary();
    }
    return power();
  }
  function power(): number {
    const base = primary();
    if (isOp('^')) {
      eat();
      return Math.pow(base, unary());
    }
    return base;
  }
  function term(): number {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const op = (eat() as { v: string }).v;
      const r = unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (eat() as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (i < toks.length) throw new Error(`Formül hatası (artık belirteç): "${src}"`);
  return result;
}
