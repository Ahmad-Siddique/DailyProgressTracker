# Money

Status: review spec. Balances, budgets, cashflow, and FX lookup are defined here. Review and AI consume the selectors. They do not sum the ledger themselves. Savings contributions are not ledger rows; `docs/savings.md` owns them. Integer math and rate history live in `docs/architecture.md` (A-9, A-10). Opening balance is an account anchor, described with the architecture edge cases.

## Screens and states

The Money screen has Accounts, Ledger, Budgets, and a link to savings funds on the same route. Savings presentation is in `docs/savings.md`.

### Accounts

Each account shows name, currency, opening balance, and derived balance from `selectAccountBalance`. Empty: "No accounts" and Add account. Archived accounts sit in a disclosure and are omitted from pickers.

### Ledger

Rows show date, kind, account, category when present, native amount, and Voided when voided. Filters: date range, category, kind, account. Empty filter result: "No entries match."

Quick expense is amount, category, and account (`docs/ux.md`). The full form also creates income. Transfer and void have their own forms. A voided row stays in the list.

### Transfer form

Fields: from account, to account, date, and amounts. Same currency shows one amount and states both legs will use it. Cross currency shows two required amounts and states that neither amount will be adjusted by a rate or a fee. An optional fee is a separate amount, category, and the source account, posted as an expense. The submit button reads "Post transfer".

### Budgets

A month switcher shows each category budget in the budget currency: actual, remaining, and overage from `selectBudgetStatus`. Copy last month is an explicit button. There is no rollover banner and no automatic copy when a month opens. Empty month: "No budgets for this month" and Copy last month when the previous month has rows.

### Rate

Settings and Money both show the current rate: the latest `fx_rates` row. "Set rate" writes today's effective date. "Replace rate on date" is the warned historical edit (A-9). Reports show native totals always. A converted total with any missing rate shows "Partial" and the count of excluded amounts.

Loading, error, pending, and offline follow `docs/ux.md`. A money conflict names both versions and asks which draft to keep editing. It does not overwrite the server row.

## Data ownership and constraints

Money owns `accounts`, `categories`, `fx_rates`, `ledger_entries`, `transfer_groups`, and `budgets`.

- Account currency is PKR or USD and does not change after the first posted entry. Opening balance is a signed `bigint` anchor. It is not a ledger row.
- A normal expense or income inherits the account currency. The client cannot submit a different currency. The server rejects a mismatch.
- Amounts on the ledger are positive minor units. Direction comes from `kind` and, for transfers, `transfer_leg`.
- Notes are owner text. They are never an AI context field.
- Void sets `voided_at`. Voided rows stay for history and drop out of every selector below. Voiding one leg of a transfer is rejected; `void_transfer_group` voids both.
- Categories archive by `archived_at`. Archived categories leave pickers. Old rows still show the name. Past budgets for that category still render.
- A budget is one category, one month, one currency, and one amount. Unique on `(owner, category, month)`.
- Transfers never use a category. Fees are expenses with a category. A fee row is not part of the transfer group.
- Same-currency transfer legs have equal `amount_minor` and equal currency. Cross-currency legs store the two submitted amounts. No rate is applied to either leg.
- `selectFxRateForMonth` is the lookup in `docs/architecture.md`. Changing today's rate leaves an earlier month's lookup on its previous row.

### `selectAccountBalance(account, entries)`

Opening minor, plus non-void income, minus non-void expense, minus non-void transfer legs `out`, plus non-void transfer legs `in`, for that account only. The result is a `bigint`.

### `selectSpendByCurrency(entries, localDate)`

Non-void expenses with `occurred_on` equal to `localDate`, summed by currency. Income and transfers are excluded. The result is `{ PKR: bigint, USD: bigint }`. Today uses this for A-10. It is not an AI field.

### `selectBudgetStatus(budget, expenses, rate)`

`expenses` are non-void expense rows for that category and month.

- Same-currency amounts add directly.
- Other-currency amounts convert once with `convertMinor` and `rate` when the rate is present.
- When the rate is missing, those amounts are not added and `excludedExpenseCount` increments.
- `actualMinor` is the sum in the budget currency.
- `remainingMinor = budget.amountMinor - actualMinor`. It may be negative.
- `overageMinor = max(0, actualMinor - budget.amountMinor)`.
- `partial` is true when `excludedExpenseCount > 0`.

The result is `{ categoryId, categoryName, currency, budgetMinor, actualMinor, remainingMinor, overageMinor, partial, excludedExpenseCount }`. No account id and no note.

`formatBudgetStatus` adds `budgetDisplay`, `actualDisplay`, `remainingDisplay`, and `overageDisplay` from `formatMinor`. `formatCashflow` adds `incomeDisplay`, `expenseDisplay`, and `netDisplay` on each currency and `convertedDisplay` on the converted total. Neither formatter adds or converts amounts.

### `selectMonthlyCashflow(entries, month, reportingCurrency, rate)`

