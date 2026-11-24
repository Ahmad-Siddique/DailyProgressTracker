import type { SupabaseClient } from "@supabase/supabase-js";
import { selectTaskSummary, type TaskRow } from "@/features/board/selectors";
import {
  selectGoalDetail,
  type GoalItemRow,
} from "@/features/goals/selectors";
import {
  formatBudgetStatus,
  formatCashflow,
  type BudgetInput,
  type FxRateRow,
  type LedgerEntryRow,
} from "@/features/money/selectors";
import { selectMonthlyReview } from "@/features/review/selectors";
import {
  formatSavingsPlan,
  selectSavingsPlan,
  type SavingsEntryRow,
  type SavingsFundRow,
} from "@/features/savings/selectors";
import { ownerClock, type OwnerClock } from "@/lib/clock";
import { canonicalJson } from "./canonical";
import { walkPayload, progressDeepEqual } from "./payload-guard";
import { resolveScope } from "./scope";
import type { AiClientBody, BuildAiResult, RecordRef, ResolvedScope } from "./types";
import type {
  AiContextDocument,
  BudgetCopy,
  CashflowCopy,
  GoalDetailCopy,
  MonthlyReviewCopy,
  SavingsCopy,
  TaskSummaryCopy,
} from "./types";

const MAX_ITEMS_PER_GOAL = 80;
const MAX_NOTE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 20_000;

export type LoadedAiData = {
  timezone: string;
  reportingCurrency: "PKR" | "USD";
  tasks: TaskRow[];
  goals: Array<{
    id: string;
    title: string;
    notes: string | null;
    deadlineDate: string | null;
    archivedAt: string | null;
  }>;
  goalItems: GoalItemRow[];
  itemsByGoal: Map<string, GoalItemRow[]>;
  tasksForGoals: Array<{
    id: string;
    title: string;
    status: string;
    localDate: string | null;
    goalItemId: string | null;
  }>;
  budgets: BudgetInput[];
  expenses: LedgerEntryRow[];
  ledger: LedgerEntryRow[];
  rates: FxRateRow[];
  funds: SavingsFundRow[];
  savingsEntries: SavingsEntryRow[];
  availableGoalIds: Set<string>;
};

function mapTaskRow(t: Record<string, unknown>): TaskRow {
  return {
    id: String(t.id),
    title: String(t.title),
    notes: t.notes ? String(t.notes) : null,
    status: t.status as TaskRow["status"],
    priority: t.priority as TaskRow["priority"],
    localDate: t.local_date ? String(t.local_date) : null,
    startTime: t.start_time ? String(t.start_time) : null,
    endTime: t.end_time ? String(t.end_time) : null,
    completedAt: t.completed_at ? String(t.completed_at) : null,
    position: String(t.position),
  };
}

function mapLedger(e: Record<string, unknown>): LedgerEntryRow {
  return {
    id: String(e.id),
    accountId: String(e.account_id),
    categoryId: e.category_id ? String(e.category_id) : null,
    kind: e.kind as LedgerEntryRow["kind"],
    amountMinor: BigInt(String(e.amount_minor)),
    currency: e.currency as LedgerEntryRow["currency"],
    occurredOn: String(e.occurred_on),
    voidedAt: e.voided_at ? String(e.voided_at) : null,
    transferLeg: e.transfer_leg as LedgerEntryRow["transferLeg"],
  };
}

