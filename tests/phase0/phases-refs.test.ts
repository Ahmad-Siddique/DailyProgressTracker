import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS, REPO_ROOT } from "./paths.js";

describe("Phase 0 — phases.md references", () => {
  it("references each of the ten module spec files", () => {
    const phases = fs.readFileSync(
      path.join(REPO_ROOT, "docs/phases.md"),
      "utf8",
    );
    for (const rel of MODULE_DOCS) {
      expect(phases, `missing reference to ${rel}`).toContain(rel);
    }
  });
});