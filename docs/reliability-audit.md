# Correctness and reliability audit — 2026-11-06

Base: remote default `8f229d0c4b91f530cf20e6e0b7b7c659a39da0a2` (merged untangle pass). Static inspection only locally; all execution evidence must come from CI.

## Inventory and boundaries

- React dashboard: session-only admin token, unlock/restore/lock, inventory +/- commands, tag/catalog linking and absolute count corrections, shopping queue and activity. `src/client/app.tsx`, `api.ts`, `session.ts` own the request/session boundary.
- Worker HTTP: public `/health`; admin `/api/snapshot`, item creation, adjustments and links; separately authenticated `/api/device/scans`. Zod validates input, body streams are bounded to 16 KiB, errors omit internal details.
- MCP: read/write bearer capabilities; stateless library transport; snapshot/export are read-only, adjustments/linking require write capability. No tenant model: one configured pantry per deployment.
- D1: unique event IDs, transactional delta/journal writes, quantity CHECK, RFID uniqueness, provider-pair CHECK, compare-and-set absolute corrections, bounded 500-item inventory and 30-entry activity, scheduled compaction retaining replay tombstones.
- ESP32: TLS root validation, persistent per-slot NVS outbox, stable event IDs, ordered delivery, retry/backoff, explicit full/persistence failure indication. Firmware build stays in existing CI; browser framework is not applicable to hardware execution.
- CI/config/dependency/lifecycle review: existing Worker/client tests, firmware build, lint/typecheck/dry-run remain. No local test/build/install hooks are authorized.

## Findings before edits

1. **P2: malformed 200 response becomes successful empty inventory** (`src/client/api.ts`, parsedJson/requestJson). HTML or truncated JSON becomes null, and the intentionally tolerant snapshot normalizer accepts null. Expected: transport failure, not unlocked empty inventory. High confidence; preserve normalizer's public tolerant behavior.
2. **P2: committed write reported as failed on follow-up refresh failure** (`src/client/app.tsx`, handleAdjust/submitLink). POST succeeds, snapshot GET fails; the shared catch reports a write failure, with stale counts. A user repeating +/- creates a new event and applies twice. Expected: retain committed success, report refresh failure explicitly and retry only GET. High confidence.
3. **P2: async work crosses session boundaries** (`src/client/app.tsx`, refresh/handleAdjust/submitLink). Start a request, lock, unlock again, then release old success/failure. Old responses can overwrite current inventory or lock the new session. Expected: ignore all completions belonging to an invalidated session and reset busy state. High confidence; same single-pantry deployment, not a claim of multi-tenant leakage.
4. **P2: concurrent consume replay can fail after the original commits** (`src/server/repository.ts`, applyAdjustment). Two matching events miss initial lookup; one consumes last unit before the other's item read. The second returns negative_inventory despite an already committed identical event. Expected: replay success and exactly one decrement. High confidence (independent review); transactional checks still protect genuinely negative new events.

## Reconciled/rejected hypotheses

- Pruning between lookup and insert does not establish a realistic duplicate: existing events are found in active records or tombstones and newly accepted events cannot age 90 days during an ordinary request. No speculative rewrite.
- D1 batch transactions already protect negative stock, duplicate increments, metadata-only stock preservation, provider-pair races, correction rollback and stale absolute corrections. Existing meaningful tests remain.
- Rate limits intentionally distinguish authenticated attempts and new linked writes; quotas are not global transactional guarantees. No invented distributed quota requirement.
- Firmware explicitly drops permanent per-event 4xx rejections and retries network/429/5xx; no change to that documented policy. Physical power-loss/RFID/TLS validation cannot be proved by browser tests.

## Validation plan and framework applicability

Use published tester-army `e2e@0.23.0` with compatible `@e2e-dev/web@0.15.5` (registry metadata verified 2026-11-06; Node ^22.22.3 or >=24.8). Read published quickstart, CI, GitHub Actions, web and browser guides. Deterministic locator/action/assertion flows require no model or credentials. CI starts the real Vite/Worker app with local D1 migrations and controlled fixture tokens; cover unlock, real persisted stock changes, queue/activity, linking, reload and lock. Route interception is confined to deliberate malformed-response, post-commit refresh and stale-session failure injections. Add focused Vitest HTTP parsing and D1 concurrency regressions. A CI pre-fix job overlays new regressions on base sources and requires the specific regression failures; no passing no-op checks.

Independent review and CI results: pending implementation.
