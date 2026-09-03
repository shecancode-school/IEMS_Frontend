"use client";

import { AlertTriangle, CalendarCheck, Link2, Loader2, Unlink } from "lucide-react";
import { useGoogleStatus, useConnectGoogle, useDisconnectGoogle } from "@/hooks/admin/google";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventDateTime } from "@/lib/time";

/* Human wording for the ?error= values the OAuth callback redirects back with.
   The raw codes are useless to whoever is standing at the screen. */
const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Google consent screen. Nothing was connected.",
  missing_code: "Google did not send an authorisation code back. Try again.",
  invalid_state: "That connection request expired or was not yours. Start again.",
  expired: "The connection took too long and expired. Start again.",
  exchange_failed: "Google rejected the authorisation code. Try again.",
  no_refresh_token:
    "Google did not grant offline access, so we could not keep the connection alive. Remove IEMS at myaccount.google.com/permissions and connect again.",
  no_identity: "Google did not tell us which account you signed in with. Try again.",
  already_linked:
    "That Google account is already connected to a different staff member. Each person needs their own Google account.",
};

export function GoogleConnectCard({ notice }: { notice?: string | null }) {
  const { data, isPending } = useGoogleStatus();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();

  const errorNote = notice && notice !== "1" ? (ERRORS[notice] ?? "Something went wrong connecting Google.") : null;

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-5 text-primary" />
              Google Calendar
            </CardTitle>
            <CardDescription className="mt-1 max-w-prose">
              Connect your own Google account so your real commitments show on your schedule and
              nobody can book you when you are already busy.
            </CardDescription>
          </div>
          {data?.connected && (
            <Badge className="rounded-full border-transparent bg-green-100 text-green-800">
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {errorNote && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {errorNote}
          </p>
        )}

        {data?.needsReconnect && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Your Google connection stopped working — usually because access was revoked or the
            password changed. Reconnect to bring your schedule back.
          </p>
        )}

        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking…
          </p>
        ) : !data?.available ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Google Calendar is not set up on this deployment. An administrator needs to add
            <code className="mx-1 rounded bg-background px-1">GOOGLE_CLIENT_ID</code>,
            <code className="mx-1 rounded bg-background px-1">GOOGLE_CLIENT_SECRET</code> and
            <code className="mx-1 rounded bg-background px-1">GOOGLE_TOKEN_KEY</code>.
          </p>
        ) : data.connected ? (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Google account</dt>
                <dd className="font-medium">{data.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Connected</dt>
                <dd className="font-medium">
                  {data.connectedAt ? formatEventDateTime(data.connectedAt) : "—"}
                </dd>
              </div>
            </dl>
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <Unlink className="size-4" />
                  Disconnect
                </Button>
              }
              title="Disconnect Google Calendar?"
              description="Your Google events stop showing on your schedule and people can no longer book time with you until you reconnect. Nothing already on your Google Calendar is deleted."
              confirmLabel="Disconnect"
              destructive
              onConfirm={async () => {
                await disconnect.mutateAsync();
              }}
            />
          </>
        ) : (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Connect Google Calendar
          </Button>
        )}

        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">What we can see.</strong> Your event
          titles are read only for your own schedule view and are never stored in IEMS. Everyone
          else — including administrators — sees only opaque busy blocks, never what you are doing.
        </p>
      </CardContent>
    </Card>
  );
}
