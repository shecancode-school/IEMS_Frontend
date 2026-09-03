"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Plus } from "lucide-react";
import { useAdminAuth } from "@/context/AuthContext";
import { useMyCalendar, useLiveCalendar } from "@/hooks/admin/calendar";
import { useGoogleStatus } from "@/hooks/admin/google";
import { useCan } from "@/hooks/admin/staff";
import { isPrivileged, type AdminRole, type CalendarItem } from "@/types/admin";
import { addDaysISO, eventDayISO } from "@/lib/time";
import { shiftAnchor, todayISO, viewRange } from "@/lib/scheduling/range";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState } from "@/components/admin/states";
import { ActivityDialog } from "@/components/calendar/ActivityDialog";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { CalendarNotice, CalendarSkeleton } from "@/components/calendar/CalendarStates";
import { ItemDetailDialog } from "@/components/calendar/ItemDetailDialog";
import { CalendarToolbar, rangeLabel, type CalendarView } from "@/components/calendar/CalendarToolbar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { SubscribeDialog } from "@/components/calendar/SubscribeDialog";
import { TimeGrid, type Track } from "@/components/calendar/TimeGrid";
import { useCalendarShortcuts } from "@/components/calendar/useCalendarShortcuts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function MySchedulePage() {
  const { user } = useAdminAuth();
  const allow = useCan(user?.role);
  const canWrite = allow("calendar:write");

  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(todayISO());
  /* Month view selects a day rather than navigating on every click. Without
     this the grid had no selected state at all — you could pick a day and the
     board never showed which one. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showGoogle, setShowGoogle] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultSlot, setDefaultSlot] = useState<{ day: string; time: string } | null>(null);
  /* the chip you clicked, for every source that is not an activity */
  const [detail, setDetail] = useState<CalendarItem | null>(null);

  /* live: your schedule reflects a booking someone just took without you
     having to reload the page */
  useLiveCalendar();

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const { data: google } = useGoogleStatus();
  const { data, isPending, error, refetch } = useMyCalendar({
    ...range,
    includeGoogle: showGoogle,
  });

  /* memoised because `?? []` would otherwise be a fresh array on every
     render, defeating the track memo below */
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  /* one column per day in both day and week view — this page is about one
     person, so people-lanes would be a single column of wasted space */
  const tracks: Track[] = useMemo(() => {
    if (view === "month") return [];
    const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDaysISO(range.from, i));
    return days.map((day) => ({
      id: day,
      label: new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short" }),
      sublabel: day.slice(-2),
      dayISO: day,
      highlight: day === todayISO(),
      items: items.filter((it) => eventDayISO(it.start) === day),
    }));
  }, [view, anchor, range.from, items]);

  /* Every chip opens. Activities go to the full editor; an event, a booking
     someone took with you, or your own Google entry go to the detail panel,
     which decides what may be done to that source. */
  const openItem = (item: CalendarItem) => {
    if (item.redacted) return;
    if (item.source === "ACTIVITY") {
      setEditingId(item.id.split(":")[1]);
      setDefaultSlot(null);
      setDialogOpen(true);
      return;
    }
    setDetail(item);
  };

  /* Clicking an empty hour is how you say "here" on a calendar. */
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
    enabled: !dialogOpen && !detail,
  });

  return (
    <div>
      <PageHeader
        title="My schedule"
        description="Your IEMS activities and the events you run, alongside your own Google Calendar."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditingId(null);
                setDefaultSlot(null);
                setDialogOpen(true);
              }}
              className="cursor-pointer"
            >
              <Plus className="size-4" />
              New activity
            </Button>
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
        right={
          <>
            <SubscribeDialog />
            {google?.connected ? (
              <div className="flex items-center gap-2">
                <Switch id="google" checked={showGoogle} onCheckedChange={setShowGoogle} />
                <Label htmlFor="google" className="text-sm font-normal text-muted-foreground">
                  Google events
                </Label>
              </div>
            ) : null}
          </>
        }
      />

      {google && !google.connected && google.available && (
        <CalendarNotice>
          <span className="flex-1">
            Connect your Google Calendar to see your real commitments here and so nobody books
            you when you are already busy.
          </span>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link href="/admin/settings/google">
              <Link2 className="size-4" />
              Connect
            </Link>
          </Button>
        </CalendarNotice>
      )}

      {data?.googleError && (
        <CalendarNotice tone="warning">
          <span>
            {data.googleError}{" "}
            <Link href="/admin/settings/google" className="font-medium underline">
              Reconnect
            </Link>
          </span>
        </CalendarNotice>
      )}

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
          emptyMessage="Nothing on your schedule."
        />
      )}

      {/* This page shows the same four source colours as the org calendar and
          used to explain none of them — it had no legend at all. */}
      <CalendarLegend className="mt-3" sources />

      <ItemDetailDialog
        item={detail}
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        canWrite={canWrite}
        canEditEvent={isPrivileged(user?.role as AdminRole | undefined)}
      />

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activityId={editingId}
        defaultDayISO={defaultSlot?.day ?? (view === "month" ? undefined : anchor)}
        defaultTime={defaultSlot?.time}
      />
    </div>
  );
}
