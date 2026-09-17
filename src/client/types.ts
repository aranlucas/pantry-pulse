export type View = "pantry" | "queue" | "activity";

/** Matches Worker `PantryItem`. */
export type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  targetQuantity: number;
  rfidUid: string | null;
  catalogProvider: string | null;
  providerItemId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Matches Worker `ShoppingNeed`. */
export type ShoppingItem = {
  itemId: string;
  name: string;
  unit: string;
  quantityNeeded: number;
  catalogProvider: string | null;
  providerItemId: string | null;
};

/** Matches Worker `InventoryActivity`. */
export type ActivityEvent = {
  eventId: string;
  itemId: string;
  itemName: string;
  rfidUid: string | null;
  delta: number;
  source: "admin" | "device" | "mcp";
  reason: string;
  deviceId: string | null;
  createdAt: string;
};

/** Matches Worker `PantrySnapshot`. `/api/snapshot` does not report station state. */
export type PantrySnapshot = {
  generatedAt: string;
  summary: {
    itemCount: number;
    lowStockCount: number;
    unitsNeeded: number;
  };
  items: InventoryItem[];
  shoppingQueue: ShoppingItem[];
  recentActivity: ActivityEvent[];
};

/** Matches Worker `dashboardLinkItemSchema` write fields. */
export type LinkItemInput = {
  rfidUid: string;
  name: string;
  unit: string;
  onHand: number | null;
  target: number | null;
  catalogProvider: string;
  providerItemId: string;
};

export type ApiRecord = Record<string, unknown>;
