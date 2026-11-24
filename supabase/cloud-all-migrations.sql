-- Run once in Supabase SQL Editor if pnpm db:push:cloud is unavailable.
-- Files: 8

-- ## 20260101000000_phase1.sql
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

-- ## 20260101000001_profiles_version_guard.sql
-- Reject profile updates where version jumps by anything other than +1.

create or replace function public.enforce_profiles_version_step()
returns trigger
language plpgsql
as $$
begin
  if new.version is distinct from old.version then
    if new.version <> old.version + 1 then
      raise exception 'profile_version_step_invalid';
    end if;
    return new;
  end if;
  if row (
    new.timezone,
    new.theme,
    new.display_name,
    new.reporting_currency,
    new.reminders_enabled,
    new.hide_amounts_on_lock_screen,
    new.saved_chats_enabled,
    new.email
  ) is distinct from row (
    old.timezone,
    old.theme,
    old.display_name,
    old.reporting_currency,
    old.reminders_enabled,
    old.hide_amounts_on_lock_screen,
    old.saved_chats_enabled,
    old.email
  ) then
    raise exception 'profile_version_required';
  end if;
  return new;
end;
$$;

create trigger profiles_version_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profiles_version_step();

-- ## 20260201000000_phase2.sql
-- Phase 2: tasks, goals, recurrence, RPCs

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  deadline_date date,
  archived_at timestamptz,
  position text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, position)
);

create table public.goal_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'practicing', 'done')),
  position text not null,
  status_changed_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, position)
);

create table public.recurrence_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  notes text,
  priority text check (priority is null or priority in ('low', 'normal', 'high')),
  cadence text not null check (cadence in ('daily', 'weekly')),
  weekdays smallint[] default '{}',
  start_date date not null,
  end_date date,
  position text not null default 'm',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurrence_skips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.recurrence_templates (id) on delete cascade,
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (template_id, local_date)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  status text not null default 'backlog'
    check (status in ('backlog', 'todo', 'in_progress', 'done')),
  priority text check (priority is null or priority in ('low', 'normal', 'high')),
  local_date date,
  start_time time,
  end_time time,
  goal_item_id uuid references public.goal_items (id) on delete set null,
  position text not null,
  completed_at timestamptz,
  recurrence_template_id uuid references public.recurrence_templates (id) on delete set null,
  recurrence_date date,
  detached boolean not null default false,
  client_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, status, position),
  unique (recurrence_template_id, recurrence_date),
  check (
    start_time is null or local_date is not null
  ),
  check (
    end_time is null or (start_time is not null and end_time > start_time)
  ),
  check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create index tasks_owner_status_position_idx on public.tasks (owner_id, status, position);
create index tasks_owner_local_date_idx on public.tasks (owner_id, local_date);
create index tasks_goal_item_id_idx on public.tasks (goal_item_id);

alter table public.goals enable row level security;
alter table public.goal_items enable row level security;
alter table public.tasks enable row level security;
alter table public.recurrence_templates enable row level security;
alter table public.recurrence_skips enable row level security;

