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
  // Real D1 for every query; pause only the duplicate's first stock read.
  const paused = new Proxy(env.DB, {
    get(db, key) {
      if (key !== "prepare") {
        const value = Reflect.get(db, key);
        return typeof value === "function" ? value.bind(db) : value;
      }
      return (sql: string) => {
        const statement = db.prepare(sql);
        if (!sql.includes("FROM items WHERE id = ?")) return statement;
        return new Proxy(statement, {
          get(target, property) {
            if (property === "bind")
              return (...values: unknown[]) => {
                const bound = target.bind(...values);
                return new Proxy(bound, {
                  get(query, method) {
                    if (method === "first")
                      return async () => {
                        entered();
                        await resumed;
                        return query.first();
                      };
                    const value = Reflect.get(query, method);
                    return typeof value === "function" ? value.bind(query) : value;
                  },
                });
              };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      };
    },
  });
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
