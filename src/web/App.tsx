import { useEffect, useRef, useState } from 'react';
import { api, type Status } from './api';
import { Archive } from './pages/Archive';
import { Favorites } from './pages/Favorites';
import { Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { MissedDay } from './pages/MissedDay';
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

type Route = { page: 'today' } | { page: 'digest'; date: string } | { page: 'missed'; date: string; day: string } | { page: 'archive' | 'favorites' | 'sources' | 'settings' | 'onboarding' };

function match(path: string): Route | null {
  if (path === '/') return { page: 'today' };
  const d = path.match(/^\/d\/(\d{4}-\d{2}-\d{2})$/);
  if (d) return { page: 'digest', date: d[1] };
  const m = path.match(/^\/d\/(\d{4}-\d{2}-\d{2})\/missed\/(\d{4}-\d{2}-\d{2})$/);
  if (m) return { page: 'missed', date: m[1]!, day: m[2]! };
  const p = path.slice(1);
  if (p === 'archive' || p === 'favorites' || p === 'sources' || p === 'settings' || p === 'onboarding') return { page: p };
  return null;
}

const NAV = [
  ['#/', 'Today'],
  ['#/archive', 'Archive'],
  ['#/favorites', 'Favorites'],
  ['#/sources', 'Sources'],
  ['#/settings', 'Settings'],
] as const;

export function App() {
  const path = useHash();
  const [status, setStatus] = useState<Status | null>(null);

  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      clearTimeout(timer);
      const s = await (await api.status.$get()).json();
      if (stopped) return;
      setStatus(s);
      if (s.progress.running) timer = setTimeout(poll, 2000);
    };
    pollRef.current = poll;
    api.ensure.$post().then(poll);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const route = match(path);
  // An archived digest (#/d/:date) belongs to Archive.
  const isCurrent = (href: string) => href === '#' + path || (href === '#/archive' && (route?.page === 'digest' || route?.page === 'missed'));
  useEffect(() => {
    if (status && !status.onboarded && route?.page !== 'onboarding') window.location.hash = '#/onboarding';
  }, [status, route?.page]);

  return (
    <div className="min-h-screen bg-paper text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {route?.page !== 'onboarding' && <nav className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3.5 gap-y-2 px-4 pt-6 text-[11px] uppercase tracking-[0.08em] sm:px-6 sm:text-xs sm:gap-x-6 sm:tracking-[0.18em]">
        {NAV.map(([href, label]) => (
          <a key={href} href={href} aria-current={isCurrent(href) ? 'page' : undefined} className={`transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 ${isCurrent(href) ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}>
            {label}
          </a>
        ))}
      </nav>}
      <main className="mx-auto max-w-3xl px-6 py-8 leading-relaxed">
        {!route ? (
          <p>Not found.</p>
        ) : !status ? null : route.page === 'today' ? (
          <Today status={status} />
        ) : route.page === 'digest' ? (
          <Today status={status} date={route.date} />
        ) : route.page === 'missed' ? (
          <MissedDay status={status} date={route.date} day={route.day} />
        ) : route.page === 'archive' ? (
          <Archive />
        ) : route.page === 'favorites' ? (
          <Favorites />
        ) : route.page === 'sources' ? (
          <Sources />
        ) : route.page === 'settings' ? (
          <Settings />
        ) : (
          <Onboarding
            onFinish={async () => {
              await pollRef.current();
              window.location.hash = '#/';
            }}
          />
        )}
      </main>
    </div>
  );
}
