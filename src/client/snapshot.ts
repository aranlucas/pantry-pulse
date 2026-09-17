import type {
  ActivityEvent,
  ApiRecord,
  InventoryItem,
  PantrySnapshot,
  ShoppingItem,
} from "./types";

function asRecord(value: unknown): ApiRecord {
  return typeof value === "object" && value !== null ? (value as ApiRecord) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function decodeItem(value: unknown, index: number): InventoryItem {
  const record = asRecord(value);
  return {
    id: asString(record.id, `item-${index + 1}`),
    name: asString(record.name, "Unnamed item"),
    unit: asString(record.unit, "item"),
    quantity: asNumber(record.quantity),
    targetQuantity: asNumber(record.targetQuantity),
    rfidUid: asNullableString(record.rfidUid),
    catalogProvider: asNullableString(record.catalogProvider),
    providerItemId: asNullableString(record.providerItemId),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function decodeShoppingItem(value: unknown, index: number): ShoppingItem {
  const record = asRecord(value);
  return {
    itemId: asString(record.itemId, `queue-${index + 1}`),
    name: asString(record.name, "Unnamed item"),
    unit: asString(record.unit, "item"),
    quantityNeeded: asNumber(record.quantityNeeded),
    catalogProvider: asNullableString(record.catalogProvider),
    providerItemId: asNullableString(record.providerItemId),
  };
}

function decodeActivitySource(value: unknown): ActivityEvent["source"] {
  return value === "device" || value === "mcp" ? value : "admin";
}

function decodeActivity(value: unknown, index: number): ActivityEvent {
  const record = asRecord(value);
  return {
    eventId: asString(record.eventId, `event-${index + 1}`),
    itemId: asString(record.itemId),
    itemName: asString(record.itemName, "Unnamed item"),
    rfidUid: asNullableString(record.rfidUid),
    delta: asNumber(record.delta),
    source: decodeActivitySource(record.source),
    reason: asString(record.reason),
    deviceId: asNullableString(record.deviceId),
    createdAt: asString(record.createdAt, new Date().toISOString()),
  };
}

function decodeSummary(value: unknown): PantrySnapshot["summary"] {
  const record = asRecord(value);
  return {
    itemCount: asNumber(record.itemCount),
    lowStockCount: asNumber(record.lowStockCount),
    unitsNeeded: asNumber(record.unitsNeeded),
  };
}

export function decodeSnapshot(value: unknown): PantrySnapshot {
  const record = asRecord(value);
  return {
    generatedAt: asString(record.generatedAt, new Date().toISOString()),
    summary: decodeSummary(record.summary),
    items: asArray(record.items).map(decodeItem),
    shoppingQueue: asArray(record.shoppingQueue).map(decodeShoppingItem),
    recentActivity: asArray(record.recentActivity).map(decodeActivity),
  };
}

export function activityWasConsumed(delta: number): boolean {
  return delta < 0;
}
