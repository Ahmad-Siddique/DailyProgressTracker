"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SurfaceCard } from "@/components/ui/page-chrome";

export function TaskEditDialog({
  open,
  title,
  description,
  saving,
  error,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onSave,
  onDelete,
  deleting,
}: {
  open: boolean;
  title: string;
  description: string;
  saving: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  deleting?: boolean;
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
        aria-labelledby="task-edit-title"
        className="w-full max-w-md shadow-premium"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="task-edit-title" className="font-display text-lg font-semibold tracking-tight">
          Edit task
        </h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-edit-name">Name</Label>
            <Input
              id="task-edit-name"
              ref={titleRef}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-edit-description">Description</Label>
            <Textarea
              id="task-edit-description"
              value={description}
              placeholder="Optional details…"
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={saving || deleting}
            >
              {deleting ? "Deleting…" : "Delete task"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={saving || deleting || !title.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}