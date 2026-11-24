import { createHmac, timingSafeEqual } from "node:crypto";
import { scopeCanonical } from "./scope";
import type { ResolvedScope } from "./types";

export { scopeCanonical } from "./scope";

export function signTurn(
  role: "user" | "assistant",
  content: string,
  scope: ResolvedScope,
  secret: string,
): string {
  const payload = `${role}\n${content}\n${scopeCanonical(scope)}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyTurn(
  role: "user" | "assistant",
  content: string,
  scopeCanonicalStr: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret) return false;
  const payload = `${role}\n${content}\n${scopeCanonicalStr}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}