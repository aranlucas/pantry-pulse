export interface PantryEnv extends Env {
  ADMIN_TOKEN: string;
  DEVICE_TOKEN: string;
  MCP_READ_TOKEN: string;
  MCP_WRITE_TOKEN: string;
}

export type McpAccess = "read" | "write";

export interface PantryItem {
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
}

export interface ShoppingNeed {
  itemId: string;
  name: string;
  unit: string;
  quantityNeeded: number;
  catalogProvider: string | null;
  providerItemId: string | null;
}

export interface InventoryActivity {
  eventId: string;
  itemId: string;
  itemName: string;
  rfidUid: string | null;
  delta: number;
  source: "admin" | "device" | "mcp";
  reason: string;
  deviceId: string | null;
  createdAt: string;
}

export interface PantrySnapshot {
  generatedAt: string;
  summary: {
    itemCount: number;
    lowStockCount: number;
    unitsNeeded: number;
  };
  items: PantryItem[];
  shoppingQueue: ShoppingNeed[];
  recentActivity: InventoryActivity[];
}

export type InventorySource = InventoryActivity["source"];

export class PantryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PantryError";
  }
}
