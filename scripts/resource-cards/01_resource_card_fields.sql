-- Resource cards: facts on the resources table + separate previews table.
-- Run in the Supabase SQL editor. Safe to re-run.

-- 1. Card facts (all optional; blank = chip/line is not shown)
alter table public.resources add column if not exists age_min int;
alter table public.resources add column if not exists age_max int;
alter table public.resources add column if not exists duration_minutes int;
-- comma-separated codes from: individual, small_group, whole_class (e.g. 'individual,small_group')
alter table public.resources add column if not exists grouping text;
alter table public.resources add column if not exists goal text;
-- outcomes separated by ' | ' (one bullet each)
alter table public.resources add column if not exists outcomes text;
alter table public.resources add column if not exists use_when text;

-- 2. Page previews live in their own table so list endpoints never carry images.
create table if not exists public.resource_previews (
  resource_id text not null references public.resources(id) on delete cascade,
  page_order  int  not null,
  image       text not null,  -- base64 JPEG (no data: prefix), ~600 px wide
  primary key (resource_id, page_order)
);

-- (resources.id is a text column here, so resource_id is text too.)
-- Server-side only: the backend uses the service_role key. No access for anon/authenticated.
alter table public.resource_previews enable row level security;
grant select, insert, update, delete on public.resource_previews to service_role;
