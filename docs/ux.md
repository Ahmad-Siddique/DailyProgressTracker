# UX

Status: review spec. Navigation, themes, Quick Add, reminders presentation, and the Export and Settings screens live here. Feature rules live in the module specs. Shared clock, ownership, and shortcut decision A-13 live in `docs/architecture.md`.

## Screens and states

### App shell

At `>=768px` a left sidebar lists primary destinations Today, Board, Goals, and Money, then secondary destinations Review, Export, and Settings. The main column shows the route. The AI panel is a right column and does not cover the left sidebar.

At `<768px` a bottom tab bar lists Today, Board, Goals, and Money. Review, Export, and Settings sit in a More sheet opened from the bar. The AI surface is a full-height sheet in the area above the tab bar, including safe-area padding. The tab bar stays visible and in tab order. Closing the sheet returns to the same route.

The command palette opens from a header button. Cmd/Ctrl+K also opens it, except while focus is in an input, textarea, select, or contenteditable (A-13). Single-key shortcuts follow the same rule. Palette actions navigate, open Quick Add, and open AI. Choosing an action moves focus to the destination.

### Global states

| State | What the owner sees |
| --- | --- |
| Loading | The destination title and a text status "Loading". |
| Empty | What this screen records and the one action that adds the first record. |
| Error | The failed action, a Retry control, and the draft still in the form. |
| Pending | "Waiting to save" on the record. The control that would duplicate it is disabled. |
| Offline | A banner "Offline. Showing saved data." plus pending counts. Specified in `docs/pwa.md`. |

Status is text plus a color. Color is never the only signal. Focus rings are visible on buttons, links, cards, and dialogs. `prefers-reduced-motion: reduce` disables positional animation; drag still drops, and the Move control still works. Theme is light, dark, or system. System follows `prefers-color-scheme`. Contrast for text and controls meets WCAG AA.

Destructive actions that cannot be undone ask for confirmation. Reversible edits offer Undo for a short interval: restoring a void is not undo (void stays in history); moving a task back is undo; unlinking a goal item is undo.

Every drag and every swipe has a visible control that performs the same change.

### Quick Add

One Quick Add control is available from every primary screen. The kinds are task, expense, goal item, and contribution. The form asks for the essential fields only.

| Kind | Essential fields | Remembered defaults |
| --- | --- | --- |
| Task | Title. Optional date and time after parse preview. | None. |
| Expense | Amount, category, account. | Last valid category and account for that kind of entry. |
| Goal item | Goal, title. | Current goal when opened from a goal. |
| Contribution | Fund, amount. Currency is the fund currency, shown as text. | Last fund. |

If the task text contains a time, the form shows "Will save as {local date} {start}–{end}" or "Will save as {local date} {start}" before the write. Save stays disabled until that sentence is visible. If no time parses, the sentence is "No time will be saved." Enter confirms only after the sentence is visible.

Quick Add does not create a transfer, a budget, or a purchase. Those have their own forms.

### AI entry

A header control opens the AI panel. Opening it from a goal preselects that goal as Current goal. Opening it from Review preselects the review's month. Finance stays off. The unsent draft remains when the panel closes and when the route changes. Panel layout, chips, and provider failures are specified in `docs/ai.md`.

### Settings

- Theme: light, dark, system.
- Timezone: IANA list, default `Asia/Karachi`. Saving a change warns that stored wall dates stay as written and later month boundaries use the new zone.
- Reporting currency: PKR or USD. Default PKR.
- Exchange rate: "Set rate" for today, and a separate "Replace rate on date" that shows warning A-9 before it writes.
- Reminders master switch, default off.
- Hide amounts on the lock screen, default on.
- Saved chats master switch, default off. Turning it on explains that threads are stored in the account until deleted. Turning it off leaves existing threads until the owner deletes them.
- Sign out. If the outbox has writes, the confirm names the count and offers Cancel.

### Reminders UI

