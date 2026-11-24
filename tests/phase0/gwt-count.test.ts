import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countGwtSteps } from "./gwt.js";
import { GWT_SPEC_FILES, REPO_ROOT } from "./paths.js";

describe("Phase 0 — Given/When/Then coverage", () => {
  it("has at least 100 GWT steps in module specs and phases.md", () => {
    let total = 0;
    for (const rel of GWT_SPEC_FILES) {
      total += countGwtSteps(
        fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"),
      );
    }
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it("each module spec has at least one GWT step", () => {
    for (const rel of GWT_SPEC_FILES) {
      if (rel === "docs/phases.md") continue;
      const n = countGwtSteps(
        fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"),
      );
      expect(n, rel).toBeGreaterThanOrEqual(1);
    }
  });
});