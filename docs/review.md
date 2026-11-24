# Review

Status: review spec. This screen assembles selectors from Board, Goals, Money, and Savings. It does not keep a second formula for progress, budgets, cashflow, or installments. AI calls `selectMonthlyReview` and uses the nested values as-is.

## Screens and states

The Review route has a month switcher, a weekly summary, an annual savings grid, and an optional streak.

### Monthly review

Sections, in order, each with a heading:

1. Completed tasks — count and titles from `selectTaskSummary` for that month.
2. Goal progress — one row per non-archived goal: title and `selectGoalProgress`. Empty goals say Empty. A line under the section states that item progress is the current snapshot and that "marked done this month" uses `status_changed_at` only (A-17).
3. Budgets — one row per budget in the month from `selectBudgetStatus`: category, actual, remaining, overage, and Partial when set.
4. Cashflow — native income, expense, and net per currency from `selectMonthlyCashflow`, with the sentence "Transfers are not included." The converted total shows the reporting currency and Partial plus excluded currencies when the rate is missing.
5. Savings — one row per non-archived fund from `selectSavingsPlan` at that month: planned baseline, saved, shortfall or ahead, revised installment or Overdue.

A chart may render completed-task counts by week, budget actual against amount, or saved against target. Every chart has a table of the same numbers next to it. The table is the accessible source. The chart is not the only encoding.

Empty month: each section says "Nothing recorded for this month" except goal progress, which still shows current snapshots for active goals, and savings, which still shows the plan for that month even with zero entries.

### Weekly summary

`selectWeeklyCompletion` lists each Monday–Sunday week that overlaps the selected month. Each row is the week start and the number of tasks whose `completed_at` local date falls in that week. The number matches the done portion of `selectTaskSummary` for that week window.

### Annual savings grid

`selectAnnualSavingsGrid` for the year of the selected month. Cells show contribution minor, withdrawal minor, and saved minor. The current month's plan figures are labeled as coming from `selectSavingsPlan`.

### Streak

The streak counts consecutive local dates, ending at today if today has a completion, otherwise ending at yesterday if yesterday has a completion, otherwise zero. A date counts when any task has `completed_at` on that local date. The control is labeled "Streak" and can be hidden in Settings. Hiding it does not delete completions. The default is shown.

Loading, error, and offline follow `docs/ux.md`. Offline Review shows the cached selector inputs and a stale time. It does not invent totals.

Opening AI from Review preselects this month and leaves finance off.

## Data ownership and constraints

Review owns no tables. It reads tasks, goals, items, budgets, ledger entries, rates, funds, and savings entries through selectors.

`selectWeeklyCompletion(tasks, month, timezone)` returns `{ weeks: Array<{ weekStart: string; completedCount: number }> }`. `weekStart` is the Monday date. `completedCount` is the size of the set `selectTaskSummary` would count as `done` for that week. The implementation calls `selectTaskSummary` per week or shares that function's predicate. It does not use a different definition of completion.

`selectMonthlyReview({ month, timezone, finance, data })` returns:

```ts
{
  month: string
  timezone: string
  goalProgressBasis: "current_snapshot"
  tasks: ReturnType<typeof selectTaskSummary>
  goals: Array<{
    id: string
    title: string
    progress: ReturnType<typeof selectGoalProgress>
    markedDoneThisMonth: number
  }>
  weekly: ReturnType<typeof selectWeeklyCompletion>
  budgets: null | Array<ReturnType<typeof selectBudgetStatus>>
  cashflow: null | ReturnType<typeof selectMonthlyCashflow>
  savings: null | Array<ReturnType<typeof selectSavingsPlan>>
}
```

- `finance: "omit"` sets `budgets`, `cashflow`, and `savings` to null and does not call the money or savings selectors.
- `finance: "include"` sets those fields to the selector results. `selectSavingsPlan` is called with `asOfMonth` equal to the review month.
- `markedDoneThisMonth` counts items on that goal whose status is `done` and whose `status_changed_at` local date falls in the month. It is a count, not a second progress percent.
- Goal rows are non-archived goals. Progress is `selectGoalProgress` of that goal's items.
- Task window for the monthly `selectTaskSummary` is the calendar month in the owner timezone. `overdue` follows the board rule: a number only when the window contains today.

