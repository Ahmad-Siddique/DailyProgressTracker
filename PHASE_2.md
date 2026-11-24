# Phase 2 exit checklist

## Automated

```powershell
pnpm lint && pnpm typecheck && pnpm test
$env:SUPABASE_TRY_START='1'
pnpm test:integration   # phase1 + phase2
pnpm exec playwright install chromium
pnpm test:e2e           # phase1 + phase2 when Supabase is up
```

Local API: `http://127.0.0.1:54331` (see `supabase/README.md`).

## Migrations

- `20260201000000_phase2.sql` — tables + RPC stubs
- `20260201000002_phase2_hardening.sql` — RLS joins, real `apply_recurrence`, real `split_recurrence_from`

Run `pnpm dlx supabase db reset` after Docker is healthy.

## Shipped

- Board, Goals, Today routes and nav
- Selectors + unit tests
- Quick Add (task + goal item, time preview)
- dnd-kit + Move menu on cards
- Goals bulk paste (50 lines)
- Integration: `tests/integration/phase2-board-goals.test.ts` (subset of phases.md #1–2, #7, #9–10)
- E2E: `tests/e2e/phase2-board-goals.spec.ts`

## Not yet full spec (Phase 2+ polish)

- Board All/Today/Week filters, task editor, recurrence UI
- Goals search, drag reorder, archive
- Integration cases #3–6, #8 (stale move, time checks, recurrence idempotency, link isolation)
- E2E overdue fixture, drag parity, 360 scroll cases