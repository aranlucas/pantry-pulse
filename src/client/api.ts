import type { LinkItemInput, PantrySnapshot } from "./types";
import { decodeSnapshot } from "./snapshot";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function requestJson(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const body = asRecord(payload);
      const nestedError = asRecord(body.error);
      const message = asString(
        body.message ?? nestedError.message ?? body.error,
        response.status === 401 || response.status === 403
          ? "That token did not unlock this pantry."
          : `Request failed (${response.status}).`,
      );
      throw new ApiError(message, response.status);
    }

    return payload;
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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchSnapshot(token: string): Promise<PantrySnapshot> {
  return decodeSnapshot(await requestJson(token, "/api/snapshot"));
}

export async function adjustItem(token: string, itemId: string, delta: number): Promise<void> {
  await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/adjust`, {
    method: "POST",
    body: JSON.stringify({
      delta,
      eventId: createEventId(),
      reason: "manual adjustment",
    }),
  });
}

export async function linkItem(token: string, itemId: string, input: LinkItemInput): Promise<void> {
  await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/link`, {
    method: "POST",
    body: JSON.stringify({
      rfidUid: input.rfidUid,
      name: input.name,
      unit: input.unit || null,
      onHand: input.onHand,
      target: input.target,
      catalogProvider: input.catalogProvider || null,
      providerItemId: input.providerItemId || null,
    }),
  });
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
