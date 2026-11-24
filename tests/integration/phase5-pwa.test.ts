import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPushNotificationBody } from "../../src/features/reminders/push-payload";
import { reminderRowFromInsert } from "../../src/features/reminders/dispatch";
import type { Database } from "../../src/types/database";
import {
  integrationEnvOrSkip,
  integrationSupabaseEnv,
} from "./supabase-env";

const env = integrationSupabaseEnv();
const skip = integrationEnvOrSkip();
const URL = env?.url ?? "";
const PUBLISHABLE = env?.publishableKey ?? "";
const SECRET = env?.secretKey ?? "";

import {
  INTEGRATION_OWNER_EMAIL as ALLOWED,
  INTEGRATION_OWNER_PASSWORD as PASSWORD,
} from "./credentials";
import { ensureIntegrationOwner, wipeAllAuthUsers } from "./auth-reset";

function admin() {
  return createClient(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(skip)("Phase 5 PWA integration", () => {
  let ownerId: string;
  let ownerClient: ReturnType<typeof createClient<Database>>;
  let fundId: string;

  beforeAll(async () => {
    const supabase = admin();
    await wipeAllAuthUsers(supabase);
    await ensureIntegrationOwner(supabase, ALLOWED, PASSWORD);
    ownerClient = createClient<Database>(URL, PUBLISHABLE);
    const { data: signIn, error } = await ownerClient.auth.signInWithPassword({
      email: ALLOWED,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    ownerId = signIn.user!.id;

    const { data: fund, error: fundErr } = await ownerClient
      .from("savings_funds")
      .insert({
        owner_id: ownerId,
        name: "Helmet",
        kind: "purchase",
        currency: "PKR",
        target_minor: "1000000",
        start_month: "2026-01-01",
        deadline_month: "2026-12-01",
        opening_allocation_minor: "100000",
      } as never)
      .select("id")
      .single();
    expect(fundErr).toBeNull();
    fundId = String((fund as { id: string } | null)?.id);
  }, 120_000);

  afterAll(async () => {
    await wipeAllAuthUsers(admin());
  }, 60_000);

  it("5 — reminder dedupe unique per subject and fire_at", async () => {
    const fireAt = new Date("2026-04-01T09:00:00.000Z");
    const row = reminderRowFromInsert({
      ownerId,
      subjectType: "savings_fund",
      subjectId: fundId,
      fireAt,
    });
    const { error: first } = await ownerClient
      .from("reminders")
      .insert(row as never);
    expect(first).toBeNull();
    const { error: dupe } = await ownerClient
      .from("reminders")
      .insert(row as never);
    expect(dupe).toBeTruthy();
    expect(dupe?.code).toBe("23505");
  });

  it("6 — push payload omits digits when hide amounts on", () => {
    const { body } = buildPushNotificationBody({
      subjectType: "savings_fund",
      title: "Helmet",
      hideAmountsOnLockScreen: true,
      amountLabel: "PKR 5000.00",
    });
    expect(body).not.toMatch(/\d/);
  });

  it("1 — queued create replayed twice inserts one task row", async () => {
    const id = crypto.randomUUID();
    const payload = {
      owner_id: ownerId,
      id,
      title: "Offline once",
      status: "backlog",
      position: "m",
      version: 1,
    };
    const { error: a } = await ownerClient.from("tasks").insert(payload as never);
    expect(a).toBeNull();
    const { error: b } = await ownerClient.from("tasks").insert(payload as never);
    expect(b).toBeTruthy();
  });

  it("4 — withdrawal over reserved fails permanently", async () => {
    const { error } = await ownerClient.from("savings_entries").insert({
      owner_id: ownerId,
      fund_id: fundId,
      kind: "withdrawal",
      amount_minor: "999999999",
      occurred_on: "2026-04-01",
      version: 1,
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/withdrawal exceeds reserved/i);
  });

  it("7 — account deletion cascades owner rows", async () => {
    const supabase = admin();
    const { data: before } = await supabase
      .from("reminders")
      .select("id")
      .eq("owner_id", ownerId);
    expect((before ?? []).length).toBeGreaterThanOrEqual(0);

    await supabase.from("reminders").insert({
      owner_id: ownerId,
      subject_type: "savings_fund",
      subject_id: fundId,
      fire_at: new Date().toISOString(),
      dedupe_key: `cascade:${fundId}`,
      enabled: true,
    } as never);

    const { error } = await ownerClient.rpc("delete_owner_account");
    expect(error).toBeNull();

    const { data: profiles } = await supabase.from("profiles").select("id");
    expect(profiles?.length).toBe(0);

    const { data: reminders } = await supabase.from("reminders").select("id");
    expect(reminders?.length).toBe(0);
  });
});