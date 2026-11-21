alter table public.app_accounts
  add column if not exists passkeys jsonb not null default '[]'::jsonb;

create table if not exists public.app_passkey_challenges (
  challenge text primary key,
  account_id text not null references public.app_accounts(id) on delete cascade,
  purpose text not null check (purpose in ('register', 'authenticate')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_passkey_challenges_expires_at_idx
  on public.app_passkey_challenges (expires_at);

alter table public.app_passkey_challenges enable row level security;
revoke all on public.app_passkey_challenges from anon, authenticated;
grant select, insert, update, delete on public.app_passkey_challenges to service_role;
