import type {
  InventoryActivity,
  InventorySource,
  PantryItem,
  PantrySnapshot,
  ShoppingNeed,
} from "./types";
import { PantryError } from "./types";

const itemColumns = `
  id,
  name,
  unit,
  quantity,
  target_quantity AS targetQuantity,
  rfid_uid AS rfidUid,
  catalog_provider AS catalogProvider,
  provider_item_id AS providerItemId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const maxItems = 500;

interface EventRow {
  id: string;
  itemId: string;
  delta: number;
  source: InventorySource;
  reason: string;
  deviceId: string | null;
  appliedAt: string | null;
}

export interface AdjustmentInput {
  eventId: string;
  itemId: string;
  delta: number;
  source: InventorySource;
  reason: string;
  deviceId?: string | null;
}

export interface AdjustmentResult {
  item: PantryItem;
  eventId: string;
  idempotentReplay: boolean;
}

function changes(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

async function getEvent(db: D1Database, eventId: string): Promise<EventRow | null> {
  const active = await db
    .prepare(
      `SELECT
        id,
        item_id AS itemId,
        delta,
        source,
        reason,
        device_id AS deviceId,
        applied_at AS appliedAt
      FROM inventory_events
      WHERE id = ?`,
    )
    .bind(eventId)
    .first<EventRow>();
  if (active) return active;

  return db
    .prepare(
      `SELECT
        id,
        item_id AS itemId,
        delta,
        source,
        reason,
        device_id AS deviceId,
        'archived' AS appliedAt
      FROM event_tombstones
      WHERE id = ?`,
    )
    .bind(eventId)
    .first<EventRow>();
}

export async function hasInventoryEvent(db: D1Database, eventId: string): Promise<boolean> {
  return (await getEvent(db, eventId)) !== null;
}

function assertMatchingEvent(existing: EventRow, input: AdjustmentInput): void {
  if (
    existing.itemId !== input.itemId ||
    existing.delta !== input.delta ||
    existing.source !== input.source ||
    existing.reason !== input.reason ||
    existing.deviceId !== (input.deviceId ?? null)
  ) {
    throw new PantryError(
      "That event ID was already used for a different inventory change",
      409,
      "event_id_conflict",
    );
  }
}

export async function getItem(db: D1Database, itemId: string): Promise<PantryItem | null> {
  return db
    .prepare(`SELECT ${itemColumns} FROM items WHERE id = ?`)
    .bind(itemId)
    .first<PantryItem>();
}

export async function getItemByTag(db: D1Database, rfidUid: string): Promise<PantryItem | null> {
  return db
    .prepare(`SELECT ${itemColumns} FROM items WHERE rfid_uid = ?`)
    .bind(rfidUid)
    .first<PantryItem>();
}

export async function createItem(
  db: D1Database,
  input: {
    id?: string;
    name: string;
    unit: string;
    quantity: number;
    targetQuantity: number;
  },
): Promise<PantryItem> {
  const id = input.id ?? `itm-${crypto.randomUUID()}`;

  try {
    const insert = await db
      .prepare(
        `INSERT INTO items (id, name, unit, quantity, target_quantity)
         SELECT ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM items) < ?`,
      )
      .bind(id, input.name, input.unit, input.quantity, input.targetQuantity, maxItems)
      .run();
    if (changes(insert) === 0) {
      throw new PantryError(`A pantry can contain at most ${maxItems} items`, 409, "item_limit");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new PantryError("An item with that ID already exists", 409, "item_exists");
    }
    throw error;
  }

  const created = await getItem(db, id);
  if (!created) {
    throw new Error("Created item could not be reloaded");
  }
  return created;
}

export async function applyAdjustment(
  db: D1Database,
  input: AdjustmentInput,
): Promise<AdjustmentResult> {
  const existing = await getEvent(db, input.eventId);
  if (existing) {
    assertMatchingEvent(existing, input);
    const item = await getItem(db, input.itemId);
    if (!item) {
      throw new PantryError("Inventory item not found", 404, "item_not_found");
    }
    return { item, eventId: input.eventId, idempotentReplay: true };
  }

  const item = await getItem(db, input.itemId);
  if (!item) {
    throw new PantryError("Inventory item not found", 404, "item_not_found");
  }
  if (item.quantity + input.delta < 0) {
    throw new PantryError("Inventory cannot be adjusted below zero", 409, "negative_inventory");
  }

  let results: D1Result[];
  try {
    results = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO inventory_events
            (id, item_id, delta, source, reason, device_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.eventId,
          input.itemId,
          input.delta,
          input.source,
          input.reason,
          input.deviceId ?? null,
        ),
      db
        .prepare(
          `UPDATE items
           SET quantity = quantity + ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?
             AND EXISTS (
               SELECT 1 FROM inventory_events
               WHERE id = ? AND applied_at IS NULL
             )`,
        )
        .bind(input.delta, input.itemId, input.eventId),
      db
        .prepare(
          `UPDATE inventory_events
           SET applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND applied_at IS NULL`,
        )
        .bind(input.eventId),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("CHECK constraint failed")) {
      throw new PantryError(
        "Inventory changed before this adjustment completed",
        409,
        "inventory_conflict",
      );
    }
    throw error;
  }

  const stored = await getEvent(db, input.eventId);
  if (!stored) {
    throw new Error("Inventory event could not be reloaded");
  }
  assertMatchingEvent(stored, input);

  const updated = await getItem(db, input.itemId);
  if (!updated) {
    throw new Error("Adjusted item could not be reloaded");
  }

  return {
    item: updated,
    eventId: input.eventId,
    idempotentReplay: changes(results[0]!) === 0,
  };
}

export async function linkItem(
  db: D1Database,
  itemId: string,
  patch: {
    rfidUid?: string | null;
    catalogProvider?: string | null;
    providerItemId?: string | null;
    name?: string;
    unit?: string | null;
    quantity?: number | null;
    targetQuantity?: number | null;
  },
): Promise<PantryItem> {
  const existing = await getItem(db, itemId);
  if (!existing) {
    throw new PantryError("Inventory item not found", 404, "item_not_found");
  }

  const rfidUid = patch.rfidUid === undefined ? existing.rfidUid : patch.rfidUid;
  const catalogProvider =
    patch.catalogProvider === undefined ? existing.catalogProvider : patch.catalogProvider;
  const providerItemId =
    patch.providerItemId === undefined ? existing.providerItemId : patch.providerItemId;
  const name = patch.name ?? existing.name;
  const unit = patch.unit ?? existing.unit;
  const quantity = patch.quantity ?? existing.quantity;
  const targetQuantity = patch.targetQuantity ?? existing.targetQuantity;

  if ((catalogProvider === null) !== (providerItemId === null)) {
    throw new PantryError(
      "Catalog provider and provider item ID must be linked or cleared together",
      422,
      "incomplete_catalog_link",
    );
  }

  try {
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE items
           SET name = ?,
               unit = ?,
               quantity = ?,
               target_quantity = ?,
               rfid_uid = ?,
               catalog_provider = ?,
               provider_item_id = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .bind(
          name,
          unit,
          quantity,
          targetQuantity,
          rfidUid,
          catalogProvider,
          providerItemId,
          itemId,
        ),
    ];
    if (quantity !== existing.quantity) {
      statements.push(
        db
          .prepare(
            `INSERT INTO inventory_events
              (id, item_id, delta, source, reason, applied_at)
             VALUES (?, ?, ?, 'admin', 'dashboard setup', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
          )
          .bind(`evt-${crypto.randomUUID()}`, itemId, quantity - existing.quantity),
      );
    }
    await db.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new PantryError("That RFID tag is already linked to another item", 409, "tag_in_use");
    }
    throw error;
  }

  const updated = await getItem(db, itemId);
  if (!updated) {
    throw new Error("Linked item could not be reloaded");
  }
  return updated;
}

