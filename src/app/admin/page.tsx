"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/client";
import { useAdminAuth } from "@/context/AuthContext";
import { PortalShell, Panel, Field, Button, Note } from "@/components/portal/ui";
import PasswordField from "@/components/portal/PasswordField";


export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  /* stays true from a successful sign-in through the redirect, so a second
     click can't fire another request while we're on our way out */
  const [leaving, setLeaving] = useState(false);
  const busy = login.isPending || leaving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      await login.mutateAsync({ email, password });
      setLeaving(true);
      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <PortalShell eyebrow="Staff only" title="Admin sign in">
      <Panel>
        <form onSubmit={submit} className="space-y-4">
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
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {error && <Note tone="error">{error}</Note>}
        </form>
      </Panel>
    </PortalShell>
  );
}
