import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dashboard } from "../src/client/Dashboard";
import type { PantrySnapshot } from "../src/client/types";

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
      onAdjust={() => undefined}
      onLink={() => undefined}
      onLock={() => undefined}
      onNavigate={() => undefined}
      onRetry={() => undefined}
      onToggle={() => undefined}
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
    expect(html).not.toContain("mobile-dashboard");
    expect(html).not.toContain("mobile-main-content");
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
