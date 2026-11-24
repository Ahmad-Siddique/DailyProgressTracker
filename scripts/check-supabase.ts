#!/usr/bin/env node
/**
 * Phase 0 integration probe: local Supabase PostgREST or skip with SUPABASE_SKIP=1.
 * SUPABASE_TRY_START=1 runs `pnpm dlx supabase start` when Docker is up.
 */
import "./load-env-bridge";
import { execSync } from "node:child_process";

function restUrl(): string | null {
  const raw =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw?.trim() || /YOUR_|paste-/i.test(raw)) return null;
  const base = raw.replace(/\/$/, "");
  return `${base}/rest/v1/`;
}

function publishableKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key?.trim() || /paste-|your-publishable|your-anon/i.test(key)) return null;
  return key.trim();
}

function log(msg: string): void {
  console.log(`[check-supabase] ${msg}`);
}

async function pingPostgrest(): Promise<boolean> {
  const REST_URL = restUrl();
  const key = publishableKey();
  if (!REST_URL || !key) return false;
  try {
    const res = await fetch(REST_URL, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    const server = res.headers.get("server") ?? "";
    if (/postgrest/i.test(server)) return true;
    const via = res.headers.get("via") ?? "";
    if (/kong/i.test(via) && res.status > 0) return true;
    return false;
  } catch {
    return false;
  }
}

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function tryStartSupabase(): boolean {
  if (process.env.SUPABASE_TRY_START !== "1") return false;
  if (!dockerAvailable()) {
    log("SUPABASE_TRY_START=1 but Docker is not ready.");
    return false;
  }
  log("Running: pnpm dlx supabase@2.58.5 start (may take several minutes)…");
  try {
    execSync("pnpm dlx supabase@2.58.5 start", {
      stdio: "inherit",
      timeout: 600_000,
    });
    return true;
  } catch (e) {
    log(`supabase start failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function printStartHelp(): void {
  const target = restUrl() ?? "(set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local)";
  log(`PostgREST is not reachable at ${target}`);
  if (!restUrl() || !publishableKey()) {
    log("Set cloud keys in .env.local — see .env.example and supabase/CLOUD.md");
  }
  if (dockerAvailable()) {
    log("Or local: SUPABASE_TRY_START=1 pnpm test:integration after supabase start");
  } else {
    log("Docker does not appear to be available.");
    try {
      execSync("Start-Process \"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe\"", {
        stdio: "ignore",
      });
      log("Attempted to start Docker Desktop. Retry after it is ready.");
    } catch {
      /* ignore */
    }
    log("Set SUPABASE_SKIP=1 to skip until Phase 1 local DB is required.");
  }
}

async function main(): Promise<void> {
  if (process.env.SUPABASE_SKIP === "1") {
    log(
      "SUPABASE_SKIP=1 — skipping integration probe (vitest integration tests also skip).",
    );
    process.exit(0);
  }

  if (await pingPostgrest()) {
    log(`PostgREST reachable: ${restUrl()}`);
    process.exit(0);
  }

  if (tryStartSupabase() && (await pingPostgrest())) {
    log(`PostgREST reachable after start: ${restUrl()}`);
    process.exit(0);
  }

  printStartHelp();
  process.exit(1);
}

main();