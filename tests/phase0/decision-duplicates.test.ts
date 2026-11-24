import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./paths.js";

describe("Phase 0 — decision id uniqueness", () => {
  it("has no duplicate decision ids in architecture decisions table", () => {
    const arch = fs.readFileSync(
      path.join(REPO_ROOT, "docs/architecture.md"),
      "utf8",
    );
    const section = arch.slice(arch.indexOf("| Id | Decision |"));
    const ids = [...section.matchAll(/\| (A-\d+) \|/g)].map((m) => m[1]);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
    expect(ids.length).toBe(24);
  });
});