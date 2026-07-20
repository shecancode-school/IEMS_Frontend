"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useCreateGuest } from "@/hooks/admin/guests";
import { useEvents } from "@/hooks/admin/events";
import { guestCreateSchema, type GuestCreateValues } from "@/schemas/admin";
import { GUEST_TYPES } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { EventPicker } from "@/components/admin/EventPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* the pass email opens differently per guest type — shown in the confirm
   step so the admin knows exactly which wording goes out */
const TYPE_EMAIL: Record<string, string> = {
  VIP: "the VIP welcome with priority-access wording",
  SPEAKER: "the speaker welcome",
  SPONSOR: "the sponsor thank-you",
  MEDIA: "the press-pass version",
  PARTNER: "the partner welcome",
  PLUS_ONE: "the plus-one guest version",
  GENERAL: "the standard guest version",
};

export default function NewGuestPage() {
  const router = useRouter();
  const create = useCreateGuest();
  const { data: events } = useEvents();
  const [pending, setPending] = useState<GuestCreateValues | null>(null);
  const form = useForm<GuestCreateValues>({
    resolver: zodResolver(guestCreateSchema),
    defaultValues: { eventId: "", name: "", email: "", guestType: "GENERAL" },
  });

  /* creating the guest issues + emails their pass immediately, so the form
     submit only opens the confirmation — nothing is sent until approved */
  function onSubmit(v: GuestCreateValues) {
    setPending(v);
  }

  async function confirmCreate() {
    if (!pending) return;
    try {
      await create.mutateAsync(pending);
      router.push("/admin/guests");
    } catch {
      /* mutation toasts its own error; keep the dialog for a retry */
    }
  }

  const pendingEventName = events?.find((e) => e.id === pending?.eventId)?.name ?? "this event";

  return (
    <div className="w-full">
      <PageHeader
        title="Add guest"
        description="A ticket is generated and emailed immediately."
        crumbs={[{ label: "Guests", href: "/admin/guests" }, { label: "New" }]}
      />
      <Card className="w-full shadow-none">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="eventId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event</FormLabel>
                    <FormControl>
                      <EventPicker value={field.value} onValueChange={field.onChange} className="w-full" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="guestType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guest type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full sm:w-60">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GUEST_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Drives the badge on their pass.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push("/admin/guests")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  Add guest
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* confirm-before-send: the pass email goes out the moment the guest
          is created, so the admin approves the exact email first */}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailCheck className="size-5 text-primary" />
              Confirm before sending
            </DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3 text-sm">
              <p>
                A <span className="font-semibold">{pending.guestType.replace(/_/g, " ")}</span> pass
                for <span className="font-semibold">{pendingEventName}</span> will be created and
                emailed immediately to:
              </p>
              <div className="rounded-lg border px-3 py-2">
                <p className="font-medium">{pending.name}</p>
                <p className="text-muted-foreground">{pending.email}</p>
              </div>
              <p className="text-muted-foreground">
                They&apos;ll receive {TYPE_EMAIL[pending.guestType] ?? "the standard guest version"} of
                the pass email — you can preview it under Emails → “What users see”.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={create.isPending} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button disabled={create.isPending} onClick={() => void confirmCreate()}>
              {create.isPending ? "Sending…" : "Create & send pass"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
