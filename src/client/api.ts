import type {
  ActivityEvent,
  ApiRecord,
  InventoryItem,
  LinkItemInput,
  MutationResponse,
  PantrySnapshot,
  ShoppingItem,
  StationStatus,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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
  const id = asString(record.id ?? record.itemId ?? record.tagUid, `item-${index + 1}`);

  return {
    id,
    name: asString(record.name ?? record.itemName, "Unnamed item"),
    tagUid: asNullableString(record.tagUid ?? record.tagUID ?? record.rfidUid ?? record.uid),
    unit: asNullableString(record.unit),
    onHand: asNumber(record.onHand ?? record.quantity ?? record.have),
    target: asNumber(record.target ?? record.targetQuantity),
    provider: asNullableString(record.provider ?? record.catalogProvider ?? record.providerName),
    providerItemId: asNullableString(record.providerItemId ?? record.catalogItemId),
  };
}

function decodeShoppingItem(value: unknown, index: number): ShoppingItem {
  const record = asRecord(value);
  return {
    id: asString(record.id ?? record.itemId, `queue-${index + 1}`),
    name: asString(record.name ?? record.itemName, "Unnamed item"),
    amount: asNumber(record.amount ?? record.needed ?? record.quantityNeeded ?? record.quantity),
    unit: asNullableString(record.unit),
  };
}

function decodeActivity(value: unknown, index: number): ActivityEvent {
  const record = asRecord(value);
  return {
    id: asString(record.id ?? record.eventId, `event-${index + 1}`),
    kind: asString(
      record.kind ?? record.type ?? record.eventType ?? record.reason,
      asNumber(record.delta) < 0 ? "consumed" : "restocked",
    ),
    itemName: asString(record.itemName ?? record.name, "Unnamed item"),
    tagUid: asNullableString(record.tagUid ?? record.tagUID ?? record.rfidUid ?? record.uid),
    source: asNullableString(record.source ?? record.origin),
    createdAt: asString(
      record.createdAt ?? record.timestamp ?? record.occurredAt,
      new Date().toISOString(),
    ),
  };
}

function decodeStation(value: unknown): StationStatus {
  const record = asRecord(value);
  const online =
    typeof record.online === "boolean"
      ? record.online
      : typeof record.connected === "boolean"
        ? record.connected
        : null;

  return {
    online,
    name: asString(record.name, "Station"),
    detail: asString(record.detail ?? record.type, "ESP32 · RFID Station"),
  };
}

export function decodeSnapshot(value: unknown): PantrySnapshot {
  const record = asRecord(value);
  const items = asArray(record.items ?? record.inventory).map(decodeItem);
  const shoppingQueue = asArray(record.shoppingQueue ?? record.shopping ?? record.queue).map(
    decodeShoppingItem,
  );
  const activity = asArray(
    record.activity ?? record.recentScans ?? record.recentActivity ?? record.events,
  ).map(decodeActivity);

  return {
    items,
    shoppingQueue,
    activity,
    station: decodeStation(record.station ?? record.stationStatus),
  };
}

function decodeMutation(value: unknown): MutationResponse {
  const record = asRecord(value);
  const item = record.item ? decodeItem(record.item, 0) : undefined;
  const snapshot = record.snapshot ? decodeSnapshot(record.snapshot) : undefined;

  if (!item && record.id) {
    return { item: decodeItem(record, 0), snapshot };
  }
  return { item, snapshot };
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

export async function adjustItem(
  token: string,
  itemId: string,
  delta: number,
): Promise<MutationResponse> {
  const response = await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/adjust`, {
    method: "POST",
    body: JSON.stringify({
      delta,
      eventId: createEventId(),
      reason: "manual adjustment",
    }),
  });
  return decodeMutation(response);
}

export async function linkItem(
  token: string,
  itemId: string,
  input: LinkItemInput,
): Promise<MutationResponse> {
  const response = await requestJson(token, `/api/items/${encodeURIComponent(itemId)}/link`, {
    method: "POST",
    body: JSON.stringify({
      rfidUid: input.tagUid,
      name: input.name,
      unit: input.unit || null,
      onHand: input.onHand,
      target: input.target,
      catalogProvider: input.catalogProvider || null,
      providerItemId: input.providerItemId || null,
    }),
  });
  return decodeMutation(response);
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
