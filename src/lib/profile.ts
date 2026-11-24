import type { createClient } from "@/lib/supabase/client";
import { sha256Hex, upsertMutationReceipt } from "@/lib/mutation-receipt";
import type { Json, ProfileRow } from "@/types/database";

type BrowserSupabase = ReturnType<typeof createClient>;

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | "timezone"
    | "theme"
    | "display_name"
    | "reporting_currency"
    | "reminders_enabled"
    | "hide_amounts_on_lock_screen"
    | "saved_chats_enabled"
  >
>;

export type VersionedUpdateResult =
  | { ok: true; profile: ProfileRow }
  | { ok: false; conflict: true; profile: ProfileRow | null }
  | { ok: false; conflict: false; profile: ProfileRow | null; error: string };

export async function updateProfileWithVersion(
  supabase: BrowserSupabase,
  current: ProfileRow,
  patch: ProfileUpdate,
): Promise<VersionedUpdateResult> {
  const requestHash = await sha256Hex(JSON.stringify(patch));
  const idempotencyKey = `${current.id}:v${current.version}:${requestHash}`;

  const { data: priorReceipt } = await supabase
    .from("mutation_receipts")
    .select("request_hash, response_body")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (priorReceipt) {
    const prior = priorReceipt as {
      request_hash: string;
      response_body: Json;
    };
    if (prior.request_hash !== requestHash) {
      return {
        ok: false,
        conflict: false,
        profile: null,
        error: "idempotency key reused with different payload",
      };
    }
    const replay = prior.response_body as unknown as ProfileRow;
    if (replay?.id === current.id) {
      return { ok: true, profile: replay };
    }
  }

  const nextVersion = current.version + 1;
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...patch, version: nextVersion })
    .eq("id", current.id)
    .eq("version", current.version)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, conflict: false, profile: null, error: error.message };
  }

  const row = data as ProfileRow | null;

  if (!row) {
    const { data: latest } = await supabase
      .from("profiles")
      .select()
      .eq("id", current.id)
      .maybeSingle();
    return {
      ok: false,
      conflict: true,
      profile: (latest as ProfileRow | null) ?? null,
    };
  }

  const receipt = await upsertMutationReceipt(supabase, {
    idempotencyKey,
    requestHash,
    resourceId: current.id,
    responseBody: row as unknown as Json,
  });
  if (!receipt.ok) {
    return {
      ok: false,
      conflict: false,
      profile: row,
      error: receipt.error,
    };
  }

  return { ok: true, profile: row };
}