create policy goals_all_own on public.goals
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy goal_items_all_own on public.goal_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy tasks_all_own on public.tasks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy recurrence_templates_all_own on public.recurrence_templates
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy recurrence_skips_all_own on public.recurrence_skips
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create trigger goal_items_updated_at
  before update on public.goal_items
  for each row execute function public.set_updated_at();

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- move_task: status, position, completion in one update
create or replace function public.move_task(
  p_task_id uuid,
  p_to_status text,
  p_position text,
  p_base_version integer,
  p_idempotency_key text default null
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.tasks;
  v_completed timestamptz;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if p_to_status not in ('backlog', 'todo', 'in_progress', 'done') then
    raise exception 'invalid status';
  end if;

  if p_to_status = 'done' then
    v_completed := now();
  else
    v_completed := null;
  end if;

  update public.tasks
  set
    status = p_to_status,
    position = p_position,
    completed_at = v_completed,
    version = version + 1
  where id = p_task_id
    and owner_id = v_owner
    and version = p_base_version
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.tasks where id = p_task_id and owner_id = v_owner;
    if v_row.id is null then
      raise exception 'task not found';
    end if;
    return v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.bulk_insert_goal_items(
  p_goal_id uuid,
  p_titles text[],
  p_idempotency_key text default null
)
returns setof public.goal_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_goal public.goals;
  v_pos text;
  v_base text;
  v_title text;
  v_ord integer;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select * into v_goal from public.goals where id = p_goal_id and owner_id = v_owner;
  if v_goal.id is null then
    raise exception 'goal not found';
  end if;

  select coalesce(max(position), 'a') into v_base
  from public.goal_items
  where goal_id = p_goal_id;

  v_ord := 0;
  foreach v_title in array p_titles loop
    v_title := trim(v_title);
    if v_title = '' then
      continue;
    end if;
    v_ord := v_ord + 1;
    v_pos := v_base || lpad(v_ord::text, 4, '0');
    return query
    insert into public.goal_items (
      goal_id, owner_id, title, status, position, status_changed_at
    ) values (
      p_goal_id, v_owner, v_title, 'not_started', v_pos, now()
    )
    returning *;
  end loop;
end;
$$;

create or replace function public.apply_recurrence(
  p_owner_timezone text default 'Asia/Karachi'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
begin
  return 0;
end;
$$;

create or replace function public.skip_occurrence(
  p_template_id uuid,
  p_local_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  insert into public.recurrence_skips (owner_id, template_id, local_date)
  values (v_owner, p_template_id, p_local_date)
  on conflict (template_id, local_date) do nothing;
  delete from public.tasks
  where recurrence_template_id = p_template_id
    and recurrence_date = p_local_date
    and owner_id = v_owner;
end;
$$;

create or replace function public.split_recurrence_from(
  p_template_id uuid,
  p_from_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return p_template_id;
end;
$$;

grant execute on function public.move_task to authenticated;
grant execute on function public.bulk_insert_goal_items to authenticated;
grant execute on function public.apply_recurrence to authenticated;
grant execute on function public.skip_occurrence to authenticated;
grant execute on function public.split_recurrence_from to authenticated;

-- ## 20260201000002_phase2_hardening.sql
-- RLS ownership joins + real recurrence RPCs

drop policy if exists goal_items_all_own on public.goal_items;
create policy goal_items_all_own on public.goal_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists tasks_all_own on public.tasks;
create policy tasks_all_own on public.tasks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      goal_item_id is null
      or exists (
        select 1 from public.goal_items gi
        where gi.id = goal_item_id and gi.owner_id = auth.uid()
      )
    )
  );

create or replace function public.apply_recurrence(
  p_owner_timezone text default 'Asia/Karachi'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_today date;
  v_from date;
  v_horizon date;
  v_tpl public.recurrence_templates;
  v_d date;
  v_ins integer := 0;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  v_today := (timezone(p_owner_timezone, now()))::date;
  v_from := v_today - 13;

  for v_tpl in
    select * from public.recurrence_templates where owner_id = v_owner
  loop
  v_horizon := v_today + 7;
  if v_tpl.end_date is not null then
    v_horizon := least(v_horizon, v_tpl.end_date);
  end if;
  v_d := greatest(v_tpl.start_date, v_from);
  while v_d <= v_horizon loop
    if v_d >= v_tpl.start_date and (v_tpl.end_date is null or v_d <= v_tpl.end_date) then
      if v_tpl.cadence = 'daily'
         or (
           v_tpl.cadence = 'weekly'
           and extract(isodow from v_d)::int = any(v_tpl.weekdays)
         )
      then
        if not exists (
          select 1 from public.recurrence_skips s
          where s.template_id = v_tpl.id and s.local_date = v_d
        ) and not exists (
          select 1 from public.tasks t
          where t.recurrence_template_id = v_tpl.id
            and t.recurrence_date = v_d
            and t.owner_id = v_owner
        ) then
          insert into public.tasks (
            owner_id, title, status, position, local_date,
            recurrence_template_id, recurrence_date, priority, notes
          ) values (
            v_owner, v_tpl.title, 'todo', v_tpl.position || v_d::text,
            v_d, v_tpl.id, v_d, v_tpl.priority, v_tpl.notes
          );
          v_ins := v_ins + 1;
        end if;
      end if;
    end if;
    v_d := v_d + 1;
  end loop;
  end loop;

  return v_ins;
end;
$$;

create or replace function public.split_recurrence_from(
  p_template_id uuid,
  p_from_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_old public.recurrence_templates;
  v_new_id uuid := gen_random_uuid();
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select * into v_old from public.recurrence_templates
  where id = p_template_id and owner_id = v_owner;
  if v_old.id is null then
    raise exception 'template not found';
  end if;

  update public.recurrence_templates
  set end_date = p_from_date - 1, updated_at = now()
  where id = p_template_id;

  insert into public.recurrence_templates (
    id, owner_id, title, notes, priority, cadence, weekdays,
    start_date, end_date, position
  ) values (
    v_new_id, v_owner, v_old.title, v_old.notes, v_old.priority,
    v_old.cadence, v_old.weekdays, p_from_date, v_old.end_date, v_old.position
  );

  return v_new_id;
end;
$$;

-- ## 20260301000000_phase3.sql
-- Phase 3: money, savings, budgets, atomic RPCs

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  currency text not null check (currency in ('PKR', 'USD')),
  opening_balance_minor bigint not null default 0,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts
  add constraint accounts_id_owner_unique unique (id, owner_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  kind text not null check (kind in ('expense', 'income')),
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  effective_on date not null,
  pkr_minor_per_usd bigint not null check (pkr_minor_per_usd > 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, effective_on)
);

create table public.transfer_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  occurred_on date not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null,
  category_id uuid references public.categories (id) on delete restrict,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('PKR', 'USD')),
  occurred_on date not null,
  note text,
  voided_at timestamptz,
  transfer_group_id uuid references public.transfer_groups (id) on delete restrict,
  transfer_leg text check (transfer_leg is null or transfer_leg in ('out', 'in')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, owner_id) references public.accounts (id, owner_id),
  check (
  (
      kind = 'transfer' and transfer_group_id is not null and transfer_leg is not null
      and category_id is null
    )
    or (
      kind in ('expense', 'income')
      and category_id is not null
      and transfer_group_id is null
      and transfer_leg is null
    )
  )
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  month date not null,
  currency text not null check (currency in ('PKR', 'USD')),
  amount_minor bigint not null check (amount_minor >= 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, category_id, month)
);

create table public.savings_funds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  kind text not null check (kind in ('purchase', 'general')),
  currency text not null check (currency in ('PKR', 'USD')),
  target_minor bigint not null check (target_minor > 0),
  start_month date not null,
  deadline_month date not null check (deadline_month >= start_month),
  opening_allocation_minor bigint not null default 0
    check (opening_allocation_minor >= 0),
  purchased_at timestamptz,
  purchase_expense_id uuid references public.ledger_entries (id) on delete set null,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opening_allocation_minor <= target_minor)
);

