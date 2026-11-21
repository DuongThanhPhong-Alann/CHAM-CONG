create table if not exists public.app_accounts (
  id text primary key,
  display_name text not null,
  phone text not null unique,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  timesheet_id text not null,
  employee_name text not null,
  date date not null,
  shifts jsonb not null,
  coworkers text[] not null default '{}',
  extra_hours numeric not null default 0,
  total_hours numeric not null,
  actual_pay numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_tenant_employee_date_key
    unique (owner_id, timesheet_id, employee_name, date)
);

create table if not exists public.weekly_pay (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  timesheet_id text not null,
  employee_name text not null,
  week_start date not null,
  hourly_rate numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_pay_tenant_employee_week_key
    unique (owner_id, timesheet_id, employee_name, week_start)
);

alter table public.app_accounts enable row level security;
alter table public.attendance_records enable row level security;
alter table public.weekly_pay enable row level security;

revoke all on public.app_accounts from anon, authenticated;
revoke all on public.attendance_records from anon, authenticated;
revoke all on public.weekly_pay from anon, authenticated;
grant select, insert, update, delete on public.app_accounts to service_role;
grant select, insert, update, delete on public.attendance_records to service_role;
grant select, insert, update, delete on public.weekly_pay to service_role;
