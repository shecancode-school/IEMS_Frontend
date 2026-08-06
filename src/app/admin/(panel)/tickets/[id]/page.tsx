"use client";

/* eslint-disable @next/next/no-img-element */
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Download, QrCode, RotateCcw, Send, Trash2 } from "lucide-react";
import {
  useTicket,
  useTicketAction,
  useRegenerateQr,
  useDownloadTicketPdf,
} from "@/hooks/admin/tickets";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ScanHistory } from "@/components/admin/ScanHistory";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isPending, error } = useTicket(id);
  const action = useTicketAction();
  const regenerate = useRegenerateQr();
  const downloadPdf = useDownloadTicketPdf();

  if (isPending) return <TableSkeleton rows={4} cols={2} />;
  if (error || !data)
    return (
      <EmptyState
        title="Ticket not found"
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/tickets">Back to tickets</Link>
          </Button>
        }
      />
    );

  const t = data.ticket;

  return (
    <div>
      <PageHeader
        title={t.ticketNumber}
        crumbs={[{ label: "Tickets", href: "/admin/tickets" }, { label: t.ticketNumber }]}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => downloadPdf.mutate(id)}
              disabled={downloadPdf.isPending}
            >
              <Download className="size-4" />
              {downloadPdf.isPending ? "Preparing…" : "Download"}
            </Button>
            <Button variant="outline" onClick={() => action.mutate({ id, action: "resend" })}>
              <Send className="size-4" />
              Resend
            </Button>
            <Button variant="outline" onClick={() => regenerate.mutate(id)}>
              <QrCode className="size-4" />
              New QR
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              }
              title="Reset this ticket?"
              description="The old QR stops working and a new pass is emailed."
              confirmLabel="Reset ticket"
              onConfirm={async () => {
                await action.mutateAsync({ id, action: "reset" });
              }}
            />
            {t.status !== "REVOKED" && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-red-600">
                    <Ban className="size-4" />
                    Revoke
                  </Button>
                }
                title="Revoke this ticket?"
                description="Invalidates the pass and frees its seat."
                confirmLabel="Revoke"
                destructive
                onConfirm={async () => {
                  await action.mutateAsync({ id, action: "revoke" });
                }}
              />
            )}
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="icon" className="text-red-600" aria-label="Delete">
                  <Trash2 className="size-4" />
                </Button>
              }
              title="Delete this ticket?"
              description="Permanently removes the record and frees its seat."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await action.mutateAsync({ id, action: "delete" });
                router.push("/admin/tickets");
              }}
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Holder</CardTitle>
              <StatusBadge value={t.status} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row label="Name" value={t.participantName} />
                <Row label="Owner type" value={t.ownerType} />
                <Row label="Event" value={t.eventName ?? "—"} />
                <Row label="Issued" value={new Date(t.registeredAt).toLocaleString()} />
                <Row
                  label="Checked in"
                  value={t.scannedAt ? new Date(t.scannedAt).toLocaleString() : "—"}
                />
                <Row
                  label="Cancelled"
                  value={t.cancelledAt ? new Date(t.cancelledAt).toLocaleString() : "—"}
                />
              </dl>
            </CardContent>
          </Card>

          <ScanHistory history={data.history} />
        </div>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">QR pass</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {t.qrDataUrl ? (
              <img
                src={t.qrDataUrl}
                alt="Ticket QR"
                className="size-48 rounded-lg border border-border bg-[#f7f3ea] p-2"
              />
            ) : (
              <p className="py-6 text-sm text-muted-foreground">No QR available.</p>
            )}
            <p className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