The master switch is off until the owner turns it on. The browser permission prompt runs only then. Denied or unsupported permission shows "Push is unavailable. In-app reminders stay on." Per-task and per-fund reminder toggles appear only while the master switch is on. A task toggle is disabled when the task has no date, with the text "Add a date to remind."

The in-app inbox lists due reminders. With amounts hidden, a savings reminder reads "Savings due" and the fund name. The amount is visible inside the app on the fund itself. With amounts shown, the inbox includes the installment figure from `selectSavingsPlan`.

### Export

The Export screen has two actions: download CSV pack, download backup JSON. Each shows a pending state and an error with Retry. The screen states that the files are a copy, not a restore tool, and that a restore import is not part of this app. Formula-sensitive cells are escaped as in `docs/architecture.md`.

### Login

Email and password. The first owner can sign up. Any other attempt shows "This app is private." There is no sample data and no demo account.

## Data ownership and constraints

The shell owns preferences on `profiles` and the theme attribute on the document. It does not own tasks, goals, ledger rows, or savings entries. Quick Add writes through the owning module's contract: board for a task, money for an expense, goals for an item, savings for a contribution.

The command palette reads route names and record titles already loaded for search. It does not write.

## Read/write contracts

- Theme and timezone and reporting currency and reminder flags and saved-chat flag update `profiles` with the row version.
- "Set rate" calls the money insert specified in `docs/money.md`.
- Quick Add task calls board create. Expense calls money expense create. Goal item calls goals create item. Contribution calls savings contribution create.
- Sign-out calls the PWA clear sequence in `docs/pwa.md`.
- CSV and backup call the export routes in `docs/architecture.md`.

## Dependencies

- `docs/architecture.md` for clock, RLS, export, and decisions A-9, A-10, A-13, A-14.
- Board, Goals, Money, and Savings for Quick Add writes.
- `docs/ai.md` for the panel.
- `docs/pwa.md` for offline, install, and sign-out.
- `docs/review.md` for the Review destination.

## Edge cases

- At 360px the tab bar, More, Quick Add, and AI sheet all fit the viewport width. No primary tab sits under the AI sheet.
- Opening the palette while typing in Quick Add does nothing. The Quick Add button still opens the palette's action by pointer.
- Closing AI with a half-written question keeps the question.
- A failed expense save keeps amount, category, and account in the form.
- Keyboard-only: every destination, Quick Add, Move, Save, and AI open/close is reachable without a pointer. Focus returns to the opener when a dialog closes.
- Installed standalone mode uses the same tab bar and safe-area padding. It does not add a second navigation.
- Reduced motion: column changes still announce the new status in text.

## Given / When / Then

1. Given a 360px viewport, when the owner opens each primary tab and More, then the tab bar remains visible and each destination renders without a horizontal page scroll.
2. Given focus inside the task title field, when Cmd/Ctrl+K is pressed, then the palette stays closed and the key is not stolen from the field.
3. Given focus on the page header, when Cmd/Ctrl+K is pressed, then the palette opens.
4. Given Quick Add text that parses to a time, when the owner has not yet seen the parsed sentence, then Save is disabled. When the sentence is visible and the owner confirms, then the task stores that date and time.
5. Given Quick Add text with no time, when the owner saves, then the task has a title and null times, and the form had shown "No time will be saved."
6. Given the AI draft "helmet", when the owner closes the panel and opens Board, then reopening AI shows "helmet".
7. Given reminders off, when the app loads, then the browser has not been asked for notification permission.
8. Given reminders turned on and permission denied, when a task reminder comes due, then it appears in the in-app inbox.
9. Given hide-amounts on, when a savings reminder is delivered through push, then the body has the fund name and does not contain a digit amount.
10. Given a keyboard-only session, when the owner moves from the header through Quick Add to Save, then each step has a visible focus ring.
11. Given system theme and an OS dark preference, when the app loads, then the document uses the dark theme.
12. Given a void confirmation, when the owner cancels, then the ledger row stays posted.
