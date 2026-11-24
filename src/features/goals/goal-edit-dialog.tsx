"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SurfaceCard } from "@/components/ui/page-chrome";

export function GoalEditDialog({
  open,
  title,
  notes,
  deadlineDate,
  saving,
  error,
  onTitleChange,
  onNotesChange,
  onDeadlineChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  notes: string;
  deadlineDate: string;
  saving: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onDeadlineChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <SurfaceCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-edit-title"
        className="w-full max-w-md shadow-premium"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="goal-edit-title" className="font-display text-lg font-semibold tracking-tight">
          Edit goal
        </h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-edit-name">Name</Label>
            <Input
              id="goal-edit-name"
              ref={titleRef}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-edit-notes">Notes</Label>
            <Textarea
              id="goal-edit-notes"
              value={notes}
              placeholder="Optional notes…"
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-edit-deadline">Deadline</Label>
            <Input
              id="goal-edit-deadline"
              type="date"
              value={deadlineDate}
              onChange={(e) => onDeadlineChange(e.target.value)}
            />
            {deadlineDate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => onDeadlineChange("")}
              >
                Clear deadline
              </Button>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SurfaceCard>
    </div>
  );
}

export function GoalItemEditDialog({
  open,
  title,
  saving,
  error,
  onTitleChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  saving: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <SurfaceCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-item-edit-title"
        className="w-full max-w-md shadow-premium"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="goal-item-edit-title" className="font-display text-lg font-semibold tracking-tight">
          Edit sub-goal
        </h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-item-edit-name">Name</Label>
            <Input
              id="goal-item-edit-name"
              ref={titleRef}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SurfaceCard>
    </div>
  );
}