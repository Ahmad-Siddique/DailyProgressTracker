# Architecture

Status: review spec. No application code belongs in this step. Shared decisions live here. Module specs cite them and do not reopen them. Conflicts and assumptions are logged at the end instead of being resolved by dropping a README requirement.

Dayboard is a private, mobile-first Next.js App Router + TypeScript PWA on Supabase Auth and Postgres. One owner uses it for tasks, goals, money, and savings. An AI sidebar calls OpenRouter with server-built context. Vercel is the deploy target. Feature code lives under `src/features/` and routes only compose those features.

## Screens and states

Routes:

| Route | Feature composed | Role |
| --- | --- | --- |
| `/login` | shell | Sign in / first-owner sign up |
| `/today` | board, goals, money, savings | Primary |
| `/board` | board | Primary |
| `/goals`, `/goals/[goalId]` | goals | Primary |
| `/money` | money, savings | Primary |
| `/review` | review | Secondary |
| `/export` | shell export | Secondary |
| `/settings` | shell | Secondary |

Every data screen has empty, loading, error, pending-write, and offline states. Pending means a local write is queued or a request is in flight. Error keeps the draft. Offline behavior is specified in `docs/pwa.md`. Visual and navigation states are specified in `docs/ux.md`.

The AI panel is not a route. It is a persistent shell surface: right column at `>=768px`, sheet at `<768px`. Its states are specified in `docs/ai.md`.

## Data ownership and constraints

The signed-in owner owns every private row. Postgres is the source of truth when online. Owner-scoped IndexedDB is a cache and outbox, never a second source of truth after a successful sync.

### Identity

- `ALLOWED_OWNER_EMAIL` is the only email that can own the database.
- A trigger on `auth.users` rejects any insert whose email differs from that value, or any insert when a profile already exists.
- The client receives one generic failure: "This app is private."
- The browser uses the Supabase anon key and the user JWT. The service-role key stays on the server and is used for migrations and the allowlist trigger setup, never for ordinary reads or for AI context.
- RLS is enabled on every private table. Policies are `owner_id = auth.uid()` for select, insert, update, and delete. Anonymous requests see zero rows.
- Cross-owner links fail in the database. Every foreign key to a private parent is a composite `(id, owner_id)` key, or a trigger that rejects a mismatched owner. Application checks are not the enforcement.

### Shared columns

Private tables include `id uuid`, `owner_id uuid not null references profiles(id)`, `version integer not null default 1`, `created_at timestamptz`, and `updated_at timestamptz` unless a table below says otherwise.

- Clients generate `id` (UUID) for retryable writes.
- Updates require `version`. The write matches `id` and `version`, then sets `version = version + 1`. Zero rows updated is a conflict: the current row is returned and the client keeps its draft.
- Money edits never merge silently. The same version rule applies to tasks and goals. Conflict presentation for money is stricter and is specified in `docs/money.md` and `docs/pwa.md`.

### Clock

`src/lib/clock.ts` exports `ownerClock(profile, nowUtc)`.

- Profile `timezone` is an IANA name. Default is `Asia/Karachi`.
- Schedule fields are wall dates (`date`) and wall times (`time`). They have no timezone offset.
- Event instants (`completed_at`, `created_at`, reminder fire time, chat timestamps) are `timestamptz` UTC.
- "Today", "this week", and "this month" come from `ownerClock`, including on the AI server.
- The week starts Monday.
- A month key is `YYYY-MM`. Stored month columns use the first calendar day of that month.
- Changing the profile timezone does not rewrite stored wall dates. Later computations use the new zone. Settings warns before saving a zone change.

### Money integers

`src/features/money/minor.ts` is the only money-arithmetic module.

- PKR and USD use scale 2. A PKR minor unit is one paisa. A USD minor unit is one cent. Amounts are `bigint`.
- Display formatting is not arithmetic.
- Conversion rounds once, half away from zero: `converted = sign * ((abs(amount) * rate + divisor/2) / divisor)` in integers.
- A PKR-per-USD rate is stored as `pkr_minor_per_usd`: paisa equal to one US dollar. `280.50` PKR per USD is `28050`.
- `convertMinor(amountMinor, from, to, rate)` converts USD cents to PKR paisa with `round_half_away_from_zero(usd_cents * pkr_minor_per_usd / 100)`, and the inverse with one division. The caller stores the rate id it used. A later default rate does not rewrite that result.

