import type { createClient } from "@/lib/supabase/client";
import { createTask, moveTask } from "@/features/board/api";
import { createExpense } from "@/features/money/api";
import { upsertMutationReceipt } from "@/lib/mutation-receipt";
import type { Json, TaskRow as DbTask } from "@/types/database";
import {
  getReceipt,
  listOutboxJobs,
  putReceipt,
  putRecord,
  removeOutboxJob,
  updateOutboxJob,
} from "./idb";
import {
  recordKey,
  type CachedRecord,
  type OutboxJob,
  type OutboxOp,
} from "./outbox-types";

type BrowserSupabase = ReturnType<typeof createClient>;

export type ReplayResult =
  | { kind: "acked"; jobId: string }
  | { kind: "skipped"; jobId: string; reason: "receipt" | "dependency" | "paused" }
  | { kind: "conflict"; jobId: string; message: string }
  | { kind: "permanent_fail"; jobId: string; message: string }
  | { kind: "retry"; jobId: string; message: string };

const PERMANENT_PATTERNS = [
  /withdrawal exceeds reserved/i,
  /violates check constraint/i,
  /foreign key/i,
  /not null/i,
  /Title is required/i,
];

function isPermanentError(message: string): boolean {
  return PERMANENT_PATTERNS.some((re) => re.test(message));
}

const DUPLICATE_KEY_PATTERNS = [
  /duplicate key/i,
  /unique constraint/i,
  /\b23505\b/,
  /unique violation/i,
];

export function isDuplicateKey(message: string): boolean {
  return DUPLICATE_KEY_PATTERNS.some((re) => re.test(message));
}

export function isDuplicateCreateAck(op: OutboxOp, message: string): boolean {
  return (
    (op === "task_create" || op === "expense_create") && isDuplicateKey(message)
  );
}

async function fetchExistingCreateRow(
  supabase: BrowserSupabase,
  job: OutboxJob,
): Promise<
  | {
      body: Record<string, unknown>;
      record?: CachedRecord;
    }
  | null
