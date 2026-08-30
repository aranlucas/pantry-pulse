import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { handleApi } from "../src/server/http";
import { pruneInventoryEvents } from "../src/server/repository";
import type { PantryEnv } from "../src/server/types";

const adminToken = "test-admin-token-with-enough-entropy";
const deviceToken = "test-device-token-with-enough-entropy";
const mcpReadToken = "test-mcp-read-token-with-enough-entropy";
const mcpWriteToken = "test-mcp-write-token-with-enough-entropy";

function authorization(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function seedItems(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM inventory_events"),
    env.DB.prepare("DELETE FROM items"),
    env.DB.prepare(
      `INSERT INTO items
          (id, name, unit, quantity, target_quantity, rfid_uid)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind("itm-coffee", "Coffee beans", "bag", 1, 2, "A1B2C3D4"),
    env.DB.prepare(
      `INSERT INTO items
          (id, name, unit, quantity, target_quantity)
         VALUES (?, ?, ?, ?, ?)`,
    ).bind("itm-oats", "Rolled oats", "canister", 2, 2),
  ]);
}

async function postJson(path: string, token: string, data: unknown): Promise<Response> {
  return SELF.fetch(`https://example.test${path}`, {
    method: "POST",
    headers: {
      ...authorization(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

async function mcpRequest(
  method: string,
  params: unknown,
  id: number,
  token = mcpWriteToken,
): Promise<Response> {
  return SELF.fetch("https://pantry-pulse.workers.dev/mcp", {
    method: "POST",
    headers: {
      ...authorization(token),
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Host: "pantry-pulse.workers.dev",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function mcpJson(response: Response): Promise<unknown> {
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    return response.json();
  }

  const data = (await response.text())
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice(6);
  if (!data) throw new Error("MCP response did not contain an SSE data event");
  return JSON.parse(data);
}

describe("Pantry Pulse Worker", () => {
  beforeEach(seedItems);

  it("keeps health public and inventory private", async () => {
    const health = await SELF.fetch("https://example.test/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", service: "pantry-pulse" });

    const denied = await SELF.fetch("https://example.test/api/snapshot");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain("Bearer");

    const allowed = await SELF.fetch("https://example.test/api/snapshot", {
      headers: authorization(adminToken),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      summary: { itemCount: 2, lowStockCount: 1, unitsNeeded: 1 },
      shoppingQueue: [{ itemId: "itm-coffee", quantityNeeded: 1 }],
    });
  });

  it("applies a retried adjustment exactly once", async () => {
    const payload = { eventId: "evt-once-0001", delta: 1, reason: "test restock" };

    const first = await postJson("/api/items/itm-coffee/adjust", adminToken, payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      eventId: payload.eventId,
      idempotentReplay: false,
      item: { quantity: 2 },
    });

    const retry = await postJson("/api/items/itm-coffee/adjust", adminToken, payload);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ idempotentReplay: true, item: { quantity: 2 } });

    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_events").first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);
  });

  it("rejects an event ID reused for a different operation", async () => {
    const eventId = "evt-conflict-01";
    expect(
      (
        await postJson("/api/items/itm-coffee/adjust", adminToken, {
          eventId,
          delta: 1,
          reason: "first",
        })
      ).status,
    ).toBe(200);

    const conflict = await postJson("/api/items/itm-coffee/adjust", adminToken, {
      eventId,
      delta: 2,
      reason: "second",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "event_id_conflict" } });
  });

  it("serializes concurrent retries without double-applying inventory", async () => {
    const payload = { eventId: "evt-concurrent-01", delta: 1, reason: "concurrent retry" };
    const responses = await Promise.all([
      postJson("/api/items/itm-coffee/adjust", adminToken, payload),
      postJson("/api/items/itm-coffee/adjust", adminToken, payload),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(
      bodies.filter((entry) => (entry as { idempotentReplay: boolean }).idempotentReplay),
    ).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT quantity FROM items WHERE id = 'itm-coffee'").first(),
    ).toMatchObject({ quantity: 2 });
  });

  it("preserves idempotency after detailed events are compacted", async () => {
    const payload = { eventId: "evt-archived-001", delta: 1, reason: "old accepted scan" };
    expect((await postJson("/api/items/itm-coffee/adjust", adminToken, payload)).status).toBe(200);
    await env.DB.prepare(
      "UPDATE inventory_events SET created_at = '2020-01-01T00:00:00.000Z'",
    ).run();

    expect(await pruneInventoryEvents(env.DB, 90)).toBe(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM inventory_events").first(),
    ).toMatchObject({ count: 0 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM event_tombstones").first(),
    ).toMatchObject({ count: 1 });

    const retry = await postJson("/api/items/itm-coffee/adjust", adminToken, payload);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ idempotentReplay: true, item: { quantity: 2 } });
  });

  it("rejects one of two conflicting concurrent uses of an event ID", async () => {
    const eventId = "evt-concurrent-conflict";
    const responses = await Promise.all([
      postJson("/api/items/itm-coffee/adjust", adminToken, {
        eventId,
        delta: 1,
        reason: "choice one",
      }),
      postJson("/api/items/itm-coffee/adjust", adminToken, {
        eventId,
        delta: 2,
        reason: "choice two",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const stored = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM inventory_events WHERE id = ?",
    )
      .bind(eventId)
      .first<{ count: number }>();
    expect(stored?.count).toBe(1);
  });

  it("uses a separate device token and normalizes RFID scans", async () => {
    const denied = await postJson("/api/device/scans", adminToken, {
      eventId: "evt-device-001",
      tagUid: "a1:b2:c3:d4",
      mode: "consume",
    });
    expect(denied.status).toBe(401);

    const scan = await postJson("/api/device/scans", deviceToken, {
      eventId: "evt-device-001",
      tagUid: "a1:b2:c3:d4",
      mode: "consume",
    });
    expect(scan.status).toBe(201);
    expect(await scan.json()).toMatchObject({ item: { id: "itm-coffee", quantity: 0 } });

    const snapshot = await SELF.fetch("https://example.test/api/snapshot", {
      headers: authorization(adminToken),
    });
    expect(await snapshot.json()).toMatchObject({
      recentActivity: [{ itemId: "itm-coffee", rfidUid: "A1B2C3D4" }],
    });
  });

  it("reserves the successful-write quota for new linked scan events", async () => {
    let attemptCalls = 0;
    let writeCalls = 0;
    const fakeEnv = {
      ADMIN_TOKEN: adminToken,
      ASSETS: env.ASSETS,
      DB: env.DB,
      DEVICE_ATTEMPT_RATE_LIMIT: {
        limit: async () => {
          attemptCalls += 1;
          return { success: true };
        },
      },
      DEVICE_ID: "pantry-station-1",
      DEVICE_RATE_LIMIT: {
        limit: async () => {
          writeCalls += 1;
          return { success: true };
        },
      },
      DEVICE_TOKEN: deviceToken,
      MCP_READ_TOKEN: mcpReadToken,
      MCP_WRITE_TOKEN: mcpWriteToken,
    } as unknown as PantryEnv;
    const deviceRequest = (payload: unknown) =>
      new Request("https://example.test/api/device/scans", {
        method: "POST",
        headers: {
          ...authorization(deviceToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

    expect((await handleApi(deviceRequest({ nope: true }), fakeEnv)).status).toBe(422);
    expect(
      (
        await handleApi(
          deviceRequest({
            eventId: "evt-unknown-tag",
            tagUid: "FFFFFFFF",
            mode: "restock",
          }),
          fakeEnv,
        )
      ).status,
    ).toBe(404);
    expect(writeCalls).toBe(0);

    const scan = {
      eventId: "evt-quota-replay",
      tagUid: "A1B2C3D4",
      mode: "restock",
    };
    expect((await handleApi(deviceRequest(scan), fakeEnv)).status).toBe(201);
    expect((await handleApi(deviceRequest(scan), fakeEnv)).status).toBe(200);
    expect(attemptCalls).toBe(4);
    expect(writeCalls).toBe(1);
  });

  it("requires provider references to be linked as an open pair", async () => {
    const incomplete = await postJson("/api/items/itm-coffee/link", adminToken, {
      catalogProvider: "example-grocery",
    });
    expect(incomplete.status).toBe(422);
    expect(await incomplete.json()).toMatchObject({ error: { code: "incomplete_catalog_link" } });

    const linked = await postJson("/api/items/itm-coffee/link", adminToken, {
      name: "House coffee",
      unit: "bag",
      onHand: 4,
      target: 5,
      catalogProvider: "example-grocery",
      providerItemId: "opaque-123",
    });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      item: {
        name: "House coffee",
        quantity: 4,
        targetQuantity: 5,
        catalogProvider: "example-grocery",
        providerItemId: "opaque-123",
      },
    });
    expect(
      await env.DB.prepare("SELECT delta, reason FROM inventory_events").first(),
    ).toMatchObject({ delta: 3, reason: "dashboard setup" });
  });

  it("publishes annotated MCP tools and executes pantry reads", async () => {
    const denied = await SELF.fetch("https://pantry-pulse.workers.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(denied.status).toBe(401);

    const dashboardTokenDenied = await mcpRequest("tools/list", {}, 99, adminToken);
    expect(dashboardTokenDenied.status).toBe(401);

    const initialized = await mcpRequest(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pantry-pulse-tests", version: "1.0.0" },
      },
      1,
    );
    expect(initialized.status).toBe(200);

    const listed = await mcpRequest("tools/list", {}, 2);
    expect(listed.status).toBe(200);
    const listPayload = (await mcpJson(listed)) as {
      result: { tools: Array<{ name: string; annotations?: Record<string, boolean> }> };
    };
    expect(listPayload.result.tools.map((tool) => tool.name)).toEqual([
      "pantry_snapshot",
      "shopping_queue_export",
      "pantry_adjust",
      "pantry_link_item",
    ]);
    expect(listPayload.result.tools[0]?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });

    const snapshot = await mcpRequest("tools/call", { name: "pantry_snapshot", arguments: {} }, 3);
    expect(snapshot.status).toBe(200);
    const snapshotPayload = (await mcpJson(snapshot)) as {
      result: { structuredContent: { summary: { itemCount: number } } };
    };
    expect(snapshotPayload.result.structuredContent.summary.itemCount).toBe(2);

    const readOnlyList = await mcpRequest("tools/list", {}, 4, mcpReadToken);
    const readOnlyPayload = (await mcpJson(readOnlyList)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(readOnlyPayload.result.tools.map((tool) => tool.name)).toEqual([
      "pantry_snapshot",
      "shopping_queue_export",
    ]);
    expect(readOnlyList.headers.has("Access-Control-Allow-Origin")).toBe(false);

    const foreignOrigin = await SELF.fetch("https://pantry-pulse.workers.dev/mcp", {
      method: "POST",
      headers: {
        ...authorization(mcpReadToken),
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "pantry-pulse.workers.dev",
        Origin: "https://malicious.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} }),
    });
    expect(foreignOrigin.status).toBe(403);
  });

  it("rejects malformed item paths and streamed bodies over the cap", async () => {
    const malformed = await postJson("/api/items/%E0%A4%A/adjust", adminToken, {
      eventId: "evt-bad-path-01",
      delta: 1,
      reason: "bad path",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: "invalid_path" } });

    const oversized = await SELF.fetch("https://example.test/api/items", {
      method: "POST",
      headers: {
        ...authorization(adminToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "x".repeat(17 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: "body_too_large" } });
  });
});
