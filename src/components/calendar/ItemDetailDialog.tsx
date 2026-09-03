"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Trash2,
  User,
  Video,
} from "lucide-react";
import { bookingApi } from "@/services/booking";
import { useCalendarEvent } from "@/hooks/admin/calendar";
import {
  useBooking,
  useCancelBooking,
  useRescheduleBooking,
} from "@/hooks/admin/availability";
import { useDeleteEvent, useGenerateMeet, useUpdateEvent } from "@/hooks/admin/events";
import type { CalendarItem, EventMode } from "@/types/admin";
import { EVENT_MODES, EVENT_STATUSES } from "@/types/admin";
import {
  eventDayISO,
  formatEventDateTime,
  formatEventTime,
  isoToKigaliInput,
  kigaliInputToISO,
} from "@/lib/time";
import { todayISO } from "@/lib/scheduling/range";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCE_LABEL, SOURCE_STYLE } from "./colors";

/* What happens when you click a chip.

   Before this, exactly one of the four kinds of thing on the board could be
   opened: an activity. Clicking an event, a booking or a Google entry did
   nothing at all — the calendar showed you your week and then refused to let
   you act on any of it, which is the one thing a calendar is for.

   One dialog, dispatching on `item.source`, because the four are the same
   object to the person looking at them: a block of their time. What differs is
   what can be done to it, and that is a question of where the record actually
   lives:

     EVENT    ours. Editable here for the fields the calendar cares about;
              everything else (gallery, rules, attendees) stays on the event
              page, which this links to.
     BOOKING  ours, but half of it belongs to the person who booked. Movable
              and cancellable — both re-email them.
     GOOGLE   not ours. Read-only, with a link out. Writing to somebody's
              personal Google calendar from an org console is not a thing this
              product should quietly do.
     ACTIVITY handled by ActivityDialog, which is a full editor already.

   Redacted items never reach here: the chip refuses to open them and the
   server stripped the fields long before the browser saw them. */

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  canWrite,
  canEditEvent,
}: {
  item: CalendarItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** calendar:write — may move or cancel a booking they host */
  canWrite: boolean;
  /** ADMIN | CEO — the event routes are theirs alone */
  canEditEvent: boolean;
}) {
  const source = item?.source ?? null;
  /* chip ids are namespaced ("booking:<id>") so two sources can never collide */
  const rawId = item ? item.id.split(":").slice(1).join(":") : "";

  return (
    <Dialog open={open && Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {item && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    SOURCE_STYLE[item.source]
                  )}
                >
                  {SOURCE_LABEL[item.source]}
                </span>
                {item.status && (
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {item.status}
                  </span>
                )}
              </div>
              <DialogTitle className="text-left">{item.title}</DialogTitle>
              <DialogDescription className="text-left">
                {formatEventDateTime(item.start)} – {formatEventTime(item.end)} (Kigali time)
              </DialogDescription>
            </DialogHeader>

            <Facts item={item} />

            {source === "EVENT" && (
              <EventPanel
                id={rawId}
                canEdit={canEditEvent}
                onClose={() => onOpenChange(false)}
              />
            )}
            {source === "BOOKING" && (
              <BookingPanel id={rawId} canWrite={canWrite} onClose={() => onOpenChange(false)} />
            )}
            {source === "GOOGLE" && <GooglePanel item={item} />}

            {source === "GOOGLE" && (
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* The facts every source has, read straight off the chip — shown immediately
   rather than after the detail fetch, so the panel never opens empty. */
function Facts({ item }: { item: CalendarItem }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {item.ownerName && (
        <Fact icon={<User className="size-4" />} label="Who">
          {item.ownerName}
        </Fact>
      )}
      {item.location && (
        <Fact icon={<MapPin className="size-4" />} label="Where">
          {item.location}
        </Fact>
      )}
      {item.meetLink && (
        <Fact icon={<Video className="size-4" />} label="Meeting">
          <a
            href={item.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Join link
          </a>
        </Fact>
      )}
      {item.visibility && (
        <Fact icon={<Globe className="size-4" />} label="Visible to">
          {item.visibility === "PUBLIC"
            ? "The public site"
            : item.visibility === "ORG"
              ? "The organisation"
              : "Only you"}
        </Fact>
      )}
    </dl>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card/40 px-3 py-2">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="truncate">{children}</dd>
      </span>
    </div>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading…
    </p>
  );
}

/* ------------------------------------------------------------------ Event */

function EventPanel({
  id,
  canEdit,
  onClose,
}: {
  id: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { data: event, isPending, isError } = useCalendarEvent(id);
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const meet = useGenerateMeet();

  const [form, setForm] = useState({
    name: "",
    startTime: "",
    endTime: "",
    location: "",
    mode: "IN_PERSON" as EventMode,
    status: "DRAFT" as (typeof EVENT_STATUSES)[number],
    isPublished: false,
  });

  /* re-seed whenever the record changes underneath — the calendar is live, and
     a form still holding the old time after a colleague moved the event would
     silently move it back on the next save */
  useEffect(() => {
    if (!event) return;
    setForm({
      name: event.name,
      startTime: isoToKigaliInput(event.startTime),
      endTime: event.endTime ? isoToKigaliInput(event.endTime) : "",
      location: event.location,
      mode: event.mode,
      status: event.status as (typeof EVENT_STATUSES)[number],
      isPublished: event.isPublished,
    });
  }, [event]);

  if (isPending) return <Loading />;
  if (isError || !event) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        That event could not be loaded. It may have been deleted.
      </p>
    );
  }

  const save = () =>
    update.mutate({
      id,
      body: {
        name: form.name,
        startTime: kigaliInputToISO(form.startTime),
        endTime: form.endTime ? kigaliInputToISO(form.endTime) : null,
        location: form.location,
        mode: form.mode,
        status: form.status,
        isPublished: form.isPublished,
      },
    });

  return (
    <div className="space-y-4">
      {event.details && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{event.details}</p>
      )}

      <p className="text-sm text-muted-foreground">
        {event.registeredCount} registered
        {event.maxAttendees > 0 ? ` of ${event.maxAttendees}` : " · uncapped"} ·{" "}
        {event.isPublished ? "on the public site" : "not published"}
      </p>

      {canEdit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ev-name">Name</Label>
            <Input
              id="ev-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-start">Starts</Label>
            <Input
              id="ev-start"
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-end">Ends</Label>
            <Input
              id="ev-end"
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-location">Location</Label>
            <Input
              id="ev-location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-mode">Mode</Label>
            <select
              id="ev-mode"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as EventMode }))}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {EVENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-status">Status</Label>
            <select
              id="ev-status"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as (typeof EVENT_STATUSES)[number],
                }))
              }
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
              className="size-4"
            />
            On the public site
          </label>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only an administrator can change an event. You can still open it to see the full
          record.
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/admin/events/${id}`}>
              <ExternalLink className="size-4" />
              Open event
            </Link>
          </Button>
          {canEdit && event.mode !== "IN_PERSON" && (
            <Button
              variant="outline"
              disabled={meet.isPending}
              onClick={() => meet.mutate(id)}
            >
              <Video className="size-4" />
              {event.meetLink ? "Refresh link" : "Add meeting link"}
            </Button>
          )}
          {canEdit && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              }
              title={`Delete "${event.name}"?`}
              description="This removes the event and everything attached to it — tickets, guests and registrations. It cannot be undone."
              confirmLabel="Delete event"
              destructive
              onConfirm={async () => {
                await remove.mutateAsync(id);
                onClose();
              }}
            />
          )}
        </div>
        {canEdit && (
          <Button disabled={update.isPending || !form.name.trim()} onClick={save}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

/* ---------------------------------------------------------------- Booking */

function BookingPanel({
  id,
  canWrite,
  onClose,
}: {
  id: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const { data: booking, isPending, isError } = useBooking(id);
  const reschedule = useRescheduleBooking();
  const cancel = useCancelBooking();

  const [day, setDay] = useState<string>(todayISO());
  const [moving, setMoving] = useState(false);

  /* open the day picker where the booking currently is, not on today */
  useEffect(() => {
    if (booking) setDay(eventDayISO(booking.start));
  }, [booking]);

  const slug = booking?.hostSlug ?? "";
  /* the SAME public slots endpoint the visitor-facing page reads, so a move
     can never put someone into a time the host is not actually offering */
  const slots = useQuery({
    queryKey: ["admin", "book-slots", slug, day],
    queryFn: () => bookingApi.slots(slug, day, day),
    enabled: moving && Boolean(slug),
    staleTime: 15_000,
  });

  const times = useMemo(
    () => slots.data?.days.find((d) => d.day === day)?.slots ?? [],
    [slots.data, day]
  );

  if (isPending) return <Loading />;
  if (isError || !booking) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        That booking could not be loaded. It may have been cancelled.
      </p>
    );
  }

  const cancelled = booking.status === "CANCELLED";

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Fact icon={<User className="size-4" />} label="Booked by">
          {booking.requesterName}
        </Fact>
        <Fact icon={<Mail className="size-4" />} label="Email">
          {booking.requesterEmail}
        </Fact>
        {booking.requesterPhone && (
          <Fact icon={<Phone className="size-4" />} label="Phone">
            {booking.requesterPhone}
          </Fact>
        )}
        {booking.topic && (
          <Fact icon={<CalendarClock className="size-4" />} label="About">
            {booking.topic}
          </Fact>
        )}
      </dl>

      {cancelled && (
        <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm">
          Cancelled{booking.cancelledBy ? ` by the ${booking.cancelledBy.toLowerCase()}` : ""}.
        </p>
      )}

      {moving && !cancelled && (
        <div className="space-y-2 rounded-md border p-3">
          {!slug ? (
            <p className="text-sm text-muted-foreground">
              {booking.hostName ?? "That host"} is no longer taking bookings, so this cannot be
              moved. Cancel it and book again once availability is back on.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mv-day">Move to</Label>
                <Input
                  id="mv-day"
                  type="date"
                  value={day}
                  min={todayISO()}
                  onChange={(e) => setDay(e.target.value || todayISO())}
                />
              </div>

              {slots.isLoading ? (
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : times.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing free that day. Try another.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {times.map((s) => (
                    <Button
                      key={s.start}
                      variant="outline"
                      size="sm"
                      disabled={reschedule.isPending}
                      onClick={() =>
                        reschedule.mutate(
                          { id, start: s.start },
                          { onSuccess: () => setMoving(false) }
                        )
                      }
                    >
                      {formatEventTime(s.start)}
                    </Button>
                  ))}
                </div>
              )}

              {slots.data && !slots.data.complete && (
                <p className="text-xs text-muted-foreground">
                  Their Google calendar could not be read, so one of these may already be
                  taken. The move will be rejected if so.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Moving it emails {booking.requesterName} the new time and a fresh cancel link.
                The old link stops working.
              </p>
            </>
          )}
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="outline" asChild>
          <Link href="/admin/bookings">
            <ExternalLink className="size-4" />
            All bookings
          </Link>
        </Button>
        {canWrite && !cancelled && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setMoving((m) => !m)}>
              <CalendarClock className="size-4" />
              {moving ? "Keep this time" : "Reschedule"}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 className="size-4" />
                  Cancel booking
                </Button>
              }
              title={`Cancel ${booking.requesterName}'s booking?`}
              description="The slot is released, the Google entry is removed and they are emailed to say so."
              confirmLabel="Cancel booking"
              destructive
              onConfirm={async () => {
                await cancel.mutateAsync(id);
                onClose();
              }}
            />
          </div>
        )}
      </DialogFooter>
    </div>
  );
}

/* ----------------------------------------------------------------- Google */

function GooglePanel({ item }: { item: CalendarItem }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This one lives in your Google calendar, not in IEMS. It is shown here so your day is
        complete; changing it is done in Google.
      </p>
      {item.href && (
        <Button variant="outline" asChild>
          <a href={item.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Open in Google Calendar
          </a>
        </Button>
      )}
    </div>
  );
}
