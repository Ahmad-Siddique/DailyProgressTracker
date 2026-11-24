import { convertMinor, type Currency } from "./minor";

export type { Currency } from "./minor";

export type LedgerEntryRow = {
  id: string;
  accountId: string;
  categoryId: string | null;
  kind: "expense" | "income" | "transfer";
  amountMinor: bigint;
  currency: Currency;
  occurredOn: string;
  voidedAt: string | null;
  transferLeg: "out" | "in" | null;
  version?: number;
};

export type AccountRow = {
  id: string;
  openingBalanceMinor: bigint;
};

export function selectAccountBalance(
  account: AccountRow,
  entries: LedgerEntryRow[],
): bigint {
  let balance = account.openingBalanceMinor;
  for (const e of entries) {
    if (e.voidedAt != null || e.accountId !== account.id) continue;
    if (e.kind === "income") balance += e.amountMinor;
    else if (e.kind === "expense") balance -= e.amountMinor;
    else if (e.kind === "transfer") {
      if (e.transferLeg === "out") balance -= e.amountMinor;
      else if (e.transferLeg === "in") balance += e.amountMinor;
    }
  }
  return balance;
}

export function selectSpendByCurrency(
  entries: LedgerEntryRow[],
  localDate: string,
): { PKR: bigint; USD: bigint } {
  const out = { PKR: 0n, USD: 0n };
  for (const e of entries) {
    if (e.voidedAt != null || e.kind !== "expense") continue;
    if (e.occurredOn !== localDate) continue;
    out[e.currency] += e.amountMinor;
  }
  return out;
}

export type BudgetInput = {
  id: string;
  categoryId: string;
  categoryName: string;
  month: string;
  currency: Currency;
  amountMinor: bigint;
};

export type BudgetStatus = {
  categoryId: string;
  categoryName: string;
  currency: Currency;
  budgetMinor: bigint;
  actualMinor: bigint;
  remainingMinor: bigint;
  overageMinor: bigint;
  partial: boolean;
  excludedExpenseCount: number;
};

function monthFirstDay(monthKey: string): string {
  return `${monthKey}-01`;
}

