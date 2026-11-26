"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { decodeJwt } from "jose";
import { motion } from "motion/react";
import { api, ApiError } from "@/lib/client";
import { useRequireAuth } from "@/context/AuthContext";
import {
  PortalShell,
  Panel,
  Field,
  Select,
  Button,
  Note,
  StatusBadge,
  SkeletonBar,
} from "@/components/portal/ui";
import { TicketPdf, TicketSkeleton } from "@/components/portal/TicketPdf";
import type { TicketArtworkData } from "@/components/admin/TicketArtwork";
import ShareLinks from "@/components/portal/ShareLinks";
import Confetti from "@/components/portal/Confetti";
import { RichText } from "@/components/RichText";
import { formatEventDate } from "@/lib/time";

type Gender = "FEMALE" | "MALE" | "OTHER";
type Relationship = "RELATIVE" | "FRIEND" | "COLLEAGUE" | "PARTNER" | "MENTOR" | "OTHER";

type Me = {
  attendee: {
    type: "PARTICIPANT" | "PLUS_ONE" | "GUEST";
    fullName: string;
    email: string;
    phone?: string;
    gender: Gender | null;
    roleLine: string;
    cohort?: string | null;
    photoUrl: string | null;
    photoPending?: boolean;
    status: string;
  };
  event: {
    name: string;
    date: string;
    venue: string;
    about: string;
    rules: string[];
  } | null;
  ticket: { id: string; ticketNumber: string; code: string; status: string; preview?: TicketArtworkData } | null;
  plusOne: {
    fullName: string;
    email: string;
    gender: Gender | null;
    relationship: Relationship | null;
    status: string;
  } | null;
  plusOneAllowed?: boolean;
};

type Stack = "FRONTEND" | "BACKEND" | "FULLSTACK" | "MOBILE" | "DATA" | "OTHER";

const STACK_OPTIONS: [Stack, string][] = [
  ["FRONTEND", "Frontend"],
  ["BACKEND", "Backend"],
  ["FULLSTACK", "Full-stack"],
  ["MOBILE", "Mobile"],
  ["DATA", "Data"],
  ["OTHER", "Other"],
];

const GENDER_OPTIONS: [Gender, string][] = [
  ["FEMALE", "Female"],
  ["MALE", "Male"],
  ["OTHER", "Other / prefer not to say"],
];

const RELATIONSHIP_OPTIONS: [Relationship, string][] = [
  ["RELATIVE", "Relative"],
  ["FRIEND", "Friend"],
  ["COLLEAGUE", "Colleague"],
  ["PARTNER", "Partner"],
  ["MENTOR", "Mentor"],
  ["OTHER", "Other"],
];

/* cards drift up one after another as the dashboard loads */
const cardMotion = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: i * 0.08, ease: "easeOut" as const },
});

