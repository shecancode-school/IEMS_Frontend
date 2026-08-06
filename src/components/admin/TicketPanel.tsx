"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Download } from "lucide-react";
import { useDownloadTicketPdf } from "@/hooks/admin/tickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

type TicketLike = {
  id: string;
  ticketNumber: string;
  status: string;
  sentAt: string | null;
  scannedAt: string | null;
  qrDataUrl: string;
};

/* The pass panel shown on participant/guest detail: QR, ticket number, status
   and a link to the full ticket record. */
export function TicketPanel({ ticket }: { ticket: TicketLike | null }) {
  const downloadPdf = useDownloadTicketPdf();
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Ticket</CardTitle>
        {ticket && <StatusBadge value={ticket.status} />}
      </CardHeader>
      <CardContent>
        {!ticket ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No ticket issued yet.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={ticket.qrDataUrl}
              alt="Ticket QR code"
              className="size-40 rounded-lg border border-border bg-[#f7f3ea] p-2"
            />
            <p className="font-mono text-sm tracking-wide text-foreground">{ticket.ticketNumber}</p>
            <p className="text-xs text-muted-foreground">
              {ticket.sentAt ? "Emailed" : "Not emailed"}
              {ticket.scannedAt
                ? ` · Checked in ${new Date(ticket.scannedAt).toLocaleString()}`
                : ""}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => downloadPdf.mutate(ticket.id)}
              disabled={downloadPdf.isPending}
            >
              <Download className="size-4" />
              {downloadPdf.isPending ? "Preparing…" : "Download pass"}
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/admin/tickets/${ticket.id}`}>Manage ticket</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
