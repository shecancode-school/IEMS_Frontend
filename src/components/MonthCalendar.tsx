"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { todayIso } from "@/lib/events";
import {
  addDays,
  addMonths,
  clampMonth,
  compareMonths,
  groupByDay,
  monthLabel,
  monthMatrix,
  monthName,
  monthOf,
  weekOf,
  weekRangeLabel,
  type YearMonth,
} from "@/lib/calendarGrid";
import type { VenueEvent } from "@/lib/events";
import { PublicToolbar, type View } from "@/components/calendar/PublicToolbar";
import { PublicMonthGrid } from "@/components/calendar/PublicMonthGrid";
import { PublicAgenda } from "@/components/calendar/PublicAgenda";
import { PublicWeekGrid } from "@/components/calendar/PublicWeekGrid";
import { CalendarErrorState, CalendarSkeleton } from "@/components/calendar/PublicStates";
import { BOARD } from "@/components/calendar/publicStyles";
import type { CalendarPerson, CalendarSource } from "@/components/calendar/CalendarFilters";
import { BookingAvailability } from "@/components/calendar/BookingAvailability";
import { DayDetail } from "@/components/calendar/DayDetail";
import { useEvents } from "@/lib/useEvents";
import { useEventFlow } from "@/components/EventFlow";

gsap.registerPlugin(ScrollTrigger);

/* The public calendar.

   This file is the calendar's brain — data, state, keyboard, bounds — and
   nothing else. The three views it can show are three components in
   ./calendar, and they share their visual language through publicStyles.ts.
   It used to be one 780-line file in which the month grid's markup sat six
   levels deep inside two animation wrappers, and the week and month views had
   independently drifted ideas of what "today" looks like. */

/* How far the board may roam.

   These are not arbitrary: /api/events serves a fixed window either side of
   today, and letting the arrows walk past it would show confidently empty
   months that are not actually empty. Keep them in step with PAST_DAYS /
   FUTURE_DAYS in src/app/api/events/route.ts. */
const PAST_MONTHS = 6;
const FUTURE_MONTHS = 12;

