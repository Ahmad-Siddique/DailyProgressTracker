"use client";

import Link from "next/link";
import * as React from "react";
import {
  inferPriorScopeFromTurns,
  resolveScope,
  scopeCanonical,
  scopeIsNarrower,
} from "@/features/ai/scope";
import type { AiContextDocument, AiTurn, RecordRef, ResolvedScope } from "@/features/ai/types";
import { ownerClock } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { useAi } from "./ai-provider";

const ERROR_COPY: Record<string, string> = {
  free_model_unavailable:
    "Free model unavailable. None of the configured free models accepted this request. Dayboard did not try a paid model.",
  no_qualifying_route:
    "No private route. No model route met the privacy settings. Dayboard did not relax those settings.",
  misconfigured: "AI is not configured on the server.",
  rate_limited: "Hourly AI limit reached.",
  busy: "A reply is already streaming.",
  provider_rate_limited:
    "The free model provider is busy. Dayboard did not try a paid model.",
  timeout: "The model timed out.",
  disconnected: "The reply stopped.",
  unauthenticated: "Sign in again.",
  scope_narrowed: "Scope is narrower.",
  context_inconsistent:
    "The app's saved figures did not match. Nothing was sent.",
  context_too_large:
    "The selected scope is too large even after trimming. Narrow the goals or the month.",
};

function monthLabel(month: string | null, mode: ResolvedScope["monthMode"]): string | null {
  if (!month) return null;
  const [y, m] = month.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  const label = d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return mode === "current" ? `${label} · current` : label;
}

