import type { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";

type Supabase = ReturnType<typeof createClient>;

export async function createContribution(
  supabase: Supabase,
  fundId: string,
  amountMinor: bigint,
  occurredOn: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: userErr?.message ?? "not authenticated" };
  }
  const { error } = await supabase.from("savings_entries").insert({
    id: uuid(),
    owner_id: user.id,
    fund_id: fundId,
    kind: "contribution",
    amount_minor: amountMinor.toString(),
    occurred_on: occurredOn,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}