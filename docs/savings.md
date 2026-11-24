# Savings

Status: review spec. `selectSavingsPlan` is the only installment formula. Today, Review, and AI copy it. Decision A-1 and A-2 are in `docs/architecture.md`. Money ledger rules are in `docs/money.md`. Contributions and withdrawals are not expenses and not transfers.

## Screens and states

Savings funds render on the Money route in a Funds section, and as "due this month" on Today.

Each fund shows name, kind (Purchase or General), currency, target, saved, planned versus actual, shortfall or ahead, and the revised installment. A purchase fund also shows Funded and Purchased as separate text states. A general fund does not show a purchase action.

Empty: "No savings funds" and Add fund. A fund with no contributions still shows the baseline plan. Loading, error, pending, and offline follow `docs/ux.md`.

The fund editor fields are name, kind, currency, target, start month, deadline month, and optional opening allocation. Contribution and withdrawal forms ask for amount and date. Notes stay on the entry and out of AI context.

After the deadline, the fund shows remaining and Overdue. It does not show a per-month figure.

Purchase confirmation names the account, the expense category, and the target amount. It states that the allocation release and the expense post together, and that no transfer is created.

## Data ownership and constraints

Savings owns `savings_funds` and `savings_entries`.

- Target is a positive minor amount. Opening allocation is from 0 through target inclusive.
- Currency is PKR or USD and is fixed after the first entry or purchase.
- Reserved = opening allocation + contributions − withdrawals − releases. A write that would make reserved negative fails, and the previous reserved amount remains.
- Funded means reserved ≥ target. It is derived on read. Purchased means `purchased_at` is set. Either state can be true while the other is false, except that the purchase command itself requires funded (A-1).
- A contribution or withdrawal does not insert a ledger row. A release is inserted only by `purchase_savings_fund`.
- Purchase is offered for kind `purchase` when not yet purchased and reserved ≥ target. The expense amount is the target, on an account of the same currency. The release amount is the target. Reserved above the target stays. A general fund rejects the purchase RPC.
- There is no implicit bank movement. The owner records a transfer separately if they want one.

### `splitMinor(totalMinor, parts)`

`totalMinor` is a non-negative `bigint`. `parts` is an integer ≥ 1. Callers do not call it with `parts` 0.

`base = totalMinor / BigInt(parts)` (truncation toward zero). `remainder = totalMinor - base * BigInt(parts)`. The first `parts - 1` values are `base`. The last value is `base + remainder`. The values sum to `totalMinor`.

### `selectSavingsPlan(fund, entries, asOfMonth)`

`asOfMonth` is `YYYY-MM` from `ownerClock`. Months are inclusive calendar months from `start_month` through `deadline_month`.

`savedMinor` = reserved, using every entry dated on any day. The plan is month-granular (A-2). Entries are not prorated by day.

`baselinePool = targetMinor - openingAllocationMinor`. `inclusiveMonths` is the month count. `baselineInstallments = splitMinor(baselinePool, inclusiveMonths)`.

`savedBeyondOpening = savedMinor - openingAllocationMinor`. This is contributions − withdrawals − releases.

`previousMonths` = months from the start month inclusive up to but excluding `asOfMonth`, clipped to the plan window. `plannedBefore = sum of baselineInstallments for those months`. `shortfallMinor = plannedBefore - savedBeyondOpening`. Positive means behind. Negative means ahead.

`remainingMinor = max(0, targetMinor - savedMinor)`.

When `asOfMonth` is before the start month, `remainingMonths` is `inclusiveMonths`, `plannedBefore` is 0, and the revised series splits `remainingMinor` across those months.

When `asOfMonth` is inside the plan, `remainingMonths` counts from `asOfMonth` through `deadline_month` inclusive. The current month is included. `revisedInstallments = splitMinor(remainingMinor, remainingMonths)` when `remainingMinor > 0`, otherwise a zero series of that length.

When `asOfMonth` is after `deadline_month`, `remainingMonths` is 0, `revisedInstallments` is null, and `overdueMinor` is `remainingMinor`. The function does not divide.

```ts
{
  fundId: string
  name: string
  kind: "purchase" | "general"
  currency: "PKR" | "USD"
  targetMinor: bigint
  openingAllocationMinor: bigint
  savedMinor: bigint
  remainingMinor: bigint
  startMonth: string
  deadlineMonth: string
  asOfMonth: string
  baselineMonthlyMinor: bigint
  shortfallMinor: bigint
  remainingMonths: number
  revisedMonthlyMinor: bigint | null
  finalInstallmentMinor: bigint | null
  funded: boolean
  purchased: boolean
  overdueMinor: bigint | null
}
```

`baselineMonthlyMinor` is `baselineInstallments[0]`. `revisedMonthlyMinor` is the first revised installment. `finalInstallmentMinor` is the last revised installment. Both revised fields are null when `remainingMonths` is 0. `overdueMinor` is null while the deadline month has not passed, and is `remainingMinor` after it.

`funded` is true only when `savedMinor >= targetMinor`. A purchase does not latch it true. After an exact-target purchase, the release drops `savedMinor` below the target, so `funded` is false and `purchased` is true.

`formatSavingsPlan(plan)` lives in the savings module. It formats the minor fields at currency scale and labels a positive shortfall as behind and a negative shortfall as ahead. It does not call `splitMinor`. It returns `targetDisplay`, `savedDisplay`, `remainingDisplay`, `baselineMonthlyDisplay`, `shortfallDisplay`, `revisedMonthlyDisplay`, `finalInstallmentDisplay`, and `overdueDisplay`. Revised and final displays are null when the revised minor fields are null. Overdue display is null before the deadline passes. Review and AI copy these strings. For the helmet fixture at month 2, `shortfallDisplay` is `PKR 10,000.00 behind`, `revisedMonthlyDisplay` is `PKR 10,909.09`, and `finalInstallmentDisplay` is `PKR 10,909.10`.

