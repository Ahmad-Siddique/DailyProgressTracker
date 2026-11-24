import type { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

type BrowserSupabase = ReturnType<typeof createClient>;

export type MutationReceiptInput = {
  idempotencyKey: string;
  requestHash: string;
  resourceId: string;
  responseBody: Json;
};

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function upsertMutationReceipt(
  supabase: BrowserSupabase,
  input: MutationReceiptInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: userError?.message ?? "not authenticated" };
  }

  const { data: existing, error: selectError } = await supabase
    .from("mutation_receipts")
    .select("request_hash")
    .eq("owner_id", user.id)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (selectError) {
    return { ok: false, error: selectError.message };
  }

  if (existing) {
    const row = existing as { request_hash: string };
    if (row.request_hash !== input.requestHash) {
      return { ok: false, error: "idempotency key reused with different payload" };
    }
    return { ok: true };
  }

  const { error: insertError } = await supabase.from("mutation_receipts").insert({
    owner_id: user.id,
    idempotency_key: input.idempotencyKey,
    request_hash: input.requestHash,
    resource_id: input.resourceId,
    response_body: input.responseBody,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
}