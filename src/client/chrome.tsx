import { LoaderCircle, LogOut, Package, PackageOpen, ScanLine, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";

import type { View } from "./types";

export function BrandMark({ onHome }: { onHome?: () => void } = {}): ReactNode {
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

export function Spinner({ label }: { label: string }): ReactNode {
  return (
    <span className="spinner-label">
      <LoaderCircle className="spin" size={17} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

export function AppHeader({
  activeView,
  onLock,
  onNavigate,
}: {
  activeView: View;
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

export function MobileBottomNav({
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
