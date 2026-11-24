# Phase 3 exit checklist

## Automated

```powershell
pnpm lint && pnpm typecheck && pnpm test
$env:SUPABASE_TRY_START='1'
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e --project=phase3-desktop --project=phase3-phone
```

Local API: `http://127.0.0.1:54331` (see `supabase/README.md`).

## Migration

- `20260301000000_phase3.sql` — money + savings schema, RLS, reserved trigger, RPCs

Run `pnpm dlx supabase db reset` after Docker is healthy.

## Shipped

- Money, Review, Export routes and nav
- Selectors + formatters (`money`, `savings`, `review`) + unit tests
- Quick Add expense + contribution
- Export CSV + backup API routes
- Integration: `tests/integration/phase3-money-savings.test.ts` (phases.md #1, #2, #6–8, #10–11 subset)
- E2E: `tests/e2e/phase3-money-review.spec.ts`

## Manual / polish backlog

- Full transfer / void / purchase UI and conflict modals
- Recharts polish on Review (numeric tables present)
- E2E cases #1–12 full browser coverage from phases.md