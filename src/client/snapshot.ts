import { z } from "zod";
import type { PantrySnapshot } from "./types";

const text = z.string().catch("");

const nullableText = z.string().min(1).nullable().catch(null);

const number = z
  .union([
    z.number(),
    z
      .string()
      .refine((value) => value.trim() !== "")
      .transform(Number)
      .pipe(z.number()),
  ])
  .catch(0);

const identifier = z.string().optional().catch(undefined);

const inventoryFields = z.object({
  id: identifier,
  name: z.string().catch("Unnamed item"),
  unit: z.string().catch("item"),
  quantity: number,
  targetQuantity: number,
  rfidUid: nullableText,
  catalogProvider: nullableText,
  providerItemId: nullableText,
  createdAt: text,
  updatedAt: text,
});

const inventorySchema = inventoryFields.catch(() => inventoryFields.parse({}));

const shoppingFields = z.object({
  itemId: identifier,
  name: z.string().catch("Unnamed item"),
  unit: z.string().catch("item"),
  quantityNeeded: number,
  catalogProvider: nullableText,
  providerItemId: nullableText,
});

const shoppingSchema = shoppingFields.catch(() => shoppingFields.parse({}));

const activityFields = z.object({
  eventId: identifier,
  itemId: text,
  itemName: z.string().catch("Unnamed item"),
  rfidUid: nullableText,
  delta: number,
  source: z.enum(["admin", "device", "mcp"]).catch("admin"),
  reason: text,
  deviceId: nullableText,
  createdAt: z.string().catch(() => new Date().toISOString()),
});

const activitySchema = activityFields.catch(() => activityFields.parse({}));

const summarySchema = z
  .object({
    itemCount: number,
    lowStockCount: number,
    unitsNeeded: number,
  })
  .catch({ itemCount: 0, lowStockCount: 0, unitsNeeded: 0 });

const snapshotFields = z.object({
  generatedAt: z.string().catch(() => new Date().toISOString()),
  summary: summarySchema,
  items: z
    .array(inventorySchema)
    .catch([])
    .transform((items) =>
      items.map((item, index) => ({ ...item, id: item.id ?? `item-${index + 1}` })),
    ),
  shoppingQueue: z
    .array(shoppingSchema)
    .catch([])
    .transform((items) =>
      items.map((item, index) => ({ ...item, itemId: item.itemId ?? `queue-${index + 1}` })),
    ),
  recentActivity: z
    .array(activitySchema)
    .catch([])
    .transform((items) =>
      items.map((item, index) => ({ ...item, eventId: item.eventId ?? `event-${index + 1}` })),
    ),
});

/** Preserve the dashboard's documented tolerant boundary defaults. */
export const snapshotSchema: z.ZodType<PantrySnapshot> = snapshotFields.catch(() =>
  snapshotFields.parse({}),
);

export const decodeSnapshot = snapshotSchema.parse;

export function activityWasConsumed(delta: number): boolean {
  return delta < 0;
}
