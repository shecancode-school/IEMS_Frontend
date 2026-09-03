"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, MoreHorizontal, Pencil, Power, QrCode, UserPlus, Users2 } from "lucide-react";
import { useAdminAuth } from "@/context/AuthContext";
import {
  useCan,
  useStaff,
  useUpdateStaff,
  useDeactivateStaff,
} from "@/hooks/admin/staff";
import type { StaffRow } from "@/services/admin";
import { ROLE_LABELS } from "@/types/admin";
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

const ROLE_TONE: Record<string, string> = {
  ADMIN: "bg-primary/15 text-primary",
  CEO: "bg-amber-100 text-amber-900",
  FACILITATOR: "bg-sky-100 text-sky-900",
  ACADEMIC: "bg-violet-100 text-violet-900",
  STAFF: "bg-muted text-muted-foreground",
};

export default function StaffPage() {
  const router = useRouter();
  const { user } = useAdminAuth();
  const allow = useCan(user?.role);
  const canManage = allow("staff:manage");

  const { data, isPending, error, refetch } = useStaff();
  const update = useUpdateStaff();
  const deactivate = useDeactivateStaff();

  const columns: Column<StaffRow>[] = [
    {
      id: "name",
      header: "Person",
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => (
        <div>
          <p className="font-medium text-foreground">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.title || s.email}</p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortValue: (s) => s.role,
      cell: (s) => (
        <Badge className={`rounded-full border-transparent ${ROLE_TONE[s.role] ?? ROLE_TONE.STAFF}`}>
          {ROLE_LABELS[s.role]}
        </Badge>
      ),
    },
    {
      id: "google",
      header: "Google Calendar",
      cell: (s) =>
        s.googleConnected ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="size-4" />
            Connected
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not connected</span>
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
      id: "canScan",
      header: "Gate scan",
      cell: (s) =>
        s.canScan ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-blue-700">
            <QrCode className="size-4" />
            Scanning
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            headerClassName: "w-10",
            cell: (s: StaffRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/admin/staff/${s.id}/edit`)}>
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  {!s.active && (
                    <DropdownMenuItem
                      onClick={() =>
                        update.mutate({
                          id: s.id,
                          body: { name: s.name, role: s.role, active: true },
                        })
                      }
                    >
                      <Power className="size-4" />
                      Reactivate
                    </DropdownMenuItem>
                  )}
                  {s.active && s.id !== user?.id && (
                    <>
                      <DropdownMenuSeparator />
                      <ConfirmDialog
                        trigger={
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Power className="size-4" />
                            Deactivate
                          </DropdownMenuItem>
                        }
                        title={`Deactivate ${s.name}?`}
                        description="They lose access on their next request. Their past activities and bookings are kept."
                        confirmLabel="Deactivate"
                        destructive
                        onConfirm={async () => {
                          await deactivate.mutateAsync(s.id);
                        }}
                      />
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          } satisfies Column<StaffRow>,
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Everyone with a console account — their role decides what they can reach and whose calendar they can see."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/admin/staff/new">
                <UserPlus className="size-4" />
                Add staff
              </Link>
            </Button>
          ) : undefined
        }
      />

      {isPending ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users2 className="size-5" />}
          title="No staff accounts"
          message="Add the CEO, facilitators and academic staff so their schedules appear on the org calendar."
        />
      ) : (
        <DataTable
          data={data ?? []}
          columns={columns}
          getRowId={(s) => s.id}
          searchable={(s) => `${s.name} ${s.email} ${s.role} ${s.title ?? ""}`}
          searchPlaceholder="Search staff…"
        />
      )}
    </div>
  );
}
