/**
 * Create confirmed owner user for UAT when signup is rate-limited (admin API).
 * Uses owner@dayboard.test unless ALLOWED_OWNER_EMAIL / UAT_OWNER_EMAIL is set.
 */
import { createClient } from "@supabase/supabase-js";
import "./load-env-bridge";
import { seedOwnerDefaultsForProfile } from "./seed-owner-defaults";

const EMAIL =
  process.env.UAT_OWNER_EMAIL ??
  process.env.ALLOWED_OWNER_EMAIL ??
  "owner@dayboard.test";
const PASSWORD =
  process.env.E2E_OWNER_PASSWORD ??
  process.env.UAT_OWNER_PASSWORD ??
  "dayboard-test-password-1";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase URL + SUPABASE_SECRET_KEY required");

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: singleton } = await admin
    .from("app_singleton")
    .select("allowed_owner_email")
    .eq("id", 1)
    .single();
  if (!singleton?.allowed_owner_email) {
    throw new Error("app_singleton missing — run pnpm db:push:cloud first");
  }

  const allowed = singleton.allowed_owner_email.toLowerCase();
  if (EMAIL.toLowerCase() !== allowed) {
    console.log(
      `Updating allowlist to ${EMAIL} (was ${singleton.allowed_owner_email})`,
    );
    await admin
      .from("app_singleton")
      .update({ allowed_owner_email: EMAIL })
      .eq("id", 1);
  }

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const existing = listed.data?.users.find(
    (u) => u.email?.toLowerCase() === EMAIL.toLowerCase(),
  );

  let ownerId: string;

  if (existing) {
    ownerId = existing.id;
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    console.log(`bootstrap-owner: updated password for ${EMAIL}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    ownerId = data.user!.id;
    console.log(`bootstrap-owner: created ${EMAIL}`);
  }

  await seedOwnerDefaultsForProfile(admin, ownerId);
  console.log(`bootstrap-owner: ensured default money rows for ${EMAIL}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});