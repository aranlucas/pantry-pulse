import { z } from "zod";

export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.number(),
  targetQuantity: z.number(),
  rfidUid: z.string().nullable(),
  catalogProvider: z.string().nullable(),
  providerItemId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pantrySnapshotSchema = z.object({
  generatedAt: z.string(),
  summary: z.object({
    itemCount: z.number(),
    lowStockCount: z.number(),
    unitsNeeded: z.number(),
  }),
  items: z.array(itemSchema),
  shoppingQueue: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      unit: z.string(),
      quantityNeeded: z.number(),
      catalogProvider: z.string().nullable(),
      providerItemId: z.string().nullable(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      eventId: z.string(),
      itemId: z.string(),
      itemName: z.string(),
      rfidUid: z.string().nullable(),
      delta: z.number(),
      source: z.enum(["admin", "device", "mcp"]),
      reason: z.string(),
      deviceId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export type PantryItem = z.infer<typeof itemSchema>;
export type PantrySnapshot = z.infer<typeof pantrySnapshotSchema>;
export type ShoppingNeed = PantrySnapshot["shoppingQueue"][number];
export type InventoryActivity = PantrySnapshot["recentActivity"][number];
export type InventorySource = InventoryActivity["source"];
