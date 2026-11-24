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