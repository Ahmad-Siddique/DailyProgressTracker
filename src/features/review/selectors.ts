import {
  selectTaskSummary,
  type TaskRow,
  type TaskSummaryWindow,
} from "../board/selectors";
import {
  selectGoalProgress,
  type GoalItemRow,
} from "../goals/selectors";
import {
  selectBudgetStatus,
  selectFxRateForMonth,
  selectMonthlyCashflow,
  type BudgetInput,
  type FxRateRow,
  type LedgerEntryRow,
  type Currency,
} from "../money/selectors";
import {
  selectSavingsPlan,
  type SavingsEntryRow,
  type SavingsFundRow,
} from "../savings/selectors";

export type ReviewGoalRow = {
  id: string;
  title: string;
  items: GoalItemRow[];
  archivedAt: string | null;
};

function monthWindow(monthKey: string): TaskSummaryWindow {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 1970, (m ?? 1), 0));
  const to = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
  return { from: `${monthKey}-01`, to };
}

function completedOnLocalDate(
  completedAt: string | null,
  timezone: string,
): string | null {
  if (!completedAt) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(completedAt));
}

function statusChangedInMonth(
  statusChangedAt: string,
  monthKey: string,
  timezone: string,
): boolean {
  const local = completedOnLocalDate(statusChangedAt, timezone);
  if (!local) return false;
  return local.startsWith(monthKey);
}

export function selectWeeklyCompletion(
  tasks: TaskRow[],
  month: string,
  timezone: string,
): { weeks: Array<{ weekStart: string; completedCount: number }> } {
  const window = monthWindow(month);
  const weeks: Array<{ weekStart: string; completedCount: number }> = [];
  const [sy, sm, sd] = window.from.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy ?? 1970, (sm ?? 1) - 1, sd ?? 1));
  const end = new Date(window.to + "T12:00:00Z");

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(cursor);
    weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
    const ws = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, "0")}-${String(weekStart.getUTCDate()).padStart(2, "0")}`;
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const we = `${weekEnd.getUTCFullYear()}-${String(weekEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(weekEnd.getUTCDate()).padStart(2, "0")}`;

    if (we < window.from || ws > window.to) {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      continue;
    }

    const from = ws < window.from ? window.from : ws;
    const to = we > window.to ? window.to : we;
    const summary = selectTaskSummary(
      tasks,
      { from, to },
      to,
      timezone,
      "all",
    );
    if (!weeks.some((w) => w.weekStart === ws)) {
      weeks.push({ weekStart: ws, completedCount: summary.counts.done });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return { weeks };
}

export type MonthlyReviewParams = {
  month: string;
  timezone: string;
  finance: "omit" | "include";
  today: string;
  data: {
    tasks: TaskRow[];
    goals: ReviewGoalRow[];
    budgets: BudgetInput[];
    expenses: LedgerEntryRow[];
    ledger: LedgerEntryRow[];
    rates: FxRateRow[];
    reportingCurrency: Currency;
    funds: SavingsFundRow[];
    savingsEntries: SavingsEntryRow[];
  };
};

export function selectMonthlyReview(params: MonthlyReviewParams) {
  const { month, timezone, finance, today, data } = params;
  const window = monthWindow(month);

  const tasks = selectTaskSummary(
    data.tasks,
    window,
    today,
    timezone,
    "all",
  );

  const goals = data.goals
    .filter((g) => g.archivedAt == null)
    .map((g) => ({
      id: g.id,
      title: g.title,
      progress: selectGoalProgress(g.items),
      markedDoneThisMonth: g.items.filter(
        (i) =>
          i.status === "done" &&
          statusChangedInMonth(i.statusChangedAt, month, timezone),
      ).length,
    }));

  const weekly = selectWeeklyCompletion(data.tasks, month, timezone);

  let budgets: ReturnType<typeof selectBudgetStatus>[] | null = null;
  let cashflow: ReturnType<typeof selectMonthlyCashflow> | null = null;
  let savings: ReturnType<typeof selectSavingsPlan>[] | null = null;

  if (finance === "include") {
    const rate = selectFxRateForMonth(data.rates, month);
    budgets = data.budgets.map((b) => selectBudgetStatus(b, data.expenses, rate));
    cashflow = selectMonthlyCashflow(
      data.ledger,
      month,
      data.reportingCurrency,
      rate,
    );
    savings = data.funds.map((fund) =>
      selectSavingsPlan(fund, data.savingsEntries, month),
    );
  }

  return {
    month,
    timezone,
    goalProgressBasis: "current_snapshot" as const,
    tasks,
    goals,
    weekly,
    budgets,
    cashflow,
    savings,
  };
}

export function computeStreak(
  tasks: TaskRow[],
  timezone: string,
  today: string,
): number {
  const completedDates = new Set<string>();
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const d = completedOnLocalDate(t.completedAt, timezone);
    if (d) completedDates.add(d);
  }

  let cursor = today;
  if (!completedDates.has(cursor)) {
    const [y, m, d] = today.split("-").map(Number);
    const prev = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
    const yesterday = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
    if (!completedDates.has(yesterday)) return 0;
    cursor = yesterday;
  }

  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    const [y, m, d] = cursor.split("-").map(Number);
    const prev = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
    cursor = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
  }
  return streak;
}