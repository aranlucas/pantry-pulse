import {
  Bean,
  ChevronDown,
  ChevronUp,
  Coffee,
  LoaderCircle,
  Milk,
  Minus,
  Package,
  PackageOpen,
  Plus,
  Soup,
  Tag,
  Wheat,
} from "lucide-react";
import type { ReactNode } from "react";

import { formatNumber, formatQuantity, formatRfidUid } from "./format";
import type { InventoryItem } from "./types";

function isLowStock(item: InventoryItem): boolean {
  return item.targetQuantity > 0 && item.quantity < item.targetQuantity;
}

function progressFor(item: InventoryItem): number {
  if (item.targetQuantity <= 0) return item.quantity > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (item.quantity / item.targetQuantity) * 100));
}

function itemIconFor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("milk")) return Milk;
  if (normalized.includes("bean")) return Bean;
  if (normalized.includes("coffee")) return Coffee;
  if (normalized.includes("rice") || normalized.includes("grain")) return Wheat;
  if (normalized.includes("soup") || normalized.includes("broth")) return Soup;
  return Package;
}

export function InventoryHeader({ onLink }: { onLink: () => void }): ReactNode {
  return (
    <div className="inventory-header">
      <div>
        <p className="eyebrow">Pantry ledger</p>
        <h1>What&apos;s running low?</h1>
        <p className="section-intro">
          Live stock from your pantry station. Adjust a count when you need to.
        </p>
      </div>
      <button className="secondary-button link-button" type="button" onClick={onLink}>
        <Tag size={18} strokeWidth={1.8} aria-hidden="true" />
        Link a tag
      </button>
    </div>
  );
}

function InventoryRow({
  item,
  expanded,
  pending,
  onAdjust,
  onToggle,
}: {
  item: InventoryItem;
  expanded: boolean;
  pending: boolean;
  onAdjust: (delta: number) => void;
  onToggle: () => void;
}): ReactNode {
  const low = isLowStock(item);
  const ItemIcon = itemIconFor(item.name);
  const progress = progressFor(item);
  const controlsId = `item-controls-${item.id}`;

  return (
    <article className={`inventory-row ${low ? "is-low" : ""} ${expanded ? "is-expanded" : ""}`}>
      <button
        className="item-primary"
        type="button"
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        <span className="item-icon" aria-hidden="true">
          <ItemIcon size={23} strokeWidth={1.7} />
        </span>
        <span className="item-name-group">
          <strong>{item.name}</strong>
          <span>{formatRfidUid(item.rfidUid)}</span>
        </span>
        <span className="mobile-chevron" aria-hidden="true">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>
      </button>

      <div className="stock-cell" aria-label={`${formatNumber(progress)} percent stocked`}>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`${item.name} stock level`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="stock-status">{low ? "Running low" : "On hand"}</span>
      </div>

      <div className={`have-target-cell ${low ? "is-low" : ""}`}>
        <strong>{formatNumber(item.quantity)}</strong>
        <span>/ {formatQuantity(item.targetQuantity, item.unit)}</span>
      </div>

      <div className="adjust-cell" id={controlsId}>
        <button
          className="quantity-button"
          type="button"
          aria-label={`Remove one ${item.unit || "unit"} of ${item.name}`}
          title={`Remove one ${item.unit || "unit"}`}
          disabled={pending || item.quantity <= 0}
          onClick={() => onAdjust(-1)}
        >
          <Minus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <output
          className="quantity-output"
          aria-label={`${formatNumber(item.quantity)} ${item.unit || "units"} on hand`}
        >
          {pending ? (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          ) : (
            formatNumber(item.quantity)
          )}
        </output>
        <button
          className="quantity-button"
          type="button"
          aria-label={`Add one ${item.unit || "unit"} of ${item.name}`}
          title={`Add one ${item.unit || "unit"}`}
          disabled={pending}
          onClick={() => onAdjust(1)}
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function InventoryLedger({
  items,
  expandedItemId,
  pendingItemId,
  onAdjust,
  onToggle,
}: {
  items: InventoryItem[];
  expandedItemId: string | null;
  pendingItemId: string | null;
  onAdjust: (item: InventoryItem, delta: number) => void;
  onToggle: (itemId: string) => void;
}): ReactNode {
  if (!items.length) {
    return (
      <section className="empty-state ledger-empty" aria-label="Pantry inventory">
        <PackageOpen size={30} strokeWidth={1.6} aria-hidden="true" />
        <h2>Your pantry is ready for its first item.</h2>
        <p>Link a tag when an item is available to track.</p>
      </section>
    );
  }

  return (
    <section className="ledger-section" aria-label="Inventory">
      <div className="ledger-label-row">
        <h2>Inventory</h2>
        <span>{items.length} tracked items</span>
      </div>
      <div className="ledger-column-labels" aria-hidden="true">
        <span>Item</span>
        <span>Stock level</span>
        <span>Have / target</span>
        <span>Adjust</span>
      </div>
      <div className="inventory-list">
        {items.map((item) => (
          <InventoryRow
            key={item.id}
            item={item}
            expanded={expandedItemId === item.id}
            pending={pendingItemId === item.id}
            onAdjust={(delta) => onAdjust(item, delta)}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
