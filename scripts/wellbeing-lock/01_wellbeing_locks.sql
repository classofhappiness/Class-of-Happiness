-- Wellbeing lock: the parent "My Wellbeing" PIN and the teacher check-in PIN.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Before this, the PIN lived only in the device's AsyncStorage, in plain text, and
-- "Forgot PIN?" deleted it with no check at all - anyone holding the unlocked phone
-- could clear it and read every entry. This table is what makes the lock real: the
-- PIN hash, the recovery hint, and the reset lockout counters all live server-side.
--
-- One row per lock, not per account: a parent has a separate lock for each adult
-- family member (scope 'family:<family_member_id>'), a teacher has exactly one
-- (scope 'teacher'). That mirrors the AsyncStorage keys this replaces
-- (wellbeing_pin_<memberId> and teacher_checkin_pin).

create table if not exists public.wellbeing_locks (
  user_id    text not null,
  -- 'teacher' | 'family:<family_member_id>'
  scope      text not null,

  -- Salted hash of the 4-digit PIN (hash_password/verify_password, same as
  -- admin_pin_hash). Never the PIN itself.
  pin_hash   text not null,

  -- Which of the three fixed prompts the person chose: 'pet' | 'hobby' | 'place'.
  -- Only the prompt is ever read back to a client; the answer never is.
  hint_prompt text,
  -- Salted hash of the trimmed, lowercased one-word answer. Never the answer itself,
  -- and deliberately nullable: accounts that set a PIN before this feature existed
  -- have no hint until they add one (see /wellbeing-lock/<scope>/add-hint).
  hint_hash   text,

  -- Reset/unlock throttling, same shape and same 5-tries/15-minutes policy as the
  -- admin login PIN's pin_failed_attempts/pin_locked_until columns on users.
  failed_attempts integer not null default 0,
  locked_until    timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, scope)
);

-- Server-side only: the backend uses the service_role key. No access for anon/authenticated -
-- a client that could read this table directly would get the hashes it is meant to be gated by.
alter table public.wellbeing_locks enable row level security;
grant select, insert, update, delete on public.wellbeing_locks to service_role;