export default function MonthCalendar() {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { data, isPending, isError, refetch } = useEvents();
  const { openEvent } = useEventFlow();
  /* Motion is decoration here, never information: with reduced motion on, the
     month still changes, it just does not slide. */
  const reduced = useReducedMotion() ?? false;

  const events = useMemo(() => data ?? [], [data]);

  const [sources, setSources] = useState<Set<CalendarSource>>(
    () => new Set<CalendarSource>(["EVENT", "ACTIVITY"])
  );
  const [personKey, setPersonKey] = useState<string | null>(null);

  /* Someone's calendar is identified by their booking slug where they have
     one, and by their name otherwise. Two colleagues sharing a name and
     neither taking bookings would merge — the public feed exposes nothing
     finer, and inventing an id here would mean publishing one. */
  const keyOf = (e: VenueEvent) => e.hostSlug ?? e.host;

  /* Only people with something PUBLIC appear, so this control cannot reveal a
     colleague who has published nothing. */
  const people = useMemo<CalendarPerson[]>(() => {
    const found = new Map<string, CalendarPerson>();
    for (const e of events) {
      const key = keyOf(e);
      if (!key || !e.host) continue;
      const existing = found.get(key);
      if (existing) existing.count += 1;
      else found.set(key, { key, name: e.host, slug: e.hostSlug, count: 1 });
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const counts = useMemo(
    () => ({
      EVENT: events.filter((e) => e.kind === "EVENT").length,
      ACTIVITY: events.filter((e) => e.kind === "ACTIVITY").length,
    }),
    [events]
  );

  /* every view reads this, so a layer turned off is off everywhere */
  const visible = useMemo(
    () =>
      events.filter(
        (e) => sources.has(e.kind) && (personKey === null || keyOf(e) === personKey)
      ),
    [events, sources, personKey]
  );

  const selectedPerson = people.find((p) => p.key === personKey) ?? null;

  const byDay = useMemo(() => groupByDay(visible), [visible]);

  /* Today in KIGALI. The feed's dates are Kigali days, so deriving "today"
     from the browser's clock would misplace the marker — and drop today's
     events out of "Upcoming" — for anyone west of UTC. */
  const todayKey = useMemo(() => todayIso(), []);
  const todayMonth = useMemo(() => monthOf(todayKey), [todayKey]);

  const bounds = useMemo(
    () => ({
      min: addMonths(todayMonth, -PAST_MONTHS),
      max: addMonths(todayMonth, FUTURE_MONTHS),
    }),
    [todayMonth]
  );

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<YearMonth>(todayMonth);
  const [direction, setDirection] = useState(1);
  /* the day the detail panel is showing; also the anchor for the week view */
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  /* whether the visitor opened the panel themselves. On desktop the panel is
     hidden until they do; on mobile it is always shown, because a 45px cell
     cannot hold a chip and the panel IS the agenda. */
  const [panelOpen, setPanelOpen] = useState(false);
  /* roving tabindex: exactly one day cell is reachable by Tab */
  const [focusDay, setFocusDay] = useState<string>(todayKey);
  const shouldFocus = useRef(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  /* Move focus only when a key press asked for it, never on an ordinary
     re-render — otherwise the page would yank itself to the grid on load. */
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)
      ?.focus({ preventScroll: true });
  }, [focusDay]);

  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
  /* An ARIA grid must nest grid > row > gridcell. The rows carry
     `display: contents` so the seven-column CSS grid is unaffected — the
     structure exists for assistive technology, not for layout. */
  const weeks = useMemo(
    () => Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)),
    [cells]
  );
  const weekDays = useMemo(() => weekOf(selectedDay), [selectedDay]);

  const monthHasItems = useMemo(
    () => cells.some((c) => c.inMonth && byDay.has(c.key)),
    [cells, byDay]
  );

  const upcoming = useMemo(
    () => visible.filter((e) => e.date >= todayKey),
    [visible, todayKey]
  );

  /* The same window bounds both grids. In week view the check is on the week
     the arrow would land on, not on the month cursor — otherwise the arrows
     stay enabled and walk the week past the end of the feed while the month
     label sits clamped at the boundary. */
  const weekStepInRange = (delta: number) => {
    const target = monthOf(addDays(selectedDay, delta * 7));
    return compareMonths(target, bounds.min) >= 0 && compareMonths(target, bounds.max) <= 0;
  };

  const canGoBack = view === "week" ? weekStepInRange(-1) : compareMonths(cursor, bounds.min) > 0;
  const canGoForward = view === "week" ? weekStepInRange(1) : compareMonths(cursor, bounds.max) < 0;

  const goToMonth = useCallback(
    (next: YearMonth) => {
      const clamped = clampMonth(next, bounds.min, bounds.max);
      setDirection(compareMonths(clamped, cursor) >= 0 ? 1 : -1);
      setCursor(clamped);
      return clamped;
    },
    [bounds, cursor]
  );

  /* One control pair drives both grids: in month view the arrows step a month,
     in week view they step a week — which is what the label says they do. */
  const step = useCallback(
    (delta: number) => {
      if (view === "week") {
        const next = addDays(selectedDay, delta * 7);
        const target = monthOf(next);
        if (compareMonths(target, bounds.min) < 0 || compareMonths(target, bounds.max) > 0) return;
        setDirection(delta);
        setSelectedDay(next);
        setFocusDay(next);
        setCursor(target);
        return;
      }
      goToMonth(addMonths(cursor, delta));
    },
    [view, selectedDay, cursor, goToMonth, bounds]
  );

  const goToday = useCallback(() => {
    goToMonth(todayMonth);
    setSelectedDay(todayKey);
    setFocusDay(todayKey);
  }, [goToMonth, todayMonth, todayKey]);

  const toggleSource = useCallback((s: CalendarSource) => {
    setSources((current) => {
      const next = new Set(current);
      /* never let both go off — an empty board looks broken rather than
         filtered, and there is no affordance saying why it is blank */
      if (next.has(s) && next.size === 1) return current;
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const selectDay = useCallback((dayISO: string) => {
    setSelectedDay(dayISO);
    setFocusDay(dayISO);
    setPanelOpen(true);
  }, []);

  /* Arrow keys walk the grid a day at a time, exactly as a native date picker
     does; the month follows the cursor when it walks off the edge. Without
     this the calendar is unusable without a mouse. */
  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const moves: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };

      let next: string | null = null;
      if (e.key in moves) next = addDays(focusDay, moves[e.key]);
      else if (e.key === "Home") next = weekOf(focusDay)[0];
      else if (e.key === "End") next = weekOf(focusDay)[6];
      else if (e.key === "PageUp" || e.key === "PageDown") {
        const delta = e.key === "PageUp" ? -1 : 1;
        const target = clampMonth(addMonths(monthOf(focusDay), delta), bounds.min, bounds.max);
        /* keep the day-of-month where possible; monthMatrix will simply not
           contain it for a short month, so fall back to the 1st */
        const candidate = `${target.year}-${String(target.month + 1).padStart(2, "0")}-${focusDay.slice(8)}`;
        next = monthOf(candidate).month === target.month ? candidate : `${candidate.slice(0, 8)}01`;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectDay(focusDay);
        return;
      } else if (e.key === "Escape") {
        setPanelOpen(false);
        return;
      } else {
        return;
      }

      e.preventDefault();
      const target = monthOf(next);
      if (compareMonths(target, bounds.min) < 0 || compareMonths(target, bounds.max) > 0) return;

      shouldFocus.current = true;
      setFocusDay(next);
      if (compareMonths(target, cursor) !== 0) goToMonth(target);
    },
    [focusDay, cursor, bounds, goToMonth, selectDay]
  );

  /* Swipe navigates time, the way every calendar app does. It used to flip
     between views, which meant a horizontal drag did the one thing a calendar
     never does with one. */
  const onSwipe = useCallback(
    (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) > 80) step(info.offset.x < 0 ? 1 : -1);
    },
    [step]
  );

  /* The period, in two weights: the part that changes as you navigate, and the
     year behind it. */
  const period = useMemo(() => {
    if (view === "upcoming") return { label: "Upcoming", year: "" };
    if (view === "week") return weekRangeLabel(weekDays[0], weekDays[6]);
    return { label: monthName(cursor), year: String(cursor.year) };
  }, [view, cursor, weekDays]);

  const selectedItems = byDay.get(selectedDay) ?? [];
  const ready = !isPending && !isError;

  /* Swipe belongs to the grids, not to the agenda: a horizontal drag on a
     vertical list of events has no meaning, and catching it there stole the
     gesture from the browser's own back navigation. */
  const dragProps =
    view === "upcoming" || reduced
      ? {}
      : {
          drag: "x" as const,
          dragConstraints: { left: 0, right: 0 },
          dragElastic: 0.06,
          dragDirectionLock: true,
          onDragEnd: onSwipe,
        };

  return (
    <section id="calendar" ref={sectionRef} className="bg-bg py-10 sm:py-14">
      <div className="mx-auto max-w-360 px-3 sm:px-5 lg:px-6">
        <div className="reveal">
          <PublicToolbar
            heading={period.label}
            subheading={period.year || undefined}
            view={view}
            onView={setView}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={goToday}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            stepLabel={view === "week" ? "week" : "month"}
            showNav={view !== "upcoming"}
            filters={
              ready
                ? {
                    sources,
                    counts,
                    onToggleSource: toggleSource,
                    people,
                    personKey,
                    onPerson: setPersonKey,
                  }
                : null
            }
          />
        </div>

        <div className={`reveal ${BOARD}`}>
          {isPending ? (
            <CalendarSkeleton view={view} />
          ) : isError ? (
            <CalendarErrorState onRetry={() => refetch()} />
          ) : (
            /* Keyed on the view so React swaps the subtree, with a short fade
               in and no exit. An AnimatePresence with mode="wait" here meant
               every view change spent 350ms showing nothing at all — the one
               thing the brief asks a calendar not to feel like. */
            <motion.div
              key={view}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.14 }}
              {...dragProps}
            >
              {view === "month" ? (
                <PublicMonthGrid
                  gridRef={gridRef}
                  label={monthLabel(cursor)}
                  weeks={weeks}
                  byDay={byDay}
                  todayKey={todayKey}
                  selectedDay={panelOpen ? selectedDay : null}
                  focusDay={focusDay}
                  hasItems={monthHasItems}
                  direction={direction}
                  reduced={reduced}
                  onSelectDay={selectDay}
                  onFocusDay={setFocusDay}
                  onKeyDown={onGridKeyDown}
                  onOpen={openEvent}
                />
              ) : view === "week" ? (
                <PublicWeekGrid
                  days={weekDays}
                  byDay={byDay}
                  todayKey={todayKey}
                  selectedDay={panelOpen ? selectedDay : null}
                  onSelectDay={selectDay}
                  onOpen={openEvent}
                />
              ) : (
                <PublicAgenda items={upcoming} todayKey={todayKey} onOpen={openEvent} />
              )}
            </motion.div>
          )}
        </div>

        {/* Day details */}
        {view !== "upcoming" && ready && (
          <>
            <div className="mt-3 sm:hidden">
              <DayDetail
                dayISO={selectedDay}
                items={selectedItems}
                isToday={selectedDay === todayKey}
                onOpen={openEvent}
              />
            </div>

            {/* On desktop the panel is hidden until a day is chosen, so the
                first selection used to shove everything below it down the
                page. A minimum height reserves the room the panel will take,
                and until then it holds the line that says how to open it. */}
            <div className="mt-3 hidden min-h-14 sm:block">
              <DayDetail
                dayISO={panelOpen ? selectedDay : null}
                items={selectedItems}
                isToday={selectedDay === todayKey}
                onOpen={openEvent}
                onClose={() => setPanelOpen(false)}
              />
              {!panelOpen && (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-xs text-cream-dim">
                  Select a day to see what is on it — click a cell, or use the arrow keys and
                  press Enter.
                </p>
              )}
            </div>

            {selectedPerson?.slug && (
              <BookingAvailability
                slug={selectedPerson.slug}
                name={selectedPerson.name}
                dayISO={selectedDay}
              />
            )}
          </>
        )}

        {/* The hint used to be printed here AND in the toolbar at lg, so on a
            wide screen the visitor was told twice, in two different wordings.
            It is only shown where the toolbar's copy is not: below lg. */}
        {view !== "upcoming" && (
          <p className="reveal mt-3 text-xs text-cream-dim lg:hidden">
            Select a day for details. Use the arrow keys to move around the grid, or swipe
            on a touch screen.
          </p>
        )}
      </div>
    </section>
  );
}
