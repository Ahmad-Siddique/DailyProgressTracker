import type { OwnerClock } from "@/lib/clock";
import { canonicalJson } from "./canonical";
import type { AiClientBody, AiTurn, ResolvedScope } from "./types";

export function scopeCanonical(scope: ResolvedScope): string {
  return canonicalJson({
    finance: scope.finance,
    goalIds: [...scope.goalIds].sort(),
    goalMode: scope.goalMode,
    month: scope.month,
    monthMode: scope.monthMode,
    taskSummary: scope.taskSummary,
  });
}

export function inferPriorScopeFromTurns(
  messages: AiTurn[],
): ResolvedScope | null {
  if (messages.length === 0) return null;
  const last = messages.at(-1);
  if (!last) return null;
  return parseScopeCanonical(last.scopeCanonical);
}

export function resolveScope(body: AiClientBody, clock: OwnerClock): ResolvedScope {
  let month = body.month;
  let monthMode = body.monthMode;

  if (body.finance && monthMode === "none") {
    monthMode = "current";
    month = clock.monthKey;
  }

  if (monthMode === "current") {
    month = clock.monthKey;
  }

  if (monthMode === "none") {
    month = null;
  }

  return {
    finance: body.finance,
    goalIds: body.goalMode === "none" ? [] : [...body.goalIds],
    goalMode: body.goalMode,
    month,
    monthMode,
    taskSummary: body.taskSummary,
  };
}

export function scopeIsNarrower(
  prior: ResolvedScope,
  next: ResolvedScope,
): boolean {
  if (prior.finance && !next.finance) return true;
  if (prior.taskSummary && !next.taskSummary) return true;
  if (prior.month !== null && next.month !== prior.month) return true;
  if (prior.month !== null && next.month === null) return true;
  if (prior.goalMode !== "none" && next.goalMode !== "none") {
    const priorSet = new Set(prior.goalIds);
    const nextSet = new Set(next.goalIds);
    if (nextSet.size < priorSet.size) {
      for (const id of nextSet) {
        if (!priorSet.has(id)) return true;
      }
      return true;
    }
    for (const id of nextSet) {
      if (!priorSet.has(id)) return true;
    }
  }
  if (prior.goalMode !== "none" && next.goalMode === "none") return true;
  return false;
}

export function priorTurnAllowed(
  turnScope: ResolvedScope,
  current: ResolvedScope,
): boolean {
  if (turnScope.finance && !current.finance) return false;
  if (turnScope.taskSummary && !current.taskSummary) return false;
  if (turnScope.month && turnScope.month !== current.month) return false;
  if (turnScope.month && !current.month) return false;
  if (turnScope.goalIds.length > 0) {
    const allowed = new Set(current.goalIds);
    for (const id of turnScope.goalIds) {
      if (!allowed.has(id)) return false;
    }
  }
  return true;
}

export function parseScopeCanonical(text: string): ResolvedScope | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    const goalMode = o.goalMode;
    const monthMode = o.monthMode;
    if (
      goalMode !== "none" &&
      goalMode !== "current" &&
      goalMode !== "selected"
    ) {
      return null;
    }
    if (
      monthMode !== "none" &&
      monthMode !== "current" &&
      monthMode !== "selected"
    ) {
      return null;
    }
    if (!Array.isArray(o.goalIds) || typeof o.finance !== "boolean") return null;
    if (typeof o.taskSummary !== "boolean") return null;
    return {
      finance: o.finance,
      goalIds: o.goalIds.filter((id): id is string => typeof id === "string"),
      goalMode,
      month: typeof o.month === "string" ? o.month : null,
      monthMode,
      taskSummary: o.taskSummary,
    };
  } catch {
    return null;
  }
}