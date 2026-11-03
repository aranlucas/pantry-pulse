# Pantry Pulse

[![CI](https://img.shields.io/github/actions/workflow/status/aranlucas/pantry-pulse/ci.yml?branch=main&label=CI)](https://github.com/aranlucas/pantry-pulse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Pantry Pulse is a private household RFID pantry station with a React dashboard,
Cloudflare Worker, D1 inventory, and guarded MCP access. It is designed for one
household rather than a hosted multi-tenant service.

For product priorities and acceptance goals, see [the roadmap](ROADMAP.md).
[Design direction and concept artwork](docs/design/spec.md) guide the interface;
the images are concepts, not deployment screenshots.

## Linking and stock corrections

`POST /api/items/:id/link` changes only supplied metadata fields. Omitted fields are preserved; a `null` RFID or catalog field clears that link, while `null` `unit`, `target`, or `onHand` leaves the existing value unchanged. Catalog provider and item ID must form a complete pair after the update.

A non-null `onHand` is an absolute stock correction. Send `expectedQuantity` with the count the editor originally displayed to reject stale edits with `409 inventory_conflict`. If it is omitted, the command checks the count read when the request starts. The stock change, metadata, and inventory event commit together, or none do. On conflict, refresh the pantry and reopen the item before retrying. The dashboard sends a correction only when its on-hand field changed; MCP metadata linking never changes stock.

## Local development

Requirements:

- Node.js 24 or newer.
- The pnpm version pinned by `packageManager` in `package.json`. Cloudflare CLI (`cf`) and the Cloudflare Vite plugin are installed by the project.

Install dependencies and create untracked local Worker credentials:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

Replace every token in `.dev.vars` with a high-entropy value. Apply the local D1 migration and seed the sample pantry before starting the development server:

```bash
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

`pnpm dev` starts Vite with the Cloudflare plugin through [Portless](https://github.com/vercel-labs/portless) (a dev dependency); its first run may ask for `sudo` to bind port 443 and trust a local certificate. Open `https://pantry-pulse.localhost`; the same server serves the dashboard and runs `/api`, `/health`, and `/mcp` in the Workers runtime. The dashboard asks for `ADMIN_TOKEN` from `.dev.vars`.

The Cloudflare plugin and local D1 scripts share `.cloudflare/state/`, configured with `persistState` in `vite.config.ts`. The scripts pass `--persist-to .cloudflare/state` because `cf` resource commands otherwise use a machine-wide state directory.

For a deployed D1 database, review the migration and run the remote commands explicitly:

```bash
pnpm db:migrate:remote
pnpm db:seed:remote
```

The remote commands require `pnpm cf auth login` or a `CLOUDFLARE_API_TOKEN` and operate on the database UUID declared in `cloudflare.config.ts`. `cf` D1 commands default to remote resources; the local scripts explicitly pass `--local`. If you provision a different database, update its ID in both the config and the database scripts in `package.json`.

## Firmware

See the [ESP32 station guide](firmware/esp32-rfid/README.md) for wiring,
configuration, flashing, and scan recovery behavior. PlatformIO is required only
for firmware work.

## Checks and deployment

```bash
pnpm check
pnpm test
```

`pnpm check` runs formatting, linting, type checking, the application build, and a
deployment dry run. `pnpm test` runs the client and Worker Vitest suites. Type
checking generates ignored Worker declarations under `.cloudflare/types/` first.

`pnpm build` runs `cf build` to package the Worker and dashboard together in `.cloudflare/output/`. `pnpm deploy` builds the application and deploys that output with `cf deploy --prebuilt --mode production`. Vite records the build mode, so prebuilt deployments must specify the same mode. To validate the built output without uploading anything, run `pnpm cf deploy --prebuilt --mode production --dry-run` after `pnpm build`.

The project uses the [Cloudflare CLI](https://developers.cloudflare.com/cf/) and Cloudflare Vite plugin 2.0 beta. `cloudflare.config.ts` owns Worker settings and bindings; `vite.config.ts` configures development and bundling. `cf` is currently in beta.

## Security and retention

See [SECURITY.md](SECURITY.md) for token scopes, credential handling, and private
vulnerability reporting.

The daily scheduled Worker task removes detailed inventory events after 90 days.
Compact tombstones remain to prevent late hardware retries from applying twice;
retain them when maintaining the database. `/health` checks the D1 binding.
