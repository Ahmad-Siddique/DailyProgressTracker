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