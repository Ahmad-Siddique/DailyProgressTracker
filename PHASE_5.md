# Phase 5 exit checklist

## Automated

```powershell
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e --project=phase5-desktop --project=phase5-phone
pnpm build
pnpm check:release-secrets
```

## Shipped

- `supabase/migrations/20260401000000_phase5.sql` — reminders, push_subscriptions, `delete_owner_account`
- PWA: `public/manifest.webmanifest`, `public/sw.js`, register + offline provider
- IndexedDB outbox under `src/lib/pwa/`
- Reminders: push payload, inbox fallback, `POST /api/reminders/dispatch`
- Settings: reminders toggles, sign-out confirm with outbox warning
- Tests: `tests/unit/push-payload.test.ts`, `outbox-replay.test.ts`, `integration/phase5-pwa.test.ts`, `e2e/phase5-pwa.spec.ts`

## Manual device pass

Record results in `docs/DEVICE_PASS.md`.

## Known gaps (honest)

- **Full offline op matrix** — replay/outbox covers `task_create`, `move_task`, `expense_create`, `expense_update`, and `savings_withdrawal` only; contributions, goal items, and other writes are still online-only (matrix + E2E coverage TODO).
- **Push subscribe** — `push_subscriptions` schema and dispatch API exist; client subscribe/register flow and Settings wiring are still TODO.