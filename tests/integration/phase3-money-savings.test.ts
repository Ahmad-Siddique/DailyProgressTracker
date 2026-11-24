import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeCsvCell } from "../../src/lib/export-csv";
import {
  selectAccountBalance,
  selectFxRateForMonth,
  type LedgerEntryRow,
} from "../../src/features/money/selectors";
import { selectSavingsPlan } from "../../src/features/savings/selectors";
import { selectMonthlyReview } from "../../src/features/review/selectors";
import { uuid } from "../../src/lib/uuid";
import {
  integrationEnvOrSkip,
  integrationSupabaseEnv,
} from "./supabase-env";

const env = integrationSupabaseEnv();
const skip = integrationEnvOrSkip();
const URL = env?.url ?? "";
const PUBLISHABLE = env?.publishableKey ?? "";
const SECRET = env?.secretKey ?? "";
import {
  INTEGRATION_OWNER_EMAIL as ALLOWED,
  INTEGRATION_OWNER_PASSWORD as PASSWORD,
} from "./credentials";
import { ensureIntegrationOwner, wipeAllAuthUsers } from "./auth-reset";

function admin() {
  return createClient(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(skip)("Phase 3 money and savings integration", () => {
  beforeAll(async () => {
    const supabase = admin();
    await wipeAllAuthUsers(supabase);
    await ensureIntegrationOwner(supabase, ALLOWED, PASSWORD);
  }, 120_000);

  afterAll(async () => {
    await wipeAllAuthUsers(admin());
  }, 60_000);

  async function userClient() {
    const client = createClient(URL, PUBLISHABLE);
    await client.auth.signInWithPassword({ email: ALLOWED, password: PASSWORD });
    return client;
  }

  it("1 — balance with voided expense", async () => {
    const client = await userClient();
    const { data: acct } = await client
      .from("accounts")
      .insert({
        name: "Cash",
        currency: "PKR",
        opening_balance_minor: "10000",
      })
      .select()
      .single();
    const { data: cat } = await client
      .from("categories")
      .insert({ name: "Food", kind: "expense" })
      .select()
      .single();
    const { data: exp } = await client
      .from("ledger_entries")
      .insert({
        account_id: acct!.id,
        category_id: cat!.id,
        kind: "expense",
        amount_minor: "2500",
        currency: "PKR",
        occurred_on: "2026-03-01",
      })
      .select()
      .single();

    const { data: rows } = await client.from("ledger_entries").select("*");
    const ledger: LedgerEntryRow[] = (rows ?? []).map((r) => ({
      id: r.id,
      accountId: r.account_id,
      categoryId: r.category_id,
      kind: r.kind as LedgerEntryRow["kind"],
      amountMinor: BigInt(r.amount_minor),
      currency: r.currency as "PKR",
      occurredOn: r.occurred_on,
      voidedAt: r.voided_at,
      transferLeg: r.transfer_leg as LedgerEntryRow["transferLeg"],
    }));

    expect(
      selectAccountBalance(
        { id: acct!.id, openingBalanceMinor: 10_000n },
        ledger,
      ),
    ).toBe(7_500n);

    await client
      .from("ledger_entries")
      .update({ voided_at: new Date().toISOString(), version: exp!.version + 1 })
      .eq("id", exp!.id)
      .eq("version", exp!.version);

    const { data: rows2 } = await client.from("ledger_entries").select("*");
    const ledger2: LedgerEntryRow[] = (rows2 ?? []).map((r) => ({
      id: r.id,
      accountId: r.account_id,
      categoryId: r.category_id,
      kind: r.kind as LedgerEntryRow["kind"],
      amountMinor: BigInt(r.amount_minor),
      currency: r.currency as "PKR",
      occurredOn: r.occurred_on,
      voidedAt: r.voided_at,
      transferLeg: r.transfer_leg as LedgerEntryRow["transferLeg"],
    }));
    expect(
      selectAccountBalance(
        { id: acct!.id, openingBalanceMinor: 10_000n },
        ledger2,
      ),
    ).toBe(10_000n);
  });

  it("2 — transfer idempotency", async () => {
    const client = await userClient();
    const [{ data: a1 }, { data: a2 }] = await Promise.all([
      client
        .from("accounts")
        .insert({
          name: "PKR1",
          currency: "PKR",
          opening_balance_minor: "0",
        })
        .select()
        .single(),
      client
        .from("accounts")
        .insert({
          name: "PKR2",
          currency: "PKR",
          opening_balance_minor: "0",
        })
        .select()
        .single(),
    ]);
    const gid = uuid();
    const outId = uuid();
    const inId = uuid();
    const key = `xfer-${gid}`;
    const args = {
      p_group_id: gid,
      p_from_account_id: a1!.id,
      p_to_account_id: a2!.id,
      p_occurred_on: "2026-03-01",
      p_out_leg_id: outId,
      p_in_leg_id: inId,
      p_out_amount_minor: 5000,
      p_in_amount_minor: 5000,
      p_idempotency_key: key,
    };
    await client.rpc("post_transfer", args);
    await client.rpc("post_transfer", args);
    const { data } = await client
      .from("ledger_entries")
      .select("id")
      .eq("transfer_group_id", gid);
    expect(data?.length).toBe(2);
  });

  it("7 — helmet month 2 plan", async () => {
    const client = await userClient();
    const { data: fund } = await client
      .from("savings_funds")
      .insert({
        name: "Helmet",
        kind: "purchase",
        currency: "PKR",
        target_minor: "12000000",
        start_month: "2026-01-01",
        deadline_month: "2026-12-01",
        opening_allocation_minor: "0",
      })
      .select()
      .single();
    const plan = selectSavingsPlan(
      {
        id: fund!.id,
        name: fund!.name,
        kind: "purchase",
        currency: "PKR",
        targetMinor: 12_000_000n,
        startMonth: fund!.start_month,
        deadlineMonth: fund!.deadline_month,
        openingAllocationMinor: 0n,
        purchasedAt: null,
      },
      [],
      "2026-02",
    );
    expect(plan.shortfallMinor).toBe(1_000_000n);
    expect(plan.revisedMonthlyMinor).toBe(1_090_909n);
  });

  it("8 — withdrawal over reserved fails", async () => {
    const client = await userClient();
    const { data: fund, error: fundErr } = await client
      .from("savings_funds")
      .insert({
        name: "Small",
        kind: "general",
        currency: "PKR",
        target_minor: "1000000",
        start_month: "2026-01-01",
        deadline_month: "2026-12-01",
        opening_allocation_minor: "0",
      })
      .select()
      .single();
    expect(fundErr).toBeNull();
    expect(fund?.id).toBeTruthy();
    await client.from("savings_entries").insert({
      fund_id: fund!.id,
      kind: "contribution",
      amount_minor: "500000",
      occurred_on: "2026-03-01",
    });
    const { error } = await client.from("savings_entries").insert({
      fund_id: fund!.id,
      kind: "withdrawal",
      amount_minor: "500001",
      occurred_on: "2026-03-02",
    });
    expect(error).toBeTruthy();
  });

  it("6 — fx rate month lookup", async () => {
    const client = await userClient();
    await client.from("fx_rates").insert({
      effective_on: "2026-01-10",
      pkr_minor_per_usd: "28000",
    });
    await client.from("fx_rates").insert({
      effective_on: "2026-03-22",
      pkr_minor_per_usd: "29000",
    });
    const { data: rates } = await client.from("fx_rates").select("*");
    const mapped = (rates ?? []).map((r) => ({
      id: r.id,
      effectiveOn: r.effective_on,
      pkrMinorPerUsd: BigInt(r.pkr_minor_per_usd),
    }));
    const jan = selectFxRateForMonth(mapped, "2026-01");
    expect("missing" in jan).toBe(false);
    if (!("missing" in jan)) {
      expect(jan.pkrMinorPerUsd).toBe(28_000n);
    }
    const feb = selectFxRateForMonth(mapped, "2026-02");
    if (!("missing" in feb)) {
      expect(feb.pkrMinorPerUsd).toBe(28_000n);
    }
  });

  it("10 — csv formula prefix", () => {
    expect(sanitizeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("11 — review finance omit", () => {
    const review = selectMonthlyReview({
      month: "2026-02",
      timezone: "Asia/Karachi",
      finance: "omit",
      today: "2026-02-01",
      data: {
        tasks: [],
        goals: [],
        budgets: [],
        expenses: [],
        ledger: [],
        rates: [],
        reportingCurrency: "PKR",
        funds: [],
        savingsEntries: [],
      },
    });
    expect(review.budgets).toBeNull();
  });
});