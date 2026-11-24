# PWA and offline

Status: review spec. Install, the offline shell, and the outbox live here. Domain rules stay in their modules. Decision A-5 and A-6 are in `docs/architecture.md`.

## Screens and states

### Install

The app is served over HTTPS. `manifest.webmanifest` sets `name` to Dayboard, `display` to `standalone`, `start_url` to `/today`, and icons for install on phone home screens. The installed shell uses the same routes and the safe-area padding from `docs/ux.md`.

An install hint can appear in Settings. It does not block use in a browser tab.

### Update

When a new service worker is waiting, a banner says "Update ready" and offers Refresh. Refresh activates the waiting worker. There is no silent reload while a form is dirty: the banner stays until the owner chooses Refresh or discards the draft.

### Offline banner

When the browser is offline, every primary screen shows "Offline. Showing saved data." Records from IndexedDB show "Saved on this phone" and the time they were stored. Pending writes show "Waiting to save" and a count. A permanent failure shows the server message and a Dismiss control. The draft of that write remains.

AI, Export, account deletion, and purchase are disabled offline with the text "Available online." Their forms keep typed drafts and do not add outbox jobs.

### Sign-out

If the outbox is empty, sign-out clears this owner's IndexedDB and the session. If the outbox has jobs, the confirm states the count and that those edits are only on this device. Cancel returns to the app with the queue intact. Confirm deletes the local database and the session, then the queued edits are gone.

## Data ownership and constraints

The service worker caches the app shell and static build assets only. Cache keys are separate from user data. The worker does not cache `/api/*`, Supabase REST or auth responses, HTML that embeds records, AI streams, or CSV and backup downloads.

IndexedDB database name is `dayboard:{userId}`. A second owner on the same browser gets a different database. The worker does not read these databases.

Stores:

- `records` — last successful server snapshots the UI can render offline, keyed by table and id, scoped to the signed-in user.
- `outbox` — jobs not yet acknowledged.

An outbox job is `{ id, idempotencyKey, op, payload, baseVersion, dependsOn, createdAt }`. `dependsOn` lists job ids that must acknowledge first. Money jobs include the base version of every row they edit.

Supported queued ops: task create, edit, and `move_task`; recurrence edits; goal and item writes; expense and income; `post_transfer`; budget writes and `copy_budgets`; fund edits; contribution and withdrawal.

Not queued: AI preview, AI chat, purchase, export, account deletion, push subscription, and rate replace. "Set rate" can queue because it is an insert with an idempotency key. Purchase stays online-only because it must see the current reserved amount and post a ledger expense.

Replay sends jobs in `createdAt` order, waiting for `dependsOn`. The server dedupes on `(owner, idempotencyKey)`. A success stores the receipt and removes the job. A conflict on a money job, or any job whose version does not match, stops that job, leaves the server row as stored, and shows both versions. It does not apply last-write-wins. Later jobs that depend on the conflicted job stay paused. Independent jobs continue.

A permanent rejection (validation, foreign key, insufficient reserved) marks the job failed and does not retry it in a loop. The owner can edit the draft and submit a new idempotency key.

The queue survives reload. A job that already received a receipt is not sent again after reload; the client stores the receipt next to the job until the job is dropped.

## Read/write contracts

Online reads go to Supabase with the user JWT and update `records`. Offline reads render `records` and do not call the network.

Online writes try the network first. On a network failure they become outbox jobs. On a 409 they become conflicts and are not retried blindly. On a 401 the session shows signed-out and the queue pauses until the owner signs in again as the same user. A different user cannot replay the first user's database; the database name will not match, and sign-in does not open another user's IndexedDB.

The service worker serves the shell for navigations when the network fails, then the client renders from IndexedDB. It does not answer `/api/ai/chat` from cache. A cached shell has no chat transcript in it.

Push registration stores `push_subscriptions` only while reminders are enabled. The push payload for a savings reminder omits amounts when `hide_amounts_on_lock_screen` is true (A-6). The in-app inbox is the fallback when push is missing or denied.

## Dependencies

- `docs/architecture.md` for idempotency, versions, RLS, and retention.
- `docs/ux.md` for banner copy, safe area, and sign-out confirm.
- `docs/money.md` and `docs/savings.md` for conflict behavior and the online-only purchase.
- `docs/ai.md` for the offline AI state. The outbox has no AI op.
- Module selectors run on the cached snapshots offline so Today and Review show stale numbers rather than a second math path. The stale time is visible. AI does not run on those snapshots.

## Edge cases

- Create a task offline, reload, and the task is still pending. When the network returns, one insert runs and the card loses the pending label.
- Edit the same task twice offline: the second job depends on the first and carries the version the first job will produce only after the first receipt. If the first job's result version is unknown offline, the second job's payload is the full intended row and the server applies it only if the version matches the receipt of the first job. The client fills `baseVersion` from that receipt before sending the second job.
- Two devices offline on the same expense: each queues a write. The first to sync wins. The second gets a conflict on the device that syncs later.
- Sign-out with a pending task warns. Confirm removes the local task even though the server never stored it.
- A queued transfer replays once. The idempotency key blocks a second pair if the client retries after a timeout that actually succeeded.
- Offline AI keeps the draft and does not send it when the browser comes back. The owner sends again.
- Update banner during a dirty Quick Add does not reload until Refresh.
- The installed app and the browser tab for the same user share origin storage. Signing out in one place clears the shared IndexedDB for that user.
- iOS or Android may refuse Web Push. Settings says push is unavailable and the in-app inbox still lists reminders.

## Given / When / Then

1. Given a task created offline, when the page reloads still offline, then the task is visible and marked waiting. When the app returns online, then one insert succeeds and a second sync does not duplicate it.
2. Given an expense edited offline on two devices, when both sync, then one version is stored and the other device shows a conflict with both amounts.
3. Given a pending outbox, when the owner chooses sign-out and then cancels, then the pending task remains. When the owner confirms, then IndexedDB for that user is gone.
4. Given airplane mode, when the owner opens AI and types, then Send is disabled, the draft remains, and the outbox has no AI job.
5. Given a successful transfer timeout after the server committed, when the client retries the same idempotency key, then the ledger still has one pair.
6. Given a waiting service worker and a dirty form, when the update arrives, then the form stays put until the owner presses Refresh.
7. Given a request to `/api/ai/chat` while offline, when the service worker handles it, then it does not return a cached chat body.
8. Given owner A's database in IndexedDB, when owner B signs in, then B's reads do not show A's tasks.
9. Given reminders enabled and push permission denied, when a reminder fires, then the in-app inbox shows it.
10. Given hide-amounts on, when a push is delivered, then the payload has no amount digits.
11. Given purchase tapped offline, when the button renders, then it is disabled and no release or expense exists.
12. Given cached tasks from yesterday, when Review opens offline, then the stale time is visible and the progress text still comes from `selectGoalProgress` on the cached items.
