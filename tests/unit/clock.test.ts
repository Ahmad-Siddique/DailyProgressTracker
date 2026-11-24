import { describe, expect, it } from "vitest";
import { ownerClock } from "../../src/lib/clock";

describe("ownerClock", () => {
  it("uses Asia/Karachi calendar date for a UTC evening instant", () => {
    const utc = new Date("2024-06-15T20:00:00.000Z");
    const clock = ownerClock({ timezone: "Asia/Karachi" }, utc);
    expect(clock.localDate).toBe("2024-06-16");
    expect(clock.monthKey).toBe("2024-06");
  });

  it("week starts on Monday", () => {
    const utc = new Date("2024-06-12T12:00:00.000Z");
    const clock = ownerClock({ timezone: "UTC" }, utc);
    expect(clock.weekStartDate).toBe("2024-06-10");
  });
});