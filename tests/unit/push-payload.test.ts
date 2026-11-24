import { describe, expect, it } from "vitest";
import {
  buildPushNotificationBody,
  buildReminderDedupeKey,
} from "../../src/features/reminders/push-payload";

describe("push payload", () => {
  it("omits amount digits when hide amounts is on", () => {
    const { body } = buildPushNotificationBody({
      subjectType: "savings_fund",
      title: "Helmet fund",
      hideAmountsOnLockScreen: true,
      amountLabel: "PKR 10,909.09",
    });
    expect(body).toContain("Helmet fund");
    expect(body).not.toMatch(/\d/);
  });

  it("includes amount when hide amounts is off", () => {
    const { body } = buildPushNotificationBody({
      subjectType: "savings_fund",
      title: "Helmet fund",
      hideAmountsOnLockScreen: false,
      amountLabel: "PKR 10,909.09",
    });
    expect(body).toMatch(/10/);
  });

  it("dedupe key is stable per subject and fire instant", () => {
    const key = buildReminderDedupeKey(
      "task",
      "00000000-0000-4000-8000-000000000001",
      "2026-04-01T09:00:00.000Z",
    );
    expect(key).toBe(
      "task:00000000-0000-4000-8000-000000000001:2026-04-01T09:00:00.000Z",
    );
  });
});