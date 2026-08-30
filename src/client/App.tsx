import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bean,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Coffee,
  Copy,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Minus,
  Milk,
  Package,
  PackageOpen,
  Plus,
  ScanLine,
  ShoppingCart,
  Soup,
  Tag,
  Wheat,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { adjustItem, fetchSnapshot, isAuthError, linkItem } from "./api";
import type {
  ActivityEvent,
  InventoryItem,
  LinkItemInput,
  PantrySnapshot,
  ShoppingItem,
  StationStatus,
  View,
} from "./types";

const TOKEN_STORAGE_KEY = "pantry-pulse-admin-token";

type AuthState = "checking" | "locked" | "loading" | "ready";

type LinkFormState = {
  tagUid: string;
  name: string;
  unit: string;
  onHand: string;
  target: string;
  catalogProvider: string;
  providerItemId: string;
};

const EMPTY_LINK_FORM: LinkFormState = {
  tagUid: "",
  name: "",
  unit: "",
  onHand: "",
  target: "",
  catalogProvider: "",
  providerItemId: "",
};

function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(TOKEN_STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Private browsing can disable sessionStorage. The in-memory token still works.
  }
}

function clearSessionToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The access gate remains usable when storage is unavailable.
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatQuantity(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function formatTagUid(tagUid: string | null): string {
  return tagUid ? tagUid.toUpperCase() : "No tag linked";
}

function isLowStock(item: InventoryItem): boolean {
  return item.target > 0 && item.onHand < item.target;
}

function progressFor(item: InventoryItem): number {
  if (item.target <= 0) return item.onHand > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (item.onHand / item.target) * 100));
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function activityWasConsumed(event: ActivityEvent): boolean {
  return /consume|decreas|remov|use|minus|rfid consume/i.test(event.kind);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formFromItem(item: InventoryItem | undefined): LinkFormState {
  if (!item) return EMPTY_LINK_FORM;
  return {
    tagUid: item.tagUid ?? "",
    name: item.name,
    unit: item.unit ?? "",
    onHand: String(item.onHand),
    target: String(item.target),
    catalogProvider: item.provider ?? "",
    providerItemId: item.providerItemId ?? "",
  };
}

function nullableInteger(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }
  return parsed;
}

function patchItemInSnapshot(
  current: PantrySnapshot | null,
  updated: InventoryItem,
): PantrySnapshot | null {
  if (!current) return current;
  const hasItem = current.items.some((item) => item.id === updated.id);
  return {
    ...current,
    items: hasItem
      ? current.items.map((item) => (item.id === updated.id ? updated : item))
      : [...current.items, updated],
  };
}

function BrandMark({ onHome }: { onHome?: () => void } = {}): ReactNode {
  return (
    <a
      className="brand-lockup"
      href="#pantry-view"
      aria-label="Pantry Pulse home"
      onClick={
        onHome
          ? (event) => {
              event.preventDefault();
              onHome();
            }
          : undefined
      }
    >
      <span className="brand-mark" aria-hidden="true">
        <PackageOpen size={28} strokeWidth={1.9} />
      </span>
      <span className="brand-name">Pantry Pulse</span>
    </a>
  );
}

