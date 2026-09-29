import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "pantry-pulse",
    compatibilityDate: "2026-08-30",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/worker.ts",
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: {
        enabled: true,
        headSamplingRate: 1,
        invocationLogs: true,
      },
      traces: {
        enabled: true,
        headSamplingRate: 0.1,
      },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*", "/health", "/mcp", "/mcp/*"],
    },
    triggers: [
      triggers.scheduled({
        schedule: "17 4 * * *",
      }),
    ],
    env: {
      DEVICE_ID: bindings.text("pantry-station-1"),
      DB: bindings.d1({
        name: "pantry-pulse",
        id: "8bfb84c2-9c88-42f0-84d4-e3987d8d2284",
      }),
      DEVICE_ATTEMPT_RATE_LIMIT: bindings.rateLimit({
        namespace: "1001002",
        simple: {
          limit: 600,
          period: 60,
        },
      }),
      DEVICE_RATE_LIMIT: bindings.rateLimit({
        namespace: "1001001",
        simple: {
          limit: 120,
          period: 60,
        },
      }),
      ASSETS: bindings.assets(),
    },
  },
});
