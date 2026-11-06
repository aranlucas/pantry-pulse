import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  targets: [
    {
      name: "chromium",
      engine: web(),
      app: {
        url: "http://127.0.0.1:4173",
        command: {
          executable: "pnpm",
          args: ["exec", "vite", "--port", "4173", "--strictPort"],
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
  tests: "e2e/**/*.e2e.ts",
  workers: 1,
  retries: 0,
  reporters: ["list", "junit"],
  trace: "retain-on-failure",
} satisfies E2EConfig;
