"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { useOffline } from "@/components/pwa/offline-provider";
import { listOutboxJobs, listRecords, putRecord } from "@/lib/pwa/idb";
import { recordKey } from "@/lib/pwa/outbox-types";
import type { TaskRow } from "@/features/board/selectors";
import { onlineMoveTask, tryNetworkFirst } from "@/lib/pwa/online-write";
import {
  deleteTask,
  fetchTasks,
  mapTaskRow,
  moveTask,
  updateTaskDetails,
} from "@/features/board/api";
import { TaskEditDialog } from "@/features/board/task-edit-dialog";
import {
  BOARD_COLUMNS,
  STATUS_LABEL,
  type TaskStatus,
} from "@/features/board/selectors";
import type { TaskRow as DbTask } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  LoadingPulse,
  PageHeader,
} from "@/components/ui/page-chrome";
import { cn } from "@/lib/utils";
import { snapDragToCursor } from "@/features/board/dnd-modifiers";
import {
  positionForColumnDrop,
  positionForReorder,
} from "@/features/board/position";

async function loadTasks() {
  const supabase = createClient();
  return fetchTasks(supabase);
}

function sortByPosition(rows: TaskRow[]): TaskRow[] {
  return [...rows].sort((a, b) => a.position.localeCompare(b.position));
}

function isMoveMenuTarget(target: EventTarget | null) {
  return (target as HTMLElement | null)?.closest(
    "details, summary, [role='menuitem']",
  );
}

