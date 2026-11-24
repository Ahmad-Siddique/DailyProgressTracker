import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS, REPO_ROOT } from "./paths.js";

describe("Phase 0 — quality.md release trace", () => {
  it("release trace table mentions module doc files", () => {
    const quality = fs.readFileSync(
      path.join(REPO_ROOT, "docs/quality.md"),
      "utf8",
    );
    const traceStart = quality.indexOf("## Release trace");
    expect(traceStart).toBeGreaterThan(-1);
    const trace = quality.slice(traceStart);
    for (const rel of MODULE_DOCS) {
      if (rel === "docs/quality.md") continue;
      expect(trace, `release trace should cite ${rel}`).toContain(rel);
    }
  });
});