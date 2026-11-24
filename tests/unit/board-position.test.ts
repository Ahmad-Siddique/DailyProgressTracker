import { describe, expect, it } from "vitest";
import {
  positionAtEnd,
  positionBetween,
  positionForReorder,
} from "../../src/features/board/position";
import type { TaskRow } from "../../src/features/board/selectors";

const row = (partial: Partial<TaskRow> & Pick<TaskRow, "id" | "position">): TaskRow => ({
  id: partial.id,
  position: partial.position,
  title: partial.title ?? "T",
  notes: null,
  status: "todo",
  priority: null,
  localDate: null,
  startTime: null,
  endTime: null,
  completedAt: null,
});

describe("board position", () => {
  it("positionAtEnd does not collide with existing", () => {
    const taken = ["m", "mz", "mzz"];
    const next = positionAtEnd(taken);
    expect(taken.includes(next)).toBe(false);
    expect(next > "mzz").toBe(true);
  });

  it("positionBetween stays unique in column", () => {
    const taken = ["a", "am", "amz"];
    const mid = positionBetween("a", "am", taken);
    expect(taken.includes(mid)).toBe(false);
    expect(mid > "a" && mid < "am").toBe(true);
  });

  it("reorder assigns a fresh position", () => {
    const col = [
      row({ id: "1", position: "m" }),
      row({ id: "2", position: "mz" }),
      row({ id: "3", position: "mzz" }),
    ];
    const pos = positionForReorder(col, "3", "1");
    expect(pos).not.toBeNull();
    expect(["m", "mz", "mzz"].includes(pos!)).toBe(false);
  });
});