# UAT report — 2026-11-23 (updated evening)

## Account / signup

Dayboard is **single-owner**. Sign-up only works when:

1. Email matches `app_singleton.allowed_owner_email` (default `owner@dayboard.test`).
2. **No owner exists yet** — if an account exists, use **Sign in** (UI: “already exists”).
3. Supabase **Confirm email** off for instant session, or confirm then sign in.

Login shows **`NEXT_PUBLIC_OWNER_EMAIL_HINT`** for the allowlisted email.

**New owner with your real email:** SQL `update app_singleton set allowed_owner_email = 'you@…'`, delete old auth user in Dashboard (or `INTEGRATION_RESET=1` + tests), then **Sign up** once.

Helpers: `pnpm bootstrap:owner`, `pnpm seed:owner`.

---

## Default data (categories, account, savings)

| Item | Values |
|------|--------|
| Categories | Food (expense), Salary (income) |
| Account | Cash (reporting currency) |
| Savings fund | General savings |

Seeded via `pnpm seed:owner` (inline fallback if DB function missing). Optional SQL: `supabase/owner-seed-only.sql`.

---

## Test matrix (this run)

| Suite | Result |
|-------|--------|
| Unit `pnpm test` | **55/55 PASS** |
| E2E `pnpm test:e2e` | **~42 PASS**, **4 FAIL**, **7 SKIP** (phone/keyboard/overdue/offline; see CI log) |
| E2E phase1-desktop | **9/9** |
| E2E phase2-desktop | **6 pass**, 1 skip |
| E2E phase3-desktop | **pass** |
| E2E phase4-desktop | **2/2** |
| Integration | **13/26** on live cloud without `INTEGRATION_RESET=1` (shared owner; use reset for full 26) |

**After integration tests:** run `pnpm bootstrap:owner` to restore login.

---

## Browser (MCP)

With fresh `bootstrap:owner`: sign-in, Quick Add expense (Food/Cash options), Money page, AI dialog **verified**.

---

## One-time SQL (optional)

Run `supabase/owner-seed-only.sql` in Supabase so new profiles auto-seed via trigger.