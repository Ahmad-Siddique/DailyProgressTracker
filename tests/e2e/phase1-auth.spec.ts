import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { TIMEZONE_CHANGE_WARNING } from "../../src/lib/timezones";
import {
  OWNER_EMAIL,
  OWNER_PASSWORD,
  signInOwner,
  waitForSettingsReady,
  WRONG_EMAIL,
} from "./helpers/auth";

function secretHits(requestUrl: string, headers: Record<string, string>): boolean {
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  const blob = `${requestUrl} ${JSON.stringify(headers)}`;
  if (serviceKey && blob.includes(serviceKey)) return true;
  if (/service_role/i.test(blob)) return true;
  return false;
}

async function monitorNoServiceRole(page: Page) {
  page.on("request", (req) => {
    const headers = req.headers();
    expect(secretHits(req.url(), headers)).toBe(false);
  });
}

const skipPhase1 =
  process.env.PHASE1_E2E_SKIP === "1" || process.env.SUPABASE_SKIP === "1";

test.describe("Phase 1 auth and shell", () => {
  test.skip(skipPhase1, "Set local Supabase and unset SUPABASE_SKIP for Phase 1 e2e");
  test.beforeEach(async ({ page }) => {
    await monitorNoServiceRole(page);
  });

  test("sign in, reload, session persists", async ({ page }) => {
    await signInOwner(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("wrong email shows private message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(WRONG_EMAIL);
    await page.getByLabel("Password").fill("wrong-password-99");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.locator("p[role='alert']")).toContainText("This app is private");
  });

  test("wrong password shows credentials message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill("wrong-password-99");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p[role='alert']")).toHaveText(
      "Email or password is wrong.",
    );
  });

  test("theme dark survives reload", async ({ page }) => {
    await signInOwner(page);
    await waitForSettingsReady(page);
    await page.getByRole("button", { name: "dark" }).click();
    await expect(page.getByText("Theme saved.")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "dark", pressed: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 15_000 });
  });

  test("theme light survives reload", async ({ page }) => {
    await signInOwner(page);
    await waitForSettingsReady(page);
    await page.getByRole("button", { name: "light" }).click();
    await expect(page.getByText("Theme saved.")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "light", pressed: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveClass(/light/, { timeout: 15_000 });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("theme system survives reload", async ({ page }) => {
    await signInOwner(page);
    await waitForSettingsReady(page);
    await page.getByRole("button", { name: "system" }).click();
    await expect(page.getByText("Theme saved.")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "system", pressed: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveClass(/light|dark/, { timeout: 15_000 });
  });

  test("timezone change shows warning and saves", async ({ page }) => {
    await signInOwner(page);
    await waitForSettingsReady(page);
    const tz = page.getByLabel("Timezone");
    const current = await tz.inputValue();
    const next = current === "UTC" ? "Asia/Karachi" : "UTC";
    await tz.selectOption(next);
    await expect(page.getByText(TIMEZONE_CHANGE_WARNING)).toBeVisible();
    await page.getByRole("button", { name: "Save timezone" }).click();
    await expect(page.getByText("Timezone saved.")).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await waitForSettingsReady(page);
    await expect(page.getByLabel("Timezone")).toHaveValue(next);
  });

  test("keyboard path login → theme → sign out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").focus();
    await page.keyboard.type(OWNER_EMAIL);
    await page.keyboard.press("Tab");
    await page.keyboard.type(OWNER_PASSWORD);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
    await waitForSettingsReady(page);
    await page.getByRole("button", { name: "dark" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Theme saved.")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Sign out" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login/);
  });

  test("navigation includes Today, Board, Goals, and Money", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/today");
    for (const label of ["Today", "Board", "Goals", "Money"]) {
      await expect(page.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("axe clean on login, today, and settings @a11y", async ({ page }) => {
    await page.goto("/login");
    let axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((v) => v.impact === "critical"),
    ).toEqual([]);

    await signInOwner(page);
    await page.goto("/today");
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);

    await waitForSettingsReady(page);
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});