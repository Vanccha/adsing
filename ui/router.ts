import { useEffect, useState } from 'react';

export const ROUTES = ['start', 'dashboard', 'google', 'meta', 'local', 'geo', 'studio', 'crm', 'ops', 'data', 'outcome', 'learn', 'guide', 'history', 'about'] as const;
export type Route = (typeof ROUTES)[number];

function parse(): Route {
  const h = typeof location === 'undefined' ? '' : location.hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'start';
}

export function go(r: Route): void {
  location.hash = `/${r}`;
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(parse);
  useEffect(() => {
    const f = () => setR(parse());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
