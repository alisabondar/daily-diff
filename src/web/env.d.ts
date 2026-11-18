/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** owner/repo, for the "Suggest a source" link. */
  readonly VITE_GITHUB_REPO: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
