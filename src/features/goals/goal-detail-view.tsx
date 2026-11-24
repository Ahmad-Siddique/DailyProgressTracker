"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  bulkInsertGoalItems,
  createGoalItem,
  createTaskFromItem,
  deleteGoal,
  deleteGoalItem,
  fetchGoal,
  fetchGoalItems,
  fetchTasksForGoals,
  previewBulkPaste,
  setGoalArchived,
  updateGoal,
  updateGoalItemStatus,
  updateGoalItemTitle,
} from "@/features/goals/api";
import {
  GoalEditDialog,
  GoalItemEditDialog,
} from "@/features/goals/goal-edit-dialog";
import {
  GOAL_ITEM_STATUS_LABEL,
  formatGoalProgress,
  selectGoalDetail,
  selectGoalProgressStatus,
  summarizeItemStatuses,
  type GoalItemStatus,
} from "@/features/goals/selectors";
import {
  GoalArchivedBadge,
  GoalItemStatusBadge,
  GoalProgressStatusBadge,
} from "@/features/goals/goal-status-badges";
import { linkTaskToItem } from "@/features/board/api";
import { ownerClock } from "@/lib/clock";
import type { GoalItemRow as DbGoalItem, ProfileRow, TaskRow } from "@/types/database";
import { useAi } from "@/components/ai/ai-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LoadingPulse,
  PageHeader,
  PageSection,
  SurfaceCard,
} from "@/components/ui/page-chrome";

