import { hasAdminAccess, hasDeviceAccess } from "./auth";
import {
  applyAdjustment,
  createItem,
  getItemByTag,
  getSnapshot,
  hasInventoryEvent,
  linkItem,
} from "./repository";
import {
  adjustInventorySchema,
  createItemSchema,
  dashboardLinkItemSchema,
  deviceScanSchema,
  itemIdSchema,
} from "./schemas";
import type { PantryEnv } from "./types";
import { PantryError } from "./types";

const maxBodyBytes = 16 * 1024;

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

async function body(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new PantryError(
      "Expected an application/json request body",
      415,
      "unsupported_media_type",
    );
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > maxBodyBytes) {
    throw new PantryError("Request body is too large", 413, "body_too_large");
  }

  if (!request.body) throw new PantryError("Request body is not valid JSON", 400, "invalid_json");

  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBodyBytes) {
      await reader.cancel("request body limit exceeded");
      throw new PantryError("Request body is too large", 413, "body_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PantryError("Request body is not valid JSON", 400, "invalid_json");
  }
}

function issue(error: unknown): { message: string; status: number; code: string } {
  if (error instanceof PantryError) {
    return { message: error.message, status: error.status, code: error.code };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    const first = error.issues[0] as { message?: string; path?: PropertyKey[] } | undefined;
    const field = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return {
      message: `${field}${first?.message ?? "Request validation failed"}`,
      status: 422,
      code: "validation_error",
    };
  }
  console.error("Unhandled Pantry Pulse API error", error);
  return { message: "Unexpected server error", status: 500, code: "internal_error" };
}

function unauthorized(): Response {
  return json(
    { error: { code: "unauthorized", message: "A valid bearer token is required" } },
    401,
    { "WWW-Authenticate": 'Bearer realm="pantry-pulse"' },
  );
}

function decodedItemId(encoded: string): string {
  try {
    return itemIdSchema.parse(decodeURIComponent(encoded));
  } catch (error) {
    if (error instanceof URIError) {
      throw new PantryError("Item path is not valid URL encoding", 400, "invalid_path");
    }
    throw error;
  }
}

async function route(request: Request, env: PantryEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  if (pathname === "/api/device/scans" && request.method === "POST") {
    if (!(await hasDeviceAccess(request, env))) return unauthorized();

    const attemptLimit = await env.DEVICE_ATTEMPT_RATE_LIMIT.limit({ key: env.DEVICE_ID });
    if (!attemptLimit.success) {
      throw new PantryError("Device scan rate limit exceeded", 429, "rate_limited");
    }
    const input = deviceScanSchema.parse(await body(request));
    const item = await getItemByTag(env.DB, input.tagUid);
    if (!item) {
      throw new PantryError("This RFID tag is not linked to a pantry item", 404, "tag_not_linked");
    }
    if (!(await hasInventoryEvent(env.DB, input.eventId))) {
      const writeLimit = await env.DEVICE_RATE_LIMIT.limit({ key: env.DEVICE_ID });
      if (!writeLimit.success) {
        throw new PantryError("Device scan rate limit exceeded", 429, "rate_limited");
      }
    }
    const result = await applyAdjustment(env.DB, {
      eventId: input.eventId,
      itemId: item.id,
      delta: input.mode === "restock" ? input.amount : -input.amount,
      source: "device",
      reason: `RFID ${input.mode}`,
      deviceId: env.DEVICE_ID,
    });
    return json(result, result.idempotentReplay ? 200 : 201);
  }

  if (!(await hasAdminAccess(request, env))) return unauthorized();

  if (pathname === "/api/snapshot" && request.method === "GET") {
    return json(await getSnapshot(env.DB));
  }

  if (pathname === "/api/items" && request.method === "POST") {
    const input = createItemSchema.parse(await body(request));
    return json({ item: await createItem(env.DB, input) }, 201);
  }

  const adjustmentMatch = /^\/api\/items\/([^/]+)\/adjust$/.exec(pathname);
  if (adjustmentMatch && request.method === "POST") {
    const itemId = decodedItemId(adjustmentMatch[1]!);
    const input = adjustInventorySchema.parse(await body(request));
    return json(
      await applyAdjustment(env.DB, {
        ...input,
        itemId,
        source: "admin",
      }),
    );
  }

  const linkMatch = /^\/api\/items\/([^/]+)\/link$/.exec(pathname);
  if (linkMatch && request.method === "POST") {
    const itemId = decodedItemId(linkMatch[1]!);
    const input = dashboardLinkItemSchema.parse(await body(request));
    return json({
      item: await linkItem(env.DB, itemId, {
        ...input,
        quantity: input.onHand,
        targetQuantity: input.target,
      }),
    });
  }

  return json({ error: { code: "not_found", message: "API route not found" } }, 404);
}

export async function handleApi(request: Request, env: PantryEnv): Promise<Response> {
  try {
    return await route(request, env);
  } catch (error) {
    const problem = issue(error);
    return json({ error: { code: problem.code, message: problem.message } }, problem.status);
  }
}
