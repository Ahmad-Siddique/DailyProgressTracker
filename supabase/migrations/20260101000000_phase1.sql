-- Phase 1: single-owner auth, profiles, mutation_receipts

create extension if not exists "pgcrypto";

create table public.app_singleton (
  id int primary key default 1 check (id = 1),
  allowed_owner_email text not null
);

insert into public.app_singleton (id, allowed_owner_email)
values (1, 'owner@dayboard.test');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  timezone text not null default 'Asia/Karachi',
  display_name text,
  theme text not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  reporting_currency text not null default 'PKR'
    check (reporting_currency in ('PKR', 'USD')),
  reminders_enabled boolean not null default false,
  hide_amounts_on_lock_screen boolean not null default true,
  saved_chats_enabled boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  resource_id uuid,
  response_body jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index mutation_receipts_owner_id_idx on public.mutation_receipts (owner_id);

alter table public.profiles enable row level security;
alter table public.mutation_receipts enable row level security;
alter table public.app_singleton enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy mutation_receipts_all_own on public.mutation_receipts
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.enforce_single_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text;
  profile_count int;
begin
  select allowed_owner_email into allowed from public.app_singleton where id = 1;
  if allowed is null then
    raise exception 'private_app';
  end if;
  if lower(trim(new.email)) <> lower(trim(allowed)) then
    raise exception 'private_app';
  end if;
  select count(*)::int into profile_count from public.profiles;
  if profile_count >= 1 then
    raise exception 'private_app';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_enforce_single_owner
  before insert on auth.users
  for each row execute function public.enforce_single_owner_signup();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger mutation_receipts_updated_at
  before update on public.mutation_receipts
  for each row execute function public.set_updated_at();