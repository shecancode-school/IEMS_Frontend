"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminAuth } from "@/context/AuthContext";
import {
  useActivity,
  useCreateActivity,
  useUpdateActivity,
  useCancelActivity,
} from "@/hooks/admin/calendar";
import { useCan } from "@/hooks/admin/staff";
import { activityFormSchema, type ActivityFormValues } from "@/schemas/admin";
import {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  EVENT_MODES,
  type CalendarPerson,
} from "@/types/admin";
import { isoToKigaliInput, kigaliInputToISO } from "@/lib/time";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABEL: Record<string, string> = {
  CLASS: "Class",
  MENTORSHIP: "Mentorship",
  REVIEW: "Review",
  MEETING: "Meeting",
  OFFICE_HOURS: "Office hours",
  OTHER: "Other",
};
const MODE_LABEL: Record<string, string> = {
  IN_PERSON: "In person",
  ONLINE: "Online (Google Meet)",
  HYBRID: "Hybrid (Google Meet + room)",
};
const VISIBILITY_LABEL: Record<string, string> = {
  ORG: "Everyone at IRO",
  PRIVATE: "Only me",
  PUBLIC: "Public",
};

const VISIBILITY_HINT: Record<string, string> = {
  ORG: "Colleagues see the details on the org calendar. The public site does not.",
  PRIVATE: "Colleagues see only that you are busy — never the title or the notes.",
  PUBLIC: "Anyone can see this on the public schedule — the title, the time and your name.",
};

/* One dialog for both creating and editing, because the fields are identical
   and a separate page for a 20-minute meeting would be heavy. */
export function ActivityDialog({
  open,
  onOpenChange,
  activityId,
  people,
  defaultDayISO,
  defaultTime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /* editing loads the full record here rather than taking it from the calendar
     chip, which only carries what the grid needs to draw */
  activityId?: string | null;
  people?: CalendarPerson[];
  defaultDayISO?: string;
  /* "14:30" — the hour the visitor clicked on the time grid. Pointing at a
     slot and getting a form that says 09:00 is the calendar ignoring you. */
  defaultTime?: string;
}) {
  const { user } = useAdminAuth();
  /* isLoading, NOT isPending.

     useActivity is disabled when there is no activityId, and a disabled
     TanStack query sits at status "pending" forever — it has no data and it
     never will. Reading isPending here made `busy` permanently true on the
     CREATE path, so the submit button rendered "Saving…" and stayed disabled
     from the moment the dialog opened: scheduling an activity was impossible.
     isLoading is `isPending && isFetching`, so it is false for a disabled
     query and true only while an edit is genuinely being fetched. */
  const { data: activity, isLoading: loading } = useActivity(
    open ? (activityId ?? null) : null
  );
  const allow = useCan(user?.role);
  const canAssign = allow("staff:manage") && (people?.length ?? 0) > 1;

  const create = useCreateActivity();
  const update = useUpdateActivity();
  const cancel = useCancelActivity();
  const editing = Boolean(activityId);

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: blankValues(defaultDayISO, defaultTime),
  });

  /* the dialog is mounted once and reused, so the form has to be re-seeded
     each time it opens with a different activity */
  useEffect(() => {
    if (!open) return;
    /* wait for the record before seeding, or the form would flash blank */
    if (activityId && !activity) return;
    form.reset(
      activity
        ? {
            title: activity.title,
            description: activity.description,
            type: activity.type,
            start: isoToKigaliInput(activity.start),
            end: isoToKigaliInput(activity.end),
            mode: activity.mode,
            location: activity.location,
            visibility: activity.visibility,
            attendeeEmails: activity.attendees.map((a) => a.email).join(", "),
            ownerId: activity.owner?.id,
          }
        : blankValues(defaultDayISO, defaultTime)
    );
  }, [open, activityId, activity, defaultDayISO, defaultTime, form]);

  async function onSubmit(v: ActivityFormValues) {
    const body = {
      title: v.title,
      description: v.description ?? "",
      type: v.type,
      start: kigaliInputToISO(v.start),
      end: kigaliInputToISO(v.end),
      mode: v.mode,
      location: v.location ?? "",
      visibility: v.visibility,
      attendees: parseEmails(v.attendeeEmails),
      ...(canAssign && v.ownerId ? { ownerId: v.ownerId } : {}),
    };

    if (activityId) await update.mutateAsync({ id: activityId, body });
    else await create.mutateAsync(body);
    onOpenChange(false);
  }

  const busy = create.isPending || update.isPending || loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit activity" : "Schedule an activity"}</DialogTitle>
          <DialogDescription>
            A class, mentorship session, review or meeting. It appears on the org calendar and,
            if the calendar is connected to Google, on the real Google Calendar too.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Backend cohort — week 4 review" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormDescription>Kigali time.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                form={form}
                name="type"
                label="Kind"
                options={ACTIVITY_TYPES}
                labels={TYPE_LABEL}
              />
              <SelectField
                form={form}
                name="mode"
                label="Where"
                options={EVENT_MODES}
                labels={MODE_LABEL}
                description="Online and hybrid generate a Google Meet link."
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room or place</FormLabel>
                  <FormControl>
                    <Input placeholder="Lab 2, Kigali Heights" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canAssign && (
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Whose calendar</FormLabel>
                    <Select value={field.value ?? user?.id} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a person" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {people?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.title ? ` — ${p.title}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Scheduling on someone else&apos;s calendar also creates the event in their
                      Google Calendar.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <SelectField
              form={form}
              name="visibility"
              label="Who can see it"
              options={ACTIVITY_VISIBILITY}
              labels={VISIBILITY_LABEL}
              description={VISIBILITY_HINT[form.watch("visibility")] ?? ""}
            />

            <FormField
              control={form.control}
              name="attendeeEmails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invite by email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="aline@example.com, eric@example.com"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Comma separated. Google sends them the invitation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:justify-between">
              {editing ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="outline" className="text-red-600">
                      Cancel activity
                    </Button>
                  }
                  title="Cancel this activity?"
                  description="It disappears from the calendar and the matching Google Calendar event is deleted, so nobody turns up."
                  confirmLabel="Cancel activity"
                  destructive
                  onConfirm={async () => {
                    await cancel.mutateAsync(activityId!);
                    onOpenChange(false);
                  }}
                />
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Schedule"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function blankValues(dayISO?: string, time?: string): ActivityFormValues {
  const day = dayISO ?? new Date().toISOString().slice(0, 10);
  /* An hour long by default, which is the commonest length on this calendar,
     and clamped so a 23:30 slot does not produce an end time on the next day
     that the form would render as invalid. */
  const start = time ?? "09:00";
  const [h, m] = start.split(":").map(Number);
  const endMinutes = Math.min(23 * 60 + 59, h * 60 + m + 60);
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return {
    title: "",
    description: "",
    type: "MEETING",
    start: `${day}T${start}`,
    end: `${day}T${end}`,
    mode: "IN_PERSON",
    location: "",
    /* matches the model default — the calendar is public-first */
    visibility: "PUBLIC",
    attendeeEmails: "",
  };
}

function parseEmails(raw?: string): { email: string; name: string }[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .map((email) => ({ email, name: "" }));
}

/* small local helper — three near-identical selects otherwise */
function SelectField({
  form,
  name,
  label,
  options,
  labels,
  description,
}: {
  form: ReturnType<typeof useForm<ActivityFormValues>>;
  name: "type" | "mode" | "visibility";
  label: string;
  options: readonly string[];
  labels: Record<string, string>;
  description?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {labels[o] ?? o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
