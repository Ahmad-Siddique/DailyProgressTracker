import { describe, expect, it } from "vitest";
import {
  idempotentSkip,
  isDuplicateCreateAck,
  isDuplicateKey,
  planReplayOrder,
} from "../../src/lib/pwa/replay";
import type { OutboxJob } from "../../src/lib/pwa/outbox-types";

function job(
  id: string,
  createdAt: string,
  dependsOn: string[] = [],
  key?: string,
): OutboxJob {
  return {
    id,
    idempotencyKey: key ?? `key:${id}`,
    op: "task_create",
    payload: {},
    baseVersion: null,
    dependsOn,
    createdAt,
  };
}

describe("outbox replay planning", () => {
  it("orders jobs by createdAt with dependency wait", () => {
    const jobs = [
      job("b", "2026-04-02T00:00:00.000Z", ["a"]),
      job("a", "2026-04-01T00:00:00.000Z"),
      job("c", "2026-04-03T00:00:00.000Z"),
    ];
    expect(planReplayOrder(jobs)).toEqual(["a", "b", "c"]);
  });

  it("skips jobs that already have receipts", () => {
    const jobs = [
      job("1", "2026-04-01T00:00:00.000Z", [], "idem-1"),
      job("2", "2026-04-02T00:00:00.000Z", [], "idem-2"),
    ];
    expect(idempotentSkip(jobs, new Set(["idem-1"]))).toEqual(["1"]);
  });

  it("treats duplicate key on create ops as ack-eligible", () => {
    const pgMsg =
      'duplicate key value violates unique constraint "tasks_pkey"';
    expect(isDuplicateKey(pgMsg)).toBe(true);
    expect(isDuplicateCreateAck("task_create", pgMsg)).toBe(true);
    expect(isDuplicateCreateAck("expense_create", pgMsg)).toBe(true);
    expect(isDuplicateCreateAck("move_task", pgMsg)).toBe(false);
    expect(isDuplicateKey("network error")).toBe(false);
  });
});