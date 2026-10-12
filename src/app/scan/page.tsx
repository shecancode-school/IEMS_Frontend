"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client";
import { useScannerAuth, useAuthHydrated } from "@/context/AuthContext";
import { PortalShell, Panel, Field, Button, Note, Waiting } from "@/components/portal/ui";
import PasswordField from "@/components/portal/PasswordField";
import Scanner from "@/components/portal/Scanner";

/* Entrance scanning for partner organizations: sign in with the access key
   given by the super admin, then scan tickets */
export default function OrgScanPage() {
  const hydrated = useAuthHydrated();
  const { isAuthenticated, user, login, logout } = useScannerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const busy = login.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      await login.mutateAsync({ email, password });
      /* success unmounts this form (isAuthenticated flips), so there's no
         second-submit window to guard beyond the pending state */
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  /* the scanner session comes from localStorage, so wait for hydration to
     avoid an SSR/client mismatch */
  if (!hydrated) {
    return (
      <PortalShell eyebrow="Venue check-in" title="Partner sign in">
        <Panel>
          <Waiting message="Loading…" />
        </Panel>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      eyebrow="Venue check-in"
      title={isAuthenticated ? `Scanning as ${user?.name ?? ""}` : "Scanner sign in"}
    >
      {isAuthenticated ? (
        <div className="space-y-4">
          <Scanner role="scanner" profile={{ name: user?.name, email: user?.email }} />
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      ) : (
        <Panel>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-cream-dim">
              Sign in with the scanner account provided by the event admin.
            </p>
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" busy={busy} className="w-full">
              {busy ? "Checking…" : "Start scanning"}
            </Button>
            {error && <Note tone="error">{error}</Note>}
          </form>
        </Panel>
      )}
    </PortalShell>
  );
}
