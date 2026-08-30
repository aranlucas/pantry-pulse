import { z } from "zod";

export const itemIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "Invalid item ID");

export const eventIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "Invalid event ID");

export const rfidUidSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^0-9a-f]/gi, "").toUpperCase())
  .pipe(
    z
      .string()
      .min(8, "RFID UID must contain at least four bytes")
      .max(32, "RFID UID is too long")
      .regex(/^[0-9A-F]+$/)
      .refine((value) => value.length % 2 === 0, "RFID UID must contain full bytes"),
  );

export const createItemSchema = z.object({
  id: itemIdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(32).default("item"),
  quantity: z.number().int().min(0).max(100_000).default(0),
  targetQuantity: z.number().int().min(0).max(100_000).default(1),
});

export const adjustInventorySchema = z.object({
  eventId: eventIdSchema,
  delta: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(80).default("manual adjustment"),
});

export const deviceScanSchema = z.object({
  eventId: eventIdSchema,
  tagUid: rfidUidSchema,
  mode: z.enum(["restock", "consume"]),
  amount: z.number().int().min(1).max(100).default(1),
});

export const linkItemSchema = z
  .object({
    rfidUid: z.union([rfidUidSchema, z.null()]).optional(),
    catalogProvider: z.union([z.string().trim().min(1).max(40), z.null()]).optional(),
    providerItemId: z.union([z.string().trim().min(1).max(160), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one link field is required");

export const dashboardLinkItemSchema = linkItemSchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
  unit: z.union([z.string().trim().min(1).max(32), z.null()]).optional(),
  onHand: z.union([z.number().int().min(0).max(100_000), z.null()]).optional(),
  target: z.union([z.number().int().min(0).max(100_000), z.null()]).optional(),
});

export const mcpAdjustSchema = adjustInventorySchema.extend({
  itemId: itemIdSchema,
});

export const mcpLinkSchema = linkItemSchema.extend({
  itemId: itemIdSchema,
});

export const shoppingExportSchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});