alter table public.savings_funds
  add constraint savings_funds_id_owner_unique unique (id, owner_id);

create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  fund_id uuid not null references public.savings_funds (id) on delete cascade,
  kind text not null check (kind in ('contribution', 'withdrawal', 'release')),
  amount_minor bigint not null check (amount_minor > 0),
  occurred_on date not null,
  note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fund_id, owner_id) references public.savings_funds (id, owner_id)
);

create index ledger_entries_owner_occurred_idx
  on public.ledger_entries (owner_id, occurred_on)
  where voided_at is null;
create index budgets_owner_month_idx on public.budgets (owner_id, month);
create index savings_entries_fund_occurred_idx on public.savings_entries (fund_id, occurred_on);
create index fx_rates_owner_effective_idx on public.fx_rates (owner_id, effective_on desc);

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.fx_rates enable row level security;
alter table public.transfer_groups enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_funds enable row level security;
alter table public.savings_entries enable row level security;

create policy accounts_all_own on public.accounts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy categories_all_own on public.categories
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy fx_rates_all_own on public.fx_rates
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy transfer_groups_all_own on public.transfer_groups
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ledger_entries_all_own on public.ledger_entries
  for all to authenticated using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.owner_id = auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()
    ))
  );
create policy budgets_all_own on public.budgets
  for all to authenticated using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid())
  );
create policy savings_funds_all_own on public.savings_funds
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy savings_entries_all_own on public.savings_entries
  for all to authenticated using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.savings_funds f where f.id = fund_id and f.owner_id = auth.uid())
  );

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger fx_rates_updated_at before update on public.fx_rates
  for each row execute function public.set_updated_at();
create trigger transfer_groups_updated_at before update on public.transfer_groups
  for each row execute function public.set_updated_at();
create trigger ledger_entries_updated_at before update on public.ledger_entries
  for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger savings_funds_updated_at before update on public.savings_funds
  for each row execute function public.set_updated_at();
create trigger savings_entries_updated_at before update on public.savings_entries
  for each row execute function public.set_updated_at();

