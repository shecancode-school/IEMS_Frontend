"use client";

import Link from "next/link";
import { useAdminAuth, useAuthHydrated } from "@/context/AuthContext";
import { useMe } from "@/hooks/admin/staff";
import { PortalShell, Panel, Button, Note, Waiting } from "@/components/portal/ui";
import Scanner from "@/components/portal/Scanner";

/* Gate check-in.

   Standalone scanner device accounts are gone: sign-in is Google-only, and
   scanning is a duty an administrator grants to a staff account. That means
   whoever is on the door signs in as themselves, every check-in is attributed
   to a real person in the audit log, and revoking gate access is a toggle
   rather than a shared password nobody can rotate. */
export default function GateScanPage() {
  const hydrated = useAuthHydrated();
  const { isAuthenticated, user } = useAdminAuth();
  const { data: me, isPending } = useMe(isAuthenticated);

  if (!hydrated || (isAuthenticated && isPending)) {
    return (
      <PortalShell eyebrow="Venue check-in" title="Gate">
        <Panel>
          <Waiting message="Loading…" />
        </Panel>
      </PortalShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PortalShell eyebrow="Venue check-in" title="Sign in to scan">
        <Panel>
          <p className="text-sm text-cream-dim">
            Sign in with your organization Google account. Ask an administrator to grant you scan
            access if you have not been given it yet.
          </p>
          <a href="/api/auth/google/start" className="mt-4 block">
            <Button type="button" className="w-full">
              Continue with Google
            </Button>
          </a>
        </Panel>
      </PortalShell>
    );
  }

  /* the server enforces this too — the page just explains it rather than
     letting someone scan and collect a wall of 401s */
  const canScan = me?.admin.canScan || me?.admin.role === "ADMIN" || me?.admin.role === "CEO";

  if (!canScan) {
    return (
      <PortalShell eyebrow="Venue check-in" title="No scan access">
        <Panel>
          <Note tone="error">
            Your account does not have gate access. An administrator can grant it under Staff.
          </Note>
          <Link href="/admin/calendar" className="mt-4 inline-block text-orange underline">
            Back to the console
          </Link>
        </Panel>
      </PortalShell>
    );
  }

  return (
    <PortalShell eyebrow="Venue check-in" title={`Scanning as ${user?.name ?? ""}`}>
      <div className="space-y-4">
        <Scanner role="admin" profile={{ name: user?.name, email: user?.email }} />
        <Link href="/admin/calendar" className="inline-block text-sm text-cream-dim underline">
          Back to the console
        </Link>
      </div>
    </PortalShell>
  );
}
