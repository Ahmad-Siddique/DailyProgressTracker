# Board

Status: review spec. Today is a filter and a primary screen, not a column. Shared rank, clock, recurrence bounds (A-15), and week start (A-14) live in `docs/architecture.md`.

## Screens and states

### Board

Columns left to right: Backlog, To Do, In Progress, Done. Each column shows its name and the count of cards in it.

A card shows title, and when present, local date, time range, priority text, and the linked goal-item title. Notes show on the card editor, not as the only way to see status.

Views: All, Today, Week. Today keeps the four columns and filters to cards whose `local_date` is the owner's today, plus overdue open cards in a labeled Overdue group above the columns. Week filters to the Monday–Sunday week that contains today. All shows every card in its column.

Agenda order inside a day: timed cards by `start_time` ascending, then untimed cards by `position`.

Search matches title and notes. Filters: priority, has date, overdue, linked to a goal item, status. Empty search shows "No tasks match." A column with no cards shows "Empty" in that column.

Loading, error, pending, and offline follow `docs/ux.md`. A failed move returns the card to the column it left and keeps a retry. The optimistic card is marked pending until the receipt returns.

### Task editor

Fields: title (required), date, start time, end time, notes, priority, goal-item link, reminder toggle when reminders are enabled. The editor states the constraint in text when a time is set without a date, or an end is set without a start, or the end is not later than the start. Save does not run while a constraint is unmet.

### Today

Today is its own route and uses `selectTaskSummary` plus the other modules' selectors. It shows:

- Agenda for the owner's today, timed then untimed.
- Overdue open tasks, title and date.
- Goal deadlines that are today or later, soonest first, from non-archived goals. Deadlines before today appear under "Past deadline" and stay until the goal is archived.
- Spend by currency for today's non-void expenses (A-10), from `selectSpendByCurrency`.
- Current-month savings due: for each non-archived fund, the current installment from `selectSavingsPlan` (the first of the remaining installments), or the overdue amount when `remainingMonths` is 0 and money remains.

Empty Today says "Nothing due today" and offers Quick Add. It does not invent a task.

### Recurrence editor

Cadence daily or weekly. Weekly shows weekday checkboxes. Start date required. End date optional and on or after the start. The editor offers "This occurrence" and "This and future occurrences." Past completed cards are described as unchanged when "future" is chosen.

## Data ownership and constraints

Board owns `tasks`, `recurrence_templates`, and `recurrence_skips`.

- Title is the only required field. After trim it must be non-empty.
- Priority null means no priority is shown. The UI does not invent "normal".
- Moving a card changes `status` and `position` only. It does not set `local_date`.
- Entering Done sets `completed_at` to the server's current instant. Leaving Done sets `completed_at` to null.
- `position` is a lexicographic key unique inside `(owner_id, status)`. Reorder and cross-column move run in `move_task`.
- A goal link is optional and points at one `goal_item`. Completing the task does not write the item. The item's module owns that row.
- There is no timer, Pomodoro, or tracked duration. Start and end are schedule labels.

### Recurrence

A template describes future cards. An occurrence is a task with `recurrence_template_id` and `recurrence_date` equal to its `local_date`. The pair is unique.

`apply_recurrence` inserts a missing occurrence when all of these hold:

- The date is inside the template's start and end inclusive.
- The cadence matches: daily, or weekly and the weekday is selected.
- No task exists for that template and date.
- No skip exists for that template and date.
- The date is inside the catch-up window: from 13 days before the owner's today through the end of the visible horizon. The horizon is the later of the end of the current week view and 7 days after today.
- The occurrence is not before the template start.

Dates older than the catch-up window are left absent. They are not skipped automatically (A-15).

Deleting an occurrence writes a skip for that template and date and deletes the task. If the task is Done, the confirm states that this completion will be removed (A-21).

"This occurrence" sets `detached` on that task and stops copying template field changes onto it. The template id and date stay so the generator does not create a twin. No skip is written.

"This and future" calls `split_recurrence_from`. The previous template's `end_date` becomes the day before the edited date. A new template starts on the edited date with the new fields. Tasks that are Done, or detached, or dated before the edit, keep their stored fields. Incomplete non-detached tasks on or after that date follow the new template.

## Read/write contracts