function DashboardSkeleton() {
  return (
    <div aria-label="Loading your dashboard" className="space-y-6">
      <TicketSkeleton />
      <div className="rounded-xl border border-line bg-panel p-6 text-left"><SkeletonBar className="h-3 w-32" /><SkeletonBar className="mt-5 h-4 w-3/4" /><div className="mt-4 flex gap-3"><SkeletonBar className="h-11 w-40" /><SkeletonBar className="h-11 w-40" /></div></div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, session } = useRequireAuth("participant", "/verify");
  const participantId = useMemo(() => {
    try { return decodeJwt(session.token ?? "").sub; } catch { return undefined; }
  }, [session.token]);
  const { data: me, error, refetch: load } = useQuery({
    queryKey: ["participant", "dashboard", participantId],
    queryFn: () => api<Me>("/api/me", { role: "participant" }),
    enabled: isAuthenticated && !!participantId,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.attendee.photoPending ? 3000 : false),
    meta: { persist: false },
  });
  /* set the moment a pass is generated, so the celebration only fires once */
  const [celebrate, setCelebrate] = useState(false);

  if (error && !me)
    return (
      <PortalShell eyebrow="Ticket portal" title="Dashboard">
        <Panel>
          <Note tone="error">{error.message}</Note>
        </Panel>
      </PortalShell>
    );
  if (!me)
    return (
      <PortalShell eyebrow="Ticket portal" title="Dashboard" wide>
        <DashboardSkeleton />
      </PortalShell>
    );

  const fullName = me.attendee.fullName ?? "";
  const firstName = fullName.startsWith("Guest of ")
    ? "Guest"
    : fullName.split(" ")[0] || fullName;

  /* once the pass exists, the pass IS the dashboard */
  if (me.ticket) {
    return (
      <PortalShell eyebrow="Ticket portal" title={`Hi, ${firstName}`} wide>
        <Confetti fire={celebrate} />
        <div className="space-y-6">
          <motion.div {...cardMotion(0)}>
            <TicketPdf src={`/api/tickets/${me.ticket.id}/download`} role="participant"
              preview={me.ticket.preview} revision={`${me.ticket.code}:${me.ticket.status}`} filename={`ticket-${me.ticket.ticketNumber}.pdf`} />
            <p className="mt-3 text-center text-xs text-cream-dim">
              The same ticket was attached to your confirmation email.
            </p>
          </motion.div>
          {me.attendee.type === "PARTICIPANT" && (
            <motion.div {...cardMotion(1)}>
              <MissingDetailsCard me={me} onSaved={load} />
            </motion.div>
          )}
          {me.attendee.type === "PARTICIPANT" && (
            <motion.div {...cardMotion(2)}>
              <PlusOneCard me={me} onChanged={load} />
            </motion.div>
          )}
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell eyebrow="Ticket portal" title={`Hi, ${firstName}`} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div {...cardMotion(0)}>
          <CompleteCard
            me={me}
            onDone={() => {
              setCelebrate(true);
              load();
            }}
          />
        </motion.div>
        {me.event && (
          <motion.div {...cardMotion(1)}>
            <EventCard event={me.event} />
          </motion.div>
        )}
        {me.attendee.type === "PARTICIPANT" && (
          <motion.div {...cardMotion(2)} className="md:col-span-2">
            <PlusOneCard me={me} onChanged={load} />
          </motion.div>
        )}
      </div>
    </PortalShell>
  );
}

/* After the pass is issued, asks only for the details still missing from the
   registration (an admin may have left them blank); hidden once complete. */
