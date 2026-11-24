/** Shared cloud owner credentials (matches bootstrap-owner + e2e). */
export const INTEGRATION_OWNER_EMAIL =
  process.env.UAT_OWNER_EMAIL ??
  process.env.ALLOWED_OWNER_EMAIL ??
  "owner@dayboard.test";

export const INTEGRATION_OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ??
  process.env.UAT_OWNER_PASSWORD ??
  "dayboard-test-password-1";