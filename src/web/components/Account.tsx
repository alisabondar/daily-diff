import { useState } from 'react';
import { useAccount } from '../data/account';

const link = 'underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100';

/** Settings: sign in to sync, or who you're signed in as. */
export function AccountPanel() {
  const a = useAccount();
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">Sync</h2>
      <div className="space-y-1 rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        {a.user ? (
          <p className="text-neutral-600 dark:text-neutral-300">Signed in as <strong>{a.user.name}</strong>{a.syncing ? ' · syncing…' : ' · settings and favorites sync across devices'}. <button onClick={a.signOut} className={link}>Sign out</button></p>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-300">Your settings live in this browser only. <button onClick={a.signIn} className={link}>Sign in with GitHub</button> to sync them across devices.</p>
        )}
        {a.error && <p className="text-red-700 dark:text-red-400">Sync problem: {a.error}</p>}
      </div>
    </section>
  );
}

/** Onboarding: the one action allowed to reach the backend before setup is finished. */
export function SignInLink() {
  const a = useAccount();
  return <p className="border-t border-neutral-300 pt-4 text-sm text-neutral-500 dark:border-neutral-700">Already have an account? <button onClick={a.signIn} className={link}>Sign in with GitHub</button></p>;
}

/** Privacy page: delete the account and every synced row. */
export function DeleteAccount() {
  const a = useAccount();
  const [confirming, setConfirming] = useState(false);
  if (!a.user) return null;
  return (
    <section className="space-y-2 pt-4">
      <h2 className="font-semibold">Delete account</h2>
      <p>Removes your account and every synced row (settings, favorites, tags, feedback, reading days). This browser keeps its local copy until you clear it.</p>
      {confirming ? (
        <p className="flex gap-4"><button onClick={a.deleteAccount} className="rounded bg-red-700 px-3 py-1 text-white">Delete permanently</button><button onClick={() => setConfirming(false)} className={link}>Cancel</button></p>
      ) : (
        <button onClick={() => setConfirming(true)} className={link}>Delete my account</button>
      )}
    </section>
  );
}
