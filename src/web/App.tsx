import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './data/store';
import { Archive } from './pages/Archive';
import { Favorites } from './pages/Favorites';
import { Onboarding } from './pages/Onboarding';
import { Privacy } from './pages/Privacy';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { Today } from './pages/Today';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

type Page = 'archive' | 'favorites' | 'sources' | 'settings' | 'onboarding' | 'privacy';
type Route = { page: 'today' } | { page: 'digest'; date: string } | { page: Page };
const PAGES: Page[] = ['archive', 'favorites', 'sources', 'settings', 'onboarding', 'privacy'];

function match(path: string): Route | null {
  if (path === '/') return { page: 'today' };
  const d = path.match(/^\/d\/(\d{4}-\d{2}-\d{2})$/);
  if (d) return { page: 'digest', date: d[1]! };
  const p = path.slice(1) as Page;
  return PAGES.includes(p) ? { page: p } : null;
}

const NAV = [
  ['#/', 'Today'],
  ['#/archive', 'Archive'],
  ['#/favorites', 'Favorites'],
  ['#/sources', 'Sources'],
  ['#/settings', 'Settings'],
] as const;

function Shell() {
  const path = useHash();
  const { state } = useStore();
  const route = match(path);
  const isCurrent = (href: string) => href === '#' + path || (href === '#/archive' && route?.page === 'digest');
  // Until onboarding is finished, only Onboarding and Privacy are reachable (and nothing talks to the backend).
  const gated = !state.onboarded && route?.page !== 'privacy';
  useEffect(() => {
    if (gated && route?.page !== 'onboarding') window.location.hash = '#/onboarding';
  }, [gated, route?.page]);

  return (
    <div className="min-h-screen bg-paper text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {!gated && <nav className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3.5 gap-y-2 px-4 pt-6 text-[11px] uppercase tracking-[0.08em] sm:px-6 sm:text-xs sm:gap-x-6 sm:tracking-[0.18em]">
        {NAV.map(([href, label]) => (
          <a key={href} href={href} aria-current={isCurrent(href) ? 'page' : undefined} className={`transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 ${isCurrent(href) ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}>
            {label}
          </a>
        ))}
      </nav>}
      <main className="mx-auto max-w-3xl px-4 py-8 leading-relaxed sm:px-6">
        {!route ? (
          <p>Not found.</p>
        ) : gated ? (
          <Onboarding onFinish={() => { window.location.hash = '#/'; }} />
        ) : route.page === 'today' ? (
          <Today />
        ) : route.page === 'digest' ? (
          <Today date={route.date} />
        ) : route.page === 'archive' ? (
          <Archive />
        ) : route.page === 'favorites' ? (
          <Favorites />
        ) : route.page === 'sources' ? (
          <Sources />
        ) : route.page === 'settings' ? (
          <Settings />
        ) : route.page === 'privacy' ? (
          <Privacy />
        ) : (
          <Onboarding onFinish={() => { window.location.hash = '#/'; }} />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
