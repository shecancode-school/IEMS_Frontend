"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { formatEventDateTime } from "@/lib/time";
import { Panel, Button, SkeletonBar } from "@/components/portal/ui";

/* The meetings this person has booked with our staff, inside the portal.

   Booking used to live entirely outside the signed-in experience: you booked
   on a public page and the confirmation email was the only record you ever
   had of it. Someone who is already signed in to see their ticket should not
   have to dig through their inbox to remember when they are meeting us — and
   should be able to book another without leaving.

   Cancelling deliberately stays on the emailed link. That token is the same
   door whether or not you have an account, and a second cancel path running
   off the session would be a second implementation to keep in step. */

type Meeting = {
  id: string;
  hostName: string;
  hostTitle: string | null;
  start: string;
  end: string;
  topic: string;
  status: string;
  meetLink: string | null;
};

export default function MeetingsCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me", "bookings"],
    queryFn: () => api<{ bookings: Meeting[] }>("/api/me/bookings", { role: "participant" }),
    staleTime: 30_000,
  });

  /* the endpoint returns upcoming meetings only — see the note there on why
     the clock is read on the server and not in render */
  const upcoming = data?.bookings ?? [];

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="display text-xl text-cream">Your meetings</h2>
          <p className="mt-1 text-sm text-cream-dim">
            One-to-one time you have booked with the team.
          </p>
        </div>
        <Link href="/book">
          <Button>Book a conversation</Button>
        </Link>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-3" role="status" aria-label="Loading your meetings">
            <SkeletonBar className="h-4 w-2/3" />
            <SkeletonBar className="h-3 w-1/2" />
          </div>
        ) : isError ? (
          <p className="text-sm text-cream-dim">
            We couldn&apos;t load your meetings just now. Your confirmation emails have the
            details.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-cream-dim">
            Nothing booked yet. Pick someone on the booking page to see when they are free —
            you will get a confirmation email with a link to add it to your calendar.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-line bg-panel-2/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-cream">{b.hostName}</p>
                    {b.hostTitle && (
                      <p className="label text-[11px] font-semibold text-orange">{b.hostTitle}</p>
                    )}
                    <p className="mt-1 text-sm text-cream-dim">
                      {formatEventDateTime(b.start, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    {b.topic && (
                      <p className="mt-1 text-sm text-cream-dim/85">{b.topic}</p>
                    )}
                  </div>
                  {/* the joining link is theirs — they are on the call */}
                  {b.meetLink && (
                    <a
                      href={b.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full bg-orange px-4 py-2 text-xs font-semibold text-bg transition-colors hover:bg-orange-deep"
                    >
                      Join the meeting
                    </a>
                  )}
                </div>
                <p className="mt-2 text-xs text-cream-dim">
                  Need to cancel? Use the link in your confirmation email so the slot goes back
                  to someone else.
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
