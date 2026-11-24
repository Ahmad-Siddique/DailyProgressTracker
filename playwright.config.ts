import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(relPath: string): Record<string, string> {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const phase0Base = "http://127.0.0.1:4173";
const phase1Base = "http://127.0.0.1:3000";
/** `.env.local` wins over `.env.test` so cloud credentials are not replaced by placeholders. */
const testEnv = {
  ...loadEnvFile(".env.test"),
  ...loadEnvFile(".env.local"),
  ...loadEnvFile(".env"),
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "phase0",
      testMatch: /phase0-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: phase0Base },
    },
    {
      name: "phase1-mobile",
      testMatch: /phase1-.*\.spec\.ts/,
      grepInvert: /keyboard path/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "phase1-desktop",
      testMatch: /phase1-.*\.spec\.ts/,
      grepInvert: /keyboard path/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase1-keyboard",
      testMatch: /phase1-.*\.spec\.ts/,
      grep: /keyboard path/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
      },
    },
    {
      name: "phase2-desktop",
      testMatch: /phase2-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase2-phone",
      testMatch: /phase2-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "phase3-desktop",
      testMatch: /phase3-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase3-phone",
      testMatch: /phase3-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "phase3-keyboard",
      testMatch: /phase3-.*\.spec\.ts/,
      grep: /keyboard path/i,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase4-desktop",
      testMatch: /phase4-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase4-phone",
      testMatch: /phase4-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "phase5-desktop",
      testMatch: /phase5-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "phase5-phone",
      testMatch: /phase5-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: phase1Base,
        viewport: { width: 360, height: 780 },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm exec serve public -l 4173",
      url: `${phase0Base}/phase0.html`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev",
      url: phase1Base,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...testEnv,
        PORT: "3000",
      },
    },
  ],
});