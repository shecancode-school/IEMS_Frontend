"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { FOCUS_RING_SOFT, TAP } from "./publicStyles";
import {
  CalendarFilters,
  type CalendarPerson,
  type CalendarSource,
} from "./CalendarFilters";

/* The calendar's chrome.

   What was here before put the two arrows first, "Today" second and the month
   third — so the one piece of information the toolbar exists to convey came
   last and at nearly the same weight as the buttons around it. This inverts
   that: the period label leads at a size nothing else on the bar competes
   with, and navigation sits beside it as quiet, compact controls.

   There were also two "Today" buttons, one shown on desktop and one on mobile,
   styled separately and drifting. There is one now, and it shrinks rather
   than being duplicated.

   Filters are part of this bar rather than a strip underneath it. On a phone
   they collapse behind a single control, because five filter chips and a
   select cannot share a 320px row with navigation and still be tappable. */

export type View = "month" | "week" | "upcoming";

const VIEWS: [View, string, string][] = [
  ["month", "Month", "M"],
  ["week", "Week", "W"],
  ["upcoming", "Upcoming", "A"],
];

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      /* 40px on a phone, which with the 4px gap between the pair clears the
         44px guideline as a target group; the icons themselves are 18px so
         the control stays visually compact rather than looking like a
         toolbar of oversized buttons */
      className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-cream transition-colors hover:bg-panel-2 hover:text-orange disabled:pointer-events-none disabled:opacity-25 ${FOCUS_RING_SOFT}`}
    >
      {children}
    </button>
  );
}

export function PublicToolbar({
  heading,
  subheading,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  canGoBack,
  canGoForward,
  stepLabel,
  showNav,
  filters,
}: {
  heading: string;
  /** the year, or anything else that would make the heading too long to fit */
  subheading?: string;
  view: View;
  onView: (v: View) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** "month" or "week" — what the arrows step by right now */
  stepLabel: string;
  /* Upcoming has no period to step through, so it has no arrows and no
     "Today". They were rendered there before and quietly moved a month cursor
     that view does not read — a control that appears to work and does not is
     worse than one that is absent. */
  showNav: boolean;
  /** null while loading, so the bar does not offer filters over a skeleton */
  filters: {
    sources: Set<CalendarSource>;
    counts: Record<CalendarSource, number>;
    onToggleSource: (s: CalendarSource) => void;
    people: CalendarPerson[];
    personKey: string | null;
    onPerson: (key: string | null) => void;
  } | null;
}) {
  const [mobileFilters, setMobileFilters] = useState(false);
  const panelId = useId();

  /* How many filters are away from their default, so the collapsed control on
     mobile can say that something is being hidden. Without this a visitor who
     filtered, scrolled and came back sees a short calendar and no reason. */
  const activeCount = filters
    ? (filters.sources.size < 2 ? 1 : 0) + (filters.personKey ? 1 : 0)
    : 0;

  return (
    <div className="mb-3 sm:mb-4">
      {/* Row one: period, navigation, view. Never wraps — at 320px the
          heading takes what is left and truncates, which is the right thing
          to give up first. */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {showNav && (
          <>
            <button
              type="button"
              onClick={onToday}
              className={`shrink-0 cursor-pointer rounded-md border border-line bg-panel px-2.5 py-2 text-xs font-semibold text-cream transition-colors hover:border-orange hover:text-orange sm:px-3.5 sm:text-sm ${TAP} ${FOCUS_RING_SOFT}`}
            >
              Today
            </button>

            <div className="flex shrink-0 items-center">
              <NavButton
                label={`Previous ${stepLabel}`}
                disabled={!canGoBack}
                onClick={onPrev}
              >
                <ChevronLeft className="size-[18px]" aria-hidden />
              </NavButton>
              <NavButton
                label={`Next ${stepLabel}`}
                disabled={!canGoForward}
                onClick={onNext}
              >
                <ChevronRight className="size-[18px]" aria-hidden />
              </NavButton>
            </div>
          </>
        )}

        {/* The label. aria-live so a screen-reader user pressing the arrows
            hears where they landed — before, navigation was silent. */}
        <h2
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-cream sm:text-2xl sm:font-normal"
        >
          {heading}
          {subheading && (
            <span className="ml-1.5 font-normal text-cream-dim">
              {subheading}
            </span>
          )}
        </h2>

        <div
          role="group"
          aria-label="Calendar view"
          className="flex shrink-0 rounded-md border border-line bg-panel p-0.5"
        >
          {VIEWS.map(([value, text, short]) => (
            <button
              key={value}
              type="button"
              onClick={() => onView(value)}
              aria-pressed={view === value}
              title={text}
              className={`relative cursor-pointer rounded px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${FOCUS_RING_SOFT} ${
                view === value
                  ? "text-bg"
                  : "text-cream-dim hover:bg-panel-2 hover:text-cream"
              }`}
            >
              {view === value && (
                <motion.span
                  layoutId="calendar-view-pill"
                  className="absolute inset-0 rounded bg-orange"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              {/* the full word where it fits, one letter where it does not —
                  the alternative at 320px is a switcher that pushes the month
                  label off the bar entirely */}
              <span className="relative hidden sm:inline">{text}</span>
              <span className="relative sm:hidden" aria-hidden>
                {short}
              </span>
              <span className="sr-only sm:hidden">{text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Row two: filters. A hairline above them ties them to the bar without
          the boxed-off look the old bordered strip had. */}
      {filters && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          {/* phone: one control, opening a panel */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileFilters((v) => !v)}
                aria-expanded={mobileFilters}
                aria-controls={panelId}
                className={`flex cursor-pointer items-center gap-2 rounded-full border border-line bg-panel px-3.5 text-xs font-semibold text-cream ${TAP} ${FOCUS_RING_SOFT}`}
              >
                {mobileFilters ? (
                  <X className="size-4" aria-hidden />
                ) : (
                  <SlidersHorizontal className="size-4" aria-hidden />
                )}
                Filters
                {activeCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-orange text-[10px] font-bold text-bg">
                    {activeCount}
                  </span>
                )}
              </button>
              <span className="text-[11px] text-cream-dim">Kigali time</span>
            </div>

            {mobileFilters && (
              <div id={panelId} className="mt-3">
                <CalendarFilters {...filters} />
              </div>
            )}
          </div>

          {/* tablet and up: always visible, inline */}
          <div className="hidden items-center justify-between gap-4 sm:flex">
            <CalendarFilters {...filters} />
            <p className="hidden shrink-0 text-xs text-cream-dim lg:block">
              Kigali time · select a day for details
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
