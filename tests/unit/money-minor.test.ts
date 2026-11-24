import { describe, expect, it } from "vitest";
import { convertMinor } from "../../src/features/money/minor";
import {
  formatMinor,
  selectAccountBalance,
  selectFxRateForMonth,
  selectMonthlyCashflow,
  type LedgerEntryRow,
} from "../../src/features/money/selectors";

describe("convertMinor", () => {
  it("rounds half away from zero for USD to PKR", () => {
    const rate = 28050n;
    expect(convertMinor(100n, "USD", "PKR", rate)).toBe(28050n);
    expect(convertMinor(1n, "USD", "PKR", rate)).toBe(281n);
  });

  it("is stable across repeated calls", () => {
    const rate = 28050n;
    const a = convertMinor(999n, "USD", "PKR", rate);
    const b = convertMinor(999n, "USD", "PKR", rate);
    expect(a).toBe(b);
  });
});

describe("selectAccountBalance", () => {
  const acct = { id: "a1", openingBalanceMinor: 10_000n };
  const row = (partial: Partial<LedgerEntryRow>): LedgerEntryRow => ({
    id: "e1",
    accountId: "a1",
    categoryId: "c1",
    kind: "expense",
    amountMinor: 2_500n,
    currency: "PKR",
    occurredOn: "2026-01-01",
    voidedAt: null,
    transferLeg: null,
    ...partial,
  });

  it("1 — opening plus expense then void", () => {
    const entries = [row({})];
    expect(selectAccountBalance(acct, entries)).toBe(7_500n);
    const voided = [row({ voidedAt: "2026-01-02T00:00:00Z" })];
    expect(selectAccountBalance(acct, voided)).toBe(10_000n);
  });
});

describe("selectFxRateForMonth", () => {
  it("8 — rate effective today does not change prior month lookup", () => {
    const rates = [
      { id: "1", effectiveOn: "2026-01-15", pkrMinorPerUsd: 28000n },
      { id: "2", effectiveOn: "2026-02-20", pkrMinorPerUsd: 29000n },
    ];
    const jan = selectFxRateForMonth(rates, "2026-01");
    const feb = selectFxRateForMonth(rates, "2026-02");
    expect("missing" in jan).toBe(false);
    expect("missing" in feb).toBe(false);
    if (!("missing" in jan)) expect(jan.pkrMinorPerUsd).toBe(28000n);
    if (!("missing" in feb)) expect(feb.pkrMinorPerUsd).toBe(29000n);
  });
});

describe("selectMonthlyCashflow", () => {
  it("4 — transfers excluded from net", () => {
    const entries: LedgerEntryRow[] = [
      {
        id: "1",
        accountId: "a",
        categoryId: "c",
        kind: "income",
        amountMinor: 5_000n,
        currency: "PKR",
        occurredOn: "2026-03-10",
        voidedAt: null,
        transferLeg: null,
      },
      {
        id: "2",
        accountId: "a",
        categoryId: "c",
        kind: "expense",
        amountMinor: 2_000n,
        currency: "PKR",
        occurredOn: "2026-03-11",
        voidedAt: null,
        transferLeg: null,
      },
      {
        id: "3",
        accountId: "a",
        categoryId: null,
        kind: "transfer",
        amountMinor: 9_000n,
        currency: "PKR",
        occurredOn: "2026-03-12",
        voidedAt: null,
        transferLeg: "out",
      },
    ];
    const flow = selectMonthlyCashflow(entries, "2026-03", "PKR", {
      pkrMinorPerUsd: 28050n,
    });
    expect(flow.byCurrency.PKR.netMinor).toBe(3_000n);
    expect(flow.transfersExcluded).toBe(true);
  });
});

describe("formatMinor", () => {
  it("formats PKR with scale 2", () => {
    expect(formatMinor(1_000_000n, "PKR")).toBe("PKR 10,000.00");
  });
});