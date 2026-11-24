"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  archiveAccount,
  createAccount,
  voidEntry,
} from "./api";
import {
  formatBudgetStatus,
  formatMinor,
  selectAccountBalance,
  selectBudgetStatus,
  selectFxRateForMonth,
  type LedgerEntryRow,
} from "./selectors";
import {
  formatSavingsPlan,
  selectSavingsPlan,
  type SavingsFundRow,
} from "@/features/savings/selectors";
import { ownerClock } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";

function mapLedger(row: Record<string, unknown>): LedgerEntryRow {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    kind: row.kind as LedgerEntryRow["kind"],
    amountMinor: BigInt(String(row.amount_minor)),
    currency: row.currency as LedgerEntryRow["currency"],
    occurredOn: String(row.occurred_on),
    voidedAt: row.voided_at ? String(row.voided_at) : null,
    transferLeg: (row.transfer_leg as LedgerEntryRow["transferLeg"]) ?? null,
    version: Number(row.version ?? 1),
  };
}

export function MoneyView() {
  const queryClient = useQueryClient();
  const [month, setMonth] = React.useState<string>("");
  const [newAccountName, setNewAccountName] = React.useState("");
  const [newAccountCurrency, setNewAccountCurrency] = React.useState<"PKR" | "USD">("PKR");
  const [moneyStatus, setMoneyStatus] = React.useState<string | null>(null);

  const moneyQuery = useQuery({
    queryKey: ["money"],
    queryFn: async () => {
      const supabase = createClient();
      const [
        { data: accounts },
        { data: categories },
        { data: ledger },
        { data: budgets },
        { data: rates },
        { data: funds },
        { data: savingsEntries },
        { data: profile },
      ] = await Promise.all([
        supabase.from("accounts").select("*").is("archived_at", null),
        supabase.from("categories").select("*").is("archived_at", null),
        supabase.from("ledger_entries").select("*").order("occurred_on", { ascending: false }),
        supabase.from("budgets").select("*, categories(name)"),
        supabase.from("fx_rates").select("*"),
        supabase.from("savings_funds").select("*").is("archived_at", null),
        supabase.from("savings_entries").select("*"),
        supabase.from("profiles").select("timezone").single(),
      ]);

      const tz =
        (profile as { timezone: string } | null)?.timezone ?? "Asia/Karachi";
      const clock = ownerClock({ timezone: tz }, new Date());
      const monthKey = clock.monthKey;

      return {
        accounts: (accounts ?? []) as Record<string, unknown>[],
        categories: categories ?? [],
        ledger: (ledger ?? []).map(mapLedger),
        budgets: budgets ?? [],
        rates: (rates ?? []).map((r) => ({
          id: String((r as Record<string, unknown>).id),
          effectiveOn: String((r as Record<string, unknown>).effective_on),
          pkrMinorPerUsd: BigInt(String((r as Record<string, unknown>).pkr_minor_per_usd)),
        })),
        funds: (funds ?? []).map((f) => ({
          id: String((f as Record<string, unknown>).id),
          name: String((f as Record<string, unknown>).name),
          kind: (f as Record<string, unknown>).kind as SavingsFundRow["kind"],
          currency: (f as Record<string, unknown>).currency as SavingsFundRow["currency"],
          targetMinor: BigInt(String((f as Record<string, unknown>).target_minor)),
          startMonth: String((f as Record<string, unknown>).start_month),
          deadlineMonth: String((f as Record<string, unknown>).deadline_month),
          openingAllocationMinor: BigInt(
            String((f as Record<string, unknown>).opening_allocation_minor),
          ),
          purchasedAt: (f as Record<string, unknown>).purchased_at
            ? String((f as Record<string, unknown>).purchased_at)
            : null,
        })),
        savingsEntries: (savingsEntries ?? []).map((e) => ({
          fundId: String((e as Record<string, unknown>).fund_id),
          kind: (e as Record<string, unknown>).kind as "contribution" | "withdrawal" | "release",
          amountMinor: BigInt(String((e as Record<string, unknown>).amount_minor)),
          occurredOn: String((e as Record<string, unknown>).occurred_on),
        })),
        monthKey,
      };
    },
  });

  React.useEffect(() => {
    if (moneyQuery.data?.monthKey && !month) {
      setMonth(moneyQuery.data.monthKey);
    }
  }, [moneyQuery.data?.monthKey, month]);

  if (moneyQuery.isLoading) {
    return (
      <>
        <PageHeader title="Money" />
        <LoadingPulse label="Loading money" />
      </>
    );
  }
  if (moneyQuery.error) {
    return (
      <>
        <PageHeader title="Money" />
        <p role="alert" className="text-destructive">
          Error loading money data.
        </p>
      </>
    );
  }
  if (!moneyQuery.data) {
    return (
      <>
        <PageHeader title="Money" />
        <EmptyState message="No data." />
      </>
    );
  }

  const { accounts, ledger, budgets, rates, funds, savingsEntries } =
    moneyQuery.data;
  const rate = selectFxRateForMonth(rates, month || moneyQuery.data.monthKey);

  return (
    <div className="space-y-8">
      <PageHeader title="Money" />

      <PageSection title="Accounts">
        {accounts.length === 0 ? (
          <EmptyState message="No accounts" />
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => {
              const bal = selectAccountBalance(
                {
                  id: String(a.id),
                  openingBalanceMinor: BigInt(String(a.opening_balance_minor)),
                },
                ledger,
              );
              const version = Number(a.version ?? 1);
              return (
                <li key={String(a.id)}>
                  <SurfaceCard className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {String(a.name)} · {String(a.currency)} ·{" "}
                      {formatMinor(bal, a.currency as "PKR" | "USD")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Archive account "${String(a.name)}"? It will leave pickers.`,
                          )
                        ) {
                          return;
                        }
                        setMoneyStatus(null);
                        const supabase = createClient();
                        const result = await archiveAccount(
                          supabase,
                          String(a.id),
                          version,
                        );
                        if (result.ok) {
                          await queryClient.invalidateQueries({ queryKey: ["money"] });
                        } else {
                          setMoneyStatus(result.error);
                        }
                      }}
                    >
                      Archive
                    </Button>
                  </SurfaceCard>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setMoneyStatus(null);
            const supabase = createClient();
            const result = await createAccount(supabase, {
              name: newAccountName,
              currency: newAccountCurrency,
            });
            if (result.ok) {
              setNewAccountName("");
              await queryClient.invalidateQueries({ queryKey: ["money"] });
            } else {
              setMoneyStatus(result.error);
            }
          }}
        >
          <label className="text-sm">
            Name{" "}
            <Input
              className="mt-1"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Currency{" "}
            <select
              className="db-input mt-1"
              value={newAccountCurrency}
              onChange={(e) =>
                setNewAccountCurrency(e.target.value as "PKR" | "USD")
              }
            >
              <option value="PKR">PKR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <Button type="submit" disabled={!newAccountName.trim()}>
            Add account
          </Button>
        </form>
      </PageSection>

      <PageSection title="Ledger">
        {ledger.length === 0 ? (
          <EmptyState message="No entries match." />
        ) : (
          <SurfaceCard className="text-sm">
          <ul className="space-y-1">
            {ledger.slice(0, 40).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
              >
                <span>
                  {e.occurredOn} {e.kind}
                  {e.voidedAt ? " · Voided" : ""}
                </span>
                <span className="flex items-center gap-2">
                  {formatMinor(e.amountMinor, e.currency)}
                  {!e.voidedAt && e.kind !== "transfer" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!window.confirm("Void this ledger entry?")) return;
                        setMoneyStatus(null);
                        const supabase = createClient();
                        const result = await voidEntry(
                          supabase,
                          e.id,
                          e.version ?? 1,
                        );
                        if (result.ok) {
                          await queryClient.invalidateQueries({ queryKey: ["money"] });
                        } else {
                          setMoneyStatus(result.error);
                        }
                      }}
                    >
                      Void
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          </SurfaceCard>
        )}
      </PageSection>

      <PageSection title="Budgets">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Month{" "}
          <Input
            type="month"
            className="w-auto"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        {budgets.length === 0 ? (
          <EmptyState className="mt-2" message="No budgets for this month" />
        ) : (
          <SurfaceCard className="mt-2 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Category</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {(budgets as Record<string, unknown>[])
                .filter((b) => String(b.month).startsWith(month))
                .map((b) => {
                  const cat = b.categories as { name: string } | null;
                  const status = formatBudgetStatus(
                    selectBudgetStatus(
                      {
                        id: String(b.id),
                        categoryId: String(b.category_id),
                        categoryName: cat?.name ?? "",
                        month,
                        currency: b.currency as "PKR" | "USD",
                        amountMinor: BigInt(String(b.amount_minor)),
                      },
                      ledger,
                      rate,
                    ),
                  );
                  return (
                    <tr key={String(b.id)}>
                      <td>
                        {status.categoryName}
                        {status.partial ? " · Partial" : ""}
                      </td>
                      <td className="text-right">{status.remainingDisplay}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </SurfaceCard>
        )}
        <Button
          type="button"
          className="mt-2"
          variant="outline"
          onClick={async () => {
            const supabase = createClient();
            const [y, m] = month.split("-").map(Number);
            const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
            const fromMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
            const toMonth = `${month}-01`;
            await supabase.rpc("copy_budgets", {
              p_from_month: fromMonth,
              p_to_month: toMonth,
            });
            await queryClient.invalidateQueries({ queryKey: ["money"] });
          }}
        >
          Copy last month
        </Button>
      </PageSection>

      <PageSection title="Savings funds">
        {funds.length === 0 ? (
          <EmptyState message="No savings funds" />
        ) : (
          <ul className="space-y-3">
            {funds.map((f) => {
              const plan = formatSavingsPlan(
                selectSavingsPlan(f, savingsEntries, month || moneyQuery.data.monthKey),
              );
              return (
                <li key={f.id} data-testid="savings-fund">
                  <SurfaceCard>
                  <p className="font-medium">{f.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Saved {plan.savedDisplay} · {plan.shortfallDisplay}
                  </p>
                  {plan.revisedMonthlyDisplay ? (
                    <p className="text-sm">Revised {plan.revisedMonthlyDisplay}</p>
                  ) : null}
                  {plan.overdueDisplay ? (
                    <p className="text-sm">Overdue {plan.overdueDisplay}</p>
                  ) : null}
                  </SurfaceCard>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>
      {moneyStatus ? (
        <p className="text-sm text-destructive" role="alert">
          {moneyStatus}
        </p>
      ) : null}
    </div>
  );
}