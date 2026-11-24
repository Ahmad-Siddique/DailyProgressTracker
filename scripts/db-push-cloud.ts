/**
 * Push supabase/migrations to cloud Postgres (no Supabase CLI login required).
 * Requires SUPABASE_DB_PASSWORD in .env.local (Dashboard → Project Settings → Database).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import "../tests/load-env";

function projectRefFromUrl(url: string): string {
  const host = new URL(url).hostname;
  const ref = host.split(".")[0];
  if (!ref || ref === "localhost") throw new Error("Invalid SUPABASE_URL for cloud push");
  return ref;
}

function dbUrl(): string {
  const explicit = process.env.SUPABASE_DB_URL?.trim();
  if (explicit && !/password|paste/i.test(explicit)) return explicit;

  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    process.env.SUPABASE_DATABASE_PASS?.trim();
  if (!password) {
    throw new Error(
      "Set SUPABASE_DB_PASSWORD in .env.local (Dashboard → Settings → Database → password).",
    );
  }

  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  const ref = projectRefFromUrl(base);

  const host =
    process.env.SUPABASE_DB_HOST?.trim() ?? `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT ?? "5432";
  const user = process.env.SUPABASE_DB_USER?.trim() ?? "postgres";
  const enc = encodeURIComponent(password);
  return `postgresql://${user}:${enc}@${host}:${port}/postgres?sslmode=require`;
}

function migrationFiles(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

async function ensureHistory(client: pg.Client): Promise<void> {
  await client.query("create schema if not exists supabase_migrations");
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    )
  `);
}

async function appliedVersions(client: pg.Client): Promise<Set<string>> {
  const res = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations",
  );
  return new Set(res.rows.map((r) => r.version));
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    await ensureHistory(client);
    const done = await appliedVersions(client);
    const files = migrationFiles();

    for (const file of files) {
      const version = path.basename(file, ".sql");
      if (done.has(version)) {
        console.log(`skip ${version}`);
        continue;
      }
      const sql = fs.readFileSync(file, "utf8");
      console.log(`apply ${version}…`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)`,
          [version, [], path.basename(file)],
        );
        await client.query("commit");
        console.log(`ok ${version}`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }

    const { rows } = await client.query<{ reg: string }>(
      `select to_regclass('public.app_singleton')::text as reg`,
    );
    if (!rows[0]?.reg) throw new Error("app_singleton missing after push");
    console.log("\ndb-push-cloud: all migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});