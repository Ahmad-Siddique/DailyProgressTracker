import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECISION_IDS, REPO_ROOT } from "./paths.js";
import {
  decisionsTableSection,
  extractDecisionIds,
} from "../../spec/contract.js";

describe("Phase 0 — architecture.md", () => {
  const text = fs.readFileSync(
    path.join(REPO_ROOT, "docs/architecture.md"),
    "utf8",
  );

  it("lists decisions A-1 through A-24 exactly once each", () => {
    const section = decisionsTableSection(text);
    for (const id of DECISION_IDS) {
      const matches = section.match(new RegExp(`\\| ${id} \\|`, "g"));
      expect(matches?.length ?? 0, id).toBe(1);
    }
    expect(extractDecisionIds(text).length).toBe(24);
  });

  it("selector table rows mention src/features paths", () => {
    const tableSection = text.slice(text.indexOf("### Canonical selectors"));
    const rows = tableSection
      .split("\n")
      .filter((line) => line.startsWith("| `select"));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const row of rows) {
      expect(row).toMatch(/src\/features\//);
    }
  });
});