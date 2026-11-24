"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ownerClock } from "@/lib/clock";
import { selectMonthlyReview, computeStreak } from "./selectors";
import { formatBudgetStatus, formatCashflow } from "@/features/money/selectors";
import { formatGoalProgress, selectGoalProgress } from "@/features/goals/selectors";
import { useAi } from "@/components/ai/ai-provider";
import { formatSavingsPlan } from "@/features/savings/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";
import type { TaskRow } from "@/features/board/selectors";
import { useOffline } from "@/components/pwa/offline-provider";
import { listRecords, putRecord } from "@/lib/pwa/idb";
import { recordKey } from "@/lib/pwa/outbox-types";
import type { GoalItemRow } from "@/features/goals/selectors";

export function ReviewView() {
  const ai = useAi();
  const { online, staleAt, userId } = useOffline();
  const [offlineProgress, setOfflineProgress] = React.useState<string | null>(
    null,
  );
  const [month, setMonth] = React.useState("");

  React.useEffect(() => {
    if (online || !userId) {
      setOfflineProgress(null);
      return;
    }
    void listRecords(userId, "goal_items").then((recs) => {
      const items: GoalItemRow[] = recs.map((r) => ({
        id: String(r.row.id),
        title: String(r.row.title),
        status: r.row.status as GoalItemRow["status"],
        position: String(r.row.position ?? "m"),
        statusChangedAt: String(
          r.row.status_changed_at ?? r.row.statusChangedAt ?? new Date().toISOString(),
        ),
      }));
      if (items.length === 0) {
        setOfflineProgress("No cached goal items.");
        return;
      }
      setOfflineProgress(formatGoalProgress(selectGoalProgress(items)));
    });
  }, [online, userId]);

  const q = useQuery({
    queryKey: ["review", month],
    enabled: online,
    queryFn: async () => {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone, reporting_currency")
        .single();
      const tz =
        (profile as { timezone: string } | null)?.timezone ?? "Asia/Karachi";
      const reporting =
        (profile as { reporting_currency: "PKR" | "USD" } | null)
          ?.reporting_currency ?? "PKR";
      const clock = ownerClock({ timezone: tz }, new Date());
      const monthKey = month || clock.monthKey;

      const [
        { data: tasksRaw },
        { data: goals },
        { data: items },
        { data: budgets },
        { data: ledger },
        { data: rates },
        { data: funds },
        { data: savingsEntries },
      ] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("goals").select("*"),
        supabase.from("goal_items").select("*"),
        supabase.from("budgets").select("*, categories(name)"),
        supabase.from("ledger_entries").select("*"),
        supabase.from("fx_rates").select("*"),
        supabase.from("savings_funds").select("*").is("archived_at", null),
        supabase.from("savings_entries").select("*"),
      ]);

      const tasks: TaskRow[] = (tasksRaw ?? []).map((t) => ({
        id: String((t as Record<string, unknown>).id),
        title: String((t as Record<string, unknown>).title),
        notes: (t as Record<string, unknown>).notes
          ? String((t as Record<string, unknown>).notes)
          : null,
        status: (t as Record<string, unknown>).status as TaskRow["status"],
        priority: (t as Record<string, unknown>).priority as TaskRow["priority"],
        localDate: (t as Record<string, unknown>).local_date
          ? String((t as Record<string, unknown>).local_date)
          : null,
        startTime: (t as Record<string, unknown>).start_time
          ? String((t as Record<string, unknown>).start_time)
          : null,
        endTime: (t as Record<string, unknown>).end_time
          ? String((t as Record<string, unknown>).end_time)
          : null,
        completedAt: (t as Record<string, unknown>).completed_at
          ? String((t as Record<string, unknown>).completed_at)
          : null,
        position: String((t as Record<string, unknown>).position),
      }));

      const review = selectMonthlyReview({
        month: monthKey,
        timezone: tz,
        finance: "include",
        today: clock.localDate,
        data: {
          tasks,
          goals: (goals ?? []).map((g) => ({
            id: String((g as Record<string, unknown>).id),
            title: String((g as Record<string, unknown>).title),
            archivedAt: (g as Record<string, unknown>).archived_at
              ? String((g as Record<string, unknown>).archived_at)
              : null,
            items: (items ?? [])
              .filter(
                (i) =>
                  String((i as Record<string, unknown>).goal_id) ===
                  String((g as Record<string, unknown>).id),
              )
              .map((i) => ({
                id: String((i as Record<string, unknown>).id),
                title: String((i as Record<string, unknown>).title),
                status: (i as Record<string, unknown>)
                  .status as "not_started" | "in_progress" | "practicing" | "done",
                position: String((i as Record<string, unknown>).position),
                statusChangedAt: String(
                  (i as Record<string, unknown>).status_changed_at,
                ),
              })),
          })),
          budgets: (budgets ?? [])
            .filter((b) => String((b as Record<string, unknown>).month).startsWith(monthKey))
            .map((b) => {
              const cat = (b as Record<string, unknown>).categories as {
                name: string;
              } | null;
              return {
                id: String((b as Record<string, unknown>).id),
                categoryId: String((b as Record<string, unknown>).category_id),
                categoryName: cat?.name ?? "",
                month: monthKey,
                currency: (b as Record<string, unknown>).currency as "PKR" | "USD",
                amountMinor: BigInt(String((b as Record<string, unknown>).amount_minor)),
              };
            }),
          expenses: (ledger ?? []).map((e) => ({
            id: String((e as Record<string, unknown>).id),
            accountId: String((e as Record<string, unknown>).account_id),
            categoryId: (e as Record<string, unknown>).category_id
              ? String((e as Record<string, unknown>).category_id)
              : null,
            kind: (e as Record<string, unknown>).kind as "expense" | "income" | "transfer",
            amountMinor: BigInt(String((e as Record<string, unknown>).amount_minor)),
            currency: (e as Record<string, unknown>).currency as "PKR" | "USD",
            occurredOn: String((e as Record<string, unknown>).occurred_on),
            voidedAt: (e as Record<string, unknown>).voided_at
              ? String((e as Record<string, unknown>).voided_at)
              : null,
            transferLeg: ((e as Record<string, unknown>).transfer_leg as "out" | "in" | null) ?? null,
          })),
          ledger: (ledger ?? []).map((e) => ({
            id: String((e as Record<string, unknown>).id),
            accountId: String((e as Record<string, unknown>).account_id),
            categoryId: (e as Record<string, unknown>).category_id
              ? String((e as Record<string, unknown>).category_id)
              : null,
            kind: (e as Record<string, unknown>).kind as "expense" | "income" | "transfer",
            amountMinor: BigInt(String((e as Record<string, unknown>).amount_minor)),
            currency: (e as Record<string, unknown>).currency as "PKR" | "USD",
            occurredOn: String((e as Record<string, unknown>).occurred_on),
            voidedAt: (e as Record<string, unknown>).voided_at
              ? String((e as Record<string, unknown>).voided_at)
              : null,
            transferLeg: ((e as Record<string, unknown>).transfer_leg as "out" | "in" | null) ?? null,
          })),
          rates: (rates ?? []).map((r) => ({
            id: String((r as Record<string, unknown>).id),
            effectiveOn: String((r as Record<string, unknown>).effective_on),
            pkrMinorPerUsd: BigInt(String((r as Record<string, unknown>).pkr_minor_per_usd)),
          })),
          reportingCurrency: reporting,
          funds: (funds ?? []).map((f) => ({
            id: String((f as Record<string, unknown>).id),
            name: String((f as Record<string, unknown>).name),
            kind: (f as Record<string, unknown>).kind as "purchase" | "general",
            currency: (f as Record<string, unknown>).currency as "PKR" | "USD",
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
        },
      });

      const streak = computeStreak(tasks, tz, clock.localDate);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const at = new Date().toISOString();
        await Promise.all(
          (items ?? []).map((item) =>
            putRecord(user.id, {
              recordKey: recordKey(
                "goal_items",
                String((item as Record<string, unknown>).id),
              ),
              table: "goal_items",
              id: String((item as Record<string, unknown>).id),
              row: item as Record<string, unknown>,
              storedAt: at,
            }),
          ),
        );
      }

      return { review, monthKey, streak, reporting };
    },
  });

  React.useEffect(() => {
    if (q.data?.monthKey && !month) setMonth(q.data.monthKey);
  }, [q.data?.monthKey, month]);

  if (!online) {
    return (
      <div className="space-y-4" data-testid="review-offline">
        <PageHeader title="Review" />
        <SurfaceCard className="text-sm">
          <p className="text-muted-foreground" data-testid="review-offline-stale">
            Saved on this phone
            {staleAt ? ` · ${new Date(staleAt).toLocaleString()}` : ""}
          </p>
          {offlineProgress ? (
            <p className="mt-2" data-testid="review-offline-progress">
              Goal progress (cached): {offlineProgress}
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground" role="status">
              Loading cached items…
            </p>
          )}
        </SurfaceCard>
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <>
        <PageHeader title="Review" />
        <LoadingPulse label="Loading review" />
      </>
    );
  }
  if (!q.data) return null;

  const { review, streak } = q.data;
  const cashflowFmt =
    review.cashflow != null ? formatCashflow(review.cashflow) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Review"
        description={`Streak: ${streak}`}
        action={
          <Button
            type="button"
            variant="premium"
            size="sm"
            onClick={() =>
              ai.openWithSeed({
                monthMode: month ? "selected" : "current",
                month: month || q.data?.monthKey || null,
              })
            }
          >
            Open AI
          </Button>
        }
      />
      <p className="sr-only" data-testid="review-streak">
        {streak}
      </p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        Month{" "}
        <Input
          type="month"
          className="w-auto"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>

      <PageSection title="Completed tasks">
        <SurfaceCard className="text-sm">
          {review.tasks.counts.done} completed this month
        </SurfaceCard>
      </PageSection>

      <PageSection title="Goals">
        <p className="text-sm text-muted-foreground">
          Item progress is the current snapshot.
        </p>
        <ul className="mt-2 space-y-2">
          {review.goals.map((g) => (
            <li key={g.id}>
              <SurfaceCard className="text-sm">
                {g.title} — {formatGoalProgress(g.progress)}
              </SurfaceCard>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title="Budgets">
        {review.budgets?.length ? (
          <SurfaceCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {review.budgets.map((b) => {
                const f = formatBudgetStatus(b);
                return (
                  <tr key={b.categoryId}>
                    <td>
                      {b.categoryName}
                      {b.partial ? " · Partial" : ""}
                    </td>
                    <td className="text-right">{f.actualDisplay}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </SurfaceCard>
        ) : (
          <EmptyState message="Nothing recorded for this month" />
        )}
      </PageSection>

      <PageSection title="Cashflow">
        <p className="text-sm text-muted-foreground">Transfers are not included.</p>
        {cashflowFmt ? (
          <SurfaceCard className="mt-2 p-0">
          <table className="w-full text-sm" data-testid="cashflow-table">
            <tbody>
              <tr>
                <td>PKR net</td>
                <td>{cashflowFmt.byCurrency.PKR.netDisplay}</td>
              </tr>
              <tr>
                <td>USD net</td>
                <td>{cashflowFmt.byCurrency.USD.netDisplay}</td>
              </tr>
              <tr>
                <td>Converted</td>
                <td>
                  {cashflowFmt.converted.convertedDisplay ?? "Partial"}
                </td>
              </tr>
            </tbody>
          </table>
          </SurfaceCard>
        ) : null}
      </PageSection>

      <PageSection title="Savings">
        <div className="space-y-2">
        {review.savings?.map((plan) => {
          const fmt = formatSavingsPlan(plan);
          return (
            <SurfaceCard key={plan.fundId} className="text-sm" data-testid="review-savings-row">
              <p className="font-medium">{plan.name}</p>
              <p className="text-sm">
                {fmt.shortfallDisplay}
                {fmt.revisedMonthlyDisplay
                  ? ` · Revised ${fmt.revisedMonthlyDisplay}`
                  : ""}
              </p>
            </SurfaceCard>
          );
        })}
        </div>
      </PageSection>

      <PageSection title="Weekly completion">
        <SurfaceCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <tbody>
            {review.weekly.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td>{w.weekStart}</td>
                <td>{w.completedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </SurfaceCard>
      </PageSection>
    </div>
  );
}