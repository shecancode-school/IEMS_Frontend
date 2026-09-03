"use client";

import { AlertTriangle, Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminApiKey } from "@/services/admin";
import { Code } from "@/components/docs/Code";
import { Button } from "@/components/ui/button";

/* How to actually use a key we just issued — written for the administrator
   holding it, not for the integrator.

   The public guide at /docs explains the feed in general. This is the same
   material narrowed to ONE key: its real prefix in a runnable curl, only the
   endpoints its scopes actually permit, its real rate limit, and the privacy
   caveat that applies to the busy feed. That is the thing an administrator was
   missing — issuing a key told them nothing about what it could do, so the
   answer to "what do I send them?" was to read the public docs and hope the
   scopes matched.

   It lives behind `staff:manage` on /admin/api-keys, so it is internal by
   construction; nothing here is rendered on the public site. */

const HOST = "https://events.igirerwanda.org";

type EndpointDoc = {
  scope: string;
  method: string;
  path: string;
  summary: string;
  detail: string;
  example: string;
};

const ENDPOINTS: EndpointDoc[] = [
  {
    scope: "calendar:read",
    method: "GET",
    path: "/api/v1/calendar",
    summary: "Published events and public staff sessions, merged",
    detail:
      "Titles, times, host, price, capacity and a link for ticketed events. Up to 366 days " +
      "per call. Draft events and internal sessions never appear — a session reaches this " +
      "feed only when the person running it marked it public.",
    example: `curl -H "x-api-key: $IRO_API_KEY" \\
  "${HOST}/api/v1/calendar?from=2026-09-01&to=2026-12-31"`,
  },
  {
    scope: "calendar:freebusy",
    method: "GET",
    path: "/api/v1/availability",
    summary: "When bookable staff are busy — times only",
    detail:
      "Merged busy intervals per bookable host, so an integrator can show the next open " +
      "time without scraping the booking page. No titles, no attendees, no locations, and " +
      "nobody who has not published a booking page. Up to 62 days per call, because every " +
      "day of it is a live Google free/busy read.",
    example: `curl -H "x-api-key: $IRO_API_KEY" \\
  "${HOST}/api/v1/availability?from=2026-09-01&to=2026-09-30"`,
  },
];

export function ApiKeyIntegration({
  apiKey,
  rawKey,
}: {
  apiKey: Pick<AdminApiKey, "label" | "keyPrefix" | "scopes" | "rateLimitPerMinute" | "status">;
  /* only ever passed in the approve dialog, where the raw value exists for the
     length of one render — never fetched, never stored */
  rawKey?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const scopes = apiKey.scopes ?? [];
  const allowed = ENDPOINTS.filter((e) => scopes.includes(e.scope));
  /* the value that makes the snippet runnable: the real key while we still
     have it, otherwise the prefix, so it is obvious what to substitute */
  const token = rawKey ?? `${apiKey.keyPrefix ?? "iro_live_"}…`;

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(what);
    toast.success(`${what} copied`);
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="font-medium text-foreground">{apiKey.label}</p>
        <p className="mt-1 text-muted-foreground">
          {scopes.length ? scopes.join(", ") : "no scopes"} ·{" "}
          {apiKey.rateLimitPerMinute} requests a minute · authenticated with an{" "}
          <code className="rounded bg-background px-1">x-api-key</code> header
          {apiKey.status !== "ACTIVE" && ` · ${apiKey.status.toLowerCase()}`}
        </p>
      </div>

      {allowed.length === 0 ? (
        <p className="text-muted-foreground">
          This key carries no scope that maps to an endpoint. Revoke it and issue a new one
          with the access the integrator actually asked for.
        </p>
      ) : (
        allowed.map((e) => {
          const snippet = e.example.replace("$IRO_API_KEY", token);
          return (
            <div key={e.path} className="space-y-1">
              <p className="font-medium text-foreground">
                <code className="rounded bg-muted px-1 text-xs">{e.method}</code> {e.path}
              </p>
              <p className="text-muted-foreground">{e.summary}</p>
              <p className="text-xs text-muted-foreground">{e.detail}</p>
              <Code>{snippet}</Code>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => copy(snippet, e.path)}
              >
                {copied === e.path ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy request
              </Button>
            </div>
          );
        })
      )}

      {scopes.includes("calendar:freebusy") && (
        <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            The busy feed names staff members and says when they are occupied. It reveals
            nothing a visitor could not already read off the public booking page, but it makes
            it bulk-readable — give this scope only to an integrator who needs to offer times,
            and revoke it when they stop.
          </span>
        </p>
      )}

      <div className="space-y-1.5 text-muted-foreground">
        <p className="font-medium text-foreground">What to tell them</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Keep the key on their server. In front-end JavaScript it is published to everyone
            who opens the page.
          </li>
          <li>
            <code className="rounded bg-muted px-1">401</code> means missing, mistyped or
            revoked; <code className="rounded bg-muted px-1">403</code> means the key is valid
            but lacks the scope; <code className="rounded bg-muted px-1">429</code> means past{" "}
            {apiKey.rateLimitPerMinute}/min — wait for <code className="rounded bg-muted px-1">Retry-After</code>.
          </li>
          <li>
            Cache for a few minutes. The calendar changes a few times a week, not a few times
            a second.
          </li>
          <li>
            The full reference is at <code className="rounded bg-muted px-1">/docs</code> — that
            page is public and safe to send.
          </li>
        </ul>
      </div>
    </div>
  );
}
