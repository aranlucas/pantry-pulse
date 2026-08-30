# Pantry Pulse

Pantry Pulse is a small, local-first inventory station for a real kitchen: tap an
RFID tag when something enters or leaves the pantry, see what is running low,
and hand the resulting shopping queue to an AI assistant through MCP.

The project deliberately joins three surfaces into one coherent system:

- a responsive household dashboard for counts, targets, recent scans, and tag setup;
- a Cloudflare Worker API backed by D1, with idempotent device writes;
- an ESP32 + MFRC522 station and a stateless remote MCP endpoint.

Catalog links stay provider-agnostic. An item can optionally carry a provider
name and an opaque provider item ID, without baking a retailer enum into the
inventory model.

## Architecture

```text
RFID station ── device token ──▶ Worker API ──▶ D1
                                      │
Web dashboard ─ admin token ──────────┤
                                      │
MCP client ─── read/write token ──▶ /mcp
```

Cloudflare serves the built Vite application and routes `/api/*`, `/health`, and
`/mcp` through the Worker. D1 is the only persistence layer.

## Local development

Requirements: Node.js 24+, pnpm 11+, and a Cloudflare account for remote deploys.

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Use the `ADMIN_TOKEN` value from `.dev.vars` in the dashboard access screen.
The firmware uses the separate `DEVICE_TOKEN`.

Before committing:

```bash
pnpm check && pnpm test
```

## Deploy

Create the four scoped secrets, apply the D1 migrations, build, and deploy:

```bash
pnpm wrangler secret put ADMIN_TOKEN
pnpm wrangler secret put DEVICE_TOKEN
pnpm wrangler secret put MCP_READ_TOKEN
pnpm wrangler secret put MCP_WRITE_TOKEN
pnpm db:migrate:remote
pnpm build
pnpm deploy
```

The public `/health` route reports service health without exposing inventory.
Dashboard inventory APIs require `ADMIN_TOKEN`; device scans require the
separate `DEVICE_TOKEN`. MCP has distinct `MCP_READ_TOKEN` and
`MCP_WRITE_TOKEN` credentials, so a client that only needs context never
receives inventory mutation tools.

## MCP

Connect an MCP client to `https://<worker>/mcp` with either MCP bearer token.
The read token exposes only the first two tools; the write token exposes all
four. Browser CORS is disabled for this endpoint, which is intended for native
MCP hosts.
The stateless Streamable HTTP server exposes four task-oriented tools:

- `pantry_snapshot` — current inventory, low-stock state, and shopping needs;
- `shopping_queue_export` — a concise shopping list in JSON or Markdown;
- `pantry_adjust` — an idempotent manual inventory adjustment;
- `pantry_link_item` — attach or remove an external catalog reference.

The read tools are annotated read-only. Write tools declare their destructive
and idempotency behavior so MCP hosts can present meaningful confirmation UI.

Detailed inventory events are retained for 90 days. A daily Worker cron compacts
older rows into small idempotency tombstones before removing the activity data,
so an ESP32 reconnecting after a long outage can never reapply an accepted scan.
Those tombstones are intentionally permanent: exact-once delivery across an
unbounded hardware outage takes precedence over reclaiming their small rows.
The cron logs both the daily compaction count and total tombstone count for D1
capacity monitoring. Current item counts remain in D1.

## Hardware

The reference firmware lives in `firmware/esp32-rfid`. Copy
`config.example.h` to `config.h`, supply Wi-Fi, Worker URL, and the device
token, then flash an ESP32 with an MFRC522 reader. The mode button toggles
between restock and consume; every scan includes a device-generated event ID,
so safe retries cannot double-apply inventory.

The dashboard deliberately labels station status as unavailable until a real
heartbeat is implemented; successful inventory reads are not presented as
proof that the physical reader is online.

## Product design

The implemented visual direction and generated exploration are documented in
[`docs/design/spec.md`](docs/design/spec.md). The UI favors an inventory ledger
and shopping receipt over a generic card grid, with a compact mobile mode for a
phone mounted near the pantry.
