# Plan 001: Every shopping-queue line explains why it is there and when its count was last confirmed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 10a0cd8..HEAD -- migrations src/shared/pantry.ts src/server/repository.ts src/server/mcp.ts src/client README.md ROADMAP.md test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `10a0cd8`, 2026-11-11

## Why this matters

`ROADMAP.md` names this as the project's **next shippable slice**: "Add 'last
confirmed' and 'why replenish' details to the existing shopping queue before
building prediction." Its "Now" release asks that a shopper "distinguish
confirmed stock from quantities that need a check", and its first pilot gate
requires "every exported quantity is traceable". Today each queue line carries
only `quantityNeeded`. The shopper sees "Coffee beans — 1 bag" with no current
count, no target, and no indication of whether anyone has checked the count.
MCP consumers get the same bare line. The system also stores nothing that could
answer "last confirmed". After this plan:

- every queue line (HTTP snapshot, MCP snapshot, MCP export) carries current
  quantity, target, the most recent applied change, the last confirmed-count
  time, and a `countStatus`
- the dashboard shows these details and a one-tap "Count is right" action that
  records a confirmation without changing stock

## Current state

- `src/shared/pantry.ts:3-14` — `itemSchema` (shared Worker/MCP contract) has no count timestamp.
- `src/shared/pantry.ts:24-33` — queue lines:
  ```ts
  shoppingQueue: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      unit: z.string(),
      quantityNeeded: z.number(),
      catalogProvider: z.string().nullable(),
      providerItemId: z.string().nullable(),
    }),
  ),
  ```
- `src/server/repository.ts:10-21` — `itemColumns` SQL projection used by every item read.
- `src/server/repository.ts:157-168` — `createItem` INSERT (no count timestamp).
- `src/server/repository.ts:348-398` — `linkItem` absolute correction. A non-null `quantity` is compare-and-set against `expectedQuantity`. The journal INSERT has `AND quantity != ?`, so an unchanged count writes no event, but the item `UPDATE ... AND quantity = ?` still matches. That is the hook for "confirm an unchanged count".
- `src/server/repository.ts:438-498` — `getSnapshot` runs one `db.batch` with two SELECTs (items, then 30 recent activity rows) and derives `shoppingQueue` in JS at lines 476-485.
- `src/server/mcp.ts:83-96` — `shopping_queue_export`. The markdown line is `- [ ] ${name} — ${quantityNeeded} ${unit}`. JSON is `JSON.stringify(snapshot.shoppingQueue)`.
- `src/client/snapshot.ts` — the dashboard's **deliberately tolerant** zod boundary. Each field has a `.catch` default, and unknown keys are stripped. New server fields vanish in the dashboard unless they are added here. Keep the tolerant style; this is a documented decision in `docs/refactoring/untangle-2026-11-06.md`.
- `src/client/shopping-receipt.tsx` — receipt UI; one `<li className="receipt-line">` per queue item.
- `src/client/app.tsx:190-238` — `handleAdjust`. This is the exemplar for a write command: session generation guard, `pendingItemId`, a `committed` flag, refetch after commit, and `isAuthError` → `handleAuthFailure`. Mirror it exactly for the new command.
- `src/client/api.ts:131-145` — `linkItem` posts to `/api/items/:id/link`.
- `migrations/0001_initial.sql`, `migrations/0002_correction_journal.sql` — existing schema. `migrations/` is applied in tests by `test/setup.ts` via `readD1Migrations`.
- `README.md:16-18` — documents the link/correction contract. It must be extended, not contradicted.

