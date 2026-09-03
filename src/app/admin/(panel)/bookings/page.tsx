"use client";

import Link from "next/link";
import { CalendarClock, ExternalLink, Video, X } from "lucide-react";
import { useAvailability, useBookings, useCancelBooking } from "@/hooks/admin/availability";
import type { AdminBooking } from "@/services/admin";
import { appUrl } from "@/lib/appUrl";
import { formatEventDate, formatEventTime } from "@/lib/time";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-900",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function BookingsPage() {
  const { data, isPending, error, refetch } = useBookings();
  const { data: availability } = useAvailability();
  const cancel = useCancelBooking();

  const bookings = data?.bookings ?? [];
  const upcoming = bookings.filter((b) => b.status !== "CANCELLED" && b.start > new Date().toISOString());

  const columns: Column<AdminBooking>[] = [
    {
      id: "when",
      header: "When",
      sortValue: (b) => b.start,
      cell: (b) => (
        <div>
          <p className="font-medium text-foreground">{formatEventDate(b.start, { month: "short", day: "numeric", year: "numeric" })}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatEventTime(b.start)} – {formatEventTime(b.end)}
          </p>
        </div>
      ),
    },
    {
      id: "who",
      header: "Who",
      sortValue: (b) => b.requesterName.toLowerCase(),
      cell: (b) => (
        <div>
          <p className="font-medium text-foreground">{b.requesterName}</p>
          <p className="text-xs text-muted-foreground">{b.requesterEmail}</p>
        </div>
      ),
    },
    {
      id: "topic",
      header: "About",
      cell: (b) => (
        <p className="max-w-xs truncate text-sm text-muted-foreground">{b.topic || "—"}</p>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (b) => (
        <Badge className={`rounded-full border-transparent ${STATUS_TONE[b.status]}`}>
          {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-32",
      cell: (b) => (
        <div className="flex justify-end gap-1">
          {b.meetLink && (
            <Button asChild variant="ghost" size="icon" className="size-8" title="Join the Meet">
              <a href={b.meetLink} target="_blank" rel="noopener noreferrer">
                <Video className="size-4" />
              </a>
            </Button>
          )}
          {b.status !== "CANCELLED" && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon" className="size-8 text-red-600" title="Cancel">
                  <X className="size-4" />
                </Button>
              }
              title={`Cancel ${b.requesterName}'s booking?`}
              description="They will be emailed to let them know, the Google Calendar entry is removed, and the slot opens up again."
              confirmLabel="Cancel booking"
              destructive
              onConfirm={async () => {
                await cancel.mutateAsync(b.id);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bookings"
        description={
          upcoming.length
            ? `${upcoming.length} upcoming ${upcoming.length === 1 ? "meeting" : "meetings"} booked with you.`
            : "One-to-one meetings people have booked with you."
        }
        actions={
          availability?.bookable ? (
            <Button asChild variant="outline">
              <a href={appUrl(`/book/${availability.slug}`)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                View my booking page
              </a>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/admin/settings/availability">
                <CalendarClock className="size-4" />
                Set up bookings
              </Link>
            </Button>
          )
        }
      />

      {isPending ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-5" />}
          title="No bookings yet"
          message={
            availability?.bookable
              ? "Share your booking link and meetings will appear here."
              : "Turn on bookings in Availability, then share your link."
          }
          action={
            <Button asChild>
              <Link href="/admin/settings/availability">Availability settings</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={bookings}
          columns={columns}
          getRowId={(b) => b.id}
          searchable={(b) => `${b.requesterName} ${b.requesterEmail} ${b.topic}`}
          searchPlaceholder="Search bookings…"
        />
      )}
    </div>
  );
}
