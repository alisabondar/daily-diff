-- Phase 8 step 33: per-user data. Every row is visible and writable only by its owner.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  packs text[] not null default '{}',
  disabled_sources text[] not null default '{}',
  topics text[] not null default '{}',
  keywords text[] not null default '{}',
  highlights_cap int not null default 6,
  relevance_threshold int not null default 5,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, story_key)
);

create table public.favorite_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_key text not null,
  tag text not null,
  primary key (user_id, story_key, tag)
);

create table public.feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_key text not null,
  kind text not null check (kind = 'less_like_this'),
  created_at timestamptz not null default now(),
  primary key (user_id, story_key, kind)
);

create table public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current int not null default 0,
  best int not null default 0,
  last_date text
);

do $$
declare t text;
begin
  foreach t in array array['user_settings', 'favorites', 'favorite_tags', 'feedback', 'streaks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Lets a signed-in user delete their own account; every user table cascades.
create function public.delete_my_account() returns void
language sql security definer set search_path = ''
as $$ delete from auth.users where id = (select auth.uid()); $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
