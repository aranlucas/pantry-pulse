import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

interface TestEnv extends Env {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
}

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
