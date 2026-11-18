import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { browserStorage, useStore } from './store';
import { createUserStore } from './supabase-user';
import { syncOnSignIn, type UserStore } from './sync';

const SYNCED_KEY = 'daily-diff:synced-user';

export interface Account {
  user: { id: string; name: string } | null;
  syncing: boolean;
  error: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const Ctx = createContext<Account | null>(null);
export const useAccount = () => {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAccount outside AccountProvider');
  return a;
};

const readSynced = () => { try { return browserStorage()?.getItem(SYNCED_KEY) ?? null; } catch { return null; } };
const writeSynced = (id: string | null) => {
  try { const s = browserStorage(); if (id) s?.setItem(SYNCED_KEY, id); else s?.removeItem(SYNCED_KEY); } catch { /* blocked storage */ }
};

/** Optional GitHub sign-in. Once signed in, every change writes through to Supabase (step 40). */
export function AccountProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { client } = store;
  const [session, setSession] = useState<Session | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userStore = useRef<UserStore | null>(null);
  const ready = useRef(false); // true once the sign-in merge has landed, so write-through doesn't race it

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    ready.current = false;
    userStore.current = null;
    if (!client || !userId) return;
    const us = createUserStore(client, userId);
    setSyncing(true);
    syncOnSignIn(store.state, us, readSynced() !== userId)
      .then((merged) => {
        writeSynced(userId);
        store.update(() => merged);
        userStore.current = us;
        ready.current = true;
        // drop ?code= from the address bar, keep the hash route
        if (window.location.search) history.replaceState(null, '', window.location.pathname + window.location.hash);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSyncing(false));
    // run once per signed-in user; store.state is read at that moment on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId]);

  // Write-through, debounced.
  useEffect(() => {
    if (!ready.current || !userStore.current) return;
    const us = userStore.current;
    const t = setTimeout(() => { us.save(store.state).then(() => setError(null), (e: Error) => setError(e.message)); }, 600);
    return () => clearTimeout(t);
  }, [store.state]);

  const account: Account = {
    user: session ? { id: session.user.id, name: (session.user.user_metadata?.user_name as string | undefined) ?? session.user.email ?? 'you' } : null,
    syncing,
    error,
    async signIn() {
      const c = store.clientForSignIn();
      const { error: e } = await c.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin + window.location.pathname } });
      if (e) setError(e.message);
    },
    async signOut() {
      await client?.auth.signOut();
      writeSynced(null);
      setSession(null);
    },
    async deleteAccount() {
      if (!client) return;
      const { error: e } = await client.rpc('delete_my_account');
      if (e) { setError(e.message); return; }
      await client.auth.signOut();
      writeSynced(null);
      setSession(null);
    },
  };
  return <Ctx.Provider value={account}>{children}</Ctx.Provider>;
}
