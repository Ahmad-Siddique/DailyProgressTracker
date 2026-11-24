export type ParsedTaskTime =
  | { kind: "none" }
  | {
      kind: "timed";
      localDate: string;
      startTime: string;
      endTime: string | null;
      preview: string;
    };

const TIME_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime12(h: number, m: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad2(m)} ${suffix}`;
}

function parseHourMinute(
  hour: number,
  minute: number,
  meridiem: string | undefined,
): { h: number; m: number } | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (meridiem) {
    const m = meridiem.toLowerCase().replace(/\./g, "");
    if (m === "pm" && hour < 12) hour += 12;
    if (m === "am" && hour === 12) hour = 0;
    if (hour > 23) return null;
  } else if (hour > 23) {
    return null;
  }
  return { h: hour, m: minute };
}

/**
 * Best-effort time extraction from Quick Add task text (wall clock, no TZ shift).
 */
export function parseTaskTime(
  text: string,
  referenceLocalDate: string,
): ParsedTaskTime {
  const match = TIME_RE.exec(text);
  if (!match) return { kind: "none" };

  const hourRaw = Number(match[1]);
  const minute = match[2] != null ? Number(match[2]) : 0;
  const meridiem = match[3];
  const parsed = parseHourMinute(hourRaw, minute, meridiem);
  if (!parsed) return { kind: "none" };

  const startTime = `${pad2(parsed.h)}:${pad2(parsed.m)}:00`;
  const startLabel = formatTime12(parsed.h, parsed.m);
  const preview = `Will save as ${referenceLocalDate} ${startLabel}`;

  return {
    kind: "timed",
    localDate: referenceLocalDate,
    startTime,
    endTime: null,
    preview,
  };
}

export function taskTimePreviewSentence(
  text: string,
  referenceLocalDate: string,
): string {
  const parsed = parseTaskTime(text, referenceLocalDate);
  if (parsed.kind === "none") return "No time will be saved.";
  return parsed.preview;
}