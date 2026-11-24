import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "@playwright/test";

import { signInOwner, waitForSettingsReady } from "./helpers/auth";

const skip =
  process.env.PHASE1_E2E_SKIP === "1" || process.env.SUPABASE_SKIP === "1";
/** Offline navigation is flaky in Playwright; opt in with PHASE5_OFFLINE_E2E_SKIP=0 */
const skipOffline = process.env.PHASE5_OFFLINE_E2E_SKIP !== "0";
/** Notification.requestPermission is flaky in some headless/CI setups; opt out with PHASE5_NOTIFICATION_E2E_SKIP=1 */
const skipNotification = process.env.PHASE5_NOTIFICATION_E2E_SKIP === "1";



test.describe("Phase 5 PWA", () => {

  test.skip(skip, "Local Supabase required");



  test("offline banner and settings axe", async ({ page }) => {

    test.skip(

      skipOffline,

      "Offline e2e off by default — set PHASE5_OFFLINE_E2E_SKIP=0 to run",

    );

    await signInOwner(page);

    await page.context().setOffline(true);

    await expect(page.getByTestId("offline-banner")).toBeVisible({

      timeout: 15_000,

    });

    await page.getByRole("link", { name: "Settings" }).click();

    const results = await new AxeBuilder({ page }).analyze();

    expect(

      results.violations.filter(

        (v) => v.impact === "critical" || v.impact === "serious",

      ),

    ).toEqual([]);

  });



  test("reminders off does not request permission on load", async ({ page }) => {
    test.skip(
      skipNotification,
      "Notification permission e2e off — unset PHASE5_NOTIFICATION_E2E_SKIP to run",
    );
    await page.addInitScript(() => {
      const orig = Notification.requestPermission;
      Notification.requestPermission = async () => {
        (window as Window & { __asked?: boolean }).__asked = true;
        return orig.call(Notification);
      };
    });
    await signInOwner(page);
    await waitForSettingsReady(page);
    await expect(
      page.getByRole("checkbox", { name: "Enable reminders" }),
    ).not.toBeChecked();
    const asked = await page.evaluate(() =>
      Boolean((window as Window & { __asked?: boolean }).__asked),
    );
    expect(asked).toBe(false);
  });



  test("offline task create via quick add", async ({ page }) => {

    test.skip(

      skipOffline,

      "Offline e2e off by default — set PHASE5_OFFLINE_E2E_SKIP=0 to run",

    );

    await signInOwner(page);

    await page.getByRole("link", { name: "Board" }).click();

    await page.context().setOffline(true);

    await page.getByRole("button", { name: "Quick Add" }).click();

    await page.getByLabel("Title").fill(`Airplane task ${Date.now()}`);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Waiting to save")).toBeVisible({

      timeout: 10_000,

    });

  });

});
