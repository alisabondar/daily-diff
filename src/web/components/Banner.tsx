import { useState, type ReactNode } from 'react';
import type { Status } from '../api';

const Box = ({ children }: { children: ReactNode }) => (
  <div className="mb-4 rounded border border-amber-400 bg-amber-50 px-4 py-2 text-sm dark:border-amber-700 dark:bg-amber-950">{children}</div>
);

export function Banner({ isRaw, errorCode, failedSources }: { isRaw: boolean; errorCode: string | null; failedSources: Status['failedSources'] }) {
  const [showFailed, setShowFailed] = useState(false);
  return (
    <>
      {isRaw && errorCode === 'auth' && (
        <Box>Your API key was rejected or is out of credits — <a href="#/settings" className="underline">fix it in Settings</a></Box>
      )}
      {isRaw && errorCode === 'llm' && <Box>AI summaries unavailable today — showing raw feed.</Box>}
      {failedSources.length > 0 && (
        <Box>
          <button onClick={() => setShowFailed(!showFailed)} className="underline">{failedSources.length} sources failed</button>
          {showFailed && (
            <ul className="mt-2 list-disc pl-5">
              {failedSources.map((s) => <li key={s.id}>{s.title}: {s.lastError}</li>)}
            </ul>
          )}
        </Box>
      )}
    </>
  );
}
