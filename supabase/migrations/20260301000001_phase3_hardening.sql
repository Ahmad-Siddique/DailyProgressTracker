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