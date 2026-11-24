import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "supabase", "migrations");
const out = path.join(process.cwd(), "supabase", "cloud-all-migrations.sql");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const chunks = files.map((f) => {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  return `-- ## ${f}\n${sql}`;
});

fs.writeFileSync(
  out,
  `-- Run once in Supabase SQL Editor if pnpm db:push:cloud is unavailable.\n-- Files: ${files.length}\n\n${chunks.join("\n\n")}\n`,
);
console.log(`Wrote ${out} (${files.length} migrations)`);