import { describe, expect, it } from "vitest";
import {
  formatGoalProgress,
  selectGoalProgress,
  selectGoalProgressStatus,
  summarizeItemStatuses,
  type GoalItemRow,
} from "../../src/features/goals/selectors";

describe("selectGoalProgress", () => {
  it("returns empty for zero items", () => {
    expect(selectGoalProgress([])).toEqual({ state: "empty" });
    expect(formatGoalProgress({ state: "empty" })).toBe("Empty");
  });

  it("returns 2% for one of fifty done", () => {
    const items: GoalItemRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      title: `Item ${i}`,
      status: i === 0 ? "done" : "not_started",
      position: `p${i}`,
      statusChangedAt: "2025-01-01T00:00:00Z",
    }));
    const p = selectGoalProgress(items);
    expect(p).toEqual({ state: "ratio", done: 1, active: 50, percent: 2 });
    expect(formatGoalProgress(p)).toBe("1 of 50 (2%)");
  });
});

describe("selectGoalProgressStatus", () => {
  const base = (
    status: GoalItemRow["status"],
    id = "1",
  ): GoalItemRow => ({
    id,
    title: "Item",
    status,
    position: "p1",
    statusChangedAt: "2025-01-01T00:00:00Z",
  });

  it("returns empty when there are no items", () => {
    expect(selectGoalProgressStatus({ state: "empty" })).toBe("empty");
  });

  it("returns complete when every item is done", () => {
    const p = selectGoalProgress([base("done"), base("done", "2")]);
    expect(selectGoalProgressStatus(p)).toBe("complete");
  });

  it("returns in_progress when work remains", () => {
    const p = selectGoalProgress([base("done"), base("not_started", "2")]);
    expect(selectGoalProgressStatus(p)).toBe("in_progress");
  });
});

describe("summarizeItemStatuses", () => {
  it("aggregates counts by status", () => {
    const items: GoalItemRow[] = [
      {
        id: "1",
        title: "A",
        status: "done",
        position: "p1",
        statusChangedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "2",
        title: "B",
        status: "in_progress",
        position: "p2",
        statusChangedAt: "2025-01-01T00:00:00Z",
      },
    ];
    expect(summarizeItemStatuses(items)).toBe("1 done · 1 in progress");
  });
});