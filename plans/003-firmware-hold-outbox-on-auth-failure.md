# Plan 003: The station keeps queued scans when the Worker rejects its credentials

> **Executor instructions**: Follow step by step; run each verification. On a STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 10a0cd8..HEAD -- firmware/esp32-rfid`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `10a0cd8`, 2026-11-11

## Why this matters

`firmware/esp32-rfid/src/main.cpp:236-249` retries only `status < 0`, `429` and `>= 500`. Every other status returns `SendResult::Drop`, and `processOutbox` (`main.cpp:424-437`) deletes the NVS slot and immediately sends the next event. The Worker answers 401 for a bad device token before it reads the event (`src/server/http.ts:153-155`). `SECURITY.md` tells operators to rotate tokens after a suspected disclosure. If `DEVICE_TOKEN` is rotated before the station is reflashed, every queued scan (up to 24) and every new scan is deleted within seconds. That defeats the persistent outbox. A Cloudflare edge 403 (WAF or Access) does the same. The settled policy in `docs/reliability-audit.md` ("drop permanent per-event 4xx") is about _event_ rejections. 401/403 are station-wide configuration failures.

## Current state

```cpp
// main.cpp:236-249
if (status < 0 || status == 429 || status >= 500) { ... return SendResult::Retry; }
if (status == 404) { ... flashStatus(3, 80, 80); } else { ... flashStatus(4, 45, 55); }
return SendResult::Drop;
```

## Commands

| Purpose        | Command                                                                | Expected  |
| -------------- | ---------------------------------------------------------------------- | --------- |
| Build firmware | `cd firmware/esp32-rfid && cp -n config.example.h config.h && pio run` | `SUCCESS` |

PlatformIO 6.2.0 is required (`pip install platformio==6.2.0`). CI job `firmware` runs the same build. **Never commit `config.h`.**

## Scope

In: `firmware/esp32-rfid/src/main.cpp`, `firmware/esp32-rfid/README.md`.
Out: the Worker, other status mappings, the outbox size.

## Steps

1. Add `status == 401 || status == 403` to a new branch _before_ the drop path. It logs "Station credentials rejected (HTTP %d); holding outbox until DEVICE_TOKEN is fixed", flashes a distinct pattern (e.g. `flashStatus(6, 30, 30)`), and returns `SendResult::Retry`, so the existing exponential backoff (capped at `kOutboxRetryMaxMs`) applies.
   **Verify**: `pio run` → SUCCESS.
2. README: in the scan-recovery section, document that 401/403 hold the queue, the new LED pattern, and that reflashing with the new token drains it. NVS survives a normal reflash.

## Done criteria

- [ ] `pio run` succeeds (locally or in the CI `firmware` job)
- [ ] `grep -n "401" firmware/esp32-rfid/src/main.cpp` shows the new branch
- [ ] Only in-scope files changed

## STOP conditions

- Holding the queue would block _new_ scans from being persisted (check that `enqueue` still writes while the head is retrying; the existing "outbox full" signal covers the cap).

## Maintenance notes

Physical behaviour (LED pattern, NVS across reflash) can't be proven by CI; verify on hardware once. Separate low-confidence finding: `main.cpp:407` compares `millis()` deltas as signed `long`, which stalls after more than 24.8 days idle. Consider resetting `nextOutboxAttemptAt = now` when the queue is empty.
