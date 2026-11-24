import { describe, expect, it } from "vitest";
import {
  selectMonthlyReview,
  selectWeeklyCompletion,
} from "../../src/features/review/selectors";
import type { TaskRow } from "../../src/features/board/selectors";
import { helmetFund } from "../fixtures/helmet";

describe("selectMonthlyReview", () => {
  it('6 — finance omit nulls money sections', () => {
    const review = selectMonthlyReview({
      month: "2026-02",
      timezone: "Asia/Karachi",
      finance: "omit",
      today: "2026-02-15",
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
    expect(review.cashflow).toBeNull();
    expect(review.savings).toBeNull();
  });

  it('11 — finance include nests savings plan', () => {
    const review = selectMonthlyReview({
      month: "2026-02",
      timezone: "Asia/Karachi",
      finance: "include",
      today: "2026-02-15",
      data: {
        tasks: [],
        goals: [],
        budgets: [],
        expenses: [],
        ledger: [],
        rates: [],
        reportingCurrency: "PKR",
        funds: [helmetFund()],
        savingsEntries: [],
      },
    });
    expect(review.savings?.[0]?.shortfallMinor).toBe(1_000_000n);
  });
});

describe("selectWeeklyCompletion", () => {
  it("counts completions in week windows", () => {
    const tasks: TaskRow[] = [
      {
        id: "t1",
        title: "Done",
        notes: null,
        status: "done",
        priority: null,
        localDate: null,
        startTime: null,
        endTime: null,
        completedAt: "2026-02-03T10:00:00.000Z",
        position: "a",
      },
    ];
    const weekly = selectWeeklyCompletion(tasks, "2026-02", "UTC");
    expect(weekly.weeks.some((w) => w.completedCount >= 1)).toBe(true);
  });
});