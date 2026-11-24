import type {
  AiClientBody,
  AiTurn,
  GoalMode,
  MonthMode,
  ReuseMode,
} from "./types";

const FORBIDDEN_KEYS = new Set([
  "ownerId",
  "owner_id",
  "sql",
  "model",
  "modelId",
  "model_id",
  "url",
  "context",
]);

export type ParseResult =
  | { ok: true; body: AiClientBody; truncated: boolean }
  | { ok: false; code: "invalid_request"; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function goalMode(v: unknown): GoalMode | null {
  if (v === "none" || v === "current" || v === "selected") return v;
  return null;
}

function monthMode(v: unknown): MonthMode | null {
  if (v === "none" || v === "current" || v === "selected") return v;
  return null;
}

function parseTurn(raw: unknown): AiTurn | null {
  if (!isRecord(raw)) return null;
  const role = raw.role;
  const content = raw.content;
  const signature = raw.signature;
  const scopeCanonical = raw.scopeCanonical;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof content !== "string") return null;
  if (typeof signature !== "string") return null;
  if (typeof scopeCanonical !== "string") return null;
  return { role, content, signature, scopeCanonical };
}

export function parseAiBody(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    return { ok: false, code: "invalid_request", message: "Body must be an object." };
  }

  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: `Field ${key} is not allowed.`,
      };
    }
  }

  const gm = goalMode(raw.goalMode);
  const mm = monthMode(raw.monthMode);
  if (!gm || !mm) {
    return { ok: false, code: "invalid_request", message: "Invalid goal or month mode." };
  }

  const goalIds = raw.goalIds;
  if (!Array.isArray(goalIds) || !goalIds.every((id) => typeof id === "string")) {
    return { ok: false, code: "invalid_request", message: "goalIds must be string array." };
  }

  const month = raw.month;
  if (month !== null && typeof month !== "string") {
    return { ok: false, code: "invalid_request", message: "month must be string or null." };
  }

  if (typeof raw.taskSummary !== "boolean" || typeof raw.finance !== "boolean") {
    return { ok: false, code: "invalid_request", message: "taskSummary and finance must be booleans." };
  }

  if (gm === "current" && goalIds.length !== 1) {
    return { ok: false, code: "invalid_request", message: "current goal requires exactly one id." };
  }
  if (gm === "selected" && (goalIds.length < 1 || goalIds.length > 20)) {
    return { ok: false, code: "invalid_request", message: "selected goals require 1–20 ids." };
  }
  if (gm === "none" && goalIds.length > 0) {
    return { ok: false, code: "invalid_request", message: "goalIds must be empty when goal mode is none." };
  }

  if (mm === "selected") {
    if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, code: "invalid_request", message: "selected month requires YYYY-MM." };
    }
  }

  let messages: AiTurn[] = [];
  if (raw.messages !== undefined) {
    if (!Array.isArray(raw.messages)) {
      return { ok: false, code: "invalid_request", message: "messages must be an array." };
    }
    messages = [];
    for (const m of raw.messages) {
      const turn = parseTurn(m);
      if (!turn) {
        return { ok: false, code: "invalid_request", message: "Invalid message turn." };
      }
      messages.push(turn);
    }
  }

  let truncated = false;
  if (messages.length > 16) {
    truncated = true;
    messages = messages.slice(-16);
  }

  let newMessage: { content: string } | undefined;
  if (raw.newMessage !== undefined) {
    if (!isRecord(raw.newMessage) || typeof raw.newMessage.content !== "string") {
      return { ok: false, code: "invalid_request", message: "Invalid newMessage." };
    }
    if (raw.newMessage.content.length > 2000) {
      return { ok: false, code: "invalid_request", message: "Message too long." };
    }
    newMessage = { content: raw.newMessage.content };
  }

  let reuse: ReuseMode = null;
  if (raw.reuse !== undefined && raw.reuse !== null) {
    if (raw.reuse !== "new" && raw.reuse !== "omit_prior") {
      return { ok: false, code: "invalid_request", message: "Invalid reuse." };
    }
    reuse = raw.reuse;
  }

  const acknowledgeNarrow = raw.acknowledgeNarrow === true;
  const threadId =
    raw.threadId === undefined || raw.threadId === null
      ? null
      : typeof raw.threadId === "string"
        ? raw.threadId
        : null;
  if (raw.threadId !== undefined && raw.threadId !== null && typeof raw.threadId !== "string") {
    return { ok: false, code: "invalid_request", message: "Invalid threadId." };
  }

  return {
    ok: true,
    truncated,
    body: {
      goalMode: gm,
      goalIds,
      monthMode: mm,
      month: month ?? null,
      taskSummary: raw.taskSummary,
      finance: raw.finance,
      messages,
      newMessage,
      acknowledgeNarrow,
      reuse,
      threadId,
    },
  };
}

export function rejectForbiddenBodyJson(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return false;
    return Object.keys(parsed).some((k) => FORBIDDEN_KEYS.has(k));
  } catch {
    return false;
  }
}