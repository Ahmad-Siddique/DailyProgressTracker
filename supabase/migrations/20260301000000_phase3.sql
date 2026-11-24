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