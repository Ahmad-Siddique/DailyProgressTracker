import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInOwner } from "./helpers/auth";

const skipPhase4 =
  process.env.PHASE4_E2E_SKIP === "1" || process.env.SUPABASE_SKIP === "1";

/** `AiHeaderButton` in `ai-shell.tsx` — header button, not nav link. */
function aiToggle(page: Page) {
  return page.locator("header").getByRole("button", { name: "AI", exact: true });
}

/** Inner panel in `ai-panel.tsx`: role=dialog, aria-label Dayboard AI. */
function aiPanel(page: Page) {
  return page.getByRole("dialog", { name: "Dayboard AI" });
}

test.describe("Phase 4 AI panel", () => {
  test.skip(skipPhase4, "Local Supabase required");

  test.beforeEach(async ({ page }) => {
    await signInOwner(page);
    await expect(aiToggle(page)).toBeVisible();
  });

  test("opens panel and shows finance off", async ({ page }) => {
    await aiToggle(page).click();
    await expect(aiPanel(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Turn finance on" }),
    ).toBeVisible();
  });

  test("axe on open panel", async ({ page }) => {
    await aiToggle(page).click();
    await expect(aiPanel(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"][aria-label="Dayboard AI"]')
      .analyze();
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);
  });
});