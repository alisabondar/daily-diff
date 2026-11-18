import { createClient } from '@supabase/supabase-js';
import { envValue } from '../config.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { paths } from '../paths.js';
import { createUserStore } from '../web/data/supabase-user.js';
import { importLocal } from './import-local.js';
import { createSupabaseScrubStore } from './supabase-store.js';

/** `daily-diff import-local --email <email>`: copies ~/.daily-diff into Supabase once (step 41). Returns the exit code. */
export async function runImportCommand(email: string | undefined): Promise<number> {
  const url = envValue('SUPABASE_URL')?.value;
  const serviceKey = envValue('SUPABASE_SERVICE_ROLE_KEY')?.value;
  if (!email || !url || !serviceKey) {
    console.error('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… daily-diff import-local --email <the email on your GitHub account>');
    return 1;
  }
  const redact = (m: string) => m.split(serviceKey).join('[redacted]');
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let userId: string | null = null;
    for (let page = 1; !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (!userId) {
      console.error(`No account for ${email}. Sign in once on the site first.`);
      return 1;
    }
    const db = openDb(paths().db);
    runMigrations(db); // a no-op on an up-to-date database
    const counts = await importLocal({ db, scrubStore: createSupabaseScrubStore(url, serviceKey), userStore: createUserStore(admin, userId) });
    db.$client.close();
    console.log(`Imported ${counts.scrubs} days, ${counts.stories} stories, ${counts.favorites} favorites (${counts.tags} tags), ${counts.feedback} feedback, ${counts.reads} reading days. Skipped ${counts.skipped} Reddit-only.`);
    return 0;
  } catch (err) {
    console.error(`Import failed: ${redact((err as Error).message ?? String(err))}`);
    return 1;
  }
}
