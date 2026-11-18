-- Phase 8 step 33: row-level security checks. Run inside a transaction that is rolled back:
--   npm run db:rls
-- Prints "RLS OK" and exits 0, or raises on the first failed check.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev', 'authenticated', 'authenticated');
insert into public.scrubs (date, window_start, window_end) values ('2026-11-18', 0, 1);
insert into public.scrub_stories (key, date, title, links, source_keys, topic, score, read_minutes, published_at)
  values ('k1', '2026-11-18', 'Hello', '[]', '{}', 'ai', 7, 1, 0);
insert into public.favorites (user_id, story_key) values ('00000000-0000-0000-0000-00000000000b', 'k1');
insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000000b');

-- anon: can read the scrub, cannot write it, cannot read user data
set local role anon;
do $$ begin
  if (select count(*) from public.scrub_stories) <> 1 then raise exception 'anon cannot read scrub_stories'; end if;
  if (select count(*) from public.user_settings) <> 0 then raise exception 'anon can read user_settings'; end if;
  begin
    insert into public.scrub_stories (key, date, title, links, source_keys, topic, score, read_minutes, published_at)
      values ('k2', '2026-11-18', 'x', '[]', '{}', 'ai', 1, 1, 0);
    raise exception 'anon could insert into scrub_stories';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- user A: cannot see or write user B's rows; can write their own
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.favorites) <> 0 then raise exception 'A can read B favorites'; end if;
  if (select count(*) from public.scrub_stories) <> 1 then raise exception 'authenticated cannot read scrub_stories'; end if;
  insert into public.favorites (user_id, story_key) values ('00000000-0000-0000-0000-00000000000a', 'k1');
  begin
    insert into public.favorites (user_id, story_key) values ('00000000-0000-0000-0000-00000000000b', 'k9');
    raise exception 'A could write a favorite for B';
  exception when insufficient_privilege then null;
  end;
  update public.user_settings set onboarded = true where user_id = '00000000-0000-0000-0000-00000000000b';
  if found then raise exception 'A could update B settings'; end if;
end $$;
reset role;

-- user B deletes their own account: every user row cascades, the scrub stays
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b') then raise exception 'B account not deleted'; end if;
  if exists (select 1 from public.favorites where user_id = '00000000-0000-0000-0000-00000000000b') then raise exception 'B favorites not cascaded'; end if;
  if exists (select 1 from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000b') then raise exception 'B settings not cascaded'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then raise exception 'A deleted too'; end if;
  if (select count(*) from public.scrub_stories) <> 1 then raise exception 'scrub changed'; end if;
end $$;

-- anon cannot call delete_my_account
set local role anon;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'anon could call delete_my_account';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'RLS OK' as result;
rollback;
