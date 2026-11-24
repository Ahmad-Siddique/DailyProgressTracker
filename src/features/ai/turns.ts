import { verifyTurn } from "./sign-turn";
import {
  inferPriorScopeFromTurns,
  priorTurnAllowed,
  parseScopeCanonical,
  scopeIsNarrower,
} from "./scope";
import type { AiClientBody, ResolvedScope } from "./types";

export function needsNarrowDialog(
  body: AiClientBody,
  current: ResolvedScope,
): boolean {
  if (body.messages.length === 0) return false;
  const prior = inferPriorScopeFromTurns(body.messages);
  if (!prior) return false;
  return scopeIsNarrower(prior, current);
}

export function resolveForwardTurns(
  body: AiClientBody,
  current: ResolvedScope,
  secret: string,
): { turns: Array<{ role: "user" | "assistant"; content: string }>; error?: string } {
  if (
    needsNarrowDialog(body, current) &&
    !body.acknowledgeNarrow &&
    body.reuse !== "new" &&
    body.reuse !== "omit_prior"
  ) {
    return { turns: [], error: "scope_narrowed" };
  }

  if (
    body.acknowledgeNarrow &&
    (body.reuse === "new" || body.reuse === "omit_prior")
  ) {
    return { turns: [] };
  }

  const forwarded: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of body.messages) {
    const turnScope = parseScopeCanonical(turn.scopeCanonical);
    if (!turnScope) continue;
    if (
      !verifyTurn(
        turn.role,
        turn.content,
        turn.scopeCanonical,
        turn.signature,
        secret,
      )
    ) {
      continue;
    }
    if (!priorTurnAllowed(turnScope, current)) continue;
    forwarded.push({ role: turn.role, content: turn.content });
  }
  return { turns: forwarded };
}