function TaskCard({
  task,
  onMove,
  onEdit,
  pending,
  isEditing,
  blockEditUntil,
}: {
  task: ReturnType<typeof mapTaskRow>;
  onMove: (status: TaskStatus) => void;
  onEdit: () => void;
  pending: boolean;
  isEditing: boolean;
  blockEditUntil: React.RefObject<number>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    animateLayoutChanges: () => false,
    disabled: isEditing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition ?? undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "db-surface relative z-0 p-3",
        "has-[details[open]]:z-50",
        isDragging && "opacity-40",
        pending && "opacity-90",
      )}
      data-task-id={task.id}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="mt-0.5 shrink-0 touch-none cursor-grab rounded px-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag ${task.title}`}
          title="Drag to move"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer rounded-md border-0 bg-transparent p-0 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Click to edit"
          onClick={(e) => {
            if (isDragging) return;
            if (performance.now() < blockEditUntil.current) return;
            e.stopPropagation();
            onEdit();
          }}
        >
          <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
          {task.notes ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {task.notes}
            </p>
          ) : null}
          {task.localDate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {task.localDate}
              {task.startTime ? ` · ${task.startTime.slice(0, 5)}` : ""}
            </p>
          ) : null}
          {pending ? (
            <p className="mt-1 text-xs text-muted-foreground">Waiting to save</p>
          ) : null}
        </button>
        <details
          className="relative z-50 shrink-0 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <summary
            className="cursor-pointer list-none rounded-md border border-border px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Move ${task.title}`}
          >
            Move
          </summary>
          <ul
            role="menu"
            className="absolute right-0 z-[60] mt-1 min-w-[9rem] rounded-md border border-border bg-background p-1 shadow-lg"
          >
            {BOARD_COLUMNS.filter((c) => c.id !== task.status).map((col) => (
              <li key={col.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(col.id);
                  }}
                >
                  {col.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <p className="sr-only">Status: {STATUS_LABEL[task.status]}</p>
    </article>
  );
}

function BoardColumn({
  col,
  items,
  pendingIds,
  onMove,
  onEdit,
  editingTaskId,
  blockEditUntil,
}: {
  col: (typeof BOARD_COLUMNS)[number];
  items: ReturnType<typeof mapTaskRow>[];
  pendingIds: Set<string>;
  onMove: (taskId: string, status: TaskStatus) => void;
  onEdit: (taskId: string) => void;
  editingTaskId: string | null;
  blockEditUntil: React.RefObject<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${col.id}`}
      className={cn(
        "db-surface flex min-h-[12rem] flex-col overflow-visible bg-muted/20 p-3",
        isOver && "ring-2 ring-ring",
      )}
    >
      <h2
        id={`col-${col.id}`}
        className="mb-3 text-sm font-semibold"
      >
        {col.label} ({items.length})
      </h2>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2 overflow-visible">
          {items.length === 0 ? (
            <li>
              <EmptyState message="Empty" className="py-6 text-xs" />
            </li>
          ) : (
            items.map((task) => (
                <li key={task.id} className="relative overflow-visible">
                  <TaskCard
                    task={task}
                    pending={pendingIds.has(task.id)}
                    isEditing={editingTaskId === task.id}
                    blockEditUntil={blockEditUntil}
                    onMove={(status) => onMove(task.id, status)}
                    onEdit={() => onEdit(task.id)}
                  />
                </li>
              ))
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

export function BoardView() {
  const queryClient = useQueryClient();
  const { userId, online } = useOffline();
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [cachedTasks, setCachedTasks] = React.useState<TaskRow[]>([]);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [dragOverlayWidth, setDragOverlayWidth] = React.useState<number | null>(
    null,
  );
  const [viewTasks, setViewTasks] = React.useState<TaskRow[]>([]);
  const [editDraft, setEditDraft] = React.useState<{
    taskId: string;
    title: string;
    description: string;
  } | null>(null);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editDeleting, setEditDeleting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const dbById = React.useRef<Map<string, DbTask>>(new Map());
  const [dbReady, setDbReady] = React.useState(0);

  const syncDbMap = React.useCallback((map: Map<string, DbTask>) => {
    dbById.current = map;
    setDbReady((n) => n + 1);
  }, []);

  const upsertDb = React.useCallback((taskId: string, row: DbTask) => {
    dbById.current.set(taskId, row);
    setDbReady((n) => n + 1);
  }, []);
  const awaitingOutboxMove = React.useRef<Set<string>>(new Set());
  const persistInFlight = React.useRef(0);
  const dragSession = React.useRef<{
    taskId: string;
    snapshot: TaskRow[];
    prevDb: DbTask;
  } | null>(null);
  const blockEditUntil = React.useRef(0);

  const syncPendingMovesFromOutbox = React.useCallback(async () => {
    if (!userId || awaitingOutboxMove.current.size === 0) return;
    const jobs = await listOutboxJobs(userId);
    const openMoveTasks = new Set(
      jobs
        .filter((j) => j.op === "move_task" && j.status !== "failed")
        .map((j) => (j.payload as { task: { id: string } }).task.id),
    );
    setPendingIds((prev) => {
      const next = new Set(prev);
      for (const taskId of awaitingOutboxMove.current) {
        if (!openMoveTasks.has(taskId)) {
          next.delete(taskId);
          awaitingOutboxMove.current.delete(taskId);
        }
      }
      return next;
    });
  }, [userId]);

  React.useEffect(() => {
    const onOutbox = () => {
      void syncPendingMovesFromOutbox();
    };
    window.addEventListener("dayboard:outbox-changed", onOutbox);
    return () => window.removeEventListener("dayboard:outbox-changed", onOutbox);
  }, [syncPendingMovesFromOutbox]);

  React.useEffect(() => {
    if (!userId || online) {
      setCachedTasks([]);
      return;
    }
    void listRecords(userId, "tasks").then((recs) => {
      const rows: TaskRow[] = [];
      for (const r of recs) {
        const db = r.row as unknown as DbTask;
        rows.push(mapTaskRow(db));
      }
      const map = new Map<string, DbTask>();
      for (const r of recs) {
        map.set(r.id, r.row as unknown as DbTask);
      }
      syncDbMap(map);
      setCachedTasks(rows);
      setPendingIds(new Set(recs.filter((r) => r.row.pending).map((r) => r.id)));
    });
  }, [userId, online, syncDbMap]);

  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks", online, userId],
    enabled: online,
    queryFn: async () => {
      const supabase = createClient();
      await supabase.rpc("apply_recurrence", {
        p_owner_timezone: "Asia/Karachi",
      });
      const rows = await loadTasks();
      const { data } = await supabase.from("tasks").select("*");
      const map = new Map<string, DbTask>();
      for (const row of (data ?? []) as DbTask[]) map.set(row.id, row);
      syncDbMap(map);
      if (userId) {
        const at = new Date().toISOString();
        await Promise.all(
          ((data ?? []) as DbTask[]).map((row) =>
            putRecord(userId, {
              recordKey: recordKey("tasks", row.id),
              table: "tasks",
              id: row.id,
              row: row as unknown as Record<string, unknown>,
              storedAt: at,
            }),
          ),
        );
      }
      return rows;
    },
  });

  React.useEffect(() => {
    if (online) {
      if (tasks && persistInFlight.current === 0) {
        setViewTasks(tasks);
      }
      return;
    }
    if (persistInFlight.current === 0) {
      setViewTasks(cachedTasks);
    }
  }, [tasks, cachedTasks, online]);

  React.useEffect(() => {
    if (!online || !tasks?.length || dbById.current.size > 0) return;
    const supabase = createClient();
    void supabase
      .from("tasks")
      .select("*")
      .then(({ data }) => {
        const map = new Map<string, DbTask>();
        for (const row of (data ?? []) as DbTask[]) map.set(row.id, row);
        if (map.size > 0) syncDbMap(map);
      });
  }, [online, tasks, syncDbMap]);

  const displayTasks = viewTasks;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tasksQueryKey = React.useMemo(
    () => ["tasks", online, userId] as const,
    [online, userId],
  );

  const displayTasksRef = React.useRef<TaskRow[]>([]);
  displayTasksRef.current = displayTasks ?? [];

  const applyViewTasks = React.useCallback(
    (updater: (rows: TaskRow[]) => TaskRow[]) => {
      const next = updater(displayTasksRef.current);
      setViewTasks(next);
      if (online) {
        queryClient.setQueryData<TaskRow[]>(tasksQueryKey, next);
      } else {
        setCachedTasks(next);
      }
    },
    [online, queryClient, tasksQueryKey],
  );

  const patchDisplayedTasks = React.useCallback(
    (updater: (rows: TaskRow[]) => TaskRow[]) => {
      flushSync(() => {
        applyViewTasks(updater);
      });
    },
    [applyViewTasks],
  );

  type MoveContext = {
    taskId: string;
    toStatus: TaskStatus;
    position: string;
    snapshot: TaskRow[];
    prevDb: DbTask;
  };

  const beginOptimisticMove = React.useCallback(
    (taskId: string, toStatus: TaskStatus): MoveContext | null => {
      const rows = displayTasksRef.current;
      const task = rows.find((t) => t.id === taskId);
      if (!task || task.status === toStatus) return null;

      const db = dbById.current.get(taskId);
      if (!db) return null;

      const columnTasks = rows.filter((t) => t.status === toStatus);
      const position = positionForColumnDrop(columnTasks, taskId);
      const snapshot = rows.map((t) => ({ ...t }));
      const prevDb = { ...db };

      patchDisplayedTasks((list) =>
        list.map((t) =>
          t.id === taskId ? { ...t, status: toStatus, position } : t,
        ),
      );
        upsertDb(taskId, { ...db, status: toStatus, position });
      setStatusMsg(`Moved to ${STATUS_LABEL[toStatus]}.`);

      return { taskId, toStatus, position, snapshot, prevDb };
    },
    [patchDisplayedTasks],
  );

  async function persistMove(ctx: MoveContext) {
    const { taskId, toStatus, position, snapshot, prevDb } = ctx;
    persistInFlight.current += 1;

    const rollback = () => {
      patchDisplayedTasks(() => snapshot);
      upsertDb(taskId, prevDb);
      setStatusMsg("Move failed — reverted.");
    };

    const finish = () => {
      persistInFlight.current = Math.max(0, persistInFlight.current - 1);
    };

    const supabase = createClient();
    const attempt = await tryNetworkFirst(() =>
      moveTask(supabase, prevDb, toStatus, position),
    );

    if (!attempt.ok) {
      if (userId) {
        await onlineMoveTask(userId, {
          idempotencyKey: `move:${prevDb.id}:${prevDb.version}:${toStatus}`,
          payload: { task: prevDb, toStatus, position },
        });
        awaitingOutboxMove.current.add(taskId);
        setPendingIds((s) => new Set(s).add(taskId));
        setStatusMsg(`Moved to ${STATUS_LABEL[toStatus]} (waiting to save).`);
      } else {
        rollback();
      }
      finish();
      return;
    }

    const result = attempt.value;
    if (result.ok) {
      awaitingOutboxMove.current.delete(taskId);
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
      upsertDb(taskId, result.task);
    } else if ("conflict" in result && result.conflict) {
      awaitingOutboxMove.current.delete(taskId);
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
      if (result.task) {
        upsertDb(taskId, result.task);
        patchDisplayedTasks((rows) =>
          rows.map((t) =>
            t.id === taskId ? mapTaskRow(result.task!) : t,
          ),
        );
      } else {
        rollback();
      }
      setStatusMsg("Move conflict — updated from server.");
    } else if (!result.ok) {
      awaitingOutboxMove.current.delete(taskId);
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
      rollback();
      setStatusMsg("error" in result ? result.error : "Move failed.");
    }
    finish();
  }

  function handleMove(taskId: string, toStatus: TaskStatus) {
    const ctx = beginOptimisticMove(taskId, toStatus);
    if (!ctx) return;
    void persistMove(ctx);
  }

  function openTaskEdit(taskId: string) {
    const task = displayTasksRef.current.find((t) => t.id === taskId);
    if (!task) return;
    setEditError(null);
    setEditDraft({
      taskId,
      title: task.title,
      description: task.notes ?? "",
    });
  }

  function closeTaskEdit() {
    if (editSaving) return;
    setEditDraft(null);
    setEditError(null);
  }

  async function saveTaskEdit() {
    if (!editDraft) return;
    const { taskId, title, description } = editDraft;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const db = dbById.current.get(taskId);
    if (!db) return;

    const notes = description.trim() || null;
    const snapshot = displayTasksRef.current.map((t) => ({ ...t }));
    const prevDb = { ...db };

    setEditSaving(true);
    setEditError(null);

    patchDisplayedTasks((rows) =>
      rows.map((t) =>
        t.id === taskId ? { ...t, title: trimmedTitle, notes } : t,
      ),
    );
    upsertDb(taskId, { ...db, title: trimmedTitle, notes });

    const supabase = createClient();
    const result = await updateTaskDetails(supabase, prevDb, {
      title: trimmedTitle,
      notes,
    });

    setEditSaving(false);

    if (result.ok) {
      upsertDb(taskId, result.task);
      patchDisplayedTasks((rows) =>
        rows.map((t) => (t.id === taskId ? mapTaskRow(result.task) : t)),
      );
      setEditDraft(null);
      setStatusMsg("Task updated.");
      return;
    }

    patchDisplayedTasks(() => snapshot);
    upsertDb(taskId, prevDb);
    setEditError(result.error);
  }

  async function deleteTaskEdit() {
    if (!editDraft) return;
    const { taskId } = editDraft;
    if (
      !window.confirm(
        "Delete this task permanently? Linked goal items keep their status.",
      )
    ) {
      return;
    }

    setEditDeleting(true);
    setEditError(null);
    const supabase = createClient();
    const result = await deleteTask(supabase, taskId);
    setEditDeleting(false);

    if (!result.ok) {
      setEditError(result.error);
      return;
    }

    dbById.current.delete(taskId);
    patchDisplayedTasks((rows) => rows.filter((t) => t.id !== taskId));
    setEditDraft(null);
    setStatusMsg("Task deleted.");
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  function resolveDropColumn(overId: string): TaskStatus | null {
    if (BOARD_COLUMNS.some((c) => c.id === overId)) {
      return overId as TaskStatus;
    }
    const hit = displayTasks?.find((t) => t.id === overId);
    return hit?.status ?? null;
  }

  function previewColumnMove(taskId: string, toStatus: TaskStatus) {
    const rows = displayTasksRef.current;
    const task = rows.find((t) => t.id === taskId);
    if (!task || task.status === toStatus) return;

    const db = dbById.current.get(taskId);
    if (!db) return;

    const columnTasks = rows.filter((t) => t.status === toStatus);
    const position = positionForColumnDrop(columnTasks, taskId);

    patchDisplayedTasks((list) =>
      list.map((t) =>
        t.id === taskId ? { ...t, status: toStatus, position } : t,
      ),
    );
    upsertDb(taskId, { ...db, status: toStatus, position });
  }

  function onDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    const cardWidth = event.active.rect.current.initial?.width;
    setDragOverlayWidth(cardWidth ?? null);
    const db = dbById.current.get(taskId);
    if (db) {
      dragSession.current = {
        taskId,
        snapshot: displayTasksRef.current.map((t) => ({ ...t })),
        prevDb: { ...db },
      };
    }
    setActiveDragId(taskId);
  }

  function onDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over || !dragSession.current) return;
    const { taskId } = dragSession.current;
    const toStatus = resolveDropColumn(String(over.id));
    if (!toStatus) return;
    previewColumnMove(taskId, toStatus);
  }

  function onDragEnd(event: DragEndEvent) {
    blockEditUntil.current = performance.now() + 320;
    const session = dragSession.current;
    dragSession.current = null;

    const { active, over } = event;
    if (!over || !session) {
      setActiveDragId(null);
      setDragOverlayWidth(null);
      return;
    }

    const taskId = String(active.id);
    const toStatus = resolveDropColumn(String(over.id));
    const task = displayTasksRef.current.find((t) => t.id === taskId);
    const fromStatus = session.snapshot.find((t) => t.id === taskId)?.status;

    if (!toStatus || !task) {
      setActiveDragId(null);
      setDragOverlayWidth(null);
      return;
    }

    if (fromStatus === toStatus) {
      const overId = String(over.id);
      if (BOARD_COLUMNS.some((c) => c.id === overId)) {
        patchDisplayedTasks(() => session.snapshot);
        setActiveDragId(null);
        setDragOverlayWidth(null);
        return;
      }
      const columnTasks = session.snapshot.filter((t) => t.status === toStatus);
      const newPosition = positionForReorder(columnTasks, taskId, overId);
      if (!newPosition || newPosition === task.position) {
        patchDisplayedTasks(() => session.snapshot);
        setActiveDragId(null);
        setDragOverlayWidth(null);
        return;
      }
      patchDisplayedTasks((rows) =>
        rows.map((t) =>
          t.id === taskId ? { ...t, position: newPosition } : t,
        ),
      );
      upsertDb(taskId, { ...session.prevDb, position: newPosition });
      setStatusMsg("Reordered.");
      setActiveDragId(null);
      setDragOverlayWidth(null);
      void persistMove({
        taskId,
        toStatus,
        position: newPosition,
        snapshot: session.snapshot,
        prevDb: session.prevDb,
      });
      return;
    }

    if (task.status !== fromStatus) {
      patchDisplayedTasks(() => session.snapshot);
      upsertDb(taskId, session.prevDb);
    }

    previewColumnMove(taskId, toStatus);
    setStatusMsg(`Moved to ${STATUS_LABEL[toStatus]}.`);
    setActiveDragId(null);
    setDragOverlayWidth(null);

    const columnTasks = session.snapshot.filter((t) => t.status === toStatus);
    const position =
      displayTasksRef.current.find((t) => t.id === taskId)?.position ??
      positionForColumnDrop(columnTasks, taskId);

    void persistMove({
      taskId,
      toStatus,
      position,
      snapshot: session.snapshot,
      prevDb: session.prevDb,
    });
  }

  function onDragCancel() {
    const session = dragSession.current;
    dragSession.current = null;
    if (session) {
      patchDisplayedTasks(() => session.snapshot);
      upsertDb(session.taskId, session.prevDb);
    }
    setActiveDragId(null);
    setDragOverlayWidth(null);
  }

  const activeDragTask =
    activeDragId != null
      ? displayTasks?.find((t) => t.id === activeDragId)
      : undefined;

  if (online && isLoading) {
    return (
      <section aria-labelledby="board-heading">
        <PageHeader title="Board" />
        <LoadingPulse label="Loading board" />
      </section>
    );
  }

  if (online && error) {
    return (
      <section aria-labelledby="board-heading">
        <PageHeader title="Board" />
        <p className="text-destructive" role="alert">
          Could not load tasks.
        </p>
        <Button type="button" className="mt-2" onClick={() => void refetch()}>
          Retry
        </Button>
      </section>
    );
  }

  const byColumn = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [
      c.id,
      sortByPosition(
        (displayTasks ?? []).filter((t) => t.status === c.id),
      ),
    ]),
  ) as Record<TaskStatus, ReturnType<typeof mapTaskRow>[]>;

  void dbReady;

  return (
    <section aria-labelledby="board-heading">
      <PageHeader title="Board" />
      {statusMsg ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {statusMsg}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        modifiers={[snapDragToCursor]}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="db-stagger mt-6 grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              col={col}
              items={byColumn[col.id] ?? []}
              pendingIds={pendingIds}
              onMove={handleMove}
              onEdit={openTaskEdit}
              editingTaskId={editDraft?.taskId ?? null}
              blockEditUntil={blockEditUntil}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragTask ? (
            <article
              className="db-surface cursor-grabbing p-3 shadow-premium"
              style={dragOverlayWidth ? { width: dragOverlayWidth } : undefined}
            >
              <h3 className="text-sm font-medium leading-snug">
                {activeDragTask.title}
              </h3>
              {activeDragTask.notes ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {activeDragTask.notes}
                </p>
              ) : null}
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
      <TaskEditDialog
        open={editDraft != null}
        title={editDraft?.title ?? ""}
        description={editDraft?.description ?? ""}
        saving={editSaving}
        error={editError}
        onTitleChange={(value) =>
          setEditDraft((d) => (d ? { ...d, title: value } : d))
        }
        onDescriptionChange={(value) =>
          setEditDraft((d) => (d ? { ...d, description: value } : d))
        }
        onClose={closeTaskEdit}
        onSave={() => void saveTaskEdit()}
        onDelete={() => void deleteTaskEdit()}
        deleting={editDeleting}
      />
    </section>
  );
}