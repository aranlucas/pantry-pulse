import { PackageOpen } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AccessGate } from "./access-gate";
import { adjustItem, confirmCount, fetchSnapshot, isAuthError, linkItem } from "./api";
import { Spinner } from "./chrome";
import { Dashboard } from "./dashboard";
import { errorMessage } from "./format";
import {
  EMPTY_LINK_FORM,
  formFromItem,
  nullableInteger,
  quantityCorrection,
  type LinkFormState,
} from "./link-form";
import { LinkTagDrawer } from "./link-tag-drawer";
import { scrollDashboardToView } from "./motion";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./session";
import type { InventoryItem, LinkItemInput, PantrySnapshot, ShoppingItem, View } from "./types";

type AuthState = "checking" | "locked" | "loading" | "ready";

export function App(): ReactNode {
  const session = useRef(0);
  const snapshotRequest = useRef(0);
  const [restoredToken] = useState(readSessionToken);

  const [authState, setAuthState] = useState<AuthState>(
    restoredToken === null ? "locked" : "checking",
  );

  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(restoredToken);
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
  const [linkOriginalQuantity, setLinkOriginalQuantity] = useState<number | null>(null);
  const [linkForm, setLinkForm] = useState<LinkFormState>(EMPTY_LINK_FORM);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const acceptSnapshot = useCallback((next: PantrySnapshot): void => {
    setSnapshot(next);
    setExpandedItemId((current) => {
      if (current && next.items.some((item) => item.id === current)) {
        return current;
      }

      return next.items[0]?.id ?? null;
    });
  }, []);

  const lock = useCallback((): void => {
    session.current += 1;
    setPendingItemId(null);
    setRefreshing(false);
    setDrawerBusy(false);
    setDrawerOpen(false);
    clearSessionToken();
    setToken(null);
    setTokenInput("");
    setSnapshot(null);
    setAuthError(null);
    setError(null);
    setNotice(null);
    setAuthState("locked");
  }, []);

  const handleAuthFailure = useCallback((cause: unknown): void => {
    session.current += 1;
    setPendingItemId(null);
    setRefreshing(false);
    setDrawerBusy(false);
    setDrawerOpen(false);
    clearSessionToken();
    setToken(null);
    setSnapshot(null);
    setAuthState("locked");
    setAuthError(errorMessage(cause, "That token did not unlock this pantry."));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const generation = session.current;

    const restore = async (savedToken: string): Promise<void> => {
      const next = await fetchSnapshot(savedToken);

      if (!controller.signal.aborted && generation === session.current) {
        acceptSnapshot(next);
        setAuthState("ready");
      }
    };

    if (restoredToken !== null) {
      restore(restoredToken).catch((cause: unknown) => {
        if (!controller.signal.aborted && generation === session.current) {
          handleAuthFailure(cause);
        }
      });
    }

    return () => {
      controller.abort();
    };
  }, [acceptSnapshot, handleAuthFailure, restoredToken]);

  const submitToken = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const candidate = tokenInput.trim();

    if (!candidate) {
      setAuthError("Enter the admin token to continue.");

      return;
    }

    const generation = ++session.current;
    setAuthError(null);
    setAuthState("loading");

    try {
      const next = await fetchSnapshot(candidate);

      if (generation !== session.current) {
        return;
      }

      writeSessionToken(candidate);
      setToken(candidate);
      acceptSnapshot(next);
      setAuthState("ready");
    } catch (cause: unknown) {
      if (generation !== session.current) {
        return;
      }

      handleAuthFailure(cause);
    }
  };

  const refresh = async (): Promise<void> => {
    if (!token || refreshing) {
      return;
    }

    const generation = session.current;
    setRefreshing(true);
    setError(null);
    const request = ++snapshotRequest.current;

    try {
      const next = await fetchSnapshot(token);

      if (generation !== session.current || request !== snapshotRequest.current) {
        return;
      }

      if (request === snapshotRequest.current) {
        acceptSnapshot(next);
      }
    } catch (cause: unknown) {
      if (generation !== session.current || request !== snapshotRequest.current) {
        return;
      }

      if (isAuthError(cause)) {
        handleAuthFailure(cause);
      } else {
        setError(errorMessage(cause, "Could not refresh the pantry."));
      }
    } finally {
      if (generation === session.current) {
        setRefreshing(false);
      }
    }
  };

  const handleAdjust = async (item: InventoryItem, delta: number): Promise<void> => {
    if (!token || pendingItemId) {
      return;
    }

    const generation = session.current;
    let committed = false;
    snapshotRequest.current += 1;
    setPendingItemId(item.id);
    setError(null);
    setNotice(null);

    try {
      await adjustItem(token, item.id, delta);

      if (generation !== session.current) {
        return;
      }

      committed = true;
      setNotice(`${item.name} ${delta > 0 ? "restocked" : "used"}.`);
      const request = ++snapshotRequest.current;
      const next = await fetchSnapshot(token);

      if (generation !== session.current) {
        return;
      }

      if (request === snapshotRequest.current) {
        acceptSnapshot(next);
      }
    } catch (cause: unknown) {
      if (generation !== session.current) {
        return;
      }

      if (isAuthError(cause)) {
        handleAuthFailure(cause);
      } else {
        setError(
          committed
            ? "The count was saved, but the pantry could not refresh. Try again to refresh."
            : errorMessage(cause, "The pantry count could not be updated."),
        );
      }
    } finally {
      if (generation === session.current) {
        setPendingItemId(null);
      }
    }
  };

  const handleConfirmCount = async (item: ShoppingItem): Promise<void> => {
    if (!token || pendingItemId) {
      return;
    }

    const generation = session.current;
    let committed = false;
    snapshotRequest.current += 1;
    setPendingItemId(item.itemId);
    setError(null);
    setNotice(null);

    try {
      await confirmCount(token, item.itemId, item.quantity);

      if (generation !== session.current) {
        return;
      }

      committed = true;
      setNotice(`${item.name} count confirmed.`);
      const request = ++snapshotRequest.current;
      const next = await fetchSnapshot(token);

      if (generation !== session.current) {
        return;
      }

      if (request === snapshotRequest.current) {
        acceptSnapshot(next);
      }
    } catch (cause: unknown) {
      if (generation !== session.current) {
        return;
      }

      if (isAuthError(cause)) {
        handleAuthFailure(cause);
      } else {
        setError(
          committed
            ? "The count was confirmed, but the pantry could not refresh. Try again to refresh."
            : errorMessage(cause, "The count could not be confirmed."),
        );
      }
    } finally {
      if (generation === session.current) {
        setPendingItemId(null);
      }
    }
  };

  const openDrawer = (itemId?: string): void => {
    const selected =
      snapshot?.items.find((item) => item.id === itemId) ??
      snapshot?.items.find((item) => !item.rfidUid) ??
      snapshot?.items[0];

    setLinkTargetId(selected?.id ?? "");
    setLinkForm(formFromItem(selected));
    setLinkOriginalQuantity(selected?.quantity ?? null);
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const changeLinkTarget = (itemId: string): void => {
    const selected = snapshot?.items.find((item) => item.id === itemId);
    setLinkTargetId(itemId);
    setLinkForm(formFromItem(selected));
    setLinkOriginalQuantity(selected?.quantity ?? null);
    setDrawerError(null);
  };

  const submitLink = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!token) {
      return;
    }

    if (!linkTargetId) {
      setDrawerError("Choose a pantry item before linking a tag.");

      return;
    }

    if (!linkForm.rfidUid.trim()) {
      setDrawerError("Enter the RFID tag UID.");

      return;
    }

    let correction: Pick<LinkItemInput, "onHand" | "expectedQuantity">;
    let target: number | null;

    try {
      correction = quantityCorrection(linkForm.onHand, linkOriginalQuantity);
      target = nullableInteger(linkForm.target, "Target");
    } catch (cause: unknown) {
      setDrawerError(errorMessage(cause, "Check the item quantities."));

      return;
    }

    const generation = session.current;
    let committed = false;
    snapshotRequest.current += 1;
    setDrawerBusy(true);
    setDrawerError(null);
    setError(null);

    try {
      const input: LinkItemInput = {
        rfidUid: linkForm.rfidUid.trim(),
        name: linkForm.name.trim(),
        unit: linkForm.unit.trim(),
        ...correction,
        target,
        catalogProvider: linkForm.catalogProvider.trim(),
        providerItemId: linkForm.providerItemId.trim(),
      };

      await linkItem(token, linkTargetId, input);

      if (generation !== session.current) {
        return;
      }

      committed = true;
      setDrawerOpen(false);
      setNotice(`${linkForm.name || "Item"} linked to the pantry station.`);
      const request = ++snapshotRequest.current;
      const next = await fetchSnapshot(token);

      if (generation !== session.current) {
        return;
      }

      if (request === snapshotRequest.current) {
        acceptSnapshot(next);
      }
    } catch (cause: unknown) {
      if (generation !== session.current) {
        return;
      }

      if (isAuthError(cause)) {
        handleAuthFailure(cause);
        setDrawerOpen(false);
      } else if (committed) {
        setError("The link was saved, but the pantry could not refresh. Try again to refresh.");
      } else {
        setDrawerError(errorMessage(cause, "The tag could not be linked."));
      }
    } finally {
      if (generation === session.current) {
        setDrawerBusy(false);
      }
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
        onConfirmCount={(item) => void handleConfirmCount(item)}
        onLink={() => openDrawer()}
        onLock={lock}
        onNavigate={navigate}
        onRetry={() => void refresh()}
        onToggle={(itemId) => setExpandedItemId((current) => (current === itemId ? null : itemId))}
      />
      {drawerOpen ? (
        <LinkTagDrawer
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
      ) : null}
    </>
  );
}
