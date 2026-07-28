"use client";

/* eslint-disable @next/next/no-img-element */
import { use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RichText } from "@/components/RichText";
import {
  CalendarDays,
  Clock,
  ImagePlus,
  MapPin,
  MoreHorizontal,
  Pencil,
  Send,
  Tag,
  Ticket as TicketIcon,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import {
  useEvent,
  useDeleteEvent,
  useUpdateEvent,
  useUploadEventImage,
  useSendReminders,
  useEventEngagement,
} from "@/hooks/admin/events";
import { useEventStats } from "@/hooks/admin/dashboard";
import type { EmailKind, EventEngagement } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const upload = useUploadEventImage();
  const reminders = useSendReminders();
  const fileRef = useRef<HTMLInputElement>(null);

  if (isPending) return <TableSkeleton rows={5} cols={2} />;
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
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/events/${id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() =>
                    update.mutate({ id, body: { isPublished: !event.isPublished } })
                  }
                >
                  {event.isPublished ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => update.mutate({ id, body: { archived: true } })}>
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => reminders.mutate({ id })}
                  disabled={reminders.isPending}
                >
                  <Send className="size-4" />
                  Send reminders
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="size-4" />
                      Delete event
                    </DropdownMenuItem>
                  }
                  title="Delete this event?"
                  description="This permanently removes the event and all its participants, guests and tickets."
                  confirmLabel="Delete event"
                  destructive
                  onConfirm={async () => {
                    await del.mutateAsync(id);
                    router.push("/admin/events");
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
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

          <EngagementCard data={engagement.data} loading={engagement.isPending} />

          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Gallery</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                <ImagePlus className="size-4" />
                {upload.isPending ? "Uploading…" : "Add image"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate({ id, file });
                  e.target.value = "";
                }}
              />
            </CardHeader>
            <CardContent>
              {event.gallery.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No images yet. Add one to feature this event.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {event.gallery.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="aspect-video w-full rounded-md border border-border object-cover"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
function EngagementCard({ data, loading }: { data?: EventEngagement; loading: boolean }) {
  const sentKinds = data
    ? (Object.entries(data.emails.byKind) as [EmailKind, { sent: number; failed: number }][])
        .filter(([, v]) => v.sent > 0 || v.failed > 0)
        .sort((a, b) => b[1].sent - a[1].sent)
    : [];

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Engagement</CardTitle>
        {data && (
          <Badge variant="outline" className="rounded-full">
            {data.reminderPool.total} to nudge
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Applicants" value={data?.funnel.total} loading={loading} />
          <MiniStat label="Plus-ones" value={data?.plusOne.has} loading={loading} />
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
            Emails sent {data ? `(${data.emails.total})` : ""}
          </p>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : sentKinds.length === 0 ? (
            <p className="text-muted-foreground">No emails have reached this event&apos;s people yet.</p>
          ) : (
            <div className="space-y-2">
              {sentKinds.map(([kind, v]) => (
                <div key={kind} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{EMAIL_KIND_LABEL[kind]}</span>
                  <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                    <span className="text-green-700">{v.sent} sent</span>
                    {v.failed > 0 && <span className="text-red-600">{v.failed} failed</span>}
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