export function GoalDetailView({ goalId }: { goalId: string }) {
  const ai = useAi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paste, setPaste] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [linkItemId, setLinkItemId] = React.useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = React.useState("");
  const [goalEditOpen, setGoalEditOpen] = React.useState(false);
  const [goalEditDraft, setGoalEditDraft] = React.useState({
    title: "",
    notes: "",
    deadlineDate: "",
  });
  const [goalEditSaving, setGoalEditSaving] = React.useState(false);
  const [goalEditError, setGoalEditError] = React.useState<string | null>(null);
  const [itemEdit, setItemEdit] = React.useState<{
    id: string;
    title: string;
  } | null>(null);
  const [itemEditSaving, setItemEditSaving] = React.useState(false);
  const [itemEditError, setItemEditError] = React.useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["goal-detail", goalId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      let tz = "Asia/Karachi";
      if (userData.user) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userData.user.id)
          .maybeSingle();
        tz =
          (profileRow as Pick<ProfileRow, "timezone"> | null)?.timezone ?? tz;
      }
      const goalMeta = await fetchGoal(supabase, goalId);
      if (!goalMeta) return null;
      const items = await fetchGoalItems(supabase, goalId);
      const tasks = await fetchTasksForGoals(supabase);
      const clock = ownerClock({ timezone: tz }, new Date());
      const detail = selectGoalDetail(
        {
          id: goalMeta.id,
          title: goalMeta.title,
          notes: goalMeta.notes,
          deadlineDate: goalMeta.deadlineDate,
          archivedAt: goalMeta.archivedAt,
        },
        items,
        tasks,
        { localDate: clock.localDate },
      );
      const rawItems = await supabase
        .from("goal_items")
        .select("*")
        .eq("goal_id", goalId);
      const rawTasks = await supabase
        .from("tasks")
        .select("*")
        .not("goal_item_id", "is", null);
      return {
        goal: goalMeta,
        detail,
        rawItems: (rawItems.data ?? []) as DbGoalItem[],
        rawTasks: (rawTasks.data ?? []) as TaskRow[],
      };
    },
    enabled: !!goalId,
  });

  const preview = previewBulkPaste(paste);

  async function onBulkInsert() {
    if (preview.length === 0) return;
    setStatus(null);
    const supabase = createClient();
    const result = await bulkInsertGoalItems(supabase, goalId, preview);
    if (result.ok) {
      setPaste("");
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  async function onStatus(item: DbGoalItem, next: GoalItemStatus) {
    const supabase = createClient();
    const result = await updateGoalItemStatus(supabase, item, next);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  async function onCreateTask(item: DbGoalItem) {
  if (!window.confirm(`Create To Do task "${item.title}"?`)) return;
    const supabase = createClient();
    const result = await createTaskFromItem(supabase, item);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
    } else {
      setStatus(result.error);
    }
  }

  async function onLinkTask(item: DbGoalItem, taskId: string) {
    const task = data?.rawTasks.find((t) => t.id === taskId);
    if (!task) return;
    const supabase = createClient();
    const result = await linkTaskToItem(supabase, task, item.id);
    if (result.ok) {
      setLinkItemId(null);
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
    } else {
      setStatus(result.error);
    }
  }

  function openGoalEdit() {
    if (!data?.goal) return;
    setGoalEditDraft({
      title: data.goal.title,
      notes: data.goal.notes ?? "",
      deadlineDate: data.goal.deadlineDate ?? "",
    });
    setGoalEditError(null);
    setGoalEditOpen(true);
  }

  async function saveGoalEdit() {
    if (!data?.goal) return;
    setGoalEditSaving(true);
    setGoalEditError(null);
    const supabase = createClient();
    const result = await updateGoal(
      supabase,
      { id: data.goal.id, version: data.goal.version },
      {
        title: goalEditDraft.title,
        notes: goalEditDraft.notes,
        deadlineDate: goalEditDraft.deadlineDate || null,
      },
    );
    setGoalEditSaving(false);
    if (result.ok) {
      setGoalEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
      return;
    }
    setGoalEditError(result.error);
  }

  async function toggleArchive() {
    if (!data?.goal) return;
    const archiving = data.goal.archivedAt == null;
    const label = archiving ? "Archive" : "Restore to active list";
    if (!window.confirm(`${label} this goal?`)) return;
    setStatus(null);
    const supabase = createClient();
    const result = await setGoalArchived(
      supabase,
      { id: data.goal.id, version: data.goal.version },
      archiving,
    );
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  async function onDeleteGoal() {
    if (!window.confirm("Delete this goal and all sub-goals? This cannot be undone.")) {
      return;
    }
    setStatus(null);
    const supabase = createClient();
    const result = await deleteGoal(supabase, goalId);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
      router.push("/goals");
    } else {
      setStatus(result.error);
    }
  }

  async function onAddItem(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const supabase = createClient();
    const result = await createGoalItem(supabase, goalId, newItemTitle);
    if (result.ok) {
      setNewItemTitle("");
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  function openItemEdit(item: DbGoalItem) {
    setItemEdit({ id: item.id, title: item.title });
    setItemEditError(null);
  }

  async function saveItemEdit() {
    if (!itemEdit) return;
    const raw = data?.rawItems.find((r) => r.id === itemEdit.id);
    if (!raw) return;
    setItemEditSaving(true);
    setItemEditError(null);
    const supabase = createClient();
    const result = await updateGoalItemTitle(supabase, raw, itemEdit.title);
    setItemEditSaving(false);
    if (result.ok) {
      setItemEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
      return;
    }
    setItemEditError(result.error);
  }

  async function onDeleteItem(item: DbGoalItem) {
    if (
      !window.confirm(
        `Delete sub-goal "${item.title}"? Linked tasks stay but lose this link.`,
      )
    ) {
      return;
    }
    setStatus(null);
    const supabase = createClient();
    const result = await deleteGoalItem(supabase, item.id);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
      await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
    } else {
      setStatus(result.error);
    }
  }

  if (isLoading) {
    return <LoadingPulse label="Loading goal" />;
  }

  if (error || !data) {
    return (
      <>
        <p className="text-destructive" role="alert">
          Could not load goal.
        </p>
        <Button type="button" onClick={() => void refetch()}>
          Retry
        </Button>
      </>
    );
  }

  const { detail } = data;
  const progressText = formatGoalProgress(detail.progress);
  const progressStatus = selectGoalProgressStatus(detail.progress);
  const itemSummary = summarizeItemStatuses(detail.items);

  return (
    <section aria-labelledby="goal-title">
      <p className="mb-4">
        <Link
          href="/goals"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Goals
        </Link>
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <GoalProgressStatusBadge status={progressStatus} />
        {detail.archived ? <GoalArchivedBadge /> : null}
        {detail.deadline ? (
          <span className="text-sm text-muted-foreground">
            Due {detail.deadline}
          </span>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {itemSummary}
        </span>
      </div>
      <PageHeader
        title={detail.title}
        description={progressText}
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={openGoalEdit}>
              Edit goal
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void toggleArchive()}>
              {detail.archived ? "Restore" : "Archive"}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void onDeleteGoal()}>
              Delete
            </Button>
            <Button
              type="button"
              variant="premium"
              size="sm"
              onClick={() =>
                ai.openWithSeed({
                  goalMode: "current",
                  goalIds: [goalId],
                })
              }
            >
              Open AI
            </Button>
          </div>
        }
      />
      <p className="sr-only" data-testid="goal-progress">
        {progressText}
      </p>
      {detail.notes ? (
        <SurfaceCard className="mt-2 text-sm">{detail.notes}</SurfaceCard>
      ) : null}
      <p className="mt-4 text-xs text-muted-foreground">
        Completing a linked task does not change this item.
      </p>

      <PageSection title="Sub-goals" className="mt-8">
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => void onAddItem(e)}>
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="new-sub-goal">Add sub-goal</Label>
          <Input
            id="new-sub-goal"
            className="mt-1"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!newItemTitle.trim()}>
          Add
        </Button>
      </form>
      <ol className="space-y-3">
        {detail.items.map((item) => {
          const raw = data.rawItems.find((r) => r.id === item.id);
          const linked = detail.linkedTasks.filter(
            (t) => t.goalItemId === item.id,
          );
          if (!raw) return null;
          return (
            <li key={item.id} data-item-id={item.id}>
              <SurfaceCard>
              <GoalItemRow
                item={item}
                linked={linked}
                raw={raw}
                linkItemId={linkItemId}
                setLinkItemId={setLinkItemId}
                tasks={data.rawTasks.filter((t) => !t.goal_item_id)}
                onStatus={onStatus}
                onCreateTask={onCreateTask}
                onLinkTask={onLinkTask}
                onEdit={() => openItemEdit(raw)}
                onDelete={() => void onDeleteItem(raw)}
              />
              </SurfaceCard>
            </li>
          );
        })}
      </ol>
      </PageSection>

      <PageSection title="Bulk paste" className="mt-8">
        <Label htmlFor="bulk-paste">Paste items</Label>
        <textarea
          id="bulk-paste"
          className="db-input mt-2 min-h-[8rem] resize-y"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        {preview.length > 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="bulk-preview">
            Preview: {preview.length} item{preview.length === 1 ? "" : "s"}
          </p>
        ) : null}
        <Button
          type="button"
          disabled={preview.length === 0}
          onClick={() => void onBulkInsert()}
        >
          Insert {preview.length || 0} items
        </Button>
      </PageSection>
      {status ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {status}
        </p>
      ) : null}
      <GoalEditDialog
        open={goalEditOpen}
        title={goalEditDraft.title}
        notes={goalEditDraft.notes}
        deadlineDate={goalEditDraft.deadlineDate}
        saving={goalEditSaving}
        error={goalEditError}
        onTitleChange={(v) => setGoalEditDraft((d) => ({ ...d, title: v }))}
        onNotesChange={(v) => setGoalEditDraft((d) => ({ ...d, notes: v }))}
        onDeadlineChange={(v) => setGoalEditDraft((d) => ({ ...d, deadlineDate: v }))}
        onClose={() => {
          if (!goalEditSaving) setGoalEditOpen(false);
        }}
        onSave={() => void saveGoalEdit()}
      />
      <GoalItemEditDialog
        open={itemEdit != null}
        title={itemEdit?.title ?? ""}
        saving={itemEditSaving}
        error={itemEditError}
        onTitleChange={(v) => setItemEdit((d) => (d ? { ...d, title: v } : d))}
        onClose={() => {
          if (!itemEditSaving) setItemEdit(null);
        }}
        onSave={() => void saveItemEdit()}
      />
    </section>
  );
}

