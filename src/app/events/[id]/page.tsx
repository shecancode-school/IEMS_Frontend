"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, CalendarPlus, MapPin, Clock, ArrowLeft, ArrowRight } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { useEvents } from "@/lib/useEvents";
import { itemColor, itemCategoryLabel, todayIso, type VenueEvent } from "@/lib/events";
import { RichText } from "@/components/RichText";

/* live Days : Hrs : Min : Sec board, ticking every second */
function Countdown({ event }: { event: VenueEvent }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt
    ? new Date(event.endsAt).getTime()
    : new Date(event.startsAt).setHours(23, 59, 59, 999);

  if (now > end) {
    return (
      <div className="rounded-2xl border border-line bg-panel/70 p-6 text-center backdrop-blur-sm">
        <p className="label text-sm font-semibold text-cream-dim">
          This event has ended
        </p>
      </div>
    );
  }

  const live = now >= start;
  const diff = Math.max(0, start - now);
  const days = Math.floor(diff / 86_400_000);
  const hrs = Math.floor((diff % 86_400_000) / 3_600_000);
  const min = Math.floor((diff % 3_600_000) / 60_000);
  const sec = Math.floor((diff % 60_000) / 1000);

  const cell = (v: number, label: string) => (
    <div className="flex flex-col items-center">
      <span className="display text-4xl leading-none text-cream sm:text-5xl">
        {String(v).padStart(2, "0")}
      </span>
      <span className="mt-1.5 text-[10px] uppercase tracking-widest text-cream-dim">
        {label}
      </span>
    </div>
  );
  const colon = <span className="display pb-5 text-3xl text-line">:</span>;

  return (
    <div className="rounded-2xl border border-line bg-panel/70 p-6 backdrop-blur-sm">
      <p className="mb-4 flex items-center justify-center gap-2 text-center">
        <span className="relative flex h-2 w-2">
          <span className="absolute h-full w-full animate-ping rounded-full bg-orange opacity-70" />
          <span className="h-2 w-2 rounded-full bg-orange" />
        </span>
        <span className="label text-xs font-semibold uppercase tracking-widest text-orange">
          {live ? "Happening now" : "Starts in"}
        </span>
      </p>
      {live ? (
        <p className="display text-center text-3xl uppercase text-green">
          Live now
        </p>
      ) : (
        <div className="flex items-start justify-center gap-3 sm:gap-4">
          {cell(days, "Days")}
          {colon}
          {cell(hrs, "Hrs")}
          {colon}
          {cell(min, "Min")}
          {colon}
          {cell(sec, "Sec")}
        </div>
      )}
    </div>
  );
}

