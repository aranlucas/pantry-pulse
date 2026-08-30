import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { applyAdjustment, getSnapshot, linkItem } from "./repository";
import { mcpAdjustSchema, mcpLinkSchema, shoppingExportSchema } from "./schemas";
import type { McpAccess, PantryEnv } from "./types";
import { PantryError } from "./types";

const itemSchema = z.object({
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

const adjustmentResultSchema = z.object({
  item: itemSchema,
  eventId: z.string(),
  idempotentReplay: z.boolean(),
});

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function toolError(error: unknown) {
  if (!(error instanceof PantryError))
    console.error("Unexpected Pantry Pulse MCP tool error", error);
  const message = error instanceof PantryError ? error.message : "Pantry operation failed";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createPantryMcpServer(env: PantryEnv, access: McpAccess): McpServer {
  const server = new McpServer({ name: "pantry-pulse", version: "0.1.0" });

  server.registerTool(
    "pantry_snapshot",
    {
      title: "Pantry snapshot",
      description:
        "Read the current pantry inventory, low-stock summary, derived shopping queue, and recent changes.",
      inputSchema: z.object({}),
      outputSchema: z.object({
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
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        return result(await getSnapshot(env.DB));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "shopping_queue_export",
    {
      title: "Export shopping queue",
      description:
        "Export only the quantities needed to bring low-stock pantry items back to their targets.",
      inputSchema: shoppingExportSchema,
      outputSchema: z.object({
        format: z.enum(["markdown", "json"]),
        itemCount: z.number(),
        text: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format }) => {
      try {
        const snapshot = await getSnapshot(env.DB);
        const text =
          format === "json"
            ? JSON.stringify(snapshot.shoppingQueue, null, 2)
            : snapshot.shoppingQueue.length === 0
              ? "Pantry is stocked."
              : snapshot.shoppingQueue
                  .map((item) => `- [ ] ${item.name} — ${item.quantityNeeded} ${item.unit}`)
                  .join("\n");
        return result({ format, itemCount: snapshot.shoppingQueue.length, text });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  if (access === "write")
    server.registerTool(
      "pantry_adjust",
      {
        title: "Adjust pantry inventory",
        description:
          "Apply an inventory delta. Supply a stable eventId when retrying; duplicate identical events are safe and apply once.",
        inputSchema: mcpAdjustSchema,
        outputSchema: adjustmentResultSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          return result(await applyAdjustment(env.DB, { ...input, source: "mcp" }));
        } catch (error) {
          return toolError(error);
        }
      },
    );

  if (access === "write")
    server.registerTool(
      "pantry_link_item",
      {
        title: "Link pantry item",
        description:
          "Link or clear an item's RFID tag and optional provider-agnostic catalog reference.",
        inputSchema: mcpLinkSchema,
        outputSchema: z.object({ item: itemSchema }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ itemId, ...patch }) => {
        try {
          return result({ item: await linkItem(env.DB, itemId, patch) });
        } catch (error) {
          return toolError(error);
        }
      },
    );

  return server;
}

export function createPantryMcpHandler(env: PantryEnv, access: McpAccess) {
  return createMcpHandler(() => createPantryMcpServer(env, access), {
    route: "/mcp",
    corsOptions: false,
    legacy: "stateless",
    responseMode: "auto",
  });
}
