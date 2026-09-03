"use client";

import { Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCreateBooking, useSlots } from "@/hooks/booking";
import type { CreatedBooking } from "@/services/booking";
import { ApiError } from "@/lib/client";
import { addDaysISO, eventDayISO, formatEventDate, formatEventTime } from "@/lib/time";
import {
  Button,
  Field,
  Note,
  Panel,
  PortalShell,
  SuccessIcon,
  Waiting,
} from "@/components/portal/ui";

/* Two weeks at a time: enough to find a slot without asking the host's Google
   calendar for a month of free/busy on every page load. */
const WINDOW_DAYS = 14;

export default function BookHostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  /* useSearchParams suspends during prerender, so the page needs a boundary
     even though it renders dynamically today. */
  return (
    <Suspense fallback={<PortalShell eyebrow="Booking" title="Loading…"><Waiting message="Loading the booking page…" /></PortalShell>}>
      <BookHostForm slug={slug} />
    </Suspense>
  );
}

function BookHostForm({ slug }: { slug: string }) {
  /* The public calendar links straight to a time: /book/<slug>?slot=<ISO>.
     Honouring it means the visitor lands on the slot they clicked instead of
     hunting for it again — and if it has since been taken, it simply is not in
     `data`, so the page shows the day with nothing pre-selected rather than
     letting them submit a dead time. */
  const wanted = useSearchParams().get("slot");

  /* page straight to the window containing the requested slot */
  const [offset, setOffset] = useState(() => {
    if (!wanted) return 0;
    const day = eventDayISO(new Date(wanted));
    const today = eventDayISO(new Date());
    if (Number.isNaN(new Date(wanted).getTime()) || day < today) return 0;
    const diff = Math.round(
      (new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000
    );
    return Math.max(0, Math.floor(diff / WINDOW_DAYS));
  });
  const [chosen, setChosen] = useState<string | null>(wanted);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<CreatedBooking | null>(null);

  const from = useMemo(
    () => addDaysISO(eventDayISO(new Date()), offset * WINDOW_DAYS),
    [offset]
  );
  const to = useMemo(() => addDaysISO(from, WINDOW_DAYS - 1), [from]);

  const { data, isPending, error: loadError } = useSlots(slug, from, to);
  const create = useCreateBooking(slug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || create.isPending) return;
    setError("");
    try {
      const res = await create.mutateAsync({
        name,
        email,
        phone: phone || undefined,
        topic: topic || undefined,
        start: chosen,
      });
      setBooked(res.booking);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
      /* a 409 means the slot went while they were typing — drop the selection
         so they cannot resubmit the same dead time */
      if (err instanceof ApiError && err.status === 409) setChosen(null);
    }
  }

  if (booked) {
    return (
      <PortalShell eyebrow="Confirmed" title={`You're meeting ${booked.hostName}`}>
        <Panel>
          <div className="flex justify-center">
            <SuccessIcon />
          </div>
          <p className="mt-4 text-center text-cream">
            {formatEventDate(booked.start)}
            <br />
            <span className="text-orange">
              {formatEventTime(booked.start)} – {formatEventTime(booked.end)}
            </span>
            <br />
            <span className="text-xs text-cream-dim">Kigali time (UTC+2)</span>
          </p>

          {booked.meetLink && (
            <p className="mt-5 text-center">
              <a
                href={booked.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-bg"
              >
                Join the Google Meet
              </a>
            </p>
          )}

          <Note tone="info">
            We have emailed the details to {email}, including a link to cancel if
            something changes.
          </Note>
        </Panel>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      eyebrow="Book a conversation"
      title={data?.name ? `Time with ${data.name}` : "Pick a time"}
      wide
    >
      {isPending ? (
        <Waiting message="Checking their calendar…" />
      ) : loadError ? (
        <Panel>
          <Note tone="error">
            This booking page could not be found.{" "}
            <Link href="/book" className="text-orange underline">
              See who else is available
            </Link>
            .
          </Note>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Panel>
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-sm text-cream-dim">
                {formatEventDate(`${from}T12:00:00.000Z`, { month: "short", day: "numeric" })} –{" "}
                {formatEventDate(`${to}T12:00:00.000Z`, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setOffset((o) => Math.max(0, o - 1))}
                  disabled={offset === 0}
                >
                  Earlier
                </Button>
                <Button variant="ghost" onClick={() => setOffset((o) => o + 1)}>
                  Later
                </Button>
              </div>
            </div>

            {!data?.complete && (
              <Note tone="info">
                We could not fully check {data?.name}&apos;s calendar, so these times may not all
                be free. They will confirm by email.
              </Note>
            )}

            {(data?.days.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-cream-dim">
                No free times in this fortnight. Try the next one.
              </p>
            ) : (
              <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
                {data!.days.map((day) => (
                  <div key={day.day}>
                    <p className="label mb-2 text-xs font-semibold text-cream-dim">
                      {formatEventDate(`${day.day}T12:00:00.000Z`, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {day.slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setChosen(slot.start)}
                          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                            chosen === slot.start
                              ? "border-orange bg-orange text-bg"
                              : "border-line text-cream hover:border-orange hover:text-orange"
                          }`}
                        >
                          {formatEventTime(slot.start)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-cream-dim">
              All times are Kigali time (UTC+2). Each meeting is {data?.slotMinutes} minutes.
            </p>
          </Panel>

          <Panel>
            {!chosen ? (
              <p className="text-sm text-cream-dim">
                Pick a time on the left and we&apos;ll take a couple of details.
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <p className="text-sm text-cream">
                  <span className="text-cream-dim">You picked</span>
                  <br />
                  {formatEventDate(chosen, { weekday: "long", month: "long", day: "numeric" })}
                  <br />
                  <span className="text-orange">{formatEventTime(chosen)}</span>
                </p>

                <Field
                  label="Your name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Field
                  label="Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  label="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Field
                  label="What would you like to talk about?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />

                <Button type="submit" busy={create.isPending} className="w-full">
                  Confirm booking
                </Button>
                {error && <Note tone="error">{error}</Note>}
              </form>
            )}
          </Panel>
        </div>
      )}
    </PortalShell>
  );
}