### Canonical selectors

Selectors are pure functions. The UI, Review, and AI call them. AI copies their outputs and does not reimplement the formulas. Formulas live only in the owning module.

| Selector | Owner file | Also used by |
| --- | --- | --- |
| `selectTaskSummary` | `src/features/board/selectors.ts` | Today, Review, AI |
| `selectGoalProgress` | `src/features/goals/selectors.ts` | Goals, Review, AI |
| `selectStalledItems` | `src/features/goals/selectors.ts` | Goals, AI |
| `selectGoalDetail` | `src/features/goals/selectors.ts` | Goal screen, AI |
| `selectAccountBalance` | `src/features/money/selectors.ts` | Money |
| `selectSpendByCurrency` | `src/features/money/selectors.ts` | Today |
| `selectBudgetStatus` | `src/features/money/selectors.ts` | Money, Review, AI |
| `selectMonthlyCashflow` | `src/features/money/selectors.ts` | Review, AI |
| `selectFxRateForMonth` | `src/features/money/selectors.ts` | Money, Review, Savings display, AI |
| `selectSavingsPlan` | `src/features/savings/selectors.ts` | Savings, Today, Review, AI |
| `selectAnnualSavingsGrid` | `src/features/savings/selectors.ts` | Review |
| `selectWeeklyCompletion` | `src/features/review/selectors.ts` | Review, AI |
| `selectMonthlyReview` | `src/features/review/selectors.ts` | Review, AI |

`selectMonthlyReview` calls the board, goals, money, and savings selectors. It does not contain a second progress, budget, cashflow, or installment formula. `buildAiContext` in `src/features/ai/buildAiContext.ts` calls `selectGoalDetail`, `selectMonthlyReview`, and, only as those return them, the nested selector values. It does not import `splitMinor`, `convertMinor`, or the progress division.

Formatters `formatMinor`, `formatBudgetStatus`, `formatCashflow`, `formatGoalProgress`, and `formatSavingsPlan` live in the money, goals, and savings modules. They turn selector outputs into text and do not change the numbers. AI may call the formatters. AI may not call `convertMinor` or `splitMinor`.

### Tables

`profiles` — `id` equals `auth.users.id`, `email`, `timezone`, `display_name`, `theme` (`light` | `dark` | `system`), `reporting_currency` (`PKR` default | `USD`), `reminders_enabled` default false, `hide_amounts_on_lock_screen` default true, `saved_chats_enabled` default false.

`tasks` — `title` nonblank; `notes` nullable; `status` `backlog` | `todo` | `in_progress` | `done`; `priority` `low` | `normal` | `high` or null; `local_date` nullable; `start_time` nullable; `end_time` nullable; `goal_item_id` nullable; `position text` lexicographic rank; `completed_at`; `recurrence_template_id` nullable; `recurrence_date` nullable; `detached boolean` default false.

Checks: `start_time` requires `local_date`; `end_time` requires `start_time` and `end_time > start_time`; `status = done` exactly when `completed_at` is not null; unique `(owner_id, status, position)`; unique `(recurrence_template_id, recurrence_date)` when the template is set.

`recurrence_templates` — same descriptive fields as a task, `cadence` `daily` | `weekly`, `weekdays` for weekly (ISO 1–7), `start_date`, `end_date` nullable, `position` seed. Interval is 1. Daily and weekly are the only cadences.

`recurrence_skips` — unique `(template_id, local_date)`.

`goals` — `title` nonblank, `notes` nullable, `deadline_date` nullable, `archived_at` nullable, `position`.

`goal_items` — `goal_id`, `title` nonblank, `status` `not_started` | `in_progress` | `practicing` | `done`, `position`, `status_changed_at timestamptz`. No item notes and no item archive. Archive is goal-level. `status_changed_at` is the latest transition only.

`accounts` — `name`, `currency` `PKR` | `USD`, `opening_balance_minor bigint`, `archived_at` nullable. Current balance is not stored.

`categories` — `name`, `kind` `expense` | `income`, `archived_at` nullable.

`fx_rates` — `effective_on date`, `pkr_minor_per_usd bigint` check `> 0`, unique `(owner_id, effective_on)`. Insert-only for "set current rate". Replacing a historical row is a separate warned command.

