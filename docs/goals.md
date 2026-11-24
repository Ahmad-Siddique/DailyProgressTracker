# Goals

Status: review spec. Progress, stalled items, and goal detail are defined here once. Review and AI call these selectors and do not divide counts themselves. Decisions A-3, A-4, A-16, and A-17 are in `docs/architecture.md`.

## Screens and states

### Goal list

Each row shows title, optional deadline, and progress. Progress text is "Empty" when there are no items. Otherwise it is "{done} of {active}" and the integer percent from `selectGoalProgress`. Archived goals are on a History segment, not in the active list.

Search matches title and notes. Filters: has deadline, deadline past, archived, progress empty, progress complete. Reorder is drag on the active list plus an explicit "Move up" / "Move down" control.

Empty active list: "No goals yet" and Add goal. Loading, error, pending, and offline follow `docs/ux.md`.

### Goal detail

Shows title, notes, deadline, archive action, ordered items, and progress. Each item shows title and status text: Not Started, In Progress, Practicing, Done.

Item actions: set status, move up, move down, link a task, create a task, unlink a task. Create-task asks for confirmation of the title it will copy and does not mark the item Done.

Bulk paste: a text area, one item title per nonblank line. The preview lists the trimmed lines in order and the count. Insert writes the whole preview or nothing. A blank preview does not submit.

Link picker lists the owner's tasks. Linked tasks show title and status. The detail states "Completing a linked task does not change this item."

Opening AI from this screen preselects Current goal (`docs/ai.md`).

## Data ownership and constraints

Goals owns `goals` and `goal_items`. Tasks own the foreign key `tasks.goal_item_id`.

- Goal title is required and nonblank. Notes and deadline are optional.
- Item title is required and nonblank. An item has no notes column and no archive column (A-3).
- Item status is one of `not_started`, `in_progress`, `practicing`, `done`. New items start at `not_started`.
- Any status change sets `status_changed_at` to the current instant. That column is the latest transition only (A-17).
- Order is `position`, unique per goal. Reorder and bulk insert assign positions in one transaction.
- Archive sets `archived_at`. It hides the goal from the active list and from default review progress. It does not delete items or unlink tasks.
- A task links to at most one item. An item links to many tasks. Either screen may set or clear the link.
- No trigger copies task status onto an item, or item status onto a task.

### `selectGoalProgress(items)`

`items` is every item on that goal, including Done items.

- Zero items returns `{ state: "empty" }`.
- Otherwise returns `{ state: "ratio", done, active, percent }` where `done` is the count of status `done`, `active` is `items.length`, and `percent` is the integer nearest `done / active * 100`, half away from zero.
- `practicing` counts in `active` and not in `done`.
- An archived goal uses the same function. The caller decides whether to show the goal. The function does not filter archived goals, because it only sees items.

One of 50 items done returns percent 2.

`formatGoalProgress(progress)` lives in the goals module. It returns `Empty` or `{done} of {active} ({percent}%)`. It does not recount items. Review and AI render this string.

### `selectStalledItems(items, links, asOf)`

`links` gives, for each item id, whether any linked task is not Done and has `local_date` on or after `asOf.localDate`.

An item is stalled when:

- status is `not_started` or `in_progress`, and
- it has no such linked task, and
- `status_changed_at` is more than 14 local days before `asOf.localDate`, or the goal deadline is within 14 local days after `asOf.localDate` inclusive, or the deadline is before `asOf.localDate`.

`practicing` and `done` are omitted. The result is the stalled items in goal order. This is definition A-4.

### `selectGoalDetail(goal, items, tasks)`

Returns the goal id, title, notes, deadline, archived flag, `selectGoalProgress(items)`, the items in position order as `{ id, title, status, position, statusChangedAt }`, `selectStalledItems` ids, and linked tasks as `{ id, title, status, localDate, goalItemId }`. Linked task notes are not included.

The goal screen, Review's per-goal rows, and AI all use this shape for a single goal. Review's list row may use only the progress portion, and that portion is still `selectGoalProgress`.

## Read/write contracts

- Create and update goal: client id, version, RLS.
- Create item, update item status, reorder item: client id, version, RLS. Status update writes `status_changed_at` in the same update.
- `bulk_insert_goal_items(goal_id, titles[], idempotency_key)` inserts every title in order with fresh positions after the current last item. A title that trims to empty is dropped in the preview before the call, so the function receives only nonblank titles. Any failure rolls back the whole call.
- Link and unlink update `tasks.goal_item_id` through the board contract. The goals UI calls that contract; it does not update the item in the same write.
- Create task from item calls the board create contract with the item title, status `todo`, null date, and `goal_item_id` set. The item status stays as it was.
- Archive and unarchive update `archived_at` and `version`.

AI reads through `selectGoalDetail`. It has no goal write route.

## Dependencies

- `docs/architecture.md` for tables and A-3, A-4, A-16, A-17.
- `docs/board.md` for task create, link, and the rule that task completion does not write items.
- `docs/ux.md` for Quick Add goal item and reorder controls.
- `docs/review.md` calls `selectGoalProgress` for each non-archived goal.
- `docs/ai.md` calls `selectGoalDetail` for the current goal or the selected goals.

## Edge cases

- Bulk paste of 50 lines with blank lines between them inserts 50 items, not the blanks.
- A paste that fails on the server leaves the previous items and keeps the paste text in the form.
- Reordering with a stale version returns the current order and keeps the owner's intended order in a retryable draft.
- Progress for a goal with items all Practicing is 0 of N, not Empty.
- Progress for a goal with zero items is Empty, including after the last item is deleted.
- Deleting an item that has linked tasks clears those `goal_item_id` values in the same transaction. The tasks remain.
- Archived goals stay in History with the same progress function.
- Search does not include item titles on the list. Item titles are on the detail screen. The list searches goal title and notes.
- Two goals can have the same title. Ids distinguish them.
- A deadline-only stall: an item moved to In Progress today with a deadline tomorrow is stalled even though the status is new, because the deadline is inside 14 days and it has no upcoming linked task.

## Given / When / Then

1. Given a new goal and no items, when the detail renders, then progress is Empty and the percent is absent.
2. Given 50 pasted lines and a preview of 50 titles, when the owner inserts, then 50 items exist in that order, each Not Started. When one is marked Done, then `selectGoalProgress` is 1 of 50 and 2%.
3. Given a failed bulk insert, when the error shows, then no new items exist and the text area still holds the paste.
4. Given an item linked to a task, when the task is moved to Done, then the item status and `status_changed_at` are unchanged.
5. Given an item, when Create task is confirmed, then a To Do task exists with that title and the link, and the item status is unchanged.
6. Given a goal opened in AI's data, when `selectGoalDetail` runs, then progress on that object equals `selectGoalProgress` for the same items.
7. Given an In Progress item with `status_changed_at` 15 days ago and no upcoming linked task, when `selectStalledItems` runs, then that item is included.
8. Given a Practicing item with the same age, when `selectStalledItems` runs, then it is excluded.
9. Given an archived goal, when the active list renders, then the goal is absent. When History renders, then the goal is present with its progress.
10. Given a link created from the task editor, when the goal detail refreshes, then the task appears on the item, and the item status is unchanged.
11. Given the last item deleted, when progress renders, then the state is Empty.
