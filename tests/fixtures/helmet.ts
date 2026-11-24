import type { SavingsFundRow } from "../../src/features/savings/selectors";

export function helmetFund(): SavingsFundRow {
  return {
    id: "helmet",
    name: "Helmet",
    kind: "purchase",
    currency: "PKR",
    targetMinor: 12_000_000n,
    startMonth: "2026-01-01",
    deadlineMonth: "2026-12-01",
    openingAllocationMinor: 0n,
    purchasedAt: null,
  };
}