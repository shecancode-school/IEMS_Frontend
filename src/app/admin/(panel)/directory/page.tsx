"use client";

import {
  CalendarX2,
  Dot,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { useDirectory } from "@/hooks/admin/directory";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState, ErrorState } from "@/components/admin/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROLE_LABELS, type DirectoryPerson, type DirectoryStatus } from "@/types/admin";
import { useAdminAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const STATUS_META: Record<DirectoryStatus, { dot: string; label: string; badge: string }> = {
  BUSY: {
    dot: "bg-amber-500",
    label: "Busy now",
    badge: "bg-amber-100 text-amber-900",
  },
  FREE: {
    dot: "bg-green-500",
    label: "Available",
    badge: "bg-green-100 text-green-800",
  },
  INACTIVE: {
    dot: "bg-muted-foreground",
    label: "Inactive",
    badge: "bg-muted text-muted-foreground",
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function PersonCard({ p, you }: { p: DirectoryPerson; you: boolean }) {
  const meta = STATUS_META[p.status];
  return (
    <div className="flex items-start gap-4 rounded-xl border p-4">
      <Avatar className="size-12 shrink-0">
        {p.photoUrl && <AvatarImage src={p.photoUrl} alt={p.name} />}
        <AvatarFallback>{initials(p.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">
            {p.name}
            {you && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
          </p>
          <Badge
            variant="outline"
            className={cn("rounded-full border-transparent", meta.badge)}
          >
            <Dot className={cn("size-3.5 -ml-0.5", meta.dot)} />
            {meta.label}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {ROLE_LABELS[p.role]}
          {p.title ? ` · ${p.title}` : ""}
        </p>
        {p.status === "BUSY" && p.nowLabel ? (
          <p className="mt-2 truncate rounded-md bg-muted px-2 py-1 text-xs text-foreground">
            {p.nowLabel}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {p.status === "FREE" ? "No meetings or duties right now" : "Not currently active"}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.googleConnected ? (
            <Badge variant="outline" className="text-xs">
              Google connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              <WifiOff className="mr-1 size-3" />
              Not on Google
            </Badge>
          )}
          {p.bookable && (
            <Badge variant="outline" className="text-xs">
              Available to book
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DirectoryPage() {
  const { data, isPending, error, refetch } = useDirectory();
  const { user } = useAdminAuth();

  const people = data ?? [];
  const busy = people.filter((p) => p.status === "BUSY").length;
  const connected = people.filter((p) => p.googleConnected).length;

  return (
    <div>
      <PageHeader
        title="Team directory"
        description="Everyone on staff — what they do and whether they're engaged right now."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={UsersRound}
          label="Active team"
          value={people.filter((p) => p.status !== "INACTIVE").length}
        />
        <StatCard icon={CalendarX2} label="Busy right now" value={busy} />
        <StatCard icon={WifiOff} label="On Google Calendar" value={connected} />
      </div>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-5" />}
          title="No team yet"
          message="Staff members you add will appear here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <PersonCard key={p.id} p={p} you={p.id === user?.id} />
          ))}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarX2 className="size-4" />
        “Busy now” is derived from hosted events, activities, confirmed bookings and
        Google busy blocks — it is never stored.
      </p>
    </div>
  );
}
