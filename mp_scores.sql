-- Таблица результатов мультиплеера "Змейки".
-- Выполни этот скрипт в SQL Editor Supabase (Dashboard -> SQL Editor -> New query).

create table if not exists public.mp_scores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points integer not null default 0,
  win boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.mp_scores enable row level security;

create policy "mp_scores: public read"
  on public.mp_scores for select
  using (true);

create policy "mp_scores: public insert"
  on public.mp_scores for insert
  with check (true);