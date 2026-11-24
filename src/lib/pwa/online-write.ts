import type { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import { putOutboxJob, putRecord } from "./idb";
import {
  recordKey,
  type CachedRecord,
  type OutboxJob,
  type OutboxOp,
} from "./outbox-types";

type BrowserSupabase = ReturnType<typeof createClient>;

function networkUnreachable(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch|network|Failed to fetch/i.test(msg);
}

export async function enqueueJob(
  userId: string,
  input: {
    op: OutboxOp;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    baseVersion?: number | null;
    dependsOn?: string[];
    optimisticRecord?: Omit<CachedRecord, "storedAt">;
  },
): Promise<{ queued: true; jobId: string }> {
  const job: OutboxJob = {
    id: uuid(),
    idempotencyKey: input.idempotencyKey,
    op: input.op,
    payload: input.payload,
    baseVersion: input.baseVersion ?? null,
    dependsOn: input.dependsOn ?? [],
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await putOutboxJob(userId, job);
  if (input.optimisticRecord) {
    await putRecord(userId, {
      ...input.optimisticRecord,
      storedAt: new Date().toISOString(),
    });
  }
  window.dispatchEvent(new CustomEvent("dayboard:outbox-changed"));
  return { queued: true, jobId: job.id };
}

export async function tryNetworkFirst<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; offline: true }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, offline: true };
  }
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    if (networkUnreachable(err)) {
      return { ok: false, offline: true };
    }
    throw err;
  }
}

export async function onlineTaskCreate(
  userId: string,
  supabase: BrowserSupabase,
  input: {
    title: string;
    localDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    status?: string;
    create: () => Promise<
      | { ok: true; task: Record<string, unknown> }
      | { ok: false; error: string }
    >;
  },
): Promise<
  | { ok: true; task: Record<string, unknown> }
  | { ok: false; error: string }
  | { queued: true; taskId: string }
> {
  const attempt = await tryNetworkFirst(input.create);
  if (attempt.ok && attempt.value.ok) {
    return { ok: true, task: attempt.value.task };
  }
  if (attempt.ok && !attempt.value.ok) {
    return { ok: false, error: attempt.value.error };
  }

  const id = uuid();
  const idempotencyKey = `task:create:${id}`;
  await enqueueJob(userId, {
    op: "task_create",
    idempotencyKey,
    payload: {
      id,
      title: input.title,
      localDate: input.localDate ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      status: input.status ?? "backlog",
    },
    optimisticRecord: {
      recordKey: recordKey("tasks", id),
      table: "tasks",
      id,
      row: {
        id,
        title: input.title,
        status: input.status ?? "backlog",
        local_date: input.localDate ?? null,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        position: "m",
        version: 1,
        pending: true,
      },
    },
  });
  return { queued: true, taskId: id };
}

export async function onlineMoveTask(
  userId: string,
  input: {
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ queued: true } | { ok: false; error: string }> {
  await enqueueJob(userId, {
    op: "move_task",
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
  return { queued: true };
}

export async function onlineExpenseCreate(
  userId: string,
  input: {
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ queued: true }> {
  await enqueueJob(userId, {
    op: "expense_create",
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
  return { queued: true };
}