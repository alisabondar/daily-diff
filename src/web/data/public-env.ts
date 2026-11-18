// Phase 8 rule 7: the only build-time values the browser bundle may read. All three are public by design
// (row-level security protects the data); no secret ever has a VITE_ name.
export const PUBLIC_ENV = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  githubRepo: import.meta.env.VITE_GITHUB_REPO,
};
