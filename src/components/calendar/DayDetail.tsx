"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MapPin, User, Video, X } from "lucide-react";
import {
  isBookableEvent,
  itemCategoryLabel,
  itemColor,
  type VenueEvent,
} from "@/lib/events";
import { EmptyCalendarArt } from "./EmptyCalendarArt";
import { FOCUS_RING_SOFT, TAP } from "./publicStyles";

/* What a calendar is actually for: pick a day, see what is on it.

   The month grid can only ever show a truncated chip, so this panel is where
   the detail lives — full title, the times, who is running it, where, and the
   one action that makes sense for the kind of item it is. On mobile it IS the
   agenda: the grid above shows dots, this shows the day.

   It is also where a keyboard user meets the events. The grid is a single tab
   stop by design, so the chips in it are not focusable; these rows are real
   buttons, in order, immediately after the grid. */

function longDate(dayISO: string): string {
  /* built in UTC so the label matches the Kigali day in the key rather than
     the visitor's local rendering of it */
  return new Date(`${dayISO}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Row({ item, onOpen }: { item: VenueEvent; onOpen: (e: VenueEvent) => void }) {
  const colour = itemColor(item);
  const bookable = isBookableEvent(item);
  const label = itemCategoryLabel(item);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-panel-2/50 p-3 transition-colors hover:border-cream-dim/35 sm:p-4">
      {/* one colour rail, doing the job the rail and a duplicate dot used to
          share between them */}
      <span
        aria-hidden
        className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: colour }}
      />

      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          {label && (
            <span className="label block text-[10px] font-semibold text-cream-dim">{label}</span>
          )}
          <h4 className="mt-0.5 font-semibold leading-snug text-cream">{item.title}</h4>

          <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cream-dim">
            <div className="flex items-center gap-1">
              <dt className="sr-only">Time</dt>
              <dd className="tabular-nums">
                {item.time}
                {item.endTime && ` – ${item.endTime}`}
              </dd>
            </div>
            {item.space && (
              <div className="flex min-w-0 items-center gap-1">
                <dt className="sr-only">Location</dt>
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <dd className="truncate">{item.space}</dd>
              </div>
            )}
            {item.host && (
              <div className="flex min-w-0 items-center gap-1">
                <dt className="sr-only">Run by</dt>
                <User className="size-3.5 shrink-0" aria-hidden />
                <dd className="truncate">{item.host}</dd>
              </div>
            )}
          </dl>

          {item.description && (
            <p className="mt-2 line-clamp-2 text-sm text-cream-dim/85">{item.description}</p>
          )}

          {/* The joining link is deliberately NOT on the public feed — a Meet
              URL on a public page is an open door to the call — so say how to
              get it rather than leaving a blank where a button would be. */}
          {!bookable && (item.mode === "ONLINE" || item.mode === "HYBRID") && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-cream-dim">
              <Video className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                The joining link is sent by email to the people expected on the call.
                {item.host ? ` Ask ${item.host.split(" ")[0]} to be added.` : ""}
              </span>
            </p>
          )}
        </div>

        {/* A session has no ticket, so it gets a label rather than a button —
            offering "Register" would promise an action that does not exist.
            Which label depends on how you attend: an online or hybrid session
            is something you join from wherever you are, an in-person one is
            somewhere you turn up. */}
        {bookable ? (
          item.soldOut ? (
            <span className="shrink-0 rounded-full bg-panel px-3.5 py-1.5 text-xs font-semibold text-cream-dim">
              Sold out
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(item)}
              className={`flex shrink-0 cursor-pointer items-center rounded-full bg-orange px-4 text-xs font-semibold text-bg transition-colors hover:bg-orange-deep ${TAP} sm:min-h-9 ${FOCUS_RING_SOFT}`}
            >
              {item.price === "Free" || !item.price ? "Register" : `Register · ${item.price}`}
            </button>
          )
        ) : (
          <span className="shrink-0 rounded-full border border-dashed border-cream-dim/40 px-3.5 py-1.5 text-xs font-semibold text-cream-dim">
            {item.mode === "ONLINE"
              ? "Online session"
              : item.mode === "HYBRID"
                ? "Online or in person"
                : "In-person session"}
          </span>
        )}
      </div>
    </li>
  );
}

export function DayDetail({
  dayISO,
  items,
  isToday,
  onOpen,
  onClose,
}: {
  dayISO: string | null;
  items: VenueEvent[];
  isToday: boolean;
  onOpen: (e: VenueEvent) => void;
  /** omitted on mobile, where the panel is permanent rather than dismissible */
  onClose?: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode="wait">
      {dayISO && (
        <motion.div
          key={dayISO}
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="rounded-xl border border-line bg-panel p-3 sm:p-5"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 font-semibold text-cream">
                {longDate(dayISO)}
                {isToday && (
                  <span className="label rounded-full bg-orange px-2 py-0.5 text-[9px] font-bold text-bg">
                    Today
                  </span>
                )}
              </h3>
              {/* The live region is this one line, not the whole panel. With
                  aria-live on the container, changing day re-read every event
                  on it — a day with five things announced five paragraphs
                  before the user could do anything. */}
              <p aria-live="polite" className="mt-0.5 text-xs text-cream-dim">
                {items.length === 0
                  ? "Nothing scheduled"
                  : `${items.length} item${items.length > 1 ? "s" : ""}`}
              </p>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close day details"
                className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-cream-dim transition-colors hover:border-orange hover:text-orange ${FOCUS_RING_SOFT}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyCalendarArt
              size="sm"
              title="Nothing on this day"
              message="Pick another day, or look at Upcoming for the next thing on."
            />
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => (
                <Row key={item.id} item={item} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
