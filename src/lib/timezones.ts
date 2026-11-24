/** Common IANA zones for Settings; default Asia/Karachi first. */
export const TIMEZONE_OPTIONS = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

export const TIMEZONE_CHANGE_WARNING =
  "Stored dates and times stay as written. Month and week boundaries will use the new timezone after you save.";