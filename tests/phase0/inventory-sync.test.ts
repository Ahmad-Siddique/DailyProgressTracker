import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS, countGwtSteps } from "../../spec/contract.js";
import { REPO_ROOT } from "./paths.js";

describe("Phase 0 — acceptance inventory sync", () => {
  it("matches live spec counts when inventory JSON exists", () => {
    const invPath = path.join(
      REPO_ROOT,
      "docs/generated/acceptance-inventory.json",
    );
    if (!fs.existsSync(invPath)) {
      return;
    }
    const inv = JSON.parse(fs.readFileSync(invPath, "utf8")) as {
      docCount: number;
      decisionCount: number;
      gwtTotal: number;
      gwtByDoc: Record<string, number>;
    };
    expect(inv.docCount).toBe(MODULE_DOCS.length);
    expect(inv.decisionCount).toBe(24);

    let gwt = countGwtSteps(
      fs.readFileSync(path.join(REPO_ROOT, "docs/phases.md"), "utf8"),
    );
    for (const rel of MODULE_DOCS) {
      gwt += countGwtSteps(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
    }
    expect(inv.gwtTotal).toBe(gwt);
    for (const rel of MODULE_DOCS) {
      expect(inv.gwtByDoc[rel]).toBe(
        countGwtSteps(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")),
      );
    }
  });
});