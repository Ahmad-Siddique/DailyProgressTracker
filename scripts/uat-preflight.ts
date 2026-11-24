/**
 * Browser UAT preflight — run before manual or agent UAT.
 * Loads .env.local via tests/load-env.ts (same as integration tests).
 */
import "./load-env-bridge";
import { createClient } from "@supabase/supabase-js";

type Check = { id: string; ok: boolean; detail: string };

const PLACEHOLDER_SNIPPETS =
  /paste-here|paste-anon|paste-your|YOUR_PROJECT|pick-a-strong-test|generate-a-long-random-string/i;

function envPresent(name: string, alt?: string, minLen = 1): boolean {
  const v = process.env[name] ?? (alt ? process.env[alt] : undefined);
  const t = v?.trim() ?? "";
  if (t.length < minLen) return false;
  if (PLACEHOLDER_SNIPPETS.test(t)) return false;
  return true;
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  checks.push({
    id: "E1",
    ok: envPresent("NEXT_PUBLIC_SUPABASE_URL"),
    detail: "NEXT_PUBLIC_SUPABASE_URL set and not placeholder",
  });
  checks.push({
    id: "E2",
    ok: envPresent(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ),
    detail: "Publishable (or legacy anon) key set",
  });
  checks.push({
    id: "E3",
    ok: envPresent("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    detail: "Secret (service) key set — preflight + integration only",
  });
  checks.push({
    id: "E4",
    ok: envPresent("AI_TURN_SECRET", undefined, 16),
    detail: "AI_TURN_SECRET set (≥16 chars, AI chat/preview)",
  });
  checks.push({
    id: "E5",
    ok: envPresent("OPENROUTER_API_KEY"),
    detail: "OPENROUTER_API_KEY set",
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && secret) {
    const admin = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: singletonErr } = await admin
      .from("app_singleton")
      .select("id")
      .limit(1);
    const migrationsOk = !singletonErr;
    const dbPw =
      process.env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DATABASE_PASS;
    checks.push({
      id: "D1",
      ok: migrationsOk,
      detail: migrationsOk
        ? "public.app_singleton exists (migrations applied)"
        : `Migrations missing: ${singletonErr?.message ?? "unknown"} — run: pnpm db:push:cloud${dbPw ? "" : " (set SUPABASE_DB_PASSWORD first)"}`,
    });

    if (migrationsOk) {
      const { data: row, error } = await admin
        .from("app_singleton")
        .select("allowed_owner_email")
        .eq("id", 1)
        .single();
      checks.push({
        id: "D2",
        ok: Boolean(row?.allowed_owner_email?.includes("@")),
        detail: row?.allowed_owner_email
          ? `Allowlist: ${row.allowed_owner_email}`
          : error?.message ?? "No allowlist row",
      });
    }

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 5 });
    checks.push({
      id: "D3",
      ok: !users.error,
      detail: users.error
        ? users.error.message
        : `Auth users: ${users.data.users.length} (0 until first signup)`,
    });
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} [${c.id}] ${c.detail}`);
  }

  if (failed.length) {
    console.log(
      "\nPreflight failed. See docs/BROWSER_UAT.md § Preconditions before browser UAT.",
    );
    process.exit(1);
  }
  console.log("\nPreflight OK — start pnpm dev and run docs/BROWSER_UAT.md.");
  process.exit(0);
}

main();