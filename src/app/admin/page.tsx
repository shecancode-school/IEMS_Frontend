"use client";

import { useAdminAuth } from "@/context/AuthContext";
import { PortalShell, Panel, Button, Note } from "@/components/portal/ui";

export default function AdminLoginPage() {
  const { isAuthenticated } = useAdminAuth();

  return (
    <PortalShell eyebrow="Staff only" title="Admin sign in">
      <Panel>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign in with your organization Google account to open the staff console.
          </p>
          <a href="/api/auth/google/start" className="block w-full">
            <Button type="button" className="w-full">
              Continue with Google
            </Button>
          </a>
          {isAuthenticated && (
            <Note tone="info">You&apos;re already signed in — redirecting…</Note>
          )}
        </div>
      </Panel>
    </PortalShell>
  );
}
