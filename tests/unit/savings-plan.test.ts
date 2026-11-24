import { describe, expect, it } from "vitest";
import {
  formatSavingsPlan,
  selectSavingsPlan,
  splitMinor,
  type SavingsFundRow,
} from "../../src/features/savings/selectors";

const helmetFund = (): SavingsFundRow => ({
  id: "helmet",
  name: "Helmet",
  kind: "purchase",
  currency: "PKR",
  targetMinor: 12_000_000n,
  startMonth: "2026-01-01",
  deadlineMonth: "2026-12-01",
  openingAllocationMinor: 0n,
  purchasedAt: null,
});

describe("splitMinor", () => {
  it("distributes remainder on final part", () => {
    const parts = splitMinor(12_000_000n, 11);
    expect(parts[0]).toBe(1_090_909n);
    expect(parts[10]).toBe(1_090_910n);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(12_000_000n);
  });
});

describe("selectSavingsPlan helmet fixture", () => {
  it("month 2 shortfall and revised installments", () => {
    const plan = selectSavingsPlan(helmetFund(), [], "2026-02");
    expect(plan.shortfallMinor).toBe(1_000_000n);
    expect(plan.remainingMonths).toBe(11);
    expect(plan.revisedMonthlyMinor).toBe(1_090_909n);
    expect(plan.finalInstallmentMinor).toBe(1_090_910n);
    const fmt = formatSavingsPlan(plan);
    expect(fmt.shortfallDisplay).toBe("PKR 10,000.00 behind");
    expect(fmt.revisedMonthlyDisplay).toBe("PKR 10,909.09");
    expect(fmt.finalInstallmentDisplay).toBe("PKR 10,909.10");
  });

  it("after deadline overdue is full target", () => {
    const plan = selectSavingsPlan(helmetFund(), [], "2027-01");
    expect(plan.remainingMonths).toBe(0);
    expect(plan.revisedMonthlyMinor).toBeNull();
    expect(plan.overdueMinor).toBe(12_000_000n);
  });
});