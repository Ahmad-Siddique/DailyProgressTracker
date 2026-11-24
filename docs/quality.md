# Quality

Status: review spec. This is the release gate for the other specs. No application code, migration, or test run belongs to the spec step. After the specs are accepted, implementation follows `docs/phases.md` and reports changed files, migrations, commands, test results, and open issues. Phase 5 is the only phase that may call this document a pass.

The release has no placeholder buttons and no mock flows. Every module named in the README ships: shell and navigation, Board, Goals, Money, Savings, Review, reminders, PWA sync, export, and AI.

## Screens and states

The product screens and their empty, loading, error, pending, and offline states are specified in the module docs. Quality adds the gates around them:

- A release candidate is exercised at 360px, with keyboard only, and as an installed phone app.
- Charts on Review are accompanied by the numeric table from `docs/review.md`.
- AI errors use the distinct sentences in `docs/ai.md`, including the free-model sentence that Dayboard did not try a paid model.
- CI publishes lint, typecheck, unit, and end-to-end results from isolated fixtures. It does not point at production Supabase or a production OpenRouter key.

Manual device checks are part of the gate even though CI cannot install the PWA on a physical phone. The checklist below names them.

## Data ownership and constraints

Tests create two owners and one anonymous client against a local Supabase. Fixtures are non-private: the helmet fund, a 50-item goal, and tasks with obvious titles. They contain no real account numbers, no personal notes, and no production export.

The default AI test double answers `/api/v1/chat/completions` from a fake. It records the request and returns a scripted stream. Default CI does not call OpenRouter. A live smoke test runs only when `RUN_OPENROUTER_SMOKE=1`, uses the fake fixtures, and uses a key supplied for that run. Smoke is not required for the unit gate.

`OPENROUTER_FREE_MODELS` in tests is a list of obvious fake ids. The fake models list marks which of them are free. Tests do not embed unverified real model ids.

Service-role use in tests is limited to creating the second auth user and applying migrations. Request-path tests use the anon key and a user JWT.

## Read/write contracts

The implementation provides these commands. Versions of Next.js, Supabase, and the service worker are chosen then, under the constraints in `docs/architecture.md`.

| Command | Role |
| --- | --- |
| `pnpm install` | Install dependencies. pnpm is the package manager. |
| `pnpm dev` | App Router dev server. |
| `pnpm lint` | Lint. |
| `pnpm typecheck` | TypeScript with no emit. |
| `pnpm test` | Unit and selector tests, including the AI body tests with the fake provider. |
| `pnpm test:e2e` | Browser flows for the release list below. |
| `pnpm build` | Production build. The client bundle must not contain `OPENROUTER_API_KEY` or the service-role key. |
| `supabase start` | Local database. |
| `supabase db reset` | Apply migrations and the non-private seed. |
| `supabase db lint` | Migration lint. |

Setup docs that ship with the implementation cover those commands, the migration list, the seed, deploy, `ALLOWED_OWNER_EMAIL`, `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODELS`, `OPENROUTER_REQUIRE_ZDR`, and the privacy banner. CI uses the local database and the fake provider.

A selector test feeds the same fixture to `selectGoalProgress`, `selectSavingsPlan`, `selectMonthlyReview`, and `buildAiContext`. The numbers in the review and in the AI context must equal the owner selectors. The AI test fails if `src/features/ai` imports `splitMinor` or `convertMinor`.

## Dependencies

- `docs/architecture.md` through `docs/ai.md` for the behaviors this gate traces.
- Fake OpenRouter and local Supabase, as above.
- The device pass needs one iOS install and one Android install.

## Edge cases

- A test that needs a rate asserts the missing-rate partial state as well as the rated state.
- Clock tests pin `Asia/Karachi` and an instant that is still the previous local date in UTC.
- AI tests assert the absence of ledger notes with a denylist walk, not by reading a single happy-path string.
- The free-model test uses a 402 from the first free id and a success from the second, then a case where every id fails before stream, then a case where a delta was already forwarded. The third case must not open a second completions call.
- End-to-end AI stays on the fake. Smoke, when someone opts in, uses the helmet fixture only.
- Flake policy: a failed release test is a failed gate. Retrying CI is not a substitute for a fixed assertion.

## Release trace

| README gate | Where it is specified |
| --- | --- |
| Title-only task and keyboard move | `docs/board.md` tests 1, 2, and 12 |
| 50 pasted items yield 2% after one completion | `docs/goals.md` test 2, decision A-16 |
| Linked task completion does not change item status | `docs/goals.md` test 4 and `docs/board.md` test 9 |
| Transfer retry creates one pair | `docs/money.md` test 3 and `docs/architecture.md` test 3 |
| Rate update leaves past reports intact | `docs/money.md` test 8, decision A-9 |
| Missing rates are visible | `docs/money.md` test 9 and `docs/review.md` test 7 |
| Helmet baseline, shortfall, withdrawal, overdue | `docs/savings.md` tests 1, 2, and 3 |
| Offline create survives reload and syncs once | `docs/pwa.md` test 1 |
| Concurrent money edits visibly conflict | `docs/money.md` test 10 and `docs/pwa.md` test 2 |
| Sign-out and RLS isolation | `docs/architecture.md` tests 1 and 2, `docs/pwa.md` tests 3 and 8 |
| Installed phone app | `docs/ux.md` test 1 and `docs/pwa.md` tests 6 and 9, plus the manual device pass |
| CSV escaping | `docs/money.md` test 11 and `docs/architecture.md` test 8 |
| Local month boundaries | `docs/architecture.md` test 5 |
| AI acceptance tests | `docs/ai.md` tests 1 through 4, with free-model behavior in tests 5 and 6 |

## Given / When / Then

1. Given the helmet fixture, when `selectSavingsPlan`, `selectMonthlyReview({ finance: "include" })`, and `buildAiContext` run for month 2, then shortfall is `1000000`, revised monthly is `1090909`, and the AI savings object equals that plan plus `formatSavingsPlan`.
2. Given `src/features/ai`, when its imports are listed, then `splitMinor` and `convertMinor` are absent.
3. Given the fake provider, when the four AI acceptance cases run, then each outgoing completions body matches the selection rules in `docs/ai.md` and the fake records no tools and no second model after a forwarded delta.
4. Given a production-like client build, when the bundle is searched, then the OpenRouter key and the service-role key are absent.
5. Given anonymous, owner A, and owner B fixtures, when the RLS suite runs, then anonymous reads are empty and B cannot link to A's goal item.
6. Given the release list above, when any row fails, then the candidate is not ready. A skipped device install stays listed as an open issue rather than a pass.
