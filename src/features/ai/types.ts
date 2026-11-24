export type GoalMode = "none" | "current" | "selected";
export type MonthMode = "none" | "current" | "selected";
export type ReuseMode = "new" | "omit_prior" | null;

export type ResolvedScope = {
  finance: boolean;
  goalIds: string[];
  goalMode: GoalMode;
  month: string | null;
  monthMode: MonthMode;
  taskSummary: boolean;
};

export type AiTurn = {
  role: "user" | "assistant";
  content: string;
  signature: string;
  scopeCanonical: string;
};

export type AiClientBody = {
  goalMode: GoalMode;
  goalIds: string[];
  monthMode: MonthMode;
  month: string | null;
  taskSummary: boolean;
  finance: boolean;
  messages: AiTurn[];
  newMessage?: { content: string };
  acknowledgeNarrow?: boolean;
  reuse?: ReuseMode;
  threadId?: string | null;
};

export type AiErrorCode =
  | "free_model_unavailable"
  | "no_qualifying_route"
  | "misconfigured"
  | "rate_limited"
  | "busy"
  | "provider_rate_limited"
  | "timeout"
  | "disconnected"
  | "unauthenticated"
  | "scope_narrowed"
  | "context_inconsistent"
  | "context_too_large"
  | "invalid_request";

export type BuildAiResult =
  | {
      ok: true;
      scope: ResolvedScope;
      document: AiContextDocument;
      jsonCompact: string;
      generatedAt: string;
      recordRefs: RecordRef[];
    }
  | { ok: false; code: AiErrorCode };

export type RecordRef =
  | { kind: "goal"; id: string }
  | { kind: "item"; id: string }
  | { kind: "task"; id: string }
  | { kind: "fund"; id: string };

export type AiContextDocument = {
  scope: ResolvedScope;
  asOf: { timezone: string; localDate: string; generatedAt: string };
  truncated: boolean;
  truncationNote: string | null;
  unavailableGoalIds: string[];
  goals: GoalDetailCopy[] | null;
  review: MonthlyReviewCopy | null;
  tasks: TaskSummaryCopy | null;
};

export type GoalDetailCopy = {
  id: string;
  title: string;
  notes: string;
  deadline: string | null;
  archived: boolean;
  progress: {
    state: "empty" | "ratio";
    done?: number;
    active?: number;
    percent?: number;
  };
  items: Array<{
    id: string;
    title: string;
    status: string;
    position: string;
  }>;
  stalledItemIds: string[];
  linkedTasks: Array<{
    id: string;
    title: string;
    status: string;
    localDate: string | null;
  }>;
};

export type TaskSummaryCopy = {
  window: { from: string; to: string };
  counts: {
    backlog: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number | null;
  };
  openTitles: Array<{
    id: string;
    title: string;
    status: string;
    localDate: string | null;
    priority: string | null;
  }>;
};

export type MonthlyReviewCopy = {
  month: string;
  timezone: string;
  goalProgressBasis: "current_snapshot";
  goals: Array<{
    id: string;
    title: string;
    progress: GoalDetailCopy["progress"];
    markedDoneThisMonth: number;
  }>;
  tasks: TaskSummaryCopy;
  weekly: { weeks: Array<{ weekStart: string; completedCount: number }> };
  budgets: BudgetCopy[] | null;
  cashflow: CashflowCopy | null;
  savings: SavingsCopy[] | null;
};

export type BudgetCopy = {
  categoryName: string;
  currency: string;
  budgetMinor: string;
  actualMinor: string;
  remainingMinor: string;
  overageMinor: string;
  budgetDisplay: string;
  actualDisplay: string;
  remainingDisplay: string;
  overageDisplay: string;
  partial: boolean;
  excludedExpenseCount: number;
};

export type CashflowCopy = {
  byCurrency: Record<
    string,
    {
      expenseMinor: string;
      incomeMinor: string;
      netMinor: string;
      expenseDisplay: string;
      incomeDisplay: string;
      netDisplay: string;
    }
  >;
  converted: {
    currency: string;
    netMinor: string | null;
    excludedCurrencies: string[];
    convertedDisplay: string | null;
  };
  transfersExcluded: boolean;
};

export type SavingsCopy = {
  fundId: string;
  name: string;
  kind: string;
  currency: string;
  targetMinor: string;
  savedMinor: string;
  remainingMinor: string;
  openingAllocationMinor: string;
  startMonth: string;
  deadlineMonth: string;
  asOfMonth: string;
  baselineMonthlyMinor: string;
  shortfallMinor: string;
  remainingMonths: number;
  revisedMonthlyMinor: string | null;
  finalInstallmentMinor: string | null;
  funded: boolean;
  purchased: boolean;
  overdueMinor: string | null;
  targetDisplay: string;
  savedDisplay: string;
  remainingDisplay: string;
  baselineMonthlyDisplay: string;
  shortfallDisplay: string;
  revisedMonthlyDisplay: string | null;
  finalInstallmentDisplay: string | null;
  overdueDisplay: string | null;
};