The screen displays these fields. It does not recompute percent, remaining, overage, net, or revised installment. Visible money text comes from `formatMinor` and `formatSavingsPlan`. Goal text comes from `formatGoalProgress`.

## Read/write contracts

Review does not write domain rows. The streak visibility flag is a profile preference, updated like other settings in `docs/ux.md`.

Reads are the selector calls above. AI's month context is this function:

- Finance off: `selectMonthlyReview({ finance: "omit" })`.
- Finance on: `selectMonthlyReview({ finance: "include" })`.

`buildAiContext` copies `tasks`, `goals`, `weekly`, and, only when finance is included, `budgets`, `cashflow`, and `savings`. If a nested progress or plan object is not referentially the selector result, that is an implementation bug. The consistency check in `docs/ai.md` fails the request rather than repairing the numbers.

## Dependencies

- `docs/board.md` for `selectTaskSummary`.
- `docs/goals.md` for `selectGoalProgress` and `status_changed_at`.
- `docs/money.md` for `selectBudgetStatus`, `selectMonthlyCashflow`, and `selectFxRateForMonth`.
- `docs/savings.md` for `selectSavingsPlan` and `selectAnnualSavingsGrid`.
- `docs/architecture.md` for the clock, reporting currency, and A-17.
- `docs/ux.md` for charts' text alternatives and the AI entry.
- `docs/ai.md` for how this object is trimmed before OpenRouter sees it.

## Edge cases

- A month with completions and no budgets shows tasks and "No budgets for this month." It does not copy last month.
- Transfers in the month do not change the cashflow section.
- A missing FX rate leaves native cashflow visible and marks the converted total partial.
- Archived goals are absent. Archived funds are absent.
- An empty goal is listed with progress Empty so the owner can tell it from a 0% goal.
- Streak across a month boundary counts the local dates, not the calendar months.
- A completion today starts or continues the streak. No completion today and a completion yesterday keeps the streak through yesterday. A gap yesterday yields 0 even if earlier days were complete.
- Hiding the streak and reloading keeps it hidden.
- The weekly row count for a month is the number of distinct Monday-start weeks that overlap the month, which is 4, 5, or 6.
- Goal progress on this screen and on the goal screen match for the same items because both call `selectGoalProgress`.

## Given / When / Then

1. Given one task completed on a local date in the selected month, when the monthly review renders, then the completed count is 1 and the title is listed.
2. Given 50 items and one Done, when the goal row renders, then it shows 1 of 50 and 2%, equal to `selectGoalProgress`.
3. Given a goal with no items, when the goal section renders, then that row says Empty.
4. Given income, an expense, and a transfer in the month, when cashflow renders, then net equals income minus expense and the transfer amount is absent from both.
5. Given the helmet fixture and the review month equal to month 2, when the savings section renders, then the figures match `selectSavingsPlan` including PKR 10,000.00 behind and revised PKR 10,909.09.
6. Given `finance: "omit"`, when `selectMonthlyReview` returns, then `budgets`, `cashflow`, and `savings` are null.
7. Given `finance: "include"` and a missing rate, when the section renders, then native totals show and Partial is visible.
8. Given completions on today and the previous two local days, and none before that, when the streak renders, then the value is 3.
9. Given no completion today and none yesterday, when the streak renders, then the value is 0.
10. Given a chart of weekly completions, when the table is read, then each cell equals that week's `completedCount`.
11. Given an item marked Done with `status_changed_at` in the month, when the goal row renders, then `markedDoneThisMonth` is 1. When that item is reopened, then the count is 0.
12. Given AI context for this month with finance included, when the savings numbers are compared to this screen, then they are the same `selectSavingsPlan` fields.
