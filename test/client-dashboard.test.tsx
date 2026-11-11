import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActivitySection } from "@/client/activity-section";
import { Dashboard } from "@/client/dashboard";
import { ShoppingReceipt } from "@/client/shopping-receipt";
import type { PantrySnapshot, ShoppingItem } from "@/client/types";

const snapshot: PantrySnapshot = {
  generatedAt: "2026-09-17T00:00:00.000Z",
  summary: { itemCount: 2, lowStockCount: 1, unitsNeeded: 2 },
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
      countedAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    },
    {
      id: "itm-oats",
      name: "Rolled oats",
      unit: "canister",
      quantity: 2,
      targetQuantity: 2,
      rfidUid: null,
      catalogProvider: null,
      providerItemId: null,
      countedAt: "2026-09-16T12:00:00.000Z",
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
      quantity: 1,
      targetQuantity: 3,
      catalogProvider: "example-grocery",
      providerItemId: "sku-1",
      countedAt: null,
      countStatus: "needs_check",
      lastChange: {
        delta: -1,
        source: "device",
        reason: "RFID consume",
        createdAt: "2026-09-17T12:00:00.000Z",
      },
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
  ],
};

function renderDashboard(activeView: "pantry" | "queue" | "activity"): string {
  return renderToStaticMarkup(
    <Dashboard
      snapshot={snapshot}
      activeView={activeView}
      expandedItemId="itm-milk"
      pendingItemId={null}
      refreshing={false}
      notice={null}
      error={null}
      onAdjust={() => {}}
      onConfirmCount={() => {}}
      onLink={() => {}}
      onLock={() => {}}
      onNavigate={() => {}}
      onRetry={() => {}}
      onToggle={() => {}}
    />,
  );
}

function countAttr(html: string, attr: string, value: string): number {
  return html.split(`${attr}="${value}"`).length - 1;
}

describe("dashboard tree", () => {
  it("mounts inventory, queue, and activity once with unique control ids", () => {
    const html = renderDashboard("pantry");

    expect(countAttr(html, "id", "pantry-view")).toBe(1);
    expect(countAttr(html, "id", "queue-view")).toBe(1);
    expect(countAttr(html, "id", "activity-view")).toBe(1);
    expect(countAttr(html, "id", "main-content")).toBe(1);
    expect(countAttr(html, "id", "item-controls-itm-milk")).toBe(1);
    expect(countAttr(html, "id", "item-controls-itm-oats")).toBe(1);
    expect(countAttr(html, "aria-controls", "item-controls-itm-milk")).toBe(1);
    expect(countAttr(html, "data-active-view", "pantry")).toBe(1);
  });

  it("keeps the same unique tree when the small-screen view changes", () => {
    for (const view of ["queue", "activity"] as const) {
      const html = renderDashboard(view);
      expect(countAttr(html, "id", "item-controls-itm-milk")).toBe(1);
      expect(countAttr(html, "id", "pantry-view")).toBe(1);
      expect(countAttr(html, "id", "queue-view")).toBe(1);
      expect(countAttr(html, "id", "activity-view")).toBe(1);
      expect(countAttr(html, "data-active-view", view)).toBe(1);
    }
  });
});

describe("activity direction", () => {
  it.each([
    [-1, "RFID restock", "is-consumed", "Consumed"],
    [2, "RFID consume", "is-restocked", "Restocked"],
  ] as const)("renders delta %s independently of reason %s", (delta, reason, className, label) => {
    const original = snapshot.recentActivity[0];

    if (!original) {
      throw new Error("Missing activity fixture");
    }

    const html = renderToStaticMarkup(
      <ActivitySection events={[{ ...original, delta, reason }]} />,
    );

    expect(html).toContain(`class="activity-direction ${className}"`);
    expect(html).toContain(`>${label}</span>`);
  });
});

function renderReceipt(item: ShoppingItem, pendingItemId: string | null = null): string {
  return renderToStaticMarkup(
    <ShoppingReceipt items={[item]} pendingItemId={pendingItemId} onConfirmCount={() => {}} />,
  );
}

describe("shopping queue reasons", () => {
  const queued: ShoppingItem = (() => {
    const [line] = snapshot.shoppingQueue;

    if (!line) {
      throw new Error("Missing shopping queue fixture");
    }

    return line;
  })();

  it("explains why an item is queued and flags an unconfirmed count", () => {
    const html = renderReceipt(queued);

    expect(html).toContain("Have 1 of 3 carton");
    expect(html).toContain("Used 1 carton via RFID station");
    expect(html).toContain("Count needs a check · never counted");
    expect(html).toContain('class="receipt-count needs-check"');
    expect(html).toContain('aria-label="Confirm Oat milk count of 1 carton"');
  });

  it("shows a recent confirmation without the check warning", () => {
    const html = renderReceipt({
      ...queued,
      countedAt: "2026-09-16T12:00:00.000Z",
      countStatus: "counted",
      lastChange: null,
    });

    expect(html).toContain("Counted ");
    expect(html).not.toContain("needs a check");
    expect(html).toContain("No recent changes");
  });

  it("keeps a stale count visible but asks for a check", () => {
    const html = renderReceipt({ ...queued, countedAt: "2026-08-01T12:00:00.000Z" });

    expect(html).toContain("Count needs a check · last counted ");
  });

  it("disables count confirmation while another command is pending", () => {
    expect(renderReceipt(queued, "itm-oats")).toMatch(
      /<button[^>]*disabled=""[^>]*>Count is right/,
    );
  });
});
