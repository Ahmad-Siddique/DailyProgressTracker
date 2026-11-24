"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createTask } from "@/features/board/api";
import { setQuickAddDirty } from "@/lib/pwa/idb";
import { onlineTaskCreate } from "@/lib/pwa/online-write";
import { useOffline } from "@/components/pwa/offline-provider";
import { createGoalItem, fetchGoals } from "@/features/goals/api";
import { createExpense, loadExpenseDefaults } from "@/features/money/api";
import { createContribution } from "@/features/savings/api";
import { taskTimePreviewSentence, parseTaskTime } from "@/lib/task-parse";
import { ownerClock } from "@/lib/clock";
import type { ProfileRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type QuickAddKind = "task" | "goal_item" | "expense" | "contribution";

export function QuickAdd({
  defaultGoalId,
}: {
  defaultGoalId?: string;
}) {
  const queryClient = useQueryClient();
  const { userId } = useOffline();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<QuickAddKind>("task");
  const [title, setTitle] = React.useState("");
  const [goalId, setGoalId] = React.useState(defaultGoalId ?? "");
  const [goals, setGoals] = React.useState<{ id: string; title: string }[]>([]);
  const [previewReady, setPreviewReady] = React.useState(false);
  const [timePreview, setTimePreview] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [fundId, setFundId] = React.useState("");
  const [accounts, setAccounts] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [categories, setCategories] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [funds, setFunds] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    const dirty =
      open &&
      ((kind === "task" && title.trim() !== "") ||
        (kind === "goal_item" && title.trim() !== "") ||
        (kind === "expense" && amount.trim() !== "") ||
        (kind === "contribution" && amount.trim() !== ""));
    setQuickAddDirty(dirty);
    return () => setQuickAddDirty(false);
  }, [open, kind, title, amount]);

  React.useEffect(() => {
    if (defaultGoalId) setGoalId(defaultGoalId);
    else {
      const match = pathname?.match(/^\/goals\/([^/]+)/);
      if (match?.[1]) setGoalId(match[1]);
    }
  }, [defaultGoalId, pathname]);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const supabase = createClient();
      const list = await fetchGoals(supabase);
      setGoals(list.map((g) => ({ id: g.id, title: g.title })));
      if (!goalId && list[0]) setGoalId(list[0].id);
      const defaults = loadExpenseDefaults();
      const [{ data: accts }, { data: cats }, { data: fundRows }] =
        await Promise.all([
          supabase.from("accounts").select("id, name").is("archived_at", null),
          supabase
            .from("categories")
            .select("id, name")
            .eq("kind", "expense")
            .is("archived_at", null),
          supabase
            .from("savings_funds")
            .select("id, name")
            .is("archived_at", null),
        ]);
      setAccounts((accts ?? []) as { id: string; name: string }[]);
      setCategories((cats ?? []) as { id: string; name: string }[]);
      setFunds((fundRows ?? []) as { id: string; name: string }[]);
      setAccountId(defaults.accountId ?? accts?.[0]?.id ?? "");
      setCategoryId(defaults.categoryId ?? cats?.[0]?.id ?? "");
      setFundId(fundRows?.[0]?.id ?? "");
    })();
  }, [open, goalId]);

  React.useEffect(() => {
    if (kind !== "task" || title.trim() === "") {
      setPreviewReady(false);
      setTimePreview("");
      return;
    }
    void (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      let tz = "Asia/Karachi";
      if (userData.user) {
        const { data } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userData.user.id)
          .maybeSingle();
        tz = (data as Pick<ProfileRow, "timezone"> | null)?.timezone ?? tz;
      }
      const today = ownerClock({ timezone: tz }, new Date()).localDate;
      const sentence = taskTimePreviewSentence(title, today);
      setTimePreview(sentence);
      setPreviewReady(true);
    })();
  }, [kind, title]);

  const taskSaveDisabled =
    kind === "task" && (title.trim() === "" || !previewReady || saving);
  const goalSaveDisabled =
    kind === "goal_item" &&
    (title.trim() === "" || !goalId || saving);
  const expenseSaveDisabled =
    kind === "expense" &&
    (amount.trim() === "" || !accountId || !categoryId || saving);
  const contributionSaveDisabled =
    kind === "contribution" &&
    (amount.trim() === "" || !fundId || saving);

  async function onSave() {
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    try {
      if (kind === "task") {
        const { data: userData } = await supabase.auth.getUser();
        let tz = "Asia/Karachi";
        if (userData.user) {
          const { data } = await supabase
            .from("profiles")
            .select("timezone")
            .eq("id", userData.user.id)
            .maybeSingle();
          tz = (data as Pick<ProfileRow, "timezone"> | null)?.timezone ?? tz;
        }
        const today = ownerClock({ timezone: tz }, new Date()).localDate;
        const parsed = parseTaskTime(title, today);
        const uid =
          userId ??
          (await supabase.auth.getUser()).data.user?.id ??
          null;
        if (!uid) {
          setStatus("Not signed in.");
          return;
        }
        const result = await onlineTaskCreate(uid, supabase, {
          title: title.trim(),
          localDate: parsed.kind === "timed" ? parsed.localDate : null,
          startTime: parsed.kind === "timed" ? parsed.startTime : null,
          endTime: parsed.kind === "timed" ? parsed.endTime : null,
          create: async () => {
            const r = await createTask(supabase, {
              title: title.trim(),
              localDate: parsed.kind === "timed" ? parsed.localDate : null,
              startTime: parsed.kind === "timed" ? parsed.startTime : null,
              endTime: parsed.kind === "timed" ? parsed.endTime : null,
            });
            if (r.ok) return { ok: true, task: r.task as unknown as Record<string, unknown> };
            return { ok: false, error: r.error };
          },
        });
        if ("queued" in result) {
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          await queryClient.invalidateQueries({ queryKey: ["today"] });
          setTitle("");
          setOpen(false);
          return;
        }
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        await queryClient.invalidateQueries({ queryKey: ["today"] });
        setTitle("");
        setOpen(false);
      } else if (kind === "expense") {
        const { data: userData } = await supabase.auth.getUser();
        let tz = "Asia/Karachi";
        if (userData.user) {
          const { data } = await supabase
            .from("profiles")
            .select("timezone")
            .eq("id", userData.user.id)
            .maybeSingle();
          tz = (data as Pick<ProfileRow, "timezone"> | null)?.timezone ?? tz;
        }
        const today = ownerClock({ timezone: tz }, new Date()).localDate;
        const parsed = parseFloat(amount.replace(/,/g, ""));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setStatus("Amount must be positive");
          return;
        }
        const minor = BigInt(Math.round(parsed * 100));
        if (!navigator.onLine) {
          const uid =
            userId ??
            (await supabase.auth.getUser()).data.user?.id ??
            null;
          if (!uid) {
            setStatus("Not signed in.");
            return;
          }
          const { onlineExpenseCreate } = await import("@/lib/pwa/online-write");
          await onlineExpenseCreate(uid, {
            idempotencyKey: `expense:${crypto.randomUUID()}`,
            payload: {
              id: crypto.randomUUID(),
              accountId,
              categoryId,
              amountMinor: minor.toString(),
              occurredOn: today,
            },
          });
          setStatus("Queued — waiting to save.");
          return;
        }
        const result = await createExpense(supabase, {
          accountId,
          categoryId,
          amountMinor: minor,
          occurredOn: today,
        });
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["money"] });
        setAmount("");
        setOpen(false);
      } else if (kind === "contribution") {
        const { data: userData } = await supabase.auth.getUser();
        let tz = "Asia/Karachi";
        if (userData.user) {
          const { data } = await supabase
            .from("profiles")
            .select("timezone")
            .eq("id", userData.user.id)
            .maybeSingle();
          tz = (data as Pick<ProfileRow, "timezone"> | null)?.timezone ?? tz;
        }
        const today = ownerClock({ timezone: tz }, new Date()).localDate;
        const parsed = parseFloat(amount.replace(/,/g, ""));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setStatus("Amount must be positive");
          return;
        }
        const minor = BigInt(Math.round(parsed * 100));
        const result = await createContribution(
          supabase,
          fundId,
          minor,
          today,
        );
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["money"] });
        setAmount("");
        setOpen(false);
      } else {
        const result = await createGoalItem(supabase, goalId, title);
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["goal-detail", goalId] });
        await queryClient.invalidateQueries({ queryKey: ["goals-progress"] });
        setTitle("");
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="premium"
        className="db-fab shadow-premium"
        aria-expanded={open}
        aria-controls="quick-add-panel"
        onClick={() => setOpen((o) => !o)}
      >
        Quick Add
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-foreground/10 backdrop-blur-[1px]"
            aria-label="Close Quick Add"
            onClick={() => setOpen(false)}
          />
          <div
            id="quick-add-panel"
            role="dialog"
            aria-label="Quick Add"
            className={cn(
              "db-surface fixed inset-x-4 bottom-28 z-40 max-w-md animate-scale-in p-4 shadow-premium md:inset-x-auto md:right-8",
            )}
          >
          <div className="flex gap-2">
            <Button
              type="button"
              variant={kind === "task" ? "default" : "outline"}
              onClick={() => setKind("task")}
            >
              Task
            </Button>
            <Button
              type="button"
              variant={kind === "goal_item" ? "default" : "outline"}
              onClick={() => setKind("goal_item")}
            >
              Goal item
            </Button>
            <Button
              type="button"
              variant={kind === "expense" ? "default" : "outline"}
              onClick={() => setKind("expense")}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={kind === "contribution" ? "default" : "outline"}
              onClick={() => setKind("contribution")}
            >
              Contribution
            </Button>
          </div>
          {kind === "goal_item" ? (
            <div className="mt-3">
              <Label htmlFor="qa-goal">Goal</Label>
              <select
                id="qa-goal"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === "expense" ? (
            <div className="mt-3 grid gap-2">
              <Label htmlFor="qa-amount">Amount</Label>
              <Input
                id="qa-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Label htmlFor="qa-cat">Category</Label>
              <select
                id="qa-cat"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="qa-acct">Account</Label>
              <select
                id="qa-acct"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === "contribution" ? (
            <div className="mt-3 grid gap-2">
              <Label htmlFor="qa-camt">Amount</Label>
              <Input
                id="qa-camt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Label htmlFor="qa-fund">Fund</Label>
              <select
                id="qa-fund"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {(kind === "task" || kind === "goal_item") && (
          <div className="mt-3">
            <Label htmlFor="qa-title">Title</Label>
            <Input
              id="qa-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          )}
          {kind === "task" && previewReady ? (
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="task-time-preview"
            >
              {timePreview}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              disabled={
                kind === "task"
                  ? taskSaveDisabled
                  : kind === "goal_item"
                    ? goalSaveDisabled
                    : kind === "expense"
                      ? expenseSaveDisabled
                      : contributionSaveDisabled
              }
              onClick={() => void onSave()}
            >
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {status ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {status}
            </p>
          ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