`transfer_groups` — header for one atomic pair.

`ledger_entries` — `account_id`, `category_id` nullable, `kind` `expense` | `income` | `transfer`, `amount_minor bigint` check `> 0`, `currency` equal to the account currency, `occurred_on date`, `note` nullable, `voided_at` nullable, `transfer_group_id` nullable, `transfer_leg` `out` | `in` or null. A transfer leg has no category. A non-transfer has a category and a null transfer group.

`budgets` — `category_id`, `month date`, `currency`, `amount_minor bigint` check `>= 0`, unique `(owner_id, category_id, month)`.

`savings_funds` — `name`, `kind` `purchase` | `general`, `currency`, `target_minor bigint` check `> 0`, `start_month`, `deadline_month` with deadline `>=` start, `opening_allocation_minor bigint` check `>= 0` and `<= target_minor`, `purchased_at` nullable, `purchase_expense_id` nullable, `archived_at` nullable. Funded is derived, not stored.

`savings_entries` — `fund_id`, `kind` `contribution` | `withdrawal` | `release`, `amount_minor bigint` check `> 0`, `occurred_on`, `note` nullable.

Reserved minor units = opening allocation + contributions − withdrawals − releases. A trigger rejects any write that would make reserved negative.

`reminders` — `subject_type` `task` | `savings_fund`, `subject_id`, `fire_at timestamptz`, `dedupe_key` unique per `(owner_id, dedupe_key)`, `enabled`.

`push_subscriptions` — `endpoint`, `p256dh`, `auth`. Unique `endpoint`.

`mutation_receipts` — `idempotency_key` unique per owner, `request_hash`, `resource_id`, `response_body` enough to replay the original success. A retry with the same key and the same hash returns the stored result and does not apply a second mutation. The same key with a different hash is rejected.

`chat_threads` and `chat_messages` exist only for the optional saved-thread feature. They stay empty while `saved_chats_enabled` is false. Volatile unsigned chat is not stored here. See `docs/ai.md`.

### Indexes

- `tasks (owner_id, status, position)`
- `tasks (owner_id, local_date)`
- `tasks (goal_item_id)`
- `ledger_entries (owner_id, occurred_on)` where `voided_at is null`
- `budgets (owner_id, month)`
- `savings_entries (fund_id, occurred_on)`
- `fx_rates (owner_id, effective_on desc)`
- `reminders (owner_id, fire_at)`

### Retention and deletion

- Voided ledger rows and skips remain until the owner deletes the account.
- Sign-out clears that owner's IndexedDB after warning if the outbox is non-empty. The user can cancel sign-out and keep the unsynced queue.
- Account deletion deletes the auth user and cascades every private row, subscription, receipt, and chat row.
- Deleting a saved thread deletes its messages in this database. The UI states that a provider copy, if any, is outside this delete.
- Reminder rows delete when the subject is deleted or when reminders are turned off for that subject.

### Atomic writes

These are Postgres functions executed with the user JWT (`security invoker`), so RLS still applies:

- `move_task` — status, position, and `completed_at` in one update.
- `apply_recurrence` — inserts missing occurrences and nothing else.
- `skip_occurrence` — writes the skip and deletes that occurrence.
- `split_recurrence_from` — ends the old template the day before the edited date and inserts the successor template, without updating completed rows.
- `bulk_insert_goal_items` — ordered insert of the whole preview or no insert.
- `post_transfer` — both legs and the group, or neither. Optional fee is a separate expense row in the same transaction, never a mutation of either leg.
- `void_transfer_group` — voids both legs.
- `purchase_savings_fund` — expense plus release plus `purchased_at`, or none.
- `copy_budgets` — inserts missing category rows for the target month.

Each function takes the client `id` values and an idempotency key.

## Read/write contracts

Ordinary creates and updates go through the Supabase client and RLS. Atomic cases go through the functions above. Reads used by more than one screen go through the selectors.

Server route handlers:

| Route | Caller | Contract |
| --- | --- | --- |
| `POST /api/ai/preview` | owner JWT | Runs `buildAiContext`. Returns the context JSON. Does not call OpenRouter. |
| `POST /api/ai/chat` | owner JWT | Validates the chat schema, rebuilds context, streams from OpenRouter. Specified in `docs/ai.md`. |
| `POST /api/export/csv` | owner JWT | Builds the requested CSV. |
| `POST /api/export/backup` | owner JWT | Builds the structured backup. |

