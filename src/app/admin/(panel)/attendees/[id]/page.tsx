"use client";

/* eslint-disable @next/next/no-img-element */
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Pencil, Phone, Trash2, UserPlus, UserRound, X } from "lucide-react";
import {
  useParticipant,
  useSetRegistrationStatus,
  useDeleteParticipant,
  useRevokePlusOne,
  useAssignPlusOne,
} from "@/hooks/admin/participants";
import { useUpdateGuest } from "@/hooks/admin/guests";
import { adminKeys } from "@/hooks/admin/keys";
import { GUEST_TYPES, GENDERS, RELATIONSHIPS } from "@/types/admin";
import type { ParticipantProfile } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TicketPanel } from "@/components/admin/TicketPanel";
import { ScanHistory } from "@/components/admin/ScanHistory";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ParticipantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isPending, error } = useParticipant(id);
  const setReg = useSetRegistrationStatus();
  const del = useDeleteParticipant();

  if (isPending) return <TableSkeleton rows={5} cols={2} />;
  if (error || !data)
    return (
      <EmptyState
        title="Participant not found"
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/attendees">Back to participants</Link>
          </Button>
        }
      />
    );

  const p = data.participant;

  return (
    <div>
      <PageHeader
        title={p.name}
        crumbs={[{ label: "Participants", href: "/admin/attendees" }, { label: p.name }]}
        actions={
          <>
            {p.registrationStatus !== "APPROVED" && (
              <Button
                variant="outline"
                onClick={() => setReg.mutate({ id, registrationStatus: "APPROVED" })}
              >
                <Check className="size-4" />
                Approve
              </Button>
            )}
            {p.registrationStatus !== "REJECTED" && (
              <Button
                variant="outline"
                onClick={() => setReg.mutate({ id, registrationStatus: "REJECTED" })}
              >
                <X className="size-4" />
                Reject
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/admin/attendees/${id}/edit`}>
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
              title="Delete this participant?"
              description="Removes the participant, their plus-one and tickets."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await del.mutateAsync(id);
                router.push("/admin/attendees");
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
                {p.profilePicture ? (
                  <img
                    src={p.profilePicture}
                    alt=""
                    className="size-16 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="size-7" />
                  </span>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge value={p.registrationStatus} />
                  <StatusBadge value={p.status} />
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row icon={Mail} label="Email" value={p.email} />
                <Row icon={Phone} label="Phone" value={p.phone ?? "—"} />
                <Row label="Stack" value={p.stack ?? "—"} />
                <Row label="Gender" value={p.gender ?? "—"} />
                <Row label="Event" value={p.event?.name ?? "—"} />
                <Row label="Registered" value={new Date(p.registeredAt).toLocaleDateString()} />
              </dl>
            </CardContent>
          </Card>

          <PlusOneCard participantId={id} plusOne={data.plusOne} />


          <ScanHistory history={data.attendance.history} />
        </div>

        <TicketPanel ticket={data.ticket} />
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium capitalize text-foreground">{value}</dd>
      </div>
    </div>
  );
}

type PlusOne = NonNullable<ParticipantProfile["plusOne"]>;

/* The plus-one card: shows the guest with Edit + Revoke when one exists, or an
   Assign action when the participant hasn't got one. Revoke + assign together
   give the admin a revoke-then-reassign flow. */
function PlusOneCard({
  participantId,
  plusOne,
}: {
  participantId: string;
  plusOne: PlusOne | null;
}) {
  const revoke = useRevokePlusOne();

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Plus one</CardTitle>
        {plusOne && (
          <div className="flex gap-2">
            <EditPlusOneDialog participantId={participantId} plusOne={plusOne} />
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" className="text-red-600">
                  <Trash2 className="size-4" />
                  Revoke
                </Button>
              }
              title="Revoke this plus-one?"
              description="Removes the guest, revokes their pass and frees the seat. They'll be emailed that their pass no longer works. You can assign a different plus-one afterwards."
              confirmLabel="Revoke"
              destructive
              onConfirm={async () => {
                await revoke.mutateAsync(participantId);
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {plusOne ? (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="Name" value={plusOne.name} />
            <Row label="Email" value={plusOne.email} />
            <Row label="Type" value={plusOne.guestType} />
            <Row label="Attendance" value={plusOne.attendanceStatus} />
          </dl>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              This participant hasn&apos;t invited a plus-one. You can add one on their behalf — a
              guest pass is issued and emailed straight away.
            </p>
            <AssignPlusOneDialog participantId={participantId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditPlusOneDialog({
  participantId,
  plusOne,
}: {
  participantId: string;
  plusOne: PlusOne;
}) {
  const qc = useQueryClient();
  const update = useUpdateGuest();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plusOne.name);
  const [email, setEmail] = useState(plusOne.email);
  const [guestType, setGuestType] = useState(plusOne.guestType);

  async function save() {
    try {
      await update.mutateAsync({ id: plusOne.id, body: { name, email, guestType } });
      await qc.invalidateQueries({ queryKey: adminKeys.participant(participantId) });
      setOpen(false);
    } catch {
      /* the hook toasts the failure; keep the dialog open to retry */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(plusOne.name);
          setEmail(plusOne.email);
          setGuestType(plusOne.guestType);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit plus-one</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="po-name">Name</Label>
            <Input id="po-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-email">Email</Label>
            <Input
              id="po-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={guestType} onValueChange={(v) => setGuestType(v as PlusOne["guestType"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={update.isPending || name.trim().length < 2}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignPlusOneDialog({ participantId }: { participantId: string }) {
  const assign = useAssignPlusOne();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [relationship, setRelationship] = useState("");

  function reset() {
    setName("");
    setEmail("");
    setGender("");
    setRelationship("");
  }

  async function submit() {
    try {
      await assign.mutateAsync({
        id: participantId,
        body: {
          name,
          email,
          gender: gender ? (gender as (typeof GENDERS)[number]) : undefined,
          relationship: relationship ? (relationship as (typeof RELATIONSHIPS)[number]) : undefined,
        },
      });
      reset();
      setOpen(false);
    } catch {
      /* the hook toasts the failure; keep the dialog open to retry */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" />
          Assign plus-one
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a plus-one</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="apo-name">Full name</Label>
            <Input id="apo-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apo-email">Email</Label>
            <Input
              id="apo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={assign.isPending || name.trim().length < 2 || !email.trim()}
          >
            {assign.isPending ? "Adding…" : "Add plus-one"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
