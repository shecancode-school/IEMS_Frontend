import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanHistoryItem } from "@/types/admin";

const icon = (result: string) => {
  if (result === "ACCEPTED") return <CheckCircle2 className="size-4 text-green-600" />;
  if (result === "EXPIRED") return <Clock className="size-4 text-amber-600" />;
  return <XCircle className="size-4 text-red-500" />;
};

/* Timeline of every gate scan for a ticket. */
export function ScanHistory({ history }: { history: ScanHistoryItem[] }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Scan history</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No scans yet — this pass hasn&apos;t been presented at the gate.
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                {icon(h.result)}
                <div className="flex-1">
                  <p className="font-medium capitalize text-foreground">
                    {h.result.toLowerCase().replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.at).toLocaleString()}
                    {h.scanner ? ` · ${h.scanner}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
