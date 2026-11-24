import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateProfileWithVersion } from "../../src/lib/profile";
import { sha256Hex } from "../../src/lib/mutation-receipt";
import type {
  Database,
  ProfileRow,
} from "../../src/types/database";

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
import {
  integrationShouldResetUsers,
  wipeAllAuthUsers,
} from "./auth-reset";

function admin() {
  return createClient(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(skip)("Phase 1 profiles integration", () => {
  beforeAll(async () => {
    await wipeAllAuthUsers(admin());
  }, 120_000);

  afterAll(async () => {
    await wipeAllAuthUsers(admin());
  }, 60_000);

  it("1 — anonymous select on profiles returns nothing", async () => {
    const anon = createClient(URL, PUBLISHABLE);
    const { data, error } = await anon.from("profiles").select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("2 — allowlisted owner gets one profile; others fail", async () => {
    const supabase = admin();
    if (integrationShouldResetUsers()) {
      await wipeAllAuthUsers(supabase);
    }

    const { data: created, error: signErr } = await supabase.auth.admin.createUser(
      {
        email: ALLOWED,
        password: PASSWORD,
        email_confirm: true,
      },
    );
    if (!integrationShouldResetUsers() && signErr) {
      expect(signErr.message.toLowerCase()).toMatch(/already|registered|exists/);
    } else {
      expect(signErr).toBeNull();
      expect(created.user).toBeTruthy();
    }

    const { data: profiles } = await supabase.from("profiles").select("*");
    const rows = profiles as Database["public"]["Tables"]["profiles"]["Row"][] | null;
    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.timezone).toBe("Asia/Karachi");
    expect(rows?.[0]?.theme).toBe("system");

    const intruderClient = createClient(URL, PUBLISHABLE);
    const { error: secondEmail } = await intruderClient.auth.signUp({
      email: "intruder@dayboard.test",
      password: PASSWORD,
    });
    expect(secondEmail).toBeTruthy();

    const { error: adminIntruder } = await supabase.auth.admin.createUser({
      email: "admin-intruder@dayboard.test",
      password: PASSWORD,
      email_confirm: true,
    });
    expect(adminIntruder).toBeTruthy();

    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });
    expect(count).toBe(1);

    const { error: dup } = await supabase.auth.admin.createUser({
      email: ALLOWED,
      password: PASSWORD,
      email_confirm: true,
    });
    expect(dup).toBeTruthy();
  });

  it("3 — cannot update another profile id", async () => {
    const userClient = createClient(URL, PUBLISHABLE);
    const { data: signIn, error } = await userClient.auth.signInWithPassword({
      email: ALLOWED,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    const uid = signIn.user?.id;
    expect(uid).toBeTruthy();

    const fakeId = "00000000-0000-4000-8000-000000000099";
    const { data, error: updErr } = await userClient
      .from("profiles")
      .update({ display_name: "hacked" })
      .eq("id", fakeId)
      .select();
    expect(updErr).toBeNull();
    expect(data).toEqual([]);
  });

  it("4 — version mismatch updates zero rows", async () => {
    const userClient = createClient(URL, PUBLISHABLE);
    await userClient.auth.signInWithPassword({
      email: ALLOWED,
      password: PASSWORD,
    });
    const { data: rawRow } = await userClient
      .from("profiles")
      .select("*")
      .maybeSingle();
    const row = rawRow as Database["public"]["Tables"]["profiles"]["Row"] | null;
    expect(row).toBeTruthy();
    if (!row) return;

    const stale = row.version - 1 > 0 ? row.version - 1 : 0;
    const { data, error } = await userClient
      .from("profiles")
      .update({ theme: "dark", version: row.version + 1 })
      .eq("id", row.id)
      .eq("version", stale)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillRaw } = await userClient
      .from("profiles")
      .select("theme, version")
      .eq("id", row.id)
      .single();
    const still = stillRaw as Pick<ProfileRow, "theme" | "version"> | null;
    expect(still?.theme).toBe(row.theme);
    expect(still?.version).toBe(row.version);
  });

  it.skipIf(!integrationShouldResetUsers())(
    "5 — anon signUp allowlisted creates profile defaults",
    async () => {
    const supabase = admin();
    await wipeAllAuthUsers(supabase);

    const anon = createClient(URL, PUBLISHABLE);
    const { data: signUp, error } = await anon.auth.signUp({
      email: ALLOWED,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    expect(signUp.user?.id).toBeTruthy();

    const { data: rowRaw } = await anon
      .from("profiles")
      .select("*")
      .maybeSingle();
    const row = rowRaw as ProfileRow | null;
    expect(row?.email).toBe(ALLOWED);
    expect(row?.timezone).toBe("Asia/Karachi");
    expect(row?.theme).toBe("system");
    expect(row?.reporting_currency).toBe("PKR");
    expect(row?.version).toBe(1);
  },
  );

  it("6 — successful theme update increments version", async () => {
    const userClient = createClient(URL, PUBLISHABLE);
    await userClient.auth.signInWithPassword({
      email: ALLOWED,
      password: PASSWORD,
    });
    const { data: rawRow } = await userClient
      .from("profiles")
      .select("*")
      .maybeSingle();
    const row = rawRow as ProfileRow | null;
    expect(row).toBeTruthy();
    if (!row) return;

    const patch = { theme: "dark" as const };
    const result = await updateProfileWithVersion(userClient, row, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.version).toBe(row.version + 1);
    expect(result.profile.theme).toBe("dark");
  });

  it("7 — mutation_receipt after profile update via helper", async () => {
    const userClient = createClient(URL, PUBLISHABLE);
    await userClient.auth.signInWithPassword({
      email: ALLOWED,
      password: PASSWORD,
    });
    const { data: rawRow } = await userClient
      .from("profiles")
      .select("*")
      .maybeSingle();
    const row = rawRow as ProfileRow | null;
    expect(row).toBeTruthy();
    if (!row) return;

    const patch = { theme: "light" as const };
    const result = await updateProfileWithVersion(userClient, row, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const requestHash = await sha256Hex(JSON.stringify(patch));
    const idempotencyKey = `${row.id}:v${row.version}:${requestHash}`;

    const { data: receiptRaw, error } = await userClient
      .from("mutation_receipts")
      .select("idempotency_key, request_hash, resource_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    expect(error).toBeNull();
    const receipt = receiptRaw as {
      idempotency_key: string;
      request_hash: string;
      resource_id: string | null;
    } | null;
    expect(receipt?.idempotency_key).toBe(idempotencyKey);
    expect(receipt?.request_hash).toBe(requestHash);
    expect(receipt?.resource_id).toBe(row.id);
  });
});