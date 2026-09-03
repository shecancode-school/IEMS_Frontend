"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { bookingApi } from "@/services/booking";
import { bookingsService } from "@/services/admin";
import { adminKeys } from "@/hooks/admin/keys";
import { errorMessage } from "@/hooks/admin/util";
import { eventDayISO, formatEventTime } from "@/lib/time";
import { todayISO } from "@/lib/scheduling/range";
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
import { cn } from "@/lib/utils";

/* Booking someone in from the console.

   The case this exists for is a person standing at the desk, or on the phone:
   before this, staff had to send them away to the public page to book
   themselves. It reads the SAME public slots endpoint the visitor-facing page
   reads, so what a colleague is offered here is exactly what the outside world
   is offered — there is no privileged view of a host's day and no way to slip
   a booking into a time they are not free. */

export function BookForDialog({
  open,
  onOpenChange,
  defaultDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the day the calendar is showing, so the dialog opens where you were */
  defaultDay?: string;
}) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [day, setDay] = useState(defaultDay ?? todayISO());
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");

  /* reopening on a different day should not keep the old day's selection */
  useEffect(() => {
    if (!open) return;
    setDay(defaultDay ?? todayISO());
    setStart(null);
  }, [open, defaultDay]);

  const hosts = useQuery({
    queryKey: ["admin", "bookable-hosts"],
    queryFn: () => bookingApi.hosts().then((d) => d.hosts),
    enabled: open,
    staleTime: 60_000,
  });

  /* isLoading, not isPending: a disabled query never leaves "pending" */
  const slots = useQuery({
    queryKey: ["admin", "book-slots", slug, day],
    queryFn: () => bookingApi.slots(slug, day, day),
    enabled: open && Boolean(slug),
    /* availability is the one thing here that goes stale in seconds */
    staleTime: 15_000,
  });

  const times = useMemo(
    () => slots.data?.days.find((d) => d.day === day)?.slots ?? [],
    [slots.data, day]
  );

  const create = useMutation({
    mutationFn: () =>
      bookingsService.create({
        slug,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        topic: topic.trim() || undefined,
        start: start!,
      }),
    onSuccess: (data) => {
      toast.success(`Booked ${name.trim()} in with ${data.booking.hostName}`);
      qc.invalidateQueries({ queryKey: adminKeys.bookingsAll });
      qc.invalidateQueries({ queryKey: adminKeys.calendarAll });
      qc.invalidateQueries({ queryKey: ["admin", "my-calendar"] });
      /* the slot we just took must stop being offered */
      qc.invalidateQueries({ queryKey: ["admin", "book-slots"] });
      onOpenChange(false);
      setName("");
      setEmail("");
      setPhone("");
      setTopic("");
      setStart(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      /* a 409 means the slot went while the form was open — drop the dead
         selection so it cannot be resubmitted, and refetch the real list */
      setStart(null);
      slots.refetch();
    },
  });

  const ready = slug && start && name.trim().length >= 2 && /.+@.+\..+/.test(email.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book someone in</DialogTitle>
          <DialogDescription>
            For a walk-in or a phone call. They get the same confirmation email and cancel
            link as if they had booked themselves, and it lands on the host&apos;s calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-host">With</Label>
              <select
                id="book-host"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setStart(null);
                }}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">Choose a person…</option>
                {(hosts.data ?? []).map((h) => (
                  <option key={h.slug} value={h.slug}>
                    {h.name}
                    {h.title ? ` — ${h.title}` : ""}
                  </option>
                ))}
              </select>
              {hosts.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nobody is taking bookings yet — set that up under Availability.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-day">On</Label>
              <Input
                id="book-day"
                type="date"
                value={day}
                min={todayISO()}
                onChange={(e) => {
                  setDay(e.target.value || todayISO());
                  setStart(null);
                }}
              />
            </div>
          </div>

          {slug && (
            <div className="space-y-1.5">
              <Label>Open times</Label>
              {slots.isLoading ? (
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : slots.isError ? (
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t load their availability. Try again in a moment.
                </p>
              ) : times.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing free on {eventDayISO(`${day}T12:00:00.000Z`)}. Try another day.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {times.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        onClick={() => setStart(s.start)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                          start === s.start
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:border-primary"
                        )}
                      >
                        {formatEventTime(s.start)}
                      </button>
                    ))}
                  </div>
                  {/* stated, never smoothed over: without Google we are working
                      from the availability rules alone */}
                  {slots.data && !slots.data.complete && (
                    <p className="text-xs text-muted-foreground">
                      Their Google calendar could not be read, so one of these may already
                      be taken. The booking will be rejected if so.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-name">Their name</Label>
              <Input
                id="book-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aline Uwase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-email">Their email</Label>
              <Input
                id="book-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aline@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-phone">Phone (optional)</Label>
              <Input id="book-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-topic">What it is about (optional)</Label>
              <Input id="book-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
