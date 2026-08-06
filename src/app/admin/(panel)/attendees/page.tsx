"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, MoreHorizontal, Check, X, Eye, Trash2, UserPlus, Users } from "lucide-react";
import {
  useParticipants,
  useSetRegistrationStatus,
  useDeleteParticipant,
  useExportParticipants,
} from "@/hooks/admin/participants";
import { useStickyFilters } from "@/hooks/admin/useStickyFilters";
import {
  PARTICIPANT_STATUSES,
  REGISTRATION_STATUSES,
  STACKS,
  type AdminParticipant,
} from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

/* two-letter monogram for participants without a photo */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function ParticipantsInner() {
  const router = useRouter();
  /* filters live in the URL + sessionStorage, so leaving for a participant
     profile and coming back lands on the same selection */
  const { filters, setFilter, isFiltered } = useStickyFilters("participants", {
    event: "all",
    registration: "all",
    status: "all",
    stack: "all",
    plusOne: "all",
    q: "",
  });
  const query = {
    event: filters.event === "all" ? undefined : filters.event,
    registrationStatus: filters.registration === "all" ? undefined : filters.registration,
    status: filters.status === "all" ? undefined : filters.status,
    stack: filters.stack === "all" ? undefined : filters.stack,
    plusOne: filters.plusOne === "all" ? undefined : filters.plusOne,
  };
  const { data, isPending, error, refetch } = useParticipants(query);
  const setReg = useSetRegistrationStatus();
  const del = useDeleteParticipant();
  const exportCsv = useExportParticipants();

  const columns: Column<AdminParticipant>[] = [
    {
      id: "name",
      header: "Participant",
      sortValue: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Avatar>
            {p.profilePicture && <AvatarImage src={p.profilePicture} alt="" />}
            <AvatarFallback>{initials(p.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{p.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: "event",
      header: "Event",
      cell: (p) => <span className="text-muted-foreground">{p.event?.name ?? "—"}</span>,
    },
    {
      id: "stack",
      header: "Stack",
      cell: (p) => (
        <span className="text-xs capitalize text-muted-foreground">
          {p.stack ? p.stack.toLowerCase() : "—"}
        </span>
      ),
    },
    { id: "status", header: "Verification", cell: (p) => <StatusBadge value={p.status} /> },
    {
      id: "registration",
      header: "Registration",
      cell: (p) =>
        p.registrationStatus ? (
          <StatusBadge value={p.registrationStatus} />
        ) : (
          <span className="text-xs text-muted-foreground">archived</span>
        ),
    },
    {
      id: "ticket",
      header: "Ticket",
      cell: (p) =>
        p.ticket ? (
          <StatusBadge value={p.ticket.status} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (p) =>
        p.registrationStatus ? (
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
              <DropdownMenuItem onClick={() => router.push(`/admin/attendees/${p.id}`)}>
                <Eye className="size-4" />
                View
              </DropdownMenuItem>
              {p.registrationStatus !== "APPROVED" && (
                <DropdownMenuItem
                  disabled={setReg.isPending}
                  onClick={() => setReg.mutate({ id: p.id, registrationStatus: "APPROVED" })}
                >
                  <Check className="size-4" />
                  Approve
                </DropdownMenuItem>
              )}
              {p.registrationStatus !== "REJECTED" && (
                <DropdownMenuItem
                  disabled={setReg.isPending}
                  onClick={() => setReg.mutate({ id: p.id, registrationStatus: "REJECTED" })}
                >
                  <X className="size-4" />
                  Reject
                </DropdownMenuItem>
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
                title="Delete this participant?"
                description="Removes the participant, their plus-one and tickets. Frees any held seats."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  await del.mutateAsync(p.id);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Participants"
        description="Everyone registered across your events — approve, edit or export."
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
              <Link href="/admin/attendees/new">
                <UserPlus className="size-4" />
                Add participant
              </Link>
            </Button>
          </>
        }
      />

      {isPending ? (
        <TableSkeleton cols={7} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 && !isFiltered ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No participants"
          message="No one matches these filters yet."
          action={
            <Button asChild>
              <Link href="/admin/attendees/new">
                <UserPlus className="size-4" />
                Add participant
              </Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(p) => p.id}
          onRowClick={(p) => p.registrationStatus && router.push(`/admin/attendees/${p.id}`)}
          searchable={(p) => `${p.name} ${p.email} ${p.phone ?? ""}`}
          searchPlaceholder="Search participants…"
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
              <Select
                value={filters.registration}
                onValueChange={(v) => setFilter("registration", v)}
              >
                <SelectTrigger className="h-9 w-37.5">
                  <SelectValue placeholder="Registration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All registrations</SelectItem>
                  {REGISTRATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger className="h-9 w-35">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PARTICIPANT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.stack} onValueChange={(v) => setFilter("stack", v)}>
                <SelectTrigger className="h-9 w-32.5">
                  <SelectValue placeholder="Stack" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stacks</SelectItem>
                  {STACKS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.plusOne} onValueChange={(v) => setFilter("plusOne", v)}>
                <SelectTrigger className="h-9 w-37.5">
                  <SelectValue placeholder="Plus-one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any plus-one</SelectItem>
                  <SelectItem value="none">No plus-one</SelectItem>
                  <SelectItem value="has">Has plus-one</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      )}
    </div>
  );
}

export default function ParticipantsPage() {
  return (
    <Suspense fallback={<TableSkeleton cols={7} />}>
      <ParticipantsInner />
    </Suspense>
  );
}