function MissingDetailsCard({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const { attendee } = me;
  const phoneMissing = !attendee.phone;
  const genderMissing = !attendee.gender;
  const stackMissing = !attendee.cohort;
  const photoMissing = !attendee.photoUrl && !attendee.photoPending;
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [stack, setStack] = useState<Stack | "">("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (attendee.photoPending) {
    return (
      <Panel>
        <p className="text-sm text-cream-dim">
          Your pass is ready. We&apos;re saving your photo and emailing your ticket. This takes a moment.
        </p>
      </Panel>
    );
  }
  if (!phoneMissing && !genderMissing && !stackMissing && !photoMissing) return null;

  const profile: Record<string, string> = {};
  if (phoneMissing && phone) profile.phone = phone;
  if (genderMissing && gender) profile.gender = gender;
  if (stackMissing && stack) profile.stack = stack;
  const nothingToSave = Object.keys(profile).length === 0 && !photo;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nothingToSave) return;
    setBusy(true);
    setError("");
    try {
      if (photo) {
        const form = new FormData();
        form.append("photo", photo);
        for (const [key, value] of Object.entries(profile)) form.append(key, value);
        await api("/api/me/photo", { role: "participant", form });
      } else {
        await api("/api/me", { method: "PATCH", role: "participant", body: profile });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 className="label mb-2 text-sm font-bold text-orange">Complete your details</h2>
      <p className="mb-4 text-sm text-cream-dim">
        A few details are missing from your registration. Add whichever you have.
      </p>
      <form onSubmit={save} className="space-y-4">
        {phoneMissing && (
          <Field
            label="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0788 000 000"
          />
        )}
        {genderMissing && (
          <Select label="Gender" value={gender} onValueChange={setGender} options={GENDER_OPTIONS} />
        )}
        {stackMissing && (
          <Select label="Your track" value={stack} onValueChange={setStack} options={STACK_OPTIONS} />
        )}
        {photoMissing && (
          <label className="block text-left">
            <span className="label mb-1.5 block text-xs font-semibold text-cream-dim">
              A clear photo of yourself
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-cream-dim file:mr-3 file:rounded-md file:border-0 file:bg-panel-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream"
            />
          </label>
        )}
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <Button type="submit" disabled={busy || nothingToSave}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </form>
    </Panel>
  );
}

/* One step to the pass: the visitor fills in whatever personal details are
   still missing, then adds a photo — the pass is issued once both are done */
function CompleteCard({ me, onDone }: { me: Me; onDone: () => void }) {
  const { attendee } = me;
  const nameMissing =
    !attendee.fullName || attendee.fullName.startsWith("Guest of ");
  const phoneMissing = !attendee.phone;
  const genderMissing = !attendee.gender;
  const stackMissing = attendee.type === "PARTICIPANT" && !attendee.cohort;
  const hasMissing = nameMissing || phoneMissing || genderMissing || stackMissing;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [stack, setStack] = useState<Stack | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  const hasImage = !!file;
  const detailsIncomplete =
    (nameMissing && !fullName) ||
    (phoneMissing && !phone) ||
    (genderMissing && !gender) ||
    (stackMissing && !stack);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasImage || detailsIncomplete) return;
    setBusy(true);
    setError("");
    try {
      /* one request: the missing details travel with the photo, and the pass
         is issued before the photo finishes uploading in the background */
      const form = new FormData();
      form.append("photo", file as File);
      if (nameMissing && fullName) form.append("name", fullName);
      if (phoneMissing && phone) form.append("phone", phone);
      if (genderMissing && gender) form.append("gender", gender);
      if (stackMissing && stack) form.append("stack", stack);
      await api("/api/me/photo", { role: "participant", form });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 className="label mb-4 text-sm font-bold text-orange">One step to your pass</h2>
      <p className="mb-4 text-sm text-cream-dim">
        {hasMissing
          ? "We just need a few details and a clear photo of yourself — your event pass is generated right after."
          : "We already have your details — just add a clear photo of yourself and your event pass is generated instantly."}
      </p>
      <form onSubmit={submit} className="space-y-4">
        {nameMissing && (
          <Field
            label="Your full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="As it should appear on your pass"
          />
        )}
        {phoneMissing && (
          <Field
            label="Phone number"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0788 000 000"
          />
        )}
        {genderMissing && (
          <Select
            label="Gender"
            required
            value={gender}
            onValueChange={setGender}
            options={GENDER_OPTIONS}
          />
        )}
        {stackMissing && (
          <Select
            label="Your track"
            required
            value={stack}
            onValueChange={setStack}
            options={STACK_OPTIONS}
          />
        )}
        {/* The gate operator uses this profile photo to confirm identity. */}
        <div className="flex items-center gap-4">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="Photo preview"
              className="h-20 w-20 shrink-0 rounded-xl border-2 border-orange object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line text-2xl text-cream-dim">
              ?
            </div>
          )}
          <label className="flex-1 cursor-pointer">
            <span className="label mb-1.5 block text-left text-xs font-semibold text-cream-dim">
              A clear photo of yourself
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-cream-dim file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-panel-2 file:px-4 file:py-2 file:text-cream"
            />
          </label>
        </div>
        <Button
          type="submit"
          busy={busy}
          disabled={!hasImage || detailsIncomplete}
          className="w-full"
        >
          {busy ? "Generating your pass…" : "Submit & get my pass"}
        </Button>
        {error && <Note tone="error">{error}</Note>}
      </form>
    </Panel>
  );
}

function PlusOneCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [mode, setMode] = useState<"none" | "form" | "link">("none");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [relationship, setRelationship] = useState<Relationship | "">("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (me.plusOne) {
    const rel = me.plusOne.relationship
      ? RELATIONSHIP_OPTIONS.find(([v]) => v === me.plusOne?.relationship)?.[1]
      : null;
    /* the plus-one hangs off this registration like a child record */
    return (
      <Panel>
        <h2 className="label mb-4 text-sm font-bold text-orange">Your plus-one</h2>
        <div className="border-l-2 border-orange/50 pl-4">
          <p className="text-sm font-semibold">{me.plusOne.fullName}</p>
          <p className="text-sm text-cream-dim">
            {me.plusOne.email}
            {rel && ` · ${rel}`}
          </p>
          <div className="mt-2">
            <StatusBadge value={me.plusOne.status} />
          </div>
        </div>
        <p className="mt-3 text-xs text-cream-dim">
          They ride on your registration — they&apos;ll get their own pass after
          verifying their email and adding a photo.
        </p>
      </Panel>
    );
  }

  /* no plus-one place for this registration: show nothing rather than say it's full */
  if (me.plusOneAllowed === false) return null;


  async function addDirect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/me/plus-one", {
        role: "participant",
        body: { fullName, email, gender, relationship },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      if (err instanceof ApiError && err.status === 403) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function makeLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { inviteUrl } = await api<{ inviteUrl: string }>("/api/me/plus-one/invite", {
        role: "participant",
        body: inviteEmail ? { email: inviteEmail } : {},
      });
      setInviteUrl(inviteUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      if (err instanceof ApiError && err.status === 403) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 className="label mb-4 text-sm font-bold text-orange">Bring a plus-one</h2>
      {mode === "none" && (
        <div className="space-y-3">
          <p className="text-sm text-cream-dim">
            You can bring one guest. Fill in their details yourself, or send them an invite to do it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setMode("form")}>Fill their details</Button>
            <Button variant="ghost" onClick={() => setMode("link")}>
              Send them an invite
            </Button>
          </div>
        </div>
      )}
      {mode === "form" && (
        <form onSubmit={addDirect} className="space-y-3">
          <p className="text-xs text-cream-dim">
            Fill in your guest&apos;s details — their pass will carry this
            information; they just verify their email and add a photo.
          </p>
          <Field
            label="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="As it should appear on their pass"
          />
          <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select
            label="Gender"
            required
            value={gender}
            onValueChange={setGender}
            options={GENDER_OPTIONS}
          />
          <Select
            label="Relationship to you"
            required
            value={relationship}
            onValueChange={setRelationship}
            options={RELATIONSHIP_OPTIONS}
          />
          <div className="flex gap-3">
            <Button type="submit" busy={busy}>
              {busy ? "Adding…" : "Add plus-one"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setMode("none")}>
              Back
            </Button>
          </div>
        </form>
      )}
      {mode === "link" && !inviteUrl && (
        <form onSubmit={makeLink} className="space-y-3">
          <p className="text-sm text-cream-dim">
            Enter their email to send the invite straight to their inbox, or
            leave it empty to just get a shareable link (valid 72h).
          </p>
          <Field
            label="Their email (optional)"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <div className="flex gap-3">
            <Button type="submit" busy={busy}>
              {busy ? "Creating…" : inviteEmail ? "Email the invite" : "Create link"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setMode("none")}>
              Back
            </Button>
          </div>
        </form>
      )}
      {mode === "link" && inviteUrl && (
        <div className="space-y-3">
          {inviteEmail && <Note tone="success">Invite sent to {inviteEmail}.</Note>}
          <p className="text-sm text-cream-dim">Share this link with your plus-one (valid 72h):</p>
          <p className="break-all rounded-lg bg-panel-2 p-3 text-xs">{inviteUrl}</p>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
              /* revert the label so the user can tell a second copy worked */
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <div className="pt-1">
            <p className="label mb-2 text-[10px] font-semibold text-cream-dim">Or share it on</p>
            <ShareLinks
              url={inviteUrl}
              text={`Join me at ${me.event?.name ?? "our event"} as my plus-one! Register here to get your pass:`}
              title={`Plus-one invite — ${me.event?.name ?? "Igire Rwanda event"}`}
            />
          </div>
        </div>
      )}
      {error && <Note tone="error">{error}</Note>}
    </Panel>
  );
}

function EventCard({ event }: { event: NonNullable<Me["event"]> }) {
  return (
    <Panel>
      <h2 className="label mb-4 text-sm font-bold text-orange">Event</h2>
      <p className="display text-2xl">{event.name}</p>
      <p className="mt-1 text-sm text-cream-dim">
        {formatEventDate(event.date)}
        {event.venue && ` · ${event.venue}`}
      </p>
      {event.about && (
        <div className="mt-4">
          <h3 className="label text-[11px] font-semibold uppercase tracking-widest text-cream-dim">
            About
          </h3>
          <RichText
            html={event.about}
            className="mt-1.5 text-sm leading-relaxed text-cream-dim"
          />
        </div>
      )}
    </Panel>
  );
}
