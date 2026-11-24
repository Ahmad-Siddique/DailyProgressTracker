/**
 * Idempotent default categories, Cash account, and savings fund for the owner profile.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "./load-env-bridge";

export async function seedOwnerDefaultsForProfile(
  admin: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const { error } = await admin.rpc("seed_owner_defaults_for", {
    p_owner_id: ownerId,
  });
  if (!error) return;

  if (error.code !== "PGRST202" && !error.message.includes("seed_owner_defaults")) {
    throw error;
  }

  await seedOwnerDefaultsInline(admin, ownerId);
}

async function seedOwnerDefaultsInline(
  admin: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const { data: existingAcct } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1);
  if (existingAcct?.length) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("reporting_currency")
    .eq("id", ownerId)
    .single();
  const cur = profile?.reporting_currency ?? "PKR";

  const { error: catErr } = await admin.from("categories").insert([
    { owner_id: ownerId, name: "Food", kind: "expense" },
    { owner_id: ownerId, name: "Salary", kind: "income" },
  ]);
  if (catErr) throw catErr;

  const { error: acctErr } = await admin.from("accounts").insert({
    owner_id: ownerId,
    name: "Cash",
    currency: cur,
    opening_balance_minor: 0,
  });
  if (acctErr) throw acctErr;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 11, 1));
  const deadlineMonth = d.toISOString().slice(0, 10);

  const { error: fundErr } = await admin.from("savings_funds").insert({
    owner_id: ownerId,
    name: "General savings",
    kind: "general",
    currency: cur,
    target_minor: 100_000,
    start_month: monthStart,
    deadline_month: deadlineMonth,
  });
  if (fundErr) throw fundErr;
}

export async function seedOwnerDefaultsForEmail(
  admin: SupabaseClient,
  email: string,
): Promise<void> {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!user?.id) {
    throw new Error(
      `No auth user for ${email} — run bootstrap:owner or sign up first`,
    );
  }
  await seedOwnerDefaultsForProfile(admin, user.id);
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("Supabase URL + SUPABASE_SECRET_KEY required");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main(): Promise<void> {
  const email =
    process.env.UAT_OWNER_EMAIL ??
    process.env.ALLOWED_OWNER_EMAIL ??
    "owner@dayboard.test";
  const admin = adminClient();
  await seedOwnerDefaultsForEmail(admin, email);
  console.log(`seed-owner-defaults: seeded defaults for ${email}`);
}

const invokedDirectly =
  process.argv[1]?.replace(/\\/g, "/").endsWith("seed-owner-defaults.ts") ||
  process.argv[1]?.includes("seed-owner-defaults");

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}