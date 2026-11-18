/**
 * The onboarding gate: no backend client exists until onboarding is finished, so a new viewer makes no request to
 * Supabase. The one exception is the explicit "Already have an account? Sign in" action (forSignIn).
 */
export function createGate<C>(factory: () => C): { get(state: { onboarded: boolean }, opts?: { forSignIn?: boolean }): C | null } {
  let client: C | null = null;
  return {
    get(state, opts) {
      if (!state.onboarded && !opts?.forSignIn) return null;
      client ??= factory();
      return client;
    },
  };
}
