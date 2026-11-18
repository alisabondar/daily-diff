-- Phase 8 step 33: published scrub data. Readable by anyone; written only by the service role (which bypasses RLS).

create table public.scrubs (
  date text primary key,
  window_start bigint not null,
  window_end bigint not null,
  published_at timestamptz not null default now()
);

create table public.scrub_stories (
  key text primary key,
  date text not null references public.scrubs (date) on delete cascade,
  title text not null,
  links jsonb not null,
  source_ids int[] not null,
  pack text,
  category text,
  topic text not null,
  score int not null,
  summary text,
  stats jsonb,
  pros text[],
  cons text[],
  read_minutes int not null,
  published_at bigint not null,
  fts tsvector generated always as (to_tsvector('english', title || ' ' || coalesce(summary, ''))) stored
);
create index scrub_stories_date_idx on public.scrub_stories (date);
create index scrub_stories_fts_idx on public.scrub_stories using gin (fts);

create table public.scrub_learn (
  date text not null references public.scrubs (date) on delete cascade,
  position int not null,
  type text not null,
  concept_key text,
  title text not null,
  body_md text not null,
  quiz jsonb,
  related_story_key text,
  source_ref text not null,
  primary key (date, position)
);

create table public.catalog_sources (
  id int primary key,
  pack text not null,
  title text not null,
  url text not null,
  type text not null,
  kind text not null
);

alter table public.scrubs enable row level security;
alter table public.scrub_stories enable row level security;
alter table public.scrub_learn enable row level security;
alter table public.catalog_sources enable row level security;

create policy "scrubs are public" on public.scrubs for select to anon, authenticated using (true);
create policy "scrub stories are public" on public.scrub_stories for select to anon, authenticated using (true);
create policy "scrub learn is public" on public.scrub_learn for select to anon, authenticated using (true);
create policy "catalog is public" on public.catalog_sources for select to anon, authenticated using (true);