function GoalItemRow({
  item,
  linked,
  raw,
  linkItemId,
  setLinkItemId,
  tasks,
  onStatus,
  onCreateTask,
  onLinkTask,
  onEdit,
  onDelete,
}: {
  item: ReturnType<typeof selectGoalDetail>["items"][number];
  linked: ReturnType<typeof selectGoalDetail>["linkedTasks"];
  raw?: DbGoalItem;
  linkItemId: string | null;
  setLinkItemId: (id: string | null) => void;
  tasks: TaskRow[];
  onStatus: (item: DbGoalItem, status: GoalItemStatus) => void;
  onCreateTask: (item: DbGoalItem) => void;
  onLinkTask: (item: DbGoalItem, taskId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!raw) return null;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.title}</p>
            <GoalItemStatusBadge status={item.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Status: {GOAL_ITEM_STATUS_LABEL[item.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Set status">
          {(["not_started", "in_progress", "practicing", "done"] as const).map(
            (s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={item.status === s ? "default" : "outline"}
                aria-pressed={item.status === s}
                onClick={() => onStatus(raw, s)}
              >
                {GOAL_ITEM_STATUS_LABEL[s]}
              </Button>
            ),
          )}
        </div>
      </div>
      {linked.length > 0 ? (
        <ul className="mt-2 text-xs text-muted-foreground">
          {linked.map((t) => (
            <li key={t.id}>
              Linked task: {t.title} ({t.status})
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Rename
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onCreateTask(raw)}>
          Create task
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setLinkItemId(item.id)}
        >
          Link task
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
      {linkItemId === item.id ? (
        <div className="mt-2 space-y-1">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No unlinked tasks.</p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => onLinkTask(raw, t.id)}
              >
                {t.title}
              </button>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}
