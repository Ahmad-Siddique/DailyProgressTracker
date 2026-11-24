# Supabase (Dayboard)

Phase 0 only checks that a local Supabase stack is reachable (`pnpm test:integration`). Database migrations, RLS fixtures, and `supabase db reset` seeding are **Phase 1** work.

## Phase 0

- Default API: `http://127.0.0.1:54331` (54331 avoids clashing with another local Supabase on 54321)
- Probe: `GET /rest/v1/` with the local anon key (see `scripts/check-supabase.ts`)
- Skip in CI: `SUPABASE_SKIP=1`

## Phase 1 onward

- Add SQL migrations under `supabase/migrations/`
- Regenerate TypeScript types after schema changes: `pnpm db:types`
- Document `supabase start`, `supabase db reset`, and generated types in setup docs
- See `docs/architecture.md` and `docs/phases.md` for the schema foundation slice