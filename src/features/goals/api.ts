import type { createClient } from "@/lib/supabase/client";
import type {
  GoalItemRow as DbGoalItem,
  GoalRow as DbGoal,
  TaskRow as DbTask,
} from "@/types/database";
import type { GoalItemRow, GoalItemStatus } from "@/features/goals/selectors";
import { createTask } from "@/features/board/api";

type BrowserSupabase = ReturnType<typeof createClient>;

export function mapGoalItem(row: DbGoalItem): GoalItemRow {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    position: row.position,
    statusChangedAt: row.status_changed_at,
  };
}

export function mapGoalRow(row: DbGoal) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    deadlineDate: row.deadline_date,
    archivedAt: row.archived_at,
    position: row.position,
    version: row.version,
  };
}

export async function fetchGoals(supabase: BrowserSupabase) {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as DbGoal[]).map(mapGoalRow);
}

export async function fetchGoal(
  supabase: BrowserSupabase,
  goalId: string,
) {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGoalRow(data as DbGoal) : null;
}

export async function fetchGoalItems(
  supabase: BrowserSupabase,
  goalId: string,
): Promise<GoalItemRow[]> {
  const { data, error } = await supabase
    .from("goal_items")
    .select("*")
    .eq("goal_id", goalId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as DbGoalItem[]).map(mapGoalItem);
}

export async function fetchTasksForGoals(supabase: BrowserSupabase) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, local_date, goal_item_id")
    .not("goal_item_id", "is", null);
  if (error) throw error;
  return (data as Pick<
    DbTask,
    "id" | "title" | "status" | "local_date" | "goal_item_id"
  >[]).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    localDate: t.local_date,
    goalItemId: t.goal_item_id,
  }));
}

export type UpdateGoalInput = {
  title: string;
  notes: string | null;
  deadlineDate: string | null;
};

export async function updateGoal(
  supabase: BrowserSupabase,
  goal: Pick<DbGoal, "id" | "version">,
  input: UpdateGoalInput,
): Promise<{ ok: true; goal: DbGoal } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const deadlineDate = input.deadlineDate?.trim() ? input.deadlineDate.trim() : null;

  const { data, error } = await supabase
    .from("goals")
    .update({
      title,
      notes,
      deadline_date: deadlineDate,
      version: goal.version + 1,
    })
    .eq("id", goal.id)
    .eq("version", goal.version)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict. Refresh and try again." };
  return { ok: true, goal: data as DbGoal };
}

export async function setGoalArchived(
  supabase: BrowserSupabase,
  goal: Pick<DbGoal, "id" | "version">,
  archived: boolean,
): Promise<{ ok: true; goal: DbGoal } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("goals")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      version: goal.version + 1,
    })
    .eq("id", goal.id)
    .eq("version", goal.version)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict. Refresh and try again." };
  return { ok: true, goal: data as DbGoal };
}

export async function deleteGoal(
  supabase: BrowserSupabase,
  goalId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createGoal(
  supabase: BrowserSupabase,
  title: string,
): Promise<{ ok: true; goal: DbGoal } | { ok: false; error: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: maxPos } = await supabase
    .from("goals")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos =
    maxPos && (maxPos as { position: string }).position
      ? `${(maxPos as { position: string }).position}z`
      : "m";

  const { data, error } = await supabase
    .from("goals")
    .insert({
      owner_id: user.id,
      title: trimmed,
      position: nextPos,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, goal: data as DbGoal };
}

export function previewBulkPaste(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export async function bulkInsertGoalItems(
  supabase: BrowserSupabase,
  goalId: string,
  titles: string[],
): Promise<
  | { ok: true; items: DbGoalItem[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("bulk_insert_goal_items", {
    p_goal_id: goalId,
    p_titles: titles,
    p_idempotency_key: `bulk:${goalId}:${titles.length}`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as DbGoalItem[] };
}

export async function updateGoalItemTitle(
  supabase: BrowserSupabase,
  item: DbGoalItem,
  title: string,
): Promise<{ ok: true; item: DbGoalItem } | { ok: false; error: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required." };
  const { data, error } = await supabase
    .from("goal_items")
    .update({
      title: trimmed,
      version: item.version + 1,
    })
    .eq("id", item.id)
    .eq("version", item.version)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict." };
  return { ok: true, item: data as DbGoalItem };
}

export async function deleteGoalItem(
  supabase: BrowserSupabase,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("goal_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateGoalItemStatus(
  supabase: BrowserSupabase,
  item: DbGoalItem,
  status: GoalItemStatus,
): Promise<{ ok: true; item: DbGoalItem } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("goal_items")
    .update({
      status,
      status_changed_at: new Date().toISOString(),
      version: item.version + 1,
    })
    .eq("id", item.id)
    .eq("version", item.version)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Version conflict." };
  return { ok: true, item: data as DbGoalItem };
}

export async function createGoalItem(
  supabase: BrowserSupabase,
  goalId: string,
  title: string,
): Promise<{ ok: true; item: DbGoalItem } | { ok: false; error: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: maxPos } = await supabase
    .from("goal_items")
    .select("position")
    .eq("goal_id", goalId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos =
    maxPos && (maxPos as { position: string }).position
      ? `${(maxPos as { position: string }).position}z`
      : "m";

  const { data, error } = await supabase
    .from("goal_items")
    .insert({
      goal_id: goalId,
      owner_id: user.id,
      title: trimmed,
      position: nextPos,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: data as DbGoalItem };
}

export async function createTaskFromItem(
  supabase: BrowserSupabase,
  item: DbGoalItem,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await createTask(supabase, {
    title: item.title,
    status: "todo",
    goalItemId: item.id,
  });
  if (!result.ok) return result;
  return { ok: true };
}