export function AiPanel() {
  const ai = useAi();
  const [preview, setPreview] = React.useState<AiContextDocument | null>(null);
  const [resolvedScope, setResolvedScope] = React.useState<ResolvedScope | null>(null);
  const [previewJson, setPreviewJson] = React.useState("");
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [stopped, setStopped] = React.useState(false);
  const [recordRefs, setRecordRefs] = React.useState<RecordRef[]>([]);
  const [narrowOpen, setNarrowOpen] = React.useState(false);
  const [omitPrior, setOmitPrior] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const chipScope = resolvedScope ?? ai.scope;

  const resolvedForClient = React.useCallback(
    (scope: ResolvedScope): ResolvedScope => {
      if (preview?.asOf) {
        return resolveScope(
          {
            goalMode: scope.goalMode,
            goalIds: scope.goalIds,
            monthMode: scope.monthMode,
            month: scope.month,
            taskSummary: scope.taskSummary,
            finance: scope.finance,
            messages: [],
          },
          ownerClock({ timezone: preview.asOf.timezone }, new Date(preview.asOf.generatedAt)),
        );
      }
      return resolvedScope ?? scope;
    },
    [resolvedScope, preview],
  );

  const applyScopeChange = React.useCallback(
    (updater: (s: ResolvedScope) => ResolvedScope) => {
      const nextClient = updater(ai.scope);
      if (ai.messages.length > 0) {
        const prior = inferPriorScopeFromTurns(ai.messages);
        if (prior) {
          const nextResolvedOrClient = resolveScope(
            {
              goalMode: nextClient.goalMode,
              goalIds: nextClient.goalIds,
              monthMode: nextClient.monthMode,
              month: nextClient.month,
              taskSummary: nextClient.taskSummary,
              finance: nextClient.finance,
              messages: [],
            },
            preview?.asOf
              ? ownerClock(
                  { timezone: preview.asOf.timezone },
                  new Date(preview.asOf.generatedAt),
                )
              : ownerClock({ timezone: "Asia/Karachi" }, new Date()),
          );
          if (scopeIsNarrower(prior, nextResolvedOrClient)) {
            setNarrowOpen(true);
            setOmitPrior(false);
          } else if (narrowOpen) {
            setNarrowOpen(false);
            setOmitPrior(false);
          }
        }
      }
      ai.setScope(nextClient);
    },
    [ai, preview, narrowOpen],
  );

  const bodyForApi = React.useCallback(
    (extra?: { acknowledgeNarrow?: boolean; reuse?: "new" | "omit_prior" }) => ({
      goalMode: ai.scope.goalMode,
      goalIds: ai.scope.goalIds,
      monthMode: ai.scope.monthMode,
      month: ai.scope.month,
      taskSummary: ai.scope.taskSummary,
      finance: ai.scope.finance,
      messages: ai.messages,
      acknowledgeNarrow: extra?.acknowledgeNarrow,
      reuse: extra?.reuse ?? null,
    }),
    [ai.scope, ai.messages],
  );

  React.useEffect(() => {
    setResolvedScope(null);
  }, [ai.scope]);

  React.useEffect(() => {
    if (!ai.open) return;
    let cancelled = false;
    async function load() {
      if (!online) return;
      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/ai/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyForApi()),
        });
        const data = (await res.json()) as {
          error?: string;
          scope?: ResolvedScope;
          context?: AiContextDocument;
          contextJson?: string;
          recordRefs?: RecordRef[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(
            (data.error && ERROR_COPY[data.error]) ??
              data.error ??
              "Preview failed.",
          );
          setPreview(null);
          return;
        }
        setPreview(data.context ?? null);
        setResolvedScope(data.scope ?? data.context?.scope ?? null);
        setPreviewJson(data.contextJson ?? "");
        setRecordRefs(data.recordRefs ?? []);
      } catch {
        if (!cancelled) setPreviewError("Preview failed.");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ai.open, ai.scope, online, bodyForApi]);

  function removeChip(kind: string) {
    applyScopeChange((s) => {
      const next = { ...s };
      if (kind === "goal") {
        next.goalMode = "none";
        next.goalIds = [];
      }
      if (kind === "month") {
        next.monthMode = "none";
        next.month = null;
      }
      if (kind === "tasks") next.taskSummary = false;
      if (kind === "finance") next.finance = false;
      return next;
    });
  }

  function turnFinanceOn() {
    applyScopeChange((s) => ({
      ...s,
      finance: true,
      monthMode: s.monthMode === "none" ? "current" : s.monthMode,
    }));
  }

  async function send() {
    if (!draftOk || !online) return;
    setSendError(null);
    setStopped(false);
    if (ai.messages.length > 0 && narrowOpen) {
      setSendError(ERROR_COPY.scope_narrowed ?? "Scope is narrower.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    ai.setAssistantLive("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bodyForApi({
            acknowledgeNarrow: omitPrior,
            reuse: omitPrior ? "omit_prior" : undefined,
          }),
          newMessage: { content: ai.draft },
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSendError(
          (data.error && ERROR_COPY[data.error]) ?? "Send failed.",
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let lastMeta: { signatures?: { user: string; assistant: string } } | null =
        null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            code?: string;
            recordRefs?: RecordRef[];
            signatures?: { user: string; assistant: string };
          };
          if (payload.type === "delta" && payload.text) {
            assistant += payload.text;
            ai.setAssistantLive(assistant);
          }
          if (payload.type === "error" && payload.code) {
            setSendError(
              (payload.code && ERROR_COPY[payload.code]) ??
                payload.code ??
                "Send failed.",
            );
          }
          if (payload.type === "meta") {
            if (payload.recordRefs) setRecordRefs(payload.recordRefs);
            if (payload.signatures) lastMeta = { signatures: payload.signatures };
          }
        }
      }
      if (assistant && lastMeta?.signatures) {
        const canon = scopeCanonical(ai.scope);
        const userTurn: AiTurn = {
          role: "user",
          content: ai.draft,
          signature: lastMeta.signatures.user,
          scopeCanonical: canon,
        };
        const assistantTurn: AiTurn = {
          role: "assistant",
          content: assistant,
          signature: lastMeta.signatures.assistant,
          scopeCanonical: canon,
        };
        ai.setMessages((m) => [...m, userTurn, assistantTurn]);
        ai.setDraft("");
        ai.setAssistantLive("");
        setOmitPrior(false);
        setNarrowOpen(false);
      }
    } catch {
      if (!stopped) setSendError(ERROR_COPY.disconnected ?? "The reply stopped.");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onStop() {
    setStopped(true);
    abortRef.current?.abort();
  }

  async function copyAssistant() {
    const last = ai.messages.filter((m) => m.role === "assistant").pop();
    const text = last?.content ?? ai.assistantLive;
    if (text) await navigator.clipboard.writeText(text);
  }

  const draftOk = ai.draft.trim().length > 0 && !loadingPreview && !previewError;
  const narrowBlocks =
    ai.messages.length > 0 &&
    narrowOpen &&
    !omitPrior;

  if (!ai.open) return null;

  const panel = (
    <div
      className="flex h-full flex-col bg-card/95 backdrop-blur-md"
      role="dialog"
      aria-label="Dayboard AI"
    >
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Dayboard AI
        </h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            ai.setOpen(false);
            ai.returnFocusRef.current?.focus();
          }}
        >
          Close
        </Button>
      </div>

      <p className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
        This chat and the chips below are sent to OpenRouter and the provider
        that serves the selected free model. Dayboard does not claim the provider
        keeps zero copies.
        {process.env.NEXT_PUBLIC_OPENROUTER_REQUIRE_ZDR === "true"
          ? " This server asks OpenRouter for a zero-data-retention route. If none qualifies, the send fails."
          : null}
      </p>

      <div className="flex flex-wrap gap-2 border-b border-border/50 px-4 py-3">
        {chipScope.goalMode === "current" && preview?.goals?.[0] ? (
          <Chip label={`Goal · ${preview.goals[0].title}`} onRemove={() => removeChip("goal")} />
        ) : null}
        {chipScope.goalMode === "selected" ? (
          <Chip
            label={`Goals · ${chipScope.goalIds.length}`}
            onRemove={() => removeChip("goal")}
          />
        ) : null}
        {resolvedForClient(chipScope).month ? (
          <Chip
            label={`Month · ${monthLabel(
              resolvedForClient(chipScope).month,
              chipScope.monthMode,
            )}`}
            onRemove={() => removeChip("month")}
          />
        ) : null}
        {chipScope.taskSummary ? (
          <Chip label="Tasks · summary" onRemove={() => removeChip("tasks")} />
        ) : null}
        {chipScope.finance ? (
          <Chip
            warn
            label={`Finance · aggregates · ${monthLabel(
              resolvedForClient(chipScope).month,
              chipScope.monthMode,
            )}`}
            onRemove={() => removeChip("finance")}
          />
        ) : (
          <button
            type="button"
            className="text-xs underline"
            onClick={turnFinanceOn}
          >
            Turn finance on
          </button>
        )}
      </div>

      {!online ? (
        <p className="px-4 text-sm">Available online.</p>
      ) : null}

      <section className="flex-1 overflow-y-auto px-4 py-2 text-sm" aria-label="Preview">
        <h3 className="font-medium">Preview</h3>
        {loadingPreview ? (
          <p className="text-muted-foreground" role="status">
            Loading preview
          </p>
        ) : null}
        {previewError ? <p>{previewError}</p> : null}
        {preview ? <PreviewSections doc={preview} /> : null}
        {previewJson ? (
          <details className="mt-2">
            <summary>Payload</summary>
            <pre className="mt-1 max-h-48 overflow-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(JSON.parse(previewJson), null, 2)}
            </pre>
          </details>
        ) : null}

        <h3 className="mt-4 font-medium">Transcript</h3>
        {ai.messages.length === 0 ? (
          <StarterPrompts
            onPick={(seed, text) => {
              applyScopeChange((s) => ({ ...s, ...seed }));
              ai.setDraft(text);
            }}
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {ai.messages.map((m, i) => (
              <li key={`${m.role}-${i}`} className="db-surface p-3">
                <p className="text-xs text-muted-foreground">{m.role}</p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </li>
            ))}
          </ul>
        )}
        {ai.assistantLive ? (
          <MotionSuggestion text={ai.assistantLive} />
        ) : null}
        {recordRefs.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium">From your records</p>
            <ul className="text-xs">
              {recordRefs.map((ref) => (
                <li key={`${ref.kind}-${ref.id}`}>
                  {ref.kind === "goal" ? (
                    <Link href={`/goals/${ref.id}`}>{ref.id}</Link>
                  ) : ref.kind === "fund" ? (
                    <Link href="/money">{ref.id}</Link>
                  ) : ref.kind === "task" ? (
                    <Link href="/board">{ref.id}</Link>
                  ) : (
                    ref.id
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="border-t border-border/80 bg-background/60 p-4 backdrop-blur-sm">
        <label className="sr-only" htmlFor="ai-draft">
          Draft message
        </label>
        <textarea
          id="ai-draft"
          className="db-input mb-2 min-h-[72px] resize-none"
          value={ai.draft}
          onChange={(e) => ai.setDraft(e.target.value)}
          maxLength={2000}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!draftOk || !online || streaming || narrowBlocks}
            onClick={() => void send()}
          >
            Send
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!streaming}
            onClick={onStop}
          >
            Stop
          </Button>
          <Button type="button" variant="outline" onClick={() => ai.resetChat()}>
            New chat
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyAssistant()}>
            Copy
          </Button>
        </div>
        {sendError ? <p className="mt-2 text-sm text-destructive">{sendError}</p> : null}
        {stopped ? <p className="text-xs">Stopped</p> : null}
      </div>

      {narrowOpen ? (
        <CacheNarrowDialog
          omitPrior={omitPrior}
          onOmit={() => setOmitPrior(true)}
          onNewChat={() => {
            ai.resetChat();
            setNarrowOpen(false);
            setOmitPrior(false);
          }}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <MotionDesktop aside={panel} />
      <div
        className="fixed inset-x-0 bottom-14 z-50 max-h-[75vh] rounded-t-2xl border border-border/80 bg-card/95 shadow-premium backdrop-blur-xl md:hidden"
        style={{ animation: "db-sheet-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both" }}
      >
        {panel}
      </div>
    </>
  );
}

function MotionDesktop({ aside }: { aside: React.ReactNode }) {
  return (
    <aside
      className="hidden h-screen w-80 shrink-0 border-l border-border/80 bg-card/40 shadow-premium md:flex md:flex-col"
      data-testid="ai-panel-desktop"
    >
      {aside}
    </aside>
  );
}

function MotionSuggestion({ text }: { text: string }) {
  return (
    <div className="db-surface mt-2 border-dashed p-3">
      <p className="text-xs text-muted-foreground">Suggestion</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function Chip({
  label,
  onRemove,
  warn,
}: {
  label: string;
  onRemove: () => void;
  warn?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${warn ? "border-primary/50 bg-accent text-accent-foreground" : "border-border/80 bg-muted/80"}`}
    >
      {label}
      <button type="button" className="underline" onClick={onRemove} aria-label={`Remove ${label}`}>
        ×
      </button>
    </span>
  );
}

function PreviewSections({ doc }: { doc: AiContextDocument }) {
  if (!doc.goals?.length && !doc.review && !doc.tasks) {
    return <p className="text-muted-foreground">No records selected.</p>;
  }
  return (
    <MotionDiv>
      {doc.goals?.map((g) => (
        <MotionDiv key={g.id}>
          <p className="font-medium">{g.title}</p>
          {g.notes ? <p>{g.notes}</p> : null}
          <ul className="list-inside list-disc">
            {g.items.map((i) => (
              <li key={i.id}>{i.title}</li>
            ))}
          </ul>
        </MotionDiv>
      ))}
      {doc.review ? (
        <MotionDiv>
          <p>Monthly review for {doc.review.month}</p>
          {!doc.scope.finance ? <p>No amounts included.</p> : null}
          {doc.review.savings?.map((s) => (
            <p key={s.fundId}>
              {s.name}: {s.shortfallDisplay} · {s.revisedMonthlyDisplay}
            </p>
          ))}
        </MotionDiv>
      ) : null}
    </MotionDiv>
  );
}

function MotionDiv({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 space-y-1">{children}</div>;
}

function StarterPrompts({
  onPick,
}: {
  onPick: (
    seed: Partial<ResolvedScope>,
    text: string,
  ) => void;
}) {
  const prompts = [
    {
      label: "Which items should I tackle this week?",
      seed: { taskSummary: true } as Partial<ResolvedScope>,
      text: "Which items should I tackle this week?",
    },
    {
      label: "Break this goal into milestones",
      seed: {} as Partial<ResolvedScope>,
      text: "Break this goal into milestones",
    },
    {
      label: "What changed this month?",
      seed: { monthMode: "current" as const, month: null },
      text: "What changed this month?",
    },
    {
      label: "Can I still fund my helmet by the deadline?",
      seed: {},
      text: "Can I still fund my helmet by the deadline?",
    },
  ];
  return (
    <ul className="mt-2 space-y-1">
      {prompts.map((p) => (
        <li key={p.label}>
          <button
            type="button"
            className="text-left text-sm underline"
            onClick={() => onPick(p.seed, p.text)}
          >
            {p.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CacheNarrowDialog({
  omitPrior,
  onOmit,
  onNewChat,
}: {
  omitPrior: boolean;
  onOmit: () => void;
  onNewChat: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-labelledby="narrow-title"
      className="absolute inset-0 flex items-center justify-center bg-background/90 p-4"
    >
      <div className="db-surface max-w-sm p-4 shadow-premium">
        <h3 id="narrow-title" className="font-semibold">
          Scope is narrower.
        </h3>
        <p className="mt-2 text-sm">
          Earlier messages were sent with broader data. Dayboard will not send
          those messages with the new scope.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={omitPrior}
            onChange={() => onOmit()}
          />
          Do not resend earlier messages
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={onNewChat}>
            New chat
          </Button>
          <Button type="button" variant="outline">
            Keep on screen
          </Button>
        </div>
      </div>
    </div>
  );
}