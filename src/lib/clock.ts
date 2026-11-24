import type { ProfileRow } from "@/types/database";

export interface OwnerClock {
  timezone: string;
  localDate: string;
  localDateTime: string;
  weekStartDate: string;
  monthKey: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatLocalParts(
  parts: Intl.DateTimeFormatPart[],
): { y: string; m: string; d: string; h: string; min: string } {
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    y: map.year ?? "1970",
    m: map.month ?? "01",
    d: map.day ?? "01",
    h: map.hour ?? "00",
    min: map.minute ?? "00",
  };
}

/** Monday-based week start in the owner's timezone. */
function weekStartFromLocalDate(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const day = utc.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

/**
 * Owner-local calendar derived from UTC instant and profile timezone.
 * Week starts Monday (A-14).
 */
export function ownerClock(
  profile: Pick<ProfileRow, "timezone">,
  nowUtc: Date,
): OwnerClock {
  const tz = profile.timezone || "Asia/Karachi";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatLocalParts(formatter.formatToParts(nowUtc));
  const localDate = `${parts.y}-${parts.m}-${parts.d}`;
  const localDateTime = `${localDate}T${parts.h}:${parts.min}:00`;
  const monthKey = `${parts.y}-${parts.m}`;
  const weekStartDate = weekStartFromLocalDate(localDate);

  return {
    timezone: tz,
    localDate,
    localDateTime,
    weekStartDate,
    monthKey,
  };
}