Uses non-void income and expense rows with `occurred_on` in the month. Transfer rows are ignored, including their amounts.

```ts
{
  byCurrency: {
    PKR: { incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint }
    USD: { incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint }
  }
  transfersExcluded: true
  converted: {
    currency: "PKR" | "USD"
    netMinor: bigint | null
    excludedCurrencies: Array<"PKR" | "USD">
  }
}
```

`netMinor` per currency is income minus expense. `converted.netMinor` is the reporting-currency sum of the native nets, converting the other currency once when needed. If that conversion lacks a rate, the other currency is listed in `excludedCurrencies` and its net is left out of `converted.netMinor`. Native `byCurrency` is still complete. Opening balances are not inputs.

### `selectFxRateForMonth(rates, month)`

Returns `{ id, effectiveOn, pkrMinorPerUsd }` or `{ missing: true }`.

## Read/write contracts

- Create account, category, budget, income, and expense with client ids, versions, and idempotency keys.
- Expense quick entry writes kind `expense`, the account's currency, and the remembered category and account only after a successful save.
- `post_transfer` writes the group and both legs, and the optional fee expense, in one transaction. A retry with the same idempotency key returns the original ids.
- `void_transfer_group` and a single-entry void set `voided_at` and increment `version`.
- `copy_budgets(from_month, to_month)` inserts rows that the target month does not already have. Existing target rows stay, including their amounts. The result reports `inserted` and `leftUnchanged`. It does not copy actuals, because actuals are derived.
- Set-rate inserts `(effective_on = owner today, pkr_minor_per_usd)`. Replace-rate updates that date's row after the warning and is the only in-place rate write.
- Derived balances are not writable.

Offline money edits queue with the base version (`docs/pwa.md`). A version mismatch surfaces as a conflict. The server row stays.

## Dependencies

- `docs/architecture.md` for minor units, FX snapshot behavior, atomic RPCs, and export columns.
- `docs/ux.md` for Quick Add expense and conflict presentation.
- `docs/savings.md` calls `post_transfer` only indirectly: a purchase calls `purchase_savings_fund`, which inserts an expense. Savings contributions do not call money writes.
- `docs/review.md` calls `selectBudgetStatus`, `selectMonthlyCashflow`, and `selectFxRateForMonth`.
- `docs/ai.md` receives those results only inside `selectMonthlyReview` when finance is included. It never receives ledger rows.

## Edge cases

- Zero amount is rejected.
- From-account equal to to-account is rejected.
- Cross-currency with one amount blank is rejected. The form does not fill the blank from the rate.
- A fee of zero is omitted. A positive fee creates one expense and does not change either leg.
- Two expenses and one transfer in a month: cashflow includes the expenses only.
- Voiding a transfer removes both legs from balances and from budget actuals when the fee is a separate row. The fee remains until it is voided on its own.
- Copy last month into a month that already has one of three categories inserts the other two and reports one left unchanged.
- A missing USD rate with a PKR budget and a USD expense in that category sets `partial` and excludes the USD expense.
- Setting a new rate today leaves last month's `selectFxRateForMonth` result equal to the previous fixture.
- Replacing last month's rate changes last month's lookup. The warning is part of the write path.
- Archived category: new expenses cannot pick it; historical actuals still include it.
- Filters that exclude every row keep the ledger chrome and show the empty message.

## Given / When / Then

1. Given an account opening of 10,000 paisa and one posted expense of 2,500 paisa, when `selectAccountBalance` runs, then the result is 7,500. Given the expense is then voided, when the selector runs again, then the result is 10,000 and the voided row is still readable.
2. Given a same-currency transfer of 5,000 paisa, when it posts, then two legs exist, the amounts match, and `selectMonthlyCashflow` for that month is unchanged by the transfer.
3. Given the same transfer retried with the same idempotency key, when the response returns, then the ledger still has one pair.
4. Given a PKR account and a USD account, when the owner submits 10,000 paisa out and 300 cents in, then those exact amounts are stored and neither equals a rate computation.
5. Given a fee of 100 paisa on that transfer, when it posts, then a separate expense of 100 exists and both legs are still 10,000 and 300.
6. Given a budget of 20,000 paisa and actual expenses of 25,000 paisa, when `selectBudgetStatus` runs, then remaining is −5,000 and overage is 5,000.
7. Given last month has three budgets and this month has one, when Copy last month runs, then two rows insert and the existing row's amount is unchanged. Opening a new month without that button creates no rows.
8. Given a report for a past month and a rate row effective today, when the rate is set, then `selectFxRateForMonth` for the past month returns the older row.
9. Given a USD net and no rate and reporting currency PKR, when cashflow renders, then native USD and PKR totals show and the converted total is marked partial with USD excluded.
10. Given two devices editing the same expense, when the older version submits, then the UI shows a conflict and the server amount is the newer save.
11. Given an expense note that starts with `=`, when the ledger CSV is built, then that cell is prefixed with `'`.
12. Given Quick Add expense, when it saves, then the next expense form shows the same category and account.