export async function loadAiData(
  supabase: SupabaseClient,
): Promise<LoadedAiData | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, reporting_currency")
    .single();
  if (!profile) return null;
  const tz =
    (profile as { timezone: string }).timezone ?? "Asia/Karachi";
  const reporting =
    ((profile as { reporting_currency?: "PKR" | "USD" }).reporting_currency) ??
    "PKR";

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

  const tasks = (tasksRaw ?? []).map((t) =>
    mapTaskRow(t as Record<string, unknown>),
  );

  const goalItems: GoalItemRow[] = (items ?? []).map((i) => ({
    id: String((i as Record<string, unknown>).id),
    title: String((i as Record<string, unknown>).title),
    status: (i as Record<string, unknown>).status as GoalItemRow["status"],
    position: String((i as Record<string, unknown>).position),
    statusChangedAt: String((i as Record<string, unknown>).status_changed_at),
  }));

  const itemsByGoal = new Map<string, GoalItemRow[]>();
  for (const item of items ?? []) {
    const gid = String((item as Record<string, unknown>).goal_id);
    const row: GoalItemRow = {
      id: String((item as Record<string, unknown>).id),
      title: String((item as Record<string, unknown>).title),
      status: (item as Record<string, unknown>).status as GoalItemRow["status"],
      position: String((item as Record<string, unknown>).position),
      statusChangedAt: String(
        (item as Record<string, unknown>).status_changed_at,
      ),
    };
    const list = itemsByGoal.get(gid) ?? [];
    list.push(row);
    itemsByGoal.set(gid, list);
  }

  const mappedGoals = (goals ?? []).map((g) => ({
    id: String((g as Record<string, unknown>).id),
    title: String((g as Record<string, unknown>).title),
    notes: (g as Record<string, unknown>).notes
      ? String((g as Record<string, unknown>).notes)
      : null,
    deadlineDate: (g as Record<string, unknown>).deadline_date
      ? String((g as Record<string, unknown>).deadline_date)
      : null,
    archivedAt: (g as Record<string, unknown>).archived_at
      ? String((g as Record<string, unknown>).archived_at)
      : null,
  }));

  return {
    timezone: tz,
    reportingCurrency: reporting,
    tasks,
    goals: mappedGoals,
    goalItems,
    itemsByGoal,
    tasksForGoals: (tasksRaw ?? [])
      .filter((t) => (t as Record<string, unknown>).goal_item_id)
      .map((t) => ({
        id: String((t as Record<string, unknown>).id),
        title: String((t as Record<string, unknown>).title),
        status: String((t as Record<string, unknown>).status),
        localDate: (t as Record<string, unknown>).local_date
          ? String((t as Record<string, unknown>).local_date)
          : null,
        goalItemId: (t as Record<string, unknown>).goal_item_id
          ? String((t as Record<string, unknown>).goal_item_id)
          : null,
      })),
    budgets: (budgets ?? []).map((b) => {
      const cat = (b as Record<string, unknown>).categories as {
        name: string;
      } | null;
      const month = String((b as Record<string, unknown>).month).slice(0, 7);
      return {
        id: String((b as Record<string, unknown>).id),
        categoryId: String((b as Record<string, unknown>).category_id),
        categoryName: cat?.name ?? "",
        month,
        currency: (b as Record<string, unknown>).currency as "PKR" | "USD",
        amountMinor: BigInt(String((b as Record<string, unknown>).amount_minor)),
      };
    }),
    expenses: (ledger ?? []).map((e) => mapLedger(e as Record<string, unknown>)),
    ledger: (ledger ?? []).map((e) => mapLedger(e as Record<string, unknown>)),
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
        String((f as Record<string, unknown>).opening_allocation_minor ?? "0"),
      ),
      purchasedAt: (f as Record<string, unknown>).purchased_at
        ? String((f as Record<string, unknown>).purchased_at)
        : null,
    })),
    savingsEntries: (savingsEntries ?? []).map((e) => ({
      id: String((e as Record<string, unknown>).id),
      fundId: String((e as Record<string, unknown>).fund_id),
      kind: (e as Record<string, unknown>).kind as SavingsEntryRow["kind"],
      amountMinor: BigInt(String((e as Record<string, unknown>).amount_minor)),
      occurredOn: String((e as Record<string, unknown>).occurred_on),
    })),
    availableGoalIds: new Set(mappedGoals.map((g) => g.id)),
  };
}

function capItems(items: GoalItemRow[], stalledIds: string[]): GoalItemRow[] {
  const stalled = new Set(stalledIds);
  const notDone = items.filter((i) => i.status !== "done");
  const done = items.filter((i) => i.status === "done");
  const stalledFirst = notDone.filter((i) => stalled.has(i.id));
  const rest = notDone.filter((i) => !stalled.has(i.id));
  const ordered = [...stalledFirst, ...rest, ...done];
  return ordered.slice(0, MAX_ITEMS_PER_GOAL);
}

function bigintStr(n: bigint | null): string | null {
  return n == null ? null : n.toString();
}

function copySavings(plan: ReturnType<typeof selectSavingsPlan>): SavingsCopy {
  const fmt = formatSavingsPlan(plan);
  return {
    fundId: plan.fundId,
    name: plan.name,
    kind: plan.kind,
    currency: plan.currency,
    targetMinor: plan.targetMinor.toString(),
    savedMinor: plan.savedMinor.toString(),
    remainingMinor: plan.remainingMinor.toString(),
    openingAllocationMinor: plan.openingAllocationMinor.toString(),
    startMonth: plan.startMonth,
    deadlineMonth: plan.deadlineMonth,
    asOfMonth: plan.asOfMonth,
    baselineMonthlyMinor: plan.baselineMonthlyMinor.toString(),
    shortfallMinor: plan.shortfallMinor.toString(),
    remainingMonths: plan.remainingMonths,
    revisedMonthlyMinor: bigintStr(plan.revisedMonthlyMinor),
    finalInstallmentMinor: bigintStr(plan.finalInstallmentMinor),
    funded: plan.funded,
    purchased: plan.purchased,
    overdueMinor: bigintStr(plan.overdueMinor),
    targetDisplay: fmt.targetDisplay,
    savedDisplay: fmt.savedDisplay,
    remainingDisplay: fmt.remainingDisplay,
    baselineMonthlyDisplay: fmt.baselineMonthlyDisplay,
    shortfallDisplay: fmt.shortfallDisplay,
    revisedMonthlyDisplay: fmt.revisedMonthlyDisplay,
    finalInstallmentDisplay: fmt.finalInstallmentDisplay,
    overdueDisplay: fmt.overdueDisplay,
  };
}