Conventions: zod for all payload validation (AGENTS.md); `Intl.DateTimeFormat` via `formatDate` in `src/client/format.ts` for dates; SQL timestamps use `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`; PantryError for domain errors; tests are Vitest in `test/` (worker project for `test/*.test.ts` that aren't `client-*`, Node project for `test/client-*.test.{ts,tsx}`).

## Design decisions (fixed — do not re-litigate)

- **What counts as a confirmation**: a statement of the _absolute_ on-hand count. That is item creation (`POST /api/items`) or a non-null `onHand` correction through `/api/items/:id/link`, **including an unchanged value**. Relative changes (station scans, +/-, MCP `pantry_adjust`) never confirm a total.
- **Storage**: a nullable `items.counted_at` column (migration 0003). Backfill it from the latest applied `'dashboard setup'` correction event, else `created_at`. Raw SQL inserts (e.g. `scripts/seed.sql`) leave it NULL, which renders as "not counted yet".
- **`countStatus`**: `"counted"` when `countedAt` is within `countCheckAfterDays = 14` days of the snapshot's `generatedAt`, otherwise `"needs_check"`. The 14 days match the roadmap's two-week pilot. It lives in `src/shared/pantry.ts` so the server is the single source.
- **`lastChange`**: the most recent _applied_ journal entry for the item (`{ delta, source, reason, createdAt }`), or `null` once history has aged past retention.
- **Confirmation from the dashboard**: posts `{ onHand: q, expectedQuantity: q }` only. A stale page gets the existing `409 inventory_conflict`. The link drawer is unchanged: it still sends a correction only when on-hand changed.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
| --------- | ---------------------------------------- | ------------------- |
| Install   | `pnpm install --frozen-lockfile`         | exit 0              |
| Format    | `pnpm format:check` (fix: `pnpm format`) | exit 0              |
| Lint      | `pnpm lint`                              | exit 0, 0 warnings  |
| Typecheck | `pnpm typecheck`                         | exit 0              |
| Tests     | `pnpm test`                              | all pass            |
| Build     | `pnpm exec cf deploy --dry-run`          | exit 0 (no upload)  |

Never run `pnpm cf deploy` or `pnpm deploy`.

## Scope

**In scope**:

- `migrations/0003_item_counts.sql` (create)
- `src/shared/pantry.ts`, `src/server/repository.ts`, `src/server/mcp.ts`
- `src/client/snapshot.ts`, `src/client/api.ts`, `src/client/app.tsx`, `src/client/dashboard.tsx`, `src/client/shopping-receipt.tsx`, `src/client/format.ts`, `src/client/styles.css`
- `test/worker.test.ts`, `test/client-api.test.ts`, `test/client-dashboard.test.tsx`, `test/client-http.test.ts`
- `README.md`, `ROADMAP.md`

**Out of scope**:

- `firmware/**` — the station protocol does not change.
- `e2e/pantry.e2e.ts` and `.github/workflows/ci.yml`. The `audited-base` CI leg asserts exactly 5 e2e cases (ci.yml:117-120), so adding an e2e case breaks CI until plan 004 lands.
- `src/client/link-form.ts` `quantityCorrection` — the drawer contract stays "send only when changed".
- MCP `pantry_link_item` input schema — do not add `onHand` to MCP in this plan.

## Steps

### Step 1: Migration 0003

Create `migrations/0003_item_counts.sql`:

```sql
-- Last time someone stated an absolute on-hand count: item creation or a
-- dashboard/API count correction, including confirming an unchanged count.
-- Relative station scans and +/- adjustments never confirm a total.
ALTER TABLE items ADD COLUMN counted_at TEXT;

UPDATE items
SET counted_at = COALESCE(
  (
    SELECT MAX(created_at)
    FROM inventory_events
    WHERE inventory_events.item_id = items.id
      AND source = 'admin'
      AND reason = 'dashboard setup'
      AND applied_at IS NOT NULL
  ),
  created_at
);
```

(SQLite cannot `ADD COLUMN` with a non-constant default, so the column is nullable and writers set it explicitly.)

**Verify**: `pnpm test` → still all pass (the column is unused so far).

### Step 2: Shared contract

In `src/shared/pantry.ts`:

- Add `countedAt: z.string().nullable()` to `itemSchema`.
- Extract `const inventorySourceSchema = z.enum(["admin", "device", "mcp"])` and reuse it for `recentActivity.source`.
- Add the queue fields `quantity`, `targetQuantity`, `countedAt` (nullable string), `countStatus: z.enum(["counted", "needs_check"])`, and `lastChange: z.object({ delta, source: inventorySourceSchema, reason, createdAt }).nullable()`.
- Export `countCheckAfterDays = 14` and `countStatus(countedAt: string | null, now: Date): CountStatus`. It returns `"needs_check"` for null, an unparseable value, or a count older than 14 days; otherwise `"counted"`.
- Export the types `CountStatus` and `ShoppingNeedChange`.

**Verify**: `pnpm exec tsc --project tsconfig.json` → errors only in the files the next steps change (repository, client fixtures). That is expected.

### Step 3: Repository

In `src/server/repository.ts`:

- Add `counted_at AS countedAt` to `itemColumns`.
- `createItem`: insert `counted_at` with `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
- `linkItem`: inside `if (correctingQuantity)`, also push the literal assignment `"counted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"` into `assignments`. The value is a SQL expression, not a bound value, like `updated_at`. Push it **before** the `updated_at` push, and keep the bound-value order intact. Update the doc comment to say that a supplied count, even an unchanged one, records `counted_at`.
- `getSnapshot`: add a third statement to the existing batch:
  ```sql
  SELECT itemId, delta, source, reason, createdAt
  FROM (
    SELECT item_id AS itemId, delta, source, reason, created_at AS createdAt,
      ROW_NUMBER() OVER (
        PARTITION BY item_id ORDER BY created_at DESC, rowid DESC
      ) AS position
    FROM inventory_events
    WHERE applied_at IS NOT NULL
      AND item_id IN (SELECT id FROM items WHERE quantity < target_quantity)
  )
  WHERE position = 1
  ```
  Build a `Map<itemId, change>` and fill each queue line with the new fields. Compute `countStatus(item.countedAt, generatedAt)` with **one** `generatedAt = new Date()`, also used for the returned `generatedAt`. Add a SAFETY comment matching the existing two.

**Verify**: `pnpm exec tsc --project tsconfig.json` → server files compile.

### Step 4: MCP export

In `src/server/mcp.ts` `shopping_queue_export`:

- Keep JSON = the queue array. It now carries the new fields.
- Markdown line becomes ``- [ ] ${name} — ${quantityNeeded} ${unit} (have ${quantity} of ${targetQuantity}; ${countedAt && status === "counted" ? `counted ${countedAt.slice(0, 10)}` : "count needs a check"})``.
- Extend the tool description to say that each line includes the current count, target, last change and count status.

### Step 5: Dashboard boundary and API

- `src/client/snapshot.ts`: add `countedAt: nullableText` to `inventoryFields`. Add `quantity: number`, `targetQuantity: number`, `countedAt: nullableText`, `countStatus: z.enum([...]).catch("needs_check")` and `lastChange: <tolerant object with .catch per field>.nullable().catch(null)` to `shoppingFields`.
- `src/client/api.ts`: add
  ```ts
  /** Record that the displayed on-hand count is correct without changing stock. */
  export async function confirmCount(
    token: string,
    itemId: string,
    quantity: number,
  ): Promise<void>;
  ```
  It posts **only** `{ onHand: quantity, expectedQuantity: quantity }` to `/api/items/:id/link`.

### Step 6: Receipt UI and command

- `src/client/format.ts`: add `formatChange(change)`, which returns e.g. "Used 1 via RFID station" or "Added 2 via Dashboard", using `formatNumber`/`formatActivitySource`.
- `src/client/shopping-receipt.tsx`: props become `{ items, pendingItemId, onConfirmCount }`. Each line keeps name + amount and adds a details block:
  - "Have X of Y unit" (the _why_)
  - the last change and its `formatDate`, or "No recent changes"
  - "Counted <date>" or "Count needs a check" (add class `needs-check` for styling)
  - a small `button` "Count is right", `aria-label={`Confirm ${name} count of ${formatQuantity(quantity, unit)}`}`, disabled while `pendingItemId !== null`

  Do not change the "Copy list" text.

- `src/client/dashboard.tsx`: thread `onConfirmCount` and `pendingItemId` through.
- `src/client/app.tsx`: add `handleConfirmCount(item: ShoppingItem)`, a structural copy of `handleAdjust`. Notice: `${item.name} count confirmed.`. Committed-but-refresh-failed error: "The count was confirmed, but the pantry could not refresh. Try again to refresh." Fallback error: "The count could not be confirmed."
- `src/client/styles.css`: lay out `.receipt-details` under the name/amount row (span the grid's last two columns), muted 10–11px text, `.needs-check` in `var(--tomato)`, and a compact `.receipt-confirm-button`.

**Verify**: `pnpm typecheck && pnpm lint && pnpm format:check` → exit 0.

### Step 7: Docs

- `README.md`: in "Linking and stock corrections", add that any non-null `onHand` (even an unchanged one) records `countedAt`, and that "Count is right" uses this. Add a short "Shopping queue" paragraph that defines `quantity`, `targetQuantity`, `lastChange`, `countedAt`, `countStatus` and the 14-day rule.
- `ROADMAP.md`: under "Next shippable slice", record that it shipped, what it does, and its remaining limits (station scans don't confirm totals; `lastChange` disappears after 90-day retention).

## Test plan

Worker (`test/worker.test.ts`, use the existing `seedItems`, `postJson`, `mcpRequest`, `mcpJson` helpers; `seedItems` raw-inserts so `counted_at` is NULL):

1. A queue line reports have/target and needs a check until counted. After a device consume of coffee (1→0), the snapshot line is `{ quantity: 0, targetQuantity: 2, quantityNeeded: 2, countedAt: null, countStatus: "needs_check", lastChange: { delta: -1, source: "device", reason: "RFID consume" } }`.
2. Confirming an unchanged count with `{ onHand: 1, expectedQuantity: 1 }` returns 200, sets `countedAt`, makes the queue line `"counted"`, keeps quantity 1, and adds no journal row. A stale confirmation `{ onHand: 1, expectedQuantity: 3 }` returns 409 `inventory_conflict` and leaves `countedAt` null.
3. A count older than 14 days: `UPDATE items SET counted_at = <15 days ago ISO>` → `needs_check`; 13 days → `counted`.
4. `POST /api/items` returns 201 with a non-null `countedAt`.
5. MCP `shopping_queue_export` markdown contains `(have 1 of 2; count needs a check)`, and JSON lines carry `countStatus` and `targetQuantity`.

Client: 6. `test/client-api.test.ts`: the tolerant parser keeps valid new queue fields, maps an unknown `countStatus` to `"needs_check"`, and maps a malformed `lastChange` to `null`. 7. `test/client-http.test.ts`: `confirmCount` sends exactly `{ onHand, expectedQuantity }` (it must never send link fields that could clear a tag or catalog link). 8. `test/client-dashboard.test.tsx`: the receipt renders "Have 1 of 3", the last change, "Count needs a check" or "Counted", and the confirm button's accessible label.

## Done criteria

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck` exit 0
- [ ] `pnpm test` exits 0 with the new tests above
- [ ] `pnpm exec cf deploy --dry-run` exits 0
- [ ] `git status` shows only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- D1/miniflare rejects the window-function query. Report back; don't fall back to N per-item queries.
- An existing test asserts the exact old queue-line shape with `toEqual`. Report back rather than loosening it.
- Making the confirm action work seems to require changing `quantityCorrection` or the drawer.

## Maintenance notes

- If MCP `pantry_link_item` later accepts `onHand`, it gets confirmation for free through `linkItem`.
- A future "station count" mode would be a second writer of `counted_at`.
- Reviewers: check that the `counted_at` assignment does not shift the bound-value order in `linkItem` (values are positional).
- Deferred: a per-item "never counted" indicator in the inventory ledger; usage-based target suggestions (roadmap "Later").
