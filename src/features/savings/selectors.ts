import { formatMinor, type Currency } from "../money/selectors";

export type SavingsFundRow = {
  id: string;
  name: string;
  kind: "purchase" | "general";
  currency: Currency;
  targetMinor: bigint;
  startMonth: string;
  deadlineMonth: string;
  openingAllocationMinor: bigint;
  purchasedAt: string | null;
};

export type SavingsEntryRow = {
  fundId: string;
  kind: "contribution" | "withdrawal" | "release";
  amountMinor: bigint;
  occurredOn: string;
};

export function splitMinor(totalMinor: bigint, parts: number): bigint[] {
  if (parts < 1) throw new Error("parts must be >= 1");
  const base = totalMinor / BigInt(parts);
  const remainder = totalMinor - base * BigInt(parts);
  const out: bigint[] = [];
  for (let i = 0; i < parts; i += 1) {
    out.push(i === parts - 1 ? base + remainder : base);
  }
  return out;
}

function monthKeyFromDate(date: string): string {
  return date.slice(0, 7);
}

function enumerateMonths(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let y = sy ?? 1970;
  let m = sm ?? 1;
  const endY = ey ?? 1970;
  const endM = em ?? 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function reservedMinor(
  fund: SavingsFundRow,
  entries: SavingsEntryRow[],
): bigint {
  let reserved = fund.openingAllocationMinor;
  for (const e of entries) {
    if (e.fundId !== fund.id) continue;
    if (e.kind === "contribution") reserved += e.amountMinor;
    else if (e.kind === "withdrawal" || e.kind === "release") {
      reserved -= e.amountMinor;
    }
  }
  return reserved;
}

export type SavingsPlan = {
  fundId: string;
  name: string;
  kind: "purchase" | "general";
  currency: Currency;
  targetMinor: bigint;
  openingAllocationMinor: bigint;
  savedMinor: bigint;
  remainingMinor: bigint;
  startMonth: string;
  deadlineMonth: string;
  asOfMonth: string;
  baselineMonthlyMinor: bigint;
  shortfallMinor: bigint;
  remainingMonths: number;
  revisedMonthlyMinor: bigint | null;
  finalInstallmentMinor: bigint | null;
  funded: boolean;
  purchased: boolean;
  overdueMinor: bigint | null;
};

export function selectSavingsPlan(
  fund: SavingsFundRow,
  entries: SavingsEntryRow[],
  asOfMonth: string,
): SavingsPlan {
  const savedMinor = reservedMinor(fund, entries);
  const startKey = monthKeyFromDate(fund.startMonth);
  const deadlineKey = monthKeyFromDate(fund.deadlineMonth);
  const planMonths = enumerateMonths(startKey, deadlineKey);
  const inclusiveMonths = planMonths.length;

  const baselinePool = fund.targetMinor - fund.openingAllocationMinor;
  const baselineInstallments = splitMinor(baselinePool, inclusiveMonths);
  const baselineMonthlyMinor = baselineInstallments[0] ?? 0n;

  const plannedBefore = planMonths
    .filter((m) => m < asOfMonth)
    .reduce((sum, m) => {
      const idx = planMonths.indexOf(m);
      return sum + (baselineInstallments[idx] ?? 0n);
    }, 0n);
  const savedBeyondOpening = savedMinor - fund.openingAllocationMinor;
  const shortfallMinor = plannedBefore - savedBeyondOpening;
  const remainingMinor =
    fund.targetMinor > savedMinor ? fund.targetMinor - savedMinor : 0n;

  let remainingMonths: number;
  let revisedInstallments: bigint[] | null = null;

  if (asOfMonth < startKey) {
    remainingMonths = inclusiveMonths;
    revisedInstallments = splitMinor(remainingMinor, remainingMonths);
  } else if (asOfMonth > deadlineKey) {
    remainingMonths = 0;
    revisedInstallments = null;
  } else {
    remainingMonths = planMonths.filter((m) => m >= asOfMonth).length;
    if (remainingMinor > 0n && remainingMonths > 0) {
      revisedInstallments = splitMinor(remainingMinor, remainingMonths);
    } else if (remainingMonths > 0) {
      revisedInstallments = Array.from({ length: remainingMonths }, () => 0n);
    }
  }

  const revisedMonthlyMinor: bigint | null =
    revisedInstallments && revisedInstallments.length > 0
      ? (revisedInstallments[0] ?? null)
      : null;
  const finalInstallmentMinor: bigint | null =
    revisedInstallments && revisedInstallments.length > 0
      ? (revisedInstallments[revisedInstallments.length - 1] ?? null)
      : null;

  const overdueMinor =
    asOfMonth > deadlineKey ? remainingMinor : null;

  return {
    fundId: fund.id,
    name: fund.name,
    kind: fund.kind,
    currency: fund.currency,
    targetMinor: fund.targetMinor,
    openingAllocationMinor: fund.openingAllocationMinor,
    savedMinor,
    remainingMinor,
    startMonth: startKey,
    deadlineMonth: deadlineKey,
    asOfMonth,
    baselineMonthlyMinor,
    shortfallMinor,
    remainingMonths,
    revisedMonthlyMinor,
    finalInstallmentMinor,
    funded: savedMinor >= fund.targetMinor,
    purchased: fund.purchasedAt != null,
    overdueMinor,
  };
}

export function formatSavingsPlan(plan: SavingsPlan) {
  const fmt = (n: bigint | null) =>
    n == null ? null : formatMinor(n, plan.currency);
  const shortfallDisplay =
    plan.shortfallMinor > 0n
      ? `${formatMinor(plan.shortfallMinor, plan.currency)} behind`
      : plan.shortfallMinor < 0n
        ? `${formatMinor(-plan.shortfallMinor, plan.currency)} ahead`
        : formatMinor(0n, plan.currency);

  return {
    targetDisplay: fmt(plan.targetMinor)!,
    savedDisplay: fmt(plan.savedMinor)!,
    remainingDisplay: fmt(plan.remainingMinor)!,
    baselineMonthlyDisplay: fmt(plan.baselineMonthlyMinor)!,
    shortfallDisplay,
    revisedMonthlyDisplay: fmt(plan.revisedMonthlyMinor),
    finalInstallmentDisplay: fmt(plan.finalInstallmentMinor),
    overdueDisplay: fmt(plan.overdueMinor),
  };
}

export type AnnualGridCell = {
  month: string;
  contributionMinor: bigint;
  withdrawalMinor: bigint;
  savedMinor: bigint;
  planRevisedMonthlyMinor: bigint | null;
};

export function selectAnnualSavingsGrid(
  funds: SavingsFundRow[],
  entries: SavingsEntryRow[],
  year: string,
): Array<{ fundId: string; name: string; cells: AnnualGridCell[] }> {
  const active = funds;
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });

  return active.map((fund) => {
    const cells = months.map((monthKey) => {
      const contrib = entries
        .filter(
          (e) =>
            e.fundId === fund.id &&
            e.kind === "contribution" &&
            e.occurredOn.startsWith(monthKey),
        )
        .reduce((s, e) => s + e.amountMinor, 0n);
      const withdraw = entries
        .filter(
          (e) =>
            e.fundId === fund.id &&
            e.kind === "withdrawal" &&
            e.occurredOn.startsWith(monthKey),
        )
        .reduce((s, e) => s + e.amountMinor, 0n);

      const thru = `${monthKey}-31`;
      const savedEntries = entries.filter(
        (e) => e.fundId === fund.id && e.occurredOn <= thru,
      );
      const savedMinor = reservedMinor(fund, savedEntries);
      const plan = selectSavingsPlan(fund, savedEntries, monthKey);

      return {
        month: monthKey,
        contributionMinor: contrib,
        withdrawalMinor: withdraw,
        savedMinor,
        planRevisedMonthlyMinor: plan.revisedMonthlyMinor,
      };
    });
    return { fundId: fund.id, name: fund.name, cells };
  });
}