const TOKEN_STORAGE_KEY = "pantry-pulse-admin-token";

export function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(TOKEN_STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Private browsing can disable sessionStorage. The in-memory token still works.
  }
}

export function clearSessionToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The access gate remains usable when storage is unavailable.
  }
}
