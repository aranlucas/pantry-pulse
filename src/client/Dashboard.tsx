import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { ActivitySection } from "./ActivitySection";
import { AppHeader, MobileBottomNav, Spinner } from "./chrome";
import { InventoryHeader, InventoryLedger } from "./Inventory";
import { ShoppingReceipt } from "./ShoppingReceipt";
import type { InventoryItem, PantrySnapshot, View } from "./types";

export function Dashboard({
  snapshot,
  activeView,
  expandedItemId,
  pendingItemId,
  refreshing,
  notice,
  error,
  onAdjust,
  onLink,
  onLock,
  onNavigate,
  onRetry,
  onToggle,
}: {
  snapshot: PantrySnapshot;
  activeView: View;
  expandedItemId: string | null;
  pendingItemId: string | null;
  refreshing: boolean;
  notice: string | null;
  error: string | null;
  onAdjust: (item: InventoryItem, delta: number) => void;
  onLink: () => void;
  onLock: () => void;
  onNavigate: (view: View) => void;
  onRetry: () => void;
  onToggle: (itemId: string) => void;
}): ReactNode {
  return (
    <div className="dashboard-shell">
      <AppHeader activeView={activeView} onLock={onLock} onNavigate={onNavigate} />
      <div className="dashboard-notices" aria-live="polite">
        {refreshing ? <Spinner label="Refreshing pantry" /> : null}
        {notice ? (
          <span className="notice-success">
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            {notice}
          </span>
        ) : null}
        {error ? (
          <span className="notice-error" role="alert">
            <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
            {error}
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </span>
        ) : null}
      </div>

      <main className="dashboard-main" id="main-content" data-active-view={activeView}>
        <section className="inventory-pane" id="pantry-view">
          <div className="inventory-block">
            <InventoryHeader onLink={onLink} />
            <InventoryLedger
              items={snapshot.items}
              expandedItemId={expandedItemId}
              pendingItemId={pendingItemId}
              onAdjust={onAdjust}
              onToggle={onToggle}
            />
          </div>
          <ActivitySection events={snapshot.recentActivity} />
        </section>
        <aside className="shopping-pane">
          <ShoppingReceipt items={snapshot.shoppingQueue} />
        </aside>
      </main>
      <MobileBottomNav activeView={activeView} onNavigate={onNavigate} />
    </div>
  );
}
