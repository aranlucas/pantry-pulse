import { AlertCircle, KeyRound, LockKeyhole } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { BrandMark, Spinner } from "./chrome";

export function AccessGate({
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
