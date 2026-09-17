import type { ActivityEvent } from "./types";

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
  if (source === "device") return "RFID station";
  if (source === "mcp") return "MCP";
  return "Dashboard";
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
