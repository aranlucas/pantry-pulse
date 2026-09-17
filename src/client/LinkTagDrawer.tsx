import { AlertCircle, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { Spinner } from "./chrome";
import type { LinkFormState } from "./link-form";
import type { InventoryItem } from "./types";

export function LinkTagDrawer({
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
              name="rfidUid"
              value={form.rfidUid}
              onChange={(event) => onFormChange("rfidUid", event.target.value)}
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
