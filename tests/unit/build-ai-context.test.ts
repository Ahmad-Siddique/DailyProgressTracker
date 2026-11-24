import { describe, expect, it } from "vitest";
import { assembleAiContext, type LoadedAiData } from "../../src/features/ai/buildAiContext";
import { ownerClock } from "../../src/lib/clock";
import type { ResolvedScope } from "../../src/features/ai/types";
import { helmetFund } from "../fixtures/helmet";

function emptyData(): LoadedAiData {
  return {
    timezone: "Asia/Karachi",
    reportingCurrency: "PKR",
    tasks: [],
    goals: [],
    goalItems: [],
    itemsByGoal: new Map(),
    tasksForGoals: [],
    budgets: [],
    expenses: [],
    ledger: [],
    rates: [],
    funds: [helmetFund()],
    savingsEntries: [],
    availableGoalIds: new Set(),
  };
}

describe("assembleAiContext", () => {
  it("finance off leaves review money sections null", () => {
    const scope: ResolvedScope = {
      finance: false,
      goalIds: [],
      goalMode: "none",
      month: "2026-02",
      monthMode: "selected",
      taskSummary: false,
    };
    const clock = ownerClock({ timezone: "Asia/Karachi" }, new Date("2026-02-15T12:00:00Z"));
    const built = assembleAiContext(
      scope,
      emptyData(),
      clock,
      "2026-02-15T12:00:00.000Z",
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.document.review?.budgets).toBeNull();
    expect(built.document.review?.cashflow).toBeNull();
    expect(built.document.review?.savings).toBeNull();
    expect(built.jsonCompact).not.toMatch(/accountId/);
  });

  it("finance on includes helmet savings formatting", () => {
    const scope: ResolvedScope = {
      finance: true,
      goalIds: [],
      goalMode: "none",
      month: "2026-02",
      monthMode: "selected",
      taskSummary: false,
    };
    const clock = ownerClock({ timezone: "Asia/Karachi" }, new Date("2026-02-15T12:00:00Z"));
    const built = assembleAiContext(
      scope,
      emptyData(),
      clock,
      "2026-02-15T12:00:00.000Z",
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const row = built.document.review?.savings?.[0];
    expect(row?.shortfallDisplay).toBe("PKR 10,000.00 behind");
    expect(row?.revisedMonthlyDisplay).toBe("PKR 10,909.09");
  });
});