export type View = "pantry" | "queue" | "activity";

export type InventoryItem = {
  id: string;
  name: string;
  tagUid: string | null;
  unit: string | null;
  onHand: number;
  target: number;
  provider: string | null;
  providerItemId: string | null;
};

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string | null;
};

export type ActivityEvent = {
  id: string;
  kind: string;
  itemName: string;
  tagUid: string | null;
  source: string | null;
  createdAt: string;
};

export type StationStatus = {
  online: boolean | null;
  name: string;
  detail: string;
};

export type PantrySnapshot = {
  items: InventoryItem[];
  shoppingQueue: ShoppingItem[];
  activity: ActivityEvent[];
  station: StationStatus;
};

export type LinkItemInput = {
  tagUid: string;
  name: string;
  unit: string;
  onHand: number | null;
  target: number | null;
  catalogProvider: string;
  providerItemId: string;
};

export type MutationResponse = {
  item?: InventoryItem;
  snapshot?: PantrySnapshot;
};

export type ApiRecord = Record<string, unknown>;
