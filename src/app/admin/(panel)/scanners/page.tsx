"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Power, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useScanners, useUpdateScanner, useDeleteScanner } from "@/hooks/admin/scanners";
import type { AdminScanner } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ScannersPage() {
  const router = useRouter();
  const { data, isPending, error, refetch } = useScanners();
  const update = useUpdateScanner();
  const del = useDeleteScanner();

  const columns: Column<AdminScanner>[] = [
    {
      id: "name",
      header: "Scanner",
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => (
        <div>
          <p className="font-medium text-foreground">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    {
      id: "active",
      header: "Status",
      cell: (s) =>
        s.active ? (
          <Badge className="rounded-full border-transparent bg-green-100 text-green-800">Active</Badge>
        ) : (
          <Badge variant="outline" className="rounded-full text-muted-foreground">
            Disabled
          </Badge>
        ),
    },
    {
      id: "lastSeen",
      header: "Last seen",
      sortValue: (s) => s.lastSeenAt ?? "",
      cell: (s) => (
        <span className="tabular-nums text-muted-foreground">
          {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "Never"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortValue: (s) => s.createdAt,
      cell: (s) => (
        <span className="tabular-nums text-muted-foreground">
          {new Date(s.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/admin/scanners/${s.id}/edit`)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => update.mutate({ id: s.id, body: { active: !s.active } })}
            >
              <Power className="size-4" />
              {s.active ? "Deactivate" : "Activate"}
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
              title="Delete this scanner account?"
              description="They will no longer be able to sign in to the gate app."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await del.mutateAsync(s.id);
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
        title="Scanners"
        description="Gate-device accounts that check guests in."
        actions={
          <Button asChild>
            <Link href="/admin/scanners/new">
              <UserPlus className="size-4" />
              Add scanner
            </Link>
          </Button>
        }
      />

      {isPending ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title="No scanner accounts"
          message="Create an account for each gate device."
          action={
            <Button asChild>
              <Link href="/admin/scanners/new">Add scanner</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(s) => s.id}
          searchable={(s) => `${s.name} ${s.email}`}
          searchPlaceholder="Search scanners…"
        />
      )}
    </div>
  );
}
