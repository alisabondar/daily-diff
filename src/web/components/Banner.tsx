import { useState, type ReactNode } from 'react';
import type { Status } from '../api';

const Box = ({ children }: { children: ReactNode }) => (
  <div role="status" className="mb-6 rounded border-l-2 border-amber-500 bg-amber-50/70 px-4 py-2 text-sm text-neutral-700 dark:border-amber-600 dark:bg-amber-950/40 dark:text-neutral-200">{children}</div>
);

/** Turns a fetch error into a sentence; the raw text stays available as a hover. */
export function friendlyError(raw: string | null): string {
  if (!raw) return 'Failed for an unknown reason';
  if (/timed out/i.test(raw)) return 'Didn’t respond in time';
  const http = raw.match(/HTTP (\d{3})/);
  if (http) return http[1] === '404' ? 'Feed not found (404)' : http[1]!.startsWith('5') ? `Site error (${http[1]})` : `Refused the request (${http[1]})`;
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(raw)) return 'Couldn’t be reached';
  if (/xml|feed|parse|non-whitespace/i.test(raw)) return 'Didn’t return a readable feed';
  return 'Failed to load';
}

export function Banner({ isRaw, errorCode, failedSources }: { isRaw: boolean; errorCode: string | null; failedSources: Status['failedSources'] }) {
  const [showFailed, setShowFailed] = useState(false);
  const n = failedSources.length;
  return (
    <>
      {isRaw && errorCode === 'auth' && (
        <Box>Your API key was rejected or is out of credits. <a href="#/settings" className="underline">Fix it in Settings</a></Box>
      )}
      {isRaw && errorCode === 'llm' && <Box>AI summaries are unavailable today, so this is the raw feed.</Box>}
      {n > 0 && (
        <Box>
          <div className="flex items-baseline justify-between gap-4">
            <span>{n === 1 ? '1 source' : `${n} sources`} couldn’t be fetched today.</span>
            <button onClick={() => setShowFailed(!showFailed)} aria-expanded={showFailed} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
              {showFailed ? 'Hide' : 'Details'}
            </button>
          </div>
          {showFailed && (
            <ul className="mt-2 space-y-0.5 text-neutral-600 dark:text-neutral-300">
              {failedSources.map((s) => <li key={s.id} title={s.lastError ?? undefined}><span className="font-semibold">{s.title}</span> · {friendlyError(s.lastError)}</li>)}
              <li className="pt-1"><a href="#/sources" className="text-xs underline">Manage sources</a></li>
            </ul>
          )}
        </Box>
      )}
    </>
  );
}