function monthLastDay(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 1970, (m ?? 1), 0));
  const yyyy = last.getUTCFullYear();
  const mm = String(last.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(last.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function selectBudgetStatus(
  budget: BudgetInput,
  expenses: LedgerEntryRow[],
  rate: { pkrMinorPerUsd: bigint } | { missing: true },
): BudgetStatus {
  const from = monthFirstDay(budget.month);
  const to = monthLastDay(budget.month);
  let actualMinor = 0n;
  let excludedExpenseCount = 0;

  for (const e of expenses) {
    if (
      e.voidedAt != null ||
      e.kind !== "expense" ||
      e.categoryId !== budget.categoryId
    ) {
      continue;
    }
    if (e.occurredOn < from || e.occurredOn > to) continue;

    if (e.currency === budget.currency) {
      actualMinor += e.amountMinor;
    } else if ("missing" in rate) {
      excludedExpenseCount += 1;
    } else {
      actualMinor += convertMinor(
        e.amountMinor,
        e.currency,
        budget.currency,
        rate.pkrMinorPerUsd,
      );
    }
  }

  const remainingMinor = budget.amountMinor - actualMinor;
  const overageMinor = remainingMinor < 0n ? -remainingMinor : 0n;

  return {
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    currency: budget.currency,
    budgetMinor: budget.amountMinor,
    actualMinor,
    remainingMinor,
    overageMinor,
    partial: excludedExpenseCount > 0,
    excludedExpenseCount,
  };
}

export type MonthlyCashflow = {
  byCurrency: {
    PKR: { incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint };
    USD: { incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint };
  };
  transfersExcluded: true;
  converted: {
    currency: Currency;
    netMinor: bigint | null;
    excludedCurrencies: Currency[];
  };
};

export function selectMonthlyCashflow(
  entries: LedgerEntryRow[],
  month: string,
  reportingCurrency: Currency,
  rate: { pkrMinorPerUsd: bigint } | { missing: true },
): MonthlyCashflow {
  const from = monthFirstDay(month);
  const to = monthLastDay(month);
  const byCurrency = {
    PKR: { incomeMinor: 0n, expenseMinor: 0n, netMinor: 0n },
    USD: { incomeMinor: 0n, expenseMinor: 0n, netMinor: 0n },
  };

  for (const e of entries) {
    if (e.voidedAt != null || e.kind === "transfer") continue;
    if (e.occurredOn < from || e.occurredOn > to) continue;
    if (e.kind === "income") byCurrency[e.currency].incomeMinor += e.amountMinor;
  }
  for (const e of entries) {
    if (e.voidedAt != null || e.kind === "transfer") continue;
    if (e.occurredOn < from || e.occurredOn > to) continue;
    if (e.kind === "expense") byCurrency[e.currency].expenseMinor += e.amountMinor;
  }

  for (const cur of ["PKR", "USD"] as const) {
    byCurrency[cur].netMinor =
      byCurrency[cur].incomeMinor - byCurrency[cur].expenseMinor;
  }

  const excludedCurrencies: Currency[] = [];
  let convertedNet = 0n;
  let canConvert = true;

  for (const cur of ["PKR", "USD"] as const) {
    const net = byCurrency[cur].netMinor;
    if (net === 0n) continue;
    if (cur === reportingCurrency) {
      convertedNet += net;
    } else if ("missing" in rate) {
      excludedCurrencies.push(cur);
      canConvert = false;
    } else {
      convertedNet += convertMinor(
        net,
        cur,
        reportingCurrency,
        rate.pkrMinorPerUsd,
      );
    }
  }

  return {
    byCurrency,
    transfersExcluded: true,
    converted: {
      currency: reportingCurrency,
      netMinor: canConvert ? convertedNet : null,
      excludedCurrencies,
    },
  };
}

export type FxRateRow = {
  id: string;
  effectiveOn: string;
  pkrMinorPerUsd: bigint;
};

export function selectFxRateForMonth(
  rates: FxRateRow[],
  month: string,
): { id: string; effectiveOn: string; pkrMinorPerUsd: bigint } | { missing: true } {
  const cutoff = monthLastDay(month);
  const sorted = [...rates]
    .filter((r) => r.effectiveOn <= cutoff)
    .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn));
  const hit = sorted[0];
  if (!hit) return { missing: true };
  return {
    id: hit.id,
    effectiveOn: hit.effectiveOn,
    pkrMinorPerUsd: hit.pkrMinorPerUsd,
  };
}

export function formatMinor(amountMinor: bigint, currency: Currency): string {
  const scale = 2;
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const major = abs / 100n;
  const minor = abs % 100n;
  const frac = minor.toString().padStart(scale, "0");
  const majorStr = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currency} ${majorStr}.${frac}`;
}

export function formatBudgetStatus(status: BudgetStatus) {
  return {
    ...status,
    budgetDisplay: formatMinor(status.budgetMinor, status.currency),
    actualDisplay: formatMinor(status.actualMinor, status.currency),
    remainingDisplay: formatMinor(status.remainingMinor, status.currency),
    overageDisplay: formatMinor(status.overageMinor, status.currency),
  };
}

export function formatCashflow(flow: MonthlyCashflow) {
  const fmt = (n: bigint, c: Currency) => formatMinor(n, c);
  return {
    ...flow,
    byCurrency: {
      PKR: {
        ...flow.byCurrency.PKR,
        incomeDisplay: fmt(flow.byCurrency.PKR.incomeMinor, "PKR"),
        expenseDisplay: fmt(flow.byCurrency.PKR.expenseMinor, "PKR"),
        netDisplay: fmt(flow.byCurrency.PKR.netMinor, "PKR"),
      },
      USD: {
        ...flow.byCurrency.USD,
        incomeDisplay: fmt(flow.byCurrency.USD.incomeMinor, "USD"),
        expenseDisplay: fmt(flow.byCurrency.USD.expenseMinor, "USD"),
        netDisplay: fmt(flow.byCurrency.USD.netMinor, "USD"),
      },
    },
    converted: {
      ...flow.converted,
      convertedDisplay:
        flow.converted.netMinor != null
          ? fmt(flow.converted.netMinor, flow.converted.currency)
          : null,
    },
  };
}