Export is not restore. There is no import route in this release.

AI routes reject body fields `ownerId`, `sql`, `model`, `url`, and any client-supplied context document. The server loads rows with the user JWT.

### Export files

CSV cells are strings. A cell whose first character is `=`, `+`, `-`, `@`, tab, or carriage return is prefixed with `'`.

- `ledger.csv` — entry id, date, kind, account name, currency, amount minor, category name, note, voided flag, transfer group id. Amounts stay in minor units and native currency.
- `budgets.csv` — month, category name, currency, amount minor.
- `goals.csv` — goal id, title, notes, deadline, archived flag, item id, item title, item status, item position.
- `contributions.csv` — fund id, fund name, currency, entry kind, amount minor, date.
- `backup.json` — schema version `1`, profile clock and preferences, tasks, recurrence templates and skips, goals and items, accounts, categories, fx rates, ledger, transfer groups, budgets, savings funds and entries, reminders. Chat transcripts are included only when saved threads are enabled. Secrets, the service-role key, and the OpenRouter key are absent.

Links are ids. Currency codes travel with amounts.

### Reminders

Reminders are off until the owner enables them in Settings. Permission for Web Push is requested at that moment, not at first launch. If permission is denied or the platform has no push, in-app reminders still fire. A reminder is unique per subject and `fire_at` instant. Lock-screen text omits amounts while `hide_amounts_on_lock_screen` is true.

- Task: fire at `start_time` on `local_date` when both exist; otherwise 09:00 local on `local_date`. A task with no date has no reminder.
- Savings: 09:00 local on the first day of a month in which `selectSavingsPlan` reports a positive amount still to fund. The push body says "Savings due" and includes the amount only when the hide-amounts setting is off.

### Backup of calculations

Review and AI read selectors at request time. They do not store a second copy of progress or installment math. FX lookup is `selectFxRateForMonth(month)` = the rate row with the greatest `effective_on` less than or equal to that month's last day, or `{ missing: true }`. Setting today's rate inserts a new row effective today. Months whose last day is before today keep the previous row.

## Dependencies

