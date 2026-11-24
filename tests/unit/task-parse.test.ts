import { describe, expect, it } from "vitest";
import {
  parseTaskTime,
  taskTimePreviewSentence,
} from "../../src/lib/task-parse";

describe("task-parse", () => {
  it("returns none without a time", () => {
    expect(parseTaskTime("Buy milk", "2025-06-01").kind).toBe("none");
    expect(taskTimePreviewSentence("Buy milk", "2025-06-01")).toBe(
      "No time will be saved.",
    );
  });

  it("parses 3pm into preview sentence", () => {
    const sentence = taskTimePreviewSentence("Call 3pm", "2025-06-01");
    expect(sentence).toContain("Will save as 2025-06-01");
    expect(sentence).toContain("3:00 PM");
  });
});