# Plan 002: A dashboard +/- retried after a timeout or 5xx can never apply twice

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On a
> STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 10a0cd8..HEAD -- src/client/api.ts src/client/app.tsx test/client-http.test.ts`
> On any change, compare the excerpts below to the live code. A mismatch is a STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (if plan 001 landed first, apply the same treatment to `handleConfirmCount` only if it calls a non-idempotent endpoint. It doesn't, so leave it)
- **Category**: bug
- **Planned at**: commit `10a0cd8`, 2026-11-11

## Why this matters

The server makes adjustments idempotent by `eventId` (`src/server/repository.ts:194-205`). The dashboard defeats this because `adjustItem` mints a **new** id on every call:

```ts
// src/client/api.ts:120-128
export async function adjustItem(token: string, itemId: string, delta: number): Promise<void> {
  await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/adjust`, ignoredResponse, {
    method: "POST",
    body: JSON.stringify({ delta, eventId: createEventId(), reason: "manual adjustment" }),
  });
}
```

`requestJson` aborts after 12 s (`api.ts:41`) and maps that to status 408. A network failure maps to status 0 (`api.ts:95-102`). Either way the client cannot tell "never arrived" from "committed, response lost". `handleAdjust` (`src/client/app.tsx:220-232`) then shows "The pantry count could not be updated." with the old count still on screen. A user who taps + again sends a second event with a different id, and stock is counted twice. `docs/reliability-audit.md` fixed the _committed-then-refresh-failed_ case. This _uncertain POST_ case is still open.

## Current state

- `src/client/api.ts:108-114` — `createEventId()`.
- `src/client/app.tsx:190-238` — `handleAdjust` (session-generation guard, `pendingItemId`, `committed` flag).
- `ApiError.status` values: 0 (network), 408 (timeout), 502 (invalid JSON), server status otherwise.

## Commands

| Purpose     | Command                          | Expected |
| ----------- | -------------------------------- | -------- |
| Typecheck   | `pnpm typecheck`                 | exit 0   |
| Lint/format | `pnpm lint && pnpm format:check` | exit 0   |
| Tests       | `pnpm test`                      | all pass |

## Scope

In: `src/client/api.ts`, `src/client/app.tsx`, `test/client-http.test.ts` (or a new `test/client-adjust.test.ts`).
Out: server code, `e2e/` (CI's `audited-base` leg asserts exactly 5 e2e cases; do not add cases until plan 004 lands).

## Steps

1. `api.ts`: change `adjustItem(token, itemId, delta, eventId: string)` and export `createEventId`. Add `export function isUncertainWrite(cause: unknown): boolean`, which is true for `ApiError` with status 0, 408, 502 or ≥500.
   **Verify**: `pnpm exec tsc --project tsconfig.json` → only `app.tsx` call-site errors.
2. `app.tsx`: keep `const pendingAdjustment = useRef<{ itemId: string; delta: number; eventId: string } | null>(null)`. In `handleAdjust`, reuse `pendingAdjustment.current.eventId` when itemId and delta match, otherwise call `createEventId()` and store the new id. On success, clear the ref. On an uncertain failure, keep the ref, show "We couldn't confirm the change. Tap again to retry safely — it won't apply twice.", and trigger `refresh()`. On a definite failure (4xx other than 408), clear the ref. Clear the ref in `lock`/`handleAuthFailure`.
   **Verify**: typecheck, lint pass.
3. Tests (Node project; pattern: `test/client-http.test.ts` with `vi.stubGlobal("fetch")`): (a) `adjustItem` sends exactly the supplied `eventId`; (b) `isUncertainWrite` is true for 0/408/502/503 and false for 409/422. Behaviour across two taps lives in App state. If a component test needs a DOM library that isn't installed, STOP and report rather than adding a dependency.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0
- [ ] `grep -n "eventId: createEventId()" src/client/api.ts` → no match
- [ ] Only in-scope files changed

## STOP conditions

- The server rejects a replayed event because `reason` or other fields differ between attempts (they must be identical; see `assertMatchingEvent`).
- Verifying the behaviour requires adding a dependency such as `@testing-library/react`.

## Maintenance notes

The retry key is (itemId, delta). A deliberate second identical tap after a _confirmed_ success gets a fresh id because the ref is cleared on success. Reviewers: check the ref is cleared on lock, so ids don't cross sessions.
