# Phase 4 exit checklist

## Automated

```powershell
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e --project=phase4-desktop --project=phase4-phone
```

Set server env for local AI (fake ids in tests; live OpenRouter optional):

- `OPENROUTER_API_KEY`
- `OPENROUTER_FREE_MODELS`
- `OPENROUTER_REQUIRE_ZDR` (optional)
- `AI_TURN_SECRET`
- `APP_ORIGIN`

## Shipped

- `buildAiContext`, signed turns, preview/chat API routes
- Desktop right column + mobile sheet AI panel
- Fake OpenRouter for unit tests (no live provider in default suite)
- Tests: `tests/unit/ai-imports.test.ts`, `build-ai-context.test.ts`, `openrouter-fake.test.ts`, `tests/integration/phase4-ai.test.ts`, `tests/e2e/phase4-ai.spec.ts`

## Optional

- `chat_threads` migration only when `saved_chats_enabled` is turned on in production