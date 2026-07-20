"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { CalendarDays, MapPin, Tag } from "lucide-react";
import HeroCanvas from "./HeroCanvas";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  nextEvent,
  todayIso,
  type VenueEvent,
} from "@/lib/events";
import { useEvents } from "@/lib/useEvents";
import { useEventFlow } from "@/components/EventFlow";
import { toPlainText } from "@/components/RichText";

/* Placeholder card with the same bones as the featured card, shown while
   the real upcoming event is being fetched */
function FeaturedSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the next event"
      className="hero-card w-full max-w-sm animate-pulse overflow-hidden rounded-3xl border border-line bg-panel"
    >
      <div className="aspect-4/5 bg-panel-2" />
      <div className="space-y-3 p-5">
        <div className="h-3.5 w-32 rounded bg-panel-2" />
        <div className="h-7 w-3/4 rounded bg-panel-2" />
        <div className="flex justify-between">
          <div className="h-9 w-36 rounded-full bg-panel-2" />
          <div className="h-9 w-24 rounded-full bg-panel-2" />
        </div>
      </div>
      <span className="sr-only">Loading the next event…</span>
    </div>
  );
}

/* live Days : Hrs : Min chip, pinned to the poster — ticks on its own and
   works with or without artwork behind it */
function CountdownChip({ event }: { event: VenueEvent }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt
    ? new Date(event.endsAt).getTime()
    : new Date(event.startsAt).setHours(23, 59, 59, 999);

  if (now > end) {
    return (
      <span className="label rounded-xl bg-black/60 px-3 py-2 text-[10px] font-bold text-cream-dim backdrop-blur-sm">
        Ended
      </span>
    );
  }
  if (now >= start) {
    return (
      <span className="label flex items-center gap-1.5 rounded-xl bg-green px-3 py-2 text-[10px] font-bold text-bg backdrop-blur-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute h-full w-full animate-ping rounded-full bg-bg opacity-60" />
          <span className="h-1.5 w-1.5 rounded-full bg-bg" />
        </span>
        Live now
      </span>
    );
  }

  const diff = start - now;
  const days = Math.floor(diff / 86_400_000);
  const hrs = Math.floor((diff % 86_400_000) / 3_600_000);
  const min = Math.floor((diff % 3_600_000) / 60_000);
  const cell = (v: number, label: string) => (
    <span className="flex flex-col items-center leading-none">
      <span className="display text-base text-cream">{String(v).padStart(2, "0")}</span>
      <span className="mt-0.5 text-[8px] uppercase tracking-wider text-cream-dim">{label}</span>
    </span>
  );
  return (
    <span className="flex items-center gap-2 rounded-xl bg-black/60 px-3.5 py-2 backdrop-blur-sm">
      {cell(days, "Days")}
      <span className="pb-2 text-cream-dim">:</span>
      {cell(hrs, "Hrs")}
      <span className="pb-2 text-cream-dim">:</span>
      {cell(min, "Min")}
    </span>
  );
}

/* Festival-flyer featured card: poster art, countdown pinned on top,
   venue + title + organizer + price below */
