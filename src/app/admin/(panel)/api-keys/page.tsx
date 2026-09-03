"use client";

import { useState } from "react";
import { BookOpen, Check, Copy, KeyRound, MoreHorizontal, Plug, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useApiKeys, useApproveApiKey, useRevokeApiKey } from "@/hooks/admin/apiKeys";
import type { AdminApiKey } from "@/services/admin";
import { formatEventDateTime } from "@/lib/time";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ApiKeyIntegration } from "@/components/admin/ApiKeyIntegration";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { API_KEY_SCOPES } from "@/types/admin";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  REVOKED: "bg-muted text-muted-foreground",
  REJECTED: "bg-muted text-muted-foreground",
};

export default function ApiKeysPage() {
  const { data, isPending, error, refetch } = useApiKeys();
  const approve = useApproveApiKey();
  const revoke = useRevokeApiKey();

  /* the raw key lives in component state for exactly as long as this dialog
     is open — there is no endpoint that could fetch it back */
  const [issued, setIssued] = useState<{ key: string; row: AdminApiKey } | null>(null);
  const [copied, setCopied] = useState(false);
  /* the request being approved, while the scopes are chosen */
  const [approving, setApproving] = useState<AdminApiKey | null>(null);
  const [scopes, setScopes] = useState<string[]>(["calendar:read"]);
  /* a key already issued, opened again for its integration notes — this reads
     the stored prefix, never the key itself, which is gone */
  const [guide, setGuide] = useState<AdminApiKey | null>(null);

  const rows = data ?? [];
  const pending = rows.filter((k) => k.status === "PENDING").length;

  const columns: Column<AdminApiKey>[] = [
    {
      id: "who",
      header: "Who",
      sortValue: (k) => k.contactName.toLowerCase(),
      cell: (k) => (
        <div>
          <p className="font-medium text-foreground">{k.label}</p>
          <p className="text-xs text-muted-foreground">
            {k.contactName}
            {k.organisation ? ` · ${k.organisation}` : ""} · {k.contactEmail}
          </p>
        </div>
      ),
    },
    {
      id: "purpose",
      header: "What for",
      cell: (k) => (
        <p className="max-w-sm truncate text-sm text-muted-foreground" title={k.purpose}>
          {k.purpose || "—"}
        </p>
      ),
    },
    {
      id: "key",
      header: "Key",
      cell: (k) =>
        k.keyPrefix ? (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k.keyPrefix}…</code>
        ) : (
          <span className="text-sm text-muted-foreground">Not issued</span>
        ),
    },
    {
      id: "usage",
      header: "Usage",
      sortValue: (k) => k.requestCount,
      cell: (k) => (
        <div className="text-sm">
          <p className="tabular-nums">{k.requestCount.toLocaleString()} calls</p>
          <p className="text-xs text-muted-foreground">
            {k.lastUsedAt ? formatEventDateTime(k.lastUsedAt) : "never used"}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (k) => (
        <Badge className={`rounded-full border-transparent ${STATUS_TONE[k.status]}`}>
          {k.status.charAt(0) + k.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      cell: (k) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {k.status === "PENDING" && (
              <DropdownMenuItem
                onClick={() => {
                  setApproving(k);
                  /* start from what they asked for rather than from
                     everything — approval must never widen access by accident */
                  setScopes(k.scopes?.length ? k.scopes : ["calendar:read"]);
                }}
              >
                <KeyRound className="size-4" />
                Approve and issue a key
              </DropdownMenuItem>
            )}
            {k.status === "ACTIVE" && (
              <DropdownMenuItem onClick={() => setGuide(k)}>
                <Plug className="size-4" />
                Integration guide for this key
              </DropdownMenuItem>
            )}
            {(k.status === "ACTIVE" || k.status === "PENDING") && (
              <>
                {k.status === "PENDING" && <DropdownMenuSeparator />}
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <ShieldOff className="size-4" />
                      {k.status === "ACTIVE" ? "Revoke access" : "Reject request"}
                    </DropdownMenuItem>
                  }
                  title={k.status === "ACTIVE" ? `Revoke ${k.label}?` : `Reject ${k.label}?`}
                  description={
                    k.status === "ACTIVE"
                      ? "Their key stops working immediately and cannot be restored — a new request is needed to get access again."
                      : "The request is closed. They can submit a new one."
                  }
                  confirmLabel={k.status === "ACTIVE" ? "Revoke" : "Reject"}
                  destructive
                  onConfirm={async () => {
                    await revoke.mutateAsync({ id: k.id });
                  }}
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="API keys"
        description={
          pending
            ? `${pending} request${pending === 1 ? "" : "s"} waiting for review.`
            : "Third parties reading the public calendar from their own sites."
        }
        actions={
          /* The integration guide is not advertised on the marketing site —
             this is how staff find the URL to send an integrator. */
          <Button asChild variant="outline">
            <a href="/docs" target="_blank" rel="noopener noreferrer">
              <BookOpen className="size-4" />
              Integration guide
            </a>
          </Button>
        }
      />

      <p className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Send an integrator to <code className="rounded bg-background px-1">/docs</code> — it
        explains the feed and carries the request form. Their request lands here for review.
        Approving issues the key <strong className="text-foreground">once</strong>; it is stored
        only as a hash and cannot be shown again.
      </p>

      {isPending ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="size-5" />}
          title="No requests yet"
          message="Requests submitted from the public API docs page appear here for review."
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(k) => k.id}
          searchable={(k) => `${k.label} ${k.contactName} ${k.organisation} ${k.contactEmail}`}
          searchPlaceholder="Search requests…"
        />
      )}

      {/* Choosing what the key may read, before it exists. */}
      <Dialog open={!!approving} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve {approving?.label}</DialogTitle>
            <DialogDescription>
              Grant only what they described needing. Scopes cannot be changed afterwards — a
              key is revoked and reissued instead.
            </DialogDescription>
          </DialogHeader>

          {approving?.purpose && (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">What they said it is for: </span>
              {approving.purpose}
            </p>
          )}

          <div className="space-y-2">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={scopes.includes(scope)}
                  onChange={(e) =>
                    setScopes((current) =>
                      e.target.checked
                        ? [...current, scope]
                        : current.filter((s) => s !== scope)
                    )
                  }
                />
                <span>
                  <code className="rounded bg-muted px-1 text-xs">{scope}</code>
                  <span className="block text-muted-foreground">
                    {scope === "calendar:read"
                      ? "Published events and public staff sessions, with their details."
                      : "When bookable staff are busy — times only, no titles, and only people who publish a booking page."}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              disabled={scopes.length === 0 || approve.isPending}
              onClick={async () => {
                if (!approving) return;
                const res = await approve.mutateAsync({ id: approving.id, scopes });
                setIssued({
                  key: res.key,
                  row: { ...approving, ...res, status: "ACTIVE" },
                });
                setApproving(null);
                setCopied(false);
              }}
            >
              {approve.isPending ? "Issuing…" : "Approve and issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shown once. There is deliberately no way back to this value. */}
      <Dialog open={!!issued} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Key issued for {issued?.row.label}</DialogTitle>
            <DialogDescription>
              Copy it now and send it to them over a channel you trust. It is stored only as a
              hash, so this is the one and only time it can be displayed — if it is lost, revoke
              the key and issue a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input readOnly value={issued?.key ?? ""} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy key"
              onClick={() => {
                if (!issued) return;
                void navigator.clipboard.writeText(issued.key);
                setCopied(true);
                toast.success("Key copied");
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>

          {/* the same key, with the endpoints it can actually reach — the curl
              below carries the real value while it still exists */}
          {issued && <ApiKeyIntegration apiKey={issued.row} rawKey={issued.key} />}

          <DialogFooter>
            <Button onClick={() => setIssued(null)}>
              {copied ? "Done" : "Close without copying"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopened later: same notes, with the prefix standing in for the key. */}
      <Dialog open={!!guide} onOpenChange={(open) => !open && setGuide(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Integrating with {guide?.label}</DialogTitle>
            <DialogDescription>
              What this key can reach, and what to tell whoever holds it. The key itself is
              stored only as a hash — substitute it where the prefix appears.
            </DialogDescription>
          </DialogHeader>
          {guide && <ApiKeyIntegration apiKey={guide} />}
          <DialogFooter>
            <Button onClick={() => setGuide(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
