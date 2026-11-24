# Auth test plan — signup & sign-in

**App:** single-owner Dayboard · **URL:** `http://localhost:3000/login`  
**Prerequisites:** `pnpm dev`, cloud Supabase, migrations applied, email confirm **off** in Supabase Auth.

**Allowlist:** `app_singleton.allowed_owner_email` must match the email you sign up / sign in with (default `owner@dayboard.test`; see login hint from `NEXT_PUBLIC_OWNER_EMAIL_HINT`).

**Test password (UAT):** `dayboard-test-password-1` (≥ 8 chars)

---

## Preconditions

| ID | Check | Pass |
|----|--------|------|
| P1 | `pnpm uat:preflight` all PASS | |
| P2 | Site URL + redirects include `http://localhost:3000/**` | |
| P3 | Know allowlisted email (login footer hint) | |

---

## 1. Sign up — new owner (first account)

| ID | Step | Expected | Pass | Notes |
|----|------|----------|------|-------|
| SU1 | Open `/login` | Form + owner email hint visible | | |
| SU2 | Email = **allowlisted**, password ≥ 8, click **Sign up** | Redirect to `/today` (if confirm email off) OR message to confirm then sign in | | |
| SU3 | Reload `/today` | Still in app (not bounced to login) | | |
| SU4 | DevTools → Application → cookies | Supabase auth cookies present | | |

**If an owner already exists:** sign-up with another email → private / blocked message. Second sign-up with same email → “already exists — Sign in”.

**Fresh sign-up only when zero auth users** (or after removing the user in Supabase Dashboard → Authentication → Users).

---

## 2. Sign in — existing owner

| ID | Step | Expected | Pass | Notes |
|----|------|----------|------|-------|
| SI1 | Sign out (Settings) or clear site data | `/login` | | |
| SI2 | Allowlisted email + correct password, **Sign in** | `/today`, no “Could not load Today” | | |
| SI3 | Wrong password | “Email or password is wrong.” | | |
| SI4 | Non-allowlisted email + any password | Private-app / blocked message (sign-up or sign-in) | | |
| SI5 | `?next=/board` after sign-in | Lands on `/board` | | |

---

## 3. Automated gates

```powershell
pnpm test -- tests/unit/auth-messages.test.ts
pnpm test:e2e --project=phase1-desktop
```

---

## 4. Recovery commands

```powershell
pnpm bootstrap:owner    # admin create + confirm + default money seed
pnpm seed:owner         # categories / Cash / savings if missing
```

To use **your** email: SQL  
`update public.app_singleton set allowed_owner_email = 'you@example.com' where id = 1;`  
then delete old user in Dashboard if needed, then **Sign up** once.

---

## Execution log (browser agent)

**2026-11-23** · allowlist `owner@dayboard.test` · password `dayboard-test-password-1`

| Date | ID | Result | Notes |
|------|-----|--------|-------|
| 2026-11-23 | SU1 | **PASS** | Hint: “Allowlisted owner email: owner@dayboard.test” |
| 2026-11-23 | P3 | **PASS** | Same hint |
| 2026-11-23 | SI2 | **PASS** | Sign-in → `/today`, Today loads |
| 2026-11-23 | SU3 | **PASS** | Reload stays on `/today` |
| 2026-11-23 | SI4-signup | **PASS** | `intruder@example.com` → stays on login, private-app message |
| 2026-11-23 | SI3 | **PASS** | Wrong password → “Email or password is wrong.” |
| 2026-11-23 | SU-dup | **PASS** | Sign-up existing email → “already exists — Sign in” |
| 2026-11-23 | SU2 | **SKIP** | Owner already exists — fresh sign-up needs **zero** users (see below) |

### Sign up “new user” on this project

Dayboard allows **one** owner. **Sign up as a brand-new user** only when:

1. Supabase → Authentication → **delete** existing user(s), **and**
2. `allowed_owner_email` matches your email (SQL or `pnpm bootstrap:owner` after `ALLOWED_OWNER_EMAIL=…` in `.env.local`).

Then run **SU2** once with **Sign up** (not bootstrap).

Otherwise use **Sign in** with the hint email (**SI1–SI3**).

---

## Run order (one-by-one with you watching)

1. **SU1** — open `/login`, confirm hint email.
2. **SI4** — try sign-up with `wrong@example.com` → must **not** get `/today`.
3. **SI3** — allowlisted email, bad password → error text.
4. **SI2** — allowlisted email, good password → `/today` loads.
5. **SU-dup** — sign-up again with same email → “already exists” (use **Sign in**).
6. **SU2** (optional) — wipe user in Dashboard, then sign-up once as new owner.