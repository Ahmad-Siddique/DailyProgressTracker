# Phase 1 — Owner exit checklist

Phase 1 delivers auth, schema foundation, and the app shell (Today + Settings only).

## Automated gate

```bash
pnpm install
# Local only, with Docker:
supabase db reset
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # CI: SUPABASE_SKIP=1 skips DB tests with message
pnpm test:e2e
pnpm build
```

Copy `.env.test.example` → `.env.test` and `.env.example` → `.env.local` for local Supabase keys.

## Build

- [ ] Next.js App Router at repo root (`pnpm dev` / `build` / `start`)
- [ ] Migration `supabase/migrations/20260101000000_phase1.sql` + `supabase/seed.sql`
- [ ] `src/lib` Supabase clients, `ownerClock`, `updateProfileWithVersion`
- [ ] Middleware protects `/today` and `/settings`
- [ ] Login (sign-in + sign-up), Today placeholder, Settings (theme, timezone, sign-out)
- [ ] Shell nav: Today + Settings only (desktop sidebar, mobile bottom bar + More)

## Integration (local Supabase)

- [ ] Anonymous `profiles` select returns nothing
- [ ] Allowlisted owner gets one profile; second email fails
- [ ] Cannot update another profile id
- [ ] Version mismatch updates zero rows

## Browser

- [ ] Sign in, reload, still signed in (360px + 1280px)
- [ ] Wrong email → "This app is private."
- [ ] Theme dark survives reload
- [ ] Timezone warning + saved value after reload
- [ ] Keyboard path login → theme → sign-out
- [ ] axe clean on login + settings
- [ ] No service-role key in page network requests

## Acceptance (from `docs/phases.md`)

- [ ] Fresh DB + allowlisted signup → one profile, `Asia/Karachi`, `system` theme
- [ ] Non-allowlisted signup → private message, still one profile row
- [ ] Dark theme + reload → dark document
- [ ] Nav has no Board / Goals / Money / Review / Export / AI
- [ ] `pnpm lint`, `typecheck`, `test`, `test:integration`, `test:e2e` green

## Owner sign-off

| Field | Value |
| --- | --- |
| Owner | |
| Date | |
| Notes / open issues | |