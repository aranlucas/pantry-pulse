import { PackageOpen } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { AccessGate } from "./AccessGate";
import { adjustItem, fetchSnapshot, isAuthError, linkItem } from "./api";
import { Spinner } from "./chrome";
import { Dashboard } from "./Dashboard";
import { errorMessage } from "./format";
import { EMPTY_LINK_FORM, formFromItem, nullableInteger, type LinkFormState } from "./link-form";
import { LinkTagDrawer } from "./LinkTagDrawer";
import { scrollDashboardToView } from "./motion";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./session";
import type { InventoryItem, LinkItemInput, PantrySnapshot, View } from "./types";

type AuthState = "checking" | "locked" | "loading" | "ready";

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
      await adjustItem(token, item.id, delta);
      acceptSnapshot(await fetchSnapshot(token));
      setNotice(`${item.name} ${delta > 0 ? "restocked" : "used"}.`);
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
      snapshot?.items.find((item) => !item.rfidUid) ??
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
    if (!linkForm.rfidUid.trim()) {
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
        rfidUid: linkForm.rfidUid.trim(),
        name: linkForm.name.trim(),
        unit: linkForm.unit.trim(),
        onHand,
        target,
        catalogProvider: linkForm.catalogProvider.trim(),
        providerItemId: linkForm.providerItemId.trim(),
      };
      await linkItem(token, linkTargetId, input);
      acceptSnapshot(await fetchSnapshot(token));
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
    scrollDashboardToView(view);
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
