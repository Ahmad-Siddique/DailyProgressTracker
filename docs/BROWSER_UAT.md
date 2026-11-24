# Browser UAT plan — Dayboard

**Purpose:** End-to-end validation in a real browser (`pnpm dev` → `http://localhost:3000`) covering auth, tasks, kanban, goals, money/review smoke, and OpenRouter AI — for you to watch or for an agent to execute with Playwright MCP.

**Quick gate:**

```powershell
pnpm uat:preflight
```

If this fails, fix preconditions below before the happy-path script.

---

## Preconditions (must pass before happy path)

| # | Check | How |
|---|--------|-----|
| P1 | Migrations on **cloud** project in `.env.local` | `pnpm dlx supabase@2.58.5 login` → `link --project-ref <ref>` → `db push` ([`supabase/CLOUD.md`](../supabase/CLOUD.md)) |
| P2 | Email confirm **off** | Dashboard → Authentication → Providers → Email |
| P3 | Redirect URLs | Site URL `http://localhost:3000`, redirects `http://localhost:3000/**` |
| P4 | Allowlist email | SQL: `update public.app_singleton set allowed_owner_email = 'you@example.com' where id = 1;` |
| P5 | Env | `.env.local`: publishable + secret keys, `AI_TURN_SECRET`, `OPENROUTER_API_KEY` (not placeholders) |
| P6 | Dev server | `pnpm dev` on port 3000 |
| P7 | Email rate limits | If signup returns rate limit, wait or disable confirm email (P2) so sign-in works after first signup |

**Suggested test owner (after P4):**

- Email: same as `allowed_owner_email`
- Password: `dayboard-test-password-1` (or your choice, ≥ 8 chars) — store only for local UAT, not in git

---

## Agent / live-demo runbook (do in order)

Use this as a **single session** you can follow in the browser while the agent narrates and screenshots.

| Step | Action | Pass criteria |
|------|--------|----------------|
| 0 | `pnpm uat:preflight` | All PASS |
| 1 | Open `/login` | Split hero + form; screenshot desktop + 390px |
| 2 | **Sign up** with allowlisted email | Lands on `/today`, shell visible |
| 3 | **Quick Add** → Task, title `UAT kanban card` | Save succeeds; preview line if parse applies |
| 4 | **Quick Add** `Call mom 3pm` | Parse preview before save |
| 5 | `/board` | Card in backlog (or todo); four columns |
| 6 | Drag card → **Todo** | Stays in Todo; no duplicate |
| 7 | Drag card → **Done** | In Done column |
| 8 | `/goals` → create goal `UAT goal` | Listed |
| 9 | Open goal → add item `First milestone` | Item visible; progress text present |
| 10 | `/money`, `/review` | Load without crash (empty OK) |
| 11 | Header → **Open AI** | Panel/sheet; preview loads (not `misconfigured`) |
| 12 | Send: `What should I focus on today?` | Streamed reply or documented OpenRouter error |
| 13 | Goals detail → Open AI | Goal chip + scoped preview |
| 14 | Settings → theme toggle → reload | Theme persists |
| 15 | Sign out / wrong email sign-in | Privacy-safe error message |

---

## Test matrix (IDs for execution log)

### 1. Auth & shell

| ID | Step | Expected |
|----|------|----------|
| A1 | Open `/login` | Split hero + form; no fatal console |
| A2 | Sign up allowlisted email + password ≥8 | Redirect `/today` |
| A3 | Reload `/today` | Still signed in |
| A4 | Wrong email sign-in | Generic private-app / wrong-credentials message |
| A5 | 390px + 1280px | Tab bar / sidebar; readable layout |
| A6 | Settings theme toggle | Persists after reload |

### 2. Tasks — Today & Quick Add

| ID | Step | Expected |
|----|------|----------|
| T1 | Quick Add → Task, title only | On board backlog; preview if applicable |
| T2 | Quick Add `Call mom 3pm` | Parse preview before save |
| T3 | Today agenda / empty | No crash |

### 3. Board (kanban)

| ID | Step | Expected |
|----|------|----------|
| B1 | `/board` | backlog, todo, in progress, done |
| B2 | Drag → **Todo** | Status updates; no duplicate |
| B3 | Drag → **Done** | Card in done |
| B4 | Offline / pending label | Per PWA if simulated |

### 4. Goals

| ID | Step | Expected |
|----|------|----------|
| G1 | Create goal | In list |
| G2 | Add item | On detail |
| G3 | Progress string | Visible, sensible |

### 5. Money / Review (smoke)

| ID | Step | Expected |
|----|------|----------|
| M1 | `/money` | Accounts/ledger or empty |
| R1 | `/review` | Month view or empty |

### 6. AI (OpenRouter)

| ID | Step | Expected |
|----|------|----------|
| AI1 | Open AI from header | Panel; finance chip state visible |
| AI2 | Preview loads | No `misconfigured` when keys set |
| AI3 | Goal detail → Open AI | Goal scope in chips/preview |
| AI4 | Send short question | Stream or `free_model_unavailable` + paid hint |
| AI5 | Stop / Copy | Partial text usable |

### 7. Regression (CLI)

```powershell
pnpm test
pnpm test:integration
pnpm test:e2e --project=phase1-desktop
```

---

## Execution log

**Run:** 2026-11-23 · Tester: agent (Playwright MCP) · Dev server: running · Cloud ref: from `.env.local`

**Blocker:** `pnpm uat:preflight` fails **D1** — `public.app_singleton` not on linked Supabase project (migrations not pushed). Auth has **0 users**; sign-up also hit Supabase **email rate limit** during this run.

| Date | ID | Pass | Notes |
|------|-----|------|-------|
| 2026-11-23 | P1/D1 | **FAIL** | Table `app_singleton` missing — run `supabase link` + `db push` |
| 2026-11-23 | A1 | **PASS** | `/login` UI; screenshot `docs/uat-screenshots/login-desktop.png` |
| 2026-11-23 | A2 | **BLOCKED** | No schema + rate limit on signup |
| 2026-11-23 | A3–A6 | **SKIP** | Needs session |
| 2026-11-23 | T1–T3 | **SKIP** | Needs auth |
| 2026-11-23 | B1–B4 | **SKIP** | Needs auth |
| 2026-11-23 | G1–G3 | **SKIP** | Needs auth |
| 2026-11-23 | M1, R1 | **SKIP** | Needs auth |
| 2026-11-23 | AI1–AI5 | **SKIP** | Needs auth + migrations for context |
| 2026-11-23 | A4 | **PARTIAL** | Wrong password shows “Email or password is wrong.” (no user exists yet) |
| 2026-11-23 | A5 | **PARTIAL** | Mobile login screenshot `login-mobile-390.png`; unauth `/today` shell + `today-unauth.png` |
| 2026-11-23 | E1–E5 | **PASS/FAIL** | Env keys OK except DB; run `pnpm uat:preflight` |

**After you run `db push` + allowlist SQL:** re-run from step 0 in the runbook and replace SKIP rows with PASS/FAIL.

---

## Evidence folder

Screenshots and optional screen recordings for demos:

- `docs/uat-screenshots/` — agent adds per run (login, board, goals, AI)