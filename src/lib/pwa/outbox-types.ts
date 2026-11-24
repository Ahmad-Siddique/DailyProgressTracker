export type OutboxOp =
  | "task_create"
  | "move_task"
  | "expense_create"
  | "expense_update"
  | "savings_withdrawal";

export type OutboxJobStatus = "pending" | "failed" | "conflict";

export type OutboxJob = {
  id: string;
  idempotencyKey: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  baseVersion: number | null;
  dependsOn: string[];
  createdAt: string;
  status?: OutboxJobStatus;
  failMessage?: string;
  conflictServer?: Record<string, unknown>;
};

export type MutationReceiptLocal = {
  idempotencyKey: string;
  responseBody: Record<string, unknown>;
  storedAt: string;
};

export type CachedRecord = {
  recordKey: string;
  table: string;
  id: string;
  row: Record<string, unknown>;
  storedAt: string;
};

export function recordKey(table: string, id: string) {
  return `${table}:${id}`;
}