export async function getSnapshot(db: D1Database): Promise<PantrySnapshot> {
  const queryResults = await db.batch([
    db.prepare(
      `SELECT ${itemColumns}
       FROM items
       ORDER BY
         CASE WHEN quantity < target_quantity THEN 0 ELSE 1 END,
         name COLLATE NOCASE
       LIMIT ${maxItems}`,
    ),
    db.prepare(
      `SELECT
         inventory_events.id AS eventId,
         inventory_events.item_id AS itemId,
         items.name AS itemName,
         items.rfid_uid AS rfidUid,
         inventory_events.delta,
         inventory_events.source,
         inventory_events.reason,
         inventory_events.device_id AS deviceId,
         inventory_events.created_at AS createdAt
       FROM inventory_events
       JOIN items ON items.id = inventory_events.item_id
       WHERE inventory_events.applied_at IS NOT NULL
       ORDER BY inventory_events.created_at DESC
       LIMIT 30`,
    ),
  ]);

  const itemsResult = queryResults[0]!;
  const activityResult = queryResults[1]!;
  const items = itemsResult.results as unknown as PantryItem[];
  const recentActivity = activityResult.results as unknown as InventoryActivity[];
  const shoppingQueue: ShoppingNeed[] = items
    .filter((item) => item.quantity < item.targetQuantity)
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      quantityNeeded: item.targetQuantity - item.quantity,
      catalogProvider: item.catalogProvider,
      providerItemId: item.providerItemId,
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      itemCount: items.length,
      lowStockCount: shoppingQueue.length,
      unitsNeeded: shoppingQueue.reduce((sum, item) => sum + item.quantityNeeded, 0),
    },
    items,
    shoppingQueue,
    recentActivity,
  };
}

export async function assertDatabaseHealthy(db: D1Database): Promise<void> {
  await db.prepare("SELECT 1 AS healthy").first();
}

export async function pruneInventoryEvents(db: D1Database, retentionDays = 90): Promise<number> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("Invalid inventory event retention period");
  }
  const cutoff = `-${retentionDays} days`;
  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO event_tombstones
          (id, item_id, delta, source, reason, device_id)
         SELECT id, item_id, delta, source, reason, device_id
         FROM inventory_events
         WHERE julianday(created_at) < julianday('now', ?)`,
      )
      .bind(cutoff),
    db
      .prepare(
        `DELETE FROM inventory_events
         WHERE julianday(created_at) < julianday('now', ?)`,
      )
      .bind(cutoff),
  ]);
  return changes(results[1]!);
}

export async function countEventTombstones(db: D1Database): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) AS count FROM event_tombstones")
    .first<{ count: number }>();
  return result?.count ?? 0;
}
