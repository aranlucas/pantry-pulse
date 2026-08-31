# Pantry Pulse

Pantry Pulse is an RFID pantry station with a Cloudflare Worker API, D1-backed inventory, a household dashboard, and remote MCP tools.

## Run locally

Requires Node.js, pnpm, Wrangler, and the ESP32 toolchain for hardware work.

```bash
pnpm install
pnpm dev
```

## MCP tools

- `pantry_snapshot` — read inventory and shopping needs.
- `shopping_queue_export` — export the shopping queue as JSON or Markdown.
- `pantry_adjust` — apply an idempotent inventory adjustment.
- `pantry_link_item` — attach or remove a catalog reference.

## Verify and deploy

```bash
pnpm check
pnpm build
pnpm deploy
```

Keep device credentials and local variables out of Git. Report security issues privately through [`SECURITY.md`](SECURITY.md).
