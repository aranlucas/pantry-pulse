export type View = "pantry" | "queue" | "activity";

export type {
  PantryItem as InventoryItem,
  ShoppingNeed as ShoppingItem,
  InventoryActivity as ActivityEvent,
  PantrySnapshot,
} from "../shared/pantry";

/** Matches Worker `dashboardLinkItemSchema` write fields. */
export type LinkItemInput = {
  rfidUid: string;
  name: string;
  unit: string;
  onHand: number | null;
  expectedQuantity?: number;
  target: number | null;
  catalogProvider: string;
  providerItemId: string;
};
