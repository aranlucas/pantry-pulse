import type { ActivityEvent, ShoppingItem } from "./types";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatQuantity(value: number, unit: string): string {
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatRfidUid(rfidUid: string | null): string {
  return rfidUid ? rfidUid.toUpperCase() : "No tag linked";
}

export function formatActivitySource(source: ActivityEvent["source"]): string {
  if (source === "device") {
    return "RFID station";
  }

  if (source === "mcp") {
    return "MCP";
  }

  return "Dashboard";
}

/** Describe a journal change from the household's side: what was used or added, and by whom. */
export function formatChange(
  change: NonNullable<ShoppingItem["lastChange"]>,
  unit: string,
): string {
  const amount = formatQuantity(Math.abs(change.delta), unit);

  return `${change.delta < 0 ? "Used" : "Added"} ${amount} via ${formatActivitySource(change.source)}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
