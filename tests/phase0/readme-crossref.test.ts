import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS, REPO_ROOT } from "./paths.js";

describe("Phase 0 — README cross-reference", () => {
  it("lists the same ten docs paths as the module set", () => {
    const readme = fs.readFileSync(
      path.join(REPO_ROOT, "README.md"),
      "utf8",
    );
    for (const rel of MODULE_DOCS) {
      expect(readme, `README missing ${rel}`).toContain(rel);
    }
  });
});