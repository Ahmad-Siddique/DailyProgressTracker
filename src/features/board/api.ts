import type { createClient } from "@/lib/supabase/client";
import { sha256Hex, upsertMutationReceipt } from "@/lib/mutation-receipt";
import type { Json, TaskRow as DbTask } from "@/types/database";
import type { TaskRow, TaskStatus } from "@/features/board/selectors";

type BrowserSupabase = ReturnType<typeof createClient>;

export function mapTaskRow(row: DbTask): TaskRow {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    localDate: row.local_date,
    startTime: row.start_time,
    endTime: row.end_time,
    completedAt: row.completed_at,
    position: row.position,
  };
}

export async function fetchTasks(supabase: BrowserSupabase): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as DbTask[]).map(mapTaskRow);
}

export type CreateTaskInput = {
  id?: string;
  title: string;
  localDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  goalItemId?: string | null;
  status?: TaskStatus;
};

export async function createTask(
  supabase: BrowserSupabase,
  input: CreateTaskInput,
): Promise<{ ok: true; task: DbTask } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: maxPos } = await supabase
    .from("tasks")
    .select("position")
    .eq("status", input.status ?? "backlog")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos =
    maxPos && (maxPos as { position: string }).position
      ? `${(maxPos as { position: string }).position}z`
      : "m";

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    owner_id: user.id,
    title,
    status: input.status ?? "backlog",
    local_date: input.localDate ?? null,
    start_time: input.startTime ?? null,
    end_time: input.endTime ?? null,
    goal_item_id: input.goalItemId ?? null,
    position: nextPos,
    version: 1,
  };

  const { data, error } = await supabase
    .from("tasks")
    .insert(payload)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, task: data as DbTask };
}

export async function moveTask(
  supabase: BrowserSupabase,
  task: DbTask,
  toStatus: TaskStatus,
  position: string,
): Promise<
  | { ok: true; task: DbTask }
  | { ok: false; conflict: true; task: DbTask | null }
  | { ok: false; conflict: false; error: string }
> {
  const requestHash = await sha256Hex(
    JSON.stringify({ id: task.id, toStatus, position, v: task.version }),
  );
  const idempotencyKey = `move:${task.id}:${task.version}:${requestHash}`;

  const { data, error } = await supabase.rpc("move_task", {
    p_task_id: task.id,
    p_to_status: toStatus,
    p_position: position,
    p_base_version: task.version,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return { ok: false, conflict: false, error: error.message };
  }

  const row = data as DbTask | null;
  if (!row) {
    const { data: priorReceipt } = await supabase
      .from("mutation_receipts")
      .select("request_hash, response_body")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (priorReceipt) {
      const prior = priorReceipt as { request_hash: string; response_body: Json };
      if (prior.request_hash === requestHash) {
        return { ok: true, task: prior.response_body as unknown as DbTask };
      }
    }
    const { data: latest } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task.id)
      .maybeSingle();
    return {
      ok: false,
      conflict: true,
      task: (latest as DbTask | null) ?? null,
    };
  }

  if (row.version === task.version) {
    const { data: latest } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task.id)
      .maybeSingle();
    return {
      ok: false,
      conflict: true,
      task: (latest as DbTask | null) ?? null,
    };
  }

  await upsertMutationReceipt(supabase, {
    idempotencyKey,
    requestHash,
    resourceId: task.id,
    responseBody: row as unknown as Json,
  });

  return { ok: true, task: row };
}

export async function updateTaskDetails(
  supabase: BrowserSupabase,
  task: DbTask,
  input: { title: string; notes: string | null },
): Promise<{ ok: true; task: DbTask } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title,
      notes,
      version: task.version + 1,
    })
    .eq("id", task.id)
    .eq("version", task.version)
    .select()
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict. Refresh and try again." };
  return { ok: true, task: data as DbTask };
}

export async function deleteTask(
  supabase: BrowserSupabase,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function linkTaskToItem(
  supabase: BrowserSupabase,
  task: DbTask,
  goalItemId: string | null,
): Promise<{ ok: true; task: DbTask } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      goal_item_id: goalItemId,
      version: task.version + 1,
    })
    .eq("id", task.id)
    .eq("version", task.version)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict." };
  return { ok: true, task: data as DbTask };
}