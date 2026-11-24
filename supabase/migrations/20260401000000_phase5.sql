-- Phase 5: reminders, push subscriptions, account deletion RPC

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  subject_type text not null check (subject_type in ('task', 'savings_fund')),
  subject_id uuid not null,
  fire_at timestamptz not null,
  dedupe_key text not null,
  enabled boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index reminders_owner_fire_idx on public.reminders (owner_id, fire_at);
create index push_subscriptions_owner_id_idx on public.push_subscriptions (owner_id);

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

create policy reminders_all_own on public.reminders
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy push_subscriptions_all_own on public.push_subscriptions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.cascade_delete_task_reminders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.reminders
  where subject_type = 'task' and subject_id = old.id;
  return old;
end;
$$;

create trigger tasks_delete_reminders
  after delete on public.tasks
  for each row execute function public.cascade_delete_task_reminders();

create or replace function public.cascade_delete_fund_reminders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.reminders
  where subject_type = 'savings_fund' and subject_id = old.id;
  return old;
end;
$$;

create trigger savings_funds_delete_reminders
  after delete on public.savings_funds
  for each row execute function public.cascade_delete_fund_reminders();

-- Fixture owner only: removes auth user; profiles and private rows cascade via FK.
create or replace function public.delete_owner_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_owner_account() from public;
grant execute on function public.delete_owner_account() to authenticated;