> {
  if (job.op === "task_create") {
    const p = job.payload as { id: string };
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", p.id)
      .maybeSingle();
    if (error || !data) return null;
    const task = data as DbTask;
    return {
      body: task as unknown as Record<string, unknown>,
      record: {
        recordKey: recordKey("tasks", task.id),
        table: "tasks",
        id: task.id,
        row: task as unknown as Record<string, unknown>,
        storedAt: new Date().toISOString(),
      },
    };
  }
  if (job.op === "expense_create") {
    const p = job.payload as { id: string };
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("id", p.id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return { body: row };
  }
  return null;
}

function jobBlockedByDependency(
  job: OutboxJob,
  failedOrConflict: Set<string>,
): boolean {
  return job.dependsOn.some((id) => failedOrConflict.has(id));
}

export async function replayOneJob(
  userId: string,
  supabase: BrowserSupabase,
  job: OutboxJob,
  failedOrConflict: Set<string>,
): Promise<ReplayResult> {
  if (jobBlockedByDependency(job, failedOrConflict)) {
    return { kind: "skipped", jobId: job.id, reason: "dependency" };
  }
  if (job.status === "failed" || job.status === "conflict") {
    return { kind: "skipped", jobId: job.id, reason: "paused" };
  }

  const receipt = await getReceipt(userId, job.idempotencyKey);
  if (receipt) {
    await removeOutboxJob(userId, job.id);
    return { kind: "skipped", jobId: job.id, reason: "receipt" };
  }

  try {
    const ack = await executeOp(supabase, job);
    if (!ack.ok) {
      if (isDuplicateCreateAck(job.op, ack.message)) {
        const existing = await fetchExistingCreateRow(supabase, job);
        if (existing) {
          await putReceipt(userId, {
            idempotencyKey: job.idempotencyKey,
            responseBody: existing.body,
            storedAt: new Date().toISOString(),
          });
          if (existing.record) {
            await putRecord(userId, existing.record);
          }
          await removeOutboxJob(userId, job.id);
          return { kind: "acked", jobId: job.id };
        }
      }
      if (ack.conflict) {
        await updateOutboxJob(userId, {
          ...job,
          status: "conflict",
          failMessage: ack.message,
          conflictServer: ack.serverRow,
        });
        return { kind: "conflict", jobId: job.id, message: ack.message };
      }
      if (isPermanentError(ack.message)) {
        await updateOutboxJob(userId, {
          ...job,
          status: "failed",
          failMessage: ack.message,
        });
        return { kind: "permanent_fail", jobId: job.id, message: ack.message };
      }
      return { kind: "retry", jobId: job.id, message: ack.message };
    }

    await putReceipt(userId, {
      idempotencyKey: job.idempotencyKey,
      responseBody: ack.body,
      storedAt: new Date().toISOString(),
    });
    if (ack.record) {
      await putRecord(userId, ack.record);
    }
    await removeOutboxJob(userId, job.id);
    return { kind: "acked", jobId: job.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    if (isPermanentError(message)) {
      await updateOutboxJob(userId, {
        ...job,
        status: "failed",
        failMessage: message,
      });
      return { kind: "permanent_fail", jobId: job.id, message };
    }
    return { kind: "retry", jobId: job.id, message };
  }
}

type OpAck =
  | {
      ok: true;
      body: Record<string, unknown>;
      record?: CachedRecord;
    }
  | { ok: false; conflict: boolean; message: string; serverRow?: Record<string, unknown> };

async function executeOp(
  supabase: BrowserSupabase,
  job: OutboxJob,
): Promise<OpAck> {
  switch (job.op as OutboxOp) {
    case "task_create": {
      const p = job.payload as {
        id: string;
        title: string;
        localDate?: string | null;
        startTime?: string | null;
        endTime?: string | null;
        status?: string;
      };
      const result = await createTask(supabase, {
        id: p.id,
        title: p.title,
        localDate: p.localDate,
        startTime: p.startTime,
        endTime: p.endTime,
        status: p.status as "backlog" | "todo" | "in_progress" | "done" | undefined,
      });
      if (!result.ok) {
        return { ok: false, conflict: false, message: result.error };
      }
      const task = result.task;
      return {
        ok: true,
        body: task as unknown as Record<string, unknown>,
        record: {
          recordKey: recordKey("tasks", task.id),
          table: "tasks",
          id: task.id,
          row: task as unknown as Record<string, unknown>,
          storedAt: new Date().toISOString(),
        },
      };
    }
    case "move_task": {
      const p = job.payload as {
        task: DbTask;
        toStatus: string;
        position: string;
      };
      const result = await moveTask(
        supabase,
        p.task,
        p.toStatus as DbTask["status"],
        p.position,
      );
      if (result.ok) {
        return {
          ok: true,
          body: result.task as unknown as Record<string, unknown>,
          record: {
            recordKey: recordKey("tasks", result.task.id),
            table: "tasks",
            id: result.task.id,
            row: result.task as unknown as Record<string, unknown>,
            storedAt: new Date().toISOString(),
          },
        };
      }
      if ("conflict" in result && result.conflict) {
        return {
          ok: false,
          conflict: true,
          message: "Version conflict",
          serverRow: result.task
            ? (result.task as unknown as Record<string, unknown>)
            : undefined,
        };
      }
      return {
        ok: false,
        conflict: false,
        message: "error" in result ? result.error : "move failed",
      };
    }
    case "expense_create": {
      const p = job.payload as {
        id: string;
        accountId: string;
        categoryId: string;
        amountMinor: string;
        occurredOn: string;
        note?: string | null;
      };
      const result = await createExpense(supabase, {
        id: p.id,
        accountId: p.accountId,
        categoryId: p.categoryId,
        amountMinor: BigInt(p.amountMinor),
        occurredOn: p.occurredOn,
        note: p.note,
      });
      if (!result.ok) {
        const conflict = /version conflict/i.test(result.error);
        return {
          ok: false,
          conflict,
          message: result.error,
        };
      }
      return { ok: true, body: { id: result.id } };
    }
    case "expense_update": {
      const p = job.payload as {
        entryId: string;
        amountMinor: string;
        baseVersion: number;
      };
      const { data, error } = await supabase
        .from("ledger_entries")
        .update({
          amount_minor: p.amountMinor,
          version: p.baseVersion + 1,
        })
        .eq("id", p.entryId)
        .eq("version", p.baseVersion)
        .select()
        .maybeSingle();
      if (error) {
        return { ok: false, conflict: false, message: error.message };
      }
      if (!data) {
        const { data: latest } = await supabase
          .from("ledger_entries")
          .select("*")
          .eq("id", p.entryId)
          .maybeSingle();
        return {
          ok: false,
          conflict: true,
          message: "Version conflict",
          serverRow: (latest as Record<string, unknown>) ?? undefined,
        };
      }
      await upsertMutationReceipt(supabase, {
        idempotencyKey: job.idempotencyKey,
        requestHash: job.idempotencyKey,
        resourceId: p.entryId,
        responseBody: data as Json,
      });
      return { ok: true, body: data as Record<string, unknown> };
    }
    case "savings_withdrawal": {
      const p = job.payload as {
        id: string;
        fundId: string;
        amountMinor: string;
        occurredOn: string;
      };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { ok: false, conflict: false, message: "not authenticated" };
      }
      const { error } = await supabase.from("savings_entries").insert({
        id: p.id,
        owner_id: user.id,
        fund_id: p.fundId,
        kind: "withdrawal",
        amount_minor: p.amountMinor,
        occurred_on: p.occurredOn,
        version: 1,
      });
      if (error) {
        const permanent = isPermanentError(error.message);
        return {
          ok: false,
          conflict: false,
          message: error.message,
          serverRow: permanent ? undefined : undefined,
        };
      }
      return { ok: true, body: { id: p.id } };
    }
    default:
      return { ok: false, conflict: false, message: `Unknown op ${job.op}` };
  }
}

export async function replayOutbox(
  userId: string,
  supabase: BrowserSupabase,
): Promise<ReplayResult[]> {
  const jobs = await listOutboxJobs(userId);
  const results: ReplayResult[] = [];
  const blocked = new Set<string>();

  for (const job of jobs) {
    const result = await replayOneJob(userId, supabase, job, blocked);
    results.push(result);
    if (result.kind === "conflict" || result.kind === "permanent_fail") {
      blocked.add(job.id);
    }
    if (result.kind === "conflict") {
      for (const other of jobs) {
        if (other.dependsOn.includes(job.id)) {
          blocked.add(other.id);
        }
      }
    }
  }
  return results;
}

/** Pure ordering/idempotency helper for unit tests (no IDB). */
export function planReplayOrder(jobs: OutboxJob[]): string[] {
  const done = new Set<string>();
  const order: string[] = [];
  const pending = [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  while (pending.length > 0) {
    const ready = pending.filter(
      (j) => j.dependsOn.every((d) => done.has(d)),
    );
    if (ready.length === 0) break;
    const next = ready[0]!;
    order.push(next.id);
    done.add(next.id);
    pending.splice(pending.indexOf(next), 1);
  }
  return order;
}

export function idempotentSkip(
  jobs: OutboxJob[],
  receiptKeys: Set<string>,
): string[] {
  return jobs
    .filter((j) => receiptKeys.has(j.idempotencyKey))
    .map((j) => j.id);
}