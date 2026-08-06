"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Download,
  Eye,
  MoreHorizontal,
  RotateCcw,
  Send,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";
import { useTickets, useTicketAction, useExportTickets } from "@/hooks/admin/tickets";
import { useStickyFilters } from "@/hooks/admin/useStickyFilters";
import { TICKET_STATUSES, type AdminTicket } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EventPicker } from "@/components/admin/EventPicker";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function TicketsInner() {
  const router = useRouter();
  /* filters live in the URL + sessionStorage, so opening a ticket and coming
     back lands on the same selection */
  const { filters, setFilter, isFiltered } = useStickyFilters("tickets", {
    event: "all",
    status: "all",
    q: "",
  });
  const query = {
    event: filters.event === "all" ? undefined : filters.event,
    status: filters.status === "all" ? undefined : filters.status,
  };
  const { data, isPending, error, refetch } = useTickets(query);
  const action = useTicketAction();
  const exportCsv = useExportTickets();

  const columns: Column<AdminTicket>[] = [
    {
      id: "number",
      header: "Ticket",
      sortValue: (t) => t.ticketNumber,
      cell: (t) => (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {t.ticketNumber}
        </span>
      ),
    },
    {
      id: "holder",
      header: "Holder",
      sortValue: (t) => t.participantName.toLowerCase(),
      cell: (t) => (
        <div>
          <p className="font-medium text-foreground">{t.participantName}</p>
          <p className="text-xs text-muted-foreground">{t.ownerType}</p>
        </div>
      ),
    },
    {
      id: "event",
      header: "Event",
      cell: (t) => <span className="text-muted-foreground">{t.eventName ?? "—"}</span>,
    },
    { id: "status", header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
    {
      id: "sent",
      header: "Issued",
      sortValue: (t) => t.registeredAt,
      cell: (t) => (
        <span className="tabular-nums text-muted-foreground">
          {new Date(t.registeredAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => router.push(`/admin/tickets/${t.id}`)}>
              <Eye className="size-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => action.mutate({ id: t.id, action: "resend" })}>
              <Send className="size-4" />
              Resend email
            </DropdownMenuItem>
            <ConfirmDialog
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <RotateCcw className="size-4" />
                  Reset (new QR)
                </DropdownMenuItem>
              }
              title="Reset this ticket?"
              description="The old QR code stops working and a brand-new pass is emailed to the holder."
              confirmLabel="Reset ticket"
              onConfirm={async () => {
                await action.mutateAsync({ id: t.id, action: "reset" });
              }}
            />
            {t.status !== "REVOKED" && (
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Ban className="size-4" />
                    Revoke
                  </DropdownMenuItem>
                }
                title="Revoke this ticket?"
                description="The pass is invalidated and its seat is freed."
                confirmLabel="Revoke"
                destructive
                onConfirm={async () => {
                  await action.mutateAsync({ id: t.id, action: "revoke" });
                }}
              />
            )}
            <DropdownMenuSeparator />
            <ConfirmDialog
              trigger={
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              }
              title="Delete this ticket?"
              description="Permanently removes the ticket record and frees its seat."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await action.mutateAsync({ id: t.id, action: "delete" });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Every issued pass — resend, reset, revoke or generate new ones."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportCsv.mutate({ ...query, q: filters.q || undefined })}
              disabled={exportCsv.isPending || (data ?? []).length === 0}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button asChild>
              <Link href="/admin/tickets/new">
                <TicketIcon className="size-4" />
                Generate ticket
              </Link>
            </Button>
          </>
        }
      />

      {isPending ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 && !isFiltered ? (
        <EmptyState
          icon={<TicketIcon className="size-5" />}
          title="No tickets"
          message="Tickets appear here once participants complete registration or you add guests."
          action={
            <Button asChild>
              <Link href="/admin/tickets/new">Generate ticket</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(t) => t.id}
          onRowClick={(t) => router.push(`/admin/tickets/${t.id}`)}
          searchable={(t) => `${t.ticketNumber} ${t.participantName} ${t.eventName ?? ""}`}
          searchPlaceholder="Search by number or holder…"
          searchValue={filters.q}
          onSearchChange={(v) => setFilter("q", v)}
          pageSize={12}
          toolbar={
            <>
              <EventPicker
                value={filters.event}
                onValueChange={(v) => setFilter("event", v)}
                includeAll
                className="h-9 w-42.5"
              />
              <Select value={filters.status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger className="h-9 w-32.5">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {TICKET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      )}
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<TableSkeleton cols={6} />}>
      <TicketsInner />
    </Suspense>
  );
}
