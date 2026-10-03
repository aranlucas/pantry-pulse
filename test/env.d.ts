import type { applyD1Migrations } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    }
  }
}
