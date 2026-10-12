"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Trash2, UserRound } from "lucide-react";
import { useGuest, useDeleteGuest } from "@/hooks/admin/guests";
import { PageHeader } from "@/components/admin/PageHeader";
import { TicketPanel } from "@/components/admin/TicketPanel";
import { ScanHistory } from "@/components/admin/ScanHistory";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isPending, error } = useGuest(id);
  const del = useDeleteGuest();

  if (isPending) return <TableSkeleton rows={4} cols={2} />;
  if (error || !data)
    return (
      <EmptyState
        title="Guest not found"
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/guests">Back to guests</Link>
          </Button>
        }
      />
    );

  const g = data.guest;

  return (
    <div>
      <PageHeader
        title={g.name}
        crumbs={[{ label: "Guests", href: "/admin/guests" }, { label: g.name }]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/guests/${id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="icon" className="text-red-600" aria-label="Delete">
                  <Trash2 className="size-4" />
                </Button>
              }
              title="Delete this guest?"
              description="Removes the guest and their ticket, and frees the seat."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await del.mutateAsync(id);
                router.push("/admin/guests");
              }}
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 flex items-center gap-4">
                <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-7" />
                </span>
                <Badge variant="outline" className="rounded-full capitalize">
                  {g.guestType.toLowerCase().replace(/_/g, " ")}
                </Badge>
              </div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row icon={Mail} label="Email" value={g.email} />
                <Row label="Event" value={g.event?.name ?? "—"} />
                <Row label="Invited by" value={g.inviter?.name ?? "Admin"} />
                <Row label="Added" value={new Date(g.registeredAt).toLocaleDateString()} />
              </dl>
            </CardContent>
          </Card>

          <ScanHistory history={data.attendance.history} />
        </div>

        <TicketPanel ticket={data.ticket} />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon?: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
