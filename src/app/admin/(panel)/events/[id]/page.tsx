"use client";

import { AdminDetailSkeleton } from "@/components/admin/PageSkeletons";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RichText } from "@/components/RichText";
import {
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Send,
  Tag,
  Ticket as TicketIcon,
  Trash2,
  UserCheck,
  UserPlus,
  RotateCw,
  Users,
} from "lucide-react";
import {
  useEvent,
  useDeleteEvent,
  useUpdateEvent,
  useSendReminders,
  useEventEngagement,
  useRetryFailedEmails,
} from "@/hooks/admin/events";
import { useEventStats } from "@/hooks/admin/dashboard";
import type { EmailKind, EventEngagement } from "@/types/admin";
import { EventImage } from "@/components/admin/EventImage";
import { ActionMenu } from "@/components/admin/ActionMenu";
import { TicketArtwork } from "@/components/admin/TicketArtwork";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


import { formatEventDateTime } from "@/lib/time";

/* event times always render in Kigali time, matching what the admin typed */
const dt = (s: string) =>
  formatEventDateTime(s, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isPending } = useEvent(id);
  const stats = useEventStats();
  const engagement = useEventEngagement(id);
  const del = useDeleteEvent();
  const update = useUpdateEvent();
  const reminders = useSendReminders();

  if (isPending) return <AdminDetailSkeleton kind="event" />;
  if (!event)
    return (
      <EmptyState
        title="Event not found"
        message="It may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/events">Back to events</Link>
          </Button>
        }
      />
    );

  const s = stats.data?.stats.find((x) => x.event.id === id);
  const issued = s?.fullness.issued ?? 0;
  const capacity = event.maxAttendees;

  return (
    <div>
      <PageHeader
        title={event.name}
        crumbs={[{ label: "Events", href: "/admin/events" }, { label: event.name }]}
        actions={<ActionMenu actions={[
          { label: "Edit event", icon: <Pencil className="size-4" />, run: () => router.push(`/admin/events/${id}/edit`) },
          { label: event.isPublished ? "Unpublish" : "Publish", icon: <CalendarDays className="size-4" />, run: () => update.mutateAsync({ id, body: { isPublished: !event.isPublished } }) },
          { label: "Archive event", icon: <Clock className="size-4" />, run: () => update.mutateAsync({ id, body: { archived: true } }) },
          { label: "Send reminders", icon: <Send className="size-4" />, disabled: reminders.isPending, run: () => reminders.mutateAsync({ id }) },
          { label: "View participants", icon: <Users className="size-4" />, run: () => router.push(`/admin/attendees?event=${id}`) },
          { label: "Delete event", icon: <Trash2 className="size-4" />, confirm: { title: "Delete this event?", description: "Permanently removes the event and its participants, guests and tickets.", destructive: true }, run: async () => { await del.mutateAsync(id); router.push("/admin/events"); } },
        ]} />}
      />

      <EventImage
        thumbnail
        images={event.gallery}
        name={event.name}
        className="mb-6 h-48 w-full rounded-xl sm:h-64 lg:h-80"
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge value={event.status} />
        <Badge variant="outline" className="rounded-full capitalize">
          {event.type.toLowerCase()}
        </Badge>
        <Badge variant="outline" className="rounded-full">
          {event.category}
        </Badge>
        {!event.isPublished && (
          <Badge variant="outline" className="rounded-full text-muted-foreground">
            Unpublished
          </Badge>
        )}
      </div>


              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail icon={CalendarDays} label="Starts" value={dt(event.startTime)} />
                <Detail icon={Clock} label="Ends" value={event.endTime ? dt(event.endTime) : "—"} />
                <Detail icon={MapPin} label="Location" value={event.location || "—"} />
                <Detail icon={Tag} label="Price" value={event.price} />
                <Detail icon={Users} label="Organiser" value={event.organiser} />
                <Detail
                  icon={TicketIcon}
                  label="Capacity"
                  value={capacity === 0 ? "Uncapped" : `${issued} / ${capacity}`}
                />
                <Detail
                  icon={UserPlus}
                  label="Plus-one places"
                  value={
                    !event.plusOneLimit
                      ? `Unlimited (${event.plusOneSlotsTaken ?? 0} added)`
                      : (event.plusOneSlotsTaken ?? 0) >= event.plusOneLimit
                        ? `Full: ${event.plusOneLimit} / ${event.plusOneLimit}`
                        : `${event.plusOneSlotsTaken ?? 0} / ${event.plusOneLimit} added`
                  }
                />
              </dl>
              {event.details && (
                <div className="border-t border-border pt-4">
                  <RichText html={event.details} className="text-muted-foreground" />
                </div>
              )}
              {event.rules.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rules
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    {event.rules.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <EngagementCard eventId={id} data={engagement.data} loading={engagement.isPending} />

          <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TicketIcon className="size-4" />Ticket design</CardTitle></CardHeader><CardContent>
            <TicketArtwork ticket={{ name: "Attendee name", eventName: event.name, date: event.startTime, venue: event.location, images: event.gallery, organiser: event.organiser, subtitle: event.details, price: event.price }} />
          </CardContent></Card>
        </div>

        <div className="space-y-3">
          <StatCard icon={Users} tone="zinc" label="Registered" value={s?.totalAttendees ?? 0} loading={stats.isPending} />
          <StatCard icon={UserCheck} tone="green" label="Checked in" value={s?.checkedIn ?? 0} loading={stats.isPending} />
          <StatCard icon={TicketIcon} tone="orange" label="Tickets sent" value={s?.ticketsSent ?? 0} hint={`${s?.ticketsPending ?? 0} pending`} loading={stats.isPending} />
          <StatCard icon={Users} tone="blue" label="Attendance" value={`${s?.attendancePercentage ?? 0}%`} loading={stats.isPending} />
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/admin/attendees?event=${id}`}>View participants</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}

const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  MAGIC_LINK: "Verify email",
  CONFIRMATION: "Registration confirmed",
  PLUS_ONE_INVITE: "Plus-one invite",
  TICKET: "Event pass",
  TICKET_NUDGE: "Get your ticket",
  REMINDER: "Event reminder",
  PROGRESS_REMINDER: "Progress reminder",
  PLUS_ONE_REVOKED: "Plus-one removed",
  UPDATE: "Event update",
};

/* per-event engagement: who still needs a nudge, the plus-one split, and which
   emails have actually reached this event's people */
function EngagementCard({
  eventId,
  data,
  loading,
}: {
  eventId: string;
  data?: EventEngagement;
  loading: boolean;
}) {
  const retry = useRetryFailedEmails();
  const sentKinds = data
    ? (Object.entries(data.emails.byKind) as [EmailKind, EventEngagement["emails"]["byKind"][EmailKind]][])
        .filter(([, v]) => v.sent > 0 || v.failed > 0)
        .sort((a, b) => b[1].sent - a[1].sent)
    : [];

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Registration follow-up</CardTitle>
        {data && (
          <Badge variant="outline" className="rounded-full">
            {data.reminderPool.total} eligible for follow-up
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Current participant records" value={data?.funnel.total} loading={loading} />
          <MiniStat label="Participants with a plus-one" value={data?.plusOne.has} loading={loading} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reminder pool
          </p>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Verify email" value={data?.reminderPool.verifyEmail} loading={loading} />
            <MiniStat label="Finish profile" value={data?.reminderPool.finishProfile} loading={loading} />
            <MiniStat label="Invite plus-one" value={data?.reminderPool.invitePlusOne} loading={loading} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plus-ones
          </p>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Has plus-one" value={data?.plusOne.has} loading={loading} />
            <MiniStat label="No plus-one" value={data?.plusOne.none} loading={loading} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Retained email attempts {data ? `(${data.emails.total})` : ""}
          </p>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : sentKinds.length === 0 ? (
            <p className="text-muted-foreground">No retained email logs for these recipients. Older messages may have expired; ticket delivery counts above use the ticket records.</p>
          ) : (
            <div className="space-y-2">
              {sentKinds.map(([kind, v]) => (
                <div key={kind} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{EMAIL_KIND_LABEL[kind]}</span>
                  <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                    <span className="text-emerald-400">{v.sent} sent</span>
                    {v.stillFailing > 0 ? (
                      <span className="text-red-400">{v.stillFailing} still failing</span>
                    ) : (
                      v.failed > 0 && <span>{v.failed} failed, since resolved</span>
                    )}
                    {v.stillFailing > 0 && v.retryable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate({ id: eventId, kind })}
                      >
                        <RotateCw className={retry.isPending && retry.variables?.kind === kind ? "size-3 animate-spin" : "size-3"} />
                        Retry {v.stillFailing}
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xl font-semibold tabular-nums text-foreground">
        {loading ? "—" : (value ?? 0)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
