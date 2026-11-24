import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInOwner } from "./helpers/auth";

const skipPhase2 =
  process.env.PHASE2_E2E_SKIP === "1" || process.env.SUPABASE_SKIP === "1";

test.describe("Phase 2 board and goals", () => {
  test.skip(skipPhase2, "Set local Supabase and unset SUPABASE_SKIP for Phase 2 e2e");

  test.beforeEach(async ({ page }) => {
    await signInOwner(page);
  });

  test("1 — title-only task stays in Backlog after reload", async ({ page }) => {
    const title = `E2E backlog ${Date.now()}`;
    await page.goto("/board");
    await page.getByRole("button", { name: "Quick Add" }).click();
    await page.getByLabel("Title").fill(title);
    await expect(page.getByTestId("task-time-preview")).toContainText(
      "No time will be saved.",
    );
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("heading", { name: title, level: 3 }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, level: 3 }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Backlog/ })).toBeVisible();
  });

  test("2 — keyboard Move to In Progress then Done", async ({ page }) => {
    await page.goto("/board");
    await page.getByRole("button", { name: "Quick Add" }).click();
    const title = `Move test ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Save" }).click();
    const card = page.locator("article", { hasText: title });
    await card.locator("summary").filter({ hasText: /^Move$/ }).click();
    await card.getByRole("menuitem", { name: "In Progress" }).click();
    const inProgressCol = page.locator(
      'section[aria-labelledby="col-in_progress"]',
    );
    await expect(
      inProgressCol.locator("article", { hasText: title }),
    ).toBeVisible({ timeout: 15_000 });
    const inProgressCard = inProgressCol.locator("article", { hasText: title });
    await inProgressCard.locator("summary").filter({ hasText: /^Move$/ }).click();
    await inProgressCard.getByRole("menuitem", { name: "Done" }).click();
    const doneCol = page.locator('section[aria-labelledby="col-done"]');
    await expect(
      doneCol.locator("article", { hasText: title }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("3 — Quick Add time preview before save", async ({ page }) => {
    await page.getByRole("button", { name: "Quick Add" }).click();
    await page.getByLabel("Title").fill("Standup 9:30am");
    const preview = page.getByTestId("task-time-preview");
    await expect(preview).toContainText("Will save as");
    await expect(preview).toContainText("9:30 AM");
    await page.getByRole("button", { name: "Save" }).click();
  });

  test("4 — Today shows overdue card", async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    test.skip(!supabaseUrl, "Needs Supabase for overdue fixture");
    await page.goto("/today");
    await page.getByRole("heading", { name: "Today" }).waitFor();
  });

  test("5 — bulk paste 50 items shows 2% after one done", async ({ page }) => {
    await page.goto("/goals");
    const goalTitle = `Bulk goal ${Date.now()}`;
    await page.getByLabel("Add goal").fill(goalTitle);
    await page.getByRole("button", { name: "Save goal" }).click();
    await page.getByRole("link", { name: goalTitle }).click();
    const lines = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}`).join(
      "\n",
    );
    await page.getByLabel("Paste items").fill(lines);
    await expect(page.getByTestId("bulk-preview")).toContainText("50 items");
    await page.getByRole("button", { name: "Insert 50 items" }).click();
    await expect(page.getByTestId("goal-progress")).toContainText("0 of 50");
    await page
      .locator("[data-item-id]")
      .first()
      .getByRole("button", { name: "Done" })
      .click();
    await expect(page.getByTestId("goal-progress")).toContainText(
      "1 of 50 (2%)",
    );
  });

  test("6 — navigation includes Board and Goals", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("link", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Goals" })).toBeVisible();
  });

  test("axe clean on Today, Board, goal detail @a11y", async ({ page }) => {
    await page.goto("/today");
    let axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);

    await page.goto("/board");
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);

    await page.goto("/goals");
    const goalTitle = `A11y goal ${Date.now()}`;
    await page.getByLabel("Add goal").fill(goalTitle);
    await page.getByRole("button", { name: "Save goal" }).click();
    await page.getByRole("link", { name: goalTitle }).click();
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});