function StationStatus({ station }: { station: StationStatus }): ReactNode {
  const state =
    station.online === true ? "online" : station.online === false ? "offline" : "unknown";
  const title =
    state === "online"
      ? "Station online"
      : state === "offline"
        ? "Station offline"
        : "Station status unavailable";

  return (
    <div className={`station-status is-${state}`}>
      <span className="station-indicator" aria-hidden="true" />
      <span className="station-copy">
        <strong>{title}</strong>
        <span>{station.detail || station.name}</span>
      </span>
      {state === "online" ? (
        <Wifi size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : state === "offline" ? (
        <WifiOff size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <CircleHelp size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }): ReactNode {
  return (
    <span className="spinner-label">
      <LoaderCircle className="spin" size={17} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

function AccessGate({
  token,
  error,
  loading,
  onTokenChange,
  onSubmit,
}: {
  token: string;
  error: string | null;
  loading: boolean;
  onTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <div className="access-shell">
      <header className="app-header access-header">
        <BrandMark />
        <StationStatus
          station={{ online: null, name: "Station", detail: "ESP32 · RFID Station" }}
        />
      </header>

      <main className="access-layout" id="main-content">
        <section className="access-copy" aria-labelledby="access-title">
          <p className="eyebrow">Private pantry station</p>
          <h1 id="access-title">Open your pantry</h1>
          <p className="access-intro">
            Enter the admin token to see what is in stock, what needs a restock, and the latest scan
            from the pantry station.
          </p>
          <form className="access-form" onSubmit={onSubmit}>
            <label htmlFor="access-token">Admin token</label>
            <div className="input-with-icon">
              <KeyRound size={18} strokeWidth={1.8} aria-hidden="true" />
              <input
                id="access-token"
                name="token"
                type="password"
                value={token}
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="Paste your token"
                autoComplete="current-password"
                spellCheck={false}
                required
                disabled={loading}
              />
            </div>
            <button className="primary-button access-submit" type="submit" disabled={loading}>
              {loading ? <Spinner label="Opening pantry" /> : "Open pantry"}
            </button>
            <p className="session-note">
              <LockKeyhole size={15} strokeWidth={1.8} aria-hidden="true" />
              Stored for this browser session only.
            </p>
            {error ? (
              <p className="form-error" role="alert">
                <AlertCircle size={17} strokeWidth={1.9} aria-hidden="true" />
                {error}
              </p>
            ) : null}
          </form>
        </section>
        <div className="access-rail" aria-hidden="true" />
      </main>
    </div>
  );
}

function AppHeader({
  activeView,
  station,
  onLock,
  onNavigate,
}: {
  activeView: View;
  station: StationStatus;
  onLock: () => void;
  onNavigate: (view: View) => void;
}): ReactNode {
  const links: Array<{ view: View; label: string }> = [
    { view: "pantry", label: "Pantry" },
    { view: "queue", label: "Shopping queue" },
    { view: "activity", label: "Activity" },
  ];

  return (
    <header className="app-header dashboard-header">
      <BrandMark onHome={() => onNavigate("pantry")} />
      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map(({ view, label }) => (
          <button
            className={activeView === view ? "nav-link is-active" : "nav-link"}
            key={view}
            type="button"
            aria-current={activeView === view ? "page" : undefined}
            onClick={() => onNavigate(view)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <StationStatus station={station} />
        <button
          className="icon-button header-lock"
          type="button"
          aria-label="Lock pantry dashboard"
          onClick={onLock}
        >
          <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="header-lock-label">Lock</span>
        </button>
      </div>
    </header>
  );
}

function InventoryHeader({ onLink }: { onLink: () => void }): ReactNode {
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

  return (
    <article className={`inventory-row ${low ? "is-low" : ""} ${expanded ? "is-expanded" : ""}`}>
      <button
        className="item-primary"
        type="button"
        aria-expanded={expanded}
        aria-controls={`item-controls-${item.id}`}
        onClick={onToggle}
      >
        <span className="item-icon" aria-hidden="true">
          <ItemIcon size={23} strokeWidth={1.7} />
        </span>
        <span className="item-name-group">
          <strong>{item.name}</strong>
          <span>{formatTagUid(item.tagUid)}</span>
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
        <strong>{formatNumber(item.onHand)}</strong>
        <span>/ {formatQuantity(item.target, item.unit)}</span>
      </div>

      <div className="adjust-cell" id={`item-controls-${item.id}`}>
        <button
          className="quantity-button"
          type="button"
          aria-label={`Remove one ${item.unit ?? "unit"} of ${item.name}`}
          title={`Remove one ${item.unit ?? "unit"}`}
          disabled={pending || item.onHand <= 0}
          onClick={() => onAdjust(-1)}
        >
          <Minus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <output
          className="quantity-output"
          aria-label={`${formatNumber(item.onHand)} ${item.unit ?? "units"} on hand`}
        >
          {pending ? (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          ) : (
            formatNumber(item.onHand)
          )}
        </output>
        <button
          className="quantity-button"
          type="button"
          aria-label={`Add one ${item.unit ?? "unit"} of ${item.name}`}
          title={`Add one ${item.unit ?? "unit"}`}
          disabled={pending}
          onClick={() => onAdjust(1)}
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function InventoryLedger({
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

function ShoppingReceipt({
  items,
  anchorId,
}: {
  items: ShoppingItem[];
  anchorId?: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyList = async (): Promise<void> => {
    const text = items.length
      ? items.map((item) => `- ${item.name}: ${formatQuantity(item.amount, item.unit)}`).join("\n")
      : "Pantry is fully stocked.";
    setCopyError(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopyError("Copy is unavailable in this browser.");
    }
  };

  return (
    <section className="receipt-section" aria-label="Shopping queue" id={anchorId}>
      <div className="receipt-heading">
        <div>
          <p className="eyebrow">Next shop</p>
          <h2>Shopping queue</h2>
        </div>
        <ShoppingCart size={25} strokeWidth={1.6} aria-hidden="true" />
      </div>
      <p className="receipt-intro">Only the items below need attention.</p>
      {items.length ? (
        <ul className="receipt-list">
          {items.map((item) => (
            <li className="receipt-line" key={item.id}>
              <span className="receipt-line-icon" aria-hidden="true">
                <Package size={17} strokeWidth={1.7} />
              </span>
              <span className="receipt-item-name">{item.name}</span>
              <span className="receipt-amount">{formatQuantity(item.amount, item.unit)}</span>
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

function ActivitySection({
  events,
  anchorId,
}: {
  events: ActivityEvent[];
  anchorId?: string;
}): ReactNode {
  return (
    <section className="activity-section" aria-label="Recent scans" id={anchorId}>
      <div className="activity-heading">
        <div>
          <p className="eyebrow">The paper trail</p>
          <h2>Recent scans</h2>
        </div>
        <ScanLine size={25} strokeWidth={1.6} aria-hidden="true" />
      </div>
      {events.length ? (
        <div className="activity-table" role="table" aria-label="Recent pantry scans">
          <div className="activity-table-head" role="row">
            <span role="columnheader">Event</span>
            <span role="columnheader">Item</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">When</span>
          </div>
          {events.map((event) => {
            const consumed = activityWasConsumed(event);
            return (
              <div className="activity-row" role="row" key={event.id}>
                <span
                  className={`activity-direction ${consumed ? "is-consumed" : "is-restocked"}`}
                  role="cell"
                >
                  {consumed ? (
                    <ArrowDown size={17} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span className="sr-only">{consumed ? "Consumed" : "Restocked"}</span>
                </span>
                <span className="activity-item" role="cell">
                  <strong>{event.itemName}</strong>
                  <small>{formatTagUid(event.tagUid)}</small>
                </span>
                <span className="activity-source" role="cell">
                  {event.source ?? "RFID Station (Pantry)"}
                </span>
                <time className="activity-time" role="cell" dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state activity-empty">
          <ScanLine size={28} strokeWidth={1.6} aria-hidden="true" />
          <p>Scans will appear here as the station records them.</p>
        </div>
      )}
    </section>
  );
}

function MobileBottomNav({
  activeView,
  onNavigate,
}: {
  activeView: View;
  onNavigate: (view: View) => void;
}): ReactNode {
  const links: Array<{ view: View; label: string; icon: typeof Package }> = [
    { view: "pantry", label: "Pantry", icon: PackageOpen },
    { view: "queue", label: "Queue", icon: ShoppingCart },
    { view: "activity", label: "Activity", icon: ScanLine },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {links.map(({ view, label, icon: Icon }) => (
        <button
          className={activeView === view ? "mobile-nav-link is-active" : "mobile-nav-link"}
          type="button"
          key={view}
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onNavigate(view)}
        >
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function LinkTagDrawer({
  open,
  items,
  targetItemId,
  form,
  busy,
  error,
  onClose,
  onFormChange,
  onTargetChange,
  onSubmit,
}: {
  open: boolean;
  items: InventoryItem[];
  targetItemId: string;
  form: LinkFormState;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onFormChange: (field: keyof LinkFormState, value: string) => void;
  onTargetChange: (itemId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const drawerRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("drawer-open");
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("drawer-open");
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="Close link drawer"
        onClick={onClose}
        disabled={busy}
      />
      <aside
        className="link-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-drawer-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Setup</p>
            <h2 id="link-drawer-title">Link a tag</h2>
          </div>
          <button
            className="icon-button drawer-close"
            type="button"
            aria-label="Close link drawer"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        <p className="drawer-intro">
          Connect an RFID tag to an item and keep its shopping details nearby.
        </p>
        <form className="link-form" onSubmit={onSubmit}>
          <div className="field-group">
            <label htmlFor="link-item">Pantry item</label>
            {items.length ? (
              <select
                id="link-item"
                value={targetItemId}
                onChange={(event) => onTargetChange(event.target.value)}
                disabled={busy}
                autoComplete="off"
              >
                {items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="field-hint">
                Add an item through the station API before linking its tag.
              </p>
            )}
          </div>
          <div className="field-group">
            <label htmlFor="tag-uid">Tag UID</label>
            <input
              ref={firstFieldRef}
              id="tag-uid"
              name="tagUid"
              value={form.tagUid}
              onChange={(event) => onFormChange("tagUid", event.target.value)}
              placeholder="04 A1 B2 C3 D4"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
            />
          </div>
          <div className="field-group">
            <label htmlFor="item-name">Item name</label>
            <input
              id="item-name"
              name="name"
              value={form.name}
              onChange={(event) => onFormChange("name", event.target.value)}
              placeholder="Oat milk"
              autoComplete="off"
              disabled={busy}
              required
            />
          </div>
          <div className="form-grid-two">
            <div className="field-group">
              <label htmlFor="item-unit">Unit</label>
              <input
                id="item-unit"
                name="unit"
                value={form.unit}
                onChange={(event) => onFormChange("unit", event.target.value)}
                placeholder="cartons"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="field-group">
              <label htmlFor="item-on-hand">On hand</label>
              <input
                id="item-on-hand"
                name="onHand"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.onHand}
                onChange={(event) => onFormChange("onHand", event.target.value)}
                placeholder="2"
                autoComplete="off"
                disabled={busy}
              />
            </div>
          </div>
          <div className="form-grid-two">
            <div className="field-group">
              <label htmlFor="item-target">Target</label>
              <input
                id="item-target"
                name="target"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.target}
                onChange={(event) => onFormChange("target", event.target.value)}
                placeholder="6"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="field-group">
              <label htmlFor="catalog-provider">Catalog provider</label>
              <input
                id="catalog-provider"
                name="catalogProvider"
                value={form.catalogProvider}
                onChange={(event) => onFormChange("catalogProvider", event.target.value)}
                placeholder="Optional"
                autoComplete="off"
                disabled={busy}
              />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="provider-item-id">Provider item ID</label>
            <input
              id="provider-item-id"
              name="providerItemId"
              value={form.providerItemId}
              onChange={(event) => onFormChange("providerItemId", event.target.value)}
              placeholder="Optional catalog reference"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              <AlertCircle size={17} strokeWidth={1.9} aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <div className="drawer-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={busy || !items.length}>
              {busy ? <Spinner label="Saving item" /> : "Save item"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Dashboard({
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
      <AppHeader
        activeView={activeView}
        station={snapshot.station}
        onLock={onLock}
        onNavigate={onNavigate}
      />
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

      <main className="desktop-dashboard" id="main-content">
        <section className="inventory-pane" id="pantry-view">
          <InventoryHeader onLink={onLink} />
          <InventoryLedger
            items={snapshot.items}
            expandedItemId={expandedItemId}
            pendingItemId={pendingItemId}
            onAdjust={onAdjust}
            onToggle={onToggle}
          />
          <ActivitySection events={snapshot.activity} anchorId="activity-view" />
        </section>
        <aside className="shopping-pane">
          <ShoppingReceipt items={snapshot.shoppingQueue} anchorId="queue-view" />
        </aside>
      </main>

      <main className="mobile-dashboard" id="mobile-main-content">
        {activeView === "pantry" ? (
          <section className="mobile-view" aria-label="Pantry view">
            <InventoryHeader onLink={onLink} />
            <InventoryLedger
              items={snapshot.items}
              expandedItemId={expandedItemId}
              pendingItemId={pendingItemId}
              onAdjust={onAdjust}
              onToggle={onToggle}
            />
          </section>
        ) : null}
        {activeView === "queue" ? (
          <section className="mobile-view mobile-queue-view" aria-label="Shopping queue view">
            <ShoppingReceipt items={snapshot.shoppingQueue} />
          </section>
        ) : null}
        {activeView === "activity" ? (
          <section className="mobile-view mobile-activity-view" aria-label="Activity view">
            <ActivitySection events={snapshot.activity} />
          </section>
        ) : null}
      </main>
      <MobileBottomNav activeView={activeView} onNavigate={onNavigate} />
    </div>
  );
}

export function App(): ReactNode {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PantrySnapshot | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>("pantry");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkForm, setLinkForm] = useState<LinkFormState>(EMPTY_LINK_FORM);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const acceptSnapshot = useCallback((next: PantrySnapshot): void => {
    setSnapshot(next);
    setExpandedItemId((current) => {
      if (current && next.items.some((item) => item.id === current)) return current;
      return next.items[0]?.id ?? null;
    });
  }, []);

  const lock = useCallback((): void => {
    clearSessionToken();
    setToken(null);
    setTokenInput("");
    setSnapshot(null);
    setAuthError(null);
    setError(null);
    setNotice(null);
    setDrawerOpen(false);
    setAuthState("locked");
  }, []);

  const handleAuthFailure = useCallback((failure: unknown): void => {
    clearSessionToken();
    setToken(null);
    setSnapshot(null);
    setAuthState("locked");
    setAuthError(errorMessage(failure, "That token did not unlock this pantry."));
  }, []);

  useEffect(() => {
    const savedToken = readSessionToken();
    if (!savedToken) {
      setAuthState("locked");
      return;
    }

    let cancelled = false;
    setToken(savedToken);
    void fetchSnapshot(savedToken)
      .then((next) => {
        if (cancelled) return;
        acceptSnapshot(next);
        setAuthState("ready");
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        handleAuthFailure(failure);
      });

    return () => {
      cancelled = true;
    };
  }, [acceptSnapshot, handleAuthFailure]);

  const submitToken = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) {
      setAuthError("Enter the admin token to continue.");
      return;
    }
    setAuthError(null);
    setAuthState("loading");
    try {
      const next = await fetchSnapshot(candidate);
      writeSessionToken(candidate);
      setToken(candidate);
      acceptSnapshot(next);
      setAuthState("ready");
    } catch (failure: unknown) {
      handleAuthFailure(failure);
    }
  };

  const refresh = async (): Promise<void> => {
    if (!token || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      acceptSnapshot(await fetchSnapshot(token));
    } catch (failure: unknown) {
      if (isAuthError(failure)) {
        handleAuthFailure(failure);
      } else {
        setError(errorMessage(failure, "Could not refresh the pantry."));
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdjust = async (item: InventoryItem, delta: number): Promise<void> => {
    if (!token || pendingItemId) return;
    setPendingItemId(item.id);
    setError(null);
    setNotice(null);
    try {
      const result = await adjustItem(token, item.id, delta);
      let followUpNotice: string | null = null;
      if (result.snapshot) {
        acceptSnapshot(result.snapshot);
      } else if (result.item) {
        setSnapshot((current) => patchItemInSnapshot(current, result.item!));
        try {
          acceptSnapshot(await fetchSnapshot(token));
        } catch (followUpFailure: unknown) {
          if (isAuthError(followUpFailure)) {
            handleAuthFailure(followUpFailure);
            return;
          }
          followUpNotice = `${item.name} updated. Refresh to sync the queue.`;
        }
      } else {
        acceptSnapshot(await fetchSnapshot(token));
      }
      setNotice(followUpNotice ?? `${item.name} ${delta > 0 ? "restocked" : "used"}.`);
    } catch (failure: unknown) {
      if (isAuthError(failure)) {
        handleAuthFailure(failure);
      } else {
        setError(errorMessage(failure, "The pantry count could not be updated."));
      }
    } finally {
      setPendingItemId(null);
    }
  };

  const openDrawer = (itemId?: string): void => {
    const selected =
      snapshot?.items.find((item) => item.id === itemId) ??
      snapshot?.items.find((item) => !item.tagUid) ??
      snapshot?.items[0];
    setLinkTargetId(selected?.id ?? "");
    setLinkForm(formFromItem(selected));
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const changeLinkTarget = (itemId: string): void => {
    const selected = snapshot?.items.find((item) => item.id === itemId);
    setLinkTargetId(itemId);
    setLinkForm(formFromItem(selected));
    setDrawerError(null);
  };

  const submitLink = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) return;
    if (!linkTargetId) {
      setDrawerError("Choose a pantry item before linking a tag.");
      return;
    }
    if (!linkForm.tagUid.trim()) {
      setDrawerError("Enter the RFID tag UID.");
      return;
    }
    let onHand: number | null;
    let target: number | null;
    try {
      onHand = nullableInteger(linkForm.onHand, "On hand");
      target = nullableInteger(linkForm.target, "Target");
    } catch (failure: unknown) {
      setDrawerError(errorMessage(failure, "Check the item quantities."));
      return;
    }
    setDrawerBusy(true);
    setDrawerError(null);
    setError(null);
    try {
      const input: LinkItemInput = {
        tagUid: linkForm.tagUid.trim(),
        name: linkForm.name.trim(),
        unit: linkForm.unit.trim(),
        onHand,
        target,
        catalogProvider: linkForm.catalogProvider.trim(),
        providerItemId: linkForm.providerItemId.trim(),
      };
      const result = await linkItem(token, linkTargetId, input);
      if (result.snapshot) {
        acceptSnapshot(result.snapshot);
      } else if (result.item) {
        setSnapshot((current) => patchItemInSnapshot(current, result.item!));
        try {
          acceptSnapshot(await fetchSnapshot(token));
        } catch (followUpFailure: unknown) {
          if (isAuthError(followUpFailure)) {
            handleAuthFailure(followUpFailure);
            return;
          }
          // The item response is still authoritative for the linked row.
        }
      } else {
        acceptSnapshot(await fetchSnapshot(token));
      }
      setDrawerOpen(false);
      setNotice(`${linkForm.name || "Item"} linked to the pantry station.`);
    } catch (failure: unknown) {
      if (isAuthError(failure)) {
        handleAuthFailure(failure);
        setDrawerOpen(false);
      } else {
        setDrawerError(errorMessage(failure, "The tag could not be linked."));
      }
    } finally {
      setDrawerBusy(false);
    }
  };

  const navigate = (view: View): void => {
    setActiveView(view);
    if (window.matchMedia("(min-width: 821px)").matches) {
      document
        .getElementById(`${view}-view`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const updateLinkField = (field: keyof LinkFormState, value: string): void => {
    setLinkForm((current) => ({ ...current, [field]: value }));
  };

  if (authState === "checking" || authState === "loading") {
    return (
      <div className="loading-shell" role="status" aria-live="polite">
        <PackageOpen size={32} strokeWidth={1.7} aria-hidden="true" />
        <Spinner label={authState === "loading" ? "Opening pantry" : "Checking session"} />
      </div>
    );
  }

  if (authState !== "ready" || !snapshot || !token) {
    return (
      <AccessGate
        token={tokenInput}
        error={authError}
        loading={false}
        onTokenChange={setTokenInput}
        onSubmit={(event) => void submitToken(event)}
      />
    );
  }

  return (
    <>
      <Dashboard
        snapshot={snapshot}
        activeView={activeView}
        expandedItemId={expandedItemId}
        pendingItemId={pendingItemId}
        refreshing={refreshing}
        notice={notice}
        error={error}
        onAdjust={(item, delta) => void handleAdjust(item, delta)}
        onLink={() => openDrawer()}
        onLock={lock}
        onNavigate={navigate}
        onRetry={() => void refresh()}
        onToggle={(itemId) => setExpandedItemId((current) => (current === itemId ? null : itemId))}
      />
      <LinkTagDrawer
        open={drawerOpen}
        items={snapshot.items}
        targetItemId={linkTargetId}
        form={linkForm}
        busy={drawerBusy}
        error={drawerError}
        onClose={closeDrawer}
        onFormChange={updateLinkField}
        onTargetChange={changeLinkTarget}
        onSubmit={(event) => void submitLink(event)}
      />
    </>
  );
}
