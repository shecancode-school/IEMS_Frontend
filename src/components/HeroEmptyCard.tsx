"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays,UserRound } from "lucide-react";

/* What the hero shows when there is no next event.

   The card it replaces is the visual anchor of the page, so collapsing to a
   one-line pill left roughly half the viewport empty and made a working site
   look broken. This keeps the same footprint and the same bones as
   FeaturedEventCard — 4:5 art panel, body, one action — so the hero holds its
   shape whether or not anything is scheduled.

   It is a signpost, not a decoration. There is exactly one thing worth saying
   when the calendar has nothing upcoming, and it is the one thing still
   available: the people taking bookings. The hero already falls back to a
   published session before reaching this card, so a session count here would
   always read zero — padding the card with a stat that cannot fire would be
   worse than saying less. */

/* Drawn rather than shipped: it costs no request, stays sharp at any size and
   is painted in site tokens, so it follows the theme instead of being a
   rectangle of the wrong green. */
function CalendarArt() {
  return (
    <svg
      viewBox="0 0 320 400"
      role="presentation"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id="hero-empty-glow" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.30" />
          <stop offset="55%" stopColor="var(--orange)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
        </radialGradient>
        {/* the dot field echoes HeroCanvas behind the section */}
        <pattern id="hero-empty-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="var(--sage)" opacity="0.14" />
        </pattern>
      </defs>

      <rect width="320" height="400" fill="url(#hero-empty-dots)" />
      <rect width="320" height="400" fill="url(#hero-empty-glow)" />

      {/* two cards behind, so the stack reads as "more to come" */}
      <g opacity="0.35">
        <rect
          x="74"
          y="118"
          width="172"
          height="150"
          rx="16"
          fill="var(--panel-2)"
          stroke="var(--line)"
          strokeWidth="2"
          transform="rotate(-8 160 193)"
        />
      </g>
      <g opacity="0.6">
        <rect
          x="74"
          y="112"
          width="172"
          height="150"
          rx="16"
          fill="var(--panel-2)"
          stroke="var(--line)"
          strokeWidth="2"
          transform="rotate(5 160 187)"
        />
      </g>

      {/* the calendar page itself */}
      <g>
        <rect
          x="76"
          y="108"
          width="168"
          height="150"
          rx="16"
          fill="var(--panel)"
          stroke="var(--line)"
          strokeWidth="2"
        />
        <path
          d="M76 124a16 16 0 0 1 16-16h136a16 16 0 0 1 16 16v18H76z"
          fill="var(--green-deep)"
        />
        <rect x="108" y="98" width="9" height="24" rx="4.5" fill="var(--orange)" />
        <rect x="203" y="98" width="9" height="24" rx="4.5" fill="var(--orange)" />

        {/* week rows, deliberately empty — that is the message */}
        {[160, 186, 212].map((y) => (
          <g key={y}>
            {[94, 130, 166, 202].map((x) => (
              <rect
                key={x}
                x={x}
                y={y}
                width="24"
                height="14"
                rx="5"
                fill="var(--line)"
                opacity="0.45"
              />
            ))}
          </g>
        ))}
        {/* one lit day, so it reads as a calendar and not a table */}
        <rect x="130" y="186" width="24" height="14" rx="5" fill="var(--orange)" opacity="0.9" />
      </g>

      {/* a few drifting sparks, matching the hero's dot field */}
      <circle cx="58" cy="88" r="3" fill="var(--orange)" opacity="0.55" />
      <circle cx="266" cy="300" r="4" fill="var(--sage)" opacity="0.45" />
      <circle cx="46" cy="304" r="2.5" fill="var(--sage)" opacity="0.35" />
    </svg>
  );
}

export function HeroEmptyCard({
  hostCount,
}: {
  /** people currently taking bookings */
  hostCount: number;
}) {

  return (
    <div className="hero-card w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl shadow-black/40">
      <div className="relative aspect-4/5 w-full overflow-hidden bg-panel-2">
        <CalendarArt />

        {/* the mark sits quietly in the corner rather than being the subject */}
        

        {/* <span className="label absolute right-5 top-5 flex items-center gap-1.5 rounded-xl bg-black/55 px-3 py-2 text-[10px] font-bold text-cream-dim backdrop-blur-sm">
          <Sparkles className="size-3.5 text-orange" aria-hidden />
          Coming soon
        </span> */}
      </div>

      <div className="p-5">
        <p className="label text-[11px] font-semibold tracking-wide text-sage">Next up</p>
        <h2 className="display mt-1 text-2xl leading-tight text-cream">
          No event scheduled yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-cream-dim">
          New events are added regularly. The calendar is the first place they appear.
        </p>

        {hostCount > 0 && (
          <p className="mt-4 flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-sage">
              <UserRound className="size-4" aria-hidden />
            </span>
            <span className="text-sm text-cream-dim">
              <span className="font-bold text-cream">{hostCount}</span>{" "}
              {hostCount === 1 ? "person is" : "people are"} open for bookings in the meantime
            </span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="#calendar"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-orange px-4 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-orange-deep"
          >
            <CalendarDays className="size-4" aria-hidden />
            Browse the calendar
          </Link>
          {hostCount > 0 && (
            <Link
              href="/book"
              className="flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-orange hover:text-orange"
            >
              Book
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
