export type Currency = "PKR" | "USD";

export const CURRENCY_SCALE: Record<Currency, number> = {
  PKR: 2,
  USD: 2,
};

export function roundHalfAwayFromZero(
  numerator: bigint,
  divisor: bigint,
): bigint {
  if (divisor === 0n) {
    throw new Error("divisor cannot be zero");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator < 0n ? -numerator : numerator;
  const half = divisor / 2n;
  return sign * ((abs + half) / divisor);
}

/** Converts minor units once using a PKR-per-USD rate stored as paisa per dollar. */
export function convertMinor(
  amountMinor: bigint,
  from: Currency,
  to: Currency,
  pkrMinorPerUsd: bigint,
): bigint {
  if (from === to) return amountMinor;
  if (from === "USD" && to === "PKR") {
    return roundHalfAwayFromZero(amountMinor * pkrMinorPerUsd, 100n);
  }
  return roundHalfAwayFromZero(amountMinor * 100n, pkrMinorPerUsd);
}