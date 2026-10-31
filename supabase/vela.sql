-- ════════════════════════════════════════════════════════════════════════════
-- Vela — encrypted journal vault (one row per user)
-- For the SHARED Supabase project that also hosts FARO.
-- Creates/changes ONLY objects whose names start with "vela_".
-- Safe to run more than once (idempotent). Run it in: Dashboard → SQL Editor.
--
-- The row never contains readable diary content: the app encrypts the whole
-- journal on the device (PBKDF2-SHA256 → AES-GCM 256) before upload. The server
-- stores only ciphertext + iv + salt + KDF parameters.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.vela_vault (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ciphertext text        not null,
  iv         text        not null,
  salt       text        not null,
  kdf        jsonb       not null,
  version    int         not null default 1,
  revision   int         not null default 1,
  updated_at timestamptz not null default now(),
  constraint vela_vault_size     check (octet_length(ciphertext) <= 2097152),           -- ~2 MB
  constraint vela_vault_iv_len   check (char_length(iv)   between 8 and 64),
  constraint vela_vault_salt_len check (char_length(salt) between 8 and 128),
  constraint vela_vault_kdf_obj  check (jsonb_typeof(kdf) = 'object' and octet_length(kdf::text) <= 512),
  constraint vela_vault_rev_pos  check (revision >= 1)
);

comment on table public.vela_vault is
  'Vela: one end-to-end encrypted journal per user. Ciphertext only; the server cannot read it.';

-- Row-level security: each signed-in user can only see and change their own row.
alter table public.vela_vault enable row level security;
alter table public.vela_vault force row level security;

drop policy if exists vela_vault_select on public.vela_vault;
drop policy if exists vela_vault_insert on public.vela_vault;
drop policy if exists vela_vault_update on public.vela_vault;
drop policy if exists vela_vault_delete on public.vela_vault;

create policy vela_vault_select on public.vela_vault
  for select to authenticated using (user_id = auth.uid());
create policy vela_vault_insert on public.vela_vault
  for insert to authenticated with check (user_id = auth.uid());
create policy vela_vault_update on public.vela_vault
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vela_vault_delete on public.vela_vault
  for delete to authenticated using (user_id = auth.uid());

-- Only signed-in users get table access; anonymous visitors get nothing.
revoke all on table public.vela_vault from anon;
grant select, insert, update, delete on table public.vela_vault to authenticated;

-- Optimistic concurrency guard: a new row starts at revision 1, and every update
-- must move the revision forward by exactly one. The app updates with
-- "where revision = <base>", so a stale device gets 0 rows back (a conflict),
-- pulls, merges, and retries. updated_at is always set by the server.
create or replace function public.vela_vault_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'vela_vault: user_id cannot change';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'vela_vault: revision must be % (got %)', old.revision + 1, new.revision
        using errcode = '40001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists vela_vault_guard on public.vela_vault;
create trigger vela_vault_guard
  before insert or update on public.vela_vault
  for each row execute function public.vela_vault_guard();

-- ── Optional check after running (should return one row: vela_vault | true) ──
-- select relname, relrowsecurity from pg_class where relname = 'vela_vault';
