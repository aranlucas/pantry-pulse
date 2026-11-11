import { Check, CircleCheck, Copy, Package, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { formatChange, formatDate, formatNumber, formatQuantity } from "./format";
import type { ShoppingItem } from "./types";

type ShoppingReceiptProps = {
  items: ShoppingItem[];
  pendingItemId: string | null;
  onConfirmCount: (item: ShoppingItem) => void;
};

function countLabel(item: ShoppingItem): string {
  if (item.countStatus === "counted" && item.countedAt) {
    return `Counted ${formatDate(item.countedAt)}`;
  }

  return item.countedAt
    ? `Count needs a check · last counted ${formatDate(item.countedAt)}`
    : "Count needs a check · never counted";
}

export function ShoppingReceipt({
  items,
  pendingItemId,
  onConfirmCount,
}: ShoppingReceiptProps): ReactNode {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyList = async (): Promise<void> => {
    const text = items.length
      ? items
          .map((item) => `- ${item.name}: ${formatQuantity(item.quantityNeeded, item.unit)}`)
          .join("\n")
      : "Pantry is fully stocked.";

    setCopyError(null);

    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopyError("Copy is unavailable in this browser.");
    }
  };

  return (
    <section className="receipt-section" aria-label="Shopping queue" id="queue-view">
      <div className="receipt-heading">
        <div>
          <p className="eyebrow">Next shop</p>
          <h2>Shopping queue</h2>
        </div>
        <ShoppingCart size={25} strokeWidth={1.6} aria-hidden="true" />
      </div>
      <p className="receipt-intro">
        Only the items below need attention. Confirm a count when the shelf matches.
      </p>
      {items.length ? (
        <ul className="receipt-list">
          {items.map((item) => (
            <li className="receipt-line" key={item.itemId}>
              <span className="receipt-line-icon" aria-hidden="true">
                <Package size={17} strokeWidth={1.7} />
              </span>
              <span className="receipt-item-name">{item.name}</span>
              <span className="receipt-amount">
                {formatQuantity(item.quantityNeeded, item.unit)}
              </span>
              <div className="receipt-details">
                <p className="receipt-why">
                  Have {formatNumber(item.quantity)} of{" "}
                  {formatQuantity(item.targetQuantity, item.unit)}
                </p>
                <p>
                  {item.lastChange
                    ? `${formatChange(item.lastChange, item.unit)} · ${formatDate(item.lastChange.createdAt)}`
                    : "No recent changes"}
                </p>
                <p
                  className={
                    item.countStatus === "counted" ? "receipt-count" : "receipt-count needs-check"
                  }
                >
                  {countLabel(item)}
                </p>
                <button
                  className="receipt-confirm-button"
                  type="button"
                  disabled={pendingItemId !== null}
                  aria-label={`Confirm ${item.name} count of ${formatQuantity(item.quantity, item.unit)}`}
                  onClick={() => onConfirmCount(item)}
                >
                  Count is right
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state receipt-empty">
          <CircleCheck size={27} strokeWidth={1.6} aria-hidden="true" />
          <p>Nothing to restock right now.</p>
        </div>
      )}
      <div className="receipt-total" aria-live="polite">
        <span>
          {items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "All clear"}
        </span>
        <span>{items.length ? "Bring this list along" : "Pantry is on target"}</span>
      </div>
      <button className="receipt-copy-button" type="button" onClick={() => void copyList()}>
        {copied ? (
          <Check size={17} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Copy size={17} strokeWidth={1.8} aria-hidden="true" />
        )}
        {copied ? "List copied" : "Copy list"}
      </button>
      {copyError ? (
        <p className="small-error" role="status">
          {copyError}
        </p>
      ) : null}
    </section>
  );
}
