"use client";

import { useId, useState } from "react";
import { Check, ChevronLeft, ChevronRight, SlidersHorizontal, Users, X } from "lucide-react";
import type { CalendarItem, CalendarPerson } from "@/types/admin";
import { addDaysISO, formatEventDate } from "@/lib/time";
import { monthStart, weekStart } from "@/lib/scheduling/range";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FOCUS_RING_SOFT, TAP } from "./adminStyles";
import { SOURCES, SOURCE_COLOR, SOURCE_LABEL, personColor } from "./colors";

/* The calendar's chrome.

   What was here before was a single `flex flex-wrap gap-2` with the range
   label as `text-sm font-medium` — the same weight as the buttons around it.
   The one piece of information the toolbar exists to convey was the quietest
   thing on the bar, and `min-w-40` on it forced an arbitrary early wrap that
   left the view tabs and the People filter on ragged separate rows at about
   700px.

   This inverts it, the same way the public toolbar already does: the period
   label leads at a size nothing else competes with, navigation sits beside it
   as quiet compact controls, and the filters live on a second row that
   collapses behind one control on a phone. */

export type CalendarView = "day" | "week" | "month";
export type SourceFilter = Set<CalendarItem["source"]>;

const VIEWS: [CalendarView, string, string][] = [
  ["day", "Day", "D"],
  ["week", "Week", "W"],
  ["month", "Month", "M"],
];

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-foreground transition-colors hover:bg-muted",
        FOCUS_RING_SOFT
      )}
    >
      {children}
    </button>
  );
}

/* A source layer, on or off. The swatch reports the state by being filled or
   hollow, so the control does not depend on colour alone. */
