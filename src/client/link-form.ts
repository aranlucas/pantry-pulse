import type { InventoryItem } from "./types";

export type LinkFormState = {
  rfidUid: string;
  name: string;
  unit: string;
  onHand: string;
  target: string;
  catalogProvider: string;
  providerItemId: string;
};

export const EMPTY_LINK_FORM: LinkFormState = {
  rfidUid: "",
  name: "",
  unit: "",
  onHand: "",
  target: "",
  catalogProvider: "",
  providerItemId: "",
};

export function formFromItem(item: InventoryItem | undefined): LinkFormState {
  if (!item) return EMPTY_LINK_FORM;
  return {
    rfidUid: item.rfidUid ?? "",
    name: item.name,
    unit: item.unit,
    onHand: String(item.quantity),
    target: String(item.targetQuantity),
    catalogProvider: item.catalogProvider ?? "",
    providerItemId: item.providerItemId ?? "",
  };
}

export function nullableInteger(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }
  return parsed;
}
