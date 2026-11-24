export type PushPayloadInput = {
  subjectType: "task" | "savings_fund";
  title: string;
  hideAmountsOnLockScreen: boolean;
  /** Human-readable installment when amounts may be shown */
  amountLabel?: string | null;
};

export function buildPushNotificationBody(input: PushPayloadInput): {
  title: string;
  body: string;
} {
  if (input.subjectType === "task") {
    return {
      title: "Task due",
      body: input.title,
    };
  }

  const fundLine = input.title;
  const amount = input.amountLabel?.trim();
  let body = amount ? `Savings due · ${fundLine}` : `Savings due · ${fundLine}`;
  if (amount && !input.hideAmountsOnLockScreen) {
    body = `${body} · ${amount}`;
  }
  if (input.hideAmountsOnLockScreen) {
    body = body.replace(/\d/g, "");
  }
  return { title: "Savings due", body };
}

export function buildReminderDedupeKey(
  subjectType: string,
  subjectId: string,
  fireAtIso: string,
): string {
  return `${subjectType}:${subjectId}:${fireAtIso}`;
}