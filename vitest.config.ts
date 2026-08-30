import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
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
    setupFiles: ["./test/setup.ts"],
  },
});
