import { describe, expect, it } from "vitest";

import { activityWasConsumed, decodeSnapshot } from "../src/client/snapshot";

const workerSnapshot = {
  generatedAt: "2026-09-17T00:00:00.000Z",
  summary: { itemCount: 1, lowStockCount: 1, unitsNeeded: 2 },
  items: [
    {
      id: "itm-milk",
      name: "Oat milk",
      unit: "carton",
      quantity: 1,
      targetQuantity: 3,
      rfidUid: "A1B2C3D4",
      catalogProvider: "example-grocery",
      providerItemId: "sku-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    },
  ],
  shoppingQueue: [
    {
      itemId: "itm-milk",
      name: "Oat milk",
      unit: "carton",
      quantityNeeded: 2,
      catalogProvider: "example-grocery",
      providerItemId: "sku-1",
    },
  ],
  recentActivity: [
    {
      eventId: "evt-consume",
      itemId: "itm-milk",
      itemName: "Oat milk",
      rfidUid: "A1B2C3D4",
      delta: -1,
      source: "admin",
      reason: "manual adjustment",
      deviceId: null,
      createdAt: "2026-09-17T00:00:00.000Z",
    },
    {
      eventId: "evt-restock",
      itemId: "itm-milk",
      itemName: "Oat milk",
      rfidUid: "A1B2C3D4",
      delta: 2,
      source: "device",
      reason: "RFID consume",
      deviceId: "pantry-station-1",
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ],
};

describe("client snapshot contract", () => {
  it("maps Worker snapshot fields without aliases", () => {
    const snapshot = decodeSnapshot({
      ...workerSnapshot,
      station: { online: true, name: "ignored" },
      items: [
        {
          ...workerSnapshot.items[0],
          onHand: 99,
          tagUid: "DEADBEEF",
          target: 12,
          have: 8,
        },
      ],
      activity: [{ kind: "consumed", delta: 5 }],
      recentScans: [{ kind: "consumed" }],
    });

    expect(snapshot).toMatchObject({
      generatedAt: workerSnapshot.generatedAt,
      summary: workerSnapshot.summary,
      items: [
        {
          id: "itm-milk",
          quantity: 1,
          targetQuantity: 3,
          rfidUid: "A1B2C3D4",
          catalogProvider: "example-grocery",
        },
      ],
      shoppingQueue: [{ itemId: "itm-milk", quantityNeeded: 2 }],
      recentActivity: [
        { eventId: "evt-consume", delta: -1, reason: "manual adjustment" },
        { eventId: "evt-restock", delta: 2, reason: "RFID consume" },
      ],
    });
    expect(snapshot).not.toHaveProperty("station");
    expect(snapshot).not.toHaveProperty("activity");
    expect(snapshot.items[0]).not.toHaveProperty("onHand");
    expect(snapshot.items[0]).not.toHaveProperty("tagUid");
    expect(snapshot.recentActivity.map((event) => event.delta < 0)).toEqual([true, false]);
    expect(activityWasConsumed(-1)).toBe(true);
    expect(activityWasConsumed(1)).toBe(false);
    expect(activityWasConsumed(0)).toBe(false);
  });

  it("ignores alias-only payloads that the Worker never sends", () => {
    const snapshot = decodeSnapshot({
      inventory: [{ id: "ghost", onHand: 4, tagUid: "FFFF" }],
      shopping: [{ id: "ghost", amount: 3 }],
      events: [{ id: "ghost", kind: "consumed" }],
      stationStatus: { online: false },
    });

    expect(snapshot.items).toEqual([]);
    expect(snapshot.shoppingQueue).toEqual([]);
    expect(snapshot.recentActivity).toEqual([]);
    expect(snapshot).not.toHaveProperty("station");
  });
});
