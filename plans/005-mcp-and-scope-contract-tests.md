# Plan 005: MCP write tools and token scopes are pinned by tests; empty link patches are rejected

> **Executor instructions**: Follow step by step; on a STOP condition, stop and report; update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 10a0cd8..HEAD -- src/server/schemas.ts src/server/mcp.ts test/worker.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / bug
- **Planned at**: commit `10a0cd8`, 2026-11-11

## Why this matters

- `pantry_adjust` (`src/server/mcp.ts:103-126`) is the only MCP tool that changes stock, and no test ever calls it. Its `source: "mcp"` journal entry, its replay, and its error-to-`isError` mapping are all unverified. `shopping_queue_export` (`mcp.ts:64-101`) has only one test, which plan 001 adds.
- The token-scope table in `SECURITY.md` is tested only partly. `test/worker.test.ts` checks the admin token on the device route and on `/mcp`. Nothing checks the device or MCP tokens on admin `/api/*`, the device token on `/mcp`, or the read token _calling_ a write tool.
- **Bug**: `linkItemSchema` (`src/server/schemas.ts:56-62`) refines "At least one link field is required" via `Object.keys(value).length > 0`. In zod 4.6.7, `.extend()` keeps that check (verified: `mcpLinkSchema.safeParse({ itemId: "abc" }).success === true`). Because `itemId` is always present, an MCP `pantry_link_item` call with no link fields succeeds and only bumps `updated_at`.

## Scope

In: `src/server/schemas.ts`, `test/worker.test.ts`.
Out: auth logic (`src/server/auth.ts`). These are tests of the current behaviour; if a scope test fails, STOP.

## Steps

1. `schemas.ts`: remove the `.refine` from `linkItemSchema`. Add an explicit refine to `mcpLinkSchema` that counts only `rfidUid`, `catalogProvider` and `providerItemId`, with the same message. Add one to `dashboardLinkItemSchema` that counts any key other than `expectedQuantity`.
   **Verify**: `pnpm typecheck` → exit 0.
2. Tests (pattern: the existing MCP tests near `test/worker.test.ts:647`, using `mcpRequest`/`mcpJson`):
   - `pantry_adjust` called twice with the same `eventId` → one journal row with `source = 'mcp'`; the second result has `idempotentReplay: true`.
   - `pantry_adjust` with a delta below stock → `result.isError === true` and stock unchanged.
   - read token `tools/call` `pantry_adjust` → error result, stock unchanged.
   - table-driven: `[deviceToken, mcpReadToken, mcpWriteToken] × [GET /api/snapshot, POST /api/items, POST /api/items/itm-coffee/link]` → 401; `deviceToken` on `/mcp` → 401.
   - `pantry_link_item` with only `{ itemId }` → `isError`.
     **Verify**: `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` exit 0 with the new tests
- [ ] Only in-scope files changed

## STOP conditions

- Any scope test shows a token accepted where `SECURITY.md` says it must be rejected. That is a security finding; report it, don't "fix" the test.

## Maintenance notes

MCP tests can be slow on a cold worker. The first MCP call has been seen taking about 6 s under local load against Vitest's 5 s default (2026-11-11). If that flakes in CI, raise `testTimeout` for the worker project in `vite.config.ts` rather than splitting tests.
