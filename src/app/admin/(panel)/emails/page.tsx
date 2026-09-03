"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  MailCheck,
  MailWarning,
  Send,
  UserX,
} from "lucide-react";
import {
  useEmailDetail,
  useEmailReport,
  useEmailTemplates,
  useRunReminders,
  useSendPassEmails,
} from "@/hooks/admin/emails";
import { useParticipants } from "@/hooks/admin/participants";
import { EventPicker } from "@/components/admin/EventPicker";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EMAIL_KINDS,
  type AdminParticipant,
  type EmailKind,
  type EmailLogRow,
  type EmailTemplatePreview,
} from "@/types/admin";

const KIND_LABEL: Record<EmailKind, string> = {
  MAGIC_LINK: "Verify email",
  CONFIRMATION: "Registration confirmed",
  PLUS_ONE_INVITE: "Plus-one invite",
  TICKET: "Event pass",
  TICKET_NUDGE: "Get your ticket",
  REMINDER: "Reminder",
  PROGRESS_REMINDER: "Progress reminder",
  PLUS_ONE_REVOKED: "Plus-one removed",
  UPDATE: "Event update",
  BOOKING_CONFIRMED: "Booking confirmed",
  BOOKING_HOST_NOTICE: "New booking (host)",
  BOOKING_CANCELLED: "Booking cancelled",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function EmailsPage() {
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [logKind, setLogKind] = useState("all");
  const [logStatus, setLogStatus] = useState("all");
  const runReminders = useRunReminders();

  const logFilters = {
    kind: logKind === "all" ? undefined : logKind,
    status: logStatus === "all" ? undefined : logStatus,
  };
  const { data, isPending, error, refetch } = useEmailReport(logFilters);

  if (error) return <ErrorState message="Couldn't load the email report." onRetry={refetch} />;

  const report = data?.report;
  const logs = data?.logs ?? [];

  return (
    <div className="w-full">
      <PageHeader
        title="Emails"
        crumbs={[{ label: "Emails" }]}
        actions={
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={runReminders.isPending}>
                <MailCheck className="size-4" />
                {runReminders.isPending ? "Sending…" : "Send progress reminders"}
              </Button>
            }
            title="Send progress reminders now?"
            description="Emails a status-aware nudge to every participant of an upcoming open event who still has a step to finish — verify their email, complete their profile, or invite a plus-one. People reminded in the last 20 hours are skipped. This is the same job that runs automatically each day."
            confirmLabel="Send reminders"
            onConfirm={async () => {
              await runReminders.mutateAsync();
            }}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={MailCheck}
          label="Emails sent"
          value={report?.totals.sent ?? 0}
          hint={report ? `${report.totals.sentLast7d} in the last 7 days` : undefined}
          tone="green"
          loading={isPending}
        />
        <StatCard
          icon={MailWarning}
          label="Failed sends"
          value={report?.totals.failed ?? 0}
          hint="delivery errors, see the log"
          tone="orange"
          loading={isPending}
        />
        <StatCard
          icon={Hourglass}
          label="Going to be sent"
          value={report?.upcoming.total ?? 0}
          hint="queued by where people are in the flow"
          tone="blue"
          loading={isPending}
        />
        <StatCard
          icon={UserX}
          label="Never finished applying"
          value={report?.funnel.overall.abandoned ?? 0}
          hint={
            report
              ? `${report.funnel.overall.completionRate}% of applicants complete`
              : undefined
          }
          tone="zinc"
          loading={isPending}
        />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="send">Send passes</TabsTrigger>
          <TabsTrigger value="templates">What users see</TabsTrigger>
          <TabsTrigger value="log">Send log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {isPending || !report ? (
            <TableSkeleton rows={5} cols={4} />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <UpcomingCard report={report} />
                <ByKindCard report={report} />
              </div>
              <FunnelCard report={report} />
            </>
          )}
        </TabsContent>

        <TabsContent value="send" className="mt-4">
          <SendTab />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <LogTab
            logs={logs}
            loading={isPending}
            onOpen={setOpenLogId}
            kind={logKind}
            status={logStatus}
            onKindChange={setLogKind}
            onStatusChange={setLogStatus}
          />
        </TabsContent>
      </Tabs>

      <EmailPreviewDialog id={openLogId} onClose={() => setOpenLogId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------- overview */

function UpcomingCard({ report }: { report: NonNullable<ReturnType<typeof useEmailReport>["data"]>["report"] }) {
  const rows = [
    {
      icon: Send,
      label: "Passes issued, email still on its way",
      hint: "ticket emails sending in the background or bounced",
      value: report.upcoming.ticketQueued,
    },
    {
      icon: Clock,
      label: "Waiting on email verification",
      hint: "confirmation email goes out once they click their magic link",
      value: report.upcoming.confirmationQueued,
    },
    {
      icon: Hourglass,
      label: "Verified, profile unfinished",
      hint: "pass email goes out the moment they complete their profile",
      value: report.upcoming.awaitingTicketEmail,
    },
    {
      icon: MailCheck,
      label: "Next reminder blast reaches",
      hint: "participants registered to upcoming events",
      value: report.upcoming.reminderPool,
    },
  ];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Emails going to be sent</CardTitle>
        <CardDescription>Derived from where people currently sit in the flow.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <r.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.label}</p>
              <p className="truncate text-xs text-muted-foreground">{r.hint}</p>
            </div>
            <span className="display text-lg font-semibold tabular-nums">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ByKindCard({ report }: { report: NonNullable<ReturnType<typeof useEmailReport>["data"]>["report"] }) {
  const kinds = Object.entries(report.totals.byKind) as [EmailKind, { sent: number; failed: number }][];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Sent by template</CardTitle>
        <CardDescription>Every send attempt, split by email type.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {kinds.map(([kind, n]) => (
            <div key={kind} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{KIND_LABEL[kind]}</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="size-3.5" /> {n.sent}
                </span>
                {n.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="size-3.5" /> {n.failed}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelCard({ report }: { report: NonNullable<ReturnType<typeof useEmailReport>["data"]>["report"] }) {
  const o = report.funnel.overall;
  const columns: Column<(typeof report.funnel.perEvent)[number]>[] = [
    { id: "event", header: "Event", cell: (r) => <span className="font-medium">{r.eventName}</span>, sortValue: (r) => r.eventName },
    { id: "started", header: "Started", cell: (r) => r.started, sortValue: (r) => r.started, className: "tabular-nums" },
    {
      id: "neverVerified",
      header: "Never verified email",
      cell: (r) => <span className={cn(r.neverVerified > 0 && "text-amber-600")}>{r.neverVerified}</span>,
      sortValue: (r) => r.neverVerified,
      className: "tabular-nums",
    },
    {
      id: "verifiedNotCompleted",
      header: "Verified, no profile",
      cell: (r) => <span className={cn(r.verifiedNotCompleted > 0 && "text-amber-600")}>{r.verifiedNotCompleted}</span>,
      sortValue: (r) => r.verifiedNotCompleted,
      className: "tabular-nums",
    },
    { id: "completed", header: "Completed", cell: (r) => r.completed, sortValue: (r) => r.completed, className: "tabular-nums" },
    {
      id: "rate",
      header: "Completion",
      cell: (r) => `${r.started ? Math.round((r.completed / r.started) * 100) : 0}%`,
      sortValue: (r) => (r.started ? r.completed / r.started : 0),
      className: "tabular-nums",
    },
  ];

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Application funnel</CardTitle>
        <CardDescription>
          People who clicked apply but never finished: {o.neverVerified} never verified their
          email, {o.verifiedNotCompleted} verified but never completed their profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>
              {o.completed} of {o.started} applications completed
            </span>
            <span className="font-semibold">{o.completionRate}%</span>
          </div>
          <Progress value={o.completionRate} />
        </div>
        <DataTable
          data={report.funnel.perEvent}
          columns={columns}
          getRowId={(r) => r.eventId}
          pageSize={8}
          empty={<EmptyState title="No applications yet" message="Funnel numbers appear once people start registering." />}
        />
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- send passes */

const P_STATUS: Record<AdminParticipant["status"], { label: string; cls: string }> = {
  PENDING: { label: "Email not verified", cls: "bg-amber-100 text-amber-800" },
  VERIFIED: { label: "Profile unfinished", cls: "bg-sky-100 text-sky-800" },
  COMPLETE: { label: "Pass issued", cls: "bg-green-100 text-green-800" },
};

function SendTab() {
  const [eventId, setEventId] = useState("");
  const { data: attendees, isPending } = useParticipants(eventId ? { event: eventId } : {});
  const send = useSendPassEmails();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  const list = useMemo(() => attendees ?? [], [attendees]);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function confirmSend() {
    if (!pendingIds?.length) return;
    try {
      await send.mutateAsync(pendingIds);
      setPendingIds(null);
      setSelected(new Set());
    } catch {
      /* the hook already toasts the failure; keep the dialog open to retry */
    }
  }

  const pending = (pendingIds ?? []).map((id) => byId.get(id)).filter(Boolean) as AdminParticipant[];
  const nPass = pending.filter((p) => p.ticket).length;
  const nNudge = pending.length - nPass;

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Send passes by email</CardTitle>
        <CardDescription>
          Pick an event, choose everyone or a single person, and review before anything is sent.
          People who already hold a pass get it re-sent; people who never finished applying get a
          sign-in link to complete their profile and receive their pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <EventPicker value={eventId} onValueChange={(v) => { setEventId(v); setSelected(new Set()); }} className="w-72" />
          {list.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(on) =>
                    setSelected(on ? new Set(list.map((p) => p.id)) : new Set())
                  }
                />
                Select all ({list.length})
              </label>
              <Button
                className="ml-auto"
                disabled={selected.size === 0 || send.isPending}
                onClick={() => setPendingIds([...selected])}
              >
                <Send className="size-4" />
                Review &amp; send to {selected.size || "…"}
              </Button>
            </>
          )}
        </div>

        {!eventId ? (
          <EmptyState title="Choose an event" message="Participants of the selected event appear here." />
        ) : isPending ? (
          <TableSkeleton rows={6} cols={4} />
        ) : list.length === 0 ? (
          <EmptyState title="No participants" message="Nobody has registered for this event yet." />
        ) : (
          <div className="divide-y rounded-lg border">
            {list.map((p) => {
              const st = P_STATUS[p.status];
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(on) => toggle(p.id, on === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Badge className={cn("hidden sm:inline-flex", st.cls)}>{st.label}</Badge>
                  <span className="hidden w-40 text-right text-xs text-muted-foreground md:block">
                    will get: {p.ticket ? "pass email" : "sign-in nudge"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={send.isPending}
                    onClick={() => setPendingIds([p.id])}
                  >
                    Send
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* confirm-before-send: nothing goes out until this is approved */}
      <Dialog open={Boolean(pendingIds)} onOpenChange={(open) => !open && setPendingIds(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm before sending</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pending.length === 1 ? (
              <>
                One email to <span className="font-medium text-foreground">{pending[0]?.name}</span>{" "}
                ({pending[0]?.email}) —{" "}
                {pending[0]?.ticket
                  ? "their event pass will be re-sent."
                  : "they'll get a sign-in link to finish registration and receive their pass."}
              </>
            ) : (
              <>
                {pending.length} emails: <span className="font-medium text-foreground">{nPass}</span>{" "}
                pass re-send{nPass === 1 ? "" : "s"} and{" "}
                <span className="font-medium text-foreground">{nNudge}</span> finish-registration
                nudge{nNudge === 1 ? "" : "s"}.
              </>
            )}{" "}
            You can preview both templates under “What users see”.
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {p.name} <span className="text-muted-foreground">· {p.email}</span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {p.ticket ? "Pass" : "Nudge"}
                </Badge>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={send.isPending} onClick={() => setPendingIds(null)}>
              Cancel
            </Button>
            <Button disabled={send.isPending} onClick={() => void confirmSend()}>
              {send.isPending ? "Sending…" : `Send ${pending.length} email${pending.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------ templates */

function TemplatesTab() {
  const { data: templates, isPending, error, refetch } = useEmailTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected: EmailTemplatePreview | undefined = useMemo(() => {
    if (!templates?.length) return undefined;
    return templates.find((t) => t.id === selectedId) ?? templates[0];
  }, [templates, selectedId]);

  if (error) return <ErrorState message="Couldn't load the templates." onRetry={refetch} />;
  if (isPending) return <TableSkeleton rows={4} cols={2} />;
  if (!templates?.length)
    return <EmptyState title="No templates" message="No email templates were found." />;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:items-start">
      {/* the template list scrolls in its own pane; the preview stays put */}
      <div className="space-y-1.5 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedId(t.id)}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
              selected?.id === t.id
                ? "border-primary/40 bg-primary/5"
                : "border-transparent hover:bg-muted"
            )}
          >
            <p className="text-sm font-medium">{t.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>
      {selected && (
        <Card className="shadow-none lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">{selected.name}</CardTitle>
            <CardDescription>
              Subject: <span className="font-medium text-foreground">{selected.subject}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              title={`${selected.name} preview`}
              srcDoc={selected.html}
              sandbox=""
              className="h-[640px] w-full rounded-lg border bg-white lg:h-[calc(100vh-22rem)] lg:min-h-[420px]"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Rendered from the live template with sample data — recipients see exactly this
              layout with their own details.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- send log */

function LogTab({
  logs,
  loading,
  onOpen,
  kind,
  status,
  onKindChange,
  onStatusChange,
}: {
  logs: EmailLogRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  kind: string;
  status: string;
  onKindChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}) {
  const filters = (
    <>
      <Select value={kind} onValueChange={onKindChange}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {EMAIL_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_LABEL[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="SENT">Sent</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const columns: Column<EmailLogRow>[] = [
    {
      id: "kind",
      header: "Type",
      cell: (r) => <Badge variant="outline">{KIND_LABEL[r.kind]}</Badge>,
      sortValue: (r) => r.kind,
    },
    { id: "to", header: "Recipient", cell: (r) => r.to, sortValue: (r) => r.to },
    {
      id: "subject",
      header: "Subject",
      cell: (r) => <span className="line-clamp-1">{r.subject}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) =>
        r.status === "SENT" ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sent</Badge>
        ) : (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100" title={r.error ?? undefined}>
            Failed
          </Badge>
        ),
      sortValue: (r) => r.status,
    },
    { id: "at", header: "When", cell: (r) => when(r.at), sortValue: (r) => r.at, className: "tabular-nums" },
    {
      id: "view",
      header: "",
      cell: () => <Eye className="size-4 text-muted-foreground" />,
      className: "w-10",
    },
  ];

  if (loading) return <TableSkeleton rows={8} cols={5} />;

  return (
    <DataTable
      data={logs}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      searchable={(r) => `${r.to} ${r.subject} ${r.kind}`}
      searchPlaceholder="Search recipient or subject…"
      pageSize={12}
      toolbar={filters}
      empty={
        <EmptyState
          title="No emails logged yet"
          message="Sends are recorded from now on — new registrations, passes and reminders will appear here."
        />
      }
    />
  );
}

function EmailPreviewDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: email, isPending } = useEmailDetail(id);
  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">
            {email ? email.subject : "Email"}
          </DialogTitle>
        </DialogHeader>
        {email && (
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[email.kind]} · to {email.to} · {when(email.at)}
            {email.status === "FAILED" && (
              <span className="ml-1 font-medium text-red-600">
                — failed{email.error ? `: ${email.error}` : ""}
              </span>
            )}
          </p>
        )}
        {isPending ? (
          <TableSkeleton rows={4} cols={1} />
        ) : email ? (
          <iframe
            title="Sent email"
            srcDoc={email.html}
            sandbox=""
            className="h-[600px] w-full rounded-lg border bg-white"
          />
        ) : (
          <EmptyState title="Not found" message="This email is no longer in the log." />
        )}
      </DialogContent>
    </Dialog>
  );
}