Creates and edits of a single task go through RLS with a client id, idempotency key, and base version.

`move_task(id, to_status, position, base_version, idempotency_key)` updates status, position, and completion together. A conflict returns the current task and leaves the dragged card on the server's column after refresh. The pending draft of an editor stays.

`apply_recurrence` is idempotent. Calling it twice does not duplicate a date.

`selectTaskSummary(tasks, window, today)` returns:

```ts
{
  window: { from: string; to: string }
  counts: {
    backlog: number
    todo: number
    inProgress: number
    done: number
    overdue: number | null
  }
  openTitles: Array<{
    id: string
    title: string
    status: "backlog" | "todo" | "in_progress"
    localDate: string | null
    priority: "low" | "normal" | "high" | null
  }>
}
```

- `done` counts tasks whose `completed_at` falls on a local date inside the window. It does not use `local_date` of the schedule.
- Open counts use tasks that are not done and whose `local_date` is inside the window, plus undated tasks only when the view is All. Today and Week do not treat undated tasks as inside the window.
- `overdue` counts not-done tasks with `local_date < today`. It is a number when the window contains today. It is null when the window is a past or future period that does not contain today.
- `openTitles` lists overdue open tasks first when overdue is a number, then other open tasks in the window, at most 40. Notes are not in this object.

Review and AI call this function. They do not recount.

Quick Add's parsed time is the `local_date`, `start_time`, and `end_time` written on create. The owner sees the parsed sentence first (`docs/ux.md`).

Link and unlink set `goal_item_id`. Unlink is undoable. The item status is not in the write.

## Dependencies

- `docs/architecture.md` for tables, `move_task`, clock, A-14, A-15, A-21.
- `docs/ux.md` for Quick Add, keyboard, and visible Move.
- `docs/goals.md` for the item picker. Board stores the foreign key and does not update item status.
- `docs/review.md` and `docs/ai.md` consume `selectTaskSummary`.
- `docs/pwa.md` queues creates, edits, and moves. It does not queue AI.

## Edge cases

- A title of spaces is rejected.
- End time equal to start time is rejected. Overnight ranges are out of scope; the owner splits them into two dated tasks. The form says so.
- Dragging onto Done sets completion. Dragging out of Done clears it. The date is unchanged in both cases.
- Two rapid moves of the same card: the second uses the version from the first receipt. If the first is still pending, the second waits on that dependency in the outbox.
- Search with an overdue filter on the Week view shows overdue cards even when their date is outside the week, inside the Overdue group, and does not also duplicate them in a column.
- A detached occurrence keeps its edits when the template title changes.
- A completed occurrence keeps its title when the owner edits the future series.
- Catch-up after 60 days away creates at most 14 days of missing cards, not 60.
- Deleting a not-yet-generated past date does nothing, because there is no card. The owner can only skip cards that exist.
- Linking a task to an archived goal's item is allowed. The item still displays. Completing the task still does not change the item.

## Given / When / Then

1. Given a title and no other fields, when the owner saves, then the task is in Backlog, date and times are null, and priority is null.
2. Given a focused card, when the owner uses the keyboard Move control to In Progress, then status and position change together and `local_date` stays null.
3. Given a card dated yesterday that is not Done, when Today opens, then the card is in the Overdue group and is not given today's date.
4. Given a timed card at 09:00 and an untimed card, when the agenda renders, then the timed card is first.
5. Given a Done card, when it is moved to To Do, then `completed_at` is null and the date is unchanged.
6. Given a weekly template for Monday with no end, when `apply_recurrence` runs, then there is one task for each Monday in the catch-up window and a second run adds zero tasks.
7. Given an occurrence on a date, when the owner deletes it, then a skip exists and a later `apply_recurrence` does not recreate that date.
8. Given a completed past occurrence, when the owner edits this and future titles, then the completed card keeps the old title and a later incomplete occurrence has the new title.
9. Given a task linked to an item, when the task moves to Done, then the item status is unchanged.
10. Given 40 open tasks and 5 more, when `selectTaskSummary` runs for a window that contains today, then `openTitles` has 40 rows and the counts include all of them.
11. Given a past month window that does not contain today, when `selectTaskSummary` runs, then `overdue` is null.
12. Given a drag and a Move menu, when the pointer is unavailable, then the menu alone moves the card.
