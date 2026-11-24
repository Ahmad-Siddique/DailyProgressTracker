import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Client bundle only — server API routes may reference env names in source maps.
const clientDir = path.join(root, "..", ".next", "static");

const patterns = [
  "OPENROUTER_API_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function walk(dir: string, hits: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, hits);
    } else if (stat.isFile() && /\.(js|css|map)$/.test(name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const p of patterns) {
        if (text.includes(p)) hits.push(`${full} (${p})`);
      }
    }
  }
}

const hits: string[] = [];
walk(clientDir, hits);

if (hits.length > 0) {
  console.error("Release secret check failed:");
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log("Release secret check passed (.next clean).");