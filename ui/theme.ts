import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'adsing.theme';

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* yok say */
  }
  return 'system';
}

export function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => applyTheme(theme), [theme]);
  const set = useCallback((t: Theme) => {
    setTheme(t);
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* yok say */
    }
  }, []);
  return [theme, set];
}
