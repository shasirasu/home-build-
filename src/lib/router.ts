import { useEffect, useState } from 'react';

// Hash routes: #/ (intro), #/studio, #/plan, #/new. Query after "?" inside the hash, e.g. #/studio?focus=gf-hall
export type Route = { page: 'intro' | 'studio' | 'plan' | 'new'; params: URLSearchParams };

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const page = (['studio', 'plan', 'new'] as const).find((p) => path === p) ?? 'intro';
  return { page, params: new URLSearchParams(query) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const fn = () => setRoute(parseHash());
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);
  return route;
}

export const go = (to: string) => {
  location.hash = to;
};
