import type { LinkItemInput, PantrySnapshot } from "./types";
import { snapshotSchema } from "./snapshot";
import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const errorEnvelope = z
  .object({ message: z.unknown().optional(), error: z.unknown().optional() })
  .catch({ message: undefined, error: undefined });

const nestedErrorSchema = z
  .object({ message: z.unknown().optional() })
  .catch({ message: undefined });

const parsedJson = z.string().transform((text) => {
  try {
    return z.unknown().parse(JSON.parse(text));
  } catch {
    return null;
  }
});

const ignoredResponse = z.unknown().transform(() => undefined);

async function requestJson<T>(
  token: string,
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const headers: Record<string, string> = {};
    headers.Accept = "application/json";
    headers.Authorization = `Bearer ${token}`;

    if (init.body) headers["Content-Type"] = "application/json";

    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...init.headers },
    });

    const payload = parsedJson.parse(await response.text());

    if (!response.ok) {
      const body = errorEnvelope.parse(payload);
      const nestedError = nestedErrorSchema.parse(body.error);

      const fallback =
        response.status === 401 || response.status === 403
          ? "That token did not unlock this pantry."
          : `Request failed (${response.status}).`;

      const message = z
        .string()
        .catch(fallback)
        .parse(body.message ?? nestedError.message ?? body.error);

      throw new ApiError(message, response.status);
    }

    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The pantry station took too long to respond.", 408);
    }

    throw new ApiError(
      "Pantry Pulse could not reach the station. Check the connection and try again.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

function createEventId(): string {
  if (typeof crypto !== "undefined" && z.function().safeParse(crypto.randomUUID).success) {
    return `web-${crypto.randomUUID()}`;
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchSnapshot(token: string): Promise<PantrySnapshot> {
  return requestJson(token, "/api/snapshot", snapshotSchema);
}

export async function adjustItem(token: string, itemId: string, delta: number): Promise<void> {
  await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/adjust`, ignoredResponse, {
    method: "POST",
    body: JSON.stringify({
      delta,
      eventId: createEventId(),
      reason: "manual adjustment",
    }),
  });
}

export async function linkItem(token: string, itemId: string, input: LinkItemInput): Promise<void> {
  await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/link`, ignoredResponse, {
    method: "POST",
    body: JSON.stringify({
      rfidUid: input.rfidUid,
      name: input.name,
      unit: input.unit || null,
      onHand: input.onHand,
      expectedQuantity: input.expectedQuantity,
      target: input.target,
      catalogProvider: input.catalogProvider || null,
      providerItemId: input.providerItemId || null,
    }),
  });
}

export function isAuthError(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
}
