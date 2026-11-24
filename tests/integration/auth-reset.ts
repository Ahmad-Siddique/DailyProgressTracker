import type { SupabaseClient } from "@supabase/supabase-js";

/** Wipe auth users only when INTEGRATION_RESET=1 (keeps cloud UAT owner by default). */
export function integrationShouldResetUsers(): boolean {
  return process.env.INTEGRATION_RESET === "1";
}

export async function wipeAllAuthUsers(admin: SupabaseClient): Promise<void> {
  if (!integrationShouldResetUsers()) return;
  const { data: users, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  for (const u of users.users) {
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
    if (delErr) throw delErr;
  }
}

export async function ensureIntegrationOwner(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<void> {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
}