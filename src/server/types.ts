export type {
  InventoryActivity,
  InventorySource,
  PantryItem,
  PantrySnapshot,
  ShoppingNeed,
} from "../shared/pantry";

export type McpAccess = "read" | "write";

export class PantryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PantryError";
  }
}