function FeaturedEventCard({
  event,
  onOpen,
}: {
  event: VenueEvent;
  onOpen: () => void;
}) {
  const isToday = event.date === todayIso();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hero-card group w-full max-w-sm cursor-pointer overflow-hidden rounded-3xl border border-line bg-panel text-left shadow-2xl shadow-black/40 transition-all hover:-translate-y-1 hover:border-orange"
    >
      <div className="relative aspect-4/5 w-full overflow-hidden bg-panel-2">
        {event.posterUrl ? (
          <img
            src={event.posterUrl}
            alt={`${event.title} poster`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          /* no poster yet — branded art card so the countdown still shines */
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-linear-to-br from-green-deep via-panel-2 to-bg p-6 text-center">
            <CalendarDays className="size-14 text-orange/70" />
            <p className="display text-3xl uppercase leading-tight text-cream">{event.title}</p>
            <p className="label text-xs font-semibold" style={{ color: CATEGORY_COLORS[event.category] }}>
              {event.category}
            </p>
          </div>
        )}

        <div className="absolute left-3 top-3">
          <CountdownChip event={event} />
        </div>
        <div className="absolute right-3 top-3">
          {event.status === "OPEN" && !event.soldOut ? (
            <span className="label flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-bold text-green backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute h-full w-full animate-ping rounded-full bg-green opacity-60" />
                <span className="h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Open
            </span>
          ) : (
            <span className="label rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-bold text-terracotta backdrop-blur-sm">
              {event.soldOut ? "Fully booked" : "Closed"}
            </span>
          )}
        </div>
        {/* legibility gradient over the poster's bottom edge */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-panel to-transparent" />
      </div>

      <div className="space-y-2.5 p-5 pt-2">
        <p className="flex items-center gap-1.5 text-sm text-cream-dim">
          <MapPin className="size-4 shrink-0 text-orange" />
          {event.space || "Venue to be announced"}
          <span className="mx-1 text-line">·</span>
          {isToday
            ? "Today"
            : new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
          {event.time ? `, ${event.time}` : ""}
        </p>
        <h2 className="display text-3xl uppercase leading-none text-cream">{event.title}</h2>
        <div className="flex items-center justify-between gap-3 pt-1.5">
          <span className="flex items-center gap-2 rounded-full bg-panel-2 py-1 pl-1 pr-4">
            <Image
              src="/iro-logo.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full bg-bg p-0.5"
            />
            <span className="text-xs font-semibold text-cream">Igire Rwanda</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-cream">
            <Tag className="size-3.5 text-orange" />
            {event.soldOut ? "Fully booked" : event.price || "Free"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  const { data: events, isPending } = useEvents();
  const { openEvent } = useEventFlow();

  /* the featured card shows the next OPEN event; when nothing is open,
     whatever comes up next keeps the page alive */
  const open = (events ?? []).filter((e) => e.status === "OPEN");
  const upNext = nextEvent(open) ?? nextEvent(events ?? []);

  /* intro for the copy column. clearProps wipes the inline styles the tween
     leaves behind, so an interrupted animation can never strand an element
     at opacity 0. */
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".hero-item", {
          opacity: 0,
          y: 26,
          duration: 0.8,
          stagger: 0.12,
          clearProps: "opacity,transform",
        });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* The featured card animates separately, and re-runs whenever the card
     (re)appears — on a fresh load it isn't in the DOM yet when the intro
     above fires (the skeleton is), and on back-navigation a cached render
     puts it there immediately. Keying the effect to the card's identity
     means it can never be captured at opacity 0 by a timeline that no
     longer manages it. */
  const cardKey = isPending ? "loading" : (upNext?.id ?? "none");
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".hero-card",
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: 0.35,
          ease: "power3.out",
          clearProps: "opacity,transform",
        }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [cardKey]);

  return (
    <section ref={rootRef} className="relative overflow-hidden bg-bg">
      {/* the animated dot field is the page's signature backdrop — it stays
          put whether or not an event is coming up */}
      <HeroCanvas />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-bg via-bg/70 to-bg/30" />

      {/* the hero takes ~80 % of the viewport so content below is visible */}
      <div className="relative mx-auto grid min-h-[85svh] max-w-7xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.2fr_1fr] lg:py-0">
        <div>
          <p className="hero-item label mb-4 text-sm font-semibold text-sage">
            Empowering Women Through Digital Skills
          </p>
          <h1 className="display hero-item text-5xl uppercase text-cream sm:text-7xl lg:text-8xl">
            Events
            <br />
            Calendar
          </h1>
          {upNext && (
            <p className="hero-item mt-6 max-w-lg text-sm leading-relaxed text-cream-dim line-clamp-3">
              {toPlainText(upNext.description)}
            </p>
          )}
          <ul className="hero-item mt-9 flex max-w-lg flex-wrap gap-x-7 gap-y-3">
            {CATEGORIES.map((cat) => (
              <li key={cat} className="flex items-center gap-2.5">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="label text-sm font-semibold text-cream">{cat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* on mobile this sits at the bottom of the hero */}
        <div className="flex flex-col items-center justify-center">
          {isPending ? (
            <FeaturedSkeleton />
          ) : upNext ? (
            <FeaturedEventCard event={upNext} onOpen={() => openEvent(upNext)} />
          ) : (
            <a
              href="#calendar"
              className="hero-card mt-3 flex items-center gap-2.5 rounded-full border border-line bg-panel px-5 py-2.5 transition-colors hover:border-orange"
            >
              <span className="text-sm text-cream-dim">
                Nothing coming up yet — see the full calendar
              </span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