function EventDetail({ event }: { event: VenueEvent }) {
  const isToday = event.date === todayIso();
  const dateObj = new Date(`${event.date}T00:00:00`);
  const accent = itemColor(event);

  return (
    <main className="relative flex-1 overflow-hidden bg-bg">
      {/* the event's own image crowns the page, then melts through a
          milk-and-green wash back into the green as you scroll down */}
      {event.posterUrl && (
        <>
          <img
            src={event.posterUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[75vh] w-full object-cover object-top opacity-45"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[75vh]"
            style={{
              background:
                "linear-gradient(to bottom, rgba(11,40,24,0.15) 0%, rgba(244,239,222,0.12) 32%, rgba(30,92,56,0.5) 64%, var(--bg) 96%)",
            }}
          />
        </>
      )}

      <div className="relative mx-auto max-w-6xl px-5 py-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-cream-dim transition-colors hover:text-orange"
        >
          <ArrowLeft className="size-4" />
          Back to events
        </Link>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_1fr] lg:gap-12">
          {/* ── left: poster + organiser ── */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-3xl border border-line bg-panel/70 shadow-2xl shadow-black/40 backdrop-blur-sm">
              {event.posterUrl ? (
                <img
                  src={event.posterUrl}
                  alt={`${event.title} poster`}
                  className="aspect-4/5 w-full object-cover"
                />
              ) : (
                <div className="flex aspect-4/5 w-full flex-col items-center justify-center gap-4 bg-linear-to-br from-green-deep via-panel-2 to-bg p-8 text-center">
                  <CalendarDays className="size-16 text-orange/70" />
                  <p className="display text-4xl uppercase leading-tight text-cream">
                    {event.title}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel/70 p-4 backdrop-blur-sm">
              <span className="flex items-center gap-2.5">
                <Image
                  src="/iro-logo.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full bg-bg p-1"
                />
                <span>
                  <span className="label block text-[10px] font-semibold text-cream-dim">
                    Organiser
                  </span>
                  <span className="block text-sm font-semibold text-cream">
                    {event.organiser || "Igire Rwanda"}
                  </span>
                </span>
              </span>
              <span
                className="label rounded-full px-3 py-1.5 text-[11px] font-bold text-bg"
                style={{ backgroundColor: accent }}
              >
                {itemCategoryLabel(event)}
              </span>
            </div>
          </div>

          {/* ── right: countdown, identity, description ── */}
          <div className="space-y-6">
            <Countdown event={event} />

            <div>
              <span
                className="label text-xs font-semibold"
                style={{ color: accent }}
              >
                {event.type || itemCategoryLabel(event)}
              </span>
              <h1 className="display mt-2 text-4xl uppercase leading-none text-cream sm:text-5xl">
                {event.title}
              </h1>
            </div>

            {/* date + venue */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/70 p-4 backdrop-blur-sm">
                <span className="flex h-11 w-11 shrink-0 flex-col overflow-hidden rounded-lg border border-line">
                  <span className="label bg-orange text-center text-[9px] font-bold leading-4 text-bg">
                    {dateObj
                      .toLocaleDateString("en-US", { month: "short" })
                      .toUpperCase()}
                  </span>
                  <span className="flex flex-1 items-center justify-center bg-panel-2 text-base font-bold text-cream">
                    {dateObj.getDate()}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-cream">
                    {isToday
                      ? "Today"
                      : dateObj.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-cream-dim">
                    <Clock className="size-3" />
                    {event.time}
                    {event.endTime && ` – ${event.endTime}`}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/70 p-4 backdrop-blur-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-panel-2">
                  <MapPin className="size-5 text-orange" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-cream">
                    {event.space || "Venue to be announced"}
                  </span>
                  <span className="text-xs text-cream-dim">Location</span>
                </span>
              </div>
            </div>

            {/* the full description — the only content the view page carries */}
            <div className="rounded-2xl border border-line bg-panel/70 p-6 backdrop-blur-sm">
              <h2 className="label text-xs font-semibold uppercase tracking-widest text-orange">
                About this event
              </h2>
              {event.description ? (
                <RichText
                  html={event.description}
                  className="mt-3 text-sm leading-relaxed text-cream-dim"
                />
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-cream-dim">
                  Details for this event are coming soon.
                </p>
              )}
            </div>

            {/* terms are already accepted — move on to get the ticket */}
            <Link
              href={`/verify?event=${encodeURIComponent(event.id)}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-6 py-3.5 text-sm font-semibold text-bg transition-colors hover:bg-orange-deep"
            >
              Continue to get your ticket
              <ArrowRight className="size-4" />
            </Link>

            {/* a plain link, not a fetch-and-download: the response is served
                with a content-disposition header, so the browser handles it */}
            <a
              href={`/api/events/${encodeURIComponent(event.id)}/ics`}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-6 py-3 text-sm font-semibold text-cream transition-colors hover:border-orange hover:text-orange"
            >
              <CalendarPlus className="size-4" />
              Add to my calendar
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events, isPending, isError } = useEvents();

  const event = useMemo(() => events?.find((e) => e.id === id), [events, id]);

  return (
    <>
      <Nav />
      {isPending ? (
        <main className="flex flex-1 items-center justify-center bg-bg py-32">
          <div className="flex flex-col items-center gap-3 text-cream-dim">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-orange" />
            <p className="text-sm">Loading the event…</p>
          </div>
        </main>
      ) : event ? (
        <EventDetail event={event} />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg px-5 py-32 text-center">
          <h1 className="display text-4xl uppercase text-cream">
            {isError ? "Something went wrong" : "Event not found"}
          </h1>
          <p className="max-w-md text-sm text-cream-dim">
            {isError
              ? "We couldn't load this event. Please try again in a moment."
              : "This event may have been removed or the link is out of date."}
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-orange-deep"
          >
            <ArrowLeft className="size-4" />
            Back to events
          </Link>
        </main>
      )}
      <Footer />
    </>
  );
}
