import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function globalSetup(): void {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const opts = { stdio: "inherit" as const, cwd: root };
  execSync("pnpm inventory", opts);
  execSync("pnpm phase0:report", opts);
}