import type { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";

type Supabase = ReturnType<typeof createClient>;

export type MoneyDefaults = {
  categoryId: string | null;
  accountId: string | null;
};

const DEFAULTS_KEY = "dayboard.money.expense.defaults";

export function loadExpenseDefaults(): MoneyDefaults {
  if (typeof window === "undefined") return { categoryId: null, accountId: null };
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return { categoryId: null, accountId: null };
    return JSON.parse(raw) as MoneyDefaults;
  } catch {
    return { categoryId: null, accountId: null };
  }
}

export function saveExpenseDefaults(defaults: MoneyDefaults) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}

export async function createExpense(
  supabase: Supabase,
  input: {
    id?: string;
    accountId: string;
    categoryId: string;
    amountMinor: bigint;
    occurredOn: string;
    note?: string | null;
    baseVersion?: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = input.id ?? uuid();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: userErr?.message ?? "not authenticated" };
  }
  const { data: acct, error: aErr } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", input.accountId)
    .single();
  if (aErr || !acct) return { ok: false, error: aErr?.message ?? "account not found" };
  const currency = (acct as { currency: string }).currency;
  const { error } = await supabase.from("ledger_entries").insert({
    id,
    owner_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    kind: "expense",
    amount_minor: input.amountMinor.toString(),
    currency,
    occurred_on: input.occurredOn,
    note: input.note ?? null,
    version: input.baseVersion ?? 1,
  });
  if (error) return { ok: false, error: error.message };
  saveExpenseDefaults({
    categoryId: input.categoryId,
    accountId: input.accountId,
  });
  return { ok: true, id };
}

export async function createAccount(
  supabase: Supabase,
  input: {
    name: string;
    currency: "PKR" | "USD";
    openingBalanceMinor?: bigint;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: userErr?.message ?? "Not signed in." };
  }
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      owner_id: user.id,
      name,
      currency: input.currency,
      opening_balance_minor: (input.openingBalanceMinor ?? 0n).toString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function archiveAccount(
  supabase: Supabase,
  accountId: string,
  baseVersion: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("accounts")
    .update({
      archived_at: new Date().toISOString(),
      version: baseVersion + 1,
    })
    .eq("id", accountId)
    .eq("version", baseVersion)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict." };
  return { ok: true };
}

export async function voidEntry(
  supabase: Supabase,
  entryId: string,
  baseVersion: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .update({ voided_at: new Date().toISOString(), version: baseVersion + 1 })
    .eq("id", entryId)
    .eq("version", baseVersion)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "version conflict" };
  return { ok: true };
}