-- Reserved savings: reject negative reserved after any entry mutation
create or replace function public.savings_reserved_minor(p_fund_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(f.opening_allocation_minor, 0)::bigint + coalesce((
    select sum(
      case e.kind
        when 'contribution' then e.amount_minor
        when 'withdrawal' then -e.amount_minor
        when 'release' then -e.amount_minor
        else 0
      end
    )
    from public.savings_entries e
    where e.fund_id = p_fund_id
  ), 0)::bigint
  from public.savings_funds f
  where f.id = p_fund_id;
$$;

create or replace function public.enforce_savings_entry_before()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reserved bigint;
begin
  if NEW.kind = 'release'
     and current_setting('dayboard.allow_release', true) is distinct from '1' then
    raise exception 'release only via purchase_savings_fund';
  end if;
  if NEW.kind = 'withdrawal' then
    v_reserved := public.savings_reserved_minor(NEW.fund_id);
    if v_reserved < NEW.amount_minor then
      raise exception 'withdrawal exceeds reserved';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger savings_entries_before_insert
  before insert on public.savings_entries
  for each row execute function public.enforce_savings_entry_before();

create or replace function public.enforce_savings_reserved_after()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fund_id uuid;
  v_reserved bigint;
begin
  if TG_OP = 'DELETE' then
    v_fund_id := OLD.fund_id;
  else
    v_fund_id := NEW.fund_id;
  end if;
  v_reserved := public.savings_reserved_minor(v_fund_id);
  if v_reserved < 0 then
    raise exception 'reserved cannot be negative';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger savings_entries_reserved_check
  after insert or update or delete on public.savings_entries
  for each row execute function public.enforce_savings_reserved_after();

create or replace function public.post_transfer(
  p_group_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_occurred_on date,
  p_out_leg_id uuid,
  p_in_leg_id uuid,
  p_out_amount_minor bigint,
  p_in_amount_minor bigint,
  p_fee_expense_id uuid default null,
  p_fee_amount_minor bigint default null,
  p_fee_category_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_receipt jsonb;
  v_hash text;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;
  if p_from_account_id = p_to_account_id then raise exception 'same account'; end if;
  if p_out_amount_minor <= 0 or p_in_amount_minor <= 0 then raise exception 'zero amount'; end if;

  if p_idempotency_key is not null then
    select response_body into v_receipt
    from public.mutation_receipts
    where owner_id = v_owner and idempotency_key = p_idempotency_key;
    if v_receipt is not null then
      return v_receipt;
    end if;
  end if;

  select * into v_from from public.accounts where id = p_from_account_id and owner_id = v_owner;
  select * into v_to from public.accounts where id = p_to_account_id and owner_id = v_owner;
  if v_from.id is null or v_to.id is null then raise exception 'account not found'; end if;

  insert into public.transfer_groups (id, owner_id, occurred_on)
  values (p_group_id, v_owner, p_occurred_on);

  insert into public.ledger_entries (
    id, owner_id, account_id, kind, amount_minor, currency, occurred_on,
    transfer_group_id, transfer_leg
  ) values (
    p_out_leg_id, v_owner, p_from_account_id, 'transfer', p_out_amount_minor,
    v_from.currency, p_occurred_on, p_group_id, 'out'
  );

  insert into public.ledger_entries (
    id, owner_id, account_id, kind, amount_minor, currency, occurred_on,
    transfer_group_id, transfer_leg
  ) values (
    p_in_leg_id, v_owner, p_to_account_id, 'transfer', p_in_amount_minor,
    v_to.currency, p_occurred_on, p_group_id, 'in'
  );

  if p_fee_amount_minor is not null and p_fee_amount_minor > 0 then
    insert into public.ledger_entries (
      id, owner_id, account_id, category_id, kind, amount_minor, currency, occurred_on
    ) values (
      p_fee_expense_id, v_owner, p_from_account_id, p_fee_category_id, 'expense',
      p_fee_amount_minor, v_from.currency, p_occurred_on
    );
  end if;

  v_receipt := jsonb_build_object(
    'group_id', p_group_id,
    'out_leg_id', p_out_leg_id,
    'in_leg_id', p_in_leg_id,
    'fee_expense_id', p_fee_expense_id
  );

  if p_idempotency_key is not null then
    v_hash := encode(sha256(p_idempotency_key::bytea), 'hex');
    insert into public.mutation_receipts (owner_id, idempotency_key, request_hash, resource_id, response_body)
    values (v_owner, p_idempotency_key, v_hash, p_group_id, v_receipt);
  end if;

  return v_receipt;
end;
$$;

create or replace function public.void_transfer_group(
  p_group_id uuid,
  p_base_version integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_now timestamptz := now();
  v_updated int;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;

  update public.transfer_groups
  set version = version + 1
  where id = p_group_id and owner_id = v_owner and version = p_base_version;

  if not found then
    raise exception 'version conflict';
  end if;

  update public.ledger_entries
  set voided_at = v_now, version = version + 1
  where transfer_group_id = p_group_id and owner_id = v_owner and voided_at is null;

  get diagnostics v_updated = row_count;
  if v_updated < 2 then
    raise exception 'transfer legs missing';
  end if;
end;
$$;

create or replace function public.copy_budgets(
  p_from_month date,
  p_to_month date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_inserted int := 0;
  v_unchanged int := 0;
  v_row record;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;

  for v_row in
    select b.* from public.budgets b where b.owner_id = v_owner and b.month = p_from_month
  loop
    if exists (
      select 1 from public.budgets x
      where x.owner_id = v_owner and x.category_id = v_row.category_id and x.month = p_to_month
    ) then
      v_unchanged := v_unchanged + 1;
    else
      insert into public.budgets (owner_id, category_id, month, currency, amount_minor)
      values (v_owner, v_row.category_id, p_to_month, v_row.currency, v_row.amount_minor);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'leftUnchanged', v_unchanged);
end;
$$;

create or replace function public.purchase_savings_fund(
  p_fund_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_occurred_on date,
  p_expense_id uuid,
  p_release_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_fund public.savings_funds;
  v_acct public.accounts;
  v_reserved bigint;
  v_receipt jsonb;
  v_hash text;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;

  if p_idempotency_key is not null then
    select response_body into v_receipt
    from public.mutation_receipts
    where owner_id = v_owner and idempotency_key = p_idempotency_key;
    if v_receipt is not null then
      return v_receipt;
    end if;
  end if;

  select * into v_fund from public.savings_funds
  where id = p_fund_id and owner_id = v_owner for update;
  if v_fund.id is null then raise exception 'fund not found'; end if;
  if v_fund.kind <> 'purchase' then raise exception 'not a purchase fund'; end if;
  if v_fund.purchased_at is not null then raise exception 'already purchased'; end if;

  v_reserved := public.savings_reserved_minor(p_fund_id);
  if v_reserved < v_fund.target_minor then
    raise exception 'not funded';
  end if;

  select * into v_acct from public.accounts where id = p_account_id and owner_id = v_owner;
  if v_acct.id is null then raise exception 'account not found'; end if;
  if v_acct.currency <> v_fund.currency then raise exception 'currency mismatch'; end if;

  insert into public.ledger_entries (
    id, owner_id, account_id, category_id, kind, amount_minor, currency, occurred_on
  ) values (
    p_expense_id, v_owner, p_account_id, p_category_id, 'expense',
    v_fund.target_minor, v_fund.currency, p_occurred_on
  );

  perform set_config('dayboard.allow_release', '1', true);
  insert into public.savings_entries (
    id, owner_id, fund_id, kind, amount_minor, occurred_on
  ) values (
    p_release_id, v_owner, p_fund_id, 'release', v_fund.target_minor, p_occurred_on
  );

  update public.savings_funds
  set purchased_at = now(), purchase_expense_id = p_expense_id, version = version + 1
  where id = p_fund_id;

  v_receipt := jsonb_build_object(
    'expense_id', p_expense_id,
    'release_id', p_release_id
  );

  if p_idempotency_key is not null then
    v_hash := encode(sha256(p_idempotency_key::bytea), 'hex');
    insert into public.mutation_receipts (owner_id, idempotency_key, request_hash, resource_id, response_body)
    values (v_owner, p_idempotency_key, v_hash, p_expense_id, v_receipt);
  end if;

  return v_receipt;
end;
$$;

-- ## 20260301000001_phase3_hardening.sql
-- Same-currency transfer legs must match (docs/money.md integration #3)

create or replace function public.post_transfer(
  p_group_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_occurred_on date,
  p_out_leg_id uuid,
  p_in_leg_id uuid,
  p_out_amount_minor bigint,
  p_in_amount_minor bigint,
  p_fee_expense_id uuid default null,
  p_fee_amount_minor bigint default null,
  p_fee_category_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_receipt jsonb;
  v_hash text;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;
  if p_from_account_id = p_to_account_id then raise exception 'same account'; end if;
  if p_out_amount_minor <= 0 or p_in_amount_minor <= 0 then raise exception 'zero amount'; end if;

  if p_idempotency_key is not null then
    select response_body into v_receipt
    from public.mutation_receipts
    where owner_id = v_owner and idempotency_key = p_idempotency_key;
    if v_receipt is not null then
      return v_receipt;
    end if;
  end if;

  select * into v_from from public.accounts where id = p_from_account_id and owner_id = v_owner;
  select * into v_to from public.accounts where id = p_to_account_id and owner_id = v_owner;
  if v_from.id is null or v_to.id is null then raise exception 'account not found'; end if;

  if v_from.currency = v_to.currency and p_out_amount_minor <> p_in_amount_minor then
    raise exception 'same_currency_amount_mismatch';
  end if;

  insert into public.transfer_groups (id, owner_id, occurred_on)
  values (p_group_id, v_owner, p_occurred_on);

  insert into public.ledger_entries (
    id, owner_id, account_id, kind, amount_minor, currency, occurred_on,
    transfer_group_id, transfer_leg
  ) values (
    p_out_leg_id, v_owner, p_from_account_id, 'transfer', p_out_amount_minor,
    v_from.currency, p_occurred_on, p_group_id, 'out'
  );

  insert into public.ledger_entries (
    id, owner_id, account_id, kind, amount_minor, currency, occurred_on,
    transfer_group_id, transfer_leg
  ) values (
    p_in_leg_id, v_owner, p_to_account_id, 'transfer', p_in_amount_minor,
    v_to.currency, p_occurred_on, p_group_id, 'in'
  );

  if p_fee_amount_minor is not null and p_fee_amount_minor > 0 then
    insert into public.ledger_entries (
      id, owner_id, account_id, category_id, kind, amount_minor, currency, occurred_on
    ) values (
      p_fee_expense_id, v_owner, p_from_account_id, p_fee_category_id, 'expense',
      p_fee_amount_minor, v_from.currency, p_occurred_on
    );
  end if;

  v_receipt := jsonb_build_object(
    'group_id', p_group_id,
    'out_leg_id', p_out_leg_id,
    'in_leg_id', p_in_leg_id,
    'fee_expense_id', p_fee_expense_id
  );

  if p_idempotency_key is not null then
    v_hash := encode(sha256(p_idempotency_key::bytea), 'hex');
    insert into public.mutation_receipts (owner_id, idempotency_key, request_hash, resource_id, response_body)
    values (v_owner, p_idempotency_key, v_hash, p_group_id, v_receipt);
  end if;

  return v_receipt;
end;
$$;

-- ## 20260401000000_phase5.sql
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

-- ## 20260402000000_owner_seed_defaults.sql
-- Seed default money rows when the owner profile is created (idempotent).

create or replace function public.seed_owner_defaults_for(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text;
  month_start date;
  deadline_month date;
begin
  if not exists (select 1 from public.profiles where id = p_owner_id) then
  return;
  end if;

  if exists (select 1 from public.accounts where owner_id = p_owner_id limit 1) then
    return;
  end if;

  select reporting_currency into cur from public.profiles where id = p_owner_id;
  if cur is null then
    cur := 'PKR';
  end if;

  insert into public.categories (owner_id, name, kind) values
    (p_owner_id, 'Food', 'expense'),
    (p_owner_id, 'Salary', 'income');

  insert into public.accounts (owner_id, name, currency, opening_balance_minor)
  values (p_owner_id, 'Cash', cur, 0);

  month_start := date_trunc('month', now())::date;
  deadline_month := (month_start + interval '11 months')::date;

  insert into public.savings_funds (
    owner_id,
    name,
    kind,
    currency,
    target_minor,
    start_month,
    deadline_month
  ) values (
    p_owner_id,
    'General savings',
    'general',
    cur,
    100000,
    month_start,
    deadline_month
  );
end;
$$;

create or replace function public.trg_seed_owner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_owner_defaults_for(new.id);
  return new;
end;
$$;

drop trigger if exists profiles_seed_owner_defaults on public.profiles;

create trigger profiles_seed_owner_defaults
  after insert on public.profiles
  for each row execute function public.trg_seed_owner_defaults();
