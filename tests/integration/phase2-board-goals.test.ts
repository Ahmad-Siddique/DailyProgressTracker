import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  selectGoalProgress,
  type GoalItemRow,
} from "../../src/features/goals/selectors";
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

describe.skipIf(skip)("Phase 2 board and goals integration", () => {
  beforeAll(async () => {
    const supabase = admin();
    await wipeAllAuthUsers(supabase);
    await ensureIntegrationOwner(supabase, ALLOWED, PASSWORD);
  }, 120_000);

  afterAll(async () => {
    await wipeAllAuthUsers(admin());
  }, 60_000);

  async function userClient() {
    const client = createClient(URL, PUBLISHABLE);
    await client.auth.signInWithPassword({ email: ALLOWED, password: PASSWORD });
    return client;
  }

  it("1 — title-only task lands in backlog", async () => {
    const client = await userClient();
    const { data, error } = await client
      .from("tasks")
      .insert({
        title: "Only title",
        status: "backlog",
        position: "a1",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.local_date).toBeNull();
    expect(data?.start_time).toBeNull();
    expect(data?.priority).toBeNull();
  });

  it("2 — move_task updates status without local_date", async () => {
    const client = await userClient();
    const { data: row } = await client
      .from("tasks")
      .select("*")
      .eq("title", "Only title")
      .single();
    expect(row).toBeTruthy();
    const { data: moved, error } = await client.rpc("move_task", {
      p_task_id: row!.id,
      p_to_status: "in_progress",
      p_position: "a2",
      p_base_version: row!.version,
      p_idempotency_key: `move-${row!.id}-1`,
    });
    expect(error).toBeNull();
    expect(moved?.status).toBe("in_progress");
    expect(moved?.local_date).toBeNull();
    expect(moved?.completed_at).toBeNull();
  });

  it("9 — cannot link foreign goal item", async () => {
    const fakeItem = "00000000-0000-4000-8000-000000000099";
    const client = await userClient();
    const { error } = await client.from("tasks").insert({
      title: "hijack",
      status: "backlog",
      position: "z9",
      goal_item_id: fakeItem,
    });
    expect(error).toBeTruthy();
  });

  it("10 — selectGoalProgress 1 of 50 is 2%", () => {
    const items: GoalItemRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`,
      title: `Item ${i}`,
      status: i === 0 ? "done" : "not_started",
      position: `p${i}`,
      statusChangedAt: new Date().toISOString(),
    }));
    const p = selectGoalProgress(items);
    expect(p).toEqual({ state: "ratio", done: 1, active: 50, percent: 2 });
    expect(selectGoalProgress([])).toEqual({ state: "empty" });
  });

  it("7 — bulk_insert_goal_items is atomic", async () => {
    const client = await userClient();
    const { data: goal, error: gErr } = await client
      .from("goals")
      .insert({ title: "Bulk goal", position: "g1" })
      .select()
      .single();
    expect(gErr).toBeNull();
    const titles = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const { data: inserted, error } = await client.rpc(
      "bulk_insert_goal_items",
      {
        p_goal_id: goal!.id,
        p_titles: titles,
        p_idempotency_key: `bulk-${goal!.id}`,
      },
    );
    expect(error).toBeNull();
    expect(inserted?.length).toBe(50);
    const { count } = await client
      .from("goal_items")
      .select("*", { count: "exact", head: true })
      .eq("goal_id", goal!.id);
    expect(count).toBe(50);
  });
});