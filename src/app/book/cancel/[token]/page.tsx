"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useCancelBookingByToken, useCancelView } from "@/hooks/booking";
import { formatEventDate, formatEventTime } from "@/lib/time";
import {
  Button,
  Note,
  Panel,
  PortalShell,
  SuccessIcon,
  Waiting,
} from "@/components/portal/ui";

export default function CancelBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, isPending, error } = useCancelView(token);
  const cancel = useCancelBookingByToken(token);
  const [done, setDone] = useState(false);

  if (isPending) {
    return (
      <PortalShell title="Your booking">
        <Waiting message="Looking up your booking…" />
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell title="Booking not found">
        <Panel>
          <Note tone="error">
            This cancellation link is not valid. It may have already been used, or the booking may
            have been removed.
          </Note>
          <p className="mt-4">
            <Link href="/book" className="text-orange underline">
              Book a new time
            </Link>
          </p>
        </Panel>
      </PortalShell>
    );
  }

  const alreadyCancelled = data.status === "CANCELLED";

  if (done || alreadyCancelled) {
    return (
      <PortalShell eyebrow="Cancelled" title="That's taken care of">
        <Panel>
          <div className="flex justify-center">
            <SuccessIcon />
          </div>
          <p className="mt-4 text-center text-cream-dim">
            Your meeting with {data.hostName} on {formatEventDate(data.start)} has been cancelled
            and the time is free again. We&apos;ve let them know.
          </p>
          <p className="mt-4 text-center">
            <Link href="/book" className="text-orange underline">
              Book another time
            </Link>
          </p>
        </Panel>
      </PortalShell>
    );
  }

  return (
    <PortalShell eyebrow="Cancel booking" title="Cancel this meeting?">
      <Panel>
        <p className="text-cream">
          <span className="text-cream-dim">With</span> {data.hostName}
          {data.hostTitle ? ` · ${data.hostTitle}` : ""}
          <br />
          {formatEventDate(data.start, { weekday: "long", month: "long", day: "numeric" })}
          <br />
          <span className="text-orange">
            {formatEventTime(data.start)} – {formatEventTime(data.end)}
          </span>
          <br />
          <span className="text-xs text-cream-dim">Kigali time (UTC+2)</span>
        </p>

        {data.topic && <p className="mt-3 text-sm text-cream-dim">&ldquo;{data.topic}&rdquo;</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            busy={cancel.isPending}
            onClick={async () => {
              await cancel.mutateAsync();
              setDone(true);
            }}
          >
            Yes, cancel it
          </Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            Keep the meeting
          </Button>
        </div>

        {cancel.isError && (
          <Note tone="error">We could not cancel it just now. Please try again.</Note>
        )}
      </Panel>
    </PortalShell>
  );
}
