import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const AXE = process.env.PHASE0_AXE === "1";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/generated/acceptance-inventory.json"),
    "utf8",
  ),
) as { decisionCount: number; docCount: number };

test.describe("Phase 0 static report", () => {
  test("phase0.html shows title and inventory counts", async ({ page }) => {
    await page.goto("/phase0.html");
    await expect(page).toHaveTitle(/Phase 0 report/);
    await expect(
      page.locator('[data-testid="decision-count"] + dd'),
    ).toHaveText(String(inventory.decisionCount));
    await expect(page.locator('[data-testid="doc-count"] + dd')).toHaveText(
      String(inventory.docCount),
    );
  });

  test("optional axe scan", async ({ page }, testInfo) => {
    test.skip(!AXE, "Set PHASE0_AXE=1 to run axe");
    await page.goto("/phase0.html");
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    if (serious.length > 0) {
      await testInfo.attach("axe-violations", {
        body: JSON.stringify(serious, null, 2),
        contentType: "application/json",
      });
    }
    expect(serious).toEqual([]);
  });
});