"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { useAdminAuth } from "@/context/AuthContext";
import { useCalendar, useCalendarPeople, useLiveCalendar } from "@/hooks/admin/calendar";
import { useCan } from "@/hooks/admin/staff";
import { isPrivileged, type AdminRole } from "@/types/admin";
import type { CalendarItem } from "@/types/admin";
import { addDaysISO, eventDayISO } from "@/lib/time";
import { shiftAnchor, todayISO, viewRange } from "@/lib/scheduling/range";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState } from "@/components/admin/states";
import { ActivityDialog } from "@/components/calendar/ActivityDialog";
import { BookForDialog } from "@/components/calendar/BookForDialog";
import {
  CalendarToolbar,
  rangeLabel,
  type CalendarView,
  type SourceFilter,
} from "@/components/calendar/CalendarToolbar";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { CalendarNotice, CalendarSkeleton } from "@/components/calendar/CalendarStates";
import { ItemDetailDialog } from "@/components/calendar/ItemDetailDialog";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { TimeGrid, type Track } from "@/components/calendar/TimeGrid";
import { SOURCES, personColor } from "@/components/calendar/colors";
import { useCalendarShortcuts } from "@/components/calendar/useCalendarShortcuts";
import { Button } from "@/components/ui/button";

function OrgCalendar() {
  const params = useSearchParams();
  const { user } = useAdminAuth();
  const allow = useCan(user?.role);
  const canWrite = allow("calendar:write");

  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(todayISO());
  /* Month view selects a day rather than navigating on every click. Without
     this the grid had no selected state at all — you could pick a day and the
     board never showed which one. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  /* Which of the four kinds of thing are on the board. All four to begin with;
     the point of the control is that a Google-heavy week can be reduced to
     just the work that lives in this system. */
  const [sources, setSources] = useState<SourceFilter>(() => new Set(SOURCES));
  /* the sidebar's quick action links here with ?new=1 for calendar-only roles */
  const [dialogOpen, setDialogOpen] = useState(params.get("new") === "1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultSlot, setDefaultSlot] = useState<{ day: string; time: string } | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  /* the chip you clicked, for every source that is not an activity */
  const [detail, setDetail] = useState<CalendarItem | null>(null);

  /* the board refetches itself whenever anything on the calendar changes,
     anywhere — no reload, no refresh button */
  useLiveCalendar();

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const { data: people } = useCalendarPeople();
  const { data, isPending, error, refetch } = useCalendar({
    ...range,
    people: selected,
    /* your own Google events belong on your lane here too — everyone else's
       calendar is only ever read as busy blocks, server-side */
    includeGoogle: true,
  });

  /* memoised because `?? []` would otherwise be a fresh array on every
     render, defeating the track memo below */
  const all = useMemo(() => data?.items ?? [], [data?.items]);

  /* Counts are of everything the feed returned, not of what survives the
     filter — a chip reading "Google 0" when Google is switched off would be
     telling you the wrong thing about the week. */
  const sourceCounts = useMemo(() => {
    const counts = { EVENT: 0, ACTIVITY: 0, BOOKING: 0, GOOGLE: 0 };
    for (const item of all) counts[item.source] += 1;
    return counts;
  }, [all]);

  const items = useMemo(() => all.filter((it) => sources.has(it.source)), [all, sources]);

  const toggleSource = useCallback((s: CalendarItem["source"]) => {
    setSources((current) => {
      const next = new Set(current);
      /* never let the last one go off — an empty board looks broken rather
         than filtered, and nothing on screen says why it is blank */
      if (next.has(s) && next.size === 1) return current;
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const tracks: Track[] = useMemo(() => {
    if (view === "month") return [];
    if (view === "week") {
      /* week view: one column per day, everyone mixed together */
      return Array.from({ length: 7 }, (_, i) => {
        const day = addDaysISO(range.from, i);
        return {
          id: day,
          label: new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short" }),
          sublabel: day.slice(-2),
          dayISO: day,
          highlight: day === todayISO(),
          items: items.filter((it) => eventDayISO(it.start) === day),
        };
      });
    }
    /* day view: one column per person — the "who is doing what today" board.

       `showBusy` only asks for the badge; TimeGrid decides free vs busy from
       the blocks already in the lane. Reading the clock here instead would be
       impure in render AND wrong a minute later, because this memo only
       recomputes when the items change. */
    const lanes = (data?.people ?? []).map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: p.title ?? undefined,
      dayISO: anchor,
      accent: personColor(p.id),
      highlight: p.id === user?.id,
      showBusy: true,
      items: items.filter((it) => it.ownerId === p.id),
    }));
    const orphans = items.filter((it) => !it.ownerId);
    return orphans.length
      ? [...lanes, { id: "_org", label: "Organisation", dayISO: anchor, items: orphans }]
      : lanes;
  }, [view, range.from, items, data?.people, anchor, user?.id]);

  const openNew = () => {
    setEditingId(null);
    setDefaultSlot(null);
    setDialogOpen(true);
  };

  const openItem = (item: CalendarItem) => {
    /* Every chip opens now. It used to be activities only — clicking an event,
       a booking or a Google entry did nothing at all.

       Activities go to ActivityDialog because that is already a full editor;
       everything else goes to the detail panel, which decides for itself what
       may be done to that source. Chip ids are namespaced ("activity:<id>") so
       two sources can never collide. Redacted blocks never get here: the chip
       refuses to fire onSelect for them. */
    if (item.redacted) return;
    if (item.source === "ACTIVITY") {
      setEditingId(item.id.split(":")[1]);
      setDefaultSlot(null);
      setDialogOpen(true);
      return;
    }
    setDetail(item);
  };

  /* Clicking an empty hour is how you say "here" on a calendar. Every other
     calendar does it; this board had a New activity button and no way to point
     at a time. */
  const openSlot = (day: string, time: string) => {
    if (!canWrite) return;
    setEditingId(null);
    setDefaultSlot({ day, time });
    setDialogOpen(true);
  };

  const prev = useCallback(() => setAnchor((a) => shiftAnchor(view, a, -1)), [view]);
  const next = useCallback(() => setAnchor((a) => shiftAnchor(view, a, 1)), [view]);
  const goToday = useCallback(() => setAnchor(todayISO()), []);

  useCalendarShortcuts({
    onView: setView,
    onPrev: prev,
    onNext: next,
    onToday: goToday,
    enabled: !dialogOpen && !bookOpen && !detail,
  });

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Everything the organization has on events, classes, mentorship and meetings, by person and by day."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {/* the walk-in path: take a booking without sending the person
                  away to the public page */}
              <Button variant="outline" onClick={() => setBookOpen(true)} className="cursor-pointer">
                <CalendarClock className="size-4" />
                Book someone in
              </Button>
              <Button onClick={openNew} className="cursor-pointer">
                <Plus className="size-4" />
                New activity
              </Button>
            </div>
          ) : undefined
        }
      />

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        rangeLabel={rangeLabel(view, anchor)}
        onPrev={prev}
        onNext={next}
        onToday={goToday}
        people={people}
        selected={selected}
        onSelectedChange={setSelected}
        sources={sources}
        sourceCounts={sourceCounts}
        onToggleSource={toggleSource}
      />

      {data?.googleError && <CalendarNotice tone="warning">{data.googleError}</CalendarNotice>}

      {isPending ? (
        <CalendarSkeleton view={view} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : view === "month" ? (
        <MonthGrid
          anchorISO={anchor}
          items={items}
          selectedDay={selectedDay}
          onSelect={openItem}
          onPickDay={setSelectedDay}
          onOpenDay={(day) => {
            setAnchor(day);
            setSelectedDay(day);
            setView("day");
          }}
          onAnchorChange={setAnchor}
          onEscape={() => setSelectedDay(null)}
        />
      ) : (
        <TimeGrid
          tracks={tracks}
          onSelect={openItem}
          onPickSlot={canWrite ? openSlot : undefined}
          /* Day view is one column per member of staff. Twelve people do not
             compress into 390px, so this is the one view that earns a
             sideways scroll. */
          scrollX={view === "day"}
          emptyMessage={
            view === "day"
              ? "No staff accounts to show. Add people under Staff."
              : "Nothing scheduled this week."
          }
        />
      )}

      <CalendarLegend className="mt-3" />

      <ItemDetailDialog
        item={detail}
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        canWrite={canWrite}
        canEditEvent={isPrivileged(user?.role as AdminRole | undefined)}
      />

      <BookForDialog open={bookOpen} onOpenChange={setBookOpen} defaultDay={anchor} />

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activityId={editingId}
        people={people}
        defaultDayISO={defaultSlot?.day ?? (view === "month" ? undefined : anchor)}
        defaultTime={defaultSlot?.time}
      />
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton view="week" />}>
      <OrgCalendar />
    </Suspense>
  );
}
