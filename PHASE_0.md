# Phase 0 — Owner exit checklist

Phase 0 exits when the module specs and `docs/phases.md` are accepted, including decisions **A-1** through **A-24** in [`docs/architecture.md`](docs/architecture.md#decisions-and-flagged-gaps). No **product** UI is required—only the contract gate (`tests/phase0`, scripts, static `phase0.html` e2e).

Automated gate (run from repo root):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm inventory && pnpm phase0:report
pnpm test:integration   # or SUPABASE_SKIP=1 in CI; local: SUPABASE_TRY_START=1 after Docker is up
pnpm test:e2e
```

## Spec acceptance

- [ ] [`README.md`](README.md) — product contract read and accepted
- [ ] Ten module specs present and accepted (paths below)
- [ ] [`docs/phases.md`](docs/phases.md) — build order and test layers accepted

## Module specs (10)

- [ ] [`docs/architecture.md`](docs/architecture.md)
- [ ] [`docs/ux.md`](docs/ux.md)
- [ ] [`docs/board.md`](docs/board.md)
- [ ] [`docs/goals.md`](docs/goals.md)
- [ ] [`docs/money.md`](docs/money.md)
- [ ] [`docs/savings.md`](docs/savings.md)
- [ ] [`docs/review.md`](docs/review.md)
- [ ] [`docs/pwa.md`](docs/pwa.md)
- [ ] [`docs/ai.md`](docs/ai.md)
- [ ] [`docs/quality.md`](docs/quality.md)

## Decisions A-1 … A-24

Each row lives in the [architecture decisions table](docs/architecture.md#decisions-and-flagged-gaps).

- [ ] [A-1](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-2](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-3](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-4](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-5](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-6](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-7](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-8](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-9](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-10](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-11](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-12](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-13](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-14](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-15](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-16](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-17](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-18](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-19](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-20](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-21](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-22](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-23](docs/architecture.md#decisions-and-flagged-gaps)
- [ ] [A-24](docs/architecture.md#decisions-and-flagged-gaps)

## Owner sign-off

| Field | Value |
| --- | --- |
| Owner | |
| Date | |
| Notes / open issues | |

When every box above is checked and commands are green, **Phase 1** may start per `docs/phases.md`.