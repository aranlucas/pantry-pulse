import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { applyAdjustment, getItem } from "@/server/repository";

it("replays a concurrent consume that commits before the duplicate reads stock", async () => {
  await env.DB.prepare(
    "INSERT INTO items (id, name, quantity) VALUES ('itm-last', 'Last bag', 1)",
  ).run();
  let entered!: () => void;
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });

  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Real D1 for every query; pause only the duplicate's stock read.
  const pauseRead = (statement: D1PreparedStatement): D1PreparedStatement => ({
    bind: (...values: unknown[]) => pauseRead(statement.bind(...values)),
    async first<T = unknown>(column?: string): Promise<T | null> {
      entered();
      await resumed;

      return statement.first<T>(column);
    },
    all: statement.all.bind(statement),
    run: statement.run.bind(statement),
    raw: statement.raw.bind(statement),
  });

  const paused: D1Database = {
    prepare(sql) {
      const statement = env.DB.prepare(sql);

      return sql.includes("FROM items WHERE id = ?") ? pauseRead(statement) : statement;
    },
    batch: env.DB.batch.bind(env.DB),
    exec: env.DB.exec.bind(env.DB),
    withSession: env.DB.withSession.bind(env.DB),
    dump: env.DB.dump.bind(env.DB),
  };

  const input = {
    eventId: "evt-last-bag",
    itemId: "itm-last",
    delta: -1,
    source: "admin" as const,
    reason: "consume last bag",
  };

  const pending = applyAdjustment(paused, input);
  const settled = Promise.allSettled([pending]);
  await ready;

  try {
    expect(await applyAdjustment(env.DB, input)).toMatchObject({
      idempotentReplay: false,
      item: { quantity: 0 },
    });
  } finally {
    release();
  }

  expect(await settled).toMatchObject([
    { status: "fulfilled", value: { idempotentReplay: true, item: { quantity: 0 } } },
  ]);
  expect(await getItem(env.DB, "itm-last")).toMatchObject({ quantity: 0 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM inventory_events WHERE id = 'evt-last-bag'",
    ).first(),
  ).toEqual({ count: 1 });
});