- Next.js App Router, React, TypeScript.
- Supabase Auth and Postgres, with generated database types.
- Tailwind and shadcn/ui.
- dnd-kit for board drag.
- TanStack Query for server cache.
- Recharts on the Review screen, plus a numeric table of the same values.
- A service worker compatible with the Next.js version chosen at implementation. Package versions are an implementation choice constrained by compatibility. They are not pinned in this spec.
- Vercel for hosting. Server-only env: `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODELS`, `OPENROUTER_REQUIRE_ZDR`, `ALLOWED_OWNER_EMAIL`, `AI_TURN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Client env is the Supabase URL and anon key only.

Build order after this spec is accepted is `docs/phases.md`: auth, schema, and shell; Board and Goals; Money, Savings, and Review; AI on the real selectors; reminders, PWA sync, and release QA. Each phase has integration tests, browser tests, and an exit list. The order is sequencing. Every module in the README still ships.

## Edge cases

- A second signup, a non-allowlisted email, and a failed password reset all return the same privacy message.
- A client that sends another owner's id gets an empty read or a failed foreign key, and the AI context lists the id under `unavailableGoalIds` without saying whether the row exists.
- Retrying a transfer with the same idempotency key returns the original pair and does not post a second pair.
- A version mismatch returns 409 and the current row. The draft remains.
- Opening balance is an account anchor, not a ledger entry. Derived balance includes it. `selectMonthlyCashflow` ignores it. Editing the opening balance warns that every derived balance changes.
- Account deletion while an outbox exists warns first, then deletes the server data and the local database.
- AI requests are never written to the outbox.

## Decisions and flagged gaps

These are explicit so review can reject them. They are not silent scope cuts.

| Id | Decision |
| --- | --- |
| A-1 | A purchase-fund purchase requires reserved minor ≥ target minor. The expense amount equals the target. Surplus reserved above the target stays reserved. A general fund has no purchase action. |
| A-2 | Savings math is month-granular. The current month stays inside the remaining-month count through its last day. There is no day-of-month proration. |
| A-3 | Goal items are title, status, order, and `status_changed_at` only. The README does not define item notes or item archive. |
| A-4 | An item is stalled when its status is `not_started` or `in_progress`, it has no linked incomplete task dated today or later, and either `status_changed_at` is older than 14 local days or the goal deadline is within 14 local days. `practicing` and `done` are not stalled. |
| A-5 | The service-worker package is chosen at implementation against the installed Next.js version. Authenticated responses and AI streams are never cached. |
| A-6 | Web Push is implemented. If a platform withholds push for an installed PWA, in-app reminders still work and Settings explains that the platform refused push. |
| A-7 | Export and backup do not restore. There is no importer in this release. |
| A-8 | `provider.data_collection: "deny"` does not mean zero retention. `provider.zdr: true` is sent only when `OPENROUTER_REQUIRE_ZDR=true`. The UI never claims the provider keeps no copy. |
| A-9 | "Set rate" appends a row effective on the owner's today. Replacing a past `effective_on` is a separate action with a warning that reports for months using that date will change. |
| A-10 | Today's spend is the sum of non-void expenses whose `occurred_on` is the owner's today, grouped by currency. It is not month-to-date. Month-to-date lives on Review. |
| A-11 | The OpenRouter body sets one allowlisted `model` and does not send `models` or `route: "fallback"`. |
| A-12 | When scope narrows, earlier turns are left out of the next OpenRouter request unless the owner starts a new chat or explicitly continues with those turns omitted. |
| A-13 | Global shortcuts, including Cmd/Ctrl+K, do nothing while focus is in an input, textarea, select, or contenteditable. |
| A-14 | The week starts Monday. |
| A-15 | Recurrence catch-up creates missing occurrences only for the last 14 local days through the view horizon. Older gaps are not created and are not auto-skipped. |
| A-16 | Goal progress is `done / all items` on the goal. Zero items is `empty`, which is distinct from 0%. Displayed percent is the integer nearest the ratio, half away from zero. 1/50 displays as 2%. |
| A-17 | `status_changed_at` stores the latest item transition only. Monthly "marked done" counts use that timestamp. Reopening an item removes it from that count. There is no status event log. |
| A-18 | No third-party analytics SDK ships in this release. |
| A-19 | Enabling finance with no month selected sets the month scope to the current month and shows that chip before any send. |
| A-20 | One AI context accepts at most 20 goals. The picker blocks a larger selection. |
| A-21 | Deleting a completed occurrence, after confirmation, removes that completion and writes a skip. |
| A-22 | Chat history that is forwarded to OpenRouter is a client-held transcript of server-signed turns. Unsigned history is dropped. Saved thread rows are a separate, opt-in store. |
| A-23 | Shortcuts and the command palette are specified in `docs/ux.md`. Keyboard column moves are required. A visible Move control is required beside drag and swipe. |
| A-24 | The package manager is pnpm. Library versions are chosen at implementation, within the compatibility constraints above. |

README requirements that stay in scope even though they are easy to postpone: recurrence, cross-currency transfers, budgets, purchase linking, review charts with numeric alternatives, the streak, reminders, offline outbox, CSV and full backup, and all four AI acceptance tests.

## Given / When / Then

1. Given an anonymous client, when it selects from `tasks`, `goals`, `ledger_entries`, and `savings_funds`, then every result is empty and RLS is on for each private table.
2. Given owner A and owner B, when B inserts a task whose `goal_item_id` belongs to A, then the database rejects the insert.
3. Given a transfer that succeeded with idempotency key K, when the client retries K with the same hash, then the same two ledger ids return and the ledger still contains one pair.
4. Given a task at version 3, when an update names version 2, then the response is a conflict, version stays 3, and the client's unsent draft is still present.
5. Given the profile timezone `Asia/Karachi` and a UTC instant that is still the previous evening in Karachi, when `ownerClock` is asked for today, then the local date is the Karachi date.
6. Given a USD amount and a PKR rate, when `convertMinor` runs twice with the same rate, then both results match and each conversion rounded once.
7. Given `selectGoalProgress` and `selectSavingsPlan` fixtures, when `selectMonthlyReview` and `buildAiContext` run, then the progress and installment numbers in both results are the selector outputs field for field.
8. Given a backup file, when its contents are inspected, then the OpenRouter key and service-role key are absent and a cell that started with `=` in a note is prefixed in the CSV.