function copyTaskSummary(summary: ReturnType<typeof selectTaskSummary>): TaskSummaryCopy {
  return {
    window: summary.window,
    counts: {
      backlog: summary.counts.backlog,
      todo: summary.counts.todo,
      inProgress: summary.counts.inProgress,
      done: summary.counts.done,
      overdue: summary.counts.overdue,
    },
    openTitles: summary.openTitles.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      localDate: t.localDate,
      priority: t.priority,
    })),
  };
}

export function assembleAiContext(
  scope: ResolvedScope,
  data: LoadedAiData,
  clock: OwnerClock,
  generatedAt: string,
): BuildAiResult {
  const unavailableGoalIds =
    scope.goalMode === "none"
      ? []
      : scope.goalIds.filter((id) => !data.availableGoalIds.has(id));

  const recordRefs: RecordRef[] = [];
  let goals: GoalDetailCopy[] | null = null;

  if (scope.goalMode !== "none") {
    const requested = scope.goalIds.filter((id) =>
      data.availableGoalIds.has(id),
    );
    goals = [];
    for (const id of requested) {
      const goal = data.goals.find((g) => g.id === id);
      if (!goal) continue;
      const items = data.itemsByGoal.get(id) ?? [];
      const detail = selectGoalDetail(
        {
          id: goal.id,
          title: goal.title,
          notes: goal.notes,
          deadlineDate: goal.deadlineDate,
          archivedAt: goal.archivedAt,
        },
        items,
        data.tasksForGoals,
        { localDate: clock.localDate },
      );
      const capped = capItems(items, detail.stalledItemIds);
      const notes = (detail.notes ?? "").slice(0, MAX_NOTE_CHARS);
      goals.push({
        id: detail.id,
        title: detail.title,
        notes,
        deadline: detail.deadline,
        archived: detail.archived,
        progress: detail.progress,
        items: capped.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          position: i.position,
        })),
        stalledItemIds: detail.stalledItemIds,
        linkedTasks: detail.linkedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          localDate: t.localDate,
        })),
      });
      recordRefs.push({ kind: "goal", id: detail.id });
      for (const item of capped) {
        recordRefs.push({ kind: "item", id: item.id });
      }
      for (const t of detail.linkedTasks) {
        recordRefs.push({ kind: "task", id: t.id });
      }
    }
  } else {
    goals = null;
  }

  let review: MonthlyReviewCopy | null = null;
  let tasks: TaskSummaryCopy | null = null;

  if (scope.month) {
    const monthBudgets = data.budgets.filter((b) => b.month === scope.month);
    const finance = scope.finance ? "include" : "omit";
    const raw = selectMonthlyReview({
      month: scope.month,
      timezone: data.timezone,
      finance,
      today: clock.localDate,
      data: {
        tasks: data.tasks,
        goals: data.goals.map((g) => ({
          id: g.id,
          title: g.title,
          archivedAt: g.archivedAt,
          items: data.itemsByGoal.get(g.id) ?? [],
        })),
        budgets: monthBudgets,
        expenses: data.expenses,
        ledger: data.ledger,
        rates: data.rates,
        reportingCurrency: data.reportingCurrency,
        funds: scope.finance ? data.funds : [],
        savingsEntries: scope.finance ? data.savingsEntries : [],
      },
    });

    if (goals) {
      for (const g of goals) {
        const reviewGoal = raw.goals.find((rg) => rg.id === g.id);
        if (reviewGoal && !progressDeepEqual(g.progress, reviewGoal.progress)) {
          return { ok: false, code: "context_inconsistent" };
        }
      }
    }

    let budgets: BudgetCopy[] | null = null;
    let cashflow: CashflowCopy | null = null;
    let savings: SavingsCopy[] | null = null;

    if (scope.finance && raw.budgets && raw.cashflow && raw.savings) {
      budgets = raw.budgets.map((b) => {
        const f = formatBudgetStatus(b);
        return {
          categoryName: f.categoryName,
          currency: f.currency,
          budgetMinor: f.budgetMinor.toString(),
          actualMinor: f.actualMinor.toString(),
          remainingMinor: f.remainingMinor.toString(),
          overageMinor: f.overageMinor.toString(),
          budgetDisplay: f.budgetDisplay,
          actualDisplay: f.actualDisplay,
          remainingDisplay: f.remainingDisplay,
          overageDisplay: f.overageDisplay,
          partial: f.partial,
          excludedExpenseCount: f.excludedExpenseCount,
        };
      });
      const cf = formatCashflow(raw.cashflow);
      cashflow = {
        transfersExcluded: cf.transfersExcluded,
        byCurrency: {
          PKR: {
            expenseMinor: cf.byCurrency.PKR.expenseMinor.toString(),
            incomeMinor: cf.byCurrency.PKR.incomeMinor.toString(),
            netMinor: cf.byCurrency.PKR.netMinor.toString(),
            expenseDisplay: cf.byCurrency.PKR.expenseDisplay,
            incomeDisplay: cf.byCurrency.PKR.incomeDisplay,
            netDisplay: cf.byCurrency.PKR.netDisplay,
          },
          USD: {
            expenseMinor: cf.byCurrency.USD.expenseMinor.toString(),
            incomeMinor: cf.byCurrency.USD.incomeMinor.toString(),
            netMinor: cf.byCurrency.USD.netMinor.toString(),
            expenseDisplay: cf.byCurrency.USD.expenseDisplay,
            incomeDisplay: cf.byCurrency.USD.incomeDisplay,
            netDisplay: cf.byCurrency.USD.netDisplay,
          },
        },
        converted: {
          currency: cf.converted.currency,
          netMinor: cf.converted.netMinor?.toString() ?? null,
          excludedCurrencies: cf.converted.excludedCurrencies,
          convertedDisplay: cf.converted.convertedDisplay,
        },
      };
      savings = raw.savings.map((s) => {
        recordRefs.push({ kind: "fund", id: s.fundId });
        return copySavings(s);
      });
    }

    review = {
      month: raw.month,
      timezone: raw.timezone,
      goalProgressBasis: raw.goalProgressBasis,
      goals: raw.goals.map((g) => ({
        id: g.id,
        title: g.title,
        progress: g.progress,
        markedDoneThisMonth: g.markedDoneThisMonth,
      })),
      tasks: copyTaskSummary(raw.tasks),
      weekly: raw.weekly,
      budgets,
      cashflow,
      savings,
    };

    if (scope.taskSummary) {
      tasks = review.tasks;
    }
  } else if (scope.taskSummary) {
    const weekEnd = clock.localDate;
    const summary = selectTaskSummary(
      data.tasks,
      { from: clock.weekStartDate, to: weekEnd },
      weekEnd,
      data.timezone,
      "week",
    );
    tasks = copyTaskSummary(summary);
    for (const t of summary.openTitles) {
      recordRefs.push({ kind: "task", id: t.id });
    }
  }

  let truncated = false;
  let truncationNote: string | null = null;

  const document: AiContextDocument = {
    scope,
    asOf: {
      timezone: data.timezone,
      localDate: clock.localDate,
      generatedAt,
    },
    truncated,
    truncationNote,
    unavailableGoalIds,
    goals,
    review,
    tasks,
  };

  let jsonCompact = canonicalJson(document);
  if (jsonCompact.length > MAX_CONTEXT_CHARS) {
    const trimmed = trimContext(document);
    trimmed.truncated = true;
    trimmed.truncationNote =
      "Context was trimmed to fit provider limits.";
    jsonCompact = canonicalJson(trimmed);
    Object.assign(document, trimmed);
    truncated = true;
    truncationNote = document.truncationNote;
    if (jsonCompact.length > MAX_CONTEXT_CHARS) {
      return { ok: false, code: "context_too_large" };
    }
  }

  const badKey = walkPayload(document);
  if (badKey) {
    return { ok: false, code: "context_inconsistent" };
  }

  return {
    ok: true,
    scope,
    document,
    jsonCompact,
    generatedAt,
    recordRefs,
  };
}

function trimContext(doc: AiContextDocument): AiContextDocument {
  const next: AiContextDocument = JSON.parse(
    JSON.stringify(doc),
  ) as AiContextDocument;
  if (next.goals) {
    for (const g of next.goals) {
      for (const lt of g.linkedTasks) lt.title = "";
      for (const item of g.items) {
        if (item.status === "done") item.title = "";
      }
      g.notes = g.notes.slice(0, Math.min(g.notes.length, 500));
    }
  }
  const compact = canonicalJson(next);
  if (compact.length <= MAX_CONTEXT_CHARS) return next;
  if (next.goals) {
    for (const g of next.goals) g.notes = "";
  }
  return next;
}

export async function buildAiContext(
  supabase: SupabaseClient,
  body: AiClientBody,
  now: Date = new Date(),
): Promise<BuildAiResult> {
  const data = await loadAiData(supabase);
  if (!data) return { ok: false, code: "context_inconsistent" };
  const clock = ownerClock({ timezone: data.timezone }, now);
  const scope = resolveScope(body, clock);
  return assembleAiContext(scope, data, clock, now.toISOString());
}