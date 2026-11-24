import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS, REPO_ROOT } from "./paths.js";

describe("Phase 0 — documentation set", () => {
  it("README and all ten module specs exist", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "README.md"))).toBe(true);
    for (const rel of MODULE_DOCS) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel)), rel).toBe(true);
    }
  });
});