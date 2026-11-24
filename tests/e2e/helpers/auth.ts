import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL =
  process.env.ALLOWED_OWNER_EMAIL ?? "owner@dayboard.test";
export const OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ?? "dayboard-test-password-1";
export const WRONG_EMAIL =
  process.env.E2E_WRONG_EMAIL ?? "not-owner@dayboard.test";

export async function signInOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await expect(page).toHaveURL(/\/today/, { timeout: 8_000 });
    return;
  } catch {
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  }
}

/** Wait until settings profile form is hydrated (not skeleton). */
export async function waitForSettingsReady(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Timezone")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Loading settings")).toHaveCount(0);
}