function SourceChip({
  source,
  active,
  count,
  onToggle,
}: {
  source: CalendarItem["source"];
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  const colour = SOURCE_COLOR[source];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        TAP,
        "sm:min-h-8",
        FOCUS_RING_SOFT,
        active ? "text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      )}
      style={active ? { backgroundColor: `${colour}22`, borderColor: colour } : undefined}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full border-2 transition-colors"
        style={{ borderColor: colour, backgroundColor: active ? colour : "transparent" }}
      />
      {SOURCE_LABEL[source]}
      <span className="tabular-nums text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

export function CalendarToolbar({
  view,
  onViewChange,
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  people,
  selected,
  onSelectedChange,
  sources,
  sourceCounts,
  onToggleSource,
  right,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  rangeLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  people?: CalendarPerson[];
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /* Source layers. The board carries four kinds of thing and, until now, no
     way to turn any of them off — so a Google-heavy week could not be reduced
     to just the work that lives in this system. */
  sources?: SourceFilter;
  sourceCounts?: Record<CalendarItem["source"], number>;
  onToggleSource?: (s: CalendarItem["source"]) => void;
  right?: React.ReactNode;
}) {
  const [mobileFilters, setMobileFilters] = useState(false);
  const panelId = useId();

  const showPeople = people && people.length > 1 && onSelectedChange;
  const showSources = sources && sourceCounts && onToggleSource;
  const hasFilters = showPeople || showSources;

  /* How many filters are away from their default, so the collapsed control on
     a phone can say that something is being hidden. Without this someone who
     filtered, scrolled and came back sees a short calendar and no reason. */
  const activeCount =
    (selected?.length ? 1 : 0) + (sources && sources.size < SOURCES.length ? 1 : 0);

  const peopleList = showPeople ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("cursor-pointer rounded-full", TAP, "sm:min-h-8")}>
          <Users className="size-4" />
          People
          {selected?.length ? (
            <Badge variant="secondary" className="ml-1 rounded-full px-1.5">
              {selected.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter people…" />
          <CommandList>
            <CommandEmpty>Nobody found.</CommandEmpty>
            <CommandGroup>
              {people!.map((p) => {
                const on = selected?.includes(p.id) ?? false;
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.title ?? ""}`}
                    onSelect={() =>
                      onSelectedChange!(
                        on
                          ? (selected ?? []).filter((id) => id !== p.id)
                          : [...(selected ?? []), p.id]
                      )
                    }
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: personColor(p.id) }}
                    />
                    <span className="flex-1 truncate">{p.name}</span>
                    <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  ) : null;

  const filterRow = hasFilters ? (
    <div className="flex flex-wrap items-center gap-2">
      {showSources &&
        SOURCES.map((s) => (
          <SourceChip
            key={s}
            source={s}
            active={sources!.has(s)}
            count={sourceCounts![s]}
            onToggle={() => onToggleSource!(s)}
          />
        ))}

      {showSources && showPeople && (
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
      )}

      {peopleList}

      {selected?.length ? (
        <button
          type="button"
          onClick={() => onSelectedChange?.([])}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            TAP,
            "sm:min-h-8",
            FOCUS_RING_SOFT
          )}
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mb-4">
      {/* Row one: period, navigation, view. Never wraps — at 320px the heading
          takes what is left and truncates, which is the right thing to give up
          first. */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className={cn("shrink-0 cursor-pointer", TAP, "sm:min-h-9")}
        >
          Today
        </Button>

        <div className="flex shrink-0 items-center">
          <NavButton label={`Previous ${view}`} onClick={onPrev}>
            <ChevronLeft className="size-[18px]" aria-hidden />
          </NavButton>
          <NavButton label={`Next ${view}`} onClick={onNext}>
            <ChevronRight className="size-[18px]" aria-hidden />
          </NavButton>
        </div>

        {/* aria-live so a screen-reader user pressing the arrows hears where
            they landed. Before, navigating the admin calendar was silent. */}
        <h2
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {rangeLabel}
        </h2>

        {right && <div className="hidden shrink-0 items-center gap-2 lg:flex">{right}</div>}

        <div
          role="group"
          aria-label="Calendar view"
          className="flex shrink-0 rounded-md border bg-card p-0.5"
        >
          {VIEWS.map(([value, text, short]) => (
            <button
              key={value}
              type="button"
              onClick={() => onViewChange(value)}
              aria-pressed={view === value}
              title={`${text} view`}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                FOCUS_RING_SOFT,
                view === value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* the full word where it fits, one letter where it does not —
                  the alternative at 320px is a switcher that pushes the date
                  off the bar entirely */}
              <span className="hidden sm:inline">{text}</span>
              <span className="sm:hidden" aria-hidden>
                {short}
              </span>
              <span className="sr-only sm:hidden">{text} view</span>
            </button>
          ))}
        </div>
      </div>

      {/* Anything the page parked in `right` needs somewhere to go below lg,
          where the first row has no space for it. */}
      {right && <div className="mt-2 flex items-center gap-2 lg:hidden">{right}</div>}

      {/* Row two: filters. A hairline above them ties them to the bar without
          the boxed-off look a bordered strip would have. */}
      {hasFilters && (
        <div className="mt-2.5 border-t pt-2.5">
          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setMobileFilters((v) => !v)}
              aria-expanded={mobileFilters}
              aria-controls={panelId}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border bg-card px-3.5 text-xs font-semibold text-foreground",
                TAP,
                FOCUS_RING_SOFT
              )}
            >
              {mobileFilters ? (
                <X className="size-4" aria-hidden />
              ) : (
                <SlidersHorizontal className="size-4" aria-hidden />
              )}
              Filters
              {activeCount > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-[var(--calendar-accent)] text-[10px] font-bold text-background">
                  {activeCount}
                </span>
              )}
            </button>

            {mobileFilters && (
              <div id={panelId} className="mt-3">
                {filterRow}
              </div>
            )}
          </div>

          <div className="hidden items-center justify-between gap-4 sm:flex">
            {filterRow}
            <p className="hidden shrink-0 text-xs text-muted-foreground lg:block">Kigali time</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* "Thursday, March 5, 2026" / "Mar 2 – Mar 8, 2026" / "March 2026"

   Takes the anchor, not the fetched range. It used to take `range.from`, and
   for month view that is `monthStart − 7 days` — the feed deliberately
   over-fetches so the leading days of the six-week grid are populated. So the
   month heading was reading the label off a day that is always in the PREVIOUS
   month: viewing March showed "February 2026". Deriving the label from the
   anchor here means the call sites cannot reintroduce it. */
export function rangeLabel(view: CalendarView, anchorISO: string): string {
  if (view === "day") return formatEventDate(`${anchorISO}T12:00:00.000Z`);
  if (view === "month") {
    return formatEventDate(`${monthStart(anchorISO)}T12:00:00.000Z`, {
      month: "long",
      year: "numeric",
    });
  }
  const from = weekStart(anchorISO);
  const to = addDaysISO(from, 6);
  const start = formatEventDate(`${from}T12:00:00.000Z`, { month: "short", day: "numeric" });
  const end = formatEventDate(`${to}T12:00:00.000Z`, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}
