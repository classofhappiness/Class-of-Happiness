-- Curriculum map, phase 1 migration. NOT YET RUN. Review, then run once in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent. Existing rows keep all their data; they just get an empty '{}'.

-- 1. Per-resource codes. Shape:
--    {"england_dfe":[{"code":"GW 8","proposed":false}], "wales":[{"code":"WB1","proposed":true}], ...}
--    Allowed keys (enforced by the server, not the database): england_dfe, england_pshe, scotland, wales, ni,
--    australia, cambridge, portugal, casel.
alter table public.resources
  add column if not exists curriculum_links jsonb not null default '{}'::jsonb;

-- 2. The statement text behind each code, per framework. statement may be null (code known, text not yet supplied).
create table if not exists public.curriculum_statements (
  id uuid primary key default gen_random_uuid(),
  framework text not null,
  code text not null,
  statement text,              -- null when the framework text is not available yet (the code is still stored)
  source text,
  created_at timestamptz not null default now(),
  constraint curriculum_statements_framework_code_key unique (framework, code)
);

-- Locked down: no policies are needed because service_role (the backend) bypasses row-level security.
alter table public.curriculum_statements enable row level security;
revoke all on table public.curriculum_statements from anon, authenticated;

grant select, insert, update, delete on public.curriculum_statements to service_role;
