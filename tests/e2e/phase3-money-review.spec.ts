import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "@playwright/test";

import { signInOwner } from "./helpers/auth";



const skipPhase3 =

  process.env.PHASE3_E2E_SKIP === "1" || process.env.SUPABASE_SKIP === "1";



test.describe("Phase 3 money and review", () => {

  test.skip(skipPhase3, "Local Supabase required");



  test.beforeEach(async ({ page }) => {

    await signInOwner(page);

  });



  test("Money and Review routes render", async ({ page }) => {

    await page.goto("/money");

    await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();

    await page.goto("/review");

    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();

  });



  test("Export downloads buttons", async ({ page }) => {

    await page.goto("/export");

    await expect(page.getByRole("button", { name: /Download CSV/ })).toBeVisible();

    await expect(

      page.getByRole("button", { name: /backup.json/ }),

    ).toBeVisible();

  });



  test("axe on Money and Review", async ({ page }) => {

    await page.goto("/money");

    const moneyAxe = await new AxeBuilder({ page }).analyze();

    expect(moneyAxe.violations.filter((v) => v.impact === "critical")).toEqual(

      [],

    );

    await page.goto("/review");

    const reviewAxe = await new AxeBuilder({ page }).analyze();

    expect(reviewAxe.violations.filter((v) => v.impact === "critical")).toEqual(

      [],

    );

  });

});