### Helmet fixture

Target 120,000.00 PKR = `12000000` minor. Opening `0`. Start month through deadline month is 12 months. No entries.

- Baseline series: twelve values of `1000000`. Display PKR 10,000.00. Remainder 0.
- At the start of month 2, `asOfMonth` is month 2, `savedMinor` is 0, `shortfallMinor` is `1000000` (PKR 10,000.00 behind).
- `remainingMonths` is 11. `remainingMinor` is `12000000`.
- `splitMinor(12000000, 11)` base is `1090909` and remainder is `1`.
- `revisedMonthlyMinor` is `1090909`, displayed PKR 10,909.09.
- `finalInstallmentMinor` is `1090910`, displayed PKR 10,909.10.
- The eleven values sum to `12000000`.

That is the README's "roughly PKR 10,909.09" figure, computed in minor units.

### `selectAnnualSavingsGrid(funds, entries, year)`

For each non-archived fund and each month of the year, a cell contains the contribution total, the withdrawal total, and the saved minor at month end from the same reserved formula. Months outside the fund's plan still show entries if any exist. The cell does not contain a second installment formula. The plan column for the current month cites `selectSavingsPlan`.

## Read/write contracts

- Create and update fund with client id and version. Target, months, and opening allocation validate before write.
- Contribution and withdrawal insert a `savings_entries` row. Withdrawal amount greater than reserved fails with the reserved amount unchanged.
- `purchase_savings_fund(fund_id, account_id, category_id, occurred_on, idempotency_key)` locks the fund, checks kind, purchased flag, and reserved ≥ target, then inserts the expense, the release of `target_minor`, and `purchased_at`. A retry returns the original expense id.
- Archive sets `archived_at` and removes the fund from Today and from default review. Entries remain.
- Today reads `revisedMonthlyMinor` for each active fund when `remainingMonths > 0`, and `overdueMinor` otherwise, via this selector only.

AI receives the object above for each non-archived fund when finance is included. It does not receive entry notes, entry ids, or account ids.

## Dependencies

- `docs/architecture.md` for reserved trigger, purchase RPC, A-1, and A-2.
- `docs/money.md` for the expense posted by a purchase. The expense then participates in `selectAccountBalance`, `selectBudgetStatus`, and `selectMonthlyCashflow` as an ordinary expense.
- `docs/ux.md` for contribution Quick Add and reminder copy.
- `docs/review.md` embeds `selectSavingsPlan` and `selectAnnualSavingsGrid`.
- `docs/ai.md` copies `selectSavingsPlan` from `selectMonthlyReview` when finance is included.
- `docs/pwa.md` queues contributions, withdrawals, and fund edits. Purchase is disabled offline because it posts a ledger expense that must be validated online.

## Edge cases

- Deadline equal to start: one baseline installment equal to the whole baseline pool. In that month, shortfall against previous months is 0 and the revised installment is the remaining amount. The month after, overdue is the unpaid remainder and the revised fields are null.
- Opening allocation equal to target: baseline pool is 0, `funded` is true before any contribution, and purchase can proceed for a purchase fund.
- Withdrawal of the entire reserved amount succeeds. One minor unit more fails.
- A release without a purchase RPC is rejected.
- Purchase while reserved is below target is rejected and no expense is written.
- Purchase when already purchased is rejected.
- After purchase, `savedMinor` drops by the target because of the release. `remainingMinor` becomes the surplus that was above target, or 0. `purchased` is true. `funded` is then based on the new reserved amount, so a exact-target purchase leaves funded false after the release. The screen keeps showing Purchased. The Funded label before the purchase and the Purchased label after it are both shown in the confirmation receipt so the transition is visible.
- Cross-currency purchase is rejected. The owner converts with an explicit transfer first, then contributes in the fund currency.
- No entries and a future start month: shortfall is 0 and the revised installment splits the remaining target across the full plan.
- Division by zero: `remainingMonths === 0` returns null revised fields. The UI renders Overdue and the remaining amount.

## Given / When / Then

1. Given the helmet fixture and `asOfMonth` month 2, when `selectSavingsPlan` runs, then shortfall is `1000000`, remaining months is 11, revised monthly is `1090909`, final installment is `1090910`, and the series sums to `12000000`.
2. Given the helmet fixture and `asOfMonth` after the deadline with nothing saved, when the selector runs, then `remainingMonths` is 0, revised fields are null, and `overdueMinor` is `12000000`.
3. Given reserved `500000` minor, when a withdrawal of `500001` is submitted, then the write fails and reserved is still `500000`.
4. Given a funded purchase fund, when purchase runs, then one expense equals the target, one release equals the target, and `purchased_at` is set. A retry with the same key does not add a second expense.
5. Given reserved below target, when purchase is submitted, then there is no expense and no release.
6. Given a contribution of `1000` minor, when the ledger is read, then no new ledger row exists.
7. Given a general fund, when purchase is called, then it is rejected.
8. Given the same fund inputs, when Today, Review, and `buildAiContext` load the plan, then all three show the helmet numbers from this selector.
9. Given a deadline month equal to the start month and no savings, when the following month is the as-of month, then the UI shows the full remaining amount as overdue and does not show a monthly divisor.
10. Given opening allocation equal to the target, when the plan renders before any entry, then funded is true and the baseline monthly amount is 0.
