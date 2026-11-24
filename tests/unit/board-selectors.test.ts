import { describe, expect, it } from "vitest";
import {
  selectOverdueTasks,
  selectTaskSummary,
  selectTodayAgenda,
  type TaskRow,
} from "../../src/features/board/selectors";

const base = (partial: Partial<TaskRow>): TaskRow => ({
  id: partial.id ?? "1",
  title: partial.title ?? "Task",
  notes: partial.notes ?? null,
  status: partial.status ?? "backlog",
  priority: partial.priority ?? null,
  localDate: partial.localDate ?? null,
  startTime: partial.startTime ?? null,
  endTime: partial.endTime ?? null,
  completedAt: partial.completedAt ?? null,
  position: partial.position ?? "m",
});

describe("selectTaskSummary", () => {
  it("returns overdue count when window contains today", () => {
    const tasks = [
      base({
        id: "a",
        status: "todo",
        localDate: "2025-01-01",
        title: "Late",
      }),
    ];
    const summary = selectTaskSummary(
      tasks,
      { from: "2025-01-05", to: "2025-01-10" },
      "2025-01-10",
      "UTC",
    );
    expect(summary.counts.overdue).toBe(1);
  });

  it("returns null overdue outside today window", () => {
    const summary = selectTaskSummary(
      [],
      { from: "2024-12-01", to: "2024-12-31" },
      "2025-01-10",
      "UTC",
    );
    expect(summary.counts.overdue).toBeNull();
  });
});

describe("selectOverdueTasks", () => {
  it("lists open tasks before today", () => {
    const tasks = [
      base({
        id: "x",
        localDate: "2025-01-01",
        status: "todo",
        title: "Overdue",
      }),
    ];
    expect(selectOverdueTasks(tasks, "2025-01-10")).toEqual([
      { id: "x", title: "Overdue", localDate: "2025-01-01" },
    ]);
  });
});

describe("selectTodayAgenda", () => {
  it("orders timed before untimed", () => {
    const tasks = [
      base({
        id: "u",
        localDate: "2025-01-10",
        status: "todo",
        title: "Untimed",
      }),
      base({
        id: "t",
        localDate: "2025-01-10",
        startTime: "09:00:00",
        status: "todo",
        title: "Timed",
      }),
    ];
    const { timed, untimed } = selectTodayAgenda(tasks, "2025-01-10");
    expect(timed.map((x) => x.id)).toEqual(["t"]);
    expect(untimed.map((x) => x.id)).toEqual(["u"]);
  });
});