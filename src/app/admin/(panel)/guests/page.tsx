"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react";
import { useGuests, useDeleteGuest, useExportGuests } from "@/hooks/admin/guests";
import { useStickyFilters } from "@/hooks/admin/useStickyFilters";
import { GUEST_TYPES, type AdminGuest } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { EventPicker } from "@/components/admin/EventPicker";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { anonymousAvatar } from "@/lib/anonymousAvatar";
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

function GuestsInner() {
  const router = useRouter();
  /* filters live in the URL + sessionStorage, so leaving for a guest profile
     and coming back lands on the same selection */
  const { filters, setFilter, isFiltered } = useStickyFilters("guests", {
    event: "all",
    type: "all",
    q: "",
  });
  const query = {
    event: filters.event === "all" ? undefined : filters.event,
    type: filters.type === "all" ? undefined : filters.type,
  };
  const { data, isPending, error, refetch } = useGuests(query);
  const del = useDeleteGuest();
  const exportCsv = useExportGuests();

  const columns: Column<AdminGuest>[] = [
    {
      id: "name",
      header: "Guest",
      sortValue: (g) => g.name.toLowerCase(),
      cell: (g) => {
        const a = anonymousAvatar(g.name);
        return (
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback style={{ backgroundColor: a.bg }} className="text-base">
                <span aria-hidden="true">{a.emoji}</span>
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{g.name}</p>
              <p className="truncate text-xs text-muted-foreground">{g.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      cell: (g) => (
        <Badge variant="outline" className="rounded-xl text-xs capitalize">
          {g.guestType.toLowerCase().replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      id: "event",
      header: "Event",
      cell: (g) => <span className="text-muted-foreground">{g.eventName ?? "—"}</span>,
    },
    {
      id: "invitedBy",
      header: "Invited by",
      cell: (g) => (
        <span className="text-muted-foreground">{g.invitedBy ?? "Admin"}</span>
      ),
    },
    {
      id: "ticket",
      header: "Ticket",
      cell: (g) =>
        g.ticket ? (
          <StatusBadge value={g.ticket.status} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (g) => (
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
            <DropdownMenuItem onClick={() => router.push(`/admin/guests/${g.id}`)}>
              <Eye className="size-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/admin/guests/${g.id}/edit`)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
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
              title="Delete this guest?"
              description="Removes the guest and their ticket, and frees the seat."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await del.mutateAsync(g.id);
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
        title="Guests"
        description="VIPs, speakers, sponsors and plus-ones — ticketed on the spot."
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
              <Link href="/admin/guests/new">
                <UserPlus className="size-4" />
                Add guest
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
          icon={<UserPlus className="size-5" />}
          title="No guests yet"
          message="Add a VIP, speaker or sponsor — their ticket is emailed instantly."
          action={
            <Button asChild>
              <Link href="/admin/guests/new">
                <UserPlus className="size-4" />
                Add guest
              </Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(g) => g.id}
          onRowClick={(g) => router.push(`/admin/guests/${g.id}`)}
          searchable={(g) => `${g.name} ${g.email}`}
          searchPlaceholder="Search guests…"
          searchValue={filters.q}
          onSearchChange={(v) => setFilter("q", v)}
          toolbar={
            <>
              <EventPicker
                value={filters.event}
                onValueChange={(v) => setFilter("event", v)}
                includeAll
                className="h-9 w-42.5"
              />
              <Select value={filters.type} onValueChange={(v) => setFilter("type", v)}>
                <SelectTrigger className="h-9 w-37.5">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {GUEST_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
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

export default function GuestsPage() {
  return (
    <Suspense fallback={<TableSkeleton cols={6} />}>
      <GuestsInner />
    </Suspense>
  );
}
