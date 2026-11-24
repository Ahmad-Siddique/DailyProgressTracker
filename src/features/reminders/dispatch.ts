import { buildReminderDedupeKey } from "./push-payload";

export type ReminderInsert = {
  ownerId: string;
  subjectType: "task" | "savings_fund";
  subjectId: string;
  fireAt: Date;
  enabled?: boolean;
};

export function reminderRowFromInsert(input: ReminderInsert) {
  const fireAtIso = input.fireAt.toISOString();
  return {
    owner_id: input.ownerId,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    fire_at: fireAtIso,
    dedupe_key: buildReminderDedupeKey(
      input.subjectType,
      input.subjectId,
      fireAtIso,
    ),
    enabled: input.enabled ?? true,
  };
}