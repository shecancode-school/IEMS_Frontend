"use client";

import Link from "next/link";
import { useBookingHosts } from "@/hooks/booking";
import { ROLE_LABELS, type AdminRole } from "@/types/admin";
import { PortalShell, Panel, Waiting, Note } from "@/components/portal/ui";

/* The front door of the booking flow: who at IRO you can book time with. */
export default function BookIndexPage() {
  const { data, isPending, error } = useBookingHosts();

  return (
    <PortalShell eyebrow="Book a conversation" title="Who would you like to meet?" wide>
      {isPending ? (
        <Waiting message="Finding available people…" />
      ) : error ? (
        <Panel>
          <Note tone="error">We could not load the list just now. Please try again shortly.</Note>
        </Panel>
      ) : (data ?? []).length === 0 ? (
        <Panel>
          <p className="text-cream-dim">
            Nobody is taking bookings at the moment. Please check back later, or email{" "}
            <a href="mailto:support@igirerwanda.org" className="text-orange underline">
              support@igirerwanda.org
            </a>
            .
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data!.map((host) => (
            <Link
              key={host.slug}
              href={`/book/${host.slug}`}
              className="rounded-xl border border-line bg-panel p-5 text-left transition-colors hover:border-orange"
            >
              <p className="display text-lg text-cream">{host.name}</p>
              <p className="label mt-0.5 text-xs font-semibold text-orange">
                {host.title || ROLE_LABELS[host.role as AdminRole] || host.role}
              </p>
              {host.bio && <p className="mt-2 text-sm text-cream-dim">{host.bio}</p>}
              <p className="mt-3 text-xs text-cream-dim">
                {host.slotMinutes} minutes
                {host.online ? " · online, with a Google Meet link" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
