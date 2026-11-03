import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Browser-side tests run in Node; everything else runs in the Workers runtime.
const clientTests = [
  "test/client-dashboard.test.tsx",
  "test/client-motion.test.ts",
  "test/client-http.test.ts",
];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    react(),
    // Tests get the Worker runtime from cloudflareTest below, not the dev/build plugin.
    !process.env.VITEST && cloudflare({ persistState: { path: ".cloudflare/state" } }),
  ],
  server: {
    host: "127.0.0.1",
  },
  test: {
    projects: [
      {
        extends: false,
        resolve: { tsconfigPaths: true },
        plugins: [react()],
        test: {
          name: "client",
          environment: "node",
          include: clientTests,
        },
      },
      {
        extends: false,
        resolve: { tsconfigPaths: true },
        plugins: [
          cloudflareTest(async () => ({
            config: true,
            miniflare: {
              bindings: {
                ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
                DEVICE_ID: "test-station",
                DEVICE_TOKEN: "test-device-token-with-enough-entropy",
                MCP_READ_TOKEN: "test-mcp-read-token-with-enough-entropy",
                MCP_WRITE_TOKEN: "test-mcp-write-token-with-enough-entropy",
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: clientTests,
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
