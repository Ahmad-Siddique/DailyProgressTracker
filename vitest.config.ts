import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    root,
    setupFiles: ["./tests/load-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
});