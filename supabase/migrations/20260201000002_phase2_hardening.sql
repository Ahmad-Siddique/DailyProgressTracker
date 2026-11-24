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