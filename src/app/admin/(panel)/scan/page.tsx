"use client";

import { useAdminAuth } from "@/context/AuthContext";
import { PRIVILEGED_ROLES } from "@/types/admin";
import Scanner from "@/components/portal/Scanner";

export default function AdminScanPage() {
  const { user, canScan } = useAdminAuth();
  const allowed =
    canScan || (!!user?.role && (PRIVILEGED_ROLES as readonly string[]).includes(user.role));

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <div className="text-center">
          <h1 className="display text-3xl text-cream">Scan tickets</h1>
          <p className="mt-1 text-sm text-cream-dim">
            Gate scanning is a grant an administrator gives you — ask them to switch it on in the
            staff management page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="display text-3xl text-cream">Scan tickets</h1>
        <p className="mt-1 text-sm text-cream-dim">
          Point the camera at an attendee&apos;s QR code. Each ticket admits once — a second scan is
          flagged automatically.
        </p>
      </div>
      <Scanner role="admin" profile={{ name: user?.name, email: user?.email }} />
    </div>
  );
}
