# Security policy

## Supported version

Security fixes are made on the latest `main` revision. This project is an
independent household deployment, not a hosted multi-tenant service.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting flow:

<https://github.com/aranlucas/pantry-pulse/security/advisories/new>

Include the affected route or component, the expected and observed behavior,
reproduction steps, and the impact. Do not include live tokens, Wi-Fi
credentials, inventory exports, or other household data in the report.

Please avoid opening a public issue until a fix is available. You can expect an
initial acknowledgement within seven days.

## Deployment responsibilities

Pantry Pulse relies on four independently scoped bearer tokens. Operators are
responsible for generating unique high-entropy values, storing them as
Cloudflare secrets or local untracked configuration, rotating them after any
suspected disclosure, and giving clients the least-privileged token that meets
their needs.

| Token             | Intended client and scope                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_TOKEN`     | Dashboard and non-device `/api/*` routes. The dashboard stores it in browser session storage, with an in-memory fallback. |
| `DEVICE_TOKEN`    | Station; only `POST /api/device/scans`.                                                                                   |
| `MCP_READ_TOKEN`  | `/mcp`: `pantry_snapshot` and `shopping_queue_export`.                                                                    |
| `MCP_WRITE_TOKEN` | `/mcp`: read tools plus `pantry_adjust` and `pantry_link_item`.                                                           |

Keep `.dev.vars`, firmware `config.h`, Wi-Fi credentials, TLS material, and all
bearer tokens out of Git.
